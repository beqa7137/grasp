import { randInt } from '../../algorithms/random.js';
import type { CodingProblemDefinition } from '../types.js';
import { ints, nearMiddle } from './inputs.js';

const MOD = 1_000_000_007;

export const contiguousArray: CodingProblemDefinition = {
  statement: [
    '`nums` contains only 0s and 1s. Return the length of the longest contiguous subarray that holds as many 0s as 1s, or 0 if no such subarray exists.',
  ],
  constraints: ['1 ≤ nums.length ≤ 10^5', 'nums[i] is 0 or 1'],
  entry: 'findMaxLength',
  params: [{ name: 'nums', type: 'int[]' }],
  returns: 'int',
  compare: 'exact',
  examples: [
    { args: [[0, 1, 1, 1, 1, 1, 0, 0, 0]], explanation: 'The last six values, [1,1,1,0,0,0], hold three of each' },
    { args: [[0, 1, 0]], explanation: 'Both [0,1] and [1,0] have length 2; all three values together hold two 0s' },
    { args: [[1, 1, 1]] },
  ],
  edgeCases: [[[0]], [[1]], [[0, 0, 0, 0]], [[0, 0, 1, 1, 1]], [[0, 1, 0, 1]], [[1, 1, 0, 1, 0, 0]], [[0, 0, 1, 0, 0, 0, 1]]],
  randomCase: (rand) => [ints(rand, randInt(rand, 1, 14), 0, 1)],
  performanceCase: (rand) => {
    const nums = Array.from({ length: 100_000 }, () => (rand() < 0.02 ? 0 : 1));
    const start = nearMiddle(rand, 98_000);
    for (let i = start; i < start + 2_000; i++) nums[i] = rand() < 0.5 ? 0 : 1;
    return [nums];
  },
  solve(nums: number[]) {
    const first = new Map<number, number>([[0, -1]]);
    let balance = 0;
    let best = 0;
    nums.forEach((x, i) => {
      balance += x === 1 ? 1 : -1;
      const seen = first.get(balance);
      if (seen === undefined) first.set(balance, i);
      else best = Math.max(best, i - seen);
    });
    return best;
  },
  approach:
    'Count each 1 as +1 and each 0 as -1: a subarray is balanced exactly when the running sums just before it and at its end match. Store the first index where each running sum appears, with 0 at index -1, and measure back to it.',
  complexity: { time: 'O(n)', space: 'O(n)' },
};

export const sumSubarrayMins: CodingProblemDefinition = {
  statement: [
    'Return the sum of the minimum of every contiguous, non-empty subarray of `arr`. Subarrays at different positions count separately, even when they hold the same values.',
    'The sum can be large, so return it modulo 10^9 + 7.',
  ],
  constraints: ['1 ≤ arr.length ≤ 10^5', '1 ≤ arr[i] ≤ 10^5'],
  entry: 'sumSubarrayMins',
  params: [{ name: 'arr', type: 'int[]' }],
  returns: 'int',
  compare: 'exact',
  examples: [
    {
      args: [[3, 1, 2, 4]],
      explanation:
        'The ten subarrays have minimums 3, 1, 2, 4 (length 1), 1, 1, 2 (length 2), 1, 1 (length 3) and 1 (length 4), which sum to 17',
    },
    { args: [[11, 81, 94, 43, 3]] },
  ],
  edgeCases: [
    [[1]],
    [[100_000]],
    [[2, 2]],
    [[5, 5, 5, 5]],
    [[1, 2, 3, 4]],
    [[4, 3, 2, 1]],
    [[3, 1, 3, 1, 3]],
    [Array.from({ length: 1_000 }, () => 100_000)],
  ],
  randomCase: (rand) => [ints(rand, randInt(rand, 1, 10), 1, 6)],
  performanceCase: () => [Array.from({ length: 100_000 }, (_, i) => i + 1)],
  solve(arr: number[]) {
    const stack: number[] = [];
    let total = 0;
    for (let i = 0; i <= arr.length; i++) {
      const current = i === arr.length ? 0 : arr[i];
      while (stack.length && arr[stack[stack.length - 1]] >= current) {
        const j = stack.pop()!;
        const left = stack.length ? stack[stack.length - 1] : -1;
        total = (total + ((arr[j] * (j - left) * (i - j)) % MOD)) % MOD;
      }
      stack.push(i);
    }
    return total;
  },
  approach:
    'Count the subarrays where each value is the minimum: they start after the previous strictly smaller value and end before the next smaller or equal one, so a tie goes to its rightmost copy and no subarray counts twice. A stack of indices with increasing values finds both boundaries in one pass; add value × choices of start × choices of end.',
  complexity: { time: 'O(n)', space: 'O(n)' },
};

const squareDigitSum = (n: number) => {
  let sum = 0;
  for (; n > 0; n = Math.floor(n / 10)) sum += (n % 10) ** 2;
  return sum;
};

export const happyNumber: CodingProblemDefinition = {
  statement: [
    'Given a list of positive integers `nums`, return the ones that are happy, in their original order and keeping repeats, or an empty array if none is.',
    'A number is happy if repeatedly replacing it with the sum of the squares of its digits reaches 1; otherwise the values loop forever without reaching 1. Try to use O(1) extra space for each number.',
  ],
  constraints: ['1 ≤ nums.length ≤ 5·10^4', '1 ≤ nums[i] ≤ 2^31 - 1'],
  entry: 'happyNumbers',
  params: [{ name: 'nums', type: 'int[]' }],
  returns: 'int[]',
  compare: 'exact',
  examples: [
    {
      args: [[19, 2]],
      explanation: '19 → 82 → 68 → 100 → 1, so 19 is happy; 2 → 4 → 16 → 37 → 58 → 89 → 145 → 42 → 20 → 4 loops without reaching 1',
    },
    { args: [[1, 7, 10, 4]] },
  ],
  edgeCases: [
    [[1]],
    [[4]],
    [[7, 70]],
    [[10, 10, 3, 10]],
    [[2_147_483_647]],
    [[89, 145, 42, 20, 4, 16, 37, 58]],
    [[100, 1_000_000_000, 1_111_111]],
  ],
  randomCase: (rand) => [
    Array.from({ length: randInt(rand, 1, 12) }, () => (rand() < 0.7 ? randInt(rand, 1, 1_000) : randInt(rand, 1, 2 ** 31 - 1))),
  ],
  performanceCase: (rand) => [ints(rand, 50_000, 1, 2 ** 31 - 1)],
  solve(nums: number[]) {
    return nums.filter((n) => {
      let slow = n;
      let fast = squareDigitSum(n);
      while (fast !== 1 && slow !== fast) {
        slow = squareDigitSum(slow);
        fast = squareDigitSum(squareDigitSum(fast));
      }
      return fast === 1;
    });
  },
  approach:
    "The digit-square sums form a chain that either reaches 1 or enters a cycle. Walk it with Floyd's slow pointer, one step at a time, and fast pointer, two steps: the fast one reaches 1 when the number is happy, and otherwise the two meet inside the cycle.",
  complexity: { time: 'O(n log m) for n numbers up to m', space: 'O(1) beyond the answer' },
};

export const insertInterval: CodingProblemDefinition = {
  statement: [
    '`intervals` holds `[start, end]` pairs sorted by `start`, and no two of them overlap or touch. Insert `newInterval`, merging it with every interval it overlaps, and return the result, still sorted and with no two intervals overlapping or touching.',
    'Intervals that share only an endpoint, such as `[1,4]` and `[4,5]`, touch and must merge; `[1,4]` and `[5,6]` share no point and stay apart. `intervals` may be empty.',
  ],
  constraints: [
    '0 ≤ intervals.length ≤ 10^5',
    '0 ≤ start ≤ end ≤ 10^6 for every interval, including newInterval',
    'intervals is sorted by start, and each interval starts after the previous one ends',
  ],
  entry: 'insert',
  params: [
    { name: 'intervals', type: 'int[][]' },
    { name: 'newInterval', type: 'int[]' },
  ],
  returns: 'int[][]',
  compare: 'exact',
  examples: [
    {
      args: [
        [
          [1, 2],
          [3, 5],
          [6, 7],
          [8, 10],
          [12, 16],
        ],
        [4, 8],
      ],
      explanation: '[4,8] overlaps [3,5], [6,7] and [8,10], so the four merge into [3,10]',
    },
    {
      args: [
        [
          [1, 3],
          [6, 9],
        ],
        [2, 5],
      ],
    },
  ],
  edgeCases: [
    [[], [5, 7]],
    [[[1, 5]], [2, 3]],
    [[[1, 5]], [6, 8]],
    [[[1, 5]], [5, 7]],
    [[[3, 5]], [0, 1]],
    [[[3, 5]], [0, 3]],
    [
      [
        [1, 2],
        [4, 5],
      ],
      [3, 3],
    ],
    [
      [
        [1, 2],
        [4, 5],
      ],
      [2, 4],
    ],
    [
      [
        [1, 2],
        [4, 5],
        [7, 9],
      ],
      [0, 10],
    ],
    [[[1, 2]], [3, 4]],
    [
      [
        [1, 2],
        [5, 6],
      ],
      [8, 8],
    ],
  ],
  randomCase: (rand) => {
    const intervals: number[][] = [];
    let at = randInt(rand, 0, 3);
    for (let n = randInt(rand, 0, 7); n > 0; n--) {
      const end = at + randInt(rand, 0, 3);
      intervals.push([at, end]);
      at = end + randInt(rand, 1, 4);
    }
    const start = randInt(rand, 0, at + 1);
    return [intervals, [start, start + randInt(rand, 0, 8)]];
  },
  performanceCase: (rand) => {
    const intervals: number[][] = [];
    let at = randInt(rand, 0, 4);
    for (let n = 0; n < 100_000; n++) {
      const end = at + randInt(rand, 0, 4);
      intervals.push([at, end]);
      at = end + randInt(rand, 1, 4);
    }
    const first = intervals[randInt(rand, 8_000, 12_000)];
    const last = intervals[randInt(rand, 88_000, 92_000)];
    return [intervals, [first[0] + randInt(rand, 0, first[1] - first[0]), last[1] + 1]];
  },
  solve(intervals: number[][], newInterval: number[]) {
    const out: number[][] = [];
    let [start, end] = newInterval;
    let i = 0;
    for (; i < intervals.length && intervals[i][1] < start; i++) out.push(intervals[i]);
    for (; i < intervals.length && intervals[i][0] <= end; i++) {
      start = Math.min(start, intervals[i][0]);
      end = Math.max(end, intervals[i][1]);
    }
    out.push([start, end]);
    for (; i < intervals.length; i++) out.push(intervals[i]);
    return out;
  },
  approach:
    'One pass: copy the intervals that end before the new one starts, fold every interval that starts at or before its end into it, add the merged interval, then copy the rest.',
  complexity: { time: 'O(n)', space: 'O(n) for the answer' },
};
