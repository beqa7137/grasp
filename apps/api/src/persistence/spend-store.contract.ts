import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { CoordinationStore } from './stores.js';
import { LEGACY_SPEND_KEY, SPEND_DAY_MS, SpendStore } from './spend.store.js';

interface Stores {
  store: SpendStore;
  other: SpendStore;
  legacy: CoordinationStore;
}

export function spendStoreContract(name: string, make: () => Stores) {
  describe(`${name} spend reservations`, () => {
    it('admits only the exact affordable number of concurrent reservations', async () => {
      const { store, other } = make();
      const results = await Promise.all(
        Array.from({ length: 30 }, (_, index) => (index % 2 ? store : other).reserve(randomUUID(), 100_000, 700_000)),
      );
      expect(results.filter(Boolean)).toHaveLength(7);
      expect(await store.spentToday()).toBe(700_000);
      expect(await other.reserve(randomUUID(), 1, 700_000)).toBeNull();
    });

    it('settles once across concurrent calls and releases only the unused amount', async () => {
      const { store, other } = make();
      const id = randomUUID();
      await store.reserve(id, 600_000, 1_000_000);
      await Promise.all(Array.from({ length: 20 }, (_, index) => (index % 2 ? store : other).settle(id, 200_000)));
      expect(await store.spentToday()).toBe(200_000);
      expect(await other.reserve(randomUUID(), 800_000, 1_000_000)).not.toBeNull();
      await store.settle(id, 0);
      expect(await store.spentToday()).toBe(1_000_000);
    });

    it('retains unresolved reservations, including with an unlimited budget', async () => {
      const { store, other } = make();
      await store.reserve(randomUUID(), 2_000_000, null);
      expect(await other.spentToday()).toBe(2_000_000);
      expect(await other.reserve(randomUUID(), 1, 2_000_000)).toBeNull();
      await store.sweep();
      expect(await store.spentToday()).toBe(2_000_000);
    });

    it('rejects duplicate authorization without charging twice', async () => {
      const { store, other } = make();
      const id = randomUUID();
      await store.reserve(id, 100, null);
      await expect(other.reserve(id, 100, null)).rejects.toThrow();
      await store.settle(id, 40);
      await expect(other.reserve(id, 100, null)).rejects.toThrow();
      expect(await store.spentToday()).toBe(40);
    });

    it('allows only one authorization when the same opaque ID races', async () => {
      const { store, other } = make();
      const id = randomUUID();
      const results = await Promise.allSettled(
        Array.from({ length: 12 }, (_, index) => (index % 2 ? store : other).reserve(index % 2 ? id : id.toUpperCase(), 100, null)),
      );
      expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
      expect(results.filter((result) => result.status === 'rejected')).toHaveLength(11);
      expect(await store.spentToday()).toBe(100);
      await store.settle(id.toUpperCase(), 50);
      expect(await store.spentToday()).toBe(50);
    });

    it('rejects malformed reservation IDs without mutating the ledger', async () => {
      const { store } = make();
      await expect(store.reserve('private learner text', 100, null)).rejects.toThrow();
      await expect(store.settle('private learner text', 100)).rejects.toThrow();
      expect(await store.spentToday()).toBe(0);
    });

    it('records an actual overrun and blocks further admissions', async () => {
      const { store } = make();
      const id = randomUUID();
      await store.reserve(id, 100, 100);
      await store.settle(id, 150);
      expect(await store.spentToday()).toBe(150);
      expect(await store.reserve(randomUUID(), 1, 100)).toBeNull();
      await store.settle(randomUUID(), 99);
      expect(await store.spentToday()).toBe(150);
    });

    it('counts prior and later legacy increments without counting new settlement twice', async () => {
      const { store, legacy } = make();
      await legacy.add(LEGACY_SPEND_KEY, SPEND_DAY_MS, 0.000_000_1);
      expect(await store.spentToday()).toBe(1);
      const id = randomUUID();
      await store.reserve(id, 3, 5);
      await legacy.add(LEGACY_SPEND_KEY, SPEND_DAY_MS, 0.000_001);
      expect(await store.reserve(randomUUID(), 1, 5)).toBeNull();
      await store.settle(id, 1);
      expect(await store.spentToday()).toBe(3);
      expect(await legacy.read(LEGACY_SPEND_KEY, SPEND_DAY_MS)).toBeCloseTo(0.000_001_1, 12);
    });

    it('keeps the largest legacy total when the old counter decreases', async () => {
      const { store, legacy } = make();
      await legacy.add(LEGACY_SPEND_KEY, SPEND_DAY_MS, 0.5);
      expect(await store.spentToday()).toBe(500_000);
      await legacy.add(LEGACY_SPEND_KEY, SPEND_DAY_MS, -0.25);
      expect(await store.spentToday()).toBe(500_000);
    });

    it.each([NaN, Infinity, -1])('fails closed for invalid legacy value %s', async (amount) => {
      const { store, legacy } = make();
      await legacy.add(LEGACY_SPEND_KEY, SPEND_DAY_MS, amount);
      await expect(store.reserve(randomUUID(), 1, null)).rejects.toThrow();
      await expect(store.spentToday()).rejects.toThrow();
    });

    it.each([NaN, Infinity, -1, 0.1, Number.MAX_SAFE_INTEGER + 1])('rejects invalid monetary amount %s', async (amount) => {
      const { store } = make();
      await expect(store.reserve(randomUUID(), amount, null)).rejects.toThrow();
      await expect(store.reserve(randomUUID(), 1, amount)).rejects.toThrow();
      await expect(store.settle(randomUUID(), amount)).rejects.toThrow();
      expect(await store.spentToday()).toBe(0);
    });

    it('rejects zero reservation and unsafe aggregate liability', async () => {
      const { store } = make();
      await expect(store.reserve(randomUUID(), 0, null)).rejects.toThrow();
      expect(await store.reserve(randomUUID(), 1, 0)).toBeNull();
      await store.reserve(randomUUID(), Number.MAX_SAFE_INTEGER, null);
      await expect(store.reserve(randomUUID(), 1, null)).rejects.toThrow();
      expect(await store.spentToday()).toBe(Number.MAX_SAFE_INTEGER);
    });

    it('retains actual debt even if settlement makes the aggregate unsafe to return', async () => {
      const { store } = make();
      const id = randomUUID();
      await store.reserve(id, 1, null);
      await store.reserve(randomUUID(), Number.MAX_SAFE_INTEGER - 1, null);
      await store.settle(id, 2);
      await expect(store.spentToday()).rejects.toThrow();
      await expect(store.reserve(randomUUID(), 1, null)).rejects.toThrow();
      await store.settle(id, 0);
      await expect(store.spentToday()).rejects.toThrow();
    });
  });
}
