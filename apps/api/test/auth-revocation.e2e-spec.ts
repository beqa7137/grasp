import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import pg from 'pg';
import request from 'supertest';
import { hashToken, newOpaqueToken, TokenService } from '../src/auth/tokens.js';
import { createTestApp } from './support/app.js';
import { resetDatabase } from './support/database.js';
import { OAuthFakes } from './support/oauth.js';

const databaseUrl = process.env['TEST_DATABASE_URL'];
const jwtSecret = 'auth-revocation-test-secret-0123456789abcdef';

describe.runIf(databaseUrl)('Access token revocation across instances', () => {
  let first: NestExpressApplication;
  let second: NestExpressApplication;
  let fakes: OAuthFakes;

  beforeAll(async () => {
    await resetDatabase(databaseUrl!);
    fakes = await OAuthFakes.start();
    const env = { DATABASE_URL: databaseUrl, JWT_SECRET: jwtSecret, RATE_LIMIT_PER_MINUTE: '1000', ...fakes.env() };
    [first, second] = await Promise.all([createTestApp(env, fakes.customize), createTestApp(env, fakes.customize)]);
  });

  afterAll(async () => {
    await Promise.all([first?.close(), second?.close()]);
    await fakes?.close();
  });

  const signIn = async (email: string) => {
    const credential = await fakes.googleCredential(() => request(first.getHttpServer()), { sub: email, email });
    return (await request(first.getHttpServer()).post('/api/auth/google').send(credential).expect(200)).body as {
      accessToken: string;
      refreshToken: string;
      learnerId: string;
      user: { id: string };
    };
  };

  const assertPrivateRoutesReject = async (app: NestExpressApplication, token: string, sessionId: string) => {
    const server = app.getHttpServer();
    const auth = { Authorization: `Bearer ${token}` };
    const calls = [
      ['account', request(server).get('/api/auth/me').set(auth)],
      ['progress', request(server).get('/api/progress').set(auth)],
      ['events', request(server).get('/api/progress/events').set(auth)],
      ['interviews', request(server).get('/api/interview/sessions').set(auth)],
      ['interview', request(server).get(`/api/interview/sessions/${sessionId}`).set(auth)],
      ['export', request(server).get('/api/me/export').set(auth)],
      [
        'append event',
        request(server)
          .post('/api/progress/events')
          .set(auth)
          .send({
            events: [
              {
                id: randomUUID(),
                at: new Date().toISOString(),
                type: 'predict.answered',
                algorithmId: 'binary-search',
                patternId: 'binary-search',
                correct: true,
              },
            ],
          }),
      ],
      [
        'feedback',
        request(server)
          .post('/api/feedback')
          .set(auth)
          .send({ kind: 'idea', message: 'revocation probe', rating: null, context: { route: '/', release: null, platform: 'web' } }),
      ],
      ['start interview', request(server).post('/api/interview/sessions').set(auth).send({ track: 'coding' })],
      ['reply', request(server).post(`/api/interview/sessions/${sessionId}/messages`).set(auth).send({ content: 'Hello' })],
      ['score', request(server).post(`/api/interview/sessions/${sessionId}/score`).set(auth)],
      ['link Google', request(server).post('/api/auth/google/link').set(auth).send({})],
      ['link GitHub', request(server).post('/api/auth/github/link').set(auth).send({})],
      ['delete', request(server).delete('/api/me').set(auth)],
    ] as const;
    for (const [name, call] of calls) {
      const response = await call;
      expect(response.status, name).toBe(401);
      expect(response.body.code, name).toBe('token_invalid');
    }
  };

  it('ends only the logged-out session on both instances', async () => {
    const session = await signIn('logout@example.com');
    const other = await signIn('logout@example.com');
    const interview = await request(first.getHttpServer())
      .post('/api/interview/sessions')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ track: 'coding' })
      .expect(201);

    const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
    const counted = async () =>
      Number(
        (
          await pool.query<{ total: string }>('select coalesce(sum(total), 0) as total from counters where key like $1', [
            `rate:%:${hashToken(`user:${session.user.id}`)}`,
          ])
        ).rows[0]?.total,
      );
    try {
      const before = await counted();
      expect(before).toBeGreaterThan(0);
      await request(second.getHttpServer()).post('/api/auth/logout').send({ refreshToken: session.refreshToken }).expect(204);
      await Promise.all([
        assertPrivateRoutesReject(first, session.accessToken, interview.body.id),
        assertPrivateRoutesReject(second, session.accessToken, interview.body.id),
      ]);
      const tokens = new TokenService(jwtSecret);
      const unknown = await tokens.sign({ ...(await tokens.verify(session.accessToken)), familyId: randomUUID() });
      await request(first.getHttpServer()).get('/api/progress/events').set('Authorization', `Bearer ${unknown}`).expect(401);
      expect(await counted()).toBe(before);
    } finally {
      await pool.end();
    }
    await request(second.getHttpServer()).get('/api/progress/events').set('Authorization', `Bearer ${other.accessToken}`).expect(200);
  });

  it('does not issue a usable token when refresh races logout', async () => {
    const session = await signIn('refresh-race@example.com');
    const [refreshed] = await Promise.all([
      request(first.getHttpServer()).post('/api/auth/refresh').send({ refreshToken: session.refreshToken }),
      request(second.getHttpServer()).post('/api/auth/logout').send({ refreshToken: session.refreshToken }).expect(204),
    ]);
    expect([200, 401]).toContain(refreshed.status);
    if (refreshed.status === 200) {
      await request(first.getHttpServer())
        .get('/api/progress/events')
        .set('Authorization', `Bearer ${refreshed.body.accessToken}`)
        .expect(401);
      await request(second.getHttpServer()).post('/api/auth/refresh').send({ refreshToken: refreshed.body.refreshToken }).expect(401);
    }
    await request(second.getHttpServer()).get('/api/progress/events').set('Authorization', `Bearer ${session.accessToken}`).expect(401);
  });

  it('accepts a refresh family from an older instance and observes its logout', async () => {
    const session = await signIn('rollout@example.com');
    const familyId = randomUUID();
    const refreshToken = newOpaqueToken();
    const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
    try {
      await pool.query(
        `insert into refresh_tokens (id, user_id, family_id, token_hash, expires_at, created_at)
         values ($1, $2, $3, $4, now() + interval '30 days', now())`,
        [randomUUID(), session.user.id, familyId, hashToken(refreshToken)],
      );
      expect((await pool.query('select id from session_families where id = $1', [familyId])).rowCount).toBe(1);

      const refreshed = await request(second.getHttpServer()).post('/api/auth/refresh').send({ refreshToken }).expect(200);
      await request(first.getHttpServer())
        .get('/api/progress/events')
        .set('Authorization', `Bearer ${refreshed.body.accessToken}`)
        .expect(200);

      await pool.query('update refresh_tokens set revoked_at = now() where family_id = $1 and revoked_at is null', [familyId]);
      await request(first.getHttpServer())
        .get('/api/progress/events')
        .set('Authorization', `Bearer ${refreshed.body.accessToken}`)
        .expect(401);
      await request(second.getHttpServer()).post('/api/auth/refresh').send({ refreshToken: refreshed.body.refreshToken }).expect(401);
    } finally {
      await pool.end();
    }
  });

  it('rejects every private route after account deletion on both instances', async () => {
    const session = await signIn('delete@example.com');
    const interview = await request(first.getHttpServer())
      .post('/api/interview/sessions')
      .set('Authorization', `Bearer ${session.accessToken}`)
      .send({ track: 'coding' })
      .expect(201);

    await request(second.getHttpServer()).delete('/api/me').set('Authorization', `Bearer ${session.accessToken}`).expect(204);
    await Promise.all([
      assertPrivateRoutesReject(first, session.accessToken, interview.body.id),
      assertPrivateRoutesReject(second, session.accessToken, interview.body.id),
    ]);
  });
});
