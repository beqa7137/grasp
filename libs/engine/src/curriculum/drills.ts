import { DRILL_CATALOG, type DrillCardId, type DrillCardSummary } from './catalog.js';

interface DrillCardDefinition {
  prompt: string;
  tell: string;
  distractors: [string, string, string];
}

export type DrillCard = DrillCardSummary & DrillCardDefinition;

const card = (prompt: string, tell: string, distractors: [string, string, string]): DrillCardDefinition => ({ prompt, tell, distractors });

const CARDS: Record<DrillCardId, DrillCardDefinition> = {
  h1: card(
    'Given a list of transaction amounts and a target refund, return two transactions that add up exactly to the refund. The list is unsorted.',
    'Unsorted + "pair that complements" → store each value and look up `target - x` in O(1).',
    ['two-pointers', 'binary-search', 'sliding-window'],
  ),
  h2: card(
    'Group a list of product codes so that codes containing exactly the same letters (in any order) land in the same bucket.',
    'Grouping by a canonical key (sorted letters or letter counts) → hash map of key → list.',
    ['trie', 'intervals', 'dfs-backtracking'],
  ),
  h3: card(
    'Find the length of the longest run of consecutive integers (like 7,8,9,10) that can be formed from an unsorted array, in O(n).',
    'O(n) forbids sorting. Put everything in a set and only start counting from numbers with no predecessor.',
    ['intervals', 'dp-1d', 'heap'],
  ),

  tp1: card(
    'Given a sorted array of heights, find two indices whose values sum to exactly K using O(1) extra space.',
    'Sorted + pair + O(1) space → move inward from both ends.',
    ['hashing', 'binary-search', 'sliding-window'],
  ),
  tp2: card(
    'Check whether a sentence reads the same forwards and backwards, ignoring punctuation and case.',
    'Palindrome → compare from both ends, skipping junk.',
    ['monotonic-stack', 'dp-1d', 'hashing'],
  ),
  tp3: card(
    'Choose two vertical walls from an array of wall heights to hold the most water between them.',
    'Area limited by the shorter wall → always move the shorter side inward.',
    ['monotonic-stack', 'greedy', 'dp-2d'],
  ),

  sw1: card(
    'Find the length of the longest stretch of a DNA string that contains at most 2 distinct bases.',
    'Longest contiguous range + "at most k distinct" → variable window with counts.',
    ['two-pointers', 'hashing', 'dp-1d'],
  ),
  sw2: card(
    'Given hourly sensor readings, report the maximum average over any 24 consecutive hours.',
    'Fixed-size contiguous window → add the new reading, subtract the one leaving.',
    ['prefix-sum', 'heap', 'dp-1d'],
  ),
  sw3: card(
    'Find the smallest substring of a log line that contains every character of a given pattern (with multiplicity).',
    'Shortest contiguous range satisfying a coverage condition → expand until valid, then shrink.',
    ['trie', 'two-pointers', 'dp-2d'],
  ),

  bs1: card(
    'Packages with given weights must ship in order within D days. Find the minimum truck capacity that makes this possible.',
    '"Minimum capacity such that it is feasible" + feasibility is monotonic → binary search on the answer.',
    ['greedy', 'dp-1d', 'heap'],
  ),
  bs2: card(
    'A sorted array was rotated at an unknown pivot (e.g. [30, 40, 5, 10, 20]). Find a value in O(log n).',
    'Sorted-ish + O(log n) → one half is always sorted; decide which side to keep.',
    ['two-pointers', 'hashing', 'monotonic-stack'],
  ),
  bs3: card(
    'Given a sorted list of timestamps, count how many events happened between time a and time b, for many queries.',
    'Sorted data + range boundaries → two lower-bound searches per query.',
    ['prefix-sum', 'sliding-window', 'intervals'],
  ),

  ps1: card(
    'Answer 100,000 queries of the form "total sales between day i and day j" on a fixed array.',
    'Many static range-sum queries → precompute running totals.',
    ['sliding-window', 'binary-search', 'heap'],
  ),
  ps2: card(
    'Count the number of contiguous subarrays whose sum equals K. The array contains negative numbers.',
    'Negatives break sliding windows. Count prefix sums in a map: how many earlier prefixes equal `current - K`?',
    ['sliding-window', 'two-pointers', 'dp-1d'],
  ),

  ms1: card(
    "For each day's temperature, how many days until a strictly warmer day?",
    '"Next greater to the right" for every element → decreasing stack of waiting indices.',
    ['heap', 'two-pointers', 'dp-1d'],
  ),
  ms2: card(
    'Find the largest rectangle that fits under a skyline given as bar heights.',
    'Each bar needs its nearest smaller bar on both sides → increasing stack.',
    ['two-pointers', 'dp-2d', 'greedy'],
  ),
  ms3: card(
    'Remove k digits from a number string to make the smallest possible number.',
    'Greedily drop a digit when a smaller one arrives after it → keep an increasing stack.',
    ['greedy', 'heap', 'dp-1d'],
  ),

  fs1: card(
    'Determine whether following next-pointers in a linked list ever loops, using O(1) memory.',
    'Cycle detection with no extra memory → tortoise and hare.',
    ['hashing', 'union-find', 'topo-sort'],
  ),
  fs2: card(
    'An array of n+1 integers holds values 1..n with exactly one repeated. Find it without modifying the array and in O(1) space.',
    'Treat value → index as a linked list; the duplicate is the cycle entrance.',
    ['bit-manipulation', 'binary-search', 'hashing'],
  ),

  iv1: card(
    'Given meeting times, what is the minimum number of rooms needed so no meetings clash?',
    'Overlapping time ranges → sort by start, track ends (sweep or min-heap).',
    ['greedy', 'dp-1d', 'topo-sort'],
  ),
  iv2: card(
    'Combine a list of possibly overlapping booking windows into the fewest non-overlapping windows.',
    'Merge overlapping ranges → sort by start and extend the last one.',
    ['union-find', 'greedy', 'prefix-sum'],
  ),

  hp1: card(
    'Stream millions of search queries and continuously report the 10 most frequent.',
    'Top-k from a large stream → size-k min-heap keyed by count.',
    ['trie', 'hashing', 'binary-search'],
  ),
  hp2: card(
    'Merge 500 sorted log files into one sorted output without loading everything into memory.',
    'k sorted sources → heap holding the current head of each.',
    ['two-pointers', 'intervals', 'dijkstra'],
  ),
  hp3: card(
    'Keep reporting the median of all numbers received so far as they arrive one by one.',
    'Running median → max-heap for the low half, min-heap for the high half.',
    ['binary-search', 'sliding-window', 'prefix-sum'],
  ),

  bf1: card(
    'In a maze grid, find the fewest moves from the entrance to the nearest exit.',
    'Fewest steps + unweighted moves → BFS; first arrival is optimal.',
    ['dfs-backtracking', 'dijkstra', 'dp-2d'],
  ),
  bf2: card(
    'Every minute, rotten oranges spoil their 4 neighbors. How many minutes until no fresh orange remains?',
    'Simultaneous spread from many sources → multi-source BFS, count levels.',
    ['dfs-backtracking', 'union-find', 'dp-2d'],
  ),
  bf3: card(
    'Transform one word into another by changing one letter at a time, with every intermediate word in a dictionary. Minimum number of changes?',
    'Implicit graph of words + fewest transformations → BFS.',
    ['dfs-backtracking', 'trie', 'dp-2d'],
  ),

  dfs1: card(
    'Generate every valid way to place N non-attacking queens on an N×N board.',
    'Enumerate all configurations with constraint pruning → backtracking.',
    ['bfs', 'dp-2d', 'greedy'],
  ),
  dfs2: card('Return all subsets of a set of up to 15 feature flags.', '"All subsets / combinations" → include/exclude recursion.', [
    'bit-manipulation',
    'dp-1d',
    'greedy',
  ]),
  dfs3: card(
    'Count the number of separate islands of land in a grid of land and water.',
    'Connected regions → flood fill each unvisited land cell.',
    ['dijkstra', 'topo-sort', 'dp-2d'],
  ),

  ts1: card(
    'Given course prerequisites as pairs, return an order to take all courses, or report it is impossible.',
    "Dependencies + ordering + cycle detection → Kahn's algorithm.",
    ['union-find', 'bfs', 'greedy'],
  ),
  ts2: card(
    'Given a sorted list of words in an unknown alphabet, recover the order of the letters.',
    'Adjacent words give "a before b" edges → topological order of letters.',
    ['trie', 'hashing', 'union-find'],
  ),

  uf1: card(
    'Friend connections arrive one at a time. After each, report how many separate friend circles exist.',
    'Dynamic merging + component count → union-find with a counter.',
    ['bfs', 'dfs-backtracking', 'topo-sort'],
  ),
  uf2: card(
    'An undirected graph that was a tree has one extra edge. Find the edge whose removal restores the tree.',
    'First edge whose endpoints are already connected creates the cycle.',
    ['topo-sort', 'fast-slow', 'dijkstra'],
  ),

  dj1: card(
    'A signal is sent from one server; links have different delays. How long until every server receives it?',
    'Non-negative weighted shortest paths from one source → Dijkstra.',
    ['bfs', 'topo-sort', 'greedy'],
  ),
  dj2: card(
    'Find the path through a height map that minimizes the largest single climb between adjacent cells.',
    'Minimize a path cost with a priority queue ordered by the bottleneck so far.',
    ['bfs', 'dp-2d', 'binary-search'],
  ),

  tr1: card(
    'Find the longest path between any two nodes in a binary tree.',
    'At each node combine left and right heights; track the best globally.',
    ['bfs', 'dp-1d', 'greedy'],
  ),
  tr2: card('Check whether a binary tree is a valid binary search tree.', 'Pass allowed (low, high) bounds down the recursion.', [
    'bfs',
    'binary-search',
    'two-pointers',
  ]),

  tri1: card(
    'Build a search box that suggests all stored product names starting with what the user has typed so far.',
    'Prefix queries over a dictionary → trie.',
    ['hashing', 'binary-search', 'heap'],
  ),
  tri2: card(
    'Find every word from a 10,000-word dictionary that can be traced through adjacent letters on a letter grid.',
    'Many words at once → walk the grid while walking a trie; prune dead prefixes.',
    ['bfs', 'hashing', 'dp-2d'],
  ),

  d1a: card(
    'You can climb 1 or 2 stairs at a time. In how many distinct ways can you reach step n?',
    'Ways(n) = Ways(n−1) + Ways(n−2) → 1-D recurrence.',
    ['greedy', 'dfs-backtracking', 'bfs'],
  ),
  d1b: card(
    'Pick non-adjacent houses along a street to maximize total loot.',
    'Choice at each index depends on the previous two best answers.',
    ['greedy', 'sliding-window', 'heap'],
  ),
  d1c: card(
    'Decide whether a string can be split into words from a dictionary.',
    '`ok[i]` = some `j < i` where `ok[j]` and `s[j..i)` is a word.',
    ['trie', 'dfs-backtracking', 'two-pointers'],
  ),

  d2a: card(
    'Compute the minimum number of single-character edits to turn one word into another.',
    'Two strings → `dp[i][j]` over prefixes of both.',
    ['two-pointers', 'bfs', 'greedy'],
  ),
  d2b: card(
    'Can a subset of these numbers sum exactly to a target? Numbers are positive and small.',
    'Items × target sum → 0/1 knapsack table.',
    ['dfs-backtracking', 'greedy', 'two-pointers'],
  ),

  g1: card(
    'Each array value is the max jump length from that position. Can you reach the last index?',
    'Track the furthest reachable index; one pass.',
    ['dp-1d', 'bfs', 'dfs-backtracking'],
  ),
  g2: card(
    'Gas stations sit on a circular route. Find the starting station from which you can complete the loop, if any.',
    'If the tank goes negative, no station in that stretch can be the start, so jump past it.',
    ['dp-1d', 'prefix-sum', 'two-pointers'],
  ),

  bm1: card('Every ID in a list appears exactly twice except one. Find it in O(n) time and O(1) space.', '`x ^ x = 0` → XOR everything.', [
    'hashing',
    'fast-slow',
    'binary-search',
  ]),
  bm2: card('For every number from 0 to n, return how many 1-bits it has.', '`bits[i]` = `bits[i >> 1] + (i & 1)`.', [
    'dp-2d',
    'hashing',
    'greedy',
  ]),
};

export const DRILL_CARDS: DrillCard[] = DRILL_CATALOG.map((summary) => ({ ...summary, ...CARDS[summary.id] }));

export function getCard(id: string): DrillCard | undefined {
  return DRILL_CARDS.find((c) => c.id === id);
}

/** Choices in a fresh order for every review, so the answer's position can't be memorized. */
export function cardChoices(c: DrillCard, rand: () => number = Math.random): { choices: string[]; answer: number } {
  const all = [c.patternId, ...c.distractors];
  for (let i = all.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [all[i], all[j]] = [all[j], all[i]];
  }
  return { choices: all, answer: all.indexOf(c.patternId) };
}
