import { describe, expect, it } from 'vitest';
import { subsetsBacktracking as algo } from './subsets-backtracking.js';
import { resultOf, tracerFixture } from './tracer.fixture.js';
import type { Frame } from './types.js';

const { traceOf, randomInputs } = tracerFixture(algo);
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

const SAMPLES = [algo.defaultInput, { nums: [7] }, { nums: [-9, 12, 99] }, ...randomInputs(2024, 30)];

/** path, the taken numbers in the array and the call tree agree on every frame, and the tree only grows. */
const inSync = (nums: number[], frames: Frame[]) =>
  frames.every((f, k) => {
    const nodes = f.tree?.nodes ?? [];
    const pointer = f.array!.pointers['i'];
    return (
      f.vars['path'] === `[${f.stack!.items.join(', ')}]` &&
      same(
        f.array!.found!.map((i) => nums[i]),
        f.stack!.items,
      ) &&
      (pointer === undefined || pointer < nums.length) &&
      nodes.filter((node) => node.state === 'active').length <= 1 &&
      (k === 0 || nodes.length >= (frames[k - 1].tree?.nodes.length ?? 0))
    );
  });

/** The undo answer pops before skipping, and a record answer is the next subset out receives. */
const answersConfirmed = (frames: Frame[]) =>
  frames.every((f, k) => {
    const p = f.predict;
    if (!p) return true;
    if (f.line === 5) {
      return (
        p.choices[p.answer].startsWith('Pop ') && same(frames[k + 1].stack!.items, f.stack!.items.slice(0, -1)) && frames[k + 2].line === 6
      );
    }
    const recorded = f.output!.items.length;
    const next = frames.slice(k + 1).find((later) => later.output!.items.length > recorded);
    return next?.output!.items[recorded] === p.choices[p.answer];
  });

describe('subsets-backtracking', () => {
  it('traces the default input: all 8 subsets, recorded take-first', () => {
    const frames = traceOf(algo.defaultInput);
    const last = frames[frames.length - 1];
    expect(resultOf(frames)).toBe('[[1, 2, 3], [1, 2], [1, 3], [1], [2, 3], [2], [3], []]');
    expect(frames).toHaveLength(33);
    expect(frames.filter((f) => f.predict)).toHaveLength(5);
    expect(frames[0].line).toBe(2);
    expect(last.line).toBe(9);
    expect(last.output!.items).toHaveLength(8);
    expect(last.tree!.nodes).toHaveLength(15);
    expect(last.tree!.nodes.every((node) => node.state === 'done')).toBe(true);
    expect(last.tree!.nodes.flatMap((node) => node.badge ?? [])).toEqual(['1,2,3', '1,2', '1,3', '1', '2,3', '2', '3', '[]']);
  });

  it('records both subsets of a single number, and negative values like any other', () => {
    expect(resultOf(traceOf({ nums: [7] }))).toBe('[[7], []]');
    expect(resultOf(traceOf({ nums: [4, -2] }))).toBe('[[4, -2], [4], [-2], []]');
  });

  it('keeps the path, the array and the tree in sync', () => {
    for (const input of SAMPLES) expect(inSync(algo.validate(input).nums, traceOf(input))).toBe(true);
  });

  it('asks predictions that the following frames confirm', () => {
    for (const input of SAMPLES) expect(answersConfirmed(traceOf(input))).toBe(true);
  });

  it('draws two or three distinct numbers', () => {
    for (const { nums } of randomInputs(7, 100)) {
      expect(nums.length >= 2 && nums.length <= 3 && new Set(nums).size === nums.length).toBe(true);
    }
  });

  it('rejects inputs that would make the tree too big or repeat a value', () => {
    expect(() => algo.validate({ nums: [1, 2, 3, 4] })).toThrow('nums can hold at most 3 numbers: each one doubles the tree');
    expect(() => algo.validate({ nums: [2, 5, 2] })).toThrow('nums must not repeat a value');
    expect(() => algo.validate({ nums: [4, 100] })).toThrow('nums must contain integers between -9 and 99');
    expect(() => algo.validate({ nums: [-10, 4] })).toThrow('nums must contain integers between -9 and 99');
  });
});
