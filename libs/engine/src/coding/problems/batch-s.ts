import { distinctInts, randInt } from '../../algorithms/random.js';
import type { CodingProblemDefinition } from '../types.js';
import { ints } from './inputs.js';

export const removeCoveredIntervals: CodingProblemDefinition = {
  statement: [
    'Each `intervals[i]` is `[l, r]` with `l < r`. An interval `[a, b]` is covered by a different interval `[c, d]` when `c <= a` and `b <= d`, so sharing a start or an end still counts.',
    'Remove every covered interval and return how many remain. No two intervals are equal, so two intervals never cover each other. The input is in no particular order.',
  ],
  constraints: ['1 ≤ intervals.length ≤ 10^5', '0 ≤ l < r ≤ 10^9', 'All intervals are different'],
  entry: 'removeCoveredIntervals',
  params: [{ name: 'intervals', type: 'int[][]' }],
  returns: 'int',
  compare: 'exact',
  examples: [
    {
      args: [
        [
          [1, 4],
          [3, 6],
          [2, 8],
        ],
      ],
      explanation: '[3,6] lies inside [2,8], so it goes; [1,4] starts before [2,8] and stays',
    },
    {
      args: [
        [
          [1, 4],
          [2, 3],
        ],
      ],
    },
    {
      args: [
        [
          [1, 2],
          [1, 4],
          [3, 4],
        ],
      ],
      explanation: '[1,4] covers [1,2], which shares its start, and [3,4], which shares its end',
    },
  ],
  edgeCases: [
    [[[0, 1]]],
    [
      [
        [1, 2],
        [1, 3],
      ],
    ],
    [
      [
        [1, 3],
        [2, 3],
      ],
    ],
    [
      [
        [1, 2],
        [2, 3],
      ],
    ],
    [
      [
        [1, 10],
        [2, 5],
        [3, 6],
      ],
    ],
    [
      [
        [3, 6],
        [1, 10],
        [2, 5],
      ],
    ],
    [
      [
        [1, 2],
        [1, 3],
        [1, 4],
      ],
    ],
    [
      [
        [1, 4],
        [2, 5],
        [3, 6],
      ],
    ],
    [
      [
        [3, 10],
        [4, 10],
        [5, 11],
      ],
    ],
    [
      [
        [5, 6],
        [0, 1_000_000_000],
        [0, 1],
      ],
    ],
  ],
  randomCase: (rand) => {
    const seen = new Map<string, number[]>();
    for (let n = randInt(rand, 1, 8); seen.size < n;) {
      const l = randInt(rand, 0, 6);
      const r = randInt(rand, l + 1, 8);
      seen.set(`${l},${r}`, [l, r]);
    }
    return [[...seen.values()]];
  },
  // A chain of long intervals whose starts and ends both climb, with a fifth of the intervals short: most long ones
  // are covered by nothing, so checking every interval against every other one is quadratic.
  performanceCase: (rand) => [
    distinctInts(rand, 100_000, 0, 500_000_000).map((start) => [
      start,
      start + (rand() < 0.2 ? randInt(rand, 1, 1_000) : 1_000_000 + randInt(rand, -3_000, 3_000)),
    ]),
  ],
  solve(intervals: number[][]) {
    const sorted = [...intervals].sort((x, y) => x[0] - y[0] || y[1] - x[1]);
    let reach = -1;
    let kept = 0;
    for (const [, end] of sorted)
      if (end > reach) {
        kept++;
        reach = end;
      }
    return kept;
  },
  approach:
    'Sort by start, and by end from longest to shortest when starts tie, so any interval that could cover another comes before it. Then an interval is covered exactly when its end is at most the largest end seen so far; count the others.',
  complexity: { time: 'O(n log n)', space: 'O(n)' },
};

export const carPooling: CodingProblemDefinition = {
  statement: [
    'A car drives east along a road and never turns back. Each `trips[i]` is `[passengers, from, to]`: that many passengers get in at kilometer `from` and get out at kilometer `to`. The car starts empty and has `capacity` seats.',
    'Return true if it can carry every trip without ever holding more than `capacity` passengers, and false otherwise. At a kilometer where some passengers get out and others get in, those getting out leave first.',
  ],
  constraints: ['1 ≤ trips.length ≤ 10^5', '1 ≤ passengers ≤ 100', '0 ≤ from < to ≤ 10^9', '1 ≤ capacity ≤ 10^7'],
  entry: 'carPooling',
  params: [
    { name: 'trips', type: 'int[][]' },
    { name: 'capacity', type: 'int' },
  ],
  returns: 'bool',
  compare: 'exact',
  examples: [
    {
      args: [
        [
          [2, 1, 5],
          [3, 3, 7],
        ],
        4,
      ],
      explanation: 'From kilometer 3 to 5 both trips are in the car, 5 passengers in 4 seats',
    },
    {
      args: [
        [
          [2, 1, 5],
          [3, 3, 7],
        ],
        5,
      ],
    },
    {
      args: [
        [
          [2, 1, 5],
          [3, 5, 7],
        ],
        3,
      ],
      explanation: 'The first 2 passengers get out at kilometer 5 before the next 3 get in',
    },
  ],
  edgeCases: [
    [[[1, 0, 1]], 1],
    [
      [
        [3, 5, 7],
        [2, 1, 5],
      ],
      3,
    ],
    [[[2, 0, 1]], 1],
    [[[100, 0, 1_000_000_000]], 100],
    [
      [
        [5, 0, 10],
        [5, 0, 10],
      ],
      9,
    ],
    [
      [
        [5, 0, 10],
        [5, 0, 10],
      ],
      10,
    ],
    [
      [
        [3, 2, 7],
        [3, 7, 9],
        [8, 3, 9],
      ],
      11,
    ],
    [
      [
        [1, 0, 2],
        [1, 1, 3],
        [1, 2, 4],
      ],
      2,
    ],
    [
      [
        [4, 5, 9],
        [2, 0, 3],
        [3, 1, 6],
      ],
      6,
    ],
    [
      [
        [1, 0, 10],
        [2, 2, 3],
        [2, 4, 5],
        [2, 6, 7],
      ],
      3,
    ],
    [
      [
        [3, 1, 4],
        [2, 2, 4],
        [4, 4, 6],
      ],
      5,
    ],
  ],
  randomCase: (rand) => {
    const trips = Array.from({ length: randInt(rand, 1, 6) }, () => {
      const from = randInt(rand, 0, 8);
      return [randInt(rand, 1, 5), from, randInt(rand, from + 1, 10)];
    });
    return [trips, randInt(rand, 1, 12)];
  },
  // Stops spread over a billion kilometers rule out an array with a slot per kilometer, and the capacity is exactly the
  // busiest load, so the car always makes it and adding up the load at every pickup from scratch is quadratic.
  performanceCase: (rand) => {
    const trips = Array.from({ length: 100_000 }, () => {
      const from = randInt(rand, 0, 999_000_000);
      return [randInt(rand, 1, 100), from, from + randInt(rand, 1, 1_000_000)];
    });
    return [trips, busiestLoad(trips)];
  },
  solve(trips: number[][], capacity: number) {
    return busiestLoad(trips) <= capacity;
  },
  approach:
    'Turn each trip into two events: its passengers get in at `from` and get out at `to`. Sort the events by kilometer, with drop-offs before pickups at the same kilometer, and sweep them with a running load; the car fails exactly when the load passes `capacity`.',
  complexity: { time: 'O(n log n)', space: 'O(n)' },
};

function busiestLoad(trips: number[][]): number {
  const events = trips.flatMap(([passengers, from, to]) => [
    [from, passengers],
    [to, -passengers],
  ]);
  events.sort((x, y) => x[0] - y[0] || x[1] - y[1]);
  let load = 0;
  let busiest = 0;
  for (const [, change] of events) busiest = Math.max(busiest, (load += change));
  return busiest;
}

export const pivotIndex: CodingProblemDefinition = {
  statement: [
    'A pivot index of `nums` is an index where the values strictly to its left add up to the same total as the values strictly to its right. A side with no values adds up to 0, so index 0 is a pivot when everything after it adds up to 0.',
    'Return the leftmost pivot index, or -1 if there is none.',
  ],
  constraints: ['1 ≤ nums.length ≤ 10^5', '-1000 ≤ nums[i] ≤ 1000'],
  entry: 'pivotIndex',
  params: [{ name: 'nums', type: 'int[]' }],
  returns: 'int',
  compare: 'exact',
  examples: [
    { args: [[1, 7, 3, 6, 5, 6]], explanation: 'Left of index 3, 1 + 7 + 3 = 11; right of it, 5 + 6 = 11' },
    { args: [[1, 2, 3]] },
    { args: [[2, 1, -1]], explanation: 'Nothing is left of index 0, and 1 + -1 = 0 is right of it' },
  ],
  edgeCases: [
    [[1]],
    [[0]],
    [[0, 0, 0]],
    [[1, -1]],
    [[-1, 1]],
    [[1, 0]],
    [[1, 2, 1]],
    [[-1, -1, -1, -1, -1, 0]],
    [[1, 2, 3, -3, -2]],
    [[-1_000, 1_000, 0]],
    [[3, 1, 2, 5, 1]],
  ],
  randomCase: (rand) => [ints(rand, randInt(rand, 1, 10), -3, 3)],
  // Positive values, so the pivot is unique, placed far to the right: summing both sides again at every index reads the whole
  // array about 90,000 times before reaching it.
  performanceCase: (rand) => {
    const n = 100_000;
    const pivot = randInt(rand, 88_000, 92_000);
    const left = ints(rand, pivot, 1, 100);
    const target = left.reduce((sum, x) => sum + x, 0);
    const count = n - pivot - 1;
    const right = ints(rand, count, -30, 30).map((x) => x + Math.floor(target / count));
    let short = target - right.reduce((sum, x) => sum + x, 0);
    for (let i = 0; short !== 0; i = (i + 1) % count) {
      const step = Math.sign(short);
      right[i] += step;
      short -= step;
    }
    return [[...left, randInt(rand, 1, 1_000), ...right]];
  },
  solve(nums: number[]) {
    let right = nums.reduce((sum, x) => sum + x, 0);
    let left = 0;
    for (let i = 0; i < nums.length; i++) {
      right -= nums[i];
      if (left === right) return i;
      left += nums[i];
    }
    return -1;
  },
  approach:
    'Start with the total of every value as the right side and 0 as the left. At each index, take its value off the right side, compare the two sides, then add the value to the left side. The first index where they match is the answer.',
  complexity: { time: 'O(n)', space: 'O(1)' },
};

export const maxSubArrayLen: CodingProblemDefinition = {
  statement: [
    'Return the length of the longest contiguous, non-empty subarray of `nums` whose values add up to exactly `k`, or 0 if no subarray does. Values may be negative or 0.',
  ],
  constraints: ['1 ≤ nums.length ≤ 10^5', '-10^4 ≤ nums[i] ≤ 10^4', '-10^9 ≤ k ≤ 10^9'],
  entry: 'maxSubArrayLen',
  params: [
    { name: 'nums', type: 'int[]' },
    { name: 'k', type: 'int' },
  ],
  returns: 'int',
  compare: 'exact',
  examples: [
    { args: [[1, -1, 5, -2, 3], 3], explanation: 'The first four values, 1 - 1 + 5 - 2, add up to 3' },
    { args: [[-2, -1, 2, 1], 1] },
    { args: [[1, 2, 3], 7], explanation: 'Even all three values add up to only 6' },
  ],
  edgeCases: [
    [[5], 5],
    [[5], 3],
    [[-5], -5],
    [[0, 0, 0], 0],
    [[1, -1], 0],
    [[3, -3, 3, -3], 3],
    [[1, 1, 1, 1], 2],
    [[2, 0, 0, 3], 3],
    [[-1, 2, -1, 2, -1], 1],
    [[10_000, -10_000, 10_000], 10_000],
    [[1, 2, 3], -1],
  ],
  randomCase: (rand) => [ints(rand, randInt(rand, 1, 12), -3, 3), randInt(rand, -4, 4)],
  // Values that climb on average, so only short subarrays add up to a small `k`: summing from every start, or trying
  // every length from the longest down, is quadratic.
  performanceCase: (rand) => [ints(rand, 100_000, -3_000, 10_000), randInt(rand, 0, 30_000)],
  solve(nums: number[], k: number) {
    const first = new Map<number, number>([[0, -1]]);
    let sum = 0;
    let best = 0;
    nums.forEach((x, i) => {
      sum += x;
      const start = first.get(sum - k);
      if (start !== undefined) best = Math.max(best, i - start);
      if (!first.has(sum)) first.set(sum, i);
    });
    return best;
  },
  approach:
    'A subarray adds up to `k` when the running sum at its end minus the running sum before its start is `k`. Record the first index where each running sum appears, with 0 at index -1 for the empty prefix, and at each index look up `sum - k`: the earliest match gives the longest subarray ending there.',
  complexity: { time: 'O(n)', space: 'O(n)' },
};

export const totalFruit: CodingProblemDefinition = {
  statement: [
    'Trees stand in a row, and `fruits[i]` is the type of fruit on tree `i`. You have two baskets, and each holds any amount of fruit but only one type.',
    'Start at any tree and pick one fruit from it and from every tree to its right, in order, stopping just before the first tree whose type fits in neither basket or at the end of the row. Return the most fruit you can pick: the length of the longest run of neighboring trees with at most two types.',
  ],
  constraints: ['1 ≤ fruits.length ≤ 2·10^5', '0 ≤ fruits[i] < fruits.length'],
  entry: 'totalFruit',
  params: [{ name: 'fruits', type: 'int[]' }],
  returns: 'int',
  compare: 'exact',
  examples: [
    { args: [[1, 2, 3, 2, 2]], explanation: 'Starting at the second tree gives [2,3,2,2], two types in four trees' },
    { args: [[0, 1, 2, 2]] },
    { args: [[3, 3, 3, 1, 2, 1, 1, 2, 3, 3, 4]], explanation: 'The run [1,2,1,1,2] holds only types 1 and 2' },
  ],
  edgeCases: [
    [[0]],
    [[0, 0, 0]],
    [[0, 1]],
    [[0, 1, 2]],
    [[1, 2, 1]],
    [[1, 2, 2, 3, 2]],
    [[0, 1, 0, 2, 0, 2, 2, 1]],
    [[1, 0, 1, 4, 1, 4, 1, 2, 3]],
    [[0, 1, 2, 0, 1, 2, 0, 0]],
    [[4, 4, 1, 1, 4, 2, 2, 2]],
  ],
  randomCase: (rand) => {
    const n = randInt(rand, 1, 14);
    return [ints(rand, n, 0, Math.min(3, n - 1))];
  },
  // Three long stretches, each mixing two types and sharing one with the next: from every start the run goes on to the
  // end of its stretch, so growing a run from each tree reads a third of the row on average.
  performanceCase: (rand) => {
    const n = 200_000;
    const types = distinctInts(rand, 4, 0, n - 1);
    const first = randInt(rand, 60_000, 70_000);
    const second = randInt(rand, 130_000, 140_000);
    return [Array.from({ length: n }, (_, i) => types[(i < first ? 0 : i < second ? 1 : 2) + (rand() < 0.5 ? 1 : 0)])];
  },
  solve(fruits: number[]) {
    const count = new Map<number, number>();
    let best = 0;
    for (let lo = 0, hi = 0; hi < fruits.length; hi++) {
      count.set(fruits[hi], (count.get(fruits[hi]) ?? 0) + 1);
      while (count.size > 2) {
        const left = fruits[lo++];
        const rest = count.get(left)! - 1;
        if (rest) count.set(left, rest);
        else count.delete(left);
      }
      best = Math.max(best, hi - lo + 1);
    }
    return best;
  },
  approach:
    'Slide a window that holds at most two types, counting each type inside it: extend it on the right, and while it holds a third type, drop trees from the left until one type is gone. Each tree enters and leaves once, and the widest window is the answer.',
  complexity: { time: 'O(n)', space: 'O(1)' },
};

export const minOperations: CodingProblemDefinition = {
  statement: [
    'In one operation you remove either the first or the last value of `nums` and subtract it from `x`. Return the fewest operations that bring `x` to exactly 0, or -1 if no sequence of operations does.',
    'Every value is positive. You may remove every value if that is what it takes.',
  ],
  constraints: ['1 ≤ nums.length ≤ 2·10^5', '1 ≤ nums[i] ≤ 10^4', '1 ≤ x ≤ 10^9'],
  entry: 'minOperations',
  params: [
    { name: 'nums', type: 'int[]' },
    { name: 'x', type: 'int' },
  ],
  returns: 'int',
  compare: 'exact',
  examples: [
    { args: [[1, 1, 4, 2, 3], 5], explanation: 'Remove the last two values, 3 and 2' },
    { args: [[5, 6, 7, 8, 9], 4] },
    { args: [[3, 2, 20, 1, 1, 3], 10], explanation: 'Remove 3 and 2 from the front and 3, 1 and 1 from the back' },
  ],
  edgeCases: [
    [[1], 1],
    [[1], 2],
    [[1, 1], 3],
    [[2, 3, 1], 6],
    [[1, 2, 3, 4, 5], 15],
    [[10_000, 1, 10_000], 20_000],
    [[5, 1, 1, 1, 5], 6],
    [[1, 1, 1, 9], 3],
    [[9, 1, 1, 1], 3],
    [[4, 1, 1, 2, 3], 5],
    [[2, 1, 1, 1, 1, 2], 4],
  ],
  randomCase: (rand) => {
    const nums = ints(rand, randInt(rand, 1, 10), 1, 6);
    return [nums, randInt(rand, 1, nums.reduce((sum, x) => sum + x, 0) + 2)];
  },
  // About a third of the values come off each end, so both scans are quadratic: taking values from the back for every
  // count taken from the front, and growing the middle that stays from every start.
  performanceCase: (rand) => {
    const nums = ints(rand, 200_000, 1, 10_000);
    const front = randInt(rand, 60_000, 70_000);
    const back = randInt(rand, 60_000, 70_000);
    const removed = [...nums.slice(0, front), ...nums.slice(nums.length - back)];
    return [nums, removed.reduce((sum, v) => sum + v, 0)];
  },
  solve(nums: number[], x: number) {
    const keep = nums.reduce((sum, v) => sum + v, 0) - x;
    if (keep < 0) return -1;
    let longest = -1;
    let sum = 0;
    for (let lo = 0, hi = 0; hi <= nums.length; hi++) {
      while (sum > keep) sum -= nums[lo++];
      if (sum === keep) longest = Math.max(longest, hi - lo);
      if (hi < nums.length) sum += nums[hi];
    }
    return longest < 0 ? -1 : nums.length - longest;
  },
  approach:
    'What stays is a contiguous middle whose sum is the total minus `x`, so find the longest such middle. Every value is positive, so slide a window: extend it on the right and drop values from the left while its sum is too big. The empty middle counts, for when `x` is the whole total.',
  complexity: { time: 'O(n)', space: 'O(1)' },
};
