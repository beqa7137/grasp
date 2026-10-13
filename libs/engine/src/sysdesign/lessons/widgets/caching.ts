/** Requests a second the Caching widget's clients send. */
export const CACHE_QPS = 10_000;
/** A cache hit's latency in milliseconds. */
export const CACHE_HIT_MS = 1;
/** Keys in the hot set: the keys that serve the target hit rate, which a flush empties and misses refill one by one. */
export const CACHE_HOT_KEYS = 10_000;
/** The hit rates (%) the widget's handle snaps to: about one step per half nine. */
export const CACHE_HIT_SNAPS = [50, 80, 90, 95, 98, 99, 99.5, 99.9] as const;
export const CACHE_ORIGIN_MS_SNAPS = [10, 50, 100, 200] as const;
/** Requests a second the origin can answer before it queues and times out. */
export const CACHE_CAPACITY_SNAPS = [1_000, 2_000, 4_000, 10_000] as const;
/** How long a flush is simulated for, in seconds, and how often it is sampled. */
export const CACHE_REFILL_SECONDS = 20;
export const CACHE_REFILL_STEP = 0.1;

export interface CacheSettings {
  /** The warm cache's hit rate, in percent. */
  hitRate: number;
  originMs: number;
  /** Requests a second the origin can answer. */
  capacity: number;
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

/** The widget's steady state for its settings: `cacheOutcome` at the widget's traffic and cache latency. */
export const cacheSteady = (s: Pick<CacheSettings, 'hitRate' | 'originMs'>): CacheOutcome =>
  cacheOutcome(CACHE_QPS, s.hitRate / 100, CACHE_HIT_MS, s.originMs);

export interface RefillSample {
  /** Seconds since the flush. */
  t: number;
  /** The hit rate now, in percent. */
  hitRate: number;
  /** Misses a second sent to the origin. */
  originQps: number;
  /** Misses a second the origin could not answer. */
  timedOutPerSec: number;
  /** Requests timed out since the flush. */
  timedOutSoFar: number;
}

export interface CacheRefill {
  samples: RefillSample[];
  /** Seconds the origin spent over its capacity. */
  overCapacityS: number;
  /** Requests that timed out at the origin while it was over capacity. */
  timedOut: number;
  /** The hit rate (%) below which the origin is over capacity. */
  overBelowHitRate: number;
  /** Seconds after the flush when the cache is warm again; null if it is not within the run. */
  warmAt: number | null;
}

/**
 * The cache refilling after a flush. Each answered miss for a hot key stores that key, so the hot set's filled share `f`
 * grows at `served × qps × target × (1 − f) / HOT_KEYS`, where `served` is the share of misses the origin can answer:
 * an origin over capacity answers only `capacity` a second, so it also refills the cache more slowly. The hit rate is
 * `target × f`. Integrated in 10 ms steps and sampled every 100 ms for 20 s, long enough for every setting the widget
 * offers but the lowest hit rates on the smallest origins to warm again; once fewer than one key in a thousand is
 * missing the cache counts as warm.
 */
export function cacheRefill(s: CacheSettings): CacheRefill {
  const target = s.hitRate / 100;
  const dt = 0.01;
  const perSample = Math.round(CACHE_REFILL_STEP / dt);
  const steps = Math.round(CACHE_REFILL_SECONDS / dt);
  const samples: RefillSample[] = [];
  let f = 0;
  let overCapacityS = 0;
  let timedOut = 0;
  let warmAt: number | null = null;
  for (let i = 0; i <= steps; i++) {
    const t = Math.round(i * dt * 100) / 100;
    const originQps = CACHE_QPS * (1 - target * f);
    const timedOutPerSec = Math.max(0, originQps - s.capacity);
    if (f === 1) warmAt ??= t;
    if (i % perSample === 0) samples.push({ t, hitRate: target * f * 100, originQps, timedOutPerSec, timedOutSoFar: timedOut });
    if (i === steps) break;
    if (timedOutPerSec > 0) overCapacityS += dt;
    timedOut += timedOutPerSec * dt;
    const served = originQps > 0 ? Math.min(1, s.capacity / originQps) : 1;
    f += (served * CACHE_QPS * target * (1 - f) * dt) / CACHE_HOT_KEYS;
    if (1 - f < 1e-3) f = 1;
  }
  return { samples, overCapacityS, timedOut, overBelowHitRate: Math.max(0, (1 - s.capacity / CACHE_QPS) * 100), warmAt };
}
