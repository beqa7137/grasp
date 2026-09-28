import type { StoredEvent } from '@grasp/engine';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { InterviewSession, PublicInterviewSession, Scorecard } from '../src/interview/interview.types.js';
import { OfflineInterviewer } from '../src/interview/offline.interviewer.js';
import { ErasureStore } from '../src/persistence/erasure.stores.js';
import { AuthStore, CoordinationStore, InterviewStore, ProgressStore } from '../src/persistence/stores.js';
import { createTestApp } from './support/app.js';
import { resetDatabase } from './support/database.js';

const databaseUrl = process.env['TEST_DATABASE_URL'];
const storages = databaseUrl ? (['memory', 'postgres'] as const) : (['memory'] as const);
const card: Scorecard = {
  mode: 'offline',
  verdict: 'lean-hire',
  summary: 'Explained the invariant and one boundary case.',
  dimensions: [{ name: 'Reasoning', score: 3, evidence: 'Used a decreasing stack.' }],
  strengths: ['Named the invariant'],
  improvements: ['Trace equal values'],
  weakPatterns: ['monotonic-stack', 'binary-search'],
};

function barrier() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return {
    promise,
    release,
    async wait() {
      let timer: ReturnType<typeof setTimeout> | undefined;
      try {
        await Promise.race([
          promise,
          new Promise<never>((_, reject) => {
            timer = setTimeout(() => reject(new Error('Interview test barrier was not reached')), 3000);
          }),
        ]);
      } finally {
        clearTimeout(timer);
      }
    },
  };
}

function scoredEvent(session: Pick<InterviewSession, 'id' | 'scoredAt' | 'track' | 'scorecard'>) {
  return {
    id: `interview-${session.id}`,
    at: session.scoredAt!,
    type: 'interview.scored' as const,
    sessionId: session.id,
    track: session.track,
    verdict: session.scorecard!.verdict,
    weakPatterns: session.scorecard!.weakPatterns,
  };
}

describe.each(storages)('Atomic interview score over HTTP (%s storage)', (storage) => {
  let app: NestExpressApplication;
  let other: NestExpressApplication;

  const instance = () =>
    createTestApp({
      DATABASE_URL: storage === 'postgres' ? databaseUrl : undefined,
      RATE_LIMIT_PER_MINUTE: '10000',
    });

  beforeAll(async () => {
    if (storage === 'postgres') await resetDatabase(databaseUrl!);
    app = await instance();
    other = storage === 'postgres' ? await instance() : app;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  afterAll(async () => {
    await app?.close();
    if (other !== app) await other?.close();
  });

  async function start() {
    const learnerId = randomUUID();
    const response = await request(app.getHttpServer())
      .post('/api/interview/sessions')
      .set('x-learner-id', learnerId)
      .send({ track: 'coding', problemId: 'warmer-days' })
      .expect(201);
    return { learnerId, id: response.body.id as string };
  }

  const score = ({ learnerId, id }: { learnerId: string; id: string }, server = app) =>
    request(server.getHttpServer()).post(`/api/interview/sessions/${id}/score`).set('x-learner-id', learnerId).timeout({ deadline: 4000 });

  const get = ({ learnerId, id }: { learnerId: string; id: string }, server = app) =>
    request(server.getHttpServer()).get(`/api/interview/sessions/${id}`).set('x-learner-id', learnerId);

  const events = (learnerId: string, server = app) =>
    request(server.getHttpServer()).get('/api/progress/events').set('x-learner-id', learnerId);

  const message = ({ learnerId, id }: { learnerId: string; id: string }, server = app) =>
    request(server.getHttpServer())
      .post(`/api/interview/sessions/${id}/messages`)
      .set('x-learner-id', learnerId)
      .send({ content: 'I will scan from the right and retain a decreasing stack.' })
      .timeout({ deadline: 4000 });

  async function seedScored(session: { learnerId: string; id: string }) {
    const store = app.get(InterviewStore);
    const active = (await store.get(session.learnerId, session.id))!;
    const scored: InterviewSession = {
      ...active,
      status: 'scored',
      scorecard: structuredClone(card),
      scoredAt: '2026-09-26T18:00:00.000Z',
    };
    await store.save(scored);
    return scored;
  }

  function expireFirstLease() {
    const coordination = app.get(CoordinationStore);
    const acquire = coordination.acquireLease.bind(coordination);
    vi.spyOn(coordination, 'acquireLease').mockImplementationOnce((key, holder) => acquire(key, holder, 0));
  }

  it('returns a score only with one matching event and returns the same pair on retry', async () => {
    const session = await start();
    const provider = vi.spyOn(app.get(OfflineInterviewer), 'score').mockResolvedValue({ scorecard: card });
    const first = await score(session).expect(201);
    const scored = first.body as PublicInterviewSession;
    expect(scored).toMatchObject({ status: 'scored', scorecard: card });
    expect(Number.isFinite(Date.parse(scored.scoredAt!))).toBe(true);
    expect((await events(session.learnerId, other).expect(200)).body.events).toEqual([scoredEvent(scored)]);
    const retryProvider = other === app ? provider : vi.spyOn(other.get(OfflineInterviewer), 'score');
    const quota = vi.spyOn(other.get(CoordinationStore), 'take');
    const retry = await score(session, other).expect(201);
    expect(retry.body).toEqual(first.body);
    expect((await get(session, other).expect(200)).body).toEqual(first.body);
    expect((await events(session.learnerId).expect(200)).body.events).toEqual([scoredEvent(scored)]);
    expect(provider).toHaveBeenCalledTimes(1);
    if (other !== app) expect(retryProvider).not.toHaveBeenCalled();
    expect(quota).not.toHaveBeenCalled();
  });

  it('repairs a cached score with its original timestamp without provider work or quota', async () => {
    const session = await start();
    const cached = await seedScored(session);
    const provider = vi.spyOn(other.get(OfflineInterviewer), 'score');
    const quota = vi.spyOn(other.get(CoordinationStore), 'take');
    expect((await events(session.learnerId).expect(200)).body.events).toEqual([]);
    const response = await score(session, other).expect(201);
    expect(response.body).toMatchObject({ status: 'scored', scorecard: cached.scorecard, scoredAt: cached.scoredAt });
    expect((await events(session.learnerId).expect(200)).body.events).toEqual([scoredEvent(cached)]);
    expect(provider).not.toHaveBeenCalled();
    expect(quota).not.toHaveBeenCalled();
  });

  it('recovers a lost response after commit without another score or event', async () => {
    const session = await start();
    const provider = vi.spyOn(app.get(OfflineInterviewer), 'score').mockResolvedValue({ scorecard: card });
    const store = app.get(InterviewStore);
    const complete = store.completeScore.bind(store);
    const committed = barrier();
    const held = barrier();
    let winner: InterviewSession | undefined;
    vi.spyOn(store, 'completeScore').mockImplementationOnce(async (candidate) => {
      winner = await complete(candidate);
      committed.release();
      await held.promise;
      return winner;
    });
    const initial = score(session);
    const result = initial.then(
      () => 'delivered',
      () => 'lost',
    );
    try {
      await committed.wait();
      initial.abort();
      expect(await result).toBe('lost');
    } finally {
      held.release();
      initial.abort();
      await result;
    }
    await vi.waitFor(async () => {
      expect(await app.get(CoordinationStore).acquireLease(`interview-session:${session.id}`, 'score-retry', 1000)).toBe(true);
    });
    await app.get(CoordinationStore).releaseLease(`interview-session:${session.id}`, 'score-retry');
    const retryProvider = other === app ? provider : vi.spyOn(other.get(OfflineInterviewer), 'score');
    const quota = vi.spyOn(other.get(CoordinationStore), 'take');
    const retry = await score(session, other).expect(201);
    expect(retry.body).toMatchObject({ scorecard: winner!.scorecard, scoredAt: winner!.scoredAt });
    expect((await events(session.learnerId).expect(200)).body.events).toEqual([scoredEvent(winner!)]);
    expect(provider).toHaveBeenCalledTimes(1);
    if (other !== app) expect(retryProvider).not.toHaveBeenCalled();
    expect(quota).not.toHaveBeenCalled();
  });

  it('returns the first committed score when two expired-lease candidates disagree', async () => {
    const session = await start();
    expireFirstLease();
    const entered = barrier();
    const held = barrier();
    const loser = { ...card, verdict: 'no-hire' as const, summary: 'Discarded late score', weakPatterns: ['hashing'] };
    const firstProvider = vi.spyOn(app.get(OfflineInterviewer), 'score').mockImplementationOnce(async () => {
      entered.release();
      await held.promise;
      return { scorecard: loser };
    });
    const pending = score(session).then((response) => response);
    try {
      await entered.wait();
      const otherProvider = other === app ? firstProvider : vi.spyOn(other.get(OfflineInterviewer), 'score');
      otherProvider.mockResolvedValueOnce({ scorecard: card });
      const winning = await score(session, other).expect(201);
      held.release();
      const late = await pending;
      expect(late.status).toBe(201);
      expect(late.body).toEqual(winning.body);
      expect(late.body.scorecard).toEqual(card);
      expect((await get(session).expect(200)).body).toEqual(winning.body);
      expect((await events(session.learnerId).expect(200)).body.events).toEqual([scoredEvent(winning.body)]);
    } finally {
      held.release();
      await pending;
    }
  });

  it('rejects a delayed reply after a score commits without reopening the session', async () => {
    const session = await start();
    expireFirstLease();
    const entered = barrier();
    const held = barrier();
    vi.spyOn(app.get(OfflineInterviewer), 'reply').mockImplementationOnce(async () => {
      entered.release();
      await held.promise;
      return { text: 'This late reply must not be saved.' };
    });
    const pending = message(session).then((response) => response);
    try {
      await entered.wait();
      vi.spyOn(other.get(OfflineInterviewer), 'score').mockResolvedValueOnce({ scorecard: card });
      const winning = await score(session, other).expect(201);
      held.release();
      const late = await pending;
      expect(late.status).toBe(409);
      expect(late.text).not.toContain('event: done');
      expect((await get(session).expect(200)).body).toEqual(winning.body);
      expect(winning.body.messages).toHaveLength(1);
      expect((await events(session.learnerId).expect(200)).body.events).toEqual([scoredEvent(winning.body)]);
    } finally {
      held.release();
      await pending;
    }
  });

  it('rejects a stale score after a newer reply while retaining the complete transcript', async () => {
    const session = await start();
    expireFirstLease();
    const entered = barrier();
    const held = barrier();
    vi.spyOn(app.get(OfflineInterviewer), 'score').mockImplementationOnce(async () => {
      entered.release();
      await held.promise;
      return { scorecard: card };
    });
    const pending = score(session).then((response) => response);
    try {
      await entered.wait();
      vi.spyOn(other.get(OfflineInterviewer), 'reply').mockResolvedValueOnce({ text: 'Show how equal temperatures are handled.' });
      await message(session, other).expect(200);
      const updated = (await get(session, other).expect(200)).body;
      expect(updated.messages).toHaveLength(3);
      held.release();
      expect((await pending).status).toBe(409);
      expect((await get(session).expect(200)).body).toEqual(updated);
      expect(updated.status).toBe('active');
      expect(updated.scorecard).toBeUndefined();
      expect((await events(session.learnerId).expect(200)).body.events).toEqual([]);
      const freshProvider = vi.spyOn(other.get(OfflineInterviewer), 'score').mockResolvedValueOnce({ scorecard: card });
      const retried = await score(session, other).expect(201);
      expect(freshProvider).toHaveBeenLastCalledWith(expect.objectContaining({ messages: updated.messages }));
      expect(retried.body.messages).toEqual(updated.messages);
      expect((await events(session.learnerId).expect(200)).body.events).toEqual([scoredEvent(retried.body)]);
    } finally {
      held.release();
      await pending;
    }
  });

  it.each(['exact', 'equivalent offset'] as const)('keeps an immutable %s completion event', async (timestamp) => {
    const session = await start();
    const cached = await seedScored(session);
    const existing = scoredEvent(cached);
    if (timestamp === 'equivalent offset') existing.at = '2026-09-26T20:00:00.000+02:00';
    await app.get(ProgressStore).append(session.learnerId, [existing]);
    const response = await score(session, other).expect(201);
    expect(response.body).toMatchObject({ scorecard: cached.scorecard, scoredAt: cached.scoredAt });
    expect((await events(session.learnerId).expect(200)).body.events).toEqual([existing]);
  });

  const collisions: Array<[string, (event: ReturnType<typeof scoredEvent>) => StoredEvent]> = [
    ['timestamp', (event) => ({ ...event, at: new Date(Date.parse(event.at) + 1).toISOString() })],
    ['session', (event) => ({ ...event, sessionId: randomUUID() })],
    ['track', (event) => ({ ...event, track: 'system-design' })],
    ['verdict', (event) => ({ ...event, verdict: 'strong-hire' })],
    ['pattern order', (event) => ({ ...event, weakPatterns: [...event.weakPatterns].reverse() })],
    ['pattern membership', (event) => ({ ...event, weakPatterns: ['hashing'] })],
    ['event type', (event) => ({ id: event.id, at: event.at, type: 'settings.changed', settings: { newPerDay: 5 } })],
  ];

  it.each(collisions)('saves a new score and keeps an existing event with a different %s', async (_field, collision) => {
    const session = await start();
    vi.spyOn(app.get(OfflineInterviewer), 'score').mockResolvedValueOnce({ scorecard: card });
    const store = app.get(InterviewStore);
    const complete = store.completeScore.bind(store);
    let existing: StoredEvent | undefined;
    vi.spyOn(store, 'completeScore').mockImplementationOnce(async (candidate) => {
      existing = collision(scoredEvent(candidate));
      await app.get(ProgressStore).append(session.learnerId, [existing]);
      return complete(candidate);
    });
    expect((await score(session).expect(201)).body).toMatchObject({ status: 'scored', scorecard: card });
    expect((await events(session.learnerId).expect(200)).body.events).toEqual([existing]);
  });

  it('returns a cached score beside a conflicting event without admitting more work', async () => {
    const session = await start();
    const cached = await seedScored(session);
    const existing = { ...scoredEvent(cached), verdict: 'no-hire' };
    await app.get(ProgressStore).append(session.learnerId, [existing]);
    const before = (await get(session).expect(200)).body;
    const provider = vi.spyOn(other.get(OfflineInterviewer), 'score');
    const quota = vi.spyOn(other.get(CoordinationStore), 'take');
    await score(session, other).expect(201);
    expect((await get(session).expect(200)).body).toEqual(before);
    expect((await events(session.learnerId).expect(200)).body.events).toEqual([existing]);
    expect(provider).not.toHaveBeenCalled();
    expect(quota).not.toHaveBeenCalled();
  });

  it.each(['missing', 'invalid'] as const)('rejects a cached score with a %s timestamp without fabricating one', async (timestamp) => {
    const session = await start();
    const store = app.get(InterviewStore);
    const active = (await store.get(session.learnerId, session.id))!;
    const cached: InterviewSession = { ...active, status: 'scored', scorecard: card };
    if (timestamp === 'invalid') cached.scoredAt = 'not-a-date';
    await store.save(cached);
    const before = (await get(session).expect(200)).body;
    const provider = vi.spyOn(other.get(OfflineInterviewer), 'score');
    const quota = vi.spyOn(other.get(CoordinationStore), 'take');
    await score(session, other).expect(409);
    expect((await get(session).expect(200)).body).toEqual(before);
    expect((await events(session.learnerId).expect(200)).body.events).toEqual([]);
    expect(provider).not.toHaveBeenCalled();
    expect(quota).not.toHaveBeenCalled();
  });

  it.each(['erase', 'merge'] as const)('does not publish a late score after learner %s wins', async (retirement) => {
    const session = await start();
    const store = app.get(InterviewStore);
    const complete = store.completeScore.bind(store);
    const entered = barrier();
    const held = barrier();
    vi.spyOn(store, 'completeScore').mockImplementationOnce(async (candidate) => {
      entered.release();
      await held.promise;
      return complete(candidate);
    });
    const pending = score(session).then((response) => response);
    const destination = randomUUID();
    try {
      await entered.wait();
      if (retirement === 'erase') await other.get(ErasureStore).erase(session.learnerId);
      else {
        expect(
          await other.get(AuthStore).createUser({
            id: randomUUID(),
            email: `${randomUUID()}@example.com`,
            learnerId: destination,
            createdAt: new Date().toISOString(),
            lastLoginAt: null,
          }),
        ).toBe(true);
        await other.get(ErasureStore).merge(session.learnerId, destination);
      }
      held.release();
      const late = await pending;
      expect(late.status).toBe(410);
      expect(late.body.code).toBe(retirement === 'erase' ? 'learner_erased' : 'learner_moved');
      expect(await store.get(session.learnerId, session.id)).toBeNull();
      expect(await app.get(ProgressStore).list(session.learnerId)).toEqual([]);
      expect(await other.get(ProgressStore).list(destination)).toEqual([]);
      if (retirement === 'merge') {
        const moved = await other.get(InterviewStore).get(destination, session.id);
        expect(moved).toMatchObject({ learnerId: destination, status: 'active' });
        expect(moved!.scorecard).toBeUndefined();
      }
    } finally {
      held.release();
      await pending;
    }
  });
});
