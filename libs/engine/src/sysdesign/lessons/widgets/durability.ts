import { choose } from './quorum.js';

export type Redundancy = { kind: 'replicas'; copies: number } | { kind: 'erasure'; data: number; parity: number };

export interface DurabilityRun {
  /** Bytes stored per byte of data. */
  overhead: number;
  /** Pieces that can be lost at once without losing the object. */
  tolerates: number;
  /** Chance a given object is lost in a year. */
  annualLoss: number;
  /** Nines of durability: 11 means 99.999999999%. */
  nines: number;
  /** Bytes read to rebuild one lost piece, per byte of that piece. */
  repairRead: number;
}

export const DURABILITY_YEAR_H = 8760;

/** P(at least k of n independent pieces fail), each with chance p: the binomial tail, summed term by term. */
export function durabilityAtLeast(n: number, k: number, p: number): number {
  let total = 0;
  let term = (1 - p) ** n;
  for (let i = 0; i <= n; i++) {
    if (i >= k) total += term;
    term *= ((n - i) / (i + 1)) * (p / (1 - p));
  }
  return total;
}

/**
 * An object stored as `copies` full replicas, or cut into `data` pieces plus `parity` pieces of which any `data` rebuild
 * it, each piece on a different disk. Disks fail at `afr` a year, independently, and a failed piece is rebuilt in
 * `repairHours`. The object is lost when, after one piece fails, more than the tolerated number of the rest fail before
 * the repair ends. Correlated failures (a rack, a bad batch of disks) make real losses far likelier than this.
 */
export function durability(redundancy: Redundancy, options: { afr: number; repairHours: number }): DurabilityRun {
  const { afr, repairHours } = options;
  const pieces = redundancy.kind === 'replicas' ? redundancy.copies : redundancy.data + redundancy.parity;
  const tolerates = redundancy.kind === 'replicas' ? redundancy.copies - 1 : redundancy.parity;
  const overhead = redundancy.kind === 'replicas' ? redundancy.copies : pieces / redundancy.data;
  const pDuringRepair = afr * (repairHours / DURABILITY_YEAR_H);
  const annualLoss = Math.min(1, pieces * afr * durabilityAtLeast(pieces - 1, tolerates, pDuringRepair));
  return {
    overhead,
    tolerates,
    annualLoss,
    nines: annualLoss > 0 ? -Math.log10(annualLoss) : Infinity,
    repairRead: redundancy.kind === 'replicas' ? 1 : redundancy.data,
  };
}

export const DURABILITY_DISK_TB = 20;
/** A billion objects of 1 MB: 1 PB of data, the interview question's store. */
export const DURABILITY_OBJECTS = 1e9;
export const DURABILITY_OBJECT_MB = 1;
export const DURABILITY_DATA_TB = (DURABILITY_OBJECTS * DURABILITY_OBJECT_MB) / 1e6;
/**
 * A rack-wide event that destroys every disk in the rack (a fire, a power fault, a bad firmware push): an assumption,
 * said as one wherever it is used. With one piece a rack it is one more disk failure, part of the AFR.
 */
export const DURABILITY_RACK_EVENT = 0.001;
/** What one disk writes, sustained: about 250 MB/s, so a 20 TB disk refilled alone takes about a day. */
export const DURABILITY_DISK_WRITE_GBPS = 2;
/** The time one disk takes to refill a whole disk alone. */
export const DURABILITY_ALONE_HOURS = (DURABILITY_DISK_TB * 1e12 * 8) / (DURABILITY_DISK_WRITE_GBPS * 1e9) / 3600;

export interface DurabilityScheme {
  id: string;
  kind: 'replicas' | 'erasure';
  /** Copies, or data and parity pieces. */
  copies?: number;
  data?: number;
  parity?: number;
  /** As the controls and the words say it. */
  short: string;
}
export const DURABILITY_SCHEMES: readonly DurabilityScheme[] = [
  { id: 'r2', kind: 'replicas', copies: 2, short: '2 copies' },
  { id: 'r3', kind: 'replicas', copies: 3, short: '3 copies' },
  { id: 'ec63', kind: 'erasure', data: 6, parity: 3, short: '6 + 3' },
  { id: 'ec104', kind: 'erasure', data: 10, parity: 4, short: '10 + 4' },
];
export const DURABILITY_AFRS = [1, 2, 5, 10] as const;
export const DURABILITY_REPAIRS = [1, 6, 24, 72, 168] as const;

/**
 * One setting, as numbers (`ExperimentSettings`): `scheme` an index of the schemes, `afr` percent a year, `repair`
 * hours, `rack` 1 when every piece shares one rack.
 */
export type DurabilitySettings = { scheme: number; afr: number; repair: number; rack: number };
export const DURABILITY_BASELINE: Readonly<DurabilitySettings> = { scheme: 1, afr: 2, repair: 24, rack: 0 };
export const DURABILITY_SETTINGS: readonly DurabilitySettings[] = DURABILITY_SCHEMES.flatMap((_, scheme) =>
  DURABILITY_AFRS.flatMap((afr) => DURABILITY_REPAIRS.flatMap((repair) => [0, 1].map((rack) => ({ scheme, afr, repair, rack })))),
);

/** One factor of the drawn walk: the first failures a year, a further failure inside the window, or the ways. */
export type DurabilityStep =
  | { kind: 'first'; factor: number; level: number }
  | { kind: 'window'; i: number; factor: number; level: number }
  | { kind: 'ways'; factor: number; level: number };

export interface DurabilityPiece {
  id: string;
  kind: 'copy' | 'data' | 'parity';
}

export interface DurabilityScenario {
  settings: DurabilitySettings;
  scheme: DurabilityScheme;
  replicas: boolean;
  /** Pieces stored. */
  n: number;
  /** Pieces it can lose at once. */
  t: number;
  /** Pieces any rebuild needs. */
  need: number;
  overhead: number;
  /** The yearly failure rate as a fraction. */
  afr: number;
  /** The chance a given other piece fails inside the window. */
  p: number;
  first: number;
  ways: number;
  tail: number;
  indep: number;
  rack: number;
  loss: number;
  /** The steps' product, the leading term of the model. */
  lead: number;
  steps: readonly DurabilityStep[];
  nines: number;
  perBillion: number;
  repairRead: number;
  rawTB: number;
  disks: number;
  failsYear: number;
  rebuildTB: number;
  rebuildGbps: number;
  /** One whole disk rebuilt in the window, as a write rate: above one disk's it must be spread over many disks. */
  writeGbps: number;
  spread: boolean;
  /** The exact model against the steps: 0 for copies, slightly below 0 for codes. */
  exactGap: number;
  objectsPerLoss: number;
  lossEventsYear: number;
  pieces: readonly DurabilityPiece[];
  metrics: { perBillion: number; overhead: number; rebuildGbps: number };
}

/**
 * How many objects one loss takes: the billion objects' pieces lie on the store's D disks, so t + 1 disks down at once
 * lose every object with a piece on each of them, OBJECTS x C(D - t - 1, n - t - 1) / C(D, n) with random placement.
 */
export function durabilityObjectsPerLoss(n: number, t: number, disks: number): number {
  const c = (a: number, b: number) => {
    let v = 1;
    for (let i = 1; i <= b; i++) v = (v * (a - b + i)) / i;
    return v;
  };
  return (DURABILITY_OBJECTS * c(disks - t - 1, n - t - 1)) / c(disks, n);
}

const scenarios = new Map<string, DurabilityScenario>();

/**
 * One object stored under a scheme, each piece on its own disk. Disks fail independently at `afr` a year and a failed
 * piece is rebuilt in `repair` hours. The object is lost when, after one piece fails, more than the tolerated number of
 * the rest fail before that repair ends: yearly loss = pieces x AFR x P(at least t of the other n - 1 fail inside the
 * window), each with chance p = AFR x repair / 8,760 (`durability()`, unchanged). With every piece in one rack, a rack
 * event (assumed once in 1,000 years) takes them all at once, and needs no window. The steps are the leading term of
 * the same product, drawn as factors; the spec bounds them against the exact tail. Memoized: 160 settings.
 */
export function durabilityScenario(input: DurabilitySettings): DurabilityScenario {
  const s: DurabilitySettings = { scheme: input.scheme, afr: input.afr, repair: input.repair, rack: input.rack ? 1 : 0 };
  const key = `${s.scheme}|${s.afr}|${s.repair}|${s.rack}`;
  const hit = scenarios.get(key);
  if (hit) return hit;
  const sc = DURABILITY_SCHEMES[s.scheme];
  const replicas = sc.kind === 'replicas';
  const k = sc.data ?? 1;
  const n = replicas ? sc.copies! : k + sc.parity!;
  const t = replicas ? n - 1 : sc.parity!;
  const overhead = replicas ? n : n / k;
  const afr = s.afr / 100;
  const p = (afr * s.repair) / DURABILITY_YEAR_H;
  const first = n * afr;
  const ways = choose(n - 1, t);
  const tail = durabilityAtLeast(n - 1, t, p);
  const indep = Math.min(1, first * tail);
  const rack = s.rack ? DURABILITY_RACK_EVENT : 0;
  // Either cause loses it: written so a tiny indep keeps its digits (1 - (1 - a)(1 - b) loses them).
  const loss = indep + rack - indep * rack;
  const steps: DurabilityStep[] = [{ kind: 'first', factor: first, level: first }];
  let level = first;
  for (let i = 1; i <= t; i++) {
    level *= p;
    steps.push({ kind: 'window', i, factor: p, level });
  }
  level *= ways;
  steps.push({ kind: 'ways', factor: ways, level });
  const rawTB = DURABILITY_DATA_TB * overhead;
  const disks = rawTB / DURABILITY_DISK_TB;
  const repairRead = replicas ? 1 : k;
  const rebuildTB = repairRead * DURABILITY_DISK_TB;
  const seconds = s.repair * 3600;
  const objectsPerLoss = durabilityObjectsPerLoss(n, t, Math.round(disks));
  const perBillion = loss * DURABILITY_OBJECTS;
  const rebuildGbps = (rebuildTB * 1e12 * 8) / seconds / 1e9;
  const writeGbps = (DURABILITY_DISK_TB * 1e12 * 8) / seconds / 1e9;
  const out: DurabilityScenario = {
    settings: s,
    scheme: sc,
    replicas,
    n,
    t,
    need: k,
    overhead,
    afr,
    p,
    first,
    ways,
    tail,
    indep,
    rack,
    loss,
    lead: level,
    steps,
    nines: -Math.log10(loss),
    perBillion,
    repairRead,
    rawTB,
    disks,
    failsYear: disks * afr,
    rebuildTB,
    rebuildGbps,
    writeGbps,
    spread: writeGbps > DURABILITY_DISK_WRITE_GBPS,
    exactGap: (first * tail) / level - 1,
    objectsPerLoss,
    lossEventsYear: perBillion / objectsPerLoss,
    pieces: Array.from({ length: n }, (_, i): DurabilityPiece => {
      if (replicas) return { id: `c${i + 1}`, kind: 'copy' };
      return i < k ? { id: `d${i + 1}`, kind: 'data' } : { id: `p${i - k + 1}`, kind: 'parity' };
    }),
    metrics: { perBillion, overhead, rebuildGbps },
  };
  scenarios.set(key, out);
  return out;
}

/**
 * The loss of E5's distractor: two copies in one rack and the third elsewhere. A rack event then leaves one copy,
 * which must not fail before the two are rebuilt: the event's rate times p, plus the independent loss.
 */
export function durabilityTwoInOneRack(s: DurabilitySettings): number {
  const m = durabilityScenario({ ...s, rack: 0 });
  const r = DURABILITY_RACK_EVENT * durabilityAtLeast(1, 1, m.p);
  return m.indep + r - m.indep * r;
}
