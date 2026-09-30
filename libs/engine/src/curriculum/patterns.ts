import { PATTERN_CATALOG, type PatternId, type PatternSummary } from './catalog.js';

interface PatternDefinition {
  cues: string[];
  template: string[];
  complexity: string;
  pitfalls: string[];
}

export type Pattern = PatternSummary & PatternDefinition;

const DETAILS: Record<PatternId, PatternDefinition> = {
  hashing: {
    cues: ['"Have I seen this before?"', 'Counting / frequency', 'Pairs that complement each other', 'Grouping by a canonical key'],
    template: [
      'const seen = new Map();',
      'for (const [i, x] of nums.entries()) {',
      '  if (seen.has(need(x))) return [seen.get(need(x)), i];',
      '  seen.set(x, i);',
      '}',
    ],
    complexity: 'O(n) time, O(n) space',
    pitfalls: ['Inserting before checking (matches an element with itself)', 'Using objects as keys without a canonical form'],
  },
  'two-pointers': {
    cues: ['Sorted array + pair/triplet', 'Palindromes, reversing in place', 'Merging two sorted sequences', 'Partitioning in place'],
    template: ['let l = 0, r = n - 1;', 'while (l < r) {', '  if (good(l, r)) return [l, r];', '  if (tooSmall(l, r)) l++; else r--;', '}'],
    complexity: 'O(n) time, O(1) space',
    pitfalls: ['Forgetting to sort first', 'Skipping duplicates incorrectly in k-sum'],
  },
  'sliding-window': {
    cues: [
      'Longest / shortest contiguous subarray or substring',
      '"At most k" distinct / replacements',
      'Fixed-size window averages or sums',
    ],
    template: [
      'let left = 0;',
      'for (let right = 0; right < n; right++) {',
      '  add(a[right]);',
      '  while (!valid()) remove(a[left++]);',
      '  best = Math.max(best, right - left + 1);',
      '}',
    ],
    complexity: 'O(n) time, O(k) space',
    pitfalls: ['Negative numbers break "shrink when sum too big"', 'Updating the answer before the window is valid'],
  },
  'binary-search': {
    cues: ['Sorted input', '"Minimum capacity / speed / days such that…"', 'Rotated sorted array', 'Answer space is large but checkable'],
    template: [
      'let lo = min, hi = max;',
      'while (lo < hi) {',
      '  const mid = lo + ((hi - lo) >> 1);',
      '  if (feasible(mid)) hi = mid; else lo = mid + 1;',
      '}',
      'return lo;',
    ],
    complexity: 'O(log n) × cost of check',
    pitfalls: ['Off-by-one between `lo < hi` and `lo <= hi`', 'Infinite loop when mid rounds toward lo and you set `lo = mid`'],
  },
  'prefix-sum': {
    cues: ['Many range-sum queries', '"Subarray sums to k" (with a hash map of prefix counts)', '2-D region sums'],
    template: ['const pre = [0];', 'for (const x of a) pre.push(pre.at(-1) + x);', '// sum(i..j) = pre[j + 1] - pre[i]'],
    complexity: 'O(n) build, O(1) query',
    pitfalls: ['Off-by-one on the leading zero', 'Forgetting `count[0] = 1` when counting subarrays'],
  },
  'monotonic-stack': {
    cues: ['Next greater / smaller element', 'Days until a warmer temperature', 'Largest rectangle in a histogram', 'Stock span'],
    template: [
      'const stack = [];',
      'for (let i = 0; i < n; i++) {',
      '  while (stack.length && a[stack.at(-1)] < a[i]) resolve(stack.pop(), i);',
      '  stack.push(i);',
      '}',
    ],
    complexity: 'O(n): each index pushed and popped once',
    pitfalls: ['Storing values when you need indices', 'Strict vs non-strict comparison with duplicates'],
  },
  'fast-slow': {
    cues: ['Cycle in a linked list or functional graph', 'Middle of a linked list', '"Happy number"-style repeated transforms'],
    template: [
      'let slow = head, fast = head;',
      'while (fast?.next) {',
      '  slow = slow.next; fast = fast.next.next;',
      '  if (slow === fast) return true;',
      '}',
    ],
    complexity: 'O(n) time, O(1) space',
    pitfalls: ['Null checks on `fast.next`', 'Finding the cycle start needs a second phase'],
  },
  'linked-list-reversal': {
    cues: [
      'Reverse a linked list, or the part between two positions, in place',
      'Reverse every k nodes, or swap adjacent pairs',
      'Palindrome checks or reordering a list in O(1) space',
    ],
    template: [
      'let prev = null, curr = head;',
      'while (curr) {',
      '  const next = curr.next;',
      '  curr.next = prev;',
      '  prev = curr;',
      '  curr = next;',
      '}',
      'return prev;',
    ],
    complexity: 'O(n) time, O(1) space',
    pitfalls: [
      'Setting `curr.next` before saving it, which loses the rest of the list',
      'Off by one at the sublist edges: stop `before` on the node just before the sublist, at position `left - 1`',
      'Leaving the ends loose: link the old first node to the node after the sublist',
    ],
  },
  intervals: {
    cues: ['Meeting rooms / calendars', 'Merge overlapping ranges', 'Minimum arrows / removals to avoid overlap'],
    template: [
      'intervals.sort((a, b) => a[0] - b[0]);',
      'for (const [s, e] of intervals) {',
      '  if (s <= last[1]) last[1] = Math.max(last[1], e);',
      '  else out.push(last = [s, e]);',
      '}',
    ],
    complexity: 'O(n log n)',
    pitfalls: ['Sorting by end when you need start (or vice versa)', 'Touching endpoints: overlap or not?'],
  },
  heap: {
    cues: ['k largest / smallest / most frequent', 'Merge k sorted lists', 'Running median', 'Always process the cheapest next'],
    template: ['const heap = new MinHeap();', 'for (const x of stream) {', '  heap.push(x);', '  if (heap.size > k) heap.pop();', '}'],
    complexity: 'O(n log k)',
    pitfalls: ['Min-heap vs max-heap for top-k', 'Sorting everything when k ≪ n'],
  },
  bfs: {
    cues: ['Fewest steps / moves / transformations', 'Grid shortest path', 'Level-order traversal', 'Multi-source spread (rotting, fire)'],
    template: [
      'const q = [start]; seen.add(start);',
      'for (let d = 0; q.length; d++) {',
      '  for (let k = q.length; k > 0; k--) {',
      '    const u = q.shift();',
      '    for (const v of adj(u)) if (!seen.has(v)) { seen.add(v); q.push(v); }',
      '  }',
      '}',
    ],
    complexity: 'O(V + E)',
    pitfalls: ['Marking seen on dequeue instead of enqueue (duplicates in queue)', 'Using BFS on weighted edges'],
  },
  'dfs-backtracking': {
    cues: ['All subsets / permutations / combinations', 'N-Queens, Sudoku', 'Word search in a grid', 'Count connected regions'],
    template: [
      'function go(state) {',
      '  if (done(state)) { out.push(copy(state)); return; }',
      '  for (const c of choices(state)) {',
      '    apply(c); go(state); undo(c);',
      '  }',
      '}',
    ],
    complexity: 'Exponential; pruning is everything',
    pitfalls: ['Pushing a reference instead of a copy', 'Forgetting to undo'],
  },
  'topo-sort': {
    cues: ['Prerequisites / build order', '"Can all courses be finished?"', 'Alien dictionary ordering'],
    template: [
      'const q = nodes.filter((n) => indeg[n] === 0);',
      'while (q.length) {',
      '  const u = q.shift(); order.push(u);',
      '  for (const v of adj[u]) if (--indeg[v] === 0) q.push(v);',
      '}',
    ],
    complexity: 'O(V + E)',
    pitfalls: ['Edge direction reversed', 'Not checking `order.length === V` for cycles'],
  },
  'union-find': {
    cues: [
      'Dynamic connectivity',
      'Number of components as edges arrive',
      'Redundant connection / cycle in undirected graph',
      'Accounts merge',
    ],
    template: [
      'const find = (x) => (p[x] === x ? x : (p[x] = find(p[x])));',
      'const union = (a, b) => { a = find(a); b = find(b); if (a !== b) p[a] = b; };',
    ],
    complexity: 'O(α(n)) amortized',
    pitfalls: ['Skipping path compression / union by rank', 'Using it for directed graphs'],
  },
  dijkstra: {
    cues: ['Weighted shortest path / minimum cost', 'Network delay time', 'Cheapest route with constraints'],
    template: [
      'pq.push([0, src]);',
      'while (pq.size) {',
      '  const [d, u] = pq.pop();',
      '  if (d > dist[u]) continue;',
      '  for (const [v, w] of adj[u]) if (d + w < dist[v]) pq.push([dist[v] = d + w, v]);',
      '}',
    ],
    complexity: 'O((V + E) log V)',
    pitfalls: ['Negative weights (use Bellman-Ford)', 'Not skipping stale heap entries'],
  },
  'tree-dfs': {
    cues: ['Height, diameter, balanced?', 'Path sums', 'Lowest common ancestor', 'Validate / search a BST'],
    template: [
      'function dfs(node) {',
      '  if (!node) return base;',
      '  const l = dfs(node.left), r = dfs(node.right);',
      '  return combine(node, l, r);',
      '}',
    ],
    complexity: 'O(n)',
    pitfalls: ['Returning one thing but needing two (global vs local answer)', 'BST validation with only parent comparison'],
  },
  trie: {
    cues: ['Autocomplete / prefix search', 'Word search with many words', 'Longest common prefix across many strings'],
    template: ['let node = root;', 'for (const ch of word) node = node[ch] ??= {};', 'node.end = true;'],
    complexity: 'O(L) per operation',
    pitfalls: ['Memory blow-up with large alphabets', 'Forgetting the end-of-word marker'],
  },
  'dp-1d': {
    cues: ['"Number of ways" to reach n', 'Max/min with choices at each step (rob, jump, climb)', 'Decode / partition a string'],
    template: [
      'const dp = Array(n + 1).fill(0);',
      'dp[0] = base;',
      'for (let i = 1; i <= n; i++) dp[i] = best(dp[i - 1], dp[i - 2] + a[i]);',
    ],
    complexity: 'O(n) typically',
    pitfalls: ['Unclear state definition', 'Not compressing to O(1) space when only last two states matter'],
  },
  'dp-2d': {
    cues: ['Edit distance / LCS between two strings', 'Unique paths in a grid', 'Pick items under a budget / target sum'],
    template: [
      'for (let i = 1; i <= n; i++)',
      '  for (let j = 1; j <= m; j++)',
      '    dp[i][j] = a[i - 1] === b[j - 1] ? dp[i - 1][j - 1] + 1 : Math.max(dp[i - 1][j], dp[i][j - 1]);',
    ],
    complexity: 'O(n × m)',
    pitfalls: ['Iterating capacity the wrong direction in 0/1 knapsack', 'Base row/column'],
  },
  greedy: {
    cues: [
      'Can you reach the end? (jump game)',
      'Gas station circuit',
      'Fewest coins with canonical denominations',
      'Assign cookies / tasks',
    ],
    template: [
      'let reach = 0;',
      'for (let i = 0; i < n; i++) {',
      '  if (i > reach) return false;',
      '  reach = Math.max(reach, i + a[i]);',
      '}',
    ],
    complexity: 'Usually O(n) or O(n log n)',
    pitfalls: ['No exchange argument → probably needs DP'],
  },
  'bit-manipulation': {
    cues: ['Every number appears twice except one', 'Count set bits', 'Enumerate subsets of a small set', 'Sum without `+`'],
    template: ['let x = 0;', 'for (const n of nums) x ^= n;', 'return x;'],
    complexity: 'O(n), O(1) space',
    pitfalls: ['Sign bit and `>>` vs `>>>` in JavaScript'],
  },
};

// algorithmIds stays last, where the curriculum API has always served it.
export const PATTERNS: Pattern[] = PATTERN_CATALOG.map(({ algorithmIds, ...summary }) => ({
  ...summary,
  ...DETAILS[summary.id],
  algorithmIds,
}));

export function getPattern(id: string): Pattern | undefined {
  return PATTERNS.find((p) => p.id === id);
}
