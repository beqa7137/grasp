import { describe, expect, it } from 'vitest';
import { mulberry32 } from './input.js';
import { singleNumberXor } from './single-number-xor.js';
import { InputError, type Frame } from './types.js';

const xorAll = (nums: number[]) => nums.reduce((x, n) => x ^ n, 0);
const trace = (input: unknown) => singleNumberXor.trace(singleNumberXor.validate(input));
const resultOf = (frames: Frame[]) => frames[frames.length - 1].vars['result'];

function randomInputs(seed: number, count: number) {
  const rand = mulberry32(seed);
  return Array.from({ length: count }, () => singleNumberXor.randomInput(rand));
}

const sampleInputs = [singleNumberXor.defaultInput, { nums: [0, 7, 7] }, { nums: [3, 5, 6] }, { nums: [9] }, ...randomInputs(1, 100)];

describe('single-number-xor', () => {
  it('traces the default input: the 1s and 2s cancel and 4 survives', () => {
    const frames = trace(singleNumberXor.defaultInput);
    expect(frames).toHaveLength(16);
    expect(frames[0].line).toBe(2);
    expect(frames.at(-1)!.line).toBe(6);
    expect(resultOf(frames)).toBe(4);
    expect(frames.filter((f) => f.line === 4 && !f.predict).map((f) => f.vars['x'])).toEqual([4, 5, 7, 6, 4]);
    expect(frames.at(-1)!.array).toMatchObject({ settled: [1, 3, 2, 4], found: [0], window: [0, 4] });
    expect(frames.at(-1)!.set!.entries).toEqual(['4']);
  });

  it('asks for the running XOR after every number except the first', () => {
    const asked = trace(singleNumberXor.defaultInput)
      .filter((f) => f.predict)
      .map((f) => f.predict!);
    expect(asked[0].prompt).toBe('x = 4 (100), n = 1 (001). What is x after x\u00a0^=\u00a0n?');
    expect(asked.map((p) => p.choices[p.answer])).toEqual(['101 (5)', '111 (7)', '110 (6)', '100 (4)']);
    expect(asked[2].explain).toContain('1 ^ 1 = 0');
  });

  it('matches a reference XOR fold on 300 seeded random inputs', () => {
    for (const input of randomInputs(7919, 300)) expect(resultOf(trace(input))).toBe(xorAll(input.nums));
  });

  it('builds random inputs where every value appears twice except one', () => {
    for (const { nums } of randomInputs(3, 100)) {
      expect(singleNumberXor.validate({ nums })).toEqual({ nums });
      const counts = new Map<number, number>();
      for (const n of nums) counts.set(n, (counts.get(n) ?? 0) + 1);
      const singles = [...counts].filter(([, count]) => count === 1).map(([value]) => value);
      expect(singles).toHaveLength(1);
      expect([...counts.values()].filter((count) => count !== 1).every((count) => count === 2)).toBe(true);
      expect(xorAll(nums)).toBe(singles[0]);
    }
  });

  it('keeps every frame in range, JSON safe and consistent with its bit table', () => {
    for (const input of sampleInputs) {
      const frames = trace(input);
      expect(JSON.parse(JSON.stringify(frames))).toEqual(frames);
      expect(frames.at(-1)!.predict).toBeUndefined();
      for (const f of frames) {
        expect(f.line).toBeGreaterThanOrEqual(1);
        expect(f.line).toBeLessThanOrEqual(singleNumberXor.code.length);
        expect(f.note.length).toBeGreaterThan(0);
        for (const index of Object.values(f.array!.pointers)) expect(index).toBeLessThan(input.nums.length);
        if (f.array!.window) expect(f.array!.window[0]).toBeLessThanOrEqual(f.array!.window[1]);
        for (const row of f.table!.cells) {
          expect(row).toHaveLength(f.table!.colLabels.length);
          if (row[0] !== null) expect(parseInt(row.slice(0, -1).join(''), 2)).toBe(row.at(-1));
        }
      }
    }
  });

  it('asks well-formed predictions whose answer is the real x ^ n', () => {
    const positions = new Set<number>();
    for (const input of sampleInputs) {
      const frames = trace(input);
      frames.forEach((f, index) => {
        if (!f.predict) return;
        const { prompt, choices, answer, explain } = f.predict;
        expect(prompt.length).toBeGreaterThan(10);
        expect(explain.length).toBeGreaterThan(10);
        expect(choices.length).toBeGreaterThanOrEqual(2);
        expect(choices.length).toBeLessThanOrEqual(4);
        expect(new Set(choices).size).toBe(choices.length);
        expect(answer).toBeGreaterThanOrEqual(0);
        expect(answer).toBeLessThan(choices.length);
        expect(choices[answer]).toMatch(new RegExp(`\\(${frames[index + 1].vars['x']}\\)$`));
        positions.add(answer);
      });
    }
    expect(positions.size).toBeGreaterThanOrEqual(3);
  });

  it('is deterministic for a seed', () => {
    expect(randomInputs(42, 5)).toEqual(randomInputs(42, 5));
    const [input] = randomInputs(42, 1);
    expect(trace(input)).toEqual(trace(input));
  });

  it('accepts typed text and rejects bad input with InputError', () => {
    expect(singleNumberXor.validate({ nums: '4, 1 2,1, 2' })).toEqual({ nums: [4, 1, 2, 1, 2] });
    const cases: [unknown, RegExp][] = [
      [{ nums: [4, -1, 4] }, /between 0 and 999/],
      [{ nums: [1000, 1000, 3] }, /between 0 and 999/],
      [{ nums: 'a, b' }, /integers/],
      [{ nums: [] }, /must not be empty/],
      [{ nums: Array(25).fill(1) }, /at most 24/],
      [null, /list of numbers/],
    ];
    for (const [input, message] of cases) {
      expect(() => singleNumberXor.validate(input)).toThrow(InputError);
      expect(() => singleNumberXor.validate(input)).toThrow(message);
    }
  });
});
