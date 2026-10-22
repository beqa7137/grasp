import { COMPLEXITY_CATALOG, type ComplexityFactId, type ComplexityFactSummary } from './catalog.js';

interface ComplexityFactDefinition {
  question: string;
  answer: string;
  distractors: [string, string, string];
  why: string;
}

export type ComplexityFact = ComplexityFactSummary & ComplexityFactDefinition;

const FACTS: Record<ComplexityFactId, ComplexityFactDefinition> = {
  'hash-pair': {
    question: 'Pair sum on an unsorted array using a hash map: time and extra space?',
    answer: 'O(n) time, O(n) space',
    distractors: ['O(n²) time, O(1) space', 'O(n log n) time, O(1) space', 'O(n) time, O(1) space'],
    why: 'One pass with O(1) average lookups, paid for with a map that can hold every element.',
  },
  'two-pointers': {
    question: 'Pair sum on a sorted array with two pointers: time and extra space?',
    answer: 'O(n) time, O(1) space',
    distractors: ['O(n²) time, O(1) space', 'O(n log n) time, O(n) space', 'O(n) time, O(n) space'],
    why: 'Every step discards one index for good, so at most n − 1 steps, using only two integers.',
  },
  'sliding-window': {
    question: 'Longest substring without repeats via a sliding window. The inner while loop looks nested, but what is the time?',
    answer: 'O(n)',
    distractors: ['O(n²)', 'O(n log n)', 'O(n · k) for k distinct characters'],
    why: 'Amortized: each character enters the window once and leaves at most once, so total pointer moves ≤ 2n.',
  },
  'binary-search': {
    question: 'Binary search on a sorted array of n elements: time?',
    answer: 'O(log n)',
    distractors: ['O(n)', 'O(√n)', 'O(n log n)'],
    why: 'Each comparison halves the range: n → n/2 → … → 1 takes about log₂ n steps.',
  },
  'binary-search-answer': {
    question: 'Binary search on the answer: range [lo, hi], each feasibility check costs O(n). Total time?',
    answer: 'O(n · log(hi − lo))',
    distractors: ['O(log n)', 'O(n · (hi − lo))', 'O(n log n)'],
    why: 'log(hi − lo) halvings of the answer range, each paying one O(n) check.',
  },
  'prefix-queries': {
    question: 'Build prefix sums over n numbers, then answer q range-sum queries. Total time?',
    answer: 'O(n + q)',
    distractors: ['O(n · q)', 'O(q log n)', 'O(n log n + q)'],
    why: 'One O(n) pass to build, then each query is a single subtraction.',
  },
  'monotonic-stack': {
    question: 'Next greater element for all n values with a monotonic stack: time?',
    answer: 'O(n)',
    distractors: ['O(n²)', 'O(n log n)', 'O(n · stack height)'],
    why: 'Amortized: each index is pushed once and popped at most once.',
  },
  'list-reversal': {
    question: 'Reverse a singly linked list of n nodes in place with prev, curr and next: time and extra space?',
    answer: 'O(n) time, O(1) space',
    distractors: ['O(n) time, O(n) space', 'O(n²) time, O(1) space', 'O(n log n) time, O(1) space'],
    why: 'Each node is visited once and its link turned in O(1), with three pointers whatever n is. Copying the values to an array, or recursing, would take O(n) space.',
  },
  'intervals-merge': {
    question: 'Merge n overlapping intervals: time?',
    answer: 'O(n log n)',
    distractors: ['O(n)', 'O(n²)', 'O(log n)'],
    why: 'Sorting dominates; the merge sweep afterwards is linear.',
  },
  'heap-topk': {
    question: 'Top-k largest of n streamed values with a size-k heap: time?',
    answer: 'O(n log k)',
    distractors: ['O(n log n)', 'O(k log n)', 'O(n · k)'],
    why: 'Each of n values costs at most one push and one pop on a heap that never exceeds k.',
  },
  'bfs-grid': {
    question: 'BFS shortest path on an R × C grid: time?',
    answer: 'O(R · C)',
    distractors: ['O((R · C)²)', 'O(R + C)', 'O(R · C · log(R · C))'],
    why: 'Every cell is enqueued at most once and checks 4 neighbors: O(V + E) with V = R·C, E ≈ 4V.',
  },
  subsets: {
    question: 'Generate every subset of n items: time?',
    answer: 'O(n · 2ⁿ)',
    distractors: ['O(n²)', 'O(n!)', 'O(2ⁿ / n)'],
    why: '2ⁿ subsets, and copying each one into the output costs up to O(n).',
  },
  topo: {
    question: "Topological sort with Kahn's algorithm on V nodes and E edges: time?",
    answer: 'O(V + E)',
    distractors: ['O(V · E)', 'O(V²)', 'O((V + E) log V)'],
    why: 'Each node is dequeued once and each edge decrements one in-degree once.',
  },
  'union-find': {
    question: 'm find/union operations with path compression and union by rank: time?',
    answer: 'O(m · α(n)), effectively O(m)',
    distractors: ['O(m · n)', 'O(m · √n)', 'O(n²)'],
    why: 'α is the inverse Ackermann function: below 5 for any n that fits in the universe.',
  },
  dijkstra: {
    question: 'Dijkstra with a binary heap on V nodes and E edges: time?',
    answer: 'O((V + E) log V)',
    distractors: ['O(V + E)', 'O(V · E)', 'O(E²)'],
    why: 'Up to E heap pushes and pops, each O(log V) (log E ≤ 2 log V).',
  },
  kruskal: {
    question: 'Kruskal on V nodes and E edges, sorting the edges and then using union-find: time?',
    answer: 'O(E log E)',
    distractors: ['O(V + E)', 'O(V · E)', 'O(E²)'],
    why: 'Sorting dominates. After it, each find and union is nearly O(1) with path compression and union by rank. O(E log E) is the same as O(E log V), since E ≤ V² makes log E ≤ 2 log V.',
  },
  prim: {
    question: 'Prim with a binary heap on V nodes and E edges: time?',
    answer: 'O(E log V)',
    distractors: ['O(V + E)', 'O(V · E)', 'O(V² · E)'],
    why: 'Each edge pushes at most one heap entry, and each push or pop costs O(log E) = O(log V). On a dense graph, a plain array of distances gives O(V²) instead.',
  },
  trie: {
    question: 'Insert or look up a word of length L in a trie that already holds N words: time?',
    answer: 'O(L)',
    distractors: ['O(N)', 'O(L · N)', 'O(log N)'],
    why: 'You walk one node per character; the number of stored words does not matter.',
  },
  lcs: {
    question: 'Longest common subsequence of strings of length n and m with a DP table: time?',
    answer: 'O(n · m)',
    distractors: ['O(n + m)', 'O(2ⁿ⁺ᵐ)', 'O(n · m · min(n, m))'],
    why: 'n · m states, each computed in O(1) from three neighbors.',
  },
  'bitmask-route': {
    question: 'Bitmask DP over (mask, last) for the shortest route through all n nodes: time, as a tight bound?',
    answer: 'O(2ⁿ · n²)',
    distractors: ['O(n!)', 'O(2ⁿ · n)', 'O(n² · log n)'],
    why: '2ⁿ masks times n last nodes is 2ⁿ · n states, and each tries up to n next nodes. Trying every order would be n!.',
  },
  submasks: {
    question: 'For every mask of n items, loop over its submasks with `sub = (sub - 1) & mask`. Total steps, as a tight bound?',
    answer: 'O(3ⁿ)',
    distractors: ['O(4ⁿ)', 'O(2ⁿ · n)', 'O(n · 3ⁿ)'],
    why: 'Each item is in sub, in mask but not sub, or outside mask: 3 choices per item, so 3ⁿ pairs in all, far fewer than the 4ⁿ pairs of any two masks.',
  },
  'tree-dfs': {
    question: 'Height of a binary tree with n nodes by recursive DFS: extra space in the worst case?',
    answer: 'O(n) for a degenerate (list-like) tree',
    distractors: ['O(1)', 'O(log n) always', 'O(n²)'],
    why: 'Space is the recursion depth = tree height, which is log n only when balanced.',
  },
};

export const COMPLEXITY_FACTS: ComplexityFact[] = COMPLEXITY_CATALOG.map((summary) => ({ ...summary, ...FACTS[summary.id] }));
