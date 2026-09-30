import request from 'supertest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { GatewayClient } from '../src/interview/gateway-client.js';
import { GatewayInterviewer } from '../src/interview/gateway.interviewer.js';
import { Interviewer } from '../src/interview/interviewer.js';
import { RUBRICS } from '../src/interview/prompts.js';
import { SpendGuard } from '../src/interview/spend-guard.js';
import { InterviewStore } from '../src/persistence/stores.js';
import { createTestApp } from './support/app.js';
import { resetDatabase } from './support/database.js';
import { chunk, completion, fakeGateway, finish, gatewayModel, usageChunk, type FakeGatewayResponse } from './support/fake-gateway.js';
import { OAuthFakes } from './support/oauth.js';
import { signInLearner } from './support/signed-learner.js';

const learner = '4c1d2e3f-5a6b-4c7d-8e9f-0a1b2c3d4e5f';
const testDatabaseUrl = process.env['TEST_DATABASE_URL'];
const storages = testDatabaseUrl ? (['memory', 'postgres'] as const) : (['memory'] as const);
const EM = '\u2014';

const scorecard = JSON.stringify({
  verdict: 'lean-hire',
  summary: `Good pattern recognition ${EM} complexity reasoning needs work.`,
  dimensions: RUBRICS.coding.map((r) => ({ name: r.name, score: 3, evidence: 'You said \u201Ca stack\u201D early.' })),
  strengths: ['Named the **monotonic stack**'],
  improvements: ['Justify the `amortized` bound'],
  weakPatterns: ['monotonic-stack'],
});
const usage = { prompt_tokens: 1200, completion_tokens: 40, prompt_tokens_details: { cached_tokens: 1000 } };

describe.each(storages)('GPT-6 Luna through the AI Gateway over HTTP (%s storage, scripted gateway)', (storage) => {
  let app: NestExpressApplication;
  let fakes: OAuthFakes;
  let auth: Awaited<ReturnType<typeof signInLearner>>['headers'];
  const replies: FakeGatewayResponse[] = [];
  const scores: FakeGatewayResponse[] = [];
  let upstream: ReturnType<typeof fakeGateway>['requests'];

  beforeAll(async () => {
    if (storage === 'postgres') await resetDatabase(testDatabaseUrl!);
    fakes = await OAuthFakes.start();
    const gateway = fakeGateway((body) =>
      body['response_format']
        ? (scores.shift() ?? { json: completion(scorecard, { prompt_tokens: 2500, completion_tokens: 600 }, 'stop', '0.0004') })
        : (replies.shift() ?? { sse: [chunk({ content: 'Okay.' }), finish(), usageChunk(usage)] }),
    );
    upstream = gateway.requests;
    app = await createTestApp(
      { DATABASE_URL: storage === 'postgres' ? testDatabaseUrl : undefined, AI_DAILY_BUDGET_USD: '100', ...fakes.env() },
      (builder) =>
        fakes
          .customize(builder)
          .overrideProvider(Interviewer)
          .useFactory({
            factory: (spend: SpendGuard) =>
              new GatewayInterviewer(new GatewayClient(() => 'vck-test-key', gateway.fetch), gatewayModel('openai/gpt-6-luna'), spend, {
                replyDeadlineMs: 1_000,
                scoreDeadlineMs: 1_000,
              }),
            inject: [SpendGuard],
          }),
    );
    auth = (await signInLearner(app, fakes, learner)).headers;
  });

  afterAll(async () => {
    await Promise.all([app?.close(), fakes?.close()]);
  });

  const http = () => request(app.getHttpServer());
  const start = async () =>
    (await http().post('/api/interview/sessions').set(auth).send({ track: 'coding', problemId: 'warmer-days', mode: 'ai' }).expect(201))
      .body;
  const say = (id: string, content: string) => http().post(`/api/interview/sessions/${id}/messages`).set(auth).send({ content });
  const score = (id: string) => http().post(`/api/interview/sessions/${id}/score`).set(auth);

  it('runs a whole session on GPT-6 Luna alone, and the learner reads plain text', async () => {
    const session = await start();
    replies.push({
      sse: [
        chunk({ content: `A user pastes a long URL ${EM} ` }),
        chunk({ content: 'what is the **input size**?' }),
        finish(),
        usageChunk(usage),
      ],
    });

    const res = await say(session.id, 'I would scan from the right with a stack.').expect(200);
    expect(res.text).toContain('event: delta');
    expect(res.text).toContain('"content":"A user pastes a long URL, what is the input size?"');
    const sent = upstream.at(-1)!;
    expect(sent.url).toBe('https://ai-gateway.vercel.sh/v1/chat/completions');
    expect(sent.headers['authorization']).toBe('Bearer vck-test-key');
    expect(sent.body).toMatchObject({ model: 'openai/gpt-6-luna', stream: true, providerOptions: { gateway: { caching: 'auto' } } });
    expect(sent.body['providerOptions'].gateway).not.toHaveProperty('models');

    const scored = (await score(session.id).expect(201)).body;
    expect(scored.scorecard).toMatchObject({
      mode: 'ai',
      verdict: 'lean-hire',
      summary: 'Good pattern recognition, complexity reasoning needs work.',
      strengths: ['Named the monotonic stack'],
      improvements: ['Justify the amortized bound'],
      weakPatterns: ['monotonic-stack'],
    });
    expect(scored.scorecard.dimensions[0].evidence).toBe('You said "a stack" early.');
    expect(upstream.at(-1)!.body).toMatchObject({ model: 'openai/gpt-6-luna', response_format: { type: 'json_schema' } });

    const stored = await app.get(InterviewStore).get(learner, session.id);
    expect(stored!.messages.at(-1)!.content).toBe('A user pastes a long URL, what is the input size?');
    expect(stored!.usage).toMatchObject({ calls: 2, inputTokens: 200 + 2500, cacheReadTokens: 1000, outputTokens: 40 + 600 });
    const log = (await http().get('/api/progress/events').set(auth).expect(200)).body;
    expect(log.events.find((e: { id: string }) => e.id === `interview-${session.id}`)).toMatchObject({ weakPatterns: ['monotonic-stack'] });
  });

  it('cancels a reply still streaming at its deadline, drops the turn and takes the resend at once', async () => {
    const session = await start();
    replies.push({ sse: [chunk({ content: 'Tell me ' })], endless: true, delayMs: 50 });
    const res = await say(session.id, 'Here is my approach.').expect(200);
    expect(res.text).toContain('event: delta');
    expect(res.text).toContain('event: error');
    expect(res.text).toContain('"status":503');
    expect(res.text).not.toContain('event: done');
    expect(upstream.at(-1)!.signal?.aborted).toBe(true);

    const pub = (await http().get(`/api/interview/sessions/${session.id}`).set(auth).expect(200)).body;
    expect(pub.messages).toHaveLength(1);
    await say(session.id, 'Here is my approach.').expect(200);
  });

  it('answers scoring that outlasts its deadline with a retryable 503, and scores on the next try', async () => {
    const session = await start();
    scores.push({ hang: true });
    const res = await score(session.id).expect(503);
    expect(res.body.message).toMatch(/unavailable/);
    expect(upstream.at(-1)!.signal?.aborted).toBe(true);
    expect((await http().get(`/api/interview/sessions/${session.id}`).set(auth).expect(200)).body.status).toBe('active');

    expect((await score(session.id).expect(201)).body.scorecard).toMatchObject({ mode: 'ai', verdict: 'lean-hire' });
  });
});
