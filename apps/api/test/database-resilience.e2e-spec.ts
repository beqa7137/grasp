import type { NestExpressApplication } from '@nestjs/platform-express';
import { randomUUID } from 'node:crypto';
import { performance } from 'node:perf_hooks';
import pg from 'pg';
import request from 'supertest';
import { PG_POOL } from '../src/persistence/persistence.module.js';
import { createTestApp } from './support/app.js';
import { migrateDatabase } from './support/database.js';
import { PostgresProxy } from './support/postgres-proxy.js';

const testDatabaseUrl = process.env['TEST_DATABASE_URL'];
const learner = '6f1c1c1e-8a4b-4c1d-9e3f-2a7b8c9d0e1f';

describe.skipIf(!testDatabaseUrl)('Postgres resilience', () => {
  let app: NestExpressApplication | undefined;
  let proxy: PostgresProxy | undefined;

  beforeAll(async () => {
    await migrateDatabase(testDatabaseUrl!);
  });

  afterEach(async () => {
    await app?.close();
    await proxy?.close();
    app = undefined;
    proxy = undefined;
  });

  it('recovers after only its idle backend is terminated', async () => {
    app = await createTestApp({ DATABASE_URL: testDatabaseUrl });
    const pool = app.get<pg.Pool>(PG_POOL);
    const controller = new pg.Pool({ connectionString: testDatabaseUrl, max: 1 });
    try {
      const { rows } = await pool.query<{ pid: number }>('select pg_backend_pid() as pid');
      const poolError = new Promise<void>((resolve) => pool.once('error', () => resolve()));
      await controller.query('select pg_terminate_backend($1)', [rows[0]!.pid]);
      await poolError;
      await request(app.getHttpServer()).get('/api/health').expect(200);
      await request(app.getHttpServer()).get('/api/health/ready').expect(200);
      await request(app.getHttpServer()).get('/api/progress/events').set('x-learner-id', learner).expect(200);
    } finally {
      await controller.end();
    }
  });

  it('bounds a query that Postgres does not finish promptly', async () => {
    app = await createTestApp({ DATABASE_URL: testDatabaseUrl });
    const pool = app.get<pg.Pool>(PG_POOL);
    const started = performance.now();
    await expect(pool.query('select pg_sleep(5)')).rejects.toThrow();
    expect(performance.now() - started).toBeLessThan(3600);
    await request(app.getHttpServer()).get('/api/health/ready').expect(200);
  });

  it('returns 503 when a route query stalls after its rate counter succeeds', async () => {
    app = await createTestApp({ DATABASE_URL: testDatabaseUrl });
    const locker = new pg.Client({ connectionString: testDatabaseUrl });
    await locker.connect();
    try {
      await locker.query('begin');
      await locker.query('lock table learning_events in access exclusive mode');
      const started = performance.now();
      const response = await request(app.getHttpServer()).get('/api/progress/events').set('x-learner-id', learner).expect(503);
      expect(performance.now() - started).toBeLessThan(3600);
      expect(response.body).toMatchObject({ status: 'unavailable', database: 'unreachable' });
    } finally {
      await locker.query('rollback');
      await locker.end();
    }
    await request(app.getHttpServer()).get('/api/progress/events').set('x-learner-id', learner).expect(200);
  });

  it('bounds blackholed database calls and recovers when traffic resumes', async () => {
    proxy = await PostgresProxy.start(testDatabaseUrl!);
    app = await createTestApp({ DATABASE_URL: proxy.databaseUrl });
    const server = app.getHttpServer();
    await request(server).get('/api/health').expect(200);
    for (const call of [
      () => request(server).get('/api/health/ready'),
      () => request(server).get('/api/interview/problems'),
      () => request(server).get('/api/progress/events').set('x-learner-id', learner),
      () => request(server).post('/api/progress/events').set('x-learner-id', learner).send({ events: [] }),
    ]) {
      const started = performance.now();
      const response = await call().expect(503);
      expect(performance.now() - started).toBeLessThan(4600);
      expect(response.body).toMatchObject({ status: 'unavailable', database: 'unreachable' });
    }
    proxy.unblock();
    await request(server).get('/api/health/ready').expect(200);
    await request(server).get('/api/progress/events').set('x-learner-id', learner).expect(200);
  }, 30_000);

  it('accepts a full 500-event progress push before the normal query deadline', async () => {
    app = await createTestApp({ DATABASE_URL: testDatabaseUrl });
    const at = new Date().toISOString();
    const events = Array.from({ length: 500 }, () => ({
      id: `evt-${randomUUID()}`,
      at,
      type: 'review.graded',
      itemId: 'rec:bs1',
      rating: 3,
      correct: true,
      durationMs: 4000,
    }));
    const started = performance.now();
    const response = await request(app.getHttpServer())
      .post('/api/progress/events')
      .set('x-learner-id', learner)
      .send({ events })
      .expect(200);
    expect(response.body).toMatchObject({ accepted: 500, duplicates: 0 });
    expect(performance.now() - started).toBeLessThan(8_000);
  });
});
