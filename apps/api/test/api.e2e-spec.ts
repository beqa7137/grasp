import { Test } from '@nestjs/testing';
import type { INestApplication } from '@nestjs/common';
import request from 'supertest';
import type { App } from 'supertest/types';
import { AppModule } from '../src/app.module.js';

const learner = '6f1c1c1e-8a4b-4c1d-9e3f-2a7b8c9d0e1f';

describe('API (in-memory, offline interviewer)', () => {
  let app: INestApplication<App>;

  beforeAll(async () => {
    delete process.env['DATABASE_URL'];
    delete process.env['ANTHROPIC_API_KEY'];
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    app.setGlobalPrefix('api');
    await app.init();
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports health and active integrations', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(res.body).toEqual({ status: 'ok', storage: 'memory', interviewer: 'offline' });
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
      .send({ events: [{ id: 'evt-000010', at: new Date().toISOString(), type: 'review.graded', itemId: 'rec:unknown', rating: 3, correct: true, durationMs: 1 }] })
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
