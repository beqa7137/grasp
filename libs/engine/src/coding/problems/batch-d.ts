import { rangeOf } from '../../algorithms/input.js';
import { randInt, shuffle } from '../../algorithms/random.js';
import type { TreeNode } from '../tree.js';
import type { CodingProblemDefinition } from '../types.js';
import { randomEdges } from './graph-inputs.js';
import { randomTree } from './inputs.js';
import { MinHeap } from './min-heap.js';

/**
 * Diagonal bands `band` cells wide: a step right or down within a band always climbs, so every cell starts about 2^band
 * increasing paths while none is longer than `band` cells.
 */
function bandedHeights(rand: () => number, rows: number, cols: number, band: number): number[][] {
  return rangeOf(0, rows - 1).map((r) => rangeOf(0, cols - 1).map((c) => ((r + c) % band) * 1_000 + randInt(rand, 0, 999)));
}

/** Cities split among `groups` provinces, each a random tree plus extra links, as a symmetric matrix. */
function provinceMatrix(rand: () => number, n: number, groups: number, extra: number): number[][] {
  const matrix = rangeOf(0, n - 1).map((i) => rangeOf(0, n - 1).map((j) => (i === j ? 1 : 0)));
  const link = (a: number, b: number) => (matrix[a][b] = matrix[b][a] = 1);
  const members: number[][] = Array.from({ length: groups }, () => []);
  for (let city = 0; city < n; city++) members[randInt(rand, 0, groups - 1)].push(city);
  for (const group of members) {
    const order = shuffle(rand, group);
    for (let i = 1; i < order.length; i++) link(order[i], order[randInt(rand, 0, i - 1)]);
    for (const a of group) for (const b of group) if (a < b && rand() < extra) link(a, b);
  }
  return matrix;
}

function flightsCase(rand: () => number, n: number, count: number, maxPrice: number): number[][] {
  return randomEdges(rand, n, count, true).map(([from, to]) => [from, to, randInt(rand, 1, maxPrice)]);
}

function distinctPair(rand: () => number, n: number): [number, number] {
  const src = randInt(rand, 0, n - 1);
  const dst = (src + randInt(rand, 1, n - 1)) % n;
  return [src, dst];
}

export const longestIncreasingPath: CodingProblemDefinition = {
  statement: [
    'Return the number of cells on the longest strictly increasing path in `matrix`. From a cell you may step up, down, left or right to a cell inside the grid, never diagonally, and every step must go to a strictly larger value.',
    'A single cell is a path of one cell, so the answer is at least 1. Two equal neighbors never extend a path.',
  ],
  constraints: [
    '1 ≤ rows, cols ≤ 200',
    '0 ≤ matrix[r][c] ≤ 10^9',
    'No increasing path has more than 100 cells, so a recursive DFS stays shallow',
  ],
  entry: 'longestIncreasingPath',
  params: [{ name: 'matrix', type: 'int[][]' }],
  returns: 'int',
  compare: 'exact',
  examples: [
    {
      args: [
        [
          [9, 9, 4],
          [6, 6, 8],
          [2, 1, 1],
        ],
      ],
      explanation: 'The path 1 → 2 → 6 → 9 climbs through four cells',
    },
    {
      args: [
        [
          [3, 4, 5],
          [3, 2, 6],
          [2, 2, 1],
        ],
      ],
      explanation: 'The path 3 → 4 → 5 → 6 climbs through four cells; moving diagonally is not allowed',
    },
    { args: [[[1]]] },
  ],
  edgeCases: [
    [
      [
        [5, 5],
        [5, 5],
      ],
    ],
    [[[1, 2, 3, 2, 1]]],
    [[[3], [2], [1], [2], [3], [4]]],
    [
      [
        [1, 2, 3],
        [8, 9, 4],
        [7, 6, 5],
      ],
    ],
    [
      [
        [9, 8, 7],
        [2, 1, 6],
        [3, 4, 5],
      ],
    ],
    [
      [
        [1, 3, 4, 5],
        [2, 0, 0, 0],
      ],
    ],
    [[[1_000_000_000, 0]]],
  ],
  randomCase: (rand) => {
    const cols = randInt(rand, 1, 6);
    return [Array.from({ length: randInt(rand, 1, 6) }, () => Array.from({ length: cols }, () => randInt(rand, 0, 9)))];
  },
  performanceCase: (rand) => [bandedHeights(rand, 200, 200, 100)],
  solve(matrix: number[][]) {
    const rows = matrix.length;
    const cols = matrix[0].length;
    const neighbors = (cell: number) => {
      const r = Math.floor(cell / cols);
      const c = cell % cols;
      const out: number[] = [];
      if (r > 0) out.push(cell - cols);
      if (r + 1 < rows) out.push(cell + cols);
      if (c > 0) out.push(cell - 1);
      if (c + 1 < cols) out.push(cell + 1);
      return out;
    };
    const value = (cell: number) => matrix[Math.floor(cell / cols)][cell % cols];
    const smaller = new Int32Array(rows * cols);
    for (let cell = 0; cell < rows * cols; cell++) for (const next of neighbors(cell)) if (value(next) < value(cell)) smaller[cell]++;
    const queue: number[] = [];
    for (let cell = 0; cell < rows * cols; cell++) if (smaller[cell] === 0) queue.push(cell);
    let layers = 0;
    for (let head = 0; head < queue.length; layers++) {
      const layerEnd = queue.length;
      for (; head < layerEnd; head++)
        for (const next of neighbors(queue[head])) if (value(next) > value(queue[head]) && --smaller[next] === 0) queue.push(next);
    }
    return layers;
  },
  approach:
    "Each step to a larger neighbor is an edge of a DAG over the cells. Kahn's algorithm peels it in layers: first every cell with no smaller neighbor, then every cell whose smaller neighbors are all peeled; the number of layers is the answer. A DFS from each cell that memoizes the longest path starting there also works.",
  complexity: { time: 'O(rows × cols)', space: 'O(rows × cols)' },
};

export const numberOfProvinces: CodingProblemDefinition = {
  statement: [
    'There are `n` cities. `isConnected` is an n × n matrix where `isConnected[i][j]` is 1 if cities `i` and `j` are directly connected and 0 if not. It is symmetric, and every `isConnected[i][i]` is 1.',
    'A province is a group of cities joined directly or through other cities, with no connection to any city outside the group. Return the number of provinces.',
  ],
  constraints: ['1 ≤ n ≤ 200', 'isConnected[i][j] is 0 or 1', 'isConnected[i][i] = 1', 'isConnected[i][j] = isConnected[j][i]'],
  entry: 'findCircleNum',
  params: [{ name: 'isConnected', type: 'int[][]' }],
  returns: 'int',
  compare: 'exact',
  examples: [
    {
      args: [
        [
          [1, 1, 0],
          [1, 1, 0],
          [0, 0, 1],
        ],
      ],
      explanation: 'Cities 0 and 1 form one province, and city 2 is a province on its own',
    },
    {
      args: [
        [
          [1, 0, 0],
          [0, 1, 0],
          [0, 0, 1],
        ],
      ],
    },
  ],
  edgeCases: [
    [[[1]]],
    [
      [
        [1, 1, 1],
        [1, 1, 1],
        [1, 1, 1],
      ],
    ],
    [
      [
        [1, 0, 1],
        [0, 1, 1],
        [1, 1, 1],
      ],
    ],
    [
      [
        [1, 0, 0, 1],
        [0, 1, 1, 1],
        [0, 1, 1, 0],
        [1, 1, 0, 1],
      ],
    ],
    [
      [
        [1, 1, 0, 0],
        [1, 1, 0, 0],
        [0, 0, 1, 1],
        [0, 0, 1, 1],
      ],
    ],
  ],
  randomCase: (rand) => {
    const n = randInt(rand, 1, 8);
    return [provinceMatrix(rand, n, randInt(rand, 1, n), 0.3)];
  },
  performanceCase: (rand) => [provinceMatrix(rand, 200, 30, 0.2)],
  solve(isConnected: number[][]) {
    const n = isConnected.length;
    const parent = Array.from({ length: n }, (_, i) => i);
    const find = (x: number): number => {
      while (parent[x] !== x) x = parent[x] = parent[parent[x]];
      return x;
    };
    let provinces = n;
    for (let i = 0; i < n; i++)
      for (let j = i + 1; j < n; j++) {
        if (!isConnected[i][j]) continue;
        const ri = find(i);
        const rj = find(j);
        if (ri !== rj) {
          parent[ri] = rj;
          provinces--;
        }
      }
    return provinces;
  },
  approach:
    'Union-find over the upper triangle of the matrix: start with `n` provinces and subtract one each time a 1 joins two different roots. A DFS or BFS from each unvisited city, reading its row for neighbors, also works.',
  complexity: { time: 'O(n²·α(n))', space: 'O(n)' },
};

export const cheapestFlights: CodingProblemDefinition = {
  statement: [
    'There are `n` cities labelled 0 to `n - 1`. Each `[from, to, price]` in `flights` is a one-way flight from city `from` to city `to` that costs `price`.',
    'Return the cheapest total price to fly from `src` to `dst` with at most `k` stops in between, that is at most `k + 1` flights. Return -1 if no such route exists.',
  ],
  constraints: [
    '2 ≤ n ≤ 100',
    '0 ≤ flights.length ≤ n·(n - 1)',
    '1 ≤ price ≤ 10^4',
    'from ≠ to, and no two flights share both from and to',
    '0 ≤ src, dst, k < n',
    'src ≠ dst',
  ],
  entry: 'findCheapestPrice',
  params: [
    { name: 'n', type: 'int' },
    { name: 'flights', type: 'int[][]' },
    { name: 'src', type: 'int' },
    { name: 'dst', type: 'int' },
    { name: 'k', type: 'int' },
  ],
  returns: 'int',
  compare: 'exact',
  examples: [
    {
      args: [
        4,
        [
          [0, 1, 100],
          [1, 2, 100],
          [2, 0, 100],
          [1, 3, 600],
          [2, 3, 200],
        ],
        0,
        3,
        1,
      ],
      explanation: '0 → 1 → 3 costs 700 with one stop; 0 → 1 → 2 → 3 costs only 400 but makes two stops',
    },
    {
      args: [
        3,
        [
          [0, 1, 100],
          [1, 2, 100],
          [0, 2, 500],
        ],
        0,
        2,
        1,
      ],
      explanation: 'One stop allows 0 → 1 → 2 for 200',
    },
    {
      args: [
        3,
        [
          [0, 1, 100],
          [1, 2, 100],
          [0, 2, 500],
        ],
        0,
        2,
        0,
      ],
      explanation: 'With no stops, only the direct flight for 500 is allowed',
    },
  ],
  edgeCases: [
    [2, [], 0, 1, 0],
    [2, [[0, 1, 7]], 0, 1, 0],
    [2, [[1, 0, 7]], 0, 1, 1],
    [
      3,
      [
        [0, 1, 1],
        [1, 2, 1],
      ],
      0,
      2,
      0,
    ],
    [
      5,
      [
        [0, 1, 1],
        [1, 2, 1],
        [0, 2, 10],
        [2, 3, 1],
        [3, 4, 1],
      ],
      0,
      4,
      2,
    ],
    [
      4,
      [
        [0, 1, 1],
        [0, 2, 5],
        [1, 2, 1],
        [2, 3, 1],
      ],
      0,
      3,
      1,
    ],
    [
      4,
      [
        [0, 1, 1],
        [1, 2, 1],
        [2, 3, 1],
        [0, 3, 100],
      ],
      0,
      3,
      0,
    ],
    [
      3,
      [
        [0, 1, 5],
        [1, 0, 5],
        [1, 2, 5],
        [0, 2, 20],
      ],
      0,
      2,
      2,
    ],
  ],
  randomCase: (rand) => {
    const n = randInt(rand, 2, 6);
    return [n, flightsCase(rand, n, randInt(rand, 0, n * (n - 1)), 20), ...distinctPair(rand, n), randInt(rand, 0, n - 1)];
  },
  performanceCase: (rand) => [100, flightsCase(rand, 100, 5_000, 10_000), ...distinctPair(rand, 100), randInt(rand, 6, 10)],
  solve(n: number, flights: number[][], src: number, dst: number, k: number) {
    const out: [number, number][][] = Array.from({ length: n }, () => []);
    for (const [from, to, price] of flights) out[from].push([to, price]);
    const best = new Float64Array(n * (k + 2)).fill(Infinity);
    best[src] = 0;
    const heap = new MinHeap();
    heap.push([0, src]);
    while (heap.size) {
      const [cost, state] = heap.pop();
      if (cost > best[state]) continue;
      const city = state % n;
      if (city === dst) return cost;
      const taken = (state - city) / n;
      if (taken > k) continue;
      for (const [to, price] of out[city]) {
        const next = (taken + 1) * n + to;
        if (cost + price < best[next]) {
          best[next] = cost + price;
          heap.push([best[next], next]);
        }
      }
    }
    return -1;
  },
  approach:
    'Dijkstra on states (city, flights taken): a cheaper route to a city that used more flights must not hide a pricier one with fewer, so each flight count keeps its own best price. The first time `dst` comes off the heap, its price is the answer. Bellman-Ford for `k + 1` rounds, each relaxing from a copy of the last round, also works.',
  complexity: { time: 'O(k·E·log(k·E)) for E flights', space: 'O(k·(n + E))' },
};

export const maxPathSum: CodingProblemDefinition = {
  statement: [
    'A path in a binary tree is a sequence of nodes where each pair of consecutive nodes is joined by an edge and no node appears twice. It has at least one node and need not pass through the root.',
    "A path's sum is the total of its nodes' values, which may be negative. Given the `root`, return the largest sum of any path.",
  ],
  constraints: ['1 ≤ number of nodes ≤ 10^5', '-1000 ≤ Node.val ≤ 1000', 'The tree is at most 100 levels deep'],
  entry: 'maxPathSum',
  params: [{ name: 'root', type: 'tree' }],
  returns: 'int',
  compare: 'exact',
  examples: [
    { args: [[1, 2, 3]], explanation: 'The path 2 → 1 → 3 sums to 6' },
    { args: [[-10, 9, 20, null, null, 15, 7]], explanation: 'The path 15 → 20 → 7 sums to 42 and skips the root' },
  ],
  edgeCases: [
    [[-3]],
    [[-2, -1]],
    [[2, -1]],
    [[1, -2, 3]],
    [[-1, -2, -3, -4, -5]],
    [[1, 2, null, 3, null, 4]],
    [[5, 4, 8, 11, null, 13, 4, 7, 2, null, null, null, 1]],
  ],
  randomCase: (rand) => [randomTree(rand, randInt(rand, 1, 12), -20, 20)],
  performanceCase: (rand) => [randomTree(rand, 100_000, -1000, 1000)],
  solve(root: TreeNode) {
    let best = root.val;
    const gain = (node: TreeNode | null): number => {
      if (!node) return 0;
      const left = Math.max(gain(node.left), 0);
      const right = Math.max(gain(node.right), 0);
      best = Math.max(best, node.val + left + right);
      return node.val + Math.max(left, right);
    };
    gain(root);
    return best;
  },
  approach:
    "A postorder DFS returns the best sum of a path that starts at each node and goes down, dropping a child whose best is negative. The best path that turns at a node adds its value to both children's kept sums; keep the largest of those outside the recursion, starting from the root's value rather than 0 so an all-negative tree still gets its largest node. Recomputing the downward sums at every node also passes, since these trees are at most 100 levels deep, but it takes O(n·h) time.",
  complexity: { time: 'O(n)', space: 'O(h) for a tree of height h' },
};
