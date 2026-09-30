import { rangeOf } from '../../algorithms/input.js';
import { distinctInts, randInt, shuffle } from '../../algorithms/random.js';
import type { CodingProblemDefinition } from '../types.js';

const MOD = 1_000_000_007;
const HATS = 40;

const popcount = (mask: number) => {
  let count = 0;
  for (; mask; mask &= mask - 1) count++;
  return count;
};

/** A connected graph on nodes 0 to n - 1 with extra edges beyond a random tree, as adjacency lists in random order. */
function connectedGraph(rand: () => number, n: number, extra: number): number[][] {
  const labels = shuffle(rand, rangeOf(0, n - 1));
  const pairs = new Set(labels.slice(1).map((v, i) => [labels[randInt(rand, 0, i)], v].sort((a, b) => a - b).join('-')));
  const target = Math.min(n - 1 + extra, (n * (n - 1)) / 2);
  while (pairs.size < target) {
    const [a, b] = distinctInts(rand, 2, 0, n - 1).sort((x, y) => x - y);
    pairs.add(`${a}-${b}`);
  }
  const graph: number[][] = Array.from({ length: n }, () => []);
  for (const pair of pairs) {
    const [a, b] = pair.split('-').map(Number);
    graph[a].push(b);
    graph[b].push(a);
  }
  return graph.map((next) => shuffle(rand, next));
}

/** A dense connected core of n - leaves nodes with each leaf joined to one core node, labelled in random order. */
function coreWithLeaves(rand: () => number, n: number, leaves: number, extra: number): number[][] {
  const core = connectedGraph(rand, n - leaves, extra);
  const graph = [...core, ...rangeOf(1, leaves).map(() => [] as number[])];
  for (let leaf = n - leaves; leaf < n; leaf++) {
    const at = randInt(rand, 0, n - leaves - 1);
    graph[leaf].push(at);
    graph[at].push(leaf);
  }
  const label = shuffle(rand, rangeOf(0, n - 1));
  const relabelled: number[][] = Array.from({ length: n }, () => []);
  graph.forEach((next, v) => {
    relabelled[label[v]] = shuffle(
      rand,
      next.map((u) => label[u]),
    );
  });
  return relabelled;
}

/** Values from lo to hi, none more than four times. */
function atMostFourEach(rand: () => number, n: number, lo: number, hi: number): number[] {
  const values: number[] = [];
  while (values.length < n) {
    const value = randInt(rand, lo, hi);
    if (values.filter((v) => v === value).length < 4) values.push(value);
  }
  return values;
}

/** n values in k groups with equal sums of at most maxTarget, shuffled; null when some value would appear over 4 times. */
function equalGroups(rand: () => number, n: number, k: number, maxTarget: number): number[] | null {
  const sizes: number[] = Array(k).fill(1);
  for (let extra = n - k; extra > 0; extra--) sizes[randInt(rand, 0, k - 1)]++;
  const target = randInt(rand, Math.max(...sizes), Math.max(maxTarget, ...sizes));
  const values = sizes.flatMap((size) => {
    const cuts = distinctInts(rand, size - 1, 1, target - 1).sort((a, b) => a - b);
    return [...cuts, target].map((cut, i) => cut - (i ? cuts[i - 1] : 0));
  });
  const counts = new Map<number, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  return Math.max(...counts.values()) <= 4 ? shuffle(rand, values) : null;
}

/** Whether nums splits into k groups of equal sum: `fill[mask]` is how full the current group is, or -1. */
function canPartition(nums: number[], k: number): boolean {
  const total = nums.reduce((sum, x) => sum + x, 0);
  if (total % k) return false;
  const target = total / k;
  const n = nums.length;
  const fill = new Int32Array(1 << n).fill(-1);
  fill[0] = 0;
  for (let mask = 0; mask < 1 << n; mask++) {
    if (fill[mask] < 0) continue;
    for (let j = 0; j < n; j++)
      if (!(mask & (1 << j)) && fill[mask] + nums[j] <= target) fill[mask | (1 << j)] = (fill[mask] + nums[j]) % target;
  }
  return fill[(1 << n) - 1] === 0;
}

export const minimumXorSum: CodingProblemDefinition = {
  statement: [
    'You are given two integer arrays `nums1` and `nums2` of the same length n. Their XOR sum adds `nums1[i] ^ nums2[i]` over every index i.',
    'Rearrange the elements of `nums2` so that the XOR sum is as small as possible, and return that sum.',
    'With n up to 14, trying all `n!` orders is far too slow. Aim for O(2ⁿ · n): let a bitmask say which values of `nums2` are already paired.',
  ],
  constraints: ['nums1.length = nums2.length = n', '1 ≤ n ≤ 14', '0 ≤ nums1[i], nums2[i] ≤ 10^7'],
  entry: 'minimumXorSum',
  params: [
    { name: 'nums1', type: 'int[]' },
    { name: 'nums2', type: 'int[]' },
  ],
  returns: 'int',
  compare: 'exact',
  examples: [
    {
      args: [
        [1, 2],
        [2, 3],
      ],
      explanation: 'Rearrange nums2 to [3, 2]: (1 ^ 3) + (2 ^ 2) = 2 + 0 = 2',
    },
    {
      args: [
        [1, 0, 3],
        [5, 3, 4],
      ],
      explanation: 'Rearrange nums2 to [5, 4, 3]: (1 ^ 5) + (0 ^ 4) + (3 ^ 3) = 4 + 4 + 0 = 8',
    },
  ],
  edgeCases: [
    [[0], [0]],
    [[10_000_000], [0]],
    [
      [5, 5],
      [5, 5],
    ],
    [
      [1, 2, 3],
      [3, 2, 1],
    ],
    [
      [1, 1, 1, 1],
      [0, 0, 0, 15],
    ],
    [
      [8, 4, 2, 1],
      [1, 2, 4, 8],
    ],
    [
      [0, 1, 2, 3, 4, 5, 6, 7],
      [7, 6, 5, 4, 3, 2, 1, 0],
    ],
    [
      [10_000_000, 9_999_999, 1],
      [1, 10_000_000, 16_777],
    ],
  ],
  randomCase: (rand) => {
    const n = randInt(rand, 1, 7);
    const hi = rand() < 0.5 ? 15 : 10_000_000;
    const values = () => Array.from({ length: n }, () => randInt(rand, 0, hi));
    return [values(), values()];
  },
  // 14 values: trying every order of nums2 takes 14! · 14, about 1.2e12 steps.
  performanceCase: (rand) => {
    const values = () => Array.from({ length: 14 }, () => randInt(rand, 0, 10_000_000));
    return [values(), values()];
  },
  solve(nums1: number[], nums2: number[]) {
    const n = nums1.length;
    const dp = new Float64Array(1 << n).fill(Infinity);
    dp[0] = 0;
    for (let mask = 0; mask < (1 << n) - 1; mask++) {
      const i = popcount(mask);
      for (let j = 0; j < n; j++) {
        if (mask & (1 << j)) continue;
        const to = mask | (1 << j);
        dp[to] = Math.min(dp[to], dp[mask] + (nums1[i] ^ nums2[j]));
      }
    }
    return dp[(1 << n) - 1];
  },
  approach:
    "Pair `nums1` in order, and let bit j of `mask` say `nums2[j]` is used. Then `popcount(mask)` values are paired, so the next index is `i = popcount(mask)` and `dp[mask]` alone is the state. From each mask, try every free j: `dp[mask | 1 << j]` takes the min with `dp[mask]` plus `nums1[i] ^ nums2[j]`. Counting masks up from 0 fills each one before any mask built from it. In Python, `bin(mask).count('1')` counts the bits.",
  complexity: { time: 'O(2ⁿ · n)', space: 'O(2ⁿ)' },
};

export const partitionKSubsets: CodingProblemDefinition = {
  statement: [
    'Return `true` if the values in `nums` can be split into `k` groups whose sums are all equal, and `false` otherwise. Every value goes into exactly one group.',
    'With at most 16 values, a bitmask of the values placed so far is a small enough state. Aim for O(2ⁿ · n).',
  ],
  constraints: ['1 ≤ k ≤ nums.length ≤ 16', '1 ≤ nums[i] ≤ 10^4', 'No value appears more than 4 times'],
  entry: 'canPartitionKSubsets',
  params: [
    { name: 'nums', type: 'int[]' },
    { name: 'k', type: 'int' },
  ],
  returns: 'bool',
  compare: 'exact',
  examples: [
    { args: [[4, 3, 2, 3, 5, 2, 1], 4], explanation: 'Each group sums to 5: [5], [1, 4], [2, 3] and [2, 3]' },
    { args: [[1, 2, 3, 4], 3], explanation: 'The total, 10, does not split into 3 equal sums' },
  ],
  edgeCases: [
    [[1], 1],
    [[5, 5, 5, 5], 4],
    [[2, 2, 2, 2, 3, 4, 5], 4],
    [[1, 1, 1, 9], 3],
    [[2, 2, 4, 4, 6, 6], 4],
    [[4, 4, 4, 6, 6, 6], 5],
    [[1, 1, 1, 1, 2, 2, 2, 2], 4],
    [[4, 4, 6, 2, 3, 8, 10, 2, 10, 7], 4],
    [[1, 2, 3, 4, 5, 6, 7, 8, 9], 3],
    [[3, 3, 3, 3, 4, 4, 4, 4], 2],
    [[3, 3, 2, 2, 2, 2], 2],
    [[10_000, 10_000, 10_000, 10_000, 9_999, 1], 5],
    [[7, 6, 5, 4, 3, 2, 1], 7],
  ],
  randomCase: (rand) => {
    const n = randInt(rand, 1, 9);
    const k = randInt(rand, 1, Math.min(n, 4));
    const groups = rand() < 0.5 ? equalGroups(rand, n, k, 12) : null;
    return [groups ?? atMostFourEach(rand, n, 1, 10), k];
  },
  // k equal groups, then one value moved by d into another: many subsets still reach the target, so searches get far
  // before failing, but no split works. It rules out unpruned enumeration, which tries every group for every value, kⁿ
  // steps and 4.3e9 at the least.
  performanceCase: (rand) => {
    for (;;) {
      const k = randInt(rand, 4, 6);
      const nums = equalGroups(rand, 16, k, 2_000);
      if (!nums) continue;
      const [a, b] = distinctInts(rand, 2, 0, 15);
      const d = randInt(rand, 1, 5);
      [nums[a], nums[b]] = [nums[a] + d, nums[b] - d];
      if (
        nums[b] >= 1 &&
        Math.max(...nums) <= 10_000 &&
        nums.every((x) => nums.filter((y) => y === x).length <= 4) &&
        !canPartition(nums, k)
      )
        return [nums, k];
    }
  },
  solve: canPartition,
  approach:
    'If the total does not divide by k, return false; otherwise each group must sum to `target = total / k`. Fill the groups one at a time and let `mask` mark the values placed: they fill some groups exactly and part of one more, so `fill[mask]`, how full that group is, depends on the mask alone. From each reachable mask, add value j only if `fill[mask] + nums[j]` is at most target; the new fill is that sum modulo target. The answer is whether the full mask is reachable. Backtracking also passes when it sorts the values from largest and never tries a value in a second empty group.',
  complexity: { time: 'O(2ⁿ · n)', space: 'O(2ⁿ)' },
};

export const shortestPathAllNodes: CodingProblemDefinition = {
  statement: [
    'An undirected, connected graph has `n` nodes labelled 0 to `n - 1`, and `graph[i]` lists the nodes joined to node i by an edge.',
    'Return the length of the shortest path that visits every node. The path may start and end at any node, visit a node more than once and use an edge more than once; its length is the number of edges it walks.',
    'With n up to 12, trying every order of the nodes is too slow: `12!` is about 479 million. Aim for O(2ⁿ · n²) with a BFS whose state is a node together with the set of nodes visited.',
  ],
  constraints: [
    'n = graph.length',
    '1 ≤ n ≤ 12',
    '0 ≤ graph[i].length < n',
    'graph[i] does not contain i, nor any node twice',
    'If graph[a] contains b, then graph[b] contains a',
    'The graph is connected',
  ],
  entry: 'shortestPathLength',
  params: [{ name: 'graph', type: 'int[][]' }],
  returns: 'int',
  compare: 'exact',
  examples: [
    { args: [[[1, 2, 3], [0], [0], [0]]], explanation: 'One shortest path is 1-0-2-0-3' },
    { args: [[[1], [0, 2, 4], [1, 3, 4], [2], [1, 2]]], explanation: 'One shortest path is 0-1-4-2-3' },
  ],
  edgeCases: [
    [[[]]],
    [[[1], [0]]],
    [[[1], [0, 2], [1, 3], [2, 4], [3]]],
    [[[1, 2, 3, 4, 5], [0], [0], [0], [0], [0]]],
    [
      [
        [1, 2, 3, 4],
        [0, 2, 3, 4],
        [0, 1, 3, 4],
        [0, 1, 2, 4],
        [0, 1, 2, 3],
      ],
    ],
    [
      [
        [1, 5],
        [0, 2],
        [1, 3],
        [2, 4],
        [3, 5],
        [4, 0],
      ],
    ],
    [[[1, 3, 5], [0, 2], [1], [0, 4], [3], [0, 6], [5]]],
    [[[1], [0, 2, 3], [1], [1, 4], [3, 5, 6], [4], [4, 7], [6]]],
  ],
  randomCase: (rand) => {
    const n = randInt(rand, 1, 8);
    return [connectedGraph(rand, n, randInt(rand, 0, n))];
  },
  // 12 nodes: every order of first visits is 12! · 12, about 5.7e9 steps. Three leaves on a dense core of nine mean no path
  // visits each node once, so the answer is at least n and a search over orders cannot stop early at n - 1.
  performanceCase: (rand) => [coreWithLeaves(rand, 12, 3, randInt(rand, 20, 28))],
  solve(graph: number[][]) {
    const n = graph.length;
    const full = (1 << n) - 1;
    const seen = new Uint8Array(n << n);
    let frontier: number[] = [];
    for (let i = 0; i < n; i++) {
      seen[(i << n) | (1 << i)] = 1;
      frontier.push((i << n) | (1 << i));
    }
    for (let steps = 0; ; steps++) {
      const next: number[] = [];
      for (const state of frontier) {
        const [node, mask] = [state >> n, state & full];
        if (mask === full) return steps;
        for (const to of graph[node]) {
          const key = (to << n) | mask | (1 << to);
          if (!seen[key]) {
            seen[key] = 1;
            next.push(key);
          }
        }
      }
      frontier = next;
    }
  },
  approach:
    'Run BFS over states (node, mask), where bit j of `mask` says node j has been visited. Start from every node at once, `(i, 1 << i)` at distance 0, and step along each edge to `(next, mask | 1 << next)`, skipping states already seen. The first state whose mask has all n bits set is reached by the shortest path. There are n · 2ⁿ states, and each scans the edges of its node.',
  complexity: { time: 'O(2ⁿ · n²)', space: 'O(2ⁿ · n)' },
};

export const maxStudents: CodingProblemDefinition = {
  statement: [
    "`seats` is a classroom of m rows and n columns, where `'.'` is a good seat and `'#'` is a broken one.",
    'A student can see the answers of the students next to them on the left and on the right, and of those diagonally in front of them on the left and on the right, one row up. They cannot see the student directly in front of or behind them.',
    "Return the most students you can seat in good seats so that no student can see another's answers. With at most 8 columns, the students in one row fit in a bitmask: aim for O(m · 4ⁿ).",
  ],
  constraints: ['seats has m rows and n columns', '1 ≤ m, n ≤ 8', "Each seat is '.' or '#'"],
  entry: 'maxStudents',
  params: [{ name: 'seats', type: 'char[][]' }],
  returns: 'int',
  compare: 'exact',
  examples: [
    {
      args: [
        [
          ['#', '.', '#', '#', '.', '#'],
          ['.', '#', '#', '#', '#', '.'],
          ['#', '.', '#', '#', '.', '#'],
        ],
      ],
      explanation: 'Seat the four good seats of rows 0 and 2; a student in row 1 would see one in row 0',
    },
    {
      args: [
        [
          ['.', '#'],
          ['#', '#'],
          ['#', '.'],
          ['#', '#'],
          ['.', '#'],
        ],
      ],
      explanation: 'No two good seats are side by side or diagonal, so all three can be used',
    },
    {
      args: [
        [
          ['#', '.', '.', '.', '#'],
          ['.', '#', '.', '#', '.'],
          ['.', '.', '#', '.', '.'],
          ['.', '#', '.', '#', '.'],
          ['#', '.', '.', '.', '#'],
        ],
      ],
      explanation: 'Seat every good seat in columns 0, 2 and 4',
    },
  ],
  edgeCases: [
    [[['.']]],
    [[['#']]],
    [[['.', '.']]],
    [[['.'], ['.']]],
    [
      [
        ['.', '.'],
        ['.', '.'],
      ],
    ],
    [
      [
        ['.', '.', '.'],
        ['.', '.', '.'],
        ['.', '.', '.'],
      ],
    ],
    [[['.', '.', '.', '.']]],
    [
      [
        ['#', '.', '.'],
        ['.', '.', '.'],
      ],
    ],
    [
      [
        ['#', '#', '#', '#'],
        ['#', '#', '#', '#'],
      ],
    ],
    [
      [
        ['.', '#', '.', '.'],
        ['.', '.', '#', '.'],
        ['#', '.', '.', '.'],
        ['.', '.', '.', '#'],
      ],
    ],
  ],
  randomCase: (rand) => {
    const [m, n] = [randInt(rand, 1, 4), randInt(rand, 1, 4)];
    const broken = rand() * 0.5;
    return [Array.from({ length: m }, () => Array.from({ length: n }, () => (rand() < broken ? '#' : '.')))];
  },
  // 8 × 8 with at most four broken seats: backtracking seat by seat reaches every seating where no student sees another,
  // over 4e9 of them.
  performanceCase: (rand) => {
    const seats = Array.from({ length: 8 }, () => Array<string>(8).fill('.'));
    for (let k = randInt(rand, 0, 4); k > 0; k--) seats[randInt(rand, 0, 7)][randInt(rand, 0, 7)] = '#';
    return [seats];
  },
  solve(seats: string[][]) {
    const n = seats[0].length;
    let best = new Int32Array(1 << n).fill(-1);
    best[0] = 0;
    for (const row of seats) {
      const good = row.reduce((mask, seat, c) => (seat === '.' ? mask | (1 << c) : mask), 0);
      const next = new Int32Array(1 << n).fill(-1);
      for (let mask = 0; mask < 1 << n; mask++) {
        if ((mask & ~good) !== 0 || (mask & (mask >> 1)) !== 0) continue;
        for (let prev = 0; prev < 1 << n; prev++) {
          if (best[prev] < 0 || (mask & (prev << 1)) !== 0 || (mask & (prev >> 1)) !== 0) continue;
          next[mask] = Math.max(next[mask], best[prev] + popcount(mask));
        }
      }
      best = next;
    }
    return Math.max(...best);
  },
  approach:
    'Let a mask be the seats taken in one row. It is valid for its row when every set bit is a good seat and no two bits are neighbours, so `mask & (mask >> 1)` is 0. It fits the row before, `prev`, when `mask & (prev << 1)` and `mask & (prev >> 1)` are both 0: those are the two diagonals. `dp[row][mask]` is the most students in the rows so far with this row seated as mask: the best `dp[row - 1][prev]` over the masks that fit, plus the bits of mask. Keep only the previous row.',
  complexity: { time: 'O(m · 4ⁿ)', space: 'O(2ⁿ)' },
};

export const hatsToPeople: CodingProblemDefinition = {
  statement: [
    'There are `n` people and 40 kinds of hats, labelled 1 to 40, and `hats[i]` lists the hats that person i likes.',
    'Return the number of ways the n people can each wear one hat they like with no two people wearing the same hat. Two ways differ when some person wears a different hat. The answer can be large, so return it modulo 10^9 + 7.',
    'With at most 10 people but 40 hats, put the people in the bitmask, not the hats: aim for O(40 · 2ⁿ · n).',
  ],
  constraints: ['n = hats.length', '1 ≤ n ≤ 10', '1 ≤ hats[i].length ≤ 40', '1 ≤ hats[i][j] ≤ 40', 'hats[i] holds no hat twice'],
  entry: 'numberWays',
  params: [{ name: 'hats', type: 'int[][]' }],
  returns: 'int',
  compare: 'exact',
  examples: [
    { args: [[[3, 4], [4, 5], [5]]], explanation: 'Hat 3 to person 0, hat 4 to person 1 and hat 5 to person 2' },
    {
      args: [
        [
          [3, 5, 1],
          [3, 5],
        ],
      ],
      explanation: '(3, 5), (5, 3), (1, 3) and (1, 5)',
    },
    {
      args: [
        [
          [1, 2, 3, 4],
          [1, 2, 3, 4],
          [1, 2, 3, 4],
          [1, 2, 3, 4],
        ],
      ],
      explanation: 'Every order of hats 1 to 4: 4! = 24',
    },
  ],
  edgeCases: [
    [[[1]]],
    [[[1], [1]]],
    [
      [
        [1, 2],
        [1, 2],
        [1, 2],
      ],
    ],
    [[rangeOf(1, HATS)]],
    [[[40], [39, 40], [38, 39, 40]]],
    [Array.from({ length: 10 }, () => rangeOf(1, 16))],
    [Array.from({ length: 10 }, (_, i) => [i + 1, i + 2])],
  ],
  randomCase: (rand) => {
    const pool = distinctInts(rand, randInt(rand, 1, 12), 1, HATS);
    return [Array.from({ length: randInt(rand, 1, 6) }, () => shuffle(rand, pool).slice(0, randInt(rand, 1, Math.min(5, pool.length))))];
  },
  // Ten people who each like at least 20 hats: backtracking person by person reaches every full assignment, over 2e13.
  performanceCase: (rand) => [Array.from({ length: 10 }, () => distinctInts(rand, randInt(rand, 20, HATS), 1, HATS))],
  solve(hats: number[][]) {
    const n = hats.length;
    const likedBy: number[][] = Array.from({ length: HATS + 1 }, () => []);
    hats.forEach((liked, person) => liked.forEach((hat) => likedBy[hat].push(person)));
    const ways = new Float64Array(1 << n);
    ways[0] = 1;
    for (let hat = 1; hat <= HATS; hat++)
      for (let mask = (1 << n) - 1; mask >= 0; mask--) {
        if (!ways[mask]) continue;
        for (const person of likedBy[hat]) {
          if (mask & (1 << person)) continue;
          const to = mask | (1 << person);
          ways[to] = (ways[to] + ways[mask]) % MOD;
        }
      }
    return ways[(1 << n) - 1];
  },
  approach:
    'A mask of the hats would need 2⁴⁰ states, but there are at most 10 people, so let bit p of `mask` say person p has a hat. Take the hats one at a time: `ways[mask]` counts the ways to give out the hats so far to exactly the people in mask. Hat h goes to nobody, or to one person p who likes it and has no hat yet, adding `ways[mask]` into `ways[mask | 1 << p]`. Read the counts from before hat h, from a copy or by going through the masks from high to low, so no hat goes to two people.',
  complexity: { time: 'O(40 · 2ⁿ · n)', space: 'O(2ⁿ)' },
};
