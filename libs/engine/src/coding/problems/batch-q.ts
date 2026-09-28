import { distinctInts, randInt, shuffle } from '../../algorithms/random.js';
import type { CodingProblemDefinition } from '../types.js';
import { distinctSorted, ints, nearMiddle } from './inputs.js';

const MOD = 1_000_000_007;

const randomWord = (rand: () => number, alphabet: string, min: number, max: number) =>
  Array.from({ length: randInt(rand, min, max) }, () => alphabet[randInt(rand, 0, alphabet.length - 1)]).join('');

export const maximumProductSubarray: CodingProblemDefinition = {
  statement: [
    'Return the largest product of a contiguous, non-empty subarray of `nums`.',
    'A single value is a subarray too, so the answer can be 0 or negative. The product of every subarray fits in a 32-bit signed integer.',
  ],
  constraints: ['1 ≤ nums.length ≤ 10^5', '-10 ≤ nums[i] ≤ 10', 'the product of every subarray fits in a 32-bit signed integer'],
  entry: 'maxProduct',
  params: [{ name: 'nums', type: 'int[]' }],
  returns: 'int',
  compare: 'exact',
  examples: [
    { args: [[2, 3, -2, 4]], explanation: '2 × 3 = 6; any longer run takes the -2 and turns negative, and 4 alone is less' },
    { args: [[-2, 0, -1]], explanation: 'The 0 splits the two negatives apart, so the best product is 0 itself' },
  ],
  edgeCases: [
    [[-3]],
    [[0]],
    [[7]],
    [[-2, 3, -4]],
    [[-1, -1]],
    [[0, -3, 0]],
    [[-2, -3, -4]],
    [[3, -1, 4]],
    [[2, -5, -2, -4, 3]],
    [[1, 0, -1, 2, 3, -5, -2]],
    [[-10, 10, 10, 10, -10]],
  ],
  randomCase: (rand) => [ints(rand, randInt(rand, 1, 10), -4, 4)],
  // About 10^5 values of 1 and -1 with a few 2s and 3s among them, and a 0 near each end: the stretch between the zeros
  // holds nearly every value, so trying every subarray, even stopping each one at a 0, takes over 4·10^9 products.
  performanceCase: (rand) => {
    const n = randInt(rand, 98_000, 100_000);
    const nums = Array.from({ length: n }, (): number => (rand() < 0.5 ? -1 : 1));
    for (const i of distinctInts(rand, 18, 500, n - 501)) nums[i] = (rand() < 0.5 ? -1 : 1) * randInt(rand, 2, 3);
    nums[randInt(rand, 0, 499)] = 0;
    nums[n - 1 - randInt(rand, 0, 499)] = 0;
    return [nums];
  },
  solve(nums: number[]) {
    let best = nums[0];
    let high = nums[0];
    let low = nums[0];
    for (let i = 1; i < nums.length; i++) {
      const x = nums[i];
      if (x < 0) [high, low] = [low, high];
      high = Math.max(x, high * x);
      low = Math.min(x, low * x);
      best = Math.max(best, high);
    }
    return best;
  },
  approach:
    'Scan once, keeping the largest and the smallest product of a subarray that ends at the current value. A negative value swaps their roles, since the smallest product times it can become the largest, and each is also compared with the value alone, which restarts after a 0. The answer is the largest product seen. Trying every subarray is quadratic.',
  complexity: { time: 'O(n)', space: 'O(1)' },
};

export const combinationSum4: CodingProblemDefinition = {
  statement: [
    'Return the number of sequences of values from `nums` that add up to `target`. A value may appear in a sequence any number of times.',
    'Sequences with the same values in a different order count separately, so 1, 2 and 2, 1 are two sequences.',
    'The values in `nums` are distinct and positive, and the answer fits in a 32-bit signed integer.',
  ],
  constraints: [
    '1 ≤ nums.length ≤ 200',
    '1 ≤ nums[i] ≤ 1000',
    'values in nums are distinct',
    '1 ≤ target ≤ 1000',
    'the answer is at most 2^31 - 1',
  ],
  entry: 'combinationSum4',
  params: [
    { name: 'nums', type: 'int[]' },
    { name: 'target', type: 'int' },
  ],
  returns: 'int',
  compare: 'exact',
  examples: [
    { args: [[1, 2, 3], 4], explanation: '1+1+1+1, 1+1+2, 1+2+1, 2+1+1, 2+2, 1+3 and 3+1' },
    { args: [[9], 3], explanation: 'No sequence of 9s adds up to 3' },
  ],
  edgeCases: [
    [[1], 1],
    [[2], 1],
    [[1], 200],
    [[4, 6], 9],
    [[2, 3], 7],
    [[5, 10], 10],
    [[1000], 1000],
    [[3, 1, 2], 5],
    [[1, 2], 45],
  ],
  randomCase: (rand) => [distinctInts(rand, randInt(rand, 1, 4), 1, 8), randInt(rand, 1, 16)],
  // Sixty multiples of 3 and one other value, a little below a target that is not a multiple of 3: every sequence that
  // counts uses that value once, but recursing on each value without a memo also walks every sequence of multiples of 3
  // up to the target, far over 4·10^9 of them.
  performanceCase: (rand) => {
    const target = 3 * randInt(rand, 300, 330) + randInt(rand, 1, 2);
    const odd = target - 3 * randInt(rand, 20, 60);
    return [shuffle(rand, [...distinctInts(rand, 60, 4, 200).map((v) => 3 * v), odd]), target];
  },
  solve(nums: number[], target: number) {
    const ways = new Float64Array(target + 1);
    ways[0] = 1;
    for (let sum = 1; sum <= target; sum++) for (const x of nums) if (x <= sum) ways[sum] += ways[sum - x];
    return ways[target];
  },
  approach:
    'Let `ways[s]` count the sequences that add up to `s`, with `ways[0] = 1` for the empty one. A sequence for `s` ends with some value `x`, and the values before it add up to `s - x`, so `ways[s]` is the sum of `ways[s - x]` over the values up to `s`. Fill it for every sum up to `target`, with the loop over values inside the loop over sums: the other way round counts each set of values once instead of each order. Recursing without a memo is exponential.',
  complexity: { time: 'O(n · target)', space: 'O(target)' },
};

export const uniquePathsWithObstacles: CodingProblemDefinition = {
  statement: [
    'A robot starts in the top-left cell of `grid` and moves only right or down, one cell at a time, to the bottom-right cell. A cell holding 1 is an obstacle the robot cannot enter; a cell holding 0 is open.',
    'Return the number of different paths from the top-left cell to the bottom-right cell, modulo 10^9 + 7. If either of those cells is an obstacle, the answer is 0; if the grid is a single open cell, it is 1.',
  ],
  constraints: ['1 ≤ m, n ≤ 100, for an m × n grid', 'every cell is 0 or 1'],
  entry: 'uniquePathsWithObstacles',
  params: [{ name: 'grid', type: 'int[][]' }],
  returns: 'int',
  compare: 'exact',
  examples: [
    {
      args: [
        [
          [0, 0, 0],
          [0, 1, 0],
          [0, 0, 0],
        ],
      ],
      explanation: 'Around the obstacle in the middle: right, right, down, down, or down, down, right, right',
    },
    {
      args: [
        [
          [0, 1],
          [0, 0],
        ],
      ],
    },
  ],
  edgeCases: [
    [[[0]]],
    [[[1]]],
    [[[0, 0, 0, 0]]],
    [[[0, 1, 0]]],
    [[[0], [0], [0]]],
    [
      [
        [1, 0],
        [0, 0],
      ],
    ],
    [
      [
        [0, 0],
        [0, 1],
      ],
    ],
    [
      [
        [0, 1, 0],
        [0, 0, 0],
      ],
    ],
    [
      [
        [0, 0],
        [1, 0],
        [0, 0],
      ],
    ],
    [Array.from({ length: 20 }, () => Array<number>(20).fill(0))],
  ],
  randomCase: (rand) => {
    const cols = randInt(rand, 1, 6);
    return [Array.from({ length: randInt(rand, 1, 6) }, () => Array.from({ length: cols }, () => (rand() < 0.25 ? 1 : 0)))];
  },
  // A grid of about 100 × 100 with one cell in eight blocked: astronomically many paths still get through, so walking
  // every path without a memo cannot finish.
  performanceCase: (rand) => {
    const rows = randInt(rand, 95, 100);
    const cols = randInt(rand, 95, 100);
    const grid = Array.from({ length: rows }, () => Array.from({ length: cols }, () => (rand() < 0.12 ? 1 : 0)));
    grid[0][0] = 0;
    grid[rows - 1][cols - 1] = 0;
    return [grid];
  },
  solve(grid: number[][]) {
    const ways = Array<number>(grid[0].length).fill(0);
    ways[0] = 1;
    for (const row of grid)
      row.forEach((cell, c) => {
        if (cell) ways[c] = 0;
        else if (c > 0) ways[c] = (ways[c] + ways[c - 1]) % MOD;
      });
    return ways[ways.length - 1];
  },
  approach:
    'The robot enters an open cell from above or from the left, so the paths into it are the paths into the cell above plus those into the cell to its left; an obstacle has none. Fill the counts row by row, taking each sum modulo 10^9 + 7, and keep one row: the cell above is the old value in the same column. Walking every path without a memo is exponential.',
  complexity: { time: 'O(m·n)', space: 'O(n) with one row' },
};

export const numDistinct: CodingProblemDefinition = {
  statement: [
    'Return the number of ways to pick letters of `s`, keeping their order, that spell `t`. Two ways differ when they pick a different set of positions in `s`, even if the letters are the same.',
    'If `t` is longer than `s`, or cannot be spelled from it, the answer is 0. The answer fits in a 32-bit signed integer.',
  ],
  constraints: [
    '1 ≤ s.length, t.length ≤ 1000',
    'lowercase letters',
    'the answer is at most 2^31 - 1',
    'In browser Python, `@cache` can exhaust the stack here',
  ],
  entry: 'numDistinct',
  params: [
    { name: 's', type: 'string' },
    { name: 't', type: 'string' },
  ],
  returns: 'int',
  compare: 'exact',
  examples: [
    { args: ['rabbbit', 'rabbit'], explanation: 'Leave out any one of the three b letters and keep the rest' },
    { args: ['babgbag', 'bag'] },
  ],
  edgeCases: [
    ['a', 'a'],
    ['a', 'b'],
    ['a', 'aa'],
    ['aaa', 'a'],
    ['aaaa', 'aa'],
    ['ab', 'ba'],
    ['abab', 'ab'],
    ['aab', 'ab'],
    ['abcde', 'ace'],
    ['a'.repeat(33), 'a'.repeat(16)],
  ],
  randomCase: (rand) => {
    const alphabet = rand() < 0.7 ? 'ab' : 'abc';
    return [randomWord(rand, alphabet, 1, 10), randomWord(rand, alphabet, 1, 4)];
  },
  // s is a long run of one letter with a few other letters mixed in, then a second letter, then a short run of the
  // first; t needs a long run, the second letter, then more of the first than s has left. Nothing matches, but
  // recursing without a memo, from either end, tries the astronomically many ways to match the runs first.
  performanceCase: (rand) => {
    const [x, y, filler] = shuffle(rand, [...'abcdefghijklmnopqrstuvwxyz']);
    const head = [...x.repeat(randInt(rand, 800, 850))];
    for (let k = 0; k < 10; k++) head.splice(randInt(rand, 0, head.length), 0, filler);
    const after = randInt(rand, 40, 80);
    const s = head.join('') + y + x.repeat(after);
    const t = x.repeat(randInt(rand, 380, 420)) + y + x.repeat(after + randInt(rand, 1, 30));
    return [s, t];
  },
  solve(s: string, t: string) {
    const ways = new Float64Array(t.length + 1);
    ways[0] = 1;
    for (const letter of s) for (let j = t.length; j >= 1; j--) if (t[j - 1] === letter) ways[j] += ways[j - 1];
    return ways[t.length];
  },
  approach:
    'Let `ways[i][j]` count the ways to spell the first `j` letters of `t` from the first `i` of `s`, with one way to spell nothing. The last of those letters of `s` either goes unused, giving `ways[i - 1][j]`, or, when it equals letter `j` of `t`, spells that letter, adding `ways[i - 1][j - 1]`. Keep one row and update it from high `j` to low. Recursing on both choices without a memo is exponential; fill the table bottom-up in browser Python.',
  complexity: { time: 'O(m·n)', space: 'O(n) with one row' },
};

export const countSubstrings: CodingProblemDefinition = {
  statement: [
    'Return the number of substrings of `s` that are palindromes, reading the same forwards and backwards. A substring is a contiguous, non-empty run of letters.',
    'Substrings at different positions count separately, even when they spell the same word.',
  ],
  constraints: ['1 ≤ s.length ≤ 2500', 'lowercase letters'],
  entry: 'countSubstrings',
  params: [{ name: 's', type: 'string' }],
  returns: 'int',
  compare: 'exact',
  examples: [
    { args: ['abc'], explanation: 'Only the three single letters' },
    { args: ['aaa'], explanation: 'Three single letters, two aa and one aaa' },
  ],
  edgeCases: [['a'], ['ab'], ['aa'], ['aba'], ['abba'], ['abcba'], ['aabaa'], ['abab'], ['zzzzzz']],
  randomCase: (rand) => [randomWord(rand, rand() < 0.6 ? 'ab' : 'abc', 1, 14)],
  // About 2400 copies of one letter with one other letter near each end: most substrings are palindromes or miss only
  // near their middle, so checking each substring from its ends inward takes about 10^9 comparisons.
  performanceCase: (rand) => {
    const [fill, first, second] = shuffle(rand, [...'abcdefghijklmnopqrstuvwxyz']);
    const letters = [...fill.repeat(randInt(rand, 2350, 2400))];
    letters[randInt(rand, 0, 60)] = first;
    letters[letters.length - 1 - randInt(rand, 0, 60)] = second;
    return [letters.join('')];
  },
  solve(s: string) {
    const n = s.length;
    const pal = new Uint8Array(n);
    let count = 0;
    for (let i = n - 1; i >= 0; i--)
      for (let j = n - 1; j >= i; j--) {
        pal[j] = s[i] === s[j] && (j - i < 2 || pal[j - 1]) ? 1 : 0;
        count += pal[j];
      }
    return count;
  },
  approach:
    'A substring of three or more letters is a palindrome when its end letters match and the part inside them is one. Let `pal[i][j]` say whether the letters from `i` to `j` form a palindrome, fill it for `i` from the end down so the inside is known first, and count the true entries; one row, updated from high `j` to low, is enough. Expanding around each of the `2n - 1` centers counts the same palindromes without a table. Checking every substring letter by letter is cubic.',
  complexity: { time: 'O(n²)', space: 'O(n) with one row' },
};

export const candy: CodingProblemDefinition = {
  statement: [
    'Children stand in a line, and `ratings[i]` is the rating of child `i`. Give each child at least one candy, so that each child with a higher rating than a neighbor gets more candies than that neighbor.',
    'Neighbors with equal ratings have no rule between them. Return the fewest candies in total.',
  ],
  constraints: ['1 ≤ ratings.length ≤ 2·10^5', '0 ≤ ratings[i] ≤ 10^9', 'The answer can exceed 2^31'],
  entry: 'candy',
  params: [{ name: 'ratings', type: 'int[]' }],
  returns: 'int',
  compare: 'exact',
  examples: [
    { args: [[1, 0, 2]], explanation: '2, 1 and 2 candies: the middle child has the lowest rating, and each end child beats it' },
    { args: [[1, 2, 2]], explanation: '1, 2 and 1: the last child ties with the middle one, so one candy is enough' },
  ],
  edgeCases: [
    [[5]],
    [[3, 3, 3]],
    [[1, 2, 3, 4]],
    [[4, 3, 2, 1]],
    [[1, 3, 2, 2, 1]],
    [[1, 3, 4, 5, 2]],
    [[5, 3, 1, 2, 6]],
    [[1, 6, 10, 8, 7, 3, 2]],
    [[0, 1_000_000_000]],
  ],
  randomCase: (rand) => [ints(rand, randInt(rand, 1, 10), 0, 4)],
  // One long climb to a peak near the middle, then one long descent: walking out from every child to the ends of its
  // slopes, or repeating one-way passes until nothing changes, each take over 4·10^9 steps.
  performanceCase: (rand) => {
    const n = randInt(rand, 190_000, 200_000);
    const peak = nearMiddle(rand, n);
    return [[...distinctSorted(rand, peak, 0, 1_000_000_000), ...distinctSorted(rand, n - peak, 0, 1_000_000_000).reverse()]];
  },
  solve(ratings: number[]) {
    const n = ratings.length;
    const candies = new Float64Array(n).fill(1);
    for (let i = 1; i < n; i++) if (ratings[i] > ratings[i - 1]) candies[i] = candies[i - 1] + 1;
    for (let i = n - 2; i >= 0; i--) if (ratings[i] > ratings[i + 1]) candies[i] = Math.max(candies[i], candies[i + 1] + 1);
    return candies.reduce((sum, c) => sum + c, 0);
  },
  approach:
    'Start everyone at one candy. Sweep left to right, giving each child who beats its left neighbor one more than that neighbor; then sweep right to left, raising each child who beats its right neighbor to one more than that neighbor when it has fewer. Each count ends as the smallest that satisfies both sides, so the total is the fewest. Walking out from every child to the ends of its slopes is quadratic on long slopes.',
  complexity: { time: 'O(n)', space: 'O(n)' },
};
