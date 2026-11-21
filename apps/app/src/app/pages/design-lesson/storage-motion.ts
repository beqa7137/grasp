import { STORAGE_OP, type StorageScenario } from '@grasp/engine';

export type Engine = 'btree' | 'lsm';

/** A running play: the engine it follows the operation through, and its clock from 0 to 1. */
export interface StoragePlay {
  engine: Engine;
  frac: number;
}

/**
 * Each step of a play as a moment of its one clock, 0 to 1, and the play's length in seconds. A mark shows once the
 * clock has reached its moment, so nothing is drawn for an event before it happens; a write is answered at its log
 * append, and every step after it is later.
 */
export type Plan = Readonly<Record<string, number>> & { seconds: number };

export function planOf(engine: Engine, m: StorageScenario): Plan {
  const write = m.settings.op === STORAGE_OP.write;
  const P: Record<string, number> = {};
  if (engine === 'btree') {
    const h = m.btree.height;
    for (let k = 0; k < h; k++) P[`walk${k}`] = (k / (h - 1)) * 0.42;
    if (write) Object.assign(P, { strip: 0.5, slice: 0.58, log: 0.7, page: 0.84, ledger: 0.97, seconds: 4 });
    else Object.assign(P, { strip: 0.56, slice: 0.72, log: 0.86, page: 0.56, ledger: 0.95, seconds: 2.6 });
  } else {
    const L = m.lsm.levels;
    if (write) {
      // The record reaches L2, then the staircase plays in its own beat while the record holds there, then it goes on.
      Object.assign(P, { log: 0.02, mem: 0.07, run0: 0.16, run1: 0.26, run2: 0.36, stair0: 0.4, stair1: 0.64, ledger: 0.97 });
      for (let j = 3; j <= L; j++) P[`run${j}`] = 0.7 + ((j - 2) * 0.22) / (L - 2);
      P['seconds'] = 6 + 0.5 * L;
    } else {
      Object.assign(P, { mem: 0.06, ledger: 0.96 });
      for (let j = 0; j <= L; j++) P[`run${j}`] = 0.16 + (j * 0.68) / L;
      P['found'] = P[`run${L}`] + 0.06;
      P['seconds'] = 1.6 + 0.5 * (L + 1);
    }
  }
  return P as Plan;
}

/** Whether a mark at moment `at` of `engine`'s play shows: always at rest and in the other engine's panel. */
export const shownAt = (play: StoragePlay | null, engine: Engine, at: number) => !play || play.engine !== engine || play.frac >= at - 1e-9;

/** The most of a step the key spends travelling: it reaches the station early in its step and holds there. */
const TRAVEL = 0.35;

/** Where the key is between two pages or runs: it leaves at `from` and arrives at `to`, and holds between legs. */
export function keyAt(frac: number, from: number, to: number): number | null {
  return frac > from && frac < to ? (frac - from) / (to - from) : null;
}

/** The steps the key travels to, in order: the B-tree's pages from the root, or the memtable and then each run. */
export function stationsOf(engine: Engine, m: StorageScenario): string[] {
  return engine === 'btree'
    ? Array.from({ length: m.btree.height }, (_, k) => `walk${k}`)
    : ['mem', ...Array.from({ length: m.lsm.levels + 1 }, (_, j) => `run${j}`)];
}

/**
 * When the key leaves for each station after the first, and so when that station's line begins: a step's line names
 * where the key is for the whole step, never the station it has just left, and its marks wait for the key's arrival.
 * The key travels at most `TRAVEL` of the time to its station and of the time it then holds there, so it has arrived
 * before its step's middle.
 */
export function departures(engine: Engine, m: StorageScenario): Readonly<Record<string, number>> {
  const P = planOf(engine, m);
  const moments = Object.entries(P)
    .filter(([k]) => k !== 'seconds')
    .map(([, v]) => v);
  const st = stationsOf(engine, m);
  const at: Record<string, number> = {};
  for (let i = 1; i < st.length; i++) {
    const to = P[st[i]];
    const next = Math.min(1, ...moments.filter((v) => v > to + 1e-9));
    at[st[i]] = to - TRAVEL * Math.min(to - P[st[i - 1]], next - to);
  }
  return at;
}

/**
 * The play's clock at its last moment: the largest step or line start at or before `frac`, or, while one level's
 * staircase draws, the start of the row now drawing. The stage redraws only when this changes; the key alone moves
 * every frame.
 */
export function momentOf(engine: Engine, m: StorageScenario, frac: number): number {
  const P = planOf(engine, m);
  const s0 = P['stair0'];
  const s1 = P['stair1'];
  if (s0 !== undefined && frac > s0 && frac < s1) {
    const T = m.settings.ratio;
    const row = Math.ceil(T * ((frac - s0) / (s1 - s0)) - 1e-9);
    return row < 1 ? s0 : s0 + ((row - 1) / T + 1e-6) * (s1 - s0);
  }
  let at = 0;
  const moments = [...Object.entries(P).filter(([k]) => k !== 'seconds'), ...Object.entries(departures(engine, m))];
  for (const [, v] of moments) if (v <= frac + 1e-9 && v > at) at = v;
  return at;
}

/** One leg of the key's way: between two moments of the clock, from one point to the next. */
export interface KeyLeg {
  from: number;
  to: number;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
}

export function keyPosition(legs: readonly KeyLeg[], frac: number): { x: number; y: number } | null {
  for (const g of legs) {
    const t = keyAt(frac, g.from, g.to);
    if (t !== null) return { x: Math.round((g.x1 + (g.x2 - g.x1) * t) * 10) / 10, y: Math.round((g.y1 + (g.y2 - g.y1) * t) * 10) / 10 };
  }
  return null;
}
