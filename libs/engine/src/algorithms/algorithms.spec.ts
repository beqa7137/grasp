import { describe, expect, it } from 'vitest';
import { ALGORITHMS, getAlgorithm } from './index.js';
import { mulberry32 } from './input.js';
import { InputError } from './types.js';

const reference: Record<string, (input: any) => unknown> = {
  'binary-search': ({ nums, target }) => {
    const i = nums.indexOf(target);
    return i;
  },
  'pair-sum-sorted': ({ nums, target }) => {
    for (let i = 0; i < nums.length; i++) for (let j = i + 1; j < nums.length; j++) if (nums[i] + nums[j] === target) return true;
    return false;
  },
  'longest-unique-substring': ({ s }) => {
    let best = 0;
    for (let i = 0; i < s.length; i++) {
      const seen = new Set<string>();
      for (let j = i; j < s.length && !seen.has(s[j]); j++) {
        seen.add(s[j]);
        best = Math.max(best, j - i + 1);
      }
    }
    return best;
  },
  'next-greater-element': ({ nums }) =>
    `[${nums.map((x: number, i: number) => nums.slice(i + 1).find((y: number) => y > x) ?? -1).join(', ')}]`,
  'grid-bfs': ({ grid }) => {
    const rows = grid.length;
    const cols = grid[0].length;
    const dist = new Map<string, number>();
    let start = '';
    let goal = '';
    grid.forEach((row: string, r: number) => [...row].forEach((ch, c) => {
      if (ch === 'S') start = `${r},${c}`;
      if (ch === 'G') goal = `${r},${c}`;
    }));
    const q = [start];
    dist.set(start, 0);
    while (q.length) {
      const k = q.shift()!;
      const [r, c] = k.split(',').map(Number);
      for (const [dr, dc] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nr = r + dr;
        const nc = c + dc;
        const nk = `${nr},${nc}`;
        if (nr < 0 || nc < 0 || nr >= rows || nc >= cols || grid[nr][nc] === '#' || dist.has(nk)) continue;
        dist.set(nk, dist.get(k)! + 1);
        q.push(nk);
      }
    }
    return dist.get(goal) ?? -1;
  },
};

describe.each(ALGORITHMS.map((a) => [a.id, a] as const))('%s', (id, algo) => {
  const check = (input: any) => {
    const frames = algo.trace(algo.validate(input));
    expect(frames.length).toBeGreaterThan(1);
    expect(frames.length).toBeLessThan(600);
    for (const f of frames) {
      expect(f.line).toBeGreaterThanOrEqual(1);
      expect(f.line).toBeLessThanOrEqual(algo.code.length);
      expect(f.note.length).toBeGreaterThan(0);
      if (f.predict) {
        expect(f.predict.answer).toBeGreaterThanOrEqual(0);
        expect(f.predict.answer).toBeLessThan(f.predict.choices.length);
      }
    }
    const result = frames[frames.length - 1].vars['result'];
    const expected = reference[id](algo.validate(input));
    if (id === 'pair-sum-sorted') {
      expect(result !== null).toBe(expected);
      if (result !== null) {
        const [l, r] = JSON.parse(String(result));
        const { nums, target } = algo.validate(input) as any;
        expect(nums[l] + nums[r]).toBe(target);
      }
    } else if (id === 'binary-search' && result !== -1) {
      const { nums, target } = algo.validate(input) as any;
      expect(nums[result as number]).toBe(target);
    } else {
      expect(result).toEqual(expected);
    }
    return frames;
  };

  it('traces the default input correctly and asks at least one prediction', () => {
    const frames = check(algo.defaultInput);
    expect(frames.some((f) => f.predict)).toBe(true);
  });

  it('matches a reference implementation on 300 random inputs', () => {
    const rand = mulberry32(id.length * 7919);
    for (let i = 0; i < 300; i++) check(algo.randomInput(rand));
  });

  it('is exposed through the registry', () => {
    expect(getAlgorithm(id)).toBe(algo);
  });
});

describe('input validation', () => {
  it('rejects bad inputs with InputError', () => {
    expect(() => getAlgorithm('binary-search')!.validate({ nums: 'a,b', target: 1 })).toThrow(InputError);
    expect(() => getAlgorithm('grid-bfs')!.validate({ grid: ['S..', '..'] })).toThrow(InputError);
    expect(() => getAlgorithm('longest-unique-substring')!.validate({ s: '' })).toThrow(InputError);
  });

  it('sorts inputs that must be sorted', () => {
    expect(getAlgorithm('binary-search')!.validate({ nums: '9, 1, 5', target: 5 })).toEqual({ nums: [1, 5, 9], target: 5 });
  });
});
