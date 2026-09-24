import { randomUUID } from 'node:crypto';
import { describe, expect, it } from 'vitest';
import type { CoordinationStore } from './stores.js';

const HOUR = 3_600_000;
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

/** Waits until a fresh window of `windowMs` has just started, so short-window tests cannot straddle a boundary. */
async function atWindowStart(windowMs: number) {
  await sleep(windowMs - (Date.now() % windowMs) + 5);
}

/** Behaviour every CoordinationStore must have; run against each implementation. */
export function coordinationContract(name: string, make: () => CoordinationStore) {
  describe(`${name} coordination store`, () => {
    const key = (label: string) => `test:${label}:${randomUUID()}`;

    it('adds fractional amounts within a window and keeps keys apart', async () => {
      const store = make();
      const [a, b] = [key('a'), key('b')];
      await store.add(a, HOUR, 0.25);
      const second = await store.add(a, HOUR, 0.5);
      expect(second.total).toBeCloseTo(0.75);
      expect(second.resetsInMs).toBeGreaterThan(0);
      expect(second.resetsInMs).toBeLessThanOrEqual(HOUR);
      expect(await store.read(a, HOUR)).toBeCloseTo(0.75);
      expect(await store.read(b, HOUR)).toBe(0);
    });

    it('never lets concurrent takes exceed the limit', async () => {
      const store = make();
      const k = key('take');
      const results = await Promise.all(Array.from({ length: 40 }, () => store.take(k, HOUR, 7)));
      expect(results.filter(Boolean)).toHaveLength(7);
      expect(new Set(results.filter(Boolean).map((r) => r!.total))).toEqual(new Set([1, 2, 3, 4, 5, 6, 7]));
      expect(await store.read(k, HOUR)).toBe(7);
      expect(await store.take(k, HOUR, 0)).toBeNull();
    });

    it('never loses concurrent additions', async () => {
      const store = make();
      const k = key('add');
      await Promise.all(Array.from({ length: 30 }, () => store.add(k, HOUR, 1)));
      expect(await store.read(k, HOUR)).toBe(30);
    });

    it('starts every window from zero', async () => {
      const store = make();
      const k = key('window');
      await atWindowStart(400);
      await store.take(k, 400, 1);
      expect(await store.take(k, 400, 1)).toBeNull();
      await atWindowStart(400);
      expect(await store.read(k, 400)).toBe(0);
      expect((await store.take(k, 400, 1))?.total).toBe(1);
    });

    it('gives a lease to one holder at a time, lets the holder renew, and ignores releases by others', async () => {
      const store = make();
      const k = key('lease');
      const holders = Array.from({ length: 12 }, () => randomUUID());
      const won = await Promise.all(holders.map((h) => store.acquireLease(k, h, HOUR)));
      expect(won.filter(Boolean)).toHaveLength(1);
      const owner = holders[won.indexOf(true)];
      const other = holders.find((h) => h !== owner)!;

      expect(await store.acquireLease(k, owner, HOUR)).toBe(true);
      await store.releaseLease(k, other);
      expect(await store.acquireLease(k, other, HOUR)).toBe(false);
      await store.releaseLease(k, owner);
      expect(await store.acquireLease(k, other, HOUR)).toBe(true);
    });

    it('lets an expired lease be taken over', async () => {
      const store = make();
      const k = key('expiry');
      expect(await store.acquireLease(k, 'crashed-instance', 150)).toBe(true);
      expect(await store.acquireLease(k, 'next', HOUR)).toBe(false);
      await sleep(250);
      expect(await store.acquireLease(k, 'next', HOUR)).toBe(true);
    });

    it('sweeps expired windows and leases but keeps live ones', async () => {
      const store = make();
      const [short, live, lease] = [key('short'), key('live'), key('lease')];
      await atWindowStart(200);
      await store.add(short, 200, 1);
      await store.add(live, HOUR, 1);
      await store.acquireLease(lease, 'x', 100);
      await sleep(400);
      // Other suites may share the table, so only a lower bound is certain.
      expect(await store.sweep()).toBeGreaterThanOrEqual(2);
      expect(await store.read(live, HOUR)).toBe(1);
      expect(await store.acquireLease(lease, 'y', HOUR)).toBe(true);
    });
  });
}
