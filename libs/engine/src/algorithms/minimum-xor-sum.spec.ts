import { describe, expect, it } from 'vitest';
import { rangeOf } from './input.js';
import { minimumXorSum as algo } from './minimum-xor-sum.js';
import { correctChoices, predictions, resultOf, tracerFixture } from './tracer.fixture.js';
import { InputError, type Frame } from './types.js';

const { traceOf, randomInputs } = tracerFixture(algo);

const SAMPLES = [
  algo.defaultInput,
  { nums1: [0, 0, 0], nums2: [0, 0, 0] },
  { nums1: [7, 7, 7, 7], nums2: [1, 2, 4, 8] },
  { nums1: [99, 0, 50], nums2: [0, 99, 50] },
  ...randomInputs(2026, 200),
];

const OUTCOMES = ['set', 'lower', 'keep'] as const;

const kindOf = (f: Frame) => {
  const prompt = f.predict!.prompt;
  if (prompt.includes('Which index i')) return 'which';
  if (prompt.includes('`mask | (1 << j)`')) return 'to';
  if (prompt.includes('What does the min do')) return OUTCOMES[f.predict!.answer];
  if (prompt.includes('after the min')) return 'value';
  return 'return';
};

/** Each answer is what the frame after the question shows: the next index, the new mask, the stored value or the result. */
const answersConfirmed = (frames: Frame[]) =>
  frames.every((f, k) => {
    if (!f.predict) return true;
    const next = frames[k + 1];
    const chosen = f.predict.choices[f.predict.answer];
    const before = f.vars['dp[to]'];
    const confirmed = {
      which: () => `i = ${next.vars['i']}` === chosen,
      to: () => next.vars['to'] === chosen,
      set: () => before === '∞' && next.vars['dp[to]'] !== '∞',
      lower: () => before !== '∞' && Number(next.vars['dp[to]']) < Number(before),
      keep: () => next.vars['dp[to]'] === before,
      value: () => next.vars['dp[to]'] === chosen,
      return: () => String(next.vars['result']) === chosen,
    }[kindOf(f)]();
    return confirmed && next.line === f.line && !next.predict;
  });

/** The least XOR sum of pairing nums1[0..k - 1], in order, with the k values of nums2 whose bits mask sets, by every order. */
function bestFor(nums1: number[], nums2: number[], mask: number): number {
  const picks = rangeOf(0, nums2.length - 1).filter((j) => (mask >> j) & 1);
  const orders = (rest: number[]): number[][] =>
    rest.length ? rest.flatMap((x, k) => orders([...rest.slice(0, k), ...rest.slice(k + 1)]).map((order) => [x, ...order])) : [[]];
  return Math.min(...orders(picks).map((order) => order.reduce((sum, j, i) => sum + (nums1[i] ^ nums2[j]), 0)));
}

describe('minimum-xor-sum', () => {
  it('traces the default input: three masks set, two lowered or kept, and a least XOR sum of 8', () => {
    const frames = traceOf(algo.defaultInput);
    expect(frames).toHaveLength(33);
    expect(correctChoices(frames)).toEqual([
      '010 (2)',
      'Set it: the first way to reach this mask',
      'i = 1',
      'Keep it: the stored value is no bigger',
      '110 (6)',
      'i = 1',
      '8',
      'Lower it: cheaper than the stored value',
      '8',
    ]);
    expect(resultOf(frames)).toBe(8);
    const last = frames[frames.length - 1];
    expect(last.array!.values).toEqual(['0', '4', '2', '7', '5', '8', '6', '8']);
    expect(last.array!.found).toEqual([7]);
  });

  it('fills every mask with the least XOR sum of its values, as trying every order finds', () => {
    for (const input of SAMPLES) {
      const { nums1, nums2 } = algo.validate(input);
      const values = traceOf(input).at(-1)!.array!.values;
      expect(values, JSON.stringify(input)).toEqual(rangeOf(0, values.length - 1).map((mask) => String(bestFor(nums1, nums2, mask))));
    }
  });

  it('asks predictions that the next frame confirms', () => {
    for (const input of SAMPLES) expect(answersConfirmed(traceOf(input)), JSON.stringify(input)).toBe(true);
  });

  it('shows mask, the bit j sets and the new mask in binary, as the variables name them', () => {
    for (const input of SAMPLES)
      for (const f of traceOf(input)) {
        const [mask, bit, to] = f.table!.cells.map((row) => row.at(-1));
        expect(mask === null ? null : `${f.table!.cells[0].slice(0, -1).join('')} (${mask})`).toBe(f.vars['mask']);
        expect(bit).toBe(f.vars['j'] === null ? null : 1 << Number(f.vars['j']));
        expect(to === null ? null : `${f.table!.cells[2].slice(0, -1).join('')} (${to})`).toBe(f.vars['to']);
      }
  });

  it('offers at least three different choices at every checkpoint', () => {
    for (const input of SAMPLES)
      for (const p of predictions(traceOf(input))) {
        expect(p.choices.length, `${JSON.stringify(input)}: ${p.prompt}`).toBeGreaterThanOrEqual(3);
        expect(new Set(p.choices).size, p.prompt).toBe(p.choices.length);
      }
  });

  it('asks every kind of question, with each option of the min checkpoint right at least once, and every next index', () => {
    const frames = randomInputs(7, 150).flatMap((input) => traceOf(input).filter((f) => f.predict));
    expect([...new Set(frames.map(kindOf))].sort()).toEqual(['keep', 'lower', 'return', 'set', 'to', 'value', 'which']);
    const indices = new Set(frames.filter((f) => kindOf(f) === 'which').map((f) => f.predict!.choices[f.predict!.answer]));
    expect([...indices].sort()).toEqual(['i = 0', 'i = 1', 'i = 2', 'i = 3']);
  });

  it('draws the masks and transitions it asks about from the input, so runs of one size differ', () => {
    const asked = (kind: string) =>
      new Set(
        randomInputs(5, 60)
          .filter((input) => input.nums1.length === 4)
          .map((input) =>
            traceOf(input)
              .flatMap((f, k) => (f.predict && kindOf(f) === kind ? [k] : []))
              .join(','),
          ),
      );
    expect(asked('which').size).toBeGreaterThanOrEqual(10);
    expect(asked('to').size).toBeGreaterThanOrEqual(10);
    expect(traceOf(algo.defaultInput)).toEqual(traceOf(algo.defaultInput));
  });

  it('ends with the full mask in the table and the variables, not blank rows', () => {
    for (const input of SAMPLES) {
      const last = traceOf(input).slice(-2);
      const full = (1 << input.nums1.length) - 1;
      for (const f of last) expect(f.table!.cells[0].at(-1)).toBe(full);
    }
  });

  it('stays short enough to step through: 33 frames for three values and at most 70 for four', () => {
    for (const input of SAMPLES) expect(traceOf(input).length).toBeLessThanOrEqual(input.nums1.length === 3 ? 33 : 70);
  });

  it('rejects bad input with clear InputErrors', () => {
    const rejects = (input: unknown, message: string) => expect(() => algo.validate(input)).toThrow(new InputError(message));
    rejects({ nums1: [1, 2], nums2: [3, 4] }, 'nums1 must hold 3 or 4 values');
    rejects({ nums1: [1, 2, 3, 4, 5], nums2: [1, 2, 3, 4, 5] }, 'nums1 must hold 3 or 4 values');
    rejects({ nums1: [1, 2, 3], nums2: [1, 2] }, 'nums2 must hold as many values as nums1');
    rejects({ nums1: [1, 2, 100], nums2: [1, 2, 3] }, 'nums1 must contain integers between 0 and 99');
    rejects({ nums1: [1, 2, 3], nums2: [-1, 2, 3] }, 'nums2 must contain integers between 0 and 99');
  });
});
