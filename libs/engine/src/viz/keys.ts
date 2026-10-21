import type { Frame, Scalar } from '../algorithms/types.js';

export type ListName = 'stack' | 'queue' | 'set' | 'output';
export const LIST_NAMES: readonly ListName[] = ['stack', 'queue', 'set', 'output'];

/** Stable keys for a frame's array cells and list items, so a renderer can tell a move from a write (REDESIGN.md 3.3). */
export interface FrameKeys {
  array?: string[];
  stack?: string[];
  queue?: string[];
  set?: string[];
  output?: string[];
}

export const listItems = (frame: Frame, list: ListName): Scalar[] | undefined => (list === 'set' ? frame.set?.entries : frame[list]?.items);

const same = (a: Scalar, b: Scalar) => a === b;

/**
 * Matches each new item to an old one with an equal value, keeping their order (a longest common subsequence). Matching
 * from the end keeps the latest equal items, so a queue that drops one of two equal values drops the front one; `fromFront`
 * keeps the earliest instead, as a stack or output that loses one loses its last.
 */
function align(before: readonly Scalar[], after: readonly Scalar[], fromFront: boolean): (number | null)[] {
  if (fromFront)
    return align([...before].reverse(), [...after].reverse(), false)
      .map((i) => (i === null ? null : before.length - 1 - i))
      .reverse();
  const lengths = Array.from({ length: before.length + 1 }, () => Array.from({ length: after.length + 1 }, () => 0));
  for (let i = 1; i <= before.length; i++)
    for (let j = 1; j <= after.length; j++)
      lengths[i][j] = same(before[i - 1], after[j - 1]) ? lengths[i - 1][j - 1] + 1 : Math.max(lengths[i - 1][j], lengths[i][j - 1]);
  const match = Array.from<number | null>({ length: after.length }).fill(null);
  for (let i = before.length, j = after.length; i > 0 && j > 0;) {
    if (same(before[i - 1], after[j - 1])) match[--j] = --i;
    else if (lengths[i - 1][j] >= lengths[i][j - 1]) i--;
    else j--;
  }
  return match;
}

type Fresh = () => string;

function nextArrayKeys(keys: readonly string[], before: readonly Scalar[], after: readonly Scalar[], fresh: Fresh): string[] {
  const used = new Set<number>();
  const next = Array.from<string | null>({ length: after.length }).fill(null);
  after.forEach((value, i) => {
    if (i < before.length && same(before[i], value)) {
      next[i] = keys[i];
      used.add(i);
    }
  });
  // A changed cell whose value now sits elsewhere moved there; the nearest such old cell is the one that moved.
  after.forEach((value, i) => {
    if (next[i] !== null) return;
    let from = -1;
    before.forEach((old, j) => {
      if (!used.has(j) && same(old, value) && (from < 0 || Math.abs(j - i) < Math.abs(from - i))) from = j;
    });
    if (from >= 0) {
      next[i] = keys[from];
      used.add(from);
    }
  });
  // Whatever is left was written in place, keeping its cell, or is a new cell.
  return next.map((key, i) => {
    if (key !== null) return key;
    if (i < before.length && !used.has(i)) {
      used.add(i);
      return keys[i];
    }
    return fresh();
  });
}

function nextListKeys(
  list: ListName,
  keys: readonly string[],
  before: readonly Scalar[],
  after: readonly Scalar[],
  fresh: Fresh,
): string[] {
  // An output of fixed length is an array written in place (a heap, a result row): a swap must stay a swap of two cells.
  if (list === 'output' && before.length === after.length) return nextArrayKeys(keys, before, after, fresh);
  const positional = before.length === after.length ? after.filter((v, i) => same(v, before[i])).length : -1;
  const match = align(before, after, list !== 'queue');
  const aligned = match.filter((m) => m !== null).length;
  // Equal lengths are written in place unless aligning by value keeps more items.
  if (positional >= aligned) return after.map((_, i) => keys[i]);
  // An item out of order (a heap's swap) is the same item moved, not one item gone and another new.
  const used = new Set(match.filter((m) => m !== null));
  return match.map((m, i) => {
    if (m !== null) return keys[m];
    const from = before.findIndex((old, j) => !used.has(j) && same(old, after[i]));
    if (from < 0) return fresh();
    used.add(from);
    return keys[from];
  });
}

/**
 * The kept items that changed place, as [from, to] index pairs: those outside the longest run of kept items whose order
 * holds, so a push at the front or a pop never reads as everything moving.
 */
export function movedItems(before: readonly string[], after: readonly string[]): [number, number][] {
  const kept = new Set(after);
  const oldAt = new Map(before.map((key, i) => [key, i]));
  const stay = new Set(
    align(
      before.filter((key) => kept.has(key)),
      after.filter((key) => oldAt.has(key)),
      false,
    ).flatMap((m) => (m === null ? [] : [before.filter((key) => kept.has(key))[m]])),
  );
  // An item outside the run that kept its own index did not move (in [3, 1, 2] → [2, 1, 3], the 1).
  return after.flatMap((key, i) =>
    oldAt.has(key) && !stay.has(key) && oldAt.get(key) !== i ? [[oldAt.get(key)!, i] as [number, number]] : [],
  );
}

/** Keys for every frame of a run, each frame's following from the one before it. */
export function traceKeys(frames: readonly Frame[]): FrameKeys[] {
  let count = 0;
  const fresh = () => `k${count++}`;
  const out: FrameKeys[] = [];
  frames.forEach((frame, i) => {
    const prev = frames[i - 1];
    const prevKeys = out[i - 1];
    out.push(nextKeys(prev, prevKeys, frame, fresh));
  });
  return out;
}

/** The keys of `frame`, following on from `prev`'s keys when there is a previous frame. */
export function nextKeys(prev: Frame | undefined, prevKeys: FrameKeys | undefined, frame: Frame, fresh: Fresh): FrameKeys {
  const keys: FrameKeys = {};
  if (frame.array) {
    const before = prev?.array?.values;
    keys.array =
      before && prevKeys?.array ? nextArrayKeys(prevKeys.array, before, frame.array.values, fresh) : frame.array.values.map(fresh);
  }
  for (const list of LIST_NAMES) {
    const items = listItems(frame, list);
    if (!items) continue;
    const before = prev && listItems(prev, list);
    const old = prevKeys?.[list];
    keys[list] = before && old ? nextListKeys(list, old, before, items, fresh) : items.map(fresh);
  }
  return keys;
}

/** Keys for a pair of frames on their own, as when only two frames are compared. */
export function pairKeys(a: Frame, b: Frame): [FrameKeys, FrameKeys] {
  let count = 0;
  const fresh = () => `k${count++}`;
  const first = nextKeys(undefined, undefined, a, fresh);
  return [first, nextKeys(a, first, b, fresh)];
}
