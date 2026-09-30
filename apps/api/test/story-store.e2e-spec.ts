import { randomUUID } from 'node:crypto';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { PostgresErasureStore } from '../src/persistence/erasure.stores.js';
import { PostgresStoryStore } from '../src/persistence/postgres-story.store.js';
import * as schema from '../src/persistence/schema.js';
import { storyStoreContract } from '../src/persistence/story-store.contract.js';
import { migrateDatabase } from './support/database.js';

const testDatabaseUrl = process.env['TEST_DATABASE_URL'];

describe.runIf(testDatabaseUrl)('Postgres stories', () => {
  // Several connections, so concurrent calls really race inside Postgres rather than queue on one socket.
  const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 8 });
  const db = drizzle(pool, { schema });

  beforeAll(async () => {
    await migrateDatabase(testDatabaseUrl!);
  });
  afterAll(async () => {
    await pool.end();
  });

  storyStoreContract('Postgres', () => ({
    store: new PostgresStoryStore(db),
    learner: async () => {
      const id = randomUUID();
      await db.insert(schema.learners).values({ id });
      return id;
    },
    erase: (learnerId) => new PostgresErasureStore(db).erase(learnerId),
  }));
});
