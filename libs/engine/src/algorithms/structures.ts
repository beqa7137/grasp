import type { AlgorithmPatternId } from './patterns.js';

/** What a visualizer draws, for the Visualizers segment's Structure chips (REDESIGN.md 2.8), in the order they show. */
export const ALGORITHM_STRUCTURE_NAMES = {
  arrays: 'Arrays',
  lists: 'Lists',
  trees: 'Trees',
  graphs: 'Graphs',
  grids: 'Grids',
  dp: 'DP',
} as const;
export type AlgorithmStructure = keyof typeof ALGORITHM_STRUCTURE_NAMES;

/** Kept out of the light catalog, which loads before first paint, since only the Visualizers segment reads it. */
export const ALGORITHM_STRUCTURES = {
  'binary-search': 'arrays',
  'pair-sum-sorted': 'arrays',
  'longest-unique-substring': 'arrays',
  'next-greater-element': 'arrays',
  'grid-bfs': 'grids',
  'kth-largest': 'trees',
  lcs: 'dp',
  'union-find': 'graphs',
  'topo-sort': 'graphs',
  trie: 'trees',
  dijkstra: 'graphs',
  'kruskal-mst': 'graphs',
  'merge-intervals': 'arrays',
  'subsets-backtracking': 'trees',
  'tree-traversal': 'trees',
  'jump-game': 'arrays',
  'single-number-xor': 'arrays',
  'two-sum-hash': 'arrays',
  'subarray-sum-prefix': 'arrays',
  'linked-list-cycle': 'lists',
  'linked-list-reversal': 'lists',
  'house-robber': 'dp',
  'minimum-xor-sum': 'dp',
} as const satisfies Record<AlgorithmPatternId, AlgorithmStructure>;
