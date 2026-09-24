import request from 'supertest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ClaudeInterviewer } from '../src/interview/claude.interviewer.js';
import { Interviewer } from '../src/interview/interviewer.js';
import { SpendGuard } from '../src/interview/spend-guard.js';
import { createTestApp } from './support/app.js';
import { resetDatabase } from './support/database.js';
import { fakeAnthropic, type FakeResponse } from './support/fake-anthropic.js';

const testDatabaseUrl = process.env['TEST_DATABASE_URL'];

/**
 * Two API instances on one database, as two serverless instances or containers would run. Each limit and lock is exercised by
 * alternating requests between them: with process-local state every one of these would pass through.
 */
describe.runIf(testDatabaseUrl)('Several API instances sharing Postgres', () => {
  const learner = '1c2d3e4f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
  let a: NestExpressApplication;
  let b: NestExpressApplication;
  let replies: FakeResponse[] = [];

  const boot = () => {
    const { client } = fakeAnthropic(() => replies.shift() ?? { stream: ['Okay.'], usage: { input_tokens: 1_000, output_tokens: 100 } });
    return createTestApp(
      {
        DATABASE_URL: testDatabaseUrl,
        TRUST_PROXY: '1',
        RATE_LIMIT_PER_MINUTE: '6',
        INTERVIEW_MESSAGES_PER_HOUR: '3',
        AI_DAILY_BUDGET_USD: '1',
      },
      (builder) => builder.overrideProvider(Interviewer).useValue(new ClaudeInterviewer(client, { model: 'claude-sonnet-5' })),
    );
  };

  beforeAll(async () => {
    await resetDatabase(testDatabaseUrl!);
    [a, b] = await Promise.all([boot(), boot()]);
  });

  afterAll(async () => {
    await Promise.all([a?.close(), b?.close()]);
  });

  beforeEach(() => {
    replies = [];
  });

  const ip = (() => {
    let n = 0;
    return () => `198.51.100.${++n}`;
  })();
  const on = (app: NestExpressApplication, clientIp: string) => ({
    get: (path: string) => request(app.getHttpServer()).get(path).set('X-Forwarded-For', clientIp),
    post: (path: string) => request(app.getHttpServer()).post(path).set('X-Forwarded-For', clientIp).set('x-learner-id', learner),
  });
  const startInterview = async (clientIp: string) =>
    (await on(a, clientIp).post('/api/interview/sessions').send({ track: 'coding', problemId: 'warmer-days' }).expect(201)).body as {
      id: string;
    };

  it('enforces one request rate limit across instances', async () => {
    const client = ip();
    // Windows are fixed minutes; don't start a burst in the last seconds of one.
    if (Date.now() % 60_000 > 57_000) await new Promise((resolve) => setTimeout(resolve, 60_000 - (Date.now() % 60_000) + 50));
    const statuses: number[] = [];
    for (let i = 0; i < 8; i++) statuses.push((await on(i % 2 ? b : a, client).get('/api/curriculum/patterns')).status);
    expect(statuses).toEqual([200, 200, 200, 200, 200, 200, 429, 429]);
    await on(b, ip()).get('/api/curriculum/patterns').expect(200);
  });

  it('lets only one instance at a time call the model for a session', async () => {
    const client = ip();
    const session = await startInterview(client);
    replies.push({ stream: ['Thinking ', 'it ', 'through.'], delayMs: 80, usage: { input_tokens: 10, output_tokens: 10 } });
    // supertest only sends once awaited; .then() starts this request now.
    const first = on(a, client)
      .post(`/api/interview/sessions/${session.id}/messages`)
      .send({ content: 'First.' })
      .then((r) => r);
    await new Promise((resolve) => setTimeout(resolve, 40));
    const second = await on(b, client).post(`/api/interview/sessions/${session.id}/messages`).send({ content: 'Second.' });
    expect(second.status).toBe(409);
    expect((await first).status).toBe(200);
    // Released as soon as the call finished: the other instance can go next.
    await on(b, client).post(`/api/interview/sessions/${session.id}/messages`).send({ content: 'Now?' }).expect(200);
  });

  it('counts the per-learner interview quota across instances', async () => {
    await resetDatabase(testDatabaseUrl!);
    const client = ip();
    const session = await startInterview(client);
    const say = (app: NestExpressApplication) =>
      on(app, client).post(`/api/interview/sessions/${session.id}/messages`).send({ content: 'Go.' });
    await say(a).expect(200);
    await say(b).expect(200);
    await say(a).expect(200);
    const limited = await say(b).expect(429);
    expect(limited.body.message).toMatch(/rate limit/i);
  });

  it('shares the daily AI budget: spend recorded on one instance closes the other', async () => {
    await resetDatabase(testDatabaseUrl!);
    const client = ip();
    const session = await startInterview(client);
    await a.get(SpendGuard).record(1.5);
    const res = await on(b, client).post(`/api/interview/sessions/${session.id}/messages`).send({ content: 'Hello?' }).expect(503);
    expect(res.body.message).toMatch(/usage limit/);
    expect(await b.get(SpendGuard).spentToday()).toBeCloseTo(1.5);
  });
});
