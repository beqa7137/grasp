/**
 * Other names a learner searches by (REDESIGN.md 2.9), keyed `kind:id`: old and common titles, and the cue words that point
 * at a pattern or a competency. `npm run gen:search` folds them into the index; a spec checks every key names an item.
 */
export const SEARCH_ALIASES: Readonly<Record<string, readonly string[]>> = {
  'mock:shipping-capacity': ['Ship Within D Days'],
  'mock:longest-k-replace': ['Longest Repeating Run With K Changes'],
  'mock:url-shortener': ['Design a URL Shortener'],
  'mock:news-feed': ['Design a News Feed'],
  'mock:rate-limiter': ['Design a Distributed Rate Limiter'],
  'mock:chat-service': ['Design a Chat Service'],
  'problem:koko-bananas': ['Koko Eating Bananas'],
  'problem:daily-temperatures': ['Daily Temperatures'],
  'problem:subarray-sum-k': ['Subarray Sum Equals K'],
  'problem:zero-one-matrix': ['01 Matrix'],
  'problem:house-robber-tree': ['House Robber III'],
  'problem:pair-sum-sorted': ['Two Sum II'],
  'problem:three-sum': ['Three Sum'],
  'problem:four-sum-count': ['Four Sum II'],
  'problem:kth-largest-element': ['Kth Largest Element in an Array'],
  'visualizer:tree-traversal': ['Tree DFS'],
  'pattern:tree-dfs': ['Tree DFS'],
  'pattern:bfs': ['BFS'],
  'pattern:dp-1d': ['DP'],
  'pattern:minimum-spanning-tree': ['MST'],
  'visualizer:lcs': ['LCS'],
  'topic:sd-caching': ['Caching & CDNs'],
  'topic:sd-replication': ['Replication & Databases'],
};

/** Words in a problem statement that suggest its pattern, and words a behavioral question is asked with. */
export const CUE_WORDS: Readonly<Record<string, readonly string[]>> = {
  'pattern:binary-search': ['sorted'],
  'pattern:two-pointers': ['sorted'],
  'pattern:heap': ['k-th', 'top k'],
  'pattern:sliding-window': ['contiguous', 'subarray'],
  'pattern:prefix-sum': ['contiguous', 'subarray'],
  'pattern:topo-sort': ['prerequisites', 'dependencies'],
  'pattern:monotonic-stack': ['next greater'],
  'pattern:intervals': ['overlapping'],
  'pattern:fast-slow': ['cycle'],
  'pattern:dfs-backtracking': ['permutations', 'combinations'],
  'pattern:trie': ['prefix'],
  'pattern:union-find': ['connected components'],
  'pattern:dijkstra': ['weighted', 'shortest path'],
  'pattern:dp-2d': ['subsequence'],
  'pattern:bit-manipulation': ['xor'],
  'competency:conflict': ['disagree'],
  'competency:failure': ['mistake'],
  'competency:leadership': ['mentor'],
};
