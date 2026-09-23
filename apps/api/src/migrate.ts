import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import { ConfigError, loadConfig } from './config.js';

/** Applies pending Drizzle migrations. Runs as the deploy release step, before new machines take traffic. */
if (existsSync('.env')) process.loadEnvFile('.env');

try {
  const { databaseUrl } = loadConfig();
  if (!databaseUrl) throw new ConfigError('DATABASE_URL is required to run migrations');
  const pool = new pg.Pool({ connectionString: databaseUrl, max: 1 });
  try {
    await migrate(drizzle(pool), { migrationsFolder: fileURLToPath(new URL('../drizzle', import.meta.url)) });
    console.log('Migrations applied.');
  } finally {
    await pool.end();
  }
} catch (err) {
  console.error(err instanceof ConfigError ? err.message : err);
  process.exit(1);
}
