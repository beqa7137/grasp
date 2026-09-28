import { describe, expect, it } from 'vitest';
import { rangeOf } from '../algorithms/input.js';
import { PATTERN_CATALOG } from '../curriculum/catalog.js';
import { CODING_CATALOG } from './catalog.js';
import { ladderLengths } from './problems/batch-h.js';
import { getCodingProblem } from './problems/index.js';
import { buildSuite, entryArgs, outputsMatch, paramTypes, preview } from './suite.js';
import type { TreeNode } from './tree.js';

type WrongSolution = { name: string; solve: (...args: any[]) => unknown };

const longestRun = (sorted: number[], joins: (previous: number, value: number) => boolean) => {
  let best = Math.min(sorted.length, 1);
  for (let i = 1, run = 1; i < sorted.length; i++) best = Math.max(best, (run = joins(sorted[i - 1], sorted[i]) ? run + 1 : 1));
  return best;
};

function spanSum(arr: number[], stops: (neighbor: number, value: number) => boolean): number {
  let total = 0;
  arr.forEach((value, i) => {
    let left = i - 1;
    while (left >= 0 && !stops(arr[left], value)) left--;
    let right = i + 1;
    while (right < arr.length && !stops(arr[right], value)) right++;
    total += value * (i - left) * (right - i);
  });
  return total % 1_000_000_007;
}

const EIGHT_WAYS = [-1, 0, 1].flatMap((dr) => [-1, 0, 1].map((dc) => [dr, dc]));
const SIDE_WAYS = EIGHT_WAYS.filter(([dr, dc]) => Math.abs(dr + dc) === 1);

function shortestClearPath(grid: number[][], moves: number[][], firstLength: number, checkStart: boolean): number {
  const n = grid.length;
  if ((checkStart && grid[0][0]) || grid[n - 1][n - 1]) return -1;
  const length = new Map([[0, firstLength]]);
  for (const [cell, cells] of length) {
    if (cell === n * n - 1) return cells;
    const r = Math.floor(cell / n);
    for (const [dr, dc] of moves) {
      const [y, x] = [r + dr, (cell % n) + dc];
      if (y >= 0 && y < n && x >= 0 && x < n && !grid[y][x] && !length.has(y * n + x)) length.set(y * n + x, cells + 1);
    }
  }
  return -1;
}

function spellsOnBoard(board: string[][], word: string, { reuse = false, diagonal = false, unmark = true }): boolean {
  const moves = diagonal ? EIGHT_WAYS : SIDE_WAYS;
  const used = new Set<string>();
  const spells = (r: number, c: number, i: number): boolean => {
    if (board[r]?.[c] !== word[i] || (!reuse && used.has(`${r},${c}`))) return false;
    if (i === word.length - 1) return true;
    used.add(`${r},${c}`);
    const found = moves.some(([dr, dc]) => (dr || dc) && spells(r + dr, c + dc, i + 1));
    if (unmark) used.delete(`${r},${c}`);
    return found;
  };
  return board.some((row, r) => row.some((_, c) => spells(r, c, 0)));
}

function boardWords(board: string[][], words: string[], { reuse = false, diagonal = false, repeat = false, stopAtWord = false } = {}) {
  const moves = [
    [-1, 0],
    [1, 0],
    [0, -1],
    [0, 1],
    ...(diagonal
      ? [
          [-1, -1],
          [-1, 1],
          [1, -1],
          [1, 1],
        ]
      : []),
  ];
  const wanted = new Set(words);
  const prefixes = new Set(words.flatMap((word) => [...word].map((_, k) => word.slice(0, k + 1))));
  const used = new Set<string>();
  const found: string[] = [];
  const walk = (r: number, c: number, before: string): void => {
    const letter = board[r]?.[c];
    if (letter === undefined || (!reuse && used.has(`${r},${c}`)) || !prefixes.has(before + letter)) return;
    const spelled = before + letter;
    if (wanted.has(spelled)) {
      found.push(spelled);
      if (!repeat) wanted.delete(spelled);
      if (stopAtWord) return;
    }
    used.add(`${r},${c}`);
    for (const [dy, dx] of moves) walk(r + dy, c + dx, spelled);
    used.delete(`${r},${c}`);
  };
  board.forEach((row, r) => row.forEach((_, c) => walk(r, c, '')));
  return found;
}

function shortestCover(s: string, t: string, { last = false, ignoreCase = false } = {}): string {
  const fold = (text: string) => (ignoreCase ? text.toLowerCase() : text);
  const covers = (window: string) => {
    const left = [...fold(window)];
    return [...fold(t)].every((ch) => left.includes(ch) && left.splice(left.indexOf(ch), 1));
  };
  let best = '';
  for (let i = 0; i < s.length; i++)
    for (let j = i + 1; j <= s.length; j++) {
      const window = s.slice(i, j);
      if (covers(window) && (!best || window.length < best.length || (last && window.length === best.length))) best = window;
    }
  return best;
}

function greedyWordBreak(s: string, wordDict: string[], longestFirst: boolean) {
  for (let i = 0; i < s.length;) {
    const fits = wordDict
      .filter((word) => s.startsWith(word, i))
      .sort((a, b) => (longestFirst ? b.length - a.length : a.length - b.length));
    if (!fits.length) return false;
    i += fits[0].length;
  }
  return true;
}

function splitSearch(nums: number[], k: number, lo: number, closes: (sum: number, x: number, limit: number) => boolean): number {
  let hi = nums.reduce((s, x) => s + x, 0);
  while (lo < hi) {
    const mid = Math.floor((lo + hi) / 2);
    let parts = 1;
    let sum = 0;
    for (const x of nums)
      if (closes(sum, x, mid)) {
        parts++;
        sum = x;
      } else sum += x;
    if (parts <= k) hi = mid;
    else lo = mid + 1;
  }
  return lo;
}

/** Window maxima from a deque whose front is dropped once it is `reach` or more places behind the newest index. */
function slidingMaxima(nums: number[], k: number, reach: number): number[] {
  const window: number[] = [];
  const out: number[] = [];
  for (let i = 0; i < nums.length; i++) {
    while (window.length && nums[window[window.length - 1]] <= nums[i]) window.pop();
    window.push(i);
    if (window[0] <= i - reach) window.shift();
    if (i >= k - 1) out.push(nums[window[0]]);
  }
  return out;
}

function fleetCount(target: number, position: number[], speed: number[], time: (distance: number, s: number) => number, joinTies: boolean) {
  let fleets = 0;
  let front = -Infinity;
  for (const car of rangeOf(0, position.length - 1).sort((a, b) => position[b] - position[a])) {
    const arrival = time(target - position[car], speed[car]);
    if (arrival > front || (!joinTies && arrival === front)) {
      fleets++;
      front = arrival;
    }
  }
  return fleets;
}

function queenPlacements(n: number, checks: { down: boolean; up: boolean }): number {
  const columns: number[] = [];
  const attacked = (c: number) =>
    columns.some((d, r) => d === c || (checks.down && c - d === columns.length - r) || (checks.up && d - c === columns.length - r));
  const count = (): number => {
    if (columns.length === n) return 1;
    let total = 0;
    for (let c = 0; c < n; c++)
      if (!attacked(c)) {
        columns.push(c);
        total += count();
        columns.pop();
      }
    return total;
  };
  return count();
}

function treeDegrees(n: number, edges: number[][]) {
  const neighbors: number[][] = Array.from({ length: n }, () => []);
  for (const [a, b] of edges) {
    neighbors[a].push(b);
    neighbors[b].push(a);
  }
  return { neighbors, degree: neighbors.map((list) => list.length) };
}

function equalitiesHold(equations: string[], { inOrder = false, selfOk = false }): boolean {
  const parent = new Map<string, string>();
  const find = (x: string): string => ((parent.get(x) ?? x) === x ? x : find(parent.get(x)!));
  const differs = (e: string) => (selfOk && e[0] === e[3]) || find(e[0]) !== find(e[3]);
  for (const e of equations) {
    if (e[1] === '=') parent.set(find(e[0]), find(e[3]));
    else if (inOrder && !differs(e)) return false;
  }
  return inOrder || equations.every((e) => e[1] === '=' || differs(e));
}

function swimTime(grid: number[][], { countStart = true, sum = false }): number {
  const n = grid.length;
  const best = new Map([[0, countStart ? grid[0][0] : 0]]);
  const done = new Set<number>();
  for (;;) {
    const [cell, time] = [...best].filter(([c]) => !done.has(c)).reduce((a, b) => (b[1] < a[1] ? b : a));
    if (cell === n * n - 1) return time;
    done.add(cell);
    const [r, c] = [Math.floor(cell / n), cell % n];
    for (const [y, x] of [
      [r - 1, c],
      [r + 1, c],
      [r, c - 1],
      [r, c + 1],
    ]) {
      if (y < 0 || y >= n || x < 0 || x >= n) continue;
      const next = sum ? time + grid[y][x] : Math.max(time, grid[y][x]);
      if (next < (best.get(y * n + x) ?? Infinity)) best.set(y * n + x, next);
    }
  }
}

const WRONG: Record<string, WrongSolution[]> = {
  'longest-consecutive-sequence': [
    {
      name: 'let a repeated value extend the run',
      solve: (nums: number[]) =>
        longestRun(
          [...nums].sort((a, b) => a - b),
          (previous, value) => value - previous <= 1,
        ),
    },
    {
      name: 'restart the run at a repeated value',
      solve: (nums: number[]) =>
        longestRun(
          [...nums].sort((a, b) => a - b),
          (previous, value) => value === previous + 1,
        ),
    },
    {
      name: 'sort without a numeric comparator',
      solve: (nums: number[]) => longestRun([...new Set(nums)].sort(), (previous, value) => value === previous + 1),
    },
  ],
  'four-sum-count': [
    {
      name: 'count each pair sum once',
      solve: (nums1: number[], nums2: number[], nums3: number[], nums4: number[]) => {
        const sums = new Set(nums1.flatMap((a) => nums2.map((b) => a + b)));
        return nums3.flatMap((c) => nums4.filter((d) => sums.has(-c - d))).length;
      },
    },
    {
      name: 'match equal pair sums instead of opposite ones',
      solve: (nums1: number[], nums2: number[], nums3: number[], nums4: number[]) => {
        const sums = new Map<number, number>();
        for (const a of nums1) for (const b of nums2) sums.set(a + b, (sums.get(a + b) ?? 0) + 1);
        return nums3.reduce((count, c) => count + nums4.reduce((inner, d) => inner + (sums.get(c + d) ?? 0), 0), 0);
      },
    },
    {
      name: 'count distinct value tuples',
      solve: (nums1: number[], nums2: number[], nums3: number[], nums4: number[]) => {
        const [a, b, c, d] = [nums1, nums2, nums3, nums4].map((nums) => [...new Set(nums)]);
        let count = 0;
        for (const w of a) for (const x of b) for (const y of c) for (const z of d) if (w + x + y + z === 0) count++;
        return count;
      },
    },
  ],
  'three-sum': [
    {
      name: 'keep repeated triplets',
      solve: (nums: number[]) => {
        const triplets: number[][] = [];
        for (let i = 0; i < nums.length; i++)
          for (let j = i + 1; j < nums.length; j++)
            for (let k = j + 1; k < nums.length; k++) if (nums[i] + nums[j] + nums[k] === 0) triplets.push([nums[i], nums[j], nums[k]]);
        return triplets;
      },
    },
    {
      name: 'use each distinct value once',
      solve: (nums: number[]) => {
        const values = [...new Set(nums)];
        const triplets: number[][] = [];
        for (let i = 0; i < values.length; i++)
          for (let j = i + 1; j < values.length; j++)
            for (let k = j + 1; k < values.length; k++)
              if (values[i] + values[j] + values[k] === 0) triplets.push([values[i], values[j], values[k]]);
        return triplets;
      },
    },
    {
      name: 'reuse an index',
      solve: (nums: number[]) => {
        const found = new Map<string, number[]>();
        for (let i = 0; i < nums.length; i++)
          for (let j = i; j < nums.length; j++)
            for (let k = j; k < nums.length; k++)
              if (nums[i] + nums[j] + nums[k] === 0) {
                const triplet = [nums[i], nums[j], nums[k]].sort((a, b) => a - b);
                found.set(triplet.join(), triplet);
              }
        return [...found.values()];
      },
    },
  ],
  'trapping-rain-water': [
    {
      name: 'fill up to the tallest bar on the left only',
      solve: (height: number[]) => {
        let tallest = 0;
        return height.reduce((water, h) => water + (tallest = Math.max(tallest, h)) - h, 0);
      },
    },
    {
      name: 'fill only between neighboring peaks',
      solve: (height: number[]) => {
        const peaks = height.flatMap((h, i) => ((height[i - 1] ?? -1) <= h && h >= (height[i + 1] ?? -1) ? [i] : []));
        let water = 0;
        for (let k = 1; k < peaks.length; k++) {
          const level = Math.min(height[peaks[k - 1]], height[peaks[k]]);
          for (let i = peaks[k - 1] + 1; i < peaks[k]; i++) water += Math.max(0, level - height[i]);
        }
        return water;
      },
    },
    {
      name: 'move the pointer on the taller side',
      solve: (height: number[]) => {
        let [lo, hi, leftMax, rightMax, water] = [0, height.length - 1, 0, 0, 0];
        while (lo < hi)
          if (height[lo] > height[hi]) {
            leftMax = Math.max(leftMax, height[lo]);
            water += leftMax - height[lo++];
          } else {
            rightMax = Math.max(rightMax, height[hi]);
            water += rightMax - height[hi--];
          }
        return water;
      },
    },
  ],
  'character-replacement': [
    {
      name: 'add k to the most common letter overall',
      solve: (s: string, k: number) => Math.min(s.length, Math.max(...[...s].map((ch) => s.split(ch).length - 1)) + k),
    },
    {
      name: 'keep the letter at the start of the window',
      solve: (s: string, k: number) => {
        let best = 0;
        for (let i = 0; i < s.length; i++) {
          let changes = 0;
          let j = i;
          while (j < s.length && (s[j] === s[i] || changes++ < k)) j++;
          best = Math.max(best, j - i);
        }
        return best;
      },
    },
    {
      name: 'require fewer than k changes',
      solve: (s: string, k: number) => {
        const counts = new Map<string, number>();
        let most = 0;
        let best = 0;
        for (let lo = 0, hi = 0; hi < s.length; hi++) {
          counts.set(s[hi], (counts.get(s[hi]) ?? 0) + 1);
          most = Math.max(most, counts.get(s[hi])!);
          while (lo <= hi && hi - lo + 1 - most >= k) counts.set(s[lo], counts.get(s[lo++])! - 1);
          best = Math.max(best, hi - lo + 1);
        }
        return best;
      },
    },
  ],
  'permutation-in-string': [
    { name: 'look for s1 itself', solve: (s1: string, s2: string) => s2.includes(s1) },
    {
      name: 'count the letters of all of s2',
      solve: (s1: string, s2: string) => [...new Set(s1)].every((ch) => s2.split(ch).length >= s1.split(ch).length),
    },
    {
      name: 'skip the last window',
      solve: (s1: string, s2: string) => {
        const sorted = (s: string) => [...s].sort().join('');
        for (let i = 0; i + s1.length < s2.length; i++) if (sorted(s2.slice(i, i + s1.length)) === sorted(s1)) return true;
        return false;
      },
    },
  ],
  'minimum-window-substring': [
    { name: 'ignore repeated letters in t', solve: (s: string, t: string) => shortestCover(s, [...new Set(t)].join('')) },
    { name: 'keep the last of the shortest windows', solve: (s: string, t: string) => shortestCover(s, t, { last: true }) },
    { name: 'ignore case', solve: (s: string, t: string) => shortestCover(s, t, { ignoreCase: true }) },
  ],
  'search-rotated-array': [
    {
      name: 'plain binary search',
      solve: (nums: number[], target: number) => {
        let lo = 0;
        let hi = nums.length - 1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          if (nums[mid] === target) return mid;
          if (nums[mid] < target) lo = mid + 1;
          else hi = mid - 1;
        }
        return -1;
      },
    },
    {
      name: 'test the sorted left half with a strict comparison',
      solve: (nums: number[], target: number) => {
        let lo = 0;
        let hi = nums.length - 1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          if (nums[mid] === target) return mid;
          if (nums[lo] < nums[mid]) {
            if (nums[lo] <= target && target < nums[mid]) hi = mid - 1;
            else lo = mid + 1;
          } else if (nums[mid] < target && target <= nums[hi]) lo = mid + 1;
          else hi = mid - 1;
        }
        return -1;
      },
    },
    {
      name: 'stop when the range narrows to one value',
      solve: (nums: number[], target: number) => {
        let lo = 0;
        let hi = nums.length - 1;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (nums[mid] === target) return mid;
          if (nums[lo] <= nums[mid]) {
            if (nums[lo] <= target && target < nums[mid]) hi = mid - 1;
            else lo = mid + 1;
          } else if (nums[mid] < target && target <= nums[hi]) lo = mid + 1;
          else hi = mid - 1;
        }
        return -1;
      },
    },
  ],
  'find-min-rotated': [
    { name: 'return the first value', solve: (nums: number[]) => nums[0] },
    {
      name: 'compare the middle with the first value',
      solve: (nums: number[]) => {
        let lo = 0;
        let hi = nums.length - 1;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (nums[mid] >= nums[lo]) lo = mid + 1;
          else hi = mid;
        }
        return nums[lo];
      },
    },
    {
      name: 'step past the middle when it is not larger',
      solve: (nums: number[]) => {
        let lo = 0;
        let hi = nums.length - 1;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (nums[mid] > nums[hi]) lo = mid + 1;
          else hi = mid - 1;
        }
        return nums[lo];
      },
    },
  ],
  'split-array-largest-sum': [
    {
      name: 'search from 0 instead of from the largest value',
      solve: (nums: number[], k: number) => splitSearch(nums, k, 0, (sum, x, limit) => sum + x > limit),
    },
    {
      name: 'start a new part once the sum reaches the limit',
      solve: (nums: number[], k: number) => splitSearch(nums, k, Math.max(...nums), (sum, x, limit) => sum + x >= limit),
    },
    {
      name: 'cut whenever a part would pass the average',
      solve: (nums: number[], k: number) => {
        const average = Math.ceil(nums.reduce((s, x) => s + x, 0) / k);
        const sums = [0];
        for (const x of nums)
          if (sums.length < k && sums[sums.length - 1] > 0 && sums[sums.length - 1] + x > average) sums.push(x);
          else sums[sums.length - 1] += x;
        return Math.max(...sums);
      },
    },
  ],
  'product-of-array-except-self': [
    {
      name: 'divide by each value',
      solve: (nums: number[]) => {
        const total = nums.reduce((product, value) => product * value, 1);
        return nums.map((value) => total / value);
      },
    },
    {
      name: 'use only left products',
      solve: (nums: number[]) => {
        let product = 1;
        return nums.map((value) => {
          const left = product;
          product *= value;
          return left;
        });
      },
    },
  ],
  'contiguous-array': [
    {
      name: 'forget the empty prefix before index 0',
      solve: (nums: number[]) => {
        const first = new Map<number, number>();
        let balance = 0;
        let best = 0;
        nums.forEach((x, i) => {
          balance += x === 1 ? 1 : -1;
          if (first.has(balance)) best = Math.max(best, i - first.get(balance)!);
          else first.set(balance, i);
        });
        return best;
      },
    },
    {
      name: 'keep the latest index for each running sum',
      solve: (nums: number[]) => {
        const last = new Map<number, number>([[0, -1]]);
        let balance = 0;
        let best = 0;
        nums.forEach((x, i) => {
          balance += x === 1 ? 1 : -1;
          if (last.has(balance)) best = Math.max(best, i - last.get(balance)!);
          last.set(balance, i);
        });
        return best;
      },
    },
    {
      name: 'pair up all the 0s and 1s',
      solve: (nums: number[]) => 2 * Math.min(nums.filter((x) => x === 0).length, nums.filter((x) => x === 1).length),
    },
  ],
  'subarray-sums-divisible-k': [
    {
      name: 'keep the sign of a negative remainder',
      solve: (nums: number[], k: number) => {
        const seen = new Map([[0, 1]]);
        let sum = 0;
        let count = 0;
        for (const x of nums) {
          sum = (sum + x) % k;
          count += seen.get(sum) ?? 0;
          seen.set(sum, (seen.get(sum) ?? 0) + 1);
        }
        return count;
      },
    },
    {
      name: 'forget the empty prefix',
      solve: (nums: number[], k: number) => {
        const seen = new Map<number, number>();
        let sum = 0;
        let count = 0;
        for (const x of nums) {
          sum = (((sum + x) % k) + k) % k;
          count += seen.get(sum) ?? 0;
          seen.set(sum, (seen.get(sum) ?? 0) + 1);
        }
        return count;
      },
    },
  ],
  'largest-rectangle-in-histogram': [
    { name: 'use only the tallest bar', solve: (heights: number[]) => Math.max(...heights) },
    {
      name: 'forget rectangles left on the stack',
      solve: (heights: number[]) => {
        const stack: number[] = [];
        let best = 0;
        for (let i = 0; i < heights.length; i++) {
          while (stack.length && heights[stack[stack.length - 1]] > heights[i]) {
            const height = heights[stack.pop()!];
            best = Math.max(best, height * (i - (stack.length ? stack[stack.length - 1] : -1) - 1));
          }
          stack.push(i);
        }
        return best;
      },
    },
    {
      name: 'extend rectangles only to the right',
      solve: (heights: number[]) => {
        let best = 0;
        for (let i = 0; i < heights.length; i++)
          for (let j = i; j < heights.length && heights[j] >= heights[i]; j++) best = Math.max(best, heights[i] * (j - i + 1));
        return best;
      },
    },
  ],
  'sum-subarray-minimums': [
    {
      name: 'let ties extend both ways',
      solve: (arr: number[]) => spanSum(arr, (neighbor, value) => neighbor < value),
    },
    {
      name: 'let ties stop both ways',
      solve: (arr: number[]) => spanSum(arr, (neighbor, value) => neighbor <= value),
    },
    {
      name: 'skip the modulo',
      solve: (arr: number[]) => {
        let total = 0;
        arr.forEach((_, i) => {
          let smallest = Infinity;
          for (let j = i; j < arr.length; j++) total += smallest = Math.min(smallest, arr[j]);
        });
        return total;
      },
    },
  ],
  'sliding-window-maximum': [
    { name: 'never drop the maximum when it leaves', solve: (nums: number[], k: number) => slidingMaxima(nums, k, k + nums.length) },
    { name: 'drop the front one step late', solve: (nums: number[], k: number) => slidingMaxima(nums, k, k + 1) },
    { name: 'stop one window early', solve: (nums: number[], k: number) => slidingMaxima(nums, k, k).slice(0, -1) },
  ],
  'car-fleet': [
    {
      name: 'round arrival times down to whole hours',
      solve: (target: number, position: number[], speed: number[]) =>
        fleetCount(target, position, speed, (distance, s) => Math.floor(distance / s), true),
    },
    {
      name: 'start a new fleet for a car that catches up exactly at the target',
      solve: (target: number, position: number[], speed: number[]) =>
        fleetCount(target, position, speed, (distance, s) => distance / s, false),
    },
    {
      name: 'compare with the car just ahead instead of its fleet',
      solve: (target: number, position: number[], speed: number[]) => {
        const times = rangeOf(0, position.length - 1)
          .sort((a, b) => position[b] - position[a])
          .map((car) => (target - position[car]) / speed[car]);
        return times.filter((time, i) => i === 0 || time > times[i - 1]).length;
      },
    },
  ],
  'non-overlapping-intervals': [
    {
      name: 'keep the earliest starting interval',
      solve: (intervals: number[][]) => {
        let end = -Infinity;
        let removed = 0;
        for (const [start, finish] of [...intervals].sort((a, b) => a[0] - b[0])) {
          if (start >= end) end = finish;
          else removed++;
        }
        return removed;
      },
    },
    {
      name: 'treat touching endpoints as overlapping',
      solve: (intervals: number[][]) => {
        let end = -Infinity;
        let removed = 0;
        for (const [start, finish] of [...intervals].sort((a, b) => a[1] - b[1])) {
          if (start > end) end = finish;
          else removed++;
        }
        return removed;
      },
    },
    {
      name: 'keep the shortest intervals first',
      solve: (intervals: number[][]) => {
        const kept: number[][] = [];
        for (const interval of [...intervals].sort((a, b) => a[1] - a[0] - (b[1] - b[0])))
          if (kept.every(([start, end]) => interval[1] <= start || end <= interval[0])) kept.push(interval);
        return intervals.length - kept.length;
      },
    },
  ],
  'insert-interval': [
    {
      name: 'keep intervals that only touch apart',
      solve: (intervals: number[][], newInterval: number[]) => {
        const out: number[][] = [];
        let [start, end] = newInterval;
        let i = 0;
        for (; i < intervals.length && intervals[i][1] <= start; i++) out.push(intervals[i]);
        for (; i < intervals.length && intervals[i][0] < end; i++) {
          start = Math.min(start, intervals[i][0]);
          end = Math.max(end, intervals[i][1]);
        }
        return [...out, [start, end], ...intervals.slice(i)];
      },
    },
    {
      name: 'merge only the first overlapping interval',
      solve: (intervals: number[][], newInterval: number[]) => {
        const i = intervals.findIndex(([, end]) => end >= newInterval[0]);
        if (i < 0) return [...intervals, newInterval];
        if (intervals[i][0] > newInterval[1]) return [...intervals.slice(0, i), newInterval, ...intervals.slice(i)];
        const merged = [Math.min(intervals[i][0], newInterval[0]), Math.max(intervals[i][1], newInterval[1])];
        return [...intervals.slice(0, i), merged, ...intervals.slice(i + 1)];
      },
    },
    {
      name: 'insert the new interval only before a later one',
      solve: (intervals: number[][], newInterval: number[]) => {
        const out: number[][] = [];
        let [start, end] = newInterval;
        for (const [a, b] of intervals)
          if (b < start) out.push([a, b]);
          else if (a > end) {
            out.push([start, end], [a, b]);
            start = end = Infinity;
          } else {
            start = Math.min(start, a);
            end = Math.max(end, b);
          }
        return out;
      },
    },
  ],
  'meeting-rooms-ii': [
    {
      name: 'treat a meeting that starts as another ends as overlapping',
      solve: (intervals: number[][]) => {
        const starts = intervals.map(([start]) => start).sort((a, b) => a - b);
        const ends = intervals.map(([, end]) => end).sort((a, b) => a - b);
        let rooms = 0;
        let ended = 0;
        for (const start of starts)
          if (start <= ends[ended]) rooms++;
          else ended++;
        return rooms;
      },
    },
    {
      name: 'count the meetings that overlap each meeting',
      solve: (intervals: number[][]) =>
        Math.max(...intervals.map(([a, b]) => intervals.filter(([start, end]) => start < b && a < end).length)),
    },
  ],
  'min-arrows-balloons': [
    {
      name: 'let balloons that only touch need separate arrows',
      solve: (points: number[][]) => {
        let arrows = 0;
        let at = -Infinity;
        for (const [start, end] of [...points].sort((a, b) => a[1] - b[1]))
          if (start >= at) {
            arrows++;
            at = end;
          }
        return arrows;
      },
    },
    {
      name: 'sort by start and aim at the first balloon end',
      solve: (points: number[][]) => {
        let arrows = 0;
        let at = -Infinity;
        for (const [start, end] of [...points].sort((a, b) => a[0] - b[0]))
          if (start > at) {
            arrows++;
            at = end;
          }
        return arrows;
      },
    },
    {
      name: 'count groups of overlapping balloons',
      solve: (points: number[][]) => {
        let groups = 0;
        let reach = -Infinity;
        for (const [start, end] of [...points].sort((a, b) => a[0] - b[0])) {
          if (start > reach) groups++;
          reach = Math.max(reach, end);
        }
        return groups;
      },
    },
  ],
  'circular-array-loop': [
    {
      name: 'ignore direction changes',
      solve: (nums: number[]) => {
        for (let start = 0; start < nums.length; start++) {
          const seen = new Map<number, number>();
          let at = start;
          while (!seen.has(at)) {
            seen.set(at, seen.size);
            at = (((at + nums[at]) % nums.length) + nums.length) % nums.length;
          }
          if (seen.size - seen.get(at)! > 1) return true;
        }
        return false;
      },
    },
    {
      name: 'allow one-index loops',
      solve: (nums: number[]) => {
        for (let start = 0; start < nums.length; start++) {
          const direction = Math.sign(nums[start]);
          const seen = new Set<number>();
          let at = start;
          while (Math.sign(nums[at]) === direction && !seen.has(at)) {
            seen.add(at);
            at = (((at + nums[at]) % nums.length) + nums.length) % nums.length;
          }
          if (Math.sign(nums[at]) === direction && seen.has(at)) return true;
        }
        return false;
      },
    },
    {
      name: 'check only the path from index zero',
      solve: (nums: number[]) => {
        const direction = Math.sign(nums[0]);
        const seen = new Map<number, number>();
        let at = 0;
        while (Math.sign(nums[at]) === direction && !seen.has(at)) {
          seen.set(at, seen.size);
          at = (((at + nums[at]) % nums.length) + nums.length) % nums.length;
        }
        return Math.sign(nums[at]) === direction && seen.has(at) && seen.size - seen.get(at)! > 1;
      },
    },
    {
      name: 'mark the direction-change index as dead',
      solve: (nums: number[]) => {
        const dead = new Set<number>();
        for (let start = 0; start < nums.length; start++) {
          if (dead.has(start)) continue;
          const direction = Math.sign(nums[start]);
          const seen = new Map<number, number>();
          let at = start;
          while (!dead.has(at) && Math.sign(nums[at]) === direction && !seen.has(at)) {
            seen.set(at, seen.size);
            const next = (((at + nums[at]) % nums.length) + nums.length) % nums.length;
            if (next === at) break;
            at = next;
          }
          if (Math.sign(nums[at]) === direction && seen.has(at) && seen.size - seen.get(at)! > 1) return true;
          for (const index of seen.keys()) dead.add(index);
          dead.add(at);
        }
        return false;
      },
    },
  ],
  'happy-numbers': [
    {
      name: 'stop at a single digit and check for 1',
      solve: (nums: number[]) =>
        nums.filter((n) => {
          while (n >= 10) n = [...String(n)].reduce((sum, digit) => sum + Number(digit) ** 2, 0);
          return n === 1;
        }),
    },
    {
      name: 'compare the pointers before the first move',
      solve: (nums: number[]) =>
        nums.filter((n) => {
          const next = (x: number) => [...String(x)].reduce((sum, digit) => sum + Number(digit) ** 2, 0);
          let slow = n;
          let fast = n;
          while (slow !== fast) {
            slow = next(slow);
            fast = next(next(fast));
          }
          return slow === 1;
        }),
    },
  ],
  'k-closest-points': [
    {
      name: 'compare Manhattan distance',
      solve: (points: number[][], k: number) =>
        [...points].sort((a, b) => Math.abs(a[0]) + Math.abs(a[1]) - Math.abs(b[0]) - Math.abs(b[1])).slice(0, k),
    },
    {
      name: 'evict the closest point from a size-k heap',
      solve: (points: number[][], k: number) => [...points].sort((a, b) => b[0] ** 2 + b[1] ** 2 - (a[0] ** 2 + a[1] ** 2)).slice(0, k),
    },
    {
      name: 'drop repeated points',
      solve: (points: number[][], k: number) =>
        [...new Map(points.map((p) => [p.join(','), p])).values()]
          .sort((a, b) => a[0] ** 2 + a[1] ** 2 - b[0] ** 2 - b[1] ** 2)
          .slice(0, k),
    },
  ],
  'task-scheduler': [
    {
      name: 'forget that the tasks can outnumber the slots',
      solve: (tasks: string[], n: number) => {
        const counts = [...new Set(tasks)].map((kind) => tasks.filter((task) => task === kind).length);
        const most = Math.max(...counts);
        return (most - 1) * (n + 1) + counts.filter((count) => count === most).length;
      },
    },
    {
      name: 'add one unit for the most frequent kind only',
      solve: (tasks: string[], n: number) => {
        const most = Math.max(...[...new Set(tasks)].map((kind) => tasks.filter((task) => task === kind).length));
        return Math.max(tasks.length, (most - 1) * (n + 1) + 1);
      },
    },
    {
      name: 'run the tasks in the given order',
      solve: (tasks: string[], n: number) => {
        const lastRun = new Map<string, number>();
        let unit = 0;
        for (const task of tasks) {
          unit = Math.max(unit, (lastRun.get(task) ?? -Infinity) + n + 1);
          lastRun.set(task, unit++);
        }
        return unit;
      },
    },
  ],
  'kth-smallest-sorted-matrix': [
    { name: 'read the rows one after another', solve: (matrix: number[][], k: number) => matrix.flat()[k - 1] },
    {
      name: 'count each value once',
      solve: (matrix: number[][], k: number) => [...new Set(matrix.flat())].sort((a, b) => a - b)[k - 1],
    },
    {
      name: 'stop the value search as soon as the count equals k',
      solve: (matrix: number[][], k: number) => {
        const values = matrix.flat();
        let lo = Math.min(...values);
        let hi = Math.max(...values);
        while (lo <= hi) {
          const mid = Math.floor((lo + hi) / 2);
          const count = values.filter((value) => value <= mid).length;
          if (count === k) return mid;
          if (count < k) lo = mid + 1;
          else hi = mid - 1;
        }
        return lo;
      },
    },
  ],
  'shortest-path-binary-matrix': [
    { name: 'move only across sides', solve: (grid: number[][]) => shortestClearPath(grid, SIDE_WAYS, 1, true) },
    { name: 'count moves instead of cells', solve: (grid: number[][]) => shortestClearPath(grid, EIGHT_WAYS, 0, true) },
    { name: 'never check the start cell', solve: (grid: number[][]) => shortestClearPath(grid, EIGHT_WAYS, 1, false) },
  ],
  'word-ladder': [
    {
      name: 'count the changes instead of the words',
      solve: (beginWord: string, endWord: string, wordList: string[]) =>
        Math.max(0, (ladderLengths(beginWord, wordList).get(endWord) ?? 1) - 1),
    },
    {
      name: 'let the ladder end at a word outside the list',
      solve: (beginWord: string, endWord: string, wordList: string[]) => ladderLengths(beginWord, [...wordList, endWord]).get(endWord) ?? 0,
    },
    {
      name: 'return the first ladder a depth-first search finds',
      solve: (beginWord: string, endWord: string, wordList: string[]) => {
        const used = new Set([beginWord]);
        const climb = (word: string, words: number): number => {
          if (word === endWord) return words;
          for (const next of wordList)
            if (!used.has(next) && [...next].filter((letter, i) => letter !== word[i]).length === 1) {
              used.add(next);
              const found = climb(next, words + 1);
              if (found) return found;
            }
          return 0;
        };
        return climb(beginWord, 1);
      },
    },
  ],
  'zero-one-matrix': [
    {
      name: 'fill from the top-left only',
      solve: (mat: number[][]) => {
        const distance = mat.map((row) => row.map((cell) => (cell ? Infinity : 0)));
        distance.forEach((row, r) =>
          row.forEach((d, c) => {
            row[c] = Math.min(d, (distance[r - 1]?.[c] ?? Infinity) + 1, (row[c - 1] ?? Infinity) + 1);
          }),
        );
        return distance;
      },
    },
    {
      name: 'count a diagonal step as one',
      solve: (mat: number[][]) => {
        const zeros = mat.flatMap((row, r) => row.flatMap((cell, c) => (cell ? [] : [[r, c]])));
        return mat.map((row, r) => row.map((_, c) => Math.min(...zeros.map(([y, x]) => Math.max(Math.abs(y - r), Math.abs(x - c))))));
      },
    },
    {
      name: 'look for a 0 only in the same row or column',
      solve: (mat: number[][]) =>
        mat.map((row, r) =>
          row.map((_, c) =>
            Math.min(
              ...row.flatMap((cell, x) => (cell ? [] : [Math.abs(x - c)])),
              ...mat.flatMap((other, y) => (other[c] ? [] : [Math.abs(y - r)])),
            ),
          ),
        ),
    },
  ],
  'combination-sum': [
    {
      name: 'use each value at most once',
      solve: (candidates: number[], target: number) => {
        const out: number[][] = [];
        const go = (from: number, rest: number, path: number[]) => {
          if (rest === 0) out.push(path);
          for (let i = from; i < candidates.length; i++)
            if (candidates[i] <= rest) go(i + 1, rest - candidates[i], [...path, candidates[i]]);
        };
        go(0, target, []);
        return out;
      },
    },
    {
      name: 'restart from the first value at every step',
      solve: (candidates: number[], target: number) => {
        const out: number[][] = [];
        const go = (rest: number, path: number[]) => {
          if (rest === 0) out.push(path);
          for (const c of candidates) if (c <= rest) go(rest - c, [...path, c]);
        };
        go(target, []);
        return out;
      },
    },
    {
      name: 'stop at the first value too large without sorting',
      solve: (candidates: number[], target: number) => {
        const out: number[][] = [];
        const go = (from: number, rest: number, path: number[]) => {
          if (rest === 0) out.push(path);
          for (let i = from; i < candidates.length && candidates[i] <= rest; i++) go(i, rest - candidates[i], [...path, candidates[i]]);
        };
        go(0, target, []);
        return out;
      },
    },
  ],
  'word-search': [
    { name: 'let a path reuse a cell', solve: (board: string[][], word: string) => spellsOnBoard(board, word, { reuse: true }) },
    { name: 'allow diagonal steps', solve: (board: string[][], word: string) => spellsOnBoard(board, word, { diagonal: true }) },
    { name: 'never unmark a cell', solve: (board: string[][], word: string) => spellsOnBoard(board, word, { unmark: false }) },
  ],
  permutations: [
    {
      name: 'only avoid repeating the value just placed',
      solve: (nums: number[]) => {
        const out: number[][] = [];
        const go = (path: number[]) => {
          if (path.length === nums.length) out.push(path);
          else for (const x of nums) if (x !== path[path.length - 1]) go([...path, x]);
        };
        go([]);
        return out;
      },
    },
    {
      name: 'swap into place without swapping back',
      solve: (nums: number[]) => {
        const a = [...nums];
        const out: number[][] = [];
        const go = (i: number) => {
          if (i === a.length) out.push([...a]);
          for (let j = i; j < a.length; j++) {
            [a[i], a[j]] = [a[j], a[i]];
            go(i + 1);
          }
        };
        go(0);
        return out;
      },
    },
    {
      name: 'return only the rotations',
      solve: (nums: number[]) => nums.map((_, k) => [...nums.slice(k), ...nums.slice(0, k)]),
    },
  ],
  'n-queens-count': [
    { name: 'check columns but not diagonals', solve: (n: number) => queenPlacements(n, { down: false, up: false }) },
    { name: 'check only one diagonal direction', solve: (n: number) => queenPlacements(n, { down: true, up: false }) },
    { name: 'stop at the first placement', solve: (n: number) => Math.min(1, queenPlacements(n, { down: true, up: true })) },
  ],
  'parallel-courses': [
    { name: 'take one course per semester', solve: (n: number) => n },
    {
      name: 'detect only mutual prerequisite pairs',
      solve: (n: number, relations: number[][]) => {
        const pairs = new Set(relations.map(([before, after]) => `${before},${after}`));
        if (relations.some(([before, after]) => pairs.has(`${after},${before}`))) return -1;
        const degree = Array<number>(n + 1).fill(0);
        const next = Array.from({ length: n + 1 }, () => [] as number[]);
        for (const [before, after] of relations) {
          next[before].push(after);
          degree[after]++;
        }
        let queue = Array.from({ length: n }, (_, i) => i + 1).filter((course) => degree[course] === 0);
        let semesters = 0;
        while (queue.length) {
          queue = queue.flatMap((course) => next[course].filter((following) => --degree[following] === 0));
          semesters++;
        }
        return semesters;
      },
    },
  ],
  'longest-increasing-path': [
    {
      name: 'move only right and down',
      solve: (matrix: number[][]) => {
        const longest = matrix.map((row) => row.map(() => 1));
        for (let r = matrix.length - 1; r >= 0; r--)
          for (let c = matrix[0].length - 1; c >= 0; c--) {
            if (matrix[r + 1]?.[c] > matrix[r][c]) longest[r][c] = Math.max(longest[r][c], 1 + longest[r + 1][c]);
            if (matrix[r][c + 1] > matrix[r][c]) longest[r][c] = Math.max(longest[r][c], 1 + longest[r][c + 1]);
          }
        return Math.max(...longest.flat());
      },
    },
    {
      name: 'always step to the smallest larger neighbor',
      solve: (matrix: number[][]) => {
        let best = 0;
        matrix.forEach((row, r0) =>
          row.forEach((_, c0) => {
            let [r, c, length] = [r0, c0, 1];
            for (;;) {
              const larger = [
                [r - 1, c],
                [r + 1, c],
                [r, c - 1],
                [r, c + 1],
              ].filter(([y, x]) => matrix[y]?.[x] > matrix[r][c]);
              if (!larger.length) break;
              [r, c] = larger.reduce((a, b) => (matrix[b[0]][b[1]] < matrix[a[0]][a[1]] ? b : a));
              length++;
            }
            best = Math.max(best, length);
          }),
        );
        return best;
      },
    },
    {
      name: 'let equal neighbors extend a path',
      solve: (matrix: number[][]) => {
        const seen = new Set<string>();
        const longestFrom = (r: number, c: number): number => {
          seen.add(`${r},${c}`);
          let best = 1;
          for (const [y, x] of [
            [r - 1, c],
            [r + 1, c],
            [r, c - 1],
            [r, c + 1],
          ])
            if (matrix[y]?.[x] >= matrix[r][c] && !seen.has(`${y},${x}`)) best = Math.max(best, 1 + longestFrom(y, x));
          seen.delete(`${r},${c}`);
          return best;
        };
        return Math.max(...matrix.flatMap((row, r) => row.map((_, c) => longestFrom(r, c))));
      },
    },
  ],
  'minimum-height-trees': [
    {
      name: 'remove leaves one at a time until two nodes remain',
      solve: (n: number, edges: number[][]) => {
        if (n === 1) return [0];
        const { neighbors, degree } = treeDegrees(n, edges);
        const queue = rangeOf(0, n - 1).filter((node) => degree[node] === 1);
        const removed = new Set<number>();
        for (let head = 0; n - removed.size > 2; head++) {
          removed.add(queue[head]);
          for (const node of neighbors[queue[head]]) if (--degree[node] === 1) queue.push(node);
        }
        return rangeOf(0, n - 1).filter((node) => !removed.has(node));
      },
    },
    {
      name: 'take the middle of the longest path from node 0',
      solve: (n: number, edges: number[][]) => {
        const { neighbors } = treeDegrees(n, edges);
        const from = new Map<number, number>([[0, -1]]);
        let last = 0;
        for (const [node] of from) {
          last = node;
          for (const next of neighbors[node]) if (!from.has(next)) from.set(next, node);
        }
        const path = [last];
        while (from.get(path[path.length - 1])! >= 0) path.push(from.get(path[path.length - 1])!);
        const mid = (path.length - 1) / 2;
        return [...new Set([path[Math.floor(mid)], path[Math.ceil(mid)]])];
      },
    },
    {
      name: 'forget the tree with a single node',
      solve: (n: number, edges: number[][]) => {
        const { neighbors, degree } = treeDegrees(n, edges);
        let leaves = rangeOf(0, n - 1).filter((node) => degree[node] === 1);
        for (let remaining = n; remaining > 2;) {
          remaining -= leaves.length;
          leaves = leaves.flatMap((leaf) => neighbors[leaf].filter((node) => --degree[node] === 1));
        }
        return leaves;
      },
    },
  ],
  'number-of-provinces': [
    {
      name: 'subtract one for every connection',
      solve: (isConnected: number[][]) => {
        let provinces = isConnected.length;
        for (let i = 0; i < isConnected.length; i++) for (let j = i + 1; j < isConnected.length; j++) provinces -= isConnected[i][j];
        return provinces;
      },
    },
    {
      name: 'copy the earlier city label forward',
      solve: (isConnected: number[][]) => {
        const label = isConnected.map((_, i) => i);
        for (let i = 0; i < isConnected.length; i++)
          for (let j = i + 1; j < isConnected.length; j++) if (isConnected[i][j]) label[j] = label[i];
        return new Set(label).size;
      },
    },
    {
      name: 'count cities with no earlier neighbor',
      solve: (isConnected: number[][]) => isConnected.filter((row, i) => !row.slice(0, i).includes(1)).length,
    },
  ],
  'equality-equations': [
    { name: 'check each inequality as it comes', solve: (equations: string[]) => equalitiesHold(equations, { inOrder: true }) },
    { name: 'skip an inequality between a letter and itself', solve: (equations: string[]) => equalitiesHold(equations, { selfOk: true }) },
    {
      name: 'compare only equations stated directly',
      solve: (equations: string[]) =>
        equations.every(
          (e) => e[1] === '=' || (e[0] !== e[3] && !equations.includes(`${e[0]}==${e[3]}`) && !equations.includes(`${e[3]}==${e[0]}`)),
        ),
    },
  ],
  'path-with-minimum-effort': [
    {
      name: 'minimize the sum of steps',
      solve: (heights: number[][]) => {
        const rows = heights.length;
        const cols = heights[0].length;
        const distance = Array<number>(rows * cols).fill(Infinity);
        const used = new Set<number>();
        distance[0] = 0;
        while (used.size < rows * cols) {
          let at = -1;
          for (let i = 0; i < distance.length; i++) if (!used.has(i) && (at < 0 || distance[i] < distance[at])) at = i;
          if (at < 0 || distance[at] === Infinity) break;
          used.add(at);
          const r = Math.floor(at / cols);
          const c = at % cols;
          for (const [y, x] of [
            [r - 1, c],
            [r + 1, c],
            [r, c - 1],
            [r, c + 1],
          ])
            if (y >= 0 && y < rows && x >= 0 && x < cols)
              distance[y * cols + x] = Math.min(distance[y * cols + x], distance[at] + Math.abs(heights[r][c] - heights[y][x]));
        }
        return distance[distance.length - 1];
      },
    },
    {
      name: 'move only right and down',
      solve: (heights: number[][]) => {
        const rows = heights.length;
        const cols = heights[0].length;
        const best = Array.from({ length: rows }, () => Array<number>(cols).fill(Infinity));
        best[0][0] = 0;
        for (let r = 0; r < rows; r++)
          for (let c = 0; c < cols; c++) {
            if (r > 0) best[r][c] = Math.min(best[r][c], Math.max(best[r - 1][c], Math.abs(heights[r][c] - heights[r - 1][c])));
            if (c > 0) best[r][c] = Math.min(best[r][c], Math.max(best[r][c - 1], Math.abs(heights[r][c] - heights[r][c - 1])));
          }
        return best[rows - 1][cols - 1];
      },
    },
    {
      name: 'mark cells visited when first discovered',
      solve: (heights: number[][]) => {
        const rows = heights.length;
        const cols = heights[0].length;
        const queue: [number, number][] = [[0, 0]];
        const seen = new Set([0]);
        while (queue.length) {
          queue.sort((a, b) => a[0] - b[0]);
          const [effort, cell] = queue.shift()!;
          if (cell === rows * cols - 1) return effort;
          const r = Math.floor(cell / cols);
          const c = cell % cols;
          for (const [y, x] of [
            [r - 1, c],
            [r + 1, c],
            [r, c - 1],
            [r, c + 1],
          ]) {
            const next = y * cols + x;
            if (y >= 0 && y < rows && x >= 0 && x < cols && !seen.has(next)) {
              seen.add(next);
              queue.push([Math.max(effort, Math.abs(heights[r][c] - heights[y][x])), next]);
            }
          }
        }
        return 0;
      },
    },
  ],
  'cheapest-flights': [
    {
      name: 'run plain Dijkstra on price and drop routes over k stops',
      solve: (n: number, flights: number[][], src: number, dst: number, k: number) => {
        const price = Array<number>(n).fill(Infinity);
        price[src] = 0;
        const queue: number[][] = [[0, src, 0]];
        while (queue.length) {
          queue.sort((a, b) => a[0] - b[0]);
          const [cost, city, taken] = queue.shift()!;
          if (city === dst) return cost;
          if (taken > k) continue;
          for (const [from, to, fare] of flights)
            if (from === city && cost + fare < price[to]) {
              price[to] = cost + fare;
              queue.push([price[to], to, taken + 1]);
            }
        }
        return -1;
      },
    },
    {
      name: 'relax in place during a Bellman-Ford round',
      solve: (n: number, flights: number[][], src: number, dst: number, k: number) => {
        const price = Array<number>(n).fill(Infinity);
        price[src] = 0;
        for (let round = 0; round <= k; round++)
          for (const [from, to, fare] of flights) price[to] = Math.min(price[to], price[from] + fare);
        return price[dst] === Infinity ? -1 : price[dst];
      },
    },
    {
      name: 'allow only k flights',
      solve: (n: number, flights: number[][], src: number, dst: number, k: number) => {
        let price = Array<number>(n).fill(Infinity);
        price[src] = 0;
        for (let round = 0; round < k; round++) {
          const next = [...price];
          for (const [from, to, fare] of flights) next[to] = Math.min(next[to], price[from] + fare);
          price = next;
        }
        return price[dst] === Infinity ? -1 : price[dst];
      },
    },
  ],
  'swim-rising-water': [
    { name: 'start the clock at 0, not at the first cell', solve: (grid: number[][]) => swimTime(grid, { countStart: false }) },
    { name: 'add up the heights instead of taking the highest', solve: (grid: number[][]) => swimTime(grid, { sum: true }) },
    {
      name: 'move only right and down',
      solve: (grid: number[][]) => {
        const time = grid.map((row) => row.map(() => Infinity));
        grid.forEach((row, r) =>
          row.forEach((height, c) => {
            const before = r === 0 && c === 0 ? height : Math.min(time[r - 1]?.[c] ?? Infinity, time[r][c - 1] ?? Infinity);
            time[r][c] = Math.max(before, height);
          }),
        );
        return time[grid.length - 1][grid.length - 1];
      },
    },
  ],
  'replace-words': [
    {
      name: 'choose the longest matching root',
      solve: (dictionary: string[], sentence: string) =>
        sentence
          .split(' ')
          .map((word) => dictionary.filter((root) => word.startsWith(root)).sort((a, b) => b.length - a.length)[0] ?? word)
          .join(' '),
    },
    {
      name: 'replace only whole words',
      solve: (_dictionary: string[], sentence: string) => sentence,
    },
    {
      name: 'take the first matching root in dictionary order',
      solve: (dictionary: string[], sentence: string) =>
        sentence
          .split(' ')
          .map((word) => dictionary.find((root) => word.startsWith(root)) ?? word)
          .join(' '),
    },
  ],
  'word-search-ii': [
    { name: 'use a cell twice in one word', solve: (board: string[][], words: string[]) => boardWords(board, words, { reuse: true }) },
    { name: 'move diagonally too', solve: (board: string[][], words: string[]) => boardWords(board, words, { diagonal: true }) },
    {
      name: 'report a word once per path',
      solve: (board: string[][], words: string[]) => boardWords(board, words, { repeat: true }),
    },
    {
      name: 'stop a path at the first word it spells',
      solve: (board: string[][], words: string[]) => boardWords(board, words, { stopAtWord: true }),
    },
  ],
  'longest-word-in-dictionary': [
    {
      name: 'keep the first longest word in list order',
      solve: (words: string[]) =>
        words
          .filter((word) => rangeOf(1, word.length - 1).every((k) => words.includes(word.slice(0, k))))
          .reduce((best, word) => (word.length > best.length ? word : best), ''),
    },
    {
      name: 'require only the word one letter shorter',
      solve: (words: string[]) =>
        words
          .filter((word) => word.length === 1 || words.includes(word.slice(0, -1)))
          .sort((a, b) => b.length - a.length || (a < b ? -1 : 1))[0] ?? '',
    },
    {
      name: 'skip the one-letter prefix',
      solve: (words: string[]) =>
        words
          .filter((word) => rangeOf(2, word.length - 1).every((k) => words.includes(word.slice(0, k))))
          .sort((a, b) => b.length - a.length || (a < b ? -1 : 1))[0] ?? '',
    },
  ],
  'word-break': [
    { name: 'take the longest word that fits', solve: (s: string, wordDict: string[]) => greedyWordBreak(s, wordDict, true) },
    { name: 'take the shortest word that fits', solve: (s: string, wordDict: string[]) => greedyWordBreak(s, wordDict, false) },
    {
      name: 'use each word at most once',
      solve: (s: string, wordDict: string[]) => {
        const splits = (rest: string, left: string[]): boolean =>
          rest === '' ||
          left.some(
            (word, k) =>
              rest.startsWith(word) &&
              splits(
                rest.slice(word.length),
                left.filter((_, j) => j !== k),
              ),
          );
        return splits(s, wordDict);
      },
    },
  ],
  'partition-equal-subset': [
    {
      name: 'give each value, largest first, to the lighter group',
      solve: (nums: number[]) => {
        const sums = [0, 0];
        for (const x of [...nums].sort((a, b) => b - a)) sums[sums[0] <= sums[1] ? 0 : 1] += x;
        return sums[0] === sums[1];
      },
    },
    {
      name: 'let a value count more than once',
      solve: (nums: number[]) => {
        const total = nums.reduce((sum, x) => sum + x, 0);
        if (total % 2) return false;
        const reachable = [true, ...Array<boolean>(total / 2).fill(false)];
        for (const x of nums) for (let s = x; s <= total / 2; s++) reachable[s] ||= reachable[s - x];
        return reachable[total / 2];
      },
    },
  ],
  'longest-increasing-subsequence': [
    {
      name: 'let equal values extend the subsequence',
      solve: (nums: number[]) => {
        const tails: number[] = [];
        for (const x of nums) {
          const k = tails.findIndex((tail) => tail > x);
          tails[k === -1 ? tails.length : k] = x;
        }
        return tails.length;
      },
    },
    {
      name: 'take every value bigger than the last one taken',
      solve: (nums: number[]) =>
        nums.reduce((taken: number[], x) => (x > taken[taken.length - 1] ? [...taken, x] : taken), [nums[0]]).length,
    },
    {
      name: 'find the longest increasing run of neighbors',
      solve: (nums: number[]) => longestRun(nums, (previous, value) => previous < value),
    },
  ],
  'decode-ways': [
    {
      name: 'decode a lone 0 as a letter',
      solve: (s: string) => {
        let [before, last] = [0, 1];
        for (let i = 0; i < s.length; i++) {
          const pair = i > 0 && (s[i - 1] === '1' || (s[i - 1] === '2' && s[i] <= '6'));
          [before, last] = [last, (last + (pair ? before : 0)) % 1_000_000_007];
        }
        return last;
      },
    },
    {
      name: 'accept a two-digit code with a leading 0',
      solve: (s: string) => {
        let [before, last] = [0, 1];
        for (let i = 0; i < s.length; i++) {
          const pair = i > 0 && Number(s.slice(i - 1, i + 1)) <= 26;
          [before, last] = [last, ((s[i] === '0' ? 0 : last) + (pair ? before : 0)) % 1_000_000_007];
        }
        return last;
      },
    },
    {
      name: 'skip the modulo',
      solve: (s: string) => {
        let [before, last] = [0, 1];
        for (let i = 0; i < s.length; i++) {
          const pair = i > 0 && (s[i - 1] === '1' || (s[i - 1] === '2' && s[i] <= '6'));
          [before, last] = [last, (s[i] === '0' ? 0 : last) + (pair ? before : 0)];
        }
        return last;
      },
    },
  ],
  'edit-distance': [
    {
      name: 'use only insertions and deletions',
      solve: (a: string, b: string) => {
        const table = Array.from({ length: a.length + 1 }, () => Array<number>(b.length + 1).fill(0));
        for (let i = 1; i <= a.length; i++)
          for (let j = 1; j <= b.length; j++)
            table[i][j] = a[i - 1] === b[j - 1] ? table[i - 1][j - 1] + 1 : Math.max(table[i - 1][j], table[i][j - 1]);
        return a.length + b.length - 2 * table[a.length][b.length];
      },
    },
    {
      name: 'count letters at different positions',
      solve: (a: string, b: string) =>
        Math.abs(a.length - b.length) +
        Array.from({ length: Math.min(a.length, b.length) }, (_, i) => Number(a[i] !== b[i])).reduce((x, y) => x + y, 0),
    },
  ],
  'interleaving-string': [
    {
      name: 'take from s1 whenever its next letter matches',
      solve: (s1: string, s2: string, s3: string) => {
        let i = 0;
        let j = 0;
        for (const letter of s3)
          if (s1[i] === letter) i++;
          else if (s2[j] === letter) j++;
          else return false;
        return i === s1.length && j === s2.length;
      },
    },
    {
      name: 'compare letter counts only',
      solve: (s1: string, s2: string, s3: string) => [...(s1 + s2)].sort().join('') === [...s3].sort().join(''),
    },
    {
      name: 'skip the length check',
      solve: (s1: string, s2: string, s3: string) => {
        const dp = Array.from({ length: s1.length + 1 }, () => Array<boolean>(s2.length + 1).fill(false));
        for (let i = 0; i <= s1.length; i++)
          for (let j = 0; j <= s2.length; j++)
            dp[i][j] =
              (i === 0 && j === 0) ||
              (i > 0 && dp[i - 1][j] && s1[i - 1] === s3[i + j - 1]) ||
              (j > 0 && dp[i][j - 1] && s2[j - 1] === s3[i + j - 1]);
        return dp[s1.length][s2.length];
      },
    },
  ],
  'max-path-sum': [
    {
      name: 'start the best sum at 0',
      solve: (root: TreeNode) => {
        let best = 0;
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
    },
    {
      name: 'keep negative child sums',
      solve: (root: TreeNode) => {
        let best = -Infinity;
        const gain = (node: TreeNode | null): number => {
          if (!node) return 0;
          const left = gain(node.left);
          const right = gain(node.right);
          best = Math.max(best, node.val + left + right);
          return node.val + Math.max(left, right);
        };
        gain(root);
        return best;
      },
    },
    {
      name: 'pass a path that turns up to the parent',
      solve: (root: TreeNode) => {
        let best = -Infinity;
        const gain = (node: TreeNode | null): number => {
          if (!node) return 0;
          const through = node.val + Math.max(gain(node.left), 0) + Math.max(gain(node.right), 0);
          best = Math.max(best, through);
          return through;
        };
        gain(root);
        return best;
      },
    },
  ],
  'validate-bst': [
    {
      name: 'compare each node with its children only',
      solve: (root: TreeNode | null) => {
        const valid = (node: TreeNode | null): boolean =>
          !node ||
          ((!node.left || node.left.val < node.val) && (!node.right || node.right.val > node.val) && valid(node.left) && valid(node.right));
        return valid(root);
      },
    },
    {
      name: 'let a value equal an ancestor',
      solve: (root: TreeNode | null) => {
        const valid = (node: TreeNode | null, lo: number, hi: number): boolean =>
          !node || (lo <= node.val && node.val <= hi && valid(node.left, lo, node.val) && valid(node.right, node.val, hi));
        return valid(root, -Infinity, Infinity);
      },
    },
    {
      name: 'start the range at the 32-bit limits',
      solve: (root: TreeNode | null) => {
        const valid = (node: TreeNode | null, lo: number, hi: number): boolean =>
          !node || (lo < node.val && node.val < hi && valid(node.left, lo, node.val) && valid(node.right, node.val, hi));
        return valid(root, -(2 ** 31), 2 ** 31 - 1);
      },
    },
  ],
  'lowest-common-ancestor': [
    {
      name: 'walk down as in a search tree',
      solve: (root: TreeNode, p: number, q: number) => {
        let node: TreeNode | null = root;
        while (node && ((p < node.val && q < node.val) || (p > node.val && q > node.val))) node = p < node.val ? node.left : node.right;
        return node?.val;
      },
    },
    {
      name: 'look only for a node that splits them between its subtrees',
      solve: (root: TreeNode, p: number, q: number) => {
        const has = (node: TreeNode | null, value: number): boolean =>
          !!node && (node.val === value || has(node.left, value) || has(node.right, value));
        let answer = root.val;
        const visit = (node: TreeNode | null): void => {
          if (!node) return;
          if ((has(node.left, p) && has(node.right, q)) || (has(node.left, q) && has(node.right, p))) answer = node.val;
          visit(node.left);
          visit(node.right);
        };
        visit(root);
        return answer;
      },
    },
  ],
  'right-side-view': [
    {
      name: 'walk down right children only',
      solve: (root: TreeNode | null) => {
        const view: number[] = [];
        for (let node = root; node; node = node.right) view.push(node.val);
        return view;
      },
    },
    {
      name: 'walk down the right child, or the left when there is none',
      solve: (root: TreeNode | null) => {
        const view: number[] = [];
        for (let node = root; node; node = node.right ?? node.left) view.push(node.val);
        return view;
      },
    },
    {
      name: 'take the leftmost node on each level',
      solve: (root: TreeNode | null) => {
        const view: number[] = [];
        const visit = (node: TreeNode | null, depth: number): void => {
          if (!node) return;
          if (depth === view.length) view.push(node.val);
          visit(node.left, depth + 1);
          visit(node.right, depth + 1);
        };
        visit(root, 0);
        return view;
      },
    },
  ],
  'longest-palindromic-subsequence': [
    {
      name: 'find the longest palindromic substring',
      solve: (s: string) => {
        let best = 0;
        for (let i = 0; i < s.length; i++)
          for (let j = i; j < s.length; j++) {
            const piece = s.slice(i, j + 1);
            if (piece === [...piece].reverse().join('')) best = Math.max(best, piece.length);
          }
        return best;
      },
    },
    {
      name: 'rearrange the letters into a palindrome',
      solve: (s: string) => {
        const counts = new Map<string, number>();
        for (const letter of s) counts.set(letter, (counts.get(letter) ?? 0) + 1);
        const odd = [...counts.values()].some((count) => count % 2 === 1);
        return [...counts.values()].reduce((sum, count) => sum + count - (count % 2), 0) + (odd ? 1 : 0);
      },
    },
    {
      name: 'count only matched pairs, never a middle letter',
      solve: (s: string) => {
        let below = Array<number>(s.length).fill(0);
        for (let i = s.length - 1; i >= 0; i--) {
          const row = Array<number>(s.length).fill(0);
          for (let j = i + 1; j < s.length; j++) row[j] = s[i] === s[j] ? below[j - 1] + 2 : Math.max(below[j], row[j - 1]);
          below = row;
        }
        return below[s.length - 1];
      },
    },
  ],
  'gas-station': [
    {
      name: 'require more gas than cost in total',
      solve: (gas: number[], cost: number[]) => {
        let total = 0;
        let tank = 0;
        let start = 0;
        gas.forEach((g, i) => {
          total += g - cost[i];
          tank += g - cost[i];
          if (tank < 0) [start, tank] = [i + 1, 0];
        });
        return total > 0 ? start : -1;
      },
    },
    {
      name: 'restart at the station where the tank ran dry',
      solve: (gas: number[], cost: number[]) => {
        let total = 0;
        let tank = 0;
        let start = 0;
        gas.forEach((g, i) => {
          total += g - cost[i];
          tank += g - cost[i];
          if (tank < 0) [start, tank] = [i, 0];
        });
        return total < 0 ? -1 : start;
      },
    },
    {
      name: 'start where gas minus cost is largest',
      solve: (gas: number[], cost: number[]) => {
        const gains = gas.map((g, i) => g - cost[i]);
        return gains.reduce((x, y) => x + y, 0) < 0 ? -1 : gains.indexOf(Math.max(...gains));
      },
    },
  ],
  'partition-labels': [
    {
      name: 'close a part where the current letter last appears',
      solve: (s: string) => {
        const sizes: number[] = [];
        for (let i = 0, start = 0; i < s.length; i++)
          if (s.lastIndexOf(s[i]) === i) {
            sizes.push(i - start + 1);
            start = i + 1;
          }
        return sizes;
      },
    },
    {
      name: 'end a part where its first letter last appears',
      solve: (s: string) => {
        const sizes: number[] = [];
        for (let start = 0; start < s.length;) {
          const end = s.lastIndexOf(s[start]);
          sizes.push(end - start + 1);
          start = end + 1;
        }
        return sizes;
      },
    },
  ],
  'counting-bits': [
    {
      name: 'stop before n',
      solve: (n: number) => Array.from({ length: n }, (_, i) => [...i.toString(2)].filter((bit) => bit === '1').length),
    },
    {
      name: 'add one bit for every number',
      solve: (n: number) => {
        const ans = Array<number>(n + 1).fill(0);
        for (let i = 1; i <= n; i++) ans[i] = ans[i >> 1] + 1;
        return ans;
      },
    },
  ],
  'maximum-xor-pair': [
    {
      name: 'pair the largest value with every other',
      solve: (nums: number[]) => {
        const largest = Math.max(...nums);
        return Math.max(...nums.map((x) => x ^ largest));
      },
    },
    {
      name: 'compare bits 29 to 0 only',
      solve: (nums: number[]) => {
        let best = 0;
        for (let bit = 29; bit >= 0; bit--) {
          const prefixes = new Set(nums.map((x) => (x & 0x3fffffff) >> bit));
          const candidate = (best << 1) | 1;
          best = [...prefixes].some((p) => prefixes.has(candidate ^ p)) ? candidate : best << 1;
        }
        return best;
      },
    },
  ],
};

describe('new coding problem hidden cases', () => {
  it('keeps each second problem beside its first and the full catalog in curriculum order', () => {
    const patternOrder = new Map<string, number>(PATTERN_CATALOG.map((pattern, i) => [pattern.id, i]));
    const positions = CODING_CATALOG.map((problem) => patternOrder.get(problem.patternIds[0])!);
    expect(positions).toEqual([...positions].sort((a, b) => a - b));
    for (const [first, second] of [
      ['subarray-sum-k', 'product-of-array-except-self'],
      ['daily-temperatures', 'largest-rectangle-in-histogram'],
      ['find-duplicate', 'circular-array-loop'],
      ['merge-intervals', 'non-overlapping-intervals'],
      ['course-schedule', 'parallel-courses'],
      ['network-delay', 'path-with-minimum-effort'],
      ['count-prefixes', 'replace-words'],
      ['longest-common-subsequence', 'edit-distance'],
    ])
      expect(CODING_CATALOG.findIndex((problem) => problem.id === second)).toBe(
        CODING_CATALOG.findIndex((problem) => problem.id === first) + 1,
      );
  });

  it.each(Object.entries(WRONG))('%s rejects common wrong approaches before the performance case', (id, solutions) => {
    const problem = getCodingProblem(id)!;
    const hidden = buildSuite(problem, { seed: 1, performance: false }).filter((test) => test.kind !== 'example');
    for (const { name, solve } of solutions) {
      const mismatch = hidden.find(
        (test) => !outputsMatch(test.expected, solve(...entryArgs(paramTypes(problem), test.args)), problem.compare),
      );
      expect(mismatch, `${id}: ${name}; ${preview(hidden.map((test) => test.args))}`).toBeDefined();
    }
  });
});
