/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { PATTERNS } from '../curriculum/patterns.js';
import { getAlgorithm } from '../algorithms/index.js';
import { CODING_PROBLEMS, getCodingProblem } from './problems.js';
import { PYTHON_REFERENCE } from './python-reference.fixture.js';
import { buildSuite, entryName, exampleCases, outputsMatch, preview, pythonHarness, snakeCase, starterCode } from './suite.js';
import { LANGUAGES } from './types.js';

/** Obviously-correct (and slow) solutions to cross-check the references on small inputs. */
const BRUTE: Record<string, (...args: any[]) => unknown> = {
  'two-sum': (nums: number[], t: number) => {
    for (let i = 0; i < nums.length; i++) for (let j = i + 1; j < nums.length; j++) if (nums[i] + nums[j] === t) return [i, j];
    return [];
  },
  'pair-sum-sorted': (nums: number[], t: number) => {
    for (let i = 0; i < nums.length; i++) for (let j = i + 1; j < nums.length; j++) if (nums[i] + nums[j] === t) return [i, j];
    return [];
  },
  'container-most-water': (h: number[]) => {
    let best = 0;
    for (let i = 0; i < h.length; i++) for (let j = i + 1; j < h.length; j++) best = Math.max(best, Math.min(h[i], h[j]) * (j - i));
    return best;
  },
  'longest-unique-substring': (s: string) => {
    let best = 0;
    for (let i = 0; i < s.length; i++)
      for (let j = i; j < s.length; j++) if (new Set(s.slice(i, j + 1)).size === j - i + 1) best = Math.max(best, j - i + 1);
    return best;
  },
  'binary-search': (nums: number[], t: number) => nums.indexOf(t),
  'koko-bananas': (piles: number[], h: number) => {
    const lowerBound = Math.max(1, Math.ceil(piles.reduce((s, p) => s + p, 0) / h));
    for (let k = lowerBound; ; k++) if (piles.reduce((s, p) => s + Math.ceil(p / k), 0) <= h) return k;
  },
  'daily-temperatures': (t: number[]) =>
    t.map((x, i) => {
      const j = t.findIndex((y, k) => k > i && y > x);
      return j === -1 ? 0 : j - i;
    }),
  'subarray-sum-k': (nums: number[], k: number) => {
    let count = 0;
    for (let i = 0; i < nums.length; i++) {
      let sum = 0;
      for (let j = i; j < nums.length; j++) if ((sum += nums[j]) === k) count++;
    }
    return count;
  },
  'number-of-islands': (grid: string[][]) => {
    const g = grid.map((r) => [...r]);
    const sink = (r: number, c: number): void => {
      if (r < 0 || c < 0 || r >= g.length || c >= g[0].length || g[r][c] !== '1') return;
      g[r][c] = '0';
      sink(r + 1, c);
      sink(r - 1, c);
      sink(r, c + 1);
      sink(r, c - 1);
    };
    let n = 0;
    g.forEach((row, r) => row.forEach((cell, c) => cell === '1' && (n++, sink(r, c))));
    return n;
  },
  'merge-intervals': (intervals: number[][]) => {
    let list = intervals.map((i) => [...i]);
    for (let changed = true; changed;) {
      changed = false;
      outer: for (let i = 0; i < list.length; i++)
        for (let j = i + 1; j < list.length; j++)
          if (list[i][0] <= list[j][1] && list[j][0] <= list[i][1]) {
            list[i] = [Math.min(list[i][0], list[j][0]), Math.max(list[i][1], list[j][1])];
            list = list.filter((_, k) => k !== j);
            changed = true;
            break outer;
          }
    }
    return list.sort((a, b) => a[0] - b[0]);
  },
  'top-k-frequent': (nums: number[], k: number) => {
    const counts = new Map<number, number>();
    nums.forEach((x) => counts.set(x, (counts.get(x) ?? 0) + 1));
    return [...counts]
      .sort((a, b) => b[1] - a[1])
      .slice(0, k)
      .map(([v]) => v);
  },
  'house-robber': (nums: number[]) => {
    const best = (i: number): number => (i < 0 ? 0 : Math.max(best(i - 1), best(i - 2) + nums[i]));
    return best(nums.length - 1);
  },
};

const hasPython = spawnSync('python3', ['--version']).status === 0;

describe('coding problems', () => {
  it('have unique ids, known patterns, visualizers that exist, and a brute-force cross-check', () => {
    expect(new Set(CODING_PROBLEMS.map((p) => p.id)).size).toBe(CODING_PROBLEMS.length);
    const patternIds = new Set(PATTERNS.map((p) => p.id));
    for (const p of CODING_PROBLEMS) {
      expect(
        p.patternIds.every((id) => patternIds.has(id)),
        p.id,
      ).toBe(true);
      if (p.algorithmId) expect(getAlgorithm(p.algorithmId), p.id).toBeDefined();
      expect(BRUTE[p.id], p.id).toBeDefined();
      expect(PYTHON_REFERENCE[p.id], p.id).toBeDefined();
      expect(p.examples.length).toBeGreaterThan(0);
    }
  });

  it.each(CODING_PROBLEMS.map((p) => [p.id, p] as const))(
    '%s: the reference agrees with brute force on every small case',
    (_id, problem) => {
      for (const test of buildSuite(problem, { seed: 7, performance: false })) {
        const brute = BRUTE[problem.id](...structuredClone(test.args));
        expect(outputsMatch(brute, test.expected, problem.compare), `${problem.id} ${preview(test.args)}`).toBe(true);
      }
    },
  );

  it.each(CODING_PROBLEMS.map((p) => [p.id, p] as const))('%s: the reference solves the performance case quickly', (_id, problem) => {
    const started = performance.now();
    const [perf] = buildSuite(problem, { seed: 3 }).filter((t) => t.kind === 'performance');
    expect(perf).toBeDefined();
    expect(performance.now() - started).toBeLessThan(1_500);
    expect(JSON.stringify(perf.args).length).toBeGreaterThan(10_000);
  });

  it('keeps answers unique where the problem promises it', () => {
    for (const id of ['two-sum', 'pair-sum-sorted']) {
      const problem = getCodingProblem(id)!;
      for (const test of buildSuite(problem, { seed: 11 })) {
        const [nums, target] = test.args as [number[], number];
        if (nums.length > 2_000) {
          const counts = new Map<number, number>();
          let pairs = 0;
          for (const x of nums) {
            pairs += counts.get(target - x) ?? 0;
            counts.set(x, (counts.get(x) ?? 0) + 1);
          }
          expect(pairs, id).toBe(1);
        } else {
          let pairs = 0;
          for (let i = 0; i < nums.length; i++) for (let j = i + 1; j < nums.length; j++) if (nums[i] + nums[j] === target) pairs++;
          expect(pairs, `${id} ${preview(test.args)}`).toBe(1);
        }
      }
    }
  });

  it('builds the same suite for the same seed and a different one for another seed', () => {
    const problem = getCodingProblem('daily-temperatures')!;
    expect(buildSuite(problem, { seed: 5 })).toEqual(buildSuite(problem, { seed: 5 }));
    expect(buildSuite(problem, { seed: 5 })).not.toEqual(buildSuite(problem, { seed: 6 }));
    const kinds = buildSuite(problem).map((t) => t.kind);
    expect(kinds.filter((k) => k === 'performance')).toHaveLength(1);
    expect(exampleCases(problem)).toHaveLength(problem.examples.length);
  });
});

describe('outputsMatch', () => {
  it('compares exactly or ignoring order', () => {
    expect(outputsMatch([0, 1], [0, 1], 'exact')).toBe(true);
    expect(outputsMatch([0, 1], [1, 0], 'exact')).toBe(false);
    expect(outputsMatch([0, 1], [1, 0], 'unordered')).toBe(true);
    expect(outputsMatch([0, 1], [1, 1], 'unordered')).toBe(false);
    expect(outputsMatch([[1, 3]], [[1, 3]], 'exact')).toBe(true);
    expect(outputsMatch(3, '3', 'exact')).toBe(false);
    expect(outputsMatch(true, true, 'exact')).toBe(true);
    expect(outputsMatch([1], undefined, 'unordered')).toBe(false);
  });
});

describe('starter code', () => {
  it('declares the entry function in every language', () => {
    const problem = getCodingProblem('two-sum')!;
    expect(starterCode(problem, 'javascript')).toContain('function twoSum(nums, target)');
    expect(starterCode(problem, 'typescript')).toContain('function twoSum(nums: number[], target: number): number[]');
    expect(starterCode(problem, 'python')).toContain('def two_sum(nums: list[int], target: int) -> list[int]:');
    expect(snakeCase('lengthOfLongestSubstring')).toBe('length_of_longest_substring');
    for (const p of CODING_PROBLEMS) for (const lang of LANGUAGES) expect(starterCode(p, lang)).toContain(entryName(p, lang));
  });
});

describe.runIf(hasPython)('Python harness (CPython)', () => {
  it.each(CODING_PROBLEMS.map((p) => [p.id, p] as const))('%s: the Python reference passes the full suite', (_id, problem) => {
    const suite = buildSuite(problem, { seed: 9 });
    const script = `${PYTHON_REFERENCE[problem.id]}\n${pythonHarness(entryName(problem, 'python'))}
import sys, json
for line in sys.stdin:
    print(__grasp_call(line))
`;
    const run = spawnSync('python3', ['-c', script], {
      input: suite.map((t) => JSON.stringify(t.args)).join('\n'),
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
    });
    expect(run.stderr).toBe('');
    const outputs = run.stdout
      .trim()
      .split('\n')
      .map((l) => JSON.parse(l));
    suite.forEach((t, i) =>
      expect(outputsMatch(t.expected, outputs[i], problem.compare), `${problem.id} #${i} ${preview(t.args)}`).toBe(true),
    );
  });
});
