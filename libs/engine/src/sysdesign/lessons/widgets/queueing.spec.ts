import { describe, expect, it } from 'vitest';
import { mulberry32 } from '../../../algorithms/random.js';
import {
  LATENCY_LOADS,
  LATENCY_QUEUE,
  LATENCY_SERVERS,
  LATENCY_SERVICE,
  LATENCY_SERVICE_MS,
  LATENCY_SETTINGS,
  erlangC,
  idleBesideShare,
  latencyCurve,
  latencyScenario,
  mdcLatency,
  type LatencySettings,
} from './queueing.js';

const S = LATENCY_SERVICE_MS;
const { shared, split } = LATENCY_QUEUE;
const { random, steady } = LATENCY_SERVICE;
const rel = (a: number, b: number) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-12);
const run = (s: Partial<LatencySettings>) => latencyScenario(s);
const stable = (s: Partial<LatencySettings>) => {
  const m = run(s);
  if (!m.stable) throw new Error(`no steady state at ${m.key}`);
  return m;
};

/** Every configuration the widget can show: one server has one queue and none to lose. */
const CONFIGS: Omit<LatencySettings, 'load'>[] = LATENCY_SETTINGS.filter((s) => s.load === LATENCY_LOADS[0]).map((s) => ({
  servers: s.servers,
  queue: s.queue,
  service: s.service,
  down: s.down,
}));

describe('the exact queueing model', () => {
  it('covers 26 configurations and 364 settings, each once', () => {
    expect(CONFIGS).toHaveLength(26);
    expect(LATENCY_SETTINGS).toHaveLength(364);
    expect(new Set(LATENCY_SETTINGS.map((s) => latencyScenario(s).key)).size).toBe(364);
    const one = LATENCY_SETTINGS.filter((s) => s.servers === 1);
    expect(one.every((s) => s.queue === shared && !s.down)).toBe(true);
    for (const servers of LATENCY_SERVERS.slice(1))
      expect(LATENCY_SETTINGS.filter((s) => s.servers === servers && s.queue === split && s.down && s.service === steady)).toHaveLength(14);
  });

  it('is M/M/1 for one server: mean S / (1 − ρ), p50 and p99 its ln 2 and ln 100 multiples, P(wait) = ρ', () => {
    for (const load of LATENCY_LOADS) {
      const m = stable({ load });
      const rho = load / 100;
      const mean = S / (1 - rho);
      expect(rel(m.mean, mean), `${load}%`).toBeLessThan(1e-12);
      expect(rel(m.p50, mean * Math.LN2), `${load}%`).toBeLessThan(1e-8);
      expect(rel(m.p99, mean * Math.log(100)), `${load}%`).toBeLessThan(1e-8);
      expect(rel(m.waitChance, rho), `${load}%`).toBeLessThan(1e-12);
      expect(rel(m.p99 / m.p50, Math.log(100) / Math.LN2)).toBeLessThan(1e-6);
    }
  });

  it('is Pollaczek-Khinchine for one steady server: mean wait ρS / (2(1 − ρ)), P(wait) = ρ', () => {
    for (const load of LATENCY_LOADS) {
      const m = stable({ load, service: steady });
      const rho = load / 100;
      expect(rel(m.meanWait, (rho * S) / (2 * (1 - rho))), `${load}%`).toBeLessThan(1e-9);
      expect(rel(m.waitChance, rho), `${load}%`).toBeLessThan(1e-9);
    }
  });

  it('gives Erlang C its known values', () => {
    expect(erlangC(1, 0.5)).toBeCloseTo(0.5, 12);
    expect(erlangC(2, 1)).toBeCloseTo(1 / 3, 12);
    // 4 servers at 80%: a = 3.2 erlangs.
    expect(erlangC(4, 3.2)).toBeCloseTo(0.596432, 6);
  });

  it("matches Erlang's 1909 M/D/1 waiting-time formula, evaluated exactly in BigInt fixed point", () => {
    const DIGITS = 160n;
    const SCALE = 10n ** DIGITS;
    const fact = [1n];
    for (let i = 1; i <= 120; i++) fact.push(fact[i - 1] * BigInt(i));
    // e^(p/q) in fixed point: halve until small, sum the series, square back.
    const expFixed = (p: bigint, q: bigint) => {
      let s = 0;
      while (p > (q * 2n ** BigInt(s)) / 4n) s++;
      const den = q * 2n ** BigInt(s);
      let term = SCALE;
      let sum = SCALE;
      for (let n = 1n; n < 120n; n++) {
        term = (term * p) / (den * n);
        if (term === 0n) break;
        sum += term;
      }
      for (let i = 0; i < s; i++) sum = (sum * sum) / SCALE;
      return sum;
    };
    // P(W ≤ xD) = (1 − ρ) Σ_{k=0}^{⌊x⌋} (ρ(k − x))^k / k! e^(−ρ(k − x)), ρ = rn/rd, x = xn/xd; its terms cancel to 40 digits.
    const erlang = (rn: bigint, rd: bigint, xn: bigint, xd: bigint) => {
      let sum = 0n;
      for (let k = 0n; k <= xn / xd; k++) {
        const yn = rn * (xn - k * xd);
        const yd = rd * xd;
        const pw = (yn ** k * SCALE) / (yd ** k * fact[Number(k)]);
        const term = (pw * expFixed(yn, yd)) / SCALE;
        sum += k % 2n === 0n ? term : -term;
      }
      return Number((sum * (rd - rn) * 10n ** 15n) / (rd * SCALE)) / 1e15;
    };
    let worst = 0;
    for (const load of [10, 50, 70, 90, 95, 98]) {
      const d = mdcLatency(1, load / 100 / S);
      for (const x of [0, 0.5, 1, 2.5, 4, 7.5, 12, 20, 33.5, 60, 100]) {
        const exact = erlang(BigInt(load), 100n, BigInt(Math.round(x * 10)), 10n);
        worst = Math.max(worst, Math.abs(exact - (1 - d.waitTail(x * S))));
      }
    }
    expect(worst).toBeLessThan(1e-9);
  });

  it('makes a queue each M/M/1 or M/D/1 at each server, and one shared queue never wait longer, steady never longer than random', () => {
    for (const load of LATENCY_LOADS) {
      const one = stable({ load });
      for (const c of [2, 3, 4]) {
        expect(rel(stable({ load, servers: c, queue: split }).p99, one.p99)).toBeLessThan(1e-9);
        const sh = stable({ load, servers: c });
        expect(sh.meanWait).toBeLessThanOrEqual(one.meanWait + 1e-12);
        expect(sh.p99).toBeLessThanOrEqual(one.p99 + 1e-9);
        expect(stable({ load, servers: c, service: steady }).meanWait).toBeLessThanOrEqual(sh.meanWait + 1e-12);
        // Little's law: in the system = waiting + busy servers.
        expect(rel(sh.inSystem, sh.waiting + (load / 100) * c)).toBeLessThan(1e-9);
      }
    }
  });

  it("nearly halves a pool's wait with steady work (0.5 to 0.65 of random), and exactly halves one server's", () => {
    for (const c of [2, 3, 4])
      for (const load of [30, 60, 80, 90]) {
        const r = stable({ load, servers: c, service: steady }).meanWait / stable({ load, servers: c }).meanWait;
        expect(r, `${c} at ${load}%`).toBeGreaterThan(0.5);
        expect(r, `${c} at ${load}%`).toBeLessThan(0.65);
      }
    expect(rel(stable({ load: 90, service: steady }).meanWait, stable({ load: 90 }).meanWait / 2)).toBeLessThan(1e-9);
  });

  it('raises p99 with load in every configuration, puts p50 under it and p99 between the 99th and 100th request', () => {
    for (const cfg of CONFIGS) {
      let last = 0;
      for (const load of LATENCY_LOADS) {
        const m = run({ ...cfg, load });
        if (!m.stable) break;
        expect(m.p99 >= last - 1e-9 && (m.p99 > last || m.p99 - S < 1e-6), `${m.key}`).toBe(true);
        expect(m.p50).toBeLessThanOrEqual(m.p99);
        expect(m.dots).toHaveLength(100);
        expect(m.dots.every((v, i) => i === 0 || v >= m.dots[i - 1])).toBe(true);
        expect(m.dots[98]).toBeLessThanOrEqual(m.p99);
        expect(m.dots[99]).toBeGreaterThanOrEqual(m.p99);
        last = m.p99;
      }
    }
  });

  it('has no steady state past capacity, growing by λ − m/S, and none at exactly 100%, where nothing drifts', () => {
    const lose = run({ servers: 3, load: 80, down: 1 });
    if (lose.stable) throw new Error('two of three at 120% settle');
    expect(rel(lose.rho, 1.2)).toBeLessThan(1e-9);
    expect(rel(lose.growthPerS, 40)).toBeLessThan(1e-9);
    const critical: string[] = [];
    for (const cfg of CONFIGS.filter((c) => c.down))
      for (const load of LATENCY_LOADS) {
        const m = run({ ...cfg, load });
        if (Math.abs(m.rho - 1) < 1e-9) {
          critical.push(`${cfg.servers}/${load}`);
          expect(m.stable).toBe(false);
          expect(m.stable ? NaN : Math.abs(m.growthPerS)).toBeLessThan(1e-9);
        }
      }
    // Two servers at 50% and four at 75%, with one down, in each of their four configurations.
    expect(critical.sort()).toEqual(['2/50', '2/50', '2/50', '2/50', '4/75', '4/75', '4/75', '4/75']);
    expect(CONFIGS.flatMap((cfg) => LATENCY_LOADS.map((load) => run({ ...cfg, load }))).filter((m) => !m.stable)).toHaveLength(92);
  });

  it("reads one server's settings as one queue with none down", () => {
    expect(run({ servers: 1, queue: split, down: 1, load: 50 }).settings).toEqual({
      load: 50,
      servers: 1,
      queue: shared,
      service: random,
      down: 0,
    });
  });

  it('draws 90 curve points per configuration up to 99.5%, agreeing with the scenario at the same utilization', () => {
    const curve = latencyCurve({ servers: 4, queue: shared });
    expect(curve).toHaveLength(90);
    expect(curve.at(-1)!.rho).toBeCloseTo(0.995, 12);
    expect(latencyCurve({ servers: 4, queue: shared, load: 30 })).toBe(curve);
    const one = latencyCurve({});
    const at = one.find((p) => Math.abs(p.rho - 0.5) < 0.006)!;
    expect(rel(at.p99, (S / (1 - at.rho)) * Math.log(100))).toBeLessThan(1e-8);
  });
});

/** A discrete-event FCFS simulation, apart from the sample's code: Poisson arrivals, random or steady work. */
function simulate(s: Partial<LatencySettings>, n: number, seed: number) {
  const m = run(s);
  const lambda = m.ratePerS / 1000;
  const rand = mulberry32(seed);
  const free = new Float64Array(m.up);
  const resp = new Float64Array(n);
  let t = 0;
  let waited = 0;
  const warm = Math.floor(n / 10);
  for (let i = 0; i < n + warm; i++) {
    t += -Math.log(1 - rand()) / lambda;
    const work = m.settings.service === steady ? S : -S * Math.log(1 - rand());
    let k = 0;
    if (m.settings.queue === split && m.up > 1) k = Math.min(m.up - 1, Math.floor(rand() * m.up));
    else for (let j = 1; j < m.up; j++) if (free[j] < free[k]) k = j;
    const start = Math.max(t, free[k]);
    free[k] = start + work;
    if (i >= warm) {
      resp[i - warm] = start + work - t;
      if (start > t) waited++;
    }
  }
  const sorted = resp.sort();
  return {
    mean: sorted.reduce((a, b) => a + b, 0) / n,
    p50: sorted[Math.floor(0.5 * n)],
    p99: sorted[Math.floor(0.99 * n)],
    waitChance: waited / n,
  };
}

describe('the model against a simulation', () => {
  it('agrees with a discrete-event simulation of every configuration at 30% and 80%, within tolerances that widen with 1 / (1 − ρ)', () => {
    let seed = 1234;
    let runs = 0;
    for (const cfg of CONFIGS)
      for (const load of [30, 80]) {
        const m = run({ ...cfg, load });
        if (!m.stable) continue;
        const n = Math.min(1.2e6, Math.round(300_000 * Math.max(1, 0.04 / (1 - m.rho) ** 2)));
        const sim = simulate(m.settings, n, seed++);
        runs++;
        const tol = 0.02 + 0.02 / (1 - m.rho);
        expect(rel(sim.mean, m.mean), `mean ${m.key}`).toBeLessThan(tol);
        expect(rel(sim.p50, m.p50), `p50 ${m.key}`).toBeLessThan(tol);
        expect(rel(sim.p99, m.p99), `p99 ${m.key}`).toBeLessThan(1.5 * tol);
        expect(Math.abs(sim.waitChance - m.waitChance), `wait ${m.key}`).toBeLessThan(0.01 + 0.01 / (1 - m.rho));
      }
    expect(runs).toBe(40);
  }, 120_000);

  it('puts an idle server beside a waiting request 57.4% of the time at 4 servers, 80%, a queue each, as four simulated queues do', () => {
    const rho = 0.8;
    const c = 4;
    const lambda = rho / S;
    const mu = 1 / S;
    const rand = mulberry32(97);
    const n = Array.from({ length: c }, () => 0);
    let t = 0;
    let hit = 0;
    while (t < 3e6) {
      const rate = c * lambda + n.filter((k) => k > 0).length * mu;
      const dt = -Math.log(1 - rand()) / rate;
      if (n.some((k) => k === 0) && n.some((k) => k >= 2)) hit += dt;
      t += dt;
      let u = rand() * rate;
      for (let i = 0; i < c; i++) {
        if (u < lambda) {
          n[i]++;
          break;
        }
        u -= lambda;
        if (n[i] > 0) {
          if (u < mu) {
            n[i]--;
            break;
          }
          u -= mu;
        }
      }
    }
    expect(idleBesideShare(rho, c)).toBeCloseTo(0.574259, 5);
    expect(Math.abs(hit / t - idleBesideShare(rho, c))).toBeLessThan(0.015);
  });
});
