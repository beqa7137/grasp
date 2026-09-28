import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import { sql } from 'drizzle-orm';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import request from 'supertest';
import { ProgressStore } from '../src/persistence/stores.js';
import { createTestApp } from './support/app.js';

const learner = '6f1c1c1e-8a4b-4c1d-9e3f-2a7b8c9d0e1f';
const token = 'private-refresh-token';
const transcript = 'private interview transcript';

describe('HTTP diagnostic privacy', () => {
  let app: NestExpressApplication;
  const failure = new pg.DatabaseError(transcript, 0, 'error');
  failure.code = '23505';
  failure.detail = token;

  beforeAll(async () => {
    app = await createTestApp({}, (builder) =>
      builder.overrideProvider(ProgressStore).useValue({
        listReceivedAfter: async () => {
          throw new DrizzleQueryError('select private_query', [learner, token, transcript], failure);
        },
      }),
    );
  });

  afterAll(async () => {
    await app.close();
  });
  afterEach(() => vi.restoreAllMocks());

  it('keeps query details out of HTTP responses and all exception/access log arguments', async () => {
    const errorLog = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const warningLog = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const response = await request(app.getHttpServer())
      .get('/api/progress/events')
      .set('x-learner-id', learner)
      .set('x-request-id', token)
      .expect(500);
    expect(response.body).toEqual({ statusCode: 500, message: 'Internal server error' });
    expect(response.headers['x-request-id']).not.toBe(token);
    expect(errorLog).toHaveBeenCalledWith(
      expect.objectContaining({
        operation: 'request_failed',
        category: 'database',
        code: '23505',
        requestId: response.headers['x-request-id'],
      }),
    );
    const serialized = JSON.stringify([response.body, errorLog.mock.calls, warningLog.mock.calls]);
    for (const privateValue of [learner, token, transcript, 'private_query']) expect(serialized).not.toContain(privateValue);
  });

  it('logs route templates instead of session IDs and unknown path text', async () => {
    const warningLog = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    await request(app.getHttpServer()).get(`/api/interview/sessions/${learner}`).set('x-learner-id', learner).expect(404);
    await request(app.getHttpServer()).get(`/api/${token}`).expect(404);
    expect(warningLog).toHaveBeenCalledWith(expect.objectContaining({ path: '/api/interview/sessions/:id' }));
    expect(warningLog).toHaveBeenCalledWith(expect.objectContaining({ path: '*path' }));
    expect(JSON.stringify(warningLog.mock.calls)).not.toContain(learner);
    expect(JSON.stringify(warningLog.mock.calls)).not.toContain(token);
  });

  it.skipIf(!process.env.TEST_DATABASE_URL)('scrubs a real Postgres error containing a private bound parameter', async () => {
    const pool = new pg.Pool({ connectionString: process.env.TEST_DATABASE_URL });
    const database = drizzle(pool);
    const postgresApp = await createTestApp({}, (builder) =>
      builder.overrideProvider(ProgressStore).useValue({
        listReceivedAfter: async () => {
          await database.execute(sql`select ${token}::integer`);
          return { events: [], latest: null };
        },
      }),
    );
    const errorLog = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    try {
      const response = await request(postgresApp.getHttpServer()).get('/api/progress/events').set('x-learner-id', learner).expect(500);
      expect(errorLog).toHaveBeenCalledWith(expect.objectContaining({ category: 'database', code: '22P02' }));
      const serialized = JSON.stringify([response.body, errorLog.mock.calls]);
      expect(serialized).not.toContain(token);
      expect(serialized).not.toContain(learner);
      expect(serialized).not.toContain('select');
    } finally {
      await postgresApp.close();
      await pool.end();
    }
  });
});
