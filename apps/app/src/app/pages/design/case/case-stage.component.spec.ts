import { parseAmount } from './case-stage.component';

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
