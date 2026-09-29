export type DiscoveryMode = 'dns' | 'registry' | 'health-check';

export interface DiscoveryRun {
  /** Worst-case seconds clients keep sending to an instance after it dies. */
  staleSec: number;
  /** Requests sent to the dead instance in that time, which fail or time out. */
  failedRequests: number;
  /** Heartbeats or health checks the system handles each second, what the freshness costs. */
  checksPerSecond: number;
}

/**
 * One of `instances` dies while clients send it an equal share of `rps`. With DNS, clients keep the old address list
 * for the record's TTL. With a registry, the instance's heartbeats every `heartbeatSec` stop, the registry drops it after
 * `missedBeats` missed ones, and clients refresh their cached list every `cacheSec`. With a load balancer, health checks
 * every `checkSec` must fail `failures` times in a row before it stops routing there.
 */
export function discoveryRun(
  mode: DiscoveryMode,
  options: {
    instances: number;
    rps: number;
    ttlSec: number;
    heartbeatSec: number;
    missedBeats: number;
    cacheSec: number;
    checkSec: number;
    failures: number;
  },
): DiscoveryRun {
  const { instances, rps, ttlSec, heartbeatSec, missedBeats, cacheSec, checkSec, failures } = options;
  const staleSec = mode === 'dns' ? ttlSec : mode === 'registry' ? heartbeatSec * missedBeats + cacheSec : checkSec * failures;
  const checksPerSecond = mode === 'dns' ? 0 : mode === 'registry' ? instances / heartbeatSec : instances / checkSec;
  return { staleSec, failedRequests: (rps / instances) * staleSec, checksPerSecond };
}
