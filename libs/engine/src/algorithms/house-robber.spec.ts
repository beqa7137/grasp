import { describe, expect, it } from 'vitest';
import { houseRobber as algo } from './house-robber.js';
import { correctChoices, predictions, resultOf, tracerFixture } from './tracer.fixture.js';
import { InputError, type Frame } from './types.js';

const { traceOf, randomInputs } = tracerFixture(algo);

const SAMPLES = [
  algo.defaultInput,
  { nums: [5] },
  { nums: [0, 0, 0] },
  { nums: [4, 4, 0, 4] },
  { nums: [99, 1, 1, 99] },
  ...randomInputs(2026, 40),
];

/** dp fills left to right, the window spans the houses the cell being filled covers (none for dp[0]), and the vars echo the table. */
const inSync = (nums: number[], frames: Frame[]) =>
  frames.every(({ vars, array, table }) => {
    const row = table!.cells[0];
    const filled = row.filter((v) => v !== null).length;
    const cell = table!.active?.[1];
    const i = vars['i'] as number | null;
    const followsCell = !cell
      ? array!.active!.length === 0 && array!.window === undefined
      : array!.window![1] === cell - 1 && array!.active![0] === cell - 1 && (i === null || i === cell);
    const readsTwoBack =
      i === null
        ? table!.deps === undefined && Object.keys(array!.pointers).length === 0
        : JSON.stringify(table!.deps) === `[[0,${i - 2}],[0,${i - 1}]]` &&
          array!.pointers['i - 1'] === i - 1 &&
          vars['dp[i - 2]'] === row[i - 2] &&
          vars['dp[i - 1]'] === row[i - 1] &&
          vars['dp[i]'] === row[i];
    return row.length === nums.length + 1 && row.slice(0, filled).every((v) => v !== null) && followsCell && readsTwoBack;
  });

/** Each answer is what dp[i] becomes on the next frame, and the question frame does not show it yet. */
const answersConfirmed = (frames: Frame[]) =>
  frames.every((f, k) => {
    if (!f.predict) return true;
    const i = f.vars['i'] as number;
    const before = f.table!.cells[0];
    const value = frames[k + 1].table!.cells[0][i];
    const chosen = f.predict.choices[f.predict.answer];
    const matches = /^\d+$/.test(chosen) ? chosen === String(value) : chosen.startsWith('Rob') === (value !== before[i - 1]);
    return before[i] === null && frames[k + 1].line === 7 && matches;
  });

/** The highlighted houses are never neighbours, add up to the answer, and each one lights up the dp cell that counted it. */
const lootAddsUp = (nums: number[], frames: Frame[]) => {
  const { array, table } = frames[frames.length - 1];
  const robbed = array!.found!;
  return (
    robbed.every((h, k) => k === 0 || h - robbed[k - 1] >= 2) &&
    robbed.reduce((sum, h) => sum + nums[h], 0) === resultOf(frames) &&
    JSON.stringify(table!.path) === JSON.stringify(robbed.map((h) => [0, h + 1]))
  );
};

describe('house-robber', () => {
  it('traces the default input to 16 by robbing houses 0, 2 and 5', () => {
    const frames = traceOf(algo.defaultInput);
    expect(frames).toHaveLength(19);
    expect(frames[0].line).toBe(3);
    expect(frames.at(-1)!.line).toBe(9);
    expect(resultOf(frames)).toBe(16);
    expect(correctChoices(frames)).toEqual(['Rob it', '11', 'Skip it', '12', 'Rob it']);
    expect([...predictions(frames)[1].choices].sort()).toEqual(['11', '16', '7', '9']);
    const end = frames.at(-1)!;
    expect(end.table!.cells).toEqual([[0, 2, 7, 11, 11, 12, 16]]);
    expect(end.array!.found).toEqual([0, 2, 5]);
    expect(end.note).toContain('O(1) space');
  });

  it('keeps the dp row, the house pointer and the variables in sync', () => {
    for (const input of SAMPLES) expect(inSync(algo.validate(input).nums, traceOf(input))).toBe(true);
  });

  it('asks predictions that the next frame confirms', () => {
    for (const input of SAMPLES) expect(answersConfirmed(traceOf(input))).toBe(true);
  });

  it('highlights a set of non-adjacent houses worth the answer', () => {
    for (const input of SAMPLES) expect(lootAddsUp(algo.validate(input).nums, traceOf(input))).toBe(true);
  });

  it('covers robbing, skipping, ties and plain dp values on random inputs', () => {
    const seen = new Set<string>();
    for (const input of randomInputs(7, 80)) {
      for (const { choices, answer, explain } of predictions(traceOf(input))) {
        const chosen = choices[answer];
        if (chosen.startsWith('Rob')) seen.add('rob');
        else if (chosen.startsWith('Skip')) seen.add('skip');
        else seen.add(explain.includes('a tie') ? 'tie' : 'value');
      }
    }
    expect([...seen].sort()).toEqual(['rob', 'skip', 'tie', 'value']);
  });

  it('handles one house and a street of empty houses without asking', () => {
    const single = traceOf({ nums: [5] });
    expect(resultOf(single)).toBe(5);
    expect(single.at(-1)!.array!.found).toEqual([0]);
    const empty = traceOf({ nums: [0, 0, 0] });
    expect(resultOf(empty)).toBe(0);
    expect(empty.at(-1)!.array!.found).toEqual([]);
    expect(predictions(single).length + predictions(empty).length).toBe(0);
  });

  it('rejects streets that would not fit the view', () => {
    expect(() => algo.validate({ nums: Array(11).fill(1) })).toThrow(new InputError('nums can hold at most 10 houses'));
    expect(() => algo.validate({ nums: [3, -1] })).toThrow(new InputError('nums must contain integers between 0 and 99'));
    expect(() => algo.validate({ nums: [3, 100] })).toThrow(new InputError('nums must contain integers between 0 and 99'));
    expect(algo.validate({ nums: Array(10).fill(99) }).nums).toHaveLength(10);
  });
});
