import type { Point } from './geometry';

// A badge is 11px monospace text, about 0.6em per character, on lines 11px apart, broken at each '\n'.
const BADGE_CHAR_WIDTH = 6.6;
export const BADGE_LINE_HEIGHT = 11;
export const BADGE_HALF_HEIGHT = BADGE_LINE_HEIGHT / 2;
export const BADGE_ROOM = 2;
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

export const badgeLines = (badge: string) => badge.split('\n');

const sizeOf = (badge: string) => {
  const lines = badgeLines(badge);
  return {
    halfWidth: (Math.max(...lines.map((line) => line.length)) * BADGE_CHAR_WIDTH) / 2,
    halfHeight: (lines.length * BADGE_LINE_HEIGHT) / 2,
  };
};

export const badgeHalfWidth = (badge: string) => sizeOf(badge).halfWidth;

/** How far from its node's centre a badge reaches when it sits beside the node. */
export const besideReach = (badge: string) => BADGE_SIDE_GAP + 2 * badgeHalfWidth(badge);

/** The badge on two lines when it is longer than `maxLine` characters, broken at the space that leaves the longer line shortest. */
export function wrapBadge(badge: string, maxLine: number): string {
  if (badge.length <= maxLine) return badge;
  let wrapped = badge;
  let longest = badge.length;
  for (let space = badge.indexOf(' '); space >= 0; space = badge.indexOf(' ', space + 1)) {
    const longer = Math.max(space, badge.length - space - 1);
    if (longer < longest) [wrapped, longest] = [`${badge.slice(0, space)}\n${badge.slice(space + 1)}`, longer];
  }
  return wrapped;
}

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
  const sizes = nodes.map(({ badge }) => sizeOf(badge ?? ''));
  const nodeBox = ({ x, y }: Point): Box => ({ left: x - radius, right: x + radius, top: y - radius, bottom: y + radius });
  const badgeBox = (i: number, { x, y }: Point, room: number): Box => {
    const halfWidth = sizes[i].halfWidth + room;
    const halfHeight = sizes[i].halfHeight + room;
    return { left: x - halfWidth, right: x + halfWidth, top: y - halfHeight, bottom: y + halfHeight };
  };
  const crosses = (points: readonly Point[], box: Box) => points.slice(1).some((point, k) => segmentCrosses(points[k], point, box));
  // A badge of several lines grows away from its node, so the line nearest the node sits where a one-line badge would.
  const at = (i: number, { dy, side }: Spot): Point => ({
    x: side ? nodes[i].x + side * (sizes[i].halfWidth + BADGE_SIDE_GAP) : nodes[i].x,
    y: nodes[i].y + dy + Math.sign(dy) * (sizes[i].halfHeight - BADGE_HALF_HEIGHT),
  });
  const centres = nodes.map((n, i) => at(i, spotsOf(n)[0]));
  let settled = true;
  const place = (i: number) => {
    if (!nodes[i].badge) return;
    const taken = nodes.flatMap((o, j) => (j === i ? [] : [nodeBox(o), ...(o.badge ? [badgeBox(j, centres[j], 0)] : [])]));
    const clear = (centre: Point, room: number) => {
      const box = badgeBox(i, centre, room);
      return !lines.some((points) => crosses(points, box)) && !taken.some((other) => overlaps(box, other));
    };
    const candidates = spotsOf(nodes[i])
      .map((spot) => at(i, spot))
      .filter((centre) => inside(badgeBox(i, centre, 0), bounds));
    const leastBadSpot = () =>
      candidates
        .map((centre) => {
          const box = badgeBox(i, centre, 0);
          return {
            centre,
            lines: lines.filter((points) => crosses(points, box)).length,
            covered: taken.filter((other) => overlaps(box, other)).length,
          };
        })
        .sort((a, b) => a.lines - b.lines || a.covered - b.covered)[0]?.centre;
    const clearSpot = candidates.find((c) => clear(c, BADGE_ROOM)) ?? candidates.find((c) => clear(c, 0));
    settled &&= clearSpot !== undefined;
    centres[i] = clearSpot ?? (leastBad ? leastBadSpot() : undefined) ?? centres[i];
  };
  nodes.forEach((_, i) => place(i));
  // A least bad spot can cover a badge placed before it, so every badge takes a second turn against where the others ended up.
  if (leastBad && !settled) nodes.forEach((_, i) => place(i));
  return centres;
}
