import type Anthropic from '@anthropic-ai/sdk';
import type { NestExpressApplication } from '@nestjs/platform-express';
import pg from 'pg';
import request from 'supertest';
import { ClaudeInterviewer } from '../src/interview/claude.interviewer.js';
import { Interviewer } from '../src/interview/interviewer.js';
import { maximumCostUsd } from '../src/interview/pricing.js';
import { RUBRICS } from '../src/interview/prompts.js';
import { SpendGuard } from '../src/interview/spend-guard.js';
import { PG_POOL } from '../src/persistence/persistence.module.js';
import { SpendStore } from '../src/persistence/spend.store.js';
import { fakeAnthropic } from './support/fake-anthropic.js';
import { createTestApp } from './support/app.js';
import { resetDatabase } from './support/database.js';
import { OAuthFakes } from './support/oauth.js';
import { signInLearner } from './support/signed-learner.js';

const databaseUrl = process.env['TEST_DATABASE_URL'];
const model = 'claude-sonnet-5';
const replyMaximum = maximumCostUsd(model, 2048, true);
const scoreMaximum = maximumCostUsd(model, 16_000, false);
const jwtSecret = 'spend-budget-test-secret-shared-by-all-instances';

function barrier() {
  let release!: () => void;
  const promise = new Promise<void>((resolve) => {
    release = resolve;
  });
  return { promise, release };
}

describe.skipIf(!databaseUrl)('Paid AI reservations over HTTP with Postgres', () => {
  const apps: NestExpressApplication[] = [];
  let fakes: OAuthFakes;

  beforeAll(async () => {
    fakes = await OAuthFakes.start();
  });

  afterAll(async () => {
    await fakes?.close();
  });

  beforeEach(async () => {
    await resetDatabase(databaseUrl!);
  });

  afterEach(async () => {
    vi.restoreAllMocks();
    await Promise.all(apps.splice(0).map((app) => app.close()));
  });

  async function instance(client: Anthropic, budget: number) {
    const app = await createTestApp(
      { DATABASE_URL: databaseUrl, JWT_SECRET: jwtSecret, AI_DAILY_BUDGET_USD: String(budget), ...fakes.env() },
      (builder) =>
        fakes
          .customize(builder)
          .overrideProvider(Interviewer)
          .useFactory({
            inject: [SpendGuard],
            factory: (spend: SpendGuard) => new ClaudeInterviewer(client, { model }, spend),
          }),
    );
    apps.push(app);
    return app;
  }

  async function session(app: NestExpressApplication) {
    const learner = await signInLearner(app, fakes);
    const response = await request(app.getHttpServer())
      .post('/api/interview/sessions')
      .set(learner.headers)
      .send({ track: 'coding', problemId: 'warmer-days', mode: 'ai' })
      .expect(201);
    return { id: response.body.id as string, ...learner };
  }

  function message(app: NestExpressApplication, target: Awaited<ReturnType<typeof session>>) {
    return request(app.getHttpServer())
      .post(`/api/interview/sessions/${target.id}/messages`)
      .set(target.headers)
      .send({ content: 'I would scan from the right with a monotonic stack.' })
      .timeout({ deadline: 5_000 });
  }

  function score(app: NestExpressApplication, target: Awaited<ReturnType<typeof session>>) {
    return request(app.getHttpServer()).post(`/api/interview/sessions/${target.id}/score`).set(target.headers).timeout({ deadline: 5_000 });
  }

  it('admits only one racing session across instances before either provider response settles', async () => {
    const providerEntered = barrier();
    const finishProvider = barrier();
    const provider = fakeAnthropic(() => ({ stream: ['Keep going.'] }));
    const client = provider.client.withOptions({
      middleware: [
        async (outgoing, next) => {
          const response = await next(outgoing);
          providerEntered.release();
          await finishProvider.promise;
          return response;
        },
      ],
    });
    const budget = replyMaximum + 0.5;
    const first = await instance(client, budget);
    const second = await instance(client, budget);
    const existing = await first.get(SpendGuard).reserve(0.5);
    await first.get(SpendGuard).settle(existing, 0.5);
    const targets = await Promise.all([session(first), session(second)]);
    const reservationsReady = barrier();
    let arrivals = 0;
    for (const app of [first, second]) {
      const store = app.get(SpendStore);
      const reserve = store.reserve.bind(store);
      vi.spyOn(store, 'reserve').mockImplementation(async (...args) => {
        if (++arrivals === 2) reservationsReady.release();
        await reservationsReady.promise;
        return reserve(...args);
      });
    }

    const pending = [message(first, targets[0]!).then((response) => response), message(second, targets[1]!).then((response) => response)];
    try {
      await Promise.race([
        providerEntered.promise,
        Promise.all(pending).then(() => {
          throw new Error('Both requests finished without an admitted provider call.');
        }),
      ]);
      const denied = await Promise.race(pending);
      expect(denied.status).toBe(503);
      expect(denied.body.message).toMatch(/usage limit/);
      expect(arrivals).toBe(2);
      expect(provider.requests).toHaveLength(1);
      expect(await first.get(SpendGuard).spentToday()).toBeCloseTo(budget, 6);
      expect(await second.get(SpendGuard).spentToday()).toBeCloseTo(budget, 6);
    } finally {
      finishProvider.release();
      reservationsReady.release();
      await Promise.allSettled(pending);
    }

    const responses = await Promise.all(pending);
    expect(responses.map((response) => response.status).sort()).toEqual([200, 503]);
    expect(responses.find((response) => response.status === 200)!.text).toContain('event: done');
    expect(provider.requests).toHaveLength(1);
    expect(await first.get(SpendGuard).spentToday()).toBeCloseTo(0.5024, 6);
    expect(await second.get(SpendGuard).spentToday()).toBeCloseTo(0.5024, 6);
  }, 15_000);

  it.each([
    { kind: 'reply', maximum: replyMaximum, expected: 2.772528 },
    { kind: 'score', maximum: scoreMaximum, expected: 2.376 },
  ] as const)('denies a $kind whose maximum exceeds the remaining budget by one microdollar', async ({ kind, maximum, expected }) => {
    expect(maximum).toBeCloseTo(expected, 10);
    const provider = fakeAnthropic(() => ({ stream: ['This must not be dispatched.'] }));
    const app = await instance(provider.client, maximum - 0.000001);
    const target = await session(app);

    const response = await (kind === 'reply' ? message(app, target) : score(app, target)).expect(503);

    expect(response.body.message).toMatch(/usage limit/);
    expect(provider.requests).toHaveLength(0);
    expect(await app.get(SpendGuard).spentToday()).toBe(0);
  });

  it('keeps unknown transport liability and denies a later request from another instance', async () => {
    const provider = fakeAnthropic(() => ({ networkError: true }));
    const first = await instance(provider.client, replyMaximum);

    await message(first, await session(first)).expect(503);

    expect(provider.requests).toHaveLength(1);
    expect(await first.get(SpendGuard).spentToday()).toBeCloseTo(replyMaximum, 6);
    const second = await instance(provider.client, replyMaximum);
    await message(second, await session(second)).expect(503);
    expect(provider.requests).toHaveLength(1);
    expect(await second.get(SpendGuard).spentToday()).toBeCloseTo(replyMaximum, 6);
  });

  it('retains the first successful scoring charge when its invalid scorecard is followed by a provider rejection', async () => {
    const provider = fakeAnthropic((_body, index) =>
      index === 0
        ? { text: 'not a scorecard', usage: { input_tokens: 1000, output_tokens: 40 } }
        : { status: 529, error: { type: 'overloaded_error', message: 'Overloaded' } },
    );
    const app = await instance(provider.client, 2 * scoreMaximum);
    const target = await session(app);

    await score(app, target).expect(503);

    expect(provider.requests).toHaveLength(2);
    expect(await app.get(SpendGuard).spentToday()).toBeCloseTo(0.0024, 6);
    const current = await request(app.getHttpServer()).get(`/api/interview/sessions/${target.id}`).set(target.headers).expect(200);
    expect(current.body.status).toBe('active');
    expect(current.body.scorecard).toBeUndefined();
  });

  it('never dispatches a paid request when the reservation database write fails', async () => {
    const provider = fakeAnthropic(() => ({ stream: ['This must not be dispatched.'] }));
    const app = await instance(provider.client, replyMaximum);
    const target = await session(app);
    const failure = new pg.DatabaseError('reservation storage is unavailable', 0, 'error');
    failure.code = '53300';
    vi.spyOn(app.get(SpendStore), 'reserve').mockRejectedValueOnce(failure);

    await message(app, target).expect(503);

    expect(provider.requests).toHaveLength(0);
    expect(await app.get(SpendGuard).spentToday()).toBe(0);
  });

  it('keeps paid scoring charges when completion rolls back and avoids another charge after committed retry', async () => {
    const card = {
      verdict: 'hire',
      summary: 'The candidate explained the stack invariant and its complexity.',
      dimensions: RUBRICS.coding.map(({ name }) => ({ name, score: 3, evidence: 'The transcript explains the reasoning.' })),
      strengths: ['Explained the invariant.'],
      improvements: ['Check repeated temperatures.'],
      weakPatterns: ['monotonic-stack'],
    };
    const provider = fakeAnthropic(() => ({ text: JSON.stringify(card), usage: { input_tokens: 1000, output_tokens: 40 } }));
    const first = await instance(provider.client, 2 * scoreMaximum);
    const target = await session(first);
    const pool = first.get<pg.Pool>(PG_POOL);
    await pool.query(`
      create function reject_paid_score_event() returns trigger language plpgsql as $$
      begin raise exception 'injected score event failure'; end;
      $$;
      create trigger reject_paid_score_event before insert on learning_events
      for each row execute function reject_paid_score_event()`);
    try {
      await score(first, target).expect(500);
      const current = await request(first.getHttpServer()).get(`/api/interview/sessions/${target.id}`).set(target.headers).expect(200);
      expect(current.body.status).toBe('active');
      expect(current.body.scorecard).toBeUndefined();
      const progress = await request(first.getHttpServer()).get('/api/progress/events').set(target.headers).expect(200);
      expect(progress.body.events).toEqual([]);
      expect(provider.requests).toHaveLength(1);
      expect(await first.get(SpendGuard).spentToday()).toBeCloseTo(0.0024, 6);
    } finally {
      await pool.query('drop trigger reject_paid_score_event on learning_events; drop function reject_paid_score_event()');
    }

    const second = await instance(provider.client, 2 * scoreMaximum);
    expect(await second.get(SpendGuard).spentToday()).toBeCloseTo(0.0024, 6);
    const retried = await score(second, target).expect(201);
    expect(retried.body.scorecard).toMatchObject(card);
    const progress = await request(second.getHttpServer()).get('/api/progress/events').set(target.headers).expect(200);
    expect(progress.body.events).toEqual([
      {
        id: `interview-${target.id}`,
        at: retried.body.scoredAt,
        type: 'interview.scored',
        sessionId: target.id,
        track: 'coding',
        verdict: card.verdict,
        weakPatterns: card.weakPatterns,
      },
    ]);
    expect((await score(first, target).expect(201)).body).toEqual(retried.body);
    expect(provider.requests).toHaveLength(2);
    expect(await first.get(SpendGuard).spentToday()).toBeCloseTo(0.0048, 6);
    expect(await second.get(SpendGuard).spentToday()).toBeCloseTo(0.0048, 6);
  });

  it('returns the completed response and retains its full hold when settlement fails', async () => {
    const provider = fakeAnthropic(() => ({ stream: ['Your answer was received.'] }));
    const app = await instance(provider.client, replyMaximum);
    const target = await session(app);
    const failure = new pg.DatabaseError('settlement storage is unavailable', 0, 'error');
    failure.code = '53300';
    vi.spyOn(app.get(SpendStore), 'settle').mockRejectedValueOnce(failure);

    const response = await message(app, target).expect(200);

    expect(response.text).toContain('event: done');
    expect(response.text).toContain('Your answer was received.');
    expect(response.text).not.toContain('event: error');
    expect(await app.get(SpendGuard).spentToday()).toBeCloseTo(replyMaximum, 6);
    await message(app, target).expect(503);
    expect(provider.requests).toHaveLength(1);
    expect(await app.get(SpendGuard).spentToday()).toBeCloseTo(replyMaximum, 6);
  });
});
