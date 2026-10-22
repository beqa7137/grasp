export interface Point {
  x: number;
  y: number;
}

/** A cubic from the source's right side to the target's left side, the shape of a link being dragged. */
export function curve(x1: number, y1: number, x2: number, y2: number) {
  const dx = Math.max(40, Math.abs(x2 - x1) / 2);
  return `M ${x1} ${y1} C ${x1 + dx} ${y1}, ${x2 - dx} ${y2}, ${x2} ${y2}`;
}
