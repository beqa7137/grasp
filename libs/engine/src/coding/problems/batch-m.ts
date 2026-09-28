import { distinctInts, randInt } from '../../algorithms/random.js';
import type { CodingProblemDefinition } from '../types.js';
import { ints, nearMiddle } from './inputs.js';

export const numberOfNiceSubarrays: CodingProblemDefinition = {
  statement: [
    'A subarray is nice when it holds exactly `k` odd numbers. Return how many contiguous, non-empty subarrays of `nums` are nice, or 0 if none is.',
    'Subarrays at different positions count separately, even when they hold the same values.',
  ],
  constraints: ['1 ≤ nums.length ≤ 10^5', '1 ≤ nums[i] ≤ 10^5', '1 ≤ k ≤ nums.length'],
  entry: 'numberOfSubarrays',
  params: [
    { name: 'nums', type: 'int[]' },
    { name: 'k', type: 'int' },
  ],
  returns: 'int',
  compare: 'exact',
  examples: [
    { args: [[1, 1, 2, 1, 1], 3], explanation: 'Only [1,1,2,1] and [1,2,1,1] hold three odd numbers' },
    { args: [[2, 4, 6], 1], explanation: 'No value is odd, so no subarray holds one odd number' },
    { args: [[2, 2, 2, 1, 2, 2, 1, 2, 2, 2], 2] },
  ],
  edgeCases: [
    [[1], 1],
    [[2], 1],
    [[1, 1, 1, 1], 1],
    [[1, 1, 1, 1], 4],
    [[1, 3, 5, 2], 4],
    [[2, 2, 1, 2, 2], 1],
    [[1, 2], 1],
    [[2, 1], 1],
    [[100_000, 99_999, 100_000], 1],
    [[1, 2, 2, 1, 2, 1, 1, 2], 2],
  ],
  randomCase: (rand) => {
    const nums = ints(rand, randInt(rand, 1, 12), 1, 9);
    return [nums, randInt(rand, 1, Math.min(nums.length, 4))];
  },
  // About a thousand odd values and k within a few of that count: from almost every start, a scan that stops once it
  // passes k odd values runs to the end of the array.
  performanceCase: (rand) => {
    const nums = Array.from({ length: 100_000 }, () => 2 * randInt(rand, 1, 50_000) - (rand() < 0.01 ? 1 : 0));
    const odd = nums.filter((x) => x % 2).length;
    return [nums, Math.max(1, odd - randInt(rand, 0, 5))];
  },
  solve(nums: number[], k: number) {
    const seen = Array<number>(nums.length + 1).fill(0);
    seen[0] = 1;
    let odd = 0;
    let count = 0;
    for (const x of nums) {
      odd += x % 2;
      if (odd >= k) count += seen[odd - k];
      seen[odd]++;
    }
    return count;
  },
  approach:
    'Two running counts of odd numbers differ by `k` exactly when the subarray between them holds `k` odd numbers. Count how often each running count has appeared, starting with 0 once for the empty prefix, and at each index add the count stored for `odd - k`. The running count only grows, so an array indexed by it works as the map.',
  complexity: { time: 'O(n)', space: 'O(n)' },
};

export const longestWpi: CodingProblemDefinition = {
  statement: [
    '`hours[i]` is the number of hours an employee worked on day `i`. A day is tiring when that is more than 8, so `hours[i] > 8`; a day of exactly 8 hours is not tiring.',
    'An interval of consecutive days is well-performing when it has strictly more tiring days than non-tiring days. Return the length of the longest well-performing interval, or 0 if there is none.',
  ],
  constraints: ['1 ≤ hours.length ≤ 10^5', '0 ≤ hours[i] ≤ 16'],
  entry: 'longestWpi',
  params: [{ name: 'hours', type: 'int[]' }],
  returns: 'int',
  compare: 'exact',
  examples: [
    { args: [[9, 9, 6, 0, 6, 6, 9]], explanation: 'The first three days, [9,9,6], hold two tiring days and one that is not' },
    { args: [[6, 6, 6]] },
    { args: [[6, 9, 6, 9, 9]], explanation: 'The whole week works: three tiring days against two' },
  ],
  edgeCases: [
    [[9]],
    [[8]],
    [[0]],
    [[16, 16, 16]],
    [[8, 9]],
    [[9, 8]],
    [[8, 8, 9]],
    [[6, 6, 9]],
    [[6, 9, 6, 6, 9, 9, 9]],
    [[9, 6, 9, 6, 6, 6, 9, 9]],
    [[6, 6, 6, 9, 6, 6, 9, 9, 6]],
  ],
  randomCase: (rand) => {
    const values = [0, 6, 8, 8, 9, 12, 16];
    return [Array.from({ length: randInt(rand, 1, 12) }, () => values[randInt(rand, 0, values.length - 1)])];
  },
  // Tiring days are rarer than the others except in one balanced stretch of 2,000 days, so the answer is short and the
  // running score ends far below zero: trying the longest intervals first, or scanning back from the far end, is quadratic.
  performanceCase: (rand) => {
    const hours = Array.from({ length: 100_000 }, () => (rand() < 0.4 ? randInt(rand, 9, 16) : randInt(rand, 0, 8)));
    const start = nearMiddle(rand, 98_000);
    for (let i = start; i < start + 2_000; i++) hours[i] = rand() < 0.5 ? randInt(rand, 9, 16) : randInt(rand, 0, 8);
    return [hours];
  },
  solve(hours: number[]) {
    const first = new Map<number, number>();
    let score = 0;
    let best = 0;
    hours.forEach((h, i) => {
      score += h > 8 ? 1 : -1;
      if (score > 0) best = i + 1;
      else {
        const seen = first.get(score - 1);
        if (seen !== undefined) best = Math.max(best, i - seen);
      }
      if (!first.has(score)) first.set(score, i);
    });
    return best;
  },
  approach:
    'Score each tiring day +1 and every other day -1, and keep a running score `s`. When `s > 0`, every day so far forms the interval. Otherwise the longest interval ending here starts just after the first index where the score was `s - 1`: the score moves one step at a time from 0, so it reached `s - 1` before any lower value.',
  complexity: { time: 'O(n)', space: 'O(n)' },
};

export const removeKdigits: CodingProblemDefinition = {
  statement: [
    '`num` is a non-negative integer written as a string of digits. Remove exactly `k` of its digits, keeping the others in their order, so that the number left is as small as possible.',
    'Return that number as a string without leading zeros, or `"0"` when no digits remain or every digit left is 0.',
  ],
  constraints: ['1 ≤ k ≤ num.length ≤ 2·10^5', 'num holds only the digits 0 to 9', 'num has no leading zeros, unless it is "0"'],
  entry: 'removeKdigits',
  params: [
    { name: 'num', type: 'string' },
    { name: 'k', type: 'int' },
  ],
  returns: 'string',
  compare: 'exact',
  examples: [
    { args: ['1432219', 3], explanation: 'Remove the 4, the 3 and one 2 to leave 1219' },
    { args: ['10200', 1], explanation: 'Removing the 1 leaves 0200, which is 200 without the leading zero' },
    { args: ['10', 2] },
  ],
  edgeCases: [
    ['9', 1],
    ['0', 1],
    ['10', 1],
    ['112', 1],
    ['1111', 2],
    ['123456', 3],
    ['654321', 3],
    ['3129', 1],
    ['100200', 1],
    ['10001', 4],
    ['1234567890', 9],
    ['5337', 2],
    ['102030', 2],
  ],
  randomCase: (rand) => {
    const n = randInt(rand, 1, 10);
    const digits = Array.from({ length: n }, (_, i) => randInt(rand, i === 0 && n > 1 ? 1 : 0, 9));
    return [digits.join(''), randInt(rand, 1, n)];
  },
  // A rising run of 120,000 digits, then random ones: each 0 or small digit later removes a long stretch of the run from
  // its end, so rescanning from the front for the first digit bigger than the next one walks most of the run each time.
  performanceCase: (rand) => {
    const rising = ints(rand, 120_000, 1, 9).sort((a, b) => a - b);
    return [[...rising, ...ints(rand, 80_000, 0, 9)].join(''), randInt(rand, 100_000, 110_000)];
  },
  solve(num: string, k: number) {
    const kept: string[] = [];
    for (const digit of num) {
      while (k > 0 && kept.length && kept[kept.length - 1] > digit) {
        kept.pop();
        k--;
      }
      kept.push(digit);
    }
    kept.length -= k;
    let start = 0;
    while (start < kept.length && kept[start] === '0') start++;
    return start === kept.length ? '0' : kept.slice(start).join('');
  },
  approach:
    'The leftmost digits matter most, so a digit bigger than the one after it should go. Keep a stack of digits that never falls: before pushing a digit, pop every bigger digit on top while removals remain. If removals are left at the end, drop them from the top, where the largest digits sit. Strip leading zeros, and return `"0"` if nothing is left.',
  complexity: { time: 'O(n)', space: 'O(n)' },
};

export const nextGreaterElements: CodingProblemDefinition = {
  statement: [
    '`nums` is circular: after the last value comes `nums[0]` again. For each value, find the first value strictly greater than it, walking forward from it and wrapping past the end if needed.',
    'Return those values in order, with -1 for a value that has nothing greater anywhere in the array. Equal values are not greater.',
  ],
  constraints: ['1 ≤ nums.length ≤ 10^5', '-10^9 ≤ nums[i] ≤ 10^9'],
  entry: 'nextGreaterElements',
  params: [{ name: 'nums', type: 'int[]' }],
  returns: 'int[]',
  compare: 'exact',
  examples: [
    {
      args: [[1, 2, 1]],
      explanation: 'The first 1 sees 2 next. Nothing beats 2. The last 1 wraps around to the first 1, which is equal, then reaches 2',
    },
    { args: [[1, 2, 3, 4, 3]] },
  ],
  edgeCases: [
    [[5]],
    [[1, 1, 1]],
    [[1, 2]],
    [[2, 1]],
    [[3, 1, 2]],
    [[5, 4, 3, 2, 1]],
    [[2, 2, 3, 2]],
    [[-1, -2, -1]],
    [[3, 8, 4, 1, 2]],
    [[-1_000_000_000, 1_000_000_000]],
  ],
  randomCase: (rand) => [ints(rand, randInt(rand, 1, 10), -3, 5)],
  // Falling values, turned so the largest sits at a random place: almost every value has to wrap around the array to
  // reach anything greater, so scanning forward from each one reads about half the array or more.
  performanceCase: (rand) => {
    const falling = distinctInts(rand, 100_000, -1_000_000_000, 1_000_000_000).sort((a, b) => b - a);
    const turn = randInt(rand, 10_000, 90_000);
    return [[...falling.slice(turn), ...falling.slice(0, turn)]];
  },
  solve(nums: number[]) {
    const n = nums.length;
    const out = Array<number>(n).fill(-1);
    const stack: number[] = [];
    for (let i = 0; i < 2 * n; i++) {
      const x = nums[i % n];
      while (stack.length && nums[stack[stack.length - 1]] < x) out[stack.pop()!] = x;
      if (i < n) stack.push(i);
    }
    return out;
  },
  approach:
    'Walk the array twice, the second pass standing in for the wrap-around. Keep a stack of indices still waiting for a greater value; their values never rise from bottom to top. Each value pops and answers every waiting index with a smaller value. Push indices only in the first pass; whatever is still waiting at the end keeps -1.',
  complexity: { time: 'O(n)', space: 'O(n)' },
};

function sortedDisjoint(rand: () => number, n: number, maxLength: number, maxGap: number): number[][] {
  const intervals: number[][] = [];
  let at = randInt(rand, 0, maxGap);
  for (; n > 0; n--) {
    const end = at + randInt(rand, 0, maxLength);
    intervals.push([at, end]);
    at = end + randInt(rand, 1, maxGap);
  }
  return intervals;
}

export const intervalIntersection: CodingProblemDefinition = {
  statement: [
    '`firstList` and `secondList` each hold closed intervals `[start, end]`, sorted by `start`; within one list, each interval starts after the previous one ends. Return every nonempty intersection of an interval from `firstList` with one from `secondList`, sorted by start.',
    'Intervals include both ends, so `[1,3]` and `[3,5]` intersect in `[3,3]`. Either list may be empty, and then the answer is empty too.',
  ],
  constraints: [
    '0 ≤ firstList.length, secondList.length ≤ 10^5',
    '0 ≤ start ≤ end ≤ 10^9 for every interval',
    'In each list, every interval starts after the previous one ends',
  ],
  entry: 'intervalIntersection',
  params: [
    { name: 'firstList', type: 'int[][]' },
    { name: 'secondList', type: 'int[][]' },
  ],
  returns: 'int[][]',
  compare: 'exact',
  examples: [
    {
      args: [
        [
          [0, 2],
          [5, 10],
          [13, 23],
          [24, 25],
        ],
        [
          [1, 5],
          [8, 12],
          [15, 24],
          [25, 26],
        ],
      ],
      explanation: '[5,10] meets both [1,5], at the single point 5, and [8,12]; [15,24] meets both [13,23] and [24,25]',
    },
    {
      args: [
        [
          [1, 3],
          [5, 9],
        ],
        [],
      ],
    },
  ],
  edgeCases: [
    [[], [[1, 2]]],
    [[[1, 3]], [[3, 5]]],
    [[[1, 2]], [[3, 4]]],
    [[[5, 5]], [[5, 5]]],
    [
      [[0, 10]],
      [
        [1, 2],
        [4, 5],
        [7, 9],
      ],
    ],
    [
      [
        [1, 2],
        [4, 5],
        [7, 9],
      ],
      [[0, 10]],
    ],
    [
      [
        [1, 5],
        [8, 12],
      ],
      [[5, 8]],
    ],
    [
      [
        [0, 1],
        [3, 4],
      ],
      [
        [1, 3],
        [4, 6],
      ],
    ],
    [[[0, 1_000_000_000]], [[0, 1_000_000_000]]],
  ],
  randomCase: (rand) => [sortedDisjoint(rand, randInt(rand, 0, 6), 4, 4), sortedDisjoint(rand, randInt(rand, 0, 6), 4, 4)],
  performanceCase: (rand) => [sortedDisjoint(rand, 100_000, 6, 6), sortedDisjoint(rand, 100_000, 6, 6)],
  solve(firstList: number[][], secondList: number[][]) {
    const out: number[][] = [];
    let i = 0;
    let j = 0;
    while (i < firstList.length && j < secondList.length) {
      const start = Math.max(firstList[i][0], secondList[j][0]);
      const end = Math.min(firstList[i][1], secondList[j][1]);
      if (start <= end) out.push([start, end]);
      if (firstList[i][1] < secondList[j][1]) i++;
      else j++;
    }
    return out;
  },
  approach:
    'Walk both lists with one pointer each. The two current intervals overlap from the larger start to the smaller end, if that range is not empty. Then advance whichever interval ends first: it cannot meet anything later in the other list, while the one that ends later still might.',
  complexity: { time: 'O(n + m)', space: 'O(n + m) for the answer' },
};
