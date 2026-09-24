import {
  type CanActivate,
  type ExecutionContext,
  HttpException,
  HttpStatus,
  Inject,
  Injectable,
  Logger,
  SetMetadata,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import type { Request, Response } from 'express';
import { APP_CONFIG, type AppConfig } from '../config.js';
import { CoordinationStore } from '../persistence/stores.js';

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
  ) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (ctx.getType() !== 'http') return true;
    const rule = this.reflector.getAllAndOverride<RateLimitRule | false | undefined>(RATE_LIMIT, [ctx.getHandler(), ctx.getClass()]) ?? {
      limit: this.config.rateLimitPerMinute,
      windowMs: DEFAULT_WINDOW_MS,
    };
    if (rule === false) return true;

    const http = ctx.switchToHttp();
    const req = http.getRequest<Request>();
    const caller = req.identity?.userId ? `user:${req.identity.userId}` : `ip:${req.ip}`;
    const key = `rate:${ctx.getClass().name}.${ctx.getHandler().name}:${caller}`;

    let counted;
    try {
      counted = await this.store.add(key, rule.windowMs, 1);
    } catch (error) {
      // Fail open: a database hiccup should not turn every request into an error. Real outages still
      // surface through the endpoints that need the database.
      if (Date.now() - this.lastErrorLog > ERROR_LOG_INTERVAL_MS) {
        this.lastErrorLog = Date.now();
        this.log.error(`Rate limiting is paused, the counter store failed: ${String(error)}`);
      }
      return true;
    }

    const resetSeconds = Math.max(1, Math.ceil(counted.resetsInMs / 1000));
    const res = http.getResponse<Response>();
    res.setHeader('X-RateLimit-Limit', rule.limit);
    res.setHeader('X-RateLimit-Remaining', Math.max(0, rule.limit - counted.total));
    res.setHeader('X-RateLimit-Reset', resetSeconds);
    if (counted.total <= rule.limit) return true;
    res.setHeader('Retry-After', resetSeconds);
    throw new HttpException('Too many requests. Please wait a moment and try again.', HttpStatus.TOO_MANY_REQUESTS);
  }
}
