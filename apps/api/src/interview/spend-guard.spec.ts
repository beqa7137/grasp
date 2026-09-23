import { ServiceUnavailableException } from '@nestjs/common';
import { SpendGuard } from './spend-guard.js';

describe('SpendGuard', () => {
  it('blocks once the daily budget is spent and reopens the next UTC day', () => {
    let now = new Date('2026-09-23T10:00:00Z');
    const guard = new SpendGuard(1, () => now);
    guard.record(0.6);
    expect(() => guard.assertAvailable()).not.toThrow();
    guard.record(0.4);
    expect(() => guard.assertAvailable()).toThrow(ServiceUnavailableException);
    now = new Date('2026-09-24T00:00:01Z');
    expect(() => guard.assertAvailable()).not.toThrow();
    expect(guard.spentToday()).toBe(0);
  });

  it('never blocks without a budget', () => {
    const guard = new SpendGuard(null);
    guard.record(1_000);
    expect(() => guard.assertAvailable()).not.toThrow();
  });
});
