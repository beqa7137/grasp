import { rangeOf } from '../../algorithms/input.js';
import { distinctInts, randInt, shuffle } from '../../algorithms/random.js';
import type { CodingProblemDefinition } from '../types.js';

const PHONE_LETTERS: Record<string, string> = {
  2: 'abc',
  3: 'def',
  4: 'ghi',
  5: 'jkl',
  6: 'mno',
  7: 'pqrs',
  8: 'tuv',
  9: 'wxyz',
};

const randomText = (rand: () => number, length: number, from: string) =>
  Array.from({ length }, () => from[randInt(rand, 0, from.length - 1)]).join('');

/**
 * A shuffle of 1 to n and runs of it, 2 to `longest` values long, each starting where the last one ended, so together
 * they hold every adjacent pair. With `gaps`, a run sometimes starts one later and leaves a pair, or the last value,
 * out. Then `extra` lists that each keep up to `extraLength` of its values in order, all shuffled.
 */
function reconstruction(
  rand: () => number,
  n: number,
  { longest, gaps, extra, extraLength }: { longest: number; gaps: boolean; extra: number; extraLength: number },
): [number[], number[][]] {
  const nums = shuffle(rand, rangeOf(1, n));
  const lists: number[][] = [];
  for (let start = 0; start < n - 1 || !lists.length;) {
    const end = Math.min(n, start + randInt(rand, 2, longest));
    lists.push(nums.slice(start, end));
    start = end - (gaps && rand() < 0.3 ? 0 : 1);
  }
  for (let k = 0; k < extra; k++)
    lists.push(
      distinctInts(rand, randInt(rand, 1, Math.min(n, extraLength)), 0, n - 1)
        .sort((a, b) => a - b)
        .map((i) => nums[i]),
    );
  return [nums, shuffle(rand, lists)];
}

/**
 * Pairs over the positions 0 to n - 1: `big` positions picked at random, joined into one group by a random tree, and
 * the rest in groups of 1 to 4, plus `extra` pairs that name one position twice or repeat a pair, all shuffled and
 * each written in a random direction.
 */
function swapPairs(rand: () => number, n: number, big: number, extra: number): number[][] {
  const order = shuffle(rand, rangeOf(0, n - 1));
  const pairs: number[][] = [];
  const join = (a: number, b: number) => pairs.push(rand() < 0.5 ? [a, b] : [b, a]);
  for (let i = 1; i < big; i++) join(order[randInt(rand, 0, i - 1)], order[i]);
  for (let start = big; start < n;) {
    const end = Math.min(n, start + randInt(rand, 1, 4));
    for (let i = start + 1; i < end; i++) join(order[randInt(rand, start, i - 1)], order[i]);
    start = end;
  }
  for (let k = 0; k < extra; k++) {
    const at = order[randInt(rand, 0, n - 1)];
    pairs.push(rand() < 0.5 || !pairs.length ? [at, at] : [...pairs[randInt(rand, 0, pairs.length - 1)]]);
  }
  return shuffle(rand, pairs);
}

/** `count` stones on distinct spots of a `size` × `size` grid. */
const distinctSpots = (rand: () => number, count: number, size: number) =>
  distinctInts(rand, count, 0, size * size - 1).map((spot) => [Math.floor(spot / size), spot % size]);

export const generateParentheses: CodingProblemDefinition = {
  statement: [
    'Return every well-formed string of `n` pairs of parentheses, each exactly once, in any order.',
    'A string of `(` and `)` is well formed when it has as many of each and no prefix of it has more `)` than `(`: `(())()` is well formed, and `())(()` is not, since its first three characters close more than they open.',
  ],
  constraints: ['1 ≤ n ≤ 12'],
  entry: 'generateParenthesis',
  params: [{ name: 'n', type: 'int' }],
  returns: 'string[]',
  compare: 'unordered',
  examples: [
    {
      args: [3],
      explanation: 'Five strings: ((())), (()()), (())(), ()(()) and ()()()',
    },
    { args: [1] },
  ],
  edgeCases: [[2], [4], [5], [7]],
  randomCase: (rand) => [randInt(rand, 1, 7)],
  // 208,012 answers. Building all 4^12 strings of 24 brackets and keeping the well-formed ones takes seconds.
  performanceCase: () => [12],
  solve(n: number) {
    const out: string[] = [];
    const path: string[] = [];
    const go = (open: number, closed: number) => {
      if (closed === n) {
        out.push(path.join(''));
        return;
      }
      if (open < n) {
        path.push('(');
        go(open + 1, closed);
        path.pop();
      }
      if (closed < open) {
        path.push(')');
        go(open, closed + 1);
        path.pop();
      }
    };
    go(0, 0);
    return out;
  },
  approach:
    'Backtrack one character at a time, counting the `(` and `)` placed so far: add `(` while fewer than `n` are open, and `)` only while fewer are closed than open. Every branch then ends in a well-formed string, so nothing is built and thrown away. Building all 4^n strings and filtering them is far slower.',
  complexity: { time: 'O(n · C(n)), C(n) the n-th Catalan number', space: 'O(n) plus the output' },
};

export const letterCombinations: CodingProblemDefinition = {
  statement: [
    'A phone keypad puts letters on the digits 2 to 9: 2 is abc, 3 is def, 4 is ghi, 5 is jkl, 6 is mno, 7 is pqrs, 8 is tuv and 9 is wxyz.',
    'Given `digits`, return every string made by picking one letter for each digit and writing them in the order of the digits, with the strings in any order. A digit can repeat, and so can the letter picked for it: `"22"` gives `"aa"` among others. When `digits` is empty, return an empty list, not a list holding one empty string.',
  ],
  constraints: ['0 ≤ digits.length ≤ 9', 'digits holds only the characters 2 to 9'],
  entry: 'letterCombinations',
  params: [{ name: 'digits', type: 'string' }],
  returns: 'string[]',
  compare: 'unordered',
  examples: [
    {
      args: ['23'],
      explanation: '3 letters for 2 times 3 letters for 3 make 9 strings: ad, ae, af, bd, be, bf, cd, ce and cf',
    },
    { args: ['7'] },
    { args: [''] },
  ],
  edgeCases: [['2'], ['9'], ['22'], ['79'], ['2345'], ['99999']],
  randomCase: (rand) => [randomText(rand, randInt(rand, 0, 5), '23456789')],
  // 4^9 = 262,144 strings: checking each against the ones already found, to skip a copy, is quadratic in that count.
  performanceCase: (rand) => [randomText(rand, 9, '79')],
  solve(digits: string) {
    if (!digits) return [];
    const out: string[] = [];
    const path: string[] = [];
    const go = (i: number) => {
      if (i === digits.length) {
        out.push(path.join(''));
        return;
      }
      for (const letter of PHONE_LETTERS[digits[i]]) {
        path.push(letter);
        go(i + 1);
        path.pop();
      }
    };
    go(0);
    return out;
  },
  approach:
    'Backtrack over the digits: at position `i` try each letter of `digits[i]`, recurse to the next digit, and record the string when every digit has a letter. Building the list digit by digit, extending every string so far by each letter, works too. Start from an empty list when there are no digits, not from one empty string.',
  complexity: { time: 'O(n · 4^n)', space: 'O(n) plus the output' },
};

export const sequenceReconstruction: CodingProblemDefinition = {
  statement: [
    '`nums` is an ordering of the integers 1 to `n`, and each list in `sequences` is a subsequence of `nums`: some of its values, in the order they have there. A supersequence of `sequences` is a sequence that contains every list in `sequences` as a subsequence.',
    'Return `true` if `nums` is the only shortest supersequence of `sequences`, and `false` otherwise: when a shorter one exists, which happens when some value appears in no list, or when another one of the same length does.',
  ],
  constraints: [
    '1 ≤ n ≤ 10^5, where n = nums.length',
    'nums holds each of 1 to n exactly once',
    '1 ≤ sequences.length ≤ 10^5',
    'Every list has at least one value, and the lists hold at most 2·10^5 values in all',
    'Each list is a subsequence of nums, so its values are distinct',
  ],
  entry: 'sequenceReconstruction',
  params: [
    { name: 'nums', type: 'int[]' },
    { name: 'sequences', type: 'int[][]' },
  ],
  returns: 'bool',
  compare: 'exact',
  examples: [
    {
      args: [
        [1, 2, 3],
        [
          [1, 2],
          [1, 3],
        ],
      ],
      explanation: 'Both 1, 2, 3 and 1, 3, 2 contain each list, so the shortest supersequence is not unique',
    },
    {
      args: [[1, 2, 3], [[1, 2]]],
      explanation: '1, 2 is a supersequence too, and it is shorter than nums',
    },
    {
      args: [
        [1, 2, 3],
        [
          [1, 2],
          [1, 3],
          [2, 3],
        ],
      ],
      explanation: '1 comes before 2 and 2 before 3, so 1, 2, 3 is the only order of all three values that fits',
    },
  ],
  edgeCases: [
    [[1], [[1]]],
    [[2, 1], [[2, 1]]],
    [
      [2, 1],
      [[2], [1]],
    ],
    [[1, 2, 3], [[1, 3]]],
    [[3, 1, 2], [[3, 1, 2]]],
    [
      [4, 1, 5, 2, 6, 3],
      [
        [5, 2, 6, 3],
        [4, 1, 5, 2],
      ],
    ],
    [
      [4, 1, 5, 2, 6, 3],
      [
        [4, 1, 5],
        [2, 6, 3],
        [4, 2],
        [1, 6],
      ],
    ],
  ],
  randomCase: (rand) =>
    reconstruction(rand, randInt(rand, 1, 7), { longest: 4, gaps: rand() < 0.5, extra: randInt(rand, 0, 3), extraLength: 4 }),
  // Scanning every value for the next one with nothing left before it, at each of 10^5 steps, takes 5·10^9 checks.
  performanceCase: (rand) => reconstruction(rand, 100_000, { longest: 4, gaps: false, extra: 1_000, extraLength: 30 }),
  solve(nums: number[], sequences: number[][]) {
    const n = nums.length;
    const following: number[][] = Array.from({ length: n + 1 }, () => []);
    const before = Array<number>(n + 1).fill(0);
    for (const list of sequences)
      for (let i = 1; i < list.length; i++) {
        following[list[i - 1]].push(list[i]);
        before[list[i]]++;
      }
    let ready = rangeOf(1, n).filter((value) => before[value] === 0);
    for (const value of nums) {
      if (ready.length !== 1 || ready[0] !== value) return false;
      ready = [];
      for (const next of following[value]) if (--before[next] === 0) ready.push(next);
    }
    return true;
  },
  approach:
    "Topological sort: each adjacent pair in a list is an edge saying which value comes first. Run Kahn's algorithm and require exactly one value with no incoming edge left at every step, and that it is the next value of `nums`; two ready values could go either way. Equivalently, every adjacent pair of `nums` must appear next to each other in some list.",
  complexity: { time: 'O(n + L) for L values in the lists', space: 'O(n + L)' },
};

export const smallestStringWithSwaps: CodingProblemDefinition = {
  statement: [
    '`s` is a string of lowercase letters, and each `pairs[i] = [a, b]` names two positions of it, counted from 0. You may swap the letters at the two positions of any pair, as many times as you like and in any order.',
    'Return the lexicographically smallest string you can reach. A pair can repeat, and its two positions can be the same, which lets it change nothing.',
  ],
  constraints: ['1 ≤ s.length ≤ 10^5', '0 ≤ pairs.length ≤ 10^5', '0 ≤ a, b < s.length', 's holds only lowercase English letters'],
  entry: 'smallestStringWithSwaps',
  params: [
    { name: 's', type: 'string' },
    { name: 'pairs', type: 'int[][]' },
  ],
  returns: 'string',
  compare: 'exact',
  examples: [
    {
      args: [
        'dcab',
        [
          [0, 3],
          [1, 2],
        ],
      ],
      explanation: 'Swapping positions 0 and 3 gives bcad, then swapping 1 and 2 gives bacd',
    },
    {
      args: [
        'dcab',
        [
          [0, 3],
          [1, 2],
          [0, 2],
        ],
      ],
      explanation: 'The pairs link all four positions, so the letters can be put in any order',
    },
    {
      args: [
        'cba',
        [
          [0, 1],
          [1, 2],
        ],
      ],
    },
  ],
  edgeCases: [
    ['z', []],
    ['zyx', []],
    [
      'ba',
      [
        [1, 1],
        [0, 0],
      ],
    ],
    [
      'ba',
      [
        [1, 0],
        [0, 1],
      ],
    ],
    [
      'acb',
      [
        [0, 1],
        [0, 2],
      ],
    ],
    [
      'dcba',
      [
        [0, 3],
        [3, 1],
      ],
    ],
    [
      'aaa',
      [
        [0, 2],
        [2, 1],
      ],
    ],
  ],
  randomCase: (rand) => {
    const n = randInt(rand, 1, 7);
    return [
      randomText(rand, n, 'abcd'),
      Array.from({ length: randInt(rand, 0, 6) }, () => [randInt(rand, 0, n - 1), randInt(rand, 0, n - 1)]),
    ];
  },
  // One group holds 80,000 positions: a separate search from every position to gather its group visits 6.4·10^9.
  performanceCase: (rand) => [randomText(rand, 100_000, 'abcdefghijklmnopqrstuvwxyz'), swapPairs(rand, 100_000, 80_000, 2_000)],
  solve(s: string, pairs: number[][]) {
    const parent = rangeOf(0, s.length - 1);
    const find = (x: number): number => {
      while (parent[x] !== x) x = parent[x] = parent[parent[x]];
      return x;
    };
    for (const [a, b] of pairs) parent[find(a)] = find(b);
    const groups = new Map<number, number[]>();
    for (let i = 0; i < s.length; i++) {
      const root = find(i);
      const group = groups.get(root);
      if (group) group.push(i);
      else groups.set(root, [i]);
    }
    const out = Array<string>(s.length);
    for (const positions of groups.values()) {
      const letters = positions.map((i) => s[i]).sort();
      positions.forEach((position, k) => (out[position] = letters[k]));
    }
    return out.join('');
  },
  approach:
    "Swaps chain: when pairs link positions into a group, swaps along those links can put the group's letters in any order. Union the two positions of each pair, then sort the letters of each group and hand them out to its positions in increasing order. Swapping a pair only while it helps can get stuck.",
  complexity: { time: 'O((n + p)·α(n) + n log n) for p pairs', space: 'O(n)' },
};

export const mostStonesRemoved: CodingProblemDefinition = {
  statement: [
    'Each `stones[i] = [x, y]` is a stone on row `x` and column `y` of a grid, and no two stones share a spot.',
    'One at a time, you may remove a stone that shares its row or its column with another stone still on the grid. Return the largest number of stones you can remove.',
  ],
  constraints: [
    '1 ≤ stones.length ≤ 10^5',
    '0 ≤ x, y ≤ 10^4',
    'no two stones share a spot',
    'Stones linked by rows and columns can chain through all 10^5 of them, too deep for a recursive DFS',
  ],
  entry: 'removeStones',
  params: [{ name: 'stones', type: 'int[][]' }],
  returns: 'int',
  compare: 'exact',
  examples: [
    {
      args: [
        [
          [0, 0],
          [0, 1],
          [1, 0],
          [1, 2],
          [2, 1],
          [2, 2],
        ],
      ],
      explanation:
        'All six stones are linked through shared rows and columns. Remove [2,2], [2,1], [1,2], [1,0] and [0,1] in that order, each still sharing a line with another, and [0,0] stays',
    },
    {
      args: [
        [
          [0, 0],
          [0, 2],
          [1, 1],
          [2, 0],
          [2, 2],
        ],
      ],
      explanation: '[1,1] shares no line with any stone, and the other four form one linked group that can go down to one stone',
    },
    { args: [[[0, 0]]] },
  ],
  edgeCases: [
    [
      [
        [0, 1],
        [1, 0],
      ],
    ],
    [
      [
        [0, 0],
        [1, 1],
        [2, 2],
      ],
    ],
    [
      [
        [0, 0],
        [0, 5],
        [0, 9],
      ],
    ],
    [
      [
        [10_000, 10_000],
        [0, 10_000],
        [0, 0],
      ],
    ],
    [
      [
        [3, 1],
        [1, 3],
        [3, 3],
        [0, 2],
      ],
    ],
  ],
  randomCase: (rand) => [distinctSpots(rand, randInt(rand, 1, 8), 5)],
  // Comparing every pair of stones for a shared line takes 5·10^9 checks. Most stones share one big linked group, and
  // 2,001 more sit alone on the diagonal past it.
  performanceCase: (rand) => [shuffle(rand, [...distinctSpots(rand, 97_999, 8_000), ...rangeOf(8_000, 10_000).map((i) => [i, i])])],
  solve(stones: number[][]) {
    const columns = 10_001;
    const parent = rangeOf(0, 2 * columns - 1);
    const find = (x: number): number => {
      while (parent[x] !== x) x = parent[x] = parent[parent[x]];
      return x;
    };
    for (const [x, y] of stones) parent[find(x)] = find(columns + y);
    return stones.length - new Set(stones.map(([x]) => find(x))).size;
  },
  approach:
    'Stones linked through shared rows and columns form groups, and each group can be removed down to one stone, taking leaves of a spanning tree first. So the answer is the number of stones minus the number of groups. Union each row with each column that holds a stone in it, keeping rows and columns apart, for example by adding 10,001 to a column, and count the roots among the rows used.',
  complexity: { time: 'O(n·α(n))', space: 'O(n + R + C) for R rows and C columns' },
};
