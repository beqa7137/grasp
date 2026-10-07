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

  describe('incremental pulls', () => {
    const since = (learnerId: string, cursor: string) =>
      request(app.getHttpServer()).get('/api/progress/events').query({ since: cursor }).set('x-learner-id', learnerId);
    const backdate = async (learnerId: string, minutes: number) =>
      pool?.query(`update learning_events set received_at = received_at - make_interval(mins => $2) where learner_id = $1`, [
        learnerId,
        minutes,
      ]);

    it('returns everything with a cursor first, then what arrived since, keeping the cursor when nothing did', async () => {
      const learnerId = randomUUID();
      const first = event('evt-first');
      await post(learnerId, [first]).expect(200);
      const full = (await stored(learnerId).expect(200)).body;
      expect(full.events).toEqual([first]);
      expect(Date.parse(full.cursor)).not.toBeNaN();

      const second = event('evt-second');
      await post(learnerId, [second]).expect(200);
      const next = (await since(learnerId, full.cursor).expect(200)).body;
      expect(next.events.map((e: { id: string }) => e.id)).toContain('evt-second');
      expect(Date.parse(next.cursor)).toBeGreaterThanOrEqual(Date.parse(full.cursor));

      const later = new Date(Date.now() + 10 * 60_000).toISOString();
      expect((await since(learnerId, later).expect(200)).body).toEqual({ events: [], cursor: later });
    });

    it('rejects a cursor that is not a timestamp', async () => {
      await since(randomUUID(), 'yesterday').expect(400);
    });

    it.runIf(storage === 'postgres')('leaves out what arrived before the cursor, less a minute of overlap', async () => {
      const learnerId = randomUUID();
      await post(learnerId, [event('evt-older')]).expect(200);
      const cursor = (await stored(learnerId).expect(200)).body.cursor;
      await backdate(learnerId, 10);
      await post(learnerId, [event('evt-newer')]).expect(200);
      expect((await since(learnerId, cursor).expect(200)).body.events.map((e: { id: string }) => e.id)).toEqual(['evt-newer']);
    });

    it.runIf(storage === 'postgres')("brings a merged guest's history to a device that already holds a cursor", async () => {
      const account = randomUUID();
      const guest = randomUUID();
      await post(account, [event('evt-account')]).expect(200);
      await post(guest, [event('evt-guest', new Date(Date.now() - 86_400_000).toISOString())]).expect(200);
      await backdate(guest, 10);
      const cursor = (await stored(account).expect(200)).body.cursor;
      await backdate(account, 10);
      await pool!.query(`insert into users (id, email, learner_id, created_at) values ($1, $2, $3, now())`, [
        randomUUID(),
        `${account}@example.com`,
        account,
      ]);
      await app.get(ErasureStore).merge(guest, account);
      const after = new Date(Date.parse(cursor) - 60_000);
      expect((await app.get(ProgressStore).listReceivedAfter(account, after)).events.map((e) => e.id)).toEqual(['evt-guest']);
    });
  });

  describe('event versions', () => {
    const target = (id: string) => ({
      id,
      at: new Date().toISOString(),
      type: 'target.set' as const,
      target: { level: 'senior', rounds: { coding: 2, design: 2, behavioral: 1 }, company: 'amazon' },
    });
    const pull = (learnerId: string, query: Record<string, string>) =>
      request(app.getHttpServer()).get('/api/progress/events').query(query).set('x-learner-id', learnerId);
    const ids = (body: { events: { id: string }[] }) => body.events.map((e) => e.id).sort();

    it('never returns target.set to a pull without v=2, and still moves its cursor past it', async () => {
      const learnerId = randomUUID();
      await post(learnerId, [event('evt-before'), target('evt-target'), event('evt-after')]).expect(200);
      for (const query of [{}, { v: '1' }] as Record<string, string>[]) {
        const body = (await pull(learnerId, query).expect(200)).body;
        expect(ids(body)).toEqual(['evt-after', 'evt-before']);
        expect(Date.parse(body.cursor)).not.toBeNaN();
        const cursor = new Date(Date.parse(body.cursor) - 30_000).toISOString();
        expect(ids((await pull(learnerId, { ...query, since: cursor }).expect(200)).body)).not.toContain('evt-target');
      }
      expect(ids((await pull(learnerId, { v: '2' }).expect(200)).body)).toEqual(['evt-after', 'evt-before', 'evt-target']);
      expect(ids((await pull(learnerId, { v: '3' }).expect(200)).body)).toContain('evt-target');
    });

    it('rejects a version that is not a positive integer', async () => {
      for (const v of ['0', 'two', '1.5']) await pull(randomUUID(), { v }).expect(400);
    });

    it('accepts a Target only in its declared shape', async () => {
      const learnerId = randomUUID();
      const valid = target('evt-target-ok');
      await post(learnerId, [{ ...valid, target: { level: 'mid', rounds: { coding: 0, design: 0, behavioral: 1 } } }]).expect(200);
      const invalid = [
        { level: 'staff', rounds: valid.target.rounds },
        { ...valid.target, rounds: { coding: 4, design: 0, behavioral: 0 } },
        { ...valid.target, rounds: { coding: 0, design: 0, behavioral: 0 } },
        { ...valid.target, rounds: { coding: 1, design: 1 } },
        { ...valid.target, rounds: { ...valid.target.rounds, ood: 1 } },
        { ...valid.target, company: 'initech' },
        { ...valid.target, interviewDate: '2026-12-01' },
      ];
      for (const [i, body] of invalid.entries()) await post(learnerId, [{ ...valid, id: `evt-target-bad-${i}`, target: body }]).expect(400);
    });
  });

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
