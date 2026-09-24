import { describe, expect, it } from 'vitest';
import { mulberry32 } from './input.js';
import { twoSumHash as algo } from './two-sum-hash.js';
import type { Frame } from './types.js';

type Input = { nums: number[]; target: number };

const EM_DASH = '\u2014';
const YES = 'Yes: return the pair';
const NO = 'No: store x and keep scanning';

const traceOf = (input: unknown) => algo.trace(algo.validate(input));
const resultOf = (frames: Frame[]) => frames[frames.length - 1].vars['result'];
const correctChoices = (frames: Frame[]) => frames.flatMap((f) => (f.predict ? [f.predict.choices[f.predict.answer]] : []));
const randomInputs = (seed: number, count: number) => {
  const rand = mulberry32(seed);
  return Array.from({ length: count }, () => algo.randomInput(rand));
};
const pairCount = (nums: number[], target: number) =>
  nums.reduce((count, x, i) => count + nums.slice(i + 1).filter((y) => x + y === target).length, 0);

const SAMPLES: Input[] = [
  algo.defaultInput,
  { nums: [1, 2, 4], target: 10 },
  { nums: [3, 2, 4], target: 6 },
  { nums: [2, 3, 4], target: 6 },
  { nums: [3, 3], target: 6 },
  { nums: [4, 1, 4, 6], target: 10 },
  { nums: [5], target: 10 },
  ...randomInputs(2026, 30),
];

/** seen holds exactly the shaded prefix of nums (a repeated value keeps its newest index), and the pointer and variables follow i. */
const inSync = ({ nums, target }: Input, frames: Frame[]) =>
  frames.every(({ vars, array, set }) => {
    const stored = array!.window ? array!.window[1] + 1 : 0;
    const expected = new Map(nums.slice(0, stored).map((x, i) => [x, i]));
    const i = vars['i'] as number | null;
    return (
      JSON.stringify(set!.entries) === JSON.stringify([...expected].map(([x, k]) => `${x} → ${k}`)) &&
      (array!.pointers['i'] ?? null) === i &&
      vars['x'] === (i === null ? null : nums[i]) &&
      (vars['need'] === null || vars['need'] === target - (vars['x'] as number))
    );
  });

/** A lookup answer matches whether the trace returns at this i, a store answer is the next map, and a pair answer is the result. */
const answersConfirmed = (frames: Frame[]) =>
  frames.every((f, k) => {
    if (!f.predict) return true;
    const { prompt, choices, answer } = f.predict;
    const chosen = choices[answer];
    const last = frames[frames.length - 1];
    if (prompt.endsWith('in seen?')) return (chosen === YES) === (last.vars['i'] === f.vars['i'] && resultOf(frames) !== '[]');
    if (prompt.endsWith('after this step?')) return chosen === `{${frames[k + 1].set!.entries.join(', ')}}`;
    return chosen === resultOf(frames);
  });

describe('two-sum-hash', () => {
  it('traces the default input: three misses, then 5 finds 11 at index 2 and the scan stops', () => {
    const frames = traceOf(algo.defaultInput);
    const last = frames[frames.length - 1];
    expect(frames).toHaveLength(21);
    expect(correctChoices(frames)).toEqual(['{3 → 0}', NO, NO, YES, '[2, 3]']);
    expect(last.line).toBe(5);
    expect(resultOf(frames)).toBe('[2, 3]');
    expect(last.array).toMatchObject({ pointers: { i: 3 }, window: [0, 2], found: [2, 3], settled: [4, 5] });
    expect(last.set).toMatchObject({ entries: ['3 → 0', '8 → 1', '11 → 2'], active: '11 → 2' });
  });

  it('returns [] with a closing note when no two numbers add up to target', () => {
    const frames = traceOf({ nums: [1, 2, 4], target: 10 });
    const last = frames[frames.length - 1];
    expect(resultOf(frames)).toBe('[]');
    expect(last.line).toBe(8);
    expect(last.note).toContain('no two numbers add up to 10, so return []');
    expect(last.array!.found).toEqual([]);
    expect(resultOf(traceOf({ nums: [5], target: 10 }))).toBe('[]');
  });

  it('checks before storing, so a number never pairs with itself', () => {
    const asked = traceOf({ nums: [2, 3, 4], target: 6 });
    const firstLookup = asked.find((f) => f.predict?.prompt.endsWith('in seen?'))!.predict!;
    expect(resultOf(asked)).toBe('[0, 2]');
    expect(firstLookup.prompt).toContain('x = nums[1] = 3, so need = 3');
    expect(firstLookup.choices[firstLookup.answer]).toBe(NO);
    expect(firstLookup.explain).toContain('keeps 3 from pairing with itself');

    const atStart = traceOf({ nums: [3, 2, 4], target: 6 });
    expect(resultOf(atStart)).toBe('[1, 2]');
    expect(atStart.some((f) => f.line === 5 && f.note.includes('stops 3 from pairing with itself'))).toBe(true);
    expect(resultOf(traceOf({ nums: [3, 3], target: 6 }))).toBe('[0, 1]');
  });

  it('moves a repeated value to its newest index and returns that index', () => {
    const frames = traceOf({ nums: [4, 1, 4, 6], target: 10 });
    expect(frames.some((f) => f.note.startsWith('4 is already a key') && f.set!.active === '4 → 2')).toBe(true);
    expect(resultOf(frames)).toBe('[2, 3]');
  });

  it('keeps seen, the array and the variables in sync', () => {
    for (const input of SAMPLES) expect(inSync(algo.validate(input), traceOf(input))).toBe(true);
  });

  it('asks predictions that the following frames confirm', () => {
    for (const input of SAMPLES) expect(answersConfirmed(traceOf(input))).toBe(true);
  });

  it('draws inputs with at most one pair and covers both outcomes, every kind of lookup and varied answer positions', () => {
    const outcomes = new Set<string>();
    const lookups = new Set<string>();
    const storePositions = new Set<number>();
    const pairPositions = new Set<number>();
    for (const input of randomInputs(7, 150)) {
      const frames = traceOf(input);
      expect(pairCount(input.nums, input.target) <= 1 && frames.some((f) => f.predict)).toBe(true);
      outcomes.add(resultOf(frames) === '[]' ? 'none' : 'pair');
      for (const { prompt, answer, explain } of frames.flatMap((f) => f.predict ?? [])) {
        if (prompt.endsWith('after this step?')) storePositions.add(answer);
        if (prompt.endsWith('return?')) pairPositions.add(answer);
        if (!prompt.endsWith('in seen?')) continue;
        lookups.add(
          explain.includes('is a key')
            ? 'hit'
            : explain.includes('with itself')
              ? 'self'
              : explain.includes('is in nums')
                ? 'later'
                : 'miss',
        );
      }
    }
    expect([...outcomes].sort()).toEqual(['none', 'pair']);
    expect([...lookups].sort()).toEqual(['hit', 'later', 'miss', 'self']);
    expect(storePositions.size >= 3 && pairPositions.size >= 3).toBe(true);
  });

  it('never shows an em dash', () => {
    const rand = mulberry32(1);
    const traces = [algo.defaultInput, ...Array.from({ length: 20 }, () => algo.randomInput(rand))].map(traceOf);
    expect(JSON.stringify([algo, traces])).not.toContain(EM_DASH);
  });
});
