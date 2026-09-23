import { Injectable } from '@nestjs/common';
import type { StoredEvent } from '@grasp/engine';
import { and, desc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { LearnerEvent } from '../admin/cohort-metrics.js';
import type { FeedbackContext, FeedbackEntry, FeedbackKind } from '../feedback/feedback.types.js';
import type { InterviewSession } from '../interview/interview.types.js';
import * as schema from './schema.js';
import { FeedbackStore, InterviewStore, ProgressStore, type AppendResult } from './stores.js';

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

  /** Removes the learner row; events, interviews and feedback go with it through ON DELETE CASCADE. */
  async deleteLearner(learnerId: string): Promise<void> {
    await this.db.delete(schema.learners).where(eq(schema.learners.id, learnerId));
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
}

function toEntry(row: typeof schema.feedback.$inferSelect): FeedbackEntry {
  return {
    ...row,
    kind: row.kind as FeedbackKind,
    context: row.context as FeedbackContext,
    createdAt: new Date(row.createdAt).toISOString(),
  };
}
