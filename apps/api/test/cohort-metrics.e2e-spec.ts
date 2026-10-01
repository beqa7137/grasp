import { randomUUID } from 'node:crypto';
import type { StoredEvent } from '@grasp/engine';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { cohortMetrics, type LearnerEvent } from '../src/admin/cohort-metrics.js';
import type { FeedbackEntry } from '../src/feedback/feedback.types.js';
import type { InterviewSession } from '../src/interview/interview.types.js';
import { PROBLEMS } from '../src/interview/problems.js';
import { MemoryLearnerState } from '../src/persistence/erasure.stores.js';
import { MemoryMetricsStore } from '../src/persistence/memory-metrics.store.js';
import { MemoryFeedbackStore, MemoryInterviewStore, MemoryProgressStore } from '../src/persistence/memory.stores.js';
import { PostgresMetricsStore } from '../src/persistence/postgres-metrics.store.js';
import { PostgresFeedbackStore, PostgresInterviewStore, PostgresProgressStore } from '../src/persistence/postgres.stores.js';
import * as schema from '../src/persistence/schema.js';
import type { FeedbackStore, InterviewStore, ProgressStore } from '../src/persistence/stores.js';
import { resetDatabase } from './support/database.js';

const testDatabaseUrl = process.env['TEST_DATABASE_URL'];
const NOW = new Date('2026-09-20T12:00:00.000Z');
const MINUTE = 60_000;
const DAY = 86_400_000;
// Gaps on and around the session (30 minutes) and recall (1 day) thresholds, plus ordinary ones.
const GAPS = [1, 7_000, 29 * MINUTE, 30 * MINUTE, 30 * MINUTE + 1, 31 * MINUTE, 3 * 3_600_000, DAY - 1, DAY, DAY + 1, 2 * DAY, 9 * DAY];

/** Deterministic, so a failing seed can be replayed. */
function prng(seed: number) {
  let state = seed;
  const next = () => {
    state = (state * 1_103_515_245 + 12_345) % 2_147_483_648;
    return state / 2_147_483_648;
  };
  return { next, int: (n: number) => Math.floor(next() * n), pick: <T>(items: readonly T[]) => items[Math.floor(next() * items.length)] };
}

interface Cohort {
  events: LearnerEvent[];
  sessions: InterviewSession[];
  feedback: FeedbackEntry[];
}

/** A small cohort whose timestamps fall on the thresholds the report depends on, including UTC midnights and future days. */
function cohort(seed: number): Cohort {
  const r = prng(seed);
  const result: Cohort = { events: [], sessions: [], feedback: [] };
  let feedbackClock = NOW.getTime() - 20 * DAY;
  for (let l = 0; l < 30; l++) {
    const learnerId = randomUUID();
    const midnight = Date.UTC(2026, 8, 20) - r.int(45) * DAY;
    let t = r.next() < 0.2 ? midnight : midnight + r.int(DAY);
    const stamp = () => {
      t += r.pick(GAPS);
      return new Date(t).toISOString();
    };
    const items = Array.from({ length: 1 + r.int(4) }, (_, i) => `rec:item${i}`);
    const kind = r.int(4);
    for (let e = 0, count = kind === 0 ? 0 : r.int(60); e < count; e++) {
      const at = stamp();
      const id = `e${seed}-${l}-${e}`;
      const roll = r.int(8);
      const event: StoredEvent =
        roll < 3
          ? {
              id,
              at,
              type: 'review.graded',
              itemId: r.pick(items),
              rating: r.pick([1, 2, 3, 4] as const),
              correct: r.next() < 0.7,
              durationMs: 4000,
            }
          : roll === 3
            ? { id, at, type: 'drill.reviewed', cardId: r.pick(['bs1', 'tp2']), grade: r.pick([0, 1, 2, 3, 4, 5] as const) }
            : roll === 4
              ? { id, at, type: 'predict.answered', algorithmId: 'binary-search', patternId: 'binary-search', correct: r.next() < 0.5 }
              : roll === 5
                ? {
                    id,
                    at,
                    type: 'scenario.completed',
                    scenarioId: 'first-scale-up',
                    monthlyCost: 400,
                    ...(r.next() < 0.4 ? { variant: 1 + r.int(3) } : {}),
                  }
                : roll === 6
                  ? { id, at, type: 'diagnostic.completed', answers: [{ itemId: 'rec:h1', outcome: 'correct', durationMs: 9_000 }] }
                  : { id, at, type: 'code.submitted', problemId: 'two-sum', language: 'python', passed: 1, total: 2 };
      result.events.push({ learnerId, event });
    }
    for (let s = 0, count = kind === 1 ? 0 : r.int(3); s < count; s++) {
      const createdAt = stamp();
      const scored = r.next() < 0.6;
      result.sessions.push({
        id: randomUUID(),
        learnerId,
        track: r.pick(['coding', 'system-design'] as const),
        problem: PROBLEMS[0],
        hintsUsed: r.int(3),
        status: scored ? 'scored' : 'active',
        createdAt,
        messages: Array.from({ length: r.int(6) }, (_, m) => ({
          role: m % 2 ? ('candidate' as const) : ('interviewer' as const),
          content: 'x',
          at: stamp(),
        })),
        ...(scored
          ? {
              scorecard: {
                verdict: r.pick(['hire', 'lean-hire', 'no-hire'] as const),
                summary: '',
                dimensions: [],
                strengths: [],
                improvements: [],
                weakPatterns: [],
                mode: r.pick(['ai', 'offline'] as const),
              },
            }
          : {}),
        ...(r.next() < 0.7
          ? {
              usage: {
                calls: 3,
                inputTokens: r.int(5_000),
                outputTokens: r.int(900),
                cacheReadTokens: r.int(9_000),
                cacheWriteTokens: r.int(700),
                costUsd: r.int(100_000) / 1_000_000,
              },
            }
          : {}),
      });
    }
    for (let f = 0, count = kind === 2 ? 0 : r.int(3); f < count; f++) {
      feedbackClock += 1 + r.int(DAY);
      result.feedback.push({
        id: randomUUID(),
        learnerId,
        kind: r.pick(['bug', 'confusing', 'idea', 'praise'] as const),
        message: `note ${f}`,
        rating: r.next() < 0.6 ? 1 + r.int(5) : null,
        context: { route: '/learn', release: null, platform: 'web' },
        createdAt: new Date(feedbackClock).toISOString(),
      });
    }
  }
  return result;
}

async function load(c: Cohort, stores: { progress: ProgressStore; interviews: InterviewStore; feedback: FeedbackStore }) {
  for (const learnerId of new Set(c.events.map((e) => e.learnerId))) {
    await stores.progress.append(
      learnerId,
      c.events.filter((e) => e.learnerId === learnerId).map((e) => e.event),
    );
  }
  for (const session of c.sessions) await stores.interviews.save(session);
  for (const entry of c.feedback) await stores.feedback.add(entry);
}

describe('Cohort metrics in memory', () => {
  it('match the reference over the same records', async () => {
    const c = cohort(7);
    const state = new MemoryLearnerState();
    const progress = new MemoryProgressStore(state);
    const interviews = new MemoryInterviewStore(state, progress);
    const feedback = new MemoryFeedbackStore(state);
    await load(c, { progress, interviews, feedback });
    expect(await new MemoryMetricsStore(progress, interviews, feedback).cohort(NOW)).toEqual(
      cohortMetrics(c.events, c.sessions, c.feedback, NOW),
    );
  });
});

describe.runIf(testDatabaseUrl)('Cohort metrics in Postgres', () => {
  const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 4 });
  const db = drizzle(pool, { schema });
  const stores = {
    progress: new PostgresProgressStore(db),
    interviews: new PostgresInterviewStore(db),
    feedback: new PostgresFeedbackStore(db),
  };

  afterAll(async () => {
    await pool.end();
  });

  it.each([1, 2, 3, 4])('aggregate in SQL to exactly the reference result (seed %i)', async (seed) => {
    await resetDatabase(testDatabaseUrl!);
    const c = cohort(seed);
    await load(c, stores);
    const report = await new PostgresMetricsStore(pool).cohort(NOW);
    expect(report).toEqual(cohortMetrics(c.events, c.sessions, c.feedback, NOW));
    expect(report.learners.total).toBeGreaterThan(20);
    expect(report.reviews.recallAfterADay.of).toBeGreaterThan(0);
  });

  it('splits sessions only on gaps over 30 minutes, across bins and midnights', async () => {
    await resetDatabase(testDatabaseUrl!);
    const learner = (times: string[]) => {
      const learnerId = randomUUID();
      return times.map((at, i): LearnerEvent => ({
        learnerId,
        event: { id: `edge-${i}`, at, type: 'predict.answered', algorithmId: 'binary-search', patternId: 'binary-search', correct: true },
      }));
    };
    const events = [
      ...learner(['2026-09-19T10:00:00.000Z', '2026-09-19T10:30:00.000Z', '2026-09-19T11:00:00.000Z']),
      ...learner(['2026-09-19T10:00:00.000Z', '2026-09-19T10:30:00.001Z']),
      ...learner(['2026-09-18T23:50:00.000Z', '2026-09-19T00:10:00.000Z']),
      ...learner(['2026-09-19T10:29:59.999Z', '2026-09-19T10:30:00.000Z', '2026-09-19T10:59:59.999Z']),
    ];
    await load({ events, sessions: [], feedback: [] }, stores);
    const report = await new PostgresMetricsStore(pool).cohort(NOW);
    expect(report).toEqual(cohortMetrics(events, [], [], NOW));
    // Sessions of 60, 0, 0, 20 and 30 minutes.
    expect(report.engagement.medianSessionMinutes).toBe(20);
  });

  it('reports an empty cohort like the reference', async () => {
    await resetDatabase(testDatabaseUrl!);
    expect(await new PostgresMetricsStore(pool).cohort(NOW)).toEqual(cohortMetrics([], [], [], NOW));
  });

  it('discards its connection after a failed query and works again on the next', async () => {
    await pool.query('alter table feedback rename to feedback_hidden');
    try {
      await expect(new PostgresMetricsStore(pool).cohort(NOW)).rejects.toThrow();
    } finally {
      await pool.query('alter table feedback_hidden rename to feedback');
    }
    expect(pool.totalCount).toBe(pool.idleCount);
    expect(await new PostgresMetricsStore(pool).cohort(NOW)).toEqual(cohortMetrics([], [], [], NOW));
  });
});
