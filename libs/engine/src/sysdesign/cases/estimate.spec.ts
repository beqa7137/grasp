import { describe, expect, it } from 'vitest';
import { estimateVerdict, parseAmount } from './estimate.js';

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

describe('estimate amounts', () => {
  it.each([
    ['120000', 120_000],
    ['120,000', 120_000],
    ['120k', 120_000],
    [' 1.2M ', 1_200_000],
    ['3b', 3_000_000_000],
    ['91', 91],
  ])('reads %s as %s', (raw, value) => {
    expect(parseAmount(raw)).toBe(value);
  });

  it.each(['', 'lots', '-5', '0', '1e5', '12 k m'])('rejects %j', (raw) => {
    expect(parseAmount(raw)).toBeNull();
  });
});
