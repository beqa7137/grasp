import { rangeOf } from '../../algorithms/input.js';
import { distinctInts, randInt, shuffle } from '../../algorithms/random.js';
import type { CodingProblemDefinition } from '../types.js';
import { ints, nearMiddle } from './inputs.js';

export const subsets: CodingProblemDefinition = {
  statement: [
    'The values in `nums` are distinct. Return every subset of `nums`, the empty one included, each exactly once.',
    'The subsets, and the numbers inside each one, can come in any order.',
  ],
  constraints: ['0 ≤ nums.length ≤ 17', '-10 ≤ nums[i] ≤ 10', 'values are distinct'],
  entry: 'subsets',
  params: [{ name: 'nums', type: 'int[]' }],
  returns: 'int[][]',
  compare: 'unordered-nested',
  examples: [
    { args: [[1, 2, 3]], explanation: 'Each number is in or out of a subset, so 3 numbers make 2 × 2 × 2 = 8 subsets' },
    { args: [[0]] },
    {
      args: [[3, -1]],
      explanation: 'Order does not matter inside a subset or between subsets: [3,-1] and [-1,3] are the same subset',
    },
  ],
  edgeCases: [[[]], [[-5]], [[10, -10]], [[2, 1, 3, 0]]],
  randomCase: (rand) => [distinctInts(rand, randInt(rand, 0, 6), -10, 10)],
  // 2^17 subsets: comparing each new subset with the ones already found, to skip a copy, is quadratic in that count.
  performanceCase: (rand) => [distinctInts(rand, 17, -10, 10)],
  solve(nums: number[]) {
    const sorted = [...nums].sort((a, b) => a - b);
    const out: number[][] = [];
    const path: number[] = [];
    const go = (i: number) => {
      if (i === sorted.length) {
        out.push([...path]);
        return;
      }
      path.push(sorted[i]);
      go(i + 1);
      path.pop();
      go(i + 1);
    };
    go(0);
    return out;
  },
  approach:
    'Backtrack: at each index take the number, explore, undo, and explore again without it. Every leaf of this take-or-skip tree is one subset.',
  complexity: { time: 'O(n · 2ⁿ)', space: 'O(n) plus the output' },
};

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

export const coinChange: CodingProblemDefinition = {
  statement: [
    'You have as many coins of each value in `coins` as you need. Return the fewest coins that add up to exactly `amount`, or -1 if no combination does.',
  ],
  constraints: ['1 ≤ coins.length ≤ 12', '1 ≤ coins[i] ≤ 10^4', 'coin values are distinct', '0 ≤ amount ≤ 10^4'],
  entry: 'coinChange',
  params: [
    { name: 'coins', type: 'int[]' },
    { name: 'amount', type: 'int' },
  ],
  returns: 'int',
  compare: 'exact',
  examples: [
    { args: [[1, 2, 5], 11], explanation: '11 = 5 + 5 + 1' },
    { args: [[2], 3], explanation: 'Coins of 2 only add up to even amounts' },
    { args: [[1], 0], explanation: 'An amount of 0 takes no coins' },
  ],
  edgeCases: [
    [[7], 7],
    [[3, 7], 5],
    [[1, 3, 4], 6],
    [[1, 5, 6, 9], 11],
    [[2, 5, 10, 1], 18],
    [[1, 3, 4], 10],
  ],
  randomCase: (rand) => [distinctInts(rand, randInt(rand, 2, 4), 1, 12), randInt(rand, 0, 24)],
  // Every coin is a multiple of 3 and the amount is not, so no mix adds up to it. Recursing on each coin without a memo,
  // or a search that stops a branch once it cannot beat the best count so far, has to try every mix: exponential.
  performanceCase: (rand) => [distinctInts(rand, 12, 10, 200).map((c) => 3 * c), 3 * randInt(rand, 3_000, 3_332) + randInt(rand, 1, 2)],
  solve(coins: number[], amount: number) {
    const fewest = Array<number>(amount + 1).fill(Infinity);
    fewest[0] = 0;
    for (let a = 1; a <= amount; a++) for (const c of coins) if (c <= a) fewest[a] = Math.min(fewest[a], fewest[a - c] + 1);
    return fewest[amount] === Infinity ? -1 : fewest[amount];
  },
  approach:
    '`dp[a]` is the fewest coins that make `a`: the best `dp[a - c] + 1` over the coins `c`, filled from 1 up to `amount`. An amount no mix of coins reaches stays infinite, which gives -1. Taking the largest coin first is not safe here: with coins [1, 3, 4] and amount 6 it takes 4 + 1 + 1, while 3 + 3 needs two.',
  complexity: { time: 'O(amount × coins)', space: 'O(amount)' },
};

export const longestCommonSubsequence: CodingProblemDefinition = {
  statement: [
    'Return the length of the longest sequence of characters that appears, in order but not necessarily contiguously, in both `text1` and `text2`.',
  ],
  constraints: ['1 ≤ text1.length, text2.length ≤ 1000', 'lowercase letters'],
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
    const word = () => Array.from({ length: 1000 }, () => 'abcdefghij'[randInt(rand, 0, 9)]).join('');
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
    '`dp[i][j]` is the answer for the prefixes `text1[:i]` and `text2[:j]`: diagonal + 1 on a match, otherwise the better of dropping one letter. Fill the table bottom-up in browser Python: `@cache` and `@lru_cache` can exhaust its stack at these lengths.',
  complexity: { time: 'O(m·n)', space: 'O(n) with one rolling row' },
};

export const editDistance: CodingProblemDefinition = {
  statement: [
    'Return the fewest single-letter edits needed to turn `word1` into `word2`. An edit inserts, deletes or replaces one letter.',
    'Either word may be empty.',
  ],
  constraints: ['0 ≤ word1.length, word2.length ≤ 500', 'lowercase letters'],
  entry: 'minDistance',
  params: [
    { name: 'word1', type: 'string' },
    { name: 'word2', type: 'string' },
  ],
  returns: 'int',
  compare: 'exact',
  examples: [
    { args: ['horse', 'ros'], explanation: 'Replace h with r, delete the later r, then delete e: three edits' },
    {
      args: ['intention', 'execution'],
      explanation: 'intention → inention → enention → exention → exection → execution: one deletion, three replacements and one insertion',
    },
    { args: ['', 'abc'], explanation: 'Insert a, b and c' },
  ],
  edgeCases: [
    ['', ''],
    ['abc', ''],
    ['a', 'a'],
    ['a', 'b'],
    ['ab', 'ba'],
    ['kitten', 'sitting'],
    ['aaaa', 'bbbb'],
  ],
  randomCase: (rand) => {
    const word = () => Array.from({ length: randInt(rand, 0, 5) }, () => 'abc'[randInt(rand, 0, 2)]).join('');
    return [word(), word()];
  },
  performanceCase: (rand) => {
    const word = () => Array.from({ length: 500 }, () => 'abcd'[randInt(rand, 0, 3)]).join('');
    return [word(), word()];
  },
  solve(word1: string, word2: string) {
    let previous = Array.from({ length: word2.length + 1 }, (_, i) => i);
    for (let i = 1; i <= word1.length; i++) {
      const current = Array<number>(word2.length + 1);
      current[0] = i;
      for (let j = 1; j <= word2.length; j++)
        current[j] = word1[i - 1] === word2[j - 1] ? previous[j - 1] : 1 + Math.min(previous[j - 1], previous[j], current[j - 1]);
      previous = current;
    }
    return previous[word2.length];
  },
  approach:
    '`dp[i][j]` is the fewest edits that turn the first `i` letters of `word1` into the first `j` of `word2`; an empty prefix needs one edit per letter of the other. On a match take the diagonal; otherwise add one to the least of the diagonal (replace), the cell above (delete) and the cell to the left (insert). Only the previous row is needed. Fill the table bottom-up in browser Python: `@cache` and `@lru_cache` can exhaust its stack at these lengths.',
  complexity: { time: 'O(word1.length × word2.length)', space: 'O(word2.length)' },
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

const letters = 'abcdefghijklmnopqrstuvwxyz';

function suffix(value: number): string {
  let word = '';
  for (let i = 0; i < 4; i++) {
    word = letters[value % 26] + word;
    value = Math.floor(value / 26);
  }
  return word;
}

export const replaceWords: CodingProblemDefinition = {
  statement: [
    'Each word in `dictionary` is a root. In `sentence`, shorten each word that starts with a root to the shortest root it starts with.',
    'Leave a word unchanged if no root matches. Words are lowercase and separated by one space; return the new sentence with the same spacing.',
  ],
  constraints: [
    '1 ≤ dictionary.length ≤ 6·10^4',
    '1 ≤ root length ≤ 10',
    'roots are distinct',
    '1 ≤ sentence.length ≤ 2·10^5',
    'lowercase words separated by single spaces, with no space at either end',
  ],
  entry: 'replaceWords',
  params: [
    { name: 'dictionary', type: 'string[]' },
    { name: 'sentence', type: 'string' },
  ],
  returns: 'string',
  compare: 'exact',
  examples: [
    {
      args: [['cat', 'bat', 'rat'], 'the cattle was rattled by the battery'],
      explanation: 'cattle, rattled and battery start with the roots cat, rat and bat; no root starts the other words',
    },
    { args: [['a', 'b', 'c'], 'aadsfasf absbs bbab cadsfafs'], explanation: 'Each word is shortened to its first-letter root' },
    {
      args: [['cat', 'ca', 'dog'], 'catalog scat dogma'],
      explanation: 'Both cat and ca start catalog, so the shorter ca wins; scat only contains cat, so it stays',
    },
  ],
  edgeCases: [
    [['a', 'ab', 'abc'], 'abcd ab a'],
    [['ab', 'abc', 'a'], 'abcd ab a'],
    [['cat'], 'scat cat cattle'],
    [['abc'], 'xyz'],
    [['abc'], 'abc'],
    [['b', 'ba', 'bat', 'c'], 'batman cat'],
  ],
  randomCase: (rand) => {
    const word = (max: number) => Array.from({ length: randInt(rand, 1, max) }, () => 'abc'[randInt(rand, 0, 2)]).join('');
    const dictionary = new Set<string>();
    const count = randInt(rand, 1, 6);
    while (dictionary.size < count) dictionary.add(word(4));
    const roots = [...dictionary];
    const sentence = Array.from({ length: randInt(rand, 1, 7) }, () =>
      rand() < 0.5 ? roots[randInt(rand, 0, roots.length - 1)] + word(2) : word(6),
    ).join(' ');
    return [roots, sentence];
  },
  performanceCase: () => {
    const common = 'a';
    const dictionary = Array.from({ length: 60_000 }, (_, i) => common + suffix(i));
    const sentence = Array.from(
      { length: 28_500 },
      (_, i) => common + suffix(i % 4 === 0 ? 58_000 + ((i / 4) % 2_000) : 60_000 + i) + 'z',
    ).join(' ');
    return [dictionary, sentence];
  },
  solve(dictionary: string[], sentence: string) {
    const children: Map<string, number>[] = [new Map()];
    const terminal: boolean[] = [false];
    for (const root of dictionary) {
      let node = 0;
      for (const letter of root) {
        let next = children[node].get(letter);
        if (next === undefined) {
          next = children.length;
          children[node].set(letter, next);
          children.push(new Map());
          terminal.push(false);
        }
        node = next;
      }
      terminal[node] = true;
    }
    return sentence
      .split(' ')
      .map((word) => {
        let node = 0;
        for (let i = 0; i < word.length; i++) {
          const next = children[node].get(word[i]);
          if (next === undefined) break;
          node = next;
          if (terminal[node]) return word.slice(0, i + 1);
        }
        return word;
      })
      .join(' ');
  },
  approach:
    "Put the roots in a trie and walk each word down it letter by letter. The first node that ends a root gives the shortest matching root; falling off the trie first means no root matches, so the word stays. Since roots have at most 10 letters, checking each word's first 1 to 10 letters against a set of roots also works.",
  complexity: { time: 'O(total dictionary letters + sentence.length)', space: 'O(total dictionary letters + sentence.length)' },
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
