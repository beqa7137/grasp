/// <reference types="node" />
import { describe, expect, it } from 'vitest';
import { spawnSync } from 'node:child_process';
import { PATTERNS } from '../curriculum/patterns.js';
import { getAlgorithm } from '../algorithms/index.js';
import { mulberry32, randInt, rangeOf } from '../algorithms/input.js';
import { CODING_PROBLEMS, getCodingProblem, problemsForPattern } from './problems/index.js';
import { randomTree } from './problems/inputs.js';
import { PYTHON_REFERENCE } from './python-reference.fixture.js';
import {
  PYTHON_PRELUDE,
  buildSuite,
  entryArgs,
  entryName,
  exampleCases,
  outputsMatch,
  paramTypes,
  preview,
  pythonHarness,
  snakeCase,
  starterCode,
} from './suite.js';
import { TreeNode, buildTree, levelOrder, type LevelOrder } from './tree.js';
import { LANGUAGES } from './types.js';

/** Every node of a tree with its parent, in level order. */
function nodesOf(root: TreeNode | null) {
  const nodes = root ? [root] : [];
  const parent = new Map<TreeNode, TreeNode>();
  for (let i = 0; i < nodes.length; i++)
    for (const child of [nodes[i].left, nodes[i].right])
      if (child) {
        parent.set(child, nodes[i]);
        nodes.push(child);
      }
  return { nodes, parent };
}

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
  'course-schedule': (_n: number, prerequisites: number[][]) => {
    const reaches = (from: number, to: number, seen: Set<number>): boolean => {
      if (from === to) return true;
      seen.add(from);
      return prerequisites.some(([a, b]) => b === from && !seen.has(a) && reaches(a, to, seen));
    };
    return !prerequisites.some(([a, b]) => reaches(a, b, new Set()));
  },
  'network-delay': (times: number[][], n: number, k: number) => {
    const dist = Array<number>(n + 1).fill(Infinity);
    dist[k] = 0;
    for (let round = 0; round < n; round++) for (const [u, v, w] of times) dist[v] = Math.min(dist[v], dist[u] + w);
    const worst = Math.max(...dist.slice(1));
    return worst === Infinity ? -1 : worst;
  },
  'count-prefixes': (words: string[], prefixes: string[]) => prefixes.map((p) => words.filter((w) => w.startsWith(p)).length),
  'find-duplicate': (nums: number[]) => nums.find((x, i) => nums.indexOf(x) !== i),
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
 * Steps a slower approach needs on the performance case. Past 4·10^9 it cannot finish within the 2 s limit however
 * its loops are written (the fastest quadratic variant measured, a native `indexOf` scan, still took over 5 s).
 */
const SLOWER: Record<string, (...args: any[]) => number> = {
  // Nested loops stop at a copy of the duplicate, and both copies sit mid-array, so scanning from either end is quadratic.
  'find-duplicate': (nums: number[]) => {
    const firstAt = new Map<number, number>();
    for (const [i, x] of nums.entries()) {
      const first = firstAt.get(x);
      if (first !== undefined) return Math.min(first, nums.length - 1 - i) ** 2 / 2;
      firstAt.set(x, i);
    }
    return 0;
  },
  // Searching for each value's partner, from the front or from the back, until the single value comes up.
  'single-number': (nums: number[]) => {
    const at = new Map<number, number[]>();
    nums.forEach((x, i) => at.set(x, [...(at.get(x) ?? []), i]));
    const single = nums.findIndex((x) => at.get(x)!.length === 1);
    const partner = (i: number) => at.get(nums[i])!.find((j) => j !== i)!;
    const fromFront = rangeOf(0, single - 1).reduce((steps, i) => steps + partner(i) + 1, 0);
    const fromBack = rangeOf(single + 1, nums.length - 1).reduce((steps, i) => steps + nums.length - partner(i), 0);
    return Math.min(fromFront, fromBack);
  },
  'total-hamming-distance': (nums: number[]) => (nums.length * (nums.length - 1)) / 2,
  // A breadth-first search from every node.
  'tree-diameter': (root: TreeNode | null) => nodesOf(root).nodes.length ** 2,
  // Recursing into children and grandchildren without a memo evaluates a node once per way down to it in steps of one and two levels.
  'house-robber-tree': (root: TreeNode | null) => {
    const calls = new Map<TreeNode, number>(root ? [[root, 1]] : []);
    let steps = 0;
    for (const [node, count] of calls) {
      steps += count;
      for (const below of [node.left, node.right, node.left?.left, node.left?.right, node.right?.left, node.right?.right])
        if (below) calls.set(below, (calls.get(below) ?? 0) + count);
    }
    return steps;
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
        const brute = BRUTE[problem.id](...entryArgs(paramTypes(problem), structuredClone(test.args)));
        expect(outputsMatch(brute, test.expected, problem.compare), `${problem.id} ${preview(test.args)}`).toBe(true);
      }
    },
  );

  it.each(CODING_PROBLEMS.map((p) => [p.id, p] as const))('%s: the reference solves the performance case quickly', (_id, problem) => {
    const started = performance.now();
    const [perf] = buildSuite(problem, { seed: 3 }).filter((t) => t.kind === 'performance');
    expect(perf).toBeDefined();
    expect(performance.now() - started).toBeLessThan(1_500);
    // LCS stresses the O(m·n) table, not input size: two 1,500-letter strings are only ~3 KB.
    expect(JSON.stringify(perf.args).length).toBeGreaterThan(problem.id === 'longest-common-subsequence' ? 2_000 : 10_000);
  });

  it('give every pattern at least one problem', () => {
    expect(PATTERNS.filter((p) => !problemsForPattern(p.id).length).map((p) => p.id)).toEqual([]);
  });

  it.each(Object.keys(SLOWER))('%s: the performance case is out of reach for the slower approach', (id) => {
    const problem = getCodingProblem(id)!;
    for (const seed of [1, 3]) {
      const [perf] = buildSuite(problem, { seed }).filter((t) => t.kind === 'performance');
      expect(SLOWER[id](...entryArgs(paramTypes(problem), perf.args))).toBeGreaterThan(4e9);
    }
  });

  it('keeps tree inputs in canonical level order and within the stated 100 levels', () => {
    for (const problem of CODING_PROBLEMS) {
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

describe('entryArgs', () => {
  it('builds only the tree parameters and leaves the level order it was given alone', () => {
    const args = [[1, null, 2], [3, 4], 5];
    const [root, nums, k] = entryArgs(['tree', 'int[]', 'int'], args);
    expect(root).toBeInstanceOf(TreeNode);
    expect((root as TreeNode).right!.val).toBe(2);
    expect(nums).toBe(args[1]);
    expect(k).toBe(5);
    expect(args[0]).toEqual([1, null, 2]);
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

describe.runIf(hasPython)('Python harness (CPython)', () => {
  it.each(CODING_PROBLEMS.map((p) => [p.id, p] as const))('%s: the Python reference passes the full suite', (_id, problem) => {
    const suite = buildSuite(problem, { seed: 9 });
    const script = `${PYTHON_PRELUDE}\n${PYTHON_REFERENCE[problem.id]}\n${pythonHarness(entryName(problem, 'python'), paramTypes(problem))}
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

  it('builds the same trees as buildTree, with TreeNode and Optional in scope for annotations', () => {
    const rand = mulberry32(5);
    const trees: LevelOrder[] = [
      [],
      [1],
      [1, null, 2],
      [1, 2, null, 3, null, 4],
      ...Array.from({ length: 40 }, () => randomTree(rand, randInt(rand, 1, 20), -9, 9)),
    ];
    const script = `${PYTHON_PRELUDE}
def echo(root: Optional[TreeNode], k: int) -> list:
    values, queue = [], [root]
    for node in queue:
        values.append(node.val if node else None)
        if node:
            queue += [node.left, node.right]
    while values and values[-1] is None:
        values.pop()
    return values + [k]
${pythonHarness('echo', ['tree', 'int'])}
import sys
for line in sys.stdin:
    print(__grasp_call(line))
`;
    const run = spawnSync('python3', ['-c', script], { input: trees.map((t, k) => JSON.stringify([t, k])).join('\n'), encoding: 'utf8' });
    expect(run.stderr).toBe('');
    expect(
      run.stdout
        .trim()
        .split('\n')
        .map((line) => JSON.parse(line)),
    ).toEqual(trees.map((t, k) => [...t, k]));
  });
});
