import type { NestExpressApplication } from '@nestjs/platform-express';
import request from 'supertest';
import { createTestApp } from './support/app.js';
import { resetDatabase } from './support/database.js';

const ADMIN_TOKEN = 'test-admin-token-0123456789abcdef0123';
const ada = '1a2b3c4d-5e6f-4a1b-8c2d-3e4f5a6b7c8d';
const bob = '2b3c4d5e-6f7a-4b2c-9d3e-4f5a6b7c8d9e';
const testDatabaseUrl = process.env['TEST_DATABASE_URL'];
const storages = testDatabaseUrl ? (['memory', 'postgres'] as const) : (['memory'] as const);

const note = (kind: string, message: string, rating: number | null = null) => ({
  kind,
  message,
  rating,
  context: { route: '/tabs/learn', release: 'abc1234', platform: 'web' },
});

describe.each(storages)('Pilot tooling (%s storage)', (storage) => {
  let app: NestExpressApplication;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    if (storage === 'postgres') await resetDatabase(testDatabaseUrl!);
    app = await createTestApp({ ADMIN_TOKEN, DATABASE_URL: storage === 'postgres' ? testDatabaseUrl : undefined });

    const at = new Date().toISOString();
    for (const [learner, id] of [
      [ada, 'evt-ada-1'],
      [bob, 'evt-bob-1'],
    ]) {
      await http()
        .post('/api/progress/events')
        .set('x-learner-id', learner)
        .send({ events: [{ id, at, type: 'review.graded', itemId: 'rec:bs1', rating: 3, correct: true, durationMs: 4000 }] })
        .expect(200);
    }
    const interview = await http().post('/api/interview/sessions').set('x-learner-id', ada).send({ track: 'coding' }).expect(201);
    await http()
      .post(`/api/interview/sessions/${interview.body.id}/messages`)
      .set('x-learner-id', ada)
      .send({ content: 'I would clarify the input size first.' })
      .expect(200);
  });

  afterAll(async () => {
    await app.close();
  });

  it('accepts feedback with context and validates it', async () => {
    const res = await http()
      .post('/api/feedback')
      .set('x-learner-id', ada)
      .send(note('confusing', 'The heap visualizer skipped a step.', 3))
      .expect(201);
    expect(res.body.id).toMatch(/^[0-9a-f-]{36}$/);
    await http()
      .post('/api/feedback')
      .set('x-learner-id', bob)
      .send(note('praise', 'Love the Design Lab.', 5))
      .expect(201);

    await http().post('/api/feedback').set('x-learner-id', ada).send(note('rant', 'x')).expect(400);
    await http().post('/api/feedback').set('x-learner-id', ada).send(note('bug', '   ')).expect(400);
    await http()
      .post('/api/feedback')
      .set('x-learner-id', ada)
      .send(note('bug', 'x', 9))
      .expect(400);
    await http().post('/api/feedback').send(note('bug', 'no learner')).expect(400);
  });

  it('protects admin routes with the bearer token', async () => {
    await http().get('/api/admin/metrics').expect(401);
    await http().get('/api/admin/metrics').set('Authorization', 'Bearer wrong').expect(401);
    await http().get('/api/admin/metrics').set('Authorization', ADMIN_TOKEN).expect(401);
  });

  it('serves cohort metrics to the operator', async () => {
    const res = await http().get('/api/admin/metrics').set('Authorization', `Bearer ${ADMIN_TOKEN}`).expect(200);
    expect(res.headers['cache-control']).toBe('no-store');
    expect(res.body.learners).toMatchObject({ total: 2, active1d: 2 });
    expect(res.body.activation.reviewed).toMatchObject({ count: 2, of: 2 });
    expect(res.body.activation.startedInterview).toMatchObject({ count: 1, of: 2 });
    expect(res.body.feedback).toMatchObject({ total: 2, byKind: { confusing: 1, praise: 1 }, averageRating: 4 });

    const all = await http().get('/api/admin/feedback').set('Authorization', `Bearer ${ADMIN_TOKEN}`).expect(200);
    expect(all.body.map((f: { kind: string }) => f.kind).sort()).toEqual(['confusing', 'praise']);
  });

  it('exports everything stored for a learner, and nothing about others', async () => {
    const res = await http().get('/api/me/export').set('x-learner-id', ada).expect(200);
    expect(res.headers['content-disposition']).toContain('grasp-data.json');
    expect(res.body.learnerId).toBe(ada);
    expect(res.body.events.map((e: { id: string }) => e.id)).toEqual(['evt-ada-1']);
    expect(res.body.interviews).toHaveLength(1);
    expect(res.body.interviews[0].messages).toHaveLength(3);
    expect(res.body.interviews[0].problem.referenceNotes).toBeUndefined();
    expect(res.body.feedback).toEqual([expect.objectContaining({ kind: 'confusing', message: 'The heap visualizer skipped a step.' })]);
    expect(JSON.stringify(res.body)).not.toContain(bob);
  });

  it('erases a learner completely and leaves others intact', async () => {
    const active = await http().get('/api/progress/events').set('x-learner-id', ada).expect(200);
    expect(active.headers['cache-control']).toBe('no-store');

    await http().delete('/api/me').set('x-learner-id', ada).expect(204);

    const exported = await http().get('/api/me/export').set('x-learner-id', ada).expect(200);
    expect(exported.body).toMatchObject({ events: [], interviews: [], feedback: [] });
    const progress = await http().get('/api/progress/events').set('x-learner-id', ada).expect(410);
    expect(progress.body.code).toBe('learner_erased');
    expect(progress.headers['cache-control']).toBe('no-store');

    const kept = await http().get('/api/me/export').set('x-learner-id', bob).expect(200);
    expect(kept.body.events).toHaveLength(1);
    expect(kept.body.feedback).toHaveLength(1);

    const metrics = await http().get('/api/admin/metrics').set('Authorization', `Bearer ${ADMIN_TOKEN}`).expect(200);
    expect(metrics.body.learners.total).toBe(1);
    expect(metrics.body.feedback.total).toBe(1);

    await http().delete('/api/me').set('x-learner-id', ada).expect(204);
  });
});

describe('Admin routes without ADMIN_TOKEN', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp({ ADMIN_TOKEN: undefined });
  });

  afterAll(async () => {
    await app.close();
  });

  it('are indistinguishable from missing routes', async () => {
    await request(app.getHttpServer()).get('/api/admin/metrics').set('Authorization', `Bearer ${ADMIN_TOKEN}`).expect(404);
  });
});
