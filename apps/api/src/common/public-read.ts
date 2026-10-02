import {
  type CallHandler,
  type ExecutionContext,
  Injectable,
  type NestInterceptor,
  UseInterceptors,
  applyDecorators,
} from '@nestjs/common';
import type { Request, Response } from 'express';
import { tap } from 'rxjs';
import { SkipIdentity } from '../auth/identity.guard.js';
import { SkipRateLimit } from './rate-limit.js';

/**
 * Shared caches keep a copy for an hour and may serve it for a day while refetching it. Vercel keys its CDN cache by
 * deployment, so a release never serves another release's copy; Express's ETag is a hash of the body, so a client's
 * copy revalidates to a 304 until the content changes.
 */
export const PUBLIC_READ_CACHE = 'public, max-age=300, s-maxage=3600, stale-while-revalidate=86400';

@Injectable()
class PublicCacheInterceptor implements NestInterceptor {
  intercept(ctx: ExecutionContext, next: CallHandler) {
    const http = ctx.switchToHttp();
    const authorized = http.getRequest<Request>().headers.authorization !== undefined;
    return next
      .handle()
      .pipe(tap(() => http.getResponse<Response>().setHeader('Cache-Control', authorized ? 'no-store' : PUBLIC_READ_CACHE)));
  }
}

/**
 * A read that is the same for every caller and touches no storage: it ignores who is calling, writes no rate-limit
 * counter, and lets the CDN answer repeats. Abuse can cost only function time on a cache miss, as with `/api/health`.
 */
export const PublicRead = () => applyDecorators(SkipIdentity(), SkipRateLimit(), UseInterceptors(PublicCacheInterceptor));
