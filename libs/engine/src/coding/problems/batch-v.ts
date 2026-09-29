import { randInt, shuffle } from '../../algorithms/random.js';
import type { CodingProblemDefinition } from '../types.js';
import { distinctSorted, ints } from './inputs.js';
import { MinHeap } from './min-heap.js';

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

const randomWord = (rand: () => number, alphabet: string, min: number, max: number) =>
  Array.from({ length: randInt(rand, min, max) }, () => alphabet[randInt(rand, 0, alphabet.length - 1)]).join('');

export const groupAnagrams: CodingProblemDefinition = {
  statement: [
    'Two words are anagrams when one is the other with its letters reordered, using each letter as many times as it appears. Group the words of `strs` so that each group holds exactly the words that are anagrams of one another.',
    'Return one string per group: its words sorted alphabetically and joined by single spaces. The groups can be in any order. A word that appears more than once in `strs` appears that many times in its group, and a word with no anagram forms a group on its own.',
  ],
  constraints: ['1 ≤ strs.length ≤ 10^5', '1 ≤ strs[i].length ≤ 10', 'lowercase letters'],
  entry: 'groupAnagrams',
  params: [{ name: 'strs', type: 'string[]' }],
  returns: 'string[]',
  compare: 'unordered',
  examples: [
    {
      args: [['eat', 'tea', 'tan', 'ate', 'nat', 'bat']],
      explanation: 'eat, tea and ate share the letters a, e and t; tan and nat share a, n and t; bat has no anagram here',
    },
    { args: [['a']] },
    { args: [['ab', 'ba', 'ab', 'abb']] },
  ],
  edgeCases: [
    [['z']],
    [['abc', 'bca', 'cab']],
    [['xy', 'yx', 'xy']],
    [['aab', 'abb', 'bab']],
    [['ad', 'bc', 'da']],
    [['tea', 'eat', 'a', 'aa']],
    [['q', 'r', 's']],
    [['abcdefghij', 'jihgfedcba', 'abcdefghik']],
  ],
  randomCase: (rand) => [Array.from({ length: randInt(rand, 1, 8) }, () => randomWord(rand, 'abc', 1, 3))],
  // About 10^5 words of six to ten random letters, one in twenty a reordering of an earlier word: nearly every word
  // starts a group, so checking each word against every group so far takes over 4·10^9 comparisons.
  performanceCase: (rand) => {
    const words: string[] = [];
    for (let n = randInt(rand, 98_000, 100_000); words.length < n;)
      words.push(
        words.length && rand() < 0.05
          ? shuffle(rand, [...words[randInt(rand, 0, words.length - 1)]]).join('')
          : randomWord(rand, LETTERS, 6, 10),
      );
    return [words];
  },
  solve(strs: string[]) {
    const groups = new Map<string, string[]>();
    for (const word of strs) {
      const key = [...word].sort().join('');
      const group = groups.get(key);
      if (group) group.push(word);
      else groups.set(key, [word]);
    }
    return [...groups.values()].map((group) => group.sort().join(' '));
  },
  approach:
    'Anagrams have the same letters in sorted order, so sort the letters of each word and use the result as a key in a hash map from key to the words that have it. Each value of the map is one group. Counting the 26 letters gives a key in linear time too. Comparing each word with every group found so far is quadratic.',
  complexity: { time: 'O(n · k log k) for n words of up to k letters', space: 'O(n · k)' },
};

export const longestStrChain: CodingProblemDefinition = {
  statement: [
    'Word `a` is a predecessor of word `b` when inserting exactly one letter anywhere in `a`, keeping its other letters in order, gives `b`. For example, ac is a predecessor of abc, but ab is not a predecessor of ba.',
    'A word chain is a sequence of words from `words` in which each word is a predecessor of the next; a single word is a chain of length 1. The words can be taken in any order, each at most once. Return the length of the longest word chain.',
    'The words are distinct.',
  ],
  constraints: ['1 ≤ words.length ≤ 10^5', '1 ≤ words[i].length ≤ 16', 'lowercase letters', 'the words are distinct'],
  entry: 'longestStrChain',
  params: [{ name: 'words', type: 'string[]' }],
  returns: 'int',
  compare: 'exact',
  examples: [
    { args: [['a', 'b', 'ba', 'bca', 'bda', 'bdca']], explanation: 'a, ba, bda, bdca: each adds one letter to the one before' },
    { args: [['xbc', 'pcxbcf', 'xb', 'cxbc', 'pcxbc']], explanation: 'xb, xbc, cxbc, pcxbc, pcxbcf uses every word' },
    { args: [['abcd', 'dbqca']] },
  ],
  edgeCases: [
    [['a']],
    [['a', 'b', 'c']],
    [['ab', 'a']],
    [['a', 'abc']],
    [['ac', 'abc']],
    [['ab', 'ba', 'bca']],
    [['ab', 'cd', 'abcd']],
    [['abcd', 'abc', 'ab', 'a', 'bcd', 'cd']],
    [['a', 'aa', 'aaa', 'aaaa']],
  ],
  randomCase: (rand) => {
    const words = new Set<string>();
    const count = randInt(rand, 1, 8);
    while (words.size < count) words.add(randomWord(rand, 'ab', 1, 4));
    return [[...words]];
  },
  // About 10^5 words grown from single letters one inserted letter at a time, in shuffled order: comparing every pair of
  // words takes over 4·10^9 checks.
  performanceCase: (rand) => {
    const n = randInt(rand, 95_000, 100_000);
    const words = new Set<string>();
    while (words.size < n) {
      const letters = [LETTERS[randInt(rand, 0, 25)]];
      words.add(letters.join(''));
      for (let length = randInt(rand, 4, 16); letters.length < length && words.size < n;) {
        letters.splice(randInt(rand, 0, letters.length), 0, LETTERS[randInt(rand, 0, 25)]);
        words.add(letters.join(''));
      }
    }
    return [shuffle(rand, [...words])];
  },
  solve(words: string[]) {
    const best = new Map<string, number>();
    let longest = 0;
    for (const word of [...words].sort((a, b) => a.length - b.length)) {
      let length = 1;
      for (let i = 0; i < word.length; i++) length = Math.max(length, (best.get(word.slice(0, i) + word.slice(i + 1)) ?? 0) + 1);
      best.set(word, length);
      longest = Math.max(longest, length);
    }
    return longest;
  },
  approach:
    'Sort the words by length, so every predecessor comes before its word. The longest chain ending at a word is one more than the longest ending at any of its predecessors, and those are exactly the words you get by deleting one of its letters: look each one up in a hash map of the chains found so far. Comparing every pair of words is quadratic.',
  complexity: { time: 'O(n · L²) for n words of up to L letters', space: 'O(n · L)' },
};

export const minPathSum: CodingProblemDefinition = {
  statement: [
    'Each cell of `grid` holds a cost of 0 or more. Start in the top-left cell and move only right or down, one cell at a time, to the bottom-right cell.',
    'Return the smallest total cost of such a path, counting every cell on it, the first and the last included.',
  ],
  constraints: ['1 ≤ m, n ≤ 200, for an m × n grid', '0 ≤ grid[i][j] ≤ 200'],
  entry: 'minPathSum',
  params: [{ name: 'grid', type: 'int[][]' }],
  returns: 'int',
  compare: 'exact',
  examples: [
    {
      args: [
        [
          [1, 3, 1],
          [1, 5, 1],
          [4, 2, 1],
        ],
      ],
      explanation: 'Along the top row and down the right column: 1 + 3 + 1 + 1 + 1 = 7',
    },
    {
      args: [
        [
          [1, 2, 3],
          [4, 5, 6],
        ],
      ],
    },
  ],
  edgeCases: [
    [[[0]]],
    [[[5]]],
    [[[1, 2, 3]]],
    [[[4], [0], [7]]],
    [
      [
        [2, 2],
        [2, 2],
      ],
    ],
    [
      [
        [1, 1, 1],
        [2, 9, 9],
        [1, 1, 1],
      ],
    ],
    [
      [
        [0, 200, 0],
        [0, 200, 0],
        [0, 0, 0],
      ],
    ],
    [
      [
        [3, 0, 0, 9],
        [9, 9, 0, 9],
        [9, 9, 0, 0],
      ],
    ],
  ],
  randomCase: (rand) => {
    const cols = randInt(rand, 1, 6);
    return [Array.from({ length: randInt(rand, 1, 6) }, () => ints(rand, cols, 0, 9))];
  },
  // A grid of about 200 × 200: walking every path without a memo meets astronomically many of them.
  performanceCase: (rand) => {
    const cols = randInt(rand, 190, 200);
    return [Array.from({ length: randInt(rand, 190, 200) }, () => ints(rand, cols, 0, 200))];
  },
  solve(grid: number[][]) {
    const best = Array<number>(grid[0].length).fill(Infinity);
    best[0] = 0;
    for (const row of grid) row.forEach((cost, c) => (best[c] = cost + Math.min(best[c], c > 0 ? best[c - 1] : Infinity)));
    return best[best.length - 1];
  },
  approach:
    'A path enters a cell from above or from the left, so the cheapest path to it costs the cell plus the cheaper of those two; the top row and the left column have only one way in. Fill the costs row by row and keep one row: the cell above is the old value in the same column. Walking every path without a memo is exponential, and always stepping to the cheaper neighbor can miss the best path.',
  complexity: { time: 'O(m·n)', space: 'O(n) with one row' },
};

export const maximalSquare: CodingProblemDefinition = {
  statement: [
    "`matrix` is a grid of `'0'` and `'1'` characters. Return the area of the largest square, with sides along the rows and columns, whose cells are all `'1'`.",
    "If there is no `'1'`, the answer is 0; a single `'1'` is a square of area 1.",
  ],
  constraints: ['1 ≤ m, n ≤ 300, for an m × n grid', "matrix[i][j] is '0' or '1'"],
  entry: 'maximalSquare',
  params: [{ name: 'matrix', type: 'char[][]' }],
  returns: 'int',
  compare: 'exact',
  examples: [
    {
      args: [
        [
          ['1', '0', '1', '0', '0'],
          ['1', '0', '1', '1', '1'],
          ['1', '1', '1', '1', '1'],
          ['1', '0', '0', '1', '0'],
        ],
      ],
      explanation: 'The 2 × 2 square in rows 2 and 3, columns 3 and 4 (counting from 1), has area 4',
    },
    {
      args: [
        [
          ['0', '1'],
          ['1', '0'],
        ],
      ],
    },
    { args: [[['0']]] },
  ],
  edgeCases: [
    [[['1']]],
    [[['0', '0', '0']]],
    [[['1', '1', '1']]],
    [[['1'], ['1']]],
    [
      [
        ['0', '1'],
        ['1', '1'],
      ],
    ],
    [
      [
        ['1', '1'],
        ['1', '1'],
      ],
    ],
    [
      [
        ['1', '1', '1', '1'],
        ['1', '1', '1', '1'],
        ['1', '1', '1', '1'],
      ],
    ],
    [
      [
        ['1', '1', '1'],
        ['1', '0', '1'],
        ['1', '1', '1'],
      ],
    ],
    [
      [
        ['0', '1', '1', '1'],
        ['1', '1', '1', '1'],
        ['1', '1', '1', '0'],
        ['1', '1', '1', '1'],
      ],
    ],
  ],
  randomCase: (rand) => {
    const cols = randInt(rand, 1, 6);
    return [Array.from({ length: randInt(rand, 1, 6) }, () => Array.from({ length: cols }, () => (rand() < 0.7 ? '1' : '0')))];
  },
  // A 300 × 300 grid of '1' with a '0' in some of its corners, which only squares touching that corner contain: growing
  // a square from every cell and checking all its cells at each size takes over 5·10^10 cell checks, and checking only
  // the new row and column at each size still takes over 10^9, too many for browser Python.
  performanceCase: (rand) => {
    const matrix = Array.from({ length: 300 }, () => Array<string>(300).fill('1'));
    for (const [r, c] of shuffle(rand, [
      [0, 0],
      [0, 299],
      [299, 0],
      [299, 299],
    ]).slice(0, randInt(rand, 1, 4)))
      matrix[r][c] = '0';
    return [matrix];
  },
  solve(matrix: string[][]) {
    const cols = matrix[0].length;
    let above = new Int32Array(cols + 1);
    let side = 0;
    for (const row of matrix) {
      const here = new Int32Array(cols + 1);
      for (let c = 1; c <= cols; c++)
        if (row[c - 1] === '1') {
          here[c] = 1 + Math.min(above[c], above[c - 1], here[c - 1]);
          side = Math.max(side, here[c]);
        }
      above = here;
    }
    return side * side;
  },
  approach:
    "Let `side[r][c]` be the side of the largest all-`'1'` square whose bottom-right corner is cell `(r, c)`. For a `'1'` cell it is one more than the smallest of the values above, to the left and diagonally up-left, since the square can grow only as far as all three allow; a `'0'` cell has 0. Fill it row by row, keeping two rows, and return the largest side squared. Growing a square from every cell is far slower.",
  complexity: { time: 'O(m·n)', space: 'O(n) with two rows' },
};

export const maxCoins: CodingProblemDefinition = {
  statement: [
    'Balloons stand in a row, and `nums[i]` is the number on balloon `i`. You burst them one at a time, in any order you choose, until none are left.',
    'Bursting a balloon earns its number times the numbers of its nearest unburst neighbors on each side; a side with no balloon left counts as 1. Return the most coins that bursting every balloon can earn.',
  ],
  constraints: ['1 ≤ nums.length ≤ 200', '0 ≤ nums[i] ≤ 100'],
  entry: 'maxCoins',
  params: [{ name: 'nums', type: 'int[]' }],
  returns: 'int',
  compare: 'exact',
  examples: [
    {
      args: [[3, 1, 5, 8]],
      explanation: 'Burst 1, then 5, then 3, then 8: 3·1·5 + 3·5·8 + 1·3·8 + 1·8·1 = 15 + 120 + 24 + 8 = 167',
    },
    { args: [[1, 5]], explanation: 'Burst 1 first for 1·1·5, then 5 for 1·5·1' },
  ],
  edgeCases: [[[7]], [[0]], [[0, 0, 0]], [[5, 5, 5]], [[1, 2, 3]], [[9, 1, 1, 9]], [[2, 0, 3]], [[100, 100]], [[4, 1, 7, 1, 4]]],
  randomCase: (rand) => [ints(rand, randInt(rand, 1, 7), 0, 9)],
  // About 200 balloons: trying burst orders, or memoizing on the set of balloons left, is exponential.
  performanceCase: (rand) => [ints(rand, randInt(rand, 190, 200), 0, 100)],
  solve(nums: number[]) {
    const vals = [1, ...nums, 1];
    const n = vals.length;
    const best = Array.from({ length: n }, () => new Float64Array(n));
    for (let left = n - 3; left >= 0; left--)
      for (let right = left + 2; right < n; right++) {
        const edge = vals[left] * vals[right];
        let top = 0;
        for (let k = left + 1; k < right; k++) top = Math.max(top, best[left][k] + best[k][right] + edge * vals[k]);
        best[left][right] = top;
      }
    return best[0][n - 1];
  },
  approach:
    'Pad the row with a 1 at each end, in `vals`. Think about the balloon burst last between two balloons that stay, at `l` and `r`: when it goes, its neighbors are exactly those two, and the balloons on either side of it were burst independently. So `best[l][r]`, the most coins from bursting everything strictly between them, is the largest `best[l][k] + best[k][r]` plus `vals[l]·vals[k]·vals[r]` over each `k` between them; fill it for shorter gaps first. Choosing which balloon bursts first does not split the row this way, and trying every order is exponential.',
  complexity: { time: 'O(n³)', space: 'O(n²)' },
};

export const jumpGameII: CodingProblemDefinition = {
  statement: [
    '`nums[i]` is the longest jump you can make forward from index `i`; any shorter jump works too. You start at index 0.',
    'Return the fewest jumps that reach the last index. The last index is always reachable, and with a single element the answer is 0.',
  ],
  constraints: ['1 ≤ nums.length ≤ 2·10^5', '0 ≤ nums[i] ≤ 10^5', 'the last index is reachable'],
  entry: 'jump',
  params: [{ name: 'nums', type: 'int[]' }],
  returns: 'int',
  compare: 'exact',
  examples: [
    { args: [[2, 3, 1, 1, 4]], explanation: 'Jump 1 step to index 1, then 3 steps to the last index' },
    { args: [[2, 3, 0, 1, 4]] },
  ],
  edgeCases: [
    [[0]],
    [[1, 0]],
    [[5, 0, 0]],
    [[1, 1, 1, 1]],
    [[3, 2, 1, 2, 1, 1]],
    [[1, 2, 1, 1, 1]],
    [[2, 1, 3, 1, 1, 0]],
    [[4, 1, 1, 3, 1, 1, 1]],
    [[2, 2, 2, 0, 0]],
  ],
  randomCase: (rand) => {
    for (;;) {
      const nums = ints(rand, randInt(rand, 1, 10), 0, 3);
      let reach = 0;
      for (let i = 0; i < nums.length && i <= reach; i++) reach = Math.max(reach, i + nums[i]);
      if (reach >= nums.length - 1) return [nums];
    }
  },
  // Just over half the indices jump one step (a few jump two), and every later index jumps at least to the end: trying
  // every jump from each index costs over 4·10^9 steps on the second part, and finding the leftmost index that reaches
  // the current target, from the end backward, rescans the first part once per jump.
  performanceCase: (rand) => {
    const n = 200_000;
    const steps = randInt(rand, 101_000, 104_000);
    return [Array.from({ length: n }, (_, i) => (i < steps ? (rand() < 0.03 ? 2 : 1) : randInt(rand, n - 1 - i, 100_000)))];
  },
  solve(nums: number[]) {
    let jumps = 0;
    let end = 0;
    let far = 0;
    for (let i = 0; i < nums.length - 1; i++) {
      far = Math.max(far, i + nums[i]);
      if (i === end) {
        jumps++;
        end = far;
      }
    }
    return jumps;
  },
  approach:
    'Think in rounds, like a breadth-first search: the indices reachable with `j` jumps form a range, and the next range ends at the farthest index any of them can reach. Scan once, tracking `end`, the end of the current range, and `far`, the farthest reach seen; on reaching `end`, count a jump and move `end` to `far`. Stop before the last index. Relaxing every jump from every index is quadratic.',
  complexity: { time: 'O(n)', space: 'O(1)' },
};

export const minRefuelStops: CodingProblemDefinition = {
  statement: [
    'A car starts at position 0 with `startFuel` liters of fuel and drives east to position `target`, burning one liter per mile. Its tank holds any amount.',
    'Each `stations[i]` is a pair `[position, fuel]`: a gas station that many miles east of the start, holding that many liters. When the car stops at a station, it takes all the fuel there. The stations are sorted by position, and their positions are distinct and strictly between 0 and `target`.',
    'Return the fewest stops needed to reach `target`, or -1 if it cannot be reached. Arriving at a station or at `target` with 0 liters left still counts as arriving.',
  ],
  constraints: [
    '1 ≤ target, startFuel ≤ 10^9',
    '0 ≤ stations.length ≤ 10^5',
    '0 < stations[i][0] < target, strictly increasing',
    '1 ≤ stations[i][1] ≤ 10^9',
  ],
  entry: 'minRefuelStops',
  params: [
    { name: 'target', type: 'int' },
    { name: 'startFuel', type: 'int' },
    { name: 'stations', type: 'int[][]' },
  ],
  returns: 'int',
  compare: 'exact',
  examples: [
    {
      args: [
        100,
        10,
        [
          [10, 60],
          [20, 30],
          [30, 30],
          [60, 40],
        ],
      ],
      explanation: 'Stop at 10 for 60 liters, which reaches 70, then at 60 for 40 more, which reaches 110',
    },
    { args: [1, 1, []], explanation: 'The start fuel already reaches the target' },
    { args: [100, 1, [[10, 100]]] },
  ],
  edgeCases: [
    [10, 10, []],
    [10, 9, []],
    [10, 5, [[5, 5]]],
    [10, 4, [[5, 100]]],
    [
      100,
      50,
      [
        [10, 60],
        [50, 10],
      ],
    ],
    [
      100,
      25,
      [
        [25, 25],
        [50, 25],
        [75, 25],
      ],
    ],
    [
      100,
      30,
      [
        [10, 10],
        [20, 10],
        [30, 10],
        [40, 5],
      ],
    ],
    [1_000_000_000, 1_000_000_000, [[1, 1_000_000_000]]],
  ],
  randomCase: (rand) => {
    const count = randInt(rand, 0, 7);
    const target = randInt(rand, count + 1, 40);
    const stations = distinctSorted(rand, count, 1, target - 1).map((position) => [position, randInt(rand, 1, 15)]);
    return [target, randInt(rand, 1, 20), stations];
  },
  // About 10^5 stations and a target hundreds of stops away: the table of the farthest reach with each number of stops,
  // updated at every station, takes over 4·10^9 steps.
  performanceCase: (rand) => {
    const target = randInt(rand, 900_000_000, 1_000_000_000);
    const positions = distinctSorted(rand, randInt(rand, 97_000, 100_000), 1, target - 1);
    const stations = positions.map((position) => [position, randInt(rand, 1, 2_000_000)]);
    return [target, randInt(rand, positions[0], 1_000_000), stations];
  },
  solve(target: number, startFuel: number, stations: number[][]) {
    const passed = new MinHeap();
    let reach = startFuel;
    let stops = 0;
    for (let i = 0; reach < target; stops++) {
      while (i < stations.length && stations[i][0] <= reach) passed.push([-stations[i][1], i++]);
      if (!passed.size) return -1;
      reach -= passed.pop()[0];
    }
    return stops;
  },
  approach:
    'Drive as far as the fuel allows and remember every station passed in a max-heap of fuel. Whenever the car cannot go farther, pretend it stopped at the passed station with the most fuel: pop it and add its fuel. When the heap is empty before the target, it cannot be reached. Stopping at the farthest station reached instead can waste stops, and a table of the farthest reach with each number of stops is quadratic.',
  complexity: { time: 'O(n log n)', space: 'O(n)' },
};
