import { rangeOf } from '../../algorithms/input.js';
import { distinctInts, randInt, shuffle } from '../../algorithms/random.js';
import type { CodingProblemDefinition } from '../types.js';
import { ints, nearMiddle } from './inputs.js';

export const houseRobber: CodingProblemDefinition = {
  statement: ['Each house on a street holds some money. You cannot take from two adjacent houses. Return the most money you can take.'],
  constraints: ['1 ≤ nums.length ≤ 10^5', '0 ≤ nums[i] ≤ 400'],
  entry: 'rob',
  params: [{ name: 'nums', type: 'int[]' }],
  returns: 'int',
  compare: 'exact',
  examples: [{ args: [[1, 2, 3, 1]], explanation: 'Houses 0 and 2: 1 + 3 = 4' }, { args: [[2, 7, 9, 3, 1]] }],
  edgeCases: [[[0]], [[5]], [[2, 1, 1, 2]], [[4, 1]]],
  randomCase: (rand) => [ints(rand, randInt(rand, 1, 12), 0, 20)],
  performanceCase: (rand) => [ints(rand, 100_000, 0, 400)],
  solve(nums: number[]) {
    let take = 0;
    let skip = 0;
    for (const x of nums) [take, skip] = [skip + x, Math.max(take, skip)];
    return Math.max(take, skip);
  },
  approach: 'At each house keep two values, best total if you take it and if you skip it; each depends only on the previous house.',
  complexity: { time: 'O(n)', space: 'O(1)' },
};

export const longestCommonSubsequence: CodingProblemDefinition = {
  statement: [
    'Return the length of the longest sequence of characters that appears, in order but not necessarily contiguously, in both `text1` and `text2`.',
  ],
  constraints: ['1 ≤ text1.length, text2.length ≤ 1500', 'lowercase letters'],
  entry: 'longestCommonSubsequence',
  params: [
    { name: 'text1', type: 'string' },
    { name: 'text2', type: 'string' },
  ],
  returns: 'int',
  compare: 'exact',
  examples: [{ args: ['abcde', 'ace'], explanation: '"ace" appears in order in both' }, { args: ['abc', 'abc'] }, { args: ['abc', 'def'] }],
  edgeCases: [
    ['a', 'a'],
    ['a', 'b'],
    ['aaaa', 'aa'],
  ],
  randomCase: (rand) => {
    const word = () => Array.from({ length: randInt(rand, 1, 9) }, () => 'abcd'[randInt(rand, 0, 3)]).join('');
    return [word(), word()];
  },
  performanceCase: (rand) => {
    const word = () => Array.from({ length: 1_500 }, () => 'abcdefghij'[randInt(rand, 0, 9)]).join('');
    return [word(), word()];
  },
  solve(a: string, b: string) {
    let prev = Array<number>(b.length + 1).fill(0);
    for (let i = 1; i <= a.length; i++) {
      const row = Array<number>(b.length + 1).fill(0);
      for (let j = 1; j <= b.length; j++) row[j] = a[i - 1] === b[j - 1] ? prev[j - 1] + 1 : Math.max(prev[j], row[j - 1]);
      prev = row;
    }
    return prev[b.length];
  },
  approach:
    '`dp[i][j]` is the answer for the prefixes `text1[:i]` and `text2[:j]`: diagonal + 1 on a match, otherwise the better of dropping one letter.',
  complexity: { time: 'O(m·n)', space: 'O(n) with one rolling row' },
};

export const countPrefixes: CodingProblemDefinition = {
  statement: ['Given a dictionary of words and a list of prefixes, return for each prefix how many words start with it.'],
  constraints: ['1 ≤ words.length, prefixes.length ≤ 3·10^4', '1 ≤ word length ≤ 10', 'lowercase letters'],
  entry: 'countPrefixes',
  params: [
    { name: 'words', type: 'string[]' },
    { name: 'prefixes', type: 'string[]' },
  ],
  returns: 'int[]',
  compare: 'exact',
  examples: [
    {
      args: [
        ['apple', 'app', 'apt', 'bat'],
        ['ap', 'app', 'b', 'c'],
      ],
      explanation: '"ap" starts apple, app and apt',
    },
    {
      args: [
        ['a', 'a', 'ab'],
        ['a', 'ab', 'abc'],
      ],
    },
  ],
  edgeCases: [
    [['x'], ['x', 'xy']],
    [
      ['same', 'same'],
      ['same', 's'],
    ],
  ],
  randomCase: (rand) => {
    const word = () => Array.from({ length: randInt(rand, 1, 4) }, () => 'abc'[randInt(rand, 0, 2)]).join('');
    return [Array.from({ length: randInt(rand, 1, 8) }, word), Array.from({ length: randInt(rand, 1, 6) }, word)];
  },
  performanceCase: (rand) => {
    const word = (max: number) => Array.from({ length: randInt(rand, 1, max) }, () => 'abcdefgh'[randInt(rand, 0, 7)]).join('');
    return [Array.from({ length: 30_000 }, () => word(10)), Array.from({ length: 30_000 }, () => word(4))];
  },
  solve(words: string[], prefixes: string[]) {
    const counts = new Map<string, number>();
    for (const w of words) for (let i = 1; i <= w.length; i++) counts.set(w.slice(0, i), (counts.get(w.slice(0, i)) ?? 0) + 1);
    return prefixes.map((p) => counts.get(p) ?? 0);
  },
  approach:
    'Insert every word into a trie, counting at each node how many words pass through it; each query is then a walk of its own length.',
  complexity: { time: 'O(total letters)', space: 'O(total letters)' },
};

export const singleNumber: CodingProblemDefinition = {
  statement: [
    'Every value in `nums` appears exactly twice, except for one value that appears once. Return that value.',
    'Aim for O(n) time and O(1) extra space.',
  ],
  constraints: ['1 ≤ nums.length ≤ 3·10^5', '-10^9 ≤ nums[i] ≤ 10^9', 'Exactly one value appears once; every other value appears twice'],
  entry: 'singleNumber',
  params: [{ name: 'nums', type: 'int[]' }],
  returns: 'int',
  compare: 'exact',
  examples: [
    { args: [[2, 2, 1]] },
    { args: [[4, 1, 2, 1, 2]], explanation: 'The two 1s and the two 2s cancel out, leaving 4' },
    { args: [[1]] },
  ],
  edgeCases: [[[-1]], [[0, 7, 7]], [[-4, 9, -4]], [[1000000000, -1000000000, 1000000000]]],
  randomCase: (rand) => {
    const [single, ...paired] = shuffle(rand, rangeOf(-20, 20)).slice(0, randInt(rand, 1, 7));
    return [shuffle(rand, [single, ...paired, ...paired])];
  },
  performanceCase: (rand) => {
    const [single, ...paired] = distinctInts(rand, 100_001, -1_000_000_000, 1_000_000_000);
    const nums = shuffle(rand, [...paired, ...paired]);
    nums.splice(nearMiddle(rand, nums.length), 0, single);
    return [nums];
  },
  solve(nums: number[]) {
    let x = 0;
    for (const n of nums) x ^= n;
    return x;
  },
  approach: 'XOR every value into one accumulator: `x ^ x = 0` and `0 ^ x = x`, so each pair cancels and only the single value is left.',
  complexity: { time: 'O(n)', space: 'O(1)' },
};

export const totalHammingDistance: CodingProblemDefinition = {
  statement: [
    'The Hamming distance between two integers is the number of bit positions where their binary forms differ.',
    'Return the sum of the Hamming distances over every pair of values in `nums`.',
  ],
  constraints: ['1 ≤ nums.length ≤ 10^5', '0 ≤ nums[i] ≤ 10^9', 'The answer can exceed 2^31'],
  entry: 'totalHammingDistance',
  params: [{ name: 'nums', type: 'int[]' }],
  returns: 'int',
  compare: 'exact',
  examples: [
    { args: [[4, 14, 2]], explanation: '4 is 0100, 14 is 1110 and 2 is 0010: the pairs differ in 2, 2 and 2 bits, so 6' },
    { args: [[4, 14, 4]] },
  ],
  edgeCases: [[[0]], [[7, 7]], [[0, 1000000000]], [[1, 2, 4, 8]]],
  randomCase: (rand) => [ints(rand, randInt(rand, 1, 10), 0, 31)],
  performanceCase: (rand) => [ints(rand, 100_000, 0, 1_000_000_000)],
  solve(nums: number[]) {
    let total = 0;
    for (let bit = 0; bit < 30; bit++) {
      let ones = 0;
      for (const x of nums) ones += (x >> bit) & 1;
      total += ones * (nums.length - ones);
    }
    return total;
  },
  approach: 'Count bit by bit instead of pair by pair: if k of the n values have a 1 in some bit, that bit differs in k × (n - k) pairs.',
  complexity: { time: 'O(30·n)', space: 'O(1)' },
};
