import { distinctInts, randInt, shuffle } from '../../algorithms/input.js';
import type { Args, CodingProblemDefinition } from '../types.js';
import { distinctSorted, ints } from './inputs.js';

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
  const values = distinctInts(rand, n - 2, -quarter, quarter - 1).map((v) => 4 * v);
  const a = 4 * randInt(rand, -quarter, quarter - 1) + 1;
  let b = a;
  while (b === a) b = 4 * randInt(rand, -quarter, quarter - 1) + 1;
  const nums = [...values, a, b];
  return [sorted ? nums.sort((x, y) => x - y) : shuffle(rand, nums), a + b];
}

export const twoSum: CodingProblemDefinition = {
  statement: [
    'Given an array of integers `nums` and an integer `target`, return the indices of the two numbers that add up to `target`.',
    'Exactly one pair adds up to `target`, and you may not use the same element twice. Return the two indices in any order.',
  ],
  constraints: ['2 ≤ nums.length ≤ 10^5', '-10^9 ≤ nums[i], target ≤ 10^9', 'Exactly one valid answer exists'],
  entry: 'twoSum',
  params: [
    { name: 'nums', type: 'int[]' },
    { name: 'target', type: 'int' },
  ],
  returns: 'int[]',
  compare: 'unordered',
  examples: [{ args: [[2, 7, 11, 15], 9], explanation: 'nums[0] + nums[1] = 2 + 7 = 9' }, { args: [[3, 2, 4], 6] }, { args: [[3, 3], 6] }],
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
};

export const pairSumSorted: CodingProblemDefinition = {
  statement: [
    '`nums` is sorted in non-decreasing order. Return the indices `[i, j]` with `i < j` of the only pair whose values add up to `target`.',
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
};

export const containerMostWater: CodingProblemDefinition = {
  statement: [
    '`height[i]` is the height of a vertical line at position `i`. Pick two lines that, together with the x-axis, hold the most water.',
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
};

export const longestUniqueSubstring: CodingProblemDefinition = {
  statement: ['Given a string `s`, return the length of the longest substring that contains no repeated characters.'],
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
};

export const binarySearch: CodingProblemDefinition = {
  statement: [
    '`nums` is sorted in ascending order with distinct values. Return the index of `target`, or -1 if it is not present.',
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
};

export const kokoBananas: CodingProblemDefinition = {
  statement: [
    'There are piles of bananas; `piles[i]` is the size of pile `i`. Each hour you pick one pile and eat up to `k` bananas from it. If the pile has fewer than `k`, you finish it and wait for the next hour.',
    'Return the smallest integer speed `k` that lets you finish every pile within `h` hours.',
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
  approach: 'Binary search on the answer: finishing in time is monotonic in `k`, so find the first speed that works.',
  complexity: { time: 'O(n log max(piles))', space: 'O(1)' },
};
