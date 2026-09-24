import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import pg from 'pg';

const migrationsFolder = new URL('../../drizzle', import.meta.url).pathname;

/** Applies migrations without touching data, for suites that isolate themselves by key. */
export async function migrateDatabase(url: string): Promise<void> {
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder });
  } finally {
    await pool.end();
  }
}

/** Applies migrations and empties every table so each suite starts from a clean database. */
export async function resetDatabase(url: string): Promise<void> {
  const pool = new pg.Pool({ connectionString: url, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder });
    const { rows } = await pool.query<{ tablename: string }>("select tablename from pg_tables where schemaname = 'public'");
    if (rows.length) await pool.query(`truncate ${rows.map((r) => `"${r.tablename}"`).join(', ')} restart identity cascade`);
  } finally {
    await pool.end();
  }
}
