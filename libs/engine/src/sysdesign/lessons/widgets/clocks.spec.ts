import { describe, expect, it } from 'vitest';
import { clockRun } from './clocks.js';

const sync = { syncErrorMs: 10, driftPpm: 50, syncEverySec: 64, gapMs: 5, sawFirstWrite: true };

describe('clock run', () => {
  it('lets two synced clocks drift up to twice the sync error plus the drift between syncs', () => {
    expect(clockRun('wall', sync).worstSkewMs).toBeCloseTo(26.4);
  });

  it('can drop a later write under wall-clock last write wins, but not once a hybrid clock has seen the first', () => {
    expect(clockRun('wall', sync).laterWriteCanLose).toBe(true);
    expect(clockRun('wall', { ...sync, gapMs: 100 }).laterWriteCanLose).toBe(false);
    expect(clockRun('hybrid', sync).laterWriteCanLose).toBe(false);
    expect(clockRun('hybrid', { ...sync, sawFirstWrite: false }).laterWriteCanLose).toBe(true);
  });
});
