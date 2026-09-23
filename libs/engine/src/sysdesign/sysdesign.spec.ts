import { describe, expect, it } from 'vitest';
import { canConnect, SCENARIOS, evaluate, scenarioVariant, simulate, type ComponentKind, type Design } from './index.js';

const n = (id: string, kind: ComponentKind, instances = 1, extra: object = {}) => ({ id, kind, x: 0, y: 0, instances, ...extra });
const e = (...pairs: [string, string][]) => pairs.map(([from, to]) => ({ from, to }));

const SOLUTIONS: Record<string, Design> = {
  'first-scale-up': {
    nodes: [n('users', 'client'), n('lb', 'lb'), n('app', 'app', 4), n('db', 'db')],
    edges: e(['users', 'lb'], ['lb', 'app'], ['app', 'db']),
  },
  'viral-feed': {
    nodes: [n('users', 'client'), n('cdn', 'cdn'), n('lb', 'lb', 2), n('app', 'app', 18), n('cache', 'cache', 2), n('db', 'db'), n('rep', 'replica', 2)],
    edges: e(['users', 'cdn'], ['cdn', 'lb'], ['lb', 'app'], ['app', 'cache'], ['cache', 'db'], ['db', 'rep']),
  },
  'flash-sale': {
    nodes: [n('users', 'client'), n('lb', 'lb', 2), n('app', 'app', 12), n('cache', 'cache'), n('db', 'db'), n('q', 'queue'), n('w', 'worker')],
    edges: e(['users', 'lb'], ['lb', 'app'], ['app', 'cache'], ['cache', 'db'], ['app', 'q'], ['q', 'w'], ['w', 'db']),
  },
};

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
});

const VARIANT_SOLUTIONS: Record<string, Design> = {
  'first-scale-up:1': { nodes: [n('u', 'client'), n('lb', 'lb'), n('app', 'app', 5), n('db', 'db'), n('rep', 'replica')], edges: e(['u', 'lb'], ['lb', 'app'], ['app', 'db'], ['db', 'rep']) },
  'first-scale-up:2': { nodes: [n('u', 'client'), n('lb', 'lb', 2), n('app', 'app', 4), n('db', 'db'), n('rep', 'replica')], edges: e(['u', 'lb'], ['lb', 'app'], ['app', 'db'], ['db', 'rep']) },
  'first-scale-up:3': { nodes: [n('u', 'client'), n('lb', 'lb'), n('app', 'app', 8), n('c', 'cache'), n('db', 'db')], edges: e(['u', 'lb'], ['lb', 'app'], ['app', 'c'], ['c', 'db']) },
  'viral-feed:1': {
    nodes: [n('u', 'client'), n('cdn', 'cdn', 1, { hitRate: 0.6 }), n('lb', 'lb', 2), n('app', 'app', 20), n('c', 'cache', 2, { hitRate: 0.9 }), n('db', 'db'), n('rep', 'replica', 2)],
    edges: e(['u', 'cdn'], ['cdn', 'lb'], ['lb', 'app'], ['app', 'c'], ['c', 'db'], ['db', 'rep']),
  },
  'viral-feed:2': {
    nodes: [n('u', 'client'), n('cdn', 'cdn', 1, { hitRate: 0.6 }), n('lb', 'lb', 2), n('app', 'app', 18), n('c', 'cache', 2, { hitRate: 0.9 }), n('db', 'db'), n('rep', 'replica', 2)],
    edges: e(['u', 'cdn'], ['cdn', 'lb'], ['lb', 'app'], ['app', 'c'], ['c', 'db'], ['db', 'rep']),
  },
  'viral-feed:3': {
    nodes: [n('u', 'client'), n('cdn', 'cdn', 1, { hitRate: 0.7 }), n('lb', 'lb', 2), n('app', 'app', 24), n('c', 'cache', 2, { hitRate: 0.9 }), n('db', 'db'), n('rep', 'replica', 2)],
    edges: e(['u', 'cdn'], ['cdn', 'lb'], ['lb', 'app'], ['app', 'c'], ['c', 'db'], ['db', 'rep']),
  },
  'flash-sale:1': {
    nodes: [n('u', 'client'), n('lb', 'lb', 2), n('app', 'app', 15), n('c', 'cache'), n('db', 'db'), n('q', 'queue'), n('w', 'worker')],
    edges: e(['u', 'lb'], ['lb', 'app'], ['app', 'c'], ['c', 'db'], ['app', 'q'], ['q', 'w'], ['w', 'db']),
  },
  'flash-sale:2': {
    nodes: [n('u', 'client'), n('lb', 'lb', 2), n('app', 'app', 12), n('c', 'cache', 2), n('db', 'db'), n('rep', 'replica'), n('q', 'queue', 2), n('w', 'worker')],
    edges: e(['u', 'lb'], ['lb', 'app'], ['app', 'c'], ['c', 'db'], ['db', 'rep'], ['app', 'q'], ['q', 'w'], ['w', 'db']),
  },
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
    const failing = SCENARIOS.flatMap((s) => [1, 2, 3].map((v) => evaluate(scenarioVariant(s.id, v)!, SOLUTIONS[s.id]).some((g) => !g.pass)));
    expect(failing.filter(Boolean).length).toBeGreaterThanOrEqual(6);
  });

  it('returns undefined for missing variants', () => {
    expect(scenarioVariant('first-scale-up', 4)).toBeUndefined();
    expect(scenarioVariant('nope', 1)).toBeUndefined();
  });
});

describe('simulate', () => {
  const basic: Design = { nodes: [n('u', 'client'), n('lb', 'lb'), n('a', 'app', 2), n('d', 'db')], edges: e(['u', 'lb'], ['lb', 'a'], ['a', 'd']) };

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

describe('canConnect', () => {
  const d: Design = { nodes: [n('u', 'client'), n('a', 'app'), n('d', 'db'), n('r', 'replica')], edges: e(['u', 'a'], ['a', 'd']) };
  it('enforces component rules, duplicates and self-loops', () => {
    expect(canConnect(d, 'd', 'r').ok).toBe(true);
    expect(canConnect(d, 'u', 'd').ok).toBe(false);
    expect(canConnect(d, 'a', 'd').ok).toBe(false);
    expect(canConnect(d, 'a', 'a').ok).toBe(false);
  });
});
