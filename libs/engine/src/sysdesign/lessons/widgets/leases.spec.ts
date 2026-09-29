import { describe, expect, it } from 'vitest';
import { leaseRun } from './leases.js';

const lease = { ttlSec: 10, renewSec: 3, stopAtSec: 20, pauseSec: 0, crash: false, fencing: false };

describe('lease run', () => {
  it('keeps the lock through a pause shorter than what is left of the lease', () => {
    expect(leaseRun({ ...lease, pauseSec: 5 })).toMatchObject({ expiresAtSec: 28, lost: false, staleWrite: 'none', renewalsPerMinute: 20 });
  });

  it('lets a stale write through after a pause outlasts the lease, unless the store checks a fencing token', () => {
    expect(leaseRun({ ...lease, pauseSec: 15 })).toMatchObject({ lost: true, wakesAtSec: 35, staleWrite: 'accepted' });
    expect(leaseRun({ ...lease, pauseSec: 15, fencing: true })).toMatchObject({ lost: true, staleWrite: 'rejected' });
  });

  it('leaves the lock unheld after a crash until the lease runs out', () => {
    expect(leaseRun({ ...lease, crash: true })).toMatchObject({ lost: true, failoverSec: 8, wakesAtSec: null, staleWrite: 'none' });
    expect(leaseRun({ ...lease, ttlSec: 30, crash: true }).failoverSec).toBe(28);
  });
});
