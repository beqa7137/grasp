/**
 * The CDNs & Edge widget's model (REDESIGN.md 5.2, R42). `rps` requests a second for 100,000 objects whose popularity
 * follows a Zipf law (exponent 1), spread evenly over `pops` edge locations and, when the cache key is not normalized,
 * over `variants` URLs an object. Each cache (one per location, and the shield) keeps a copy for `ttl` seconds after the
 * miss that fetched it. Requests are independent Poisson streams, so a key requested at rate r at one cache hits with
 * probability rT / (1 + rT): one miss, then on average rT hits, per copy. The shield sees every location's misses
 * combined, but a location's own earlier misses can never have left it a copy (they are at least a TTL old), so its
 * miss hits the shield by the same rule at the other locations' combined miss rate. A copy fetched from the shield
 * lives a full TTL at the edge (the Age header is ignored). Users reach the nearest of `pops` locations in
 * 10 ms × √(20 / pops).
 */

import { seededRandom } from './seeded-random.js';

export type CdnSettings = {
  rps: number;
  pops: number;
  /** Seconds a cache keeps a copy after the miss that fetched it. */
  ttl: number;
  /** 1 with an origin shield, 0 without. */
  shield: number;
  /** URLs an object: 1 with a normalized cache key, 10 with a tracking parameter in it. */
  variants: number;
};

export const CDN_OBJECTS = 100_000;
export const CDN_RPS = [1_000, 10_000, 100_000] as const;
export const CDN_POPS = [1, 5, 20, 100] as const;
export const CDN_TTLS = [5, 60, 300, 3_600] as const;
export const CDN_VARIANTS = [1, 10] as const;
export const CDN_BASELINE: CdnSettings = { rps: 10_000, pops: 20, ttl: 60, shield: 0, variants: 1 };
export const CDN_EDGE_MS_AT_20 = 10;
export const CDN_SHIELD_MS = 30;
export const CDN_ORIGIN_MS = 120;
/** The timeline's three objects by popularity rank, and its window in TTLs. */
export const CDN_LANE_RANKS = [1, 2_500, 25_000] as const;
export const CDN_WINDOW_TTLS = 5;
/** Above this many requests in its window a lane keeps only its misses and copies; the hits between draw as a band. */
export const CDN_DENSE = 160;
/** The tail the square brackets: objects past this rank. */
export const CDN_HEAD_RANKS = 10_000;

/** Every setting the controls reach, all 192. */
export const CDN_SETTINGS: readonly CdnSettings[] = CDN_RPS.flatMap((rps) =>
  CDN_POPS.flatMap((pops) =>
    CDN_TTLS.flatMap((ttl) => [0, 1].flatMap((shield) => CDN_VARIANTS.map((variants) => ({ rps, pops, ttl, shield, variants })))),
  ),
);

const settingsId = (s: CdnSettings) => `${s.rps}/${s.pops}/${s.ttl}/${s.shield}/${s.variants}`;

let harmonic: Float64Array | null = null;
/** H[k], the k-th harmonic number, for k up to the catalog. */
function H(): Float64Array {
  if (!harmonic) {
    harmonic = new Float64Array(CDN_OBJECTS + 1);
    for (let k = 1; k <= CDN_OBJECTS; k++) harmonic[k] = harmonic[k - 1] + 1 / k;
  }
  return harmonic;
}
export const cdnHN = () => H()[CDN_OBJECTS];
/** The share of all requests for the object at rank `k`. */
export const cdnShare = (k: number) => 1 / k / cdnHN();
/** The share of all requests for the objects at ranks 1 to `k`. */
export const cdnCumShare = (k: number) => H()[Math.min(CDN_OBJECTS, Math.max(0, Math.round(k)))] / cdnHN();

export const cdnHit = (rate: number, ttl: number) => (rate * ttl) / (1 + rate * ttl);
export const cdnEdgeMs = (pops: number) => CDN_EDGE_MS_AT_20 * Math.sqrt(20 / pops);

/** One key (one URL of the object at rank `k`): its rates and hit probabilities. */
export interface CdnKey {
  rank: number;
  /** Requests a second for this URL, all locations together. */
  rate: number;
  /** At one location. */
  perPop: number;
  edge: number;
  /** Every location's misses of this URL, combined, a second. */
  toShield: number;
  shieldHit: number;
}

export function cdnKey(s: CdnSettings, k: number): CdnKey {
  const rate = (s.rps * cdnShare(k)) / s.variants;
  const perPop = rate / s.pops;
  const edge = cdnHit(perPop, s.ttl);
  const toShield = rate * (1 - edge);
  const shieldHit = s.shield ? cdnHit((toShield * (s.pops - 1)) / s.pops, s.ttl) : 0;
  return { rank: k, rate, perPop, edge, toShield, shieldHit };
}

export interface CdnScenario {
  settings: CdnSettings;
  edgeShare: number;
  shieldShare: number;
  originShare: number;
  perPopRps: number;
  edgeRps: number;
  shieldRps: number;
  missRps: number;
  originRps: number;
  paths: { edge: number; shield: number; origin: number };
  meanMs: number;
  /** The rank whose requests hit at the edge half the time: asked for once per TTL at each location. */
  edgeKnee: number;
  /** The rank whose edge misses hit the shield half the time; 0 without a shield or under 3 locations. */
  shieldKnee: number;
  lanes: CdnKey[];
  /** The measures a challenge reads. */
  metrics: { originRps: number; meanMs: number; ttl: number };
}

const scenarios = new Map<string, CdnScenario>();

/** Everything the stage reads at one setting. */
export function cdnScenario(s: CdnSettings): CdnScenario {
  const id = settingsId(s);
  const known = scenarios.get(id);
  if (known) return known;
  let edgeShare = 0;
  let shieldShare = 0;
  // cdnKey's rule inlined: the widget sums all 192 settings once to reserve its text, so this loop stays allocation free.
  const HN = cdnHN();
  const others = (s.pops - 1) / s.pops;
  for (let k = 1; k <= CDN_OBJECTS; k++) {
    const w = 1 / k / HN;
    const rate = (s.rps * w) / s.variants;
    const x = (rate / s.pops) * s.ttl;
    const edge = x / (1 + x);
    const y = s.shield ? rate * (1 - edge) * others * s.ttl : 0;
    edgeShare += w * edge;
    shieldShare += w * (1 - edge) * (y / (1 + y));
  }
  const originShare = 1 - edgeShare - shieldShare;
  const e = cdnEdgeMs(s.pops);
  const paths = { edge: e, shield: e + CDN_SHIELD_MS, origin: e + (s.shield ? CDN_SHIELD_MS : 0) + CDN_ORIGIN_MS };
  const meanMs = edgeShare * paths.edge + shieldShare * paths.shield + originShare * paths.origin;
  const edgeKnee = (s.rps * s.ttl) / (HN * s.variants * s.pops);
  // At the shield the other locations' misses: rT (1 - h) (P - 1) / P = 1 with h the edge's, so rT = P / (P - 2).
  const shieldKnee = s.shield && s.pops > 2 ? (s.rps * s.ttl * (s.pops - 2)) / (HN * s.variants * s.pops) : 0;
  const originRps = s.rps * originShare;
  const out: CdnScenario = {
    settings: { ...s },
    edgeShare,
    shieldShare,
    originShare,
    perPopRps: s.rps / s.pops,
    edgeRps: s.rps * edgeShare,
    shieldRps: s.rps * shieldShare,
    missRps: s.rps * (1 - edgeShare),
    originRps,
    paths,
    meanMs,
    edgeKnee,
    shieldKnee,
    lanes: CDN_LANE_RANKS.map((k) => cdnKey(s, k)),
    metrics: { originRps, meanMs, ttl: s.ttl },
  };
  if (scenarios.size > 256) scenarios.delete(scenarios.keys().next().value!);
  scenarios.set(id, out);
  return out;
}

/**
 * The square's `n` equal columns: each column's edge and shield height, the exact mean over the objects (and parts of
 * objects) in it, so each band's area is its share of requests.
 */
export function cdnColumns(sc: CdnScenario, n: number): { edge: number; shield: number }[] {
  const s = sc.settings;
  const out = Array.from({ length: n }, () => ({ edge: 0, shield: 0 }));
  let col = 0;
  let start = 0;
  for (let k = 1; k <= CDN_OBJECTS && col < n; k++) {
    const w = cdnShare(k);
    const q = cdnKey(s, k);
    const e = q.edge;
    const sh = (1 - q.edge) * q.shieldHit;
    const end = start + w;
    let at = start;
    while (at < end - 1e-15 && col < n) {
      const colEnd = (col + 1) / n;
      const seg = Math.min(end, colEnd) - at;
      out[col].edge += e * seg;
      out[col].shield += sh * seg;
      at += seg;
      if (at >= colEnd - 1e-15) col++;
    }
    start = end;
  }
  return out.map((c) => ({ edge: c.edge * n, shield: c.shield * n }));
}

const expo = (rand: () => number, rate: number) => -Math.log(1 - rand()) / rate;
/**
 * A lane runs this many TTLs, plus a random fraction of one, before its window from an empty cache, so a copy alive at
 * the start has a history. The fraction matters for a hot lane: its misses come one TTL apart, so a fixed start would
 * put every lane's expiries on the window's ticks.
 */
const WARM_TTLS = 3;

export interface CdnCopy {
  from: number;
  to: number;
  /** A copy alive at the window's start, fetched before it. */
  earlier?: boolean;
}
export interface CdnRequest {
  at: number;
  hit: boolean;
}
export interface CdnShieldArrival {
  at: number;
  /** The outlined location's own miss, or another location's. */
  own: boolean;
  hit: boolean;
}
export interface CdnShieldSample {
  dense: boolean;
  arrivals: CdnShieldArrival[];
  copies: CdnCopy[];
  ownHits: number;
  ownMisses: number;
}
export interface CdnLaneSample {
  rank: number;
  /** Too many requests to keep one by one: only the misses and copies are kept. */
  dense: boolean;
  reqs: CdnRequest[];
  copies: CdnCopy[];
  hits: number;
  misses: number;
  expected: number;
  shield: CdnShieldSample | null;
}
export interface CdnSample {
  seed: number;
  lanes: CdnLaneSample[];
  /** The window in seconds: five TTLs. */
  window: number;
}

const inWindow = (copies: CdnCopy[]) => copies.filter((c) => c.to > 0).map((c) => (c.from < 0 ? { ...c, earlier: true } : c));

/**
 * One lane: the outlined location's requests for one URL of its object over five TTLs, run from an empty cache
 * `WARM_TTLS` and a random fraction of a TTL earlier.
 */
function laneSample(s: CdnSettings, lane: CdnKey, rand: () => number) {
  const T = s.ttl;
  const W = CDN_WINDOW_TTLS * T;
  const r = lane.perPop;
  const dense = r * W > CDN_DENSE;
  const copies: CdnCopy[] = [];
  const reqs: CdnRequest[] = [];
  let copyEnd = -Infinity;
  let misses = 0;
  let hits = 0;
  for (let t = -(WARM_TTLS + rand()) * T; ;) {
    t += expo(rand, r);
    if (t >= W) break;
    if (t < copyEnd) {
      if (t >= 0) {
        reqs.push({ at: t, hit: true });
        hits++;
      }
      continue;
    }
    if (t >= 0) {
      reqs.push({ at: t, hit: false });
      misses++;
    }
    copyEnd = t + T;
    copies.push({ from: t, to: copyEnd });
    // A dense lane keeps no hits: arrivals are memoryless, so the next one that counts comes after the copy expires.
    if (dense) t = copyEnd;
  }
  return { rank: lane.rank, dense, reqs, copies: inWindow(copies), hits, misses, expected: r * W };
}

/**
 * The shield's view of one lane's object over the window: every location's misses for it, the outlined location's
 * marked. With other locations, its copy at the start is a stationary draw: every location's misses renew it. With one
 * location only that location's misses reach it, so its copy is the edge's: fetched by the same miss, it expires with it.
 */
function shieldSample(s: CdnSettings, lane: CdnKey, own: { reqs: CdnRequest[]; copies: CdnCopy[] }, rand: () => number): CdnShieldSample {
  const T = s.ttl;
  const W = CDN_WINDOW_TTLS * T;
  const others = lane.toShield * ((s.pops - 1) / s.pops);
  const arrivals: CdnShieldArrival[] = own.reqs.filter((q) => !q.hit).map((q) => ({ at: q.at, own: true, hit: false }));
  if (others > 0) for (let t = expo(rand, others); t < W; t += expo(rand, others)) arrivals.push({ at: t, own: false, hit: false });
  arrivals.sort((a, b) => a.at - b.at);
  const copies: CdnCopy[] = [];
  let copyEnd = -Infinity;
  const edgeWarm = own.copies.find((c) => c.earlier);
  if (s.pops === 1) copyEnd = edgeWarm?.to ?? -Infinity;
  else if (rand() < cdnHit(lane.toShield, T)) copyEnd = rand() * T;
  if (copyEnd > 0) copies.push({ from: copyEnd - T, to: copyEnd, earlier: true });
  let ownHits = 0;
  let ownMisses = 0;
  for (const a of arrivals) {
    a.hit = a.at < copyEnd;
    if (!a.hit) {
      copyEnd = a.at + T;
      copies.push({ from: a.at, to: copyEnd });
    }
    if (a.own) {
      if (a.hit) ownHits++;
      else ownMisses++;
    }
  }
  const dense = arrivals.length - (ownHits + ownMisses) > CDN_DENSE;
  return { dense, arrivals: dense ? arrivals.filter((a) => a.own) : arrivals, copies, ownHits, ownMisses };
}

/** A lane that expects at least this many requests in its window always shows one; below it a lane may show none. */
export const CDN_SHOWN_EXPECTED = 0.25;

/** Whether a lane's requests look like their model: the rules a seed must keep. */
function laneFits(l: ReturnType<typeof laneSample>, m: CdnKey): boolean {
  if (l.dense) return true;
  const n = l.hits + l.misses;
  if (Math.abs(n - l.expected) > Math.max(1, 0.3 * l.expected)) return false;
  // A lane that expects a request in its window shows one, and a rarely hit object's few requests all miss.
  if (l.expected >= CDN_SHOWN_EXPECTED && n === 0) return false;
  if (n < 5 && m.edge < 0.25 && l.hits > 0) return false;
  return n < 5 || Math.abs(l.hits / n - m.edge) <= 0.2;
}

const edgeSamples = new Map<string, { seed: number; lanes: ReturnType<typeof laneSample>[] }>();
const samples = new Map<string, CdnSample>();

/**
 * The drawn sample at a setting: the first seed (from 1) whose lanes look like their model (`laneFits`). The edge's
 * requests do not depend on the shield, so turning it on keeps every request and changes only who answers each miss;
 * the shield's own seed is the first whose outlined location's misses hit it within 0.3 of the model's share where 4
 * or more reach it. It is an illustration; the words beside it are the model's.
 */
export function cdnSample(sc: CdnScenario): CdnSample {
  const s = sc.settings;
  const id = settingsId(s);
  const known = samples.get(id);
  if (known) return known;
  const edgeId = settingsId({ ...s, shield: 0 });
  let edge = edgeSamples.get(edgeId);
  for (let seed = 1; seed <= 400 && !edge; seed++) {
    const rand = seededRandom(seed * 7919 + s.pops * 31 + s.ttl);
    const lanes = sc.lanes.map((lane) => laneSample(s, lane, rand));
    if (lanes.every((l, i) => laneFits(l, sc.lanes[i]))) edge = { seed, lanes };
  }
  if (!edge) throw new Error(`No sample for ${id}`);
  if (edgeSamples.size > 32) edgeSamples.delete(edgeSamples.keys().next().value!);
  edgeSamples.set(edgeId, edge);
  const own = edge.lanes;
  let shields: (CdnShieldSample | null)[] | null = s.shield ? null : own.map(() => null);
  for (let seed = 1; seed <= 400 && !shields; seed++) {
    const rand = seededRandom(seed * 104_729 + edge.seed * 31 + s.pops);
    const drawn = own.map((l, i) => shieldSample(s, sc.lanes[i], l, rand));
    const fits = drawn.every((d, i) => {
      const n = d.ownHits + d.ownMisses;
      return n < 4 || Math.abs(d.ownHits / n - sc.lanes[i].shieldHit) <= 0.3;
    });
    if (fits) shields = drawn;
  }
  if (!shields) throw new Error(`No shield sample for ${id}`);
  const lanes = own.map((l, i) => ({ ...l, shield: shields[i] }));
  const out: CdnSample = { seed: edge.seed, lanes, window: CDN_WINDOW_TTLS * s.ttl };
  if (samples.size > 32) samples.delete(samples.keys().next().value!);
  samples.set(id, out);
  return out;
}

/** Who answered each request of a sample, in time order: the edge, the shield or the origin. */
export interface CdnEvent {
  lane: number;
  at: number;
  hit: boolean;
  where: 'edge' | 'shield' | 'origin';
  dense: boolean;
}
export function cdnEvents(sample: CdnSample): CdnEvent[] {
  const ev: CdnEvent[] = [];
  sample.lanes.forEach((l, i) => {
    for (const q of l.reqs) {
      let where: CdnEvent['where'] = 'edge';
      if (!q.hit) where = l.shield?.arrivals.find((a) => a.own && Math.abs(a.at - q.at) < 1e-9)?.hit ? 'shield' : 'origin';
      ev.push({ lane: i, at: q.at, hit: q.hit, where, dense: l.dense });
    }
  });
  return ev.sort((a, b) => a.at - b.at);
}
