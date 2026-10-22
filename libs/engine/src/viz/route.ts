/** A point in board units. */
export type RoutePoint = readonly [number, number];

/** A node's box, by its center and size. */
export interface RouteBox {
  id: string;
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface RouteEdge {
  from: string;
  to: string;
}

export interface RoutedEdge {
  from: string;
  to: string;
  /** Elbows when a clear lane exists, else the curve the board drew before routing. */
  kind: 'elbow' | 'curve';
  /** The polyline (elbow corners, or the curve sampled), for traveling dots. */
  points: RoutePoint[];
  d: string;
  /** Where a label sits: the middle of the longest straight run, or of the curve. */
  mid: RoutePoint;
}

export interface RouteOptions {
  /** How far a lane keeps from any other node. */
  clearance?: number;
  /** Corner radius of an elbow. */
  radius?: number;
  /** The board's bottom edge: a curve looping under nodes never drops past it. */
  floor?: number;
  /** Where a route may run: an elbow leaving it is not taken. */
  bounds?: { x0: number; y0: number; x1: number; y1: number };
}

interface Seg {
  a: RoutePoint;
  b: RoutePoint;
}

const LANE_STEP = 12;

/**
 * Orthogonal routes (REDESIGN.md 4.6) for edges between boxes, traffic flowing left to right. Each edge tries elbow
 * candidates in order and takes the first whose segments cross no other box (inflated by `clearance`) and whose lane
 * runs over no lane already taken; with none clear it falls back to a curve. Greedy and order dependent, which a board of
 * at most a few dozen nodes never notices.
 */
export function routeEdges(boxes: readonly RouteBox[], edges: readonly RouteEdge[], options: RouteOptions = {}): RoutedEdge[] {
  const clearance = options.clearance ?? 10;
  const radius = options.radius ?? 10;
  const floor = options.floor ?? Number.POSITIVE_INFINITY;
  const byId = new Map(boxes.map((b) => [b.id, b]));
  const lanes: Seg[] = [];
  const out: RoutedEdge[] = [];
  const bounds = options.bounds;
  /** Where routed edges leave and enter each node, so no edge enters at a point another leaves from. */
  const ports: { node: string; at: RoutePoint; out: boolean }[] = [];
  const near = (p: RoutePoint, q: RoutePoint) => Math.abs(p[0] - q[0]) < 2 && Math.abs(p[1] - q[1]) < 2;
  for (const e of edges) {
    const a = byId.get(e.from);
    const b = byId.get(e.to);
    if (!a || !b) continue;
    const obstacles = boxes.filter((o) => o.id !== a.id && o.id !== b.id);
    const clear = (points: RoutePoint[]) => segments(points).every((s) => obstacles.every((o) => !crosses(s, o, clearance)));
    const free = (points: RoutePoint[]) => middle(points).every((s) => lanes.every((l) => !overlaps(s, l)));
    const inside = (points: RoutePoint[]) =>
      !bounds || points.every(([x, y]) => x >= bounds.x0 && x <= bounds.x1 && y >= bounds.y0 && y <= bounds.y1);
    const ported = (points: RoutePoint[]) =>
      ports.every(
        (p) =>
          !(p.node === a.id && !p.out && near(p.at, points[0])) && !(p.node === b.id && p.out && near(p.at, points[points.length - 1])),
      );
    const route = candidates(a, b, clearance).find((p) => clear(p) && free(p) && inside(p) && ported(p));
    if (route) {
      lanes.push(...middle(route));
      ports.push({ node: a.id, at: route[0], out: true }, { node: b.id, at: route[route.length - 1], out: false });
      out.push({ from: e.from, to: e.to, kind: 'elbow', points: route, d: roundedPath(route, radius), mid: longestMid(route) });
    } else {
      const c = curveBetween(a, b, floor);
      out.push({ from: e.from, to: e.to, kind: 'curve', points: sampleCubic(c), d: cubicPath(c), mid: cubicAt(c, 0.5) });
    }
  }
  return out;
}

const right = (b: RouteBox) => b.x + b.w / 2;
const left = (b: RouteBox) => b.x - b.w / 2;
const top = (b: RouteBox) => b.y - b.h / 2;
const bottom = (b: RouteBox) => b.y + b.h / 2;

/** Elbow candidates from `a` to `b`, best first. */
export function candidates(a: RouteBox, b: RouteBox, clearance: number): RoutePoint[][] {
  const out: RoutePoint[][] = [];
  const gap = left(b) - right(a);
  const start: RoutePoint = [right(a), a.y];
  if (gap >= 2 * clearance) {
    if (Math.abs(a.y - b.y) < 1) out.push([start, [left(b), a.y]]);
    else for (const x of laneOffsets(right(a) + clearance, left(b) - clearance)) out.push([start, [x, a.y], [x, b.y], [left(b), b.y]]);
  }
  // Across, then down or up into the target's top or bottom: only when the target sits clear above or below the source's
  // row, or the route would run through the target itself.
  if (b.x > right(a) + clearance && Math.abs(a.y - b.y) >= b.h / 2 + clearance) {
    out.push([start, [b.x, a.y], b.y < a.y ? [b.x, bottom(b)] : [b.x, top(b)]]);
  }
  if (gap >= 2 * clearance) return out;
  if (Math.abs(b.x - a.x) < (a.w + b.w) / 2) {
    const down = b.y > a.y;
    const from: RoutePoint = [a.x, down ? bottom(a) : top(a)];
    const end: RoutePoint = [b.x, down ? top(b) : bottom(b)];
    if (Math.abs(a.x - b.x) < 1) out.push([from, [a.x, end[1]]]);
    else
      for (const y of laneOffsets(Math.min(from[1], end[1]) + clearance, Math.max(from[1], end[1]) - clearance))
        out.push([from, [a.x, y], [b.x, y], end]);
    return out;
  }
  // A target to the left (or overlapping in x): loop under both boxes, else over them.
  const under = Math.max(bottom(a), bottom(b)) + 2 * clearance;
  const over = Math.min(top(a), top(b)) - 2 * clearance;
  for (let step = 0; step < 4; step++) {
    out.push([
      [a.x, bottom(a)],
      [a.x, under + step * LANE_STEP],
      [b.x, under + step * LANE_STEP],
      [b.x, bottom(b)],
    ]);
    out.push([
      [a.x, top(a)],
      [a.x, over - step * LANE_STEP],
      [b.x, over - step * LANE_STEP],
      [b.x, top(b)],
    ]);
  }
  return out;
}

/** Lane positions between `lo` and `hi`: the middle first, then outward a step at a time. */
function laneOffsets(lo: number, hi: number): number[] {
  if (hi < lo) return [];
  const mid = Math.round((lo + hi) / 2);
  const out = [mid];
  for (let k = 1; mid - k * LANE_STEP >= lo || mid + k * LANE_STEP <= hi; k++) {
    if (mid - k * LANE_STEP >= lo) out.push(mid - k * LANE_STEP);
    if (mid + k * LANE_STEP <= hi) out.push(mid + k * LANE_STEP);
  }
  return out;
}

function segments(points: readonly RoutePoint[]): Seg[] {
  return points.slice(1).map((b, i) => ({ a: points[i], b }));
}

/** The lane of a route: its inner segments, which edges from or into the same port do not share. */
function middle(points: readonly RoutePoint[]): Seg[] {
  return points.length > 3 ? segments(points).slice(1, -1) : [];
}

/** Whether an axis-aligned segment passes through a box grown by `pad` on every side. */
export function crosses(s: Seg, box: RouteBox, pad: number): boolean {
  const x0 = Math.min(s.a[0], s.b[0]);
  const x1 = Math.max(s.a[0], s.b[0]);
  const y0 = Math.min(s.a[1], s.b[1]);
  const y1 = Math.max(s.a[1], s.b[1]);
  return x1 > left(box) - pad && x0 < right(box) + pad && y1 > top(box) - pad && y0 < bottom(box) + pad;
}

/** Two lanes on one line (within 4 units) that share more than 4 units of it. */
function overlaps(s: Seg, t: Seg): boolean {
  const vertical = (g: Seg) => Math.abs(g.a[0] - g.b[0]) < 0.5;
  if (vertical(s) !== vertical(t)) return false;
  const axis = vertical(s) ? 0 : 1;
  const along = 1 - axis;
  if (Math.abs(s.a[axis] - t.a[axis]) > 4) return false;
  const lo = Math.max(Math.min(s.a[along], s.b[along]), Math.min(t.a[along], t.b[along]));
  const hi = Math.min(Math.max(s.a[along], s.b[along]), Math.max(t.a[along], t.b[along]));
  return hi - lo > 4;
}

/** A polyline with each corner rounded by up to `radius`, never more than half of either run beside it. */
export function roundedPath(points: readonly RoutePoint[], radius: number): string {
  let d = `M ${points[0][0]} ${points[0][1]}`;
  for (let i = 1; i < points.length - 1; i++) {
    const [p, c, n] = [points[i - 1], points[i], points[i + 1]];
    const lin = Math.hypot(c[0] - p[0], c[1] - p[1]);
    const lout = Math.hypot(n[0] - c[0], n[1] - c[1]);
    const r = Math.min(radius, lin / 2, lout / 2);
    const before: RoutePoint = [c[0] + ((p[0] - c[0]) / (lin || 1)) * r, c[1] + ((p[1] - c[1]) / (lin || 1)) * r];
    const after: RoutePoint = [c[0] + ((n[0] - c[0]) / (lout || 1)) * r, c[1] + ((n[1] - c[1]) / (lout || 1)) * r];
    d += ` L ${round(before[0])} ${round(before[1])} Q ${c[0]} ${c[1]} ${round(after[0])} ${round(after[1])}`;
  }
  const last = points[points.length - 1];
  return `${d} L ${last[0]} ${last[1]}`;
}

function longestMid(points: readonly RoutePoint[]): RoutePoint {
  let best = segments(points)[0];
  for (const s of segments(points))
    if (Math.hypot(s.b[0] - s.a[0], s.b[1] - s.a[1]) > Math.hypot(best.b[0] - best.a[0], best.b[1] - best.a[1])) best = s;
  return [(best.a[0] + best.b[0]) / 2, (best.a[1] + best.b[1]) / 2];
}

type Cubic = readonly [RoutePoint, RoutePoint, RoutePoint, RoutePoint];

/**
 * The curve the board drew before routing: from the source's right side to the target's left; top to bottom within a
 * column; and a loop under both nodes (never past `floor`) for a target to the left.
 */
export function curveBetween(a: RouteBox, b: RouteBox, floor: number): Cubic {
  const gap = b.x - a.x;
  if (gap >= (a.w + b.w) / 2) {
    const [x1, y1, x2, y2] = [right(a), a.y, left(b), b.y];
    const dx = Math.max(40, Math.abs(x2 - x1) / 2);
    return [
      [x1, y1],
      [x1 + dx, y1],
      [x2 - dx, y2],
      [x2, y2],
    ];
  }
  if (Math.abs(gap) < (a.w + b.w) / 2) {
    const down = b.y >= a.y ? 1 : -1;
    const y1 = down > 0 ? bottom(a) : top(a);
    const y2 = down > 0 ? top(b) : bottom(b);
    const bend = down * Math.max(24, Math.abs(y2 - y1) / 2);
    return [
      [a.x, y1],
      [a.x, y1 + bend],
      [b.x, y2 - bend],
      [b.x, y2],
    ];
  }
  const depth = Math.min(floor, Math.max(bottom(a), bottom(b)) + 50);
  return [
    [a.x, bottom(a)],
    [a.x, depth],
    [b.x, depth],
    [b.x, bottom(b)],
  ];
}

function cubicAt(c: Cubic, t: number): RoutePoint {
  const u = 1 - t;
  const k = [u * u * u, 3 * u * u * t, 3 * u * t * t, t * t * t];
  return [round(k.reduce((s, w, i) => s + w * c[i][0], 0)), round(k.reduce((s, w, i) => s + w * c[i][1], 0))];
}

function sampleCubic(c: Cubic, n = 16): RoutePoint[] {
  return Array.from({ length: n + 1 }, (_, i) => cubicAt(c, i / n));
}

function cubicPath(c: Cubic): string {
  return `M ${c[0][0]} ${c[0][1]} C ${c[1][0]} ${c[1][1]}, ${c[2][0]} ${c[2][1]}, ${c[3][0]} ${c[3][1]}`;
}

const round = (v: number) => Math.round(v * 10) / 10;
