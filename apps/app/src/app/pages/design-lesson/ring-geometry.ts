import { SHARD_FOLLOW, SHARD_K, SHARD_TURN, shardPositions } from '@grasp/engine';
import { TEXT, type Role } from './latency-draw';

/**
 * The Sharding stage's geometry that depends only on its width (the ring's swarm of dots, the closer look's window and
 * stacking, the piles' metrics), and its line breaking, which never parts a number from its unit.
 */

export const TAU = Math.PI * 2;
export const polar = (cx: number, cy: number, rad: number, a: number): [number, number] => [
  cx + rad * Math.sin(a * TAU),
  cy - rad * Math.cos(a * TAU),
];

/** Every drawn key's position as a share of the turn: the 200 keys, then the hot key, then its ten salted keys. */
let allAt: number[] | null = null;
export const positionsOf = (): number[] => {
  if (allAt) return allAt;
  const p = shardPositions();
  return (allAt = [...p.keys, p.hot, ...p.salts].map((at) => at / SHARD_TURN));
};
export const HOT_ID = SHARD_K;
export const saltId = (j: number) => SHARD_K + 1 + j;

export interface Swarm {
  /** The band's radius. */
  rb: number;
  pos: { rad: number; a: number }[];
  r: number;
  /** The outer edge of the outermost dot. */
  outer: number;
}
const swarms = new Map<string, Swarm>();
/**
 * The ring's dots: each key at its hash's angle, pushed outward to the first lane where it touches no other. The band's
 * radius is the largest that keeps every lane inside `rMax`. Positions never depend on the setting.
 */
export function ringSwarm(rMax: number, r: number): Swarm {
  const id = `${rMax}|${r}`;
  const hit = swarms.get(id);
  if (hit) return hit;
  const at = positionsOf();
  const pitch = 2 * r + 1.4;
  const order = at.map((_, i) => i).sort((a, b) => at[a] - at[b]);
  let out: Swarm | null = null;
  for (let rb = rMax - 12; rb > 30 && !out; rb -= 1) {
    const lane0 = rb + 4 + 3 + r;
    const lanes: number[][] = [];
    const pos: { rad: number; a: number }[] = Array.from({ length: at.length });
    let ok = true;
    let maxLane = 0;
    for (const i of order) {
      const ang = at[i] * TAU;
      let lane = 0;
      for (; ; lane++) {
        const rad = lane0 + lane * pitch;
        if (rad + r > rMax) {
          ok = false;
          break;
        }
        const need = (2 * r + 0.9) / rad;
        const arr = (lanes[lane] ??= []);
        if (arr.every((b) => Math.min(Math.abs(b - ang), TAU - Math.abs(b - ang)) >= need)) {
          arr.push(ang);
          pos[i] = { rad, a: at[i] };
          break;
        }
      }
      if (!ok) break;
      maxLane = Math.max(maxLane, lane);
    }
    if (ok) out = { rb, pos, r, outer: lane0 + maxLane * pitch + r };
  }
  swarms.set(id, out!);
  return out!;
}

/** The largest share of the ring the closer look magnifies, so the strip draws at most 60 keys. */
export const LENS_MOST = 0.28;
/** The closer look's window: the whole ring with one point a node, else about one point every 20 px. */
export function lensWindow(points: number, stripW: number): { f: number; start: number } {
  const f = points === 1 ? 1 : Math.min(LENS_MOST, Math.floor(stripW / 20) / (5 * points));
  const c = positionsOf()[SHARD_FOLLOW];
  return f >= 1 ? { f: 1, start: 0 } : { f, start: (((c - f * 0.42) % 1) + 1) % 1 };
}
export const rel = (a: number, start: number) => (((a - start) % 1) + 1) % 1;

/** Dots along the strip, stacked upward where they would touch; `first` takes lane 0. */
export function stripStack(xs: readonly (readonly [number, number])[], r: number, first: number | null = null) {
  const lane = new Map<number, number>();
  const placed: [number, number][] = [];
  const sorted = [...xs].sort((a, b) => (a[0] === first ? -1 : b[0] === first ? 1 : a[1] - b[1]));
  let most = 0;
  for (const [i, x] of sorted) {
    let l = 0;
    while (placed.some(([pl, px]) => pl === l && Math.abs(x - px) < 2 * r + 1)) l++;
    placed.push([l, x]);
    lane.set(i, l);
    most = Math.max(most, l + 1);
  }
  return { lane, lanes: most };
}

const lensLanesCache = new Map<string, number>();
/** The strip's tallest stack at a width for a number of points: the stage reserves it. */
export function lensLanes(stripW: number, r: number, points: number): number {
  const id = `${stripW}|${r}|${points}`;
  const hit = lensLanesCache.get(id);
  if (hit !== undefined) return hit;
  const { f, start } = lensWindow(points, stripW);
  const xs = positionsOf()
    .map((p, i) => [i, rel(p, start)] as const)
    .filter(([, p]) => p < f)
    .map(([i, p]) => [i, (p / f) * stripW] as const);
  const most = stripStack(xs, r, SHARD_FOLLOW).lanes;
  lensLanesCache.set(id, most);
  return most;
}

/**
 * A pile's metrics: dots across, pitch and radius, at the largest pitch the column allows. Beside the ring six a row;
 * under it the piles are wide and short, so on a phone the ring and the piles fit one screen together (ring-layout.spec).
 */
export function pileMetrics(two: boolean, bw: number): { c: number; p: number; r: number } {
  const c = two ? 6 : bw >= 46 ? 10 : bw >= 30 ? 9 : 8;
  const p = Math.min(two ? 6 : 5.2, (bw - 4) / c);
  return { c, p, r: Math.min(2.5, p * 0.42) };
}

const NB = ' ';
/** Joins with no-break spaces what a line must never part: a number and its unit, "mod" and its number, an equation, a bracket. */
const glue = (t: string) =>
  t
    .replace(/\(([^)]*)\)/g, (m) => m.replace(/ /g, NB))
    .replace(/([\d,]+) mod (\d+) = (\d+)/g, `$1${NB}mod${NB}$2${NB}=${NB}$3`)
    .replace(/\bhash mod (\d+|N)/g, `hash${NB}mod${NB}$1`)
    .replace(/(\d) (keys?|nodes?|points?|shards?|of|×)(?=[\s,.;:]|$)/g, `$1${NB}$2`)
    .replace(/\b(of|to|from|on|is|at|by|holds) ([\d,.]+%?|[A-F])(?=[\s,.;:']|$)/g, `$1${NB}$2`)
    .replace(/(\d+) of(?: | )(the )?(\d+)/g, (m) => m.replace(/ /g, NB));

/** Breaks `text` into lines no wider than `width`, at spaces `glue` left breakable; a word wider keeps its own line. */
export function wrap(text: string, role: Role, width: number): string[] {
  const lines: string[] = [];
  let line = '';
  for (const w of glue(text).split(' ')) {
    const next = line ? `${line} ${w}` : w;
    if (!line || TEXT.tw(next.replace(/ /g, ' '), role) <= width) line = next;
    else {
      lines.push(line);
      line = w;
    }
  }
  if (line) lines.push(line);
  return lines.map((l) => l.replace(/ /g, ' '));
}
export const lineCount = (text: string, role: Role, width: number) => wrap(text, role, width).length;
