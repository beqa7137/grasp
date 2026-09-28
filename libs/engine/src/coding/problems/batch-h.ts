import { rangeOf } from '../../algorithms/input.js';
import { randInt, shuffle } from '../../algorithms/random.js';
import type { CodingProblemDefinition } from '../types.js';

const LETTERS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';

const randomWord = (rand: () => number, alphabet: string, length: number) =>
  Array.from({ length }, () => alphabet[randInt(rand, 0, alphabet.length - 1)]).join('');

/** A matrix whose rows and columns never decrease: each cell is the larger of its top and left neighbors plus up to `step`. */
function sortedMatrix(rand: () => number, n: number, first: number, step: number): number[][] {
  const matrix = rangeOf(0, n - 1).map(() => Array<number>(n).fill(first));
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (r || c) matrix[r][c] = Math.max(r ? matrix[r - 1][c] : -Infinity, c ? matrix[r][c - 1] : -Infinity) + randInt(rand, 0, step);
  return matrix;
}

/** The number of words on the shortest ladder from `beginWord` to each list word it reaches, `beginWord` counting as 1. */
export function ladderLengths(beginWord: string, wordList: string[]): Map<string, number> {
  // A word is a base-27 number whose digits are its letters, 1 to 26, and zeroing one digit gives the pattern with a
  // wildcard there. Numbers hash twice as fast as pattern strings, and ten digits stay below 2^53.
  const patterns = (word: string) => {
    const code = [...word].reduce((sum, letter) => sum * 27 + letter.charCodeAt(0) - 96, 0);
    const out: number[] = [];
    for (let i = word.length - 1, weight = 1; i >= 0; i--, weight *= 27) out.push(code - (word.charCodeAt(i) - 96) * weight);
    return out;
  };
  const buckets = new Map<number, string[]>();
  for (const word of wordList)
    for (const pattern of patterns(word)) {
      const bucket = buckets.get(pattern);
      if (bucket) bucket.push(word);
      else buckets.set(pattern, [word]);
    }
  const length = new Map([[beginWord, 1]]);
  for (const [word, words] of length)
    for (const pattern of patterns(word)) {
      for (const next of buckets.get(pattern) ?? []) if (!length.has(next)) length.set(next, words + 1);
      buckets.delete(pattern);
    }
  length.delete(beginWord);
  return length;
}

export const minArrowsBalloons: CodingProblemDefinition = {
  statement: [
    'Each `points[i]` is `[start, end]`, a balloon spanning every x from `start` to `end`. An arrow shot straight up at x bursts every balloon with `start <= x <= end`, so touching a balloon at one of its ends bursts it too.',
    'Return the fewest arrows that burst every balloon. Balloons can repeat, a balloon can have `start == end`, and the input is in no particular order.',
  ],
  constraints: ['1 ≤ points.length ≤ 10^5', '-10^9 ≤ start ≤ end ≤ 10^9'],
  entry: 'findMinArrowShots',
  params: [{ name: 'points', type: 'int[][]' }],
  returns: 'int',
  compare: 'exact',
  examples: [
    {
      args: [
        [
          [10, 16],
          [2, 8],
          [1, 6],
          [7, 12],
        ],
      ],
      explanation: 'An arrow at 6 bursts [2,8] and [1,6], and one at 11 bursts [10,16] and [7,12]',
    },
    {
      args: [
        [
          [1, 2],
          [3, 4],
          [5, 6],
          [7, 8],
        ],
      ],
      explanation: 'No two balloons share an x, so each needs its own arrow',
    },
    {
      args: [
        [
          [1, 2],
          [2, 3],
          [3, 4],
          [4, 5],
        ],
      ],
      explanation: 'Arrows at 2 and 4 each burst two balloons that touch there',
    },
  ],
  edgeCases: [
    [[[5, 5]]],
    [
      [
        [1, 2],
        [2, 3],
      ],
    ],
    [
      [
        [3, 3],
        [3, 3],
        [4, 4],
      ],
    ],
    [
      [
        [1, 10],
        [2, 3],
        [4, 5],
      ],
    ],
    [
      [
        [0, 9],
        [1, 2],
        [3, 8],
        [4, 5],
        [6, 7],
      ],
    ],
    [
      [
        [-1000000000, 1000000000],
        [1000000000, 1000000000],
        [-1000000000, -1000000000],
      ],
    ],
    [
      [
        [4, 6],
        [-3, 0],
        [0, 4],
        [-8, -3],
      ],
    ],
  ],
  randomCase: (rand) => [
    Array.from({ length: randInt(rand, 1, 8) }, () => {
      const start = randInt(rand, -6, 6);
      return [start, start + randInt(rand, 0, 5)];
    }),
  ],
  // About 98,000 balloons in separate slots, with a few thousand more overlapping them or reaching into the next slot:
  // nearly every arrow bursts one balloon, so shooting one at a time and filtering the rest out of the list is quadratic.
  performanceCase: (rand) => {
    const slots = 98_000;
    const slot = (k: number) => -1_000_000_000 + 20_000 * k;
    const balloons = rangeOf(0, slots - 1).map((k) => [slot(k), slot(k) + randInt(rand, 0, 9_000)]);
    while (balloons.length < 100_000) {
      const base = slot(randInt(rand, 0, slots - 2));
      balloons.push([base + randInt(rand, 0, 9_000), base + 9_000 + randInt(rand, 0, 20_000)]);
    }
    return [shuffle(rand, balloons)];
  },
  solve(points: number[][]) {
    const sorted = [...points].sort((a, b) => a[1] - b[1]);
    let arrows = 0;
    let at = -Infinity;
    for (const [start, end] of sorted)
      if (start > at) {
        arrows++;
        at = end;
      }
    return arrows;
  },
  approach:
    'Sort by end and shoot the first arrow at the smallest end: some arrow must burst that balloon, and moving it right to that end still bursts it while hitting as many others as possible. Skip every balloon that starts at or before the arrow, and shoot the next arrow at the end of the first balloon that starts after it.',
  complexity: { time: 'O(n log n)', space: 'O(n) for the sorted copy' },
};

export const taskScheduler: CodingProblemDefinition = {
  statement: [
    'Each letter in `tasks` is one task, and equal letters are tasks of the same kind. In each unit of time the CPU runs one task or sits idle, and it can run the tasks in any order.',
    'After a task runs in unit `t`, no task of the same kind can run before unit `t + n + 1`: at least `n` units, busy or idle, separate them. Return the fewest units that run every task.',
    'The answer can reach about 2·10^9 units, so skip over idle stretches instead of stepping through them one unit at a time.',
  ],
  constraints: ['1 ≤ tasks.length ≤ 10^5', 'tasks[i] is an uppercase letter from A to Z', '0 ≤ n ≤ 2·10^4'],
  entry: 'leastInterval',
  params: [
    { name: 'tasks', type: 'string[]' },
    { name: 'n', type: 'int' },
  ],
  returns: 'int',
  compare: 'exact',
  examples: [
    { args: [['A', 'A', 'A', 'B', 'B', 'B'], 2], explanation: 'A B idle A B idle A B: each A runs three units after the one before' },
    { args: [['A', 'C', 'A', 'B', 'D', 'B'], 1], explanation: 'A B A B C D never idles' },
    { args: [['A', 'A', 'A', 'B', 'B', 'B'], 3], explanation: 'A B idle idle A B idle idle A B' },
  ],
  edgeCases: [
    [['A'], 0],
    [['A'], 20_000],
    [['A', 'A'], 0],
    [['Z', 'Z'], 20_000],
    [['A', 'B', 'C', 'D', 'A'], 1],
    [['A', 'A', 'B', 'B'], 1],
    [['B', 'A', 'B', 'A'], 3],
    [['A', 'A', 'B', 'B', 'C', 'C'], 1],
    [['A', 'A', 'A', 'A', 'B', 'C', 'D', 'E', 'F', 'G'], 2],
    [['C', 'C', 'C', 'A', 'B', 'A', 'B', 'D', 'E'], 2],
  ],
  randomCase: (rand) => [Array.from({ length: randInt(rand, 1, 8) }, () => 'ABC'[randInt(rand, 0, 2)]), randInt(rand, 0, 3)],
  // One to three kinds share the top count of about 90,000 and n is near 2·10^4, so the answer passes 5·10^8 units:
  // stepping through them one at a time is too slow even before looking at the 26 kinds in each.
  performanceCase: (rand) => {
    const kinds = shuffle(rand, [...LETTERS]);
    const tied = randInt(rand, 1, 3);
    const most = Math.floor(randInt(rand, 85_000, 90_000) / tied);
    const tasks = kinds.slice(0, tied).flatMap((kind) => Array<string>(most).fill(kind));
    while (tasks.length < 100_000) tasks.push(kinds[randInt(rand, tied, kinds.length - 1)]);
    return [shuffle(rand, tasks), randInt(rand, 18_000, 20_000)];
  },
  solve(tasks: string[], n: number) {
    const counts = Array<number>(26).fill(0);
    for (const task of tasks) counts[task.charCodeAt(0) - 65]++;
    const most = Math.max(...counts);
    const tied = counts.filter((count) => count === most).length;
    return Math.max(tasks.length, (most - 1) * (n + 1) + tied);
  },
  approach:
    'Only the most frequent kind forces idling. With `m` copies it needs `m - 1` blocks of `n + 1` units, then one more unit for each kind that also has `m` copies: `(m - 1)(n + 1) + ties`. The other tasks fill the idle slots, and if they overflow them nothing ever idles, so the answer is the larger of that and the number of tasks. Stepping through the units one at a time is too slow when `n` is large.',
  complexity: { time: 'O(tasks.length)', space: 'O(1): 26 counts' },
};

export const kthSmallestSortedMatrix: CodingProblemDefinition = {
  statement: [
    '`matrix` is n × n, and every row and every column is sorted in non-decreasing order. Return the `k`-th smallest value in it, counting duplicates: the value at index `k - 1` if all n² values were sorted.',
    'Try doing it without sorting all n² values.',
  ],
  constraints: ['1 ≤ n ≤ 300', '1 ≤ k ≤ n²', '-10^9 ≤ matrix[r][c] ≤ 10^9'],
  entry: 'kthSmallest',
  params: [
    { name: 'matrix', type: 'int[][]' },
    { name: 'k', type: 'int' },
  ],
  returns: 'int',
  compare: 'exact',
  examples: [
    {
      args: [
        [
          [1, 5, 9],
          [10, 11, 13],
          [12, 13, 15],
        ],
        8,
      ],
      explanation: 'In order the values are 1, 5, 9, 10, 11, 12, 13, 13, 15, so the 8th is the second 13',
    },
    { args: [[[-5]], 1] },
  ],
  edgeCases: [
    [[[7]], 1],
    [
      [
        [1, 2],
        [1, 3],
      ],
      2,
    ],
    [
      [
        [1, 1],
        [1, 2],
      ],
      3,
    ],
    [
      [
        [2, 2],
        [2, 2],
      ],
      4,
    ],
    [
      [
        [1, 10],
        [10, 20],
      ],
      1,
    ],
    [
      [
        [-1000000000, 1000000000],
        [1000000000, 1000000000],
      ],
      2,
    ],
    [
      [
        [1, 3, 5],
        [2, 4, 6],
        [3, 5, 7],
      ],
      5,
    ],
    [
      [
        [-9, -3, 0],
        [-8, -3, 4],
        [-8, 1, 9],
      ],
      9,
    ],
  ],
  randomCase: (rand) => {
    const n = randInt(rand, 1, 5);
    return [sortedMatrix(rand, n, randInt(rand, -6, 6), randInt(rand, 0, 3)), randInt(rand, 1, n * n)];
  },
  // Picking the smallest remaining value with a scan of the whole matrix, k times, takes over 5·10^9 steps.
  performanceCase: (rand) => [sortedMatrix(rand, 300, -1_000_000_000, 3_000_000), randInt(rand, 60_000, 80_000)],
  solve(matrix: number[][], k: number) {
    const n = matrix.length;
    const atMost = (value: number) => {
      let count = 0;
      for (let r = n - 1, c = 0; r >= 0 && c < n;)
        if (matrix[r][c] <= value) {
          count += r + 1;
          c++;
        } else r--;
      return count;
    };
    let lo = matrix[0][0];
    let hi = matrix[n - 1][n - 1];
    while (lo < hi) {
      const mid = Math.floor((lo + hi) / 2);
      if (atMost(mid) >= k) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  },
  approach:
    "Binary search on the value. To count the values `<= mid`, walk a staircase from the bottom-left corner: when the cell fits, its whole column above it does too, so add them and step right; otherwise step up. The smallest value with a count of at least `k` is the answer, and it is always in the matrix. A min-heap of each row's next value, popped `k` times, also works.",
  complexity: { time: 'O(n log R), R the range of values', space: 'O(1)' },
};

export const wordLadder: CodingProblemDefinition = {
  statement: [
    'A ladder from `beginWord` to `endWord` is a sequence of words in which each word differs from the one before it in exactly one position, and every word after `beginWord` is in `wordList`. `beginWord` itself need not be in the list.',
    'Return the number of words in the shortest ladder, counting both ends, or 0 if there is none; there is none when `endWord` is not in `wordList`.',
    'All the words have the same length and hold lowercase letters. The words in `wordList` are distinct, and `beginWord` differs from `endWord`.',
  ],
  constraints: [
    '1 ≤ beginWord.length ≤ 10',
    '1 ≤ wordList.length ≤ 5·10^4',
    'every word has the length of beginWord',
    'lowercase letters',
    'wordList words are distinct',
    'beginWord ≠ endWord',
  ],
  entry: 'ladderLength',
  params: [
    { name: 'beginWord', type: 'string' },
    { name: 'endWord', type: 'string' },
    { name: 'wordList', type: 'string[]' },
  ],
  returns: 'int',
  compare: 'exact',
  examples: [
    { args: ['hit', 'cog', ['hot', 'dot', 'dog', 'lot', 'log', 'cog']], explanation: 'hit, hot, dot, dog, cog: five words' },
    { args: ['hit', 'cog', ['hot', 'dot', 'dog', 'lot', 'log']], explanation: 'cog is not in the list, so no ladder ends there' },
  ],
  edgeCases: [
    ['a', 'c', ['a', 'b', 'c']],
    ['hot', 'dot', ['dot']],
    ['hot', 'dog', ['dot']],
    ['ab', 'cd', ['ad', 'cd']],
    ['aaa', 'bbb', ['bbb', 'abb']],
    ['hit', 'cog', ['hot', 'lot', 'dot', 'log', 'dog', 'cog']],
    ['hit', 'cog', ['cog', 'hit', 'hot', 'dot', 'dog']],
    ['abcdefghij', 'abcdefghik', ['abcdefghik']],
    ['red', 'tax', ['ted', 'tex', 'red', 'tax', 'tad', 'den', 'rex', 'pee']],
  ],
  randomCase: (rand) => {
    const length = randInt(rand, 1, 3);
    const words = new Set<string>();
    const count = randInt(rand, 1, Math.min(10, 3 ** length));
    while (words.size < count) words.add(randomWord(rand, 'abc', length));
    const wordList = [...words];
    const beginWord = randomWord(rand, 'abc', length);
    const ends = (rand() < 0.8 ? wordList : [randomWord(rand, 'abc', length)]).filter((word) => word !== beginWord);
    const endWord = ends.length ? ends[randInt(rand, 0, ends.length - 1)] : (beginWord[0] === 'a' ? 'b' : 'a') + beginWord.slice(1);
    return [beginWord, endWord, wordList];
  },
  // 5·10^4 random four-letter words, about 11 neighbors each, ending at the word farthest from the start: a BFS that
  // compares each word it takes off the queue with every word not yet reached makes about 4·10^8 comparisons.
  performanceCase: (rand) => {
    const words = new Set<string>();
    while (words.size < 50_000) words.add(randomWord(rand, 'abcdefghijklmnopqrstuvwxyz', 4));
    let beginWord = randomWord(rand, 'abcdefghijklmnopqrstuvwxyz', 4);
    while (words.has(beginWord)) beginWord = randomWord(rand, 'abcdefghijklmnopqrstuvwxyz', 4);
    const wordList = shuffle(rand, [...words]);
    const lengths = ladderLengths(beginWord, wordList);
    const farthest = [...lengths.values()].reduce((a, b) => Math.max(a, b), 0);
    const ends = [...lengths].filter(([, length]) => length === farthest).map(([word]) => word);
    return [beginWord, ends[randInt(rand, 0, ends.length - 1)], wordList];
  },
  solve(beginWord: string, endWord: string, wordList: string[]) {
    return ladderLengths(beginWord, wordList).get(endWord) ?? 0;
  },
  approach:
    "BFS from `beginWord`, one ladder length per level. Find a word's neighbors by changing each position to each other letter and checking a set of the list, or by grouping the list under patterns such as `h*t`, and take a word out of the set when it is first queued. BFS reaches words in order of ladder length, so the level where `endWord` first appears is the answer. Comparing each word with the whole list instead is quadratic in the list length.",
  complexity: { time: 'O(N · L · 26), N words of length L', space: 'O(N · L)' },
};

/** A 500 × 500 grid of 1s with a band of 0s 30 to 50 cells deep, ragged at its inner edge, along one random side. */
function zeroBand(rand: () => number): number[][] {
  const side = 500;
  const depth = rangeOf(0, side - 1).map(() => randInt(rand, 30, 50));
  const grid = rangeOf(0, side - 1).map((r) => rangeOf(0, side - 1).map((c) => (r < depth[c] ? 0 : 1)));
  const turned = rand() < 0.5 ? grid : grid.map((_, r) => grid.map((row) => row[r]));
  return rand() < 0.5 ? turned : turned.reverse();
}

export const zeroOneMatrix: CodingProblemDefinition = {
  statement: [
    '`mat` holds only 0s and 1s, with at least one 0. Return a grid of the same size where each cell holds the distance from that cell to the nearest 0 in `mat`, counting steps between cells that share a side. A 0 is at distance 0 from itself.',
  ],
  constraints: ['1 ≤ rows, cols ≤ 500', 'mat[r][c] is 0 or 1', 'at least one cell is 0'],
  entry: 'updateMatrix',
  params: [{ name: 'mat', type: 'int[][]' }],
  returns: 'int[][]',
  compare: 'exact',
  examples: [
    {
      args: [
        [
          [0, 0, 0],
          [0, 1, 0],
          [1, 1, 1],
        ],
      ],
      explanation: 'The bottom middle cell has only 1s beside it; the nearest 0 is two steps away, up twice or left then up',
    },
    { args: [[[0], [1], [1]]], explanation: 'The column counts down from the 0 at the top: 0, 1, 2' },
  ],
  edgeCases: [
    [[[0]]],
    [[[0, 0, 0]]],
    [[[1, 1, 1, 1, 0]]],
    [[[1], [1], [0], [1]]],
    [
      [
        [0, 1],
        [1, 1],
      ],
    ],
    [
      [
        [1, 1, 1],
        [1, 1, 1],
        [1, 1, 0],
      ],
    ],
    [
      [
        [1, 1, 1],
        [1, 0, 1],
        [1, 1, 1],
      ],
    ],
    [
      [
        [0, 1, 0, 1],
        [1, 0, 1, 0],
        [0, 1, 0, 1],
      ],
    ],
    [
      [
        [1, 1, 1, 1],
        [1, 1, 1, 1],
        [0, 1, 1, 1],
        [1, 1, 1, 1],
      ],
    ],
  ],
  randomCase: (rand) => {
    const rows = randInt(rand, 1, 6);
    const cols = randInt(rand, 1, 6);
    const density = rand() * 0.5;
    const mat = rangeOf(0, rows - 1).map(() => rangeOf(0, cols - 1).map(() => (rand() < density ? 0 : 1)));
    mat[randInt(rand, 0, rows - 1)][randInt(rand, 0, cols - 1)] = 0;
    return [mat];
  },
  // About 20,000 0s against 230,000 1s that are up to 470 steps from them: measuring every 1 against every 0, or running
  // a BFS from each 1 until it meets a 0, takes billions of steps.
  performanceCase: (rand) => [zeroBand(rand)],
  solve(mat: number[][]) {
    const rows = mat.length;
    const cols = mat[0].length;
    const distance = mat.map((row) => row.map((cell): number => (cell ? -1 : 0)));
    const queue: number[] = [];
    for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) if (!mat[r][c]) queue.push(r * cols + c);
    for (let head = 0; head < queue.length; head++) {
      const r = Math.floor(queue[head] / cols);
      const c = queue[head] % cols;
      for (const [y, x] of [
        [r - 1, c],
        [r + 1, c],
        [r, c - 1],
        [r, c + 1],
      ])
        if (y >= 0 && y < rows && x >= 0 && x < cols && distance[y][x] < 0) {
          distance[y][x] = distance[r][c] + 1;
          queue.push(y * cols + x);
        }
    }
    return distance;
  },
  approach:
    'Multi-source BFS: queue every 0 at distance 0 first, then give each unvisited neighbor of a popped cell its distance plus one. All the 0s start together, so each cell is first reached from its nearest 0. Two passes of DP also work: one from the top-left using the top and left neighbors, then one from the bottom-right using the bottom and right. A separate BFS from every 1 repeats the same search over and over.',
  complexity: { time: 'O(rows · cols)', space: 'O(rows · cols)' },
};
