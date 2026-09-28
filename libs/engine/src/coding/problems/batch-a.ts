import { distinctInts, randInt, shuffle } from '../../algorithms/random.js';
import type { CodingProblemDefinition } from '../types.js';
import { distinctSorted, ints } from './inputs.js';

const rotate = (nums: number[], pivot: number) => [...nums.slice(pivot), ...nums.slice(0, pivot)];

export const longestConsecutive: CodingProblemDefinition = {
  statement: [
    'Given an unsorted array of integers `nums`, return the length of the longest run of consecutive integers `x`, `x + 1`, `x + 2`, and so on, that all appear in `nums`. Their positions in `nums` do not matter.',
    'A repeated value counts once, and an empty array gives 0. Aim for O(n) time.',
  ],
  constraints: ['0 ≤ nums.length ≤ 10^5', '-10^9 ≤ nums[i] ≤ 10^9'],
  entry: 'longestConsecutive',
  params: [{ name: 'nums', type: 'int[]' }],
  returns: 'int',
  compare: 'exact',
  examples: [
    { args: [[100, 4, 200, 1, 3, 2]], explanation: '1, 2, 3 and 4 are all present, so the run has length 4' },
    { args: [[0, 3, 7, 2, 5, 8, 4, 6, 0, 1]] },
    { args: [[1, 0, 1, 2]], explanation: 'The run is 0, 1, 2; the second 1 does not lengthen it' },
  ],
  edgeCases: [
    [[]],
    [[5]],
    [[7, 7, 7]],
    [[1, 2, 2, 3]],
    [[10, 9, 11, 8, 100]],
    [[-1, 0, 1, -3]],
    [[1000000000, -1000000000, 999999999]],
    [[3, 1, 5, 7]],
  ],
  randomCase: (rand) => [ints(rand, randInt(rand, 0, 14), -8, 8)],
  // One long run, shuffled, so counting up from every value instead of only from each run's start is quadratic.
  performanceCase: (rand) => {
    const run = 99_000;
    const start = randInt(rand, -1_000_000_000, 1_000_000_000 - run);
    const values = Array.from({ length: run }, (_, i) => start + i);
    const noise = ints(rand, 500, -1_000_000_000, 1_000_000_000);
    const repeats = Array.from({ length: 500 }, () => values[randInt(rand, 0, run - 1)]);
    return [shuffle(rand, [...values, ...noise, ...repeats])];
  },
  solve(nums: number[]) {
    const values = new Set(nums);
    let best = 0;
    for (const x of values) {
      if (values.has(x - 1)) continue;
      let end = x;
      while (values.has(end + 1)) end++;
      best = Math.max(best, end - x + 1);
    }
    return best;
  },
  approach:
    'Put every value in a hash set, and count upward only from values whose predecessor is missing: each run is walked once, from its start, so the whole scan is O(n).',
  complexity: { time: 'O(n)', space: 'O(n)' },
};

export const threeSum: CodingProblemDefinition = {
  statement: [
    'Return every triplet of values `[a, b, c]` taken from three different indices of `nums` with `a + b + c == 0`.',
    'Two triplets are the same when they hold the same values, so list each one once. Return the triplets in any order, with the values inside each in any order, or an empty list if there are none.',
  ],
  constraints: ['3 ≤ nums.length ≤ 3000', '-10^5 ≤ nums[i] ≤ 10^5'],
  entry: 'threeSum',
  params: [{ name: 'nums', type: 'int[]' }],
  returns: 'int[][]',
  compare: 'unordered-nested',
  examples: [
    {
      args: [[-1, 0, 1, 2, -1, -4]],
      explanation: '-1 + 0 + 1 = 0 and -1 + (-1) + 2 = 0; either -1 gives [-1,0,1], but it is listed once',
    },
    { args: [[0, 1, 1]] },
    { args: [[0, 0, 0]] },
  ],
  edgeCases: [
    [[0, 0, 0, 0]],
    [[1, 2, 3]],
    [[-2, 1, 3]],
    [[-2, 0, 1, 1, 2]],
    [[2, -1, -1, -1, 2]],
    [[-100000, 50000, 50000]],
    [[3, -3, 0, 0, 0, -3, 3]],
  ],
  randomCase: (rand) => [ints(rand, randInt(rand, 3, 12), -6, 6)],
  // Almost every value is negative, so a triple loop that stops once the sum passes zero still scans nearly all triples.
  performanceCase: (rand) => {
    const negatives = distinctInts(rand, 2_917, -100_000, -1);
    const repeats = Array.from({ length: 30 }, () => negatives[randInt(rand, 0, negatives.length - 1)]);
    const positives = distinctInts(rand, 50, 1, 100_000);
    return [shuffle(rand, [...negatives, ...repeats, 0, 0, 0, ...positives])];
  },
  solve(nums: number[]) {
    const sorted = [...nums].sort((a, b) => a - b);
    const triplets: number[][] = [];
    for (let i = 0; i < sorted.length - 2 && sorted[i] <= 0; i++) {
      if (i > 0 && sorted[i] === sorted[i - 1]) continue;
      let lo = i + 1;
      let hi = sorted.length - 1;
      while (lo < hi) {
        const sum = sorted[i] + sorted[lo] + sorted[hi];
        if (sum < 0) lo++;
        else if (sum > 0) hi--;
        else {
          triplets.push([sorted[i], sorted[lo], sorted[hi]]);
          while (lo < hi && sorted[lo] === sorted[lo + 1]) lo++;
          lo++;
          hi--;
        }
      }
    }
    return triplets;
  },
  approach:
    'Sort, then fix each distinct first value and find the other two with pointers from both ends of the rest, raising the low one when the sum is too small and lowering the high one when it is too big. Skipping values equal to the previous one keeps each triplet unique.',
  complexity: { time: 'O(n^2)', space: 'O(n) for the sorted copy' },
};

export const characterReplacement: CodingProblemDefinition = {
  statement: [
    'Given a string `s` of uppercase English letters and an integer `k`, you may change any character of `s` to any other uppercase letter, at most `k` times in total.',
    'Return the length of the longest substring that can be made of one repeated letter this way.',
  ],
  constraints: ['1 ≤ s.length ≤ 10^5', 's consists of uppercase English letters', '0 ≤ k ≤ s.length'],
  entry: 'characterReplacement',
  params: [
    { name: 's', type: 'string' },
    { name: 'k', type: 'int' },
  ],
  returns: 'int',
  compare: 'exact',
  examples: [
    { args: ['ABAB', 2], explanation: 'Change both A to B, or both B to A, to get 4 equal letters' },
    { args: ['AABABBA', 1], explanation: 'Change the B at index 2 to turn AABA into AAAA' },
  ],
  edgeCases: [
    ['A', 0],
    ['ABCD', 0],
    ['AAAA', 2],
    ['ABCD', 4],
    ['BAAA', 1],
    ['AAB', 0],
    ['ABBCBBA', 1],
  ],
  randomCase: (rand) => {
    const s = Array.from({ length: randInt(rand, 1, 14) }, () => 'ABC'[randInt(rand, 0, 2)]).join('');
    return [s, randInt(rand, 0, Math.min(3, s.length))];
  },
  // Four in five letters are A, and k lets the best window cover most of the string, so extending a window from every
  // start until it needs more than k changes is quadratic.
  performanceCase: (rand) => {
    const s = Array.from({ length: 100_000 }, () => (rand() < 0.8 ? 'A' : String.fromCharCode(randInt(rand, 66, 90)))).join('');
    return [s, 17_600];
  },
  solve(s: string, k: number) {
    const counts = Array<number>(26).fill(0);
    let most = 0;
    let best = 0;
    for (let lo = 0, hi = 0; hi < s.length; hi++) {
      most = Math.max(most, ++counts[s.charCodeAt(hi) - 65]);
      while (hi - lo + 1 - most > k) counts[s.charCodeAt(lo++) - 65]--;
      best = Math.max(best, hi - lo + 1);
    }
    return best;
  },
  approach:
    'Slide a window and count its letters: it needs `len - most` changes, where `most` is its commonest letter. Shrink from the left while that exceeds `k`. `most` never has to drop, since only a window with a higher count can beat the best length so far.',
  complexity: { time: 'O(n)', space: 'O(1) for 26 counts' },
};

export const searchRotatedArray: CodingProblemDefinition = {
  statement: [
    '`nums` was sorted in ascending order with distinct values, then possibly rotated: some prefix was moved, in order, to the end. For example, `[0,1,2,4,5,6,7]` can become `[4,5,6,7,0,1,2]`.',
    'Return the index of `target` in `nums`, or -1 if it is not present. Aim for O(log n).',
  ],
  constraints: [
    '1 ≤ nums.length ≤ 10^5',
    '-10^9 ≤ nums[i], target ≤ 10^9',
    'values are distinct',
    'nums is a sorted array, possibly rotated',
  ],
  entry: 'search',
  params: [
    { name: 'nums', type: 'int[]' },
    { name: 'target', type: 'int' },
  ],
  returns: 'int',
  compare: 'exact',
  examples: [
    { args: [[4, 5, 6, 7, 0, 1, 2], 0], explanation: '0 is at index 4, just after the largest value' },
    { args: [[4, 5, 6, 7, 0, 1, 2], 3] },
    { args: [[1], 0] },
  ],
  edgeCases: [
    [[1], 1],
    [[3, 1], 1],
    [[3, 1], 3],
    [[1, 3], 3],
    [[5, 1, 3], 5],
    [[5, 1, 3], 4],
    [[6, 7, 1, 2, 3, 4, 5], 7],
    [[2, 3, 4, 5, 6, 7, 1], 1],
    [[1, 2, 3, 4, 5], 6],
  ],
  randomCase: (rand) => {
    const n = randInt(rand, 1, 14);
    const nums = rotate(distinctSorted(rand, n, -50, 50), randInt(rand, 0, n - 1));
    return [nums, rand() < 0.7 ? nums[randInt(rand, 0, n - 1)] : randInt(rand, -60, 60)];
  },
  performanceCase: (rand) => {
    const n = 100_000;
    const nums = rotate(distinctSorted(rand, n, -1_000_000_000, 1_000_000_000), randInt(rand, 1, n - 1));
    return [nums, nums[randInt(rand, 0, n - 1)]];
  },
  solve(nums: number[], target: number) {
    let lo = 0;
    let hi = nums.length - 1;
    while (lo <= hi) {
      const mid = lo + ((hi - lo) >> 1);
      if (nums[mid] === target) return mid;
      if (nums[lo] <= nums[mid]) {
        if (nums[lo] <= target && target < nums[mid]) hi = mid - 1;
        else lo = mid + 1;
      } else if (nums[mid] < target && target <= nums[hi]) lo = mid + 1;
      else hi = mid - 1;
    }
    return -1;
  },
  approach:
    'Binary search, noting that one half of any range is still sorted: compare with its ends to tell whether the target lies in that half, and discard the other.',
  complexity: { time: 'O(log n)', space: 'O(1)' },
};
