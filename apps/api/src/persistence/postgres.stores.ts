import { Injectable } from '@nestjs/common';
import type { StoredEvent } from '@grasp/engine';
import { and, desc, eq, gte, isNull, lt, sql } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { LearnerEvent } from '../admin/cohort-metrics.js';
import type { LoginCode, RefreshTokenRecord, User } from '../auth/auth.types.js';
import type { FeedbackContext, FeedbackEntry, FeedbackKind } from '../feedback/feedback.types.js';
import type { InterviewSession } from '../interview/interview.types.js';
import * as schema from './schema.js';
import { AuthStore, FeedbackStore, InterviewStore, ProgressStore, type AppendResult } from './stores.js';

export type Db = NodePgDatabase<typeof schema>;

async function ensureLearner(db: Db, learnerId: string) {
  await db.insert(schema.learners).values({ id: learnerId }).onConflictDoNothing();
}

@Injectable()
export class PostgresProgressStore extends ProgressStore {
  constructor(private readonly db: Db) {
    super();
  }

  async append(learnerId: string, events: StoredEvent[]): Promise<AppendResult> {
    if (events.length === 0) return { accepted: 0, duplicates: 0 };
    await ensureLearner(this.db, learnerId);
    const inserted = await this.db
      .insert(schema.learningEvents)
      .values(events.map((e) => ({ id: `${learnerId}:${e.id}`, learnerId, type: e.type, payload: e, occurredAt: e.at })))
      .onConflictDoNothing()
      .returning({ id: schema.learningEvents.id });
    return { accepted: inserted.length, duplicates: events.length - inserted.length };
  }

  async list(learnerId: string): Promise<StoredEvent[]> {
    const rows = await this.db
      .select({ payload: schema.learningEvents.payload })
      .from(schema.learningEvents)
      .where(eq(schema.learningEvents.learnerId, learnerId))
      .orderBy(schema.learningEvents.occurredAt);
    return rows.map((r) => r.payload as StoredEvent);
  }

  async all(): Promise<LearnerEvent[]> {
    const rows = await this.db
      .select({ learnerId: schema.learningEvents.learnerId, payload: schema.learningEvents.payload })
      .from(schema.learningEvents)
      .orderBy(schema.learningEvents.occurredAt);
    return rows.map((r) => ({ learnerId: r.learnerId, event: r.payload as StoredEvent }));
  }

  /** Removes the learner row; events, interviews, feedback and any account go with it through ON DELETE CASCADE. */
  async deleteLearner(learnerId: string): Promise<void> {
    await this.db.delete(schema.learners).where(eq(schema.learners.id, learnerId));
  }

  async moveLearner(from: string, to: string): Promise<void> {
    await ensureLearner(this.db, to);
    await this.db.execute(sql`
      insert into learning_events (id, learner_id, type, payload, occurred_at, received_at)
      select ${to}::text || ':' || (payload->>'id'), ${to}::uuid, type, payload, occurred_at, received_at
      from learning_events where learner_id = ${from}::uuid
      on conflict (id) do nothing`);
    await this.db.delete(schema.learningEvents).where(eq(schema.learningEvents.learnerId, from));
  }
}

@Injectable()
export class PostgresInterviewStore extends InterviewStore {
  constructor(private readonly db: Db) {
    super();
  }

  async save(session: InterviewSession): Promise<void> {
    await ensureLearner(this.db, session.learnerId);
    const row = {
      id: session.id,
      learnerId: session.learnerId,
      track: session.track,
      problemId: session.problem.id,
      status: session.status,
      session,
      createdAt: session.createdAt,
    };
    await this.db
      .insert(schema.interviewSessions)
      .values(row)
      .onConflictDoUpdate({ target: schema.interviewSessions.id, set: { status: row.status, session, updatedAt: new Date() } });
  }

  async get(learnerId: string, id: string): Promise<InterviewSession | null> {
    const [row] = await this.db
      .select({ session: schema.interviewSessions.session })
      .from(schema.interviewSessions)
      .where(and(eq(schema.interviewSessions.id, id), eq(schema.interviewSessions.learnerId, learnerId)));
    return (row?.session as InterviewSession) ?? null;
  }

  async recent(learnerId: string, limit: number): Promise<InterviewSession[]> {
    const rows = await this.db
      .select({ session: schema.interviewSessions.session })
      .from(schema.interviewSessions)
      .where(eq(schema.interviewSessions.learnerId, learnerId))
      .orderBy(desc(schema.interviewSessions.createdAt))
      .limit(limit);
    return rows.map((r) => r.session as InterviewSession);
  }

  async all(): Promise<InterviewSession[]> {
    const rows = await this.db.select({ session: schema.interviewSessions.session }).from(schema.interviewSessions);
    return rows.map((r) => r.session as InterviewSession);
  }

  async deleteLearner(learnerId: string): Promise<void> {
    await this.db.delete(schema.interviewSessions).where(eq(schema.interviewSessions.learnerId, learnerId));
  }

  async moveLearner(from: string, to: string): Promise<void> {
    await ensureLearner(this.db, to);
    await this.db.execute(sql`
      update interview_sessions
      set learner_id = ${to}::uuid, session = jsonb_set(session, '{learnerId}', to_jsonb(${to}::text))
      where learner_id = ${from}::uuid`);
  }
}

@Injectable()
export class PostgresFeedbackStore extends FeedbackStore {
  constructor(private readonly db: Db) {
    super();
  }

  async add(entry: FeedbackEntry): Promise<void> {
    await ensureLearner(this.db, entry.learnerId);
    await this.db.insert(schema.feedback).values(entry);
  }

  async list(learnerId: string): Promise<FeedbackEntry[]> {
    const rows = await this.db
      .select()
      .from(schema.feedback)
      .where(eq(schema.feedback.learnerId, learnerId))
      .orderBy(schema.feedback.createdAt);
    return rows.map(toEntry);
  }

  async all(): Promise<FeedbackEntry[]> {
    return (await this.db.select().from(schema.feedback).orderBy(schema.feedback.createdAt)).map(toEntry);
  }

  async deleteLearner(learnerId: string): Promise<void> {
    await this.db.delete(schema.feedback).where(eq(schema.feedback.learnerId, learnerId));
  }

  async moveLearner(from: string, to: string): Promise<void> {
    await ensureLearner(this.db, to);
    await this.db.update(schema.feedback).set({ learnerId: to }).where(eq(schema.feedback.learnerId, from));
  }
}

const iso = (value: string | null) => (value === null ? null : new Date(value).toISOString());

@Injectable()
export class PostgresAuthStore extends AuthStore {
  constructor(private readonly db: Db) {
    super();
  }

  async addCode(code: LoginCode): Promise<void> {
    await this.db.delete(schema.loginCodes).where(lt(schema.loginCodes.expiresAt, new Date(Date.now() - 86_400_000).toISOString()));
    await this.db.insert(schema.loginCodes).values(code);
  }

  async countCodesSince(email: string, since: string): Promise<number> {
    const [row] = await this.db
      .select({ n: sql<number>`count(*)::int` })
      .from(schema.loginCodes)
      .where(and(eq(schema.loginCodes.email, email), gte(schema.loginCodes.createdAt, since)));
    return row?.n ?? 0;
  }

  async latestCode(email: string): Promise<LoginCode | null> {
    const [row] = await this.db
      .select()
      .from(schema.loginCodes)
      .where(and(eq(schema.loginCodes.email, email), isNull(schema.loginCodes.consumedAt)))
      .orderBy(desc(schema.loginCodes.createdAt))
      .limit(1);
    return row ? { ...row, expiresAt: iso(row.expiresAt)!, consumedAt: iso(row.consumedAt), createdAt: iso(row.createdAt)! } : null;
  }

  async updateCode(id: string, patch: Partial<Pick<LoginCode, 'attempts' | 'consumedAt'>>): Promise<void> {
    await this.db.update(schema.loginCodes).set(patch).where(eq(schema.loginCodes.id, id));
  }

  async userByEmail(email: string): Promise<User | null> {
    return this.oneUser(eq(schema.users.email, email));
  }

  async userById(id: string): Promise<User | null> {
    return this.oneUser(eq(schema.users.id, id));
  }

  async userByLearner(learnerId: string): Promise<User | null> {
    return this.oneUser(eq(schema.users.learnerId, learnerId));
  }

  async createUser(user: User): Promise<void> {
    await ensureLearner(this.db, user.learnerId);
    await this.db.insert(schema.users).values(user);
  }

  async touchLogin(userId: string, at: string): Promise<void> {
    await this.db.update(schema.users).set({ lastLoginAt: at }).where(eq(schema.users.id, userId));
  }

  async deleteByLearner(learnerId: string): Promise<void> {
    await this.db.delete(schema.users).where(eq(schema.users.learnerId, learnerId));
  }

  async addRefreshToken(token: RefreshTokenRecord): Promise<void> {
    await this.db.insert(schema.refreshTokens).values(token);
  }

  async refreshTokenByHash(tokenHash: string): Promise<RefreshTokenRecord | null> {
    const [row] = await this.db.select().from(schema.refreshTokens).where(eq(schema.refreshTokens.tokenHash, tokenHash));
    return row
      ? {
          ...row,
          expiresAt: iso(row.expiresAt)!,
          rotatedAt: iso(row.rotatedAt),
          revokedAt: iso(row.revokedAt),
          createdAt: iso(row.createdAt)!,
        }
      : null;
  }

  async markRotated(id: string, at: string): Promise<void> {
    await this.db
      .update(schema.refreshTokens)
      .set({ rotatedAt: at })
      .where(and(eq(schema.refreshTokens.id, id), isNull(schema.refreshTokens.rotatedAt)));
  }

  async revokeFamily(familyId: string, at: string): Promise<void> {
    await this.db
      .update(schema.refreshTokens)
      .set({ revokedAt: at })
      .where(and(eq(schema.refreshTokens.familyId, familyId), isNull(schema.refreshTokens.revokedAt)));
  }

  private async oneUser(where: ReturnType<typeof eq>): Promise<User | null> {
    const [row] = await this.db.select().from(schema.users).where(where);
    return row ? { ...row, createdAt: iso(row.createdAt)!, lastLoginAt: iso(row.lastLoginAt) } : null;
  }
}

function toEntry(row: typeof schema.feedback.$inferSelect): FeedbackEntry {
  return {
    ...row,
    kind: row.kind as FeedbackKind,
    context: row.context as FeedbackContext,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}
