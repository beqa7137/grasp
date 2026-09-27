import { Logger } from '@nestjs/common';
import pg from 'pg';
import { safeDatabaseErrorCode } from './database-errors.js';

const CONNECT_TIMEOUT_MS = 4_000;
const QUERY_TIMEOUT_MS = 3_000;

export function createDatabasePool(connectionString: string, log: Pick<Logger, 'warn'> = new Logger('Persistence')): pg.Pool {
  const pool = new pg.Pool({
    connectionString,
    max: 10,
    connectionTimeoutMillis: CONNECT_TIMEOUT_MS,
    query_timeout: QUERY_TIMEOUT_MS,
  });
  pool.on('error', (error) => {
    log.warn(
      `Postgres idle client disconnected (code=${safeDatabaseErrorCode(error)}, active=${pool.totalCount - pool.idleCount}, waiting=${pool.waitingCount}); next query will reconnect`,
    );
  });
  return pool;
}
