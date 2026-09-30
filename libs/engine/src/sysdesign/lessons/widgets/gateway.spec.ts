import { describe, expect, it } from 'vitest';
import { gatewayRun } from './gateway.js';

const edge = { rps: 10_000, authMs: 5, cacheHitPct: 90, hops: 4, mesh: true, sidecarMs: 0.5 };

describe('gateway run', () => {
  it('checks a JWT locally, and introspects only on cache misses, each a call to the auth server', () => {
    expect(gatewayRun('jwt', { ...edge, mesh: false })).toMatchObject({ addedMs: 0.1, authCallsPerSecond: 0, proxies: 0 });
    const introspect = gatewayRun('introspection', { ...edge, mesh: false });
    expect(introspect.addedMs).toBeCloseTo(0.5);
    expect(introspect.authCallsPerSecond).toBeCloseTo(1000);
  });

  it('adds two sidecars for every hop in a mesh', () => {
    expect(gatewayRun('jwt', edge)).toMatchObject({ proxies: 8 });
    expect(gatewayRun('jwt', edge).addedMs).toBeCloseTo(4.1);
  });
});
