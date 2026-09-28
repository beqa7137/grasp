import { randInt, shuffle } from '../../algorithms/random.js';
import type { CodingProblemDefinition } from '../types.js';
import { distinctSorted, ints } from './inputs.js';

const grid = (...rows: string[]) => rows.map((row) => [...row]);

/** An empty 9 × 9 board with each `[row, col, digit]` filled in. */
const placed = (...cells: [number, number, string][]) => {
  const board = Array.from({ length: 9 }, () => Array<string>(9).fill('.'));
  for (const [r, c, digit] of cells) board[r][c] = digit;
  return board;
};

const LEETCODE_BOARD = [
  '53..7....',
  '6..195...',
  '.98....6.',
  '8...6...3',
  '4..8.3..1',
  '7...2...6',
  '.6....28.',
  '...419..5',
  '....8..79',
];

const SOLVED = grid('534678912', '672195348', '198342567', '859761423', '426853791', '713924856', '961537284', '287419635', '345286179');

/** A random solved board: a shifted pattern with its digits relabeled and its bands, stacks, rows and columns shuffled. */
function solvedBoard(rand: () => number): string[][] {
  const digits = shuffle(rand, [...'123456789']);
  const order = () => shuffle(rand, [0, 1, 2]).flatMap((band) => shuffle(rand, [0, 1, 2]).map((i) => 3 * band + i));
  const [rows, cols] = [order(), order()];
  return rows.map((r) => cols.map((c) => digits[((r % 3) * 3 + Math.floor(r / 3) + c) % 9]));
}

export const validSudoku: CodingProblemDefinition = {
  statement: [
    "`board` is a 9 × 9 Sudoku grid. Each cell holds a digit from `'1'` to `'9'`, or `'.'` when it is empty.",
    'Return `true` if no digit repeats within a row, within a column, or within any of the nine 3 × 3 boxes that tile the grid, and `false` otherwise.',
    'Only the filled cells are checked: empty cells never conflict, and a valid board does not have to be solvable.',
  ],
  constraints: ['board is 9 × 9', "each cell is a digit '1' to '9' or '.'"],
  entry: 'isValidSudoku',
  params: [{ name: 'board', type: 'char[][]' }],
  returns: 'bool',
  compare: 'exact',
  examples: [
    { args: [grid(...LEETCODE_BOARD)], explanation: 'Every row, column and box holds each of its digits once' },
    {
      args: [grid('83..7....', ...LEETCODE_BOARD.slice(1))],
      explanation: 'The 8 in the top-left corner repeats the 8 below it in column 0, and the 8 in its own box',
    },
  ],
  edgeCases: [
    [placed()],
    [placed([4, 4, '9'])],
    [placed([2, 0, '4'], [2, 8, '4'])],
    [placed([0, 5, '7'], [8, 5, '7'])],
    [placed([6, 6, '2'], [8, 7, '2'])],
    [placed([0, 3, '5'], [3, 0, '5'])],
    [placed([0, 6, '3'], [4, 4, '3'], [8, 2, '3'])],
    [placed([0, 0, '1'], [4, 4, '1'], [8, 8, '1'], [1, 3, '1'], [7, 5, '1'])],
    [SOLVED],
    [SOLVED.map((row, r) => (r === 4 ? [row[1], row[0], ...row.slice(2)] : row))],
    [SOLVED.map((row, r) => (r === 8 ? [...row.slice(0, 8), '.'] : row))],
  ],
  randomCase: (rand) => {
    const keep = 0.15 + 0.5 * rand();
    const board = solvedBoard(rand).map((row) => row.map((digit) => (rand() < keep ? digit : '.')));
    if (rand() < 0.6) board[randInt(rand, 0, 8)][randInt(rand, 0, 8)] = String(randInt(rand, 1, 9));
    return [board];
  },
  performanceCase: (rand) => [solvedBoard(rand)],
  solve(board: string[][]) {
    const rows = new Int32Array(9);
    const cols = new Int32Array(9);
    const boxes = new Int32Array(9);
    for (let r = 0; r < 9; r++)
      for (let c = 0; c < 9; c++) {
        if (board[r][c] === '.') continue;
        const bit = 1 << Number(board[r][c]);
        const box = 3 * Math.floor(r / 3) + Math.floor(c / 3);
        if ((rows[r] | cols[c] | boxes[box]) & bit) return false;
        rows[r] |= bit;
        cols[c] |= bit;
        boxes[box] |= bit;
      }
    return true;
  },
  approach:
    'Scan the filled cells once, keeping the digits seen so far in each row, each column and each box. Cell `(r, c)` is in box `3 * (r // 3) + c // 3`; a digit already seen in any of its three groups makes the board invalid.',
  complexity: { time: 'O(81), one pass over the cells', space: 'O(1)' },
};

export const maxConsecutiveOnesIII: CodingProblemDefinition = {
  statement: [
    '`nums` holds only 0s and 1s. You may flip at most `k` of its 0s into 1s.',
    'Return the length of the longest run of neighboring 1s you can end up with, or 0 if there can be none.',
  ],
  constraints: ['1 ≤ nums.length ≤ 2·10^5', 'nums[i] is 0 or 1', '0 ≤ k ≤ nums.length'],
  entry: 'longestOnes',
  params: [
    { name: 'nums', type: 'int[]' },
    { name: 'k', type: 'int' },
  ],
  returns: 'int',
  compare: 'exact',
  examples: [
    {
      args: [[1, 1, 1, 0, 0, 0, 1, 1, 1, 1, 0], 2],
      explanation: 'Flipping the 0s at indices 5 and 10 makes indices 5 to 10 all 1s, a run of 6',
    },
    { args: [[0, 0, 1, 1, 0, 0, 1, 1, 1, 0, 1, 1, 0, 0, 0, 1, 1, 1, 1], 3] },
  ],
  edgeCases: [
    [[0], 0],
    [[0], 1],
    [[1], 0],
    [[1, 1, 1], 0],
    [[0, 0, 0], 2],
    [[0, 0, 0], 3],
    [[1, 0, 1, 0, 0, 1], 1],
    [[0, 1, 1, 0, 1, 1, 0], 0],
    [[1, 0, 0, 1, 1, 0, 1], 2],
    [[0, 1, 0, 0, 1, 1, 1, 0, 1], 1],
  ],
  randomCase: (rand) => {
    const zeros = rand();
    const nums = Array.from({ length: randInt(rand, 1, 14) }, () => (rand() < zeros ? 0 : 1));
    return [nums, randInt(rand, 0, Math.min(4, nums.length))];
  },
  // About 30% of the values are 0 and k is tens of thousands, so the best window spans nearly half the array, and
  // growing a window from every start until it needs one flip too many is quadratic.
  performanceCase: (rand) => {
    const nums = Array.from({ length: 200_000 }, () => (rand() < 0.3 ? 0 : 1));
    return [nums, randInt(rand, 20_000, 30_000)];
  },
  solve(nums: number[], k: number) {
    let best = 0;
    let zeros = 0;
    for (let lo = 0, hi = 0; hi < nums.length; hi++) {
      if (nums[hi] === 0) zeros++;
      while (zeros > k) if (nums[lo++] === 0) zeros--;
      best = Math.max(best, hi - lo + 1);
    }
    return best;
  },
  approach:
    'Slide a window that holds at most `k` zeros: extend it on the right, and while it holds one zero too many, drop values from the left. Every window it keeps can be flipped to all 1s, so the longest one is the answer, and each index enters and leaves once.',
  complexity: { time: 'O(n)', space: 'O(1)' },
};

export const boatsToSavePeople: CodingProblemDefinition = {
  statement: [
    '`people[i]` is the weight of person `i`. Each boat carries at most two people at once, and only if their total weight is at most `limit`. Nobody weighs more than `limit`.',
    'Return the smallest number of boats that carries everyone.',
  ],
  constraints: ['1 ≤ people.length ≤ 2·10^5', '1 ≤ people[i] ≤ limit ≤ 3·10^4'],
  entry: 'numRescueBoats',
  params: [
    { name: 'people', type: 'int[]' },
    { name: 'limit', type: 'int' },
  ],
  returns: 'int',
  compare: 'exact',
  examples: [
    { args: [[3, 2, 2, 1], 3], explanation: '(1, 2), (2) and (3): the person weighing 3 fills a boat alone' },
    { args: [[1, 2], 3] },
    { args: [[3, 5, 3, 4], 5] },
  ],
  edgeCases: [
    [[1], 1],
    [[5, 5, 5], 5],
    [[1, 1, 1, 1], 2],
    [[1, 2, 3, 4], 5],
    [[6, 1, 2], 6],
    [[2, 2, 2], 4],
    [[1, 5, 3, 5], 5],
    [[4, 1, 3, 2, 4], 5],
    [[30_000, 30_000], 30_000],
    [[15_000, 15_000], 30_000],
  ],
  randomCase: (rand) => {
    const limit = randInt(rand, 1, 12);
    return [ints(rand, randInt(rand, 1, 10), 1, limit), limit];
  },
  // Most people fit beside the lightest one left, so there are about n / 2 boats, and scanning everyone still waiting
  // for a partner at each boat is quadratic.
  performanceCase: (rand) => {
    const limit = randInt(rand, 20_000, 30_000);
    return [ints(rand, randInt(rand, 190_000, 200_000), 1, Math.floor(limit * 0.7)), limit];
  },
  solve(people: number[], limit: number) {
    const sorted = [...people].sort((a, b) => a - b);
    let boats = 0;
    for (let lo = 0, hi = sorted.length - 1; lo <= hi; hi--, boats++) if (sorted[lo] + sorted[hi] <= limit) lo++;
    return boats;
  },
  approach:
    'Sort, then fill one boat per step with the heaviest person left, adding the lightest one left when the two fit. If the lightest cannot join the heaviest, nobody can, so the heaviest rides alone; if they fit, any partner of the heaviest could swap with the lightest.',
  complexity: { time: 'O(n log n)', space: 'O(n) for the sorted copy' },
};

export const shipWithinDays: CodingProblemDefinition = {
  statement: [
    '`weights[i]` is the weight of the `i`-th package on a conveyor belt. Each day, the ship takes the next packages off the belt, in order, as long as their total weight stays within its capacity. Packages are never reordered or split.',
    'Return the smallest integer capacity that ships every package within `days` days. A day may ship nothing, and `days` can exceed the number of packages.',
  ],
  constraints: ['1 ≤ weights.length ≤ 5·10^4', '1 ≤ weights[i] ≤ 10^6', '1 ≤ days ≤ 10^5', 'The answer can exceed 2^31'],
  entry: 'shipWithinDays',
  params: [
    { name: 'weights', type: 'int[]' },
    { name: 'days', type: 'int' },
  ],
  returns: 'int',
  compare: 'exact',
  examples: [
    {
      args: [[1, 2, 3, 4, 5, 6, 7, 8, 9, 10], 5],
      explanation: 'Capacity 15 ships 1 to 5, then 6 and 7, then 8, 9 and 10 on days of their own; 14 needs six days',
    },
    { args: [[3, 2, 2, 4, 1, 4], 3] },
    { args: [[1, 2, 3, 1, 1], 4] },
  ],
  edgeCases: [
    [[5], 1],
    [[5], 3],
    [[1, 1, 1], 5],
    [[10, 1, 1], 3],
    [[1, 2, 3, 4, 5], 1],
    [[1, 2, 3, 4, 5], 2],
    [[2, 2, 2], 2],
    [[3, 3, 3, 3], 3],
    [[1, 10, 1], 2],
    [Array<number>(12).fill(1_000_000), 5],
  ],
  randomCase: (rand) => {
    const weights = ints(rand, randInt(rand, 1, 8), 1, 10);
    return [weights, randInt(rand, 1, weights.length + 2)];
  },
  // days·q + 1 packages of nearly 10^6: some day carries q + 1 of them, so the answer sits hundreds of thousands above
  // both the heaviest package and the average day, and trying each capacity upward from either one checks every one between.
  performanceCase: (rand) => {
    const days = randInt(rand, 2, 8);
    return [ints(rand, days * Math.floor(49_999 / days) + 1, 999_000, 1_000_000), days];
  },
  solve(weights: number[], days: number) {
    const daysNeeded = (capacity: number) => {
      let count = 1;
      let load = 0;
      for (const w of weights)
        if (load + w > capacity) {
          count++;
          load = w;
        } else load += w;
      return count;
    };
    let lo = 0;
    let hi = 0;
    for (const w of weights) {
      lo = Math.max(lo, w);
      hi += w;
    }
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (daysNeeded(mid) <= days) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  },
  approach:
    'Binary search on the capacity, from the heaviest package (anything less can never ship it) to the total weight (one day). For a capacity, load each day greedily until the next package would not fit; if that needs at most `days` days, every larger capacity works too, so keep the smallest one that does.',
  complexity: { time: 'O(n log(sum of weights))', space: 'O(1)' },
};

export const searchMatrix: CodingProblemDefinition = {
  statement: [
    "`matrix` is m × n. Each row is sorted in non-decreasing order, and each row's first value is greater than the last value of the row above it.",
    'Return `true` if `target` is in `matrix`, and `false` otherwise. Aim for O(log(m·n)) time.',
  ],
  constraints: ['1 ≤ m, n ≤ 300', '-10^9 ≤ matrix[r][c], target ≤ 10^9'],
  entry: 'searchMatrix',
  params: [
    { name: 'matrix', type: 'int[][]' },
    { name: 'target', type: 'int' },
  ],
  returns: 'bool',
  compare: 'exact',
  examples: [
    {
      args: [
        [
          [1, 3, 5, 7],
          [10, 11, 16, 20],
          [23, 30, 34, 60],
        ],
        3,
      ],
      explanation: 'Read row by row, the values form one sorted list, and 3 is its second value',
    },
    {
      args: [
        [
          [1, 3, 5, 7],
          [10, 11, 16, 20],
          [23, 30, 34, 60],
        ],
        13,
      ],
    },
  ],
  edgeCases: [
    [[[1]], 1],
    [[[1]], 0],
    [[[1, 3, 5]], 5],
    [[[1], [3], [5]], 4],
    [[[1], [3], [5]], 5],
    [
      [
        [1, 3, 5, 7],
        [10, 11, 16, 20],
      ],
      8,
    ],
    [
      [
        [1, 3, 5, 7],
        [10, 11, 16, 20],
        [23, 30, 34, 60],
      ],
      60,
    ],
    [
      [
        [1, 3, 5, 7],
        [10, 11, 16, 20],
        [23, 30, 34, 60],
      ],
      61,
    ],
    [
      [
        [1, 2],
        [4, 5],
        [7, 8],
        [10, 11],
      ],
      8,
    ],
    [
      [
        [1, 1, 2],
        [3, 3, 3],
      ],
      3,
    ],
    [
      [
        [-1_000_000_000, 0],
        [5, 1_000_000_000],
      ],
      1_000_000_000,
    ],
  ],
  randomCase: (rand) => {
    const [m, n] = [randInt(rand, 1, 5), randInt(rand, 1, 5)];
    let value = randInt(rand, -20, 0);
    const matrix = Array.from({ length: m }, () => {
      value += randInt(rand, 1, 3);
      return Array.from({ length: n }, (_, c) => (value += c ? randInt(rand, 0, 2) : 0));
    });
    const flat = matrix.flat();
    return [matrix, rand() < 0.6 ? flat[randInt(rand, 0, flat.length - 1)] : randInt(rand, flat[0] - 2, value + 2)];
  },
  performanceCase: (rand) => {
    const values = distinctSorted(rand, 90_000, -1_000_000_000, 1_000_000_000);
    const matrix = Array.from({ length: 300 }, (_, r) => values.slice(300 * r, 300 * (r + 1)));
    return [matrix, values[randInt(rand, 0, values.length - 1)] + (rand() < 0.5 ? 0 : 1)];
  },
  solve(matrix: number[][], target: number) {
    const cols = matrix[0].length;
    let lo = 0;
    let hi = matrix.length * cols - 1;
    while (lo <= hi) {
      const mid = lo + ((hi - lo) >> 1);
      const value = matrix[Math.floor(mid / cols)][mid % cols];
      if (value === target) return true;
      if (value < target) lo = mid + 1;
      else hi = mid - 1;
    }
    return false;
  },
  approach:
    'Read row by row, the matrix is one sorted list of `m * n` values, so binary search it directly: position `i` is the cell `(i // n, i % n)`.',
  complexity: { time: 'O(log(m·n))', space: 'O(1)' },
};
