export interface Box {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** A region an experiment points at: an outline inside the stage, and its "Look here" tag on or beside its edge. */
export interface Focus<Id extends string = string> extends Box {
  id: Id;
  /** The tag's top left, inside the stage. */
  tag: { x: number; y: number };
}

/** The "Look here" tag's size. */
export const TAG = { width: 60, height: 16 };

export const pad = (b: Box, by: number): Box => ({ x: b.x - by, y: b.y - by, width: b.width + 2 * by, height: b.height + 2 * by });

export const union = (boxes: readonly Box[]): Box => {
  const x = Math.min(...boxes.map((b) => b.x));
  const y = Math.min(...boxes.map((b) => b.y));
  return {
    x,
    y,
    width: Math.max(...boxes.map((b) => b.x + b.width)) - x,
    height: Math.max(...boxes.map((b) => b.y + b.height)) - y,
  };
};

export const overlaps = (a: Box, b: Box) => a.x < b.x + b.width && b.x < a.x + a.width && a.y < b.y + b.height && b.y < a.y + a.height;

/** A box kept 1px inside the stage, so its outline never clips. */
const inside = (b: Box, width: number, height: number): Box => {
  const x = Math.max(1, b.x);
  const y = Math.max(1, b.y);
  return { x, y, width: Math.min(width - 1, b.x + b.width) - x, height: Math.min(height - 1, b.y + b.height) - y };
};

/**
 * Where a region's "Look here" tag goes: on or just outside a corner of its outline, the first place inside the stage
 * that covers no text or mark, so the tag never hides what it points at.
 */
function placeTag(f: Box, taken: readonly Box[], tags: readonly Box[], width: number, height: number) {
  const { width: w, height: h } = TAG;
  const across = Array.from({ length: Math.floor((f.width - w) / 8) + 1 }, (_, i) => f.x + 4 + 8 * i);
  const xs = [f.x + f.width - w - 4, f.x + 4, ...across, f.x - w - 2, f.x + f.width + 2];
  const edges = [f.y - h / 2, f.y + f.height - h / 2, f.y - h - 1, f.y + f.height + 1];
  const rows = Array.from({ length: Math.floor((f.height - h) / 8) + 1 }, (_, i) => f.y + 2 + 8 * i);
  const candidates = [...edges, ...rows].flatMap((y) => xs.map((x) => ({ x, y })));
  const fits = (boxes: readonly Box[]) => (c: { x: number; y: number }) =>
    c.x >= 1 && c.y >= 1 && c.x + w <= width - 1 && c.y + h <= height - 1 && !boxes.some((t) => overlaps({ ...c, width: w, height: h }, t));
  // Clear of the other tags too if there is room; text always wins.
  return candidates.find(fits([...taken, ...tags])) ?? candidates.find(fits(taken)) ?? candidates[0];
}

/** Each region's outline, kept inside the stage, with its tag placed clear of every box in `taken` and of the other tags. */
export function focusBoxes<Id extends string>(
  outlines: readonly [Id, Box][],
  taken: readonly Box[],
  width: number,
  height: number,
): Focus<Id>[] {
  // Two regions can show at once, so each tag also keeps clear of the tags placed before it.
  const tags: Box[] = [];
  return outlines.map(([id, b]) => {
    const kept = inside(b, width, height);
    const tag = placeTag(kept, taken, tags, width, height);
    tags.push({ ...tag, ...TAG });
    return { id, ...kept, tag };
  });
}
