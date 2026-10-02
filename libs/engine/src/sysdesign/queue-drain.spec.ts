import { describe, expect, it } from 'vitest';
import { drainQueues, type QueueDemand } from './queue-drain.js';
import { evaluate, getScenario } from './scenarios.js';
import { simulate } from './simulate.js';
import type { Design } from './types.js';

/** Every subset of the remaining queues, the densest first: exact, exponential, so only for checking. */
function reference(queues: QueueDemand[], capacity: (w: string) => number) {
  const taken = new Set<string>();
  const blocks: { queues: string[]; ratio: number }[] = [];
  const load = new Map<string, number>();
  let growth = 0;
  let worst = 0;
  let remaining = queues.filter((q) => q.incoming > 0);
  while (remaining.length) {
    let best: { set: QueueDemand[]; workers: string[]; ratio: number } | undefined;
    for (let mask = 1; mask < 1 << remaining.length; mask++) {
      const set = remaining.filter((_, i) => mask & (1 << i));
      const workers = [...new Set(set.flatMap((q) => q.workers))].filter((w) => !taken.has(w) && capacity(w) > 0);
      const rate = workers.reduce((s, w) => s + capacity(w), 0);
      const ratio = rate > 0 ? set.reduce((s, q) => s + q.incoming, 0) / rate : Number.POSITIVE_INFINITY;
      const tie =
        best &&
        (ratio === best.ratio ||
          (Number.isFinite(ratio) && Number.isFinite(best.ratio) && Math.abs(ratio - best.ratio) <= 1e-9 * best.ratio));
      if (!best || (tie ? set.length > best.set.length : ratio > best.ratio)) best = { set, workers, ratio };
    }
    const { set, workers, ratio } = best!;
    const inflow = set.reduce((s, q) => s + q.incoming, 0);
    const rate = workers.reduce((s, w) => s + capacity(w), 0);
    growth += Math.max(0, inflow - rate);
    if (inflow > rate) worst = Math.max(worst, rate > 0 ? (inflow - rate) / rate : Number.POSITIVE_INFINITY);
    for (const w of workers) load.set(w, capacity(w) * Math.min(1, ratio));
    blocks.push({ queues: set.map((q) => q.id).sort(), ratio });
    for (const w of workers) taken.add(w);
    remaining = remaining.filter((q) => !set.includes(q));
  }
  return { blocks, growth, worst, load };
}

function randomBoard(seed: number) {
  let s = seed;
  const rand = () => (s = (s * 1_103_515_245 + 12_345) % 2 ** 31) / 2 ** 31;
  const pick = <T>(list: T[]) => list[Math.floor(rand() * list.length)];
  const workers = Array.from({ length: 1 + Math.floor(rand() * 8) }, (_, i) => `w${i}`);
  const sizes = new Map(workers.map((w) => [w, pick([0, 1, 1, 2, 3])]));
  const queues: QueueDemand[] = Array.from({ length: 1 + Math.floor(rand() * 10) }, (_, i) => ({
    id: `q${i}`,
    incoming: pick([0, 100, 500, 1_000, 1_500, 3_000, 6_000]),
    workers: workers.filter(() => rand() < 0.35),
  }));
  return { queues, capacity: (w: string) => sizes.get(w)! * 1_500 };
}

/** Each queue's block ratio: the blocks themselves may be split differently where separate groups tie. */
const ratios = (blocks: { queues: string[]; ratio: number }[]) =>
  Object.fromEntries(blocks.flatMap((b) => b.queues.map((q) => [q, Number.isFinite(b.ratio) ? Number(b.ratio.toPrecision(9)) : 'never'])));

const close = (a: number, b: number) => a === b || Math.abs(a - b) <= 1e-6 * Math.max(1, Math.abs(a), Math.abs(b));

describe('draining queues', () => {
  it('matches the exhaustive reference on random boards of up to 10 queues', () => {
    for (let seed = 1; seed <= 1_000; seed++) {
      const { queues, capacity } = randomBoard(seed);
      const exact = drainQueues(queues, capacity);
      const ref = reference(queues, capacity);
      const label = `seed ${seed}`;
      expect(ratios(exact.blocks), label).toEqual(ratios(ref.blocks));
      expect(close(exact.backlogGrowthPerSec, ref.growth), label).toBe(true);
      expect(close(exact.backlogDrainRatio, ref.worst), label).toBe(true);
      const sent = new Map<string, number>();
      for (const out of exact.flows.values()) for (const [w, jobs] of out) sent.set(w, (sent.get(w) ?? 0) + jobs);
      for (const [w, expected] of ref.load) expect(close(sent.get(w) ?? 0, expected), `${label} ${w}`).toBe(true);
      for (const q of queues) {
        const links = new Set(q.workers);
        for (const w of exact.flows.get(q.id)?.keys() ?? []) expect(links.has(w), `${label} ${q.id}>${w}`).toBe(true);
      }
    }
  });

  it('never pools queues that share no worker, however many there are', () => {
    const light = Array.from({ length: 12 }, (_, i) => ({ id: `light${i}`, incoming: 100, workers: [`own${i}`] }));
    const r = drainQueues([{ id: 'heavy', incoming: 6_000, workers: ['w0'] }, ...light], () => 1_500);
    expect(r.backlogGrowthPerSec).toBeCloseTo(4_500);
    expect(r.backlogDrainRatio).toBeCloseTo(3);
    expect(r.flows.get('heavy')?.get('w0')).toBeCloseTo(1_500);
  });

  it('fails The Write Wall when thirteen queues feed one small worker pool', () => {
    const queues = Array.from({ length: 13 }, (_, i) => `q${i}`);
    const design: Design = {
      nodes: [
        { id: 'users', kind: 'client', x: 0, y: 0, instances: 1 },
        { id: 'lb', kind: 'lb', x: 0, y: 0, instances: 2 },
        { id: 'app', kind: 'app', x: 0, y: 0, instances: 9 },
        { id: 'cache', kind: 'cache', x: 0, y: 0, instances: 1 },
        { id: 'db', kind: 'db', x: 0, y: 0, instances: 1 },
        { id: 'A', kind: 'worker', x: 0, y: 0, instances: 1 },
        { id: 'B', kind: 'worker', x: 0, y: 0, instances: 5 },
        ...queues.map((id) => ({ id, kind: 'queue' as const, x: 0, y: 0, instances: 1 })),
      ],
      edges: [
        ['users', 'lb'],
        ['lb', 'app'],
        ['app', 'cache'],
        ['cache', 'db'],
        ['A', 'db'],
        ['B', 'db'],
        ...queues.flatMap((q, i) => [
          ['app', q],
          [q, i < 12 ? 'A' : 'B'],
        ]),
      ].map(([from, to]) => ({ from, to })),
    };
    const writeWall = getScenario('write-wall')!;
    const r = simulate(design, writeWall.workload);
    expect(r.metrics.backlogGrowthPerSec).toBeGreaterThan(5_000);
    expect(evaluate(writeWall, design, r).find((c) => c.id === 'backlog')!.pass).toBe(false);
  });

  it('simulates a board with 20 queues and 40 workers in a few milliseconds', () => {
    const queues = Array.from({ length: 20 }, (_, i) => `q${i}`);
    const workers = Array.from({ length: 40 }, (_, i) => `w${i}`);
    const design: Design = {
      nodes: [
        { id: 'users', kind: 'client', x: 0, y: 0, instances: 1 },
        { id: 'lb', kind: 'lb', x: 0, y: 0, instances: 4 },
        { id: 'app', kind: 'app', x: 0, y: 0, instances: 40 },
        { id: 'db', kind: 'db', x: 0, y: 0, instances: 8 },
        ...queues.map((id) => ({ id, kind: 'queue' as const, x: 0, y: 0, instances: 1 })),
        ...workers.map((id, i) => ({ id, kind: 'worker' as const, x: 0, y: 0, instances: 1 + (i % 3) })),
      ],
      edges: [
        ['users', 'lb'],
        ['lb', 'app'],
        ['app', 'db'],
        ...queues.flatMap((q, i) => [
          ['app', q],
          [q, workers[(i * 2) % 40]],
          [q, workers[(i * 2 + 1) % 40]],
          [q, workers[(i * 7 + 3) % 40]],
        ]),
        ...workers.map((w) => [w, 'db']),
      ].map(([from, to]) => ({ from, to })),
    };
    const workload = { rps: 60_000, readRatio: 0.2 };
    simulate(design, workload);
    const times = Array.from({ length: 7 }, () => {
      const start = performance.now();
      simulate(design, workload);
      return performance.now() - start;
    }).sort((a, b) => a - b);
    expect(times[3]).toBeLessThan(25);
  });
});
