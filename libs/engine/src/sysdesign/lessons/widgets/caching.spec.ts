import { describe, expect, it } from 'vitest';
import { CACHE_HOT_KEYS, CACHE_QPS, cacheRefill, cacheSteady } from './caching.js';

describe('cache refill after a flush', () => {
  const run = cacheRefill({ hitRate: 99.9, originMs: 100, capacity: 2_000 });

  it('starts empty, fills monotonically and never sends the origin more than the traffic', () => {
    expect(run.samples[0]).toMatchObject({ t: 0, hitRate: 0, originQps: CACHE_QPS });
    expect(run.samples).toHaveLength(201);
    for (let i = 1; i < run.samples.length; i++) {
      expect(run.samples[i].hitRate).toBeGreaterThanOrEqual(run.samples[i - 1].hitRate);
      expect(run.samples[i].originQps).toBeLessThanOrEqual(CACHE_QPS);
      expect(run.samples[i].t).toBeCloseTo(i / 10, 9);
    }
  });

  it('is over capacity for about 0.8 × hot keys / capacity, losing about 16,000 requests, then settles warm', () => {
    expect(run.overCapacityS).toBeCloseTo((0.8 * CACHE_HOT_KEYS) / 2_000, 0);
    expect(run.timedOut).toBeGreaterThan(15_000);
    expect(run.timedOut).toBeLessThan(17_000);
    expect(run.overBelowHitRate).toBe(80);
    expect(run.samples.at(-1)!.hitRate).toBe(99.9);
    expect(run.samples.at(-1)!.originQps).toBeCloseTo(cacheSteady({ hitRate: 99.9, originMs: 100 }).originQps, 6);
  });

  it('says when the cache is warm again, counts timeouts as they happen, and warms every widget default in the run', () => {
    expect(run.warmAt).toBeCloseTo(9.3, 1);
    expect(run.samples[0].timedOutSoFar).toBe(0);
    expect(run.samples.at(-1)!.timedOutSoFar).toBeCloseTo(run.timedOut, 6);
    for (let i = 1; i < run.samples.length; i++)
      expect(run.samples[i].timedOutSoFar).toBeGreaterThanOrEqual(run.samples[i - 1].timedOutSoFar);
    expect(cacheRefill({ hitRate: 90, originMs: 50, capacity: 2_000 }).warmAt).toBeCloseTo(10.9, 1);
    expect(cacheRefill({ hitRate: 50, originMs: 50, capacity: 1_000 }).warmAt).toBeNull();
  });

  it('shortens the storm more than twofold when capacity doubles, and has none when the origin can take everything', () => {
    const bigger = cacheRefill({ hitRate: 99.9, originMs: 100, capacity: 4_000 });
    expect(bigger.overCapacityS).toBeLessThan(run.overCapacityS / 2);
    expect(bigger.overCapacityS).toBeCloseTo(1.5, 1);
    const unlimited = cacheRefill({ hitRate: 99.9, originMs: 100, capacity: Infinity });
    expect(unlimited.overCapacityS).toBe(0);
    expect(unlimited.timedOut).toBe(0);
    expect(unlimited.samples.every((x) => x.timedOutPerSec === 0)).toBe(true);
  });

  it('refills with a time constant of about one second when the origin keeps up', () => {
    const easy = cacheRefill({ hitRate: 99.9, originMs: 100, capacity: 10_000 });
    expect(easy.samples[10].hitRate / 99.9).toBeCloseTo(1 - Math.exp(-0.999), 1);
  });
});
