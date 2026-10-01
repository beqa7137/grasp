import { Global, Inject, Injectable, Logger, Module, type OnApplicationBootstrap, type OnApplicationShutdown } from '@nestjs/common';
import { attachDatabasePool } from '@vercel/functions';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { APP_CONFIG, ConfigError, loadConfig, type AppConfig } from '../config.js';
import { safeErrorDetails } from '../observability/safe-error.js';
import { createDatabasePool } from './database-pool.js';
import { MemoryMetricsStore } from './memory-metrics.store.js';
import { MemorySpendStore } from './memory-spend.store.js';
import { MetricsStore } from './metrics.store.js';
import { PostgresMetricsStore } from './postgres-metrics.store.js';
import { MemoryStoryStore } from './memory-story.store.js';
import { PostgresStoryStore } from './postgres-story.store.js';
import { StoryStore } from './story.store.js';
import { PostgresSpendStore } from './postgres-spend.store.js';
import { SpendStore } from './spend.store.js';
import { ErasureStore, MemoryErasureStore, MemoryLearnerState, PostgresErasureStore } from './erasure.stores.js';
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

/** Deletes expired rows now and then; every instance may run it, deletes are idempotent. */
@Injectable()
export class ExpiredRowSweeper implements OnApplicationBootstrap, OnApplicationShutdown {
  private readonly log = new Logger(ExpiredRowSweeper.name);
  private timer: ReturnType<typeof setInterval> | undefined;

  constructor(
    private readonly coordination: CoordinationStore,
    private readonly auth: AuthStore,
    private readonly spend: SpendStore,
  ) {}

  onApplicationBootstrap() {
    this.timer = setInterval(() => void this.sweep(), SWEEP_INTERVAL_MS);
    this.timer.unref();
  }

  onApplicationShutdown() {
    clearInterval(this.timer);
  }

  async sweep() {
    try {
      const removed = (await this.coordination.sweep()) + (await this.auth.sweepExpired()) + (await this.spend.sweep());
      if (removed) this.log.debug(`Swept ${removed} expired rows`);
    } catch (error) {
      this.log.warn({ operation: 'persistence.sweep', ...safeErrorDetails(error) });
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
          if (config.env === 'production') throw new ConfigError('DATABASE_URL is required in production');
          log.warn('DATABASE_URL not set; using in-memory stores (data resets on restart).');
          return null;
        }
        log.log('Using Postgres.');
        const pool = createDatabasePool(config.databaseUrl, log);
        // On Vercel, keeps a suspended instance alive just long enough to close idle connections; a no-op elsewhere.
        attachDatabasePool(pool);
        return pool;
      },
    },
    { provide: DB, inject: [PG_POOL], useFactory: (pool: pg.Pool | null) => (pool ? drizzle(pool, { schema }) : null) },
    MemoryLearnerState,
    {
      provide: ProgressStore,
      inject: [DB, MemoryLearnerState],
      useFactory: (db: Db | null, state: MemoryLearnerState) => (db ? new PostgresProgressStore(db) : new MemoryProgressStore(state)),
    },
    {
      provide: InterviewStore,
      inject: [DB, MemoryLearnerState, ProgressStore],
      useFactory: (db: Db | null, state: MemoryLearnerState, progress: ProgressStore) =>
        db ? new PostgresInterviewStore(db) : new MemoryInterviewStore(state, progress as MemoryProgressStore),
    },
    {
      provide: FeedbackStore,
      inject: [DB, MemoryLearnerState],
      useFactory: (db: Db | null, state: MemoryLearnerState) => (db ? new PostgresFeedbackStore(db) : new MemoryFeedbackStore(state)),
    },
    {
      provide: AuthStore,
      inject: [DB, MemoryLearnerState],
      useFactory: (db: Db | null, state: MemoryLearnerState) => (db ? new PostgresAuthStore(db) : new MemoryAuthStore(state)),
    },
    {
      provide: StoryStore,
      inject: [DB, MemoryLearnerState],
      useFactory: (db: Db | null, state: MemoryLearnerState) => (db ? new PostgresStoryStore(db) : new MemoryStoryStore(state)),
    },
    {
      provide: ErasureStore,
      inject: [DB, MemoryLearnerState, ProgressStore, InterviewStore, FeedbackStore, AuthStore, StoryStore],
      useFactory: (
        db: Db | null,
        state: MemoryLearnerState,
        progress: ProgressStore,
        interviews: InterviewStore,
        feedback: FeedbackStore,
        auth: AuthStore,
        stories: StoryStore,
      ) =>
        db
          ? new PostgresErasureStore(db)
          : new MemoryErasureStore(
              state,
              progress as MemoryProgressStore,
              interviews as MemoryInterviewStore,
              feedback as MemoryFeedbackStore,
              auth,
              stories,
            ),
    },
    {
      provide: CoordinationStore,
      inject: [DB, AuthStore],
      useFactory: (db: Db | null, auth: AuthStore) =>
        db ? new PostgresCoordinationStore(db) : new MemoryCoordinationStore(Date.now, auth),
    },
    {
      provide: SpendStore,
      inject: [DB, CoordinationStore],
      useFactory: (db: Db | null, coordination: CoordinationStore) =>
        db ? new PostgresSpendStore(db) : new MemorySpendStore(coordination),
    },
    {
      provide: MetricsStore,
      inject: [PG_POOL, ProgressStore, InterviewStore, FeedbackStore],
      useFactory: (pool: pg.Pool | null, progress: ProgressStore, interviews: InterviewStore, feedback: FeedbackStore) =>
        pool
          ? new PostgresMetricsStore(pool)
          : new MemoryMetricsStore(progress as MemoryProgressStore, interviews as MemoryInterviewStore, feedback as MemoryFeedbackStore),
    },
    ExpiredRowSweeper,
  ],
  exports: [
    APP_CONFIG,
    PG_POOL,
    ProgressStore,
    InterviewStore,
    FeedbackStore,
    AuthStore,
    StoryStore,
    ErasureStore,
    CoordinationStore,
    SpendStore,
    MetricsStore,
  ],
})
export class PersistenceModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool | null) {}

  async onApplicationShutdown() {
    await this.pool?.end();
  }
}
