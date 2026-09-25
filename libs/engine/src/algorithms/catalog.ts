import type { Difficulty } from './types.js';

/** A visualizer as lists, links, route titles and progress see it. This module imports no tracer, so the app's first load carries none. */
export interface AlgorithmSummary<Id extends string = AlgorithmId> {
  id: Id;
  title: string;
  patternId: string;
  difficulty: Difficulty;
}

const CATALOG = [
  { id: 'binary-search', title: 'Binary Search', patternId: 'binary-search', difficulty: 'easy' },
  { id: 'pair-sum-sorted', title: 'Pair Sum in a Sorted Array', patternId: 'two-pointers', difficulty: 'easy' },
  { id: 'longest-unique-substring', title: 'Longest Substring Without Repeats', patternId: 'sliding-window', difficulty: 'medium' },
  { id: 'next-greater-element', title: 'Next Greater Element', patternId: 'monotonic-stack', difficulty: 'medium' },
  { id: 'grid-bfs', title: 'Shortest Path in a Grid (BFS)', patternId: 'bfs', difficulty: 'medium' },
  { id: 'kth-largest', title: 'K-th Largest with a Min-Heap', patternId: 'heap', difficulty: 'medium' },
  { id: 'lcs', title: 'Longest Common Subsequence', patternId: 'dp-2d', difficulty: 'medium' },
  { id: 'union-find', title: 'Union-Find: Counting Components', patternId: 'union-find', difficulty: 'medium' },
  { id: 'topo-sort', title: "Topological Sort (Kahn's Algorithm)", patternId: 'topo-sort', difficulty: 'medium' },
  { id: 'trie', title: 'Trie: Insert and Search', patternId: 'trie', difficulty: 'medium' },
  { id: 'dijkstra', title: "Dijkstra's Shortest Paths", patternId: 'dijkstra', difficulty: 'hard' },
  { id: 'merge-intervals', title: 'Merge Intervals', patternId: 'intervals', difficulty: 'medium' },
  { id: 'subsets-backtracking', title: 'Subsets by Backtracking', patternId: 'dfs-backtracking', difficulty: 'medium' },
  { id: 'tree-traversal', title: 'Tree DFS: Preorder, Inorder, Postorder', patternId: 'tree-dfs', difficulty: 'easy' },
  { id: 'jump-game', title: 'Jump Game', patternId: 'greedy', difficulty: 'medium' },
  { id: 'single-number-xor', title: 'Single Number (XOR)', patternId: 'bit-manipulation', difficulty: 'easy' },
  { id: 'two-sum-hash', title: 'Two Sum (Hash Map)', patternId: 'hashing', difficulty: 'easy' },
  { id: 'subarray-sum-prefix', title: 'Subarray Sum Equals K', patternId: 'prefix-sum', difficulty: 'medium' },
  { id: 'linked-list-cycle', title: 'Linked List Cycle (Floyd)', patternId: 'fast-slow', difficulty: 'easy' },
  { id: 'house-robber', title: 'House Robber', patternId: 'dp-1d', difficulty: 'medium' },
] as const satisfies readonly AlgorithmSummary<string>[];

export type AlgorithmId = (typeof CATALOG)[number]['id'];

/** Every visualizer, in the order the Visualize list shows them. */
export const ALGORITHM_CATALOG: readonly AlgorithmSummary[] = CATALOG;

export function getAlgorithmSummary(id: string): AlgorithmSummary | undefined {
  return ALGORITHM_CATALOG.find((a) => a.id === id);
}
