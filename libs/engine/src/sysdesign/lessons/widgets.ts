/** The math behind the system design lesson widgets, kept here so it is tested apart from the drawing. */

export interface Latency {
  mean: number;
  p50: number;
  p99: number;
}

/**
 * A single server with random arrivals and service times (the M/M/1 queue): the response time is exponential with mean
 * `service / (1 - utilization)`, so every percentile grows by the same factor as the server fills.
 */
export function queueLatency(serviceMs: number, utilization: number): Latency {
  const mean = serviceMs / (1 - Math.min(utilization, 0.999));
  return { mean, p50: mean * Math.LN2, p99: mean * Math.log(100) };
}

export interface CacheOutcome {
  originQps: number;
  meanMs: number;
  /** Set by the misses whenever more than 1% of requests miss. */
  p99Ms: number;
}

/** A cache in front of an origin: every request asks the cache first, and a miss then pays the origin too. */
export function cacheOutcome(qps: number, hitRate: number, cacheMs: number, originMs: number): CacheOutcome {
  // Rounded so a 99% hit rate counts as exactly 1% misses, not a floating-point hair more.
  const miss = Math.round((1 - hitRate) * 1e9) / 1e9;
  return {
    originQps: qps * miss,
    meanMs: cacheMs + miss * originMs,
    p99Ms: miss > 0.01 ? cacheMs + originMs : cacheMs,
  };
}

/**
 * 32-bit FNV-1a, then MurmurHash3's finalizer: FNV alone leaves near-identical keys such as `user:1` and `user:2` close
 * together on the ring, which would make consistent hashing look unbalanced. The same in every run, so widgets are stable.
 */
export function hash32(text: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < text.length; i++) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 0x01000193);
  }
  h ^= h >>> 16;
  h = Math.imul(h, 0x85ebca6b);
  h ^= h >>> 13;
  h = Math.imul(h, 0xc2b2ae35);
  h ^= h >>> 16;
  return h >>> 0;
}

export interface RingPoint {
  node: string;
  at: number;
}

/** Each node takes `virtualNodes` points on a ring of 2^32 positions; a key belongs to the first point clockwise of it. */
export function hashRing(nodes: readonly string[], virtualNodes: number): RingPoint[] {
  return nodes
    .flatMap((node) => Array.from({ length: virtualNodes }, (_, v) => ({ node, at: hash32(`${node}#${v}`) })))
    .sort((a, b) => a.at - b.at);
}

export function ringOwner(ring: readonly RingPoint[], key: string): string {
  const at = hash32(key);
  let lo = 0;
  let hi = ring.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (ring[mid].at < at) lo = mid + 1;
    else hi = mid;
  }
  return ring[lo % ring.length].node;
}

export function moduloOwner(nodes: readonly string[], key: string): string {
  return nodes[hash32(key) % nodes.length];
}

export interface KeyPlacement {
  owners: string[];
  /** Keys per node, in the order of `nodes`. */
  load: number[];
}

export function place(keys: readonly string[], nodes: readonly string[], owner: (key: string) => string): KeyPlacement {
  const owners = keys.map(owner);
  return { owners, load: nodes.map((n) => owners.filter((o) => o === n).length) };
}

export function movedKeys(before: readonly string[], after: readonly string[]): number {
  return before.filter((owner, i) => owner !== after[i]).length;
}

export interface Backlog {
  /** Queue depth at the end of each second. */
  depth: number[];
  /** Seconds after the spike ends until the queue is empty again, or null if it never empties in the window. */
  drainSeconds: number | null;
  capacity: number;
}

/** Messages arrive at `baseRate`, or `spikeRate` during the spike, and consumers remove up to their capacity each second. */
export function queueBacklog(options: {
  seconds: number;
  baseRate: number;
  spikeRate: number;
  spikeStart: number;
  spikeEnd: number;
  consumers: number;
  perConsumer: number;
}): Backlog {
  const capacity = options.consumers * options.perConsumer;
  const depth: number[] = [];
  let queued = 0;
  let drainSeconds: number | null = null;
  for (let t = 0; t < options.seconds; t++) {
    const arriving = t >= options.spikeStart && t < options.spikeEnd ? options.spikeRate : options.baseRate;
    queued = Math.max(0, queued + arriving - capacity);
    depth.push(queued);
    if (drainSeconds === null && t >= options.spikeEnd && queued === 0) drainSeconds = t + 1 - options.spikeEnd;
  }
  return { depth, drainSeconds, capacity };
}
