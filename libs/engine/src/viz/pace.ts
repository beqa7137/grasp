import type { VizEvent } from './diff.js';

/** A playback speed: a multiple of 1×, or Instant, which shows each frame with no motion. */
export type PaceSpeed = number | 'instant';

/** The three phases of a step's motion at 1× (REDESIGN.md 3.5): cause, change, then consequence. */
export const PHASES = { cause: 0, change: 120, consequence: 360, end: 640 } as const;
/** However fast the speed, a step's motion takes at least this long. */
export const MIN_MOTION_MS = 140;
/** A checkpoint's answer plays the real step at this speed. */
export const PAYOFF_SPEED = 0.75;

export interface Pace {
  /** How long the frame shows before the next step while playing. */
  dwell: number;
  /** What every motion duration and delay is multiplied by; 0 when nothing moves. */
  scale: number;
}

/**
 * How long a step into a frame dwells and how fast its motion runs. At 1× the dwell is 600ms, plus 200ms for each of its
 * first four events and 180ms if a value was written; faster speeds divide it. Instant dwells as 4× does, with no motion.
 */
export function pace(events: readonly VizEvent[], speed: PaceSpeed): Pace {
  const counted = Math.min(4, events.length);
  const written = events.some((e) => e.kind === 'write');
  const dwell = 600 + 200 * counted + (written ? 180 : 0);
  if (speed === 'instant') return { dwell: dwell / 4, scale: 0 };
  return { dwell: dwell / speed, scale: Math.max(1 / speed, MIN_MOTION_MS / PHASES.end) };
}
