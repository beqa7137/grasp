import { describe, expect, it } from 'vitest';
import {
  LATENCY_ANSWER_SLICE_MS,
  LATENCY_RAMP_END,
  LATENCY_SAMPLE_SEED,
  LATENCY_UNSTABLE_WINDOWS_MS,
  LATENCY_UNSTABLE_WINDOW_MS,
  latencySample,
  linesAt,
  playPlan,
  sampleAt,
  sampleStats,
  waitingSteps,
  type LatencySample,
} from './latency-sample.js';
import {
  LATENCY_LOADS,
  LATENCY_QUEUE,
  LATENCY_SERVICE,
  LATENCY_SETTINGS as ALL,
  latencyScenario,
  type LatencySettings,
} from './queueing.js';

const { shared, split } = LATENCY_QUEUE;
const { random, steady } = LATENCY_SERVICE;
const at = (s: Partial<LatencySettings>): LatencySettings => ({ load: 70, servers: 1, queue: shared, service: random, down: 0, ...s });
const label = (s: LatencySettings) => `${s.servers} ${s.queue ? 'each' : 'shared'} ${s.service ? 'steady' : 'random'} ${s.load}%`;

/** The settings the experiments show: setups, acts and the challenge's solution. */
const BUSY_AT = [
  at({ load: 50 }),
  at({ load: 70 }),
  at({ load: 90 }),
  at({ load: 80, servers: 4, queue: split }),
  at({ load: 80, servers: 4 }),
  at({ load: 90, service: steady }),
  at({ load: 80, servers: 3 }),
  at({ load: 60, servers: 4, down: 1 }),
];
const RAMPS = [at({ load: 80, servers: 3, down: 1 }), at({ load: 60, servers: 2, queue: split, down: 1 })];
const ANSWERS = [at({ load: 50 }), at({ load: 90 }), at({ load: 80, servers: 4 }), at({ load: 90, service: steady })];
const waitingAt = (smp: LatencySample, t: number) =>
  waitingSteps(smp)
    .filter((p) => p[0] <= t)
    .at(-1)![1];

/** A ramp: the count waiting rises every second, ends at 0.8 of its most or more, and within 25% of the model's drift. */
function ramp(s: LatencySettings, seed: number) {
  const smp = latencySample(s, seed);
  const atSecond = [1000, 2000, 3000, 4000].map((t) => waitingAt(smp, t - 1e-6));
  const most = Math.max(...waitingSteps(smp).map((p) => p[1]));
  const m = latencyScenario(s);
  const drift = m.stable ? 0 : (m.growthPerS * smp.window) / 1000;
  const rises = atSecond.every((v, i) => i === 0 || v > atSecond[i - 1]);
  return { atSecond, ok: rises && atSecond[3] >= 0.8 * most && Math.abs(atSecond[3] - drift) <= 0.25 * drift };
}

/** The hard bounds a seed meets before typicality decides (the design's `enum.cjs` searched 1 to 60,000 against them). */
function bounds(seed: number) {
  const busy = BUSY_AT.map((s) => (sampleStats(latencySample(s, seed)).busy - latencyScenario(s).rho) * 100);
  const pool = latencySample(at({ load: 80, servers: 4, queue: split }), seed).rest;
  return {
    busy: busy.every((g) => Math.abs(g) <= 7),
    pool: pool.kind === 'idle' && pool.n >= 8,
    ramps: RAMPS.every((s) => ramp(s, seed).ok),
    answers: ANSWERS.every((s) => latencySample(s, seed).rest.t >= LATENCY_ANSWER_SLICE_MS),
  };
}

/** How far a window sits from the model: its busy share against ρ and its mean queue against λW_q. */
function gap(s: LatencySettings, seed: number) {
  const m = latencyScenario(s);
  if (!m.stable) return 0;
  const st = sampleStats(latencySample(s, seed));
  return Math.abs(st.busy - m.rho) + Math.abs(Math.log((st.waiting + 0.25) / (m.waiting + 0.25))) / 3;
}
function score(seed: number) {
  let all = 0;
  let worst = 0;
  for (const s of ALL) {
    const g = gap(s, seed);
    all += g;
    worst = Math.max(worst, g);
  }
  const key = BUSY_AT.reduce((t, s) => t + gap(s, seed), 0) / BUSY_AT.length;
  return all / ALL.length + key + worst / 4;
}

describe('the seeded sample', () => {
  it('meets every hard bound with its seed, and so do the other three seeds the search found', () => {
    for (const seed of [26_159, 27_425, 30_512, 57_837])
      expect(bounds(seed), `seed ${seed}`).toEqual({ busy: true, pool: true, ramps: true, answers: true });
    expect(LATENCY_SAMPLE_SEED).toBe(26_159);
  });

  it('is the most typical of the four over every stable setting and the experiments', () => {
    const scored = [26_159, 27_425, 30_512, 57_837].map((seed) => ({ seed, score: score(seed) })).sort((a, b) => a.score - b.score);
    expect(scored[0].seed).toBe(LATENCY_SAMPLE_SEED);
  }, 120_000);

  it('runs its busy share within 7 points of the utilization at every experiment setting', () => {
    const gaps = BUSY_AT.map((s) => Math.round((sampleStats(latencySample(s)).busy - latencyScenario(s).rho) * 1000) / 10);
    expect(gaps).toEqual([-0.2, -4.7, -1.3, -0.1, -3, -5.3, -1.8, -1.8]);
  });

  it('ramps after a failure with the waiting count each second, against the model drift', () => {
    expect(RAMPS.map((s) => ramp(s, LATENCY_SAMPLE_SEED).atSecond)).toEqual([
      [45, 100, 134, 144],
      [24, 46, 85, 99],
    ]);
  });

  it('rests E3 on S1 idle beside S3 with a line of 16, and every other window on its own moment', () => {
    const pool = latencySample(at({ load: 80, servers: 4, queue: split }));
    expect(pool.rest).toMatchObject({ kind: 'idle', n: 16, line: 2, idle: 0, total: 16 });
    expect(pool.rest.t).toBeCloseTo(397.8, 1);
    const { lines, busy } = linesAt(pool, pool.rest.t);
    expect(busy[0]).toBe(false);
    expect(lines[2]).toBe(16);
    expect(latencySample(at({ load: 70 })).rest).toMatchObject({ kind: 'longest', n: 10 });
    expect(latencySample(at({ load: 70 })).rest.t).toBeCloseTo(301.4, 1);
    let idle = 0;
    let none = 0;
    for (const s of ALL) {
      const smp = latencySample(s);
      if (smp.rest.kind === 'none') {
        none++;
        expect(Math.max(...waitingSteps(smp).map((p) => p[1]))).toBe(0);
      }
      if (smp.rest.kind === 'idle') {
        idle++;
        const l = linesAt(smp, smp.rest.t);
        expect(l.busy[smp.rest.idle!]).toBe(false);
        expect(l.lines[smp.rest.line!]).toBe(smp.rest.n);
      }
    }
    expect(idle).toBe(97);
    expect(none).toBeGreaterThan(0);
  });

  it('rests every window with no steady state on its end, never a peak the queue falls back from', () => {
    const unstable = ALL.filter((s) => !latencyScenario(s).stable);
    expect(unstable).toHaveLength(92);
    const longer: string[] = [];
    for (const s of unstable) {
      const m = latencyScenario(s);
      const smp = latencySample(s);
      const end = linesAt(smp, smp.window - 1e-6).total;
      expect(smp.rest, m.key).toMatchObject({ kind: 'end', n: end, total: end });
      expect(smp.rest.t).toBeCloseTo(smp.window, 3);
      expect(LATENCY_UNSTABLE_WINDOWS_MS, m.key).toContain(smp.window);
      if (Math.abs(m.rho - 1) < 1e-9) {
        expect(smp.window, `${m.key}: no trend to wait for`).toBe(LATENCY_UNSTABLE_WINDOW_MS);
        continue;
      }
      // The picture agrees with the words: the queue ends within a tenth of its most, in the shortest window that does.
      const ends = (w: number) => {
        const cut = { reqs: smp.reqs.filter((r) => r.arrive <= w), window: w, up: smp.up };
        return linesAt(cut, w - 1e-6).total >= LATENCY_RAMP_END * Math.max(...waitingSteps(cut).map((p) => p[1]));
      };
      expect(ends(smp.window), m.key).toBe(true);
      for (const w of LATENCY_UNSTABLE_WINDOWS_MS.filter((x) => x < smp.window)) expect(ends(w), `${m.key} at ${w} ms`).toBe(false);
      if (smp.window > LATENCY_UNSTABLE_WINDOW_MS) longer.push(`${label(s)}: ${smp.window / 1000} s`);
    }
    expect(longer).toEqual([
      '3 shared random 70%: 8 s',
      '3 shared random 75%: 6 s',
      '3 shared steady 70%: 8 s',
      '3 each random 70%: 6 s',
      '3 each random 75%: 6 s',
      '3 each steady 70%: 6 s',
      '4 shared random 80%: 6 s',
    ]);
    const over = latencySample(at({ load: 70, servers: 3, down: 1 }));
    expect([over.rest.n, Math.max(...waitingSteps(over).map((p) => p[1]))]).toEqual([88, 89]);
  });

  it('never lets a request wait less at a higher load, request by request (common random numbers)', () => {
    for (const service of [random, steady]) {
      let prev: LatencySample | null = null;
      for (const load of LATENCY_LOADS) {
        const smp = latencySample(at({ load, service }));
        if (prev) {
          const before = new Map(prev.reqs.map((r) => [r.id, r.start - r.arrive]));
          const worse = smp.reqs.filter((r) => before.has(r.id) && r.start - r.arrive < before.get(r.id)! - 1e-6);
          expect(worse, `${load}%`).toEqual([]);
        }
        prev = smp;
      }
    }
  });

  it('plays each answer as the 200 ms ending at its rest moment, 25× slower, and an unstable window whole in real time', () => {
    const plans = [...ANSWERS, at({ load: 80, servers: 3, down: 1 })].map((s) => playPlan(latencySample(s), true));
    expect(plans.map((p) => [Math.round(p.from * 10) / 10, Math.round(p.to * 10) / 10, p.rate])).toEqual([
      [62, 262, 25],
      [123.3, 323.3, 25],
      [178.4, 378.4, 25],
      [123.3, 323.3, 25],
      [0, 4000, 1],
    ]);
    expect(playPlan(latencySample(at({})), false)).toEqual({ from: 0, to: 400, rate: 25 });
    expect(playPlan(latencySample(RAMPS[0]), false)).toEqual({ from: 0, to: 4000, rate: 2 });
  });

  it('counts who waits and who is served at a moment in arrival order', () => {
    const smp = latencySample(at({ load: 70 }));
    const { waiting, serving } = sampleAt(smp, smp.rest.t);
    expect(waiting).toHaveLength(10);
    expect(serving).toHaveLength(1);
    expect(waiting.every((r, i) => i === 0 || r.arrive >= waiting[i - 1].arrive)).toBe(true);
    const steps = waitingSteps(smp);
    expect(steps[0][0]).toBe(0);
    expect(steps.every(([t, n], i) => n >= 0 && (i === 0 || t > steps[i - 1][0]))).toBe(true);
  });
});
