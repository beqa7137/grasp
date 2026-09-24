import { describe, expect, it } from 'vitest';
import { formatField, mulberry32, parseField } from './input.js';
import { subsetsBacktracking as algo } from './subsets-backtracking.js';
import { InputError, type Frame } from './types.js';

const reference = (nums: number[]): string => {
  const all = (rest: number[]): number[][] => {
    if (rest.length === 0) return [[]];
    const tail = all(rest.slice(1));
    return [...tail.map((subset) => [rest[0], ...subset]), ...tail];
  };
  return `[${all(nums)
    .map((subset) => `[${subset.join(', ')}]`)
    .join(', ')}]`;
};

const traceOf = (input: unknown) => algo.trace(algo.validate(input));
const resultOf = (frames: Frame[]) => frames[frames.length - 1].vars['result'];
const randomInputs = (seed: number, count: number) => {
  const rand = mulberry32(seed);
  return Array.from({ length: count }, () => algo.randomInput(rand));
};

const SAMPLES = [algo.defaultInput, { nums: [7] }, { nums: [-9, 12, 99] }, ...randomInputs(2024, 50)];

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

  it('matches a reference implementation on 300 seeded random inputs and edge cases', () => {
    for (const input of [...randomInputs(20 * 7919, 300), { nums: [7] }, { nums: [4, -2] }, { nums: [9, 1, 5] }]) {
      expect(resultOf(traceOf(input))).toBe(reference(algo.validate(input).nums));
    }
  });

  it('keeps the path, the array, the tree and the frame shape in sync', () => {
    for (const input of SAMPLES) {
      const { nums } = algo.validate(input);
      const frames = traceOf(input);
      expect(frames.length).toBeLessThan(600);
      expect(frames[frames.length - 1].predict).toBeUndefined();
      expect(JSON.parse(JSON.stringify(frames))).toEqual(frames);
      frames.forEach((f, k) => {
        expect(f.line).toBeGreaterThanOrEqual(1);
        expect(f.line).toBeLessThanOrEqual(algo.code.length);
        expect(f.note.length).toBeGreaterThan(0);
        expect(f.vars['path']).toBe(`[${f.stack!.items.join(', ')}]`);
        expect(f.array!.found!.map((i) => nums[i])).toEqual(f.stack!.items);
        const pointer = f.array!.pointers['i'];
        if (pointer !== undefined) expect(pointer).toBeLessThan(nums.length);
        const nodes = f.tree?.nodes ?? [];
        expect(nodes.filter((node) => node.state === 'active').length).toBeLessThanOrEqual(1);
        if (k > 0) expect(nodes.length).toBeGreaterThanOrEqual(frames[k - 1].tree?.nodes.length ?? 0);
      });
    }
  });

  it('asks well-formed predictions that the following frames confirm', () => {
    for (const input of SAMPLES) {
      const frames = traceOf(input);
      frames.forEach((f, k) => {
        const p = f.predict;
        if (!p) return;
        expect(p.prompt.length).toBeGreaterThan(10);
        expect(p.explain.length).toBeGreaterThan(10);
        expect(p.choices.length).toBeGreaterThanOrEqual(2);
        expect(p.choices.length).toBeLessThanOrEqual(4);
        expect(new Set(p.choices).size).toBe(p.choices.length);
        expect(p.answer).toBeGreaterThanOrEqual(0);
        expect(p.answer).toBeLessThan(p.choices.length);
        if (f.line === 5) {
          expect(p.choices[p.answer]).toMatch(/^Pop /);
          expect(frames[k + 1].stack!.items).toEqual(f.stack!.items.slice(0, -1));
          expect(frames[k + 2].line).toBe(6);
        } else {
          const recorded = f.output!.items.length;
          const next = frames.slice(k + 1).find((later) => later.output!.items.length > recorded)!;
          expect(next.output!.items[recorded]).toBe(p.choices[p.answer]);
        }
      });
    }
    const recordAnswers = traceOf(algo.defaultInput).flatMap((f) => (f.predict && f.line !== 5 ? [f.predict.answer] : []));
    expect(new Set(recordAnswers).size).toBeGreaterThan(1);
  });

  it('is deterministic', () => {
    expect(traceOf(algo.defaultInput)).toEqual(traceOf(algo.defaultInput));
    expect(randomInputs(99, 20)).toEqual(randomInputs(99, 20));
  });

  it('draws small random inputs that always ask something and vary between seeds', () => {
    for (const input of randomInputs(7, 300)) {
      expect(input.nums.length).toBeGreaterThanOrEqual(2);
      expect(input.nums.length).toBeLessThanOrEqual(3);
      expect(new Set(input.nums).size).toBe(input.nums.length);
      expect(algo.validate(input)).toEqual(input);
      expect(traceOf(input).some((f) => f.predict)).toBe(true);
    }
    const seeds = Array.from({ length: 40 }, (_, i) => i * 104_729 + 17);
    const prompts = seeds.flatMap((seed) => traceOf(algo.randomInput(mulberry32(seed))).flatMap((f) => f.predict?.prompt ?? []));
    expect(new Set(prompts).size).toBeGreaterThanOrEqual(5);
  });

  it('rejects bad inputs with clear messages', () => {
    expect(() => algo.validate({})).toThrow('nums must be a list of numbers');
    expect(() => algo.validate({ nums: [] })).toThrow(InputError);
    expect(() => algo.validate({ nums: 'a, b' })).toThrow(InputError);
    expect(() => algo.validate({ nums: [1, 2, 3, 4] })).toThrow('nums can hold at most 3 numbers: each one doubles the tree');
    expect(() => algo.validate({ nums: [2, 5, 2] })).toThrow('nums must not repeat a value');
    expect(() => algo.validate({ nums: [4, 100] })).toThrow('nums must contain integers between -9 and 99');
    expect(() => algo.validate({ nums: [-10, 4] })).toThrow('nums must contain integers between -9 and 99');
  });

  it('round-trips what the input panel edits', () => {
    const kind = algo.fields[0].kind;
    expect(algo.validate({ nums: parseField(kind, '3, 1 2') })).toEqual({ nums: [3, 1, 2] });
    expect(formatField(kind, algo.validate(algo.defaultInput).nums)).toBe('1, 2, 3');
  });

  it('never uses an em dash', () => {
    expect(JSON.stringify([algo, ...SAMPLES.map(traceOf)])).not.toContain(String.fromCharCode(0x2014));
  });
});
