import { ALGORITHM_PATTERNS, type AlgorithmPatternId } from '../algorithms/patterns.js';

export type Track = 'foundations' | 'core' | 'graphs' | 'advanced';

/** A pattern as the pattern map, route titles and progress see it; the rest lives in patterns.ts. */
export interface PatternSummary<Id extends string = string> {
  id: Id;
  name: string;
  track: Track;
  order: number;
  oneLiner: string;
  algorithmIds: readonly string[];
}

const PATTERN_LIST = [
  {
    id: 'hashing',
    name: 'Arrays & Hashing',
    track: 'foundations',
    order: 1,
    oneLiner: 'Trade memory for time: remember what you have seen so each lookup is O(1).',
  },
  {
    id: 'two-pointers',
    name: 'Two Pointers',
    track: 'foundations',
    order: 2,
    oneLiner: 'Two indices moving through ordered data; each step safely discards one candidate.',
  },
  {
    id: 'sliding-window',
    name: 'Sliding Window',
    track: 'foundations',
    order: 3,
    oneLiner: 'Maintain a contiguous range; grow right, shrink left, never move backwards.',
  },
  {
    id: 'binary-search',
    name: 'Binary Search',
    track: 'foundations',
    order: 4,
    oneLiner: 'Any monotonic yes/no question can be answered in O(log n), including "is the answer at most x?"',
  },
  {
    id: 'prefix-sum',
    name: 'Prefix Sums',
    track: 'core',
    order: 5,
    oneLiner: 'Precompute running totals so any range sum is one subtraction.',
  },
  {
    id: 'monotonic-stack',
    name: 'Monotonic Stack',
    track: 'core',
    order: 6,
    oneLiner: 'Keep a stack sorted so each new element resolves everything it dominates.',
  },
  {
    id: 'fast-slow',
    name: 'Fast & Slow Pointers',
    track: 'core',
    order: 7,
    oneLiner: 'Two runners at different speeds detect cycles and find middles without extra memory.',
  },
  {
    id: 'linked-list-reversal',
    name: 'Linked List Reversal',
    track: 'core',
    order: 8,
    oneLiner: 'Walk the list once with prev, curr and next, turning each link around in place: O(n) time, O(1) space.',
  },
  {
    id: 'intervals',
    name: 'Intervals',
    track: 'core',
    order: 9,
    oneLiner: 'Sort by start, then sweep: merge, count overlaps, or schedule.',
  },
  {
    id: 'heap',
    name: 'Heap / Top-K',
    track: 'core',
    order: 10,
    oneLiner: 'A priority queue keeps the best k things in O(log k) per update.',
  },
  {
    id: 'bfs',
    name: 'Breadth-First Search',
    track: 'graphs',
    order: 11,
    oneLiner: 'Explore in rings of equal distance; first arrival is the shortest path in an unweighted graph.',
  },
  {
    id: 'dfs-backtracking',
    name: 'DFS & Backtracking',
    track: 'graphs',
    order: 12,
    oneLiner: 'Choose, explore, un-choose: systematically enumerate a decision tree and prune early.',
  },
  {
    id: 'topo-sort',
    name: 'Topological Sort',
    track: 'graphs',
    order: 13,
    oneLiner: 'Order tasks so every dependency comes first; a leftover node means a cycle.',
  },
  {
    id: 'union-find',
    name: 'Union-Find',
    track: 'graphs',
    order: 14,
    oneLiner: 'Merge sets and ask "same group?" in near-constant time.',
  },
  {
    id: 'dijkstra',
    name: 'Shortest Paths (Dijkstra)',
    track: 'graphs',
    order: 15,
    oneLiner: 'BFS with a priority queue for non-negative weighted edges.',
  },
  {
    id: 'minimum-spanning-tree',
    name: 'Minimum Spanning Tree',
    track: 'graphs',
    order: 16,
    oneLiner: 'Join every node at the least total cost: keep taking the cheapest edge that links two separate parts.',
  },
  {
    id: 'tree-dfs',
    name: 'Tree Traversal',
    track: 'graphs',
    order: 17,
    oneLiner: 'Most tree problems are "compute from children, combine at parent".',
  },
  {
    id: 'trie',
    name: 'Trie',
    track: 'advanced',
    order: 18,
    oneLiner: 'A tree of characters: prefix queries in O(length).',
  },
  {
    id: 'dp-1d',
    name: '1-D Dynamic Programming',
    track: 'advanced',
    order: 19,
    oneLiner: 'Define the answer for a prefix in terms of smaller prefixes; memoize.',
  },
  {
    id: 'dp-2d',
    name: '2-D DP & Knapsack',
    track: 'advanced',
    order: 20,
    oneLiner: 'State over two dimensions: two strings, a grid, or items × capacity.',
  },
  {
    id: 'greedy',
    name: 'Greedy',
    track: 'advanced',
    order: 21,
    oneLiner: 'Take the locally best choice, but only when you can argue it never hurts later.',
  },
  {
    id: 'bit-manipulation',
    name: 'Bit Manipulation',
    track: 'advanced',
    order: 22,
    oneLiner: 'XOR cancels pairs, masks encode subsets, shifts multiply.',
  },
] as const satisfies readonly Omit<PatternSummary, 'algorithmIds'>[];

export type PatternId = (typeof PATTERN_LIST)[number]['id'];

/** Every pattern, in curriculum order. */
export const PATTERN_CATALOG: readonly PatternSummary<PatternId>[] = PATTERN_LIST.map((pattern) => ({
  ...pattern,
  algorithmIds: (Object.keys(ALGORITHM_PATTERNS) as AlgorithmPatternId[]).filter((id) => ALGORITHM_PATTERNS[id] === pattern.id),
}));

export function getPatternSummary(id: string): PatternSummary | undefined {
  return PATTERN_CATALOG.find((p) => p.id === id);
}

/** Recognition cards as the review catalog sees them: which pattern each one drills, in curriculum order. */
export interface DrillCardSummary<Id extends string = string> {
  id: Id;
  patternId: string;
}

const DRILLS = [
  { id: 'h1', patternId: 'hashing' },
  { id: 'h2', patternId: 'hashing' },
  { id: 'h3', patternId: 'hashing' },
  { id: 'tp1', patternId: 'two-pointers' },
  { id: 'tp2', patternId: 'two-pointers' },
  { id: 'tp3', patternId: 'two-pointers' },
  { id: 'sw1', patternId: 'sliding-window' },
  { id: 'sw2', patternId: 'sliding-window' },
  { id: 'sw3', patternId: 'sliding-window' },
  { id: 'bs1', patternId: 'binary-search' },
  { id: 'bs2', patternId: 'binary-search' },
  { id: 'bs3', patternId: 'binary-search' },
  { id: 'ps1', patternId: 'prefix-sum' },
  { id: 'ps2', patternId: 'prefix-sum' },
  { id: 'ms1', patternId: 'monotonic-stack' },
  { id: 'ms2', patternId: 'monotonic-stack' },
  { id: 'ms3', patternId: 'monotonic-stack' },
  { id: 'fs1', patternId: 'fast-slow' },
  { id: 'fs2', patternId: 'fast-slow' },
  { id: 'lr1', patternId: 'linked-list-reversal' },
  { id: 'lr2', patternId: 'linked-list-reversal' },
  { id: 'lr3', patternId: 'linked-list-reversal' },
  { id: 'iv1', patternId: 'intervals' },
  { id: 'iv2', patternId: 'intervals' },
  { id: 'hp1', patternId: 'heap' },
  { id: 'hp2', patternId: 'heap' },
  { id: 'hp3', patternId: 'heap' },
  { id: 'bf1', patternId: 'bfs' },
  { id: 'bf2', patternId: 'bfs' },
  { id: 'bf3', patternId: 'bfs' },
  { id: 'dfs1', patternId: 'dfs-backtracking' },
  { id: 'dfs2', patternId: 'dfs-backtracking' },
  { id: 'dfs3', patternId: 'dfs-backtracking' },
  { id: 'ts1', patternId: 'topo-sort' },
  { id: 'ts2', patternId: 'topo-sort' },
  { id: 'uf1', patternId: 'union-find' },
  { id: 'uf2', patternId: 'union-find' },
  { id: 'dj1', patternId: 'dijkstra' },
  { id: 'dj2', patternId: 'dijkstra' },
  { id: 'mst1', patternId: 'minimum-spanning-tree' },
  { id: 'mst2', patternId: 'minimum-spanning-tree' },
  { id: 'mst3', patternId: 'minimum-spanning-tree' },
  { id: 'tr1', patternId: 'tree-dfs' },
  { id: 'tr2', patternId: 'tree-dfs' },
  { id: 'tri1', patternId: 'trie' },
  { id: 'tri2', patternId: 'trie' },
  { id: 'd1a', patternId: 'dp-1d' },
  { id: 'd1b', patternId: 'dp-1d' },
  { id: 'd1c', patternId: 'dp-1d' },
  { id: 'd2a', patternId: 'dp-2d' },
  { id: 'd2b', patternId: 'dp-2d' },
  { id: 'g1', patternId: 'greedy' },
  { id: 'g2', patternId: 'greedy' },
  { id: 'bm1', patternId: 'bit-manipulation' },
  { id: 'bm2', patternId: 'bit-manipulation' },
] as const satisfies readonly DrillCardSummary[];

export type DrillCardId = (typeof DRILLS)[number]['id'];

export const DRILL_CATALOG: readonly DrillCardSummary<DrillCardId>[] = DRILLS;

/** Complexity facts as the review catalog sees them: which pattern each one is about, in curriculum order. */
export interface ComplexityFactSummary<Id extends string = string> {
  id: Id;
  patternId: string;
}

const FACTS = [
  { id: 'hash-pair', patternId: 'hashing' },
  { id: 'two-pointers', patternId: 'two-pointers' },
  { id: 'sliding-window', patternId: 'sliding-window' },
  { id: 'binary-search', patternId: 'binary-search' },
  { id: 'binary-search-answer', patternId: 'binary-search' },
  { id: 'prefix-queries', patternId: 'prefix-sum' },
  { id: 'monotonic-stack', patternId: 'monotonic-stack' },
  { id: 'list-reversal', patternId: 'linked-list-reversal' },
  { id: 'intervals-merge', patternId: 'intervals' },
  { id: 'heap-topk', patternId: 'heap' },
  { id: 'bfs-grid', patternId: 'bfs' },
  { id: 'subsets', patternId: 'dfs-backtracking' },
  { id: 'topo', patternId: 'topo-sort' },
  { id: 'union-find', patternId: 'union-find' },
  { id: 'dijkstra', patternId: 'dijkstra' },
  { id: 'kruskal', patternId: 'minimum-spanning-tree' },
  { id: 'prim', patternId: 'minimum-spanning-tree' },
  { id: 'trie', patternId: 'trie' },
  { id: 'lcs', patternId: 'dp-2d' },
  { id: 'tree-dfs', patternId: 'tree-dfs' },
] as const satisfies readonly ComplexityFactSummary[];

export type ComplexityFactId = (typeof FACTS)[number]['id'];

export const COMPLEXITY_CATALOG: readonly ComplexityFactSummary<ComplexityFactId>[] = FACTS;

/** How many template lines each pattern asks the learner to recall; clozes.ts must define exactly that many. */
export const CLOZE_COUNTS = {
  hashing: 1,
  'two-pointers': 1,
  'sliding-window': 2,
  'binary-search': 1,
  'prefix-sum': 1,
  'monotonic-stack': 1,
  'fast-slow': 1,
  'linked-list-reversal': 2,
  intervals: 2,
  heap: 2,
  bfs: 2,
  'dfs-backtracking': 2,
  'topo-sort': 2,
  'union-find': 2,
  dijkstra: 2,
  'minimum-spanning-tree': 2,
  'tree-dfs': 1,
  trie: 2,
  'dp-1d': 1,
  'dp-2d': 1,
  greedy: 2,
  'bit-manipulation': 1,
} as const satisfies Record<PatternId, number>;
