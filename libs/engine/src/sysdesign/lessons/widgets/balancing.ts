import { mulberry32 } from '../../../algorithms/random.js';

export type Balancer = 'round-robin' | 'random' | 'least-connections' | 'two-choices';

export interface BalanceRun {
  meanMs: number;
  p99Ms: number;
  /** The share of requests sent to the slow server. */
  slowShare: number;
  /** The most requests ever waiting or running on one server at once. */
  maxQueue: number;
}

const REQUESTS = 20_000;
const SERVICE_MS = 10;

/**
 * `servers` servers each answer a request in 10 ms on average (exponentially distributed), one of them `slowdown` times
 * slower, fed requests at random times at `load` of what the whole fleet can answer. Each server works through its own
 * queue in order. The balancer sends each request by turn, at random, to the server with the fewest requests in flight,
 * or to the less busy of two picked at random. The same seed gives the same run.
 */
export function balanceRun(balancer: Balancer, options: { servers: number; load: number; slowdown: number; seed?: number }): BalanceRun {
  const { servers, load, slowdown, seed = 7 } = options;
  const rand = mulberry32(seed);
  const exp = (mean: number) => -Math.log(1 - rand()) * mean;
  const serviceMs = (s: number) => SERVICE_MS * (s === 0 ? slowdown : 1);
  const capacity = (servers - 1) / SERVICE_MS + 1 / (SERVICE_MS * slowdown);
  const gapMs = 1 / (capacity * load);
  const free = Array.from({ length: servers }, () => 0);
  const finishes: number[][] = Array.from({ length: servers }, () => []);
  const done = Array.from({ length: servers }, () => 0);
  const inFlight = (s: number, t: number) => {
    while (done[s] < finishes[s].length && finishes[s][done[s]] <= t) done[s]++;
    return finishes[s].length - done[s];
  };
  const latencies: number[] = [];
  let t = 0;
  let turn = 0;
  let slow = 0;
  let maxQueue = 0;
  for (let i = 0; i < REQUESTS; i++) {
    t += exp(gapMs);
    let s: number;
    if (balancer === 'round-robin') s = turn++ % servers;
    else if (balancer === 'random') s = Math.floor(rand() * servers);
    else if (balancer === 'least-connections') {
      s = 0;
      for (let k = 1; k < servers; k++) if (inFlight(k, t) < inFlight(s, t)) s = k;
    } else {
      const a = Math.floor(rand() * servers);
      const b = (a + 1 + Math.floor(rand() * (servers - 1))) % servers;
      s = inFlight(b, t) < inFlight(a, t) ? b : a;
    }
    const finish = Math.max(t, free[s]) + exp(serviceMs(s));
    free[s] = finish;
    finishes[s].push(finish);
    latencies.push(finish - t);
    if (s === 0) slow++;
    maxQueue = Math.max(maxQueue, inFlight(s, t));
  }
  latencies.sort((a, b) => a - b);
  return {
    meanMs: latencies.reduce((sum, v) => sum + v, 0) / REQUESTS,
    p99Ms: latencies[Math.floor(REQUESTS * 0.99)],
    slowShare: slow / REQUESTS,
    maxQueue,
  };
}
