import { CASE_LABS, simulate, type Design } from '@grasp/engine';
import { labDiagram, nodeLabel, nodeName, tracePath } from './lab-diagram';
import { calloutText, trafficSnaps } from './lab-overlay.component';

const lab = CASE_LABS['message-queue'];
const roles = { glyphs: lab.roles!, kinds: new Map(lab.design.nodes.map((n) => [n.id, n.kind])) };
const names = (design: Design) => (id: string) => nodeName(design.nodes, id);

describe('labDiagram', () => {
  it("draws a case's role glyph on its own node, and never on another node that took the same id", () => {
    const result = simulate(lab.design, lab.workload);
    const drawn = labDiagram(lab.design, result, lab.workload, names(lab.design), roles, null);
    expect(drawn.nodes.find((n) => n.id === 'db')!.glyph).toBe('log');
    expect(drawn.nodes.find((n) => n.id === 'app')!.glyph).toBe('app');
    const swapped: Design = { ...lab.design, nodes: lab.design.nodes.map((n) => (n.id === 'db' ? { ...n, kind: 'blob' } : n)) };
    const redrawn = labDiagram(swapped, simulate(swapped, lab.workload), lab.workload, names(swapped), roles, null);
    expect(redrawn.nodes.find((n) => n.id === 'db')!.glyph).toBe('blob');
  });

  it('widens edges by the square root of their share, tags replication and queues, and pins at most three pills', () => {
    const news = CASE_LABS['news-feed'];
    const result = simulate(news.design, news.workload);
    const { edges } = labDiagram(news.design, result, news.workload, names(news.design), null, 'db->replica');
    const max = Math.max(...edges.map((e) => e.rps));
    for (const e of edges) expect(e.width).toBeCloseTo(1.5 + 4.5 * Math.sqrt(e.rps / max));
    expect(edges.find((e) => e.key === 'db->replica')!.tag).toBe('repl');
    expect(edges.find((e) => e.key === 'app->queue')!.tag).toBe('async');
    expect(edges.filter((e) => e.pill && e.key !== 'db->replica').length).toBeLessThanOrEqual(3);
    // The selected edge shows its pill only where it fits; this one is too short, so the inspector gives its rps.
    const selected = edges.find((e) => e.key === 'db->replica')!;
    expect(selected.pill).toBe(selected.pillFits);
    expect(selected.pillFits).toBe(false);
  });

  it("draws the dropped tail from the target's refusals, sharing them by each edge's part of its inflow", () => {
    const design: Design = {
      nodes: [
        { id: 'users', kind: 'client', x: 80, y: 240, instances: 1 },
        { id: 'app', kind: 'app', x: 400, y: 240, instances: 1 },
      ],
      edges: [{ from: 'users', to: 'app' }],
    };
    const result = simulate(design, { rps: 3_000, readRatio: 0.9 });
    const [edge] = labDiagram(design, result, { rps: 3_000, readRatio: 0.9 }, names(design), null, null).edges;
    expect(edge.droppedRps).toBeCloseTo(result.nodes['app'].rejectedRps);
    expect(edge.droppedRps).toBeGreaterThan(0);
  });

  it('joins the traced hops into one path along their routes', () => {
    const news = CASE_LABS['news-feed'];
    const { edges } = labDiagram(news.design, simulate(news.design, news.workload), news.workload, names(news.design), null, null);
    const path = tracePath(
      ['users', 'lb', 'app'].map((id) => ({ id, networkMs: 0, nodeMs: 0 })),
      edges,
    )!;
    expect(path.at).toHaveLength(3);
    expect(path.points[path.at[1]]).toEqual(edges.find((e) => e.key === 'users->lb')!.points.at(-1)!);
    expect(tracePath([{ id: 'users', networkMs: 0, nodeMs: 0 }], edges)).toBeNull();
  });
});

describe('nodeLabel', () => {
  it('names a role for screen readers beside the kind', () => {
    const result = simulate(lab.design, lab.workload);
    const db = lab.design.nodes.find((n) => n.id === 'db')!;
    expect(nodeLabel(db, 'Log segments', 'log', result, lab.workload)).toMatch(
      /^Log segments, Primary DB as an append-only log, 8 shards, \d+% utilized, \d+ ms$/,
    );
  });
});

describe('trafficSnaps', () => {
  it('offers 1-2-5 snaps within the range, plus the values to keep', () => {
    expect(trafficSnaps({ min: 100, max: 1_000 }, [40_000, 300])).toEqual([100, 200, 300, 500, 1_000]);
  });
});

describe('calloutText', () => {
  it("calls a named node by its name, and an unnamed one by its kind's", () => {
    expect(calloutText('App Servers running hot (83%)', 'App Servers', 'Control plane', 'App')).toBe('Control plane running hot (83%)');
    expect(calloutText('App Servers running hot (83%)', 'App Servers', 'App', 'App')).toBe('App Servers running hot (83%)');
    expect(calloutText('Single point of failure: Primary DB', 'Primary DB', 'Trade store', 'DB')).toBe(
      'Single point of failure: Trade store',
    );
  });
});

describe('labDiagram tags', () => {
  it('tags work handed to a queue as async, but not an exchange order into its sequencer', () => {
    const exchange = CASE_LABS['stock-exchange'];
    const exchangeRoles = { glyphs: exchange.roles!, kinds: new Map(exchange.design.nodes.map((n) => [n.id, n.kind])) };
    const run = simulate(exchange.design, exchange.workload);
    const { edges } = labDiagram(exchange.design, run, exchange.workload, names(exchange.design), exchangeRoles, null);
    expect(edges.find((e) => e.key === 'gateways->sequencer')!.tag).toBeNull();
  });

  it("never lets a pill cover the red tail of what an edge's target refuses", () => {
    const design: Design = {
      nodes: [
        { id: 'users', kind: 'client', x: 80, y: 240, instances: 1 },
        { id: 'app', kind: 'app', x: 300, y: 240, instances: 1 },
      ],
      edges: [{ from: 'users', to: 'app' }],
    };
    const workload = { rps: 3_000, readRatio: 0.9 };
    const [edge] = labDiagram(design, simulate(design, workload), workload, names(design), null, 'users->app').edges;
    expect(edge.droppedRps).toBeGreaterThan(0);
    expect([edge.pill, edge.pillFits, edge.dropLabel]).toEqual([false, false, false]);
  });

  it('draws no tail for a refusal that is only rounding', () => {
    for (const build of Object.values(CASE_LABS)) {
      const { edges } = labDiagram(build.design, simulate(build.design, build.workload), build.workload, names(build.design), null, null);
      for (const e of edges) expect(e.droppedRps === 0 || e.droppedRps >= 0.5).toBe(true);
    }
  });
});
