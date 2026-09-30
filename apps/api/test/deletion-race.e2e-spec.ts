import { randomUUID } from 'node:crypto';
import type { NestExpressApplication } from '@nestjs/platform-express';
import type { TestingModuleBuilder } from '@nestjs/testing';
import pg from 'pg';
import request from 'supertest';
import type { InterviewSession } from '../src/interview/interview.types.js';
import { Interviewer, type ReplyResult, type ScoreResult } from '../src/interview/interviewer.js';
import { ErasureStore } from '../src/persistence/erasure.stores.js';
import { InterviewStore, ProgressStore } from '../src/persistence/stores.js';
import { createTestApp } from './support/app.js';
import { resetDatabase } from './support/database.js';
import { freshIp, OAuthFakes } from './support/oauth.js';

const testDatabaseUrl = process.env['TEST_DATABASE_URL'];
const learnerId = '71b2e287-dfe6-43d1-a6fb-4af4cd83477b';
const jwtSecret = 'deletion-race-test-secret-shared-by-both-instances';
const event = (id: string) => ({
  id,
  at: new Date().toISOString(),
  type: 'predict.answered' as const,
  algorithmId: 'binary-search',
  patternId: 'binary-search',
  correct: true,
});
const erasedRows = {
  learners: 0,
  events: 0,
  sessions: 0,
  feedback: 0,
  stories: 0,
  accounts: 0,
  identities: 0,
  refresh_tokens: 0,
  session_families: 0,
  tombstones: 1,
};

class LateReplyInterviewer extends Interviewer {
  readonly mode = 'ai' as const;
  readonly started: Promise<void>;
  private enter!: () => void;
  private finish!: () => void;
  private readonly finished: Promise<void>;

  constructor() {
    super();
    this.started = new Promise((resolve) => (this.enter = resolve));
    this.finished = new Promise((resolve) => (this.finish = resolve));
  }

  async reply(_session: InterviewSession, _onDelta: (text: string) => void, _signal: AbortSignal): Promise<ReplyResult> {
    this.enter();
    await this.finished;
    return { text: 'This answer arrived after deletion.' };
  }

  release() {
    this.finish();
  }

  async score(_session: InterviewSession): Promise<ScoreResult> {
    throw new Error('Scoring is outside this test');
  }
}

describe.runIf(testDatabaseUrl)('Account erasure during a reply across API instances', () => {
  let a: NestExpressApplication;
  let b: NestExpressApplication;
  let fakes: OAuthFakes;
  let database: pg.Client;
  const interviewer = new LateReplyInterviewer();
  const on = (app: NestExpressApplication) => request(app.getHttpServer());

  const boot = (customize: (builder: TestingModuleBuilder) => TestingModuleBuilder = fakes.customize) =>
    createTestApp(
      { DATABASE_URL: testDatabaseUrl, JWT_SECRET: jwtSecret, TRUST_PROXY: '1', AI_DAILY_BUDGET_USD: '5', ...fakes.env() },
      customize,
    );

  const remaining = async (userId: string) => {
    const result = await database.query(
      `select
         (select count(*)::int from learners where id = $1) as learners,
         (select count(*)::int from learning_events where learner_id = $1) as events,
         (select count(*)::int from interview_sessions where learner_id = $1) as sessions,
         (select count(*)::int from feedback where learner_id = $1) as feedback,
         (select count(*)::int from stories where learner_id = $1) as stories,
         (select count(*)::int from users where learner_id = $1 or id = $2 or email = 'deletion-race@example.com') as accounts,
         (select count(*)::int from auth_identities where user_id = $2) as identities,
         (select count(*)::int from refresh_tokens where user_id = $2) as refresh_tokens,
         (select count(*)::int from session_families where user_id = $2) as session_families,
         (select count(*)::int from erased_learners where learner_id = $1) as tombstones`,
      [learnerId, userId],
    );
    return result.rows[0];
  };
  const expectErased = async (userId: string) => expect(await remaining(userId)).toEqual(erasedRows);

  beforeAll(async () => {
    await resetDatabase(testDatabaseUrl!);
    fakes = await OAuthFakes.start();
    database = new pg.Client({ connectionString: testDatabaseUrl });
    await database.connect();
    [a, b] = await Promise.all([boot((builder) => fakes.customize(builder).overrideProvider(Interviewer).useValue(interviewer)), boot()]);
  });

  afterAll(async () => {
    await Promise.all([a?.close(), b?.close(), database?.end(), fakes?.close()]);
  });

  it('erases every row and rejects a late reply, including after restart', async () => {
    const credential = await fakes.googleCredential(() => on(a), { sub: 'deletion-race', email: 'deletion-race@example.com' });
    const account = (
      await on(a).post('/api/auth/google').set('X-Forwarded-For', freshIp()).set('x-learner-id', learnerId).send(credential).expect(200)
    ).body;
    const auth = { Authorization: `Bearer ${account.accessToken}` };

    await on(a)
      .post('/api/progress/events')
      .set(auth)
      .send({ events: [event('deletion-race-event')] })
      .expect(200);
    await on(b)
      .post('/api/feedback')
      .set(auth)
      .send({ kind: 'idea', message: 'Erase this feedback.', rating: null, context: { route: '/', release: null, platform: 'web' } })
      .expect(201);
    await on(b)
      .put('/api/stories/erase-me')
      .set(auth)
      .send({
        title: 'Erase this story',
        competencyIds: ['ownership'],
        draft: { situation: 'A private story.', task: '', action: '', result: '', reflection: '' },
        updatedAt: new Date().toISOString(),
      })
      .expect(200);
    const session = (
      await on(a).post('/api/interview/sessions').set(auth).send({ track: 'coding', problemId: 'warmer-days', mode: 'ai' }).expect(201)
    ).body;
    const beforeFailedErase = await remaining(account.user.id);
    expect(beforeFailedErase).toMatchObject({ learners: 1, events: 1, sessions: 1, feedback: 1, stories: 1, accounts: 1, tombstones: 0 });

    try {
      await database.query('drop trigger if exists fail_erasure_test on users');
      await database.query(
        `create or replace function fail_erasure_test() returns trigger language plpgsql as $$
         begin raise exception 'Forced erasure failure'; end;
         $$`,
      );
      await database.query('create trigger fail_erasure_test before delete on users for each row execute function fail_erasure_test()');
      await on(b).delete('/api/me').set(auth).expect(500);
      expect(await remaining(account.user.id)).toEqual(beforeFailedErase);
    } finally {
      await database.query('drop trigger if exists fail_erasure_test on users');
      await database.query('drop function if exists fail_erasure_test()');
    }

    const pendingReply = on(a)
      .post(`/api/interview/sessions/${session.id}/messages`)
      .set(auth)
      .send({ content: 'A monotonic stack gives linear time.' })
      .timeout({ response: 5_000, deadline: 10_000 })
      .then((response) => response);
    await Promise.race([
      interviewer.started,
      pendingReply.then((response) => {
        throw new Error(`The reply ended before reaching the provider: HTTP ${response.status}`);
      }),
    ]);

    try {
      await on(b).delete('/api/me').set(auth).expect(204);
      await expectErased(account.user.id);
    } finally {
      interviewer.release();
    }

    const reply = await pendingReply;
    expect(reply.status).toBe(410);
    expect(reply.body.code).toBe('learner_erased');
    expect(reply.text).not.toContain('event: done');
    await expectErased(account.user.id);

    await Promise.all([a.close(), b.close()]);
    [a, b] = await Promise.all([boot(), boot()]);
    await on(a).get('/api/auth/me').set(auth).expect(401);
    await on(b).get('/api/auth/me').set(auth).expect(401);
    const staleRead = await on(b).get('/api/progress/events').set('x-learner-id', learnerId).expect(410);
    expect(staleRead.body.code).toBe('learner_erased');
    const staleWrite = await on(a)
      .post('/api/progress/events')
      .set('x-learner-id', learnerId)
      .send({ events: [event('late-device-event')] })
      .expect(410);
    expect(staleWrite.body.code).toBe('learner_erased');
    await expectErased(account.user.id);
  }, 15_000);

  it('lets another device sign in with a fresh learner after deletion', async () => {
    const credential = await fakes.googleCredential(() => on(a), { sub: 'deletion-race', email: 'deletion-race@example.com' });
    const signedIn = (await on(b).post('/api/auth/google').set('x-learner-id', learnerId).send(credential).expect(200)).body;
    expect(signedIn.learnerId).not.toBe(learnerId);
    await expect(a.get(ErasureStore).merge(learnerId, signedIn.learnerId)).rejects.toMatchObject({
      status: 410,
      response: { code: 'learner_erased' },
    });
    const { rows } = await database.query('select count(*)::int as count from learners where id = $1', [learnerId]);
    expect(rows[0].count).toBe(0);
  });

  it('returns conflict when an old guest identifier was already merged into an account', async () => {
    const guest = randomUUID();
    const eventId = randomUUID();
    await on(a)
      .post('/api/progress/events')
      .set('x-learner-id', guest)
      .send({ events: [event(eventId)] })
      .expect(200);
    await on(a)
      .post('/api/feedback')
      .set('x-learner-id', guest)
      .send({ kind: 'idea', message: 'Move this feedback.', rating: null, context: { route: '/', release: null, platform: 'web' } })
      .expect(201);
    const credential = await fakes.googleCredential(() => on(a), { sub: 'deletion-race', email: 'deletion-race@example.com' });
    const signedIn = (await on(a).post('/api/auth/google').set('x-learner-id', guest).send(credential).expect(200)).body;

    await on(b).delete('/api/me').set('x-learner-id', guest).expect(409);
    const { rows } = await database.query(
      `select
        (select count(*)::int from erased_learners where learner_id = $1 and merged_into = $2) as merged,
        (select count(*)::int from learners where id = $1) as source,
        (select count(*)::int from learning_events where learner_id = $2 and payload->>'id' = $3) as events,
        (select count(*)::int from feedback where learner_id = $2 and message = 'Move this feedback.') as feedback`,
      [guest, signedIn.learnerId, eventId],
    );
    expect(rows[0]).toEqual({ merged: 1, source: 0, events: 1, feedback: 1 });

    const staleRead = await on(b).get('/api/progress/events').set('x-learner-id', guest).expect(410);
    expect(staleRead.body.code).toBe('learner_moved');

    const staleProgress = await on(a)
      .post('/api/progress/events')
      .set('x-learner-id', guest)
      .send({ events: [event(randomUUID())] })
      .expect(410);
    const staleInterview = await on(a)
      .post('/api/interview/sessions')
      .set('x-learner-id', guest)
      .send({ track: 'coding', problemId: 'warmer-days' })
      .expect(410);
    const staleFeedback = await on(a)
      .post('/api/feedback')
      .set('x-learner-id', guest)
      .send({ kind: 'idea', message: 'Stale moved feedback.', rating: null, context: { route: '/', release: null, platform: 'web' } })
      .expect(410);
    expect([staleProgress.body.code, staleInterview.body.code, staleFeedback.body.code]).toEqual([
      'learner_moved',
      'learner_moved',
      'learner_moved',
    ]);
    await expect(a.get(ErasureStore).assertActive(guest)).rejects.toMatchObject({
      status: 410,
      response: { code: 'learner_moved' },
    });
  });

  it('serializes erasure and merge across instances without acknowledging escaped data', async () => {
    const guest = randomUUID();
    const eventId = randomUUID();
    const message = `Race ${randomUUID()}`;
    await on(a)
      .post('/api/progress/events')
      .set('x-learner-id', guest)
      .send({ events: [event(eventId)] })
      .expect(200);
    await on(a)
      .post('/api/feedback')
      .set('x-learner-id', guest)
      .send({ kind: 'idea', message, rating: null, context: { route: '/', release: null, platform: 'web' } })
      .expect(201);
    const { rows: accounts } = await database.query('select learner_id from users where email = $1', ['deletion-race@example.com']);
    const into = accounts[0].learner_id as string;

    const [merge, erase] = await Promise.allSettled([a.get(ErasureStore).merge(guest, into), b.get(ErasureStore).erase(guest)]);
    const { rows } = await database.query(
      `select
        (select count(*)::int from learning_events where payload->>'id' = $1) as events,
        (select count(*)::int from feedback where message = $2) as feedback,
        (select merged_into from erased_learners where learner_id = $3) as merged_into`,
      [eventId, message, guest],
    );
    if (erase.status === 'fulfilled') {
      expect(merge.status).toBe('rejected');
      expect(rows[0]).toEqual({ events: 0, feedback: 0, merged_into: null });
    } else {
      expect(merge.status).toBe('fulfilled');
      expect((erase.reason as { status: number }).status).toBe(409);
      expect(rows[0]).toEqual({ events: 1, feedback: 1, merged_into: into });
    }
  });

  it('does not overwrite an interview moved to an account when a stale save arrives', async () => {
    const guest = randomUUID();
    const started = await on(a)
      .post('/api/interview/sessions')
      .set('x-learner-id', guest)
      .send({ track: 'coding', problemId: 'warmer-days' })
      .expect(201);
    const stale = (await a.get(InterviewStore).get(guest, started.body.id))!;
    stale.messages.push({ role: 'interviewer', content: 'Late reply after merge.', at: new Date().toISOString() });
    const { rows: accounts } = await database.query('select learner_id from users where email = $1', ['deletion-race@example.com']);
    const into = accounts[0].learner_id as string;
    const lock = 839271;

    await database.query('select pg_advisory_lock($1)', [lock]);
    await database.query(
      `create function wait_for_interview_merge() returns trigger language plpgsql as $$
       begin perform pg_advisory_xact_lock(${lock}); return new; end;
       $$`,
    );
    await database.query(
      'create trigger wait_for_interview_merge before insert on interview_sessions for each row execute function wait_for_interview_merge()',
    );
    let pendingSave: Promise<{ error: unknown }> | undefined;
    try {
      pendingSave = a
        .get(InterviewStore)
        .save(stale)
        .then(
          () => ({ error: null }),
          (error: unknown) => ({ error }),
        );
      const deadline = Date.now() + 5_000;
      while (Date.now() < deadline) {
        const { rows } = await database.query(
          "select count(*)::int as waiting from pg_locks where locktype = 'advisory' and objid = $1 and not granted",
          [lock],
        );
        if (rows[0].waiting) break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      const { rows } = await database.query(
        "select count(*)::int as waiting from pg_locks where locktype = 'advisory' and objid = $1 and not granted",
        [lock],
      );
      expect(rows[0].waiting).toBe(1);
      await b.get(ErasureStore).merge(guest, into);
    } finally {
      await database.query('select pg_advisory_unlock($1)', [lock]);
      await pendingSave;
      await database.query('drop trigger if exists wait_for_interview_merge on interview_sessions');
      await database.query('drop function if exists wait_for_interview_merge()');
    }

    expect((await pendingSave)!.error).toMatchObject({ status: 410, response: { code: 'learner_moved' } });
    const moved = await b.get(InterviewStore).get(into, started.body.id);
    expect(moved?.learnerId).toBe(into);
    expect(moved?.messages.some((message) => message.content === 'Late reply after merge.')).toBe(false);
  });

  it('turns merged tombstones into erased tombstones when their account is erased', async () => {
    const guest = randomUUID();
    await on(a)
      .post('/api/progress/events')
      .set('x-learner-id', guest)
      .send({ events: [event(randomUUID())] })
      .expect(200);
    const credential = await fakes.googleCredential(() => on(a), { sub: 'deletion-race', email: 'deletion-race@example.com' });
    const signedIn = (await on(a).post('/api/auth/google').send(credential).expect(200)).body;
    await a.get(ErasureStore).merge(guest, signedIn.learnerId);

    await on(b).delete('/api/me').set('Authorization', `Bearer ${signedIn.accessToken}`).expect(204);
    const { rows } = await database.query('select merged_into from erased_learners where learner_id = $1', [guest]);
    expect(rows).toEqual([{ merged_into: null }]);
    await on(b).delete('/api/me').set('x-learner-id', guest).expect(204);
    const staleWrite = await on(a)
      .post('/api/progress/events')
      .set('x-learner-id', guest)
      .send({ events: [event(randomUUID())] })
      .expect(410);
    expect(staleWrite.body.code).toBe('learner_erased');
  });

  it('maps a learner foreign-key failure after erasure to coded 410', async () => {
    const guest = randomUUID();
    await on(a)
      .post('/api/progress/events')
      .set('x-learner-id', guest)
      .send({ events: [event(randomUUID())] })
      .expect(200);
    const lock = 839272;
    await database.query('select pg_advisory_lock($1)', [lock]);
    await database.query(
      `create function wait_for_learner_event() returns trigger language plpgsql as $$
       begin perform pg_advisory_xact_lock(${lock}); return new; end;
       $$`,
    );
    await database.query(
      'create trigger wait_for_learner_event before insert on learning_events for each row execute function wait_for_learner_event()',
    );
    let pendingWrite: Promise<{ error: unknown }> | undefined;
    try {
      pendingWrite = a
        .get(ProgressStore)
        .append(guest, [event(randomUUID())])
        .then(
          () => ({ error: null }),
          (error: unknown) => ({ error }),
        );
      const deadline = Date.now() + 5_000;
      while (Date.now() < deadline) {
        const { rows } = await database.query(
          "select count(*)::int as waiting from pg_locks where locktype = 'advisory' and objid = $1 and not granted",
          [lock],
        );
        if (rows[0].waiting) break;
        await new Promise((resolve) => setTimeout(resolve, 20));
      }
      const { rows } = await database.query(
        "select count(*)::int as waiting from pg_locks where locktype = 'advisory' and objid = $1 and not granted",
        [lock],
      );
      expect(rows[0].waiting).toBe(1);
      await b.get(ErasureStore).erase(guest);
    } finally {
      await database.query('select pg_advisory_unlock($1)', [lock]);
      await pendingWrite;
      await database.query('drop trigger if exists wait_for_learner_event on learning_events');
      await database.query('drop function if exists wait_for_learner_event()');
    }

    expect((await pendingWrite)!.error).toMatchObject({ status: 410, response: { code: 'learner_erased' } });
    const { rows } = await database.query('select count(*)::int as count from learning_events where learner_id = $1', [guest]);
    expect(rows[0].count).toBe(0);
  });
});
