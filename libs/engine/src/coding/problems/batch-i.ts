import { rangeOf } from '../../algorithms/input.js';
import { distinctInts, randInt, shuffle } from '../../algorithms/random.js';
import type { CodingProblemDefinition } from '../types.js';
import { MinHeap } from './min-heap.js';

/**
 * A tree on the nodes 0 to n - 1 whose first `spine` nodes form a path and whose other nodes each hang from a random
 * earlier node, shuffled, each edge written in a random direction. The longest path stays close to the spine's length.
 */
function spineTree(rand: () => number, n: number, spine: number): number[][] {
  const labels = shuffle(rand, rangeOf(0, n - 1));
  const edges = labels.slice(1).map((v, i) => {
    const u = labels[i + 1 < spine ? i : randInt(rand, 0, i)];
    return rand() < 0.5 ? [u, v] : [v, u];
  });
  return shuffle(rand, edges);
}

/** Two groups of letters, each chained by `==`, then many more random `==` within a group and `!=` across groups, shuffled. */
function splitLetters(rand: () => number, equalities: number, inequalities: number): string[] {
  const letters = shuffle(rand, [...'abcdefghijklmnopqrstuvwxyz']);
  const groups = [letters.slice(0, 13), letters.slice(13)];
  const pick = (group: string[]) => group[randInt(rand, 0, group.length - 1)];
  const out = groups.flatMap((group) => group.slice(1).map((letter, i) => `${group[i]}==${letter}`));
  while (out.length < equalities) {
    const group = groups[randInt(rand, 0, 1)];
    out.push(`${pick(group)}==${pick(group)}`);
  }
  for (let i = 0; i < inequalities; i++) {
    const [a, b] = rand() < 0.5 ? groups : [groups[1], groups[0]];
    out.push(`${pick(a)}!=${pick(b)}`);
  }
  return shuffle(rand, out);
}

/** The heights 0 to n² - 1: the lower half shuffled over the top rows and the upper half over the bottom rows. */
function lowTopHighBottom(rand: () => number, n: number): number[][] {
  const half = (n * n) / 2;
  const cells = [...shuffle(rand, rangeOf(0, half - 1)), ...shuffle(rand, rangeOf(half, n * n - 1))];
  return rangeOf(0, n - 1).map((r) => cells.slice(r * n, (r + 1) * n));
}

const shuffledGrid = (rand: () => number, n: number) => {
  const cells = shuffle(rand, rangeOf(0, n * n - 1));
  return rangeOf(0, n - 1).map((r) => cells.slice(r * n, (r + 1) * n));
};

const randomEquation = (rand: () => number, letters: string) =>
  `${letters[randInt(rand, 0, letters.length - 1)]}${rand() < 0.6 ? '==' : '!='}${letters[randInt(rand, 0, letters.length - 1)]}`;

export const permutations: CodingProblemDefinition = {
  statement: [
    'The values in `nums` are distinct. Return every permutation of `nums`, that is every ordering of all its values, each exactly once.',
    "The permutations can come in any order, but the numbers inside each one are in that permutation's order: `[1,2]` and `[2,1]` are two different permutations.",
  ],
  constraints: ['1 ≤ nums.length ≤ 9', '-10 ≤ nums[i] ≤ 10', 'values are distinct'],
  entry: 'permute',
  params: [{ name: 'nums', type: 'int[]' }],
  returns: 'int[][]',
  compare: 'unordered',
  examples: [
    {
      args: [[1, 2, 3]],
      explanation: '3 choices for the first place, 2 for the second and 1 for the last make 3 × 2 × 1 = 6 permutations',
    },
    { args: [[0, 1]] },
    { args: [[1]] },
  ],
  edgeCases: [[[-7]], [[10, -10]], [[3, 1, 2]], [[4, -1, 0, 9]], [[5, 4, 3, 2, 1]]],
  randomCase: (rand) => [distinctInts(rand, randInt(rand, 1, 6), -10, 10)],
  // 9! = 362,880 permutations: comparing each new one with the ones already found, to skip a copy, is quadratic in that count.
  performanceCase: (rand) => [distinctInts(rand, 9, -10, 10)],
  solve(nums: number[]) {
    const out: number[][] = [];
    const path: number[] = [];
    const used = nums.map(() => false);
    const go = () => {
      if (path.length === nums.length) {
        out.push([...path]);
        return;
      }
      for (let i = 0; i < nums.length; i++) {
        if (used[i]) continue;
        used[i] = true;
        path.push(nums[i]);
        go();
        path.pop();
        used[i] = false;
      }
    };
    go();
    return out;
  },
  approach:
    'Backtrack: fill the positions one at a time, trying at each one every value not used yet, marking it used while exploring and unmarking it on the way back. Every leaf of this tree is one permutation. Swapping each value into place and swapping it back works too, without the used flags.',
  complexity: { time: 'O(n · n!)', space: 'O(n) plus the output' },
};

export const nQueensCount: CodingProblemDefinition = {
  statement: [
    'Place `n` queens on an n × n chessboard so that no two attack each other: no two share a row, a column or a diagonal in either direction. Return the number of such placements.',
    'Placements that are rotations or mirror images of each other count separately. For `n` of 2 or 3 no placement exists, so return 0.',
  ],
  constraints: ['1 ≤ n ≤ 11'],
  entry: 'totalNQueens',
  params: [{ name: 'n', type: 'int' }],
  returns: 'int',
  compare: 'exact',
  examples: [
    {
      args: [4],
      explanation: 'Queens in columns 1, 3, 0, 2 of rows 0 to 3, and the mirror image 2, 0, 3, 1, are the only two placements',
    },
    { args: [1], explanation: 'One queen on a one-square board attacks nothing' },
  ],
  edgeCases: [[2], [3], [5], [6], [8]],
  randomCase: (rand) => [randInt(rand, 1, 8)],
  performanceCase: () => [11],
  solve(n: number) {
    const full = (1 << n) - 1;
    const place = (columns: number, left: number, right: number): number => {
      if (columns === full) return 1;
      let count = 0;
      for (let free = full & ~(columns | left | right); free; free &= free - 1) {
        const bit = free & -free;
        count += place(columns | bit, ((left | bit) << 1) & full, (right | bit) >> 1);
      }
      return count;
    };
    return place(0, 0, 0);
  },
  approach:
    'Backtrack row by row: put the next queen in a column no earlier queen attacks, recurse, and remove it. Keep the columns and both diagonals in use in sets, a diagonal named by `r - c` or `r + c`, so each check is O(1). Bitmasks of the free columns make it faster still.',
  complexity: { time: 'O(n!)', space: 'O(n)' },
};

export const minimumHeightTrees: CodingProblemDefinition = {
  statement: [
    '`edges` describes a tree on `n` nodes labeled 0 to `n - 1`: each `[a, b]` is an undirected edge, and every two nodes are joined by exactly one path.',
    'Rooting the tree at a node gives it a height, the number of edges on the longest path from that root down to a leaf. Return every node whose rooted tree has the smallest height, in any order. There are always one or two of them; a single node with no edges is its own answer.',
  ],
  constraints: [
    '1 ≤ n ≤ 10^5',
    'edges.length = n - 1',
    '0 ≤ a, b < n and a ≠ b',
    'The edges form a tree',
    'No path in the tree has more than 6,000 nodes, so a recursive DFS stays within the stack',
  ],
  entry: 'findMinHeightTrees',
  params: [
    { name: 'n', type: 'int' },
    { name: 'edges', type: 'int[][]' },
  ],
  returns: 'int[]',
  compare: 'unordered',
  examples: [
    {
      args: [
        4,
        [
          [1, 0],
          [1, 2],
          [1, 3],
        ],
      ],
      explanation: 'Rooted at node 1 the tree has height 1; rooted at any leaf it has height 2',
    },
    {
      args: [
        6,
        [
          [3, 0],
          [3, 1],
          [3, 2],
          [3, 4],
          [5, 4],
        ],
      ],
      explanation: 'The longest path 0 → 3 → 4 → 5 has two middle nodes, and each gives height 2',
    },
  ],
  edgeCases: [
    [1, []],
    [2, [[0, 1]]],
    [
      3,
      [
        [2, 1],
        [0, 1],
      ],
    ],
    [
      5,
      [
        [0, 1],
        [0, 2],
        [0, 3],
        [0, 4],
      ],
    ],
    [
      5,
      [
        [0, 1],
        [1, 2],
        [2, 3],
        [3, 4],
      ],
    ],
    [
      7,
      [
        [0, 1],
        [0, 2],
        [0, 3],
        [3, 4],
        [4, 5],
        [5, 6],
      ],
    ],
  ],
  randomCase: (rand) => {
    const n = randInt(rand, 1, 10);
    return [n, spineTree(rand, n, randInt(rand, 1, n))];
  },
  // A breadth-first search from every node makes 10^10 visits.
  performanceCase: (rand) => [100_000, spineTree(rand, 100_000, 5_000)],
  solve(n: number, edges: number[][]) {
    if (n === 1) return [0];
    const neighbors: number[][] = Array.from({ length: n }, () => []);
    for (const [a, b] of edges) {
      neighbors[a].push(b);
      neighbors[b].push(a);
    }
    const degree = neighbors.map((list) => list.length);
    let leaves = rangeOf(0, n - 1).filter((node) => degree[node] === 1);
    for (let remaining = n; remaining > 2;) {
      remaining -= leaves.length;
      const next: number[] = [];
      for (const leaf of leaves) for (const node of neighbors[leaf]) if (--degree[node] === 1) next.push(node);
      leaves = next;
    }
    return leaves;
  },
  approach:
    'The answers are the middle one or two nodes of a longest path. Peel the tree like an onion: remove every current leaf at once, which makes new leaves, and repeat while more than two nodes remain. The last layer is the answer. Removing the leaves one at a time and stopping as soon as two nodes remain is wrong, since a layer must go whole.',
  complexity: { time: 'O(n)', space: 'O(n)' },
};

export const equalityEquations: CodingProblemDefinition = {
  statement: [
    'Each string in `equations` has 4 characters and relates two variables, each a lowercase letter: `"a==b"` says `a` and `b` are equal, and `"a!=b"` says they differ.',
    'Return true if you can give every variable an integer value so that all the equations hold at once, and false otherwise. Both sides can be the same letter: `"a==a"` always holds and `"a!=a"` never does.',
  ],
  constraints: [
    '1 ≤ equations.length ≤ 2·10^5',
    'equations[i].length = 4',
    'equations[i][0] and equations[i][3] are lowercase letters',
    'equations[i][1..2] is "==" or "!="',
  ],
  entry: 'equationsPossible',
  params: [{ name: 'equations', type: 'string[]' }],
  returns: 'bool',
  compare: 'exact',
  examples: [
    { args: [['a==b', 'b!=a']], explanation: 'The first equation makes a and b equal, so the second cannot hold' },
    { args: [['b==a', 'a==b']] },
    {
      args: [['a==b', 'b!=c', 'c==a']],
      explanation: 'a equals b and c equals a, so b equals c, which the second equation forbids',
    },
  ],
  edgeCases: [
    [['a==a']],
    [['a!=a']],
    [['a!=b']],
    [['c==c', 'b==d', 'x!=z']],
    [['a!=b', 'b==c', 'c==a']],
    [['a==b', 'b==c', 'c==d', 'd!=a']],
    [['a==b', 'c==d', 'a!=c', 'b!=d']],
    [['a==b', 'b!=b']],
  ],
  randomCase: (rand) => [Array.from({ length: randInt(rand, 1, 8) }, () => randomEquation(rand, 'abcde'))],
  // Searching the `==` equations from one side of every `!=`, over lists that keep each repeat, scans 10^10 entries.
  performanceCase: (rand) => [splitLetters(rand, 100_000, 100_000)],
  solve(equations: string[]) {
    const parent = rangeOf(0, 25);
    const find = (x: number): number => {
      while (parent[x] !== x) x = parent[x] = parent[parent[x]];
      return x;
    };
    const variable = (equation: string, at: number) => equation.charCodeAt(at) - 97;
    for (const e of equations) if (e[1] === '=') parent[find(variable(e, 0))] = find(variable(e, 3));
    return equations.every((e) => e[1] === '=' || find(variable(e, 0)) !== find(variable(e, 3)));
  },
  approach:
    'Two passes over a union-find of the 26 letters: first union the two sides of every `==`, then check that no `!=` has both sides under the same root. The order matters, since a `!=` can come before the equalities that break it.',
  complexity: { time: 'O(n·α(26)) for n equations', space: 'O(1)' },
};

export const swimRisingWater: CodingProblemDefinition = {
  statement: [
    '`grid` is an n × n grid holding each of the values 0 to n² - 1 exactly once: `grid[r][c]` is the height of that cell. Rain falls, and at time `t` the water everywhere is at depth `t`.',
    'You start on the top-left cell. At time `t` you can swim from a cell to a neighbor up, down, left or right when both cells have height at most `t`, and swimming takes no time. Return the least `t` at which you can reach the bottom-right cell. The start and end cells count too, so the answer is at least the height of each.',
  ],
  constraints: ['1 ≤ n ≤ 400', 'grid holds each of 0 to n² - 1 exactly once'],
  entry: 'swimInWater',
  params: [{ name: 'grid', type: 'int[][]' }],
  returns: 'int',
  compare: 'exact',
  examples: [
    {
      args: [
        [
          [0, 2],
          [1, 3],
        ],
      ],
      explanation: 'The bottom-right cell has height 3, so nothing earlier than time 3 can work, and at 3 every cell is open',
    },
    {
      args: [
        [
          [0, 1, 2, 3, 4],
          [24, 23, 22, 21, 5],
          [12, 13, 14, 15, 16],
          [11, 17, 18, 20, 19],
          [10, 9, 8, 7, 6],
        ],
      ],
      explanation:
        'Along the top row, down the right edge to 6, left to 10, and up to 16 in the middle row: at time 16 the whole route is open',
    },
  ],
  edgeCases: [
    [[[0]]],
    [
      [
        [3, 0],
        [1, 2],
      ],
    ],
    [
      [
        [0, 3],
        [2, 1],
      ],
    ],
    [
      [
        [0, 1, 2, 3, 4],
        [17, 18, 19, 20, 5],
        [10, 9, 8, 7, 6],
        [11, 21, 22, 23, 24],
        [12, 13, 14, 15, 16],
      ],
    ],
    [
      [
        [8, 0, 1],
        [7, 6, 2],
        [5, 4, 3],
      ],
    ],
  ],
  randomCase: (rand) => [shuffledGrid(rand, randInt(rand, 1, 5))],
  // Raising the water one step at a time with a fresh search, or Dijkstra with a linear scan for the lowest cell, takes
  // over 10^10 steps: the low half of the grid is open long before the high half lets anyone through.
  performanceCase: (rand) => [lowTopHighBottom(rand, 400)],
  solve(grid: number[][]) {
    const n = grid.length;
    const goal = n * n - 1;
    const seen = new Uint8Array(n * n);
    const heap = new MinHeap();
    heap.push([grid[0][0], 0]);
    seen[0] = 1;
    for (;;) {
      const [time, cell] = heap.pop();
      if (cell === goal) return time;
      const r = Math.floor(cell / n);
      const c = cell % n;
      const visit = (next: number, height: number) => {
        if (seen[next]) return;
        seen[next] = 1;
        heap.push([Math.max(time, height), next]);
      };
      if (r > 0) visit(cell - n, grid[r - 1][c]);
      if (r + 1 < n) visit(cell + n, grid[r + 1][c]);
      if (c > 0) visit(cell - 1, grid[r][c - 1]);
      if (c + 1 < n) visit(cell + 1, grid[r][c + 1]);
    }
  },
  approach:
    'Dijkstra where a path costs its highest cell: pop the cell with the lowest time needed to reach it, and push each unseen neighbor with the larger of that time and its height. The first time the bottom-right cell comes off the heap, its time is the answer. Binary search on `t` with a flood fill, or adding cells in height order to a union-find until the corners join, also works.',
  complexity: { time: 'O(n² log n)', space: 'O(n²)' },
};
