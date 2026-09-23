import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { z } from 'zod';

/** Applies pending Drizzle migrations. Runs as the deploy release step, before new machines take traffic. */
if (existsSync('.env')) process.loadEnvFile('.env');

// Only the database is needed here, so a release step can run without the app's other secrets.
const databaseUrl = z.url({ protocol: /^postgres(ql)?$/ }).safeParse(process.env['DATABASE_URL']);
if (!databaseUrl.success) {
  console.error('DATABASE_URL must be set to a postgres:// URL to run migrations');
  process.exit(1);
}

try {
  const pool = new pg.Pool({ connectionString: databaseUrl.data, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
    console.log('Migrations applied.');
  } finally {
    await pool.end();
  }
} catch (err) {
  console.error(err);
  process.exit(1);
}
