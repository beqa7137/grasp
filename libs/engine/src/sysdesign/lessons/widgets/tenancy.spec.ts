import { describe, expect, it } from 'vitest';
import { tenancyRun } from './tenancy.js';

const pool = { tenants: 10, quietLoadPct: 60, burst: 20, quotaPct: 20 };

describe('tenancy run', () => {
  it('shares the shortage with everyone first come first served, so quiet tenants lose as much as the noisy one', () => {
    const run = tenancyRun('shared', pool);
    expect(run.quietServedPct).toBeCloseTo(51.7, 1);
    expect(run.noisyServedPct).toBeCloseTo(51.7, 1);
    expect(run.utilizationPct).toBeCloseTo(100);
  });

  it('protects quiet tenants with a quota or fair sharing, and fair sharing also uses the capacity a quota leaves idle', () => {
    expect(tenancyRun('quota', pool)).toMatchObject({ quietServedPct: 100, utilizationPct: 80 });
    expect(tenancyRun('quota', pool).noisyServedPct).toBeCloseTo(15, 1);
    const fair = tenancyRun('fair', pool);
    expect(fair.quietServedPct).toBeCloseTo(100);
    expect(fair.noisyServedPct).toBeCloseTo(30, 1);
    expect(fair.utilizationPct).toBeCloseTo(100);
  });

  it('serves everyone in full when the pool has room', () => {
    expect(tenancyRun('shared', { ...pool, burst: 2 })).toMatchObject({ quietServedPct: 100, noisyServedPct: 100 });
  });
});
