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
  { id: 'longest-consecutive-sequence', title: 'Longest Consecutive Sequence', difficulty: 'medium', patternIds: ['hashing'] },
  {
    id: 'pair-sum-sorted',
    title: 'Two Sum in a Sorted Array',
    difficulty: 'easy',
    patternIds: ['two-pointers'],
    algorithmId: 'pair-sum-sorted',
  },
  { id: 'container-most-water', title: 'Container With Most Water', difficulty: 'medium', patternIds: ['two-pointers', 'greedy'] },
  { id: 'three-sum', title: '3Sum', difficulty: 'medium', patternIds: ['two-pointers'] },
  {
    id: 'longest-unique-substring',
    title: 'Longest Substring Without Repeating Characters',
    difficulty: 'medium',
    patternIds: ['sliding-window'],
    algorithmId: 'longest-unique-substring',
  },
  { id: 'min-size-subarray-sum', title: 'Minimum Size Subarray Sum', difficulty: 'medium', patternIds: ['sliding-window'] },
  {
    id: 'character-replacement',
    title: 'Longest Repeating Character Replacement',
    difficulty: 'medium',
    patternIds: ['sliding-window'],
  },
  { id: 'binary-search', title: 'Binary Search', difficulty: 'easy', patternIds: ['binary-search'], algorithmId: 'binary-search' },
  { id: 'koko-bananas', title: 'Minimum Eating Speed', difficulty: 'medium', patternIds: ['binary-search'] },
  { id: 'search-rotated-array', title: 'Search in Rotated Sorted Array', difficulty: 'medium', patternIds: ['binary-search'] },
  {
    id: 'subarray-sum-k',
    title: 'Subarrays Summing to K',
    difficulty: 'medium',
    patternIds: ['prefix-sum', 'hashing'],
    algorithmId: 'subarray-sum-prefix',
  },
  { id: 'product-of-array-except-self', title: 'Product of Array Except Self', difficulty: 'medium', patternIds: ['prefix-sum'] },
  { id: 'contiguous-array', title: 'Contiguous Array', difficulty: 'medium', patternIds: ['prefix-sum', 'hashing'] },
  {
    id: 'daily-temperatures',
    title: 'Days Until Warmer',
    difficulty: 'medium',
    patternIds: ['monotonic-stack'],
    algorithmId: 'next-greater-element',
  },
  { id: 'largest-rectangle-in-histogram', title: 'Largest Rectangle in Histogram', difficulty: 'hard', patternIds: ['monotonic-stack'] },
  { id: 'sum-subarray-minimums', title: 'Sum of Subarray Minimums', difficulty: 'medium', patternIds: ['monotonic-stack'] },
  {
    id: 'find-duplicate',
    title: 'Find the Duplicate Number',
    difficulty: 'medium',
    patternIds: ['fast-slow'],
    algorithmId: 'linked-list-cycle',
  },
  { id: 'circular-array-loop', title: 'Circular Array Loop', difficulty: 'medium', patternIds: ['fast-slow'] },
  { id: 'happy-numbers', title: 'Happy Numbers', difficulty: 'easy', patternIds: ['fast-slow'] },
  { id: 'merge-intervals', title: 'Merge Intervals', difficulty: 'medium', patternIds: ['intervals'], algorithmId: 'merge-intervals' },
  { id: 'non-overlapping-intervals', title: 'Non-overlapping Intervals', difficulty: 'medium', patternIds: ['intervals'] },
  { id: 'insert-interval', title: 'Insert Interval', difficulty: 'medium', patternIds: ['intervals'] },
  { id: 'top-k-frequent', title: 'Top K Frequent Elements', difficulty: 'medium', patternIds: ['heap', 'hashing'] },
  { id: 'kth-largest-element', title: 'K-th Largest Element', difficulty: 'medium', patternIds: ['heap'], algorithmId: 'kth-largest' },
  { id: 'k-closest-points', title: 'K Closest Points to Origin', difficulty: 'medium', patternIds: ['heap'] },
  {
    id: 'number-of-islands',
    title: 'Number of Islands',
    difficulty: 'medium',
    patternIds: ['bfs', 'dfs-backtracking'],
    algorithmId: 'grid-bfs',
  },
  { id: 'rotting-oranges', title: 'Rotting Oranges', difficulty: 'medium', patternIds: ['bfs'] },
  { id: 'shortest-path-binary-matrix', title: 'Shortest Path in Binary Matrix', difficulty: 'medium', patternIds: ['bfs'] },
  { id: 'subsets', title: 'Subsets', difficulty: 'medium', patternIds: ['dfs-backtracking'], algorithmId: 'subsets-backtracking' },
  { id: 'combination-sum', title: 'Combination Sum', difficulty: 'medium', patternIds: ['dfs-backtracking'] },
  { id: 'word-search', title: 'Word Search', difficulty: 'medium', patternIds: ['dfs-backtracking'] },
  { id: 'course-schedule', title: 'Course Schedule', difficulty: 'medium', patternIds: ['topo-sort'], algorithmId: 'topo-sort' },
  { id: 'parallel-courses', title: 'Parallel Courses', difficulty: 'medium', patternIds: ['topo-sort'] },
  { id: 'longest-increasing-path', title: 'Longest Increasing Path in a Matrix', difficulty: 'hard', patternIds: ['topo-sort'] },
  {
    id: 'count-components',
    title: 'Number of Connected Components',
    difficulty: 'medium',
    patternIds: ['union-find', 'dfs-backtracking'],
    algorithmId: 'union-find',
  },
  { id: 'redundant-connection', title: 'Redundant Connection', difficulty: 'medium', patternIds: ['union-find'] },
  { id: 'number-of-provinces', title: 'Number of Provinces', difficulty: 'medium', patternIds: ['union-find'] },
  { id: 'network-delay', title: 'Network Delay Time', difficulty: 'medium', patternIds: ['dijkstra'], algorithmId: 'dijkstra' },
  { id: 'path-with-minimum-effort', title: 'Path With Minimum Effort', difficulty: 'medium', patternIds: ['dijkstra'] },
  { id: 'cheapest-flights', title: 'Cheapest Flights Within K Stops', difficulty: 'medium', patternIds: ['dijkstra'] },
  { id: 'tree-diameter', title: 'Diameter of Binary Tree', difficulty: 'easy', patternIds: ['tree-dfs'], algorithmId: 'tree-traversal' },
  { id: 'house-robber-tree', title: 'House Robber on a Tree', difficulty: 'medium', patternIds: ['tree-dfs'] },
  { id: 'max-path-sum', title: 'Binary Tree Maximum Path Sum', difficulty: 'hard', patternIds: ['tree-dfs'] },
  { id: 'count-prefixes', title: 'Count Words by Prefix', difficulty: 'medium', patternIds: ['trie'], algorithmId: 'trie' },
  { id: 'replace-words', title: 'Replace Words', difficulty: 'medium', patternIds: ['trie'] },
  { id: 'word-search-ii', title: 'Word Search II', difficulty: 'hard', patternIds: ['trie'] },
  { id: 'house-robber', title: 'House Robber', difficulty: 'medium', patternIds: ['dp-1d'], algorithmId: 'house-robber' },
  { id: 'coin-change', title: 'Coin Change', difficulty: 'medium', patternIds: ['dp-1d'] },
  { id: 'word-break', title: 'Word Break', difficulty: 'medium', patternIds: ['dp-1d'] },
  {
    id: 'longest-common-subsequence',
    title: 'Longest Common Subsequence',
    difficulty: 'medium',
    patternIds: ['dp-2d'],
    algorithmId: 'lcs',
  },
  { id: 'edit-distance', title: 'Edit Distance', difficulty: 'medium', patternIds: ['dp-2d'] },
  { id: 'longest-palindromic-subsequence', title: 'Longest Palindromic Subsequence', difficulty: 'medium', patternIds: ['dp-2d'] },
  { id: 'jump-game', title: 'Jump Game', difficulty: 'medium', patternIds: ['greedy'], algorithmId: 'jump-game' },
  { id: 'gas-station', title: 'Gas Station', difficulty: 'medium', patternIds: ['greedy'] },
  { id: 'single-number', title: 'Single Number', difficulty: 'easy', patternIds: ['bit-manipulation'], algorithmId: 'single-number-xor' },
  { id: 'total-hamming-distance', title: 'Total Hamming Distance', difficulty: 'medium', patternIds: ['bit-manipulation'] },
  { id: 'counting-bits', title: 'Counting Bits', difficulty: 'easy', patternIds: ['bit-manipulation'] },
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
