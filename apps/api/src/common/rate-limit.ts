import { type CanActivate, type ExecutionContext, Inject, Injectable, Logger, SetMetadata } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { tokenInvalid } from '../auth/auth-errors.js';
import { hashToken } from '../auth/tokens.js';
import { APP_CONFIG, type AppConfig } from '../config.js';
import {
  databaseUnavailable,
  isDatabaseUnavailable,
  safeDatabaseErrorCategory,
  safeDatabaseErrorCode,
} from '../persistence/database-errors.js';
import { AuthStore, CoordinationStore } from '../persistence/stores.js';
import { RateLimitExceeded } from './rate-limit-exceeded.js';

export interface RateLimitRule {
  limit: number;
  windowMs: number;
}

const RATE_LIMIT = 'grasp:rate-limit';
const DEFAULT_WINDOW_MS = 60_000;
const ERROR_LOG_INTERVAL_MS = 60_000;

/** Overrides the default per-minute limit for a route or controller. */
export const RateLimit = (rule: RateLimitRule) => SetMetadata(RATE_LIMIT, rule);
export const SkipRateLimit = () => SetMetadata(RATE_LIMIT, false);

/**
 * Fixed-window limits per route, counted in the coordination store so every instance enforces the same
 * limit. Signed-in callers are counted per account (across devices and networks), everyone else per IP,
 * which is why this guard runs after IdentityGuard.
 */
@Injectable()
export class RateLimitGuard implements CanActivate {
  private readonly log = new Logger('RateLimit');
  private lastErrorLog = 0;

  constructor(
    private readonly reflector: Reflector,
    private readonly store: CoordinationStore,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    private readonly auth: AuthStore,
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const rule = this.reflector.getAllAndOverride<RateLimitRule | false | undefined>(RATE_LIMIT, [ctx.getHandler(), ctx.getClass()]) ?? {
      limit: this.config.rateLimitPerMinute,
      windowMs: DEFAULT_WINDOW_MS,
    };
    const http = ctx.switchToHttp();
    const req = http.getRequest<Request>();
    const claims = req.accessClaims;
    if (rule === false) {
      if (claims && !(await this.auth.activeFamily(claims.userId, claims.learnerId, claims.familyId))) {
        throw tokenInvalid('Session ended');
      }
      return true;
    }
    const caller = req.identity?.userId ? `user:${req.identity.userId}` : `ip:${req.ip}`;
    const key = `rate:${ctx.getClass().name}.${ctx.getHandler().name}:${hashToken(caller)}`;

    let counted;
    try {
      counted = claims ? await this.store.addForSession(key, rule.windowMs, 1, claims) : await this.store.add(key, rule.windowMs, 1);
    } catch (error) {
      if (Date.now() - this.lastErrorLog > ERROR_LOG_INTERVAL_MS) {
        this.lastErrorLog = Date.now();
        this.log.error(
          `Rate limiting counter store failed (category=${safeDatabaseErrorCategory(error)}, code=${safeDatabaseErrorCode(error)})`,
        );
      }
      if (this.config.databaseUrl) {
        if (isDatabaseUnavailable(error)) throw databaseUnavailable();
        throw error;
      }
      if (claims) throw databaseUnavailable();
      return true;
    }
    if (!counted) throw tokenInvalid('Session ended');

    if (counted.total > rule.limit) throw new RateLimitExceeded(rule.limit, counted.resetsInMs);
    const res = http.getResponse<Response>();
    res.setHeader('X-RateLimit-Limit', rule.limit);
    res.setHeader('X-RateLimit-Remaining', rule.limit - counted.total);
    res.setHeader('X-RateLimit-Reset', Math.max(1, Math.ceil(counted.resetsInMs / 1000)));
    return true;
  }
}
