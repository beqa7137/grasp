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

/** Reads 120000, 120,000, 120k, 1.2M or 3B. */
export function parseAmount(raw: string): number | null {
  const m = /^\s*([0-9][0-9,]*(?:\.[0-9]+)?)\s*([kmb])?\s*$/i.exec(raw);
  if (!m) return null;
  const scale = { k: 1e3, m: 1e6, b: 1e9 }[(m[2] ?? '').toLowerCase() as 'k' | 'm' | 'b'] ?? 1;
  const value = Number(m[1].replaceAll(',', '')) * scale;
  return Number.isFinite(value) && value > 0 ? value : null;
}
