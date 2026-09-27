import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import type { InterviewSession } from '../src/interview/interview.types.js';
import { PROBLEMS } from '../src/interview/problems.js';
import { PostgresErasureStore } from '../src/persistence/erasure.stores.js';
import { PostgresAuthStore, PostgresInterviewStore, PostgresProgressStore, type Db } from '../src/persistence/postgres.stores.js';
import * as schema from '../src/persistence/schema.js';
import { resetDatabase } from './support/database.js';

const databaseUrl = process.env['TEST_DATABASE_URL'];
const makeSession = (): InterviewSession => ({
  id: randomUUID(),
  learnerId: randomUUID(),
  track: 'coding',
  problem: structuredClone(PROBLEMS[0]!),
  messages: [{ role: 'candidate', content: 'Keep unresolved indices in a monotonic stack.', at: '2026-09-27T12:00:00.000Z' }],
  hintsUsed: 0,
  status: 'active',
  createdAt: '2026-09-27T12:00:00.000Z',
  mode: 'offline',
});
const scored = (session: InterviewSession): InterviewSession => ({
  ...structuredClone(session),
  status: 'scored',
  scoredAt: '2026-09-27T12:01:00.000Z',
  scorecard: {
    verdict: 'hire',
    summary: 'Explained a correct linear-time stack solution.',
    dimensions: [{ name: 'Correctness', score: 4, evidence: 'Each index is pushed and popped once.' }],
    strengths: ['Maintained the stack invariant.'],
    improvements: ['Discuss equal temperatures.'],
    weakPatterns: ['monotonic-stack'],
    mode: 'offline',
  },
});
const outcome = <T>(promise: Promise<T>) =>
  promise.then(
    (value) => ({ value }),
    (error: unknown) => ({ error }),
  );

describe('Postgres score transaction connection failures', () => {
  it.each(['ECONNREFUSED', 'ECONNRESET', '57P01'])('sanitizes direct transaction failure %s', async (code) => {
    const failure = Object.assign(new Error('private database connection detail'), { code });
    const store = new PostgresInterviewStore({ transaction: () => Promise.reject(failure) } as unknown as Db);
    await expect(store.completeScore(scored(makeSession()))).rejects.toMatchObject({
      status: 503,
      response: { status: 'unavailable', database: 'unreachable' },
    });
  });

  it('preserves unexpected transaction failures', async () => {
    const failure = new Error('unexpected transaction failure');
    const store = new PostgresInterviewStore({ transaction: () => Promise.reject(failure) } as unknown as Db);
    await expect(store.completeScore(scored(makeSession()))).rejects.toBe(failure);
  });
});

describe.runIf(databaseUrl)('Postgres atomic interview score persistence', () => {
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 6, options: '-c statement_timeout=5000' });
  const otherPool = new pg.Pool({ connectionString: databaseUrl, max: 3, options: '-c statement_timeout=5000' });
  const database = drizzle(pool, { schema });
  const otherDatabase = drizzle(otherPool, { schema });
  const interviews = new PostgresInterviewStore(database);
  const otherInterviews = new PostgresInterviewStore(otherDatabase);
  const progress = new PostgresProgressStore(otherDatabase);
  const erasure = new PostgresErasureStore(otherDatabase);
  let blocker: pg.PoolClient;

  beforeAll(async () => {
    await resetDatabase(databaseUrl!);
    blocker = await pool.connect();
  });

  afterAll(async () => {
    blocker?.release();
    await Promise.all([pool.end(), otherPool.end()]);
  });

  const waitForLock = async (key: number | string) => {
    const expected =
      typeof key === 'number'
        ? BigInt(key)
        : (await pool.query<{ key: string }>('select hashtextextended($1::uuid::text, 0)::text as key', [key])).rows[0]!.key;
    const deadline = Date.now() + 3_000;
    do {
      const { rows } = await pool.query<{ waiting: number }>(
        `select count(*)::int as waiting from pg_locks
         where locktype = 'advisory' and not granted and objsubid = 1
           and classid::bigint = (($1::bigint >> 32) & 4294967295)
           and objid::bigint = ($1::bigint & 4294967295)`,
        [expected],
      );
      if (rows[0]!.waiting > 0) return;
      await new Promise((resolve) => setTimeout(resolve, 10));
    } while (Date.now() < deadline);
    throw new Error('Expected transaction did not reach its advisory lock');
  };

  const account = async () => {
    const learnerId = randomUUID();
    const created = await new PostgresAuthStore(otherDatabase).createUser({
      id: randomUUID(),
      email: `${randomUUID()}@score-test.example`,
      learnerId,
      createdAt: new Date().toISOString(),
      lastLoginAt: null,
    });
    expect(created).toBe(true);
    return learnerId;
  };

  const expectPair = async (candidate: InterviewSession, learnerId = candidate.learnerId) => {
    const session = await otherInterviews.get(learnerId, candidate.id);
    expect(session).toEqual({ ...candidate, learnerId });
    expect(await progress.list(learnerId)).toEqual([
      {
        id: `interview-${candidate.id}`,
        at: candidate.scoredAt,
        type: 'interview.scored',
        sessionId: candidate.id,
        track: candidate.track,
        verdict: candidate.scorecard!.verdict,
        weakPatterns: candidate.scorecard!.weakPatterns,
      },
    ]);
  };

  it.each(['score update', 'event insert'] as const)('rolls back both records when the %s fails in SQL', async (stage) => {
    const session = makeSession();
    await interviews.save(session);
    const candidate = scored(session);
    const table = stage === 'score update' ? 'interview_sessions' : 'learning_events';
    const operation = stage === 'score update' ? 'update' : 'insert';
    await pool.query(`
      create function fail_atomic_score_test() returns trigger language plpgsql as $$
      begin
        ${stage === 'event insert' ? `if not exists (select 1 from interview_sessions where id = '${session.id}' and status = 'scored') then raise exception 'Score update was not reached'; end if;` : ''}
        raise exception 'Injected atomic score failure';
      end $$;
      create trigger fail_atomic_score_test before ${operation} on ${table}
      for each row execute function fail_atomic_score_test()`);
    try {
      await expect(interviews.completeScore(candidate)).rejects.toMatchObject({ cause: { message: 'Injected atomic score failure' } });
      expect(await otherInterviews.get(session.learnerId, session.id)).toEqual(session);
      expect(await progress.list(session.learnerId)).toEqual([]);
    } finally {
      await pool.query(`drop trigger if exists fail_atomic_score_test on ${table}; drop function if exists fail_atomic_score_test()`);
    }
    await otherInterviews.completeScore(candidate);
    await expectPair(candidate);
  });

  it('keeps the committed pair when its transaction acknowledgment is lost', async () => {
    const session = makeSession();
    await interviews.save(session);
    const candidate = scored(session);
    const ambiguous = new PostgresInterviewStore({
      transaction: async (run: Parameters<Db['transaction']>[0]) => {
        await database.transaction(run);
        throw Object.assign(new Error('lost commit acknowledgment'), { code: 'ECONNRESET' });
      },
    } as unknown as Db);
    await expect(ambiguous.completeScore(candidate)).rejects.toMatchObject({ status: 503 });
    await expectPair(candidate);
    const retry = scored(session);
    retry.scorecard!.verdict = 'no-hire';
    expect(await otherInterviews.completeScore(retry)).toEqual(candidate);
    await expectPair(candidate);
  });

  it('acquires the learner lock before the interview row and rejects a newer saved transcript', async () => {
    const session = makeSession();
    await interviews.save(session);
    await blocker.query('select pg_advisory_lock(hashtextextended($1::uuid::text, 0))', [session.learnerId]);
    const pending = outcome(interviews.completeScore(scored(session)));
    const newer = structuredClone(session);
    newer.messages.push({ role: 'candidate', content: 'Equal temperatures must stay on the stack.', at: '2026-09-27T12:00:30.000Z' });
    try {
      await waitForLock(session.learnerId);
      await otherInterviews.save(newer);
    } finally {
      await blocker.query('select pg_advisory_unlock(hashtextextended($1::uuid::text, 0))', [session.learnerId]);
    }
    expect(await pending).toMatchObject({ error: { status: 409 } });
    expect(await otherInterviews.get(session.learnerId, session.id)).toEqual(newer);
    expect(await progress.list(session.learnerId)).toEqual([]);
  });

  it.each(['erase', 'merge'] as const)('publishes one complete pair before a waiting %s transaction', async (operation) => {
    const session = makeSession();
    await interviews.save(session);
    const candidate = scored(session);
    const into = operation === 'merge' ? await account() : null;
    const lock = 939251;
    await blocker.query('select pg_advisory_lock($1)', [lock]);
    await pool.query(`
      create function pause_atomic_score_test() returns trigger language plpgsql as $$
      begin perform pg_advisory_xact_lock(${lock}); return new; end $$;
      create trigger pause_atomic_score_test before insert on learning_events
      for each row execute function pause_atomic_score_test()`);
    const pendingScore = outcome(interviews.completeScore(candidate));
    let pendingRetirement: ReturnType<typeof outcome<void>> | undefined;
    try {
      await waitForLock(lock);
      expect(await otherInterviews.get(session.learnerId, session.id)).toEqual(session);
      expect(await progress.list(session.learnerId)).toEqual([]);
      pendingRetirement = outcome(into ? erasure.merge(session.learnerId, into) : erasure.erase(session.learnerId));
      await waitForLock(session.learnerId);
    } finally {
      await blocker.query('select pg_advisory_unlock($1)', [lock]);
      await Promise.all([pendingScore, pendingRetirement]);
      await pool.query(
        'drop trigger if exists pause_atomic_score_test on learning_events; drop function if exists pause_atomic_score_test()',
      );
    }
    expect(await pendingScore).toEqual({ value: candidate });
    expect(await pendingRetirement).toEqual({ value: undefined });
    expect(await interviews.get(session.learnerId, session.id)).toBeNull();
    expect(await progress.list(session.learnerId)).toEqual([]);
    if (into) await expectPair(candidate, into);
    else expect((await pool.query("select id from learning_events where payload->>'sessionId' = $1", [session.id])).rows).toEqual([]);
  });

  it.each(['erase', 'merge'] as const)('rejects completion after a waiting %s transaction retires its learner', async (operation) => {
    const session = makeSession();
    await interviews.save(session);
    const into = operation === 'merge' ? await account() : null;
    const lock = 939252;
    await blocker.query('select pg_advisory_lock($1)', [lock]);
    await pool.query(`
      create function pause_atomic_retirement_test() returns trigger language plpgsql as $$
      begin perform pg_advisory_xact_lock(${lock}); return old; end $$;
      create trigger pause_atomic_retirement_test before delete on learners
      for each row execute function pause_atomic_retirement_test()`);
    const pendingRetirement = outcome(into ? erasure.merge(session.learnerId, into) : erasure.erase(session.learnerId));
    let pendingScore: ReturnType<typeof outcome<InterviewSession>> | undefined;
    try {
      await waitForLock(lock);
      pendingScore = outcome(interviews.completeScore(scored(session)));
      await waitForLock(session.learnerId);
    } finally {
      await blocker.query('select pg_advisory_unlock($1)', [lock]);
      await Promise.all([pendingRetirement, pendingScore]);
      await pool.query(
        'drop trigger if exists pause_atomic_retirement_test on learners; drop function if exists pause_atomic_retirement_test()',
      );
    }
    expect(await pendingRetirement).toEqual({ value: undefined });
    expect(await pendingScore).toMatchObject({ error: { status: 410, response: { code: into ? 'learner_moved' : 'learner_erased' } } });
    expect(await interviews.get(session.learnerId, session.id)).toBeNull();
    expect(await progress.list(session.learnerId)).toEqual([]);
    if (into) {
      expect(await interviews.get(into, session.id)).toEqual({ ...session, learnerId: into });
      expect(await progress.list(into)).toEqual([]);
    }
  });
});
