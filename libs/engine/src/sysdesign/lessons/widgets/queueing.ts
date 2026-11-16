/** Queueing models for the Latency and Queues widgets, apart from the other widgets' math so a widget chunk takes only these. */

/** Each request's work: the mean of random (exponential) service, and every request's exactly when steady. */
export const LATENCY_SERVICE_MS = 10;
export const LATENCY_SERVERS = [1, 2, 3, 4] as const;
/** How busy the fleet runs with every server up, in percent: the load handle's stops. */
export const LATENCY_LOADS = [10, 20, 30, 40, 50, 60, 65, 70, 75, 80, 85, 90, 95, 98] as const;
/** The model's requests the chart's marginal draws, at its quantiles. */
export const LATENCY_DOTS = 100;
/** `queue`: one shared queue, or a queue per server with requests assigned at random. */
export const LATENCY_QUEUE = { shared: 0, split: 1 } as const;
/** `service`: random (exponential) work, or steady (exactly the mean). */
export const LATENCY_SERVICE = { random: 0, steady: 1 } as const;

/**
 * One setting, as numbers (`ExperimentSettings`): `load` is how busy the fleet runs with every server up (%), `servers`
 * how many, `queue` and `service` as `LATENCY_QUEUE` and `LATENCY_SERVICE`, `down` 1 when the last server has failed and
 * the others take its traffic.
 */
export type LatencySettings = {
  load: number;
  servers: number;
  queue: number;
  service: number;
  down: number;
};
export const LATENCY_BASELINE: Readonly<LatencySettings> = { load: 70, servers: 1, queue: 0, service: 0, down: 0 };

/** A queue's exact waiting law: the chance an arrival waits, the mean wait, and the tails of the response and the wait. */
export interface QueueModel {
  waitChance: number;
  meanWait: number;
  tail: (t: number) => number;
  waitTail: (t: number) => number;
}

/** Erlang C: the chance an arrival waits, `c` servers offered `a` = λ × S erlangs (a < c), through Erlang B's recursion. */
export function erlangC(c: number, a: number): number {
  let b = 1;
  for (let k = 1; k <= c; k++) b = (a * b) / (k + a * b);
  const rho = a / c;
  return b / (1 - rho * (1 - b));
}

/** P(S + E > t) for independent S ~ Exp(mu) and E ~ Exp(theta), without cancellation as theta nears mu. */
function sumTail(mu: number, theta: number, t: number): number {
  const x = (theta - mu) * t;
  const ratio = Math.abs(x) < 1e-12 ? 1 : -Math.expm1(-x) / x;
  return Math.exp(-mu * t) * (1 + mu * t * ratio);
}

/** M/M/c with one shared FCFS queue, `lambda` arrivals per ms: Erlang C, then an Exp(cμ − λ) wait for those who wait. */
export function mmcLatency(c: number, lambda: number): QueueModel {
  const mu = 1 / LATENCY_SERVICE_MS;
  const C = erlangC(c, lambda * LATENCY_SERVICE_MS);
  const theta = c * mu - lambda;
  return {
    waitChance: C,
    meanWait: C / theta,
    tail: (t) => (t <= 0 ? 1 : (1 - C) * Math.exp(-mu * t) + C * sumTail(mu, theta, t)),
    waitTail: (t) => (t < 0 ? 1 : C * Math.exp(-theta * t)),
  };
}

/** Poisson(m) probabilities 0..K, by a stable recurrence out from the mode. */
export function poisson(m: number, K: number): Float64Array {
  const p = new Float64Array(K + 1);
  if (m === 0) {
    p[0] = 1;
    return p;
  }
  const mode = Math.min(K, Math.floor(m));
  let logP = -m + mode * Math.log(m);
  for (let k = 2; k <= mode; k++) logP -= Math.log(k);
  p[mode] = Math.exp(logP);
  for (let k = mode + 1; k <= K; k++) p[k] = (p[k - 1] * m) / k;
  for (let k = mode - 1; k >= 0; k--) p[k] = (p[k + 1] * (k + 1)) / m;
  return p;
}

/**
 * M/D/c's number in system at an arbitrary moment. Crommelin's chain N′ = max(N − c, 0) + A, A ~ Poisson(a), is exact
 * (every request in service at t has left by t + D, and none that started after t has), so its stationary law is the
 * time-stationary one. It is solved by GTH state reduction on the chain truncated where its geometric tail falls under
 * 1e-15: only additions and multiplications of positive numbers over the chain's band, so exact to rounding.
 */
export function mdcStationary(c: number, a: number): Float64Array {
  const up = poisson(a, 200);
  let U = 0;
  while (U < 200 && (U < a || up[U] > 1e-18)) U++;
  // The tail of N decays like z^-j for the root z > 1 of z^c = e^(a(z − 1)).
  const above = (z: number) => c * Math.log(z) > a * (z - 1);
  let lo = 1 + 1e-12;
  let hi = 2;
  while (above(hi)) hi *= 2;
  for (let i = 0; i < 200; i++) {
    const z = (lo + hi) / 2;
    if (above(z)) lo = z;
    else hi = z;
  }
  const J = Math.min(20_000, Math.ceil(36 / Math.log(lo)) + c + U + 10);
  // Row i keeps its band, columns i − c to i + U, offset by c.
  const width = c + U + 1;
  const P = Array.from({ length: J + 1 }, () => new Float64Array(width));
  const at = (i: number, j: number) => j - i + c;
  for (let i = 0; i <= J; i++) {
    const base = Math.max(i - c, 0);
    let left = 1;
    for (let k = 0; k <= U; k++) {
      const j = base + k;
      if (j > J || at(i, j) >= width) break;
      if (j === J || at(i, j + 1) >= width || base + k + 1 > J) {
        P[i][at(i, j)] += left;
        left = 0;
        break;
      }
      P[i][at(i, j)] += up[k];
      left -= up[k];
    }
    if (left > 0) P[i][at(i, Math.min(J, base + U))] += left;
  }
  const out = new Float64Array(J + 1);
  for (let k = J; k >= 1; k--) {
    let s = 0;
    for (let j = Math.max(0, k - c); j < k; j++) s += P[k][at(k, j)];
    out[k] = s;
    for (let i = Math.max(0, k - U); i < k; i++) {
      const pik = at(i, k) < width && at(i, k) >= 0 ? P[i][at(i, k)] : 0;
      if (!pik) continue;
      for (let j = Math.max(0, k - c); j < k; j++) {
        const pkj = P[k][at(k, j)];
        if (pkj) P[i][at(i, j)] += (pik * pkj) / s;
      }
    }
  }
  const pi = new Float64Array(J + 1);
  pi[0] = 1;
  let total = 1;
  for (let k = 1; k <= J; k++) {
    let s = 0;
    for (let i = Math.max(0, k - U); i < k; i++) {
      const idx = at(i, k);
      if (idx >= 0 && idx < width) s += pi[i] * P[i][idx];
    }
    pi[k] = s / out[k];
    total += pi[k];
  }
  for (let k = 0; k <= J; k++) pi[k] /= total;
  return pi;
}

/**
 * M/D/c with one shared FCFS queue. Franx (2001): an arrival starts by kD + u (0 ≤ u < D) exactly when
 * max(N − c, 0) + A(λ(D − u)) ≤ (k + 1)c − 1, with N stationary and A Poisson, independent of N.
 */
export function mdcLatency(c: number, lambda: number): QueueModel {
  const D = LATENCY_SERVICE_MS;
  const pi = mdcStationary(c, lambda * D);
  const q = new Float64Array(pi.length);
  for (let j = 0; j < pi.length; j++) q[Math.max(0, j - c)] += pi[j];
  let lq = 0;
  for (let j = 0; j < q.length; j++) lq += j * q[j];
  const Qcdf = new Float64Array(q.length);
  let run = 0;
  for (let j = 0; j < q.length; j++) Qcdf[j] = run += q[j];
  const waitCdf = (t: number) => {
    if (t < 0) return 0;
    const k = Math.floor(t / D);
    const limit = (k + 1) * c - 1;
    const A = poisson(lambda * (D - (t - k * D)), Math.max(limit, 1));
    let s = 0;
    for (let m = 0; m <= limit; m++) {
      const qi = limit - m;
      if (A[m] !== 0) s += A[m] * (qi >= Qcdf.length ? 1 : Qcdf[qi]);
    }
    return Math.min(1, s);
  };
  let waitChance = 0;
  for (let j = c; j < pi.length; j++) waitChance += pi[j];
  return {
    waitChance,
    meanWait: lq / lambda,
    tail: (t) => 1 - waitCdf(t - D),
    waitTail: (t) => 1 - waitCdf(t),
  };
}

const exactFor = (steady: boolean, c: number, lambda: number) => (steady ? mdcLatency(c, lambda) : mmcLatency(c, lambda));

/** The smallest t with P(T > t) ≤ 1 − q, by bisection to 1e-9 ms. */
export function latencyQuantile(tail: (t: number) => number, q: number, from = 1): number {
  if (tail(0) <= 1 - q) return 0;
  let hi = from;
  while (tail(hi) > 1 - q) hi *= 2;
  let lo = 0;
  for (let i = 0; i < 80 && hi - lo > 1e-9; i++) {
    const mid = (lo + hi) / 2;
    if (tail(mid) > 1 - q) lo = mid;
    else hi = mid;
  }
  return hi;
}

/**
 * A queue each, c independent M/M/1 queues at utilization rho: the share of time some server sits idle while a request
 * waits at another. P(idle) = 1 − ρ, P(waiting) = ρ², P(exactly one in system) = ρ − ρ², by inclusion and exclusion.
 */
export const idleBesideShare = (rho: number, c: number) => 1 - rho ** c - (1 - rho * rho) ** c + (rho - rho * rho) ** c;

interface ScenarioBase {
  /** As the model reads them: one server has one queue and none to lose. */
  settings: LatencySettings;
  key: string;
  up: number;
  ratePerS: number;
  perServerPerS: number;
  /** The load on each server that is up: λ S / m. */
  rho: number;
  capacityPerS: number;
  metrics: Readonly<Record<'p99' | 'p50' | 'mean' | 'load', number>>;
}
export interface LatencySteady extends ScenarioBase {
  stable: true;
  mean: number;
  meanWait: number;
  waitShare: number;
  waitChance: number;
  p50: number;
  p99: number;
  /** In the system and waiting at once, on average (Little's law). */
  inSystem: number;
  waiting: number;
  /** The response time at the 100 levels (i + 0.5) / 100. */
  dots: readonly number[];
}
/** Past the capacity of the servers that are up there is no steady state: the queue grows by `growthPerS` a second. */
export interface LatencyUnstable extends ScenarioBase {
  stable: false;
  growthPerS: number;
}
export type LatencyScenario = LatencySteady | LatencyUnstable;

/** The settings as the model reads them: one server has one queue and none to lose. */
export function latencySettings(settings: Partial<LatencySettings>): LatencySettings {
  const s = { ...LATENCY_BASELINE, ...settings };
  return s.servers === 1 ? { ...s, queue: LATENCY_QUEUE.shared, down: 0 } : s;
}

/** Every setting the widget can show, each once, ordered by servers, queue, service, down and then load. */
export const LATENCY_SETTINGS: readonly LatencySettings[] = LATENCY_SERVERS.flatMap((servers) =>
  [LATENCY_QUEUE.shared, LATENCY_QUEUE.split].flatMap((queue) =>
    [LATENCY_SERVICE.random, LATENCY_SERVICE.steady].flatMap((service) =>
      [0, 1].flatMap((down) => LATENCY_LOADS.map((load) => ({ load, servers, queue, service, down }))),
    ),
  ),
).filter((s) => {
  const n = latencySettings(s);
  return n.queue === s.queue && n.down === s.down;
});

const scenarios = new Map<string, LatencyScenario>();

/** The exact model at one setting, memoized: every number the widget prints comes from here. */
export function latencyScenario(settings: Partial<LatencySettings>): LatencyScenario {
  const s = latencySettings(settings);
  const key = `${s.load}|${s.servers}|${s.queue}|${s.service}|${s.down}`;
  const hit = scenarios.get(key);
  if (hit) return hit;
  const up = s.servers - s.down;
  const lambda = ((s.load / 100) * s.servers) / LATENCY_SERVICE_MS;
  const rho = (lambda * LATENCY_SERVICE_MS) / up;
  const base = {
    settings: s,
    key,
    up,
    ratePerS: lambda * 1000,
    perServerPerS: (lambda * 1000) / up,
    rho,
    capacityPerS: (up * 1000) / LATENCY_SERVICE_MS,
  };
  let out: LatencyScenario;
  if (rho >= 1) {
    out = {
      ...base,
      stable: false,
      growthPerS: (lambda - up / LATENCY_SERVICE_MS) * 1000,
      metrics: { p99: Infinity, p50: Infinity, mean: Infinity, load: s.load },
    };
  } else {
    const steady = s.service === LATENCY_SERVICE.steady;
    const m = s.queue === LATENCY_QUEUE.shared ? exactFor(steady, up, lambda) : exactFor(steady, 1, lambda / up);
    const mean = LATENCY_SERVICE_MS + m.meanWait;
    const p50 = latencyQuantile(m.tail, 0.5);
    const p99 = latencyQuantile(m.tail, 0.99);
    out = {
      ...base,
      stable: true,
      mean,
      meanWait: m.meanWait,
      waitShare: m.meanWait / mean,
      waitChance: m.waitChance,
      p50,
      p99,
      inSystem: lambda * mean,
      waiting: lambda * m.meanWait,
      dots: Array.from({ length: LATENCY_DOTS }, (_, i) => latencyQuantile(m.tail, (i + 0.5) / LATENCY_DOTS)),
      metrics: { p99, p50, mean, load: s.load },
    };
  }
  scenarios.set(key, out);
  return out;
}

/** The parts of a setting that make its curve: the load only moves along it. */
export const latencyConfigKey = (settings: Partial<LatencySettings>) => {
  const s = latencySettings(settings);
  return `${s.servers}|${s.queue}|${s.service}|${s.down}`;
};

/** A point of the chart's curves: p50 and p99 at a utilization `rho` of the servers that are up. */
export interface LatencyPoint {
  rho: number;
  p50: number;
  p99: number;
}

const curves = new Map<string, readonly LatencyPoint[]>();

/** p50 and p99 for this configuration at `points` utilizations of the servers that are up, up to 99.5%, memoized. */
export function latencyCurve(settings: Partial<LatencySettings>, points = 90): readonly LatencyPoint[] {
  const s = latencySettings(settings);
  const key = `${latencyConfigKey(s)}|${points}`;
  const hit = curves.get(key);
  if (hit) return hit;
  const up = s.servers - s.down;
  const steady = s.service === LATENCY_SERVICE.steady;
  const out: LatencyPoint[] = [];
  for (let i = 1; i <= points; i++) {
    const rho = Math.min(0.995, (i / points) * 0.995);
    const lambda = (rho * up) / LATENCY_SERVICE_MS;
    const m = s.queue === LATENCY_QUEUE.shared ? exactFor(steady, up, lambda) : exactFor(steady, 1, lambda / up);
    out.push({ rho, p50: latencyQuantile(m.tail, 0.5), p99: latencyQuantile(m.tail, 0.99) });
  }
  curves.set(key, out);
  return out;
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
