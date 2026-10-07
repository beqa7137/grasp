/** The native range thumb's width, which the ticks, the bands and pointer positions all reckon with. */
export const THUMB = 16;
/** How far past an unanswered checkpoint a drag goes before it skips it (REDESIGN.md 3.7). */
export const HOLD_PX = 24;

/** Where the thumb's centre sits for `value` on a track `width` wide, as the native range draws it. */
export function tickX(value: number, max: number, width: number): number {
  return THUMB / 2 + (max > 0 ? value / max : 0) * (width - THUMB);
}

/** The value under a pointer at `x`. */
export function valueAt(x: number, max: number, width: number): number {
  const span = width - THUMB;
  return span > 0 ? Math.round(Math.min(1, Math.max(0, (x - THUMB / 2) / span)) * max) : 0;
}

/** A drag in progress: the value it shows, and the unanswered checkpoint it is holding with the pointer's x when it began to. */
export interface Drag {
  value: number;
  holding: number | null;
  holdX: number;
}

/** What one pointer position does to a drag: where it lands, which checkpoint it skipped, and whether it began a hold. */
export interface DragStep {
  drag: Drag;
  skipped: number | null;
  held: boolean;
}

/**
 * The scrub guard: dragging forward onto an unanswered checkpoint holds the timeline there until the pointer has gone 24px
 * further, which skips it. A hold always begins at the first unanswered checkpoint the drag crosses, and the 24px count from
 * where it began, so a fast fling skips at most one checkpoint per 24px however close they sit. Dragging back never holds.
 */
export function dragTo(drag: Drag, x: number, max: number, width: number, unanswered: (value: number) => boolean): DragStep {
  const target = valueAt(x, max, width);
  let { value, holding, holdX } = drag;
  let skipped: number | null = null;
  if (holding !== null) {
    if (target < holding) return { drag: { value: target, holding: null, holdX: 0 }, skipped, held: false };
    if (x - holdX < HOLD_PX) return { drag, skipped, held: false };
    skipped = holding;
    value = holding;
    holding = null;
  }
  if (target <= value) return { drag: { value: target, holding: null, holdX: 0 }, skipped, held: false };
  for (let v = value + 1; v <= target; v++) {
    if (!unanswered(v)) continue;
    const from = skipped === null ? Math.max(x, tickX(v, max, width)) : x;
    return { drag: { value: v, holding: v, holdX: from }, skipped, held: true };
  }
  return { drag: { value: target, holding: null, holdX: 0 }, skipped, held: false };
}
