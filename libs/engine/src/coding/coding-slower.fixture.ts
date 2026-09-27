import { rangeOf } from '../algorithms/input.js';
import { rottingOranges } from './problems/grids.js';
import { MinHeap } from './problems/min-heap.js';
import type { TreeNode } from './tree.js';

export function nodesOf(root: TreeNode | null) {
  const nodes = root ? [root] : [];
  const parent = new Map<TreeNode, TreeNode>();
  for (let i = 0; i < nodes.length; i++)
    for (const child of [nodes[i].left, nodes[i].right])
      if (child) {
        parent.set(child, nodes[i]);
        nodes.push(child);
      }
  return { nodes, parent };
}

function componentSize(heights: number[][], start: number, maxStep: number): number {
  const rows = heights.length;
  const cols = heights[0].length;
  const seen = new Uint8Array(rows * cols);
  const queue = new Int32Array(rows * cols);
  seen[start] = 1;
  queue[0] = start;
  let tail = 1;
  for (let head = 0; head < tail; head++) {
    const cell = queue[head];
    const row = Math.floor(cell / cols);
    const height = heights[row][cell % cols];
    for (const next of [cell - cols, cell + cols, cell - 1, cell + 1]) {
      if (next < 0 || next >= rows * cols || (Math.abs(next - cell) === 1 && Math.floor(next / cols) !== row) || seen[next]) continue;
      if (Math.abs(heights[Math.floor(next / cols)][next % cols] - height) > maxStep) continue;
      seen[next] = 1;
      queue[tail++] = next;
    }
  }
  return tail;
}

function frontierScanWork(heights: number[][]): number {
  const rows = heights.length;
  const cols = heights[0].length;
  const cells = rows * cols;
  const best = new Float64Array(cells).fill(Infinity);
  const heap = new MinHeap();
  best[0] = 0;
  heap.push([0, 0]);
  let work = 0;
  while (heap.size) {
    work += heap.size - 1;
    const [effort, cell] = heap.pop();
    if (cell === cells - 1) return work;
    if (effort > best[cell]) continue;
    const row = Math.floor(cell / cols);
    const height = heights[row][cell % cols];
    for (const next of [cell - cols, cell + cols, cell - 1, cell + 1]) {
      if (next < 0 || next >= cells || (Math.abs(next - cell) === 1 && Math.floor(next / cols) !== row)) continue;
      const candidate = Math.max(effort, Math.abs(height - heights[Math.floor(next / cols)][next % cols]));
      if (candidate < best[next]) {
        best[next] = candidate;
        heap.push([candidate, next]);
      }
    }
  }
  return work;
}

/**
 * Steps a measured slower approach needs on the performance case. The default 4e9 floor guards against weaker
 * generators; actual timeout measurements still matter because an array scan is cheaper than a BFS visit or string match.
 */
export const SLOWER: Record<string, (...args: any[]) => number> = {
  // Recomputing every answer by multiplying all other elements.
  'product-of-array-except-self': (nums: number[]) => nums.length * (nums.length - 1),
  // Scanning left from every local peak to find the widest rectangle.
  'largest-rectangle-in-histogram': (heights: number[]) => {
    let steps = 0;
    for (let i = 0; i < heights.length; i++) if (i === heights.length - 1 || heights[i] > heights[i + 1]) steps += i + 1;
    return steps;
  },
  // Starting Floyd's cycle search independently from every index without marking completed paths.
  'circular-array-loop': (nums: number[]) => (nums.length * (nums.length - 1)) / 2,
  // Scanning backward through end-sorted intervals for each DP predecessor.
  'non-overlapping-intervals': (intervals: number[][]) => {
    const sorted = [...intervals].sort((a, b) => a[1] - b[1]);
    let steps = 0;
    for (let i = 0; i < sorted.length; i++) {
      let lo = 0;
      let hi = i;
      while (lo < hi) {
        const mid = Math.floor((lo + hi) / 2);
        if (sorted[mid][1] <= sorted[i][0]) lo = mid + 1;
        else hi = mid;
      }
      steps += i - lo;
    }
    return steps;
  },
  // Scanning roots in dictionary order for every word until the first matching root.
  'replace-words': (dictionary: string[], sentence: string) => {
    const position = new Map(dictionary.map((root, i) => [root, i]));
    return sentence.split(' ').reduce((steps, word) => {
      let first = dictionary.length;
      for (let length = 1; length <= Math.min(10, word.length); length++)
        first = Math.min(first, position.get(word.slice(0, length)) ?? dictionary.length);
      return steps + Math.min(first + 1, dictionary.length);
    }, 0);
  },
  // Recursing into all three edits on mismatches without memoization.
  'edit-distance': (a: string, b: string) => {
    const calls = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(1));
    for (let i = a.length - 1; i >= 0; i--)
      for (let j = b.length - 1; j >= 0; j--)
        calls[i][j] = Math.min(1e12, 1 + (a[i] === b[j] ? calls[i + 1][j + 1] : calls[i + 1][j] + calls[i][j + 1] + calls[i + 1][j + 1]));
    return calls[0][0];
  },
  // Recursing into both suffixes on mismatches without memoization.
  'longest-common-subsequence': (a: string, b: string) => {
    const calls = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(1));
    for (let i = a.length - 1; i >= 0; i--)
      for (let j = b.length - 1; j >= 0; j--)
        calls[i][j] = Math.min(1e12, 1 + (a[i] === b[j] ? calls[i + 1][j + 1] : calls[i + 1][j] + calls[i][j + 1]));
    return calls[0][0];
  },
  // Trying each edge-height threshold below the answer with a fresh BFS.
  'path-with-minimum-effort': (heights: number[][], expectedEffort: number) => {
    const steps = new Set<number>();
    for (let row = 0; row < heights.length; row++)
      for (let col = 0; col < heights[0].length; col++) {
        if (row > 0) steps.add(Math.abs(heights[row][col] - heights[row - 1][col]));
        if (col > 0) steps.add(Math.abs(heights[row][col] - heights[row][col - 1]));
      }
    const candidates = [...steps].filter((step) => step < expectedEffort).length;
    const startSize = componentSize(heights, 0, 0);
    const goalSize = componentSize(heights, heights.length * heights[0].length - 1, 0);
    return candidates * Math.min(startSize, goalSize);
  },
  // Finding each course's first prerequisite by scanning the relation list from its start.
  'parallel-courses': (n: number, relations: number[][]) => {
    const firstPrerequisite = Array<number>(n + 1).fill(relations.length);
    relations.forEach(([, after], i) => {
      firstPrerequisite[after] = Math.min(firstPrerequisite[after], i);
    });
    return firstPrerequisite.slice(1).reduce((checks, i) => checks + Math.min(i + 1, relations.length), 0);
  },
  // From the back, trying each jump from an index until one lands where the end is reachable.
  'jump-game': (nums: number[]) => {
    const last = nums.length - 1;
    let nearestGood = last;
    let steps = 0;
    for (let i = last - 1; i >= 0; i--) {
      const far = Math.min(i + nums[i], last);
      steps += Math.min(nearestGood, far) - i;
      if (nearestGood <= far) nearestGood = i;
    }
    return steps;
  },
  // Growing a window from every start until its sum reaches the target.
  'min-size-subarray-sum': (target: number, nums: number[]) => {
    let steps = 0;
    let sum = 0;
    for (let lo = 0, hi = 0; lo < nums.length; lo++) {
      while (hi < nums.length && sum < target) sum += nums[hi++];
      steps += (sum >= target ? hi : nums.length) - lo;
      sum -= nums[lo];
    }
    return steps;
  },
  // Scanning the whole grid once a minute for fresh oranges next to rotten ones.
  'rotting-oranges': (grid: number[][]) => ((rottingOranges.solve(grid) as number) + 1) * grid.length * grid[0].length,
  // Extending every subset found so far by the next number, and looking through the list for a copy before adding one.
  subsets: (nums: number[]) => {
    let steps = 0;
    for (let found = 1; found < 2 ** nums.length; found *= 2) steps += found * found + (found * (found - 1)) / 2;
    return steps;
  },
  // Recursing on every coin without a memo.
  'coin-change': (coins: number[], amount: number) => {
    const calls = [1];
    for (let a = 1; a <= amount; a++) calls.push(Math.min(1e12, 1 + coins.reduce((sum, c) => sum + (c <= a ? calls[a - c] : 0), 0)));
    return calls[amount];
  },
  // Searching the graph built so far from one end of each edge for the other, which visits that end's whole component,
  // always from the first end or always from the second.
  'redundant-connection': (edges: number[][]) => {
    const parent = rangeOf(0, edges.length);
    const size = parent.map(() => 1);
    const find = (x: number): number => {
      while (parent[x] !== x) x = parent[x] = parent[parent[x]];
      return x;
    };
    let fromFirst = 0;
    let fromSecond = 0;
    for (const [a, b] of edges) {
      const [ra, rb] = [find(a), find(b)];
      if (ra === rb) break;
      fromFirst += size[ra];
      fromSecond += size[rb];
      parent[ra] = rb;
      size[rb] += size[ra];
    }
    return Math.min(fromFirst, fromSecond);
  },
  // Nested loops stop at a copy of the duplicate, and both copies sit mid-array, so scanning from either end is quadratic.
  'find-duplicate': (nums: number[]) => {
    const firstAt = new Map<number, number>();
    for (const [i, x] of nums.entries()) {
      const first = firstAt.get(x);
      if (first !== undefined) return Math.min(first, nums.length - 1 - i) ** 2 / 2;
      firstAt.set(x, i);
    }
    return 0;
  },
  // Searching for each value's partner, from the front or from the back, until the single value comes up.
  'single-number': (nums: number[]) => {
    const at = new Map<number, number[]>();
    nums.forEach((x, i) => at.set(x, [...(at.get(x) ?? []), i]));
    const single = nums.findIndex((x) => at.get(x)!.length === 1);
    const partner = (i: number) => at.get(nums[i])!.find((j) => j !== i)!;
    const fromFront = rangeOf(0, single - 1).reduce((steps, i) => steps + partner(i) + 1, 0);
    const fromBack = rangeOf(single + 1, nums.length - 1).reduce((steps, i) => steps + nums.length - partner(i), 0);
    return Math.min(fromFront, fromBack);
  },
  'total-hamming-distance': (nums: number[]) => (nums.length * (nums.length - 1)) / 2,
  // A breadth-first search from every node.
  'tree-diameter': (root: TreeNode | null) => nodesOf(root).nodes.length ** 2,
  // Recursing into children and grandchildren without a memo evaluates a node once per way down to it in steps of one and two levels.
  'house-robber-tree': (root: TreeNode | null) => {
    const calls = new Map<TreeNode, number>(root ? [[root, 1]] : []);
    let steps = 0;
    for (const [node, count] of calls) {
      steps += count;
      for (const below of [node.left, node.right, node.left?.left, node.left?.right, node.right?.left, node.right?.right])
        if (below) calls.set(below, (calls.get(below) ?? 0) + count);
    }
    return steps;
  },
};

export const SLOWER_MIN_STEPS: Record<string, number> = {
  // Root comparisons check strings; 1.70e9 take 5.98 seconds in the measured Node length-first scan.
  'replace-words': 1.5e9,
  // Each BFS visit checks neighbors; at 2.09e9 lower-bound visits, the goal-first scan exceeded 9 seconds in Node.
  'path-with-minimum-effort': 2e9,
};

export const SLOWER_VARIANTS: Record<string, Record<string, (...args: any[]) => number>> = {
  'path-with-minimum-effort': {
    // A heap reproduces the relaxations while counting the entries a linear frontier minimum scan examines.
    'linear minimum over frontier': (heights: number[][]) => frontierScanWork(heights),
    // Every cell reachable below the answer must settle before the goal, even when ties favor the goal.
    'linear minimum over all cells': (heights: number[][], expectedEffort: number) => {
      return expectedEffort === 0 ? 0 : componentSize(heights, 0, expectedEffort - 1) * heights.length * heights[0].length;
    },
  },
  'parallel-courses': {
    'recursive longest path without memoization': (n: number, relations: number[][]) => {
      const following: number[][] = Array.from({ length: n + 1 }, () => []);
      const indegree = Array<number>(n + 1).fill(0);
      for (const [before, after] of relations) {
        following[before].push(after);
        indegree[after]++;
      }
      const visits = Array<number>(n + 1).fill(1);
      const queue = Array.from({ length: n }, (_, i) => i + 1).filter((course) => indegree[course] === 0);
      let total = 0;
      for (let head = 0; head < queue.length; head++) {
        const course = queue[head];
        total = Math.min(1e12, total + visits[course]);
        for (const next of following[course]) {
          visits[next] = Math.min(1e12, visits[next] + visits[course]);
          if (--indegree[next] === 0) queue.push(next);
        }
      }
      return total;
    },
  },
  'largest-rectangle-in-histogram': {
    'skip equal neighboring bars': (heights: number[]) => {
      const left = Array<number>(heights.length);
      const right = Array<number>(heights.length);
      const stack: number[] = [];
      for (let i = 0; i < heights.length; i++) {
        while (stack.length && heights[stack[stack.length - 1]] >= heights[i]) stack.pop();
        left[i] = stack.length ? stack[stack.length - 1] : -1;
        stack.push(i);
      }
      stack.length = 0;
      for (let i = heights.length - 1; i >= 0; i--) {
        while (stack.length && heights[stack[stack.length - 1]] >= heights[i]) stack.pop();
        right[i] = stack.length ? stack[stack.length - 1] : heights.length;
        stack.push(i);
      }
      let steps = 0;
      for (let i = 0; i < heights.length; i++) if (i === 0 || heights[i] !== heights[i - 1]) steps += right[i] - left[i] - 1;
      return steps;
    },
    'scan once per distinct height': (heights: number[]) => heights.length * new Set(heights).size,
  },
};
