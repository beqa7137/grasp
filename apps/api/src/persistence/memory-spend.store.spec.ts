import { randomUUID } from 'node:crypto';
import { MemoryCoordinationStore } from './memory.stores.js';
import { MemorySpendStore } from './memory-spend.store.js';
import { spendStoreContract } from './spend-store.contract.js';
import { SPEND_DAY_MS, SPEND_HISTORY_MS, legacySpendMicros } from './spend.store.js';

spendStoreContract('Memory', () => {
  const legacy = new MemoryCoordinationStore();
  const store = new MemorySpendStore(legacy);
  return { store, other: store, legacy };
});

describe('Memory spend day boundaries', () => {
  let now: number;
  let store: MemorySpendStore;

  beforeEach(() => {
    now = Date.parse('2026-09-26T23:59:59.999Z');
    const legacy = new MemoryCoordinationStore(() => now);
    store = new MemorySpendStore(legacy, () => now);
  });

  it('settles an old reservation on its admission day after midnight', async () => {
    const id = randomUUID();
    expect(await store.reserve(id, 100, 100)).toMatchObject({ day: '2026-09-26' });
    now++;
    expect(await store.spentToday()).toBe(0);
    const today = randomUUID();
    await store.reserve(today, 100, 100);
    await store.settle(id, 500);
    expect(await store.spentToday()).toBe(100);
    await store.settle(today, 40);
    expect(await store.spentToday()).toBe(40);
    now = Date.parse('2026-09-26T12:00:00Z');
    expect(await store.spentToday()).toBe(500);
  });

  it('keeps unresolved holds until history expires and ignores very late settlement', async () => {
    const id = randomUUID();
    await store.reserve(id, 100, null);
    now = Date.parse('2026-09-27T00:00:00Z') + SPEND_HISTORY_MS - 1;
    expect(await store.sweep()).toBe(0);
    const recent = randomUUID();
    await store.reserve(recent, 200, null);
    now++;
    expect(await store.sweep()).toBe(2);
    await store.settle(id, 500);
    now -= SPEND_DAY_MS;
    expect(await store.spentToday()).toBe(200);
  });
});

describe('Legacy dollar conversion', () => {
  it.each([
    [0, 0n],
    [0.1, 100_000n],
    [0.000_000_1, 1n],
    [0.000_001_1, 2n],
    [Number.MIN_VALUE, 1n],
    [1.000_001, 1_000_001n],
    [1_000_000, 1_000_000_000_000n],
  ])('rounds %s dollars upward without binary multiplication drift', (dollars, micros) => {
    expect(legacySpendMicros(dollars)).toBe(micros);
  });
});
