import { describe, expect, it } from 'vitest';
import {
  BOT_BLOCK_RATE,
  canConnect,
  getScenario,
  SCENARIOS,
  evaluate,
  scenarioVariant,
  shardShares,
  simulate,
  type ComponentKind,
  type Design,
  type ShardKey,
} from './index.js';

const n = (id: string, kind: ComponentKind, instances = 1, extra: object = {}) => ({ id, kind, x: 0, y: 0, instances, ...extra });
const e = (...pairs: [string, string][]) => pairs.map(([from, to]) => ({ from, to }));

const SOLUTIONS: Record<string, Design> = {
  'first-scale-up': {
    nodes: [n('users', 'client'), n('lb', 'lb'), n('app', 'app', 4), n('db', 'db')],
    edges: e(['users', 'lb'], ['lb', 'app'], ['app', 'db']),
  },
  'viral-feed': {
    nodes: [
      n('users', 'client'),
      n('cdn', 'cdn'),
      n('lb', 'lb', 2),
      n('app', 'app', 18),
      n('cache', 'cache', 2),
      n('db', 'db'),
      n('rep', 'replica', 2),
    ],
    edges: e(['users', 'cdn'], ['cdn', 'lb'], ['lb', 'app'], ['app', 'cache'], ['cache', 'db'], ['db', 'rep']),
  },
  'flash-sale': {
    nodes: [
      n('users', 'client'),
      n('lb', 'lb', 2),
      n('app', 'app', 12),
      n('cache', 'cache'),
      n('db', 'db'),
      n('q', 'queue'),
      n('w', 'worker'),
    ],
    edges: e(['users', 'lb'], ['lb', 'app'], ['app', 'cache'], ['cache', 'db'], ['app', 'q'], ['q', 'w'], ['w', 'db']),
  },
  'bot-storm': botStorm(2, 5),
  'write-wall': writeWall(10, 5),
};

function botStorm(limiters: number, apps: number): Design {
  return {
    nodes: [
      n('users', 'client'),
      n('lim', 'limiter', limiters),
      n('lb', 'lb', 2),
      n('app', 'app', apps),
      n('cache', 'cache', 2),
      n('db', 'db'),
      n('rep', 'replica'),
    ],
    edges: e(['users', 'lim'], ['lim', 'lb'], ['lb', 'app'], ['app', 'cache'], ['cache', 'db'], ['db', 'rep']),
  };
}

function writeWall(apps: number, shards: number, opts: { key?: ShardKey; replicas?: number; caches?: number } = {}): Design {
  const replicas = opts.replicas ?? 0;
  return {
    nodes: [
      n('users', 'client'),
      n('lb', 'lb', 2),
      n('app', 'app', apps),
      n('cache', 'cache', opts.caches ?? 1),
      n('db', 'db', shards, { shardKey: opts.key ?? 'hash' }),
      ...(replicas ? [n('rep', 'replica', replicas)] : []),
    ],
    edges: e(
      ['users', 'lb'],
      ['lb', 'app'],
      ['app', 'cache'],
      ['cache', 'db'],
      ...(replicas ? ([['db', 'rep']] as [string, string][]) : []),
    ),
  };
}

describe('scenarios', () => {
  it.each(SCENARIOS.map((s) => [s.id, s] as const))('%s: starter fails, reference solution passes', (id, scenario) => {
    expect(evaluate(scenario, scenario.starter).some((g) => !g.pass)).toBe(true);
    const checks = evaluate(scenario, SOLUTIONS[id]);
    expect(checks.filter((g) => !g.pass)).toEqual([]);
  });

  it('flash sale: too many workers overload the database', () => {
    const scenario = SCENARIOS.find((s) => s.id === 'flash-sale')!;
    const design = structuredClone(SOLUTIONS['flash-sale']);
    design.nodes.find((x) => x.id === 'w')!.instances = 4;
    const checks = evaluate(scenario, design);
    expect(checks.find((g) => g.id === 'durable')!.pass).toBe(false);
  });

  it('bot storm: scaling every tier to carry the bots blows the budget and still overloads the database', () => {
    const scenario = getScenario('bot-storm')!;
    const brute = botStorm(1, 20);
    brute.nodes = brute.nodes.filter((x) => x.kind !== 'limiter');
    brute.edges = e(['users', 'lb'], ['lb', 'app'], ['app', 'cache'], ['cache', 'db'], ['db', 'rep']);
    const failed = evaluate(scenario, brute)
      .filter((g) => !g.pass)
      .map((g) => g.id);
    expect(failed).toEqual(expect.arrayContaining(['cost', 'errors']));
  });

  it('write wall: more shards do not help while the key is a time range or a skewed tenant', () => {
    const scenario = getScenario('write-wall')!;
    for (const key of ['time', 'tenant'] as const) {
      const result = simulate(writeWall(10, 5, { key }), scenario.workload);
      expect(evaluate(scenario, writeWall(10, 5, { key }), result).find((g) => g.id === 'errors')!.pass, key).toBe(false);
      expect(
        result.insights.some((i) => i.title.startsWith('Hot shard')),
        key,
      ).toBe(true);
    }
  });

  it('write wall: a queue in front of one primary cannot keep up with sustained writes', () => {
    const scenario = getScenario('write-wall')!;
    const design: Design = {
      nodes: [
        n('users', 'client'),
        n('lb', 'lb', 2),
        n('app', 'app', 10),
        n('cache', 'cache'),
        n('db', 'db'),
        n('q', 'queue'),
        n('w', 'worker'),
      ],
      edges: e(['users', 'lb'], ['lb', 'app'], ['app', 'cache'], ['cache', 'db'], ['app', 'q'], ['q', 'w'], ['w', 'db']),
    };
    const backlog = evaluate(scenario, design).find((g) => g.id === 'backlog')!;
    expect(backlog.pass).toBe(false);
    expect(backlog.actual).toMatch(/^\+/);
  });
});

const VARIANT_SOLUTIONS: Record<string, Design> = {
  'first-scale-up:1': {
    nodes: [n('u', 'client'), n('lb', 'lb'), n('app', 'app', 5), n('db', 'db'), n('rep', 'replica')],
    edges: e(['u', 'lb'], ['lb', 'app'], ['app', 'db'], ['db', 'rep']),
  },
  'first-scale-up:2': {
    nodes: [n('u', 'client'), n('lb', 'lb', 2), n('app', 'app', 4), n('db', 'db'), n('rep', 'replica')],
    edges: e(['u', 'lb'], ['lb', 'app'], ['app', 'db'], ['db', 'rep']),
  },
  'first-scale-up:3': {
    nodes: [n('u', 'client'), n('lb', 'lb'), n('app', 'app', 8), n('c', 'cache'), n('db', 'db')],
    edges: e(['u', 'lb'], ['lb', 'app'], ['app', 'c'], ['c', 'db']),
  },
  'viral-feed:1': {
    nodes: [
      n('u', 'client'),
      n('cdn', 'cdn', 1, { hitRate: 0.6 }),
      n('lb', 'lb', 2),
      n('app', 'app', 20),
      n('c', 'cache', 2, { hitRate: 0.9 }),
      n('db', 'db'),
      n('rep', 'replica', 2),
    ],
    edges: e(['u', 'cdn'], ['cdn', 'lb'], ['lb', 'app'], ['app', 'c'], ['c', 'db'], ['db', 'rep']),
  },
  'viral-feed:2': {
    nodes: [
      n('u', 'client'),
      n('cdn', 'cdn', 1, { hitRate: 0.6 }),
      n('lb', 'lb', 2),
      n('app', 'app', 18),
      n('c', 'cache', 2, { hitRate: 0.9 }),
      n('db', 'db'),
      n('rep', 'replica', 2),
    ],
    edges: e(['u', 'cdn'], ['cdn', 'lb'], ['lb', 'app'], ['app', 'c'], ['c', 'db'], ['db', 'rep']),
  },
  'viral-feed:3': {
    nodes: [
      n('u', 'client'),
      n('cdn', 'cdn', 1, { hitRate: 0.7 }),
      n('lb', 'lb', 2),
      n('app', 'app', 24),
      n('c', 'cache', 2, { hitRate: 0.9 }),
      n('db', 'db'),
      n('rep', 'replica', 2),
    ],
    edges: e(['u', 'cdn'], ['cdn', 'lb'], ['lb', 'app'], ['app', 'c'], ['c', 'db'], ['db', 'rep']),
  },
  'flash-sale:1': {
    nodes: [n('u', 'client'), n('lb', 'lb', 2), n('app', 'app', 15), n('c', 'cache'), n('db', 'db'), n('q', 'queue'), n('w', 'worker')],
    edges: e(['u', 'lb'], ['lb', 'app'], ['app', 'c'], ['c', 'db'], ['app', 'q'], ['q', 'w'], ['w', 'db']),
  },
  'flash-sale:2': {
    nodes: [
      n('u', 'client'),
      n('lb', 'lb', 2),
      n('app', 'app', 12),
      n('c', 'cache', 2),
      n('db', 'db'),
      n('rep', 'replica'),
      n('q', 'queue', 2),
      n('w', 'worker'),
    ],
    edges: e(['u', 'lb'], ['lb', 'app'], ['app', 'c'], ['c', 'db'], ['db', 'rep'], ['app', 'q'], ['q', 'w'], ['w', 'db']),
  },
  'bot-storm:1': botStorm(2, 6),
  'bot-storm:2': botStorm(2, 10),
  'bot-storm:3': botStorm(2, 8),
  'write-wall:1': writeWall(12, 6),
  'write-wall:2': writeWall(10, 5, { replicas: 5, caches: 2 }),
  'write-wall:3': writeWall(16, 8),
  'flash-sale:3': {
    nodes: [n('u', 'client'), n('lb', 'lb', 2), n('app', 'app', 10), n('c', 'cache'), n('db', 'db'), n('q', 'queue'), n('w', 'worker')],
    edges: e(['u', 'lb'], ['lb', 'app'], ['app', 'c'], ['c', 'db'], ['app', 'q'], ['q', 'w'], ['w', 'db']),
  },
};

describe('mission revisit variants', () => {
  it('every scenario has three revisit variants', () => {
    for (const s of SCENARIOS) expect(s.variants?.length, s.id).toBe(3);
  });

  it.each(Object.keys(VARIANT_SOLUTIONS))('%s: starter fails, reference solution passes', (key) => {
    const [id, v] = key.split(':');
    const scenario = scenarioVariant(id, Number(v))!;
    expect(scenario.revisit).toMatchObject({ number: Number(v), of: 3 });
    expect(evaluate(scenario, scenario.starter).some((g) => !g.pass)).toBe(true);
    expect(evaluate(scenario, VARIANT_SOLUTIONS[key]).filter((g) => !g.pass)).toEqual([]);
  });

  it('the original mission solution does not automatically pass its revisits', () => {
    const failing = SCENARIOS.flatMap((s) =>
      [1, 2, 3].map((v) => evaluate(scenarioVariant(s.id, v)!, SOLUTIONS[s.id]).some((g) => !g.pass)),
    );
    expect(failing.filter(Boolean).length).toBeGreaterThanOrEqual(6);
  });

  it('returns undefined for missing variants', () => {
    expect(scenarioVariant('first-scale-up', 4)).toBeUndefined();
    expect(scenarioVariant('nope', 1)).toBeUndefined();
  });
});

describe('simulate', () => {
  const basic: Design = {
    nodes: [n('u', 'client'), n('lb', 'lb'), n('a', 'app', 2), n('d', 'db')],
    edges: e(['u', 'lb'], ['lb', 'a'], ['a', 'd']),
  };

  it('conserves traffic when nothing is overloaded', () => {
    const r = simulate(basic, { rps: 1000, readRatio: 0.8 });
    expect(r.metrics.errorRate).toBe(0);
    expect(r.nodes['d'].readRps).toBeCloseTo(800);
    expect(r.nodes['d'].writeRps).toBeCloseTo(200);
    expect(r.nodes['d'].loadOps).toBeCloseTo(1200);
  });

  it('drops excess load and reports errors when overloaded', () => {
    const r = simulate(basic, { rps: 10_000, readRatio: 0.8 });
    expect(r.nodes['a'].status).toBe('overloaded');
    expect(r.metrics.errorRate).toBeGreaterThan(0.5);
    expect(r.insights[0].severity).toBe('critical');
  });

  it('latency rises with utilization', () => {
    const low = simulate(basic, { rps: 500, readRatio: 0.9 }).metrics.p99Ms;
    const high = simulate(basic, { rps: 3_800, readRatio: 0.9 }).metrics.p99Ms;
    expect(high).toBeGreaterThan(low * 1.5);
  });

  it('a cache absorbs reads by its hit rate', () => {
    const d: Design = {
      nodes: [n('u', 'client'), n('lb', 'lb'), n('a', 'app', 4), n('c', 'cache', 1, { hitRate: 0.9 }), n('d', 'db')],
      edges: e(['u', 'lb'], ['lb', 'a'], ['a', 'c'], ['c', 'd']),
    };
    const r = simulate(d, { rps: 5000, readRatio: 1 });
    expect(r.nodes['d'].readRps).toBeCloseTo(500);
  });

  it('failed instances reduce capacity and a fully failed node fails its traffic', () => {
    const d = structuredClone(basic);
    d.nodes[3].failed = 1;
    const r = simulate(d, { rps: 1000, readRatio: 0.8 });
    expect(r.nodes['d'].status).toBe('down');
    expect(r.metrics.errorRate).toBeCloseTo(1);
  });

  it('without a load balancer only one app instance serves traffic', () => {
    const direct: Design = { nodes: [n('u', 'client'), n('a', 'app', 4), n('d', 'db')], edges: e(['u', 'a'], ['a', 'd']) };
    const r = simulate(direct, { rps: 3000, readRatio: 0.9 });
    expect(r.nodes['a'].capacityOps).toBe(2000);
    expect(r.metrics.errorRate).toBeGreaterThan(0.3);
    expect(r.insights.some((i) => i.title.startsWith('Users can only reach one'))).toBe(true);
  });

  it('flags single points of failure', () => {
    const r = simulate(basic, { rps: 100, readRatio: 0.5 });
    expect(r.insights.some((i) => i.title.includes('Primary DB'))).toBe(true);
  });
});

describe('sharding', () => {
  const sharded = (shards: number, key: ShardKey, extra: Partial<{ failed: number; replicas: number }> = {}): Design => ({
    nodes: [
      n('u', 'client'),
      n('lb', 'lb', 2),
      n('a', 'app', 20),
      n('d', 'db', shards, { shardKey: key, failed: extra.failed ?? 0 }),
      ...(extra.replicas ? [n('r', 'replica', extra.replicas)] : []),
    ],
    edges: e(['u', 'lb'], ['lb', 'a'], ['a', 'd'], ...(extra.replicas ? ([['d', 'r']] as [string, string][]) : [])),
  });
  const writes = { rps: 4_000, readRatio: 0 };

  it('shard shares always sum to one and put the hottest shard first', () => {
    for (const key of ['hash', 'time', 'tenant'] as const)
      for (const shards of [1, 2, 5, 8]) {
        const s = shardShares(key, shards);
        for (const list of [s.read, s.write]) {
          expect(list.reduce((a, b) => a + b, 0)).toBeCloseTo(1);
          expect(list[0]).toBe(Math.max(...list));
        }
      }
  });

  it('a hash key splits writes evenly, so capacity grows with every shard', () => {
    const r = simulate(sharded(4, 'hash'), writes);
    expect(r.nodes['d'].capacityOps).toBe(20_000);
    expect(r.nodes['d'].utilization).toBeCloseTo(8_000 / 4 / 5_000);
    expect(r.nodes['d'].shards!.map((s) => s.utilization)).toEqual(Array(4).fill(0.4));
    expect(r.metrics.errorRate).toBe(0);
  });

  it('a created_at range sends every new write to the newest shard', () => {
    const r = simulate(sharded(4, 'time'), writes);
    expect(r.nodes['d'].utilization).toBeCloseTo(8_000 / 5_000);
    expect(r.nodes['d'].shards!.slice(1).every((s) => s.utilization === 0)).toBe(true);
    expect(r.metrics.errorRate).toBeGreaterThan(0.3);
  });

  it('a skewed tenant key keeps the hottest shard at 40% of load however many shards there are', () => {
    const four = simulate(sharded(4, 'tenant'), writes).nodes['d'].utilization;
    const eight = simulate(sharded(8, 'tenant'), writes).nodes['d'].utilization;
    expect(four).toBeCloseTo((8_000 * 0.4) / 5_000);
    expect(eight).toBeCloseTo(four);
  });

  it('a dead shard takes its keys offline; the rest keep serving', () => {
    const r = simulate(sharded(4, 'hash', { failed: 1 }), { rps: 2_000, readRatio: 0.5 });
    expect(r.metrics.errorRate).toBeCloseTo(0.25);
    expect(r.nodes['d'].status).not.toBe('down');
    expect(r.insights.find((i) => i.title === '1 of 4 shards down')?.severity).toBe('critical');
  });

  it('every shard needs its own replica to avoid a single point of failure', () => {
    const spof = (replicas: number) =>
      simulate(sharded(3, 'hash', { replicas }), { rps: 1_000, readRatio: 0.5 }).insights.some(
        (i) => i.title === 'Single point of failure: Primary DB',
      );
    expect(spof(2)).toBe(true);
    expect(spof(3)).toBe(false);
  });

  it('one unsharded primary behaves exactly as before', () => {
    const one = simulate(sharded(1, 'time'), { rps: 1_000, readRatio: 0.5 });
    const plain = simulate(sharded(1, 'hash'), { rps: 1_000, readRatio: 0.5 });
    expect(one.metrics).toEqual(plain.metrics);
    expect(one.nodes['d'].shards).toBeUndefined();
  });
});

describe('bots and rate limiting', () => {
  const site = (limiter: boolean): Design => ({
    nodes: [
      n('u', 'client'),
      ...(limiter ? [n('lim', 'limiter', 2)] : []),
      n('lb', 'lb', 2),
      n('a', 'app', 20),
      n('c', 'cache', 2, { hitRate: 0.9 }),
      n('d', 'db'),
    ],
    edges: e(
      ...((limiter
        ? [
            ['u', 'lim'],
            ['lim', 'lb'],
          ]
        : [['u', 'lb']]) as [string, string][]),
      ['lb', 'a'],
      ['a', 'c'],
      ['c', 'd'],
    ),
  });
  const workload = { rps: 2_000, readRatio: 1, botRps: 10_000 };

  it('bots miss the cache and land on the database', () => {
    const r = simulate(site(false), workload);
    expect(r.nodes['d'].readRps).toBeCloseTo(200);
    expect(r.nodes['d'].botRps).toBeCloseTo(10_000);
    expect(r.insights.some((i) => i.title.startsWith('Bots are'))).toBe(true);
  });

  it('a limiter rejects bots before they cost anything, and rejected bots are not user errors', () => {
    const r = simulate(site(true), workload);
    expect(r.metrics.botsBlockedRps).toBeCloseTo(10_000 * BOT_BLOCK_RATE);
    expect(r.nodes['d'].botRps).toBeCloseTo(10_000 * (1 - BOT_BLOCK_RATE));
    expect(r.metrics.errorRate).toBe(0);
    expect(r.metrics.successRps).toBe(2_000);
    expect(r.insights.some((i) => i.title.startsWith('Bots are'))).toBe(false);
  });

  it('dropped bots at an overloaded node do not count as user errors, but users caught in the overload do', () => {
    const r = simulate(site(false), { rps: 1_000, readRatio: 1, botRps: 100_000 });
    expect(r.metrics.errorRate).toBeGreaterThan(0);
    expect(r.metrics.errorRate).toBeLessThan(1);
    expect(r.metrics.offeredRps).toBe(1_000);
  });

  it('a single limiter instance is a single point of failure', () => {
    const d = site(true);
    d.nodes.find((x) => x.id === 'lim')!.instances = 1;
    expect(simulate(d, workload).insights.some((i) => i.title === 'Single point of failure: Rate Limiter')).toBe(true);
  });
});

describe('canConnect', () => {
  const d: Design = { nodes: [n('u', 'client'), n('a', 'app'), n('d', 'db'), n('r', 'replica')], edges: e(['u', 'a'], ['a', 'd']) };
  it('enforces component rules, duplicates and self-loops', () => {
    expect(canConnect(d, 'd', 'r').ok).toBe(true);
    expect(canConnect(d, 'u', 'd').ok).toBe(false);
    expect(canConnect(d, 'a', 'd').ok).toBe(false);
    expect(canConnect(d, 'a', 'a').ok).toBe(false);
  });
});
