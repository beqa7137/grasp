import { describe, expect, it } from 'vitest';
import { CASE_LABS } from './cases/labs.js';
import { CASE_MISSION_SOLUTIONS, stack, type Stack } from './designs.fixture.js';
import { migrateSavedDesign } from './saved-design.js';
import { evaluate, getScenario, scenarioVariant } from './scenarios.js';
import { simulate } from './simulate.js';
import type { Design, Scenario } from './types.js';

const failedChecks = (scenario: Scenario, design: Design) =>
  evaluate(scenario, design)
    .filter((g) => !g.pass)
    .map((g) => g.id);

const everyVersion = (id: string): Scenario[] => [getScenario(id)!, ...[1, 2, 3].map((v) => scenarioVariant(id, v)!)];

/** A spread of designs from lean to lavish, with and without replicas, including a CDN at a 99% hit rate. */
function* designs(extra: Partial<Stack>): Generator<Design> {
  for (const shards of [1, 2, 3, 4, 5, 6])
    for (const apps of [6, 8, 10, 12, 14, 17, 20])
      for (const caches of [0, 2])
        for (const replicas of [0, shards])
          for (const cdn of [undefined, { hitRate: 0.99 }]) yield stack({ lbs: 2, apps, shards, caches, replicas, cdn, ...extra });
}

const passesAny = (id: string, extra: Partial<Stack>) =>
  everyVersion(id)
    .filter((s) => [...designs(extra)].some((d) => failedChecks(s, d).length === 0))
    .map((s) => s.title);

describe('Attachments Everywhere', () => {
  const mission = getScenario('mail-attachments')!;

  it('fails without an object store: the database has to take every file', () => {
    expect(failedChecks(mission, stack({ lbs: 2, apps: 9, shards: 4 }))).toEqual(['p99', 'cost']);
    expect(failedChecks(mission, stack({ lbs: 2, apps: 11, shards: 5 }))).toEqual(['cost']);
    expect(passesAny('mail-attachments', { objectStore: false })).toEqual([]);
  });

  it('cannot put records in the object store through workers or a CDN', () => {
    const onlyStore = stack({ lbs: 2, apps: 9, shards: 1, objectStore: true, queues: 1, workers: 5, workersToStore: 'only' });
    expect(failedChecks(mission, onlyStore)).toContain('durable');
    expect(simulate(onlyStore, mission.workload).insights.map((i) => i.title)).toContain('Workers have no database for records');

    const cdn = stack({ lbs: 1, apps: 7, shards: 2, objectStore: true, cdn: { hitRate: 0, toStore: true } });
    const r = simulate(cdn, mission.workload);
    expect(r.nodes['objects'].readRps + r.nodes['objects'].writeRps).toBeCloseTo(mission.workload.rps * 0.5);
    expect(r.edges['app->objects'] ?? 0).toBe(0);
  });

  it('sizes the shards for the records alone', () => {
    const r = simulate(CASE_MISSION_SOLUTIONS['mail-attachments'], mission.workload);
    expect(r.nodes['db'].writeRps).toBeCloseTo(3_500);
    expect(r.nodes['objects'].writeRps).toBeCloseTo(3_500);
  });
});

describe('Month-End Ledger', () => {
  const mission = getScenario('ledger-month-end')!;

  it('fails with a queue in front, because entries would be acknowledged before they commit', () => {
    const queued = stack({ lbs: 2, apps: 10, caches: 2, shards: 3, replicas: 3, queues: 2, workers: 4 });
    expect(failedChecks(mission, queued)).toEqual(['sync']);
    expect(evaluate(mission, queued).find((g) => g.id === 'sync')!.actual).toBe('6.0k/s queued');
  });

  it('fails on one primary with replicas, and on shards without one', () => {
    expect(failedChecks(mission, stack({ lbs: 2, apps: 10, caches: 2, shards: 1, replicas: 6 }))).toEqual(['p99', 'errors']);
    expect(failedChecks(mission, stack({ lbs: 2, apps: 10, caches: 2, shards: 4 }))).toEqual(['spof']);
    expect(passesAny('ledger-month-end', { shards: 1 })).toEqual([]);
  });
});

describe('Deploy Wave', () => {
  const mission = getScenario('deploy-wave')!;

  it('fails without a queue: committing every report as it arrives takes four shards', () => {
    expect(failedChecks(mission, stack({ lbs: 2, apps: 12, caches: 2, shards: 4, replicas: 4 }))).toEqual(['cost']);
    expect(passesAny('deploy-wave', {})).toEqual([]);
  });

  it('fails with more workers than the one primary can take', () => {
    expect(failedChecks(mission, stack({ lbs: 2, apps: 12, caches: 2, shards: 1, replicas: 1, queues: 2, workers: 3 }))).toEqual([
      'errors',
      'durable',
    ]);
  });

  it('needs a second primary to drain the three-minute wave in time', () => {
    const slow = scenarioVariant('deploy-wave', 2)!;
    expect(failedChecks(slow, CASE_MISSION_SOLUTIONS['deploy-wave'])).toEqual(['drain']);
    for (const workers of [1, 2, 3])
      expect(failedChecks(slow, stack({ lbs: 2, apps: 12, caches: 2, shards: 1, replicas: 1, queues: 2, workers })).length).toBeGreaterThan(
        0,
      );
  });
});

describe('missions on the case studies', () => {
  it.each(['mail-attachments', 'ledger-month-end', 'deploy-wave'])('%s changes the load or the goals on every revisit', (id) => {
    const versions = everyVersion(id).map((s) => JSON.stringify([s.workload, s.goals]));
    expect(new Set(versions).size).toBe(4);
    for (const v of [1, 2, 3])
      expect(failedChecks(scenarioVariant(id, v)!, CASE_MISSION_SOLUTIONS[id]).length, `revisit ${v}`).toBeGreaterThan(0);
  });

  it.each(['mail-attachments', 'ledger-month-end', 'deploy-wave'])('%s names its object share', (id) => {
    for (const s of everyVersion(id)) expect(s.workload.objectShare).toBeTypeOf('number');
  });
});

describe('the object share in the workload', () => {
  const legacyNode = (design: Design, id: string, share: number): Design => ({
    ...design,
    nodes: design.nodes.map((n) => (n.id === id ? { ...n, share } : n)),
  });

  it('opens a File Sync build saved with the share on its block store exactly as before', () => {
    const { design, workload } = CASE_LABS['file-sync'];
    const saved = migrateSavedDesign({
      design: legacyNode(design, 'blocks', 0.5),
      workload: { rps: workload.rps, readRatio: workload.readRatio },
    });
    expect(saved.workload.objectShare).toBe(0.5);
    expect(saved.design.nodes.some((n) => 'share' in n)).toBe(false);
    const r = simulate(saved.design, saved.workload);
    expect(r.metrics.p50Ms).toBe(88.7);
    expect(r.metrics.p99Ms).toBe(207.9);
    expect(r.edges['app->blocks']).toBeCloseTo(21_900);
    expect(r.edges['app->cache']).toBeCloseTo(18_900);
    expect(r.edges['app->db']).toBeCloseTo(3_000);
    expect(r).toEqual(simulate(design, workload));
  });

  it('keeps a free build saved with a custom share on its object store', () => {
    const design: Design = {
      nodes: [
        { id: 'users', kind: 'client', x: 80, y: 240, instances: 1 },
        { id: 'lb', kind: 'lb', x: 270, y: 240, instances: 2 },
        { id: 'app', kind: 'app', x: 460, y: 240, instances: 3 },
        { id: 'db', kind: 'db', x: 700, y: 240, instances: 1 },
        { id: 'blob-1-abcd', kind: 'blob', x: 460, y: 400, instances: 1 },
      ],
      edges: [
        { from: 'users', to: 'lb' },
        { from: 'lb', to: 'app' },
        { from: 'app', to: 'db' },
        { from: 'app', to: 'blob-1-abcd' },
      ],
    };
    const saved = migrateSavedDesign({ design: legacyNode(design, 'blob-1-abcd', 0.7), workload: { rps: 5_000, readRatio: 0.9 } });
    const r = simulate(saved.design, saved.workload);
    expect(saved.workload).toEqual({ rps: 5_000, readRatio: 0.9, objectShare: 0.7 });
    expect(r.edges['app->blob-1-abcd']).toBeCloseTo(3_500);
    expect(r.edges['app->db']).toBeCloseTo(1_500);
    expect(r.metrics.p50Ms).toBe(119.4);
    expect(r.metrics.p99Ms).toBe(368.8);
    expect(r.metrics.monthlyCost).toBe(2_560);
  });

  it('leaves a board saved with the default share, or with a share already in its workload, as it is', () => {
    const { design, workload } = CASE_LABS['email-service'];
    expect(migrateSavedDesign({ design, workload })).toEqual({ design, workload });
    const named = { rps: 1_000, readRatio: 0.5, objectShare: 0.2 };
    expect(migrateSavedDesign({ design: legacyNode(design, 'blob', 0.9), workload: named }).workload).toBe(named);
  });

  it('splits a board that names no share by instance count, as builds always have', () => {
    const { design, workload } = CASE_LABS['video-streaming'];
    const r = simulate(design, workload);
    expect(r.edges['cdn->segments']).toBeCloseTo(3_966.667, 2);
    expect(r.edges['worker->segments']).toBeCloseTo(444.444, 2);
  });

  it('sends a named share of objects to the store once, wherever it is diverted', () => {
    const workload = { rps: 10_000, readRatio: 0.5, objectShare: 0.4 };
    for (const s of [
      { lbs: 2, apps: 8, shards: 2, objectStore: true },
      { lbs: 2, apps: 8, shards: 2, objectStore: true, cdn: { hitRate: 0, toStore: true } },
      { lbs: 2, apps: 8, shards: 2, objectStore: true, queues: 1, workers: 4, workersToStore: true },
    ]) {
      const r = simulate(stack(s), workload);
      const objects = r.nodes['objects'];
      expect(objects.readRps + objects.writeRps + objects.backgroundRps, JSON.stringify(s)).toBeCloseTo(4_000);
    }
  });
});
