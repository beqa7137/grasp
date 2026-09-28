import { distinctInts, randInt, shuffle } from '../../algorithms/random.js';
import type { CodingProblemDefinition } from '../types.js';
import { distinctSorted, ints } from './inputs.js';

const randomWord = (rand: () => number, alphabet: string, min: number, max: number) =>
  Array.from({ length: randInt(rand, min, max) }, () => alphabet[randInt(rand, 0, alphabet.length - 1)]).join('');

export const partitionEqualSubset: CodingProblemDefinition = {
  statement: [
    'Return `true` if the values in `nums` can be split into two groups with equal sums, and `false` otherwise.',
    'Every value goes into exactly one of the two groups.',
  ],
  constraints: ['1 ≤ nums.length ≤ 200', '1 ≤ nums[i] ≤ 100'],
  entry: 'canPartition',
  params: [{ name: 'nums', type: 'int[]' }],
  returns: 'bool',
  compare: 'exact',
  examples: [
    { args: [[1, 5, 11, 5]], explanation: '1 + 5 + 5 = 11, the value left over' },
    { args: [[1, 2, 3, 5]], explanation: 'The total, 11, is odd, so no split gives two equal sums' },
  ],
  edgeCases: [[[1]], [[2, 2]], [[1, 5]], [[100, 100]], [[3, 3, 2, 2, 2]], [[1, 2, 5]], [[2, 4, 6]], [[1, 1, 1, 1]]],
  randomCase: (rand) => [ints(rand, randInt(rand, 1, 12), 1, 12)],
  // Every value is even and the total is 2 mod 4, so half of it is odd and no group reaches it. Recursing on taking or
  // skipping each value without a memo has to try every group whose sum stays under half: exponential.
  performanceCase: (rand) => {
    const nums = ints(rand, 200, 25, 50).map((x) => 2 * x);
    if (nums.reduce((sum, x) => sum + x, 0) % 4 === 0) {
      const k = randInt(rand, 0, nums.length - 1);
      nums[k] += nums[k] === 100 ? -2 : 2;
    }
    return [nums];
  },
  solve(nums: number[]) {
    const total = nums.reduce((sum, x) => sum + x, 0);
    if (total % 2) return false;
    const half = total / 2;
    const reachable = new Uint8Array(half + 1);
    reachable[0] = 1;
    for (const x of nums) for (let s = half; s >= x; s--) if (reachable[s - x]) reachable[s] = 1;
    return reachable[half] === 1;
  },
  approach:
    'Each group must sum to half the total, so the question is whether some subset reaches `total / 2`. Keep `can[s]`, whether a subset of the values so far sums to `s`, and for each value update it from high sums to low, so the value counts at most once. Trying every subset, or recursing without a memo, is exponential.',
  complexity: { time: 'O(n · total)', space: 'O(total)' },
};

export const longestIncreasingSubsequence: CodingProblemDefinition = {
  statement: [
    'Return the length of the longest strictly increasing subsequence of `nums`. A subsequence keeps the values in their order but may skip any of them.',
    'Strictly increasing means each value is greater than the one before it, so two equal values are never both in it.',
    'Aim for O(n log n) time.',
  ],
  constraints: ['1 ≤ nums.length ≤ 2·10^5', '-10^9 ≤ nums[i] ≤ 10^9'],
  entry: 'lengthOfLis',
  params: [{ name: 'nums', type: 'int[]' }],
  returns: 'int',
  compare: 'exact',
  examples: [
    { args: [[10, 9, 2, 5, 3, 7, 101, 18]], explanation: '2, 3, 7, 18 is one of several increasing subsequences of length 4' },
    { args: [[0, 1, 0, 3, 2, 3]] },
    { args: [[7, 7, 7, 7, 7]] },
  ],
  edgeCases: [
    [[5]],
    [[7, 7, 7, 7]],
    [[5, 4, 3, 2, 1]],
    [[1, 2, 3, 4, 5]],
    [[10, 1, 2, 3]],
    [[1, 3, 2, 4]],
    [[1, 2, 2, 3]],
    [[-1_000_000_000, 1_000_000_000]],
  ],
  randomCase: (rand) => [ints(rand, randInt(rand, 1, 12), -5, 5)],
  // A climb of 10^5 values, then 10^5 values each just below one in the middle of the climb: each of them replaces a
  // tail in the middle of 10^5 tails. The O(n²) table, and keeping the tails but scanning them from either end instead of
  // binary searching, each take over 4·10^9 steps.
  performanceCase: (rand) => {
    const climb = distinctSorted(rand, 100_000, -500_000_000, 499_999_999).map((v) => 2 * v);
    const dips = Array.from({ length: 100_000 }, () => climb[randInt(rand, 45_000, 55_000)] - 1);
    return [[...climb, ...dips]];
  },
  solve(nums: number[]) {
    const tails: number[] = [];
    for (const x of nums) {
      let lo = 0;
      let hi = tails.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (tails[mid] < x) lo = mid + 1;
        else hi = mid;
      }
      tails[lo] = x;
    }
    return tails.length;
  },
  approach:
    'Keep `tails[k]`, the smallest value that ends an increasing subsequence of length `k + 1`; the tails increase along `k`. For each value, binary search for the first tail not smaller than it and replace that tail, or append the value when every tail is smaller. The number of tails is the answer. The O(n²) table of the best length ending at each index is too slow here.',
  complexity: { time: 'O(n log n)', space: 'O(n)' },
};

export const interleavingString: CodingProblemDefinition = {
  statement: [
    'Return `true` if `s3` is an interleaving of `s1` and `s2`, and `false` otherwise.',
    '`s3` is an interleaving when its letters split into two subsequences, one spelling `s1` and the other spelling `s2`, with every letter of `s3` in exactly one of them. A subsequence keeps the letters in their order but may skip any of them.',
    'Any of the strings may be empty.',
  ],
  constraints: [
    '0 ≤ s1.length, s2.length ≤ 1000',
    '0 ≤ s3.length ≤ 2000',
    'lowercase letters',
    'In browser Python, `@cache` can exhaust the stack here',
  ],
  entry: 'isInterleave',
  params: [
    { name: 's1', type: 'string' },
    { name: 's2', type: 'string' },
    { name: 's3', type: 'string' },
  ],
  returns: 'bool',
  compare: 'exact',
  examples: [
    {
      args: ['aabcc', 'dbbca', 'aadbbcbcac'],
      explanation: 'aa from s1, dbbc from s2, bc from s1, a from s2 and the last c from s1',
    },
    { args: ['aabcc', 'dbbca', 'aadbbbaccc'] },
    { args: ['', '', ''] },
  ],
  edgeCases: [
    ['', 'a', 'a'],
    ['a', '', 'b'],
    ['a', 'b', 'ba'],
    ['a', 'b', 'abc'],
    ['ab', 'c', 'bac'],
    ['ca', 'cb', 'cbca'],
    ['cb', 'ca', 'cbca'],
    ['aa', 'aa', 'aaaa'],
    ['abc', '', 'abc'],
  ],
  randomCase: (rand) => {
    const s1 = randomWord(rand, 'ab', 0, 5);
    const s2 = randomWord(rand, 'ab', 0, 5);
    let merged = '';
    for (let i = 0, j = 0; i < s1.length || j < s2.length;)
      merged += j === s2.length || (i < s1.length && rand() < 0.5) ? s1[i++] : s2[j++];
    const pick = rand();
    if (pick < 0.5 || !merged) return [s1, s2, merged];
    if (pick < 0.8) {
      const letters = [...merged];
      const a = randInt(rand, 0, letters.length - 1);
      const b = randInt(rand, 0, letters.length - 1);
      [letters[a], letters[b]] = [letters[b], letters[a]];
      return [s1, s2, letters.join('')];
    }
    return [s1, s2, randomWord(rand, 'ab', merged.length - 1, merged.length + 1)];
  },
  // s1 is a run of one letter, then xy, then another run; s2 has yx between its runs, and s3 holds both first runs, then
  // xxyy, then both last runs. The letters match in count but not in order, and recursing without a memo, from either
  // end, tries every way to interleave the runs before it reaches the middle.
  performanceCase: (rand) => {
    const [fill, x, y] = shuffle(rand, [...'abcdefghijklmnopqrstuvwxyz']);
    const run = () => fill.repeat(randInt(rand, 400, 499));
    const [before1, before2, after1, after2] = [run(), run(), run(), run()];
    return [before1 + x + y + after1, before2 + y + x + after2, before1 + before2 + x + x + y + y + after1 + after2];
  },
  solve(s1: string, s2: string, s3: string) {
    if (s3.length !== s1.length + s2.length) return false;
    const dp = Array<boolean>(s2.length + 1).fill(false);
    dp[0] = true;
    for (let j = 1; j <= s2.length; j++) dp[j] = dp[j - 1] && s2[j - 1] === s3[j - 1];
    for (let i = 1; i <= s1.length; i++) {
      dp[0] = dp[0] && s1[i - 1] === s3[i - 1];
      for (let j = 1; j <= s2.length; j++) {
        const letter = s3[i + j - 1];
        dp[j] = (dp[j] && s1[i - 1] === letter) || (dp[j - 1] && s2[j - 1] === letter);
      }
    }
    return dp[s2.length];
  },
  approach:
    'If the lengths do not add up, the answer is `false`. Otherwise `dp[i][j]` says whether the first `i` letters of `s1` and the first `j` of `s2` interleave into the first `i + j` of `s3`: it holds when `dp[i - 1][j]` does and `s1[i - 1]` is the next letter of `s3`, or the same with `s2`. Recursing on both choices without a memo is exponential when letters repeat. Fill it bottom-up in browser Python: `@cache` and `@lru_cache` can exhaust its stack at these lengths.',
  complexity: { time: 'O(m·n)', space: 'O(n) with one rolling row' },
};

export const partitionLabels: CodingProblemDefinition = {
  statement: [
    'Split `s` into as many parts as possible so that each letter appears in at most one part. Joined in order, the parts give back `s`.',
    'Return the length of each part, in order from the start of `s`.',
  ],
  constraints: ['1 ≤ s.length ≤ 5·10^5', 'lowercase letters'],
  entry: 'partitionLabels',
  params: [{ name: 's', type: 'string' }],
  returns: 'int[]',
  compare: 'exact',
  examples: [
    {
      args: ['ababcbacadefegdehijhklij'],
      explanation: 'ababcbaca, defegde and hijhklij: no letter appears in two parts, and no part splits further',
    },
    { args: ['eccbbbbdec'] },
  ],
  edgeCases: [['a'], ['zzzz'], ['abcdef'], ['abab'], ['abcab'], ['abaccbdeffed'], ['abcba'], ['caedbdedda']],
  randomCase: (rand) => [randomWord(rand, rand() < 0.7 ? 'abcd' : 'abcdefgh', 1, 14)],
  // Blocks over disjoint sets of letters: a letter in an early block last appears long before the end, so searching
  // from the end of s for the last index of each letter at every index is quadratic.
  performanceCase: (rand) => {
    const letters = shuffle(rand, [...'abcdefghijklmnopqrstuvwxyz']);
    const cuts = [0, ...distinctInts(rand, 9, 1, 25).sort((a, b) => a - b), 26];
    const weights = cuts.slice(1).map(() => 0.5 + rand());
    const total = weights.reduce((sum, w) => sum + w, 0);
    const n = randInt(rand, 490_000, 500_000);
    let s = '';
    weights.forEach((w, k) => {
      const group = letters.slice(cuts[k], cuts[k + 1]).join('');
      const length = Math.max(1, Math.floor((n * w) / total));
      s += randomWord(rand, group, length, length);
    });
    return [s];
  },
  solve(s: string) {
    const last = new Int32Array(26);
    for (let i = 0; i < s.length; i++) last[s.charCodeAt(i) - 97] = i;
    const sizes: number[] = [];
    for (let i = 0, start = 0, end = 0; i < s.length; i++) {
      end = Math.max(end, last[s.charCodeAt(i) - 97]);
      if (i === end) {
        sizes.push(end - start + 1);
        start = i + 1;
      }
    }
    return sizes;
  },
  approach:
    'Record the last index of each letter. Scan while tracking where the current part must end: each letter pushes that end out to at least its own last index. When the scan reaches the end, no letter of the part appears later, so close the part there. Searching for each letter from the end of `s` again at every index is quadratic.',
  complexity: { time: 'O(n)', space: 'O(1) besides the output' },
};

export const maximumXorPair: CodingProblemDefinition = {
  statement: [
    'Return the largest value of `nums[i] XOR nums[j]` over all indices `0 ≤ i ≤ j < n`, where XOR is bitwise exclusive or. With a single value, the answer is 0.',
    'Aim for about 31 steps per value instead of trying every pair. In browser Python, trie nodes as two-slot lists run faster than dicts or objects.',
  ],
  constraints: ['1 ≤ nums.length ≤ 10^5', '0 ≤ nums[i] < 2^31'],
  entry: 'findMaximumXor',
  params: [{ name: 'nums', type: 'int[]' }],
  returns: 'int',
  compare: 'exact',
  examples: [
    { args: [[3, 10, 5, 25, 2, 8]], explanation: '5 is 00101 and 25 is 11001, so 5 XOR 25 is 11100, which is 28' },
    { args: [[14, 70, 53, 83, 49, 91, 36, 80, 92, 51, 66, 70]] },
  ],
  edgeCases: [[[0]], [[7]], [[5, 5]], [[8, 8, 8]], [[5, 4, 3]], [[1, 2, 4, 8, 16]], [[0, 2_147_483_647]], [[1_073_741_824, 1_073_741_823]]],
  randomCase: (rand) => [
    Array.from({ length: randInt(rand, 1, 10) }, () => (rand() < 0.2 ? randInt(rand, 0, 2 ** 31 - 1) : randInt(rand, 0, 63))),
  ],
  // Every value has the same low bit cleared, so no pair reaches 2^31 - 1 and a pair search cannot stop early there.
  performanceCase: (rand) => {
    const clear = ~(1 << randInt(rand, 0, 29));
    return [Array.from({ length: randInt(rand, 95_000, 100_000) }, () => randInt(rand, 0, 2 ** 31 - 1) & clear)];
  },
  solve(nums: number[]) {
    const child = new Int32Array(2 * (31 * nums.length + 1));
    let nodes = 1;
    let best = 0;
    for (const x of nums) {
      let node = 0;
      for (let bit = 30; bit >= 0; bit--) {
        const slot = 2 * node + ((x >> bit) & 1);
        if (!child[slot]) child[slot] = nodes++;
        node = child[slot];
      }
      let xor = 0;
      node = 0;
      for (let bit = 30; bit >= 0; bit--) {
        const opposite = 2 * node + (((x >> bit) & 1) ^ 1);
        if (child[opposite]) {
          xor |= 1 << bit;
          node = child[opposite];
        } else node = child[opposite ^ 1];
      }
      best = Math.max(best, xor);
    }
    return best;
  },
  approach:
    'Insert each value into a binary trie, highest bit (bit 30) first, then walk the trie with it: at each bit take the child with the opposite bit when there is one, since a 1 there is worth more than all the lower bits together. The bits where the walk went opposite form the best XOR for that value. Trying every pair is quadratic. In browser Python, trie nodes as two-slot lists run faster than dicts.',
  complexity: { time: 'O(31·n)', space: 'O(31·n)' },
};
