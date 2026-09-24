import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { MemoryCoordinationStore } from '../persistence/memory.stores.js';
import type { CoordinationStore } from '../persistence/stores.js';
import { SpendGuard } from './spend-guard.js';

describe('SpendGuard', () => {
  it('blocks once the daily budget is spent and reopens the next UTC day', async () => {
    let now = Date.parse('2026-09-23T10:00:00Z');
    const guard = new SpendGuard(1, new MemoryCoordinationStore(() => now));
    await guard.record(0.6);
    await expect(guard.assertAvailable()).resolves.toBeUndefined();
    await guard.record(0.4);
    await expect(guard.assertAvailable()).rejects.toThrow(ServiceUnavailableException);
    now = Date.parse('2026-09-23T23:59:59Z');
    await expect(guard.assertAvailable()).rejects.toThrow(/usage limit/);
    now = Date.parse('2026-09-24T00:00:01Z');
    await expect(guard.assertAvailable()).resolves.toBeUndefined();
    expect(await guard.spentToday()).toBe(0);
  });

  it('shares one total between guards on the same store, like instances on one database', async () => {
    const store = new MemoryCoordinationStore();
    const [a, b] = [new SpendGuard(1, store), new SpendGuard(1, store)];
    await a.record(0.7);
    await b.record(0.3);
    await expect(a.assertAvailable()).rejects.toThrow(ServiceUnavailableException);
    await expect(b.assertAvailable()).rejects.toThrow(ServiceUnavailableException);
  });

  it('never blocks without a budget, but still records spend', async () => {
    const guard = new SpendGuard(null, new MemoryCoordinationStore());
    await guard.record(1_000);
    await expect(guard.assertAvailable()).resolves.toBeUndefined();
    expect(await guard.spentToday()).toBe(1_000);
  });

  it('refuses paid calls when the shared total cannot be read, and never fails a recording', async () => {
    Logger.overrideLogger(false);
    const broken = {
      read: async () => {
        throw new Error('connection refused');
      },
      add: async () => {
        throw new Error('connection refused');
      },
    } as unknown as CoordinationStore;
    const guard = new SpendGuard(1, broken);
    await expect(guard.assertAvailable()).rejects.toThrow(/temporarily unavailable/);
    await expect(guard.record(0.5)).resolves.toBeUndefined();
    await expect(new SpendGuard(null, broken).assertAvailable()).resolves.toBeUndefined();
  });
});
