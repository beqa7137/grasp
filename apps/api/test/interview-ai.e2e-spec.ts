import request from 'supertest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { ClaudeInterviewer } from '../src/interview/claude.interviewer.js';
import { Interviewer } from '../src/interview/interviewer.js';
import { RUBRICS } from '../src/interview/prompts.js';
import { SpendGuard } from '../src/interview/spend-guard.js';
import { InterviewStore } from '../src/persistence/stores.js';
import { fakeAnthropic, type FakeResponse } from './support/fake-anthropic.js';
import { createTestApp } from './support/app.js';
import { resetDatabase } from './support/database.js';

const learner = '9b2f3c4d-5e6f-4a7b-8c9d-0e1f2a3b4c5d';
const testDatabaseUrl = process.env['TEST_DATABASE_URL'];
const storages = testDatabaseUrl ? (['memory', 'postgres'] as const) : (['memory'] as const);

const scorecard = JSON.stringify({
  verdict: 'lean-hire',
  summary: 'Good pattern recognition; complexity reasoning needs work.',
  dimensions: RUBRICS.coding.map((r) => ({ name: r.name, score: 3, evidence: 'Seen in the transcript.' })),
  strengths: ['Named the monotonic stack'],
  improvements: ['Justify the amortized bound'],
  weakPatterns: ['monotonic-stack'],
});

describe.each(storages)('AI interviewer over HTTP (%s storage, scripted Claude API)', (storage) => {
  let app: NestExpressApplication;
  let replies: FakeResponse[] = [];

  beforeAll(async () => {
    if (storage === 'postgres') await resetDatabase(testDatabaseUrl!);
    const { client } = fakeAnthropic((body) =>
      body['output_config']?.['format']
        ? { text: scorecard, usage: { input_tokens: 2500, output_tokens: 600 } }
        : (replies.shift() ?? { stream: ['Okay.'] }),
    );
    app = await createTestApp({ DATABASE_URL: storage === 'postgres' ? testDatabaseUrl : undefined, AI_DAILY_BUDGET_USD: '5' }, (builder) =>
      builder.overrideProvider(Interviewer).useValue(new ClaudeInterviewer(client, { model: 'claude-sonnet-5' })),
    );
  });

  afterAll(async () => {
    await app.close();
  });

  const http = () => request(app.getHttpServer());
  const start = async () =>
    (
      await http()
        .post('/api/interview/sessions')
        .set('x-learner-id', learner)
        .send({ track: 'coding', problemId: 'warmer-days' })
        .expect(201)
    ).body;
  const say = (id: string, content: string) =>
    http().post(`/api/interview/sessions/${id}/messages`).set('x-learner-id', learner).send({ content });

  it('streams Claude replies over SSE and keeps token usage server-side', async () => {
    const session = await start();
    expect(session.mode).toBe('ai');
    replies.push({
      stream: ['What is the ', 'input size?'],
      usage: { input_tokens: 20, output_tokens: 12, cache_read_input_tokens: 0, cache_creation_input_tokens: 1400 },
    });

    const res = await say(session.id, 'I would scan from the right with a stack.').expect(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.text).toContain('event: delta\ndata: {"text":"What is the "}');
    expect(res.text).toContain('"content":"What is the input size?"');

    const pub = (await http().get(`/api/interview/sessions/${session.id}`).set('x-learner-id', learner).expect(200)).body;
    expect(pub.messages).toHaveLength(3);
    expect(pub.usage).toBeUndefined();

    const stored = await app.get(InterviewStore).get(learner, session.id);
    expect(stored!.usage).toMatchObject({ calls: 1, inputTokens: 20, cacheWriteTokens: 1400, outputTokens: 12 });
    expect(stored!.usage!.costUsd).toBeCloseTo((20 * 2 + 1400 * 2.5 + 12 * 10) / 1e6, 10);
  });

  it('scores with the AI scorer and feeds weak patterns into progress', async () => {
    const session = await start();
    await say(session.id, 'Brute force is O(n^2); a monotonic stack makes it O(n).').expect(200);

    const scored = (await http().post(`/api/interview/sessions/${session.id}/score`).set('x-learner-id', learner).expect(201)).body;
    expect(scored.scorecard).toMatchObject({ mode: 'ai', verdict: 'lean-hire', weakPatterns: ['monotonic-stack'] });

    const stored = await app.get(InterviewStore).get(learner, session.id);
    expect(stored!.usage!.calls).toBe(2);
    const log = (await http().get('/api/progress/events').set('x-learner-id', learner).expect(200)).body;
    expect(log.events.find((e: { id: string }) => e.id === `interview-${session.id}`)).toMatchObject({ weakPatterns: ['monotonic-stack'] });
  });

  it('turns an overloaded API into a retryable 503 and drops the unanswered turn', async () => {
    const session = await start();
    replies.push({ status: 529, error: { type: 'overloaded_error', message: 'Overloaded' } });
    const res = await say(session.id, 'Here is my approach.').expect(503);
    expect(res.body.message).toMatch(/busy/);

    const pub = (await http().get(`/api/interview/sessions/${session.id}`).set('x-learner-id', learner).expect(200)).body;
    expect(pub.messages).toHaveLength(1);
    await say(session.id, 'Here is my approach.').expect(200);
  });

  it('reports a mid-stream failure as an SSE error event', async () => {
    const session = await start();
    replies.push({ stream: ['Let me '], errorAfter: { type: 'overloaded_error', message: 'Overloaded' } });
    const res = await say(session.id, 'Thoughts?').expect(200);
    expect(res.text).toContain('event: error');
    expect(res.text).toContain('"status":503');
  });

  it('rejects a second message while the interviewer is still replying', async () => {
    const session = await start();
    replies.push({ stream: ['Slow ', 'reply ', 'here.'], delayMs: 60 });
    const first = say(session.id, 'First message.').then((r) => r);
    await new Promise((r) => setTimeout(r, 30));
    const second = await say(session.id, 'Second message.');
    expect(second.status).toBe(409);
    expect((await first).status).toBe(200);
  });

  it('pauses the AI interviewer once the daily budget is spent', async () => {
    const session = await start();
    await app.get(SpendGuard).record(10);
    const res = await say(session.id, 'Anything else?').expect(503);
    expect(res.body.message).toMatch(/usage limit/);
    await http().post(`/api/interview/sessions/${session.id}/score`).set('x-learner-id', learner).expect(503);
  });
});
