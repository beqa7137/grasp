import { describe, expect, it } from 'vitest';
import { RunningPercentile } from './running-percentile.js';

describe('RunningPercentile', () => {
  it('gives what sorting every value so far and indexing floor(n * q) gives, at every step', () => {
    let seed = 7;
    const random = () => ((seed = (seed * 16807) % 2147483647) / 2147483647) * 100;
    for (const q of [0.5, 0.99]) {
      const p = new RunningPercentile(q);
      const seen: number[] = [];
      expect(p.value()).toBeNull();
      for (let i = 0; i < 2_000; i++) {
        const v = i % 50 === 0 ? 42 : Math.round(random());
        p.add(v);
        seen.push(v);
        const sorted = [...seen].sort((a, b) => a - b);
        expect(p.value()).toBe(sorted[Math.floor(sorted.length * q)]);
      }
    }
  });
});
