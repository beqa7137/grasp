import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import request from 'supertest';
import { StoryStore } from '../src/persistence/story.store.js';
import { createTestApp } from './support/app.js';
import { resetDatabase } from './support/database.js';
import { OAuthFakes } from './support/oauth.js';
import { signInLearner } from './support/signed-learner.js';

const testDatabaseUrl = process.env['TEST_DATABASE_URL'];
const storages = testDatabaseUrl ? (['memory', 'postgres'] as const) : (['memory'] as const);
const secret = 'My manager and I disagreed about the launch date';

const draft = {
  situation: secret,
  task: 'I owned the rollout.',
  action: 'I split the launch in two.',
  result: 'Both halves shipped.',
  reflection: '',
};
const body = (overrides: object = {}) => ({
  title: 'The split launch',
  competencyIds: ['conflict', 'delivery'],
  draft,
  updatedAt: new Date(Date.now() - 60_000).toISOString(),
  ...overrides,
});

describe.each(storages)('Stories over HTTP (%s storage)', (storage) => {
  let app: NestExpressApplication;
  let fakes: OAuthFakes;
  const http = () => request(app.getHttpServer());

  beforeAll(async () => {
    if (storage === 'postgres') await resetDatabase(testDatabaseUrl!);
    fakes = await OAuthFakes.start();
    app = await createTestApp({ DATABASE_URL: storage === 'postgres' ? testDatabaseUrl : undefined, ...fakes.env() }, fakes.customize);
  });

  afterAll(async () => {
    await app?.close();
    await fakes?.close();
  });

  it('refuses anonymous learners, whose stories stay on their device', async () => {
    const anonymous = randomUUID();
    await http().get('/api/stories').set('x-learner-id', anonymous).expect(401);
    await http().put('/api/stories/abc').set('x-learner-id', anonymous).send(body()).expect(401);
    const account = await signInLearner(app, fakes);
    const owned = await http().get('/api/stories').set('x-learner-id', account.learnerId).expect(401);
    expect(owned.body.code).toBe('sign_in_required');
  });

  it('stores a story, lists it privately, and keeps the later of two edits', async () => {
    const { headers } = await signInLearner(app, fakes);
    const first = body({ updatedAt: '2026-09-01T10:00:00.000+02:00', rehearsal: { step: 0, told: 1, due: '2026-09-02T08:00:00Z' } });
    const stored = await http().put('/api/stories/mfz1a2b3').set(headers).send(first).expect(200);
    expect(stored.body).toEqual({
      story: {
        ...first,
        id: 'mfz1a2b3',
        updatedAt: '2026-09-01T08:00:00.000Z',
        rehearsal: { step: 0, told: 1, due: '2026-09-02T08:00:00.000Z' },
      },
    });

    const stale = await http()
      .put('/api/stories/mfz1a2b3')
      .set(headers)
      .send(body({ title: 'Stale', updatedAt: '2026-09-01T07:59:59.999Z' }))
      .expect(200);
    expect(stale.body.story.title).toBe('The split launch');
    await http()
      .put('/api/stories/mfz1a2b3')
      .set(headers)
      .send(body({ title: 'Newer', updatedAt: '2026-09-01T08:00:00.001Z' }))
      .expect(200);

    const listed = await http().get('/api/stories').set(headers).expect(200);
    expect(listed.headers['cache-control']).toBe('no-store');
    expect(listed.body.stories).toEqual([expect.objectContaining({ id: 'mfz1a2b3', title: 'Newer', draft })]);
    expect(
      (
        await http()
          .get('/api/stories')
          .set((await signInLearner(app, fakes)).headers)
      ).body.stories,
    ).toEqual([]);
  });

  it('dates a change from a clock running ahead at the server time, so it cannot outrank later edits', async () => {
    const { headers } = await signInLearner(app, fakes);
    const before = Date.now();
    const ahead = await http()
      .put('/api/stories/ahead')
      .set(headers)
      .send(body({ updatedAt: new Date(Date.now() + 60 * 60_000).toISOString() }))
      .expect(200);
    const stored = Date.parse(ahead.body.story.updatedAt);
    expect(stored).toBeGreaterThanOrEqual(before);
    expect(stored).toBeLessThanOrEqual(Date.now());
    await http()
      .put('/api/stories/ahead')
      .set(headers)
      .send(body({ title: 'Edited later elsewhere', updatedAt: new Date(stored + 1).toISOString() }))
      .expect(200);
    expect((await http().get('/api/stories').set(headers)).body.stories).toEqual([
      expect.objectContaining({ id: 'ahead', title: 'Edited later elsewhere' }),
    ]);
  });

  it('keeps no text of a deleted story', async () => {
    const { headers } = await signInLearner(app, fakes);
    await http().put('/api/stories/gone').set(headers).send(body()).expect(200);
    const deleted = await http()
      .put('/api/stories/gone')
      .set(headers)
      .send(body({ deleted: true, updatedAt: new Date().toISOString() }))
      .expect(200);
    expect(deleted.body.story).toMatchObject({ id: 'gone', deleted: true, title: '', competencyIds: [] });
    expect(JSON.stringify((await http().get('/api/stories').set(headers)).body)).not.toContain(secret);
  });

  it('validates ids, tags, lengths and timestamps', async () => {
    const { headers } = await signInLearner(app, fakes);
    const put = (id: string, payload: object) => http().put(`/api/stories/${id}`).set(headers).send(payload);
    await put('bad%20id', body()).expect(400);
    await put('x'.repeat(65), body()).expect(400);
    const renamed = await put('tags', body({ competencyIds: ['conflict', 'renamed-since', 'conflict'] })).expect(200);
    expect(renamed.body.story.competencyIds).toEqual(['conflict']);
    await put('a', body({ title: 'A title with \u0000 in it' })).expect(400);
    await put('a', body({ draft: { ...draft, result: 'Half a pair \ud83d here' } })).expect(400);
    await put(
      'a',
      body({ draft: { ...draft, result: 'A whole pair \ud83d\ude80 is fine' }, updatedAt: '2026-09-01T00:00:00.000Z' }),
    ).expect(200);
    await put('a', body({ title: 'x'.repeat(81) })).expect(400);
    await put('a', body({ draft: { ...draft, action: 'x'.repeat(4_001) } })).expect(400);
    await put('a', body({ draft: { ...draft, notes: 'extra' } })).expect(400);
    await put('a', body({ updatedAt: 'yesterday' })).expect(400);
    await put('a', body({ rehearsal: { step: 9, told: 1, due: new Date().toISOString() } })).expect(400);
    await put('a', body({ deleted: false })).expect(400);
    const invalid = await put('a', body({ title: secret.repeat(3) })).expect(400);
    expect(JSON.stringify(invalid.body)).not.toContain(secret);
    await put(
      'a',
      body({ competencyIds: ['conflict', 'delivery', 'ownership', 'failure'], draft: { ...draft, action: 'x'.repeat(4_000) } }),
    ).expect(200);
  });

  it('includes stories in the export and erases them with the account', async () => {
    const { headers, learnerId } = await signInLearner(app, fakes);
    await http().put('/api/stories/kept').set(headers).send(body()).expect(200);
    const exported = await http().get('/api/me/export').set(headers).expect(200);
    expect(exported.body.stories).toEqual([expect.objectContaining({ id: 'kept', title: 'The split launch', draft })]);

    await http().delete('/api/me').set(headers).expect(204);
    expect(await app.get(StoryStore).list(learnerId)).toEqual([]);
    await expect(app.get(StoryStore).put(learnerId, { ...body(), id: 'late' })).rejects.toMatchObject({ status: 410 });
  });
});

describe('Story diagnostics', () => {
  let app: NestExpressApplication;
  let fakes: OAuthFakes;

  beforeAll(async () => {
    fakes = await OAuthFakes.start();
    const failure = new pg.DatabaseError(secret, 0, 'error');
    failure.code = '23514';
    app = await createTestApp({ ...fakes.env() }, (builder) =>
      fakes
        .customize(builder)
        .overrideProvider(StoryStore)
        .useValue({
          put: async () => {
            throw new DrizzleQueryError('insert into "stories"', [secret], failure);
          },
          list: async () => [],
        }),
    );
  });

  afterAll(async () => {
    await app?.close();
    await fakes?.close();
  });

  afterEach(() => vi.restoreAllMocks());

  it('keeps story text out of error responses and logs', async () => {
    const errorLog = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    const warningLog = vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => undefined);
    const { headers } = await signInLearner(app, fakes);
    const response = await request(app.getHttpServer()).put('/api/stories/private').set(headers).send(body()).expect(500);
    expect(errorLog).toHaveBeenCalledWith(expect.objectContaining({ operation: 'request_failed', category: 'database', code: '23514' }));
    expect(JSON.stringify([response.body, errorLog.mock.calls, warningLog.mock.calls])).not.toContain(secret);
  });
});
