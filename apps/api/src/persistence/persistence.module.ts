import { Global, Inject, Injectable, Logger, Module, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { attachDatabasePool } from '@vercel/functions';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { APP_CONFIG, loadConfig, type AppConfig } from '../config.js';
import {
  MemoryAuthStore,
  MemoryCoordinationStore,
  MemoryFeedbackStore,
  MemoryInterviewStore,
  MemoryProgressStore,
} from './memory.stores.js';
import {
  PostgresAuthStore,
  PostgresCoordinationStore,
  PostgresFeedbackStore,
  PostgresInterviewStore,
  PostgresProgressStore,
  type Db,
} from './postgres.stores.js';
import * as schema from './schema.js';
import { AuthStore, CoordinationStore, FeedbackStore, InterviewStore, ProgressStore } from './stores.js';

export const PG_POOL = Symbol('PG_POOL');
const DB = Symbol('DB');
const SWEEP_INTERVAL_MS = 10 * 60_000;

/** Deletes expired rate windows and leases now and then; every instance may run it, deletes are idempotent. */
@Injectable()
export class CoordinationSweeper implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger(CoordinationSweeper.name);
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(private readonly store: CoordinationStore) {}

  onApplicationBootstrap() {
    this.timer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown() {
    clearInterval(this.timer);
  }

  async sweep() {
    try {
      const removed = await this.store.sweep();
      if (removed) this.log.debug(`Swept ${removed} expired counters and leases`);
    } catch (error) {
      this.log.warn(`Sweep failed, will retry: ${String(error)}`);
    }
  }
}

@Global()
@Module({
  providers: [
    { provide: APP_CONFIG, useFactory: () => loadConfig() },
    {
      provide: PG_POOL,
      inject: [APP_CONFIG],
      useFactory: (config: AppConfig) => {
        const log = new Logger('Persistence');
        if (!config.databaseUrl) {
          log.warn('DATABASE_URL not set — using in-memory stores (data resets on restart).');
          return null;
        }
        log.log('Using Postgres.');
        const pool = new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
        // On Vercel, keeps a suspended instance alive just long enough to close idle connections; a no-op elsewhere.
        attachDatabasePool(pool);
        return pool;
      },
    },
    { provide: DB, inject: [PG_POOL], useFactory: (pool: pg.Pool | null) => (pool ? drizzle(pool, { schema }) : null) },
    {
      provide: ProgressStore,
      inject: [DB],
      useFactory: (db: Db | null) => (db ? new PostgresProgressStore(db) : new MemoryProgressStore()),
    },
    {
      provide: InterviewStore,
      inject: [DB],
      useFactory: (db: Db | null) => (db ? new PostgresInterviewStore(db) : new MemoryInterviewStore()),
    },
    {
      provide: FeedbackStore,
      inject: [DB],
      useFactory: (db: Db | null) => (db ? new PostgresFeedbackStore(db) : new MemoryFeedbackStore()),
    },
    {
      provide: AuthStore,
      inject: [DB],
      useFactory: (db: Db | null) => (db ? new PostgresAuthStore(db) : new MemoryAuthStore()),
    },
    {
      provide: CoordinationStore,
      inject: [DB],
      useFactory: (db: Db | null) => (db ? new PostgresCoordinationStore(db) : new MemoryCoordinationStore()),
    },
    CoordinationSweeper,
  ],
  exports: [APP_CONFIG, PG_POOL, ProgressStore, InterviewStore, FeedbackStore, AuthStore, CoordinationStore],
})
export class PersistenceModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool | null) {}

  async onApplicationShutdown() {
    await this.pool?.end();
  }
}
