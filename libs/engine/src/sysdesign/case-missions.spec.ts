import { describe, expect, it } from 'vitest';
import { canConnect } from './catalog.js';
import { CASE_LABS } from './cases/labs.js';
import { CASE_MISSION_SOLUTIONS, stack, type Stack } from './designs.fixture.js';
import { drainQueues } from './queue-drain.js';
import { DEFAULT_OBJECT_SHARE } from './object-share.js';
import { legacyObjectShare, nameObjectShare, restoreBoard, type SavedDesign } from './saved-design.js';
import { evaluate, getScenario, scenarioVariant } from './scenarios.js';
import { simulate } from './simulate.js';
import type { ComponentKind, Design, DesignNode, Scenario } from './types.js';

const failedChecks = (scenario: Scenario, design: Design) =>
  evaluate(scenario, design)
    .filter((g) => !g.pass)
    .map((g) => g.id);

const everyVersion = (id: string): Scenario[] => [getScenario(id)!, ...[1, 2, 3].map((v) => scenarioVariant(id, v)!)];

const MISSIONS = ['mail-attachments', 'ledger-month-end', 'reconnect-storm'];

/** A spread of designs from lean to lavish, with and without replicas, and up to two CDNs at a 99% hit rate. */
function* designs(extra: Partial<Stack>): Generator<Design> {
  for (const shards of [1, 2, 3, 4, 5, 6])
    for (const apps of [2, 3, 4, 6, 8, 10, 12, 14, 17, 20])
      for (const caches of [0, 2, 4, 6])
        for (const replicas of [0, shards])
          for (const cdn of [undefined, { hitRate: 0.99 }, { hitRate: 0.99, count: 2 }])
            yield stack({ lbs: 2, apps, shards, caches, replicas, cdn, ...extra });
}

type Part = [id: string, kind: ComponentKind, instances?: number, extra?: Partial<DesignNode>];

/** A board from its parts and `from>to` links. */
const board = (parts: Part[], links: string[]): Design => ({
  nodes: parts.map(([id, kind, instances = 1, extra = {}]) => ({
    id,
    kind,
    x: 0,
    y: 0,
    instances,
    ...(kind === 'db' ? { shardKey: 'hash' } : {}),
    ...extra,
  })),
  edges: links.map((l) => {
    const [from, to] = l.split('>');
    return { from, to };
  }),
});

/** Users, load balancers and app servers, with nothing to keep the writes. */
const appsOnly = (apps: number): Design => ({
  nodes: [
    { id: 'users', kind: 'client', x: 0, y: 0, instances: 1 },
    { id: 'lb', kind: 'lb', x: 0, y: 0, instances: 2 },
    { id: 'app', kind: 'app', x: 0, y: 0, instances: apps },
  ],
  edges: [
    { from: 'users', to: 'lb' },
    { from: 'lb', to: 'app' },
  ],
});

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

  it('fails with a queue in front, because transfers would be acknowledged before they commit', () => {
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

describe('Reconnect Storm', () => {
  const mission = getScenario('reconnect-storm')!;

  it('fails without a queue: committing every report as it arrives takes four shards', () => {
    expect(failedChecks(mission, stack({ lbs: 2, apps: 12, caches: 2, shards: 4, replicas: 4 }))).toEqual(['cost']);
    expect(passesAny('reconnect-storm', {})).toEqual([]);
  });

  it('needs a second primary: one drains too slowly, or fails with more workers than it can take', () => {
    const onePrimary = (workers: number) => stack({ lbs: 2, apps: 12, caches: 2, shards: 1, replicas: 1, queues: 2, workers });
    expect(failedChecks(mission, onePrimary(1))).toEqual(['drain']);
    expect(failedChecks(mission, onePrimary(2))).toEqual(expect.arrayContaining(['errors', 'durable']));
    expect(passesAny('reconnect-storm', { shards: 1, queues: 2, workers: 1 }).filter((t) => t === mission.title)).toEqual([]);
  });
});

describe('missions on the case studies', () => {
  it.each(MISSIONS)('%s fails every version with app servers that keep nothing', (id) => {
    for (const s of everyVersion(id))
      for (const apps of [2, 4, 8, 12, 16, 20]) {
        expect(failedChecks(s, appsOnly(apps)), `${s.title}, ${apps} apps`).toContain('durable');
        if (s.goals.synchronousWrites) expect(failedChecks(s, appsOnly(apps)), `${s.title}, ${apps} apps`).toContain('sync');
      }
  });

  it.each(MISSIONS)('%s changes the load or the goals on every revisit', (id) => {
    const versions = everyVersion(id).map((s) => JSON.stringify([s.workload, s.goals]));
    expect(new Set(versions).size).toBe(4);
    for (const v of [1, 2, 3])
      expect(failedChecks(scenarioVariant(id, v)!, CASE_MISSION_SOLUTIONS[id]).length, `revisit ${v}`).toBeGreaterThan(0);
  });

  it.each(MISSIONS)('%s names its object share', (id) => {
    for (const s of everyVersion(id)) expect(s.workload.objectShare).toBeTypeOf('number');
  });
});

describe('the object share in the workload', () => {
  const legacyNode = (design: Design, id: string, share: number): Design => ({
    ...design,
    nodes: design.nodes.map((n) => (n.id === id ? { ...n, share } : n)),
  });
  /** A board through the app's own path: saved as JSON, read back and opened. */
  const load = (saved: SavedDesign, scenario = getScenario('first-scale-up')!, free = true) =>
    restoreBoard(JSON.parse(JSON.stringify(saved)) as SavedDesign, scenario, free);
  const run = (opened: SavedDesign) => simulate(opened.design, opened.workload);

  // Numbers from the engine before the object share moved into the workload (366ce55), on the same boards.
  it('opens a File Sync build saved with the share on its block store exactly as before', () => {
    const { design, workload } = CASE_LABS['file-sync'];
    const saved = { design: legacyNode(design, 'blocks', 0.5), workload: { rps: workload.rps, readRatio: workload.readRatio } };
    const r = run(load(saved));
    expect([r.metrics.p50Ms, r.metrics.p99Ms]).toEqual([88.7, 207.9]);
    expect(r.edges['app->blocks']).toBeCloseTo(21_900);
    expect(r.edges['app->cache']).toBeCloseTo(18_900);
    expect(r.edges['app->db']).toBeCloseTo(3_000);
    expect(r).toEqual(simulate(design, workload));
  });

  it('opens free builds saved with custom shares exactly as before, whatever feeds the store', () => {
    const custom = board(
      [
        ['users', 'client'],
        ['lb', 'lb', 2],
        ['app', 'app', 3],
        ['db', 'db', 1],
        ['blob-1-abcd', 'blob', 1, { share: 0.7 }],
      ],
      ['users>lb', 'lb>app', 'app>db', 'app>blob-1-abcd'],
    );
    const r = run(load({ design: custom, workload: { rps: 5_000, readRatio: 0.9 } }));
    expect([r.metrics.p50Ms, r.metrics.p99Ms, r.metrics.monthlyCost]).toEqual([119.4, 368.8, 2_560]);
    expect(r.edges['app->blob-1-abcd']).toBeCloseTo(3_500);

    const tiers = board(
      [
        ['users', 'client'],
        ['lb', 'lb', 2],
        ['api', 'app', 4],
        ['uploads', 'app', 4],
        ['db', 'db', 2],
        ['meta', 'blob', 1, { share: 0.3 }],
        ['files', 'blob', 1, { share: 0.9 }],
      ],
      ['users>lb', 'lb>api', 'lb>uploads', 'api>db', 'api>meta', 'uploads>db', 'uploads>files'],
    );
    const t = run(load({ design: tiers, workload: { rps: 8_000, readRatio: 0.5 } }));
    expect([t.metrics.p50Ms, t.metrics.p99Ms, t.metrics.monthlyCost]).toEqual([86.4, 149.1, 5_260]);
    expect(t.edges['uploads->files']).toBeCloseTo(3_600);

    const workers = board(
      [
        ['users', 'client'],
        ['lb', 'lb', 2],
        ['app', 'app', 4],
        ['db', 'db', 2],
        ['blob-1-k3jd', 'blob', 1, { share: 0.3 }],
        ['queue', 'queue', 2],
        ['worker', 'worker', 2],
      ],
      ['users>lb', 'lb>app', 'app>db', 'app>blob-1-k3jd', 'app>queue', 'queue>worker', 'worker>db', 'worker>blob-1-k3jd'],
    );
    const w = run(load({ design: workers, workload: { rps: 6_000, readRatio: 0.5 } }));
    expect([w.metrics.p50Ms, w.metrics.p99Ms, w.metrics.monthlyCost]).toEqual([95.1, 249.7, 4_840]);
    expect(w.edges['worker->blob-1-k3jd']).toBeCloseTo(700);
  });

  it('opens an old mission board with its saved share, under the mission, exactly as before', () => {
    const writeWall = getScenario('write-wall')!;
    const parts: Part[] = [
      ['users', 'client'],
      ['lb', 'lb', 2],
      ['app', 'app', 10],
      ['db', 'db', 1],
      ['store', 'blob', 1, { share: 0.9 }],
    ];
    const storeOnly = board(parts, ['users>lb', 'lb>app', 'app>db', 'app>store']);
    const withWorkers = board(
      [...parts, ['queue', 'queue', 1], ['worker', 'worker', 1]],
      ['users>lb', 'lb>app', 'app>db', 'app>store', 'app>queue', 'queue>worker', 'worker>store'],
    );
    for (const [design, cost, p99] of [
      [storeOnly, 4_100, 182.7],
      [withWorkers, 4_580, 182.8],
    ] as const) {
      const opened = load({ design, workload: { rps: 1, readRatio: 1 } }, writeWall, false);
      expect(opened.workload).toBe(writeWall.workload);
      const r = run(opened);
      expect(r.edges['app->store']).toBeCloseTo(10_800);
      expect([r.metrics.monthlyCost, r.metrics.p99Ms]).toEqual([cost, p99]);
      expect(failedChecks(writeWall, opened.design)).toEqual([]);
    }
  });

  it('saves and reopens any board unchanged, so nothing drifts from the old rule on a reload', () => {
    for (const [id, lab] of Object.entries(CASE_LABS)) {
      const once = load(lab);
      const twice = load(once);
      expect(twice, id).toEqual(once);
      expect(once.workload.objectShare, id).toBe(lab.workload.objectShare);
    }
    const legacy = { design: legacyNode(CASE_LABS['file-sync'].design, 'blocks', 0.5), workload: { rps: 60_000, readRatio: 0.9 } };
    expect(load(load(legacy))).toEqual(legacy);
  });

  it('names a share only when the learner sets one, replacing the shares an old board kept on its stores', () => {
    const legacy = { design: legacyNode(CASE_LABS['file-sync'].design, 'blocks', 0.5), workload: { rps: 60_000, readRatio: 0.9 } };
    const named = nameObjectShare(legacy, 0.4);
    expect(named.workload).toEqual({ rps: 60_000, readRatio: 0.9, objectShare: 0.4 });
    expect(named.design.nodes.some((n) => n.share !== undefined)).toBe(false);
    const email = CASE_LABS['email-service'];
    expect(nameObjectShare(email, 0.3).design).toBe(email.design);
  });

  it('starts the Files control at the share an old board runs at', () => {
    const old = board(
      [
        ['users', 'client'],
        ['lb', 'lb', 2],
        ['app', 'app', 3],
        ['db', 'db'],
        ['blob', 'blob', 1, { share: 0.7 }],
      ],
      ['users>lb', 'lb>app', 'app>db', 'app>blob'],
    );
    const workload = { rps: 5_000, readRatio: 0.9 };
    expect(legacyObjectShare(old)).toBe(0.7);
    const named = nameObjectShare({ design: old, workload }, legacyObjectShare(old)!);
    expect(run(named).edges['app->blob']).toBeCloseTo(simulate(old, workload).edges['app->blob']);

    // The first app links no store, and the second links two: the old rule reads the first of them.
    const twoApps = board(
      [
        ['front', 'app'],
        ['users', 'client'],
        ['app', 'app'],
        ['db', 'db'],
        ['blob', 'blob', 1, { share: 0.7 }],
        ['second', 'blob', 1, { share: 0.2 }],
      ],
      ['users>front', 'users>app', 'front>db', 'app>second', 'app>blob', 'app>db'],
    );
    expect(legacyObjectShare(twoApps)).toBe(0.2);
    const r = simulate(twoApps, { rps: 2_000, readRatio: 0.9 });
    expect(r.edges['app->second'] + r.edges['app->blob']).toBeCloseTo(1_000 * 0.2);
    expect(legacyObjectShare(legacyNode(CASE_LABS['file-sync'].design, 'blocks', 0.5))).toBe(0.5);
    expect(legacyObjectShare(CASE_LABS['email-service'].design)).toBe(DEFAULT_OBJECT_SHARE);

    // An app that carries nothing is passed over for the one that does.
    const idleFirst = board(
      [
        ['client', 'client'],
        ['idle', 'app', 8, { failed: 8 }],
        ['live', 'app'],
        ['half', 'blob', 1, { share: 0.5 }],
        ['most', 'blob', 1, { share: 0.7 }],
      ],
      ['client>live', 'live>most', 'idle>half'],
    );
    expect(legacyObjectShare(idleFirst, simulate(idleFirst, { rps: 1_000, readRatio: 0.5 }).nodes)).toBe(0.7);
    expect(legacyObjectShare(idleFirst)).toBe(0.5);

    // A down app still takes in what is routed to it, but serves none of it.
    const downFirst = board(
      [
        ['c1', 'client'],
        ['c2', 'client'],
        ['appDown', 'app', 4, { failed: 4 }],
        ['appLive', 'app'],
        ['db', 'db'],
        ['blobA', 'blob', 1, { share: 0.5 }],
        ['blobB', 'blob', 1, { share: 0.7 }],
      ],
      ['c1>appDown', 'c2>appLive', 'appDown>blobA', 'appDown>db', 'appLive>blobB', 'appLive>db'],
    );
    const downRun = simulate(downFirst, { rps: 1_000, readRatio: 0.5 });
    expect(downRun.nodes['appDown'].status).toBe('down');
    expect(legacyObjectShare(downFirst, downRun.nodes)).toBe(0.7);

    // With no app linked to a store, CDNs and workers split by instance count, which no single share describes.
    expect(legacyObjectShare(appsOnly(2))).toBeUndefined();
    for (const id of ['video-streaming', 'web-crawler']) expect(legacyObjectShare(CASE_LABS[id].design), id).toBeUndefined();
  });

  it('names the crawler build its share, the one its fetchers already ran at, and leaves the video build on the old rule', () => {
    const crawler = CASE_LABS['web-crawler'];
    expect(crawler.workload.objectShare).toBe(0.2);
    expect(simulate(crawler.design, crawler.workload)).toEqual(simulate(crawler.design, { ...crawler.workload, objectShare: undefined }));
    expect(CASE_LABS['video-streaming'].workload.objectShare).toBeUndefined();
  });

  it('splits a board that names no share by instance count, as builds always have', () => {
    const { design, workload } = CASE_LABS['video-streaming'];
    const r = simulate(design, workload);
    expect(r.edges['cdn->segments']).toBeCloseTo(3_966.667, 2);
    expect(r.edges['worker->segments']).toBeCloseTo(444.444, 2);
    const old = run(load({ design: legacyNode(design, 'segments', 0), workload }));
    expect(old).toEqual(r);
  });

  it('sends everything to the stores when old-rule workers have no database, however many stores they feed', () => {
    for (const stores of [1, 6, 7, 10]) {
      const ids = Array.from({ length: stores }, (_, i) => `store${i}`);
      const design = board(
        [
          ['users', 'client'],
          ['lb', 'lb', 2],
          ['app', 'app', 4],
          ['db', 'db', 1],
          ['queue', 'queue', 1],
          ['worker', 'worker', 2],
          ...ids.map((id): Part => [id, 'blob']),
        ],
        ['users>lb', 'lb>app', 'app>db', 'app>queue', 'queue>worker', ...ids.map((id) => `worker>${id}`)],
      );
      const r = simulate(design, { rps: 5_000, readRatio: 0.5 });
      expect(
        r.insights.map((i) => i.title),
        `${stores} stores`,
      ).not.toContain('Workers have no database for records');
    }
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

  it('asks for no database when every request is a file and the workers write only to the store', () => {
    const design = board(
      [
        ['users', 'client'],
        ['lb1', 'lb', 1],
        ['lb2', 'lb', 2],
        ['app', 'app', 20],
        ['db', 'db', 4],
        ['queue', 'queue', 4],
        ['worker', 'worker', 8],
        ['store', 'blob'],
      ],
      ['users>lb1', 'users>lb2', 'lb1>app', 'lb2>app', 'app>db', 'app>queue', 'queue>worker', 'worker>store'],
    );
    const r = simulate(design, { rps: 1_000, readRatio: 0.3, objectShare: 1 });
    expect(r.insights.map((i) => i.title)).not.toContain('Workers have no database for records');
    expect(r.metrics.durableWriteRatio).toBeCloseTo(1);

    // Files from three clients reach the app over three paths, so their share is summed to a hair under 1.
    const threeClients = board(
      [
        ['web', 'client'],
        ['ios', 'client'],
        ['android', 'client'],
        ['lb', 'lb', 2],
        ['app', 'app', 10],
        ['blob', 'blob'],
        ['cache', 'cache'],
        ['queue', 'queue', 2],
        ['worker', 'worker', 2],
      ],
      ['web>lb', 'ios>lb', 'android>lb', 'lb>app', 'app>blob', 'app>cache', 'app>queue', 'queue>worker'],
    );
    for (const readRatio of [0.3, 0.5, 0.7]) {
      const all = simulate(threeClients, { rps: 1_000, readRatio, objectShare: 1 });
      expect([all.nodes['cache'].readRps, all.nodes['queue'].writeRps], `${readRatio}`).toEqual([0, 0]);
      expect(all.insights.map((i) => i.title)).not.toContain('Cache has nowhere to send traffic');
      expect(all.insights.map((i) => i.title)).not.toContain('Workers have nowhere to write');
    }
  });
});

describe('queues drain from what they hold', () => {
  const storm = getScenario('reconnect-storm')!;
  const onePrimary = (extra: Part[], links: string[]) =>
    board(
      [
        ['users', 'client'],
        ['lb', 'lb', 2],
        ['app', 'app', 12],
        ['cache', 'cache', 2],
        ['db', 'db', 1],
        ['replica', 'replica', 1],
        ['queue', 'queue', 2],
        ['worker', 'worker', 1],
        ...extra,
      ],
      ['users>lb', 'lb>app', 'app>cache', 'cache>db', 'db>replica', 'app>queue', 'queue>worker', 'worker>db', ...links],
    );

  it('an empty queue beside a full one adds no drain, whether it shares the workers or has its own', () => {
    expect(failedChecks(storm, onePrimary([], []))).toEqual(['drain']);
    expect(failedChecks(storm, onePrimary([['idle', 'queue', 1]], ['idle>worker']))).toContain('drain');
    expect(
      failedChecks(
        storm,
        onePrimary(
          [
            ['idle', 'queue', 1],
            ['spare', 'worker', 2],
          ],
          ['idle>spare', 'spare>db'],
        ),
      ),
    ).toContain('drain');
  });

  it('an idle queue linking the busy worker to a spare one adds nothing', () => {
    const board0 = onePrimary(
      [
        ['idle', 'queue', 1],
        ['spare', 'worker', 1],
      ],
      ['idle>worker', 'idle>spare'],
    );
    expect(failedChecks(storm, board0)).toContain('drain');
    const r = simulate(board0, storm.workload);
    expect(r.nodes['spare'].backgroundRps).toBe(0);
    expect(r.metrics.backlogDrainRatio).toBeCloseTo((8_000 - 1_500) / 1_500);
  });

  it('a queue with no workers backs up on its own, without taking the workers of the queue beside it', () => {
    const r = drainQueues(
      [
        { id: 'stuck', incoming: 1_000, workers: [] },
        { id: 'moving', incoming: 1_000, workers: ['w'] },
      ],
      () => 1_500,
    );
    expect(r.flows.get('moving')?.get('w')).toBeCloseTo(1_000);
    expect(r.backlogGrowthPerSec).toBeCloseTo(1_000);
    expect(r.backlogDrainRatio).toBe(Number.POSITIVE_INFINITY);
  });

  it('two queues sharing workers split them, so the drain time is that of the slower queue', () => {
    const shared = onePrimary([['second', 'queue', 2]], ['app>second', 'second>worker']);
    const r = simulate(shared, storm.workload);
    expect(r.nodes['worker'].backgroundRps).toBeCloseTo(1_500);
    expect(failedChecks(storm, shared)).toContain('drain');
  });
});

describe('the drain does not depend on the order the board lists anything', () => {
  const writeWall = getScenario('write-wall')!;
  const parts: Part[] = [
    ['users', 'client'],
    ['lb', 'lb', 2],
    ['app', 'app', 9],
    ['cache', 'cache', 2],
    ['db', 'db', 4],
    ['q1', 'queue', 1],
    ['q2', 'queue', 1],
    ['wA', 'worker', 2],
    ['wS', 'worker', 3],
  ];
  const links = ['users>lb', 'lb>app', 'app>cache', 'cache>db', 'q1>wA', 'q1>wS', 'q2>wS', 'wA>db', 'wS>db'];

  it('clears The Write Wall with two queues sharing a worker, whichever queue was linked first', () => {
    for (const first of [
      ['app>q1', 'app>q2'],
      ['app>q2', 'app>q1'],
    ]) {
      const design = board(parts, [...first, ...links]);
      expect(failedChecks(writeWall, design), first.join(',')).toEqual([]);
      expect(simulate(design, writeWall.workload).metrics.backlogGrowthPerSec).toBe(0);
    }
  });

  it('lists insights in the order of the board, though workers are worked out last', () => {
    const design = board(
      [
        ['users', 'client'],
        ['limiter', 'limiter'],
        ['lb', 'lb'],
        ['app1', 'app'],
        ['app2', 'app'],
        ['cache', 'cache'],
        ['store', 'blob', 1, { share: 0.3 }],
        ['queue', 'queue'],
        ['worker', 'worker'],
      ],
      ['users>limiter', 'users>app1', 'limiter>lb', 'lb>app2', 'app2>cache', 'app2>store', 'app1>queue', 'queue>worker'],
    );
    const titles = simulate(design, { rps: 2_000, readRatio: 0.5 }).insights.map((i) => i.title);
    const workers = titles.indexOf('Workers have nowhere to write');
    expect(workers).toBeGreaterThanOrEqual(0);
    expect(workers).toBeLessThan(titles.indexOf('Cache has nowhere to send traffic'));
  });

  it('gives the same node loads, link loads and goal checks for any order of nodes and links', () => {
    let seed = 96;
    const shuffle = <T>(list: T[]) => {
      const out = [...list];
      for (let i = out.length - 1; i > 0; i--) {
        seed = (seed * 1_103_515_245 + 12_345) % 2 ** 31;
        const j = seed % (i + 1);
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    };
    const attachments = scenarioVariant('mail-attachments', 1)!;
    const crossLinked = (first: string[]) => [...first, 'appA>qA', 'appB>qB', 'w1>db', 'w1>blob', 'w2>db'];
    // Two app tiers whose queues carry different shares of files, each queue linked to both workers.
    const g1 = (order: string[]) =>
      board(
        [
          ['users', 'client'],
          ['lb', 'lb', 2],
          ['appA', 'app', 8],
          ['appB', 'app', 2],
          ['blob', 'blob'],
          ['db', 'db', 2],
          ['qA', 'queue'],
          ['qB', 'queue'],
          ['w1', 'worker', 2],
          ['w2', 'worker', 1],
        ],
        ['users>lb', 'lb>appA', 'lb>appB', 'appA>blob', 'appA>db', 'appB>db', ...crossLinked(order)],
      );
    const g7 = (order: string[]) =>
      board(
        [
          ['users', 'client'],
          ['lb', 'lb', 1],
          ['appA', 'app', 4],
          ['appB', 'app', 6],
          ['blob', 'blob'],
          ['db', 'db', 2],
          ['qA', 'queue'],
          ['qB', 'queue'],
          ['w1', 'worker', 1],
          ['w2', 'worker', 3],
        ],
        ['users>lb', 'lb>appA', 'lb>appB', 'appB>blob', 'appA>db', 'appB>db', ...crossLinked(order)],
      );
    const orders = [
      ['qA>w1', 'qA>w2', 'qB>w1', 'qB>w2'],
      ['qA>w2', 'qA>w1', 'qB>w2', 'qB>w1'],
    ];
    const boards: [Design, Scenario][] = [
      [board(parts, ['app>q1', 'app>q2', ...links]), writeWall],
      [
        board(
          [...parts, ['idle', 'queue', 1], ['spare', 'worker', 1]],
          ['app>q1', 'app>q2', 'idle>wS', 'idle>spare', 'spare>db', ...links],
        ),
        writeWall,
      ],
      ...orders.flatMap((order): [Design, Scenario][] => [
        [g1(order), attachments],
        [g7(order), attachments],
        [g1(order), { ...attachments, workload: { ...attachments.workload, objectShare: 0.5 } }],
      ]),
      ...Object.entries(CASE_MISSION_SOLUTIONS).map(([key, design]): [Design, Scenario] => {
        const [id, v] = key.split(':');
        return [design, v ? scenarioVariant(id, Number(v))! : getScenario(id)!];
      }),
    ];
    const near = (a: unknown, b: unknown, path: string): void => {
      if (typeof a === 'number' && typeof b === 'number') {
        if (Number.isFinite(a)) expect(Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(a)), path).toBe(true);
        else expect(b, path).toBe(a);
      } else if (a && typeof a === 'object') {
        expect(Object.keys(b as object).sort(), path).toEqual(Object.keys(a).sort());
        for (const k of Object.keys(a)) near((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k], `${path}.${k}`);
      } else expect(b, path).toEqual(a);
    };
    for (const [design, scenario] of boards) {
      const base = simulate(design, scenario.workload);
      const goals = evaluate(scenario, design, base).map((c) => [c.id, c.pass]);
      for (let k = 0; k < 6; k++) {
        const shuffled = { nodes: shuffle(design.nodes), edges: shuffle(design.edges) };
        const r = simulate(shuffled, scenario.workload);
        near(base.nodes, r.nodes, 'nodes');
        near(base.edges, r.edges, 'edges');
        near(base.metrics, r.metrics, 'metrics');
        expect(evaluate(scenario, shuffled, r).map((c) => [c.id, c.pass])).toEqual(goals);
      }
    }
    for (const make of [g1, g7]) {
      const [first, second] = orders.map((order) => simulate(make(order), attachments.workload));
      near(first.nodes, second.nodes, 'nodes');
      near(first.edges, second.edges, 'edges');
      expect(first.edges['qA->w2'] ?? 0).toBeGreaterThan(0);
    }
  });
});

describe('a replica copies one database', () => {
  const shared = (apps: number, shards: number, replicas: number, extra: Part[] = [], links: string[] = []) =>
    board(
      [
        ['users', 'client'],
        ['lb', 'lb', 2],
        ['app', 'app', apps],
        ['cache', 'cache', 2],
        ['east', 'db', shards],
        ['west', 'db', shards],
        ['replica', 'replica', replicas],
        ...extra,
      ],
      ['users>lb', 'lb>app', 'app>cache', 'cache>east', 'cache>west', 'east>replica', 'west>replica', ...links],
    );

  it('cannot be connected to a second database', () => {
    const design = shared(8, 2, 2);
    design.edges = design.edges.filter((e) => e.from !== 'west');
    expect(canConnect(design, 'west', 'replica')).toEqual({ ok: false, reason: 'A replica node copies one database' });
  });

  it('counts for no database when an old board shares it, so the shortcut no longer clears a mission', () => {
    const insights = simulate(shared(8, 2, 2), { rps: 1_000, readRatio: 0.5 }).insights.map((i) => i.title);
    expect(insights).toContain('One replica node copies 2 databases');
    expect(failedChecks(getScenario('reconnect-storm')!, shared(12, 2, 4))).toContain('spof');
    expect(failedChecks(getScenario('ledger-month-end')!, shared(10, 2, 2))).toContain('spof');
    expect(failedChecks(scenarioVariant('mail-attachments', 2)!, shared(9, 2, 2))).toContain('spof');
  });
});

describe('the takeaways hold on every revisit', () => {
  it('Reconnect Storm never claims a second primary or worker that a revisit does not need', () => {
    for (const v of [1, 2, 3]) {
      const revisit = scenarioVariant('reconnect-storm', v)!;
      const reference = CASE_MISSION_SOLUTIONS[`reconnect-storm:${v}`];
      const count = (kind: string) => reference.nodes.filter((n) => n.kind === kind).reduce((sum, n) => sum + n.instances, 0);
      expect([count('db'), count('worker')], `revisit ${v}`).toEqual([1, 1]);
      expect(revisit.takeaway, `revisit ${v}`).not.toMatch(/second primary|second worker|two workers|1,850/);
      expect(revisit.hints).toEqual([]);
    }
    expect(getScenario('reconnect-storm')!.hints.join(' ')).toMatch(/1,850/);
  });

  it('Attachments Everywhere sizes the shards by the share of files, which every revisit changes', () => {
    const versions = everyVersion('mail-attachments');
    expect(versions.map((s) => s.workload.objectShare)).toEqual([0.5, 0.7, 0.5, 0.3]);
    for (const s of versions) expect(s.takeaway, s.title).not.toMatch(/\b(half|here)\b/i);
    expect(versions[0].hints[2]).toMatch(/3,500 are records.*7,000 ops.*two shards, against four/);
  });

  it('Month-End Ledger states no number a revisit could change', () => {
    for (const s of everyVersion('ledger-month-end')) expect(s.takeaway, s.title).not.toMatch(/\d/);
  });
});

describe('every Reconnect Storm names the outage its reports come from', () => {
  it('has each agent send about 1.44 reports for every minute the control plane was down', () => {
    const agents = 50_000;
    const outages = [20, 10, 17, 15];
    everyVersion('reconnect-storm').forEach((s, i) => {
      const minutes = outages[i];
      expect(s.brief, s.title).toMatch(new RegExp(`\\b${minutes}[ -]minute`));
      const perAgent = (s.workload.rps * (1 - s.workload.readRatio) * s.goals.spikeSeconds!) / agents;
      expect(Math.abs(perAgent / minutes / 1.44 - 1), `${s.title}: ${perAgent} reports per agent`).toBeLessThan(0.025);
    });
  });
});
