import type { Difficulty } from '../algorithms/types.js';

/** A coding problem as lists, links, route titles and progress see it. */
export interface CodingProblemSummary<Id extends string = string> {
  id: Id;
  title: string;
  difficulty: Difficulty;
  patternIds: readonly string[];
  /** Visualizer showing the canonical solution, when one exists. */
  algorithmId?: string;
}

const CATALOG = [
  { id: 'two-sum', title: 'Two Sum', difficulty: 'easy', patternIds: ['hashing'], algorithmId: 'two-sum-hash' },
  {
    id: 'pair-sum-sorted',
    title: 'Two Sum in a Sorted Array',
    difficulty: 'easy',
    patternIds: ['two-pointers'],
    algorithmId: 'pair-sum-sorted',
  },
  { id: 'container-most-water', title: 'Container With Most Water', difficulty: 'medium', patternIds: ['two-pointers', 'greedy'] },
  {
    id: 'longest-unique-substring',
    title: 'Longest Substring Without Repeating Characters',
    difficulty: 'medium',
    patternIds: ['sliding-window'],
    algorithmId: 'longest-unique-substring',
  },
  { id: 'binary-search', title: 'Binary Search', difficulty: 'easy', patternIds: ['binary-search'], algorithmId: 'binary-search' },
  { id: 'koko-bananas', title: 'Minimum Eating Speed', difficulty: 'medium', patternIds: ['binary-search'] },
  {
    id: 'daily-temperatures',
    title: 'Days Until Warmer',
    difficulty: 'medium',
    patternIds: ['monotonic-stack'],
    algorithmId: 'next-greater-element',
  },
  {
    id: 'subarray-sum-k',
    title: 'Subarrays Summing to K',
    difficulty: 'medium',
    patternIds: ['prefix-sum', 'hashing'],
    algorithmId: 'subarray-sum-prefix',
  },
  {
    id: 'find-duplicate',
    title: 'Find the Duplicate Number',
    difficulty: 'medium',
    patternIds: ['fast-slow'],
    algorithmId: 'linked-list-cycle',
  },
  {
    id: 'number-of-islands',
    title: 'Number of Islands',
    difficulty: 'medium',
    patternIds: ['bfs', 'dfs-backtracking'],
    algorithmId: 'grid-bfs',
  },
  { id: 'merge-intervals', title: 'Merge Intervals', difficulty: 'medium', patternIds: ['intervals'], algorithmId: 'merge-intervals' },
  { id: 'top-k-frequent', title: 'Top K Frequent Elements', difficulty: 'medium', patternIds: ['heap', 'hashing'] },
  { id: 'house-robber', title: 'House Robber', difficulty: 'medium', patternIds: ['dp-1d'], algorithmId: 'house-robber' },
  { id: 'kth-largest-element', title: 'K-th Largest Element', difficulty: 'medium', patternIds: ['heap'], algorithmId: 'kth-largest' },
  {
    id: 'longest-common-subsequence',
    title: 'Longest Common Subsequence',
    difficulty: 'medium',
    patternIds: ['dp-2d'],
    algorithmId: 'lcs',
  },
  {
    id: 'count-components',
    title: 'Number of Connected Components',
    difficulty: 'medium',
    patternIds: ['union-find', 'dfs-backtracking'],
    algorithmId: 'union-find',
  },
  { id: 'course-schedule', title: 'Course Schedule', difficulty: 'medium', patternIds: ['topo-sort'], algorithmId: 'topo-sort' },
  { id: 'network-delay', title: 'Network Delay Time', difficulty: 'medium', patternIds: ['dijkstra'], algorithmId: 'dijkstra' },
  { id: 'tree-diameter', title: 'Diameter of Binary Tree', difficulty: 'easy', patternIds: ['tree-dfs'], algorithmId: 'tree-traversal' },
  { id: 'house-robber-tree', title: 'House Robber on a Tree', difficulty: 'medium', patternIds: ['tree-dfs'] },
  { id: 'count-prefixes', title: 'Count Words by Prefix', difficulty: 'medium', patternIds: ['trie'], algorithmId: 'trie' },
  { id: 'single-number', title: 'Single Number', difficulty: 'easy', patternIds: ['bit-manipulation'], algorithmId: 'single-number-xor' },
  { id: 'total-hamming-distance', title: 'Total Hamming Distance', difficulty: 'medium', patternIds: ['bit-manipulation'] },
] as const satisfies readonly CodingProblemSummary[];

export type CodingProblemId = (typeof CATALOG)[number]['id'];

/** Every problem, in the order the code list shows them; the learn page suggests the first one not yet solved. */
export const CODING_CATALOG: readonly CodingProblemSummary<CodingProblemId>[] = CATALOG;

export function getProblemSummary(id: string): CodingProblemSummary | undefined {
  return CODING_CATALOG.find((p) => p.id === id);
}

export function problemsForPattern(patternId: string): CodingProblemSummary[] {
  return CODING_CATALOG.filter((p) => p.patternIds.includes(patternId));
}
