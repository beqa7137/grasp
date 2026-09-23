import { Injectable } from '@nestjs/common';
import type { StoredEvent } from '@grasp/engine';
import { and, desc, eq } from 'drizzle-orm';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { InterviewSession } from '../interview/interview.types.js';
import * as schema from './schema.js';
import { InterviewStore, ProgressStore, type AppendResult } from './stores.js';

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
}
