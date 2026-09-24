import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { coordinationContract } from '../src/persistence/coordination.contract.js';
import { PostgresCoordinationStore } from '../src/persistence/postgres.stores.js';
import * as schema from '../src/persistence/schema.js';
import { migrateDatabase } from './support/database.js';

const testDatabaseUrl = process.env['TEST_DATABASE_URL'];

describe.runIf(testDatabaseUrl)('Postgres coordination', () => {
  // Several connections, so concurrent calls really race inside Postgres rather than queue on one socket.
  const pool = new pg.Pool({ connectionString: testDatabaseUrl, max: 8 });
  const db = drizzle(pool, { schema });

  beforeAll(async () => {
    await migrateDatabase(testDatabaseUrl!);
  });
  afterAll(async () => {
    await pool.end();
  });

  coordinationContract('Postgres', () => new PostgresCoordinationStore(db));
});
