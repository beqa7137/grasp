import { rangeOf } from '../../algorithms/input.js';
import { randInt, shuffle } from '../../algorithms/random.js';
import type { TreeNode } from '../tree.js';
import type { CodingProblemDefinition } from '../types.js';
import { randomTree } from './inputs.js';

function randomEdges(rand: () => number, n: number, count: number, directed: boolean): number[][] {
  const seen = new Set<string>();
  const edges: number[][] = [];
  for (let tries = 0; edges.length < count && tries < count * 4 + 20; tries++) {
    const a = randInt(rand, 0, n - 1);
    const b = randInt(rand, 0, n - 1);
    const id = directed ? `${a}>${b}` : `${Math.min(a, b)}-${Math.max(a, b)}`;
    if (a === b || seen.has(id)) continue;
    seen.add(id);
    edges.push([a, b]);
  }
  return edges;
}

/** Prerequisite pairs [a, b] (b before a) that follow a hidden order, optionally with one edge that closes a cycle. */
function randomDag(rand: () => number, n: number, count: number, cyclic: boolean): number[][] {
  const rank = shuffle(
    rand,
    Array.from({ length: n }, (_, i) => i),
  );
  const pairs = randomEdges(rand, n, count, false).map(([x, y]) => (rank[x] < rank[y] ? [y, x] : [x, y]));
  if (cyclic && pairs.length) {
    const [a, b] = pairs[randInt(rand, 0, pairs.length - 1)];
    const reverse = pairs.findIndex(([x, y]) => x === b && y === a);
    if (reverse === -1) pairs.push([b, a]);
  }
  return pairs;
}

function randomWeighted(rand: () => number, n: number, count: number): number[][] {
  return randomEdges(rand, n, count, true).map(([u, v]) => [u + 1, v + 1, randInt(rand, 0, 100)]);
}

function islandGrid(rand: () => number, rows: number, cols: number, density: number): string[][] {
  return Array.from({ length: rows }, () => Array.from({ length: cols }, () => (rand() < density ? '1' : '0')));
}

/**
 * `combRows` rows that alternate rotten and fresh, the fresh ones joined by a fresh last column, above one corridor of
 * fresh oranges that snakes through every other row. Every rotten orange touches the fresh rows, so a search from any
 * of them reaches every fresh orange, and the corridor's far end rots last.
 */
function combOverSnake(rows: number, cols: number, combRows: number): number[][] {
  return rangeOf(0, rows - 1).map((r) =>
    rangeOf(0, cols - 1).map((c) => {
      if (r < combRows) return r % 2 === 0 && c < cols - 1 ? 2 : 1;
      const s = r - combRows;
      if (s % 2 === 0) return 1;
      return c === ((s >> 1) % 2 === 0 ? cols - 1 : 0) ? 1 : 0;
    }),
  );
}

const edgeKey = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`;

/** Two different nodes from `nodes` that no edge in `edges` joins yet. */
function unjoinedPair(rand: () => number, nodes: readonly number[], edges: readonly number[][]): number[] {
  const joined = new Set(edges.map(([a, b]) => edgeKey(a, b)));
  for (;;) {
    const a = nodes[randInt(rand, 0, nodes.length - 1)];
    const b = nodes[randInt(rand, 0, nodes.length - 1)];
    if (a !== b && !joined.has(edgeKey(a, b))) return [a, b];
  }
}

/** A random tree on the nodes 1 to n plus one extra edge, shuffled, each edge written in a random direction. */
function treePlusEdge(rand: () => number, n: number): number[][] {
  const labels = shuffle(rand, rangeOf(1, n));
  const edges = labels.slice(1).map((v, i) => [labels[randInt(rand, 0, i)], v]);
  edges.push(unjoinedPair(rand, labels, edges));
  return shuffle(rand, edges).map(([a, b]) => (rand() < 0.5 ? [a, b] : [b, a]));
}

/**
 * n / 2 separate pairs, then edges that join one pair at a time to a growing tree, each written in a random direction;
 * the extra edge comes after 95% of the joins. Searching the graph built so far from the same end of every edge, first or
 * second, then visits about (n / 2)² / 2 nodes, even when it searches only once both nodes already have an edge.
 */
function joinedPairs(rand: () => number, n: number): number[][] {
  const labels = shuffle(rand, rangeOf(1, n));
  const pairs: number[][] = [];
  for (let i = 0; i < n; i += 2) pairs.push(rand() < 0.5 ? [labels[i], labels[i + 1]] : [labels[i + 1], labels[i]]);
  const tree = labels.slice(0, 2);
  const joins: number[][] = [];
  const extraAt = Math.floor(0.95 * (n / 2));
  for (let i = 1; i < n / 2; i++) {
    if (i === extraAt) joins.push(unjoinedPair(rand, tree, [...pairs, ...joins]));
    const join = [tree[randInt(rand, 0, tree.length - 1)], labels[2 * i + randInt(rand, 0, 1)]];
    joins.push(rand() < 0.5 ? join : join.reverse());
    tree.push(labels[2 * i], labels[2 * i + 1]);
  }
  return [...pairs, ...joins];
}

export const numberOfIslands: CodingProblemDefinition = {
  statement: [
    "`grid` is a map of `'1'` (land) and `'0'` (water). An island is land connected horizontally or vertically. Return the number of islands.",
  ],
  constraints: ['1 ≤ rows, cols ≤ 300', "grid[r][c] is '0' or '1'"],
  entry: 'numIslands',
  params: [{ name: 'grid', type: 'char[][]' }],
  returns: 'int',
  compare: 'exact',
  examples: [
    {
      args: [
        [
          ['1', '1', '0', '0', '0'],
          ['1', '1', '0', '0', '0'],
          ['0', '0', '1', '0', '0'],
          ['0', '0', '0', '1', '1'],
        ],
      ],
    },
  ],
  edgeCases: [[[['0']]], [[['1']]], [[['1', '0', '1', '0', '1']]], [[['1'], ['1'], ['0'], ['1']]]],
  randomCase: (rand) => [islandGrid(rand, randInt(rand, 1, 7), randInt(rand, 1, 7), 0.45)],
  performanceCase: (rand) => [islandGrid(rand, 300, 300, 0.4)],
  solve(grid: string[][]) {
    const rows = grid.length;
    const cols = grid[0].length;
    const seen = grid.map((r) => r.map(() => false));
    let islands = 0;
    for (let r = 0; r < rows; r++) {
      for (let c = 0; c < cols; c++) {
        if (grid[r][c] !== '1' || seen[r][c]) continue;
        islands++;
        const queue: [number, number][] = [[r, c]];
        seen[r][c] = true;
        while (queue.length) {
          const [y, x] = queue.pop()!;
          for (const [dy, dx] of [
            [1, 0],
            [-1, 0],
            [0, 1],
            [0, -1],
          ]) {
            const ny = y + dy;
            const nx = x + dx;
            if (ny >= 0 && ny < rows && nx >= 0 && nx < cols && grid[ny][nx] === '1' && !seen[ny][nx]) {
              seen[ny][nx] = true;
              queue.push([ny, nx]);
            }
          }
        }
      }
    }
    return islands;
  },
  approach: 'Scan every cell; each unvisited land cell starts a new island, and a BFS or DFS marks the rest of it.',
  complexity: { time: 'O(rows × cols)', space: 'O(rows × cols)' },
};

export const rottingOranges: CodingProblemDefinition = {
  statement: [
    'In `grid`, 0 is an empty cell, 1 a fresh orange and 2 a rotten one. Every minute, each fresh orange next to a rotten one, horizontally or vertically, turns rotten.',
    'Return how many minutes pass until no fresh orange is left, or -1 if some fresh orange never rots.',
  ],
  constraints: ['1 ≤ rows, cols ≤ 500', 'grid[r][c] is 0, 1 or 2'],
  entry: 'orangesRotting',
  params: [{ name: 'grid', type: 'int[][]' }],
  returns: 'int',
  compare: 'exact',
  examples: [
    {
      args: [
        [
          [2, 1, 1],
          [1, 1, 0],
          [0, 1, 1],
        ],
      ],
      explanation: 'The rot spreads from the top-left corner and reaches the bottom-right orange in minute 4',
    },
    {
      args: [
        [
          [2, 1, 1],
          [0, 1, 1],
          [1, 0, 1],
        ],
      ],
      explanation: 'The bottom-left orange touches only empty cells, so it never rots',
    },
    { args: [[[0, 2]]], explanation: 'No orange is fresh, so no time passes' },
  ],
  edgeCases: [
    [[[0]]],
    [[[1]]],
    [[[1], [2], [1]]],
    [[[2, 0, 1]]],
    [
      [
        [2, 2],
        [1, 1],
      ],
    ],
  ],
  randomCase: (rand) => {
    const cols = randInt(rand, 1, 6);
    return [
      Array.from({ length: randInt(rand, 1, 6) }, () => Array.from({ length: cols }, () => [0, 1, 1, 1, 1, 2, 2][randInt(rand, 0, 6)])),
    ];
  },
  // About 10^4 rotten oranges each reach all 1.25·10^5 fresh ones, so a BFS from each rotten orange is too slow. The rot
  // takes over 10^5 minutes to reach the corridor's far end, so scanning the whole grid once a minute is too.
  performanceCase: () => [combOverSnake(500, 500, 40)],
  solve(grid: number[][]) {
    const cells = grid.map((row) => [...row]);
    let fresh = cells.flat().filter((cell) => cell === 1).length;
    let rotten = cells.flatMap((row, r) => row.flatMap((cell, c) => (cell === 2 ? [[r, c]] : [])));
    let minutes = 0;
    while (fresh && rotten.length) {
      const next: number[][] = [];
      for (const [r, c] of rotten)
        for (const [y, x] of [
          [r + 1, c],
          [r - 1, c],
          [r, c + 1],
          [r, c - 1],
        ])
          if (cells[y]?.[x] === 1) {
            cells[y][x] = 2;
            fresh--;
            next.push([y, x]);
          }
      rotten = next;
      minutes++;
    }
    return fresh ? -1 : minutes;
  },
  approach:
    'Multi-source BFS: start the queue with every rotten orange, and let each round rot the fresh neighbors of the oranges the last round rotted. The answer is the number of rounds, or -1 if a fresh orange is left over.',
  complexity: { time: 'O(rows × cols)', space: 'O(rows × cols)' },
};

export const countComponents: CodingProblemDefinition = {
  statement: [
    'There are `n` nodes labelled 0 to `n - 1` and a list of undirected edges. Return how many connected components the graph has.',
  ],
  constraints: ['1 ≤ n ≤ 10^5', '0 ≤ edges.length ≤ 10^5', 'no self-loops or repeated edges'],
  entry: 'countComponents',
  params: [
    { name: 'n', type: 'int' },
    { name: 'edges', type: 'int[][]' },
  ],
  returns: 'int',
  compare: 'exact',
  examples: [
    {
      args: [
        5,
        [
          [0, 1],
          [1, 2],
          [3, 4],
        ],
      ],
    },
    {
      args: [
        5,
        [
          [0, 1],
          [1, 2],
          [2, 3],
          [3, 4],
        ],
      ],
    },
  ],
  edgeCases: [
    [1, []],
    [4, []],
    [
      3,
      [
        [0, 1],
        [1, 2],
        [0, 2],
      ],
    ],
  ],
  randomCase: (rand) => {
    const n = randInt(rand, 1, 10);
    return [n, randomEdges(rand, n, randInt(rand, 0, n), false)];
  },
  performanceCase: (rand) => [100_000, randomEdges(rand, 100_000, 90_000, false)],
  solve(n: number, edges: number[][]) {
    const parent = Array.from({ length: n }, (_, i) => i);
    const find = (x: number): number => {
      while (parent[x] !== x) x = parent[x] = parent[parent[x]];
      return x;
    };
    let components = n;
    for (const [a, b] of edges) {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) {
        parent[ra] = rb;
        components--;
      }
    }
    return components;
  },
  approach: 'Union-find: start with `n` components and subtract one each time an edge joins two different roots (or count DFS starts).',
  complexity: { time: 'O(n + E·α(n))', space: 'O(n)' },
};

export const redundantConnection: CodingProblemDefinition = {
  statement: [
    '`edges` holds the n undirected edges of a graph on the nodes 1 to n, so n is `edges.length`. The graph is a tree plus one extra edge, which gives it exactly one cycle.',
    'Return an edge whose removal leaves a tree, written exactly as it appears in `edges`. Every edge on the cycle works, so return the one of them that comes last in `edges`.',
  ],
  constraints: ['3 ≤ n ≤ 2·10^5', 'edges.length = n', 'edges[i] = [a, b] with a ≠ b', '1 ≤ a, b ≤ n', 'no edge is repeated'],
  entry: 'findRedundantConnection',
  params: [{ name: 'edges', type: 'int[][]' }],
  returns: 'int[]',
  compare: 'exact',
  examples: [
    {
      args: [
        [
          [1, 2],
          [1, 3],
          [2, 3],
        ],
      ],
      explanation: 'Removing any edge of the triangle leaves a tree, and [2,3] comes last',
    },
    {
      args: [
        [
          [1, 2],
          [2, 3],
          [3, 4],
          [1, 4],
          [1, 5],
        ],
      ],
      explanation: 'The cycle is 1, 2, 3, 4, and [1,4] is the last of its edges in the list',
    },
  ],
  edgeCases: [
    [
      [
        [1, 2],
        [2, 3],
        [3, 1],
      ],
    ],
    [
      [
        [1, 4],
        [3, 4],
        [1, 3],
        [1, 2],
        [4, 5],
      ],
    ],
    [
      [
        [4, 3],
        [5, 4],
        [2, 1],
        [1, 5],
        [3, 1],
      ],
    ],
  ],
  randomCase: (rand) => [treePlusEdge(rand, randInt(rand, 3, 10))],
  performanceCase: (rand) => [joinedPairs(rand, 200_000)],
  solve(edges: number[][]) {
    const parent = rangeOf(0, edges.length);
    const find = (x: number): number => {
      while (parent[x] !== x) x = parent[x] = parent[parent[x]];
      return x;
    };
    for (const edge of edges) {
      const ra = find(edge[0]);
      const rb = find(edge[1]);
      if (ra === rb) return edge;
      parent[ra] = rb;
    }
    return [];
  },
  approach:
    'Union-find: add the edges in order. The first edge whose two nodes already share a root closes the cycle, and the rest of the cycle came before it, so it is the last cycle edge in the list. With path compression and union by size, each find takes nearly constant time.',
  complexity: { time: 'O(n·α(n))', space: 'O(n)' },
};

export const courseSchedule: CodingProblemDefinition = {
  statement: [
    'You must take `numCourses` courses labelled 0 to `numCourses - 1`. Each pair `[a, b]` in `prerequisites` means you must take `b` before `a`.',
    'Return `true` if you can finish every course, or `false` if the prerequisites are circular.',
  ],
  constraints: ['1 ≤ numCourses ≤ 10^5', '0 ≤ prerequisites.length ≤ 2·10^5', 'pairs are distinct'],
  entry: 'canFinish',
  params: [
    { name: 'numCourses', type: 'int' },
    { name: 'prerequisites', type: 'int[][]' },
  ],
  returns: 'bool',
  compare: 'exact',
  examples: [
    { args: [2, [[1, 0]]], explanation: 'Take 0, then 1' },
    {
      args: [
        2,
        [
          [1, 0],
          [0, 1],
        ],
      ],
      explanation: 'Each course waits for the other',
    },
  ],
  edgeCases: [
    [1, []],
    [
      3,
      [
        [1, 0],
        [2, 1],
        [0, 2],
      ],
    ],
    [
      4,
      [
        [1, 0],
        [2, 0],
        [3, 1],
        [3, 2],
      ],
    ],
  ],
  randomCase: (rand) => {
    const n = randInt(rand, 1, 8);
    return [n, randomDag(rand, n, randInt(rand, 0, 2 * n), rand() < 0.4)];
  },
  performanceCase: (rand) => [100_000, randomDag(rand, 100_000, 200_000, false)],
  solve(n: number, prerequisites: number[][]) {
    const indeg = Array<number>(n).fill(0);
    const adj: number[][] = Array.from({ length: n }, () => []);
    for (const [a, b] of prerequisites) {
      adj[b].push(a);
      indeg[a]++;
    }
    const queue = indeg.flatMap((d, v) => (d === 0 ? [v] : []));
    let taken = 0;
    for (let head = 0; head < queue.length; head++) {
      taken++;
      for (const v of adj[queue[head]]) if (--indeg[v] === 0) queue.push(v);
    }
    return taken === n;
  },
  approach: "Kahn's algorithm: repeatedly take a course with no remaining prerequisites; if some never free up, there is a cycle.",
  complexity: { time: 'O(V + E)', space: 'O(V + E)' },
};

export const networkDelay: CodingProblemDefinition = {
  statement: [
    '`times[i] = [u, v, w]` is a directed link from node `u` to node `v` that takes `w` milliseconds. Nodes are labelled 1 to `n`.',
    'A signal is sent from node `k`. Return how long it takes for every node to receive it, or -1 if some node never does.',
  ],
  constraints: ['1 ≤ n ≤ 10^4', '1 ≤ times.length ≤ 5·10^4', '0 ≤ w ≤ 100'],
  entry: 'networkDelayTime',
  params: [
    { name: 'times', type: 'int[][]' },
    { name: 'n', type: 'int' },
    { name: 'k', type: 'int' },
  ],
  returns: 'int',
  compare: 'exact',
  examples: [
    {
      args: [
        [
          [2, 1, 1],
          [2, 3, 1],
          [3, 4, 1],
        ],
        4,
        2,
      ],
    },
    { args: [[[1, 2, 1]], 2, 1] },
    { args: [[[1, 2, 1]], 2, 2] },
  ],
  edgeCases: [
    [[], 1, 1],
    [
      [
        [1, 2, 5],
        [1, 3, 1],
        [3, 2, 1],
      ],
      3,
      1,
    ],
  ],
  randomCase: (rand) => {
    const n = randInt(rand, 1, 7);
    return [randomWeighted(rand, n, randInt(rand, 0, 3 * n)), n, randInt(rand, 1, n)];
  },
  performanceCase: (rand) => [randomWeighted(rand, 10_000, 50_000), 10_000, 1],
  solve(times: number[][], n: number, k: number) {
    const adj: [number, number][][] = Array.from({ length: n + 1 }, () => []);
    for (const [u, v, w] of times) adj[u].push([v, w]);
    const dist = Array<number>(n + 1).fill(Infinity);
    dist[k] = 0;
    const heap: [number, number][] = [[0, k]];
    const push = (item: [number, number]) => {
      heap.push(item);
      for (let i = heap.length - 1; i > 0;) {
        const p = (i - 1) >> 1;
        if (heap[p][0] <= heap[i][0]) break;
        [heap[p], heap[i]] = [heap[i], heap[p]];
        i = p;
      }
    };
    const pop = () => {
      const top = heap[0];
      const last = heap.pop()!;
      if (heap.length) {
        heap[0] = last;
        for (let i = 0; ;) {
          const l = 2 * i + 1;
          const r = l + 1;
          let m = i;
          if (l < heap.length && heap[l][0] < heap[m][0]) m = l;
          if (r < heap.length && heap[r][0] < heap[m][0]) m = r;
          if (m === i) break;
          [heap[m], heap[i]] = [heap[i], heap[m]];
          i = m;
        }
      }
      return top;
    };
    while (heap.length) {
      const [d, u] = pop();
      if (d > dist[u]) continue;
      for (const [v, w] of adj[u]) {
        if (d + w < dist[v]) {
          dist[v] = d + w;
          push([dist[v], v]);
        }
      }
    }
    const worst = Math.max(...dist.slice(1));
    return worst === Infinity ? -1 : worst;
  },
  approach: 'Dijkstra from `k` with a min-heap; the answer is the largest shortest distance, or -1 if any node stays unreachable.',
  complexity: { time: 'O(E log V)', space: 'O(V + E)' },
};

export const treeDiameter: CodingProblemDefinition = {
  statement: [
    'Given the `root` of a binary tree, return its diameter: the number of edges on the longest path between any two nodes.',
    'That path may or may not pass through the root.',
  ],
  constraints: ['1 ≤ number of nodes ≤ 10^5', '-100 ≤ Node.val ≤ 100', 'The tree is at most 100 levels deep'],
  entry: 'diameterOfBinaryTree',
  params: [{ name: 'root', type: 'tree' }],
  returns: 'int',
  compare: 'exact',
  examples: [
    { args: [[1, 2, 3, 4, 5]], explanation: 'The path 4 → 2 → 1 → 3 has 3 edges' },
    { args: [[1, 2]] },
    { args: [[1, 2, null, 3, 4, 5, null, null, 6]], explanation: 'The longest path, 5 → 3 → 2 → 4 → 6, skips the root' },
  ],
  edgeCases: [[[7]], [[1, 2, null, 3, null, 4]], [[1, null, 2, null, 3]], [[1, 2, 3, null, null, 4, 5, 6, null, null, 7]]],
  randomCase: (rand) => [randomTree(rand, randInt(rand, 1, 12), 1, 99)],
  performanceCase: (rand) => [randomTree(rand, 100_000, -100, 100)],
  solve(root: TreeNode | null) {
    let best = 0;
    const height = (node: TreeNode | null): number => {
      if (!node) return 0;
      const left = height(node.left);
      const right = height(node.right);
      best = Math.max(best, left + right);
      return 1 + Math.max(left, right);
    };
    height(root);
    return best;
  },
  approach:
    'A postorder DFS returns the height of each subtree. The longest path through a node is its left height plus its right height, and the best of those is kept in a variable outside the recursion. Recomputing the height at every node also passes, since these trees are at most 100 levels deep, but it takes O(n·h) time.',
  complexity: { time: 'O(n)', space: 'O(h) for a tree of height h' },
};

export const houseRobberTree: CodingProblemDefinition = {
  statement: [
    'The houses in a neighborhood form a binary tree: each node is a house, and its `val` is the money inside.',
    'Robbing a house and its parent on the same night sets off the alarm. Return the most money you can take.',
  ],
  constraints: ['1 ≤ number of nodes ≤ 10^5', '0 ≤ Node.val ≤ 10^4', 'The tree is at most 100 levels deep'],
  entry: 'rob',
  params: [{ name: 'root', type: 'tree' }],
  returns: 'int',
  compare: 'exact',
  examples: [
    { args: [[3, 2, 3, null, 3, null, 1]], explanation: 'Rob the root and the two houses on the bottom row: 3 + 3 + 1 = 7' },
    { args: [[3, 4, 5, 1, 3, null, 1]], explanation: 'Rob the two children of the root: 4 + 5 = 9' },
  ],
  edgeCases: [[[5]], [[4, 1, null, 2, null, 3]], [[2, 1, 3, null, 4]], [[0, 0, 0]]],
  randomCase: (rand) => [randomTree(rand, randInt(rand, 1, 12), 0, 20)],
  performanceCase: (rand) => [randomTree(rand, 100_000, 0, 10_000)],
  solve(root: TreeNode | null) {
    const dfs = (node: TreeNode | null): [robbed: number, skipped: number] => {
      if (!node) return [0, 0];
      const [robLeft, skipLeft] = dfs(node.left);
      const [robRight, skipRight] = dfs(node.right);
      return [node.val + skipLeft + skipRight, Math.max(robLeft, skipLeft) + Math.max(robRight, skipRight)];
    };
    return Math.max(...dfs(root));
  },
  approach:
    "A postorder DFS returns two totals per subtree, with its root robbed and with it skipped. Robbing a node adds its children's skipped totals; skipping it adds each child's better total.",
  complexity: { time: 'O(n)', space: 'O(h) for a tree of height h' },
};
