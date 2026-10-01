import { describe, expect, it } from 'vitest';
import { bytesRate } from '../sysdesign/cases/flags/propagation.js';
import { generateQuestion, getReviewItem } from './items.js';

const SEEDS = Array.from({ length: 40 }, (_, i) => i * 7_919 + 3);
const IDS = [
  'rollout-overlap',
  'rollout-stickiness',
  'random-flicker',
  'ruleset-bandwidth',
  'cdn-staleness',
  'flag-outage',
  'guardrail-cohort',
];
const right = (id: string, seed: number) => {
  const q = generateQuestion(`sd:${id}`, seed);
  return { q, answer: q.choices[q.answer] };
};
const numbers = (text: string) => [...text.matchAll(/(\d[\d,]*(?:\.\d+)?)/g)].map((m) => Number(m[1].replaceAll(',', '')));

describe('feature flag review items', () => {
  it('reviews the case under its topics', () => {
    expect(IDS.map((id) => getReviewItem(`sd:${id}`)?.topic)).toEqual([
      'sd-consistency',
      'sd-consistency',
      'sd-consistency',
      'sd-realtime',
      'sd-cdn',
      'sd-reliability',
      'sd-reliability',
    ]);
  });

  it('offers four distinct choices with one right answer on every seed', () => {
    for (const id of IDS)
      for (const seed of SEEDS) {
        const { q } = right(id, seed);
        expect(new Set(q.choices).size, `${id} ${seed}`).toBe(4);
        expect(q.answer).toBeGreaterThanOrEqual(0);
      }
  });

  it('works the numbers out from the stated settings', () => {
    for (const seed of SEEDS) {
      const overlap = right('rollout-overlap', seed);
      const [total, a, b] = numbers(overlap.q.prompt);
      expect(overlap.answer).toBe(`about ${Math.round(total * (a / 100) * (b / 100)).toLocaleString('en-US')} users`);

      const flicker = right('random-flicker', seed);
      const [p, requests] = numbers(flicker.q.prompt).map(Number);
      const share = 1 - (p / 100) ** requests - (1 - p / 100) ** requests;
      expect(flicker.answer).toBe(`About ${Math.round(share * 100)}%`);

      const bandwidth = right('ruleset-bandwidth', seed);
      const [instances, mb, interval] = numbers(bandwidth.q.prompt);
      expect(bandwidth.answer).toBe(bytesRate((instances / interval) * mb * 1e6));

      const stale = right('cdn-staleness', seed);
      expect(stale.answer).toBe(`${2 * numbers(stale.q.prompt)[0]} s`);

      const guard = right('guardrail-cohort', seed);
      const [base, treated, exposure] = numbers(guard.q.prompt).map((v) => v / 100);
      expect(guard.answer).toBe(`${Number(((base * (1 - exposure) + treated * exposure) * 100).toFixed(4))}%`);

      expect(right('rollout-stickiness', seed).answer).toBe('All of them');
    }
  });
});
