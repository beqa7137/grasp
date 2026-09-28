import { rangeOf } from '../../algorithms/input.js';
import { randInt, shuffle } from '../../algorithms/random.js';
import type { TreeNode } from '../tree.js';
import type { CodingProblemDefinition } from '../types.js';
import { inorderFill } from './batch-j.js';
import { distinctSorted, nearMiddle, randomTree } from './inputs.js';

function obstacleGrid(rand: () => number, rows: number, cols: number, density: number): number[][] {
  const grid = Array.from({ length: rows }, () => Array.from({ length: cols }, () => (rand() < density ? 1 : 0)));
  grid[0][0] = 0;
  grid[rows - 1][cols - 1] = 0;
  return grid;
}

/** The fewest obstacles removed to reach each cell from the top-left one, found level by level: a 0-1 BFS. */
export function removalCounts(grid: number[][]): Int32Array {
  const rows = grid.length;
  const cols = grid[0].length;
  const removed = new Int32Array(rows * cols).fill(rows * cols);
  removed[0] = 0;
  let level = [0];
  for (let d = 0; level.length; d++) {
    const next: number[] = [];
    for (let i = 0; i < level.length; i++) {
      const cell = level[i];
      if (removed[cell] !== d) continue;
      const r = Math.floor(cell / cols);
      const c = cell % cols;
      const visit = (to: number, value: number) => {
        const cost = d + value;
        if (cost >= removed[to]) return;
        removed[to] = cost;
        (value ? next : level).push(to);
      };
      if (r > 0) visit(cell - cols, grid[r - 1][c]);
      if (r + 1 < rows) visit(cell + cols, grid[r + 1][c]);
      if (c > 0) visit(cell - 1, grid[r][c - 1]);
      if (c + 1 < cols) visit(cell + 1, grid[r][c + 1]);
    }
    level = next;
  }
  return removed;
}

export const minimumObstacleRemoval: CodingProblemDefinition = {
  statement: [
    '`grid` is a map where 0 is an empty cell and 1 is an obstacle. You start on the top-left cell and want to reach the bottom-right cell, moving one cell at a time up, down, left or right. You may remove any obstacles first, and a removed obstacle becomes an empty cell.',
    'Return the least number of obstacles you must remove so that a path of empty cells joins the two corners. Both corners are always empty, and a path may turn back up or left. In a 1 × 1 grid the answer is 0.',
  ],
  constraints: ['1 ≤ rows, cols ≤ 10^5', 'rows · cols ≤ 10^5', 'grid[r][c] is 0 or 1', 'the top-left and bottom-right cells are 0'],
  entry: 'minimumObstacles',
  params: [{ name: 'grid', type: 'int[][]' }],
  returns: 'int',
  compare: 'exact',
  examples: [
    {
      args: [
        [
          [0, 1, 1],
          [1, 1, 0],
          [1, 1, 0],
        ],
      ],
      explanation: 'Removing the two obstacles in the top row opens a path along it and down the right edge; one removal is never enough',
    },
    {
      args: [
        [
          [0, 1, 0, 0, 0],
          [0, 1, 0, 1, 0],
          [0, 0, 0, 1, 0],
        ],
      ],
      explanation:
        'Down the left edge, right along the bottom, up the middle column, along the top and down the right edge: no obstacle is in the way',
    },
  ],
  edgeCases: [
    [[[0]]],
    [[[0, 0]]],
    [[[0, 1, 1, 1, 0]]],
    [[[0], [1], [0]]],
    [
      [
        [0, 1, 1],
        [1, 1, 1],
        [1, 1, 0],
      ],
    ],
    [
      [
        [0, 0, 0, 0],
        [1, 1, 1, 0],
        [0, 0, 0, 0],
        [0, 1, 1, 1],
        [0, 0, 0, 0],
      ],
    ],
    [
      [
        [0, 1, 0, 0, 0],
        [0, 1, 0, 1, 0],
        [0, 1, 0, 1, 0],
        [0, 1, 0, 1, 0],
        [0, 0, 0, 1, 0],
      ],
    ],
    [
      [
        [0, 1, 0, 0],
        [0, 1, 0, 1],
        [0, 0, 0, 1],
        [1, 1, 1, 1],
        [1, 0, 0, 0],
      ],
    ],
    [
      [
        [0, 0, 1, 0, 0, 0],
        [1, 0, 1, 0, 1, 0],
        [1, 0, 0, 0, 1, 1],
        [1, 1, 1, 1, 1, 0],
      ],
    ],
  ],
  randomCase: (rand) => [obstacleGrid(rand, randInt(rand, 1, 6), randInt(rand, 2, 6), 0.3 + 0.4 * rand())],
  // Almost every cell needs fewer removals than the far corner, so each must settle first: picking the next cell by
  // scanning the whole grid makes about 10^10 steps.
  performanceCase: (rand) => [obstacleGrid(rand, 250, 400, 0.5)],
  solve(grid: number[][]) {
    const removed = removalCounts(grid);
    return removed[removed.length - 1];
  },
  approach:
    'Treat each move as an edge that costs 1 when it enters an obstacle and 0 otherwise, and find the cheapest path. A 0-1 BFS does it with a deque: push a cell reached for free to the front and one reached through an obstacle to the back, and skip a cell popped at more than its best cost. Dijkstra with a heap also works. A plain BFS that keeps the first cost it finds is wrong, since the fewest moves are not always the fewest removals, and a DP that moves only right and down misses paths that turn back.',
  complexity: { time: 'O(rows · cols)', space: 'O(rows · cols)' },
};

export const pathSumIII: CodingProblemDefinition = {
  statement: [
    'Return the number of paths in the binary tree rooted at `root` whose values add up to `targetSum`.',
    'A path goes downward, from a node to one of its descendants through each node in between, and need not start at the root or end at a leaf. A single node is a path too. Two paths count separately when they have different start or end nodes, even if their sums match. An empty tree has no paths.',
  ],
  constraints: [
    '0 ≤ number of nodes ≤ 10^5',
    '-10^9 ≤ Node.val ≤ 10^9',
    '-10^9 ≤ targetSum ≤ 10^9',
    'Path sums can exceed 2^31',
    'The tree is at most 100 levels deep',
  ],
  entry: 'pathSum',
  params: [
    { name: 'root', type: 'tree' },
    { name: 'targetSum', type: 'int' },
  ],
  returns: 'int',
  compare: 'exact',
  examples: [
    {
      args: [[10, 5, -3, 3, 2, null, 11, 3, -2, null, 1], 8],
      explanation: '5 → 3, 5 → 2 → 1 and -3 → 11 each add up to 8',
    },
    { args: [[5, 4, 8, 11, null, 13, 4, 7, 2, null, null, 5, 1], 22] },
    { args: [[1, 2], 3] },
  ],
  edgeCases: [
    [[], 0],
    [[0], 0],
    [[1], 0],
    [[-2], -2],
    [[0, 0, 0], 0],
    [[1, -1, 1], 0],
    [[1, null, 2, null, 3, null, 4], 3],
    [[2, -2, 2, -2, 2, -2, 2], 0],
    [[1000000000, 1000000000, null, -1000000000, null, 1000000000], 1000000000],
    [[1000000000, 1000000000, 1000000000], -1000000000],
  ],
  randomCase: (rand) => [randomTree(rand, randInt(rand, 1, 12), -3, 3), randInt(rand, -3, 3)],
  performanceCase: (rand) => [randomTree(rand, 100_000, -3, 3), randInt(rand, -3, 3)],
  solve(root: TreeNode | null, targetSum: number) {
    const prefixes = new Map<number, number>([[0, 1]]);
    const count = (node: TreeNode | null, above: number): number => {
      if (!node) return 0;
      const sum = above + node.val;
      let paths = prefixes.get(sum - targetSum) ?? 0;
      prefixes.set(sum, (prefixes.get(sum) ?? 0) + 1);
      paths += count(node.left, sum) + count(node.right, sum);
      prefixes.set(sum, prefixes.get(sum)! - 1);
      return paths;
    };
    return count(root, 0);
  },
  approach:
    'A DFS carries the sum from the root down to each node and a count of the prefix sums on the current root path, starting with one 0 for the empty prefix. The paths ending at a node are the prefixes equal to its sum minus `targetSum`. Add its own sum before visiting its children and take it back after, so a sibling branch never sees it. Starting a downward walk from every node also passes, since these trees are at most 100 levels deep, but it takes O(n·h) time.',
  complexity: { time: 'O(n)', space: 'O(h) for a tree of height h' },
};

export const kthSmallestBst: CodingProblemDefinition = {
  statement: [
    "`root` is a binary search tree: every value in a node's left subtree is less than the node's value and every value in its right subtree is greater, so no value appears twice.",
    'Return the `k`-th smallest value in the tree, counting from 1: `k = 1` asks for the smallest and `k` equal to the number of nodes for the largest.',
  ],
  constraints: [
    '1 ≤ k ≤ number of nodes ≤ 10^5',
    '-10^9 ≤ Node.val ≤ 10^9',
    'The tree is a valid binary search tree',
    'The tree is at most 100 levels deep',
  ],
  entry: 'kthSmallest',
  params: [
    { name: 'root', type: 'tree' },
    { name: 'k', type: 'int' },
  ],
  returns: 'int',
  compare: 'exact',
  examples: [
    { args: [[3, 1, 4, null, 2], 1], explanation: 'In order the values are 1, 2, 3 and 4, so the smallest is 1' },
    { args: [[5, 3, 6, 2, 4, null, null, 1], 3], explanation: 'In order the values are 1, 2, 3, 4, 5 and 6, and the third is 3' },
  ],
  edgeCases: [
    [[7], 1],
    [[2, 1, 3], 2],
    [[2, 1, 3], 3],
    [[1, null, 2, null, 3, null, 4], 4],
    [[4, 3, null, 2, null, 1], 1],
    [[4, 3, null, 2, null, 1], 3],
    [[-1000000000, null, 1000000000], 2],
    [[0, -5, 5, -8, -2, 3, 8], 5],
  ],
  randomCase: (rand) => {
    const n = randInt(rand, 1, 12);
    return [inorderFill(randomTree(rand, n, 0, 0), distinctSorted(rand, n, -50, 50)), randInt(rand, 1, n)];
  },
  performanceCase: (rand) => {
    const n = 100_000;
    return [inorderFill(randomTree(rand, n, 0, 0), distinctSorted(rand, n, -1_000_000_000, 1_000_000_000)), randInt(rand, n / 2, n)];
  },
  solve(root: TreeNode, k: number) {
    const stack: TreeNode[] = [];
    let node: TreeNode | null = root;
    for (;;) {
      for (; node; node = node.left) stack.push(node);
      node = stack.pop()!;
      if (--k === 0) return node.val;
      node = node.right;
    }
  },
  approach:
    'An inorder traversal of a search tree visits its values in increasing order, so walk it, left subtree, node, right subtree, and return the `k`-th node visited. With an explicit stack it stops right there, after O(h + k) steps. Collecting every value and sorting also passes, in O(n log n).',
  complexity: { time: 'O(h + k) for a tree of height h', space: 'O(h)' },
};

export const countGoodNodes: CodingProblemDefinition = {
  statement: [
    'A node in the binary tree rooted at `root` is good when no node on the path from the root down to it has a greater value than its own.',
    'Return the number of good nodes. The root is always good, and a node whose value ties the largest one above it is good too.',
  ],
  constraints: ['1 ≤ number of nodes ≤ 10^5', '-10^4 ≤ Node.val ≤ 10^4', 'The tree is at most 100 levels deep'],
  entry: 'goodNodes',
  params: [{ name: 'root', type: 'tree' }],
  returns: 'int',
  compare: 'exact',
  examples: [
    {
      args: [[3, 1, 4, 3, null, 1, 5]],
      explanation: 'The root 3, the 4 and the 5 below it, and the 3 under 1 are good; both 1s have the 3 above them',
    },
    { args: [[3, 3, null, 4, 2]], explanation: 'The 3 below the root ties it and the 4 beats both, but 2 is below a 3' },
    { args: [[1]] },
  ],
  edgeCases: [
    [[-5]],
    [[-1, -2, -1]],
    [[2, 2, 2, 2]],
    [[1, null, 2, null, 3]],
    [[5, 4, 3, 2, 1]],
    [[5, 1, null, 3]],
    [[-10000, 10000, -10000, -10000, 10000]],
  ],
  randomCase: (rand) => [randomTree(rand, randInt(rand, 1, 12), -5, 5)],
  performanceCase: (rand) => [randomTree(rand, 100_000, -10_000, 10_000)],
  solve(root: TreeNode) {
    const count = (node: TreeNode | null, highest: number): number =>
      node
        ? (node.val >= highest ? 1 : 0) + count(node.left, Math.max(highest, node.val)) + count(node.right, Math.max(highest, node.val))
        : 0;
    return count(root, -Infinity);
  },
  approach:
    'A DFS passes down the largest value on the path above each node. A node is good when its value is at least that largest value, and its children get the larger of the two. Start from minus infinity, not 0, since every value can be negative. Comparing a node with its parent alone misses a larger value higher up.',
  complexity: { time: 'O(n)', space: 'O(h) for a tree of height h' },
};

export const missingNumber: CodingProblemDefinition = {
  statement: [
    '`nums` holds `n` distinct values, where `n` is its length, and each value is between 0 and `n` inclusive. That range has `n + 1` values, so exactly one of them is missing from `nums`: return it.',
    'The values are in no particular order, and the missing one can be 0 or `n` itself. Aim for O(n) time and O(1) extra space.',
  ],
  constraints: ['1 ≤ n ≤ 2·10^5', '0 ≤ nums[i] ≤ n', 'values are distinct'],
  entry: 'missingNumber',
  params: [{ name: 'nums', type: 'int[]' }],
  returns: 'int',
  compare: 'exact',
  examples: [
    { args: [[3, 0, 1]], explanation: '`n` is 3, so the values run from 0 to 3, and 2 is the one not in the list' },
    { args: [[0, 1]], explanation: '0 and 1 are both there, so the missing value is `n` itself, 2' },
    { args: [[9, 6, 4, 2, 3, 5, 7, 0, 1]] },
  ],
  edgeCases: [[[0]], [[1]], [[1, 2]], [[2, 0]], [[0, 2, 3]], [[4, 3, 2, 1]], [[0, 1, 2, 3]], [[3, 1, 0, 5, 4]]],
  randomCase: (rand) => {
    const n = randInt(rand, 1, 10);
    const missing = randInt(rand, 0, n);
    return [
      shuffle(
        rand,
        rangeOf(0, n).filter((x) => x !== missing),
      ),
    ];
  },
  performanceCase: (rand) => {
    const n = 200_000;
    const missing = nearMiddle(rand, n);
    return [
      shuffle(
        rand,
        rangeOf(0, n).filter((x) => x !== missing),
      ),
    ];
  },
  solve(nums: number[]) {
    let x = nums.length;
    nums.forEach((value, i) => (x ^= i ^ value));
    return x;
  },
  approach:
    'XOR every index from 0 to `n` with every value: each value that is present cancels its own index, since `x ^ x = 0`, and only the missing one is left. Start the accumulator at `n`, the one index the loop does not reach. Subtracting the sum of `nums` from `n(n + 1) / 2` works too. Checking each candidate by scanning the list is quadratic.',
  complexity: { time: 'O(n)', space: 'O(1)' },
};
