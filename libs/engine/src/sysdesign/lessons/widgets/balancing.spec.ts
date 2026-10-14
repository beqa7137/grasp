import { describe, expect, it } from 'vitest';
import { balanceRun, balanceSweep } from './balancing.js';
import { LB_HIST_BINS, LB_LOADS, LB_POLICIES, LB_SERVER_SNAPS, LB_SLOWDOWNS, histogramBin, histogramEdges } from './balancing-settings.js';
import { lbSweep } from './balancing-sweeps.js';

const fleet = { servers: 10, load: 0.7, slowdown: 1 };

describe('balance run', () => {
  it('matches a single server queue when picking at random: about 10 / (1 - 0.7) = 33 ms on average', () => {
    expect(balanceRun('random', fleet).meanMs).toBeCloseTo(33, -1);
  });

  it('orders the balancers by how much they know: least connections, then two choices, round-robin and random', () => {
    const mean = (b: Parameters<typeof balanceRun>[0]) => balanceRun(b, { ...fleet, load: 0.9 }).meanMs;
    expect(mean('least-connections')).toBeLessThan(mean('two-choices'));
    expect(mean('two-choices')).toBeLessThan(mean('round-robin'));
    expect(mean('round-robin')).toBeLessThan(mean('random'));
  });

  it('keeps feeding a slow server its equal share by turn, so its queue grows without bound, where counting in-flight work backs off', () => {
    const slow = { ...fleet, slowdown: 5 };
    const turns = balanceRun('round-robin', slow);
    expect(turns.slowShare).toBeCloseTo(0.1, 3);
    expect(turns.p99Ms).toBeGreaterThan(10_000);
    const counted = balanceRun('least-connections', slow);
    expect(counted.slowShare).toBeLessThan(0.05);
    expect(counted.p99Ms).toBeLessThan(200);
  });

  it('is the same run for the same seed', () => {
    expect(balanceRun('two-choices', fleet)).toEqual(balanceRun('two-choices', fleet));
  });

  it('records what the widget draws without changing the run', () => {
    const slow = { ...fleet, slowdown: 5 };
    const plain = balanceRun('round-robin', slow);
    const drawn = balanceRun('round-robin', slow, { samples: 60 });
    const bare = { series: undefined, histogram: undefined, picks: undefined, choices: undefined, answered: undefined };
    expect({ ...drawn, ...bare }).toEqual({ ...plain, ...bare });
    expect(drawn.series).toHaveLength(60);
    expect(drawn.series![0].queues).toEqual(Array(10).fill(0));
    const last = drawn.series!.at(-1)!;
    expect(last.t).toBe(drawn.durationMs);
    expect(last.queues[0]).toBe(drawn.slowQueueAtEnd);
    expect(last.queues[0]).toBeGreaterThan(1_000);
    expect(drawn.series!.every((s, i) => i === 0 || s.t >= drawn.series![i - 1].t)).toBe(true);
    expect(Math.max(...last.queues.slice(1))).toBeLessThan(20);
    expect(drawn.histogram).toHaveLength(LB_HIST_BINS);
    expect(drawn.histogram!.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 9);
    expect(drawn.picks!.filter((s) => s === 0).length).toBe(20);
    // Answered so far: nothing at the start, and the slow server's tail arrives late.
    const answered = drawn.answered!;
    expect(answered[0].p99Ms).toBeNull();
    expect(answered[0].meanMs).toBeNull();
    // So far, the mean and p99 come from the same requests: the mean never exceeds the p99.
    for (const a of answered.slice(1)) expect(a.meanMs!).toBeLessThanOrEqual(a.p99Ms!);
    expect(answered[15].meanMs!).toBeLessThan(drawn.meanMs);
    const sum = (h: number[]) => h.reduce((a, b) => a + b, 0);
    expect(sum(answered[30].histogram)).toBeLessThan(sum(answered[59].histogram));
    expect(answered[15].p99Ms!).toBeLessThan(answered[59].p99Ms!);
    expect(answered[59].p99Ms!).toBeLessThanOrEqual(drawn.p99Ms);
  });

  it('shows what each policy looked at when it chose', () => {
    const [rr, lc, two] = (['round-robin', 'least-connections', 'two-choices'] as const).map(
      (p) => balanceRun(p, fleet, { samples: 2 }).choices!,
    );
    for (const c of rr) expect(c.looked).toEqual([c.server]);
    expect(balanceRun('least-connections', fleet).slowShare).toBeCloseTo(0.1, 2);
    for (const c of lc) {
      expect(c.looked).toHaveLength(10);
      expect(c.inFlight[c.server]).toBe(Math.min(...c.inFlight));
    }
    for (const c of two) {
      expect(c.looked).toHaveLength(2);
      expect(c.looked).toContain(c.server);
      expect(c.inFlight[c.server]).toBe(Math.min(...c.looked.map((s) => c.inFlight[s])));
    }
  });

  it('bins latencies four to a decade from 1 ms to 1,000 s', () => {
    expect([histogramBin(0.5), histogramBin(1), histogramBin(10), histogramBin(99), histogramBin(5e9)]).toEqual([0, 0, 4, 7, 23]);
    expect(histogramEdges(4)[0]).toBeCloseTo(10);
  });

  it('sweeps p99 for every policy across every load, with the round-robin cliff once a slow server is overfed', () => {
    const sweep = balanceSweep(10, 2);
    for (const p of LB_POLICIES) expect(sweep[p]).toHaveLength(LB_LOADS.length);
    expect(sweep['round-robin'][0]).toBeLessThan(1_000);
    expect(sweep['round-robin'][4]).toBeGreaterThan(5_000);
    expect(Math.max(...sweep['least-connections'])).toBeLessThan(200);
  });

  it('keeps a table of every sweep the widget draws, the same as balanceSweep gives', () => {
    for (const servers of LB_SERVER_SNAPS)
      for (const slowdown of LB_SLOWDOWNS) {
        const sweep = balanceSweep(servers, slowdown);
        const table = lbSweep(servers, slowdown)!;
        for (const p of LB_POLICIES) expect(table[p], `${servers}x${slowdown} ${p}`).toEqual(sweep[p].map((v) => Math.round(v * 10) / 10));
      }
  }, 30_000);
});
