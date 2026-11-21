export interface Span {
  top: number;
  bottom: number;
}

/**
 * A scroll of `by` px (positive carries the content up), cut short where it would carry a kept box past the edge of
 * `view` that it moves toward. A box already past that edge holds nothing back.
 */
export function scrollKeeping(by: number, view: Span, keep: readonly Span[]): number {
  let d = by;
  for (const box of keep) {
    if (d > 0 && box.bottom > view.top) d = Math.min(d, Math.max(0, box.top - view.top));
    if (d < 0 && box.top < view.bottom) d = Math.max(d, Math.min(0, box.bottom - view.bottom));
  }
  return d;
}
