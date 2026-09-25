import { randInt, rangeOf, shuffle } from '../../algorithms/input.js';
import type { CodingProblemDefinition } from '../types.js';
import { distinctSorted, ints, nearMiddle } from './inputs.js';

export const dailyTemperatures: CodingProblemDefinition = {
  statement: [
    'Given daily temperatures, return an array where `answer[i]` is the number of days after day `i` until a strictly warmer temperature. Use 0 if no warmer day comes.',
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
};

export const subarraySumK: CodingProblemDefinition = {
  statement: ['Return how many contiguous, non-empty subarrays of `nums` add up to exactly `k`. Values can be negative.'],
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
  approach: 'Running prefix sums in a hash map: every earlier prefix equal to `sum - k` closes a subarray summing to `k`.',
  complexity: { time: 'O(n)', space: 'O(n)' },
};

export const findDuplicate: CodingProblemDefinition = {
  statement: [
    '`nums` holds `n + 1` integers, each between 1 and `n`, so some value must repeat. Exactly one value does. Return it.',
    'It may appear more than twice. Solve it without modifying `nums`, using O(1) extra space.',
  ],
  constraints: ['1 ≤ n ≤ 3·10^5', 'nums.length = n + 1', '1 ≤ nums[i] ≤ n', 'Exactly one value appears more than once'],
  entry: 'findDuplicate',
  params: [{ name: 'nums', type: 'int[]' }],
  returns: 'int',
  compare: 'exact',
  examples: [
    { args: [[1, 3, 4, 2, 2]], explanation: '2 is at indices 3 and 4' },
    { args: [[3, 1, 3, 4, 2]] },
    { args: [[3, 3, 3, 3, 3]], explanation: 'The repeated value can fill the whole array' },
  ],
  edgeCases: [[[1, 1]], [[2, 2, 2]], [[2, 1, 2]], [[1, 4, 4, 2, 4]]],
  randomCase: (rand) => {
    const n = randInt(rand, 1, 10);
    const duplicate = randInt(rand, 1, n);
    const copies = randInt(rand, 2, n + 1);
    const others = shuffle(
      rand,
      rangeOf(1, n).filter((v) => v !== duplicate),
    ).slice(0, n + 1 - copies);
    return [shuffle(rand, [...Array<number>(copies).fill(duplicate), ...others])];
  },
  performanceCase: (rand) => {
    const n = 300_000;
    const duplicate = nearMiddle(rand, n);
    const nums = shuffle(
      rand,
      rangeOf(1, n).filter((v) => v !== duplicate),
    );
    nums.splice(nearMiddle(rand, nums.length), 0, duplicate);
    nums.splice(nearMiddle(rand, nums.length), 0, duplicate);
    return [nums];
  },
  solve(nums: number[]) {
    let slow = nums[0];
    let fast = nums[nums[0]];
    while (slow !== fast) {
      slow = nums[slow];
      fast = nums[nums[fast]];
    }
    slow = 0;
    while (slow !== fast) {
      slow = nums[slow];
      fast = nums[fast];
    }
    return slow;
  },
  approach:
    "Follow `i → nums[i]` from index 0 like a linked list: the duplicate is where it enters a cycle. Floyd's slow and fast pointers meet in the cycle; then a walk from index 0 and a walk from the meeting point, one step at a time, meet at the entrance.",
  complexity: { time: 'O(n)', space: 'O(1)' },
};

export const mergeIntervals: CodingProblemDefinition = {
  statement: [
    'Given intervals `[start, end]`, merge all overlapping ones and return the result sorted by `start`. Touching intervals like `[1,4]` and `[4,5]` overlap.',
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
  approach: 'Sort by `start`, then sweep: extend the current interval while the next one starts before it ends.',
  complexity: { time: 'O(n log n)', space: 'O(n)' },
};

export const topKFrequent: CodingProblemDefinition = {
  statement: ['Return the `k` most frequent values in `nums`, in any order. The answer is unique.'],
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
  approach: 'Count with a hash map, then keep the `k` largest counts with a min-heap of size `k` (or bucket by frequency for O(n)).',
  complexity: { time: 'O(n log k)', space: 'O(n)' },
};

export const kthLargestElement: CodingProblemDefinition = {
  statement: ['Return the `k`-th largest value in `nums` (counting duplicates). Try doing it without sorting the whole array.'],
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
  approach: 'Keep a min-heap of the `k` largest values seen; its root is the answer (O(n log k)). Quickselect averages O(n).',
  complexity: { time: 'O(n log k)', space: 'O(k)' },
};
