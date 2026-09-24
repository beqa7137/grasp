import { randInt, shuffle } from '../algorithms/input.js';
import type { Args, CodingProblem } from './types.js';

const ints = (rand: () => number, n: number, lo: number, hi: number) => Array.from({ length: n }, () => randInt(rand, lo, hi));
const distinctSorted = (rand: () => number, n: number, lo: number, hi: number) => {
  const set = new Set<number>();
  while (set.size < n) set.add(randInt(rand, lo, hi));
  return [...set].sort((a, b) => a - b);
};

/** Two indices whose values sum to target; exactly one such pair exists. */
function twoSumCase(rand: () => number, n: number, range: number): Args {
  for (;;) {
    const nums = ints(rand, n, -range, range);
    const i = randInt(rand, 0, n - 1);
    let j = randInt(rand, 0, n - 2);
    if (j >= i) j++;
    const target = nums[i] + nums[j];
    let pairs = 0;
    const seen = new Map<number, number>();
    for (const x of nums) {
      pairs += seen.get(target - x) ?? 0;
      seen.set(x, (seen.get(x) ?? 0) + 1);
    }
    if (pairs === 1) return [nums, target];
  }
}

function sortedPairCase(rand: () => number, n: number, range: number): Args {
  for (;;) {
    const nums = distinctSorted(rand, n, -range, range);
    const i = randInt(rand, 0, n - 2);
    const j = randInt(rand, i + 1, n - 1);
    const target = nums[i] + nums[j];
    let pairs = 0;
    for (let a = 0, b = n - 1; a < b;) {
      const sum = nums[a] + nums[b];
      if (sum === target) {
        pairs++;
        a++;
        b--;
      } else if (sum < target) a++;
      else b--;
    }
    if (pairs === 1) return [nums, target];
  }
}

/**
 * Large inputs with exactly one answer: every value is a multiple of 4 except the two answer values,
 * which are 1 mod 4, so theirs is the only sum that is 2 mod 4.
 */
function uniquePairAtScale(rand: () => number, n: number, sorted: boolean): Args {
  const quarter = 250_000_000;
  const values = new Set<number>();
  while (values.size < n - 2) values.add(4 * randInt(rand, -quarter, quarter - 1));
  const a = 4 * randInt(rand, -quarter, quarter - 1) + 1;
  let b = a;
  while (b === a) b = 4 * randInt(rand, -quarter, quarter - 1) + 1;
  const nums = [...values, a, b];
  return [sorted ? nums.sort((x, y) => x - y) : shuffle(rand, nums), a + b];
}

function randomEdges(rand: () => number, n: number, count: number, directed: boolean): number[][] {
  const seen = new Set<string>();
  const edges: number[][] = [];
  for (let tries = 0; edges.length < count && tries < count * 4 + 20; tries++) {
    const a = randInt(rand, 0, n - 1);
    const b = randInt(rand, 0, n - 1);
    const id = directed ? `${a}>${b}` : `${Math.min(a, b)}-${Math.max(a, b)}`;
    if (a === b || seen.has(id)) continue;
    seen.add(id);
    edges.push([a, b]);
  }
  return edges;
}

/** Prerequisite pairs [a, b] (b before a) that follow a hidden order, optionally with one edge that closes a cycle. */
function randomDag(rand: () => number, n: number, count: number, cyclic: boolean): number[][] {
  const rank = shuffle(
    rand,
    Array.from({ length: n }, (_, i) => i),
  );
  const pairs = randomEdges(rand, n, count, false).map(([x, y]) => (rank[x] < rank[y] ? [y, x] : [x, y]));
  if (cyclic && pairs.length) {
    const [a, b] = pairs[randInt(rand, 0, pairs.length - 1)];
    const reverse = pairs.findIndex(([x, y]) => x === b && y === a);
    if (reverse === -1) pairs.push([b, a]);
  }
  return pairs;
}

function randomWeighted(rand: () => number, n: number, count: number): number[][] {
  return randomEdges(rand, n, count, true).map(([u, v]) => [u + 1, v + 1, randInt(rand, 0, 100)]);
}

function islandGrid(rand: () => number, rows: number, cols: number, density: number): string[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => (rand() < density ? '1' : '0')));
}

export const CODING_PROBLEMS: CodingProblem[] = [
  {
    id: 'two-sum',
    title: 'Two Sum',
    difficulty: 'easy',
    patternIds: ['hashing'],
    statement: [
      'Given an array of integers nums and an integer target, return the indices of the two numbers that add up to target.',
      'Exactly one pair adds up to target, and you may not use the same element twice. Return the two indices in any order.',
    ],
    constraints: ['2 ≤ nums.length ≤ 10^5', '-10^9 ≤ nums[i], target ≤ 10^9', 'Exactly one valid answer exists'],
    entry: 'twoSum',
    params: [
      { name: 'nums', type: 'int[]' },
      { name: 'target', type: 'int' },
    ],
    returns: 'int[]',
    compare: 'unordered',
    examples: [
      { args: [[2, 7, 11, 15], 9], explanation: 'nums[0] + nums[1] = 2 + 7 = 9' },
      { args: [[3, 2, 4], 6] },
      { args: [[3, 3], 6] },
    ],
    edgeCases: [
      [[-3, 4, 3, 90], 0],
      [[0, 4, 3, 0], 0],
      [[1, 5], 6],
    ],
    randomCase: (rand) => twoSumCase(rand, randInt(rand, 2, 12), 20),
    performanceCase: (rand) => uniquePairAtScale(rand, 100_000, false),
    solve(nums: number[], target: number) {
      const seen = new Map<number, number>();
      for (let i = 0; i < nums.length; i++) {
        const j = seen.get(target - nums[i]);
        if (j !== undefined) return [j, i];
        seen.set(nums[i], i);
      }
      return [];
    },
    approach: 'One pass with a hash map from value to index: for each number, look up its complement before storing it.',
    complexity: { time: 'O(n)', space: 'O(n)' },
  },
  {
    id: 'pair-sum-sorted',
    title: 'Two Sum in a Sorted Array',
    difficulty: 'easy',
    patternIds: ['two-pointers'],
    algorithmId: 'pair-sum-sorted',
    statement: [
      'nums is sorted in non-decreasing order. Return the indices [i, j] with i < j of the only pair whose values add up to target.',
      'Aim for constant extra space.',
    ],
    constraints: ['2 ≤ nums.length ≤ 10^5', 'nums is sorted', 'Exactly one valid answer exists'],
    entry: 'pairSum',
    params: [
      { name: 'nums', type: 'int[]' },
      { name: 'target', type: 'int' },
    ],
    returns: 'int[]',
    compare: 'exact',
    examples: [{ args: [[1, 3, 4, 6, 8, 11], 10], explanation: 'nums[2] + nums[3] = 4 + 6 = 10' }, { args: [[2, 3, 4], 6] }],
    edgeCases: [
      [[-5, -1, 0, 3], -6],
      [[1, 2], 3],
    ],
    randomCase: (rand) => sortedPairCase(rand, randInt(rand, 2, 12), 30),
    performanceCase: (rand) => uniquePairAtScale(rand, 100_000, true),
    solve(nums: number[], target: number) {
      let lo = 0;
      let hi = nums.length - 1;
      while (lo < hi) {
        const sum = nums[lo] + nums[hi];
        if (sum === target) return [lo, hi];
        if (sum < target) lo++;
        else hi--;
      }
      return [];
    },
    approach: 'Two pointers from both ends: move the left one up when the sum is too small and the right one down when it is too big.',
    complexity: { time: 'O(n)', space: 'O(1)' },
  },
  {
    id: 'container-most-water',
    title: 'Container With Most Water',
    difficulty: 'medium',
    patternIds: ['two-pointers', 'greedy'],
    statement: [
      'height[i] is the height of a vertical line at position i. Pick two lines that, together with the x-axis, hold the most water.',
      'Return the maximum area: the distance between the lines times the shorter line.',
    ],
    constraints: ['2 ≤ height.length ≤ 10^5', '0 ≤ height[i] ≤ 10^4'],
    entry: 'maxArea',
    params: [{ name: 'height', type: 'int[]' }],
    returns: 'int',
    compare: 'exact',
    examples: [{ args: [[1, 8, 6, 2, 5, 4, 8, 3, 7]], explanation: 'Lines at 1 and 8: min(8, 7) × 7 = 49' }, { args: [[1, 1]] }],
    edgeCases: [[[0, 0]], [[4, 3, 2, 1, 4]], [[1, 2, 1]]],
    randomCase: (rand) => [ints(rand, randInt(rand, 2, 14), 0, 20)],
    performanceCase: (rand) => [ints(rand, 100_000, 0, 10_000)],
    solve(height: number[]) {
      let lo = 0;
      let hi = height.length - 1;
      let best = 0;
      while (lo < hi) {
        best = Math.max(best, Math.min(height[lo], height[hi]) * (hi - lo));
        if (height[lo] < height[hi]) lo++;
        else hi--;
      }
      return best;
    },
    approach: 'Start with the widest pair and always move the shorter line inward: keeping it can never produce a larger area.',
    complexity: { time: 'O(n)', space: 'O(1)' },
  },
  {
    id: 'longest-unique-substring',
    title: 'Longest Substring Without Repeating Characters',
    difficulty: 'medium',
    patternIds: ['sliding-window'],
    algorithmId: 'longest-unique-substring',
    statement: ['Given a string s, return the length of the longest substring that contains no repeated characters.'],
    constraints: ['0 ≤ s.length ≤ 10^5', 's consists of printable ASCII characters'],
    entry: 'lengthOfLongestSubstring',
    params: [{ name: 's', type: 'string' }],
    returns: 'int',
    compare: 'exact',
    examples: [
      { args: ['abcabcbb'], explanation: '"abc" has length 3' },
      { args: ['bbbbb'] },
      { args: ['pwwkew'], explanation: '"wke" has length 3; "pwke" is not contiguous' },
    ],
    edgeCases: [[''], [' '], ['dvdf'], ['abba']],
    randomCase: (rand) => [Array.from({ length: randInt(rand, 0, 16) }, () => 'abcde'[randInt(rand, 0, 4)]).join('')],
    performanceCase: (rand) => [Array.from({ length: 100_000 }, () => String.fromCharCode(randInt(rand, 33, 126))).join('')],
    solve(s: string) {
      const last = new Map<string, number>();
      let start = 0;
      let best = 0;
      for (let i = 0; i < s.length; i++) {
        const prev = last.get(s[i]);
        if (prev !== undefined && prev >= start) start = prev + 1;
        last.set(s[i], i);
        best = Math.max(best, i - start + 1);
      }
      return best;
    },
    approach: 'Grow a window to the right and jump its left edge past the previous copy of any repeated character.',
    complexity: { time: 'O(n)', space: 'O(k) for k distinct characters' },
  },
  {
    id: 'binary-search',
    title: 'Binary Search',
    difficulty: 'easy',
    patternIds: ['binary-search'],
    algorithmId: 'binary-search',
    statement: [
      'nums is sorted in ascending order with distinct values. Return the index of target, or -1 if it is not present.',
      'Aim for O(log n).',
    ],
    constraints: ['1 ≤ nums.length ≤ 10^5', 'values are distinct and sorted'],
    entry: 'search',
    params: [
      { name: 'nums', type: 'int[]' },
      { name: 'target', type: 'int' },
    ],
    returns: 'int',
    compare: 'exact',
    examples: [{ args: [[-1, 0, 3, 5, 9, 12], 9], explanation: '9 is at index 4' }, { args: [[-1, 0, 3, 5, 9, 12], 2] }],
    edgeCases: [
      [[5], 5],
      [[5], -5],
      [[1, 3], 3],
      [[1, 3], 0],
    ],
    randomCase: (rand) => {
      const nums = distinctSorted(rand, randInt(rand, 1, 14), -50, 50);
      return [nums, rand() < 0.7 ? nums[randInt(rand, 0, nums.length - 1)] : randInt(rand, -60, 60)];
    },
    performanceCase: (rand) => {
      const nums = distinctSorted(rand, 100_000, -1_000_000_000, 1_000_000_000);
      return [nums, nums[randInt(rand, 0, nums.length - 1)]];
    },
    solve(nums: number[], target: number) {
      let lo = 0;
      let hi = nums.length - 1;
      while (lo <= hi) {
        const mid = lo + ((hi - lo) >> 1);
        if (nums[mid] === target) return mid;
        if (nums[mid] < target) lo = mid + 1;
        else hi = mid - 1;
      }
      return -1;
    },
    approach: 'Keep an interval that must contain the target and halve it by comparing with the middle element.',
    complexity: { time: 'O(log n)', space: 'O(1)' },
  },
  {
    id: 'koko-bananas',
    title: 'Minimum Eating Speed',
    difficulty: 'medium',
    patternIds: ['binary-search'],
    statement: [
      'There are piles of bananas; piles[i] is the size of pile i. Each hour you pick one pile and eat up to k bananas from it. If the pile has fewer than k, you finish it and wait for the next hour.',
      'Return the smallest integer speed k that lets you finish every pile within h hours.',
    ],
    constraints: ['1 ≤ piles.length ≤ 10^4', 'piles.length ≤ h ≤ 10^9', '1 ≤ piles[i] ≤ 10^9'],
    entry: 'minEatingSpeed',
    params: [
      { name: 'piles', type: 'int[]' },
      { name: 'h', type: 'int' },
    ],
    returns: 'int',
    compare: 'exact',
    examples: [
      { args: [[3, 6, 7, 11], 8], explanation: 'At speed 4 the piles take 1 + 2 + 2 + 3 = 8 hours' },
      { args: [[30, 11, 23, 4, 20], 5] },
    ],
    edgeCases: [
      [[1], 1],
      [[1000000000], 2],
      [[312884470], 968709470],
    ],
    randomCase: (rand) => {
      const piles = ints(rand, randInt(rand, 1, 8), 1, 40);
      return [piles, randInt(rand, piles.length, piles.length * 4)];
    },
    performanceCase: (rand) => {
      const piles = ints(rand, 10_000, 500_000_000, 1_000_000_000);
      return [piles, piles.length + 7];
    },
    solve(piles: number[], h: number) {
      const hours = (k: number) => piles.reduce((t, p) => t + Math.ceil(p / k), 0);
      let lo = 1;
      let hi = Math.max(...piles);
      while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (hours(mid) <= h) hi = mid;
        else lo = mid + 1;
      }
      return lo;
    },
    approach: 'Binary search on the answer: finishing in time is monotonic in k, so find the first speed that works.',
    complexity: { time: 'O(n log max(piles))', space: 'O(1)' },
  },
  {
    id: 'daily-temperatures',
    title: 'Days Until Warmer',
    difficulty: 'medium',
    patternIds: ['monotonic-stack'],
    algorithmId: 'next-greater-element',
    statement: [
      'Given daily temperatures, return an array where answer[i] is the number of days after day i until a strictly warmer temperature. Use 0 if no warmer day comes.',
    ],
    constraints: ['1 ≤ temperatures.length ≤ 10^5', '30 ≤ temperatures[i] ≤ 100'],
    entry: 'dailyTemperatures',
    params: [{ name: 'temperatures', type: 'int[]' }],
    returns: 'int[]',
    compare: 'exact',
    examples: [{ args: [[73, 74, 75, 71, 69, 72, 76, 73]] }, { args: [[30, 40, 50, 60]] }, { args: [[30, 60, 90]] }],
    edgeCases: [[[50]], [[70, 70, 70]], [[90, 80, 70, 60]]],
    randomCase: (rand) => [ints(rand, randInt(rand, 1, 14), 30, 45)],
    performanceCase: () => [Array.from({ length: 100_000 }, (_, i) => (i === 99_999 ? 100 : 50))],
    solve(temperatures: number[]) {
      const answer = temperatures.map(() => 0);
      const stack: number[] = [];
      temperatures.forEach((t, i) => {
        while (stack.length && temperatures[stack[stack.length - 1]] < t) {
          const j = stack.pop()!;
          answer[j] = i - j;
        }
        stack.push(i);
      });
      return answer;
    },
    approach: 'Keep a stack of days still waiting for a warmer one; each new day pops and answers every cooler day on top.',
    complexity: { time: 'O(n)', space: 'O(n)' },
  },
  {
    id: 'subarray-sum-k',
    title: 'Subarrays Summing to K',
    difficulty: 'medium',
    patternIds: ['prefix-sum', 'hashing'],
    statement: ['Return how many contiguous, non-empty subarrays of nums add up to exactly k. Values can be negative.'],
    constraints: ['1 ≤ nums.length ≤ 10^5', '-1000 ≤ nums[i] ≤ 1000', '-10^7 ≤ k ≤ 10^7'],
    entry: 'subarraySum',
    params: [
      { name: 'nums', type: 'int[]' },
      { name: 'k', type: 'int' },
    ],
    returns: 'int',
    compare: 'exact',
    examples: [{ args: [[1, 1, 1], 2], explanation: '[1,1] twice' }, { args: [[1, 2, 3], 3] }],
    edgeCases: [
      [[0, 0, 0], 0],
      [[-1, -1, 1], 0],
      [[5], 4],
    ],
    randomCase: (rand) => [ints(rand, randInt(rand, 1, 12), -3, 4), randInt(rand, -3, 6)],
    performanceCase: (rand) => [ints(rand, 100_000, -2, 2), 0],
    solve(nums: number[], k: number) {
      const seen = new Map<number, number>([[0, 1]]);
      let sum = 0;
      let count = 0;
      for (const x of nums) {
        sum += x;
        count += seen.get(sum - k) ?? 0;
        seen.set(sum, (seen.get(sum) ?? 0) + 1);
      }
      return count;
    },
    approach: 'Running prefix sums in a hash map: every earlier prefix equal to sum − k closes a subarray summing to k.',
    complexity: { time: 'O(n)', space: 'O(n)' },
  },
  {
    id: 'number-of-islands',
    title: 'Number of Islands',
    difficulty: 'medium',
    patternIds: ['bfs', 'dfs-backtracking'],
    algorithmId: 'grid-bfs',
    statement: [
      "grid is a map of '1' (land) and '0' (water). An island is land connected horizontally or vertically. Return the number of islands.",
    ],
    constraints: ['1 ≤ rows, cols ≤ 300', "grid[r][c] is '0' or '1'"],
    entry: 'numIslands',
    params: [{ name: 'grid', type: 'char[][]' }],
    returns: 'int',
    compare: 'exact',
    examples: [
      {
        args: [
          [
            ['1', '1', '0', '0', '0'],
            ['1', '1', '0', '0', '0'],
            ['0', '0', '1', '0', '0'],
            ['0', '0', '0', '1', '1'],
          ],
        ],
      },
    ],
    edgeCases: [[[['0']]], [[['1']]], [[['1', '0', '1', '0', '1']]], [[['1'], ['1'], ['0'], ['1']]]],
    randomCase: (rand) => [islandGrid(rand, randInt(rand, 1, 7), randInt(rand, 1, 7), 0.45)],
    performanceCase: (rand) => [islandGrid(rand, 300, 300, 0.4)],
    solve(grid: string[][]) {
      const rows = grid.length;
      const cols = grid[0].length;
      const seen = grid.map((r) => r.map(() => false));
      let islands = 0;
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          if (grid[r][c] !== '1' || seen[r][c]) continue;
          islands++;
          const queue: [number, number][] = [[r, c]];
          seen[r][c] = true;
          while (queue.length) {
            const [y, x] = queue.pop()!;
            for (const [dy, dx] of [
              [1, 0],
              [-1, 0],
              [0, 1],
              [0, -1],
            ]) {
              const ny = y + dy;
              const nx = x + dx;
              if (ny >= 0 && ny < rows && nx >= 0 && nx < cols && grid[ny][nx] === '1' && !seen[ny][nx]) {
                seen[ny][nx] = true;
                queue.push([ny, nx]);
              }
            }
          }
        }
      }
      return islands;
    },
    approach: 'Scan every cell; each unvisited land cell starts a new island, and a BFS or DFS marks the rest of it.',
    complexity: { time: 'O(rows × cols)', space: 'O(rows × cols)' },
  },
  {
    id: 'merge-intervals',
    title: 'Merge Intervals',
    difficulty: 'medium',
    patternIds: ['intervals'],
    algorithmId: 'merge-intervals',
    statement: [
      'Given intervals [start, end], merge all overlapping ones and return the result sorted by start. Touching intervals like [1,4] and [4,5] overlap.',
    ],
    constraints: ['1 ≤ intervals.length ≤ 10^5', '0 ≤ start ≤ end ≤ 10^6'],
    entry: 'merge',
    params: [{ name: 'intervals', type: 'int[][]' }],
    returns: 'int[][]',
    compare: 'exact',
    examples: [
      {
        args: [
          [
            [1, 3],
            [2, 6],
            [8, 10],
            [15, 18],
          ],
        ],
      },
      {
        args: [
          [
            [1, 4],
            [4, 5],
          ],
        ],
      },
    ],
    edgeCases: [
      [[[1, 4]]],
      [
        [
          [1, 4],
          [0, 4],
        ],
      ],
      [
        [
          [1, 4],
          [2, 3],
        ],
      ],
      [
        [
          [5, 6],
          [1, 2],
        ],
      ],
    ],
    randomCase: (rand) => [
      Array.from({ length: randInt(rand, 1, 8) }, () => {
        const start = randInt(rand, 0, 20);
        return [start, start + randInt(rand, 0, 5)];
      }),
    ],
    performanceCase: (rand) => [
      shuffle(
        rand,
        Array.from({ length: 100_000 }, (_, i) => [i * 10, i * 10 + randInt(rand, 0, 12)]),
      ),
    ],
    solve(intervals: number[][]) {
      const sorted = [...intervals].sort((a, b) => a[0] - b[0]);
      const out: number[][] = [];
      for (const [start, end] of sorted) {
        const last = out[out.length - 1];
        if (last && start <= last[1]) last[1] = Math.max(last[1], end);
        else out.push([start, end]);
      }
      return out;
    },
    approach: 'Sort by start, then sweep: extend the current interval while the next one starts before it ends.',
    complexity: { time: 'O(n log n)', space: 'O(n)' },
  },
  {
    id: 'top-k-frequent',
    title: 'Top K Frequent Elements',
    difficulty: 'medium',
    patternIds: ['heap', 'hashing'],
    statement: ['Return the k most frequent values in nums, in any order. The answer is unique.'],
    constraints: ['1 ≤ nums.length ≤ 10^5', '1 ≤ k ≤ number of distinct values'],
    entry: 'topKFrequent',
    params: [
      { name: 'nums', type: 'int[]' },
      { name: 'k', type: 'int' },
    ],
    returns: 'int[]',
    compare: 'unordered',
    examples: [{ args: [[1, 1, 1, 2, 2, 3], 2] }, { args: [[1], 1] }],
    edgeCases: [
      [[4, 4, -1, -1, -1, 7], 1],
      [[5, 3, 5, 3, 5, 9], 3],
    ],
    randomCase: (rand) => {
      const distinct = randInt(rand, 1, 6);
      const values = distinctSorted(rand, distinct, -20, 20);
      const nums = values.flatMap((v, i) => Array.from({ length: i + 1 }, () => v));
      return [shuffle(rand, nums), randInt(rand, 1, distinct)];
    },
    performanceCase: (rand) => {
      const values = distinctSorted(rand, 440, -1_000_000, 1_000_000);
      const nums = values.flatMap((v, i) => Array.from({ length: i + 1 }, () => v));
      return [shuffle(rand, nums), 50];
    },
    solve(nums: number[], k: number) {
      const counts = new Map<number, number>();
      for (const x of nums) counts.set(x, (counts.get(x) ?? 0) + 1);
      return [...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .slice(0, k)
        .map(([v]) => v);
    },
    approach: 'Count with a hash map, then keep the k largest counts with a size-k min-heap (or bucket by frequency for O(n)).',
    complexity: { time: 'O(n log k)', space: 'O(n)' },
  },
  {
    id: 'house-robber',
    title: 'House Robber',
    difficulty: 'medium',
    patternIds: ['dp-1d'],
    statement: ['Each house on a street holds some money. You cannot take from two adjacent houses. Return the most money you can take.'],
    constraints: ['1 ≤ nums.length ≤ 10^5', '0 ≤ nums[i] ≤ 400'],
    entry: 'rob',
    params: [{ name: 'nums', type: 'int[]' }],
    returns: 'int',
    compare: 'exact',
    examples: [{ args: [[1, 2, 3, 1]], explanation: 'Houses 0 and 2: 1 + 3 = 4' }, { args: [[2, 7, 9, 3, 1]] }],
    edgeCases: [[[0]], [[5]], [[2, 1, 1, 2]], [[4, 1]]],
    randomCase: (rand) => [ints(rand, randInt(rand, 1, 12), 0, 20)],
    performanceCase: (rand) => [ints(rand, 100_000, 0, 400)],
    solve(nums: number[]) {
      let take = 0;
      let skip = 0;
      for (const x of nums) [take, skip] = [skip + x, Math.max(take, skip)];
      return Math.max(take, skip);
    },
    approach: 'At each house keep two values, best total if you take it and if you skip it; each depends only on the previous house.',
    complexity: { time: 'O(n)', space: 'O(1)' },
  },
  {
    id: 'kth-largest-element',
    title: 'K-th Largest Element',
    difficulty: 'medium',
    patternIds: ['heap'],
    algorithmId: 'kth-largest',
    statement: ['Return the k-th largest value in nums (counting duplicates). Try doing it without sorting the whole array.'],
    constraints: ['1 ≤ k ≤ nums.length ≤ 10^5', '-10^4 ≤ nums[i] ≤ 10^4'],
    entry: 'findKthLargest',
    params: [
      { name: 'nums', type: 'int[]' },
      { name: 'k', type: 'int' },
    ],
    returns: 'int',
    compare: 'exact',
    examples: [
      { args: [[3, 2, 1, 5, 6, 4], 2], explanation: 'Sorted descending: 6, 5, … so the 2nd largest is 5' },
      { args: [[3, 2, 3, 1, 2, 4, 5, 5, 6], 4] },
    ],
    edgeCases: [
      [[1], 1],
      [[2, 2, 2], 2],
      [[-1, -5, -3], 3],
    ],
    randomCase: (rand) => {
      const nums = ints(rand, randInt(rand, 1, 12), -20, 20);
      return [nums, randInt(rand, 1, nums.length)];
    },
    performanceCase: (rand) => [ints(rand, 100_000, -10_000, 10_000), 500],
    solve(nums: number[], k: number) {
      return [...nums].sort((a, b) => b - a)[k - 1];
    },
    approach: 'Keep a min-heap of the k largest values seen; its root is the answer (O(n log k)). Quickselect averages O(n).',
    complexity: { time: 'O(n log k)', space: 'O(k)' },
  },
  {
    id: 'longest-common-subsequence',
    title: 'Longest Common Subsequence',
    difficulty: 'medium',
    patternIds: ['dp-2d'],
    algorithmId: 'lcs',
    statement: [
      'Return the length of the longest sequence of characters that appears, in order but not necessarily contiguously, in both text1 and text2.',
    ],
    constraints: ['1 ≤ text1.length, text2.length ≤ 1500', 'lowercase letters'],
    entry: 'longestCommonSubsequence',
    params: [
      { name: 'text1', type: 'string' },
      { name: 'text2', type: 'string' },
    ],
    returns: 'int',
    compare: 'exact',
    examples: [
      { args: ['abcde', 'ace'], explanation: '"ace" appears in order in both' },
      { args: ['abc', 'abc'] },
      { args: ['abc', 'def'] },
    ],
    edgeCases: [
      ['a', 'a'],
      ['a', 'b'],
      ['aaaa', 'aa'],
    ],
    randomCase: (rand) => {
      const word = () => Array.from({ length: randInt(rand, 1, 9) }, () => 'abcd'[randInt(rand, 0, 3)]).join('');
      return [word(), word()];
    },
    performanceCase: (rand) => {
      const word = () => Array.from({ length: 1_500 }, () => 'abcdefghij'[randInt(rand, 0, 9)]).join('');
      return [word(), word()];
    },
    solve(a: string, b: string) {
      let prev = Array<number>(b.length + 1).fill(0);
      for (let i = 1; i <= a.length; i++) {
        const row = Array<number>(b.length + 1).fill(0);
        for (let j = 1; j <= b.length; j++) row[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], row[j - 1]);
        prev = row;
      }
      return prev[b.length];
    },
    approach:
      'dp[i][j] is the answer for the prefixes a[:i] and b[:j]: diagonal + 1 on a match, otherwise the better of dropping one letter.',
    complexity: { time: 'O(m·n)', space: 'O(n) with one rolling row' },
  },
  {
    id: 'count-components',
    title: 'Number of Connected Components',
    difficulty: 'medium',
    patternIds: ['union-find', 'dfs-backtracking'],
    algorithmId: 'union-find',
    statement: [
      'There are n nodes labelled 0 to n - 1 and a list of undirected edges. Return how many connected components the graph has.',
    ],
    constraints: ['1 ≤ n ≤ 10^5', '0 ≤ edges.length ≤ 10^5', 'no self-loops or repeated edges'],
    entry: 'countComponents',
    params: [
      { name: 'n', type: 'int' },
      { name: 'edges', type: 'int[][]' },
    ],
    returns: 'int',
    compare: 'exact',
    examples: [
      {
        args: [
          5,
          [
            [0, 1],
            [1, 2],
            [3, 4],
          ],
        ],
      },
      {
        args: [
          5,
          [
            [0, 1],
            [1, 2],
            [2, 3],
            [3, 4],
          ],
        ],
      },
    ],
    edgeCases: [
      [1, []],
      [4, []],
      [
        3,
        [
          [0, 1],
          [1, 2],
          [0, 2],
        ],
      ],
    ],
    randomCase: (rand) => {
      const n = randInt(rand, 1, 10);
      return [n, randomEdges(rand, n, randInt(rand, 0, n), false)];
    },
    performanceCase: (rand) => [100_000, randomEdges(rand, 100_000, 90_000, false)],
    solve(n: number, edges: number[][]) {
      const parent = Array.from({ length: n }, (_, i) => i);
      const find = (x: number): number => {
        while (parent[x] !== x) x = parent[x] = parent[parent[x]];
        return x;
      };
      let components = n;
      for (const [a, b] of edges) {
        const ra = find(a);
        const rb = find(b);
        if (ra !== rb) {
          parent[ra] = rb;
          components--;
        }
      }
      return components;
    },
    approach: 'Union-find: start with n components and subtract one each time an edge joins two different roots (or count DFS starts).',
    complexity: { time: 'O(n + E·α(n))', space: 'O(n)' },
  },
  {
    id: 'course-schedule',
    title: 'Course Schedule',
    difficulty: 'medium',
    patternIds: ['topo-sort'],
    algorithmId: 'topo-sort',
    statement: [
      'You must take numCourses courses labelled 0 to numCourses - 1. Each pair [a, b] in prerequisites means you must take b before a.',
      'Return true if you can finish every course, or false if the prerequisites are circular.',
    ],
    constraints: ['1 ≤ numCourses ≤ 10^5', '0 ≤ prerequisites.length ≤ 2·10^5', 'pairs are distinct'],
    entry: 'canFinish',
    params: [
      { name: 'numCourses', type: 'int' },
      { name: 'prerequisites', type: 'int[][]' },
    ],
    returns: 'bool',
    compare: 'exact',
    examples: [
      { args: [2, [[1, 0]]], explanation: 'Take 0, then 1' },
      {
        args: [
          2,
          [
            [1, 0],
            [0, 1],
          ],
        ],
        explanation: 'Each course waits for the other',
      },
    ],
    edgeCases: [
      [1, []],
      [
        3,
        [
          [1, 0],
          [2, 1],
          [0, 2],
        ],
      ],
      [
        4,
        [
          [1, 0],
          [2, 0],
          [3, 1],
          [3, 2],
        ],
      ],
    ],
    randomCase: (rand) => {
      const n = randInt(rand, 1, 8);
      return [n, randomDag(rand, n, randInt(rand, 0, 2 * n), rand() < 0.4)];
    },
    performanceCase: (rand) => [100_000, randomDag(rand, 100_000, 200_000, false)],
    solve(n: number, prerequisites: number[][]) {
      const indeg = Array<number>(n).fill(0);
      const adj: number[][] = Array.from({ length: n }, () => []);
      for (const [a, b] of prerequisites) {
        adj[b].push(a);
        indeg[a]++;
      }
      const queue = indeg.flatMap((d, v) => (d === 0 ? [v] : []));
      let taken = 0;
      for (let head = 0; head < queue.length; head++) {
        taken++;
        for (const v of adj[queue[head]]) if (--indeg[v] === 0) queue.push(v);
      }
      return taken === n;
    },
    approach: "Kahn's algorithm: repeatedly take a course with no remaining prerequisites; if some never free up, there is a cycle.",
    complexity: { time: 'O(V + E)', space: 'O(V + E)' },
  },
  {
    id: 'network-delay',
    title: 'Network Delay Time',
    difficulty: 'medium',
    patternIds: ['dijkstra'],
    algorithmId: 'dijkstra',
    statement: [
      'times[i] = [u, v, w] is a directed link from node u to node v that takes w milliseconds. Nodes are labelled 1 to n.',
      'A signal is sent from node k. Return how long it takes for every node to receive it, or -1 if some node never does.',
    ],
    constraints: ['1 ≤ n ≤ 10^4', '1 ≤ times.length ≤ 5·10^4', '0 ≤ w ≤ 100'],
    entry: 'networkDelayTime',
    params: [
      { name: 'times', type: 'int[][]' },
      { name: 'n', type: 'int' },
      { name: 'k', type: 'int' },
    ],
    returns: 'int',
    compare: 'exact',
    examples: [
      {
        args: [
          [
            [2, 1, 1],
            [2, 3, 1],
            [3, 4, 1],
          ],
          4,
          2,
        ],
      },
      { args: [[[1, 2, 1]], 2, 1] },
      { args: [[[1, 2, 1]], 2, 2] },
    ],
    edgeCases: [
      [[], 1, 1],
      [
        [
          [1, 2, 5],
          [1, 3, 1],
          [3, 2, 1],
        ],
        3,
        1,
      ],
    ],
    randomCase: (rand) => {
      const n = randInt(rand, 1, 7);
      return [randomWeighted(rand, n, randInt(rand, 0, 3 * n)), n, randInt(rand, 1, n)];
    },
    performanceCase: (rand) => [randomWeighted(rand, 10_000, 50_000), 10_000, 1],
    solve(times: number[][], n: number, k: number) {
      const adj: [number, number][][] = Array.from({ length: n + 1 }, () => []);
      for (const [u, v, w] of times) adj[u].push([v, w]);
      const dist = Array<number>(n + 1).fill(Infinity);
      dist[k] = 0;
      const heap: [number, number][] = [[0, k]];
      const push = (item: [number, number]) => {
        heap.push(item);
        for (let i = heap.length - 1; i > 0;) {
          const p = (i - 1) >> 1;
          if (heap[p][0] <= heap[i][0]) break;
          [heap[p], heap[i]] = [heap[i], heap[p]];
          i = p;
        }
      };
      const pop = () => {
        const top = heap[0];
        const last = heap.pop()!;
        if (heap.length) {
          heap[0] = last;
          for (let i = 0; ;) {
            const l = 2 * i + 1;
            const r = l + 1;
            let m = i;
            if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
            if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
            if (m === i) break;
            [heap[m], heap[i]] = [heap[i], heap[m]];
            i = m;
          }
        }
        return top;
      };
      while (heap.length) {
        const [d, u] = pop();
        if (d > dist[u]) continue;
        for (const [v, w] of adj[u]) {
          if (d + w < dist[v]) {
            dist[v] = d + w;
            push([dist[v], v]);
          }
        }
      }
      const worst = Math.max(...dist.slice(1));
      return worst === Infinity ? -1 : worst;
    },
    approach: 'Dijkstra from k with a min-heap; the answer is the largest shortest distance, or -1 if any node stays unreachable.',
    complexity: { time: 'O(E log V)', space: 'O(V + E)' },
  },
  {
    id: 'count-prefixes',
    title: 'Count Words by Prefix',
    difficulty: 'medium',
    patternIds: ['trie'],
    algorithmId: 'trie',
    statement: ['Given a dictionary of words and a list of prefixes, return for each prefix how many words start with it.'],
    constraints: ['1 ≤ words.length, prefixes.length ≤ 3·10^4', '1 ≤ word length ≤ 10', 'lowercase letters'],
    entry: 'countPrefixes',
    params: [
      { name: 'words', type: 'string[]' },
      { name: 'prefixes', type: 'string[]' },
    ],
    returns: 'int[]',
    compare: 'exact',
    examples: [
      {
        args: [
          ['apple', 'app', 'apt', 'bat'],
          ['ap', 'app', 'b', 'c'],
        ],
        explanation: '"ap" starts apple, app and apt',
      },
      {
        args: [
          ['a', 'a', 'ab'],
          ['a', 'ab', 'abc'],
        ],
      },
    ],
    edgeCases: [
      [['x'], ['x', 'xy']],
      [
        ['same', 'same'],
        ['same', 's'],
      ],
    ],
    randomCase: (rand) => {
      const word = () => Array.from({ length: randInt(rand, 1, 4) }, () => 'abc'[randInt(rand, 0, 2)]).join('');
      return [Array.from({ length: randInt(rand, 1, 8) }, word), Array.from({ length: randInt(rand, 1, 6) }, word)];
    },
    performanceCase: (rand) => {
      const word = (max: number) => Array.from({ length: randInt(rand, 1, max) }, () => 'abcdefgh'[randInt(rand, 0, 7)]).join('');
      return [Array.from({ length: 30_000 }, () => word(10)), Array.from({ length: 30_000 }, () => word(4))];
    },
    solve(words: string[], prefixes: string[]) {
      const counts = new Map<string, number>();
      for (const w of words) for (let i = 1; i <= w.length; i++) counts.set(w.slice(0, i), (counts.get(w.slice(0, i)) ?? 0) + 1);
      return prefixes.map((p) => counts.get(p) ?? 0);
    },
    approach:
      'Insert every word into a trie, counting at each node how many words pass through it; each query is then a walk of its own length.',
    complexity: { time: 'O(total letters)', space: 'O(total letters)' },
  },
];

export function getCodingProblem(id: string): CodingProblem | undefined {
  return CODING_PROBLEMS.find((p) => p.id === id);
}

export function problemsForPattern(patternId: string): CodingProblem[] {
  return CODING_PROBLEMS.filter((p) => p.patternIds.includes(patternId));
}
