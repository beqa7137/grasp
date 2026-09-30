export type TokenCheck = 'jwt' | 'introspection';

export interface GatewayRun {
  /** Milliseconds the gateway and the mesh add to one request, on average. */
  addedMs: number;
  /** Calls a second the gateway makes to the auth server. */
  authCallsPerSecond: number;
  /** Proxies a request passes through on its way down the call chain. */
  proxies: number;
}

/**
 * A request passes the gateway, which checks its token, then calls `hops` services in a chain. A signed JWT is checked
 * locally in about 0.1 ms; introspection asks the auth server (`authMs`) unless its answer is cached, which it is for
 * `cacheHitPct` of requests. In a service mesh every hop leaves one sidecar proxy and enters another, each adding
 * `sidecarMs`; without a mesh, services call each other directly.
 */
export function gatewayRun(
  check: TokenCheck,
  options: { rps: number; authMs: number; cacheHitPct: number; hops: number; mesh: boolean; sidecarMs: number },
): GatewayRun {
  const { rps, authMs, cacheHitPct, hops, mesh, sidecarMs } = options;
  const miss = check === 'jwt' ? 0 : 1 - cacheHitPct / 100;
  const tokenMs = check === 'jwt' ? 0.1 : miss * authMs;
  const proxies = mesh ? 2 * hops : 0;
  return { addedMs: tokenMs + proxies * sidecarMs, authCallsPerSecond: rps * miss, proxies };
}
