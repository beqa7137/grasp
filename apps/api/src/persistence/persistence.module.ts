import { Global, Inject, Logger, Module, type OnApplicationShutdown } from '@nestjs/common';
import { drizzle } from 'drizzle-orm/node-postgres';
import pg from 'pg';
import { APP_CONFIG, loadConfig, type AppConfig } from '../config.js';
import { MemoryInterviewStore, MemoryProgressStore } from './memory.stores.js';
import { PostgresInterviewStore, PostgresProgressStore, type Db } from './postgres.stores.js';
import * as schema from './schema.js';
import { InterviewStore, ProgressStore } from './stores.js';

const PG_POOL = Symbol('PG_POOL');
const DB = Symbol('DB');

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
        return new pg.Pool({ connectionString: config.databaseUrl, max: 10 });
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
  ],
  exports: [APP_CONFIG, ProgressStore, InterviewStore],
})
export class PersistenceModule implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: pg.Pool | null) {}

  async onApplicationShutdown() {
    await this.pool?.end();
  }
}
