import { cubic } from './latency-draw';
import type { Box, Route, StageMeta } from './cdn-draw';
import type { Who } from './cdn-words';

/** A play runs the timeline's five TTLs in this many seconds, on one monotone clock. */
export const PLAY_SECONDS = 6;
/** How long a miss's particle rides, as a share of the clock. */
export const RIDE = 0.06;

/** The particle's way: column 0's stream along its own center line, then across the shield and down the trunk. */
export function routePoints(route: Route, where: 'shield' | 'origin'): [number, number][] {
  const { a, c1, c2, b } = route.stream;
  const pts = cubic(a, c1, c2, b);
  if (route.shield) {
    pts.push([b[0], route.shieldY]);
    if (where === 'origin') pts.push([route.originX, route.shieldY], [route.originX, route.originY]);
  } else pts.push([b[0], route.originY]);
  return pts;
}

/** The point a share `f` of the way along a polyline, at even speed by length. */
export function along(pts: readonly (readonly [number, number])[], f: number): [number, number] {
  const seg = pts.slice(1).map((p, i) => Math.hypot(p[0] - pts[i][0], p[1] - pts[i][1]));
  let d = Math.max(0, Math.min(1, f)) * seg.reduce((x, y) => x + y, 0);
  for (let i = 0; i < seg.length; i++) {
    if (d <= seg[i] || i === seg.length - 1) {
      const k = seg[i] ? Math.min(1, d / seg[i]) : 0;
      return [pts[i][0] + (pts[i + 1][0] - pts[i][0]) * k, pts[i][1] + (pts[i + 1][1] - pts[i][1]) * k];
    }
    d -= seg[i];
  }
  return [pts[pts.length - 1][0], pts[pts.length - 1][1]];
}

/** The playhead's x at clock `frac`. */
export const playheadX = (meta: StageMeta, frac: number) =>
  Math.round((meta.timeline.x0 + meta.timeline.iw * Math.max(0, Math.min(1, frac))) * 10) / 10;

/**
 * The particle at clock `frac`: the newest miss at the outlined location rides its route for `RIDE` of the clock after
 * its moment, and never before it; null when no miss is riding or the flows are hidden.
 */
export function particleAt(meta: StageMeta, frac: number): { x: number; y: number } | null {
  if (!meta.route) return null;
  const W = meta.timeline.window;
  const t = frac * W;
  let last = null;
  for (const e of meta.events) {
    if (e.at > t) break;
    if (!e.hit && t - e.at < RIDE * W) last = e;
  }
  if (!last || last.where === 'edge') return null;
  const [x, y] = along(routePoints(meta.route, last.where), (t - last.at) / (RIDE * W));
  return { x: Math.round(x * 10) / 10, y: Math.round(y * 10) / 10 };
}

/**
 * What a play lights at clock `frac`: the path of the newest request within `RIDE` of the clock, a hit's (the
 * outlined cell and the edge row) or a miss's (the cell, the boxes it travels through and its row). Between requests a
 * lane too busy to draw its hits keeps the edge lit; null while the flows are hidden.
 */
export function litAt(meta: StageMeta, frac: number): { where: Who; boxes: Box[]; row: Box } | null {
  const lit = meta.lit;
  if (!lit) return null;
  const W = meta.timeline.window;
  const t = frac * W;
  let last = null;
  for (const e of meta.events) {
    if (e.at > t) break;
    if (t - e.at < RIDE * W) last = e;
  }
  const where: Who | null = last ? last.where : meta.dense.some((d) => d.lane) ? 'edge' : null;
  if (!where) return null;
  const boxes = [lit.cell, ...(where !== 'edge' && lit.shield ? [lit.shield] : []), ...(where === 'origin' ? [lit.origin] : [])];
  return { where, boxes, row: lit.rows[where] };
}
