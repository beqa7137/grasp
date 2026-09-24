import { Logger } from '@nestjs/common';
import type { ThrottlerStorage } from '@nestjs/throttler';
import type { CoordinationStore } from '../persistence/stores.js';

const ERROR_LOG_INTERVAL_MS = 60_000;

type ThrottlerStorageRecord = Awaited<ReturnType<ThrottlerStorage['increment']>>;

/**
 * Rate-limit counters in the coordination store, so every instance enforces one shared limit per caller.
 * Fixed windows: a caller over the limit is blocked until the window ends, whatever `blockDuration` says
 * (the default block equals the window anyway). The keys arrive already hashed by ThrottlerGuard.
 */
export class SharedThrottlerStorage implements ThrottlerStorage {
  private readonly log = new Logger('RateLimit');
  private lastErrorLog = 0;

  constructor(private readonly store: CoordinationStore) {}

  async increment(key: string, ttl: number, limit: number, _blockDuration: number, throttlerName: string): Promise<ThrottlerStorageRecord> {
    try {
      const { total, resetsInMs } = await this.store.add(`rate:${throttlerName}:${key}`, ttl, 1);
      const seconds = Math.max(1, Math.ceil(resetsInMs / 1000));
      const isBlocked = total > limit;
      return { totalHits: total, timeToExpire: seconds, isBlocked, timeToBlockExpire: isBlocked ? seconds : 0 };
    } catch (error) {
      // Fail open: a database hiccup should not turn every request into a 500. Real outages still surface
      // through the endpoints that need the database.
      if (Date.now() - this.lastErrorLog > ERROR_LOG_INTERVAL_MS) {
        this.lastErrorLog = Date.now();
        this.log.error(`Rate limiting is paused, the counter store failed: ${String(error)}`);
      }
      return { totalHits: 0, timeToExpire: 0, isBlocked: false, timeToBlockExpire: 0 };
    }
  }
}
