import { Logger, ServiceUnavailableException } from '@nestjs/common';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import { MemoryCoordinationStore } from '../persistence/memory.stores.js';
import { MemorySpendStore } from '../persistence/memory-spend.store.js';
import { recordFailure } from '../observability/failure-signals.js';
import { SpendGuard } from './spend-guard.js';

vi.mock('../observability/failure-signals.js', () => ({ recordFailure: vi.fn() }));

const DAY_MS = 86_400_000;

beforeEach(() => {
  vi.mocked(recordFailure).mockClear();
  vi.spyOn(Logger.prototype, 'error').mockImplementation(() => {});
  vi.spyOn(Logger.prototype, 'warn').mockImplementation(() => {});
});
afterEach(() => vi.restoreAllMocks());

function setup(budget: number | null = 1, now = Date.now) {
  const coordination = new MemoryCoordinationStore(now);
  const store = new MemorySpendStore(coordination, now);
  return { coordination, store, guard: new SpendGuard(budget, store) };
}

it('reserves before work, rejects concurrent overcommitment and frees only proven unused cost', async () => {
  const { guard, store } = setup();
  const peer = new SpendGuard(1, store);
  const results = await Promise.allSettled([guard.reserve(0.4), peer.reserve(0.4), guard.reserve(0.4)]);
  expect(results.map((r) => r.status)).toEqual(['fulfilled', 'fulfilled', 'rejected']);
  expect(await guard.spentToday()).toBe(0.8);
  const held = (results[0] as PromiseFulfilledResult<Awaited<ReturnType<typeof guard.reserve>>>).value;
  await guard.settle(held, 0.1);
  await peer.reserve(0.4);
  await peer.settle(held, 0);
  expect(recordFailure).not.toHaveBeenCalled();
  expect(await guard.spentToday()).toBe(0.9);
});

it('refuses a single request whose maximum exceeds the remaining budget', async () => {
  const { guard } = setup();
  await expect(guard.reserve(1.000001)).rejects.toThrow(/usage limit/);
  expect(await guard.spentToday()).toBe(0);
  await guard.reserve(1);
  await expect(guard.reserve(0.000001)).rejects.toThrow(ServiceUnavailableException);
});

it('attributes delayed settlements to their original UTC day', async () => {
  let now = Date.parse('2026-09-23T23:59:59Z');
  const { guard } = setup(1, () => now);
  const yesterday = await guard.reserve(0.9);
  now += 2_000;
  expect(await guard.spentToday()).toBe(0);
  await guard.reserve(0.8);
  await guard.settle(yesterday, 0.2);
  expect(await guard.spentToday()).toBe(0.8);
  now -= 2_000;
  expect(await guard.spentToday()).toBe(0.2);
});

it('retains legacy spend while charging new calls exactly once', async () => {
  const { coordination, guard } = setup();
  await coordination.add('ai-spend-usd', DAY_MS, 0.6);
  const reservation = await guard.reserve(0.4);
  await guard.settle(reservation, 0.1);
  expect(await guard.spentToday()).toBe(0.7);
  expect(await coordination.read('ai-spend-usd', DAY_MS)).toBe(0.6);
  await coordination.add('ai-spend-usd', DAY_MS, 0.2);
  await expect(guard.reserve(0.2)).rejects.toThrow(/usage limit/);
});

it('uses durable holds without a ceiling too', async () => {
  const { guard, store } = setup(null);
  const held = await guard.reserve(10_000);
  expect(await guard.spentToday()).toBe(10_000);
  await guard.settle(held, 1_000);
  expect(await guard.spentToday()).toBe(1_000);
  vi.spyOn(store, 'reserve').mockRejectedValue(new Error('private-storage-detail'));
  await expect(guard.reserve(1)).rejects.toThrow(/temporarily unavailable/);
});

it('rounds budgets down and liability up without admitting fractional-micro excess', async () => {
  const { guard } = setup(0.0000019);
  await expect(guard.reserve(0.0000011)).rejects.toThrow(/usage limit/);
  const held = await guard.reserve(0.0000001);
  expect(await guard.spentToday()).toBe(0.000001);
  await guard.settle(held, 0.00000001);
  expect(await guard.spentToday()).toBe(0.000001);
});

it.each([NaN, Infinity, -1, 0, Number.MAX_SAFE_INTEGER])('never admits an invalid maximum %s', async (cost) => {
  const { guard, store } = setup();
  const reserve = vi.spyOn(store, 'reserve');
  await expect(guard.reserve(cost)).rejects.toThrow(ServiceUnavailableException);
  expect(reserve).not.toHaveBeenCalled();
});

it.each([null, NaN, Infinity, -1, Number.MAX_SAFE_INTEGER])('keeps uncertain liability for invalid actual cost %s', async (cost) => {
  const { guard } = setup();
  const held = await guard.reserve(0.9);
  await expect(guard.settle(held, cost)).resolves.toBeUndefined();
  expect(await guard.spentToday()).toBe(0.9);
  expect(Logger.prototype.warn).toHaveBeenCalledWith({ operation: 'interview.unknown-spend' });
});

it('records an over-bound charge as debt and emits only a fixed diagnostic', async () => {
  const { guard } = setup();
  const held = await guard.reserve(0.9);
  await guard.settle(held, 1.1);
  expect(await guard.spentToday()).toBe(1.1);
  await expect(guard.reserve(0.01)).rejects.toThrow(/usage limit/);
  expect(Logger.prototype.error).toHaveBeenCalledWith({ operation: 'interview.spend-bound-exceeded' });
});

it('preserves the hold on storage failure without leaking queries, identifiers or parameters', async () => {
  const { store, guard } = setup();
  const held = await guard.reserve(0.5);
  const failure = new DrizzleQueryError(
    'select private_spend from learner_secrets where token = $1',
    ['private-learner-token'],
    Object.assign(new Error('private-query-details'), { code: '42P01' }),
  );
  vi.spyOn(store, 'reserve').mockRejectedValue(failure);
  vi.spyOn(store, 'settle').mockRejectedValue(failure);
  await expect(guard.reserve(0.1)).rejects.toThrow(ServiceUnavailableException);
  await expect(guard.settle(held, 0.1)).resolves.toBeUndefined();
  expect(await guard.spentToday()).toBe(0.5);
  expect(Logger.prototype.error).toHaveBeenNthCalledWith(1, {
    operation: 'interview.reserve-spend',
    category: 'database',
    code: '42P01',
  });
  expect(Logger.prototype.error).toHaveBeenNthCalledWith(2, {
    operation: 'interview.settle-spend',
    category: 'database',
    code: '42P01',
  });
  expect(vi.mocked(recordFailure).mock.calls).toEqual([
    ['ai.spend-store', failure],
    ['ai.spend-store', failure],
  ]);
});
