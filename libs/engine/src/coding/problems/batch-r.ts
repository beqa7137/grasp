import { rangeOf } from '../../algorithms/input.js';
import { randInt, shuffle } from '../../algorithms/random.js';
import type { CodingProblemDefinition } from '../types.js';
import { ints } from './inputs.js';

const INT_MIN = -(2 ** 31);
const INT_MAX = 2 ** 31 - 1;

export const sortColors: CodingProblemDefinition = {
  statement: [
    '`nums` holds only 0s, 1s and 2s, standing for red, white and blue. Return it sorted in non-decreasing order: every 0, then every 1, then every 2.',
    'Aim for one pass with O(1) extra space, without a library sort and without counting the colors first.',
  ],
  constraints: ['1 ≤ nums.length ≤ 5·10^5', 'nums[i] is 0, 1 or 2'],
  entry: 'sortColors',
  params: [{ name: 'nums', type: 'int[]' }],
  returns: 'int[]',
  compare: 'exact',
  examples: [{ args: [[2, 0, 2, 1, 1, 0]], explanation: 'The two 0s come first, then the two 1s, then the two 2s' }, { args: [[2, 0, 1]] }],
  edgeCases: [
    [[0]],
    [[2]],
    [[1, 0]],
    [[2, 1, 0]],
    [[2, 2, 2]],
    [[1, 1, 1, 1]],
    [[2, 0, 0]],
    [[2, 2, 0, 1]],
    [[1, 2, 0, 2, 1, 0]],
    [[0, 0, 1, 2, 2]],
  ],
  randomCase: (rand) => [ints(rand, randInt(rand, 1, 12), 0, 2)],
  // A third of all pairs are out of order, so insertion or bubble sort makes billions of swaps. Splicing each 0 to the
  // front and each 2 to the back shifts memory fast, but at 2·10^5 it still took about 2 seconds in WebKit; at 5·10^5
  // it moves over six times as much.
  performanceCase: (rand) => [ints(rand, 500_000, 0, 2)],
  solve(nums: number[]) {
    let lo = 0;
    let mid = 0;
    let hi = nums.length - 1;
    while (mid <= hi) {
      if (nums[mid] === 0) {
        [nums[lo], nums[mid]] = [nums[mid], nums[lo]];
        lo++;
        mid++;
      } else if (nums[mid] === 2) {
        [nums[mid], nums[hi]] = [nums[hi], nums[mid]];
        hi--;
      } else mid++;
    }
    return nums;
  },
  approach:
    'Dutch national flag: keep 0s before `lo`, 1s from `lo` to `mid - 1` and 2s after `hi`. Look at `nums[mid]`: swap a 0 to `lo` and move both on, swap a 2 to `hi` and shrink `hi` without moving `mid` (the value swapped in is unseen), and step past a 1.',
  complexity: { time: 'O(n), one pass', space: 'O(1)' },
};

export const sortedSquares: CodingProblemDefinition = {
  statement: [
    '`nums` is sorted in non-decreasing order and may hold negative values and repeats. Return the squares of its values, also sorted in non-decreasing order.',
    'Aim for O(n) time: squaring and then sorting is O(n log n).',
  ],
  constraints: ['1 ≤ nums.length ≤ 5·10^5', '-10^4 ≤ nums[i] ≤ 10^4', 'nums is sorted in non-decreasing order'],
  entry: 'sortedSquares',
  params: [{ name: 'nums', type: 'int[]' }],
  returns: 'int[]',
  compare: 'exact',
  examples: [
    { args: [[-4, -1, 0, 3, 10]], explanation: 'The squares are 16, 1, 0, 9 and 100, which sort to 0, 1, 9, 16, 100' },
    { args: [[-7, -3, 2, 3, 11]] },
  ],
  edgeCases: [
    [[0]],
    [[-5]],
    [[-3, -2, -1]],
    [[1, 2, 3]],
    [[-10, 2, 4]],
    [[-2, -2, 0, 2, 2]],
    [[-10_000, 10_000]],
    [[-10_000, -9_999, 1]],
    [[-5, -3, -2, -1]],
    [[-1, 0, 0, 5, 6]],
  ],
  randomCase: (rand) => {
    const hi = randInt(rand, 1, 12);
    return [ints(rand, randInt(rand, 1, 10), -hi, hi).sort((a, b) => a - b)];
  },
  // Values spread evenly over the whole range: the negative half squares to a descending run, so inserting each square
  // into place in a sorted prefix, or picking the smallest remaining square each time, is quadratic. A binary search
  // with a splice insert took 1.8 to 2.9 seconds at 2·10^5, so the size is 5·10^5 to move over six times as much.
  performanceCase: (rand) => [ints(rand, 500_000, -10_000, 10_000).sort((a, b) => a - b)],
  solve(nums: number[]) {
    const out = Array<number>(nums.length);
    let lo = 0;
    let hi = nums.length - 1;
    for (let k = nums.length - 1; k >= 0; k--)
      if (Math.abs(nums[lo]) > Math.abs(nums[hi])) out[k] = nums[lo] * nums[lo++];
      else out[k] = nums[hi] * nums[hi--];
    return out;
  },
  approach:
    'The largest square is always at one of the two ends, so fill the result from the back: compare `|nums[lo]|` with `|nums[hi]|`, write the larger square at the next free slot from the end, and move that pointer inward.',
  complexity: { time: 'O(n)', space: 'O(n) for the result' },
};

/** `run` copies of `edge`, the non-palindromic middle, then `run` more: the mismatch sits past a long run from either end. */
const runAroundCore = (rand: () => number, run: number) => {
  let core: string;
  do core = Array.from({ length: randInt(rand, 2, 3) }, () => 'bcd'[randInt(rand, 0, 2)]).join('');
  while (core === [...core].reverse().join(''));
  return 'a'.repeat(run) + core + 'a'.repeat(run);
};

export const validPalindromeII: CodingProblemDefinition = {
  statement: [
    '`s` holds lowercase English letters. Return `true` if it reads the same forward and backward after deleting at most one character, and `false` otherwise.',
    'A string that is already a palindrome counts: deleting nothing is allowed.',
  ],
  constraints: ['1 ≤ s.length ≤ 2·10^5', 's holds only lowercase English letters'],
  entry: 'validPalindrome',
  params: [{ name: 's', type: 'string' }],
  returns: 'bool',
  compare: 'exact',
  examples: [
    { args: ['abca'], explanation: "Deleting the 'c' leaves \"aba\", a palindrome (deleting the 'b' works too)" },
    { args: ['aba'] },
    { args: ['abc'] },
  ],
  edgeCases: [
    ['a'],
    ['ab'],
    ['aa'],
    ['abc'],
    ['aab'],
    ['baa'],
    ['abcd'],
    ['deeee'],
    ['eeeed'],
    ['cbbcc'],
    ['ccbbc'],
    ['abdcba'],
    ['abccbda'],
    ['abaabab'],
    ['ebcbbececabbacecbbcbe'],
    ['aguokepatgbnvfqmgmlcupuufxoohdfpgjdmysgvhmvffcnqxjjxqncffvmhvgsymdjgpfdhooxfuupuculmgmqfvnbgtapekouga'],
  ],
  randomCase: (rand) => {
    const half = Array.from({ length: randInt(rand, 0, 5) }, () => 'abc'[randInt(rand, 0, 2)]);
    const letters = [...half, ...(rand() < 0.5 ? ['abc'[randInt(rand, 0, 2)]] : []), ...[...half].reverse()];
    for (let edits = randInt(rand, 0, 3); edits > 0; edits--)
      if (rand() < 0.6 || !letters.length) letters.splice(randInt(rand, 0, letters.length), 0, 'abc'[randInt(rand, 0, 2)]);
      else letters[randInt(rand, 0, letters.length - 1)] = 'abc'[randInt(rand, 0, 2)];
    return [letters.length ? letters.join('') : 'a'];
  },
  // Deleting any letter of either long run of a's shifts the middle by one, which shows up only after the whole run,
  // so trying each deletion in turn is quadratic whichever end it starts from.
  performanceCase: (rand) => [runAroundCore(rand, randInt(rand, 95_000, 99_998))],
  solve(s: string) {
    const isPalindrome = (lo: number, hi: number) => {
      for (; lo < hi; lo++, hi--) if (s[lo] !== s[hi]) return false;
      return true;
    };
    for (let lo = 0, hi = s.length - 1; lo < hi; lo++, hi--)
      if (s[lo] !== s[hi]) return isPalindrome(lo + 1, hi) || isPalindrome(lo, hi - 1);
    return true;
  },
  approach:
    'Move two pointers inward while the letters match. At the first mismatch one of the two letters must go, so check whether `s[lo+1..hi]` or `s[lo..hi-1]` is a palindrome; if they never mismatch, `s` already is one.',
  complexity: { time: 'O(n)', space: 'O(1)' },
};

export const moveZeroes: CodingProblemDefinition = {
  statement: [
    'Return `nums` with every 0 moved to the end, keeping the other values in their original relative order.',
    'Aim for one pass that rewrites `nums` in place with O(1) extra space.',
  ],
  constraints: ['1 ≤ nums.length ≤ 10^6', '-2^31 ≤ nums[i] ≤ 2^31 - 1'],
  entry: 'moveZeroes',
  params: [{ name: 'nums', type: 'int[]' }],
  returns: 'int[]',
  compare: 'exact',
  examples: [
    { args: [[0, 1, 0, 3, 12]], explanation: '1, 3 and 12 keep their order at the front, and the two 0s fill the last two slots' },
    { args: [[0]] },
  ],
  edgeCases: [
    [[5]],
    [[0, 0, 0]],
    [[1, 2, 3]],
    [[0, 0, 1]],
    [[1, 0, 0]],
    [[0, 0, 5, 0, 0, 7]],
    [[4, 0, -3, 0, 2]],
    [[-1, 0, 0, -1]],
    [[INT_MIN, 0, INT_MAX]],
  ],
  randomCase: (rand) => {
    const zeros = rand();
    return [Array.from({ length: randInt(rand, 1, 12) }, () => (rand() < zeros ? 0 : randInt(rand, -9, 9) || 1))];
  },
  // Half the values are 0 and spread evenly, so bubbling each 0 past the values after it is quadratic. Splicing the 0s
  // out is a fast memory shift, and doing it from the back took under a second at 2·10^5, so the size is 10^6: 25 times
  // the shifting. Small nonzero values keep the input a few megabytes.
  performanceCase: (rand) => [Array.from({ length: 1_000_000 }, () => (rand() < 0.5 ? 0 : randInt(rand, -999, 999) || 1))],
  solve(nums: number[]) {
    let slow = 0;
    for (let fast = 0; fast < nums.length; fast++)
      if (nums[fast] !== 0) {
        [nums[slow], nums[fast]] = [nums[fast], nums[slow]];
        slow++;
      }
    return nums;
  },
  approach:
    'A slow pointer marks where the next nonzero value belongs. A fast pointer scans every value, and each nonzero one swaps into the slow slot, which then moves on; the 0s it swaps out drift behind it to the end.',
  complexity: { time: 'O(n)', space: 'O(1)' },
};

export const removeDuplicatesII: CodingProblemDefinition = {
  statement: [
    '`nums` is sorted in non-decreasing order. Remove copies so that each value appears at most twice, keeping the values in order.',
    'Return the kept values as an array. Aim to write them over the front of `nums` in one pass with O(1) extra space.',
  ],
  constraints: ['1 ≤ nums.length ≤ 10^6', '-10^9 ≤ nums[i] ≤ 10^9', 'nums is sorted in non-decreasing order'],
  entry: 'removeDuplicates',
  params: [{ name: 'nums', type: 'int[]' }],
  returns: 'int[]',
  compare: 'exact',
  examples: [
    { args: [[1, 1, 1, 2, 2, 3]], explanation: 'The third 1 goes; the two 2s and the single 3 all stay' },
    { args: [[0, 0, 1, 1, 1, 1, 2, 3, 3]] },
  ],
  edgeCases: [
    [[7]],
    [[7, 7]],
    [[7, 7, 7]],
    [[1, 2, 3]],
    [[4, 4, 4, 4, 4, 4]],
    [[1, 1, 1, 2, 2, 2, 3]],
    [[1, 1, 1, 2, 2, 3]],
    [[-3, -3, -3, 0, 5, 5, 5, 5]],
    [[-1_000_000_000, -1_000_000_000, -1_000_000_000, 1_000_000_000]],
  ],
  randomCase: (rand) => {
    const nums: number[] = [];
    for (let value = randInt(rand, -5, 0), runs = randInt(rand, 1, 5); runs > 0; runs--, value += randInt(rand, 1, 3))
      nums.push(...Array<number>(randInt(rand, 1, 4)).fill(value));
    return [nums];
  },
  // Runs of one to six copies, so about half the values go, and splicing each extra copy out shifts everything
  // after it. That shift is a fast memory move, which finished in under 1.5 seconds at 2·10^5, so the size is 10^6.
  performanceCase: (rand) => {
    const n = 1_000_000;
    const nums: number[] = [];
    for (let value = randInt(rand, -1_000, 0); nums.length < n; value += randInt(rand, 1, 3))
      nums.push(...Array<number>(Math.min(randInt(rand, 1, 6), n - nums.length)).fill(value));
    return [nums];
  },
  solve(nums: number[]) {
    let kept = 0;
    for (const x of nums) if (kept < 2 || nums[kept - 2] !== x) nums[kept++] = x;
    return nums.slice(0, kept);
  },
  approach:
    'A slow pointer `kept` counts the values written to the front. A value may join unless it equals `nums[kept - 2]`: the array is sorted, so that would make it a third copy. Comparing with the kept prefix, not the original neighbors, stays right as the front is overwritten.',
  complexity: { time: 'O(n)', space: 'O(1) besides the returned copy' },
};

export const detectCycle: CodingProblemDefinition = {
  statement: [
    '`next` describes a linked list of nodes `0` to `n - 1`: the node after node `i` is `next[i]`, or there is none when `next[i]` is -1. Several nodes may point to the same node, and a node may point to itself.',
    'Start at node 0 and keep following `next`. Either the walk reaches a node whose `next` is -1, and you return -1, or it comes back to a node it has already visited and loops forever. In that case return the first node the walk visits twice: the node where the cycle begins.',
    'Nodes the walk from 0 never reaches do not matter, even if they form cycles of their own. Aim for O(1) extra space.',
  ],
  constraints: ['1 ≤ n ≤ 2·10^5', '-1 ≤ next[i] ≤ n - 1'],
  entry: 'detectCycle',
  params: [{ name: 'next', type: 'int[]' }],
  returns: 'int',
  compare: 'exact',
  examples: [
    { args: [[3, 0, 1, 2]], explanation: 'The walk goes 0 → 3 → 2 → 1 → 0, so node 0 starts the cycle' },
    { args: [[2, 4, 3, 1, 3]], explanation: 'The walk goes 0 → 2 → 3 → 1 → 4 → 3: node 3 is the first one visited twice' },
    { args: [[1, 2, -1, 0]], explanation: 'The walk 0 → 1 → 2 stops at node 2; node 3 is never reached' },
  ],
  edgeCases: [[[-1]], [[0]], [[1, 1]], [[1, 0]], [[1, -1]], [[-1, 1, 0]], [[2, 2, 1]], [[1, 2, 3, 4, 2]], [[4, 3, 0, 3, 3]]],
  randomCase: (rand) => {
    const n = randInt(rand, 1, 10);
    const order = [0, ...shuffle(rand, rangeOf(1, n - 1))];
    const path = order.slice(0, randInt(rand, 1, n));
    const next = rangeOf(0, n - 1).map(() => randInt(rand, -1, n - 1));
    path.forEach((node, k) => (next[node] = k + 1 < path.length ? path[k + 1] : rand() < 0.25 ? -1 : path[randInt(rand, 0, k)]));
    return [next];
  },
  // A tail and a cycle of about 10^5 nodes each, relabeled at random, and the rest pointing into the walk: scanning the
  // nodes visited so far at every step, or walking back from node 0 to check each one, is quadratic.
  performanceCase: (rand) => {
    const n = 200_000;
    const order = [0, ...shuffle(rand, rangeOf(1, n - 1))];
    const tail = randInt(rand, 90_000, 100_000);
    const path = order.slice(0, tail + randInt(rand, 90_000, 100_000));
    const next = order.map(() => path[randInt(rand, 0, path.length - 1)]);
    path.forEach((node, k) => (next[node] = k + 1 < path.length ? path[k + 1] : path[tail]));
    return [next];
  },
  solve(next: number[]) {
    const step = (node: number) => (node === -1 ? -1 : next[node]);
    let slow = 0;
    let fast = 0;
    do {
      slow = step(slow);
      fast = step(step(fast));
    } while (fast !== -1 && slow !== fast);
    if (fast === -1) return -1;
    for (slow = 0; slow !== fast; slow = next[slow], fast = next[fast]);
    return slow;
  },
  approach:
    "Floyd's cycle detection: move slow one node and fast two. If fast reaches -1 there is no cycle; otherwise they meet inside it. The meeting point is as far from the cycle's start, going forward, as node 0 is, so walk one pointer from node 0 and one from the meeting point, one step each, until they meet there.",
  complexity: { time: 'O(n)', space: 'O(1)' },
};
