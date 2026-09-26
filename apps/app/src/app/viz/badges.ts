import type { Point } from './geometry';

// A badge is one line of 11px monospace text, about 0.6em per character.
const BADGE_CHAR_WIDTH = 6.6;
export const BADGE_HALF_HEIGHT = 5.5;
const BADGE_ROOM = 2;
const BADGE_SIDE_GAP = 2;
const UNBOUNDED = { left: -Infinity, right: Infinity, top: -Infinity, bottom: Infinity };

interface Box {
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

/** How far from its node's centre a badge of this many characters reaches when it sits beside the node. */
export const besideReach = (chars: number) => BADGE_SIDE_GAP + chars * BADGE_CHAR_WIDTH;

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
 * and it covers no other node or badge; a spot with room to spare around the badge wins over one a line only just misses. With no
 * such spot it stays at its first, or with `leastBad` takes the spot in bounds crossing the fewest lines, then covering the fewest
 * nodes and badges. Badges are placed one at a time against where the others sit, so a move to a clear spot never lands on one.
 */
export function placeBadges<N extends Badged>(
  nodes: readonly N[],
  lines: readonly Point[][],
  radius: number,
  spotsOf: (node: N) => readonly Spot[],
  { bounds = UNBOUNDED, leastBad = false }: { bounds?: Box; leastBad?: boolean } = {},
): Point[] {
  const nodeBox = ({ x, y }: Point): Box => ({ left: x - radius, right: x + radius, top: y - radius, bottom: y + radius });
  const crosses = (points: readonly Point[], box: Box) => points.slice(1).some((point, k) => segmentCrosses(points[k], point, box));
  const at = (n: Badged, { dy, side }: Spot): Point => ({
    x: side ? n.x + side * (halfWidthOf(n.badge ?? '') + BADGE_SIDE_GAP) : n.x,
    y: n.y + dy,
  });
  const centres = nodes.map((n) => at(n, spotsOf(n)[0]));
  let settled = true;
  const place = (i: number) => {
    const n = nodes[i];
    const { badge } = n;
    if (!badge) return;
    const taken = nodes.flatMap((o, j) => (j === i ? [] : [nodeBox(o), ...(o.badge ? [badgeBox(o.badge, centres[j], 0)] : [])]));
    const clear = (centre: Point, room: number) => {
      const box = badgeBox(badge, centre, room);
      return !lines.some((points) => crosses(points, box)) && !taken.some((other) => overlaps(box, other));
    };
    const leastBadOf = (options: Point[]) =>
      options
        .map((centre) => {
          const box = badgeBox(badge, centre, 0);
          return {
            centre,
            lines: lines.filter((points) => crosses(points, box)).length,
            covered: taken.filter((other) => overlaps(box, other)).length,
          };
        })
        .sort((a, b) => a.lines - b.lines || a.covered - b.covered)[0]?.centre;
    const candidates = spotsOf(n)
      .map((spot) => at(n, spot))
      .filter((centre) => inside(badgeBox(badge, centre, 0), bounds));
    const clearSpot = candidates.find((c) => clear(c, BADGE_ROOM)) ?? candidates.find((c) => clear(c, 0));
    settled &&= clearSpot !== undefined;
    centres[i] = clearSpot ?? (leastBad ? leastBadOf(candidates) : undefined) ?? centres[i];
  };
  nodes.forEach((_, i) => place(i));
  // A least bad spot can cover a badge placed before it, so every badge takes a second turn against where the others ended up.
  if (leastBad && !settled) nodes.forEach((_, i) => place(i));
  return centres;
}
