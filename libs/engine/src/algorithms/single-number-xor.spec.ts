import { describe, expect, it } from 'vitest';
import { singleNumberXor } from './single-number-xor.js';
import { predictions, resultOf, tracerFixture } from './tracer.fixture.js';
import { InputError } from './types.js';

const { traceOf, randomInputs } = tracerFixture(singleNumberXor);
const xorAll = (nums: number[]) => nums.reduce((x, n) => x ^ n, 0);

const sampleInputs = [singleNumberXor.defaultInput, { nums: [0, 7, 7] }, { nums: [3, 5, 6] }, { nums: [9] }, ...randomInputs(1, 30)];

describe('single-number-xor', () => {
  it('traces the default input: the 1s and 2s cancel and 4 survives', () => {
    const frames = traceOf(singleNumberXor.defaultInput);
    expect(frames).toHaveLength(16);
    expect(frames[0].line).toBe(2);
    expect(frames.at(-1)!.line).toBe(6);
    expect(resultOf(frames)).toBe(4);
    expect(frames.filter((f) => f.line === 4 && !f.predict).map((f) => f.vars['x'])).toEqual([4, 5, 7, 6, 4]);
    expect(frames.at(-1)!.array).toMatchObject({ settled: [1, 3, 2, 4], found: [0], window: [0, 4] });
    expect(frames.at(-1)!.set!.entries).toEqual(['4']);
  });

  it('asks for the running XOR after every number except the first', () => {
    const asked = predictions(traceOf(singleNumberXor.defaultInput));
    expect(asked[0].prompt).toBe('`x = 4` (100), `n = 1` (001). What is x after `x ^= n`?');
    expect(asked.map((p) => p.choices[p.answer])).toEqual(['101 (5)', '111 (7)', '110 (6)', '100 (4)']);
    expect(asked[2].explain).toContain('1 ^ 1 = 0');
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

  it('keeps the array pointers in range and every bit table row equal to its value', () => {
    for (const input of sampleInputs) {
      const consistent = traceOf(input).every(({ array, table }) => {
        const { pointers, window } = array!;
        const inRange = Object.values(pointers).every((index) => index < input.nums.length) && (!window || window[0] <= window[1]);
        const bitsMatch = table!.cells.every(
          (row) => row.length === table!.colLabels.length && (row[0] === null || parseInt(row.slice(0, -1).join(''), 2) === row.at(-1)),
        );
        return inRange && bitsMatch;
      });
      expect(consistent).toBe(true);
    }
  });

  it('asks for the real x ^ n, which the next frame shows', () => {
    for (const input of sampleInputs) {
      const frames = traceOf(input);
      const confirmed = frames.every((f, k) => !f.predict || f.predict.choices[f.predict.answer].endsWith(`(${frames[k + 1].vars['x']})`));
      expect(confirmed).toBe(true);
    }
  });

  it('rejects negative numbers', () => {
    expect(() => singleNumberXor.validate({ nums: [4, -1, 4] })).toThrow(InputError);
    expect(() => singleNumberXor.validate({ nums: [4, -1, 4] })).toThrow(/between 0 and 999/);
  });
});
