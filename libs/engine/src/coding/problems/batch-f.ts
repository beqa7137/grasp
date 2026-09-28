import { randInt, shuffle } from '../../algorithms/random.js';
import type { CodingProblemDefinition } from '../types.js';
import { distinctSorted, ints } from './inputs.js';

const rotate = (nums: number[], pivot: number) => [...nums.slice(pivot), ...nums.slice(0, pivot)];

const letters = (rand: () => number, n: number, alphabet: string) =>
  Array.from({ length: n }, () => alphabet[randInt(rand, 0, alphabet.length - 1)]).join('');

const LOWERCASE = 'abcdefghijklmnopqrstuvwxyz';

export const fourSumCount: CodingProblemDefinition = {
  statement: [
    'Given four integer arrays `nums1`, `nums2`, `nums3` and `nums4`, all of the same length `n`, return how many index tuples `(i, j, k, l)` pick one value from each array, in that order, with a sum of 0.',
    'Tuples are counted by index, so equal values at different positions count separately.',
  ],
  constraints: ['1 ≤ n ≤ 1000', '-2^28 ≤ every value ≤ 2^28', 'The answer can exceed 2^31'],
  entry: 'fourSumCount',
  params: [
    { name: 'nums1', type: 'int[]' },
    { name: 'nums2', type: 'int[]' },
    { name: 'nums3', type: 'int[]' },
    { name: 'nums4', type: 'int[]' },
  ],
  returns: 'int',
  compare: 'exact',
  examples: [
    {
      args: [
        [1, 2],
        [-2, -1],
        [-1, 2],
        [0, 2],
      ],
      explanation: '(0, 0, 0, 1) gives 1 + (-2) + (-1) + 2 = 0, and (1, 1, 0, 0) gives 2 + (-1) + (-1) + 0 = 0',
    },
    { args: [[0], [0], [0], [0]] },
  ],
  edgeCases: [
    [[1], [1], [1], [1]],
    [[5], [-5], [3], [-4]],
    [
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
      [0, 0, 0],
    ],
    [
      [1, 1],
      [-1, -1],
      [2, 3],
      [-2, -3],
    ],
    [[268435456], [268435456], [-268435456], [-268435456]],
    [
      [-268435456, 268435456],
      [-268435456, 268435456],
      [-268435456, 268435456],
      [-268435456, 268435456],
    ],
  ],
  randomCase: (rand) => {
    const n = randInt(rand, 1, 6);
    return [0, 1, 2, 3].map(() => ints(rand, n, -3, 3));
  },
  // Wide random values keep every array nearly distinct, so hashing one array and looping over the other three is cubic.
  performanceCase: (rand) => [0, 1, 2, 3].map(() => ints(rand, 1000, -268_435_456, 268_435_456)),
  solve(nums1: number[], nums2: number[], nums3: number[], nums4: number[]) {
    const pairSums = new Map<number, number>();
    for (const a of nums1) for (const b of nums2) pairSums.set(a + b, (pairSums.get(a + b) ?? 0) + 1);
    let count = 0;
    for (const c of nums3) for (const d of nums4) count += pairSums.get(-c - d) ?? 0;
    return count;
  },
  approach:
    'Split the four arrays into two halves: count every sum of a value from `nums1` and one from `nums2` in a hash map, then for each pair from `nums3` and `nums4` add the count of the sum that cancels it.',
  complexity: { time: 'O(n^2)', space: 'O(n^2)' },
};

export const trappingRainWater: CodingProblemDefinition = {
  statement: [
    '`height[i]` is the height of a bar of width 1 at position `i`. After rain, water settles on top of the bars wherever taller bars on both sides hold it in, and it spills off both ends.',
    'Return the total units of water trapped.',
  ],
  constraints: ['1 ≤ height.length ≤ 2·10^5', '0 ≤ height[i] ≤ 10^5'],
  entry: 'trap',
  params: [{ name: 'height', type: 'int[]' }],
  returns: 'int',
  compare: 'exact',
  examples: [
    {
      args: [[0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1]],
      explanation: 'Positions 2, 4, 5, 6 and 9 hold 1, 1, 2, 1 and 1 units',
    },
    { args: [[4, 2, 0, 3, 2, 5]], explanation: 'The water rises to 4, the lower of the two end bars: 2 + 4 + 1 + 2 = 9' },
  ],
  edgeCases: [
    [[0]],
    [[7]],
    [[3, 0]],
    [[2, 0, 2]],
    [[1, 2, 3]],
    [[3, 2, 1]],
    [[5, 5, 5]],
    [[0, 0, 0, 0]],
    [[5, 0, 3, 0, 5]],
    [[2, 0, 3, 0, 1]],
    [[100000, 0, 0, 100000]],
  ],
  randomCase: (rand) => [ints(rand, randInt(rand, 1, 12), 0, 6)],
  // Scanning both sides of every bar for its tallest neighbors is quadratic, and raising the water one level at a time
  // takes as many passes as the tallest bar.
  performanceCase: (rand) => [ints(rand, 200_000, 0, 100_000)],
  solve(height: number[]) {
    let lo = 0;
    let hi = height.length - 1;
    let leftMax = 0;
    let rightMax = 0;
    let water = 0;
    while (lo < hi) {
      if (height[lo] < height[hi]) {
        leftMax = Math.max(leftMax, height[lo]);
        water += leftMax - height[lo++];
      } else {
        rightMax = Math.max(rightMax, height[hi]);
        water += rightMax - height[hi--];
      }
    }
    return water;
  },
  approach:
    'Water above a bar rises to the lower of the tallest bars on its left and right. Move two pointers inward from the lower side: the running maximum on that side is then the limit, because the other side already has a bar at least as tall.',
  complexity: { time: 'O(n)', space: 'O(1)' },
};

export const permutationInString: CodingProblemDefinition = {
  statement: [
    'Given strings `s1` and `s2`, return `true` if `s2` contains a permutation of `s1` as a substring: some run of consecutive characters of `s2`, exactly as long as `s1`, holding the same letters with the same counts. Otherwise return `false`.',
  ],
  constraints: ['1 ≤ s1.length, s2.length ≤ 2·10^5', 's1 and s2 consist of lowercase English letters'],
  entry: 'checkInclusion',
  params: [
    { name: 's1', type: 'string' },
    { name: 's2', type: 'string' },
  ],
  returns: 'bool',
  compare: 'exact',
  examples: [
    { args: ['ab', 'eidbaooo'], explanation: '"ba", starting at index 3, is a permutation of "ab"' },
    { args: ['ab', 'eidboaoo'], explanation: 'The b and the a are two characters apart' },
  ],
  edgeCases: [
    ['a', 'a'],
    ['a', 'b'],
    ['abc', 'ab'],
    ['ab', 'xba'],
    ['ab', 'xxba'],
    ['ab', 'axxb'],
    ['aab', 'abab'],
    ['aab', 'abbab'],
    ['adc', 'dcda'],
    ['abc', 'abc'],
  ],
  randomCase: (rand) => [letters(rand, randInt(rand, 1, 4), 'abc'), letters(rand, randInt(rand, 1, 12), 'abc')],
  // The only matching window sits near the end and is 10^5 letters long, so counting each window from scratch is quadratic.
  performanceCase: (rand) => {
    const n = 200_000;
    const m = 100_000;
    const s2 = letters(rand, n, LOWERCASE);
    const at = n - m - randInt(rand, 0, 1000);
    return [shuffle(rand, s2.slice(at, at + m).split('')).join(''), s2];
  },
  solve(s1: string, s2: string) {
    const m = s1.length;
    if (m > s2.length) return false;
    const count = Array<number>(26).fill(0);
    for (let i = 0; i < m; i++) {
      count[s1.charCodeAt(i) - 97]++;
      count[s2.charCodeAt(i) - 97]--;
    }
    let unmatched = count.filter((c) => c !== 0).length;
    const shift = (letter: number, by: number) => {
      if (count[letter] === 0) unmatched++;
      count[letter] += by;
      if (count[letter] === 0) unmatched--;
    };
    for (let i = m; ; i++) {
      if (unmatched === 0) return true;
      if (i === s2.length) return false;
      shift(s2.charCodeAt(i) - 97, -1);
      shift(s2.charCodeAt(i - m) - 97, 1);
    }
  },
  approach:
    'Slide a window as long as `s1` across `s2`, keeping the difference between its letter counts and those of `s1` and how many letters still differ. Each step changes two counts, and the answer is `true` once no letter differs.',
  complexity: { time: 'O(n)', space: 'O(1) for 26 counts' },
};

export const minimumWindowSubstring: CodingProblemDefinition = {
  statement: [
    'Given strings `s` and `t`, return the shortest substring of `s` that contains every character of `t`, counting repeats: if `t` holds a letter twice, the substring must hold it at least twice. Letters are case-sensitive.',
    'If several substrings share the shortest length, return the one that starts first. Return an empty string if no substring qualifies.',
  ],
  constraints: ['1 ≤ s.length, t.length ≤ 10^5', 's and t consist of uppercase and lowercase English letters'],
  entry: 'minWindow',
  params: [
    { name: 's', type: 'string' },
    { name: 't', type: 'string' },
  ],
  returns: 'string',
  compare: 'exact',
  examples: [
    { args: ['ADOBECODEBANC', 'ABC'], explanation: '"BANC" is the shortest substring holding an A, a B and a C' },
    { args: ['a', 'a'] },
    { args: ['a', 'aa'], explanation: 't needs two a letters, and s has only one' },
  ],
  edgeCases: [
    ['a', 'b'],
    ['ab', 'abc'],
    ['ab', 'b'],
    ['aa', 'aa'],
    ['aab', 'ba'],
    ['abba', 'ab'],
    ['baab', 'ab'],
    ['aA', 'A'],
    ['Aa', 'aa'],
    ['abc', 'cba'],
    ['cabwefgewcwaefgcf', 'cae'],
    ['bbaac', 'aba'],
  ],
  randomCase: (rand) => [letters(rand, randInt(rand, 1, 14), 'abcA'), letters(rand, randInt(rand, 1, 4), 'abcA')],
  // t needs a z near the start and a Z near the end, so growing a window from every start until it covers t, or runs off
  // the end, is quadratic.
  performanceCase: (rand) => {
    const n = 100_000;
    const common = 'abcdefghijklmnopqrstuvwxyABCDEFGHIJKLMNOPQRSTUVWXY';
    const s = [...letters(rand, n, common)];
    s[randInt(rand, 0, 99)] = 'z';
    s[n - 1 - randInt(rand, 0, 99)] = 'Z';
    return [s.join(''), shuffle(rand, [...letters(rand, 2_000, common), 'z', 'Z']).join('')];
  },
  solve(s: string, t: string) {
    const need = new Map<string, number>();
    for (const ch of t) need.set(ch, (need.get(ch) ?? 0) + 1);
    let missing = t.length;
    let bestStart = 0;
    let bestLength = Infinity;
    for (let lo = 0, hi = 0; hi < s.length; hi++) {
      const wanted = need.get(s[hi]);
      if (wanted !== undefined) {
        if (wanted > 0) missing--;
        need.set(s[hi], wanted - 1);
      }
      while (missing === 0) {
        if (hi - lo + 1 < bestLength) {
          bestLength = hi - lo + 1;
          bestStart = lo;
        }
        const dropped = need.get(s[lo]);
        if (dropped !== undefined) {
          if (dropped === 0) missing++;
          need.set(s[lo], dropped + 1);
        }
        lo++;
      }
    }
    return bestLength === Infinity ? '' : s.slice(bestStart, bestStart + bestLength);
  },
  approach:
    'Slide a window: count how many characters of `t` it still misses, extend it on the right until it misses none, then shrink it from the left while it still covers `t`, recording each covering window that is strictly shorter than the best.',
  complexity: { time: 'O(|s| + |t|)', space: 'O(k) for k distinct characters' },
};

export const findMinRotated: CodingProblemDefinition = {
  statement: [
    '`nums` was sorted in ascending order with distinct values, then possibly rotated: some prefix was moved, in order, to the end. For example, `[0,1,2,4,5,6,7]` can become `[4,5,6,7,0,1,2]`, or stay as it is.',
    'Return the smallest value in `nums`. Aim for O(log n).',
  ],
  constraints: ['1 ≤ nums.length ≤ 10^5', '-10^9 ≤ nums[i] ≤ 10^9', 'values are distinct', 'nums is a sorted array, possibly rotated'],
  entry: 'findMin',
  params: [{ name: 'nums', type: 'int[]' }],
  returns: 'int',
  compare: 'exact',
  examples: [
    { args: [[3, 4, 5, 1, 2]], explanation: 'The prefix [1,2] of [1,2,3,4,5] moved to the end' },
    { args: [[4, 5, 6, 7, 0, 1, 2]] },
    { args: [[11, 13, 15, 17]], explanation: 'Not rotated, so the first value is the smallest' },
  ],
  edgeCases: [
    [[1]],
    [[2, 1]],
    [[1, 2]],
    [[3, 1, 2]],
    [[2, 3, 1]],
    [[1, 2, 3]],
    [[5, 1, 2, 3, 4]],
    [[2, 3, 4, 5, 1]],
    [[1, 2, 3, 4, 5, 6]],
    [[1000000000, -1000000000]],
  ],
  randomCase: (rand) => {
    const n = randInt(rand, 1, 14);
    return [rotate(distinctSorted(rand, n, -50, 50), randInt(rand, 0, n - 1))];
  },
  performanceCase: (rand) => {
    const n = 100_000;
    return [rotate(distinctSorted(rand, n, -1_000_000_000, 1_000_000_000), randInt(rand, 1, n - 1))];
  },
  solve(nums: number[]) {
    let lo = 0;
    let hi = nums.length - 1;
    while (lo < hi) {
      const mid = lo + ((hi - lo) >> 1);
      if (nums[mid] > nums[hi]) lo = mid + 1;
      else hi = mid;
    }
    return nums[lo];
  },
  approach:
    'Binary search against the last value of the range: a middle value larger than it means the drop, and so the minimum, lies to its right; otherwise the minimum is the middle value or to its left.',
  complexity: { time: 'O(log n)', space: 'O(1)' },
};
