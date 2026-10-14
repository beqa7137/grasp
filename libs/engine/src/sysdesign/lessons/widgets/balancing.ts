import { mulberry32 } from '../../../algorithms/random.js';
import { RunningPercentile } from './running-percentile.js';
import { LB_HIST_BINS, LB_LOADS, LB_POLICIES, LB_REQUESTS, LB_SERVICE_MS, histogramBin, type Balancer } from './balancing-settings.js';

/** Where the policy's own picks are taken from: well into the run, so queues have formed. */
const MID_RUN = LB_REQUESTS / 2;
const PICKS = 200;
const CHOICES = 12;
const CHOICE_EVERY = Math.floor((LB_REQUESTS - MID_RUN) / CHOICES);

export interface BalanceSettings {
  servers: number;
  /** A share of the fleet's capacity, 0 to 1. */
  load: number;
  slowdown: number;
  seed?: number;
}

/** One dispatch, as the policy saw it: the servers it looked at, every server's requests in flight, and its pick. */
export interface BalanceChoice {
  server: number;
  looked: number[];
  inFlight: number[];
}

export interface BalanceRun {
  meanMs: number;
  p50Ms: number;
  p99Ms: number;
  /** The share of requests sent to the slow server. */
  slowShare: number;
  /** The slow server's share of the fleet's capacity. */
  slowCapacityShare: number;
  /** The most requests ever waiting or running on one server at once. */
  maxQueue: number;
  /** Requests waiting or running on the slow server (the first) when the last request arrives: the replay's last frame. */
  slowQueueAtEnd: number;
  /** Simulated milliseconds the run's arrivals span. */
  durationMs: number;
  /** With `samples`: each server's requests in flight at evenly spaced times across the run, the last at its end. */
  series?: { t: number; queues: number[] }[];
  /** With `samples`: the share of requests in each of the histogram's log bins. */
  histogram?: number[];
  /** With `samples`: the servers picked for requests from mid-run on, in order. */
  picks?: number[];
  /** With `samples`: dispatches spread over the run's second half, with what the policy looked at. */
  choices?: BalanceChoice[];
  /**
   * With `samples`: at each sample, the requests answered so far, as shares of all requests in each histogram bin, and
   * their p99 and mean (null before any), so a replay shows the slow tail arriving late.
   */
  answered?: { histogram: number[]; p99Ms: number | null; meanMs: number | null }[];
}

/**
 * `servers` servers each answer a request in 10 ms on average (exponentially distributed), one of them `slowdown` times
 * slower, fed requests at random times at `load` of what the whole fleet can answer. Each server works through its own
 * queue in order. The balancer sends each request by turn, at random, to the server with the fewest requests in flight,
 * or to the less busy of two picked at random. The same seed gives the same run. With `samples`, the run also records what
 * the Load Balancing widget draws; recording draws no random numbers, so the numbers are the same either way.
 */
export function balanceRun(balancer: Balancer, settings: BalanceSettings, options: { samples?: number } = {}): BalanceRun {
  const { servers, load, slowdown, seed = 7 } = settings;
  const samples = options.samples ?? 0;
  const rand = mulberry32(seed);
  const exp = (mean: number) => -Math.log(1 - rand()) * mean;
  const serviceMs = (s: number) => LB_SERVICE_MS * (s === 0 ? slowdown : 1);
  const capacity = (servers - 1) / LB_SERVICE_MS + 1 / (LB_SERVICE_MS * slowdown);
  const gapMs = 1 / (capacity * load);
  const free = Array.from({ length: servers }, () => 0);
  const finishes: number[][] = Array.from({ length: servers }, () => []);
  const done = Array.from({ length: servers }, () => 0);
  const inFlight = (s: number, t: number) => {
    while (done[s] < finishes[s].length && finishes[s][done[s]] <= t) done[s]++;
    return finishes[s].length - done[s];
  };
  const snapshot = (t: number) => Array.from({ length: servers }, (_, s) => inFlight(s, t));
  const everyServer = Array.from({ length: servers }, (_, s) => s);
  // Samples span the expected run, so they are spaced before the run's real end is known.
  const sampleAt = (k: number) => (k * LB_REQUESTS * gapMs) / Math.max(1, samples - 1);
  const series: { t: number; queues: number[] }[] = [];
  const picks: number[] = [];
  const choices: BalanceChoice[] = [];
  const latencies: number[] = [];
  const finished: number[] = [];
  let t = 0;
  let turn = 0;
  let slow = 0;
  let maxQueue = 0;
  for (let i = 0; i < LB_REQUESTS; i++) {
    t += exp(gapMs);
    while (series.length < samples && sampleAt(series.length) <= t) {
      const at = sampleAt(series.length);
      series.push({ t: at, queues: snapshot(at) });
    }
    let s: number;
    let looked: number[];
    if (balancer === 'round-robin') {
      s = turn++ % servers;
      looked = [s];
    } else if (balancer === 'random') {
      s = Math.floor(rand() * servers);
      looked = [s];
    } else if (balancer === 'least-connections') {
      // Ties go round in turn, as a balancer that scans from where it last stopped does, so no server is favoured.
      const from = turn++ % servers;
      s = from;
      for (let j = 1; j < servers; j++) {
        const k = (from + j) % servers;
        if (inFlight(k, t) < inFlight(s, t)) s = k;
      }
      looked = everyServer;
    } else {
      const a = Math.floor(rand() * servers);
      const b = (a + 1 + Math.floor(rand() * (servers - 1))) % servers;
      s = inFlight(b, t) < inFlight(a, t) ? b : a;
      looked = [a, b];
    }
    if (samples && i >= MID_RUN) {
      if (picks.length < PICKS) picks.push(s);
      if ((i - MID_RUN) % CHOICE_EVERY === 0 && choices.length < CHOICES) choices.push({ server: s, looked, inFlight: snapshot(t) });
    }
    const finish = Math.max(t, free[s]) + exp(serviceMs(s));
    free[s] = finish;
    finishes[s].push(finish);
    latencies.push(finish - t);
    finished.push(finish);
    if (s === 0) slow++;
    maxQueue = Math.max(maxQueue, inFlight(s, t));
  }
  // The last sample is the run's end, so the replay's last frame shows what the run's numbers describe.
  series.splice(Math.max(0, samples - 1));
  while (series.length < samples - 1) {
    const at = Math.min(t, sampleAt(series.length));
    series.push({ t: at, queues: snapshot(at) });
  }
  const end = snapshot(t);
  if (samples) series.push({ t, queues: end });
  const answered = samples ? answeredBySample(latencies, finished, series) : undefined;
  latencies.sort((a, b) => a - b);
  const run: BalanceRun = {
    meanMs: latencies.reduce((sum, v) => sum + v, 0) / LB_REQUESTS,
    p50Ms: latencies[Math.floor(LB_REQUESTS * 0.5)],
    p99Ms: latencies[Math.floor(LB_REQUESTS * 0.99)],
    slowShare: slow / LB_REQUESTS,
    slowCapacityShare: 1 / (LB_SERVICE_MS * slowdown) / capacity,
    maxQueue,
    slowQueueAtEnd: end[0],
    durationMs: t,
  };
  if (!samples) return run;
  const histogram = Array.from({ length: LB_HIST_BINS }, () => 0);
  for (const v of latencies) histogram[histogramBin(v)] += 1 / LB_REQUESTS;
  return { ...run, series, histogram, picks, choices, answered };
}

/** For each sample, the latencies of the requests answered by then: their histogram (as shares of all), p99 and mean. */
function answeredBySample(latencies: readonly number[], finished: readonly number[], series: readonly { t: number }[]) {
  const order = latencies.map((_, i) => i).sort((a, b) => finished[a] - finished[b]);
  const counts = Array.from({ length: LB_HIST_BINS }, () => 0);
  const p99 = new RunningPercentile(0.99);
  let [sum, next] = [0, 0];
  return series.map(({ t }) => {
    while (next < order.length && finished[order[next]] <= t) {
      const v = latencies[order[next++]];
      counts[histogramBin(v)]++;
      p99.add(v);
      sum += v;
    }
    return {
      histogram: counts.map((c) => c / LB_REQUESTS),
      p99Ms: p99.value(),
      meanMs: next ? sum / next : null,
    };
  });
}

/** p99 for every policy at every load the widget offers, for one fleet: the p99-against-load chart. */
export function balanceSweep(servers: number, slowdown: number): Record<Balancer, number[]> {
  const sweep = {} as Record<Balancer, number[]>;
  for (const policy of LB_POLICIES)
    sweep[policy] = LB_LOADS.map((load) => balanceRun(policy, { servers, load: load / 100, slowdown }).p99Ms);
  return sweep;
}
