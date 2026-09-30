import { isNewer, STORY_LIMITS, type Rehearsal, type StarDraft, type Story } from '@grasp/engine';
import { and, asc, count, desc, eq, notInArray, sql } from 'drizzle-orm';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import { databaseUnavailable, safeDatabaseErrorCategory } from './database-errors.js';
import { rethrowLearnerWriteError, type Db } from './postgres.stores.js';
import * as schema from './schema.js';
import { MAX_TOMBSTONES, StoryStore, storedAt, storyLimitReached } from './story.store.js';

function toStory(row: typeof schema.stories.$inferSelect): Story {
  return {
    id: row.id,
    title: row.title,
    competencyIds: row.competencyIds,
    draft: row.draft as StarDraft,
    ...(row.rehearsal ? { rehearsal: row.rehearsal as Rehearsal } : {}),
    updatedAt: row.updatedAt.toISOString(),
    ...(row.deleted ? { deleted: true as const } : {}),
  };
}

export class PostgresStoryStore extends StoryStore {
  constructor(private readonly db: Db) {
    super();
  }

  async list(learnerId: string): Promise<Story[]> {
    const rows = await this.db
      .select()
      .from(schema.stories)
      .where(eq(schema.stories.learnerId, learnerId))
      .orderBy(asc(schema.stories.updatedAt));
    return rows.map(toStory);
  }

  /** Holds the learner's erasure lock, so concurrent writes stay within the limit and none can outlive erasure. */
  async put(learnerId: string, story: Story, now = new Date()): Promise<Story> {
    const mine = eq(schema.stories.learnerId, learnerId);
    try {
      return await this.db.transaction(async (tx) => {
        await tx.execute(sql`select pg_advisory_xact_lock(hashtextextended(${learnerId}::uuid::text, 0))`);
        const [row] = await tx
          .select()
          .from(schema.stories)
          .where(and(mine, eq(schema.stories.id, story.id)));
        const stored = row && toStory(row);
        if (stored && !isNewer(story, stored)) return stored;
        if (story.deleted && !stored) return storedAt(story, undefined, now);
        if (!story.deleted && (!stored || stored.deleted)) {
          const [live] = await tx
            .select({ n: count() })
            .from(schema.stories)
            .where(and(mine, eq(schema.stories.deleted, false)));
          if (live!.n >= STORY_LIMITS.stories) throw storyLimitReached();
        }
        const saved = storedAt(story, stored, now);
        const values = {
          title: story.title,
          competencyIds: story.competencyIds,
          draft: story.draft,
          rehearsal: story.rehearsal ?? null,
          deleted: story.deleted ?? false,
          updatedAt: new Date(saved.updatedAt),
        };
        await tx
          .insert(schema.stories)
          .values({ learnerId, id: story.id, ...values })
          .onConflictDoUpdate({ target: [schema.stories.learnerId, schema.stories.id], set: values });
        if (story.deleted) {
          const kept = tx
            .select({ id: schema.stories.id })
            .from(schema.stories)
            .where(and(mine, eq(schema.stories.deleted, true)))
            .orderBy(desc(schema.stories.updatedAt))
            .limit(MAX_TOMBSTONES);
          await tx.delete(schema.stories).where(and(mine, eq(schema.stories.deleted, true), notInArray(schema.stories.id, kept)));
        }
        return saved;
      });
    } catch (error) {
      if (!(error instanceof DrizzleQueryError) && safeDatabaseErrorCategory(error) !== 'unknown') throw databaseUnavailable();
      return rethrowLearnerWriteError(this.db, learnerId, error);
    }
  }

  async deleteLearner(learnerId: string): Promise<void> {
    await this.db.delete(schema.stories).where(eq(schema.stories.learnerId, learnerId));
  }
}
