import { describe, expect, it } from 'vitest';
import { rangeOf } from '../algorithms/input.js';
import { PATTERN_CATALOG } from '../curriculum/catalog.js';
import { CODING_CATALOG } from './catalog.js';
import { ladderLengths } from './problems/batch-h.js';
import { kruskal } from './problems/spanning-trees.js';
import { getCodingProblem } from './problems/index.js';
import { buildSuite, entryArgs, outputsMatch, paramTypes, preview } from './suite.js';
import { ListNode, listValues } from './list.js';
import type { TreeNode } from './tree.js';

type WrongSolution = { name: string; solve: (...args: any[]) => unknown };

const manhattan = ([x, y]: number[], [u, v]: number[]) => Math.abs(x - u) + Math.abs(y - v);
const cheapestFirst = (edges: number[][]) => [...edges].sort((a, b) => a[2] - b[2]);

/** The indices of the edges Kruskal takes, cheapest first, over nodes 0 to n - 1. */
function mstIndices(n: number, edges: number[][]): number[] {
  const parent = rangeOf(0, n - 1);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  return rangeOf(0, edges.length - 1)
    .sort((i, j) => edges[i][2] - edges[j][2])
    .filter((i) => {
      const [a, b] = [find(edges[i][0]), find(edges[i][1])];
      if (a === b) return false;
      parent[a] = b;
      return true;
    });
}

/** Critical and pseudo-critical edges, where an edge counts as critical only when leaving it out raises the weight of what Kruskal builds. */
function weightOnlyCritical(n: number, edges: number[][]): number[][] {
  const indexed = cheapestFirst(edges.map(([a, b, w], i) => [a, b, w, i]));
  const best = kruskal(n, indexed).weight;
  const critical: number[] = [];
  const pseudo: number[] = [];
  for (const edge of indexed) {
    const rest = indexed.filter((other) => other !== edge);
    if (kruskal(n, rest).weight > best) critical.push(edge[3]);
    else if (kruskal(n, [edge, ...rest]).weight === best) pseudo.push(edge[3]);
  }
  return [critical.sort((a, b) => a - b), pseudo.sort((a, b) => a - b)];
}

/** The fewest edges from start to every node, by BFS. */
function hopsFrom(graph: number[][], start: number): number[] {
  const dist = graph.map((): number => Infinity);
  dist[start] = 0;
  const queue = [start];
  for (const node of queue)
    for (const next of graph[node])
      if (dist[next] === Infinity) {
        dist[next] = dist[node] + 1;
        queue.push(next);
      }
  return dist;
}

/** BFS over (node, visited mask) from the given starts: the steps until some state has every node visited. */
function visitAllFrom(graph: number[][], starts: number[]): number {
  const n = graph.length;
  const full = (1 << n) - 1;
  const seen = new Set(starts.map((i) => `${i}:${1 << i}`));
  let frontier = starts.map((i) => [i, 1 << i]);
  for (let steps = 0; ; steps++) {
    if (frontier.some(([, mask]) => mask === full)) return steps;
    frontier = frontier.flatMap(([node, mask]) =>
      graph[node].flatMap((next) => {
        const key = `${next}:${mask | (1 << next)}`;
        if (seen.has(key)) return [];
        seen.add(key);
        return [[next, mask | (1 << next)]];
      }),
    );
  }
}

/** The most students in each row alone, with no two side by side: rows never see each other. */
const rowByRowMax = (seats: string[][]) =>
  seats.reduce((total, row) => {
    let best = 0;
    for (let mask = 0; mask < 1 << row.length; mask++)
      if (!(mask & (mask >> 1)) && row.every((seat, c) => seat === '.' || !(mask & (1 << c))))
        best = Math.max(best, mask.toString(2).split('1').length - 1);
    return total + best;
  }, 0);

/** Reverses up to count nodes from head onto prev, and returns the new first node and the node after them. */
function flip(head: ListNode | null, count: number, prev: ListNode | null = null): [ListNode | null, ListNode | null] {
  let curr = head;
  for (let i = 0; i < count && curr; i++) [curr.next, prev, curr] = [prev, curr, curr.next];
  return [prev, curr];
}

/** A returned list as its values, or a note that it loops, which no expected list matches. */
function returned(head: ListNode | null): unknown {
  try {
    return listValues(head);
  } catch {
    return 'a list that loops';
  }
}

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

function wellPerformingLength(hours: number[], restLimit: number, keepFirst: boolean): number {
  const at = new Map<number, number>();
  let score = 0;
  let best = 0;
  hours.forEach((h, i) => {
    score += h > restLimit ? 1 : -1;
    if (score > 0) best = i + 1;
    else if (at.has(score - 1)) best = Math.max(best, i - at.get(score - 1)!);
    if (!keepFirst || !at.has(score)) at.set(score, i);
  });
  return best;
}

function nextGreater(nums: number[], passes: number, pops: (top: number, x: number) => boolean): number[] {
  const n = nums.length;
  const out = Array<number>(n).fill(-1);
  const stack: number[] = [];
  for (let i = 0; i < passes * n; i++) {
    while (stack.length && pops(nums[stack[stack.length - 1]], nums[i % n])) out[stack.pop()!] = nums[i % n];
    if (i < n) stack.push(i);
  }
  return out;
}

function intersections(
  a: number[][],
  b: number[][],
  keeps: (start: number, end: number) => boolean,
  firstGoes: (x: number[], y: number[]) => boolean,
): number[][] {
  const out: number[][] = [];
  for (let i = 0, j = 0; i < a.length && j < b.length;) {
    const start = Math.max(a[i][0], b[j][0]);
    const end = Math.min(a[i][1], b[j][1]);
    if (keeps(start, end)) out.push([start, end]);
    if (firstGoes(a[i], b[j])) i++;
    else j++;
  }
  return out;
}

function uncoveredCount(intervals: number[][], shorterFirst: boolean, keeps: (end: number, reach: number) => boolean): number {
  const sorted = [...intervals].sort((x, y) => x[0] - y[0] || (shorterFirst ? x[1] - y[1] : y[1] - x[1]));
  let reach = -1;
  let kept = 0;
  for (const [, end] of sorted) {
    if (keeps(end, reach)) kept++;
    reach = Math.max(reach, end);
  }
  return kept;
}

function busiestCar(trips: number[][], dropFirst: boolean): number {
  const events = trips.flatMap(([passengers, from, to]) => [
    [from, passengers],
    [to, -passengers],
  ]);
  events.sort((x, y) => x[0] - y[0] || (dropFirst ? x[1] - y[1] : y[1] - x[1]));
  let load = 0;
  return Math.max(...events.map(([, change]) => (load += change)));
}

function pivotWhere(nums: number[], candidates: number[], leftHolds: boolean): number {
  const total = nums.reduce((sum, x) => sum + x, 0);
  let left = 0;
  const prefix = nums.map((x) => (left += x));
  return candidates.find((i) => (leftHolds ? prefix[i] : prefix[i] - nums[i]) === total - prefix[i]) ?? -1;
}

function longestSumK(nums: number[], k: number, { keepFirst = true, emptyPrefix = true }): number {
  const at = new Map<number, number>(emptyPrefix ? [[0, -1]] : []);
  let sum = 0;
  let best = 0;
  nums.forEach((x, i) => {
    sum += x;
    if (at.has(sum - k)) best = Math.max(best, i - at.get(sum - k)!);
    if (!keepFirst || !at.has(sum)) at.set(sum, i);
  });
  return best;
}

function xorWithin(nums: number[], queries: number[][], allowed: (value: number, m: number) => boolean, none: number): number[] {
  return queries.map(([x, m]) => {
    const values = nums.filter((v) => allowed(v, m));
    return values.length ? Math.max(...values.map((v) => x ^ v)) : none;
  });
}

function flipsBelow(a: number, b: number, c: number, bits: number): number {
  let flips = 0;
  for (let bit = 0; bit < bits; bit++) {
    const [x, y, z] = [(a >> bit) & 1, (b >> bit) & 1, (c >> bit) & 1];
    flips += z ? 1 - (x | y) : x + y;
  }
  return flips;
}

const KEYPAD = ['abc', 'def', 'ghi', 'jkl', 'mno', 'pqrs', 'tuv', 'wxyz'];

const adjacentPairs = (sequences: number[][]) => new Set(sequences.flatMap((list) => list.slice(1).map((v, i) => `${list[i]},${v}`)));

const KNIGHT_STEPS = [1, 2, -1, -2].flatMap((da) => [1, 2, -1, -2].filter((db) => Math.abs(da) !== Math.abs(db)).map((db) => [da, db]));

function lockSearch(deadends: string[], target: string, wrap: boolean): number {
  const dead = new Set(deadends);
  if (dead.has('0000')) return -1;
  const turns = new Map([['0000', 0]]);
  for (const [code, count] of turns) {
    if (code === target) return count;
    for (let i = 0; i < 4; i++)
      for (const step of [1, -1]) {
        const digit = Number(code[i]) + step;
        if (!wrap && (digit < 0 || digit > 9)) continue;
        const next = code.slice(0, i) + ((digit + 10) % 10) + code.slice(i + 1);
        if (!dead.has(next) && !turns.has(next)) turns.set(next, count + 1);
      }
  }
  return -1;
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

/** Whether no filled cell repeats a digit in its row, its column or its `box(r, c)`; with `dots`, '.' counts as a digit. */
function sudokuHolds(board: string[][], box: (r: number, c: number) => number, dots = false): boolean {
  const seen = new Set<string>();
  for (let r = 0; r < 9; r++)
    for (let c = 0; c < 9; c++) {
      const digit = board[r][c];
      if (digit === '.' && !dots) continue;
      const keys = [`${digit} row ${r}`, `${digit} col ${c}`, `${digit} box ${box(r, c)}`];
      if (keys.some((key) => seen.has(key))) return false;
      for (const key of keys) seen.add(key);
    }
  return true;
}

/** The longest window of `nums` holding at most `flips` zeros. */
function onesWindow(nums: number[], flips: number): number {
  let best = 0;
  for (let lo = 0, hi = 0, zeros = 0; hi < nums.length; hi++) {
    if (nums[hi] === 0) zeros++;
    while (zeros > flips && lo <= hi) if (nums[lo++] === 0) zeros--;
    best = Math.max(best, hi - lo + 1);
  }
  return best;
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

/** Removals found by a plain BFS that keeps the cost of each cell's first visit, which takes the fewest moves, not removals. */
function firstVisitRemovals(grid: number[][]): number {
  const cols = grid[0].length;
  const cost = new Map([[0, 0]]);
  const queue = [0];
  while (queue.length) {
    const cell = queue.shift()!;
    const [r, c] = [Math.floor(cell / cols), cell % cols];
    for (const [y, x] of [
      [r - 1, c],
      [r + 1, c],
      [r, c - 1],
      [r, c + 1],
    ]) {
      const next = y * cols + x;
      if (grid[y]?.[x] === undefined || cost.has(next)) continue;
      cost.set(next, cost.get(cell)! + grid[y][x]);
      queue.push(next);
    }
  }
  return cost.get(grid.length * cols - 1)!;
}

function prefixPathCount(root: TreeNode | null, targetSum: number, { undo = true, emptyPrefix = true }): number {
  const prefixes = new Map<number, number>(emptyPrefix ? [[0, 1]] : []);
  const count = (node: TreeNode | null, above: number): number => {
    if (!node) return 0;
    const sum = above + node.val;
    let paths = prefixes.get(sum - targetSum) ?? 0;
    prefixes.set(sum, (prefixes.get(sum) ?? 0) + 1);
    paths += count(node.left, sum) + count(node.right, sum);
    if (undo) prefixes.set(sum, prefixes.get(sum)! - 1);
    return paths;
  };
  return count(root, 0);
}

function goodCount(root: TreeNode, { start = -Infinity, ties = true, parentOnly = false }): number {
  const count = (node: TreeNode | null, highest: number): number => {
    if (!node) return 0;
    const good = ties ? node.val >= highest : node.val > highest;
    const passed = parentOnly ? node.val : Math.max(highest, node.val);
    return (good ? 1 : 0) + count(node.left, passed) + count(node.right, passed);
  };
  return count(root, start);
}

const inorderValues = (node: TreeNode | null): number[] =>
  node ? [...inorderValues(node.left), node.val, ...inorderValues(node.right)] : [];

function anagramGroups(strs: string[], key: (word: string) => string): string[] {
  const groups = new Map<string, string[]>();
  for (const word of strs) groups.set(key(word), [...(groups.get(key(word)) ?? []), word]);
  return [...groups.values()].map((group) => group.sort().join(' '));
}

const sortedLetters = (word: string) => [...word].sort().join('');

function chainLength(words: string[], precedes: (a: string, b: string) => boolean): number {
  const best = words.map(() => 1);
  words.forEach((word, i) =>
    words.slice(0, i).forEach((previous, j) => {
      if (precedes(previous, word)) best[i] = Math.max(best[i], best[j] + 1);
    }),
  );
  return Math.max(...best);
}

const byLength = (words: string[]) => [...words].sort((a, b) => a.length - b.length);

const isSubsequence = (a: string, b: string) => {
  let at = 0;
  for (const letter of b) if (letter === a[at]) at++;
  return at === a.length;
};

function bestChance(n: number, arcs: number[][], start: number, combine: (chance: number, p: number) => number): number[] {
  const best = Array<number>(n).fill(0);
  best[start] = 1;
  for (let round = 0; round < n; round++)
    for (const [a, b, percent] of arcs) if (best[a]) best[b] = Math.max(best[b], combine(best[a], percent / 100));
  return best;
}

const bothWays = (edges: number[][]) =>
  edges.flatMap(([a, b, p]) => [
    [a, b, p],
    [b, a, p],
  ]);

function fastestRouteCount(n: number, roads: number[][], { reset, mod }: { reset: boolean; mod: boolean }): number {
  const time = Array<number>(n).fill(Infinity);
  const ways = Array<number>(n).fill(0);
  const settled = new Set<number>();
  time[0] = 0;
  ways[0] = 1;
  while (settled.size < n) {
    const u = rangeOf(0, n - 1).reduce((best, v) => (!settled.has(v) && (best < 0 || time[v] < time[best]) ? v : best), -1);
    if (time[u] === Infinity) break;
    settled.add(u);
    for (const [a, b, t] of roads) {
      const v = a === u ? b : b === u ? a : -1;
      if (v < 0 || settled.has(v) || time[u] + t > time[v]) continue;
      if (time[u] + t < time[v] && reset) ways[v] = 0;
      time[v] = time[u] + t;
      ways[v] = mod ? (ways[v] + ways[u]) % 1_000_000_007 : ways[v] + ways[u];
    }
  }
  return ways[n - 1];
}

function cableGroups(n: number, connections: number[][]): number {
  const parent = rangeOf(0, n - 1);
  const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
  for (const [a, b] of connections) parent[find(a)] = find(b);
  return rangeOf(0, n - 1).filter((x) => find(x) === x).length;
}

function farthestWater(grid: number[][], { diagonal = false, none = -1, first = 0 }): number {
  const cells = grid.flatMap((row, r) => row.map((value, c) => ({ r, c, value })));
  const land = cells.filter((cell) => cell.value === 1);
  const water = cells.filter((cell) => cell.value === 0);
  if (!land.length || !water.length) return none;
  const distance = (a: { r: number; c: number }, b: { r: number; c: number }) =>
    diagonal ? Math.max(Math.abs(a.r - b.r), Math.abs(a.c - b.c)) : Math.abs(a.r - b.r) + Math.abs(a.c - b.c);
  return first + Math.max(...water.map((w) => Math.min(...land.map((l) => distance(w, l)))));
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
  'valid-sudoku': [
    { name: 'check rows and columns but not boxes', solve: (board: string[][]) => sudokuHolds(board, () => 0) },
    {
      name: 'number the boxes r / 3 + c / 3',
      solve: (board: string[][]) => sudokuHolds(board, (r, c) => Math.floor(r / 3) + Math.floor(c / 3)),
    },
    {
      name: "count '.' as a digit",
      solve: (board: string[][]) => sudokuHolds(board, (r, c) => 3 * Math.floor(r / 3) + Math.floor(c / 3), true),
    },
  ],
  'group-anagrams': [
    {
      name: 'group words by the set of letters they use',
      solve: (strs: string[]) => anagramGroups(strs, (word) => [...new Set(word)].sort().join('')),
    },
    {
      name: 'group words by the sum of their letter codes',
      solve: (strs: string[]) => anagramGroups(strs, (word) => String([...word].reduce((sum, letter) => sum + letter.charCodeAt(0), 0))),
    },
    { name: 'drop repeated words', solve: (strs: string[]) => anagramGroups([...new Set(strs)], sortedLetters) },
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
  'boats-to-save-people': [
    {
      name: 'pair neighbors after sorting',
      solve: (people: number[], limit: number) => {
        const sorted = [...people].sort((a, b) => a - b);
        let boats = 0;
        for (let i = 0; i < sorted.length; boats++) i += i + 1 < sorted.length && sorted[i] + sorted[i + 1] <= limit ? 2 : 1;
        return boats;
      },
    },
    {
      name: 'send the lightest alone when it cannot join the heaviest',
      solve: (people: number[], limit: number) => {
        const sorted = [...people].sort((a, b) => a - b);
        let boats = 0;
        for (let lo = 0, hi = sorted.length - 1; lo <= hi; boats++)
          if (lo < hi && sorted[lo] + sorted[hi] <= limit) {
            lo++;
            hi--;
          } else lo++;
        return boats;
      },
    },
    {
      name: 'pair only when the total stays under the limit',
      solve: (people: number[], limit: number) => {
        const sorted = [...people].sort((a, b) => a - b);
        let boats = 0;
        for (let lo = 0, hi = sorted.length - 1; lo <= hi; hi--, boats++) if (sorted[lo] + sorted[hi] < limit) lo++;
        return boats;
      },
    },
  ],
  'sort-colors': [
    {
      name: 'step past the value swapped in from the end',
      solve: (nums: number[]) => {
        const swap = (i: number, j: number) => ([nums[i], nums[j]] = [nums[j], nums[i]]);
        for (let lo = 0, mid = 0, hi = nums.length - 1; mid <= hi; mid++)
          if (nums[mid] === 0) swap(lo++, mid);
          else if (nums[mid] === 2) swap(mid, hi--);
        return nums;
      },
    },
    {
      name: 'only swap the 0s to the front',
      solve: (nums: number[]) => {
        const swap = (i: number, j: number) => ([nums[i], nums[j]] = [nums[j], nums[i]]);
        for (let lo = 0, i = 0; i < nums.length; i++) if (nums[i] === 0) swap(lo++, i);
        return nums;
      },
    },
    {
      name: 'stop before the middle pointer reaches the end pointer',
      solve: (nums: number[]) => {
        const swap = (i: number, j: number) => ([nums[i], nums[j]] = [nums[j], nums[i]]);
        for (let lo = 0, mid = 0, hi = nums.length - 1; mid < hi;)
          if (nums[mid] === 0) swap(lo++, mid++);
          else if (nums[mid] === 2) swap(mid, hi--);
          else mid++;
        return nums;
      },
    },
  ],
  'squares-of-sorted-array': [
    {
      name: 'sort the squares with the default sort',
      solve: (nums: number[]) => nums.map((x) => x * x).sort(),
    },
    {
      name: 'fill from the front with the smaller end square',
      solve: (nums: number[]) => {
        const out: number[] = [];
        for (let lo = 0, hi = nums.length - 1; lo <= hi;)
          out.push(Math.abs(nums[lo]) < Math.abs(nums[hi]) ? nums[lo++] ** 2 : nums[hi--] ** 2);
        return out;
      },
    },
    {
      name: 'merge outward from zero but drop what is left of one side',
      solve: (nums: number[]) => {
        const out: number[] = [];
        let right = nums.findIndex((x) => x >= 0);
        if (right < 0) right = nums.length;
        for (let left = right - 1; left >= 0 && right < nums.length;)
          out.push(-nums[left] < nums[right] ? nums[left--] ** 2 : nums[right++] ** 2);
        return out;
      },
    },
  ],
  'valid-palindrome-ii': [
    {
      name: 'always delete the left letter at the first mismatch',
      solve: (s: string) => {
        for (let lo = 0, hi = s.length - 1; lo < hi; lo++, hi--)
          if (s[lo] !== s[hi]) {
            const rest = s.slice(lo + 1, hi + 1);
            return rest === [...rest].reverse().join('');
          }
        return true;
      },
    },
    {
      name: 'delete whichever letter lets the next pair match',
      solve: (s: string) => {
        let deleted = false;
        for (let lo = 0, hi = s.length - 1; lo < hi;)
          if (s[lo] === s[hi]) {
            lo++;
            hi--;
          } else if (deleted) return false;
          else {
            deleted = true;
            if (s[lo + 1] === s[hi]) lo++;
            else if (s[lo] === s[hi - 1]) hi--;
            else return false;
          }
        return true;
      },
    },
    {
      name: 'look two pairs ahead to choose which letter to delete',
      solve: (s: string) => {
        let deleted = false;
        for (let lo = 0, hi = s.length - 1; lo < hi;)
          if (s[lo] === s[hi]) {
            lo++;
            hi--;
          } else if (deleted) return false;
          else {
            deleted = true;
            if (s[lo + 1] === s[hi] && (lo + 2 > hi - 1 || s[lo + 2] === s[hi - 1])) lo++;
            else if (s[lo] === s[hi - 1] && (lo + 1 > hi - 2 || s[lo + 1] === s[hi - 2])) hi--;
            else return false;
          }
        return true;
      },
    },
    {
      name: 'allow one mismatched pair',
      solve: (s: string) => {
        let mismatches = 0;
        for (let lo = 0, hi = s.length - 1; lo < hi; lo++, hi--) if (s[lo] !== s[hi]) mismatches++;
        return mismatches <= 1;
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
  'max-consecutive-ones-iii': [
    { name: 'allow one flip too many', solve: (nums: number[], k: number) => onesWindow(nums, k + 1) },
    { name: 'allow one flip too few', solve: (nums: number[], k: number) => onesWindow(nums, k - 1) },
    {
      name: 'add k to the longest run of 1s',
      solve: (nums: number[], k: number) =>
        Math.min(
          nums.length,
          k +
            Math.max(
              ...nums
                .join('')
                .split('0')
                .map((run) => run.length),
            ),
        ),
    },
  ],
  'fruit-into-baskets': [
    {
      name: 'restart just before the third type',
      solve: (fruits: number[]) => {
        let best = 0;
        for (let lo = 0, hi = 0; hi < fruits.length; hi++) {
          if (new Set(fruits.slice(lo, hi + 1)).size > 2) lo = hi - 1;
          best = Math.max(best, hi - lo + 1);
        }
        return best;
      },
    },
    {
      name: 'add up the two most common types',
      solve: (fruits: number[]) => {
        const count = new Map<number, number>();
        for (const fruit of fruits) count.set(fruit, (count.get(fruit) ?? 0) + 1);
        const [first = 0, second = 0] = [...count.values()].sort((a, b) => b - a);
        return first + second;
      },
    },
  ],
  'min-operations-reduce-x': [
    {
      name: 'take the larger end first',
      solve: (nums: number[], x: number) => {
        let operations = 0;
        for (let lo = 0, hi = nums.length - 1; x > 0 && lo <= hi; operations++) x -= nums[lo] >= nums[hi] ? nums[lo++] : nums[hi--];
        return x === 0 ? operations : -1;
      },
    },
    {
      name: 'never remove every value',
      solve: (nums: number[], x: number) => {
        const keep = nums.reduce((sum, v) => sum + v, 0) - x;
        let longest = -1;
        let sum = 0;
        for (let lo = 0, hi = 0; hi < nums.length; hi++) {
          sum += nums[hi];
          while (sum > keep && lo <= hi) sum -= nums[lo++];
          if (sum === keep && hi >= lo) longest = Math.max(longest, hi - lo + 1);
        }
        return longest < 0 ? -1 : nums.length - longest;
      },
    },
    {
      name: 'take from one end only',
      solve: (nums: number[], x: number) => {
        const reach = (values: number[]) => {
          let sum = 0;
          const i = values.findIndex((v) => (sum += v) >= x);
          return i >= 0 && sum === x ? i + 1 : Infinity;
        };
        const fewest = Math.min(reach(nums), reach([...nums].reverse()));
        return fewest === Infinity ? -1 : fewest;
      },
    },
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
  'ship-within-days': [
    {
      name: 'search from 1 instead of from the heaviest package',
      solve: (weights: number[], days: number) => splitSearch(weights, days, 1, (sum, x, limit) => sum + x > limit),
    },
    {
      name: 'start a new day once the load reaches the capacity',
      solve: (weights: number[], days: number) => splitSearch(weights, days, Math.max(...weights), (sum, x, limit) => sum + x >= limit),
    },
    {
      name: 'return the larger of the heaviest package and the average day',
      solve: (weights: number[], days: number) => Math.max(Math.max(...weights), Math.ceil(weights.reduce((s, x) => s + x, 0) / days)),
    },
  ],
  'search-2d-matrix': [
    {
      name: 'find the row by dividing by the number of rows',
      solve: (matrix: number[][], target: number) => {
        const rows = matrix.length;
        let lo = 0;
        let hi = rows * matrix[0].length - 1;
        while (lo <= hi) {
          const mid = (lo + hi) >> 1;
          const value = matrix[Math.floor(mid / rows)]?.[mid % rows];
          if (value === target) return true;
          if (value !== undefined && value < target) lo = mid + 1;
          else hi = mid - 1;
        }
        return false;
      },
    },
    {
      name: 'search the first row whose first value is at least the target',
      solve: (matrix: number[][], target: number) => matrix.find((row) => row[0] >= target)?.includes(target) ?? false,
    },
    {
      name: 'stop at a one-value range without checking it',
      solve: (matrix: number[][], target: number) => {
        const flat = matrix.flat();
        let lo = 0;
        let hi = flat.length - 1;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (flat[mid] === target) return true;
          if (flat[mid] < target) lo = mid + 1;
          else hi = mid;
        }
        return false;
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
  'count-nice-subarrays': [
    {
      name: 'forget the empty prefix',
      solve: (nums: number[], k: number) => {
        const seen = Array<number>(nums.length + 1).fill(0);
        let odd = 0;
        let count = 0;
        for (const x of nums) {
          odd += x % 2;
          if (odd >= k) count += seen[odd - k];
          seen[odd]++;
        }
        return count;
      },
    },
    {
      name: 'count subarrays with at most k odd numbers',
      solve: (nums: number[], k: number) => {
        let count = 0;
        for (let left = 0, right = 0, odd = 0; right < nums.length; right++) {
          odd += nums[right] % 2;
          while (odd > k) odd -= nums[left++] % 2;
          count += right - left + 1;
        }
        return count;
      },
    },
    {
      name: 'let only the even values before each window vary its start',
      solve: (nums: number[], k: number) => {
        const odd = nums.flatMap((x, i) => (x % 2 ? [i] : []));
        let count = 0;
        for (let i = 0; i + k <= odd.length; i++) count += odd[i] - (i ? odd[i - 1] : -1);
        return count;
      },
    },
  ],
  'longest-well-performing-interval': [
    {
      name: 'count a day of exactly 8 hours as tiring',
      solve: (hours: number[]) => wellPerformingLength(hours, 7, true),
    },
    {
      name: 'measure only from the first day',
      solve: (hours: number[]) => {
        let score = 0;
        let best = 0;
        hours.forEach((h, i) => {
          score += h > 8 ? 1 : -1;
          if (score > 0) best = i + 1;
        });
        return best;
      },
    },
    {
      name: 'keep the latest index for each score',
      solve: (hours: number[]) => wellPerformingLength(hours, 8, false),
    },
  ],
  'find-pivot-index': [
    { name: 'count the pivot in the left side', solve: (nums: number[]) => pivotWhere(nums, rangeOf(0, nums.length - 1), true) },
    {
      name: 'return the rightmost pivot',
      solve: (nums: number[]) => pivotWhere(nums, rangeOf(0, nums.length - 1).reverse(), false),
    },
    { name: 'skip the two ends', solve: (nums: number[]) => pivotWhere(nums, rangeOf(1, nums.length - 2), false) },
  ],
  'max-size-subarray-sum-k': [
    {
      name: 'keep the latest index for each running sum',
      solve: (nums: number[], k: number) => longestSumK(nums, k, { keepFirst: false }),
    },
    { name: 'forget the empty prefix', solve: (nums: number[], k: number) => longestSumK(nums, k, { emptyPrefix: false }) },
    {
      name: 'slide a window as if every value were positive',
      solve: (nums: number[], k: number) => {
        let best = 0;
        let sum = 0;
        for (let lo = 0, hi = 0; hi < nums.length; hi++) {
          sum += nums[hi];
          while (sum > k && lo <= hi) sum -= nums[lo++];
          if (sum === k && hi >= lo) best = Math.max(best, hi - lo + 1);
        }
        return best;
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
  'remove-k-digits': [
    {
      name: 'keep the leading zeros',
      solve: (num: string, k: number) => {
        const kept: string[] = [];
        for (const digit of num) {
          while (k > 0 && kept.length && kept[kept.length - 1] > digit) {
            kept.pop();
            k--;
          }
          kept.push(digit);
        }
        kept.length -= k;
        return kept.join('') || '0';
      },
    },
    {
      name: 'leave removals undone once the digits stop falling',
      solve: (num: string, k: number) => {
        const kept: string[] = [];
        for (const digit of num) {
          while (k > 0 && kept.length && kept[kept.length - 1] > digit) {
            kept.pop();
            k--;
          }
          kept.push(digit);
        }
        return kept.join('').replace(/^0+/, '') || '0';
      },
    },
    {
      name: 'remove the k largest digits',
      solve: (num: string, k: number) => {
        const largest = new Set(
          [...num]
            .map((digit, i) => [digit, i] as const)
            .sort((a, b) => (a[0] < b[0] ? 1 : a[0] > b[0] ? -1 : a[1] - b[1]))
            .slice(0, k)
            .map(([, i]) => i),
        );
        return (
          [...num]
            .filter((_, i) => !largest.has(i))
            .join('')
            .replace(/^0+/, '') || '0'
        );
      },
    },
  ],
  'next-greater-element-ii': [
    { name: 'stop at the end without wrapping around', solve: (nums: number[]) => nextGreater(nums, 1, (top, x) => top < x) },
    { name: 'count an equal value as greater', solve: (nums: number[]) => nextGreater(nums, 2, (top, x) => top <= x) },
    {
      name: 'wrap around to the first value only',
      solve: (nums: number[]) => nextGreater(nums, 1, (top, x) => top < x).map((y, i) => (y === -1 && nums[0] > nums[i] ? nums[0] : y)),
    },
  ],
  '132-pattern': [
    {
      name: 'check adjacent triples only',
      solve: (nums: number[]) => nums.some((x, i) => i + 2 < nums.length && x < nums[i + 2] && nums[i + 2] < nums[i + 1]),
    },
    {
      name: 'let the first value equal the third',
      solve: (nums: number[]) => {
        const stack: number[] = [];
        let third = -Infinity;
        for (let i = nums.length - 1; i >= 0; i--) {
          if (nums[i] <= third) return true;
          while (stack.length && stack[stack.length - 1] < nums[i]) third = stack.pop()!;
          stack.push(nums[i]);
        }
        return false;
      },
    },
    {
      name: 'pair the smallest value with the largest after it',
      solve: (nums: number[]) => {
        const low = nums.indexOf(Math.min(...nums));
        const rest = nums.slice(low + 1);
        if (!rest.length) return false;
        const high = low + 1 + rest.indexOf(Math.max(...rest));
        return nums.slice(high + 1).some((x) => nums[low] < x && x < nums[high]);
      },
    },
  ],
  'maximal-rectangle': [
    {
      name: 'look for squares only',
      solve: (matrix: string[][]) => {
        const side = matrix.map((row) => row.map(() => 0));
        let best = 0;
        matrix.forEach((row, r) =>
          row.forEach((cell, c) => {
            if (cell !== '1') return;
            side[r][c] = r && c ? 1 + Math.min(side[r - 1][c], side[r][c - 1], side[r - 1][c - 1]) : 1;
            best = Math.max(best, side[r][c] ** 2);
          }),
        );
        return best;
      },
    },
    {
      name: "use only the last row's histogram",
      solve: (matrix: string[][]) => {
        const heights = matrix[0].map((_, c) => {
          let h = 0;
          for (let r = matrix.length - 1; r >= 0 && matrix[r][c] === '1'; r--) h++;
          return h;
        });
        let best = 0;
        heights.forEach((h, i) => {
          let left = i;
          let right = i;
          while (left > 0 && heights[left - 1] >= h) left--;
          while (right < heights.length - 1 && heights[right + 1] >= h) right++;
          best = Math.max(best, h * (right - left + 1));
        });
        return best;
      },
    },
    {
      name: 'forget bars left on the stack at the end of a row',
      solve: (matrix: string[][]) => {
        const heights = matrix[0].map(() => 0);
        let best = 0;
        for (const row of matrix) {
          row.forEach((cell, c) => (heights[c] = cell === '1' ? heights[c] + 1 : 0));
          const stack: number[] = [];
          heights.forEach((h, c) => {
            while (stack.length && heights[stack[stack.length - 1]] > h) {
              const height = heights[stack.pop()!];
              best = Math.max(best, height * (c - (stack.length ? stack[stack.length - 1] : -1) - 1));
            }
            stack.push(c);
          });
        }
        return best;
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
  'interval-list-intersections': [
    {
      name: 'leave out intersections of a single point',
      solve: (a: number[][], b: number[][]) =>
        intersections(
          a,
          b,
          (start, end) => start < end,
          (x, y) => x[1] < y[1],
        ),
    },
    {
      name: 'advance the interval that starts first',
      solve: (a: number[][], b: number[][]) =>
        intersections(
          a,
          b,
          (start, end) => start <= end,
          (x, y) => x[0] < y[0],
        ),
    },
    {
      name: 'advance both after they overlap',
      solve: (a: number[][], b: number[][]) => {
        const out: number[][] = [];
        for (let i = 0, j = 0; i < a.length && j < b.length;) {
          const start = Math.max(a[i][0], b[j][0]);
          const end = Math.min(a[i][1], b[j][1]);
          if (start <= end) {
            out.push([start, end]);
            i++;
            j++;
          } else if (a[i][1] < b[j][1]) i++;
          else j++;
        }
        return out;
      },
    },
  ],
  'remove-covered-intervals': [
    {
      name: 'sort equal starts with the shorter interval first',
      solve: (intervals: number[][]) => uncoveredCount(intervals, true, (end, reach) => end > reach),
    },
    {
      name: 'keep an interval that ends where the reach does',
      solve: (intervals: number[][]) => uncoveredCount(intervals, false, (end, reach) => end >= reach),
    },
    {
      name: 'compare only with the interval before it',
      solve: (intervals: number[][]) => {
        const sorted = [...intervals].sort((x, y) => x[0] - y[0] || y[1] - x[1]);
        return sorted.filter(([a, b], i) => i === 0 || !(sorted[i - 1][0] <= a && b <= sorted[i - 1][1])).length;
      },
    },
  ],
  'car-pooling': [
    {
      name: 'let passengers in before others get out',
      solve: (trips: number[][], capacity: number) => busiestCar(trips, false) <= capacity,
    },
    { name: 'keep a seat to spare', solve: (trips: number[][], capacity: number) => busiestCar(trips, true) < capacity },
    {
      name: 'add up every trip',
      solve: (trips: number[][], capacity: number) => trips.reduce((sum, [passengers]) => sum + passengers, 0) <= capacity,
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
  'move-zeroes': [
    {
      name: 'swap each 0 with the last value',
      solve: (nums: number[]) => {
        for (let i = 0, end = nums.length - 1; i < end; i++)
          while (nums[i] === 0 && i < end) {
            [nums[i], nums[end]] = [nums[end], nums[i]];
            end--;
          }
        return nums;
      },
    },
    {
      name: 'splice out a 0 and move on to the next index',
      solve: (nums: number[]) => {
        for (let i = 0; i < nums.length; i++) if (nums[i] === 0) nums.push(...nums.splice(i, 1));
        return nums;
      },
    },
    {
      name: 'sort the nonzero values',
      solve: (nums: number[]) => [...nums.filter((x) => x !== 0).sort((a, b) => a - b), ...nums.filter((x) => x === 0)],
    },
  ],
  'remove-duplicates-sorted-ii': [
    {
      name: 'keep one copy of each value',
      solve: (nums: number[]) => nums.filter((x, i) => i === 0 || nums[i - 1] !== x),
    },
    {
      name: 'compare with two back in the array being overwritten',
      solve: (nums: number[]) => {
        let kept = 0;
        for (let i = 0; i < nums.length; i++) if (i < 2 || nums[i] !== nums[i - 2]) nums[kept++] = nums[i];
        return nums.slice(0, kept);
      },
    },
    {
      name: 'drop every copy of a value that appears more than twice',
      solve: (nums: number[]) => nums.filter((x) => nums.filter((y) => y === x).length <= 2),
    },
  ],
  'linked-list-cycle-ii': [
    {
      name: 'return the node where slow and fast meet',
      solve: (next: number[]) => {
        const step = (node: number) => (node === -1 ? -1 : next[node]);
        let slow = 0;
        let fast = 0;
        do {
          slow = step(slow);
          fast = step(step(fast));
        } while (fast !== -1 && slow !== fast);
        return fast;
      },
    },
    {
      name: 'return the last new node before the walk repeats',
      solve: (next: number[]) => {
        const seen = new Set<number>();
        let last = -1;
        let node = 0;
        while (node !== -1 && !seen.has(node)) {
          seen.add(node);
          last = node;
          node = next[node];
        }
        return node === -1 ? -1 : last;
      },
    },
    {
      name: 'return node 0 whenever the walk loops',
      solve: (next: number[]) => {
        const seen = new Set<number>();
        let node = 0;
        while (node !== -1 && !seen.has(node)) {
          seen.add(node);
          node = next[node];
        }
        return node === -1 ? -1 : 0;
      },
    },
  ],
  'reverse-linked-list': [
    {
      name: 'return the old head after the loop',
      solve: (head: ListNode | null) => {
        flip(head, Infinity);
        return returned(head);
      },
    },
    {
      name: 'start with prev on the head, so the old head keeps its link',
      solve: (head: ListNode | null) => {
        if (!head) return [];
        const [prev] = flip(head.next, Infinity, head);
        return returned(prev);
      },
    },
    {
      name: 'stop while curr still has a next node',
      solve: (head: ListNode | null) => {
        let prev: ListNode | null = null;
        let curr = head;
        while (curr?.next) [curr.next, prev, curr] = [prev, curr, curr.next];
        return returned(prev);
      },
    },
  ],
  'reverse-linked-list-ii': [
    {
      name: 'walk before to position left instead of left - 1',
      solve: (head: ListNode, left: number, right: number) => {
        const dummy = new ListNode(0, head);
        let before = dummy;
        for (let i = 0; i < left && before.next; i++) before = before.next;
        const first = before.next;
        if (!first) return returned(dummy.next);
        const [prev, after] = flip(first, right - left + 1);
        first.next = after;
        before.next = prev;
        return returned(dummy.next);
      },
    },
    {
      name: 'never link the old first node to the rest',
      solve: (head: ListNode, left: number, right: number) => {
        const dummy = new ListNode(0, head);
        let before = dummy;
        for (let i = 1; i < left; i++) before = before.next!;
        before.next = flip(before.next, right - left + 1)[0];
        return returned(dummy.next);
      },
    },
    {
      name: 'start before on the head, with no dummy',
      solve: (head: ListNode, left: number, right: number) => {
        let before = head;
        for (let i = 2; i < left; i++) before = before.next!;
        const first = before.next;
        if (!first) return returned(head);
        const [prev, after] = flip(first, right - left + 1);
        first.next = after;
        before.next = prev;
        return returned(head);
      },
    },
  ],
  'swap-nodes-in-pairs': [
    {
      name: 'link each swapped pair to the next pair before it is swapped',
      solve: (head: ListNode | null) => {
        const start = head?.next ?? head;
        for (let first = head; first?.next;) {
          const second: ListNode = first.next;
          const after = second.next;
          second.next = first;
          first.next = after;
          first = after;
        }
        return returned(start);
      },
    },
    {
      name: 'swap only the first pair',
      solve: (head: ListNode | null) => {
        if (!head?.next) return returned(head);
        const second = head.next;
        head.next = second.next;
        second.next = head;
        return returned(second);
      },
    },
    {
      name: 'return the old head',
      solve: (head: ListNode | null) => {
        const dummy = new ListNode(0, head);
        for (let prev = dummy; prev.next?.next;) {
          const [first, second] = [prev.next, prev.next.next];
          [first.next, second.next, prev.next, prev] = [second.next, first, second, first];
        }
        return returned(head);
      },
    },
  ],
  'reverse-nodes-k-group': [
    {
      name: 'reverse the last group even when it is short',
      solve: (head: ListNode, k: number) => {
        const dummy = new ListNode(0, head);
        for (let groupPrev = dummy; groupPrev.next;) {
          const first = groupPrev.next;
          const [prev, after] = flip(first, k);
          first.next = after;
          groupPrev.next = prev;
          groupPrev = first;
        }
        return returned(dummy.next);
      },
    },
    {
      name: 'link only the first group to the node before it',
      solve: (head: ListNode, k: number) => {
        const dummy = new ListNode(0, head);
        for (let groupPrev = dummy; ;) {
          let last: ListNode | null = groupPrev;
          for (let i = 0; i < k && last; i++) last = last.next;
          if (!last) return returned(dummy.next);
          const first = groupPrev.next!;
          const [prev, after] = flip(first, k);
          first.next = after;
          if (groupPrev === dummy) groupPrev.next = prev;
          groupPrev = first;
        }
      },
    },
    {
      name: 'reverse only the first group',
      solve: (head: ListNode, k: number) => {
        const [prev, after] = flip(head, k);
        head.next = after;
        return returned(prev);
      },
    },
  ],
  'palindrome-linked-list': [
    {
      name: 'compare the two halves in the same direction',
      solve: (head: ListNode) => {
        const values = listValues(head);
        const half = Math.floor(values.length / 2);
        return values.slice(0, half).join() === values.slice(values.length - half).join();
      },
    },
    {
      name: 'compare only the first and last values',
      solve: (head: ListNode) => {
        const values = listValues(head);
        return values[0] === values[values.length - 1];
      },
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
  'last-stone-weight': [
    {
      name: 'destroy both stones every turn',
      solve: (stones: number[]) => (stones.length % 2 ? Math.min(...stones) : 0),
    },
    {
      name: 'keep a running difference down the sorted stones',
      solve: (stones: number[]) => [...stones].sort((a, b) => b - a).reduce((left, stone) => Math.abs(left - stone), 0),
    },
    {
      name: 'put the leftover stone back on top without re-sorting',
      solve: (stones: number[]) => {
        const left = [...stones].sort((a, b) => b - a);
        while (left.length > 1) {
          const [y, x] = left.splice(0, 2);
          if (x !== y) left.unshift(y - x);
        }
        return left[0] ?? 0;
      },
    },
  ],
  'merge-k-sorted-arrays': [
    { name: 'drop repeated values', solve: (arrays: number[][]) => [...new Set(arrays.flat())].sort((a, b) => a - b) },
    {
      name: 'order the arrays by their first value and join them',
      solve: (arrays: number[][]) =>
        arrays
          .filter((array) => array.length)
          .sort((a, b) => a[0] - b[0])
          .flat(),
    },
    {
      name: 'stop once any array runs out',
      solve: (arrays: number[][]) => {
        const next = arrays.map(() => 0);
        const out: number[] = [];
        while (arrays.every((array, i) => next[i] < array.length)) {
          let pick = 0;
          arrays.forEach((array, i) => {
            if (array[next[i]] < arrays[pick][next[pick]]) pick = i;
          });
          out.push(arrays[pick][next[pick]++]);
        }
        return out;
      },
    },
  ],
  ipo: [
    {
      name: 'take the largest profits whatever they need',
      solve: (k: number, w: number, profits: number[]) =>
        w +
        [...profits]
          .sort((a, b) => b - a)
          .slice(0, k)
          .reduce((sum, profit) => sum + profit, 0),
    },
    {
      name: 'choose only among the projects open at the start',
      solve: (k: number, w: number, profits: number[], capital: number[]) =>
        w +
        profits
          .filter((_, i) => capital[i] <= w)
          .sort((a, b) => b - a)
          .slice(0, k)
          .reduce((sum, profit) => sum + profit, 0),
    },
    {
      name: 'take the cheapest project each time',
      solve: (k: number, w: number, profits: number[], capital: number[]) => {
        const byCapital = rangeOf(0, profits.length - 1).sort((a, b) => capital[a] - capital[b]);
        for (const i of byCapital.slice(0, k)) {
          if (capital[i] > w) break;
          w += profits[i];
        }
        return w;
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
  'open-the-lock': [
    {
      name: 'start even when 0000 is a deadend',
      solve: (deadends: string[], target: string) =>
        lockSearch(
          deadends.filter((code) => code !== '0000'),
          target,
          true,
        ),
    },
    { name: 'turn the wheels without wrapping', solve: (deadends: string[], target: string) => lockSearch(deadends, target, false) },
    {
      name: 'add up the turns each wheel needs and ignore the deadends',
      solve: (deadends: string[], target: string) =>
        [...target].reduce((turns, digit) => turns + Math.min(Number(digit), 10 - Number(digit)), 0),
    },
  ],
  'minimum-knight-moves': [
    {
      name: 'search only squares with nonnegative coordinates',
      solve: (x: number, y: number) => {
        const [tx, ty] = [Math.abs(x), Math.abs(y)];
        const moves = new Map([['0,0', 0]]);
        for (const [square, count] of moves) {
          const [a, b] = square.split(',').map(Number);
          if (a === tx && b === ty) return count;
          for (const [da, db] of KNIGHT_STEPS)
            if (a + da >= 0 && b + db >= 0 && a + da <= tx + 4 && b + db <= ty + 4 && !moves.has(`${a + da},${b + db}`))
              moves.set(`${a + da},${b + db}`, count + 1);
        }
        return -1;
      },
    },
    {
      name: 'use the closed form without its special cases',
      solve: (x: number, y: number) => {
        const [far, near] = [Math.max(Math.abs(x), Math.abs(y)), Math.min(Math.abs(x), Math.abs(y))];
        const delta = far - near;
        return near > delta ? delta - 2 * Math.floor((delta - near) / 3) : delta - 2 * Math.floor((delta - near) / 4);
      },
    },
    {
      name: 'take the largest of the simple lower bounds',
      solve: (x: number, y: number) =>
        Math.max(Math.ceil(Math.abs(x) / 2), Math.ceil(Math.abs(y) / 2), Math.ceil((Math.abs(x) + Math.abs(y)) / 3)),
    },
  ],
  'far-from-land': [
    { name: 'step diagonally too', solve: (grid: number[][]) => farthestWater(grid, { diagonal: true }) },
    { name: 'return 0 when there is no land or no water', solve: (grid: number[][]) => farthestWater(grid, { none: 0 }) },
    { name: 'count the land cell as the first step', solve: (grid: number[][]) => farthestWater(grid, { first: 1 }) },
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
  'generate-parentheses': [
    {
      name: 'wrap or append a pair around each answer for n - 1',
      solve: (n: number) => {
        let found = new Set(['']);
        for (let k = 0; k < n; k++) found = new Set([...found].flatMap((s) => [`(${s})`, `()${s}`, `${s}()`]));
        return [...found];
      },
    },
    {
      name: 'close whenever fewer than n are closed',
      solve: (n: number) => {
        const out: string[] = [];
        const go = (s: string, open: number, closed: number) => {
          if (closed === n && open === n) out.push(s);
          if (open < n) go(`${s}(`, open + 1, closed);
          if (closed < n) go(`${s})`, open, closed + 1);
        };
        go('', 0, 0);
        return out;
      },
    },
  ],
  'letter-combinations': [
    {
      name: 'start from one empty string',
      solve: (digits: string) =>
        [...digits].reduce<string[]>((found, d) => found.flatMap((s) => [...KEYPAD[Number(d) - 2]].map((letter) => s + letter)), ['']),
    },
    {
      name: 'give every digit three letters in a row',
      solve: (digits: string) =>
        digits
          ? [...digits].reduce<string[]>(
              (found, d) => found.flatMap((s) => [0, 1, 2].map((k) => s + String.fromCharCode(97 + 3 * (Number(d) - 2) + k))),
              [''],
            )
          : [],
    },
    {
      name: 'never reuse a letter',
      solve: (digits: string) => {
        if (!digits) return [];
        const out: string[] = [];
        const go = (s: string) => {
          if (s.length === digits.length) out.push(s);
          else for (const letter of KEYPAD[Number(digits[s.length]) - 2]) if (!s.includes(letter)) go(s + letter);
        };
        go('');
        return out;
      },
    },
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
  'sequence-reconstruction': [
    {
      name: 'compare the topological order with nums without checking one value is ready at a time',
      solve: (nums: number[], sequences: number[][]) => {
        const n = nums.length;
        const following = rangeOf(0, n).map(() => [] as number[]);
        const before = Array<number>(n + 1).fill(0);
        for (const list of sequences)
          for (let i = 1; i < list.length; i++) {
            following[list[i - 1]].push(list[i]);
            before[list[i]]++;
          }
        const order = rangeOf(1, n).filter((v) => before[v] === 0);
        for (let k = 0; k < order.length; k++) for (const next of following[order[k]]) if (--before[next] === 0) order.push(next);
        return order.join() === nums.join();
      },
    },
    {
      name: 'ignore values that appear in no list',
      solve: (nums: number[], sequences: number[][]) => {
        const listed = new Set(sequences.flat());
        const pairs = adjacentPairs(sequences);
        const kept = nums.filter((v) => listed.has(v));
        return kept.slice(1).every((v, i) => pairs.has(`${kept[i]},${v}`));
      },
    },
    {
      name: 'count n - 1 different adjacent pairs',
      solve: (nums: number[], sequences: number[][]) => adjacentPairs(sequences).size === nums.length - 1,
    },
  ],
  'parallel-courses-iii': [
    {
      name: 'add up the longest course of each semester level',
      solve: (n: number, relations: number[][], time: number[]) => {
        const waiting = Array<number>(n + 1).fill(0);
        for (const [, next] of relations) waiting[next]++;
        let level = rangeOf(1, n).filter((course) => !waiting[course]);
        let months = 0;
        while (level.length) {
          months += Math.max(...level.map((course) => time[course - 1]));
          level = level.flatMap((course) =>
            relations.filter(([prev, next]) => prev === course && --waiting[next] === 0).map(([, next]) => next),
          );
        }
        return months;
      },
    },
    {
      name: 'skip courses with no relations',
      solve: (_n: number, relations: number[][], time: number[]) => {
        const finish = (course: number): number =>
          time[course - 1] + Math.max(0, ...relations.filter(([, next]) => next === course).map(([prev]) => finish(prev)));
        return Math.max(0, ...relations.flat().map(finish));
      },
    },
    {
      name: 'total the times along the chain with the most courses',
      solve: (n: number, relations: number[][], time: number[]) => {
        const chain = (course: number): [number, number] =>
          relations
            .filter(([, next]) => next === course)
            .map(([prev]) => chain(prev))
            .reduce(
              ([length, months], [l, m]) => (l + 1 > length ? [l + 1, m + time[course - 1]] : [length, months]),
              [1, time[course - 1]],
            );
        return rangeOf(1, n)
          .map(chain)
          .reduce((best, next) => (next[0] > best[0] ? next : best))[1];
      },
    },
  ],
  'find-all-recipes': [
    {
      name: 'cook in one pass down the list',
      solve: (recipes: string[], ingredients: string[], supplies: string[]) => {
        const have = new Set(supplies);
        return recipes.filter((dish, i) => ingredients[i].split(' ').every((name) => have.has(name)) && have.add(dish));
      },
    },
    {
      name: 'count only supplies as ingredients',
      solve: (recipes: string[], ingredients: string[], supplies: string[]) =>
        recipes.filter((_, i) => ingredients[i].split(' ').every((name) => supplies.includes(name))),
    },
    {
      name: 'treat a recipe still being checked as cooked',
      solve: (recipes: string[], ingredients: string[], supplies: string[]) => {
        const state = new Map<string, boolean>();
        const cookable = (name: string): boolean => {
          if (supplies.includes(name) || state.has(name)) return supplies.includes(name) || state.get(name)!;
          const at = recipes.indexOf(name);
          if (at < 0) return false;
          state.set(name, true);
          const ok = ingredients[at].split(' ').every(cookable);
          state.set(name, ok);
          return ok;
        };
        return recipes.filter(cookable);
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
  'smallest-string-with-swaps': [
    {
      name: 'attach a itself, not its root, to the root of b',
      solve: (s: string, pairs: number[][]) => {
        const parent = rangeOf(0, s.length - 1);
        const find = (x: number): number => (parent[x] === x ? x : find(parent[x]));
        for (const [a, b] of pairs) parent[a] = find(b);
        const groups = new Map<number, number[]>();
        for (let i = 0; i < s.length; i++) groups.set(find(i), [...(groups.get(find(i)) ?? []), i]);
        const out = [...s];
        for (const positions of groups.values()) {
          const letters = positions.map((i) => s[i]).sort();
          positions.forEach((position, k) => (out[position] = letters[k]));
        }
        return out.join('');
      },
    },
    {
      name: 'swap a pair while it puts a smaller letter first, until nothing changes',
      solve: (s: string, pairs: number[][]) => {
        const letters = [...s];
        for (let changed = true; changed;) {
          changed = false;
          for (const [a, b] of pairs) {
            const [lo, hi] = [Math.min(a, b), Math.max(a, b)];
            if (letters[lo] > letters[hi]) {
              [letters[lo], letters[hi]] = [letters[hi], letters[lo]];
              changed = true;
            }
          }
        }
        return letters.join('');
      },
    },
    {
      name: "fill a group's positions in the order a search reaches them",
      solve: (s: string, pairs: number[][]) => {
        const neighbors = [...s].map(() => [] as number[]);
        for (const [a, b] of pairs) {
          neighbors[a].push(b);
          neighbors[b].push(a);
        }
        const out = [...s];
        const seen = new Set<number>();
        for (let start = 0; start < s.length; start++) {
          if (seen.has(start)) continue;
          const reached = [start];
          seen.add(start);
          for (let k = 0; k < reached.length; k++)
            for (const next of neighbors[reached[k]])
              if (!seen.has(next)) {
                seen.add(next);
                reached.push(next);
              }
          const letters = reached.map((i) => s[i]).sort();
          reached.forEach((position, k) => (out[position] = letters[k]));
        }
        return out.join('');
      },
    },
  ],
  'most-stones-removed': [
    { name: 'keep one stone per row', solve: (stones: number[][]) => stones.length - new Set(stones.map(([x]) => x)).size },
    {
      name: 'number rows and columns the same way',
      solve: (stones: number[][]) => {
        const parent = new Map<number, number>();
        const find = (x: number): number => {
          if (!parent.has(x)) parent.set(x, x);
          return parent.get(x) === x ? x : find(parent.get(x)!);
        };
        for (const [x, y] of stones) parent.set(find(x), find(y));
        return stones.length - new Set([...parent.keys()].map(find)).size;
      },
    },
    {
      name: 'remove every stone that shares a line',
      solve: (stones: number[][]) => stones.filter(([x, y], i) => stones.some(([u, v], j) => j !== i && (u === x || v === y))).length,
    },
  ],
  'make-network-connected': [
    { name: 'skip the check for too few cables', solve: (n: number, connections: number[][]) => cableGroups(n, connections) - 1 },
    {
      name: 'count the spare cables',
      solve: (n: number, connections: number[][]) =>
        connections.length < n - 1 ? -1 : connections.length - (n - cableGroups(n, connections)),
    },
    {
      name: 'count groups only among computers with a cable',
      solve: (n: number, connections: number[][]) =>
        connections.length < n - 1 ? -1 : cableGroups(n, connections) - (n - new Set(connections.flat()).size) - 1,
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
  'minimum-obstacle-removal': [
    {
      name: 'move only right and down',
      solve: (grid: number[][]) => {
        const cost = grid.map((row) => row.map(() => Infinity));
        grid.forEach((row, r) =>
          row.forEach((cell, c) => {
            cost[r][c] = r === 0 && c === 0 ? 0 : cell + Math.min(cost[r - 1]?.[c] ?? Infinity, cost[r][c - 1] ?? Infinity);
          }),
        );
        return cost[grid.length - 1][grid[0].length - 1];
      },
    },
    { name: 'keep the cost of the first visit in a plain BFS', solve: firstVisitRemovals },
  ],
  'path-max-probability': [
    {
      name: 'follow each edge only from a to b',
      solve: (n: number, edges: number[][], start: number, end: number) =>
        Math.round(bestChance(n, edges, start, (chance, p) => chance * p)[end] * 1e6),
    },
    {
      name: 'keep the weakest edge instead of multiplying',
      solve: (n: number, edges: number[][], start: number, end: number) =>
        Math.round(bestChance(n, bothWays(edges), start, Math.min)[end] * 1e6),
    },
    {
      name: 'round down instead of to the nearest',
      solve: (n: number, edges: number[][], start: number, end: number) =>
        Math.floor(bestChance(n, bothWays(edges), start, (chance, p) => chance * p)[end] * 1e6),
    },
  ],
  'ways-to-arrive': [
    {
      name: 'count the routes with the fewest roads',
      solve: (n: number, roads: number[][]) =>
        fastestRouteCount(
          n,
          roads.map(([u, v]) => [u, v, 1]),
          { reset: true, mod: true },
        ),
    },
    {
      name: 'keep adding counts when a faster time turns up',
      solve: (n: number, roads: number[][]) => fastestRouteCount(n, roads, { reset: false, mod: true }),
    },
    { name: 'skip the modulo', solve: (n: number, roads: number[][]) => fastestRouteCount(n, roads, { reset: true, mod: false }) },
  ],
  'min-cost-connect-points': [
    {
      name: 'walk from the point added last to its nearest unvisited point',
      solve: (points: number[][]) => {
        const left = new Set(rangeOf(1, points.length - 1));
        let total = 0;
        for (let at = 0; left.size;) {
          const next = [...left].reduce((best, j) => (manhattan(points[at], points[j]) < manhattan(points[at], points[best]) ? j : best));
          total += manhattan(points[at], points[next]);
          left.delete(next);
          at = next;
        }
        return total;
      },
    },
    {
      name: 'measure straight-line distance',
      solve: (points: number[][]) => {
        const pairs = points.flatMap(([x, y], i) => points.slice(0, i).map(([u, v], j) => [i, j, Math.hypot(x - u, y - v)]));
        return kruskal(points.length, cheapestFirst(pairs)).weight;
      },
    },
    {
      name: "add up each point's distance to its nearest other point",
      solve: (points: number[][]) =>
        points.reduce((sum, p, i) => sum + Math.min(...points.filter((_, j) => j !== i).map((q) => manhattan(p, q))), 0),
    },
  ],
  'connecting-cities': [
    {
      name: 'return the cost of the roads taken even when a city is cut off',
      solve: (n: number, connections: number[][]) => kruskal(n + 1, cheapestFirst(connections)).weight,
    },
    {
      name: 'build the n - 1 cheapest roads without checking components',
      solve: (n: number, connections: number[][]) =>
        connections.length < n - 1
          ? -1
          : cheapestFirst(connections)
              .slice(0, n - 1)
              .reduce((sum, [, , cost]) => sum + cost, 0),
    },
    {
      name: 'return -1 only when some city has no road',
      solve: (n: number, connections: number[][]) =>
        new Set(connections.flatMap(([x, y]) => [x, y])).size < n ? -1 : kruskal(n + 1, cheapestFirst(connections)).weight,
    },
  ],
  'critical-mst-edges': [
    {
      name: 'call every edge of one MST critical',
      solve: (n: number, edges: number[][]) => [mstIndices(n, edges).sort((a, b) => a - b), []],
    },
    {
      name: 'compare weights only when an edge is left out, missing that the graph falls apart',
      solve: (n: number, edges: number[][]) => weightOnlyCritical(n, edges),
    },
    {
      name: 'take the pseudo-critical edges from one MST only',
      solve: (n: number, edges: number[][]) => {
        const [critical] = getCodingProblem('critical-mst-edges')!.solve(n, structuredClone(edges)) as number[][];
        const pseudo = mstIndices(n, edges).filter((i) => !critical.includes(i));
        return [critical, pseudo.sort((a, b) => a - b)];
      },
    },
  ],
  'water-distribution': [
    {
      name: 'dig one well in each group of houses the pipes connect, at its cheapest house',
      solve: (n: number, wells: number[], pipes: number[][]) => {
        const parent = rangeOf(0, n);
        const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
        const piped = kruskal(n + 1, cheapestFirst(pipes)).weight;
        for (const [a, b] of pipes) parent[find(a)] = find(b);
        const cheapest = new Map<number, number>();
        wells.forEach((cost, i) => cheapest.set(find(i + 1), Math.min(cost, cheapest.get(find(i + 1)) ?? Infinity)));
        return piped + [...cheapest.values()].reduce((sum, cost) => sum + cost, 0);
      },
    },
    {
      name: 'give each house the cheaper of its well and its cheapest pipe',
      solve: (_n: number, wells: number[], pipes: number[][]) =>
        wells.reduce(
          (sum, well, i) => sum + Math.min(well, ...pipes.filter(([a, b]) => a === i + 1 || b === i + 1).map(([, , cost]) => cost)),
          0,
        ),
    },
    {
      name: 'stop after n - 1 edges, as if the source were not an extra node',
      solve: (n: number, wells: number[], pipes: number[][]) => {
        const edges = cheapestFirst([...wells.map((cost, i) => [0, i + 1, cost]), ...pipes]);
        const parent = rangeOf(0, n);
        const find = (x: number): number => (parent[x] === x ? x : (parent[x] = find(parent[x])));
        let total = 0;
        let used = 0;
        for (const [a, b, cost] of edges) {
          if (used === n - 1) break;
          if (find(a) === find(b)) continue;
          parent[find(a)] = find(b);
          total += cost;
          used++;
        }
        return total;
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
  'search-suggestions-system': [
    {
      name: 'keep the first three matches in input order',
      solve: (products: string[], searchWord: string) =>
        rangeOf(1, searchWord.length).map((length) =>
          rangeOf(0, products.length - 1)
            .filter((i) => products[i].startsWith(searchWord.slice(0, length)))
            .slice(0, 3),
        ),
    },
    {
      name: 'stop at the first prefix with no match',
      solve: (products: string[], searchWord: string) => {
        const order = rangeOf(0, products.length - 1).sort((a, b) => (products[a] < products[b] ? -1 : 1));
        const answer: number[][] = [];
        for (let length = 1; length <= searchWord.length; length++) {
          const matches = order.filter((i) => products[i].startsWith(searchWord.slice(0, length))).slice(0, 3);
          if (!matches.length) break;
          answer.push(matches);
        }
        return answer;
      },
    },
    {
      name: 'put shorter products first',
      solve: (products: string[], searchWord: string) => {
        const order = rangeOf(0, products.length - 1).sort(
          (a, b) => products[a].length - products[b].length || (products[a] < products[b] ? -1 : 1),
        );
        return rangeOf(1, searchWord.length).map((length) =>
          order.filter((i) => products[i].startsWith(searchWord.slice(0, length))).slice(0, 3),
        );
      },
    },
  ],
  'maximum-xor-with-element': [
    { name: 'ignore the limit m', solve: (nums: number[], queries: number[][]) => xorWithin(nums, queries, () => true, -1) },
    {
      name: 'answer 0 when no value is allowed',
      solve: (nums: number[], queries: number[][]) => xorWithin(nums, queries, (v, m) => v <= m, 0),
    },
    { name: 'allow only values below m', solve: (nums: number[], queries: number[][]) => xorWithin(nums, queries, (v, m) => v < m, -1) },
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
  'maximum-product-subarray': [
    {
      name: 'track only the largest product ending here',
      solve: (nums: number[]) => {
        let best = nums[0];
        let high = nums[0];
        for (const x of nums.slice(1)) best = Math.max(best, (high = Math.max(x, high * x)));
        return best;
      },
    },
    {
      name: 'start the best at 0',
      solve: (nums: number[]) => {
        let [best, high, low] = [0, 1, 1];
        for (const x of nums) {
          [high, low] = [Math.max(x, high * x, low * x), Math.min(x, high * x, low * x)];
          best = Math.max(best, high);
        }
        return best;
      },
    },
  ],
  'combination-sum-iv': [
    {
      name: 'count each set of values once, in any order',
      solve: (nums: number[], target: number) => {
        const ways = [1, ...Array<number>(target).fill(0)];
        for (const x of nums) for (let sum = x; sum <= target; sum++) ways[sum] += ways[sum - x];
        return ways[target];
      },
    },
    {
      name: 'use each value at most once',
      solve: (nums: number[], target: number) => {
        const count = (rest: number, used: number[]): number =>
          rest === 0 ? 1 : nums.reduce((sum, x) => (x <= rest && !used.includes(x) ? sum + count(rest - x, [...used, x]) : sum), 0);
        return count(target, []);
      },
    },
  ],
  'longest-string-chain': [
    {
      name: 'count any shorter subsequence as a predecessor',
      solve: (words: string[]) => chainLength(byLength(words), (a, b) => a.length < b.length && isSubsequence(a, b)),
    },
    {
      name: 'add letters only at the end',
      solve: (words: string[]) => chainLength(byLength(words), (a, b) => b.length === a.length + 1 && b.startsWith(a)),
    },
    {
      name: 'take the words in the given order',
      solve: (words: string[]) => chainLength(words, (a, b) => b.length === a.length + 1 && isSubsequence(a, b)),
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
  'unique-paths-ii': [
    {
      name: 'fill the first row and column with 1 past an obstacle',
      solve: (grid: number[][]) => {
        const ways = grid.map((row, r) => row.map((cell, c): number => (cell ? 0 : r === 0 || c === 0 ? 1 : 0)));
        for (let r = 1; r < grid.length; r++)
          for (let c = 1; c < grid[0].length; c++) if (!grid[r][c]) ways[r][c] = (ways[r - 1][c] + ways[r][c - 1]) % 1_000_000_007;
        return ways[grid.length - 1][grid[0].length - 1];
      },
    },
    {
      name: 'skip the modulo',
      solve: (grid: number[][]) => {
        const ways = Array<number>(grid[0].length).fill(0);
        ways[0] = 1;
        for (const row of grid) row.forEach((cell, c) => (ways[c] = cell ? 0 : ways[c] + (c > 0 ? ways[c - 1] : 0)));
        return ways[ways.length - 1];
      },
    },
  ],
  'distinct-subsequences': [
    {
      name: 'check whether t is a subsequence at all',
      solve: (s: string, t: string) => {
        let j = 0;
        for (const letter of s) if (letter === t[j]) j++;
        return j === t.length ? 1 : 0;
      },
    },
    {
      name: 'skip a letter of s only when it does not match',
      solve: (s: string, t: string) => {
        const ways = [1, ...Array<number>(t.length).fill(0)];
        for (const letter of s) for (let j = t.length; j >= 1; j--) ways[j] = t[j - 1] === letter ? ways[j - 1] : ways[j];
        return ways[t.length];
      },
    },
    {
      name: 'count ways to choose each letter, ignoring order',
      solve: (s: string, t: string) => {
        const choose = (n: number, k: number): number => (k === 0 ? 1 : k > n ? 0 : (choose(n - 1, k - 1) * n) / k);
        const counts = (text: string, letter: string) => [...text].filter((x) => x === letter).length;
        return [...new Set(t)].reduce((ways, letter) => ways * choose(counts(s, letter), counts(t, letter)), 1);
      },
    },
  ],
  'count-palindromic-substrings': [
    {
      name: 'count each palindrome once, however often it appears',
      solve: (s: string) => {
        const found = new Set<string>();
        for (let i = 0; i < s.length; i++)
          for (let j = i + 1; j <= s.length; j++)
            if (s.slice(i, j) === s.slice(i, j).split('').reverse().join('')) found.add(s.slice(i, j));
        return found.size;
      },
    },
    {
      name: 'expand around single letters only',
      solve: (s: string) => {
        let count = 0;
        for (let center = 0; center < s.length; center++)
          for (let left = center, right = center; left >= 0 && right < s.length && s[left] === s[right]; left--, right++) count++;
        return count;
      },
    },
  ],
  'minimum-path-sum': [
    {
      name: 'always step to the cheaper neighbor',
      solve: (grid: number[][]) => {
        let [r, c] = [0, 0];
        let total = grid[0][0];
        while (r < grid.length - 1 || c < grid[0].length - 1) {
          if (r === grid.length - 1 || (c < grid[0].length - 1 && grid[r][c + 1] <= grid[r + 1][c])) c++;
          else r++;
          total += grid[r][c];
        }
        return total;
      },
    },
    {
      name: 'treat cells outside the grid as costing 0',
      solve: (grid: number[][]) => {
        const best = Array<number>(grid[0].length).fill(0);
        for (const row of grid) row.forEach((cost, c) => (best[c] = cost + Math.min(best[c], c > 0 ? best[c - 1] : 0)));
        return best[best.length - 1];
      },
    },
  ],
  'maximal-square': [
    {
      name: 'return the side instead of the area',
      solve: (matrix: string[][]) => {
        const side = matrix.map((row) => row.map(() => 0));
        let best = 0;
        matrix.forEach((row, r) =>
          row.forEach((cell, c) => {
            if (cell === '1')
              best = Math.max(best, (side[r][c] = 1 + Math.min(side[r - 1]?.[c] ?? 0, side[r][c - 1] ?? 0, side[r - 1]?.[c - 1] ?? 0)));
          }),
        );
        return best;
      },
    },
    {
      name: 'grow from the cells above and to the left only',
      solve: (matrix: string[][]) => {
        const side = matrix.map((row) => row.map(() => 0));
        let best = 0;
        matrix.forEach((row, r) =>
          row.forEach((cell, c) => {
            if (cell === '1') best = Math.max(best, (side[r][c] = 1 + Math.min(side[r - 1]?.[c] ?? 0, side[r][c - 1] ?? 0)));
          }),
        );
        return best * best;
      },
    },
  ],
  'burst-balloons': [
    {
      name: 'burst the smallest number first',
      solve: (nums: number[]) => {
        const left = [...nums];
        let coins = 0;
        while (left.length) {
          const i = left.indexOf(Math.min(...left));
          coins += (left[i - 1] ?? 1) * left[i] * (left[i + 1] ?? 1);
          left.splice(i, 1);
        }
        return coins;
      },
    },
    {
      name: 'split on the balloon burst first, with its original neighbors',
      solve: (nums: number[]) => {
        const memo = new Map<string, number>();
        const best = (lo: number, hi: number): number => {
          if (lo > hi) return 0;
          const key = `${lo},${hi}`;
          if (!memo.has(key)) {
            let top = 0;
            for (let k = lo; k <= hi; k++)
              top = Math.max(top, (nums[k - 1] ?? 1) * nums[k] * (nums[k + 1] ?? 1) + best(lo, k - 1) + best(k + 1, hi));
            memo.set(key, top);
          }
          return memo.get(key)!;
        };
        return best(0, nums.length - 1);
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
  'path-sum-iii': [
    {
      name: 'leave prefix sums behind after a subtree',
      solve: (root: TreeNode | null, targetSum: number) => prefixPathCount(root, targetSum, { undo: false }),
    },
    {
      name: 'forget the empty prefix, so no path starts at the root',
      solve: (root: TreeNode | null, targetSum: number) => prefixPathCount(root, targetSum, { emptyPrefix: false }),
    },
    {
      name: 'stop extending a path once it matches',
      solve: (root: TreeNode | null, targetSum: number) => {
        const down = (node: TreeNode | null, sum: number): number => {
          if (!node) return 0;
          if (sum + node.val === targetSum) return 1;
          return down(node.left, sum + node.val) + down(node.right, sum + node.val);
        };
        const starts = (node: TreeNode | null): number => (node ? down(node, 0) + starts(node.left) + starts(node.right) : 0);
        return starts(root);
      },
    },
  ],
  'kth-smallest-bst': [
    { name: 'count k from 0', solve: (root: TreeNode, k: number) => inorderValues(root)[k] },
    { name: 'take the k-th largest', solve: (root: TreeNode, k: number) => inorderValues(root).reverse()[k - 1] },
    {
      name: 'take the k-th value in level order',
      solve: (root: TreeNode, k: number) => {
        const queue = [root];
        for (const node of queue) for (const child of [node.left, node.right]) if (child) queue.push(child);
        return queue[k - 1].val;
      },
    },
  ],
  'count-good-nodes': [
    { name: 'compare with the parent only', solve: (root: TreeNode) => goodCount(root, { parentOnly: true }) },
    { name: 'let a tie with a node above spoil it', solve: (root: TreeNode) => goodCount(root, { ties: false }) },
    { name: 'start the largest value above at 0', solve: (root: TreeNode) => goodCount(root, { start: 0 }) },
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
  candy: [
    {
      name: 'sweep left to right only',
      solve: (ratings: number[]) => {
        const candies = ratings.map(() => 1);
        for (let i = 1; i < ratings.length; i++) if (ratings[i] > ratings[i - 1]) candies[i] = candies[i - 1] + 1;
        return candies.reduce((sum, c) => sum + c, 0);
      },
    },
    {
      name: 'give a child with an equal rating more candies too',
      solve: (ratings: number[]) => {
        const candies = ratings.map(() => 1);
        for (let i = 1; i < ratings.length; i++) if (ratings[i] >= ratings[i - 1]) candies[i] = candies[i - 1] + 1;
        for (let i = ratings.length - 2; i >= 0; i--)
          if (ratings[i] >= ratings[i + 1]) candies[i] = Math.max(candies[i], candies[i + 1] + 1);
        return candies.reduce((sum, c) => sum + c, 0);
      },
    },
    {
      name: 'add the two sweeps instead of taking the larger',
      solve: (ratings: number[]) => {
        const n = ratings.length;
        const left = ratings.map(() => 1);
        const right = ratings.map(() => 1);
        for (let i = 1; i < n; i++) if (ratings[i] > ratings[i - 1]) left[i] = left[i - 1] + 1;
        for (let i = n - 2; i >= 0; i--) if (ratings[i] > ratings[i + 1]) right[i] = right[i + 1] + 1;
        return left.reduce((sum, c, i) => sum + c + right[i] - 1, 0);
      },
    },
  ],
  'jump-game-ii': [
    {
      name: 'always make the longest jump',
      solve: (nums: number[]) => {
        let jumps = 0;
        for (let i = 0; i < nums.length - 1; jumps++) {
          if (!nums[i]) return -1;
          i = Math.min(i + nums[i], nums.length - 1);
        }
        return jumps;
      },
    },
    {
      name: 'jump to the index with the largest value',
      solve: (nums: number[]) => {
        let jumps = 0;
        for (let i = 0; i < nums.length - 1; jumps++) {
          if (i + nums[i] >= nums.length - 1) return jumps + 1;
          let next = i + 1;
          for (let j = i + 2; j <= i + nums[i]; j++) if (nums[j] > nums[next]) next = j;
          i = next;
        }
        return jumps;
      },
    },
    {
      name: 'let the scan reach the last index too',
      solve: (nums: number[]) => {
        let jumps = 0;
        let end = 0;
        let far = 0;
        for (let i = 0; i < nums.length; i++) {
          far = Math.max(far, i + nums[i]);
          if (i === end) {
            jumps++;
            end = far;
          }
        }
        return jumps;
      },
    },
  ],
  'min-refueling-stops': [
    {
      name: 'stop at the farthest station passed',
      solve: (target: number, startFuel: number, stations: number[][]) => {
        const used = new Set<number>();
        let reach = startFuel;
        let stops = 0;
        for (; reach < target; stops++) {
          let pick = -1;
          stations.forEach(([position], i) => {
            if (position <= reach && !used.has(i)) pick = i;
          });
          if (pick < 0) return -1;
          used.add(pick);
          reach += stations[pick][1];
        }
        return stops;
      },
    },
    {
      name: 'require fuel left over on arrival',
      solve: (target: number, startFuel: number, stations: number[][]) => {
        const passed: number[] = [];
        let reach = startFuel;
        let stops = 0;
        for (let i = 0; reach <= target; stops++) {
          while (i < stations.length && stations[i][0] < reach) passed.push(stations[i++][1]);
          if (!passed.length) return -1;
          passed.sort((a, b) => a - b);
          reach += passed.pop()!;
        }
        return stops;
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
  'missing-number': [
    {
      name: 'start the XOR at 0 instead of n',
      solve: (nums: number[]) => nums.reduce((x, value, i) => x ^ i ^ value, 0),
    },
    {
      name: 'look for the first gap after the smallest value',
      solve: (nums: number[]) => {
        const sorted = [...nums].sort((a, b) => a - b);
        const gap = sorted.findIndex((value, i) => i > 0 && value !== sorted[i - 1] + 1);
        return gap < 0 ? sorted[sorted.length - 1] + 1 : sorted[gap - 1] + 1;
      },
    },
    {
      name: 'look only for a gap between values, else answer 0',
      solve: (nums: number[]) => {
        const sorted = [...nums].sort((a, b) => a - b);
        const gap = sorted.findIndex((value, i) => i > 0 && value !== sorted[i - 1] + 1);
        return gap < 0 ? 0 : sorted[gap - 1] + 1;
      },
    },
  ],
  'single-number-ii': [
    { name: 'XOR every value', solve: (nums: number[]) => nums.reduce((a, b) => a ^ b, 0) },
    {
      name: 'count bits 0 to 30 only',
      solve: (nums: number[]) =>
        rangeOf(0, 30).reduce((single, bit) => (nums.filter((x) => (x >> bit) & 1).length % 3 ? single | (1 << bit) : single), 0),
    },
    {
      name: 'compare each sorted group of three, else answer the first value',
      solve: (nums: number[]) => {
        const sorted = [...nums].sort((a, b) => a - b);
        for (let i = 0; i + 1 < sorted.length; i += 3) if (sorted[i] !== sorted[i + 1]) return sorted[i];
        return sorted[0];
      },
    },
  ],
  'minimum-flips-or': [
    {
      name: 'count the bits where a OR b differs from c',
      solve: (a: number, b: number, c: number) => [...((a | b) ^ c).toString(2)].filter((bit) => bit === '1').length,
    },
    { name: 'stop once c has no bits left', solve: (a: number, b: number, c: number) => flipsBelow(a, b, c, c ? 32 - Math.clz32(c) : 0) },
    { name: 'check bits 0 to 29 only', solve: (a: number, b: number, c: number) => flipsBelow(a, b, c, 30) },
  ],
  'minimum-xor-sum': [
    {
      name: 'pair the arrays in the order given',
      solve: (nums1: number[], nums2: number[]) => nums1.reduce((sum, x, i) => sum + (x ^ nums2[i]), 0),
    },
    {
      name: 'give each nums1 value the cheapest nums2 value still free',
      solve: (nums1: number[], nums2: number[]) => {
        const free = new Set(rangeOf(0, nums2.length - 1));
        return nums1.reduce((sum, x) => {
          const best = [...free].reduce((b, j) => ((x ^ nums2[j]) < (x ^ nums2[b]) ? j : b));
          free.delete(best);
          return sum + (x ^ nums2[best]);
        }, 0);
      },
    },
    {
      name: 'sort both arrays and pair them in order',
      solve: (nums1: number[], nums2: number[]) => {
        const [a, b] = [nums1, nums2].map((nums) => [...nums].sort((x, y) => x - y));
        return a.reduce((sum, x, i) => sum + (x ^ b[i]), 0);
      },
    },
  ],
  'partition-k-subsets': [
    {
      name: 'check only that the total divides by k',
      solve: (nums: number[], k: number) => nums.reduce((sum, x) => sum + x, 0) % k === 0,
    },
    {
      name: 'check the total, and that no value is larger than one group',
      solve: (nums: number[], k: number) => {
        const total = nums.reduce((sum, x) => sum + x, 0);
        return total % k === 0 && Math.max(...nums) <= total / k;
      },
    },
    {
      name: 'put each value, largest first, into the first group it fits, never moving it',
      solve: (nums: number[], k: number) => {
        const total = nums.reduce((sum, x) => sum + x, 0);
        if (total % k) return false;
        const sums: number[] = Array(k).fill(0);
        return [...nums]
          .sort((a, b) => b - a)
          .every((x) => {
            const group = sums.findIndex((sum) => sum + x <= total / k);
            if (group >= 0) sums[group] += x;
            return group >= 0;
          });
      },
    },
  ],
  'shortest-path-all-nodes': [
    { name: 'assume some path visits each node once: n - 1', solve: (graph: number[][]) => graph.length - 1 },
    { name: 'start the BFS from node 0 only', solve: (graph: number[][]) => visitAllFrom(graph, [0]) },
    {
      name: 'from the best start, keep walking to the nearest node not yet visited',
      solve: (graph: number[][]) => {
        const dist = graph.map((_, start) => hopsFrom(graph, start));
        return Math.min(
          ...graph.map((_, start) => {
            const left = new Set(rangeOf(0, graph.length - 1).filter((v) => v !== start));
            let total = 0;
            for (let at = start; left.size;) {
              const next = [...left].reduce((best, v) => (dist[at][v] < dist[at][best] ? v : best));
              total += dist[at][next];
              left.delete(next);
              at = next;
            }
            return total;
          }),
        );
      },
    },
  ],
  'maximum-students': [
    { name: 'check only the seats to the left and right', solve: (seats: string[][]) => rowByRowMax(seats) },
    {
      name: 'also keep the seat directly in front free',
      solve: (seats: string[][]) => {
        const n = seats[0].length;
        let best = new Map([[0, 0]]);
        for (const row of seats) {
          const next = new Map<number, number>();
          for (let mask = 0; mask < 1 << n; mask++) {
            if (mask & (mask >> 1) || row.some((seat, c) => seat === '#' && mask & (1 << c))) continue;
            for (const [prev, count] of best)
              if (!(mask & (prev << 1)) && !(mask & (prev >> 1)) && !(mask & prev))
                next.set(mask, Math.max(next.get(mask) ?? 0, count + mask.toString(2).split('1').length - 1));
          }
          best = next;
        }
        return Math.max(...best.values());
      },
    },
    {
      name: 'seat each row left to right wherever no one seated so far is side by side or diagonal',
      solve: (seats: string[][]) => {
        const taken = seats.map((row) => row.map(() => false));
        seats.forEach((row, r) =>
          row.forEach((seat, c) => {
            const near = [taken[r][c - 1], taken[r - 1]?.[c - 1], taken[r - 1]?.[c + 1]];
            taken[r][c] = seat === '.' && !near.some(Boolean);
          }),
        );
        return taken.flat().filter(Boolean).length;
      },
    },
  ],
  'hats-to-people': [
    {
      name: 'leave out the modulo',
      solve: (hats: number[][]) => {
        const ways = Array<number>(1 << hats.length).fill(0);
        ways[0] = 1;
        for (let hat = 1; hat <= 40; hat++)
          for (let mask = ways.length - 1; mask >= 0; mask--)
            hats.forEach((liked, p) => {
              if (!(mask & (1 << p)) && liked.includes(hat)) ways[mask | (1 << p)] += ways[mask];
            });
        return ways[ways.length - 1];
      },
    },
    {
      name: 'multiply how many hats each person likes',
      solve: (hats: number[][]) => hats.reduce((product, liked) => (product * liked.length) % 1_000_000_007, 1),
    },
    {
      name: 'update the counts in place with the masks counting up, so one hat can go to two people',
      solve: (hats: number[][]) => {
        const ways = Array<number>(1 << hats.length).fill(0);
        ways[0] = 1;
        for (let hat = 1; hat <= 40; hat++)
          for (let mask = 0; mask < ways.length; mask++)
            hats.forEach((liked, p) => {
              if (!(mask & (1 << p)) && liked.includes(hat)) ways[mask | (1 << p)] = (ways[mask | (1 << p)] + ways[mask]) % 1_000_000_007;
            });
        return ways[ways.length - 1];
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
