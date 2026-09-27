import { rangeOf } from '../../algorithms/input.js';
import { randInt, shuffle } from '../../algorithms/random.js';
import type { TreeNode } from '../tree.js';
import type { CodingProblemDefinition } from '../types.js';
import { joinedPairs, randomDag, randomEdges, randomWeighted, treePlusEdge } from './graph-inputs.js';
import { randomTree } from './inputs.js';
import { MinHeap } from './min-heap.js';

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

export const parallelCourses: CodingProblemDefinition = {
  statement: [
    'There are `n` courses labelled 1 to `n`. Each pair `[before, after]` in `relations` means you must finish `before` in an earlier semester than `after`.',
    'In one semester you may take any number of courses whose prerequisites were all finished in earlier semesters. Return the fewest semesters needed to finish every course, or -1 if a cycle makes that impossible.',
  ],
  constraints: ['1 ≤ n ≤ 10^5', '0 ≤ relations.length ≤ 2·10^5', '1 ≤ before, after ≤ n', 'before ≠ after', 'pairs are distinct'],
  entry: 'minimumSemesters',
  params: [
    { name: 'n', type: 'int' },
    { name: 'relations', type: 'int[][]' },
  ],
  returns: 'int',
  compare: 'exact',
  examples: [
    {
      args: [
        3,
        [
          [1, 3],
          [2, 3],
        ],
      ],
      explanation: 'Take 1 and 2 together, then 3 in the second semester',
    },
    {
      args: [
        3,
        [
          [1, 2],
          [2, 3],
          [3, 1],
        ],
      ],
      explanation: 'Each course waits for another course in the cycle',
    },
    {
      args: [
        4,
        [
          [1, 2],
          [2, 3],
        ],
      ],
      explanation: 'Take course 4 alongside course 1; the chain still needs three semesters',
    },
  ],
  edgeCases: [
    [1, []],
    [4, []],
    [
      4,
      [
        [1, 2],
        [2, 3],
        [3, 4],
      ],
    ],
    [
      5,
      [
        [1, 4],
        [2, 4],
        [4, 5],
        [3, 5],
      ],
    ],
    [
      4,
      [
        [1, 2],
        [2, 1],
      ],
    ],
    [
      5,
      [
        [4, 2],
        [2, 1],
        [5, 3],
        [3, 1],
      ],
    ],
    [
      5,
      [
        [1, 2],
        [2, 3],
        [3, 4],
        [4, 2],
        [4, 5],
      ],
    ],
  ],
  randomCase: (rand) => {
    const n = randInt(rand, 1, 8);
    const pairs = randomDag(rand, n, randInt(rand, 0, 2 * n), rand() < 0.4);
    return [n, pairs.map(([after, before]) => [before + 1, after + 1])];
  },
  performanceCase: (rand) => {
    const n = 100_000;
    const labels = shuffle(rand, rangeOf(1, n));
    const start = labels[0];
    const end = labels[71];
    const layers = Array.from({ length: 35 }, (_, i) => [labels[1 + 2 * i], labels[2 + 2 * i]]);
    const relations: number[][] = layers[0].map((course) => [start, course]);
    for (let layer = 0; layer + 1 < layers.length; layer++)
      for (const before of layers[layer]) for (const after of layers[layer + 1]) relations.push([before, after]);
    for (const before of layers[layers.length - 1]) {
      relations.push([before, end]);
      for (let i = 72; i < n; i++) relations.push([before, labels[i]]);
    }
    return [n, shuffle(rand, relations)];
  },
  solve(n: number, relations: number[][]) {
    const following: number[][] = Array.from({ length: n + 1 }, () => []);
    const prerequisites = Array<number>(n + 1).fill(0);
    for (const [before, after] of relations) {
      following[before].push(after);
      prerequisites[after]++;
    }
    const queue: number[] = [];
    for (let course = 1; course <= n; course++) if (prerequisites[course] === 0) queue.push(course);
    let semesters = 0;
    let completed = 0;
    for (let head = 0; head < queue.length;) {
      const semesterEnd = queue.length;
      while (head < semesterEnd) {
        for (const next of following[queue[head++]]) if (--prerequisites[next] === 0) queue.push(next);
        completed++;
      }
      semesters++;
    }
    return completed === n ? semesters : -1;
  },
  approach:
    'Topological BFS by levels: the first semester takes every course with no prerequisites, and each later one takes the courses the previous semester freed. Courses that never free up sit on a cycle or wait on one, so the answer is then -1.',
  complexity: { time: 'O(n + relations.length)', space: 'O(n + relations.length)' },
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
    const heap = new MinHeap();
    heap.push([0, k]);
    while (heap.size) {
      const [d, u] = heap.pop();
      if (d > dist[u]) continue;
      for (const [v, w] of adj[u]) {
        if (d + w < dist[v]) {
          dist[v] = d + w;
          heap.push([dist[v], v]);
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
