import type { PatternId } from '../curriculum/catalog.js';

/** Each visualizer's pattern, apart from its title and the rest, so the pattern list and review catalog load without them. */
export const ALGORITHM_PATTERNS = {
  'binary-search': 'binary-search',
  'pair-sum-sorted': 'two-pointers',
  'longest-unique-substring': 'sliding-window',
  'next-greater-element': 'monotonic-stack',
  'grid-bfs': 'bfs',
  'kth-largest': 'heap',
  lcs: 'dp-2d',
  'union-find': 'union-find',
  'topo-sort': 'topo-sort',
  trie: 'trie',
  dijkstra: 'dijkstra',
  'kruskal-mst': 'minimum-spanning-tree',
  'merge-intervals': 'intervals',
  'subsets-backtracking': 'dfs-backtracking',
  'tree-traversal': 'tree-dfs',
  'jump-game': 'greedy',
  'single-number-xor': 'bit-manipulation',
  'two-sum-hash': 'hashing',
  'subarray-sum-prefix': 'prefix-sum',
  'linked-list-cycle': 'fast-slow',
  'linked-list-reversal': 'linked-list-reversal',
  'house-robber': 'dp-1d',
} as const satisfies Record<string, PatternId>;

export type AlgorithmPatternId = keyof typeof ALGORITHM_PATTERNS;
