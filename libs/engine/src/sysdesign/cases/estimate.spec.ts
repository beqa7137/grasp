import { describe, expect, it } from 'vitest';
import { estimateVerdict } from './estimate.js';

describe('estimate verdicts', () => {
  it.each([
    [100_000, 'spot-on'],
    [150_000, 'spot-on'],
    [60_000, 'ballpark'],
    [230_000, 'ballpark'],
    [10_000, 'off'],
    [0, 'off'],
    [-5, 'off'],
  ] as const)('judges %s against 115,741 as %s', (guess, tone) => {
    expect(estimateVerdict(guess, 115_741).tone).toBe(tone);
  });

  it('reports how many times too high or too low a guess is', () => {
    expect(estimateVerdict(10, 100).factor).toBe(10);
    expect(estimateVerdict(1_000, 100).factor).toBe(10);
  });
});
