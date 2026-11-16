import { LATENCY_QUEUE, LATENCY_SERVICE, LATENCY_SERVICE_MS, latencyScenario, latencySettings, type LatencySettings } from './queueing.js';

/** The sample's window of model time: the last 400 ms of a run in its steady state. */
export const LATENCY_WINDOW_MS = 400;
/** With no steady state the queue only grows: a longer window from empty shows the ramp. */
export const LATENCY_UNSTABLE_WINDOW_MS = 4_000;
/**
 * Just past capacity the queue's growth over 4 s is no larger than its wander, so the window runs on to the first of
 * these whose end stands within `LATENCY_RAMP_END` of the window's most: a queue the model says grows never reads as one
 * that recovers.
 */
export const LATENCY_UNSTABLE_WINDOWS_MS = [LATENCY_UNSTABLE_WINDOW_MS, 6_000, 8_000] as const;
export const LATENCY_RAMP_END = 0.9;
/** How many times slower than real time a free play shows its window: 400 ms in 10 s, or 4 s in 8 s. */
export const LATENCY_PLAY_SLOW = 25;
export const LATENCY_UNSTABLE_PLAY_SLOW = 2;
/**
 * An answer plays the 200 ms of its new sample that end at the rest moment, as slowly as a free play; with no steady
 * state, the whole window in real time.
 */
export const LATENCY_ANSWER_SLICE_MS = 200;
export const LATENCY_ANSWER_UNSTABLE_SLOW = 1;
/** Arrivals simulated before the window, so the window opens in the steady state. */
const WARM_ARRIVALS = 40_000;
/**
 * The seed, the most typical of the four in 1 to 60,000 that meet the hard bounds (`latency-sample.spec.ts`; the
 * design's `enum.cjs --search` reruns the search).
 */
export const LATENCY_SAMPLE_SEED = 26_159;

/**
 * `algorithms/random.ts`'s generator, copied: importing that one from a widget chunk splits it out of the app's main
 * bundle into a first-paint chunk of its own.
 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One request of the sample, its times in ms from the window's start; `id` is its place in the whole run. */
export interface SampledRequest {
  id: number;
  arrive: number;
  start: number;
  leave: number;
  server: number;
}

/**
 * The moment the stage shows at rest. `longest`: one shared queue's first moment at its longest. `idle`: with a queue
 * each, the longest single line (`line`) while a server that is up (`idle`) sat idle. `most`: the moment the most were
 * waiting. `end`: with no steady state, the window's end. `none`: nobody waited, so the window's end.
 */
export interface RestMoment {
  kind: 'none' | 'longest' | 'most' | 'idle' | 'end';
  t: number;
  n: number;
  total: number;
  line?: number;
  idle?: number;
}

export interface LatencySample {
  reqs: readonly SampledRequest[];
  window: number;
  up: number;
  stable: boolean;
  split: boolean;
  rest: RestMoment;
}

/** Each line's length and each server's state at window time `t` (one line when the queue is shared). */
export function linesAt(smp: Pick<LatencySample, 'reqs' | 'up'>, t: number): { lines: number[]; busy: boolean[]; total: number } {
  const lines = Array.from({ length: smp.up }, () => 0);
  const busy = Array.from({ length: smp.up }, () => false);
  let total = 0;
  for (const r of smp.reqs) {
    if (r.arrive > t || r.leave <= t) continue;
    if (r.start > t) {
      lines[r.server]++;
      total++;
    } else busy[r.server] = true;
  }
  return { lines, busy, total };
}

/** Who waits at window time `t` (in arrival order) and who is in service. */
export function sampleAt(smp: Pick<LatencySample, 'reqs'>, t: number): { waiting: SampledRequest[]; serving: SampledRequest[] } {
  const waiting: SampledRequest[] = [];
  const serving: SampledRequest[] = [];
  for (const r of smp.reqs) {
    if (r.arrive > t || r.leave <= t) continue;
    if (r.start > t) waiting.push(r);
    else serving.push(r);
  }
  return { waiting, serving };
}

/** The number waiting over the window, as `[time, count]` steps, for the timeline's area. */
export function waitingSteps(smp: Pick<LatencySample, 'reqs' | 'window'>): [number, number][] {
  const ev: [number, number][] = [];
  for (const r of smp.reqs)
    if (r.start > r.arrive + 1e-9) {
      ev.push([Math.max(0, r.arrive), 1]);
      ev.push([Math.max(0, r.start), -1]);
    }
  ev.sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  let n = 0;
  const steps: [number, number][] = [[0, 0]];
  for (const [x, d] of ev) {
    n += d;
    if (x > smp.window) break;
    const last = steps[steps.length - 1];
    if (last[0] === x) last[1] = n;
    else steps.push([x, n]);
  }
  return steps;
}

/**
 * The moment the stage shows at rest. One shared queue: the first moment its line was longest. A queue each: the
 * moment the longest single line waited while a server that is up sat idle, the mechanism a shared queue removes; if
 * no line ever waited beside an idle server, the moment the most were waiting. With no steady state, the window's end,
 * where its queue stands near its most.
 */
export function restMoment(smp: Omit<LatencySample, 'rest'>): RestMoment {
  const steps = waitingSteps(smp);
  const most = Math.max(0, ...steps.map((p) => p[1]));
  if (most === 0) return { kind: 'none', t: smp.window, n: 0, total: 0 };
  if (!smp.stable) {
    const t = smp.window - 1e-6;
    const { total } = linesAt(smp, t);
    return { kind: 'end', t, n: total, total };
  }
  const first = steps.find((p) => p[1] === most)![0] + 0.01;
  if (!smp.split) return { kind: 'longest', t: first, n: most, total: most };
  const times = new Set<number>();
  for (const r of smp.reqs) for (const x of [r.arrive, r.start, r.leave]) if (x >= 0 && x < smp.window) times.add(x);
  let best: RestMoment | null = null;
  for (const x of [...times].sort((a, b) => a - b)) {
    const t = x + 0.01;
    const { lines, busy, total } = linesAt(smp, t);
    const idle = busy.findIndex((b) => !b);
    if (idle < 0) continue;
    let k = 0;
    for (let j = 1; j < lines.length; j++) if (lines[j] > lines[k]) k = j;
    if (lines[k] > 0 && (!best || lines[k] > best.n)) best = { kind: 'idle', t, n: lines[k], line: k, idle, total };
  }
  return best ?? { kind: 'most', t: first, n: most, total: most };
}

/** The first window from empty at whose end the count waiting is within `LATENCY_RAMP_END` of its most, else the longest. */
function rampWindow(reqs: readonly SampledRequest[], up: number): number {
  return (
    LATENCY_UNSTABLE_WINDOWS_MS.find((w) => {
      const most = Math.max(0, ...waitingSteps({ reqs, window: w }).map((p) => p[1]));
      return linesAt({ reqs, up }, w - 1e-6).total >= LATENCY_RAMP_END * most;
    }) ?? LATENCY_UNSTABLE_WINDOWS_MS[LATENCY_UNSTABLE_WINDOWS_MS.length - 1]
  );
}

const samples = new Map<string, LatencySample>();

/**
 * A seeded run with common random numbers: the same stream of uniforms at every setting, so a higher load compresses the
 * same arrivals and no request waits less. The window is the 400 ms before the last of 40,000 arrivals; when the
 * servers that are up cannot keep up there is no steady state, and the window starts empty and runs 4 s, or longer
 * just past capacity (`LATENCY_UNSTABLE_WINDOWS_MS`). Memoized.
 */
export function latencySample(settings: Partial<LatencySettings>, seed = LATENCY_SAMPLE_SEED): LatencySample {
  const s = latencySettings(settings);
  const key = `${latencyScenario(s).key}|${seed}`;
  const hit = samples.get(key);
  if (hit) return hit;
  const m = latencyScenario(s);
  const up = m.up;
  const lambda = m.ratePerS / 1000;
  const rand = mulberry32(seed * 7919 + 13);
  const stable = m.stable;
  const longest = stable ? LATENCY_WINDOW_MS : LATENCY_UNSTABLE_WINDOWS_MS[LATENCY_UNSTABLE_WINDOWS_MS.length - 1];
  const n = stable ? WARM_ARRIVALS : Math.ceil(lambda * longest * 1.3) + 50;
  const steady = s.service === LATENCY_SERVICE.steady;
  const split = s.queue === LATENCY_QUEUE.split && up > 1;
  const arrive = new Float64Array(n);
  const work = new Float64Array(n);
  const route = new Float64Array(n);
  let t = 0;
  for (let i = 0; i < n; i++) {
    const u1 = rand();
    const u2 = rand();
    const u3 = rand();
    t += -Math.log(1 - u1) / lambda;
    arrive[i] = t;
    work[i] = steady ? LATENCY_SERVICE_MS : -LATENCY_SERVICE_MS * Math.log(1 - u2);
    route[i] = u3;
  }
  const startAt = new Float64Array(n);
  const leaveAt = new Float64Array(n);
  const server = new Int32Array(n);
  const free = new Float64Array(up);
  for (let i = 0; i < n; i++) {
    let k = 0;
    if (split) k = Math.min(up - 1, Math.floor(route[i] * up));
    else for (let j = 1; j < up; j++) if (free[j] < free[k] - 1e-12) k = j;
    const st = Math.max(arrive[i], free[k]);
    startAt[i] = st;
    leaveAt[i] = st + work[i];
    free[k] = leaveAt[i];
    server[i] = k;
  }
  const t0 = stable ? arrive[n - 1] - longest : arrive[0] - 1e-9;
  const all: SampledRequest[] = [];
  for (let i = 0; i < n; i++) {
    if (arrive[i] > t0 + longest) break;
    if (leaveAt[i] <= t0) continue;
    all.push({ id: i, arrive: arrive[i] - t0, start: startAt[i] - t0, leave: leaveAt[i] - t0, server: server[i] });
  }
  // At exactly 100% the queue wanders with no trend, so there is no growth for a longer window to show.
  const win = stable ? longest : Math.abs(m.rho - 1) < 1e-9 ? LATENCY_UNSTABLE_WINDOW_MS : rampWindow(all, up);
  const reqs = all.filter((r) => r.arrive <= win);
  const bare = { reqs, window: win, up, stable, split };
  const out = { ...bare, rest: restMoment(bare) };
  samples.set(key, out);
  return out;
}

/** A play's clock: which window times it runs over and how many times slower than real time. */
export interface PlayPlan {
  from: number;
  to: number;
  rate: number;
}

/** A free play runs the whole window; an answer's play, the slice that ends at its rest moment (its climax). */
export function playPlan(smp: LatencySample, answer: boolean): PlayPlan {
  if (!smp.stable) return { from: 0, to: smp.window, rate: answer ? LATENCY_ANSWER_UNSTABLE_SLOW : LATENCY_UNSTABLE_PLAY_SLOW };
  if (!answer) return { from: 0, to: smp.window, rate: LATENCY_PLAY_SLOW };
  const to = smp.rest.kind === 'none' ? smp.window : smp.rest.t;
  return { from: Math.max(0, to - LATENCY_ANSWER_SLICE_MS), to, rate: LATENCY_PLAY_SLOW };
}

/** The window's own averages, for the seed's bounds only: never shown as a model number. */
export function sampleStats(smp: LatencySample): { busy: number; waiting: number } {
  const W = smp.window;
  let busy = 0;
  let waitArea = 0;
  for (const r of smp.reqs) {
    busy += Math.max(0, Math.min(W, r.leave) - Math.max(0, r.start));
    waitArea += Math.max(0, Math.min(W, r.start) - Math.max(0, r.arrive));
  }
  return { busy: busy / (W * smp.up), waiting: waitArea / W };
}
