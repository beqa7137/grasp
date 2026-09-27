import { describe, expect, it } from 'vitest';
import { PATTERN_CATALOG } from '../curriculum/catalog.js';
import { CODING_CATALOG } from './catalog.js';
import { getCodingProblem } from './problems/index.js';
import { buildSuite, entryArgs, outputsMatch, paramTypes, preview } from './suite.js';

type WrongSolution = { name: string; solve: (...args: any[]) => unknown };

const WRONG: Record<string, WrongSolution[]> = {
  'product-of-array-except-self': [
    {
      name: 'divide by each value',
      solve: (nums: number[]) => {
        const total = nums.reduce((product, value) => product * value, 1);
        return nums.map((value) => total / value);
      },
    },
    {
      name: 'use only left products',
      solve: (nums: number[]) => {
        let product = 1;
        return nums.map((value) => {
          const left = product;
          product *= value;
          return left;
        });
      },
    },
  ],
  'largest-rectangle-in-histogram': [
    { name: 'use only the tallest bar', solve: (heights: number[]) => Math.max(...heights) },
    {
      name: 'forget rectangles left on the stack',
      solve: (heights: number[]) => {
        const stack: number[] = [];
        let best = 0;
        for (let i = 0; i < heights.length; i++) {
          while (stack.length && heights[stack[stack.length - 1]] > heights[i]) {
            const height = heights[stack.pop()!];
            best = Math.max(best, height * (i - (stack.length ? stack[stack.length - 1] : -1) - 1));
          }
          stack.push(i);
        }
        return best;
      },
    },
    {
      name: 'extend rectangles only to the right',
      solve: (heights: number[]) => {
        let best = 0;
        for (let i = 0; i < heights.length; i++)
          for (let j = i; j < heights.length && heights[j] >= heights[i]; j++) best = Math.max(best, heights[i] * (j - i + 1));
        return best;
      },
    },
  ],
  'non-overlapping-intervals': [
    {
      name: 'keep the earliest starting interval',
      solve: (intervals: number[][]) => {
        let end = -Infinity;
        let removed = 0;
        for (const [start, finish] of [...intervals].sort((a, b) => a[0] - b[0])) {
          if (start >= end) end = finish;
          else removed++;
        }
        return removed;
      },
    },
    {
      name: 'treat touching endpoints as overlapping',
      solve: (intervals: number[][]) => {
        let end = -Infinity;
        let removed = 0;
        for (const [start, finish] of [...intervals].sort((a, b) => a[1] - b[1])) {
          if (start > end) end = finish;
          else removed++;
        }
        return removed;
      },
    },
    {
      name: 'keep the shortest intervals first',
      solve: (intervals: number[][]) => {
        const kept: number[][] = [];
        for (const interval of [...intervals].sort((a, b) => a[1] - a[0] - (b[1] - b[0])))
          if (kept.every(([start, end]) => interval[1] <= start || end <= interval[0])) kept.push(interval);
        return intervals.length - kept.length;
      },
    },
  ],
  'circular-array-loop': [
    {
      name: 'ignore direction changes',
      solve: (nums: number[]) => {
        for (let start = 0; start < nums.length; start++) {
          const seen = new Map<number, number>();
          let at = start;
          while (!seen.has(at)) {
            seen.set(at, seen.size);
            at = (((at + nums[at]) % nums.length) + nums.length) % nums.length;
          }
          if (seen.size - seen.get(at)! > 1) return true;
        }
        return false;
      },
    },
    {
      name: 'allow one-index loops',
      solve: (nums: number[]) => {
        for (let start = 0; start < nums.length; start++) {
          const direction = Math.sign(nums[start]);
          const seen = new Set<number>();
          let at = start;
          while (Math.sign(nums[at]) === direction && !seen.has(at)) {
            seen.add(at);
            at = (((at + nums[at]) % nums.length) + nums.length) % nums.length;
          }
          if (Math.sign(nums[at]) === direction && seen.has(at)) return true;
        }
        return false;
      },
    },
    {
      name: 'check only the path from index zero',
      solve: (nums: number[]) => {
        const direction = Math.sign(nums[0]);
        const seen = new Map<number, number>();
        let at = 0;
        while (Math.sign(nums[at]) === direction && !seen.has(at)) {
          seen.set(at, seen.size);
          at = (((at + nums[at]) % nums.length) + nums.length) % nums.length;
        }
        return Math.sign(nums[at]) === direction && seen.has(at) && seen.size - seen.get(at)! > 1;
      },
    },
    {
      name: 'mark the direction-change index as dead',
      solve: (nums: number[]) => {
        const dead = new Set<number>();
        for (let start = 0; start < nums.length; start++) {
          if (dead.has(start)) continue;
          const direction = Math.sign(nums[start]);
          const seen = new Map<number, number>();
          let at = start;
          while (!dead.has(at) && Math.sign(nums[at]) === direction && !seen.has(at)) {
            seen.set(at, seen.size);
            const next = (((at + nums[at]) % nums.length) + nums.length) % nums.length;
            if (next === at) break;
            at = next;
          }
          if (Math.sign(nums[at]) === direction && seen.has(at) && seen.size - seen.get(at)! > 1) return true;
          for (const index of seen.keys()) dead.add(index);
          dead.add(at);
        }
        return false;
      },
    },
  ],
  'parallel-courses': [
    { name: 'take one course per semester', solve: (n: number) => n },
    {
      name: 'detect only mutual prerequisite pairs',
      solve: (n: number, relations: number[][]) => {
        const pairs = new Set(relations.map(([before, after]) => `${before},${after}`));
        if (relations.some(([before, after]) => pairs.has(`${after},${before}`))) return -1;
        const degree = Array<number>(n + 1).fill(0);
        const next = Array.from({ length: n + 1 }, () => [] as number[]);
        for (const [before, after] of relations) {
          next[before].push(after);
          degree[after]++;
        }
        let queue = Array.from({ length: n }, (_, i) => i + 1).filter((course) => degree[course] === 0);
        let semesters = 0;
        while (queue.length) {
          queue = queue.flatMap((course) => next[course].filter((following) => --degree[following] === 0));
          semesters++;
        }
        return semesters;
      },
    },
  ],
  'path-with-minimum-effort': [
    {
      name: 'minimize the sum of steps',
      solve: (heights: number[][]) => {
        const rows = heights.length;
        const cols = heights[0].length;
        const distance = Array<number>(rows * cols).fill(Infinity);
        const used = new Set<number>();
        distance[0] = 0;
        while (used.size < rows * cols) {
          let at = -1;
          for (let i = 0; i < distance.length; i++) if (!used.has(i) && (at < 0 || distance[i] < distance[at])) at = i;
          if (at < 0 || distance[at] === Infinity) break;
          used.add(at);
          const r = Math.floor(at / cols);
          const c = at % cols;
          for (const [y, x] of [
            [r - 1, c],
            [r + 1, c],
            [r, c - 1],
            [r, c + 1],
          ])
            if (y >= 0 && y < rows && x >= 0 && x < cols)
              distance[y * cols + x] = Math.min(distance[y * cols + x], distance[at] + Math.abs(heights[r][c] - heights[y][x]));
        }
        return distance[distance.length - 1];
      },
    },
    {
      name: 'move only right and down',
      solve: (heights: number[][]) => {
        const rows = heights.length;
        const cols = heights[0].length;
        const best = Array.from({ length: rows }, () => Array<number>(cols).fill(Infinity));
        best[0][0] = 0;
        for (let r = 0; r < rows; r++)
          for (let c = 0; c < cols; c++) {
            if (r > 0) best[r][c] = Math.min(best[r][c], Math.max(best[r - 1][c], Math.abs(heights[r][c] - heights[r - 1][c])));
            if (c > 0) best[r][c] = Math.min(best[r][c], Math.max(best[r][c - 1], Math.abs(heights[r][c] - heights[r][c - 1])));
          }
        return best[rows - 1][cols - 1];
      },
    },
    {
      name: 'mark cells visited when first discovered',
      solve: (heights: number[][]) => {
        const rows = heights.length;
        const cols = heights[0].length;
        const queue: [number, number][] = [[0, 0]];
        const seen = new Set([0]);
        while (queue.length) {
          queue.sort((a, b) => a[0] - b[0]);
          const [effort, cell] = queue.shift()!;
          if (cell === rows * cols - 1) return effort;
          const r = Math.floor(cell / cols);
          const c = cell % cols;
          for (const [y, x] of [
            [r - 1, c],
            [r + 1, c],
            [r, c - 1],
            [r, c + 1],
          ]) {
            const next = y * cols + x;
            if (y >= 0 && y < rows && x >= 0 && x < cols && !seen.has(next)) {
              seen.add(next);
              queue.push([Math.max(effort, Math.abs(heights[r][c] - heights[y][x])), next]);
            }
          }
        }
        return 0;
      },
    },
  ],
  'replace-words': [
    {
      name: 'choose the longest matching root',
      solve: (dictionary: string[], sentence: string) =>
        sentence
          .split(' ')
          .map((word) => dictionary.filter((root) => word.startsWith(root)).sort((a, b) => b.length - a.length)[0] ?? word)
          .join(' '),
    },
    {
      name: 'replace only whole words',
      solve: (_dictionary: string[], sentence: string) => sentence,
    },
    {
      name: 'take the first matching root in dictionary order',
      solve: (dictionary: string[], sentence: string) =>
        sentence
          .split(' ')
          .map((word) => dictionary.find((root) => word.startsWith(root)) ?? word)
          .join(' '),
    },
  ],
  'edit-distance': [
    {
      name: 'use only insertions and deletions',
      solve: (a: string, b: string) => {
        const table = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
        for (let i = 1; i <= a.length; i++)
          for (let j = 1; j <= b.length; j++)
            table[i][j] = a[i - 1] === b[j - 1] ? table[i - 1][j - 1] + 1 : Math.max(table[i - 1][j], table[i][j - 1]);
        return a.length + b.length - 2 * table[a.length][b.length];
      },
    },
    {
      name: 'count letters at different positions',
      solve: (a: string, b: string) =>
        Math.abs(a.length - b.length) +
        Array.from({ length: Math.min(a.length, b.length) }, (_, i) => Number(a[i] !== b[i])).reduce((x, y) => x + y, 0),
    },
  ],
};

describe('new coding problem hidden cases', () => {
  it('keeps each second problem beside its first and the full catalog in curriculum order', () => {
    const patternOrder = new Map<string, number>(PATTERN_CATALOG.map((pattern, i) => [pattern.id, i]));
    const positions = CODING_CATALOG.map((problem) => patternOrder.get(problem.patternIds[0])!);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    for (const [first, second] of [
      ['subarray-sum-k', 'product-of-array-except-self'],
      ['daily-temperatures', 'largest-rectangle-in-histogram'],
      ['find-duplicate', 'circular-array-loop'],
      ['merge-intervals', 'non-overlapping-intervals'],
      ['course-schedule', 'parallel-courses'],
      ['network-delay', 'path-with-minimum-effort'],
      ['count-prefixes', 'replace-words'],
      ['longest-common-subsequence', 'edit-distance'],
    ])
      expect(CODING_CATALOG.findIndex((problem) => problem.id === second)).toBe(
        CODING_CATALOG.findIndex((problem) => problem.id === first) + 1,
      );
  });

  it.each(Object.entries(WRONG))('%s rejects common wrong approaches before the performance case', (id, solutions) => {
    const problem = getCodingProblem(id)!;
    const hidden = buildSuite(problem, { seed: 1, performance: false }).filter((test) => test.kind !== 'example');
    for (const { name, solve } of solutions) {
      const mismatch = hidden.find(
        (test) => !outputsMatch(test.expected, solve(...entryArgs(paramTypes(problem), test.args)), problem.compare),
      );
      expect(mismatch, `${id}: ${name}; ${preview(hidden.map((test) => test.args))}`).toBeDefined();
    }
  });
});
