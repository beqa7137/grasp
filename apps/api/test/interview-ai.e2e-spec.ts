import request from 'supertest';
import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import { ClaudeInterviewer } from '../src/interview/claude.interviewer.js';
import { Interviewer } from '../src/interview/interviewer.js';
import { RUBRICS } from '../src/interview/prompts.js';
import { SpendGuard } from '../src/interview/spend-guard.js';
import { CoordinationStore, InterviewStore } from '../src/persistence/stores.js';
import { fakeAnthropic, type FakeResponse } from './support/fake-anthropic.js';
import { createTestApp } from './support/app.js';
import { resetDatabase } from './support/database.js';
import { OAuthFakes } from './support/oauth.js';
import { signInLearner } from './support/signed-learner.js';

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
  let fakes: OAuthFakes;
  let auth: Awaited<ReturnType<typeof signInLearner>>['headers'];
  let replies: FakeResponse[] = [];
  let scores: FakeResponse[] = [];
  let anthropic: ReturnType<typeof fakeAnthropic>;
  let upstream: ReturnType<typeof fakeAnthropic>['requests'];

  beforeAll(async () => {
    if (storage === 'postgres') await resetDatabase(testDatabaseUrl!);
    fakes = await OAuthFakes.start();
    anthropic = fakeAnthropic((body) =>
      body['output_config']?.['format']
        ? (scores.shift() ?? { text: scorecard, usage: { input_tokens: 2500, output_tokens: 600 } })
        : (replies.shift() ?? { stream: ['Okay.'] }),
    );
    upstream = anthropic.requests;
    app = await createTestApp(
      { DATABASE_URL: storage === 'postgres' ? testDatabaseUrl : undefined, AI_DAILY_BUDGET_USD: '100', ...fakes.env() },
      (builder) =>
        fakes
          .customize(builder)
          .overrideProvider(Interviewer)
          .useFactory({
            factory: (spend: SpendGuard) => new ClaudeInterviewer(anthropic.client, { model: 'claude-sonnet-5' }, spend),
            inject: [SpendGuard],
          }),
    );
    auth = (await signInLearner(app, fakes, learner)).headers;
  });

  afterAll(async () => {
    await Promise.all([app?.close(), fakes?.close()]);
  });
  afterEach(() => vi.restoreAllMocks());

  const http = () => request(app.getHttpServer());
  const start = async () =>
    (await http().post('/api/interview/sessions').set(auth).send({ track: 'coding', problemId: 'warmer-days', mode: 'ai' }).expect(201))
      .body;
  const withOneSecondDeadlines = () => {
    const short = new ClaudeInterviewer(
      anthropic.client,
      { model: 'claude-sonnet-5', replyDeadlineMs: 1_000, scoreDeadlineMs: 1_000 },
      app.get(SpendGuard),
    );
    const live = app.get(Interviewer);
    vi.spyOn(live, 'reply').mockImplementation(short.reply.bind(short));
    vi.spyOn(live, 'score').mockImplementation(short.score.bind(short));
  };
  const say = (id: string, content: string) => http().post(`/api/interview/sessions/${id}/messages`).set(auth).send({ content });

  it('streams Claude replies over SSE and keeps token usage server-side', async () => {
    const session = await start();
    expect(session.mode).toBe('ai');
    replies.push({
      stream: ['What is the ', 'input size?'],
      usage: { input_tokens: 20, output_tokens: 12, cache_read_input_tokens: 0, cache_creation_input_tokens: 1400 },
    });

    const res = await say(session.id, 'I would scan from the right with a stack.').expect(200);
    expect(res.headers['content-type']).toContain('text/event-stream');
    expect(res.headers['cache-control']).toBe('no-store, no-transform');
    expect(res.text).toContain('event: delta\ndata: {"text":"What is the "}');
    expect(res.text).toContain('"content":"What is the input size?"');

    const pub = (await http().get(`/api/interview/sessions/${session.id}`).set(auth).expect(200)).body;
    expect(pub.messages).toHaveLength(3);
    expect(pub.usage).toBeUndefined();

    const stored = await app.get(InterviewStore).get(learner, session.id);
    expect(stored!.usage).toMatchObject({ calls: 1, inputTokens: 20, cacheWriteTokens: 1400, outputTokens: 12 });
    expect(stored!.usage!.costUsd).toBeCloseTo((20 * 2 + 1400 * 2.5 + 12 * 10) / 1e6, 10);
  });

  it('scores with the AI scorer and feeds weak patterns into progress', async () => {
    const session = await start();
    await say(session.id, 'Brute force is O(n^2); a monotonic stack makes it O(n).').expect(200);

    const scored = (await http().post(`/api/interview/sessions/${session.id}/score`).set(auth).expect(201)).body;
    expect(scored.scorecard).toMatchObject({ mode: 'ai', verdict: 'lean-hire', weakPatterns: ['monotonic-stack'] });

    const stored = await app.get(InterviewStore).get(learner, session.id);
    expect(stored!.usage!.calls).toBe(2);
    const log = (await http().get('/api/progress/events').set(auth).expect(200)).body;
    expect(log.events.find((e: { id: string }) => e.id === `interview-${session.id}`)).toMatchObject({ weakPatterns: ['monotonic-stack'] });
  });

  it('turns an overloaded API into a retryable 503 and drops the unanswered turn', async () => {
    const session = await start();
    replies.push({ status: 529, error: { type: 'overloaded_error', message: 'Overloaded' } });
    const res = await say(session.id, 'Here is my approach.').expect(503);
    expect(res.body.message).toMatch(/busy/);

    const pub = (await http().get(`/api/interview/sessions/${session.id}`).set(auth).expect(200)).body;
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

  it.each(['before streaming', 'after streaming'] as const)('keeps unexpected database failures private %s', async (phase) => {
    const session = await start();
    const logged = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
    const failure = new DrizzleQueryError(
      'select private_interview_payload from private_sessions where learner = $1',
      [learner, 'private-transcript'],
      Object.assign(new Error('private-database-detail'), { code: '42P01' }),
    );
    const store = app.get(InterviewStore);
    if (phase === 'before streaming') vi.spyOn(store, 'get').mockRejectedValueOnce(failure);
    else vi.spyOn(store, 'save').mockRejectedValueOnce(failure);

    const res = await say(session.id, 'private-candidate-answer').expect(phase === 'before streaming' ? 502 : 200);

    if (phase === 'before streaming') expect(res.body.statusCode).toBe(502);
    else {
      expect(res.text).toContain('event: delta');
      expect(res.text).toContain('event: error');
      expect(res.text).toContain('"status":502');
      expect(res.text).not.toContain('event: done');
    }
    expect(res.text).not.toMatch(/private-|select |42P01/);
    expect(logged.mock.calls[0]).toEqual([{ operation: 'interview.respond', category: 'database', code: '42P01' }]);
    const diagnostics = JSON.stringify(logged.mock.calls);
    expect(diagnostics).not.toMatch(/private-|select /);
    expect(diagnostics).not.toContain(session.id);
    expect(diagnostics).not.toContain(learner);
  });

  it('returns the score when lease cleanup fails without logging session identifiers or SQL', async () => {
    const session = await start();
    const logged = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
    vi.spyOn(app.get(CoordinationStore), 'releaseLease').mockRejectedValueOnce(
      new DrizzleQueryError(
        'delete from private_leases where key = $1',
        [session.id],
        Object.assign(new Error('private-lease-detail'), { code: '23503' }),
      ),
    );

    const scored = await http().post(`/api/interview/sessions/${session.id}/score`).set(auth).expect(201);

    expect(scored.body.status).toBe('scored');
    expect(logged.mock.calls).toEqual([[{ operation: 'interview.release-lease', category: 'database', code: '23503' }]]);
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

  it('cancels a reply still streaming at its deadline, drops the turn and frees the session at once', async () => {
    const session = await start();
    withOneSecondDeadlines();
    replies.push({ stream: ['Tell me '], endless: true, delayMs: 50 });
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

  it('cancels the upstream stream when the learner disconnects and frees the session', async () => {
    const session = await start();
    replies.push({ stream: ['Tell me '], endless: true, delayMs: 20 });
    const abort = new AbortController();
    const res = await fetch(`${await app.getUrl()}/api/interview/sessions/${session.id}/messages`, {
      method: 'POST',
      headers: { ...auth, 'content-type': 'application/json' },
      body: JSON.stringify({ content: 'Here is my approach.' }),
      signal: abort.signal,
    });
    await res.body!.getReader().read();
    abort.abort();
    await vi.waitFor(() => expect(upstream.at(-1)!.signal?.aborted).toBe(true));
    await vi.waitFor(() => say(session.id, 'Here is my approach.').expect(200));
  });

  it('answers a scorer that outlasts its deadline with a retryable 503, commits nothing, and scores again at once', async () => {
    const session = await start();
    withOneSecondDeadlines();
    scores.push({ hang: true });
    const res = await http().post(`/api/interview/sessions/${session.id}/score`).set(auth).expect(503);
    expect(res.body.message).toMatch(/unavailable/);
    expect(upstream.at(-1)!.signal?.aborted).toBe(true);
    expect((await http().get(`/api/interview/sessions/${session.id}`).set(auth).expect(200)).body.status).toBe('active');

    const scored = (await http().post(`/api/interview/sessions/${session.id}/score`).set(auth).expect(201)).body;
    expect(scored.scorecard).toMatchObject({ mode: 'ai', verdict: 'lean-hire' });
  });

  it('pauses the AI interviewer once the daily budget is spent', async () => {
    const session = await start();
    await app.get(CoordinationStore).add('ai-spend-usd', 86_400_000, 100);
    const res = await say(session.id, 'Anything else?').expect(503);
    expect(res.body.message).toMatch(/usage limit/);
    await http().post(`/api/interview/sessions/${session.id}/score`).set(auth).expect(503);
  });
});
