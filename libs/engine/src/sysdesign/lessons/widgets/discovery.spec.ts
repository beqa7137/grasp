import { describe, expect, it } from 'vitest';
import { discoveryRun } from './discovery.js';

const fleet = { instances: 20, rps: 10_000, ttlSec: 60, heartbeatSec: 10, missedBeats: 3, cacheSec: 30, checkSec: 5, failures: 3 };

describe('discovery run', () => {
  it('keeps sending to a dead instance for the DNS TTL, the registry detection plus the client cache, or the failed checks', () => {
    expect(discoveryRun('dns', fleet)).toMatchObject({ staleSec: 60, failedRequests: 30_000, checksPerSecond: 0 });
    expect(discoveryRun('registry', fleet)).toMatchObject({ staleSec: 60, failedRequests: 30_000, checksPerSecond: 2 });
    expect(discoveryRun('health-check', fleet)).toMatchObject({ staleSec: 15, failedRequests: 7500, checksPerSecond: 4 });
  });

  it('trades faster detection for more checks', () => {
    const fast = discoveryRun('health-check', { ...fleet, checkSec: 1 });
    expect(fast.staleSec).toBe(3);
    expect(fast.checksPerSecond).toBe(20);
  });
});
