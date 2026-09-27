import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import pg from 'pg';
import request from 'supertest';
import { AuthStore, ProgressStore } from '../src/persistence/stores.js';
import { ErasureStore } from '../src/persistence/erasure.stores.js';
import { PG_POOL } from '../src/persistence/persistence.module.js';
import { createTestApp } from './support/app.js';
import { resetDatabase } from './support/database.js';

const testDatabaseUrl = process.env['TEST_DATABASE_URL'];
const storages = testDatabaseUrl ? (['memory', 'postgres'] as const) : (['memory'] as const);
const event = (id: string, at = new Date().toISOString(), correct = true) => ({
  id,
  at,
  type: 'predict.answered' as const,
  algorithmId: 'binary-search',
  patternId: 'binary-search',
  correct,
});

describe.each(storages)('Progress append contract (%s)', (storage) => {
  let app: NestExpressApplication;
  let pool: pg.Pool | null;

  beforeAll(async () => {
    if (storage === 'postgres') await resetDatabase(testDatabaseUrl!);
    app = await createTestApp({ DATABASE_URL: storage === 'postgres' ? testDatabaseUrl : undefined });
    pool = storage === 'postgres' ? app.get<pg.Pool>(PG_POOL) : null;
  });

  afterAll(async () => {
    await app?.close();
  });

  const post = (learnerId: string, events: object[], server = app) =>
    request(server.getHttpServer()).post('/api/progress/events').set('x-learner-id', learnerId).send({ events });
  const stored = (learnerId: string) => request(app.getHttpServer()).get('/api/progress/events').set('x-learner-id', learnerId);
  const expectNoLearnerRow = async (learnerId: string) => {
    if (!pool) return;
    const { rows } = await pool.query<{ count: number }>('select count(*)::int as count from learners where id = $1', [learnerId]);
    expect(rows[0]?.count).toBe(0);
  };

  it('acknowledges eligible IDs and defers future IDs without persisting them', async () => {
    const learnerId = randomUUID();
    const eligible = event('evt-eligible', new Date().toISOString());
    const future = event('evt-future', new Date(Date.now() + 6 * 60_000).toISOString());

    const first = await post(learnerId, [eligible, future]).expect(200);
    expect(first.body).toMatchObject({
      accepted: 1,
      duplicates: 0,
      rejectedFuture: 1,
      acknowledgedIds: [eligible.id],
      deferredFutureIds: [future.id],
    });
    expect(first.body.serverTime).toMatch(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d\.\d{3}Z$/);
    expect(Date.parse(future.at)).toBeGreaterThan(Date.parse(first.body.serverTime) + 5 * 60_000);
    expect((await stored(learnerId).expect(200)).body.events).toEqual([eligible]);

    const retry = await post(learnerId, [eligible, future]).expect(200);
    expect(retry.body).toMatchObject({
      accepted: 0,
      duplicates: 1,
      rejectedFuture: 1,
      acknowledgedIds: [eligible.id],
      deferredFutureIds: [future.id],
    });
    expect((await stored(learnerId).expect(200)).body.events).toEqual([eligible]);
  });

  it('rejects duplicate IDs and malformed neighbors before any append', async () => {
    const learnerId = randomUUID();
    const valid = event('evt-duplicate');
    const duplicate = event(valid.id, valid.at, false);
    const repeated = await post(learnerId, [valid, duplicate]).expect(400);
    expect(repeated.body.issues).toContainEqual({ path: 'events', message: 'Event IDs must be unique within a request' });
    await post(learnerId, [valid, { ...event('evt-malformed'), algorithmId: 'missing' }]).expect(400);
    expect((await stored(learnerId).expect(200)).body.events).toEqual([]);
    await expectNoLearnerRow(learnerId);
  });

  it('leaves an event unacknowledged after a pre-write failure so retry can store it', async () => {
    const learnerId = randomUUID();
    const progressEvent = event('evt-retry-after-failure');
    const spy = vi.spyOn(app.get(ProgressStore), 'append').mockRejectedValueOnce(new Error('write failed before append'));
    try {
      const failure = await post(learnerId, [progressEvent]).expect(500);
      expect(failure.body.acknowledgedIds).toBeUndefined();
      expect((await stored(learnerId).expect(200)).body.events).toEqual([]);
      await expectNoLearnerRow(learnerId);
    } finally {
      spy.mockRestore();
    }

    const retry = await post(learnerId, [progressEvent]).expect(200);
    expect(retry.body).toMatchObject({ accepted: 1, acknowledgedIds: [progressEvent.id] });
    expect((await stored(learnerId).expect(200)).body.events).toEqual([progressEvent]);
  });

  it('acknowledges a committed request on retry and keeps its original payload', async () => {
    const learnerId = randomUUID();
    const original = event('evt-committed', new Date().toISOString());
    const store = app.get(ProgressStore);
    const append = store.append.bind(store);
    let signalCommit!: () => void;
    let releaseResponse!: () => void;
    const committed = new Promise<void>((resolve) => (signalCommit = resolve));
    const heldResponse = new Promise<void>((resolve) => (releaseResponse = resolve));
    const spy = vi.spyOn(store, 'append').mockImplementation(async (id, events) => {
      const result = await append(id, events);
      signalCommit();
      await heldResponse;
      return result;
    });
    const firstRequest = post(learnerId, [original]);
    const firstResult = firstRequest.then(
      () => 'delivered',
      () => 'lost',
    );
    try {
      await committed;
      firstRequest.abort();
      expect(await firstResult).toBe('lost');
    } finally {
      releaseResponse();
      spy.mockRestore();
    }

    const changedRetry = event(original.id, new Date(Date.parse(original.at) - 1_000).toISOString(), false);
    const retry = await post(learnerId, [changedRetry]).expect(200);
    expect(retry.body).toMatchObject({ accepted: 0, duplicates: 1, acknowledgedIds: [original.id], deferredFutureIds: [] });
    expect((await stored(learnerId).expect(200)).body.events).toEqual([original]);
  });

  it('keeps empty and all-future requests read-only for unknown learners', async () => {
    const learnerId = randomUUID();
    const future = event('evt-only-future', new Date(Date.now() + 6 * 60_000).toISOString());
    const deferred = await post(learnerId, [future]).expect(200);
    expect(deferred.body).toMatchObject({
      accepted: 0,
      duplicates: 0,
      rejectedFuture: 1,
      acknowledgedIds: [],
      deferredFutureIds: [future.id],
    });
    const empty = await post(learnerId, []).expect(200);
    expect(empty.body).toMatchObject({
      accepted: 0,
      duplicates: 0,
      rejectedFuture: 0,
      acknowledgedIds: [],
      deferredFutureIds: [],
    });
    await expectNoLearnerRow(learnerId);
  });

  it('rejects empty and all-future requests for erased and merged learners', async () => {
    const erased = randomUUID();
    const moved = randomUUID();
    const accountLearner = randomUUID();
    const now = new Date().toISOString();
    const erasure = app.get(ErasureStore);
    await erasure.erase(erased);
    expect(
      await app.get(AuthStore).createUser({
        id: randomUUID(),
        email: `${randomUUID()}@example.com`,
        learnerId: accountLearner,
        createdAt: now,
        lastLoginAt: null,
      }),
    ).toBe(true);
    await erasure.merge(moved, accountLearner);

    for (const [learnerId, code] of [
      [erased, 'learner_erased'],
      [moved, 'learner_moved'],
    ] as const) {
      for (const events of [[], [event(`evt-${randomUUID()}`, new Date(Date.now() + 6 * 60_000).toISOString())]]) {
        const response = await post(learnerId, events).expect(410);
        expect(response.body.code).toBe(code);
      }
      await expectNoLearnerRow(learnerId);
    }
  });

  it('accepts the exact parser byte limit and rejects one byte beyond it', async () => {
    const learnerId = randomUUID();
    const json = '{"events":[]}';
    const exact = json + ' '.repeat(262_144 - Buffer.byteLength(json));
    const beyond = exact + ' ';
    expect(Buffer.byteLength(exact)).toBe(262_144);
    expect(Buffer.byteLength(beyond)).toBe(262_145);

    await request(app.getHttpServer())
      .post('/api/progress/events')
      .set('x-learner-id', learnerId)
      .set('content-type', 'application/json')
      .send(exact)
      .expect(200);
    await request(app.getHttpServer())
      .post('/api/progress/events')
      .set('x-learner-id', learnerId)
      .set('content-type', 'application/json')
      .send(beyond)
      .expect(413);
    await expectNoLearnerRow(learnerId);
  });

  if (storage === 'postgres') {
    it('converges duplicate uploads from two API instances on one stored event', async () => {
      const second = await createTestApp({ DATABASE_URL: testDatabaseUrl });
      try {
        const learnerId = randomUUID();
        const progressEvent = event('evt-two-instances');
        const [first, other] = await Promise.all([post(learnerId, [progressEvent]), post(learnerId, [progressEvent], second)]);
        expect([first.status, other.status]).toEqual([200, 200]);
        expect(first.body.accepted + other.body.accepted).toBe(1);
        expect(first.body.duplicates + other.body.duplicates).toBe(1);
        expect(first.body.acknowledgedIds).toEqual([progressEvent.id]);
        expect(other.body.acknowledgedIds).toEqual([progressEvent.id]);
        expect((await stored(learnerId).expect(200)).body.events).toEqual([progressEvent]);
      } finally {
        await second.close();
      }
    });
  }
});
