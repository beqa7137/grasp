import { HttpException, Logger } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import type { ExecutionContext } from '@nestjs/common';
import type { AppConfig } from '../config.js';
import { MemoryCoordinationStore } from '../persistence/memory.stores.js';
import type { CoordinationStore } from '../persistence/stores.js';
import { RateLimit, RateLimitGuard, SkipRateLimit } from './rate-limit.js';

class Routes {
  list() {}
  @RateLimit({ limit: 1, windowMs: 60_000 })
  send() {}
  @SkipRateLimit()
  health() {}
}

@SkipRateLimit()
class Unlimited {
  list() {}
}

function call(guard: RateLimitGuard, handler: () => void, request: object = { ip: '203.0.113.1' }, controller: object = Routes) {
  const headers: Record<string, unknown> = {};
  const ctx = {
    getType: () => 'http',
    getHandler: () => handler,
    getClass: () => controller,
    switchToHttp: () => ({ getRequest: () => request, getResponse: () => ({ setHeader: (k: string, v: unknown) => (headers[k] = v) }) }),
  } as unknown as ExecutionContext;
  return { headers, result: guard.canActivate(ctx) };
}

describe('RateLimitGuard', () => {
  const config = { rateLimitPerMinute: 2 } as AppConfig;
  let now: number;
  let guard: RateLimitGuard;

  beforeEach(() => {
    now = Date.parse('2026-09-24T10:00:00Z');
    guard = new RateLimitGuard(new Reflector(), new MemoryCoordinationStore(() => now), config);
  });

  it('applies the default limit per route and caller, and reports it in headers', async () => {
    const first = call(guard, Routes.prototype.list);
    await expect(first.result).resolves.toBe(true);
    expect(first.headers).toMatchObject({ 'X-RateLimit-Limit': 2, 'X-RateLimit-Remaining': 1, 'X-RateLimit-Reset': 60 });
    await call(guard, Routes.prototype.list).result;

    const limited = call(guard, Routes.prototype.list);
    await expect(limited.result).rejects.toMatchObject({ status: 429 });
    expect(limited.headers).toMatchObject({ 'X-RateLimit-Remaining': 0, 'Retry-After': 60 });

    await expect(call(guard, Routes.prototype.list, { ip: '203.0.113.2' }).result).resolves.toBe(true);
    await expect(call(guard, Routes.prototype.send).result).resolves.toBe(true);
    now += 60_000;
    await expect(call(guard, Routes.prototype.list).result).resolves.toBe(true);
  });

  it('counts signed-in callers per account, whatever their IP', async () => {
    const user = (ip: string) => ({ ip, identity: { userId: 'u1' } });
    await call(guard, Routes.prototype.send, user('203.0.113.1')).result;
    await expect(call(guard, Routes.prototype.send, user('198.51.100.7')).result).rejects.toBeInstanceOf(HttpException);
    await expect(call(guard, Routes.prototype.send, { ip: '198.51.100.7' }).result).resolves.toBe(true);
  });

  it('honours route overrides and skips', async () => {
    await call(guard, Routes.prototype.send).result;
    await expect(call(guard, Routes.prototype.send).result).rejects.toMatchObject({ status: 429 });
    for (let i = 0; i < 5; i++) {
      await expect(call(guard, Routes.prototype.health).result).resolves.toBe(true);
      await expect(call(guard, Unlimited.prototype.list, undefined, Unlimited).result).resolves.toBe(true);
    }
  });

  it('lets requests through when the counter store fails, logging at most once a minute', async () => {
    const failing = { add: () => Promise.reject(new Error('connection refused')) } as unknown as CoordinationStore;
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    guard = new RateLimitGuard(new Reflector(), failing, config);
    for (let i = 0; i < 3; i++) await expect(call(guard, Routes.prototype.list).result).resolves.toBe(true);
    expect(error).toHaveBeenCalledTimes(1);
    error.mockRestore();
  });

  it('returns a scrubbed 503 when the Postgres counter fails', async () => {
    const failure = new DrizzleQueryError(
      'select private learner data',
      ['private learner data'],
      new Error('timeout exceeded when trying to connect'),
    );
    const failing = { add: () => Promise.reject(failure) } as unknown as CoordinationStore;
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    guard = new RateLimitGuard(new Reflector(), failing, { ...config, databaseUrl: 'postgresql://user:secret@localhost/test' });

    await expect(call(guard, Routes.prototype.list).result).rejects.toMatchObject({ status: 503 });
    expect(error).toHaveBeenCalledTimes(1);
    expect(error.mock.calls[0]![0]).toContain('category=timeout');
    expect(error.mock.calls[0]![0]).not.toContain('private learner data');
    expect(error.mock.calls[0]![0]).not.toContain('secret');
    error.mockRestore();
  });

  it('keeps unexpected Postgres counter failures on the error reporting path', async () => {
    const failure = Object.assign(new Error('other network call failed'), { code: 'ECONNRESET' });
    const failing = { add: () => Promise.reject(failure) } as unknown as CoordinationStore;
    const error = vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
    guard = new RateLimitGuard(new Reflector(), failing, { ...config, databaseUrl: 'postgresql://localhost/test' });

    await expect(call(guard, Routes.prototype.list).result).rejects.toBe(failure);
    expect(error.mock.calls[0]![0]).toContain('category=connection');
    error.mockRestore();
  });
});
