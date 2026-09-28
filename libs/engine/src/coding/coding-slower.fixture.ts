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
  // Counting 0s and 1s from every start to every end.
  'contiguous-array': (nums: number[]) => (nums.length * (nums.length + 1)) / 2,
  // Scanning left from every local peak to find the widest rectangle.
  'largest-rectangle-in-histogram': (heights: number[]) => {
    let steps = 0;
    for (let i = 0; i < heights.length; i++) if (i === heights.length - 1 || heights[i] > heights[i + 1]) steps += i + 1;
    return steps;
  },
  // Keeping a running minimum from every start to every end.
  'sum-subarray-minimums': (arr: number[]) => (arr.length * (arr.length + 1)) / 2,
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
  // Rescanning from the start for an interval that overlaps or touches the growing new one, then splicing it out, once per
  // absorbed interval: each pass looks at the intervals before it and shifts the ones after it. Measured at 20 seconds in Node.
  'insert-interval': (intervals: number[][], newInterval: number[]) => {
    const absorbed = intervals.filter(([start, end]) => start <= newInterval[1] && newInterval[0] <= end).length;
    return absorbed * intervals.length - (absorbed * (absorbed - 1)) / 2;
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
  // Searching for each word on its own: a word not on the board walks every path that spells one of its proper
  // prefixes, checking four neighbors at each step. A trie counts the paths to each prefix once.
  'word-search-ii': (board: string[][], words: string[], found: string[]) => {
    const children: Map<string, number>[] = [new Map()];
    const parent = [0];
    const ends = words.map((word) => {
      let node = 0;
      for (const letter of word) {
        let next = children[node].get(letter);
        if (next === undefined) {
          next = children.length;
          children[node].set(letter, next);
          children.push(new Map());
          parent.push(node);
        }
        node = next;
      }
      return node;
    });
    const paths = Array<number>(children.length).fill(0);
    const visit = (r: number, c: number, at: number): void => {
      const letter = board[r]?.[c];
      const node = letter === undefined ? undefined : children[at].get(letter);
      if (node === undefined) return;
      paths[node]++;
      board[r][c] = '#';
      visit(r - 1, c, node);
      visit(r + 1, c, node);
      visit(r, c - 1, node);
      visit(r, c + 1, node);
      board[r][c] = letter!;
    };
    board.forEach((row, r) => row.forEach((_, c) => visit(r, c, 0)));
    const throughPrefixes = paths.map(() => 0);
    for (let node = 1; node < paths.length; node++) throughPrefixes[node] = throughPrefixes[parent[node]] + paths[node];
    const onBoard = new Set(found);
    return words.reduce((steps, word, i) => (onBoard.has(word) ? steps : steps + 4 * throughPrefixes[parent[ends[i]]]), 0);
  },
  // Recursing on every dictionary word that fits at a position, without remembering the positions that already failed.
  'word-break': (s: string, wordDict: string[]) => {
    const calls = Array<number>(s.length + 1).fill(1);
    for (let i = s.length - 1; i >= 0; i--)
      calls[i] = Math.min(1e12, 1 + wordDict.reduce((sum, word) => sum + (s.startsWith(word, i) ? calls[i + word.length] : 0), 0));
    return calls[0];
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
  // Recursing on both shorter ranges when the ends differ, without memoization.
  'longest-palindromic-subsequence': (s: string) => {
    let below = Array<number>(s.length).fill(1);
    for (let i = s.length - 2; i >= 0; i--) {
      const row = Array<number>(s.length).fill(1);
      for (let j = i + 1; j < s.length; j++)
        row[j] = Math.min(1e12, 1 + (s[i] === s[j] ? (j - 1 > i ? below[j - 1] : 1) : below[j] + row[j - 1]));
      below = row;
    }
    return below[s.length - 1];
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
  // A DFS from every cell without a memo, which follows every increasing path to its end.
  'longest-increasing-path': (matrix: number[][]) => {
    const cols = matrix[0].length;
    const value = (cell: number) => matrix[Math.floor(cell / cols)][cell % cols];
    const calls = new Float64Array(matrix.length * cols);
    let total = 0;
    for (const cell of rangeOf(0, calls.length - 1).sort((a, b) => value(b) - value(a))) {
      const row = Math.floor(cell / cols);
      const larger = [
        row > 0 ? cell - cols : -1,
        row + 1 < matrix.length ? cell + cols : -1,
        cell % cols ? cell - 1 : -1,
        (cell + 1) % cols ? cell + 1 : -1,
      ];
      calls[cell] = Math.min(
        1e12,
        larger.reduce((sum, next) => sum + (next >= 0 && value(next) > value(cell) ? calls[next] : 0), 1),
      );
      total = Math.min(1e12, total + calls[cell]);
    }
    return total;
  },
  // A DFS from src along every flight, ending a route at dst or after k + 1 flights.
  'cheapest-flights': (n: number, flights: number[][], src: number, dst: number, k: number) => {
    let routes = Array<number>(n).fill(0);
    routes[src] = 1;
    let calls = 1;
    for (let taken = 0; taken <= k; taken++) {
      const next = Array<number>(n).fill(0);
      for (const [from, to] of flights) if (from !== dst) next[to] = Math.min(1e12, next[to] + routes[from]);
      routes = next;
      calls = Math.min(1e12, calls + next.reduce((sum, count) => sum + count, 0));
    }
    return calls;
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
  // Driving the loop from each start in turn, from the front or from the back, until one completes it.
  'gas-station': (gas: number[], cost: number[], answer: number) => {
    const n = gas.length;
    const tank = [0];
    for (let k = 0; k < 2 * n; k++) tank.push(tank[k] + gas[k % n] - cost[k % n]);
    const legs = Array<number>(n).fill(n);
    const lower: number[] = [];
    for (let k = 2 * n; k >= 0; k--) {
      while (lower.length && tank[lower[lower.length - 1]] >= tank[k]) lower.pop();
      if (k < n && lower.length) legs[k] = Math.min(n, lower[lower.length - 1] - k);
      lower.push(k);
    }
    const tried = (starts: number[]) => starts.reduce((sum, start) => sum + legs[start], 0);
    return answer < 0 ? tried(rangeOf(0, n - 1)) : Math.min(tried(rangeOf(0, answer - 1)), tried(rangeOf(answer + 1, n - 1)));
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
  // Extending a window from every start until it needs more than k changes: past that point it never needs fewer.
  'character-replacement': (s: string, k: number) => {
    let steps = 0;
    const reach = Array<number>(s.length).fill(0);
    for (const letter of new Set(s)) {
      const others = [...s].flatMap((ch, i) => (ch === letter ? [] : [i]));
      for (let i = 0, next = 0; i < s.length; i++) {
        while (next < others.length && others[next] < i) next++;
        reach[i] = Math.max(reach[i], others[next + k] ?? s.length);
      }
    }
    for (let i = 0; i < s.length; i++) steps += reach[i] - i;
    return steps;
  },
  // Counting upward from every value, not only from the start of each run.
  'longest-consecutive-sequence': (nums: number[]) => {
    const values = [...new Set(nums)].sort((a, b) => a - b);
    let steps = 0;
    for (let i = 0, run = 1; i < values.length; i++, run++) {
      if (i + 1 < values.length && values[i + 1] === values[i] + 1) continue;
      steps += (run * (run + 1)) / 2;
      run = 0;
    }
    return steps;
  },
  // Trying every triple of indices.
  'three-sum': (nums: number[]) => (nums.length * (nums.length - 1) * (nums.length - 2)) / 6,
  // Picking the closest remaining point with a full scan, k times.
  'k-closest-points': (points: number[][], k: number) => k * points.length - (k * (k - 1)) / 2,
  // Scanning the whole grid once a minute for fresh oranges next to rotten ones.
  'rotting-oranges': (grid: number[][]) => ((rottingOranges.solve(grid) as number) + 1) * grid.length * grid[0].length,
  // Scanning the whole grid once per step of the path for open cells next to the last step's cells.
  'shortest-path-binary-matrix': (grid: number[][], expectedLength: number) => expectedLength * grid.length ** 2,
  // Extending every subset found so far by the next number, and looking through the list for a copy before adding one.
  subsets: (nums: number[]) => {
    let steps = 0;
    for (let found = 1; found < 2 ** nums.length; found *= 2) steps += found * found + (found * (found - 1)) / 2;
    return steps;
  },
  // Trying every candidate at every step, so each ordering of a combination is searched, then dropping the repeats.
  'combination-sum': (candidates: number[], target: number) => {
    const calls = [1];
    for (let rest = 1; rest <= target; rest++)
      calls.push(Math.min(1e12, 1 + candidates.reduce((sum, c) => sum + (c <= rest ? calls[rest - c] : 0), 0)));
    return calls[target];
  },
  // Building every path as long as the word and comparing only then: from each cell with room for the word to the right
  // and below, the paths that only step right or down already number 2^(L-1).
  'word-search': (board: string[][], word: string) => {
    const room = (size: number) => Math.max(0, size - word.length + 1);
    return room(board.length) * room(board[0].length) * 2 ** (word.length - 1);
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
  // A search from every node across the whole tree, through parents too, for the best path that ends there.
  'max-path-sum': (root: TreeNode | null) => nodesOf(root).nodes.length ** 2,
};

export const SLOWER_MIN_STEPS: Record<string, number> = {
  // Root comparisons check strings; 1.70e9 take 5.98 seconds in the measured Node length-first scan.
  'replace-words': 1.5e9,
  // Each BFS visit checks neighbors; at 2.09e9 lower-bound visits, the goal-first scan exceeded 9 seconds in Node.
  'path-with-minimum-effort': 2e9,
};

export const SLOWER_VARIANTS: Record<string, Record<string, (...args: any[]) => number>> = {
  'sum-subarray-minimums': {
    // Walking out from each value to the nearest smaller one on either side, with ties stopping the walk on one side.
    'expand around each value': (arr: number[]) => {
      const walk = (stopLeft: (a: number, b: number) => boolean, stopRight: (a: number, b: number) => boolean) => {
        let steps = 0;
        const stack: number[] = [];
        for (let i = 0; i < arr.length; i++) {
          while (stack.length && !stopLeft(arr[stack[stack.length - 1]], arr[i])) stack.pop();
          steps += i - (stack.length ? stack[stack.length - 1] : -1);
          stack.push(i);
        }
        stack.length = 0;
        for (let i = arr.length - 1; i >= 0; i--) {
          while (stack.length && !stopRight(arr[stack[stack.length - 1]], arr[i])) stack.pop();
          steps += (stack.length ? stack[stack.length - 1] : arr.length) - i;
          stack.push(i);
        }
        return steps;
      };
      return Math.min(
        walk(
          (other, value) => other <= value,
          (other, value) => other < value,
        ),
        walk(
          (other, value) => other < value,
          (other, value) => other <= value,
        ),
      );
    },
  },
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
  'three-sum': {
    'sorted triple loop that stops once the sum passes zero': (nums: number[]) => {
      const sorted = [...nums].sort((a, b) => a - b);
      const n = sorted.length;
      let steps = 0;
      for (let i = 0; i < n - 2 && sorted[i] <= 0; i++) {
        let firstOver = n;
        for (let j = i + 1; j < n - 1; j++) {
          while (firstOver - 1 > j && sorted[firstOver - 1] > -(sorted[i] + sorted[j])) firstOver--;
          steps += firstOver < n ? Math.max(firstOver, j + 1) - j : n - 1 - j;
        }
      }
      return steps;
    },
  },
};
