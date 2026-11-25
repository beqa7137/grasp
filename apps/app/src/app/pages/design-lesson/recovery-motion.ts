import type { RecoveryPlanId, RecoveryScenario } from '@grasp/engine';

/**
 * The play's one clock, 0 to 1, and its moments. A mark and its words show once the clock has reached their moment, so
 * nothing is drawn or said for an event before it happens: the history sweeps the day before the disaster, the
 * disaster strikes, each plan's recovery point lands, then a playhead runs down the recovery at a uniform speed, each
 * bar growing behind it and each time landing as the playhead passes its end.
 */
export const PLAN = { historyEnd: 0.2, strike: 0.24, points: [0.3, 0.33, 0.36, 0.39], recoverStart: 0.44, recoverEnd: 0.96 } as const;
export const PLAY_SECONDS = 7.5;

const ORDER: readonly RecoveryPlanId[] = ['full', 'pitr', 'standby', 'delayed'];
/** When a row's recovery point lands: the primary's at the strike, each plan's a beat apart after it. */
export const pointOf = (key: RecoveryPlanId | 'primary') => (key === 'primary' ? PLAN.strike : PLAN.points[ORDER.indexOf(key)]);

/** How far the recovery's playhead has run, 0 to 1. */
export const recoverFrac = (frac: number) => Math.min(1, Math.max(0, (frac - PLAN.recoverStart) / (PLAN.recoverEnd - PLAN.recoverStart)));
/** The recovery clock in minutes after the disaster: it reaches the last plan's time as the recovery ends. */
export const recoverMinAt = (m: RecoveryScenario, frac: number) => recoverFrac(frac) * m.lastRtoMin;
/** Minutes the recovery clock has passed: Infinity at rest and after the recovery, below 0 before it starts. */
export const passedMin = (m: RecoveryScenario, frac: number | null) =>
  frac === null || frac >= PLAN.recoverEnd ? Infinity : frac < PLAN.recoverStart ? -1 : recoverMinAt(m, frac);
/** Whether the recovery is running at `frac`: the playhead is drawn and the clock counts. */
export const recovering = (frac: number | null): frac is number => frac !== null && frac >= PLAN.recoverStart && frac < PLAN.recoverEnd;

/** The stage redraws on a grid of the clock: 200 steps in a play, every 37.5 ms, besides its own moments. */
const STEPS = 200;
const MOMENTS: readonly number[] = [PLAN.historyEnd, PLAN.strike, ...PLAN.points, PLAN.recoverStart, PLAN.recoverEnd];

/**
 * The clock at its last drawn moment: the largest named moment at or before `frac`, or the step of the grid it is on
 * while the history sweeps or the recovery runs. Between those, nothing on the stage changes.
 */
export function momentOf(frac: number): number {
  const named = MOMENTS.filter((t) => t <= frac + 1e-9).at(-1) ?? 0;
  const moving = frac < PLAN.historyEnd || recovering(frac);
  if (!moving) return named;
  return Math.max(named, Math.floor(frac * STEPS + 1e-9) / STEPS);
}
