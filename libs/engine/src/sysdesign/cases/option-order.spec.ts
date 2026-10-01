import { describe, expect, it } from 'vitest';
import { CASE_STUDIES } from './index.js';
import { optionOrder } from './option-order.js';

const range = (n: number) => Array.from({ length: n }, (_, i) => i);

/** Pearson's chi-square of observed counts against an even spread. */
const chiSquare = (counts: readonly number[]) => {
  const expected = counts.reduce((a, b) => a + b, 0) / counts.length;
  return counts.reduce((sum, c) => sum + (c - expected) ** 2 / expected, 0);
};

/** Where each decision's recommended option is shown when every case is on a run named `attempt`, by slot. */
const bestSlots = (attempt: string) => {
  const slots = [0, 0, 0, 0, 0];
  for (const study of CASE_STUDIES)
    for (const [i, stage] of study.stages.entries()) {
      if (!stage.decision) continue;
      const best = stage.decision.options.findIndex((o) => o.best);
      slots[optionOrder(`${study.id}:${attempt}:${i}`, stage.decision.options.length).indexOf(best)]++;
    }
  return slots;
};

describe('case option order', () => {
  it('is a permutation of the option indexes, the same for the same seed', () => {
    for (let n = 0; n <= 6; n++)
      for (const seed of ['a', 'attempt-1:0', '3f2c-9a:12']) {
        const order = optionOrder(seed, n);
        expect([...order].sort((a, b) => a - b)).toEqual(range(n));
        expect(optionOrder(seed, n)).toEqual(order);
      }
  });

  it('differs between the stages of one attempt and between attempts', () => {
    const stages = new Set(range(12).map((i) => optionOrder(`attempt-1:${i}`, 4).join()));
    const attempts = new Set(range(12).map((a) => optionOrder(`attempt-${a}:0`, 4).join()));
    expect(stages.size).toBeGreaterThan(6);
    expect(attempts.size).toBeGreaterThan(6);
  });

  it('puts the first option in each slot about equally often across seeds', () => {
    // Critical chi-square values at p = 0.001 for 2 and 3 degrees of freedom; a fixed seed set keeps the test stable.
    for (const [n, critical] of [
      [3, 13.82],
      [4, 16.27],
    ] as const) {
      const slots = Array.from({ length: n }, () => 0);
      for (let s = 0; s < 8_000; s++) slots[optionOrder(`${s.toString(36)}-attempt:${s % 14}`, n).indexOf(0)]++;
      expect(chiSquare(slots), `${n} options: ${slots.join(', ')}`).toBeLessThan(critical);
    }
  });

  it('draws each of the 24 orders of four options about equally often, for seeds that differ in one character', () => {
    const orders = new Map<string, number>();
    for (let s = 1; s <= 24_000; s++) {
      const order = optionOrder(`url-shortener:00000000-0000-4000-8000-${String(s).padStart(12, '0')}:0`, 4).join();
      orders.set(order, (orders.get(order) ?? 0) + 1);
    }
    expect(orders.size).toBe(24);
    // The critical chi-square value at p = 0.001 for 23 degrees of freedom.
    expect(chiSquare([...orders.values()])).toBeLessThan(49.73);
  });

  it('spreads the recommended option over every slot across the catalog', () => {
    const decisions = CASE_STUDIES.flatMap((s) => s.stages.flatMap((stage) => (stage.decision ? [stage.decision] : [])));
    for (const attempt of ['attempt-1', '0b7d2c1e-6f1a-4c55-9a3e-2d4b8f9c1a70', 'audit-finished']) {
      const slots = bestSlots(attempt);
      expect(
        slots.slice(0, 4).every((count) => count > 0),
        `${attempt}: ${slots.join(', ')}`,
      ).toBe(true);
      expect(slots[0] / decisions.length, `${attempt}: ${slots.join(', ')}`).toBeLessThan(0.4);
    }
  });
});
