import { Controller, Get, Inject } from '@nestjs/common';
import { SkipIdentity } from '../auth/identity.guard.js';
import { SkipRateLimit } from '../common/rate-limit.js';
import type pg from 'pg';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { Interviewer } from '../interview/interviewer.js';
import { databaseUnavailable } from '../persistence/database-errors.js';
import { PG_POOL } from '../persistence/persistence.module.js';

@SkipRateLimit()
@SkipIdentity()
@Controller('health')
export class HealthController {
  constructor(
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(PG_POOL) private readonly pool: pg.Pool | null,
    private readonly interviewer: Interviewer,
  ) {}

  /** Liveness: the process is up and serving requests. */
  @Get()
  health() {
    return {
      status: 'ok',
      storage: this.pool ? 'postgres' : 'memory',
      interviewer: this.interviewer.mode,
      release: this.config.release,
    };
  }

  /** Readiness: dependencies needed to serve traffic are reachable. */
  @Get('ready')
  async ready() {
    if (this.pool) {
      try {
        await this.pool.query('select 1');
      } catch {
        throw databaseUnavailable();
      }
    }
    return { status: 'ready', database: this.pool ? 'ok' : 'memory' };
  }
}
