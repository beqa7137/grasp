import { safeDatabaseErrorCategory } from '../persistence/database-errors.js';
import { reportSignal } from './error-reporting.js';
import { safeErrorDetails } from './safe-error.js';

export type FailureSignal =
  | 'db.timeout'
  | 'db.unavailable'
  | 'rate-limit.store'
  | 'ai.timeout'
  | 'ai.busy'
  | 'ai.unavailable'
  | 'ai.rejected'
  | 'ai.failed'
  | 'ai.deadline'
  | 'ai.spend-store';

export interface SignalReport {
  signal: FailureSignal;
  /** Failures on this instance since its previous report of the signal, this one included. */
  failures: number;
  category: string;
  code: string;
}

export const SIGNAL_WINDOW_MS = 5 * 60_000;

/**
 * Vercel instances share no memory, so each groups its own failures: the first of a signal reports at once and
 * the rest of its window are counted into the signal's next report. Alerts count reports across instances.
 */
export class FailureSignals {
  private readonly windows = new Map<FailureSignal, { until: number; held: number }>();

  constructor(
    private readonly send: (report: SignalReport) => void,
    private readonly now: () => number = Date.now,
  ) {}

  record(signal: FailureSignal, error?: unknown) {
    const now = this.now();
    const window = this.windows.get(signal);
    if (window && now < window.until) {
      window.held++;
      return;
    }
    this.windows.set(signal, { until: now + SIGNAL_WINDOW_MS, held: 0 });
    this.send({ signal, failures: (window?.held ?? 0) + 1, ...safeErrorDetails(error) });
  }
}

export function databaseSignal(error: unknown): FailureSignal | null {
  const category = safeDatabaseErrorCategory(error);
  if (category === 'unknown') return null;
  return category === 'timeout' ? 'db.timeout' : 'db.unavailable';
}

const signals = new FailureSignals(reportSignal);

export function recordFailure(signal: FailureSignal, error?: unknown) {
  signals.record(signal, error);
}

export function recordDatabaseFailure(error: unknown) {
  const signal = databaseSignal(error);
  if (signal) signals.record(signal, error);
}
