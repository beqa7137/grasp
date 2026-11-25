import type { DurabilityPlan } from '@grasp/engine';
import type { LiveGeometry } from './durability-draw';

/**
 * The play's clock at its last moment: the latest event at or before `clock` seconds. The stage redraws only when this
 * changes; the window's fill, the free disk's, the playhead and the read dots move every frame by transform.
 */
export function momentOf(plan: DurabilityPlan, clock: number): number {
  let at = 0;
  for (const e of plan.events) if (e.at <= clock + 1e-9 && e.at > at) at = e.at;
  return at;
}

/** Under Reduced motion, Play's three moments: the failure, mid-repair, and the play's end (the rest state). */
export const stepTau = (plan: DurabilityPlan, k: number): number | null =>
  [plan.fail + 0.05, plan.winStart + plan.win * 0.55, null][k] ?? null;

/** A read dot's laps a second: each source's dot runs its stub, the bus and the riser, offset so they never bunch. */
const LAPS = 0.9;
const OFFSET = 0.13;

function along(points: readonly (readonly [number, number])[], f: number): [number, number] {
  const lens = points.slice(1).map((p, i) => Math.hypot(p[0] - points[i][0], p[1] - points[i][1]));
  let d = f * lens.reduce((a, b) => a + b, 0);
  for (let k = 0; k < lens.length; k++) {
    if (d <= lens[k] || k === lens.length - 1) {
      const t = lens[k] ? Math.min(1, d / lens[k]) : 0;
      const [a, b] = [points[k], points[k + 1]];
      return [Math.round((a[0] + (b[0] - a[0]) * t) * 10) / 10, Math.round((a[1] + (b[1] - a[1]) * t) * 10) / 10];
    }
    d -= lens[k];
  }
  return [points[0][0], points[0][1]];
}

export interface LiveMarks {
  band: { x: number; y: number; w: number; h: number; scale: number } | null;
  disk: { x: number; y: number; w: number; h: number; scale: number } | null;
  playhead: { x: number; y0: number; y1: number; y2: number; y3: number } | null;
  dots: { id: string; x: number; y: number }[];
}

/**
 * Where a running play's continuous marks are at `clock` seconds, with the window's `progress` (0 to 1): the window and
 * the free disk fill together, the playhead runs only inside the window, and one dot a source travels the reads. At
 * most one dot a source, so the count is the scheme's, never the clock's.
 */
export function liveMarks(geo: LiveGeometry, progress: number, clock: number): LiveMarks {
  const running = progress > 0 && progress < 1;
  const phase = (clock * LAPS) % 1;
  return {
    band: geo.band && progress > 0 ? { ...geo.band, scale: progress } : null,
    disk: geo.disk && progress > 0 ? { ...geo.disk, scale: progress } : null,
    playhead:
      geo.band && geo.playhead && running ? { x: Math.round((geo.band.x + geo.band.w * progress) * 10) / 10, ...geo.playhead } : null,
    dots: running
      ? geo.reads.map((r, j) => {
          const [x, y] = along(r.points, (phase + j * OFFSET) % 1);
          return { id: r.id, x, y };
        })
      : [],
  };
}
