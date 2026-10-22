import { describe, expect, it } from 'vitest';
import { routeEdges } from '../viz/route.js';
import { BOARD, NODE_SIZE } from './board.js';
import { CASE_LABS } from './cases/labs.js';
import { FREE_BUILD_GOALS, kpiVerdicts } from './lab-goals.js';
import { SCENARIO_CATALOG } from './scenario-catalog.js';
import { evaluate, getScenario } from './scenarios.js';
import { simulate } from './simulate.js';
import { traceRequest } from './trace.js';
import type { Design } from './types.js';

type Seg = readonly [readonly [number, number], readonly [number, number]];
/** Two axis-aligned segments on one line that share more than a few units of it. */
function collinear([a, b]: Seg, [c, d]: Seg): boolean {
  const vertical = (p: Seg[0], q: Seg[1]) => Math.abs(p[0] - q[0]) < 0.5;
  if (vertical(a, b) !== vertical(c, d)) return false;
  const [axis, along] = vertical(a, b) ? [0, 1] : [1, 0];
  if (Math.abs(a[axis] - c[axis]) > 2) return false;
  const lo = Math.max(Math.min(a[along], b[along]), Math.min(c[along], d[along]));
  const hi = Math.min(Math.max(a[along], b[along]), Math.max(c[along], d[along]));
  return hi - lo > 4;
}

const SCENARIO_IDS = SCENARIO_CATALOG.map((s) => s.id);

const boards: [string, Design][] = [
  ...Object.entries(CASE_LABS).map(([id, lab]): [string, Design] => [`case ${id}`, lab.design]),
  ...SCENARIO_IDS.map((id): [string, Design] => [`mission ${id}`, getScenario(id)!.starter]),
];

describe('the Lab boards on the diagram kit', () => {
  it.each(boards)('%s keeps its nodes on the board, apart, and routes every edge clear of them', (_name, design) => {
    const boxes = design.nodes.map((n) => ({ id: n.id, x: n.x, y: n.y, ...NODE_SIZE }));
    for (const b of boxes) {
      expect(b.x - b.w / 2).toBeGreaterThanOrEqual(0);
      expect(b.x + b.w / 2).toBeLessThanOrEqual(BOARD.w);
      expect(b.y - b.h / 2).toBeGreaterThanOrEqual(0);
      expect(b.y + b.h / 2).toBeLessThanOrEqual(BOARD.h);
    }
    for (const [i, a] of boxes.entries())
      for (const b of boxes.slice(i + 1))
        expect(Math.abs(a.x - b.x) >= a.w + 24 || Math.abs(a.y - b.y) >= a.h + 24, `${a.id} and ${b.id}`).toBe(true);
    const routes = routeEdges(boxes, design.edges, { floor: BOARD.h, bounds: { x0: 0, y0: 0, x1: BOARD.w, y1: BOARD.h } });
    expect(routes).toHaveLength(design.edges.length);
    expect(routes.filter((r) => r.kind === 'curve').map((r) => `${r.from}->${r.to}`)).toEqual([]);
    for (const r of routes)
      for (const [x, y] of r.points)
        expect(x >= 0 && x <= BOARD.w && y >= 0 && y <= BOARD.h, `${r.from}->${r.to} leaves the board`).toBe(true);
    // Edges that share no node never run along each other.
    const segs = (r: (typeof routes)[number]) => r.points.slice(1).map((b, i) => [r.points[i], b] as const);
    for (const [i, r] of routes.entries())
      for (const q of routes.slice(i + 1)) {
        if ([r.from, r.to].some((id) => id === q.from || id === q.to)) continue;
        for (const s of segs(r))
          for (const t of segs(q)) expect(collinear(s, t), `${r.from}->${r.to} runs along ${q.from}->${q.to}`).toBe(false);
      }
  });

  it.each(Object.entries(CASE_LABS))('the %s build declares controls that match its workload and design', (_id, lab) => {
    const { controls, workload, design } = lab;
    expect(workload.rps).toBeGreaterThanOrEqual(controls.traffic.min);
    expect(workload.rps).toBeLessThanOrEqual(controls.traffic.max);
    expect(!!controls.bots).toBe((workload.botRps ?? 0) > 0);
    if (controls.bots) expect(workload.botRps).toBeLessThanOrEqual(controls.bots.max);
    // Files only where the workload names its share of whole objects, so the control never opens on "old rule".
    expect(!!controls.files).toBe(workload.objectShare !== undefined);
    if (controls.files) expect(design.nodes.some((n) => n.kind === 'blob')).toBe(true);
    for (const [node, glyph] of Object.entries(lab.roles ?? {})) {
      expect(
        design.nodes.map((n) => n.id),
        `${node} draws ${glyph}`,
      ).toContain(node);
    }
  });
});

describe('traceRequest', () => {
  it("follows the busiest edge from the client to a store, with the simulator's own times", () => {
    const lab = CASE_LABS['url-shortener'];
    const result = simulate(lab.design, lab.workload);
    const hops = traceRequest(lab.design, result);
    // The cache answers 90% of reads itself, so the typical request ends there.
    expect(hops.map((h) => h.id)).toEqual(['users', 'lb', 'app', 'cache']);
    expect(hops[1].networkMs).toBe(40);
    expect(hops[2].networkMs).toBe(0.5);
    for (const h of hops.slice(1)) expect(h.nodeMs).toBe(result.nodes[h.id].latencyMs);
  });

  it("counts only the users' requests a cache answers, since bots always miss it", () => {
    const storm = getScenario('bot-storm')!;
    const design = { ...storm.starter, nodes: storm.starter.nodes.map((n) => (n.kind === 'app' ? { ...n, instances: 20 } : n)) };
    const result = simulate(design, storm.workload);
    expect(
      traceRequest(design, result)
        .map((h) => h.id)
        .at(-1),
    ).toBe('cache');
  });

  it('stops at a node that is down, and returns nothing without a client', () => {
    const design: Design = {
      nodes: [
        { id: 'users', kind: 'client', x: 0, y: 0, instances: 1 },
        { id: 'app', kind: 'app', x: 200, y: 0, instances: 1, failed: 1 },
        { id: 'db', kind: 'db', x: 400, y: 0, instances: 1 },
      ],
      edges: [
        { from: 'users', to: 'app' },
        { from: 'app', to: 'db' },
      ],
    };
    const hops = traceRequest(design, simulate(design, { rps: 100, readRatio: 0.9 }));
    expect(hops.map((h) => [h.id, h.nodeMs])).toEqual([
      ['users', 0],
      ['app', 0],
    ]);
    expect(traceRequest({ nodes: [], edges: [] }, simulate({ nodes: [], edges: [] }, { rps: 1, readRatio: 1 }))).toEqual([]);
  });
});

describe('kpiVerdicts', () => {
  it('agrees with evaluate() on every mission starter', () => {
    for (const id of SCENARIO_IDS) {
      const s = getScenario(id)!;
      const result = simulate(s.starter, s.workload);
      const checks = evaluate(s, s.starter, result);
      const kpi = kpiVerdicts(result.metrics, s.goals);
      expect(kpi.p99 === 'pass').toBe(checks.find((c) => c.id === 'p99')!.pass);
      expect(kpi.errors === 'pass').toBe(checks.find((c) => c.id === 'errors')!.pass);
      expect(kpi.cost === 'pass').toBe(checks.find((c) => c.id === 'cost')!.pass);
    }
  });

  it('colors Free Build against its goals and never its unlimited budget', () => {
    const m = { p99Ms: 150, errorRate: 0.02, monthlyCost: 1e6 } as Parameters<typeof kpiVerdicts>[0];
    expect(kpiVerdicts(m, FREE_BUILD_GOALS)).toEqual({ p99: 'pass', errors: 'fail', cost: 'none' });
    expect(kpiVerdicts({ ...m, errorRate: 1 }, FREE_BUILD_GOALS).p99).toBe('fail');
  });
});
