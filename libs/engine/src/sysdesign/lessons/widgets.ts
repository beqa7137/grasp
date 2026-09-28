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

export interface ReplicaRead {
  stale: boolean;
  /** Where the read went: the replica, or the primary under read-your-writes. */
  servedBy: 'replica' | 'primary';
}

/**
 * A user writes, then reads `readAfterMs` later. A replica has applied the write only once `lagMs` has passed; with
 * read-your-writes, the user's reads go to the primary for `pinMs` after their own write.
 */
export function replicaRead(lagMs: number, readAfterMs: number, readYourWrites: boolean, pinMs: number): ReplicaRead {
  if (readYourWrites && readAfterMs < pinMs) return { stale: false, servedBy: 'primary' };
  return { stale: readAfterMs < lagMs, servedBy: 'replica' };
}

export type Limiter = 'token-bucket' | 'fixed-window' | 'sliding-window';

export interface LimiterRun {
  accepted: boolean[];
  /** The most requests accepted in any one-second span, which is what the protected service actually has to take. */
  worstSecond: number;
}

/**
 * Requests arrive at the given times in milliseconds, sorted. Each limiter allows `limit` requests a second:
 * the token bucket holds up to `burst` tokens refilled at `limit` a second; the fixed window counts per calendar second;
 * the sliding window counts the requests accepted in the last 1,000 ms.
 */
export function runLimiter(kind: Limiter, arrivals: readonly number[], limit: number, burst: number): LimiterRun {
  const accepted: boolean[] = [];
  const kept: number[] = [];
  let tokens = burst;
  let last = 0;
  for (const t of arrivals) {
    let ok: boolean;
    if (kind === 'token-bucket') {
      tokens = Math.min(burst, tokens + ((t - last) / 1000) * limit);
      last = t;
      ok = tokens >= 1;
      if (ok) tokens -= 1;
    } else if (kind === 'fixed-window') {
      const windowStart = Math.floor(t / 1000) * 1000;
      ok = kept.filter((k) => k >= windowStart).length < limit;
    } else {
      ok = kept.filter((k) => k > t - 1000).length < limit;
    }
    accepted.push(ok);
    if (ok) kept.push(t);
  }
  let worstSecond = 0;
  for (let i = 0, j = 0; i < kept.length; i++) {
    while (kept[i] - kept[j] >= 1000) j++;
    worstSecond = Math.max(worstSecond, i - j + 1);
  }
  return { accepted, worstSecond };
}

export interface Availability {
  availability: number;
  downtimeMinutesPerYear: number;
  /** The component that loses the most availability, the one to fix first. */
  weakest: number;
}

/** Components in series, each with `copies` independent replicas of which one must be up. */
export function chainAvailability(parts: readonly { availability: number; copies: number }[]): Availability {
  const each = parts.map((p) => 1 - (1 - p.availability) ** p.copies);
  const availability = each.reduce((a, b) => a * b, 1);
  const weakest = each.reduce((w, a, i) => (a < each[w] ? i : w), 0);
  return { availability, downtimeMinutesPerYear: (1 - availability) * 365 * 24 * 60, weakest };
}

export interface Pipeline {
  /** Requests a second each tier can serve: instances times per-instance capacity. */
  capacities: number[];
  /** Requests a second reaching each tier: what the tiers before it passed on. */
  arriving: number[];
  throughput: number;
  /** The tier with the least capacity: it caps the throughput, though tiers before it may drop requests too. */
  bottleneck: number;
  /** Busy fraction of each tier, capped at 1. */
  utilization: number[];
}

/** Requests pass the tiers in order, and each passes on only what it can serve, so tiers behind a bottleneck see less. */
export function pipeline(offered: number, tiers: readonly { instances: number; perInstance: number }[]): Pipeline {
  const capacities = tiers.map((t) => t.instances * t.perInstance);
  const arriving: number[] = [];
  let flow = offered;
  for (const capacity of capacities) {
    arriving.push(flow);
    flow = Math.min(flow, capacity);
  }
  const bottleneck = capacities.reduce((b, c, i) => (c < capacities[b] ? i : b), 0);
  return { capacities, arriving, throughput: flow, bottleneck, utilization: capacities.map((c, i) => Math.min(1, arriving[i] / c)) };
}

export interface QuorumRound {
  /** Replicas the write reached: the first `w` that are up. */
  writeSet: number[];
  /** Replicas the read asked, in the worst case: up replicas outside the write set first. */
  readSet: number[];
  writeOk: boolean;
  readOk: boolean;
  /** Whether every possible read set meets every possible write set, which is what `r + w > n` guarantees. */
  overlap: boolean;
  /** Whether the worst-case read still sees the write. */
  fresh: boolean;
}

/** A leaderless store with `n` replicas: a write needs `w` acknowledgments and a read asks `r` replicas. */
export function quorumRound(n: number, w: number, r: number, down: readonly number[]): QuorumRound {
  const up = Array.from({ length: n }, (_, i) => i).filter((i) => !down.includes(i));
  const writeOk = up.length >= w;
  const readOk = up.length >= r;
  const writeSet = writeOk ? up.slice(0, w) : [];
  const readSet = readOk ? [...up.filter((i) => !writeSet.includes(i)), ...writeSet].slice(0, r) : [];
  return { writeSet, readSet, writeOk, readOk, overlap: r + w > n, fresh: writeOk && readSet.some((i) => writeSet.includes(i)) };
}

export interface Partition {
  majority: number;
  /** Nodes that can fail while a majority still stands. */
  tolerates: number;
  /** The side holding a majority, which can elect a leader and commit; null when neither side has one. */
  quorumSide: 'left' | 'right' | null;
  /** Whether the old leader keeps leading: only when it sits on the majority side. */
  leaderKept: boolean;
}

/** A consensus cluster of `n` nodes cut in two, with `left` nodes on one side and the old leader on `leaderSide`. */
export function partition(n: number, left: number, leaderSide: 'left' | 'right'): Partition {
  const majority = Math.floor(n / 2) + 1;
  const quorumSide = left >= majority ? 'left' : n - left >= majority ? 'right' : null;
  return { majority, tolerates: n - majority, quorumSide, leaderKept: quorumSide === leaderSide };
}

export interface IdLayout {
  timeBits: number;
  /** Years the timestamp lasts from its epoch before it wraps. */
  years: number;
  generators: number;
  perGeneratorPerSecond: number;
}

const YEAR_MS = 365.25 * 24 * 3600 * 1000;

/** A Snowflake-style 64-bit id: a sign bit, then a timestamp in `tickMs` ticks, a generator id and a per-tick sequence. */
export function idLayout(generatorBits: number, sequenceBits: number, tickMs: number): IdLayout {
  const timeBits = 63 - generatorBits - sequenceBits;
  return {
    timeBits,
    years: (2 ** timeBits * tickMs) / YEAR_MS,
    generators: 2 ** generatorBits,
    perGeneratorPerSecond: 2 ** sequenceBits * (1000 / tickMs),
  };
}

/** The birthday bound: the chance that `count` ids drawn uniformly from `2 ** bits` values hold at least one repeat. */
export function collisionChance(bits: number, count: number): number {
  return -Math.expm1(-(count * count) / 2 ** (bits + 1));
}
