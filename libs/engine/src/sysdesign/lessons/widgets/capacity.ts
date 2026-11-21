/**
 * The Capacity & Scaling widget's model, apart from the other widgets' math so its chunk takes only this. A request
 * stream passes three tiers in order: load balancers, app servers, then the database (one primary for writes, read
 * replicas for reads, a cache in front of the reads). Each tier is a set of instances with a per-instance limit in its
 * own unit; one request costs a fixed amount of work at each tier, so a tier's limit in requests a second is its
 * capacity divided by that cost. A tier passes what it can and sheds the rest; a request shed at one tier costs nothing
 * below it, and the tiers above it did its work. The database admits a request only when both the primary and the
 * replicas have room for it (one admission for the pair, since every request needs both).
 */

/** Per-instance limits: load balancers and app servers in requests a second, database machines in queries a second. */
export const CAPACITY_LB_RPS = 5000;
export const CAPACITY_APP_RPS = 1500;
/** Each app server's worker pool; a request holds one worker for its whole time. */
export const CAPACITY_WORKERS = 100;
export const CAPACITY_REQUEST_MS = 50;
export const CAPACITY_SLOW_MS = 500;
/** One request's work at the database: 2 queries, 90% of them reads; the cache serves 90% of reads when it is on. */
export const CAPACITY_READS = 1.8;
export const CAPACITY_WRITES = 0.2;
export const CAPACITY_HIT = 0.9;
export const CAPACITY_ZONES = 3;
/** Database machine sizes: 8,000 queries a second is the largest machine on offer. Replicas match the primary. */
export const CAPACITY_SIZES = [4000, 8000] as const;
/** The traffic handle's stops, in requests a second. */
export const CAPACITY_TRAFFIC = [1000, 2000, 3000, 4000, 5000, 6000, 7000, 8000, 10000, 12000, 14000, 16000, 18000, 20000] as const;
export const CAPACITY_LB_MAX = 6;
export const CAPACITY_APP_MAX = 21;
export const CAPACITY_REPLICAS_MAX = 6;
/**
 * The shared axis, in requests a second: it holds the longest lane at any setting (the primary's write ceiling,
 * 8,000 / 0.2), so no lane is ever cut and every instance that is up is drawn at its true width.
 */
export const CAPACITY_AXIS_MAX = 40000;
/** The cache keeps a full copy on a node in each zone, so losing a zone keeps its hit rate; it counts as that many machines. */
export const CAPACITY_CACHE_NODES = 3;

/**
 * One setting, as numbers (`ExperimentSettings`): `traffic` in requests a second, `lb` load balancers, `app` app
 * servers, `size` the database machine in queries a second, `replicas` read replicas, and `cache`, `zone` (zone A down)
 * and `slow` (each request holds its worker `CAPACITY_SLOW_MS`) as 0 or 1.
 */
export type CapacitySettings = {
  traffic: number;
  lb: number;
  app: number;
  size: number;
  replicas: number;
  cache: number;
  zone: number;
  slow: number;
};
export const CAPACITY_BASELINE: Readonly<CapacitySettings> = {
  traffic: 8000,
  lb: 2,
  app: 4,
  size: 8000,
  replicas: 2,
  cache: 0,
  zone: 0,
  slow: 0,
};

export type CapacityTierId = 'lb' | 'app' | 'primary' | 'replicas';
export const CAPACITY_TIERS: readonly CapacityTierId[] = ['lb', 'app', 'primary', 'replicas'];
export type CapacityZone = 'A' | 'B' | 'C';
const ZONE_NAMES: readonly CapacityZone[] = ['A', 'B', 'C'];

/** What every tier does with the stream: its limit, what arrives, what it passes on and sheds, and how busy it runs. */
interface Flow {
  /** The tier's limit in requests a second; `Infinity` for no replicas, which limit nothing. */
  ceiling: number;
  arriving: number;
  passed: number;
  shed: number;
  /** Busy share, 0 to 1. */
  util: number;
}
interface Fleet extends Flow {
  /** Instances as set, those up, and those zone A took. */
  n: number;
  up: number;
  lost: number;
  /** What one instance takes, in requests a second. */
  each: number;
}
export interface CapacityBalancers extends Fleet {
  id: 'lb';
}
export interface CapacityApps extends Fleet {
  id: 'app';
  /** How long a request holds its worker. */
  ms: number;
  workers: number;
  cpuEach: number;
  workerEach: number;
  /** Which of the two limits one server meets first. */
  bound: 'cpu' | 'workers';
  /** Workers in flight on each server (Little's law: in flight = rate × time), and what the arriving load would need. */
  inFlight: number;
  need: number;
  cpuUtil: number;
}
export interface CapacityPrimary extends Flow {
  id: 'primary';
  size: number;
  /** Zone A, the primary's zone, is down: a replica was promoted, or with none the primary is lost (`outage`). */
  lost: boolean;
  promoted: boolean;
  outage: boolean;
  up: number;
  /** Queries one request costs the primary. */
  cost: number;
  writesUtil: number;
  readsUtil: number;
}
export interface CapacityReplicas extends Flow {
  id: 'replicas';
  n: number;
  up: number;
  /** Replicas gone: zone A's, and the one promoted to primary. */
  lost: number;
  /** Queries one request costs each replica; null with none up. */
  cost: number | null;
  replayUtil: number;
  readsUtil: number;
  /** Reads a second on each replica. */
  readsEach: number;
}
export type CapacityTier = CapacityBalancers | CapacityApps | CapacityPrimary | CapacityReplicas;

export interface CapacityRun {
  settings: CapacitySettings;
  offered: number;
  lb: CapacityBalancers;
  app: CapacityApps;
  primary: CapacityPrimary;
  replicas: CapacityReplicas;
  /** The lanes that carry load: every tier, the replicas only while one is up. */
  lanes: readonly CapacityTier[];
  /** One request's reads, of which `hits` the cache answers and `misses` reach the database. */
  misses: number;
  hits: number;
  dbArriving: number;
  dbCeiling: number;
  /** Which of the database's two lanes limits it. */
  binding: 'primary' | 'replicas';
  served: number;
  shed: number;
  /** The smallest limit, which caps what is served, and the smallest of the rest (null when nothing else limits). */
  bottleneck: CapacityTierId;
  next: CapacityTierId | null;
  busiest: CapacityTierId;
  maxUtil: number;
  /** Every machine: the tiers, the primary, and the cache's node in each zone. */
  machines: number;
}

/**
 * Zone A is the largest failure domain: instances are spread A, B, C, A, ... so it holds ceil(n / 3) load balancers
 * and app servers, and the primary. Replicas start in zone B (B, C, A, ...), so it holds floor(n / 3) of them.
 */
const zoneOf = (tier: CapacityTierId, i: number) => ZONE_NAMES[(tier === 'replicas' ? i + 1 : i) % CAPACITY_ZONES];

export interface CapacityInstance {
  /** Stable across settings: the tier, the zone and the index within the zone. */
  id: string;
  zone: CapacityZone;
}
export interface CapacityZoneLane {
  /** Every instance in drawn order: zone B, then C, then A. */
  order: readonly CapacityInstance[];
  up: readonly CapacityInstance[];
  lost: readonly CapacityInstance[];
  /** The replica promoted to primary when zone A fails: the last survivor in drawn order. */
  promoted: CapacityInstance | null;
}

/**
 * A tier's instances in drawn order, zone B first, then C, then A, so where zone A's group starts on the lane is the
 * limit that survives zone A. With zone A down its group is lost, and a promoted replica leaves the replicas for the
 * primary.
 */
export function capacityZoneLane(tier: CapacityTierId, n: number, zoneDown: boolean): CapacityZoneLane {
  const seen: Record<CapacityZone, number> = { A: 0, B: 0, C: 0 };
  const all = Array.from({ length: n }, (_, i): CapacityInstance => {
    const zone = zoneOf(tier, i);
    return { zone, id: `${tier}-${zone}${seen[zone]++}` };
  });
  const order = (['B', 'C', 'A'] as const).flatMap((z) => all.filter((x) => x.zone === z));
  if (!zoneDown) return { order, up: order, lost: [], promoted: null };
  const up = order.filter((x) => x.zone !== 'A');
  const lost = order.filter((x) => x.zone === 'A');
  const promoted = tier === 'replicas' && up.length ? up[up.length - 1] : null;
  return { order, up: promoted ? up.slice(0, -1) : up, lost, promoted };
}

export const capacitySettings = (settings: Partial<CapacitySettings>): CapacitySettings => ({ ...CAPACITY_BASELINE, ...settings });

/** The stream through the tiers at one setting. */
export function capacityRun(settings: Partial<CapacitySettings>): CapacityRun {
  const s = capacitySettings(settings);
  const down = s.zone === 1;
  const lostLb = down ? Math.ceil(s.lb / CAPACITY_ZONES) : 0;
  const lostApp = down ? Math.ceil(s.app / CAPACITY_ZONES) : 0;
  const lostReplicas = down ? Math.floor(s.replicas / CAPACITY_ZONES) : 0;
  const lbUp = s.lb - lostLb;
  const appUp = s.app - lostApp;
  let repUp = s.replicas - lostReplicas;
  const promoted = down && repUp > 0;
  const outage = down && !promoted;
  if (promoted) repUp -= 1;

  const ms = s.slow ? CAPACITY_SLOW_MS : CAPACITY_REQUEST_MS;
  const workerEach = (CAPACITY_WORKERS * 1000) / ms;
  const each = Math.min(CAPACITY_APP_RPS, workerEach);
  const misses = CAPACITY_READS * (s.cache ? 1 - CAPACITY_HIT : 1);
  const primaryCost = repUp > 0 ? CAPACITY_WRITES : CAPACITY_WRITES + misses;
  const replicaCost = repUp > 0 ? CAPACITY_WRITES + misses / repUp : null;

  const lbCeiling = lbUp * CAPACITY_LB_RPS;
  const appCeiling = appUp * each;
  const primaryCeiling = outage ? 0 : s.size / primaryCost;
  const replicasCeiling = replicaCost === null ? Infinity : s.size / replicaCost;

  const offered = s.traffic;
  const lbPassed = Math.min(offered, lbCeiling);
  const appPassed = Math.min(lbPassed, appCeiling);
  const dbCeiling = Math.min(primaryCeiling, replicasCeiling);
  const binding = replicasCeiling < primaryCeiling ? 'replicas' : 'primary';
  const dbArriving = appPassed;
  // Inside the database one admission decides; its lanes carry what it admitted.
  const served = Math.min(dbArriving, dbCeiling);
  const dbShed = dbArriving - served;
  const fleetUtil = (arriving: number, ceiling: number) => (ceiling > 0 ? Math.min(1, arriving / ceiling) : arriving > 0 ? 1 : 0);

  const lb: CapacityBalancers = {
    id: 'lb',
    n: s.lb,
    up: lbUp,
    lost: lostLb,
    each: CAPACITY_LB_RPS,
    ceiling: lbCeiling,
    arriving: offered,
    passed: lbPassed,
    shed: offered - lbPassed,
    util: fleetUtil(offered, lbCeiling),
  };
  const app: CapacityApps = {
    id: 'app',
    n: s.app,
    up: appUp,
    lost: lostApp,
    each,
    ceiling: appCeiling,
    arriving: lbPassed,
    passed: appPassed,
    shed: lbPassed - appPassed,
    util: fleetUtil(lbPassed, appCeiling),
    ms,
    workers: CAPACITY_WORKERS,
    cpuEach: CAPACITY_APP_RPS,
    workerEach,
    bound: workerEach < CAPACITY_APP_RPS ? 'workers' : 'cpu',
    inFlight: appUp > 0 ? ((appPassed / appUp) * ms) / 1000 : 0,
    need: appUp > 0 ? ((lbPassed / appUp) * ms) / 1000 : 0,
    cpuUtil: appUp > 0 ? appPassed / (appUp * CAPACITY_APP_RPS) : 0,
  };
  const primaryUtil = outage ? (dbArriving > 0 ? 1 : 0) : (served * primaryCost) / s.size;
  const writesUtil = outage ? 0 : (served * CAPACITY_WRITES) / s.size;
  const primary: CapacityPrimary = {
    id: 'primary',
    size: s.size,
    lost: down,
    promoted,
    outage,
    up: outage ? 0 : 1,
    cost: primaryCost,
    ceiling: primaryCeiling,
    arriving: dbArriving,
    passed: served,
    shed: binding === 'primary' ? dbShed : 0,
    util: primaryUtil,
    writesUtil,
    readsUtil: outage ? 0 : primaryUtil - writesUtil,
  };
  const replicasUtil = replicaCost === null ? 0 : (served * replicaCost) / s.size;
  const replayUtil = repUp > 0 ? (served * CAPACITY_WRITES) / s.size : 0;
  const replicas: CapacityReplicas = {
    id: 'replicas',
    n: s.replicas,
    up: repUp,
    lost: lostReplicas + (promoted ? 1 : 0),
    cost: replicaCost,
    ceiling: replicasCeiling,
    arriving: dbArriving,
    passed: served,
    shed: binding === 'replicas' ? dbShed : 0,
    util: replicasUtil,
    replayUtil,
    readsUtil: replicasUtil - replayUtil,
    readsEach: repUp > 0 ? (served * misses) / repUp : 0,
  };

  const lanes: CapacityTier[] = repUp > 0 ? [lb, app, primary, replicas] : [lb, app, primary];
  const limits: { id: CapacityTierId; ceiling: number }[] = [
    { id: 'lb', ceiling: lbCeiling },
    { id: 'app', ceiling: appCeiling },
    { id: binding, ceiling: dbCeiling },
  ];
  const order = [...limits].sort((a, b) => a.ceiling - b.ceiling);
  return {
    settings: s,
    offered,
    lb,
    app,
    primary,
    replicas,
    lanes,
    misses,
    hits: CAPACITY_READS - misses,
    dbArriving,
    dbCeiling,
    binding,
    served,
    shed: offered - served,
    bottleneck: order[0].id,
    next: order[1].ceiling < Infinity ? order[1].id : null,
    busiest: lanes.reduce((a, t) => (t.util > a.util + 1e-12 ? t : a), lanes[0]).id,
    maxUtil: Math.max(...lanes.map((t) => t.util)),
    machines: s.lb + s.app + 1 + s.replicas + CAPACITY_CACHE_NODES * s.cache,
  };
}

/** The same setting with zone A down: what a challenge's zone criterion and the "if zone A fails" marks read. */
export const capacityZoneLoss = (r: CapacityRun): CapacityRun => capacityRun({ ...r.settings, zone: 1 });

/**
 * The challenge's measures: shed now, headroom on the busiest tier in percent, shed after losing zone A, machines. The
 * headroom is rounded to a millionth of a percent, so a tier at 70% in floating point leaves the 30% it shows.
 */
export function capacityMetrics(r: CapacityRun, zone: CapacityRun = capacityZoneLoss(r)) {
  return { shed: r.shed, headroom: Math.round((1 - r.maxUtil) * 1e8) / 1e6, zoneShed: zone.shed, machines: r.machines };
}

export interface CapacityRamp {
  stops: readonly number[];
  runs: readonly CapacityRun[];
  /** The first stop where a tier sheds, and that tier; -1 and null when none does. */
  climax: number;
  full: CapacityTierId | null;
}

/** The stops a ramp steps through, from one traffic to another, and the first stop where a tier sheds. */
export function capacityRamp(settings: CapacitySettings, from: number, to: number): CapacityRamp {
  const stops = CAPACITY_TRAFFIC.filter((t) => t >= from && t <= to);
  const runs = stops.map((traffic) => capacityRun({ ...settings, traffic }));
  const climax = runs.findIndex((r) => r.shed > 1e-9);
  return { stops, runs, climax, full: climax >= 0 ? runs[climax].bottleneck : null };
}

/** Every setting the controls reach, 197,568 of them, built on demand: only specs walk them all. */
export function capacityAllSettings(): CapacitySettings[] {
  const out: CapacitySettings[] = [];
  for (const traffic of CAPACITY_TRAFFIC)
    for (let lb = 1; lb <= CAPACITY_LB_MAX; lb++)
      for (let app = 1; app <= CAPACITY_APP_MAX; app++)
        for (const size of CAPACITY_SIZES)
          for (let replicas = 0; replicas <= CAPACITY_REPLICAS_MAX; replicas++)
            for (const cache of [0, 1])
              for (const zone of [0, 1]) for (const slow of [0, 1]) out.push({ traffic, lb, app, size, replicas, cache, zone, slow });
  return out;
}
