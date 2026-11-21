import { RELIABILITY_WEEKS, type YearPlayPlan } from '@grasp/engine';
import { r1 } from './latency-draw';
import type { YearGeometry } from './reliability-layout';

/** The playhead stands this far past a held tick's center (and half a tick at least), so the tick stands clear of it. */
export const PLAYHEAD_CLEAR = 2.5;

/**
 * The playhead's x at `weeks` of a play: the clock's position on the year, but never on a held column's marks, so at a
 * hold it stands just past the tick it holds on.
 */
export function playheadX(yr: YearGeometry, plan: YearPlayPlan, weeks: number): number {
  let x = yr.tx0 + (weeks / RELIABILITY_WEEKS) * (yr.tx1 - yr.tx0);
  for (const h of plan.holds) if (h.week + 1 <= weeks + 1e-9) x = Math.max(x, yr.wk(h.week) + yr.tickW / 2 + PLAYHEAD_CLEAR);
  return r1(x);
}

/**
 * How much of the year a play shows at `weeks`: whole columns, each once the playhead has passed its center, so no tick,
 * strip mark or request mark is drawn before its week.
 */
export function clipX(yr: YearGeometry, weeks: number): number {
  const cols = Math.min(RELIABILITY_WEEKS, Math.floor(weeks + 0.5 + 1e-9));
  return r1(yr.tx0 + (cols / RELIABILITY_WEEKS) * (yr.tx1 - yr.tx0));
}
