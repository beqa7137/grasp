import { describe, expect, it } from 'vitest';
import { subarraySumPrefix as algo } from './subarray-sum-prefix.js';
import { correctChoices, resultOf, tracerFixture } from './tracer.fixture.js';
import { InputError, type Frame } from './types.js';

type Input = ReturnType<typeof algo.validate>;

const { traceOf, randomInputs } = tracerFixture(algo);
const prefixesOf = (nums: number[]) => nums.reduce((pre, x) => [...pre, pre[pre.length - 1] + x], [0]);

const SAMPLES: Input[] = [
  algo.defaultInput,
  { nums: [3], k: 3 },
  { nums: [0, 0, 0], k: 0 },
  { nums: [1, 2], k: 7 },
  { nums: [-2, 2, -2, 2], k: 0 },
  ...randomInputs(2026, 30),
];

/** The count row holds the prefixes recorded so far, p and total match the frame's step, and a band is a real subarray summing to k. */
const inSync = ({ nums, k }: Input, frames: Frame[]) => {
  const pre = prefixesOf(nums);
  let recorded = 1;
  return frames.every((f) => {
    if (f.line === 7) recorded++;
    const i = f.vars['i'] === null ? -1 : Number(f.vars['i']);
    const counts = new Map<number, number>();
    for (const value of pre.slice(0, recorded)) counts.set(value, (counts.get(value) ?? 0) + 1);
    const keys = [...counts.keys()].sort((a, b) => a - b);
    const { table, array, output, vars } = f;
    const p = f.predict && f.line === 5 ? pre[i] : pre[Math.min(i + 1, nums.length)];
    const band = array!.window;
    return (
      table!.colLabels.join() === keys.join() &&
      table!.cells[0].join() === keys.map((key) => counts.get(key)).join() &&
      vars['p'] === p &&
      vars['total'] === output!.items.length &&
      Object.values(array!.pointers).every((index) => index === i && i < nums.length) &&
      (!band || (band[1] === i && pre[i + 1] - pre[band[0]] === k && array!.found!.length === i - band[0] + 1))
    );
  });
};

/** The line 6 frames right after a count question, which show its outcome. */
const lookupFrames = (frames: Frame[], asked: number) =>
  frames.slice(
    asked + 1,
    frames.findIndex((f, n) => n > asked && f.line !== 6),
  );

/** A prefix answer is the next p; a count answer is how much total grows and how many subarrays the next frames show. */
const answersConfirmed = (frames: Frame[]) =>
  frames.every((f, n) => {
    if (!f.predict) return true;
    const chosen = Number(f.predict.choices[f.predict.answer]);
    const next = frames[n + 1];
    if (f.line === 5) return next.vars['p'] === chosen;
    const bands = lookupFrames(frames, n).filter((g) => g.array!.window);
    return Number(next.vars['total']) - Number(f.vars['total']) === chosen && bands.length === chosen;
  });

describe('subarray-sum-prefix', () => {
  it('traces the default input: five subarrays, two of them through a prefix the -1 repeats', () => {
    const frames = traceOf(algo.defaultInput);
    expect(frames).toHaveLength(30);
    expect(frames[0]).toMatchObject({ line: 2, table: { colLabels: ['0'], cells: [[1]], active: [0, 0] } });
    expect(correctChoices(frames)).toEqual(['0', '3', '1', '1', '3', '1', '0', '2']);
    const last = frames[frames.length - 1];
    expect(last.line).toBe(9);
    expect(resultOf(frames)).toBe(5);
    expect(last.output!.items).toEqual(['0..1', '1..2', '0..3', '2..5', '4..5']);
    expect(last.table).toMatchObject({ colLabels: ['0', '1', '3', '4', '5', '6'], cells: [[1, 1, 2, 1, 1, 1]] });
  });

  it('keeps the count row, p, total and the subarray band in sync', () => {
    for (const input of SAMPLES) expect(inSync(algo.validate(input), traceOf(input))).toBe(true);
  });

  it('asks predictions that the following frames confirm', () => {
    for (const input of SAMPLES) expect(answersConfirmed(traceOf(input))).toBe(true);
  });

  it('counts a subarray that starts at index 0 through the seed, offering the missed seed as a distractor', () => {
    const frames = traceOf({ nums: [3], k: 3 });
    const asked = frames.find((f) => f.predict)!.predict!;
    expect(resultOf(frames)).toBe(1);
    expect(asked.choices[asked.answer]).toBe('1');
    expect(asked.choices).toContain('0');
    expect(asked.explain).toContain('only the seed');
    expect(frames.find((f) => f.array!.window)!.note).toContain('counted by the seed');
  });

  it('never counts the empty subarray, and reports no match when nothing sums to k', () => {
    expect(resultOf(traceOf({ nums: [0, 0, 0], k: 0 }))).toBe(6);
    const none = traceOf({ nums: [1, 2], k: 7 });
    expect(resultOf(none)).toBe(0);
    expect(none.some((f) => f.array!.window)).toBe(false);
  });

  it('covers every kind of answer on random inputs, in varying positions', () => {
    const seen = new Set<string>();
    for (const input of randomInputs(7, 80)) {
      const frames = traceOf(input);
      expect(Number(resultOf(frames))).toBeGreaterThanOrEqual(1);
      for (const f of frames) {
        if (!f.predict) continue;
        const { choices, answer, explain } = f.predict;
        seen.add(`position ${answer}`);
        if (f.line === 5) seen.add(explain.includes('sums to 0') ? 'prefix repeats' : 'prefix new');
        else seen.add(`count ${Math.min(Number(choices[answer]), 2)}${explain.includes('seed') ? ' with seed' : ''}`);
      }
    }
    expect([...seen]).toEqual(
      expect.arrayContaining([
        'count 0',
        'count 1',
        'count 1 with seed',
        'count 2',
        'position 0',
        'position 1',
        'position 2',
        'position 3',
        'prefix new',
        'prefix repeats',
      ]),
    );
  });

  it('rejects inputs that would not fit the count row', () => {
    expect(() => algo.validate({ nums: [1, 2, 3, 4, 5, 6, 7, 8, 9], k: 3 })).toThrow(
      new InputError('nums can hold at most 8 numbers, so the count map fits on screen'),
    );
    expect(() => algo.validate({ nums: [1, 10], k: 3 })).toThrow('nums must contain integers between -9 and 9');
    expect(() => algo.validate({ nums: [1, 2], k: 1.5 })).toThrow('k must be an integer');
  });
});
