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
import { gasStationStarts } from './problems/batch-e.js';
import { PYTHON_REFERENCE } from './python-reference.fixture.js';
import { nodesOf, SLOWER, SLOWER_MIN_STEPS, SLOWER_VARIANTS } from './coding-slower.fixture.js';
import {
  buildSuite,
  entryArgs,
  entryName,
  entryOutput,
  exampleCases,
  inputSize,
  outputsMatch,
  paramTypes,
  preview,
  snakeCase,
  starterCode,
} from './suite.js';
import { ListNode, buildList, listValues } from './list.js';
import { TreeNode, buildTree, levelOrder, type LevelOrder } from './tree.js';
import { LANGUAGES, type TestCase } from './types.js';

const height = (node: TreeNode | null): number => (node ? 1 + Math.max(height(node.left), height(node.right)) : 0);

function safePlacements(n: number, columns = 0, left = 0, right = 0): number {
  const full = (1 << n) - 1;
  let count = 1;
  for (let free = full & ~(columns | left | right); free; free &= free - 1) {
    const bit = free & -free;
    count += safePlacements(n, columns | bit, ((left | bit) << 1) & full, (right | bit) >> 1);
  }
  return count;
}

/** The best chance of any simple path from start to end, as an exact fraction: every path, every product in BigInt. */
function exactBestChance(edges: number[][], start: number, end: number): [bigint, bigint] {
  let best: [bigint, bigint] = [0n, 1n];
  const walk = (node: number, visited: Set<number>, chance: bigint, outOf: bigint) => {
    if (node === end) {
      if (chance * best[1] > best[0] * outOf) best = [chance, outOf];
      return;
    }
    for (const [a, b, percent] of edges) {
      const other = a === node ? b : b === node ? a : -1;
      if (other < 0 || visited.has(other)) continue;
      visited.add(other);
      walk(other, visited, chance * BigInt(percent), outOf * 100n);
      visited.delete(other);
    }
  };
  walk(start, new Set([start]), 1n, 1n);
  return best;
}

/** Whether edges [a, b, ...] join every node from first to last into one component. */
function joinsAll(first: number, last: number, edges: readonly number[][]): boolean {
  const reached = new Set([first]);
  for (let grew = true; grew;) {
    grew = false;
    for (const [a, b] of edges)
      if (reached.has(a) !== reached.has(b)) {
        reached.add(a).add(b);
        grew = true;
      }
  }
  return reached.size === last - first + 1;
}

/** Every subset of items, as arrays, keeping their order. */
const subsets = <T>(items: readonly T[]): T[][] =>
  items.reduce<T[][]>((all, item) => [...all, ...all.map((subset) => [...subset, item])], [[]]);

/** Every set of n - 1 edge indices whose edges join nodes 0 to n - 1: all the spanning trees. */
function spanningTrees(n: number, edges: readonly number[][]): number[][] {
  const trees: number[][] = [];
  const choose = (from: number, picked: number[]) => {
    if (picked.length === n - 1) {
      if (
        joinsAll(
          0,
          n - 1,
          picked.map((i) => edges[i]),
        )
      )
        trees.push([...picked]);
      return;
    }
    for (let i = from; i <= edges.length - (n - 1 - picked.length); i++) choose(i + 1, [...picked, i]);
  };
  choose(0, []);
  return trees;
}

const weightOf = (edges: readonly number[][], tree: number[]) => tree.reduce((sum, i) => sum + edges[i][2], 0);

const MST_PROBLEMS = ['min-cost-connect-points', 'connecting-cities', 'critical-mst-edges', 'water-distribution'];

/** Obviously-correct (and slow) solutions to cross-check the references on small inputs. */
const LOCK_NEIGHBORS = rangeOf(0, 9_999).map((code) => {
  const text = String(code).padStart(4, '0');
  return [0, 1, 2, 3].flatMap((i) => [1, 9].map((step) => Number(text.slice(0, i) + ((Number(text[i]) + step) % 10) + text.slice(i + 1))));
});

const BRUTE: Record<string, (...args: any[]) => unknown> = {
  'two-sum': (nums: number[], t: number) => {
    for (let i = 0; i < nums.length; i++) for (let j = i + 1; j < nums.length; j++) if (nums[i] + nums[j] === t) return [i, j];
    return [];
  },
  'longest-consecutive-sequence': (nums: number[]) =>
    Math.max(
      0,
      ...nums.map((x) => {
        let length = 1;
        while (nums.includes(x + length)) length++;
        return length;
      }),
    ),
  'four-sum-count': (a: number[], b: number[], c: number[], d: number[]) => {
    let count = 0;
    for (const w of a) for (const x of b) for (const y of c) for (const z of d) if (w + x + y + z === 0) count++;
    return count;
  },
  'valid-sudoku': (board: string[][]) => {
    const cells = board.flatMap((row, r) => row.flatMap((digit, c) => (digit === '.' ? [] : [{ r, c, digit }])));
    return cells.every((a, i) =>
      cells
        .slice(i + 1)
        .every(
          (b) =>
            a.digit !== b.digit ||
            (a.r !== b.r && a.c !== b.c && (Math.floor(a.r / 3) !== Math.floor(b.r / 3) || Math.floor(a.c / 3) !== Math.floor(b.c / 3))),
        ),
    );
  },
  'group-anagrams': (strs: string[]) => {
    const letterCounts = (word: string) =>
      [...'abcdefghijklmnopqrstuvwxyz'].map((letter) => [...word].filter((x) => x === letter).length).join();
    const anagrams = (a: string, b: string) => letterCounts(a) === letterCounts(b);
    return strs
      .filter((word, i) => strs.findIndex((other) => anagrams(other, word)) === i)
      .map((word) =>
        strs
          .filter((other) => anagrams(other, word))
          .sort()
          .join(' '),
      );
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
  'three-sum': (nums: number[]) => {
    const found = new Map<string, number[]>();
    for (let i = 0; i < nums.length; i++)
      for (let j = i + 1; j < nums.length; j++)
        for (let k = j + 1; k < nums.length; k++)
          if (nums[i] + nums[j] + nums[k] === 0) {
            const triplet = [nums[i], nums[j], nums[k]].sort((a, b) => a - b);
            found.set(triplet.join(), triplet);
          }
    return [...found.values()];
  },
  'trapping-rain-water': (bars: number[]) =>
    bars.reduce((water, h, i) => water + Math.min(Math.max(...bars.slice(0, i + 1)), Math.max(...bars.slice(i))) - h, 0),
  'boats-to-save-people': (people: number[], limit: number) => {
    const fewest = (left: number[]): number => {
      if (!left.length) return 0;
      const [first, ...rest] = left;
      let best = 1 + fewest(rest);
      rest.forEach((other, i) => {
        if (first + other <= limit) best = Math.min(best, 1 + fewest(rest.filter((_, j) => j !== i)));
      });
      return best;
    };
    return fewest(people);
  },
  'sort-colors': (nums: number[]) => [0, 1, 2].flatMap((color) => nums.filter((x) => x === color)),
  'squares-of-sorted-array': (nums: number[]) => nums.map((x) => x * x).sort((a, b) => a - b),
  'valid-palindrome-ii': (s: string) =>
    rangeOf(-1, s.length - 1).some((skip) => {
      const kept = [...s].filter((_, i) => i !== skip).join('');
      return kept === [...kept].reverse().join('');
    }),
  'jump-game': (nums: number[]) => {
    const reachesEnd = (i: number): boolean =>
      i === nums.length - 1 || rangeOf(i + 1, Math.min(i + nums[i], nums.length - 1)).some(reachesEnd);
    return reachesEnd(0);
  },
  'gas-station': (gas: number[], cost: number[]) => {
    const drivesLoop = (start: number) => {
      let tank = 0;
      for (let k = 0; k < gas.length; k++) {
        const i = (start + k) % gas.length;
        if ((tank += gas[i] - cost[i]) < 0) return false;
      }
      return true;
    };
    return rangeOf(0, gas.length - 1).find(drivesLoop) ?? -1;
  },
  'partition-labels': (s: string) => {
    const sizes: number[] = [];
    let start = 0;
    for (let cut = 1; cut <= s.length; cut++)
      if (![...s].slice(0, cut).some((letter) => s.slice(cut).includes(letter))) {
        sizes.push(cut - start);
        start = cut;
      }
    return sizes;
  },
  candy: (ratings: number[]) => {
    const candies = ratings.map(() => 1);
    for (let changed = true; changed;) {
      changed = false;
      ratings.forEach((rating, i) => {
        for (const j of [i - 1, i + 1])
          if (j >= 0 && j < ratings.length && rating > ratings[j] && candies[i] <= candies[j]) {
            candies[i] = candies[j] + 1;
            changed = true;
          }
      });
    }
    return candies.reduce((sum, c) => sum + c, 0);
  },
  'jump-game-ii': (nums: number[]) => {
    const fewest = (i: number): number =>
      i === nums.length - 1 ? 0 : 1 + Math.min(Infinity, ...rangeOf(i + 1, Math.min(i + nums[i], nums.length - 1)).map(fewest));
    return fewest(0);
  },
  'min-refueling-stops': (target: number, startFuel: number, stations: number[][]) => {
    let best = Infinity;
    for (let mask = 0; mask < 2 ** stations.length; mask++) {
      let fuel = startFuel;
      let position = 0;
      let stops = 0;
      let ok = true;
      stations.forEach(([at, liters], i) => {
        fuel -= at - position;
        position = at;
        if (fuel < 0) ok = false;
        if (mask & (1 << i)) {
          fuel += liters;
          stops++;
        }
      });
      if (ok && fuel >= target - position) best = Math.min(best, stops);
    }
    return best === Infinity ? -1 : best;
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
  'character-replacement': (s: string, k: number) => {
    let best = 0;
    for (let i = 0; i < s.length; i++)
      for (let j = i; j < s.length; j++) {
        const window = s.slice(i, j + 1);
        const most = Math.max(...[...window].map((ch) => window.split(ch).length - 1));
        if (window.length - most <= k) best = Math.max(best, window.length);
      }
    return best;
  },
  'permutation-in-string': (s1: string, s2: string) => {
    const sorted = (s: string) => [...s].sort().join('');
    return rangeOf(0, s2.length - s1.length).some((i) => sorted(s2.slice(i, i + s1.length)) === sorted(s1));
  },
  'minimum-window-substring': (s: string, t: string) => {
    const covers = (window: string) => {
      const left = [...window];
      return [...t].every((ch) => {
        const k = left.indexOf(ch);
        return k >= 0 && left.splice(k, 1).length === 1;
      });
    };
    for (let length = 1; length <= s.length; length++)
      for (let i = 0; i + length <= s.length; i++) if (covers(s.slice(i, i + length))) return s.slice(i, i + length);
    return '';
  },
  'max-consecutive-ones-iii': (nums: number[], k: number) => {
    let best = 0;
    for (let i = 0; i < nums.length; i++)
      for (let j = i; j < nums.length; j++) if (nums.slice(i, j + 1).filter((x) => x === 0).length <= k) best = Math.max(best, j - i + 1);
    return best;
  },
  'fruit-into-baskets': (fruits: number[]) => {
    let best = 0;
    for (let i = 0; i < fruits.length; i++)
      for (let j = i; j < fruits.length; j++) if (new Set(fruits.slice(i, j + 1)).size <= 2) best = Math.max(best, j - i + 1);
    return best;
  },
  'min-operations-reduce-x': (nums: number[], x: number) => {
    let fewest = Infinity;
    for (let front = 0; front <= nums.length; front++)
      for (let back = 0; front + back <= nums.length; back++) {
        const taken = [...nums.slice(0, front), ...nums.slice(nums.length - back)];
        if (taken.reduce((sum, v) => sum + v, 0) === x) fewest = Math.min(fewest, front + back);
      }
    return fewest === Infinity ? -1 : fewest;
  },
  'binary-search': (nums: number[], t: number) => nums.indexOf(t),
  'koko-bananas': (piles: number[], h: number) => {
    const lowerBound = Math.max(1, Math.ceil(piles.reduce((s, p) => s + p, 0) / h));
    for (let k = lowerBound; ; k++) if (piles.reduce((s, p) => s + Math.ceil(p / k), 0) <= h) return k;
  },
  'search-rotated-array': (nums: number[], t: number) => nums.indexOf(t),
  'find-min-rotated': (nums: number[]) => Math.min(...nums),
  'split-array-largest-sum': (nums: number[], k: number) => {
    const sum = (part: number[]) => part.reduce((s, x) => s + x, 0);
    const cheapest = (from: number, parts: number): number => {
      if (parts === 1) return sum(nums.slice(from));
      let best = Infinity;
      for (let end = from + 1; end <= nums.length - parts + 1; end++)
        best = Math.min(best, Math.max(sum(nums.slice(from, end)), cheapest(end, parts - 1)));
      return best;
    };
    return cheapest(0, k);
  },
  'ship-within-days': (weights: number[], days: number) => {
    const sum = (part: number[]) => part.reduce((s, x) => s + x, 0);
    const cheapest = (from: number, daysLeft: number): number => {
      if (from === weights.length) return 0;
      if (daysLeft === 0) return Infinity;
      let best = Infinity;
      for (let end = from + 1; end <= weights.length; end++)
        best = Math.min(best, Math.max(sum(weights.slice(from, end)), cheapest(end, daysLeft - 1)));
      return best;
    };
    return cheapest(0, days);
  },
  'search-2d-matrix': (matrix: number[][], target: number) => matrix.flat().includes(target),
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
  'sum-subarray-minimums': (arr: number[]) => {
    let total = 0;
    for (let i = 0; i < arr.length; i++) {
      let smallest = Infinity;
      for (let j = i; j < arr.length; j++) total += smallest = Math.min(smallest, arr[j]);
    }
    return total % 1_000_000_007;
  },
  'sliding-window-maximum': (nums: number[], k: number) => rangeOf(0, nums.length - k).map((i) => Math.max(...nums.slice(i, i + k))),
  'car-fleet': (target: number, position: number[], speed: number[]) =>
    position.filter((p, i) => position.every((q, j) => q <= p || (target - q) * speed[i] < (target - p) * speed[j])).length,
  'remove-k-digits': (num: string, k: number) => {
    let best: string | undefined;
    for (let mask = 0; mask < 1 << num.length; mask++) {
      const kept = [...num].filter((_, i) => mask & (1 << i));
      if (kept.length !== num.length - k) continue;
      const value = kept.join('').replace(/^0+/, '') || '0';
      if (best === undefined || value.length < best.length || (value.length === best.length && value < best)) best = value;
    }
    return best;
  },
  'next-greater-element-ii': (nums: number[]) =>
    nums.map(
      (x, i) =>
        rangeOf(1, nums.length - 1)
          .map((step) => nums[(i + step) % nums.length])
          .find((y) => y > x) ?? -1,
    ),
  '132-pattern': (nums: number[]) =>
    nums.some((low, i) => nums.some((high, j) => j > i && nums.some((middle, k) => k > j && low < middle && middle < high))),
  'maximal-rectangle': (matrix: string[][]) => {
    let best = 0;
    for (let top = 0; top < matrix.length; top++)
      for (let bottom = top; bottom < matrix.length; bottom++)
        for (let left = 0; left < matrix[0].length; left++)
          for (let right = left; right < matrix[0].length; right++) {
            const cells = matrix.slice(top, bottom + 1).flatMap((row) => row.slice(left, right + 1));
            if (cells.every((cell) => cell === '1')) best = Math.max(best, cells.length);
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
  'contiguous-array': (nums: number[]) => {
    let best = 0;
    for (let i = 0; i < nums.length; i++)
      for (let j = i; j < nums.length; j++) {
        const part = nums.slice(i, j + 1);
        if (part.filter((x) => x === 0).length === part.filter((x) => x === 1).length) best = Math.max(best, part.length);
      }
    return best;
  },
  'subarray-sums-divisible-k': (nums: number[], k: number) => {
    let count = 0;
    for (let i = 0; i < nums.length; i++) {
      let sum = 0;
      for (let j = i; j < nums.length; j++) if ((sum += nums[j]) % k === 0) count++;
    }
    return count;
  },
  'count-nice-subarrays': (nums: number[], k: number) => {
    let count = 0;
    for (let i = 0; i < nums.length; i++)
      for (let j = i; j < nums.length; j++) if (nums.slice(i, j + 1).filter((x) => x % 2 === 1).length === k) count++;
    return count;
  },
  'longest-well-performing-interval': (hours: number[]) => {
    let best = 0;
    for (let i = 0; i < hours.length; i++)
      for (let j = i; j < hours.length; j++) {
        const days = hours.slice(i, j + 1);
        if (days.filter((h) => h > 8).length > days.filter((h) => h <= 8).length) best = Math.max(best, days.length);
      }
    return best;
  },
  'find-pivot-index': (nums: number[]) => {
    const total = (values: number[]) => values.reduce((sum, x) => sum + x, 0);
    return nums.findIndex((_, i) => total(nums.slice(0, i)) === total(nums.slice(i + 1)));
  },
  'max-size-subarray-sum-k': (nums: number[], k: number) => {
    let best = 0;
    for (let i = 0; i < nums.length; i++)
      for (let j = i; j < nums.length; j++) if (nums.slice(i, j + 1).reduce((sum, x) => sum + x, 0) === k) best = Math.max(best, j - i + 1);
    return best;
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
  'shortest-path-binary-matrix': (grid: number[][]) => {
    const n = grid.length;
    const cells = grid.map((row) => row.map(() => Infinity));
    if (grid[0][0] === 0) cells[0][0] = 1;
    for (let changed = true; changed;) {
      changed = false;
      for (let r = 0; r < n; r++)
        for (let c = 0; c < n; c++)
          for (let dr = -1; dr <= 1; dr++)
            for (let dc = -1; dc <= 1; dc++) {
              const from = cells[r + dr]?.[c + dc] ?? Infinity;
              if (grid[r][c] === 0 && from + 1 < cells[r][c]) {
                cells[r][c] = from + 1;
                changed = true;
              }
            }
    }
    return cells[n - 1][n - 1] === Infinity ? -1 : cells[n - 1][n - 1];
  },
  'word-ladder': (beginWord: string, endWord: string, wordList: string[]) => {
    const differByOne = (a: string, b: string) => [...a].filter((letter, i) => letter !== b[i]).length === 1;
    const length = new Map([[beginWord, 1]]);
    for (let changed = true; changed;) {
      changed = false;
      for (const word of wordList)
        for (const [from, words] of length)
          if (differByOne(from, word) && words + 1 < (length.get(word) ?? Infinity)) {
            length.set(word, words + 1);
            changed = true;
          }
    }
    return length.get(endWord) ?? 0;
  },
  'zero-one-matrix': (mat: number[][]) => {
    const zeros = mat.flatMap((row, r) => row.flatMap((cell, c) => (cell ? [] : [[r, c]])));
    return mat.map((row, r) => row.map((_, c) => Math.min(...zeros.map(([y, x]) => Math.abs(y - r) + Math.abs(x - c)))));
  },
  'open-the-lock': (deadends: string[], target: string) => {
    const dead = new Uint8Array(10_000);
    for (const code of deadends) dead[Number(code)] = 1;
    const turns = new Float64Array(10_000).fill(Infinity);
    if (!dead[0]) turns[0] = 0;
    for (let changed = true; changed;) {
      changed = false;
      for (let code = 0; code < 10_000; code++) {
        if (dead[code]) continue;
        for (const other of LOCK_NEIGHBORS[code])
          if (turns[other] + 1 < turns[code]) {
            turns[code] = turns[other] + 1;
            changed = true;
          }
      }
    }
    const answer = turns[Number(target)];
    return answer === Infinity ? -1 : answer;
  },
  'minimum-knight-moves': (x: number, y: number) => {
    const steps = [1, 2, -1, -2].flatMap((da) => [1, 2, -1, -2].filter((db) => Math.abs(da) !== Math.abs(db)).map((db) => [da, db]));
    const key = (a: number, b: number) => (a + 1_000) * 2_000 + b + 1_000;
    const moves = new Map([[key(0, 0), 0]]);
    for (const [square, count] of moves) {
      const [a, b] = [Math.floor(square / 2_000) - 1_000, (square % 2_000) - 1_000];
      if (a === x && b === y) return count;
      for (const [da, db] of steps)
        if (Math.abs(a + da) <= Math.abs(x) + 8 && Math.abs(b + db) <= Math.abs(y) + 8 && !moves.has(key(a + da, b + db)))
          moves.set(key(a + da, b + db), count + 1);
    }
    return -1;
  },
  'far-from-land': (grid: number[][]) => {
    const cells = grid.flatMap((row, r) => row.map((value, c) => ({ r, c, value })));
    const land = cells.filter((cell) => cell.value === 1);
    const water = cells.filter((cell) => cell.value === 0);
    if (!land.length || !water.length) return -1;
    return Math.max(...water.map((w) => Math.min(...land.map((l) => Math.abs(w.r - l.r) + Math.abs(w.c - l.c)))));
  },
  subsets: (nums: number[]) => {
    const sorted = [...nums].sort((a, b) => a - b);
    return rangeOf(0, 2 ** nums.length - 1).map((mask) => sorted.filter((_, i) => mask & (1 << i)));
  },
  'combination-sum': (candidates: number[], target: number) => {
    const found = new Map<string, number[]>();
    const extend = (sequence: number[], rest: number): void => {
      if (rest === 0) {
        const combination = [...sequence].sort((a, b) => a - b);
        found.set(combination.join(','), combination);
      }
      for (const c of candidates) if (c <= rest) extend([...sequence, c], rest - c);
    };
    extend([], target);
    return [...found.values()];
  },
  'word-search': (board: string[][], word: string) => {
    const walk = (r: number, c: number, path: string, used: Set<string>): boolean => {
      if (board[r]?.[c] === undefined || used.has(`${r},${c}`)) return false;
      const spelled = path + board[r][c];
      if (spelled.length === word.length) return spelled === word;
      const next = new Set(used).add(`${r},${c}`);
      return [
        [r + 1, c],
        [r - 1, c],
        [r, c + 1],
        [r, c - 1],
      ].some(([y, x]) => walk(y, x, spelled, next));
    };
    return board.some((row, r) => row.some((_, c) => walk(r, c, '', new Set())));
  },
  permutations: (nums: number[]) =>
    nums.reduce<number[][]>(
      (found, x) => found.flatMap((p) => rangeOf(0, p.length).map((i) => [...p.slice(0, i), x, ...p.slice(i)])),
      [[]],
    ),
  'n-queens-count': (n: number) => {
    const columns: number[] = [];
    const count = (): number => {
      if (columns.length === n) {
        const attacks = columns.some((c, i) => columns.some((d, j) => i < j && Math.abs(c - d) === j - i));
        return attacks ? 0 : 1;
      }
      let total = 0;
      for (let c = 0; c < n; c++)
        if (!columns.includes(c)) {
          columns.push(c);
          total += count();
          columns.pop();
        }
      return total;
    };
    return count();
  },
  'generate-parentheses': (n: number) =>
    rangeOf(0, 4 ** n - 1)
      .map((mask) =>
        rangeOf(0, 2 * n - 1)
          .map((i) => ((mask >> i) & 1 ? '(' : ')'))
          .join(''),
      )
      .filter((s) => {
        let rest = s;
        while (rest.includes('()')) rest = rest.replaceAll('()', '');
        return rest === '';
      }),
  'letter-combinations': (digits: string) => {
    const keys = [...digits].map((d) => ['abc', 'def', 'ghi', 'jkl', 'mno', 'pqrs', 'tuv', 'wxyz'][Number(d) - 2]);
    const count = digits ? keys.reduce((product, letters) => product * letters.length, 1) : 0;
    return rangeOf(0, count - 1).map((index) =>
      keys
        .map((letters, i) => letters[Math.floor(index / keys.slice(i + 1).reduce((product, l) => product * l.length, 1)) % letters.length])
        .join(''),
    );
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
  'insert-interval': (intervals: number[][], newInterval: number[]) => {
    const covered = new Set<number>();
    for (const [start, end] of [...intervals, newInterval]) for (let x = 2 * start; x <= 2 * end; x++) covered.add(x);
    const points = [...covered].sort((a, b) => a - b);
    const out: number[][] = [];
    for (const x of points)
      if (covered.has(x - 1)) out[out.length - 1][1] = x / 2;
      else out.push([x / 2, x / 2]);
    return out;
  },
  'meeting-rooms-ii': (intervals: number[][]) =>
    Math.max(...intervals.map(([at]) => intervals.filter(([start, end]) => start <= at && at < end).length)),
  'interval-list-intersections': (firstList: number[][], secondList: number[][]) =>
    firstList
      .flatMap(([a, b]) => secondList.map(([c, d]) => [Math.max(a, c), Math.min(b, d)]))
      .filter(([start, end]) => start <= end)
      .sort((x, y) => x[0] - y[0]),
  'remove-covered-intervals': (intervals: number[][]) =>
    intervals.filter(([a, b], i) => !intervals.some(([c, d], j) => j !== i && c <= a && b <= d)).length,
  'car-pooling': (trips: number[][], capacity: number) =>
    trips.every(([, km]) => trips.reduce((load, [passengers, from, to]) => load + (from <= km && km < to ? passengers : 0), 0) <= capacity),
  'min-arrows-balloons': (points: number[][]) => {
    const spots = [...new Set(points.map(([, end]) => end))];
    let fewest = Infinity;
    for (let mask = 1; mask < 2 ** spots.length; mask++) {
      const arrows = spots.filter((_, i) => mask & (1 << i));
      if (points.every(([start, end]) => arrows.some((x) => start <= x && x <= end))) fewest = Math.min(fewest, arrows.length);
    }
    return fewest;
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
  'word-break': (s: string, wordDict: string[]) => {
    const splits = (rest: string): boolean =>
      rest === '' || rangeOf(1, rest.length).some((k) => wordDict.includes(rest.slice(0, k)) && splits(rest.slice(k)));
    return splits(s);
  },
  'partition-equal-subset': (nums: number[]) => {
    const total = nums.reduce((sum, x) => sum + x, 0);
    return rangeOf(0, 2 ** nums.length - 1).some((mask) => 2 * nums.reduce((sum, x, i) => (mask & (1 << i) ? sum + x : sum), 0) === total);
  },
  'longest-increasing-subsequence': (nums: number[]) => {
    let best = 0;
    for (let mask = 1; mask < 2 ** nums.length; mask++) {
      const picked = nums.filter((_, i) => mask & (1 << i));
      if (picked.every((x, i) => i === 0 || picked[i - 1] < x)) best = Math.max(best, picked.length);
    }
    return best;
  },
  'decode-ways': (s: string) => {
    const memo = new Map<number, bigint>();
    const count = (i: number): bigint => {
      if (i === s.length) return 1n;
      if (!memo.has(i))
        memo.set(
          i,
          [1, 2]
            .filter((size) => i + size <= s.length && s[i] !== '0' && Number(s.slice(i, i + size)) <= 26)
            .reduce((sum, size) => sum + count(i + size), 0n),
        );
      return memo.get(i)!;
    };
    return Number(count(0) % 1_000_000_007n);
  },
  'maximum-product-subarray': (nums: number[]) => {
    let best = -Infinity;
    for (let i = 0; i < nums.length; i++)
      for (let j = i + 1; j <= nums.length; j++)
        best = Math.max(
          best,
          nums.slice(i, j).reduce((product, x) => product * x, 1),
        );
    return best;
  },
  // Each multiset of values that adds up to the target, times the number of orders of it.
  'combination-sum-iv': (nums: number[], target: number) => {
    const factorial = (k: number): bigint => (k <= 1 ? 1n : BigInt(k) * factorial(k - 1));
    let total = 0n;
    const pick = (i: number, rest: number, counts: number[]) => {
      if (i === nums.length) {
        if (rest === 0) total += counts.reduce((orders, c) => orders / factorial(c), factorial(counts.reduce((a, b) => a + b, 0)));
        return;
      }
      for (let c = 0; c * nums[i] <= rest; c++) pick(i + 1, rest - c * nums[i], [...counts, c]);
    };
    pick(0, target, []);
    return Number(total);
  },
  'longest-string-chain': (words: string[]) => {
    const isSubsequence = (a: string, b: string) => {
      let at = 0;
      for (const letter of b) if (letter === a[at]) at++;
      return at === a.length;
    };
    const chainFrom = (word: string): number =>
      1 + Math.max(0, ...words.filter((next) => next.length === word.length + 1 && isSubsequence(word, next)).map(chainFrom));
    return Math.max(...words.map(chainFrom));
  },
  'kth-largest-element': (nums: number[], k: number) =>
    nums.find((x) => nums.filter((y) => y > x).length < k && nums.filter((y) => y >= x).length >= k),
  'k-closest-points': (points: number[][], k: number) => {
    const distance = ([x, y]: number[]) => Math.hypot(x, y);
    return points.filter((p) => points.filter((q) => distance(q) < distance(p)).length < k);
  },
  'task-scheduler': (tasks: string[], n: number) => {
    const kinds = [...new Set(tasks)];
    const start = JSON.stringify([kinds.map((kind) => tasks.filter((t) => t === kind).length), kinds.map(() => 0)]);
    const units = new Map([[start, 0]]);
    for (const [state, time] of units) {
      const [left, wait] = JSON.parse(state) as number[][];
      if (left.every((count) => count === 0)) return time;
      const cooled = wait.map((w) => Math.max(0, w - 1));
      const moves = [[left, cooled]];
      kinds.forEach((_, i) => {
        if (left[i] && !wait[i])
          moves.push([left.map((count, j) => (j === i ? count - 1 : count)), cooled.map((w, j) => (j === i ? n : w))]);
      });
      for (const next of moves.map((move) => JSON.stringify(move))) if (!units.has(next)) units.set(next, time + 1);
    }
    return -1;
  },
  'kth-smallest-sorted-matrix': (matrix: number[][], k: number) => matrix.flat().sort((a, b) => a - b)[k - 1],
  'last-stone-weight': (stones: number[]) => {
    const left = [...stones];
    while (left.length > 1) {
      left.sort((a, b) => a - b);
      const y = left.pop()!;
      const x = left.pop()!;
      if (x !== y) left.push(y - x);
    }
    return left[0] ?? 0;
  },
  'merge-k-sorted-arrays': (arrays: number[][]) => arrays.flat().sort((a, b) => a - b),
  ipo: (k: number, w: number, profits: number[], capital: number[]) => {
    const best = (money: number, left: number, used: number): number =>
      profits.reduce(
        (most, profit, i) =>
          left && !(used & (1 << i)) && capital[i] <= money ? Math.max(most, best(money + profit, left - 1, used | (1 << i))) : most,
        money,
      );
    return best(w, k, 0);
  },
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
  'longest-palindromic-subsequence': (s: string) => {
    let best = 0;
    for (let mask = 1; mask < 2 ** s.length; mask++) {
      const picked = [...s].filter((_, i) => mask & (1 << i));
      if (picked.join('') === [...picked].reverse().join('')) best = Math.max(best, picked.length);
    }
    return best;
  },
  'interleaving-string': (s1: string, s2: string, s3: string) =>
    s3.length === s1.length + s2.length &&
    rangeOf(0, 2 ** s3.length - 1).some(
      (mask) => [...s3].filter((_, i) => mask & (1 << i)).join('') === s1 && [...s3].filter((_, i) => !(mask & (1 << i))).join('') === s2,
    ),
  'unique-paths-ii': (grid: number[][]) => {
    const memo = new Map<string, bigint>();
    const paths = (r: number, c: number): bigint => {
      if (r === grid.length || c === grid[0].length || grid[r][c]) return 0n;
      if (r === grid.length - 1 && c === grid[0].length - 1) return 1n;
      const key = `${r},${c}`;
      if (!memo.has(key)) memo.set(key, paths(r + 1, c) + paths(r, c + 1));
      return memo.get(key)!;
    };
    return Number(paths(0, 0) % 1_000_000_007n);
  },
  // The position in s of each letter of t in turn, trying every later match.
  'distinct-subsequences': (s: string, t: string) => {
    const memo = new Map<string, bigint>();
    const ways = (from: number, j: number): bigint => {
      if (j === t.length) return 1n;
      const key = `${from},${j}`;
      if (!memo.has(key)) {
        let total = 0n;
        for (let k = from; k < s.length; k++) if (s[k] === t[j]) total += ways(k + 1, j + 1);
        memo.set(key, total);
      }
      return memo.get(key)!;
    };
    return Number(ways(0, 0));
  },
  'count-palindromic-substrings': (s: string) => {
    let count = 0;
    for (let i = 0; i < s.length; i++)
      for (let j = i + 1; j <= s.length; j++) if (s.slice(i, j) === s.slice(i, j).split('').reverse().join('')) count++;
    return count;
  },
  'minimum-path-sum': (grid: number[][]) => {
    const cheapest = (r: number, c: number): number =>
      grid[r][c] +
      (r === grid.length - 1 && c === grid[0].length - 1
        ? 0
        : Math.min(r + 1 < grid.length ? cheapest(r + 1, c) : Infinity, c + 1 < grid[0].length ? cheapest(r, c + 1) : Infinity));
    return cheapest(0, 0);
  },
  'maximal-square': (matrix: string[][]) => {
    let best = 0;
    for (let r = 0; r < matrix.length; r++)
      for (let c = 0; c < matrix[0].length; c++)
        for (let side = 1; r + side <= matrix.length && c + side <= matrix[0].length; side++)
          if (matrix.slice(r, r + side).every((row) => row.slice(c, c + side).every((cell) => cell === '1')))
            best = Math.max(best, side * side);
    return best;
  },
  'burst-balloons': (nums: number[]) => {
    const most = (left: number[]): number =>
      Math.max(0, ...left.map((x, i) => (left[i - 1] ?? 1) * x * (left[i + 1] ?? 1) + most(left.filter((_, j) => j !== i))));
    return most(nums);
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
  'number-of-provinces': (isConnected: number[][]) => {
    const n = isConnected.length;
    const reach = isConnected.map((row) => row.map(Boolean));
    for (let via = 0; via < n; via++)
      for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) reach[i][j] ||= reach[i][via] && reach[via][j];
    return new Set(reach.map((row) => row.join())).size;
  },
  'equality-equations': (equations: string[]) => {
    const letters = [...'abcdefghijklmnopqrstuvwxyz'];
    const equal = letters.map((x) => letters.map((y) => x === y));
    for (const e of equations)
      if (e[1] === '=') equal[e.charCodeAt(0) - 97][e.charCodeAt(3) - 97] = equal[e.charCodeAt(3) - 97][e.charCodeAt(0) - 97] = true;
    for (let via = 0; via < 26; via++)
      for (let i = 0; i < 26; i++) for (let j = 0; j < 26; j++) equal[i][j] ||= equal[i][via] && equal[via][j];
    return equations.every((e) => e[1] === '=' || !equal[e.charCodeAt(0) - 97][e.charCodeAt(3) - 97]);
  },
  'smallest-string-with-swaps': (s: string, pairs: number[][]) => {
    const reached = new Set([s]);
    for (const text of reached)
      for (const [a, b] of pairs) {
        const letters = [...text];
        [letters[a], letters[b]] = [letters[b], letters[a]];
        reached.add(letters.join(''));
      }
    return [...reached].sort()[0];
  },
  'most-stones-removed': (stones: number[][]) => {
    const best = new Map<number, number>();
    const removals = (left: number): number => {
      if (best.has(left)) return best.get(left)!;
      let most = 0;
      stones.forEach(([x, y], i) => {
        const shares = stones.some(([u, v], j) => j !== i && left & (1 << j) && (u === x || v === y));
        if (left & (1 << i) && shares) most = Math.max(most, 1 + removals(left & ~(1 << i)));
      });
      best.set(left, most);
      return most;
    };
    return removals((1 << stones.length) - 1);
  },
  'make-network-connected': (n: number, connections: number[][]) => {
    if (connections.length < n - 1) return -1;
    const seen = new Set<number>();
    let groups = 0;
    for (let start = 0; start < n; start++) {
      if (seen.has(start)) continue;
      groups++;
      seen.add(start);
      for (const stack = [start]; stack.length;) {
        const node = stack.pop()!;
        for (const [a, b] of connections) {
          const other = a === node ? b : b === node ? a : -1;
          if (other >= 0 && !seen.has(other)) {
            seen.add(other);
            stack.push(other);
          }
        }
      }
    }
    return groups - 1;
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
  'longest-increasing-path': (matrix: number[][]) => {
    const longestFrom = (r: number, c: number): number =>
      1 +
      Math.max(
        0,
        ...[
          [r - 1, c],
          [r + 1, c],
          [r, c - 1],
          [r, c + 1],
        ]
          .filter(([y, x]) => (matrix[y]?.[x] ?? -Infinity) > matrix[r][c])
          .map(([y, x]) => longestFrom(y, x)),
      );
    return Math.max(...matrix.flatMap((row, r) => row.map((_, c) => longestFrom(r, c))));
  },
  'minimum-height-trees': (n: number, edges: number[][]) => {
    const heightFrom = (root: number) => {
      const depth = new Map([[root, 0]]);
      for (const [node, d] of depth)
        for (const [a, b] of edges) {
          const other = a === node ? b : b === node ? a : -1;
          if (other >= 0 && !depth.has(other)) depth.set(other, d + 1);
        }
      return Math.max(...depth.values());
    };
    const heights = rangeOf(0, n - 1).map(heightFrom);
    const least = Math.min(...heights);
    return rangeOf(0, n - 1).filter((node) => heights[node] === least);
  },
  'sequence-reconstruction': (nums: number[], sequences: number[][]) => {
    const values = [...new Set(sequences.flat())];
    const orders = values.reduce<number[][]>(
      (found, x) => found.flatMap((p) => rangeOf(0, p.length).map((i) => [...p.slice(0, i), x, ...p.slice(i)])),
      [[]],
    );
    const contains = (order: number[], list: number[]) => {
      let at = 0;
      for (const x of order) if (x === list[at]) at++;
      return at === list.length;
    };
    return values.length === nums.length && orders.filter((order) => sequences.every((list) => contains(order, list))).length === 1;
  },
  'parallel-courses-iii': (n: number, relations: number[][], time: number[]) => {
    const finish = (course: number): number =>
      time[course - 1] + Math.max(0, ...relations.filter(([, next]) => next === course).map(([prev]) => finish(prev)));
    return Math.max(...rangeOf(1, n).map(finish));
  },
  'find-all-recipes': (recipes: string[], ingredients: string[], supplies: string[]) => {
    const have = new Set(supplies);
    for (let changed = true; changed;) {
      changed = false;
      recipes.forEach((dish, i) => {
        if (!have.has(dish) && ingredients[i].split(' ').every((name) => have.has(name))) {
          have.add(dish);
          changed = true;
        }
      });
    }
    return recipes.filter((dish) => have.has(dish));
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
  'cheapest-flights': (_n: number, flights: number[][], src: number, dst: number, k: number) => {
    const cheapest = (city: number, flightsLeft: number): number =>
      city === dst
        ? 0
        : Math.min(
            Infinity,
            ...flights.filter(([from]) => from === city && flightsLeft > 0).map(([, to, price]) => price + cheapest(to, flightsLeft - 1)),
          );
    const best = cheapest(src, k + 1);
    return best === Infinity ? -1 : best;
  },
  'swim-rising-water': (grid: number[][]) => {
    const n = grid.length;
    for (let t = 0; ; t++) {
      const reached = new Set(grid[0][0] <= t ? ['0,0'] : []);
      for (const key of reached) {
        const [r, c] = key.split(',').map(Number);
        for (const [y, x] of [
          [r - 1, c],
          [r + 1, c],
          [r, c - 1],
          [r, c + 1],
        ])
          if ((grid[y]?.[x] ?? Infinity) <= t) reached.add(`${y},${x}`);
      }
      if (reached.has(`${n - 1},${n - 1}`)) return t;
    }
  },
  'minimum-obstacle-removal': (grid: number[][]) => {
    const cost = grid.map((row) => row.map(() => Infinity));
    cost[0][0] = 0;
    for (let changed = true; changed;) {
      changed = false;
      grid.forEach((row, r) =>
        row.forEach((_, c) => {
          for (const [y, x] of [
            [r - 1, c],
            [r + 1, c],
            [r, c - 1],
            [r, c + 1],
          ])
            if (y >= 0 && y < grid.length && x >= 0 && x < row.length && cost[r][c] + grid[y][x] < cost[y][x]) {
              cost[y][x] = cost[r][c] + grid[y][x];
              changed = true;
            }
        }),
      );
    }
    return cost[grid.length - 1][grid[0].length - 1];
  },
  'path-max-probability': (_n: number, edges: number[][], start: number, end: number) => {
    const [chance, outOf] = exactBestChance(edges, start, end);
    return Number((2n * chance * 1_000_000n + outOf) / (2n * outOf));
  },
  'ways-to-arrive': (n: number, roads: number[][]) => {
    const time = Array<number>(n).fill(Infinity);
    time[0] = 0;
    for (let round = 0; round < n; round++)
      for (const [u, v, t] of roads) {
        time[v] = Math.min(time[v], time[u] + t);
        time[u] = Math.min(time[u], time[v] + t);
      }
    const memo = new Map<number, bigint>([[0, 1n]]);
    const routes = (node: number): bigint => {
      if (!memo.has(node))
        memo.set(
          node,
          roads.reduce((sum, [u, v, t]) => {
            const other = v === node ? u : u === node ? v : -1;
            return other >= 0 && time[other] + t === time[node] ? sum + routes(other) : sum;
          }, 0n),
        );
      return memo.get(node)!;
    };
    return time[n - 1] === Infinity ? 0 : Number(routes(n - 1) % 1_000_000_007n);
  },
  // Every spanning tree of the complete graph on the points, the lightest kept.
  'min-cost-connect-points': (points: number[][]) => {
    const pairs = points.flatMap(([x, y], i) => points.slice(0, i).map(([u, v], j) => [i, j, Math.abs(x - u) + Math.abs(y - v)]));
    return Math.min(...spanningTrees(points.length, pairs).map((tree) => weightOf(pairs, tree)));
  },
  // Every set of roads, the cheapest one that joins all the cities kept.
  'connecting-cities': (n: number, connections: number[][]) => {
    const costs = subsets(connections)
      .filter((roads) => joinsAll(1, n, roads))
      .map((roads) => roads.reduce((sum, [, , cost]) => sum + cost, 0));
    return costs.length ? Math.min(...costs) : -1;
  },
  // Every spanning tree: the lightest ones are the MSTs, and an edge is critical when all of them take it.
  'critical-mst-edges': (n: number, edges: number[][]) => {
    const trees = spanningTrees(n, edges);
    const best = Math.min(...trees.map((tree) => weightOf(edges, tree)));
    const msts = trees.filter((tree) => weightOf(edges, tree) === best);
    const taken = (i: number) => msts.filter((tree) => tree.includes(i)).length;
    const indices = rangeOf(0, edges.length - 1);
    return [indices.filter((i) => taken(i) === msts.length), indices.filter((i) => taken(i) > 0 && taken(i) < msts.length)];
  },
  // Every set of wells and pipes, the cheapest one that brings water to every house kept; a well joins its house to the source 0.
  'water-distribution': (n: number, wells: number[], pipes: number[][]) =>
    Math.min(
      ...subsets([...wells.map((cost, i) => [0, i + 1, cost]), ...pipes])
        .filter((chosen) => joinsAll(0, n, chosen))
        .map((chosen) => chosen.reduce((sum, [, , cost]) => sum + cost, 0)),
    ),
  'count-prefixes': (words: string[], prefixes: string[]) => prefixes.map((p) => words.filter((w) => w.startsWith(p)).length),
  'replace-words': (dictionary: string[], sentence: string) =>
    sentence
      .split(' ')
      .map((word) => dictionary.filter((root) => word.startsWith(root)).sort((a, b) => a.length - b.length)[0] ?? word)
      .join(' '),
  'word-search-ii': (board: string[][], words: string[]) => {
    const spells = (word: string, r: number, c: number, i: number, used: Set<string>): boolean => {
      if (board[r]?.[c] !== word[i] || used.has(`${r},${c}`)) return false;
      if (i === word.length - 1) return true;
      const next = new Set(used).add(`${r},${c}`);
      return [
        [r - 1, c],
        [r + 1, c],
        [r, c - 1],
        [r, c + 1],
      ].some(([y, x]) => spells(word, y, x, i + 1, next));
    };
    return words.filter((word) => board.some((row, r) => row.some((_, c) => spells(word, r, c, 0, new Set()))));
  },
  'longest-word-in-dictionary': (words: string[]) =>
    words
      .filter((word) => rangeOf(1, word.length - 1).every((k) => words.includes(word.slice(0, k))))
      .sort((a, b) => b.length - a.length || (a < b ? -1 : 1))[0] ?? '',
  'search-suggestions-system': (products: string[], searchWord: string) =>
    rangeOf(1, searchWord.length).map((length) =>
      products
        .map((product, i) => [product, i] as const)
        .filter(([product]) => product.startsWith(searchWord.slice(0, length)))
        .sort(([a], [b]) => a.localeCompare(b, 'en'))
        .slice(0, 3)
        .map(([, i]) => i),
    ),
  'maximum-xor-with-element': (nums: number[], queries: number[][]) =>
    queries.map(([x, m]) => nums.filter((v) => v <= m).reduce((best, v) => Math.max(best, Number(BigInt(x) ^ BigInt(v))), -1)),
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
  'happy-numbers': (nums: number[]) =>
    nums.filter((n) => {
      const seen = new Set<number>();
      while (n !== 1 && !seen.has(n)) {
        seen.add(n);
        n = [...String(n)].reduce((sum, digit) => sum + Number(digit) ** 2, 0);
      }
      return n === 1;
    }),
  'move-zeroes': (nums: number[]) => [...nums.filter((x) => x !== 0), ...nums.filter((x) => x === 0)],
  'remove-duplicates-sorted-ii': (nums: number[]) => nums.filter((x, i) => nums.slice(0, i).filter((y) => y === x).length < 2),
  'linked-list-cycle-ii': (next: number[]) => {
    const seen = new Set<number>();
    let node = 0;
    while (node !== -1 && !seen.has(node)) {
      seen.add(node);
      node = next[node];
    }
    return node;
  },
  'reverse-linked-list': (head: ListNode | null) => listValues(head).reverse(),
  'reverse-linked-list-ii': (head: ListNode, left: number, right: number) => {
    const values = listValues(head);
    return [...values.slice(0, left - 1), ...values.slice(left - 1, right).reverse(), ...values.slice(right)];
  },
  'swap-nodes-in-pairs': (head: ListNode | null) => {
    const values = listValues(head);
    return values.map((_, i) => (i % 2 ? values[i - 1] : (values[i + 1] ?? values[i])));
  },
  'reverse-nodes-k-group': (head: ListNode, k: number) => {
    const values = listValues(head);
    return rangeOf(0, Math.ceil(values.length / k) - 1).flatMap((g) => {
      const group = values.slice(g * k, g * k + k);
      return group.length === k ? group.reverse() : group;
    });
  },
  'palindrome-linked-list': (head: ListNode) => {
    const values = listValues(head);
    return values.join() === [...values].reverse().join();
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
  'max-path-sum': (root: TreeNode | null) => {
    const { nodes, parent } = nodesOf(root);
    const upFrom = (node: TreeNode) => {
      const chain = [node];
      while (parent.has(chain[chain.length - 1])) chain.push(parent.get(chain[chain.length - 1])!);
      return chain;
    };
    let best = -Infinity;
    for (const a of nodes)
      for (const b of nodes) {
        const fromA = upFrom(a);
        const fromB = upFrom(b);
        const meet = fromA.find((node) => fromB.includes(node))!;
        const path = [...fromA.slice(0, fromA.indexOf(meet) + 1), ...fromB.slice(0, fromB.indexOf(meet))];
        best = Math.max(
          best,
          path.reduce((sum, node) => sum + node.val, 0),
        );
      }
    return best;
  },
  'validate-bst': (root: TreeNode | null) => {
    const values = (node: TreeNode | null): number[] => (node ? [node.val, ...values(node.left), ...values(node.right)] : []);
    return nodesOf(root).nodes.every(
      (node) => values(node.left).every((v) => v < node.val) && values(node.right).every((v) => v > node.val),
    );
  },
  'lowest-common-ancestor': (root: TreeNode, p: number, q: number) => {
    const { nodes, parent } = nodesOf(root);
    const upFrom = (value: number) => {
      const chain = [nodes.find((node) => node.val === value)!];
      while (parent.has(chain[chain.length - 1])) chain.push(parent.get(chain[chain.length - 1])!);
      return chain;
    };
    const aboveQ = upFrom(q);
    return upFrom(p).find((node) => aboveQ.includes(node))!.val;
  },
  'right-side-view': (root: TreeNode | null) => {
    const { nodes, parent } = nodesOf(root);
    const depth = new Map<TreeNode, number>();
    const view: number[] = [];
    for (const node of nodes) {
      const d = parent.has(node) ? depth.get(parent.get(node)!)! + 1 : 0;
      depth.set(node, d);
      view[d] = node.val;
    }
    return view;
  },
  'path-sum-iii': (root: TreeNode | null, targetSum: number) => {
    const { nodes, parent } = nodesOf(root);
    let count = 0;
    for (const end of nodes)
      for (let node: TreeNode | undefined = end, sum = 0; node; node = parent.get(node)) if ((sum += node.val) === targetSum) count++;
    return count;
  },
  'kth-smallest-bst': (root: TreeNode | null, k: number) =>
    nodesOf(root)
      .nodes.map((node) => node.val)
      .sort((a, b) => a - b)[k - 1],
  'count-good-nodes': (root: TreeNode | null) => {
    const { nodes, parent } = nodesOf(root);
    return nodes.filter((node) => {
      for (let above = parent.get(node); above; above = parent.get(above)) if (above.val > node.val) return false;
      return true;
    }).length;
  },
  'single-number': (nums: number[]) => nums.find((x) => nums.filter((y) => y === x).length === 1),
  'total-hamming-distance': (nums: number[]) => {
    let total = 0;
    for (let i = 0; i < nums.length; i++)
      for (let j = i + 1; j < nums.length; j++) total += [...(nums[i] ^ nums[j]).toString(2)].filter((bit) => bit === '1').length;
    return total;
  },
  'counting-bits': (n: number) => rangeOf(0, n).map((i) => [...i.toString(2)].filter((bit) => bit === '1').length),
  'maximum-xor-pair': (nums: number[]) => {
    let best = 0;
    for (let i = 0; i < nums.length; i++) for (let j = i; j < nums.length; j++) best = Math.max(best, nums[i] ^ nums[j]);
    return best;
  },
  'missing-number': (nums: number[]) => rangeOf(0, nums.length).find((x) => !nums.includes(x)),
  'single-number-ii': (nums: number[]) => nums.find((x) => nums.filter((y) => y === x).length === 1),
  'minimum-flips-or': (a: number, b: number, c: number) => {
    const bits = (x: number) => [...x.toString(2).padStart(31, '0')];
    const [x, y, z] = [bits(a), bits(b), bits(c)];
    return z.reduce((flips, bit, i) => flips + (bit === '1' ? (x[i] === '1' || y[i] === '1' ? 0 : 1) : Number(x[i]) + Number(y[i])), 0);
  },
};

/**
 * What a performance case stresses when its input is small: the table the reference fills or the answer it builds.
 */
const PERFORMANCE_LOAD: Record<string, (test: TestCase) => number> = {
  'longest-common-subsequence': ({ args: [a, b] }) => (a as string).length * (b as string).length,
  'edit-distance': ({ args: [a, b] }) => (a as string).length * (b as string).length,
  'longest-palindromic-subsequence': ({ args: [s] }) => (s as string).length ** 2,
  'coin-change': ({ args: [coins, amount] }) => (coins as number[]).length * (amount as number),
  'partition-equal-subset': ({ args: [nums] }) => ((nums as number[]).length * (nums as number[]).reduce((sum, x) => sum + x, 0)) / 2,
  'interleaving-string': ({ args: [s1, s2] }) => (s1 as string).length * (s2 as string).length,
  'combination-sum-iv': ({ args: [nums, target] }) => (nums as number[]).length * (target as number),
  'distinct-subsequences': ({ args: [s, t] }) => (s as string).length * (t as string).length,
  'count-palindromic-substrings': ({ args: [s] }) => (s as string).length ** 2,
  'burst-balloons': ({ args: [nums] }) => (nums as number[]).length ** 3 / 6,
  subsets: ({ expected }) => (expected as unknown[]).length,
  'combination-sum': ({ expected }) => (expected as number[][]).flat().length,
  'counting-bits': ({ args: [n] }) => n as number,
  // The sets of n - 1 edges a brute force would try to find every minimum spanning tree.
  'critical-mst-edges': ({ args }) => SLOWER['critical-mst-edges'](...args),
  permutations: ({ expected }) => (expected as unknown[]).length,
  // The board positions a backtracking search reaches: every placement of queens in the first rows that no two attack.
  'n-queens-count': ({ args: [n] }) => safePlacements(n as number),
  // A BFS visits every square fewer moves away than the target, more than (|x| + |y|)² of them.
  'minimum-knight-moves': ({ args: [x, y] }) => (Math.abs(x as number) + Math.abs(y as number)) ** 2,
  'generate-parentheses': ({ expected }) => (expected as unknown[]).length,
  'letter-combinations': ({ expected }) => (expected as unknown[]).length,
  // Every board is 9 × 9: there is no larger input and no slower approach to rule out.
  'valid-sudoku': () => Infinity,
  // Three 31-bit values: there is no larger input and no slower approach to rule out.
  'minimum-flips-or': () => Infinity,
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
    // CPU time, not wall time: under a parallel run the wall clock measures the machine's load, not the reference.
    const started = process.cpuUsage();
    const [perf] = buildSuite(problem, { seed: 3 }).filter((t) => t.kind === 'performance');
    expect(perf).toBeDefined();
    const { user, system } = process.cpuUsage(started);
    expect((user + system) / 1_000).toBeLessThan(1_500);
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

  it('keeps every Reverse Nodes in k-Group performance case out of reach for the slower approach, whatever the seed', () => {
    const problem = getCodingProblem('reverse-nodes-k-group')!;
    for (let seed = 0; seed < 300; seed++) {
      const [head, k] = problem.performanceCase(mulberry32(seed)) as [number[], number];
      expect(SLOWER['reverse-nodes-k-group'](buildList(head), k), `seed ${seed}`).toBeGreaterThan(4e9);
    }
  });

  it('keeps every minimum spanning tree performance case out of reach for the slower approach, whatever the seed', () => {
    for (const id of MST_PROBLEMS) {
      const problem = getCodingProblem(id)!;
      for (let seed = 0; seed < 25; seed++)
        expect(SLOWER[id](...problem.performanceCase(mulberry32(seed))), `${id}, seed ${seed}`).toBeGreaterThan(
          SLOWER_MIN_STEPS[id] ?? 4e9,
        );
    }
  });

  it('keeps minimum spanning tree inputs within the limits their statements give', () => {
    const within = (values: number[], lo: number, hi: number) => values.every((v) => Number.isInteger(v) && lo <= v && v <= hi);
    const pairs = (edges: number[][]) => new Set(edges.map(([a, b]) => `${Math.min(a, b)}-${Math.max(a, b)}`)).size;
    for (const id of MST_PROBLEMS) {
      const problem = getCodingProblem(id)!;
      for (const { args } of buildSuite(problem, { seed: 11 })) {
        const label = `${id} ${preview(args)}`;
        if (id === 'min-cost-connect-points') {
          const [points] = args as [number[][]];
          expect(points.length >= 1 && points.length <= 1000 && within(points.flat(), -1e6, 1e6), label).toBe(true);
          expect(new Set(points.map(String)).size, label).toBe(points.length);
          continue;
        }
        const [n, first, second] = args as [number, number[][] | number[], number[][]];
        const edges = (id === 'water-distribution' ? second : first) as number[][];
        const nodes = edges.flatMap(([a, b]) => [a, b]);
        expect(
          edges.every((edge) => edge.length === 3 && edge[0] !== edge[1]),
          label,
        ).toBe(true);
        if (id === 'critical-mst-edges') {
          expect(n >= 2 && n <= 100 && edges.length >= 1 && edges.length <= Math.min(200, (n * (n - 1)) / 2), label).toBe(true);
          expect(
            edges.every(([a, b]) => a < b) &&
              within(nodes, 0, n - 1) &&
              within(
                edges.map((e) => e[2]),
                1,
                1000,
              ),
            label,
          ).toBe(true);
          expect(pairs(edges) === edges.length && joinsAll(0, n - 1, edges), label).toBe(true);
        } else {
          expect(n >= 2 && n <= 100_000 && edges.length >= 1 && edges.length <= 100_000, label).toBe(true);
          expect(
            within(nodes, 1, n) &&
              within(
                edges.map((e) => e[2]),
                0,
                100_000,
              ),
            label,
          ).toBe(true);
          if (id === 'water-distribution')
            expect((first as number[]).length === n && within(first as number[], 0, 100_000), label).toBe(true);
        }
      }
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

  it('keeps list inputs within the sizes, values and positions their statements give', () => {
    for (const problem of CODING_PROBLEMS.filter((p) => paramTypes(p).includes('list'))) {
      const figures = problem.id === 'palindrome-linked-list';
      for (const test of buildSuite(problem, { seed: 11 })) {
        const [values, a, b] = test.args as [number[], number?, number?];
        const label = `${problem.id} ${preview(test.args)}`;
        expect(values.length, label).toBeLessThanOrEqual(200_000);
        expect(
          values.every((v) => Number.isInteger(v) && (figures ? v >= 0 && v <= 9 : Math.abs(v) <= 100_000)),
          label,
        ).toBe(true);
        if (problem.params.length > 1 || figures) expect(values.length, label).toBeGreaterThanOrEqual(1);
        if (problem.id === 'reverse-linked-list-ii') expect(1 <= a! && a! <= b! && b! <= values.length, label).toBe(true);
        if (problem.id === 'reverse-nodes-k-group') expect(1 <= a! && a! <= values.length, label).toBe(true);
      }
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

  it('gives Gas Station at most one start that drives the whole loop, as its statement promises', () => {
    for (const seed of [1, 3, 11])
      for (const test of buildSuite(getCodingProblem('gas-station')!, { seed })) {
        const starts = gasStationStarts(...(test.args as [number[], number[]]));
        expect(starts.length, preview(test.args)).toBeLessThanOrEqual(1);
        expect(test.expected, preview(test.args)).toBe(starts[0] ?? -1);
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

  it('keeps the promises K Closest Points and Combination Sum make about their answers', () => {
    for (const test of buildSuite(getCodingProblem('k-closest-points')!, { seed: 11 })) {
      const [points, k] = test.args as [number[][], number];
      const distances = points.map(([x, y]) => x * x + y * y).sort((a, b) => a - b);
      expect(k === points.length || distances[k - 1] < distances[k], preview(test.args)).toBe(true);
    }
    for (const test of buildSuite(getCodingProblem('combination-sum')!, { seed: 11 })) {
      const [candidates] = test.args as [number[]];
      expect(new Set(candidates).size, preview(candidates)).toBe(candidates.length);
      expect((test.expected as number[][]).length).toBeLessThanOrEqual(1_000);
    }
  });

  it('keeps Path with Maximum Probability a thousandth away from a half after scaling, as its statement promises', () => {
    for (const seed of [1, 3, 7, 9, 11])
      for (const test of buildSuite(getCodingProblem('path-max-probability')!, { seed, performance: false })) {
        const [, edges, start, end] = test.args as [number, number[][], number, number];
        const [chance, outOf] = exactBestChance(edges, start, end);
        const twoThousandths = (chance * 2_000_000_000n) % (2_000n * outOf);
        expect(twoThousandths <= 998n * outOf || twoThousandths >= 1_002n * outOf, preview(test.args)).toBe(true);
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

  it('builds list parameters as linked ListNodes, and an empty list as null', () => {
    const [head, empty] = entryArgs(['list', 'list'], [[4, 5, 6], []]);
    expect(head).toBeInstanceOf(ListNode);
    expect(listValues(head)).toEqual([4, 5, 6]);
    expect(empty).toBeNull();
  });
});

describe('entryOutput', () => {
  it('reads a returned list as its values, nothing returned as the empty list, and leaves every other result alone', () => {
    expect(entryOutput('list', buildList([3, 2, 1]))).toEqual([3, 2, 1]);
    expect(entryOutput('list', null)).toEqual([]);
    expect(entryOutput('list', undefined)).toEqual([]);
    expect(entryOutput('list', { val: 1, next: { val: 2, next: undefined } })).toEqual([1, 2]);
    expect(entryOutput('int[]', [1, 2])).toEqual([1, 2]);
    expect(entryOutput('int', undefined)).toBeUndefined();
  });

  it('rejects a returned array or other value where the head of a list belongs, as the Python harness does', () => {
    expect(() => entryOutput('list', [1, 2])).toThrow('Return the head ListNode (or null/None), not an array.');
    expect(() => entryOutput('list', { a: 1 })).toThrow('Return the head ListNode (or null/None), not a value of type object.');
    expect(() => entryOutput('list', 7)).toThrow('Return the head ListNode (or null/None), not a value of type number.');
    expect(() => entryOutput('list', { val: 1, next: 5 })).toThrow(
      'A next link must be a ListNode or null/None, not a value of type number.',
    );
  });

  it('reports a returned list that loops instead of walking it forever', () => {
    const head = buildList([1, 2, 3])!;
    head.next!.next!.next = head.next;
    expect(() => entryOutput('list', head)).toThrow('The returned list loops: after 3 nodes it comes back to a node with value 2.');
  });
});

describe('inputSize', () => {
  it('counts the nodes of a tree and the items of an array or a string', () => {
    expect(inputSize('tree', [1, null, 2, 3])).toBe('3 nodes');
    expect(inputSize('tree', randomTree(mulberry32(1), 100_000, 0, 9))).toBe('100,000 nodes');
    expect(inputSize('list', [1, 2, 3])).toBe('3 nodes');
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

  it('defines ListNode in JavaScript and TypeScript above a function that takes or returns a list, and names it in Python', () => {
    const problem = getCodingProblem('reverse-linked-list')!;
    expect(starterCode(problem, 'javascript')).toContain('class ListNode {\n  constructor(val = 0, next = null) {');
    expect(starterCode(problem, 'javascript')).toContain('function reverseList(head) {');
    expect(starterCode(problem, 'typescript')).toContain('function reverseList(head: ListNode | null): ListNode | null {');
    expect(starterCode(problem, 'python')).toContain('def reverse_list(head: Optional[ListNode]) -> Optional[ListNode]:');
    expect(starterCode(getCodingProblem('palindrome-linked-list')!, 'typescript')).toContain('class ListNode {');
    expect(starterCode(getCodingProblem('two-sum')!, 'javascript')).not.toContain('ListNode');
  });
});
