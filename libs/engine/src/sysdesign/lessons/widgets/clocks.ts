export type ClockMode = 'wall' | 'hybrid';

export interface ClockRun {
  /** How far apart two synced clocks can drift before their next sync, in ms. */
  worstSkewMs: number;
  /** Whether B's later write can lose to A's earlier one when both are ordered by timestamp. */
  laterWriteCanLose: boolean;
}

/**
 * Two nodes sync to a time server within `syncErrorMs`, then drift at up to `driftPpm` until the next sync
 * `syncEverySec` later, so their clocks can be up to twice the sum apart. Node B writes `gapMs` after node A, and last
 * write wins by timestamp. With wall clocks, B's later write loses whenever B's clock may be behind by more than the gap.
 * With a hybrid logical clock, a node that has seen a timestamp never issues a smaller one, so a write B makes after
 * reading A's can never lose; writes that never saw each other are concurrent and ordered arbitrarily either way.
 */
export function clockRun(
  mode: ClockMode,
  options: { syncErrorMs: number; driftPpm: number; syncEverySec: number; gapMs: number; sawFirstWrite: boolean },
): ClockRun {
  const { syncErrorMs, driftPpm, syncEverySec, gapMs, sawFirstWrite } = options;
  const worstSkewMs = 2 * (syncErrorMs + (driftPpm / 1e6) * syncEverySec * 1000);
  const causallyOrdered = mode === 'hybrid' && sawFirstWrite;
  return { worstSkewMs, laterWriteCanLose: !causallyOrdered && gapMs < worstSkewMs };
}
