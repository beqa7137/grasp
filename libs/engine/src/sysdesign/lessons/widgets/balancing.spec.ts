import { describe, expect, it } from 'vitest';
import { balanceRun } from './balancing.js';

const fleet = { servers: 10, load: 0.7, slowdown: 1 };

describe('balance run', () => {
  it('matches a single server queue when picking at random: about 10 / (1 - 0.7) = 33 ms on average', () => {
    expect(balanceRun('random', fleet).meanMs).toBeCloseTo(33, -1);
  });

  it('orders the balancers by how much they know: least connections, then two choices, round-robin and random', () => {
    const mean = (b: Parameters<typeof balanceRun>[0]) => balanceRun(b, { ...fleet, load: 0.9 }).meanMs;
    expect(mean('least-connections')).toBeLessThan(mean('two-choices'));
    expect(mean('two-choices')).toBeLessThan(mean('round-robin'));
    expect(mean('round-robin')).toBeLessThan(mean('random'));
  });

  it('keeps feeding a slow server its equal share by turn, so its queue grows without bound, where counting in-flight work backs off', () => {
    const slow = { ...fleet, slowdown: 5 };
    const turns = balanceRun('round-robin', slow);
    expect(turns.slowShare).toBeCloseTo(0.1, 3);
    expect(turns.p99Ms).toBeGreaterThan(10_000);
    const counted = balanceRun('least-connections', slow);
    expect(counted.slowShare).toBeLessThan(0.05);
    expect(counted.p99Ms).toBeLessThan(200);
  });

  it('is the same run for the same seed', () => {
    expect(balanceRun('two-choices', fleet)).toEqual(balanceRun('two-choices', fleet));
  });
});
