import { randomUUID } from 'node:crypto';
import request from 'supertest';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { createTestApp } from './support/app.js';
import { resetDatabase } from './support/database.js';

const learner = '6f1c1c1e-8a4b-4c1d-9e3f-2a7b8c9d0e1f';

const testDatabaseUrl = process.env['TEST_DATABASE_URL'];
const storages = testDatabaseUrl ? (['memory', 'postgres'] as const) : (['memory'] as const);

describe.each(storages)('API (%s storage, offline interviewer)', (storage) => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    if (storage === 'postgres') await resetDatabase(testDatabaseUrl!);
    app = await createTestApp({ DATABASE_URL: storage === 'postgres' ? testDatabaseUrl : undefined });
  });

  afterAll(async () => {
    await app.close();
  });

  const postEvent = (event: Record<string, unknown>, learnerId = learner) =>
    request(app.getHttpServer())
      .post('/api/progress/events')
      .set('x-learner-id', learnerId)
      .send({ events: [{ id: `evt-${randomUUID()}`, at: new Date().toISOString(), ...event }] });

  it('reports health and active integrations', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', storage, interviewer: 'offline', release: null });
  });

  it('serves the curriculum and traces algorithms server-side', async () => {
    const patterns = await request(app.getHttpServer()).get('/api/curriculum/patterns').expect(200);
    expect(patterns.body.length).toBe(20);
    const trace = await request(app.getHttpServer())
      .post('/api/curriculum/algorithms/binary-search/trace')
      .send({ input: { nums: [1, 3, 5, 7, 9], target: 7 } })
      .expect(201);
    expect(trace.body.frames.at(-1).vars.result).toBe(3);
    await request(app.getHttpServer())
      .post('/api/curriculum/algorithms/binary-search/trace')
      .send({ input: { nums: 'x', target: 1 } })
      .expect(400);
  });

  it('requires a learner id', async () => {
    await request(app.getHttpServer()).get('/api/progress').expect(400);
  });

  it('ingests events idempotently (legacy SM-2 events included) and derives FSRS state', async () => {
    const at = new Date().toISOString();
    const events = [
      { id: 'evt-000001', at, type: 'review.graded', itemId: 'rec:bs1', rating: 3, correct: true, durationMs: 9000, seed: 42 },
      { id: 'evt-000002', at, type: 'predict.answered', algorithmId: 'binary-search', patternId: 'binary-search', correct: false },
      { id: 'evt-000003', at, type: 'drill.reviewed', cardId: 'h1', grade: 5 },
    ];
    const first = await request(app.getHttpServer()).post('/api/progress/events').set('x-learner-id', learner).send({ events }).expect(200);
    expect(first.body).toMatchObject({ accepted: 3, duplicates: 0 });
    const again = await request(app.getHttpServer()).post('/api/progress/events').set('x-learner-id', learner).send({ events }).expect(200);
    expect(again.body).toMatchObject({ accepted: 0, duplicates: 3 });

    const snap = await request(app.getHttpServer()).get('/api/progress').set('x-learner-id', learner).expect(200);
    expect(snap.body.state.cards['rec:bs1']).toMatchObject({ reps: 1, phase: 'review' });
    expect(snap.body.state.cards['rec:h1']).toMatchObject({ reps: 1 });
    expect(snap.body.state.boosts['pred:binary-search'].reason).toBe('prediction-miss');
    expect(snap.body.mastery.find((m: any) => m.topic === 'binary-search').itemsSeen).toBe(1);
    expect(snap.body.forecast).toHaveLength(7);
    expect(snap.body.session.items.length).toBeGreaterThan(0);
  });

  it('serves review items and reproducible question variants', async () => {
    const items = await request(app.getHttpServer()).get('/api/curriculum/review-items').expect(200);
    expect(items.body.length).toBeGreaterThan(100);
    const a = await request(app.getHttpServer()).get('/api/curriculum/review-items/sd:bottleneck/question?seed=7').expect(200);
    const b = await request(app.getHttpServer()).get('/api/curriculum/review-items/sd:bottleneck/question?seed=7').expect(200);
    expect(a.body).toEqual(b.body);
    expect(a.body.pipeline.length).toBeGreaterThan(2);
    await request(app.getHttpServer()).get('/api/curriculum/review-items/nope/question').expect(404);
  });

  it('rejects malformed events', async () => {
    await request(app.getHttpServer())
      .post('/api/progress/events')
      .set('x-learner-id', learner)
      .send({ events: [{ id: 'evt-000009', at: 'nope', type: 'drill.reviewed', cardId: 'zzz', grade: 9 }] })
      .expect(400);
    await request(app.getHttpServer())
      .post('/api/progress/events')
      .set('x-learner-id', learner)
      .send({
        events: [
          {
            id: 'evt-000010',
            at: new Date().toISOString(),
            type: 'review.graded',
            itemId: 'rec:unknown',
            rating: 3,
            correct: true,
            durationMs: 1,
          },
        ],
      })
      .expect(400);
  });

  it('runs an offline interview end to end with SSE streaming', async () => {
    const start = await request(app.getHttpServer())
      .post('/api/interview/sessions')
      .set('x-learner-id', learner)
      .send({ track: 'coding', problemId: 'warmer-days' })
      .expect(201);
    expect(start.body.messages).toHaveLength(1);
    expect(start.body.problem.referenceNotes).toBeUndefined();
    const id = start.body.id;

    const reply = await request(app.getHttpServer())
      .post(`/api/interview/sessions/${id}/messages`)
      .set('x-learner-id', learner)
      .send({ content: 'I would first clarify constraints: can the array be empty, and what is the input size range?' })
      .expect(200);
    expect(reply.headers['content-type']).toContain('text/event-stream');
    expect(reply.text).toContain('event: delta');
    expect(reply.text).toContain('event: done');

    await request(app.getHttpServer())
      .post(`/api/interview/sessions/${id}/messages`)
      .set('x-learner-id', learner)
      .send({ hint: true })
      .expect(200);

    const scored = await request(app.getHttpServer()).post(`/api/interview/sessions/${id}/score`).set('x-learner-id', learner).expect(201);
    expect(scored.body.status).toBe('scored');
    expect(scored.body.scorecard.dimensions).toHaveLength(5);
    expect(scored.body.hintsUsed).toBe(1);
    expect(scored.body.scoredAt).toBeDefined();

    const log = await request(app.getHttpServer()).get('/api/progress/events').set('x-learner-id', learner).expect(200);
    const scoredEvent = log.body.events.find((e: any) => e.type === 'interview.scored');
    expect(scoredEvent).toMatchObject({ id: `interview-${id}`, sessionId: id, weakPatterns: scored.body.scorecard.weakPatterns });

    await request(app.getHttpServer())
      .post(`/api/interview/sessions/${id}/messages`)
      .set('x-learner-id', learner)
      .send({ content: 'one more thing' })
      .expect(409);
  });

  it('ingests coding submissions and validates them against the problem bank', async () => {
    const submit = (event: Record<string, unknown>) => postEvent({ type: 'code.submitted', language: 'python', ...event });

    await submit({ problemId: 'daily-temperatures', passed: 20, total: 28 }).expect(200);
    await submit({ problemId: 'daily-temperatures', passed: 29, total: 28 }).expect(400);
    await submit({ problemId: 'fizz-buzz', passed: 1, total: 1 }).expect(400);
    await submit({ problemId: 'daily-temperatures', passed: 1, total: 1, language: 'cobol' }).expect(400);

    const snap = await request(app.getHttpServer()).get('/api/progress').set('x-learner-id', learner).expect(200);
    expect(snap.body.state.coding['daily-temperatures']).toMatchObject({ attempts: 1, bestPassed: 20, solvedAt: null });
  });

  it('syncs study settings and rejects values outside the offered options', async () => {
    const change = (settings: object) => postEvent({ type: 'settings.changed', settings });

    await change({ retention: 0.95, newPerDay: 5 }).expect(200);
    await change({ retention: 0.5 }).expect(400);
    await change({ budgetMinutes: 7 }).expect(400);
    await change({}).expect(400);
    await change({ theme: 'dark' }).expect(400);

    const snap = await request(app.getHttpServer()).get('/api/progress').set('x-learner-id', learner).expect(200);
    expect(snap.body.state.settings).toEqual({ retention: 0.95, budgetMinutes: 10, newPerDay: 5 });
  });

  it('records a finished case study, schedules its topics and rejects unknown cases and impossible outcomes', async () => {
    const caseLearner = randomUUID();
    const finish = (fields: object) =>
      postEvent(
        {
          type: 'case.completed',
          caseId: 'url-shortener',
          topics: ['sd-estimation', 'sd-caching', 'sd-sharding'],
          bestChoices: 2,
          decisions: 3,
          closeEstimates: 1,
          estimates: 2,
          ...fields,
        },
        caseLearner,
      );

    await finish({ caseId: 'no-such-case' }).expect(400);
    await finish({ topics: [] }).expect(400);
    await finish({ topics: ['two-pointers', 'sd-retired'] }).expect(400);
    await finish({ bestChoices: 4 }).expect(400);
    await finish({ decisions: 51, bestChoices: 0 }).expect(400);
    await finish({ closeEstimates: 3 }).expect(400);
    await finish({ closeEstimates: -1 }).expect(400);
    await finish({ bestChoices: 1.5 }).expect(400);
    await finish({ decisions: undefined }).expect(400);
    await finish({ topics: ['sd-estimation', 'sd-retired', 'sd-caching', 'sd-caching', 'sd-sharding'] }).expect(200);

    const snap = await request(app.getHttpServer()).get('/api/progress').set('x-learner-id', caseLearner).expect(200);
    expect(snap.body.state.cases).toEqual({
      'url-shortener': {
        firstCompletedAt: expect.any(String),
        completions: 1,
        topics: ['sd-estimation', 'sd-caching', 'sd-sharding'],
        bestChoices: 2,
        decisions: 3,
        closeEstimates: 1,
        estimates: 2,
      },
    });
    expect(Object.keys(snap.body.state.introduced).sort()).toEqual(['sd-caching', 'sd-estimation', 'sd-sharding']);
    expect(snap.body.session.items.filter((id: string) => id.startsWith('sd:')).length).toBeGreaterThan(0);
  });

  it('derives a placement from a placement check and rejects answers it could not have asked', async () => {
    const placementLearner = randomUUID();
    const at = new Date().toISOString();
    const check = (answers: object[]) => postEvent({ at, type: 'diagnostic.completed', answers }, placementLearner);
    const answer = (itemId: string, outcome = 'correct') => ({ itemId, outcome, durationMs: 9_000 });

    await check([answer('cx:hash-pair')]).expect(400);
    await check([answer('rec:no-such-card')]).expect(400);
    await check([answer('rec:h1'), answer('rec:h1', 'wrong')]).expect(400);
    await check([answer('rec:h1', 'maybe')]).expect(400);
    await check([]).expect(400);
    await check([answer('rec:h1'), answer('rec:tp1', 'skipped')]).expect(200);

    const snap = await request(app.getHttpServer()).get('/api/progress').set('x-learner-id', placementLearner).expect(200);
    expect(snap.body.state.placement).toEqual({ hashing: 'strong', 'two-pointers': 'weak' });
    expect(snap.body.state.diagnosedAt).toBe(at);
    expect(snap.body.state.cards).toEqual({});
  });

  it('keeps code the candidate shares with an interview message', async () => {
    const start = await request(app.getHttpServer())
      .post('/api/interview/sessions')
      .set('x-learner-id', learner)
      .send({ track: 'coding' })
      .expect(201);
    const reply = await request(app.getHttpServer())
      .post(`/api/interview/sessions/${start.body.id}/messages`)
      .set('x-learner-id', learner)
      .send({ content: '', code: { language: 'javascript', source: 'function f(t) {\n  return t;\n}\n\n' } })
      .expect(200);
    expect(reply.text).toContain('3 lines of javascript');
    const session = await request(app.getHttpServer())
      .get(`/api/interview/sessions/${start.body.id}`)
      .set('x-learner-id', learner)
      .expect(200);
    expect(session.body.messages[1]).toMatchObject({
      content: 'Here is my code.',
      code: { language: 'javascript', source: 'function f(t) {\n  return t;\n}' },
    });
    await request(app.getHttpServer())
      .post(`/api/interview/sessions/${start.body.id}/messages`)
      .set('x-learner-id', learner)
      .send({ content: '', code: { language: 'python', source: '   ' } })
      .expect(400);
  });

  it('does not leak sessions across learners', async () => {
    const start = await request(app.getHttpServer())
      .post('/api/interview/sessions')
      .set('x-learner-id', learner)
      .send({ track: 'system-design' })
      .expect(201);
    await request(app.getHttpServer())
      .get(`/api/interview/sessions/${start.body.id}`)
      .set('x-learner-id', '0a1b2c3d-4e5f-4a6b-8c7d-9e0f1a2b3c4d')
      .expect(404);
  });
});
