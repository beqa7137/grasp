export interface Point {
  x: number;
  y: number;
}

/** A cubic from the source's right side to the target's left side, the shape of a link being dragged. */
export function curve(x1: number, y1: number, x2: number, y2: number) {
  const dx = Math.max(40, Math.abs(x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}

/**
 * The path of a connection between two node centres on a board `floor` units tall. Traffic flows left to right, so a
 * target to the right gets the usual curve; one in the same column is joined top to bottom, and one to the left by a
 * loop under both nodes, instead of a curve that leaves the right side and doubles back across the board.
 */
export function edgePath(a: Point, b: Point, size: { w: number; h: number }, floor: number): string {
  const { w, h } = size;
  const gap = b.x - a.x;
  if (gap >= w) return curve(a.x + w / 2, a.y, b.x - w / 2, b.y);
  if (Math.abs(gap) < w) {
    const down = b.y >= a.y ? 1 : -1;
    const y1 = a.y + (down * h) / 2;
    const y2 = b.y - (down * h) / 2;
    const bend = down * Math.max(24, Math.abs(y2 - y1) / 2);
    return `M ${a.x} ${y1} C ${a.x} ${y1 + bend}, ${b.x} ${y2 - bend}, ${b.x} ${y2}`;
  }
  const y1 = a.y + h / 2;
  const y2 = b.y + h / 2;
  const depth = Math.min(floor, Math.max(y1, y2) + 50);
  return `M ${a.x} ${y1} C ${a.x} ${depth}, ${b.x} ${depth}, ${b.x} ${y2}`;
}
