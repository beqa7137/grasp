import { Logger } from '@nestjs/common';
import pg from 'pg';
import { safeDatabaseErrorCode } from './database-errors.js';

const CONNECT_TIMEOUT_MS = 4_000;
const QUERY_TIMEOUT_MS = 3_000;
/** Neon names its PgBouncer endpoint `<endpoint>-pooler`; the direct one admits only about 100 connections at the smallest size. */
const NEON_DIRECT_HOST = /^ep-[a-z0-9-]+(?<!-pooler)\.[a-z0-9.-]+\.neon\.tech$/;

export function createDatabasePool(connectionString: string, log: Pick<Logger, 'warn'> = new Logger('Persistence')): pg.Pool {
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    query_timeout: QUERY_TIMEOUT_MS,
  });
  if (NEON_DIRECT_HOST.test(new URL(connectionString).hostname)) {
    log.warn(
      `DATABASE_URL is Neon's direct endpoint: each instance may hold ${pool.options.max} connections, so use the pooled (-pooler) string`,
    );
  }
  pool.on('error', (error) => {
    log.warn(
      `Postgres idle client disconnected (code=${safeDatabaseErrorCode(error)}, active=${pool.totalCount - pool.idleCount}, waiting=${pool.waitingCount}); next query will reconnect`,
    );
  });
  return pool;
}
