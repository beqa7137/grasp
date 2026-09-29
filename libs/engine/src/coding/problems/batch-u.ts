import { rangeOf } from '../../algorithms/input.js';
import { distinctInts, randInt, shuffle } from '../../algorithms/random.js';
import type { CodingProblemDefinition } from '../types.js';
import { nearMiddle } from './inputs.js';

const LETTERS = 'abcdefghijklmnopqrstuvwxyz';

const randomWord = (rand: () => number, alphabet: string, min: number, max: number) =>
  Array.from({ length: randInt(rand, min, max) }, () => alphabet[randInt(rand, 0, alphabet.length - 1)]).join('');

/**
 * A sequence with no 132 pattern, built from the right the way the stack solution reads it: each value is at least the
 * best middle candidate popped so far, so no value to its left can close a pattern.
 */
export function without132(rand: () => number, n: number, lo: number, step: number): number[] {
  const values = Array<number>(n);
  const stack: number[] = [];
  let third = lo;
  for (let i = n - 1; i >= 0; i--) {
    const value = third + randInt(rand, 0, step);
    while (stack.length && stack[stack.length - 1] < value) third = stack.pop()!;
    stack.push(value);
    values[i] = value;
  }
  return values;
}

const binaryGrid = (rand: () => number, rows: number, cols: number, ones: number) =>
  Array.from({ length: rows }, () => Array.from({ length: cols }, () => (rand() < ones ? '1' : '0')));

export const searchSuggestions: CodingProblemDefinition = {
  statement: [
    'A search box suggests products while `searchWord` is typed. After each letter, it suggests up to three products from `products` that start with the letters typed so far: the three that come first alphabetically, where a word comes before every longer word that starts with it.',
    'Return one list per letter of `searchWord`. List `i` holds the suggestions after its first `i + 1` letters, given as their indices in `products` and ordered alphabetically by product, or is empty when no product starts with those letters.',
    'A product equal to the letters typed so far counts as a match. The products are distinct and in no particular order.',
  ],
  constraints: [
    '1 ≤ products.length ≤ 3·10^5',
    '1 ≤ products[i].length ≤ 500',
    'at most 2·10^6 letters in all of products',
    '1 ≤ searchWord.length ≤ 500',
    'lowercase letters',
    'products are distinct',
  ],
  entry: 'suggestedProducts',
  params: [
    { name: 'products', type: 'string[]' },
    { name: 'searchWord', type: 'string' },
  ],
  returns: 'int[][]',
  compare: 'exact',
  examples: [
    {
      args: [['mobile', 'mouse', 'moneypot', 'monitor', 'mousepad'], 'mouse'],
      explanation:
        'After m and after mo, the first three alphabetically are mobile (0), moneypot (2) and monitor (3). From mou on, only mouse (1) and mousepad (4) match',
    },
    { args: [['bags', 'baggage', 'banner', 'box', 'cloths'], 'bags'] },
    { args: [['havana'], 'tatiana'] },
  ],
  edgeCases: [
    [['a'], 'a'],
    [['a'], 'b'],
    [['b'], 'bbb'],
    [['abc', 'abd'], 'axc'],
    [['ad', 'ac', 'ab', 'aa', 'a'], 'aa'],
    [['b', 'ab', 'aab', 'aaa'], 'a'],
    [['ca', 'c', 'cab', 'cb', 'cc'], 'cab'],
    [['mouse', 'mousetrap', 'mousepad', 'mouseover'], 'mousex'],
  ],
  randomCase: (rand) => {
    const products = new Set<string>();
    const count = randInt(rand, 1, 8);
    while (products.size < count) products.add(randomWord(rand, 'abc', 1, 4));
    const list = shuffle(rand, [...products]);
    const searchWord =
      rand() < 0.6
        ? list[randInt(rand, 0, list.length - 1)].slice(0, randInt(rand, 1, 4)) + randomWord(rand, 'abc', 0, 2)
        : randomWord(rand, 'abc', 1, 5);
    return [list, searchWord];
  },
  // Every prefix of the search word matches a 500-letter product, while 299,997 four-letter words all sort before it:
  // rescanning the products for each prefix costs 300,000 steps per letter. Products stay at 500 letters because freeing
  // a trie much deeper overflows the browser's stack in Pyodide.
  performanceCase: (rand) => {
    const searchWord = 'zz' + randomWord(rand, LETTERS, 498, 498);
    const other = (letter: string) => (letter === 'a' ? 'b' : 'a');
    // Below 26^4 - 676, where the four-letter words starting with zz begin.
    const short = distinctInts(rand, 299_997, 0, 456_299).map((k) =>
      [17_576, 676, 26, 1].map((place) => LETTERS[Math.floor(k / place) % 26]).join(''),
    );
    const long = [searchWord, searchWord.slice(0, -1) + other(searchWord.at(-1)!), searchWord.slice(0, 250) + other(searchWord[250])];
    return [shuffle(rand, [...short, ...long]), searchWord];
  },
  solve(products: string[], searchWord: string) {
    const order = rangeOf(0, products.length - 1).sort((a, b) => (products[a] < products[b] ? -1 : 1));
    let lo = 0;
    let hi = order.length;
    return [...searchWord].map((letter, i) => {
      while (lo < hi && !(products[order[lo]][i] >= letter)) lo++;
      while (lo < hi && products[order[hi - 1]][i] > letter) hi--;
      return order.slice(lo, Math.min(lo + 3, hi));
    });
  },
  approach:
    'Insert the products into a trie in alphabetical order, and at every node keep the first three indices that pass through it: those are the suggestions for that prefix. Then walk the trie with `searchWord`, one node per letter; once a letter has no child, every later list is empty. Sorting the products and narrowing the matching range from both ends, one letter at a time, also works, since the range only shrinks. Rescanning every product for each prefix costs products × letters.',
  complexity: { time: 'O(L log n + m)', space: 'O(L)' },
};

export const maximizeXor: CodingProblemDefinition = {
  statement: [
    'For each query `[x, m]` in `queries`, find the largest value of `x XOR nums[i]` over the values in `nums` that are at most `m`, where XOR is bitwise exclusive or. If every value in `nums` is greater than `m`, the answer to that query is -1.',
    'Return the answers in the order of the queries. Aim for about 30 steps per value and per query instead of trying every value for every query. In browser Python, trie nodes as two-slot lists run faster than dicts or objects.',
  ],
  constraints: ['1 ≤ nums.length, queries.length ≤ 10^5', 'queries[j] is [x, m]', '0 ≤ nums[i], x, m ≤ 10^9'],
  entry: 'maximizeXor',
  params: [
    { name: 'nums', type: 'int[]' },
    { name: 'queries', type: 'int[][]' },
  ],
  returns: 'int[]',
  compare: 'exact',
  examples: [
    {
      args: [
        [0, 1, 2, 3, 4],
        [
          [3, 1],
          [1, 3],
          [5, 6],
        ],
      ],
      explanation:
        'Only 0 and 1 are at most 1, and 3 XOR 0 is 3 while 3 XOR 1 is 2, so the first answer is 3. For [5, 6] every value counts, and 5 XOR 2 is 7',
    },
    {
      args: [
        [5, 2, 4, 6, 6, 3],
        [
          [12, 4],
          [8, 1],
          [6, 3],
        ],
      ],
      explanation: 'No value is at most 1, so the second answer is -1',
    },
  ],
  edgeCases: [
    [[0], [[0, 0]]],
    [[5], [[1, 4]]],
    [[5], [[1, 5]]],
    [[1, 6], [[1, 5]]],
    [
      [3, 3, 3],
      [
        [3, 3],
        [0, 2],
        [4, 1_000_000_000],
      ],
    ],
    [[1_000_000_000], [[0, 1_000_000_000]]],
    [
      [0, 1_000_000_000],
      [
        [1_000_000_000, 999_999_999],
        [536_870_912, 1_000_000_000],
      ],
    ],
    [
      [1, 2, 4, 8],
      [
        [15, 0],
        [15, 1],
        [7, 8],
        [0, 3],
      ],
    ],
  ],
  randomCase: (rand) => {
    const value = () => (rand() < 0.15 ? randInt(rand, 0, 1_000_000_000) : randInt(rand, 0, 31));
    return [Array.from({ length: randInt(rand, 1, 8) }, value), Array.from({ length: randInt(rand, 1, 6) }, () => [value(), value()])];
  },
  // Most limits admit every value, so checking every allowed value per query is about n × q steps.
  performanceCase: (rand) => {
    const nums = Array.from({ length: 70_000 }, () => randInt(rand, 0, 1_000_000_000));
    const largest = nums.reduce((a, b) => Math.max(a, b));
    const queries = Array.from({ length: 70_000 }, () => [
      randInt(rand, 0, 1_000_000_000),
      rand() < 0.9 ? randInt(rand, largest, 1_000_000_000) : randInt(rand, 0, 1_000_000_000),
    ]);
    return [nums, queries];
  },
  solve(nums: number[], queries: number[][]) {
    const sorted = [...nums].sort((a, b) => a - b);
    const order = rangeOf(0, queries.length - 1).sort((a, b) => queries[a][1] - queries[b][1]);
    const child = new Int32Array(2 * (30 * nums.length + 1));
    const answer = Array<number>(queries.length).fill(-1);
    let nodes = 1;
    let k = 0;
    for (const j of order) {
      const [x, m] = queries[j];
      for (; k < sorted.length && sorted[k] <= m; k++) {
        let node = 0;
        for (let bit = 29; bit >= 0; bit--) {
          const slot = 2 * node + ((sorted[k] >> bit) & 1);
          if (!child[slot]) child[slot] = nodes++;
          node = child[slot];
        }
      }
      if (!k) continue;
      let xor = 0;
      let node = 0;
      for (let bit = 29; bit >= 0; bit--) {
        const opposite = 2 * node + (((x >> bit) & 1) ^ 1);
        if (child[opposite]) {
          xor |= 1 << bit;
          node = child[opposite];
        } else node = child[opposite ^ 1];
      }
      answer[j] = xor;
    }
    return answer;
  },
  approach:
    'Answer the queries offline, in increasing order of `m`: sort `nums`, and before each query insert into a binary trie, highest bit (bit 29) first, every value that is at most its `m`. Then walk the trie with `x`, taking the child with the opposite bit whenever there is one. An empty trie means -1. Keeping the smallest value under each trie node answers the queries online instead. Trying every value for every query costs n × q.',
  complexity: { time: 'O(n log n + q log q + 30·(n + q))', space: 'O(30·n)' },
};

export const singleNumberII: CodingProblemDefinition = {
  statement: [
    'In `nums`, every value appears exactly three times except one, which appears exactly once. Return that value.',
    'Values can be negative, and the copies of a value can be anywhere in the list. Aim for O(n) time and O(1) extra space: count each bit position modulo 3, or keep the bits seen once and the bits seen twice in two integers.',
  ],
  constraints: ['1 ≤ nums.length ≤ 2·10^5', 'nums.length is 3k + 1 for some k ≥ 0', '-2^31 ≤ nums[i] ≤ 2^31 - 1'],
  entry: 'singleNumber',
  params: [{ name: 'nums', type: 'int[]' }],
  returns: 'int',
  compare: 'exact',
  examples: [{ args: [[2, 2, 3, 2]], explanation: '2 appears three times and 3 once' }, { args: [[0, 1, 0, 1, 0, 1, 99]] }],
  edgeCases: [
    [[7]],
    [[-2_147_483_648]],
    [[0, 0, 0, 5]],
    [[5, 0, 0, 0]],
    [[1, 1, 1, 5]],
    [[-1, 2_147_483_647, 2_147_483_647, 2_147_483_647]],
    [[-2_147_483_648, -2_147_483_648, 3, -2_147_483_648]],
    [[-3, -3, -4, -3]],
    [[4, -4, 4, 9, 9, 4, 9]],
  ],
  randomCase: (rand) => {
    const k = randInt(rand, 0, 4);
    const [single, ...others] = distinctInts(rand, k + 1, -8, 8).map((x) => (rand() < 0.1 ? x * 250_000_000 : x));
    return [shuffle(rand, [single, ...others.flatMap((x) => [x, x, x])])];
  },
  // The single value sits in the middle fifth, so counting each value by scanning the list, from either end, is quadratic.
  performanceCase: (rand) => {
    const [single, ...others] = distinctInts(rand, 50_001, -2_147_483_648, 2_147_483_647);
    const nums = shuffle(
      rand,
      others.flatMap((x) => [x, x, x]),
    );
    nums.splice(nearMiddle(rand, nums.length), 0, single);
    return [nums];
  },
  solve(nums: number[]) {
    let ones = 0;
    let twos = 0;
    for (const x of nums) {
      ones = (ones ^ x) & ~twos;
      twos = (twos ^ x) & ~ones;
    }
    return ones;
  },
  approach:
    'Keep two bit masks: `ones` holds the bits seen once so far, modulo 3, and `twos` the bits seen twice. For each value, update `ones` with the value unless the bit is already in `twos`, then update `twos` with it unless the bit is now in `ones`. After the third copy of a bit, both masks clear it, so `ones` ends as the single value. Summing each bit position modulo 3 works too; in Python, rebuild the sign from bit 31. Counting each value with a scan is quadratic.',
  complexity: { time: 'O(n)', space: 'O(1)' },
};

export const minFlips: CodingProblemDefinition = {
  statement: [
    'A flip changes one bit of `a` or of `b`, from 0 to 1 or from 1 to 0. Return the fewest flips that make `(a OR b) == c`, where OR is bitwise or. `c` never changes.',
  ],
  constraints: ['0 ≤ a, b, c ≤ 2^31 - 1'],
  entry: 'minFlips',
  params: [
    { name: 'a', type: 'int' },
    { name: 'b', type: 'int' },
    { name: 'c', type: 'int' },
  ],
  returns: 'int',
  compare: 'exact',
  examples: [
    {
      args: [2, 6, 5],
      explanation:
        'In binary, a is 010, b is 110 and c is 101. Bit 0 needs one flip to 1, and bit 1 is set in both a and b but not in c, so both flip: 3 flips',
    },
    { args: [4, 2, 7], explanation: 'Only bit 0 is missing, and one flip sets it' },
    { args: [1, 2, 3] },
  ],
  edgeCases: [
    [0, 0, 0],
    [0, 0, 2_147_483_647],
    [2_147_483_647, 2_147_483_647, 0],
    [1_073_741_824, 0, 0],
    [1_073_741_824, 1_073_741_824, 1],
    [8, 8, 1],
    [7, 0, 0],
    [5, 5, 5],
  ],
  randomCase: (rand) => Array.from({ length: 3 }, () => (rand() < 0.2 ? randInt(rand, 0, 2_147_483_647) : randInt(rand, 0, 15))),
  performanceCase: (rand) => [randInt(rand, 0, 2_147_483_647), randInt(rand, 0, 2_147_483_647), randInt(rand, 0, 2_147_483_647)],
  solve(a: number, b: number, c: number) {
    let flips = 0;
    for (let bit = 0; bit < 31; bit++) {
      const [x, y, z] = [(a >> bit) & 1, (b >> bit) & 1, (c >> bit) & 1];
      flips += z ? 1 - (x | y) : x + y;
    }
    return flips;
  },
  approach:
    'The bits are independent, so check each of the 31 positions. Where `c` has a 1, one flip is needed only if both `a` and `b` have a 0 there. Where `c` has a 0, every 1 in `a` or `b` must flip, which is two flips when both have one. Counting the bits of `(a | b) ^ c` misses that double flip.',
  complexity: { time: 'O(31)', space: 'O(1)' },
};

export const find132pattern: CodingProblemDefinition = {
  statement: [
    'Return `true` if `nums` holds a 132 pattern: three indices `i < j < k` with `nums[i] < nums[k]` and `nums[k] < nums[j]`: the first of the three values is the smallest and the middle one is the largest. Otherwise return `false`.',
    'The indices need not be adjacent. The comparisons are strict, so equal values never form the pattern.',
  ],
  constraints: ['1 ≤ nums.length ≤ 2·10^5', '-10^9 ≤ nums[i] ≤ 10^9'],
  entry: 'find132pattern',
  params: [{ name: 'nums', type: 'int[]' }],
  returns: 'bool',
  compare: 'exact',
  examples: [
    { args: [[3, 1, 4, 2]], explanation: '1, 4 and 2 form the pattern: 1 is below 2, and 2 is below 4' },
    {
      args: [[1, 2, 3, 4]],
      explanation: 'The values only rise, so no later value falls between an earlier smaller one and the middle one',
    },
    { args: [[-1, 3, 2, 0]] },
  ],
  edgeCases: [
    [[1]],
    [[1, 2]],
    [[1, 3, 2]],
    [[1, 2, 1]],
    [[2, 2, 2]],
    [[4, 3, 2, 1]],
    [[1, 4, 0, 3]],
    [[3, 5, 0, 3, 4]],
    [[1, 0, 1, -4, -3]],
    [[-1_000_000_000, 1_000_000_000, 0]],
  ],
  randomCase: (rand) =>
    rand() < 0.4
      ? [without132(rand, randInt(rand, 1, 8), randInt(rand, -3, 0), 3)]
      : [Array.from({ length: randInt(rand, 3, 9) }, () => randInt(rand, -2, 9))],
  // No pattern exists, so an O(n²) search that takes each middle value in turn and scans to its right never stops early.
  performanceCase: (rand) => [without132(rand, 200_000, -1_000_000_000, 10_000)],
  solve(nums: number[]) {
    const stack: number[] = [];
    let third = -Infinity;
    for (let i = nums.length - 1; i >= 0; i--) {
      if (nums[i] < third) return true;
      while (stack.length && stack[stack.length - 1] < nums[i]) third = stack.pop()!;
      stack.push(nums[i]);
    }
    return false;
  },
  approach:
    'Scan from the right with a stack of values that decreases toward its top, and track `third`, the largest value popped so far: each popped value has a larger value to its left, the one that popped it, so it can serve as the 3 of the pattern. A value below `third` is then a valid 1. Pairing each middle value with the minimum to its left and scanning to its right for a value between them is quadratic.',
  complexity: { time: 'O(n)', space: 'O(n)' },
};

export const maximalRectangle: CodingProblemDefinition = {
  statement: [
    "`matrix` is a grid of `'0'` and `'1'` cells. Return the area of the largest rectangle, aligned with the grid, that holds only `'1'` cells, or 0 if there is no `'1'` at all.",
  ],
  constraints: ['1 ≤ rows ≤ 200', '1 ≤ cols ≤ 4·10^4', 'rows × cols ≤ 4·10^5', "matrix[r][c] is '0' or '1'"],
  entry: 'maximalRectangle',
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
      explanation: 'The last three columns of the middle two rows form a 2 × 3 rectangle of ones, area 6',
    },
    { args: [[['0']]] },
    { args: [[['1']]] },
  ],
  edgeCases: [
    [[['0', '0']]],
    [[['1', '1', '0', '1', '1', '1']]],
    [[['1'], ['1'], ['0'], ['1']]],
    [
      [
        ['1', '1', '1'],
        ['1', '1', '1'],
      ],
    ],
    [
      [
        ['1', '0', '1'],
        ['0', '1', '0'],
        ['1', '0', '1'],
      ],
    ],
    [
      [
        ['1', '1', '1'],
        ['1', '1', '0'],
        ['1', '1', '0'],
      ],
    ],
    [
      [
        ['0', '1', '1', '0'],
        ['1', '1', '1', '1'],
        ['1', '1', '1', '1'],
        ['0', '1', '1', '0'],
      ],
    ],
    [
      [
        ['1', '1', '1', '1', '1'],
        ['0', '1', '1', '1', '0'],
        ['0', '0', '1', '0', '0'],
        ['0', '0', '1', '0', '0'],
        ['0', '0', '1', '0', '0'],
        ['0', '0', '1', '0', '0'],
      ],
    ],
  ],
  randomCase: (rand) => [binaryGrid(rand, randInt(rand, 1, 6), randInt(rand, 1, 6), 0.7)],
  // Row 0 blanks every odd column, so each later row's histogram alternates between two heights and every lower bar spans
  // almost the whole row: expanding out from each bar, even skipping equal neighbors, is quadratic in the columns.
  performanceCase: (rand) => {
    const matrix = binaryGrid(rand, 10, 40_000, 1);
    for (let c = 1; c < 40_000; c += 2) matrix[0][c] = '0';
    for (let k = 0; k < 3; k++) matrix[9][randInt(rand, 0, 39_999)] = '0';
    return [matrix];
  },
  solve(matrix: string[][]) {
    const cols = matrix[0].length;
    const heights = new Int32Array(cols + 1);
    const stack = new Int32Array(cols + 1);
    let best = 0;
    for (const row of matrix) {
      for (let c = 0; c < cols; c++) heights[c] = row[c] === '1' ? heights[c] + 1 : 0;
      let size = 0;
      for (let c = 0; c <= cols; c++) {
        while (size && heights[stack[size - 1]] > heights[c]) {
          const height = heights[stack[--size]];
          best = Math.max(best, height * (c - (size ? stack[size - 1] : -1) - 1));
        }
        stack[size++] = c;
      }
    }
    return best;
  },
  approach:
    "Treat each row as the floor of a histogram: a column's bar is the run of `'1'` cells ending in that row, which grows by one or resets to 0 from the row above. The largest rectangle in each histogram comes from the monotonic stack of Largest Rectangle in Histogram, and the answer is the best over all rows. Expanding left and right from every bar instead is quadratic in the columns.",
  complexity: { time: 'O(rows · cols)', space: 'O(cols)' },
};
