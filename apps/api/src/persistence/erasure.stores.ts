import { ConflictException } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';
import type { MemoryFeedbackStore, MemoryInterviewStore, MemoryProgressStore } from './memory.stores.js';
import { retiredLearner, retirementDestination } from './learner-errors.js';
import type { Db } from './postgres.stores.js';
import * as schema from './schema.js';
import { AuthStore } from './stores.js';

export abstract class ErasureStore {
  abstract retirementDestination(learnerId: string): Promise<string | null | undefined>;
  abstract erase(learnerId: string): Promise<void>;
  abstract merge(from: string, into: string): Promise<void>;

  async isErased(learnerId: string): Promise<boolean> {
    return (await this.retirementDestination(learnerId)) !== undefined;
  }

  async assertActive(learnerId: string): Promise<void> {
    const mergedInto = await this.retirementDestination(learnerId);
    if (mergedInto !== undefined) throw retiredLearner(mergedInto);
  }
}

export class PostgresErasureStore extends ErasureStore {
  constructor(private readonly db: Db) {
    super();
  }

  async retirementDestination(learnerId: string): Promise<string | null | undefined> {
    return retirementDestination(this.db, learnerId);
  }

  async erase(learnerId: string): Promise<void> {
    await this.db.transaction(async (tx) => {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${learnerId}::uuid::text, 0))`);
      const [retirement] = await tx
        .select({ mergedInto: schema.erasedLearners.mergedInto })
        .from(schema.erasedLearners)
        .where(eq(schema.erasedLearners.learnerId, learnerId));
      if (retirement?.mergedInto) throw new ConflictException('Learner data belongs to an account; sign in to delete it');
      if (!retirement) await tx.insert(schema.erasedLearners).values({ learnerId });
      await tx.update(schema.erasedLearners).set({ mergedInto: null }).where(eq(schema.erasedLearners.mergedInto, learnerId));
      await tx.delete(schema.learners).where(eq(schema.learners.id, learnerId));
    });
  }

  async merge(from: string, into: string): Promise<void> {
    if (from === into) return;
    await this.db.transaction(async (tx) => {
      for (const learnerId of [from, into].sort()) {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${learnerId}::uuid::text, 0))`);
      }
      const [retired] = await tx
        .select({ mergedInto: schema.erasedLearners.mergedInto })
        .from(schema.erasedLearners)
        .where(eq(schema.erasedLearners.learnerId, from));
      if (retired) throw retiredLearner(retired.mergedInto);
      const [destination] = await tx.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.learnerId, into));
      if (!destination) throw new ConflictException('Account no longer exists');
      const [owner] = await tx.select({ id: schema.users.id }).from(schema.users).where(eq(schema.users.learnerId, from));
      if (owner) throw new ConflictException('Device progress already belongs to an account');

      await tx.insert(schema.erasedLearners).values({ learnerId: from, mergedInto: into });
      await tx.execute(sql`update feedback set learner_id = ${into}::uuid where learner_id = ${from}::uuid`);
      await tx.execute(sql`
        update interview_sessions
        set learner_id = ${into}::uuid, session = jsonb_set(session, '{learnerId}', to_jsonb(${into}::text))
        where learner_id = ${from}::uuid`);
      await tx.execute(sql`
        insert into learning_events (id, learner_id, type, payload, occurred_at, received_at)
        select ${into}::text || ':' || (payload->>'id'), ${into}::uuid, type, payload, occurred_at, received_at
        from learning_events where learner_id = ${from}::uuid
        on conflict (id) do nothing`);
      await tx.delete(schema.learners).where(eq(schema.learners.id, from));
    });
  }
}

export class MemoryLearnerState {
  private readonly retired = new Map<string, string | null>();
  private previous = Promise.resolve();

  assertActive(learnerId: string): void {
    const mergedInto = this.mergedInto(learnerId);
    if (mergedInto !== undefined) throw retiredLearner(mergedInto);
  }

  mergedInto(learnerId: string): string | null | undefined {
    return this.retired.get(learnerId);
  }

  erase(learnerId: string): void {
    for (const [retired, mergedInto] of this.retired) if (mergedInto === learnerId) this.retired.set(retired, null);
    this.retired.set(learnerId, null);
  }

  merge(from: string, into: string): void {
    this.retired.set(from, into);
  }

  async exclusive<T>(work: () => Promise<T>): Promise<T> {
    const before = this.previous;
    let release!: () => void;
    this.previous = new Promise<void>((resolve) => (release = resolve));
    await before;
    try {
      return await work();
    } finally {
      release();
    }
  }
}

export class MemoryErasureStore extends ErasureStore {
  constructor(
    private readonly state: MemoryLearnerState,
    private readonly progress: MemoryProgressStore,
    private readonly interviews: MemoryInterviewStore,
    private readonly feedback: MemoryFeedbackStore,
    private readonly auth: AuthStore,
  ) {
    super();
  }

  async retirementDestination(learnerId: string): Promise<string | null | undefined> {
    return this.state.mergedInto(learnerId);
  }

  async erase(learnerId: string): Promise<void> {
    await this.state.exclusive(async () => {
      if (this.state.mergedInto(learnerId)) throw new ConflictException('Learner data belongs to an account; sign in to delete it');
      this.state.erase(learnerId);
      await Promise.all([
        this.feedback.deleteLearner(learnerId),
        this.interviews.deleteLearner(learnerId),
        this.auth.deleteByLearner(learnerId),
        this.progress.deleteLearner(learnerId),
      ]);
    });
  }

  async merge(from: string, into: string): Promise<void> {
    if (from === into) return;
    await this.state.exclusive(async () => {
      this.state.assertActive(from);
      this.state.assertActive(into);
      if (!(await this.auth.userByLearner(into))) throw new ConflictException('Account no longer exists');
      if (await this.auth.userByLearner(from)) throw new ConflictException('Device progress already belongs to an account');
      this.state.merge(from, into);
      await this.feedback.moveLearner(from, into);
      await this.interviews.moveLearner(from, into);
      await this.progress.moveLearner(from, into);
    });
  }
}
