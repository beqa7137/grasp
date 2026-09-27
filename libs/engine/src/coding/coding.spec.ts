/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { readFileSync, readdirSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { PATTERNS } from '../curriculum/patterns.js';
import { getAlgorithm } from '../algorithms/index.js';
import { rangeOf } from '../algorithms/input.js';
import { mulberry32 } from '../algorithms/random.js';
import { problemsForPattern } from './catalog.js';
import { CODING_PROBLEMS, getCodingProblem } from './problems/index.js';
import { randomTree } from './problems/inputs.js';
import { PYTHON_REFERENCE } from './python-reference.fixture.js';
import { nodesOf, SLOWER, SLOWER_MIN_STEPS, SLOWER_VARIANTS } from './coding-slower.fixture.js';
import {
  buildSuite,
  entryArgs,
  entryName,
  exampleCases,
  inputSize,
  outputsMatch,
  paramTypes,
  preview,
  snakeCase,
  starterCode,
} from './suite.js';
import { TreeNode, buildTree, levelOrder, type LevelOrder } from './tree.js';
import { LANGUAGES, type TestCase } from './types.js';

const height = (node: TreeNode | null): number => (node ? 1 + Math.max(height(node.left), height(node.right)) : 0);

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
  'jump-game': (nums: number[]) => {
    const reachesEnd = (i: number): boolean =>
      i === nums.length - 1 || rangeOf(i + 1, Math.min(i + nums[i], nums.length - 1)).some(reachesEnd);
    return reachesEnd(0);
  },
  'longest-unique-substring': (s: string) => {
    let best = 0;
    for (let i = 0; i < s.length; i++)
      for (let j = i; j < s.length; j++) if (new Set(s.slice(i, j + 1)).size === j - i + 1) best = Math.max(best, j - i + 1);
    return best;
  },
  'min-size-subarray-sum': (target: number, nums: number[]) => {
    let best = 0;
    for (let i = 0; i < nums.length; i++)
      for (let j = i; j < nums.length; j++) {
        const sum = nums.slice(i, j + 1).reduce((s, x) => s + x, 0);
        if (sum >= target && (!best || j - i + 1 < best)) best = j - i + 1;
      }
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
  'largest-rectangle-in-histogram': (heights: number[]) => {
    let best = 0;
    for (let left = 0; left < heights.length; left++) {
      let shortest = Infinity;
      for (let right = left; right < heights.length; right++) {
        shortest = Math.min(shortest, heights[right]);
        best = Math.max(best, shortest * (right - left + 1));
      }
    }
    return best;
  },
  'subarray-sum-k': (nums: number[], k: number) => {
    let count = 0;
    for (let i = 0; i < nums.length; i++) {
      let sum = 0;
      for (let j = i; j < nums.length; j++) if ((sum += nums[j]) === k) count++;
    }
    return count;
  },
  'product-of-array-except-self': (nums: number[]) =>
    nums.map((_, excluded) => nums.reduce((product, value, i) => (i === excluded ? product : product * value), 1)),
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
  'rotting-oranges': (grid: number[][]) => {
    let g = grid;
    for (let minutes = 0; ; minutes++) {
      if (!g.flat().includes(1)) return minutes;
      const next = g.map((row, r) =>
        row.map((cell, c) => (cell === 1 && [g[r - 1]?.[c], g[r + 1]?.[c], row[c - 1], row[c + 1]].includes(2) ? 2 : cell)),
      );
      if (JSON.stringify(next) === JSON.stringify(g)) return -1;
      g = next;
    }
  },
  subsets: (nums: number[]) => {
    const sorted = [...nums].sort((a, b) => a - b);
    return rangeOf(0, 2 ** nums.length - 1).map((mask) => sorted.filter((_, i) => mask & (1 << i)));
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
  'non-overlapping-intervals': (intervals: number[][]) => {
    let kept = 0;
    for (let mask = 0; mask < 2 ** intervals.length; mask++) {
      const chosen = intervals.filter((_, i) => mask & (1 << i)).sort((a, b) => a[0] - b[0]);
      if (chosen.every(([start], i) => i === 0 || chosen[i - 1][1] <= start)) kept = Math.max(kept, chosen.length);
    }
    return intervals.length - kept;
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
  'coin-change': (coins: number[], amount: number) => {
    const fewest = (i: number, rest: number): number => {
      if (i === coins.length) return rest === 0 ? 0 : Infinity;
      let best = Infinity;
      for (let count = 0; count * coins[i] <= rest; count++) best = Math.min(best, count + fewest(i + 1, rest - count * coins[i]));
      return best;
    };
    const best = fewest(0, amount);
    return best === Infinity ? -1 : best;
  },
  'kth-largest-element': (nums: number[], k: number) =>
    nums.find((x) => nums.filter((y) => y > x).length < k && nums.filter((y) => y >= x).length >= k),
  'longest-common-subsequence': (a: string, b: string) => {
    const subsequences = (s: string) => {
      const out = new Set<string>(['']);
      for (const ch of s) for (const prefix of Array.from(out)) out.add(prefix + ch);
      return out;
    };
    const inB = subsequences(b);
    return Math.max(...[...subsequences(a)].filter((s) => inB.has(s)).map((s) => s.length));
  },
  'edit-distance': (a: string, b: string) => {
    const distance = (i: number, j: number): number => {
      if (i === a.length) return b.length - j;
      if (j === b.length) return a.length - i;
      if (a[i] === b[j]) return distance(i + 1, j + 1);
      return 1 + Math.min(distance(i + 1, j), distance(i, j + 1), distance(i + 1, j + 1));
    };
    return distance(0, 0);
  },
  'count-components': (n: number, edges: number[][]) => {
    const seen = new Set<number>();
    let components = 0;
    for (let start = 0; start < n; start++) {
      if (seen.has(start)) continue;
      components++;
      const stack = [start];
      seen.add(start);
      while (stack.length) {
        const u = stack.pop()!;
        for (const [a, b] of edges)
          for (const [x, y] of [
            [a, b],
            [b, a],
          ])
            if (x === u && !seen.has(y)) {
              seen.add(y);
              stack.push(y);
            }
      }
    }
    return components;
  },
  'redundant-connection': (edges: number[][]) => {
    const connects = (rest: number[][]) => {
      const reached = new Set([1]);
      for (let grew = true; grew;) {
        grew = false;
        for (const [a, b] of rest)
          if (reached.has(a) !== reached.has(b)) {
            reached.add(a).add(b);
            grew = true;
          }
      }
      return reached.size === edges.length;
    };
    return [...edges].reverse().find((edge) => connects(edges.filter((e) => e !== edge)));
  },
  'course-schedule': (_n: number, prerequisites: number[][]) => {
    const reaches = (from: number, to: number, seen: Set<number>): boolean => {
      if (from === to) return true;
      seen.add(from);
      return prerequisites.some(([a, b]) => b === from && !seen.has(a) && reaches(a, to, seen));
    };
    return !prerequisites.some(([a, b]) => reaches(a, b, new Set()));
  },
  'parallel-courses': (n: number, relations: number[][]) => {
    const prerequisites = Array.from({ length: n }, () => new Set<number>());
    for (const [before, after] of relations) prerequisites[after - 1].add(before - 1);
    const full = (1 << n) - 1;
    const fewest = (completed: number): number => {
      if (completed === full) return 0;
      const available = Array.from({ length: n }, (_, i) => i).filter(
        (course) => !(completed & (1 << course)) && [...prerequisites[course]].every((before) => completed & (1 << before)),
      );
      if (!available.length) return Infinity;
      let best = Infinity;
      for (let subset = 1; subset < 1 << available.length; subset++) {
        let next = completed;
        for (let i = 0; i < available.length; i++) if (subset & (1 << i)) next |= 1 << available[i];
        best = Math.min(best, 1 + fewest(next));
      }
      return best;
    };
    const answer = fewest(0);
    return answer === Infinity ? -1 : answer;
  },
  'network-delay': (times: number[][], n: number, k: number) => {
    const dist = Array<number>(n + 1).fill(Infinity);
    dist[k] = 0;
    for (let round = 0; round < n; round++) for (const [u, v, w] of times) dist[v] = Math.min(dist[v], dist[u] + w);
    const worst = Math.max(...dist.slice(1));
    return worst === Infinity ? -1 : worst;
  },
  'path-with-minimum-effort': (heights: number[][]) => {
    const rows = heights.length;
    const cols = heights[0].length;
    const costs = new Set([0]);
    for (let r = 0; r < rows; r++)
      for (let c = 0; c < cols; c++) {
        if (r + 1 < rows) costs.add(Math.abs(heights[r][c] - heights[r + 1][c]));
        if (c + 1 < cols) costs.add(Math.abs(heights[r][c] - heights[r][c + 1]));
      }
    for (const limit of [...costs].sort((a, b) => a - b)) {
      const seen = new Set([0]);
      for (const cell of seen) {
        const r = Math.floor(cell / cols);
        const c = cell % cols;
        for (const [y, x] of [
          [r - 1, c],
          [r + 1, c],
          [r, c - 1],
          [r, c + 1],
        ])
          if (y >= 0 && y < rows && x >= 0 && x < cols && Math.abs(heights[r][c] - heights[y][x]) <= limit) seen.add(y * cols + x);
      }
      if (seen.has(rows * cols - 1)) return limit;
    }
    return 0;
  },
  'count-prefixes': (words: string[], prefixes: string[]) => prefixes.map((p) => words.filter((w) => w.startsWith(p)).length),
  'replace-words': (dictionary: string[], sentence: string) =>
    sentence
      .split(' ')
      .map((word) => dictionary.filter((root) => word.startsWith(root)).sort((a, b) => a.length - b.length)[0] ?? word)
      .join(' '),
  'find-duplicate': (nums: number[]) => nums.find((x, i) => nums.indexOf(x) !== i),
  'circular-array-loop': (nums: number[]) => {
    const n = nums.length;
    for (let start = 0; start < n; start++) {
      const direction = Math.sign(nums[start]);
      const seen = new Map<number, number>();
      let at = start;
      while (Math.sign(nums[at]) === direction && !seen.has(at)) {
        seen.set(at, seen.size);
        at = (((at + nums[at]) % n) + n) % n;
      }
      if (Math.sign(nums[at]) === direction && seen.has(at) && seen.size - seen.get(at)! > 1) return true;
    }
    return false;
  },
  'tree-diameter': (root: TreeNode | null) => {
    const { nodes, parent } = nodesOf(root);
    let best = 0;
    for (const start of nodes) {
      const dist = new Map([[start, 0]]);
      for (const [node, d] of dist)
        for (const next of [node.left, node.right, parent.get(node)])
          if (next && !dist.has(next)) {
            dist.set(next, d + 1);
            best = Math.max(best, d + 1);
          }
    }
    return best;
  },
  'house-robber-tree': (root: TreeNode | null) => {
    const { nodes, parent } = nodesOf(root);
    let best = 0;
    for (let mask = 0; mask < 1 << nodes.length; mask++) {
      const robbed = new Set(nodes.filter((_, i) => mask & (1 << i)));
      if ([...robbed].some((node) => parent.has(node) && robbed.has(parent.get(node)!))) continue;
      best = Math.max(
        best,
        [...robbed].reduce((sum, node) => sum + node.val, 0),
      );
    }
    return best;
  },
  'single-number': (nums: number[]) => nums.find((x) => nums.filter((y) => y === x).length === 1),
  'total-hamming-distance': (nums: number[]) => {
    let total = 0;
    for (let i = 0; i < nums.length; i++)
      for (let j = i + 1; j < nums.length; j++) total += [...(nums[i] ^ nums[j]).toString(2)].filter((bit) => bit === '1').length;
    return total;
  },
};

/**
 * What a performance case stresses when its input is small: the table the reference fills or the answer it builds.
 */
const PERFORMANCE_LOAD: Record<string, (test: TestCase) => number> = {
  'longest-common-subsequence': ({ args: [a, b] }) => (a as string).length * (b as string).length,
  'edit-distance': ({ args: [a, b] }) => (a as string).length * (b as string).length,
  'coin-change': ({ args: [coins, amount] }) => (coins as number[]).length * (amount as number),
  subsets: ({ expected }) => (expected as unknown[]).length,
};

describe('coding problems', () => {
  it('are imported in full only by the coding barrel, so no other engine module pulls them into its chunk', () => {
    const src = fileURLToPath(new URL('..', import.meta.url));
    const modules = (readdirSync(src, { recursive: true }) as string[]).filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'));
    const importers = modules.filter((f) => /from '[./]*(?:coding\/)?problems\/index\.js'/.test(readFileSync(src + f, 'utf8')));
    expect(importers.sort()).toEqual(['coding/index.ts']);
  });

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
        const brute = BRUTE[problem.id](...entryArgs(paramTypes(problem), test.args));
        expect(outputsMatch(brute, test.expected, problem.compare), `${problem.id} ${preview(test.args)}`).toBe(true);
      }
    },
  );

  it.each(CODING_PROBLEMS.map((p) => [p.id, p] as const))('%s: the reference solves the performance case quickly', (_id, problem) => {
    const started = performance.now();
    const [perf] = buildSuite(problem, { seed: 3 }).filter((t) => t.kind === 'performance');
    expect(perf).toBeDefined();
    expect(performance.now() - started).toBeLessThan(1_500);
    const load = PERFORMANCE_LOAD[problem.id]?.(perf) ?? JSON.stringify(perf.args).length;
    expect(load).toBeGreaterThan(10_000);
  });

  it('gives every pattern at least two problems', () => {
    expect(PATTERNS.filter((p) => problemsForPattern(p.id).length < 2).map((p) => p.id)).toEqual([]);
  });

  it.each(Object.keys(SLOWER))('%s: the performance case is out of reach for the slower approach', (id) => {
    const problem = getCodingProblem(id)!;
    for (const seed of [1, 3]) {
      const [perf] = buildSuite(problem, { seed }).filter((t) => t.kind === 'performance');
      const args = entryArgs(paramTypes(problem), perf.args);
      // The expected value is available to counters that need the reference answer.
      expect(SLOWER[id](...args, perf.expected), `${id}, seed ${seed}`).toBeGreaterThan(SLOWER_MIN_STEPS[id] ?? 4e9);
      for (const [name, steps] of Object.entries(SLOWER_VARIANTS[id] ?? {}))
        expect(steps(...args, perf.expected), `${id}: ${name}, seed ${seed}`).toBeGreaterThan(4e9);
    }
  });

  it('caps Parallel Courses prerequisite depth for recursive solutions in performance cases', () => {
    const problem = getCodingProblem('parallel-courses')!;
    for (const seed of [1, 3]) {
      const [performanceCase] = buildSuite(problem, { seed }).filter((test) => test.kind === 'performance');
      expect(performanceCase.expected).toBe(37);
      expect((performanceCase.args[1] as number[][]).length).toBeLessThanOrEqual(200_000);
    }
  });

  it('keeps tree inputs in canonical level order and within the stated 100 levels', () => {
    for (const problem of CODING_PROBLEMS.filter((p) => paramTypes(p).includes('tree'))) {
      const types = paramTypes(problem);
      for (const test of buildSuite(problem))
        types.forEach((type, i) => {
          if (type !== 'tree') return;
          const values = test.args[i] as LevelOrder;
          expect(levelOrder(buildTree(values)), `${problem.id} ${preview(values)}`).toEqual(values);
          expect(height(buildTree(values)), problem.id).toBeLessThanOrEqual(100);
        });
    }
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

  it('gives Subsets distinct values and Redundant Connection a tree plus one edge, so each has one right answer', () => {
    for (const test of buildSuite(getCodingProblem('subsets')!, { seed: 11 })) {
      const [nums] = test.args as [number[]];
      expect(new Set(nums).size, preview(nums)).toBe(nums.length);
    }
    for (const test of buildSuite(getCodingProblem('redundant-connection')!, { seed: 11 })) {
      const [edges] = test.args as [number[][]];
      const n = edges.length;
      const parent = rangeOf(0, n);
      const find = (x: number): number => {
        while (parent[x] !== x) x = parent[x] = parent[parent[x]];
        return x;
      };
      let joins = 0;
      for (const [a, b] of edges) {
        const [ra, rb] = [find(a), find(b)];
        if (ra !== rb) {
          parent[ra] = rb;
          joins++;
        }
      }
      const label = preview(edges);
      expect(
        edges.every(([a, b]) => a !== b && Math.min(a, b) >= 1 && Math.max(a, b) <= n),
        label,
      ).toBe(true);
      expect(new Set(edges.map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`)).size, label).toBe(n);
      expect(joins, `connected: ${label}`).toBe(n - 1);
    }
  });

  it('gives Rotting Oranges thousands of rotten oranges that each reach every fresh one, so a BFS from each is too slow', () => {
    const [perf] = buildSuite(getCodingProblem('rotting-oranges')!).filter((t) => t.kind === 'performance');
    const [grid] = perf.args as [number[][]];
    const cols = grid[0].length;
    const cells = grid.flat();
    const neighbors = (k: number) =>
      [k - cols, k + cols, k % cols ? k - 1 : -1, (k + 1) % cols ? k + 1 : -1].filter((n) => n >= 0 && n < cells.length);
    const rotten = cells.flatMap((cell, k) => (cell === 2 ? [k] : []));
    const fresh = cells.filter((cell) => cell === 1).length;
    expect(rotten.every((k) => neighbors(k).some((n) => cells[n] === 1))).toBe(true);
    const reached = new Set([cells.indexOf(1)]);
    for (const k of reached) for (const n of neighbors(k)) if (cells[n] === 1) reached.add(n);
    expect(reached.size).toBe(fresh);
    // A BFS from each rotten orange makes rotten × fresh visits; the tightest one measured, on typed arrays, took 4.6 s.
    expect(rotten.length * fresh).toBeGreaterThan(1e9);
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
    expect(outputsMatch([[1, 3], []], [[], [3, 1]], 'unordered-nested')).toBe(true);
    expect(outputsMatch([[1], [2]], [[1], [1]], 'unordered-nested')).toBe(false);
    expect(outputsMatch([['eat', 'tea'], ['bat']], [['bat'], ['tea', 'eat']], 'unordered-nested')).toBe(true);
  });
});

describe('entryArgs', () => {
  it('builds the tree parameters, copies the rest and leaves the arguments it was given alone', () => {
    const args = [[1, null, 2], [3, 4], 5];
    const [root, nums, k] = entryArgs(['tree', 'int[]', 'int'], args);
    expect(root).toBeInstanceOf(TreeNode);
    expect((root as TreeNode).right!.val).toBe(2);
    expect(nums).toEqual(args[1]);
    expect(nums).not.toBe(args[1]);
    expect(k).toBe(5);
    expect(args[0]).toEqual([1, null, 2]);
  });
});

describe('inputSize', () => {
  it('counts the nodes of a tree and the items of an array or a string', () => {
    expect(inputSize('tree', [1, null, 2, 3])).toBe('3 nodes');
    expect(inputSize('tree', randomTree(mulberry32(1), 100_000, 0, 9))).toBe('100,000 nodes');
    expect(inputSize('int[]', [7])).toBe('1 item');
    expect(inputSize('string', 'abcde')).toBe('5 characters');
    expect(inputSize('char[][]', [['1'], ['0']])).toBe('2 items');
    expect(
      inputSize(
        'char[][]',
        Array.from({ length: 300 }, () => Array<string>(300).fill('0')),
      ),
    ).toBe('300 × 300 grid');
    expect(
      inputSize(
        'int[][]',
        Array.from({ length: 400 }, () => Array<number>(400).fill(0)),
      ),
    ).toBe('400 × 400 grid');
    expect(
      inputSize('int[][]', [
        [1, 2],
        [3, 4],
      ]),
    ).toBe('2 items');
    expect(inputSize('int', 5)).toBeNull();
    expect(inputSize('bool', true)).toBeNull();
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

  it('declares TreeNode above a function that takes a tree', () => {
    const problem = getCodingProblem('tree-diameter')!;
    expect(starterCode(problem, 'javascript')).toContain('function diameterOfBinaryTree(root) {');
    expect(starterCode(problem, 'typescript')).toContain('interface TreeNode {');
    expect(starterCode(problem, 'typescript')).toContain('function diameterOfBinaryTree(root: TreeNode | null): number {');
    expect(starterCode(problem, 'python')).toContain('def diameter_of_binary_tree(root: Optional[TreeNode]) -> int:');
    expect(starterCode(getCodingProblem('two-sum')!, 'typescript')).not.toContain('TreeNode');
  });
});
