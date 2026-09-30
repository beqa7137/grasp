import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import request from 'supertest';
import { BEHAVIORAL_CLOSING, starText } from '../src/interview/behavioral.prompts.js';
import { questionFollowUps, pickBehavioralProblem } from '../src/interview/behavioral-problems.js';
import { ClaudeInterviewer } from '../src/interview/claude.interviewer.js';
import { Interviewer } from '../src/interview/interviewer.js';
import { RUBRICS } from '../src/interview/prompts.js';
import { SpendGuard } from '../src/interview/spend-guard.js';
import { CoordinationStore, InterviewStore } from '../src/persistence/stores.js';
import { createTestApp } from './support/app.js';
import { STRONG_STAR } from './support/behavioral-session.js';
import { resetDatabase } from './support/database.js';
import { fakeAnthropic } from './support/fake-anthropic.js';
import { OAuthFakes } from './support/oauth.js';
import { signInLearner } from './support/signed-learner.js';

const testDatabaseUrl = process.env['TEST_DATABASE_URL'];
const storages = testDatabaseUrl ? (['memory', 'postgres'] as const) : (['memory'] as const);
const hourMs = 3_600_000;
const FOLLOW_UP = 'I messaged the payments lead that afternoon and we agreed I would own the client change until the sale.';

const scorecard = JSON.stringify({
  verdict: 'hire',
  summary: 'A clear, measured story; say more about what you set aside to make room.',
  dimensions: RUBRICS.behavioral.map((r) => ({ name: r.name, score: 3, evidence: 'Seen in the answer.' })),
  flaws: [
    { id: 'we-not-i', quote: 'we agreed I would own the client change', fix: 'I proposed to [name] that I own the client change.' },
    { id: 'vague', quote: 'I rewrote the whole payments stack in a weekend.', fix: 'Name the one change that mattered.' },
  ],
  strengths: ['Measured result'],
  improvements: ['Say what you set aside'],
  weakCompetencies: ['ownership', 'collaboration'],
});

describe.each(storages)('Behavioral AI interviewer over HTTP (%s storage, scripted Claude API)', (storage) => {
  let app: NestExpressApplication;
  let fakes: OAuthFakes;
  let provider: ReturnType<typeof fakeAnthropic>;
  let account: Awaited<ReturnType<typeof signInLearner>>;

  beforeAll(async () => {
    if (storage === 'postgres') await resetDatabase(testDatabaseUrl!);
    fakes = await OAuthFakes.start();
    provider = fakeAnthropic((body) =>
      body['output_config']?.['format'] ? { text: scorecard } : { stream: ['What did ', 'you do yourself?'] },
    );
    app = await createTestApp(
      { DATABASE_URL: storage === 'postgres' ? testDatabaseUrl : undefined, AI_DAILY_BUDGET_USD: '100', ...fakes.env() },
      (builder) =>
        fakes
          .customize(builder)
          .overrideProvider(Interviewer)
          .useFactory({
            factory: (spend: SpendGuard) => new ClaudeInterviewer(provider.client, { model: 'claude-sonnet-5' }, spend),
            inject: [SpendGuard],
          }),
    );
    account = await signInLearner(app, fakes);
  });

  afterAll(async () => {
    await Promise.all([app?.close(), fakes?.close()]);
  });

  const http = () => request(app.getHttpServer());
  const start = (headers: Record<string, string>, body: Record<string, unknown>) =>
    http().post('/api/interview/sessions').set(headers).send(body);
  const send = (headers: Record<string, string>, id: string, body: Record<string, unknown>) =>
    http().post(`/api/interview/sessions/${id}/messages`).set(headers).send(body);
  const quota = (learnerId: string) => app.get(CoordinationStore).read(`interview-quota:${learnerId}`, hourMs);
  const spent = () => app.get(SpendGuard).spentToday();

  it('runs a STAR answer and three follow-ups, closes for free, caps the turns, and scores into progress', async () => {
    const { headers, learnerId } = account;
    const session = (await start(headers, { track: 'behavioral', problemId: 'ownership-1', mode: 'ai', level: 'senior' }).expect(201)).body;
    expect(session).toMatchObject({
      mode: 'ai',
      level: 'senior',
      problem: { id: 'ownership-1', track: 'behavioral', competencyId: 'ownership' },
    });
    expect(session.messages).toEqual([
      { role: 'interviewer', content: pickBehavioralProblem('ownership-1')!.opening, at: expect.any(String) },
    ]);
    const before = provider.requests.length;

    const opened = await send(headers, session.id, { star: STRONG_STAR }).expect(200);
    expect(opened.headers['content-type']).toContain('text/event-stream');
    expect(opened.text).toContain('event: delta\ndata: {"text":"What did "}');
    const [first] = provider.requests.slice(before);
    expect(first.body['system']).toContain('Candidate level: senior or staff');
    expect(first.body['messages'].at(-1).content).toBe(`<candidate_turn>\n${starText(STRONG_STAR)}\n</candidate_turn>`);
    await send(headers, session.id, { content: FOLLOW_UP }).expect(200);
    await send(headers, session.id, { content: 'Orders per minute and pages, both on the sale dashboard I set up.' }).expect(200);
    const paid = { requests: provider.requests.length, quota: await quota(learnerId), spent: await spent() };
    expect(paid.requests - before).toBe(3);

    const closing = await send(headers, session.id, { content: 'I would have asked who owned the client before I started.' }).expect(200);
    expect(closing.text).toContain(`event: delta\ndata: ${JSON.stringify({ text: BEHAVIORAL_CLOSING })}`);
    expect(closing.text).toContain('event: done');
    expect({ requests: provider.requests.length, quota: await quota(learnerId), spent: await spent() }).toEqual(paid);
    const capped = await send(headers, session.id, { content: 'One more thing I forgot to say.' }).expect(409);
    expect(capped.body.message).toMatch(/Turn limit/);

    const stored = (await app.get(InterviewStore).get(learnerId, session.id))!;
    expect(stored.messages).toHaveLength(9);
    expect(stored.messages[1]).toMatchObject({ role: 'candidate', content: starText(STRONG_STAR), star: STRONG_STAR });
    expect(stored.messages.at(-1)!.content).toBe(BEHAVIORAL_CLOSING);

    const scored = (await http().post(`/api/interview/sessions/${session.id}/score`).set(headers).expect(201)).body;
    expect(scored.scorecard).toMatchObject({
      mode: 'ai',
      verdict: 'hire',
      weakPatterns: [],
      weakCompetencies: ['ownership', 'collaboration'],
    });
    expect(scored.scorecard.flaws).toEqual([
      { id: 'we-not-i', quote: 'we agreed I would own the client change', fix: 'I proposed to [name] that I own the client change.' },
      { id: 'vague', quote: null, fix: 'Name the one change that mattered.' },
    ]);
    expect(provider.requests.length - before).toBe(4);
    const log = (await http().get('/api/progress/events').set(headers).expect(200)).body;
    expect(log.events.find((e: { id: string }) => e.id === `interview-${session.id}`)).toEqual({
      id: `interview-${session.id}`,
      at: scored.scoredAt,
      type: 'interview.scored',
      sessionId: session.id,
      track: 'behavioral',
      verdict: 'hire',
      weakPatterns: [],
      competencyId: 'ownership',
      weakCompetencies: ['ownership', 'collaboration'],
    });
  });

  it('refuses turns that break the STAR-then-follow-ups shape before any paid work', async () => {
    const { headers, learnerId } = account;
    const session = (await start(headers, { track: 'behavioral', problemId: 'conflict', mode: 'ai' }).expect(201)).body;
    expect(session).toMatchObject({ level: 'mid', problem: { competencyId: 'conflict' } });
    const before = { requests: provider.requests.length, quota: await quota(learnerId) };
    const part = (text: string) => ({ ...STRONG_STAR, action: text });
    for (const body of [
      { content: 'I would start with the situation.' },
      { star: STRONG_STAR, hint: true },
      { star: STRONG_STAR, code: { language: 'python', source: 'print(1)' } },
      { star: STRONG_STAR, content: 'Also this.' },
      { star: { situation: '', task: ' ', action: '', result: '', reflection: '' } },
      { star: part('x'.repeat(4001)) },
      {
        star: { situation: 'x'.repeat(3000), task: 'x'.repeat(3000), action: 'x'.repeat(3000), result: 'x'.repeat(3000), reflection: 'x' },
      },
      { star: part('I fixed it.\u0000') },
      { star: part('I fixed it.\uD800') },
      { star: { ...STRONG_STAR, extra: 'field' } },
    ]) {
      await send(headers, session.id, body).expect(400);
    }
    await send(headers, session.id, { star: STRONG_STAR }).expect(200);
    await send(headers, session.id, { star: STRONG_STAR }).expect(400);
    await send(headers, session.id, { content: '', hint: true }).expect(400);
    expect(provider.requests.length - before.requests).toBe(1);
    expect((await quota(learnerId)) - before.quota).toBe(1);
    expect((await app.get(InterviewStore).get(learnerId, session.id))!.messages).toHaveLength(3);

    const coding = (await start(headers, { track: 'coding', problemId: 'warmer-days' }).expect(201)).body;
    await send(headers, coding.id, { star: STRONG_STAR }).expect(400);
    await start(headers, { track: 'coding', level: 'senior' }).expect(400);
    await start(headers, { track: 'behavioral', problemId: 'warmer-days' }).expect(404);
  });

  it('closes for free even once the daily budget is spent', async () => {
    const { headers } = account;
    const session = (await start(headers, { track: 'behavioral', problemId: 'delivery-2', mode: 'ai' }).expect(201)).body;
    await send(headers, session.id, { star: STRONG_STAR }).expect(200);
    await send(headers, session.id, { content: FOLLOW_UP }).expect(200);
    await send(headers, session.id, { content: FOLLOW_UP }).expect(200);
    await app.get(CoordinationStore).add('ai-spend-usd', 86_400_000, 100);
    const requests = provider.requests.length;
    const closing = await send(headers, session.id, { content: FOLLOW_UP }).expect(200);
    expect(closing.text).toContain('event: done');
    expect(provider.requests.length).toBe(requests);
    const denied = await http().post(`/api/interview/sessions/${session.id}/score`).set(headers).expect(503);
    expect(denied.body.message).toMatch(/usage limit/);
    const next = (await start(headers, { track: 'behavioral', mode: 'ai' }).expect(201)).body;
    await send(headers, next.id, { star: STRONG_STAR }).expect(503);
    expect(provider.requests.length).toBe(requests);
  });

  it('keeps guests on scripted practice: AI is refused without a reservation, and the scripted interview runs and scores', async () => {
    const guest = { 'x-learner-id': randomUUID() };
    const requests = provider.requests.length;
    const spentBefore = await spent();
    expect((await start(guest, { track: 'behavioral', mode: 'ai' }).expect(403)).body.code).toBe('ai_sign_in_required');

    const session = (await start(guest, { track: 'behavioral', problemId: 'ownership-2' }).expect(201)).body;
    expect(session).toMatchObject({ mode: 'offline', aiAccess: 'sign-in-required' });
    const followUps = questionFollowUps(pickBehavioralProblem('ownership-2')!);
    await send(guest, session.id, { star: STRONG_STAR }).expect(200);
    await send(guest, session.id, { content: FOLLOW_UP }).expect(200);
    const stored = (await app.get(InterviewStore).get(guest['x-learner-id'], session.id))!;
    expect(stored.messages.filter((m) => m.role === 'interviewer').map((m) => m.content)).toEqual([
      session.messages[0].content,
      followUps[0],
      followUps[1],
    ]);
    const scored = (await http().post(`/api/interview/sessions/${session.id}/score`).set(guest).expect(201)).body;
    expect(scored.scorecard).toMatchObject({ mode: 'offline', weakPatterns: [] });
    expect(scored.scorecard.flaws.every((f: { quote: string | null }) => f.quote === null)).toBe(true);
    expect(provider.requests.length).toBe(requests);
    expect(await spent()).toBe(spentBefore);
  });

  it('accepts a behavioral progress event and refuses unknown competencies or weak patterns on it', async () => {
    const post = (event: Record<string, unknown>) =>
      http()
        .post('/api/progress/events')
        .set('x-learner-id', randomUUID())
        .send({
          events: [
            {
              id: `evt-${randomUUID()}`,
              at: new Date().toISOString(),
              type: 'interview.scored',
              sessionId: 's1',
              verdict: 'hire',
              ...event,
            },
          ],
        });
    const behavioral = { track: 'behavioral', weakPatterns: [], competencyId: 'conflict', weakCompetencies: ['conflict', 'ownership'] };
    await post(behavioral).expect(200);
    await post({ ...behavioral, competencyId: 'grit' }).expect(400);
    await post({ ...behavioral, weakCompetencies: ['grit'] }).expect(400);
    await post({ ...behavioral, weakPatterns: ['monotonic-stack'] }).expect(400);
    await post({ track: 'coding', weakPatterns: [], competencyId: 'conflict' }).expect(400);
    await post({ track: 'coding', weakPatterns: ['monotonic-stack'] }).expect(200);
  });
});
