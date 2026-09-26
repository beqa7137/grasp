import type { Point } from './geometry';

// A badge is one line of 11px monospace text, about 0.6em per character.
const BADGE_CHAR_WIDTH = 6.6;
export const BADGE_HALF_HEIGHT = 5.5;
const BADGE_ROOM = 2;
const BADGE_SIDE_GAP = 2;

export interface Box {
  left: number;
  right: number;
  top: number;
  bottom: number;
}

export interface Badged extends Point {
  badge?: string;
}

/** Where a badge may sit: `dy` from its node's centre, and centred on the node or beside it on one `side`. */
export interface Spot {
  dy: number;
  side?: -1 | 1;
}

/** Liang–Barsky clipping: the segment crosses the box when the stretch of it inside all four sides is not empty. */
function segmentCrosses(a: Point, b: Point, box: Box): boolean {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const sides: [number, number][] = [
    [-dx, a.x - box.left],
    [dx, box.right - a.x],
    [-dy, a.y - box.top],
    [dy, box.bottom - a.y],
  ];
  let enter = 0;
  let exit = 1;
  for (const [p, q] of sides) {
    if (p === 0 && q < 0) return false;
    if (p < 0) enter = Math.max(enter, q / p);
    if (p > 0) exit = Math.min(exit, q / p);
  }
  return enter <= exit;
}

const halfWidthOf = (badge: string) => (badge.length * BADGE_CHAR_WIDTH) / 2;

const badgeBox = (badge: string, { x, y }: Point, room: number): Box => {
  const halfWidth = halfWidthOf(badge) + room;
  const halfHeight = BADGE_HALF_HEIGHT + room;
  return { left: x - halfWidth, right: x + halfWidth, top: y - halfHeight, bottom: y + halfHeight };
};

const inside = (box: Box, bounds: Box) =>
  box.left >= bounds.left && box.right <= bounds.right && box.top >= bounds.top && box.bottom <= bounds.bottom;

const overlaps = (a: Box, b: Box) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom;

/**
 * The centre of each node's badge. A badge takes the first of its node's spots where it stays in bounds, no line runs through it
 * and it covers no other node or badge, else stays at the first spot. A spot with room to spare around the badge wins over
 * one a line only just misses. Badges are placed one at a time against where the others sit, so a move never lands on one.
 */
export function placeBadges<N extends Badged>(
  nodes: readonly N[],
  lines: readonly Point[][],
  radius: number,
  spotsOf: (node: N) => readonly Spot[],
  bounds: Box = { left: -Infinity, right: Infinity, top: -Infinity, bottom: Infinity },
): Point[] {
  const nodeBox = ({ x, y }: Point): Box => ({ left: x - radius, right: x + radius, top: y - radius, bottom: y + radius });
  const crossesLine = (box: Box) => lines.some((points) => points.slice(1).some((point, k) => segmentCrosses(points[k], point, box)));
  const at = (n: Badged, { dy, side }: Spot): Point => ({
    x: side ? n.x + side * (halfWidthOf(n.badge ?? '') + BADGE_SIDE_GAP) : n.x,
    y: n.y + dy,
  });
  const centres = nodes.map((n) => at(n, spotsOf(n)[0]));
  nodes.forEach((n, i) => {
    const { badge } = n;
    if (!badge) return;
    const taken = nodes.flatMap((o, j) => (j === i ? [] : [nodeBox(o), ...(o.badge ? [badgeBox(o.badge, centres[j], 0)] : [])]));
    const clear = (centre: Point, room: number) => {
      const box = badgeBox(badge, centre, room);
      return inside(badgeBox(badge, centre, 0), bounds) && !crossesLine(box) && !taken.some((other) => overlaps(box, other));
    };
    const candidates = spotsOf(n).map((spot) => at(n, spot));
    centres[i] = candidates.find((c) => clear(c, BADGE_ROOM)) ?? candidates.find((c) => clear(c, 0)) ?? centres[i];
  });
  return centres;
}
