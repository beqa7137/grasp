export type EstimateTone = 'spot-on' | 'ballpark' | 'off';

export interface EstimateVerdict {
  tone: EstimateTone;
  /** How many times too high or too low the guess is, never below 1. */
  factor: number;
}

/** Interviewers want the right order of magnitude, not the exact figure: within a third is spot on, within 2x is fine. */
export function estimateVerdict(guess: number, answer: number): EstimateVerdict {
  const factor = guess > 0 ? Math.max(guess / answer, answer / guess) : Number.POSITIVE_INFINITY;
  return { tone: factor <= 4 / 3 ? 'spot-on' : factor <= 2 ? 'ballpark' : 'off', factor };
}
