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
