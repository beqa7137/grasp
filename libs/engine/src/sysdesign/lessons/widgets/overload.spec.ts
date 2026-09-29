import { describe, expect, it } from 'vitest';
import { overload } from './overload.js';

const burst = { capacity: 1000, base: 800, burst: 1200, burstSec: 10, timeoutSec: 2, queueCap: 1000, retries: 0 };

describe('overload', () => {
  it('answers everything on time below capacity, whatever the policy', () => {
    for (const policy of ['none', 'bounded', 'deadline'] as const) {
      expect(overload(policy, { ...burst, burst: 0 })).toMatchObject({ goodputPct: 100, late: 0, rejected: 0, expired: 0, recoverSec: 0 });
    }
  });

  it('with an unbounded queue, answers most of a burst after its clients gave up, and takes most of a minute to drain', () => {
    const run = overload('none', burst);
    expect(run).toMatchObject({ onTime: 15_000, late: 45_000, goodputPct: 25, maxWaitSec: 10, recoverSec: 50 });
    expect(Math.max(...run.queue)).toBe(10_000);
  });

  it('with retries on an unbounded queue, sends almost twice the traffic and does not recover within the minute', () => {
    const run = overload('none', { ...burst, retries: 1 });
    expect(run.sent).toBe(112_600);
    expect(run.goodputPct).toBeCloseTo(8.33, 1);
    expect(run.recoverSec).toBeNull();
  });

  it('keeps most users answered in time by turning away what does not fit, or by dropping what no one waits for', () => {
    expect(overload('bounded', burst)).toMatchObject({ goodputPct: 85, late: 0, rejected: 9000, maxWaitSec: 1, recoverSec: 5 });
    expect(overload('deadline', burst)).toMatchObject({ late: 0, rejected: 0, expired: 8000, maxWaitSec: 2, recoverSec: 10 });
  });

  it('collapses again once the bound holds more than the timeout can wait for', () => {
    const run = overload('bounded', { ...burst, queueCap: 5000, retries: 1 });
    expect(run.late).toBe(55_000);
    expect(run.goodputPct).toBeCloseTo(8.33, 1);
  });
});
