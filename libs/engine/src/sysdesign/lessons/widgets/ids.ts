/**
 * The Unique IDs widget's model (REDESIGN.md 5.2, R42). A Snowflake-style 64-bit id: a sign bit kept 0, then
 * `timeBits` of ticks since an epoch, `gen` bits of generator number and `seq` bits of sequence within one tick. The
 * layout's numbers are exact powers of two. The mint is a real generator (the Snowflake algorithm) run on a stated
 * clock and stated requests, so every drawn id is the id the layout makes: its bits, its order, its waits and its
 * repeats. Random ids are weighed by the birthday bound, an approximation named as such wherever it is read.
 */

export type IdSettings = {
  /** Generator bits and sequence bits, 0 to 16 each. */
  gen: number;
  seq: number;
  /** The tick in ms: 1 or 10. */
  tick: number;
  /** 0 counts from 1 January 2026 (a custom epoch near launch), 1 from 1970 (Unix time). */
  epoch: number;
  /** 0 the stated trickle, 1 a burst of 5,000 requests to G0 at 0.05 ms. */
  load: number;
  /** What goes wrong: see `ID_FAULT`. */
  fault: number;
  /** 1 keeps the last timestamp (a clock behind it waits); 0 trusts the clock. */
  guard: number;
  /** Random ids' bits: 64 or 122. */
  bits: number;
  /** Random ids made: 10 to this power, 3 to 15. */
  count: number;
};

export const ID_BITS = 64;
export const ID_FIELD_MAX = 16;
export const ID_TICKS_MS = [1, 10] as const;
export const YEAR_MS = 365.25 * 24 * 3600 * 1000;
/** The stated clock: the mint starts at this instant (UTC), and the lifetime's "today" is it too. */
export const ID_NOW_MS = Date.UTC(2026, 10, 24, 12, 0, 0);
export const ID_EPOCH = { custom: 0, unix: 1 } as const;
export const ID_EPOCH_MS = [Date.UTC(2026, 0, 1), 0] as const;
export const ID_LOAD = { steady: 0, burst: 1 } as const;
export const ID_BURST = 5000;
export const ID_BURST_AT_US = 50;
export const ID_FAULT = { none: 0, skew: 1, stepBack: 2, shared: 3 } as const;
/** G2's clock runs 2 ms ahead; G1's clock steps back 2 ms at 5.5 ms; G2 is handed G1's number, 1. */
export const ID_SKEW_US = 2000;
export const ID_STEP_AT_US = 5500;
export const ID_STEP_US = 2000;
/** The mint draws the clock's first 8 ms; an id made later is counted, never drawn. */
export const ID_WINDOW_US = 8000;
/**
 * The stated requests, in µs after the clock's start, for G0, G1 and G2: one tick holds three ids from one generator
 * (G0 at 1 ms), one id has a generator and a sequence above 0 (G2 at 2.9 ms, the id the bits show at rest), and in the
 * tick at 7 ms the generator that made its id last (G0) sorts first.
 */
export const ID_ARRIVALS_US: readonly (readonly number[])[] = [
  [300, 1100, 1500, 1900, 3500, 5100, 7800],
  [600, 2200, 3100, 4400, 5200, 6300, 7400],
  [100, 2500, 2900, 3700, 6600, 7100],
];
export const ID_GENERATORS = 3;
/** The id band A shows at rest: G2's at 2.9 ms, with a generator and a sequence above 0. */
export const ID_REST_ID = { lane: 2, at: 2900 } as const;
export const ID_RANDOM_BITS = [64, 122] as const;
export const ID_COUNT_EXP = { min: 3, max: 15 } as const;
export const ID_BASELINE: IdSettings = { gen: 10, seq: 12, tick: 1, epoch: 0, load: 0, fault: 0, guard: 1, bits: 122, count: 9 };
/** Ids of one tick stay dots only while they are made at least this far apart; closer, the tick is a gauge. */
export const ID_DOT_GAP_US = 400;
/** The sorted list always keeps this many row slots, the most any setting makes (the spec checks it). */
export const ID_ROW_SLOTS = 21;

export interface IdLayout {
  timeBits: number;
  genBits: number;
  seqBits: number;
  tick: number;
  lifetimeMs: number;
  years: number;
  epochMs: number;
  endMs: number;
  elapsedMs: number;
  nowTicks: number;
  /** The stated clock's timestamp fits the field: a generator may mint. */
  fits: boolean;
  /** What is left from the stated clock to the timestamp's end (the challenge's bound: the epoch counts). */
  yearsLeft: number;
  generators: number;
  perTick: number;
  ticksPerSecond: number;
  perSecond: number;
  totalPerSecond: number;
}

/** What each field buys: the timestamp's lifetime, the generators at once, the ids a tick and a second. */
export function idLayout(s: Pick<IdSettings, 'gen' | 'seq' | 'tick' | 'epoch'>): IdLayout {
  const timeBits = ID_BITS - 1 - s.gen - s.seq;
  const lifetimeMs = 2 ** timeBits * s.tick;
  const epochMs = ID_EPOCH_MS[s.epoch];
  const endMs = epochMs + lifetimeMs;
  const elapsedMs = ID_NOW_MS - epochMs;
  const nowTicks = elapsedMs / s.tick;
  const generators = 2 ** s.gen;
  const perTick = 2 ** s.seq;
  const ticksPerSecond = 1000 / s.tick;
  const perSecond = perTick * ticksPerSecond;
  return {
    timeBits,
    genBits: s.gen,
    seqBits: s.seq,
    tick: s.tick,
    lifetimeMs,
    years: lifetimeMs / YEAR_MS,
    epochMs,
    endMs,
    elapsedMs,
    nowTicks,
    fits: nowTicks < 2 ** timeBits,
    yearsLeft: (endMs - ID_NOW_MS) / YEAR_MS,
    generators,
    perTick,
    ticksPerSecond,
    perSecond,
    totalPerSecond: generators * perSecond,
  };
}

/** The challenge's measures. */
export const idMetrics = (s: IdSettings) => {
  const L = idLayout(s);
  return { generators: L.generators, perSecond: L.perSecond, yearsLeft: L.yearsLeft };
};

/** The id's value: the timestamp in the high bits, then the generator, then the sequence. */
export function encodeId(L: IdLayout, ts: number, gen: number, seq: number): bigint {
  const g = BigInt(L.genBits);
  const q = BigInt(L.seqBits);
  return (BigInt(ts) << (g + q)) | (BigInt(gen) << q) | BigInt(seq);
}

export function decodeId(L: IdLayout, id: bigint) {
  const q = BigInt(L.seqBits);
  const g = BigInt(L.genBits);
  return {
    sign: Number(id >> 63n),
    ts: Number(id >> (g + q)),
    gen: Number((id >> q) & ((1n << g) - 1n)),
    seq: Number(id & ((1n << q) - 1n)),
  };
}

export type IdField = 'sign' | 'time' | 'gen' | 'seq';
/** The id's 64 bits, high bit first, each with its field. */
export function idBits(L: IdLayout, id: bigint): { index: number; bit: number; field: IdField }[] {
  const out: { index: number; bit: number; field: IdField }[] = [];
  for (let i = 63; i >= 0; i--) {
    const field: IdField = i === 63 ? 'sign' : i >= L.genBits + L.seqBits ? 'time' : i >= L.seqBits ? 'gen' : 'seq';
    out.push({ index: i, bit: Number((id >> BigInt(i)) & 1n), field });
  }
  return out;
}

interface Piece {
  from: number;
  to: number;
  off: number;
}
/** A generator's clock as pieces of true time with a fixed offset: reading = t + off on [from, to). */
function clockPieces(s: IdSettings, g: number): Piece[] {
  if (s.fault === ID_FAULT.skew && g === 2) return [{ from: 0, to: Infinity, off: ID_SKEW_US }];
  if (s.fault === ID_FAULT.stepBack && g === 1)
    return [
      { from: 0, to: ID_STEP_AT_US, off: 0 },
      { from: ID_STEP_AT_US, to: Infinity, off: -ID_STEP_US },
    ];
  return [{ from: 0, to: Infinity, off: 0 }];
}
const reading = (pieces: readonly Piece[], t: number) => t + pieces.find((p) => t >= p.from && t < p.to)!.off;
/** The first true time at or after `t` when the clock reads at least `x`. */
function reach(pieces: readonly Piece[], x: number, t: number): number {
  for (const p of pieces) {
    const at = Math.max(t, p.from, x - p.off);
    if (at < p.to) return at;
  }
  return Infinity;
}

/** The generator number each drawn generator is configured with. */
export const numberOf = (s: IdSettings, g: number) => (s.fault === ID_FAULT.shared && g === 2 ? 1 : g);

function arrivals(s: IdSettings, g: number): readonly number[] {
  if (s.load === ID_LOAD.burst && g === 0) return Array.from({ length: ID_BURST }, () => ID_BURST_AT_US);
  return ID_ARRIVALS_US[g];
}

export type IdWait = 'queue' | 'clock' | 'full';

export interface MintedId {
  key: string;
  lane: number;
  number: number;
  arrival: number;
  /** True time it was made, µs from the clock's start. */
  issued: number;
  /** Its generator's clock reading then, µs. */
  clock: number;
  /** The tick of the stated window it carries (0 is the clock's first). */
  tick: number;
  /** The whole timestamp field. */
  ts: number;
  seq: number;
  wait: number;
  why: IdWait | null;
  id: bigint;
  /** The key of the earlier id it repeats. */
  repeatOf?: string;
  /** Its place in id order, and in made order. */
  rank: number;
  made: number;
}

/**
 * One generator: requests in arrival order, each served when the one before it is. The timestamp is the clock's tick;
 * within one tick the sequence counts up, and once it has used all 2^seq values the generator waits for the clock's next
 * tick. With the guard on, a clock behind the last timestamp used waits until it catches up; with it off, the generator
 * trusts its clock and starts the sequence again at 0.
 */
function runGenerator(s: IdSettings, L: IdLayout, g: number): MintedId[] {
  const pieces = clockPieces(s, g);
  const tickUs = s.tick * 1000;
  const baseTicks = (ID_NOW_MS - L.epochMs) / s.tick;
  const number = numberOf(s, g);
  const out: MintedId[] = [];
  let last = -Infinity;
  let seq = 0;
  let free = 0;
  let n = 0;
  for (const a of arrivals(s, g)) {
    let t = Math.max(a, free);
    let ts: number;
    let why: IdWait | null = a < free ? 'queue' : null;
    for (;;) {
      ts = Math.floor(reading(pieces, t) / tickUs);
      if (s.guard && ts < last) {
        t = reach(pieces, last * tickUs, t);
        why = 'clock';
        continue;
      }
      if (ts === last) {
        if (seq + 1 < L.perTick) {
          seq += 1;
          break;
        }
        t = reach(pieces, (last + 1) * tickUs, t);
        why = why === 'clock' ? 'clock' : 'full';
        continue;
      }
      seq = 0;
      break;
    }
    last = ts;
    free = t;
    out.push({
      key: `g${g}-${n++}`,
      lane: g,
      number,
      arrival: a,
      issued: t,
      clock: reading(pieces, t),
      tick: ts,
      ts: baseTicks + ts,
      seq,
      wait: t - a,
      why: t > a ? why : null,
      id: encodeId(L, baseTicks + ts, number, seq),
      rank: 0,
      made: 0,
    });
  }
  return out;
}

export interface IdLane {
  lane: number;
  number: number;
  runs: boolean;
  why: 'overflow' | 'noNumber' | null;
  ids: MintedId[];
  requests: number;
}

export interface IdMint {
  settings: IdSettings;
  layout: IdLayout;
  lanes: IdLane[];
  ids: MintedId[];
  byMade: MintedId[];
  /** Every id in id order (the index's key order); equal ids in made order, so a repeat sits right below its twin. */
  sorted: MintedId[];
  repeats: MintedId[];
  /** Ids made before an id that sorts ahead of them, in an earlier tick: out of time order across ticks. */
  lateByTick: MintedId[];
  drawn: MintedId[];
  /** Ids made after the drawn window. */
  after: number;
  waited: MintedId[];
  lastBurst: MintedId | null;
}

/**
 * The mint over the stated requests. A generator runs only if its number fits the generator field; none mints if the
 * stated clock is past the timestamp field's end.
 */
export function idMint(s: IdSettings): IdMint {
  const L = idLayout(s);
  const lanes: IdLane[] = [];
  for (let g = 0; g < ID_GENERATORS; g++) {
    const number = numberOf(s, g);
    const runs = L.fits && number < L.generators;
    lanes.push({
      lane: g,
      number,
      runs,
      why: !L.fits ? 'overflow' : runs ? null : 'noNumber',
      ids: runs ? runGenerator(s, L, g) : [],
      requests: arrivals(s, g).length,
    });
  }
  const all = lanes.flatMap((l) => l.ids);
  const byMade = [...all].sort((a, b) => a.issued - b.issued || a.lane - b.lane);
  const sorted = [...all].sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : a.issued - b.issued || a.lane - b.lane));
  const seen = new Map<bigint, MintedId>();
  for (const x of byMade) {
    const first = seen.get(x.id);
    if (first) x.repeatOf = first.key;
    else seen.set(x.id, x);
  }
  sorted.forEach((x, i) => (x.rank = i));
  byMade.forEach((x, i) => (x.made = i));
  const lateByTick = lateAmong(sorted, s.tick * 1000);
  const drawn = all.filter((x) => x.issued < ID_WINDOW_US);
  const waited = all.filter((x) => x.wait > 0);
  const g0 = lanes[0].ids;
  return {
    settings: s,
    layout: L,
    lanes,
    ids: all,
    byMade,
    sorted,
    repeats: byMade.filter((x) => x.repeatOf),
    lateByTick,
    drawn,
    after: all.length - drawn.length,
    waited,
    lastBurst: s.load === ID_LOAD.burst && g0.length ? g0[g0.length - 1] : null,
  };
}

/**
 * Of ids in id order, those made in an earlier tick than some id that sorts ahead of them: each sorts after an id made
 * later, out of time order across ticks.
 */
export function lateAmong(sorted: readonly MintedId[], tickUs: number): MintedId[] {
  let maxIssued = -Infinity;
  const out: MintedId[] = [];
  for (const x of sorted) {
    if (x.issued < maxIssued - 1e-9 && Math.floor(x.issued / tickUs) < Math.floor(maxIssued / tickUs)) out.push(x);
    maxIssued = Math.max(maxIssued, x.issued);
  }
  return out;
}

export interface IdGroup {
  key: string;
  lane: number;
  tick: number;
  seqFrom: number;
  seqTo: number;
  count: number;
  first: MintedId;
  last: MintedId;
  ids: MintedId[];
  /** Its ids are made far enough apart to draw as dots; else the tick is one gauge. */
  single: boolean;
}

/**
 * The mint's ids as the lanes and the sorted list draw them: one group per generator and tick, so a burst is a gauge
 * per tick and never 5,000 marks.
 */
export function idGroups(m: IdMint): IdGroup[] {
  const out: IdGroup[] = [];
  for (const lane of m.lanes) {
    let cur: IdGroup | null = null;
    for (const x of lane.ids) {
      if (cur && cur.tick === x.tick && x.seq === cur.seqTo + 1) {
        cur.seqTo = x.seq;
        cur.count += 1;
        cur.last = x;
        cur.ids.push(x);
      } else {
        cur = {
          key: x.key,
          lane: lane.lane,
          tick: x.tick,
          seqFrom: x.seq,
          seqTo: x.seq,
          count: 1,
          first: x,
          last: x,
          ids: [x],
          single: true,
        };
        out.push(cur);
      }
    }
  }
  for (const gr of out) gr.single = gr.ids.every((x, i) => i === 0 || x.issued - gr.ids[i - 1].issued >= ID_DOT_GAP_US);
  return out;
}

/** A row of the sorted list: an id, or one row for a tick drawn as a gauge. Only ids made in the window. */
export interface IdRow {
  key: string;
  x: MintedId;
  group?: IdGroup;
  made: number;
}
export function idRows(m: IdMint, groups: readonly IdGroup[] = idGroups(m)): IdRow[] {
  const big = new Map<string, IdGroup>();
  for (const g of groups) if (!g.single) for (const x of g.ids) big.set(x.key, g);
  const seen = new Set<string>();
  const out: IdRow[] = [];
  for (const x of m.sorted) {
    if (x.issued >= ID_WINDOW_US) continue;
    const g = big.get(x.key);
    if (g) {
      if (seen.has(g.key)) continue;
      seen.add(g.key);
      out.push({ key: g.key, group: g, x, made: g.first.issued });
    } else out.push({ key: x.key, x, made: x.issued });
  }
  return out;
}

/** A generator's clock reading at true time t (µs). */
export const idClockAt = (s: IdSettings, g: number, t: number) => reading(clockPieces(s, g), t);

/** The stretches of true time in which generator g's own clock reads each tick, within the drawn window. */
export function ownTicks(s: IdSettings, g: number): { tick: number; from: number; to: number }[] {
  const tickUs = s.tick * 1000;
  const out: { tick: number; from: number; to: number }[] = [];
  for (const p of clockPieces(s, g)) {
    const from = Math.max(p.from, 0);
    const to = Math.min(p.to, ID_WINDOW_US);
    if (from >= to) continue;
    for (let k = Math.floor((from + p.off) / tickUs); k * tickUs - p.off < to; k++) {
      const a = Math.max(from, k * tickUs - p.off);
      const b = Math.min(to, (k + 1) * tickUs - p.off);
      if (b > a) out.push({ tick: k, from: a, to: b });
    }
  }
  return out;
}

/** The chance of at least one repeat among n ids drawn uniformly from 2^bits values: 1 - e^(-n^2 / 2^(bits+1)). */
export const birthdayChance = (bits: number, n: number) => -Math.expm1(-(n * n) / 2 ** (bits + 1));
/** The exact chance, as a product, for small spaces. */
export function birthdayExact(bits: number, n: number): number {
  const N = 2 ** bits;
  let logNone = 0;
  for (let i = 1; i < n; i++) logNone += Math.log1p(-i / N);
  return -Math.expm1(logNone);
}
/** The count at which the chance reaches one half: sqrt(2 ln 2 × 2^bits). */
export const evenOdds = (bits: number) => Math.sqrt(2 * Math.LN2 * 2 ** bits);
/** The expected number of colliding pairs, n(n - 1) / 2^(bits+1). */
export const expectedPairs = (bits: number, n: number) => (n * (n - 1)) / 2 ** (bits + 1);

/** Every layout the steppers and the tick reach, for the challenge's enumeration. */
export const ID_LAYOUTS: readonly IdSettings[] = Array.from({ length: ID_FIELD_MAX + 1 }, (_, gen) =>
  Array.from({ length: ID_FIELD_MAX + 1 }, (__, seq) => ID_TICKS_MS.map((tick) => ({ ...ID_BASELINE, gen, seq, tick }))),
).flat(2);
