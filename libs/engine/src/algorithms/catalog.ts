import type { PatternId } from '../curriculum/catalog.js';
import type { Difficulty } from './types.js';

/** A visualizer as lists, links, route titles and progress see it. */
export interface AlgorithmSummary<Id extends string = string> {
  id: Id;
  title: string;
  patternId: PatternId;
  difficulty: Difficulty;
  /** Learner text: backticks mark code spans. */
  summary: string;
  complexity: { time: string; space: string };
}

const CATALOG = [
  {
    id: 'binary-search',
    title: 'Binary Search',
    patternId: 'binary-search',
    difficulty: 'easy',
    summary: 'Halve a sorted search space every step by comparing against the middle element.',
    complexity: { time: 'O(log n)', space: 'O(1)' },
  },
  {
    id: 'pair-sum-sorted',
    title: 'Pair Sum in a Sorted Array',
    patternId: 'two-pointers',
    difficulty: 'easy',
    summary: 'Squeeze two pointers inward; the sorted order tells you which one to move.',
    complexity: { time: 'O(n)', space: 'O(1)' },
  },
  {
    id: 'longest-unique-substring',
    title: 'Longest Substring Without Repeats',
    patternId: 'sliding-window',
    difficulty: 'medium',
    summary: 'Grow the window on the right; when a duplicate enters, shrink from the left until the window is valid again.',
    complexity: { time: 'O(n)', space: 'O(k) distinct chars' },
  },
  {
    id: 'next-greater-element',
    title: 'Next Greater Element',
    patternId: 'monotonic-stack',
    difficulty: 'medium',
    summary: 'Keep a stack of indices still waiting for a bigger value; each new value resolves everyone smaller than it.',
    complexity: { time: 'O(n)', space: 'O(n)' },
  },
  {
    id: 'grid-bfs',
    title: 'Shortest Path in a Grid (BFS)',
    patternId: 'bfs',
    difficulty: 'medium',
    summary: 'Explore in rings of equal distance using a FIFO queue; the first time you reach the goal is the shortest path.',
    complexity: { time: 'O(rows × cols)', space: 'O(rows × cols)' },
  },
  {
    id: 'kth-largest',
    title: 'K-th Largest with a Min-Heap',
    patternId: 'heap',
    difficulty: 'medium',
    summary: 'Keep only the k largest values seen so far in a min-heap; its root is always the k-th largest.',
    complexity: { time: 'O(n log k)', space: 'O(k)' },
  },
  {
    id: 'lcs',
    title: 'Longest Common Subsequence',
    patternId: 'dp-2d',
    difficulty: 'medium',
    summary: 'Fill a table where each cell answers the problem for two prefixes, using only the three neighbours already filled.',
    complexity: { time: 'O(m·n)', space: 'O(m·n)' },
  },
  {
    id: 'union-find',
    title: 'Union-Find: Counting Components',
    patternId: 'union-find',
    difficulty: 'medium',
    summary: 'Each component is a tree identified by its root; union links roots, and path compression keeps the trees flat.',
    complexity: { time: 'O(E · α(n)) ≈ O(E)', space: 'O(n)' },
  },
  {
    id: 'topo-sort',
    title: "Topological Sort (Kahn's Algorithm)",
    patternId: 'topo-sort',
    difficulty: 'medium',
    summary: 'Repeatedly take a node with no remaining prerequisites; if some nodes never free up, the graph has a cycle.',
    complexity: { time: 'O(V + E)', space: 'O(V + E)' },
  },
  {
    id: 'trie',
    title: 'Trie: Insert and Search',
    patternId: 'trie',
    difficulty: 'medium',
    summary:
      'Words that share a prefix share a path from the root, so a lookup costs the length of the word, not the size of the dictionary.',
    complexity: { time: 'O(L) per word', space: 'O(total letters)' },
  },
  {
    id: 'dijkstra',
    title: "Dijkstra's Shortest Paths",
    patternId: 'dijkstra',
    difficulty: 'hard',
    summary: 'Always settle the closest unsettled node next; with non-negative weights its distance can never improve later.',
    complexity: { time: 'O((V + E) log V)', space: 'O(V + E)' },
  },
  {
    id: 'merge-intervals',
    title: 'Merge Intervals',
    patternId: 'intervals',
    difficulty: 'medium',
    summary: 'Sort by start, then sweep once: each interval either extends the last merged one or starts a new one.',
    complexity: { time: 'O(n log n)', space: 'O(n)' },
  },
  {
    id: 'subsets-backtracking',
    title: 'Subsets by Backtracking',
    patternId: 'dfs-backtracking',
    difficulty: 'medium',
    summary:
      'Each number is a take-or-skip branch: take it, explore, undo, then explore without it, so every leaf of the decision tree is one subset.',
    complexity: { time: 'O(n · 2ⁿ)', space: 'O(n) plus the output' },
  },
  {
    id: 'tree-traversal',
    title: 'Tree DFS: Preorder, Inorder, Postorder',
    patternId: 'tree-dfs',
    difficulty: 'easy',
    summary:
      'One recursive walk enters the nodes in the same sequence every time; the three orders differ only in where the node is appended.',
    complexity: { time: 'O(n)', space: 'O(h)' },
  },
  {
    id: 'jump-game',
    title: 'Jump Game',
    patternId: 'greedy',
    difficulty: 'medium',
    summary: 'Keep only the farthest index any jump can reach; you are stuck exactly when the scan walks past it.',
    complexity: { time: 'O(n)', space: 'O(1)' },
  },
  {
    id: 'single-number-xor',
    title: 'Single Number (XOR)',
    patternId: 'bit-manipulation',
    difficulty: 'easy',
    summary: 'XOR every number into one accumulator: equal numbers cancel (`n ^ n = 0`), so only the unpaired one survives.',
    complexity: { time: 'O(n)', space: 'O(1)' },
  },
  {
    id: 'two-sum-hash',
    title: 'Two Sum (Hash Map)',
    patternId: 'hashing',
    difficulty: 'easy',
    summary:
      'Scan once and remember each number with its index; the pair appears the moment a number finds its partner already in the map.',
    complexity: { time: 'O(n)', space: 'O(n)' },
  },
  {
    id: 'subarray-sum-prefix',
    title: 'Subarray Sum Equals K',
    patternId: 'prefix-sum',
    difficulty: 'medium',
    summary:
      'Keep a running prefix sum p and count how often each prefix appeared: the subarrays ending here that sum to k are the earlier prefixes equal to `p - k`.',
    complexity: { time: 'O(n)', space: 'O(n)' },
  },
  {
    id: 'linked-list-cycle',
    title: 'Linked List Cycle (Floyd)',
    patternId: 'fast-slow',
    difficulty: 'easy',
    summary:
      'Move slow one node and fast two per step: fast runs off the end of a list that ends, and inside a loop it gains one node per step until it lands on slow.',
    complexity: { time: 'O(n)', space: 'O(1)' },
  },
  {
    id: 'house-robber',
    title: 'House Robber',
    patternId: 'dp-1d',
    difficulty: 'medium',
    summary: '`dp[i]` is the most money from the first i houses: skip house `i - 1` and keep `dp[i - 1]`, or rob it on top of `dp[i - 2]`.',
    complexity: { time: 'O(n)', space: 'O(n)' },
  },
] as const satisfies readonly AlgorithmSummary[];

export type AlgorithmId = (typeof CATALOG)[number]['id'];

/** Every visualizer, in the order the Visualize list shows them. */
export const ALGORITHM_CATALOG: readonly AlgorithmSummary<AlgorithmId>[] = CATALOG;

export function getAlgorithmSummary(id: string): AlgorithmSummary | undefined {
  return ALGORITHM_CATALOG.find((a) => a.id === id);
}
