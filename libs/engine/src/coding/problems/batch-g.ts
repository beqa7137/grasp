import { rangeOf } from '../../algorithms/input.js';
import { distinctInts, randInt, shuffle } from '../../algorithms/random.js';
import type { CodingProblemDefinition } from '../types.js';
import { ints } from './inputs.js';

export const splitArrayLargestSum: CodingProblemDefinition = {
  statement: [
    'Split `nums` into exactly `k` non-empty parts, each a run of neighboring values, keeping every value in its place. The cost of a split is the largest sum among its parts.',
    'Return the smallest cost any split can have.',
  ],
  constraints: ['1 ≤ nums.length ≤ 10^5', '0 ≤ nums[i] ≤ 10^6', '1 ≤ k ≤ nums.length', 'The answer can exceed 2^31'],
  entry: 'splitArray',
  params: [
    { name: 'nums', type: 'int[]' },
    { name: 'k', type: 'int' },
  ],
  returns: 'int',
  compare: 'exact',
  examples: [
    {
      args: [[7, 2, 5, 10, 8], 2],
      explanation: '[7,2,5] and [10,8] sum to 14 and 18; every other cut leaves one part above 18',
    },
    { args: [[1, 2, 3, 4, 5], 2], explanation: '[1,2,3] and [4,5] sum to 6 and 9' },
    { args: [[1, 4, 4], 3] },
  ],
  edgeCases: [
    [[5], 1],
    [[0, 0, 0], 2],
    [[1, 2, 3, 4, 5], 1],
    [[1, 2, 3, 4, 5], 5],
    [[1, 10], 2],
    [[10, 1, 1, 1, 1], 2],
    [[1, 4, 3], 2],
    [[3, 3, 3, 3], 3],
    [Array<number>(12).fill(1_000_000), 5],
  ],
  randomCase: (rand) => {
    const nums = ints(rand, randInt(rand, 1, 8), 0, 10);
    return [nums, randInt(rand, 1, nums.length)];
  },
  // k·q + 1 values of nearly 10^6: some part holds q + 1 of them, so the answer sits hundreds of thousands above both
  // the largest value and the average part, and trying each limit upward from either one checks every limit between.
  performanceCase: (rand) => {
    const k = randInt(rand, 3, 6);
    return [ints(rand, k * Math.floor(99_999 / k) + 1, 999_990, 1_000_000), k];
  },
  solve(nums: number[], k: number) {
    const parts = (limit: number) => {
      let count = 1;
      let sum = 0;
      for (const x of nums)
        if (sum + x > limit) {
          count++;
          sum = x;
        } else sum += x;
      return count;
    };
    let lo = 0;
    let hi = 0;
    for (const x of nums) {
      lo = Math.max(lo, x);
      hi += x;
    }
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (parts(mid) <= k) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  },
  approach:
    'Binary search on the answer, from the largest value up to the total. For a limit, one greedy pass that starts a new part only when the next value would push the current part past the limit uses the fewest parts. The answer is the smallest limit that needs at most `k` parts: a split into fewer parts can always be cut further without raising its cost.',
  complexity: { time: 'O(n log S), S the sum of nums', space: 'O(1)' },
};

export const subarraysDivByK: CodingProblemDefinition = {
  statement: [
    'Return how many contiguous, non-empty subarrays of `nums` have a sum divisible by `k`, that is, a sum that is a multiple of `k`.',
    'Values can be negative, and so can a sum: 0 and -5 are both multiples of 5.',
  ],
  constraints: ['1 ≤ nums.length ≤ 10^5', '-10^4 ≤ nums[i] ≤ 10^4', '1 ≤ k ≤ 10^4', 'The answer can exceed 2^31'],
  entry: 'subarraysDivByK',
  params: [
    { name: 'nums', type: 'int[]' },
    { name: 'k', type: 'int' },
  ],
  returns: 'int',
  compare: 'exact',
  examples: [
    {
      args: [[4, 5, 0, -2, -3, 1], 5],
      explanation: 'The seven are [5], [5,0], [0], [5,0,-2,-3], [0,-2,-3], [-2,-3] and the whole array, which sums to 5',
    },
    { args: [[5], 9] },
    { args: [[-2, 2, -5], 3], explanation: '[-2,2] sums to 0 and [2,-5] to -3, both multiples of 3' },
  ],
  edgeCases: [
    [[5], 5],
    [[-5], 5],
    [[7], 1],
    [[0, 0, 0], 3],
    [[-1, 2, 9], 2],
    [[1, 2, 3], 1],
    [[-3, -6, 3], 3],
    [[3, 1, 2], 3],
    [[-1, -1, -1, 1, 1], 4],
  ],
  randomCase: (rand) => [ints(rand, randInt(rand, 1, 10), -6, 6), randInt(rand, 1, 6)],
  performanceCase: (rand) => [ints(rand, 100_000, -10_000, 10_000), randInt(rand, 2, 100)],
  solve(nums: number[], k: number) {
    const seen = Array<number>(k).fill(0);
    seen[0] = 1;
    let remainder = 0;
    let count = 0;
    for (const x of nums) {
      remainder = (((remainder + x) % k) + k) % k;
      count += seen[remainder]++;
    }
    return count;
  },
  approach:
    'Two prefix sums leave the same remainder mod `k` exactly when the subarray between them sums to a multiple of `k`. Count the remainders seen so far, starting with remainder 0 once for the empty prefix, and add the count of each new remainder before recording it. In JavaScript, `%` keeps the sign of a negative sum, so use `((sum % k) + k) % k`.',
  complexity: { time: 'O(n)', space: 'O(k)' },
};

export const maxSlidingWindow: CodingProblemDefinition = {
  statement: [
    'A window of `k` neighboring values slides over `nums` from the left end to the right end, one step at a time. Return the largest value in each window, in order: `nums.length - k + 1` values in all.',
  ],
  constraints: ['1 ≤ nums.length ≤ 2·10^5', '-10^9 ≤ nums[i] ≤ 10^9', '1 ≤ k ≤ nums.length'],
  entry: 'maxSlidingWindow',
  params: [
    { name: 'nums', type: 'int[]' },
    { name: 'k', type: 'int' },
  ],
  returns: 'int[]',
  compare: 'exact',
  examples: [
    {
      args: [[1, 3, -1, -3, 5, 3, 6, 7], 3],
      explanation: 'The windows are [1,3,-1], [3,-1,-3], [-1,-3,5], [-3,5,3], [5,3,6] and [3,6,7]',
    },
    { args: [[1], 1] },
    { args: [[9, 11], 2] },
  ],
  edgeCases: [
    [[5], 1],
    [[1, -1], 1],
    [[1, -1], 2],
    [[4, 4, 4], 2],
    [[1, 2, 3, 4], 2],
    [[4, 3, 2, 1], 2],
    [[3, 1, 1, 1], 2],
    [[-7, -8, -9], 3],
    [[1, 3, 1, 2, 0, 5], 3],
    [[2, 1, 2, 1, 2], 4],
  ],
  randomCase: (rand) => {
    const nums = ints(rand, randInt(rand, 1, 12), -5, 5);
    return [nums, randInt(rand, 1, nums.length)];
  },
  // Falling values put each window's maximum at its left end, so it leaves on the next step: rescanning the window then,
  // or scanning every window, reads about 10^5 values for each of about 10^5 windows.
  performanceCase: (rand) => [
    distinctInts(rand, 200_000, -1_000_000_000, 1_000_000_000).sort((a, b) => b - a),
    randInt(rand, 90_000, 110_000),
  ],
  solve(nums: number[], k: number) {
    const window: number[] = [];
    let head = 0;
    const out: number[] = [];
    for (let i = 0; i < nums.length; i++) {
      while (window.length > head && nums[window[window.length - 1]] <= nums[i]) window.pop();
      window.push(i);
      if (window[head] <= i - k) head++;
      if (i >= k - 1) out.push(nums[window[head]]);
    }
    return out;
  },
  approach:
    'Keep a deque of indices whose values fall from front to back. Before adding index `i`, pop from the back every index whose value is no larger than `nums[i]`: it leaves the window first, so it can never be a maximum again. Drop the front once it falls out of the window; the front is then the window maximum. Each index enters and leaves the deque once.',
  complexity: { time: 'O(n)', space: 'O(k)' },
};

export const carFleet: CodingProblemDefinition = {
  statement: [
    'Cars drive toward `target` along a one-lane road. Car `i` starts at `position[i]` and drives at `speed[i]` miles per hour, and no two cars start at the same position.',
    'A car cannot pass the one ahead: when it catches up, it slows to that speed and the two drive on together as one fleet. A car that catches up exactly at `target` joins that fleet too, and a car alone is a fleet of one.',
    'Return the number of fleets that arrive at `target`.',
  ],
  constraints: [
    '1 ≤ n ≤ 2·10^5',
    'position.length = speed.length = n',
    '1 ≤ target ≤ 10^6',
    '0 ≤ position[i] < target, all distinct',
    '1 ≤ speed[i] ≤ 1000',
  ],
  entry: 'carFleet',
  params: [
    { name: 'target', type: 'int' },
    { name: 'position', type: 'int[]' },
    { name: 'speed', type: 'int[]' },
  ],
  returns: 'int',
  compare: 'exact',
  examples: [
    {
      args: [12, [10, 8, 0, 5, 3], [2, 4, 1, 1, 3]],
      explanation:
        'The cars from 10 and 8 both reach 12 at hour 1, so they arrive as one fleet. The car from 3 catches the one from 5 at mile 6, and they arrive at hour 7. The car from 0 arrives alone at hour 12',
    },
    { args: [10, [3], [3]] },
    { args: [100, [0, 2, 4], [4, 2, 1]], explanation: 'The car from 2 catches the one from 4, then the car from 0 catches them both' },
  ],
  edgeCases: [
    [1, [0], [1]],
    [10, [0, 5], [2, 1]],
    [10, [0, 5], [1, 2]],
    [10, [6, 8], [3, 1]],
    [10, [0, 4], [3, 2]],
    [20, [10, 8, 0], [1, 6, 4]],
    [100, [1, 2, 3, 4], [5, 5, 5, 5]],
    [1_000_000, [999_999, 0], [1, 1000]],
    [12, [0, 3, 6, 9], [4, 3, 2, 1]],
  ],
  randomCase: (rand) => {
    const target = randInt(rand, 1, 12);
    const n = randInt(rand, 1, Math.min(target, 7));
    return [target, shuffle(rand, rangeOf(0, target - 1)).slice(0, n), ints(rand, n, 1, 4)];
  },
  // Most cars drive at 500 and lead their own fleets; one in ten is fast enough to reach the fleet ahead, sometimes
  // exactly at the target. Comparing each car with every car ahead checks about 10^10 pairs for the leaders alone.
  performanceCase: (rand) => {
    const target = 1_000_000;
    const cars = distinctInts(rand, 200_000, 0, target - 1)
      .sort((a, b) => b - a)
      .map((position): [number, number] => [position, 500]);
    let lead = target - cars[0][0];
    for (const car of cars.slice(1)) {
      const distance = target - car[0];
      if (distance <= 2 * lead && rand() < 0.1) car[1] = Math.ceil((500 * distance) / lead);
      else lead = distance;
    }
    const shuffled = shuffle(rand, cars);
    return [target, shuffled.map(([position]) => position), shuffled.map(([, speed]) => speed)];
  },
  solve(target: number, position: number[], speed: number[]) {
    const order = rangeOf(0, position.length - 1).sort((a, b) => position[b] - position[a]);
    const fleets: number[] = [];
    for (const car of order) {
      const front = fleets[fleets.length - 1];
      if (front === undefined || (target - position[car]) * speed[front] > (target - position[front]) * speed[car]) fleets.push(car);
    }
    return fleets.length;
  },
  approach:
    'Sort the cars by position, nearest to `target` first, and find when each would arrive alone, `(target - p) / s`. Keep a stack of fleet arrival times, which only grow: a car arriving no later than the fleet on top catches it and joins; a later one starts a new fleet. The stack size is the answer. With these limits, dividing in floating point still orders the times exactly; cross-multiplying avoids division altogether.',
  complexity: { time: 'O(n log n)', space: 'O(n)' },
};

export const minMeetingRooms: CodingProblemDefinition = {
  statement: [
    'Each `intervals[i]` is `[start, end]`, the time a meeting runs. Return the fewest rooms that hold every meeting, with no two meetings in the same room at the same time.',
    'Intervals are half-open: a meeting holds its room from `start` up to but not including `end`, so a meeting ending at 5 frees its room for one starting at 5.',
  ],
  constraints: ['1 ≤ intervals.length ≤ 10^5', '0 ≤ start < end ≤ 10^6'],
  entry: 'minMeetingRooms',
  params: [{ name: 'intervals', type: 'int[][]' }],
  returns: 'int',
  compare: 'exact',
  examples: [
    {
      args: [
        [
          [0, 30],
          [5, 10],
          [15, 20],
        ],
      ],
      explanation: '[0,30] overlaps both others, but [5,10] ends before [15,20] starts, so those two share a room',
    },
    {
      args: [
        [
          [7, 10],
          [2, 4],
        ],
      ],
    },
    {
      args: [
        [
          [1, 5],
          [5, 10],
        ],
      ],
      explanation: 'The first meeting ends at 5, just as the second starts, so one room is enough',
    },
  ],
  edgeCases: [
    [[[1, 2]]],
    [[[0, 1_000_000]]],
    [
      [
        [5, 10],
        [1, 5],
        [10, 15],
      ],
    ],
    [
      [
        [1, 2],
        [1, 2],
        [1, 2],
      ],
    ],
    [
      [
        [1, 3],
        [2, 5],
        [4, 6],
      ],
    ],
    [
      [
        [1, 10],
        [2, 3],
        [3, 4],
        [4, 5],
      ],
    ],
    [
      [
        [0, 5],
        [0, 5],
        [5, 10],
        [5, 10],
      ],
    ],
    [
      [
        [1, 4],
        [2, 5],
        [3, 6],
        [4, 7],
      ],
    ],
  ],
  randomCase: (rand) => [
    Array.from({ length: randInt(rand, 1, 8) }, () => {
      const start = randInt(rand, 0, 10);
      return [start, start + randInt(rand, 1, 5)];
    }),
  ],
  performanceCase: (rand) => [
    Array.from({ length: 100_000 }, () => {
      const start = randInt(rand, 0, 999_999);
      return [start, randInt(rand, start + 1, Math.min(1_000_000, start + 50_000))];
    }),
  ],
  solve(intervals: number[][]) {
    const starts = intervals.map(([start]) => start).sort((a, b) => a - b);
    const ends = intervals.map(([, end]) => end).sort((a, b) => a - b);
    let rooms = 0;
    let ended = 0;
    for (const start of starts)
      if (start < ends[ended]) rooms++;
      else ended++;
    return rooms;
  },
  approach:
    'Sort the meetings by start and keep a min-heap of the end times of the rooms in use. If the earliest end is no later than the next start, that room is free: pop it. Push the new end either way; the heap size at the end is the answer. Sweeping the sorted starts and the sorted ends with two pointers gives the same count.',
  complexity: { time: 'O(n log n)', space: 'O(n)' },
};
