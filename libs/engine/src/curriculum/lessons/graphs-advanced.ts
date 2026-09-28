import type { Lesson } from './types.js';

export const GRAPHS_ADVANCED_LESSONS: Record<
  | 'bfs'
  | 'dfs-backtracking'
  | 'topo-sort'
  | 'union-find'
  | 'dijkstra'
  | 'tree-dfs'
  | 'trie'
  | 'dp-1d'
  | 'dp-2d'
  | 'greedy'
  | 'bit-manipulation',
  Lesson
> = {
  bfs: {
    why: 'A FIFO queue hands out nodes in order of distance: every node at distance `d` leaves the queue before any node at `d + 1`. So the first time BFS discovers a node, it has found a shortest path to it in an unweighted graph. Marking a node seen when it is enqueued means each node enters the queue once, so the whole search is O(V + E).',
    examples: [
      {
        title: 'Shortest path in a maze',
        problem:
          'In the grid `S.#.` / `.#..` / `...G`, move up, down, left or right through open cells. What is the fewest number of moves from S at (0,0) to G at (2,3)?',
        insight: 'Every move costs the same, so BFS rings of equal distance reach G first along a shortest route.',
        steps: [
          'Start with the queue holding (0,0) at distance 0 and mark it seen.',
          'Dequeue (0,0): its open neighbors (0,1) and (1,0) join the queue at distance 1.',
          'Dequeue (0,1): (0,2) and (1,1) are walls, so it is a dead end. Dequeue (1,0): it adds (2,0) at distance 2.',
          'The bottom corridor follows: (2,0) adds (2,1) at 3, and (2,1) adds (2,2) at 4.',
          'Dequeue (2,2): it adds (1,2) and the goal (2,3), both at distance 5. (1,2) comes out first and adds (1,3) at 6.',
          'Dequeue the goal at distance 5 and return 5. Every cell at distance 4 or less was already expanded, so no shorter route exists.',
        ],
        visualize: { algorithmId: 'grid-bfs', input: { grid: ['S.#.', '.#..', '...G'] } },
      },
      {
        title: 'Rotting oranges',
        problem:
          'In the grid with rows `2 1 1`, `1 1 0` and `0 1 1`, 2 is rotten, 1 is fresh and 0 is empty. Each minute, rot spreads to fresh oranges up, down, left and right. How many minutes until none are fresh?',
        insight: 'Seed the queue with every rotten orange at minute 0 and process one ring per minute: multi-source BFS.',
        steps: [
          'Minute 0: the queue holds the only rotten orange, (0,0). There are 6 fresh oranges.',
          'Minute 1: (0,0) rots (0,1) and (1,0). 4 fresh remain.',
          'Minute 2: (0,1) rots (0,2) and (1,1); (1,0) has no fresh neighbor left. 2 fresh remain.',
          'Minute 3: (1,1) rots (2,1); (0,2) sits next to the empty cell (1,2). 1 fresh remains.',
          'Minute 4: (2,1) rots (2,2). The fresh count hits 0, so the answer is 4. Had it stayed above 0, the answer would be -1.',
        ],
      },
      {
        title: 'Word ladder',
        problem:
          'Change `hit` into `cog` one letter at a time, where every intermediate word must be one of `hot`, `dot`, `dog`, `lot`, `log` or `cog`. How many words are in the shortest sequence?',
        insight: 'Words are nodes and one-letter changes are edges, so the shortest sequence is a BFS distance.',
        steps: [
          'Level 1 is `hit`. Its only neighbor in the list is `hot`, which becomes level 2.',
          'From `hot`, changing the first letter reaches `dot` and `lot`: level 3.',
          'From `dot` we reach `dog`; from `lot` we reach `log`: level 4. Remove words from the set as they are enqueued so none is visited twice.',
          'From `dog` we reach `cog`, the target, at level 5. The answer is 5: `hit`, `hot`, `dot`, `dog`, `cog`.',
        ],
      },
    ],
    variations: [
      {
        name: 'Multi-source BFS',
        how: 'Push every source (all rotten oranges, all gates, all zeros) at distance 0 before the loop starts. The rest of the template is unchanged.',
      },
      {
        name: '0-1 BFS',
        how: 'When edges weigh 0 or 1, use a deque: push a node reached by a 0 edge to the front and by a 1 edge to the back. It keeps distance order in O(V + E) without a heap.',
      },
      {
        name: 'Bidirectional BFS',
        how: 'Run BFS from the start and the goal at once, always expanding the smaller frontier, and stop when they meet. With branching factor b this cuts the work from about `b^d` to `2·b^(d/2)`.',
      },
    ],
    followUps: [
      {
        question: 'What is the complexity on an R by C grid?',
        answer:
          'O(R·C) time and space: each cell is enqueued at most once and checks four neighbors, and the queue plus the seen set hold at most every cell.',
      },
      {
        question: 'Why not use DFS for the shortest path?',
        answer:
          'DFS finds some path, not the shortest one. To be sure it would have to try every path, which is exponential. BFS gets the shortest one on first arrival because it expands by distance.',
      },
      {
        question: 'How do you return the path itself, not just its length?',
        answer:
          'When you enqueue a neighbor, record `parent[next] = cell`. After reaching the goal, follow parents back to the start and reverse the list.',
      },
    ],
  },

  'dfs-backtracking': {
    why: 'Every candidate answer is one root-to-leaf path in a decision tree where each level makes one choice, so a recursive walk visits each candidate exactly once. Undoing a choice after the recursive call restores the shared state, so every sibling branch starts from the same place. Pruning a partial state that cannot succeed skips its whole subtree, which is where the speed comes from.',
    examples: [
      {
        title: 'Subsets',
        problem: 'List every subset of `[3, 5, 8]`, including the empty one.',
        insight: 'Each number is a take-or-skip decision, so the subsets are the 8 leaves of a depth-3 binary tree.',
        steps: [
          '`go(0)` takes 3, `go(1)` takes 5, `go(2)` takes 8. At depth 3 every number is decided, so record a copy: `[3, 5, 8]`.',
          'Back in `go(2)`: pop 8 and take the skip branch, recording `[3, 5]`.',
          'Back in `go(1)`: pop 5 and skip it. With path `[3]`, `go(2)` records `[3, 8]` and then `[3]`.',
          'Back in `go(0)`: pop 3 and skip it. The same shape runs on the empty path and records `[5, 8]`, `[5]`, `[8]` and `[]`.',
          'That is 8 = 2^3 subsets. Copying each one costs up to n, so the total is O(n·2^n).',
        ],
        visualize: { algorithmId: 'subsets-backtracking', input: { nums: [3, 5, 8] } },
      },
      {
        title: 'Combination sum',
        problem: 'Using `[2, 3, 5]` with unlimited reuse, list every combination that sums to 8.',
        insight: 'Recurse with the same start index to allow reuse, and never go back to earlier numbers so each combination appears once.',
        steps: [
          'Take 2 four times: 2, 4, 6, 8. Remaining is 0, so record `[2, 2, 2, 2]`.',
          'Undo the last 2 (remaining 2). 3 and 5 exceed it, and the list is sorted, so break. Undo again to `[2, 2]` with remaining 4.',
          'From `[2, 2]`, try 3: remaining 1, dead end. Undo to `[2]` with remaining 6 and try 3, then 3 again: record `[2, 3, 3]`.',
          'From `[2, 3]` try 5: it exceeds the remaining 3, so prune. From `[2]` try 5: remaining 1, dead end.',
          'Start from 3 (never 2 again): `[3, 3]` leaves remaining 2, and 3 is too big, so it is a dead end. `[3, 5]` hits 8, recorded. Starting from 5 leaves 3, which no allowed number fits. The answer is `[2,2,2,2]`, `[2,3,3]`, `[3,5]`.',
        ],
      },
      {
        title: 'Word search',
        problem: 'In the board `ABCE` / `SFCS` / `ADEE`, can you spell `ABCCED` by moving up, down, left or right without reusing a cell?',
        insight: 'DFS from each cell matching the first letter, marking the cell used before recursing and restoring it after.',
        steps: [
          'Scan for `A`: start at (0,0) and mark it used.',
          'Need `B`: the neighbor (0,1) matches. Need `C`: (0,2) matches.',
          'Need the second `C`: (1,2) below matches. The used mark stops the walk from reusing (0,2).',
          'Need `E`: (2,2) below matches. Need `D`: (2,1) to its left matches.',
          'All 6 letters matched, so return true. On any failure, unmark the cell as the call returns so other paths may use it.',
        ],
      },
    ],
    variations: [
      {
        name: 'Permutations',
        how: 'Instead of a start index, loop over all numbers and skip those marked in a `used` array; set the mark before recursing and clear it after.',
      },
      {
        name: 'Input with duplicates',
        how: 'Sort first, then at each depth skip `nums[i]` when `i > start` and it equals `nums[i - 1]`, so equal values open only one branch.',
      },
      {
        name: 'Constraint pruning (N-Queens)',
        how: 'Place one queen per row and keep sets of used columns and diagonals, keyed by `r - c` and `r + c`, so each check is O(1) and bad branches die at once.',
      },
    ],
    followUps: [
      {
        question: 'What are the time and space of subsets and permutations?',
        answer:
          'Subsets: O(n·2^n) time for 2^n leaves copied at O(n) each. Permutations: O(n·n!). Space is O(n) for the recursion and path, plus the output.',
      },
      {
        question: 'Why push a copy of the path instead of the path itself?',
        answer:
          'The path is one array that keeps being modified. Pushing it directly stores the same reference many times, and they all end up empty after the last undo.',
      },
      {
        question: 'Could you generate subsets without recursion?',
        answer:
          'Yes, with bitmasks: for each `mask` from 0 to `2^n - 1`, include `nums[i]` when bit i is set. Same O(n·2^n), no call stack.',
      },
    ],
  },

  'topo-sort': {
    why: 'A node with in-degree 0 has no unmet prerequisite, so placing it next can never break an edge, and removing it only lowers the in-degrees of the nodes after it. Each edge is decremented exactly once, so the order takes O(V + E). Nodes on a cycle wait on each other and never reach in-degree 0, so an order shorter than V proves a cycle.',
    examples: [
      {
        title: 'Course schedule II',
        problem:
          'There are 4 courses and `[a, b]` means take b before a: `[1,0]`, `[2,0]`, `[3,1]` and `[3,2]`. Return a valid order to take all of them.',
        insight: 'Turn each `[a, b]` into an edge `b > a` and repeatedly take a course with no remaining prerequisites.',
        steps: [
          'Edges are `0>1`, `0>2`, `1>3`, `2>3`. In-degrees are 0, 1, 1, 2, so only course 0 starts in the queue.',
          'Take 0. Courses 1 and 2 drop to in-degree 0 and join the queue.',
          'Take 1. Course 3 drops from 2 to 1: it still waits on course 2.',
          'Take 2. Course 3 drops to 0 and joins the queue. Take 3.',
          'The order `[0, 1, 2, 3]` has all 4 courses, so it is valid. `[0, 2, 1, 3]` would be too.',
        ],
        visualize: {
          algorithmId: 'topo-sort',
          input: {
            n: 4,
            edges: [
              [0, 1],
              [0, 2],
              [1, 3],
              [2, 3],
            ],
          },
        },
      },
      {
        title: 'Course schedule (can you finish?)',
        problem: 'There are 3 courses with prerequisites `[[1,0],[2,1],[1,2]]`. Can all of them be finished?',
        insight: 'Run the same algorithm and compare the length of the order with the number of courses.',
        steps: [
          'Edges are `0>1`, `1>2`, `2>1`. In-degrees are 0, 2, 1, so the queue starts with course 0.',
          'Take 0. Course 1 drops from 2 to 1: it still waits on course 2.',
          'The queue is empty. Course 1 waits on 2 and course 2 waits on 1, so neither can ever reach 0.',
          'The order `[0]` holds 1 of 3 courses, so there is a cycle and the answer is false.',
        ],
        visualize: {
          algorithmId: 'topo-sort',
          input: {
            n: 3,
            edges: [
              [0, 1],
              [1, 2],
              [2, 1],
            ],
          },
        },
      },
      {
        title: 'Alien dictionary',
        problem: 'The words `wrt`, `wrf`, `er`, `ett`, `rftt` are sorted in an unknown alphabet. Recover the letter order.',
        insight: 'The first differing letter of each adjacent pair gives one edge; a topological order of the letters is the alphabet.',
        steps: [
          '`wrt` vs `wrf` differ first at t and f: edge `t>f`. `wrf` vs `er`: edge `w>e`.',
          '`er` vs `ett`: edge `r>t`. `ett` vs `rftt`: edge `e>r`.',
          'Among the letters w, e, r, t, f, only w has in-degree 0, so it goes first.',
          'Removing w frees e, then r, then t, then f. The alphabet is `wertf`.',
          'Guard the edge case: if a word is followed by its own proper prefix, like `abc` before `ab`, the input is invalid.',
        ],
      },
    ],
    variations: [
      {
        name: 'DFS order',
        how: 'Run DFS and append each node after all its descendants finish; the reversed list is a topological order. Three colors (unvisited, on stack, done) detect a cycle when you reach an on-stack node.',
      },
      {
        name: 'Smallest order first',
        how: 'Replace the queue with a min-heap to get the lexicographically smallest order, at O((V + E) log V).',
      },
      {
        name: 'Minimum semesters',
        how: 'Process the queue one level at a time, taking every ready course together; the number of levels is the fewest semesters, or -1 if a cycle leaves courses behind.',
      },
    ],
    followUps: [
      {
        question: 'How do you detect a cycle?',
        answer:
          'After the loop, check `order.length === n`. Anything shorter means the leftover nodes sit on or behind a cycle, since their in-degree never reached 0.',
      },
      {
        question: 'When is the topological order unique?',
        answer:
          'Exactly when the queue never holds more than one node. Then consecutive nodes in the order are joined by edges, forming a path through every node.',
      },
      {
        question: 'What are the time and space costs?',
        answer: 'O(V + E) for both: building the adjacency lists and in-degrees touches each edge once, and each node is enqueued once.',
      },
    ],
  },

  'union-find': {
    why: 'Each group is a tree whose root names it: `find` follows parent links to the root, and `union` hangs one root under the other, so two elements are connected exactly when they share a root. Path compression flattens every path it walks, and union by rank keeps trees shallow, which together make each operation O(α(n)) amortized, effectively constant.',
    examples: [
      {
        title: 'Number of connected components',
        problem: 'With 5 nodes and undirected edges `[[0,1],[1,2],[3,4]]`, how many connected components are there?',
        insight: 'Start with 5 components and subtract one for every edge that joins two different roots.',
        steps: [
          'Every node is its own root: `parent = [0,1,2,3,4]`, 5 components.',
          'Edge 0-1: roots 0 and 1 differ with equal rank, so hang 1 under 0 and raise 0 to rank 1. 4 components.',
          'Edge 1-2: `find(1)` is 0 and `find(2)` is 2. Root 0 has the higher rank, so 2 goes under 0. 3 components.',
          'Edge 3-4: roots 3 and 4 differ, so hang 4 under 3. 2 components.',
          'No edges left: the answer is 2, the groups `{0, 1, 2}` and `{3, 4}`.',
        ],
        visualize: {
          algorithmId: 'union-find',
          input: {
            n: 5,
            edges: [
              [0, 1],
              [1, 2],
              [3, 4],
            ],
          },
        },
      },
      {
        title: 'Redundant connection',
        problem:
          'A tree on nodes 1 to 5 got one extra edge, giving the edges 1-2, 2-3, 3-4, 1-4 and 1-5 in that order. Return the edge that closes the cycle.',
        insight: 'An edge whose two ends already share a root would close a cycle.',
        steps: [
          'Edge 1-2 joins two separate roots. Union them.',
          'Edge 2-3 joins 3 to the group of 1 and 2; edge 3-4 adds 4 to it.',
          'Edge 1-4: `find(1)` and `find(4)` return the same root, so 1 and 4 are already connected.',
          'Adding it would close the cycle 1-2-3-4-1, so return `[1, 4]`. Edge 1-5 never needs checking.',
        ],
      },
      {
        title: 'Accounts merge',
        problem: 'Accounts are John `[a, b]`, John `[b, c]` and Mary `[d]`, where letters are emails. Merge accounts that share an email.',
        insight: 'Union all emails within one account; emails with a common root belong to one person.',
        steps: [
          'Account 1 unions a with b.',
          'Account 2 unions b with c. Since b already shares a root with a, now a, b and c share one root.',
          'Account 3 has only d, which stays its own root.',
          'Group emails by root and attach the owner name: John `[a, b, c]` and Mary `[d]`.',
        ],
      },
    ],
    variations: [
      {
        name: 'Union by size',
        how: 'Keep `size[root]` and hang the smaller tree under the larger, adding sizes. The largest group is then a running max, as in largest component questions.',
      },
      {
        name: 'Weighted union-find',
        how: 'Store a weight to the parent, such as the ratio `x / parent[x]`, and multiply weights while compressing. This answers queries like Evaluate Division.',
      },
      {
        name: 'Grids',
        how: 'Map cell (r, c) to `r * cols + c`. For islands added one at a time, add 1 per new land cell and subtract 1 per successful union with a land neighbor.',
      },
    ],
    followUps: [
      {
        question: 'Why do you need path compression and union by rank?',
        answer:
          'Without them, unions can build a chain, and `find` degrades to O(n). Each alone gives O(log n) amortized; together they give O(α(n)), under 5 for any real input.',
      },
      {
        question: 'When would you use BFS or DFS instead?',
        answer:
          'For a fixed graph with one question, DFS is just as fast and simpler. Union-find wins when edges arrive over time and connectivity queries interleave with them.',
      },
      {
        question: 'Can union-find delete an edge or work on directed graphs?',
        answer:
          'No. It only merges, and it models symmetric connectivity. For deletions, process the operations offline in reverse so they become unions; for directed reachability, use DFS or topological methods.',
      },
    ],
  },

  dijkstra: {
    why: 'Dijkstra always settles the unsettled node with the smallest tentative distance. Because edge weights are non-negative, any other route to that node must pass through a node that is at least as far away, so no later path can be shorter. Each node is settled once and each edge relaxed once, giving O((V + E) log V) with a heap.',
    examples: [
      {
        title: 'Network delay time',
        problem:
          'A signal starts at node 0 of 5 nodes joined by two-way roads `0-1:4`, `0-2:1`, `2-1:2`, `1-3:1`, `2-3:5`, `3-4:3` (weight is travel time). How long until every node has it?',
        insight: 'The answer is the largest shortest-path distance from node 0, which Dijkstra computes for all nodes at once.',
        steps: [
          'Set `dist[0] = 0` and push `(0, node 0)`. Pop it and relax: `dist[1] = 4`, `dist[2] = 1`.',
          'Pop node 2 at 1, the closest. Via 2, node 1 costs 1 + 2 = 3, beating 4, and node 3 costs 1 + 5 = 6.',
          'Pop node 1 at 3. Via 1, node 3 costs 3 + 1 = 4, beating 6. The old entry `(4, node 1)` is now stale.',
          'Pop `(4, node 1)`: 4 is greater than `dist[1] = 3`, so skip it. Pop node 3 at 4 and set `dist[4] = 7`. Skip the stale `(6, node 3)` too.',
          'Pop node 4 at 7. The heap is empty and `dist = [0, 3, 1, 4, 7]`. Every node is reachable, so the answer is the maximum, 7.',
        ],
        visualize: {
          algorithmId: 'dijkstra',
          input: {
            n: 5,
            edges: [
              [0, 1, 4],
              [0, 2, 1],
              [2, 1, 2],
              [1, 3, 1],
              [2, 3, 5],
              [3, 4, 3],
            ],
            source: 0,
          },
        },
      },
      {
        title: 'Path with minimum effort',
        problem:
          'In the height grid with rows `1 2 2`, `3 8 2` and `5 3 5`, a path costs its largest height difference between neighboring cells. Find the cheapest path cost from top-left to bottom-right.',
        insight: 'Replace `d + w` with `max(d, w)`: the cost still never decreases along a path, so Dijkstra stays correct.',
        steps: [
          'Pop (0,0) at 0. Right (0,1) costs `max(0, 1) = 1`; down (1,0) costs `max(0, 2) = 2`.',
          'Pop (0,1) at 1: down to (1,1) costs `max(1, 6) = 6`. Pop (0,2) at 1, then (1,2) at 1. From (1,2), down to (2,2) costs `max(1, 3) = 3`.',
          'Pop (1,0) at 2. Down to (2,0) costs `max(2, 2) = 2`; right to (1,1) improves from 6 to `max(2, 5) = 5`.',
          'Pop (2,0) at 2: (2,1) costs 2. Pop (2,1) at 2: (2,2) improves from 3 to `max(2, 2) = 2`.',
          'Pop (2,2) at 2 and stop: the answer is 2, along 1, 3, 5, 3, 5.',
        ],
      },
    ],
    variations: [
      {
        name: 'Extra state',
        how: 'For limits like at most K stops, make the heap state `(cost, node, stops)` and track the best cost per (node, stops) pair, since a cheaper path with more stops does not dominate.',
      },
      {
        name: 'Bottleneck cost',
        how: 'When a path costs its worst edge (minimum effort, swim in rising water), relax with `max(d, w)` instead of `d + w`. Any monotone combine works.',
      },
      {
        name: 'Single target',
        how: 'When only one destination matters, return as soon as it is popped: its distance is already final.',
      },
    ],
    followUps: [
      {
        question: 'What if some edge weights are negative?',
        answer:
          'Dijkstra can settle a node too early. Use Bellman-Ford: relax all edges V - 1 times in O(V·E); if a V-th pass still improves something, there is a negative cycle.',
      },
      {
        question: 'Why push duplicates and skip stale entries instead of decreasing a key?',
        answer:
          'Most standard heaps have no decrease-key. Lazy deletion adds at most E entries, so the cost is O(E log E), which equals O(E log V).',
      },
      {
        question: 'Is the heap always the best choice?',
        answer:
          'On a dense graph with E near V^2, scanning an array for the closest node gives O(V^2), which beats O(E log V). With small integer weights, a bucket queue is also faster.',
      },
    ],
  },

  'tree-dfs': {
    why: 'Recursion on a tree is induction on height: the base case handles `null`, and each call trusts its children to return correct answers for their subtrees and only combines them. Every node is entered once, so the walk is O(n) time and O(h) stack, where h is the height.',
    examples: [
      {
        title: 'Kth smallest in a BST',
        problem: 'The BST built by inserting `[5, 3, 6, 2, 4, 1]` has root 5. Find the 3rd smallest value.',
        insight: 'An inorder walk (left, node, right) visits a BST in sorted order, so the kth visit is the kth smallest value.',
        steps: [
          'Go left from 5 to 3, to 2, to 1. Node 1 has no left child, so it is visited first.',
          'Visit 1, then return to 2 and visit it, then return to 3 and visit it. The 3rd visit is 3, so the answer is 3.',
          'The walk goes on: 4, the right child of 3, then the root 5, then 6. The full inorder is `1, 2, 3, 4, 5, 6`, sorted as promised.',
          'In code, keep a counter and return at the kth visit instead of finishing the walk. The replay shows the whole order, but the early return makes the cost O(h + k) rather than O(n).',
        ],
        visualize: { algorithmId: 'tree-traversal', input: { values: [5, 3, 6, 2, 4, 1], order: 'inorder' } },
      },
      {
        title: 'Diameter of a binary tree',
        problem:
          'Root 1 has children 2 and 3, and node 2 has children 4 and 5. How many edges are on the longest path between any two nodes?',
        insight: 'Return the height upward, but update a global best with `left + right` at every node.',
        steps: [
          'Postorder reaches leaf 4 first: its children return 0, so it returns height 1. Leaf 5 also returns 1.',
          'At 2: a path through it has 1 + 1 = 2 edges, so best is 2. It returns height 1 + max(1, 1) = 2.',
          'Leaf 3 returns height 1.',
          'At 1: a path through it has 2 + 1 = 3 edges, so best is 3. That is the path 4, 2, 1, 3.',
          'The answer is 3. The height returned at the root is 3 too here, but in general the best path need not pass through the root.',
        ],
      },
      {
        title: 'Lowest common ancestor',
        problem:
          'In the tree with root 3, where 3 has children 5 and 1, 5 has children 6 and 2, 1 has children 0 and 8, and 2 has children 7 and 4, find the lowest common ancestor of 6 and 4.',
        insight: 'Return a node if it is p or q; a node that gets non-null answers from both sides is the LCA.',
        steps: [
          'At 3, recurse left into 5. At 5, the left child is 6, which is p, so it returns 6.',
          'At 5, the right child is 2. Its left child 7 returns null, and its right child 4 is q, so 2 passes 4 up.',
          'Node 5 got 6 from the left and 4 from the right, so 5 is the LCA and returns itself.',
          'Back at 3, the right subtree rooted at 1 holds neither, so it returns null. 3 passes 5 up: the answer is 5.',
        ],
      },
    ],
    variations: [
      {
        name: 'Return a pair',
        how: 'When the parent needs two facts, return both, such as height and balanced, or best with and without this node for House Robber III.',
      },
      {
        name: 'Pass state down',
        how: 'For path sums or BST validation, pass a parameter into the call: the remaining target, or the allowed `(lo, hi)` range for BST values.',
      },
      {
        name: 'Iterative with a stack',
        how: 'Replace recursion with an explicit stack to survive very deep trees; for inorder, push left children until null, then pop, visit and move right.',
      },
    ],
    followUps: [
      {
        question: 'What is the space complexity?',
        answer:
          'O(h) for the call stack: O(log n) for a balanced tree, but O(n) for a skewed one, which is why very deep trees may need an iterative version.',
      },
      {
        question: 'Why is checking each node against its parent not enough to validate a BST?',
        answer:
          'A node must respect every ancestor, not just its parent: a right grandchild can still be smaller than the root. Pass `(lo, hi)` bounds down, or check that inorder is strictly increasing.',
      },
      {
        question: 'For kth smallest, what if the tree changes often and k varies?',
        answer:
          'Store each subtree size in its node. Then compare k with the left size and go left, answer, or go right with `k - left - 1`, in O(h) per query.',
      },
    ],
  },

  trie: {
    why: 'Each trie node stands for one prefix, and words that share a prefix share its path. Insert and search walk one node per character, so they cost O(L) for a word of length L, no matter how many words are stored. An end-of-word flag separates a stored word from a prefix that only leads to other words.',
    examples: [
      {
        title: 'Implement a trie',
        problem: 'Insert `apple`, `apply` and `ape`. Does `search(app)` succeed, and does `startsWith(app)`?',
        insight: '`search` needs the walk to finish on a node marked as a word end; `startsWith` only needs the walk to finish.',
        steps: [
          'Insert `apple`: create nodes a, p, p, l, e and mark the e node as a word end.',
          'Insert `apply`: a, p, p, l already exist, so only y is created and marked.',
          'Insert `ape`: a and p exist; create a new e under the first p and mark it.',
          'Search `app`: a, p, p all exist, but that node has no end mark, so return false.',
          '`startsWith(app)` returns true because the walk itself succeeded. After inserting `app`, search would return true.',
        ],
        visualize: { algorithmId: 'trie', input: { words: ['apple', 'apply', 'ape'], query: 'app' } },
      },
      {
        title: 'Replace words',
        problem:
          'With roots `[cat, bat, rat]`, replace each word in the sentence "the cattle was rattled by the battery" by its shortest root.',
        insight: 'Walk each word down the trie and stop at the first end mark: that is the shortest root.',
        steps: [
          'Build a trie of `cat`, `bat` and `rat`.',
          '`the`: t is not a child of the root, so keep the word.',
          '`cattle`: c, a, t reaches an end mark after 3 letters, so it becomes `cat`.',
          '`rattled` becomes `rat` and `battery` becomes `bat` the same way; `was` falls off at its first letter and `by` at its second (`b` exists, `y` does not), so both stay.',
          'The result is "the cat was rat by the bat", in O(total letters) time.',
        ],
      },
      {
        title: 'Longest common prefix',
        problem: 'Find the longest common prefix of `[flower, flow, flight]`.',
        insight: 'Descend from the root while the node has exactly one child and is not a word end.',
        steps: [
          'Insert all three words. The root has one child, f.',
          'f has one child, l, and is not an end. Go down: prefix `fl`.',
          'l has two children, o (flower, flow) and i (flight), so the words split here.',
          'Stop: the answer is `fl`.',
        ],
      },
    ],
    variations: [
      {
        name: 'Wildcard search',
        how: 'For a `.` that matches any letter, recurse into every child at that position; letters still follow one edge. Worst case grows with the branching, but real queries stay fast.',
      },
      {
        name: 'Prefix counts',
        how: 'Store a counter on each node and increment it along the insert path. Then `countPrefix(p)` is the counter at the end of the walk, for autocomplete ranking.',
      },
      {
        name: 'Word Search II',
        how: 'Build a trie of the target words and DFS the grid while walking the trie in step; stop a path the moment the current letter is not a child.',
      },
    ],
    followUps: [
      {
        question: 'What are the time and space costs?',
        answer:
          'O(L) per insert or lookup. Space is O(total letters) nodes; a fixed 26-slot array per node is fast but heavy, while a map per node saves memory on sparse data.',
      },
      {
        question: 'Why not just use a hash set of words?',
        answer:
          'A set also looks up a word in O(L), but it cannot answer prefix questions without scanning every word. A trie gives prefix search, autocomplete and shared storage of common prefixes.',
      },
      {
        question: 'How do you delete a word?',
        answer:
          'Walk to its last node and clear the end mark. Then, returning upward, delete each node that has no children and no end mark.',
      },
    ],
  },

  'dp-1d': {
    why: 'The best answer for a prefix depends only on the answers for a few shorter prefixes, and those answers never change once computed. Filling prefixes from shortest to longest means every dependency is ready, and each of the n states is computed once. That turns an exponential tree of recursive choices into one computation per state, O(n) when each state reads a constant number of earlier ones.',
    examples: [
      {
        title: 'House robber',
        problem: 'Houses hold `[2, 1, 1, 2]` and you cannot rob two neighbors. What is the most you can take?',
        insight: '`dp[i]` is the best from the first i houses: skip house i - 1, or rob it on top of `dp[i - 2]`.',
        steps: [
          '`dp[0] = 0` (no houses) and `dp[1] = 2` (rob the first).',
          '`dp[2]` is the max of `dp[1] = 2` and `dp[0] + 1 = 1`, so 2: skipping the 1 is better.',
          '`dp[3]` is the max of `dp[2] = 2` and `dp[1] + 1 = 3`, so 3: rob houses 0 and 2.',
          '`dp[4]` is the max of `dp[3] = 3` and `dp[2] + 2 = 4`, so 4: rob houses 0 and 3.',
          'The answer is 4. Taking every other house gives only 3 either way, which is why a simple alternating greedy fails.',
        ],
        visualize: { algorithmId: 'house-robber', input: { nums: [2, 1, 1, 2] } },
      },
      {
        title: 'Climbing stairs',
        problem: 'You climb 1 or 2 steps at a time. How many distinct ways reach step 5?',
        insight: 'The last move was 1 step or 2 steps, so `ways[i]` is `ways[i - 1]` plus `ways[i - 2]`.',
        steps: [
          '`ways[0] = 1` (stand still) and `ways[1] = 1`.',
          '`ways[2] = 1 + 1 = 2` and `ways[3] = 2 + 1 = 3`.',
          '`ways[4] = 3 + 2 = 5`.',
          '`ways[5] = 5 + 3 = 8`. Only the last two values are ever read, so two variables suffice.',
        ],
      },
      {
        title: 'Coin change',
        problem: 'With coins `[1, 3, 4]`, what is the fewest number of coins that make 6?',
        insight: '`dp[a]` is the fewest coins for amount a: try each coin c as the last one, `dp[a - c] + 1`.',
        steps: [
          '`dp[0] = 0`. Then `dp[1] = 1`, `dp[2] = 2`, `dp[3] = 1` (one 3) and `dp[4] = 1` (one 4).',
          '`dp[5]` is 1 plus the min of `dp[4]`, `dp[2]` and `dp[1]`, which is 1 + 1 = 2, as 4 + 1.',
          '`dp[6]` is 1 plus the min of `dp[5] = 2`, `dp[3] = 1` and `dp[2] = 2`, which is 2, as 3 + 3.',
          'The answer is 2. Greedy would take 4 first and need 4 + 1 + 1, three coins, which is why this needs DP.',
        ],
      },
    ],
    variations: [
      {
        name: 'Circular houses',
        how: 'When the first and last houses are neighbors, run the linear solution twice, once without the first house and once without the last, and take the larger.',
      },
      {
        name: 'Many predecessors',
        how: 'When `dp[i]` depends on any earlier j, such as longest increasing subsequence or word break, loop over all j < i. That costs O(n^2) unless extra structure helps.',
      },
      {
        name: 'String decoding',
        how: 'For Decode Ways, `dp[i]` adds `dp[i - 1]` when the last digit is 1 to 9 and `dp[i - 2]` when the last two digits form 10 to 26.',
      },
    ],
    followUps: [
      {
        question: 'Can you use less than O(n) space?',
        answer: 'Yes. When `dp[i]` reads only `dp[i - 1]` and `dp[i - 2]`, keep two variables and shift them each step, for O(1) space.',
      },
      {
        question: 'Memoization or tabulation?',
        answer:
          'Memoized recursion is the easiest way from the recurrence and only computes reachable states, but it risks deep recursion. Tabulation is iterative and makes space compression easy.',
      },
      {
        question: 'How do you report which houses were robbed?',
        answer:
          'Keep the full table and walk back from `dp[n]`: if `dp[i]` equals `dp[i - 1]`, house i - 1 was skipped; otherwise it was robbed, so jump to i - 2.',
      },
    ],
  },

  'dp-2d': {
    why: '`dp[i][j]` answers the problem for two prefixes, such as the first i letters of one string and the first j of the other. Each cell reads only cells for smaller subproblems, which the fill order has already computed. For two strings that is the cell above, the cell to the left and the diagonal. So every one of the n × m states is solved once in O(1), for O(n·m) total.',
    examples: [
      {
        title: 'Longest common subsequence',
        problem: 'Find the length of the longest common subsequence of `ABCDE` and `ACE`.',
        insight:
          'If the last letters match, pair them and use the diagonal plus 1; otherwise drop one letter and take the better of above and left.',
        steps: [
          'Row 0 and column 0 are 0: an empty prefix shares nothing.',
          'Row A: A matches the first letter of `ACE`, so `dp[1][1] = 1`, and the rest of the row carries 1.',
          'Row B: nothing matches, so each cell takes the max of above and left and stays 1.',
          'Row C: C matches, so `dp[3][2]` is `dp[2][1] + 1 = 2`. Row D carries the 2 forward.',
          'Row E: E matches, so `dp[5][3]` is `dp[4][2] + 1 = 3`. The answer is 3, the subsequence `ACE`.',
        ],
        visualize: { algorithmId: 'lcs', input: { a: 'ABCDE', b: 'ACE' } },
      },
      {
        title: 'Edit distance',
        problem: 'What is the fewest inserts, deletes or replacements that turn `horse` into `ros`?',
        insight:
          'Matching letters copy the diagonal; otherwise take 1 plus the min of delete (above), insert (left) and replace (diagonal).',
        steps: [
          'Base cases: `dp[i][0] = i` deletes and `dp[0][j] = j` inserts.',
          'Row h: h differs from r, o and s, giving `[1, 1, 2, 3]`. Row o: o matches, so `dp[2][2] = dp[1][1] = 1`.',
          'Row r: `[3, 2, 2, 2]`. Row s: s matches, so `dp[4][3] = dp[3][2] = 2`.',
          'Row e: e matches nothing, so `dp[5][3]` is 1 plus the min of 2 (above), 4 (left) and 3 (diagonal), which is 3.',
          'The answer is 3: replace h with r (`rorse`), delete r (`rose`), delete e (`ros`).',
        ],
      },
      {
        title: 'Partition equal subset sum',
        problem: 'Can `[1, 5, 11, 5]` be split into two groups with equal sums?',
        insight: 'The total is 22, so ask whether some subset sums to 11: a 0/1 knapsack over items and sums.',
        steps: [
          'Keep `can[s]`, true when some subset of the items so far sums to s. Start with only `can[0]`.',
          'Item 1: sums `{0, 1}`. Item 5: `{0, 1, 5, 6}`.',
          'Item 11: adds 11 (12, 16 and 17 exceed the target), so 11 is reachable.',
          'Iterate s from 11 down to the item size, so each item is used at most once. The answer is true: `[11]` and `[1, 5, 5]`.',
        ],
      },
    ],
    variations: [
      {
        name: 'Unbounded knapsack',
        how: 'When each item may be reused, as in Coin Change II, iterate the capacity upward so `dp[s - w]` may already include the current item.',
      },
      {
        name: 'Grid paths',
        how: 'For unique paths, `dp[r][c]` is `dp[r - 1][c]` plus `dp[r][c - 1]`, with 0 at obstacles; for minimum path sum, use min and add the cell cost.',
      },
      {
        name: 'Interval DP',
        how: 'For problems on substrings, such as longest palindromic subsequence, let `dp[i][j]` cover `s[i..j]` and fill by increasing length so shorter ranges are ready.',
      },
    ],
    followUps: [
      {
        question: 'Can you reduce the space?',
        answer:
          'Yes. Each row reads only the previous one, so keep two rows, or one row plus a saved diagonal, for O(min(n, m)) space. The price is losing the table needed to rebuild the answer.',
      },
      {
        question: 'How do you recover the subsequence itself?',
        answer:
          'Walk back from `dp[n][m]`: on a match take the letter and move diagonally; otherwise move toward the larger of above and left. Reverse the letters at the end.',
      },
      {
        question: 'Why iterate the sum downward in 0/1 knapsack?',
        answer:
          'Going down, `dp[s - w]` still holds the value from before this item, so the item is counted at most once. Going up would let it be reused, which is the unbounded version.',
      },
    ],
  },

  greedy: {
    why: 'A greedy choice is safe when an exchange argument shows some optimal solution already makes it: swapping any other choice for the greedy one never makes the result worse. In Jump Game, the reachable indices always form a prefix `[0, reach]`, so the farthest reach is the only fact worth keeping and one O(n) scan suffices.',
    examples: [
      {
        title: 'Jump game',
        problem: 'From index 0 of `[3, 2, 1, 0, 4]`, each value is the longest jump allowed from that index. Can you reach the last index?',
        insight: 'Track the farthest reachable index; you are stuck exactly when the scan passes it.',
        steps: [
          'Index 0: reach becomes 0 + 3 = 3.',
          'Index 1: 1 + 2 = 3, so reach stays 3. Index 2: 2 + 1 = 3, still 3.',
          'Index 3: 3 + 0 = 3. Every path funnels into index 3, which has jump length 0.',
          'Index 4 is greater than reach 3, so it cannot be reached: return false.',
        ],
        visualize: { algorithmId: 'jump-game', input: { nums: [3, 2, 1, 0, 4] } },
      },
      {
        title: 'Jump game II',
        problem: 'In `[2, 3, 1, 1, 4]`, what is the fewest number of jumps from index 0 to the last index?',
        insight: 'Treat the indices one jump can reach as a BFS level, and jump once each time the scan finishes a level.',
        steps: [
          'Set `jumps = 0`, `end = 0`, `far = 0`. At index 0, `far = 2`; the scan is at `end`, so jump: `jumps = 1`, `end = 2`.',
          'Index 1: `far = max(2, 1 + 3) = 4`. Index 2: `far = max(4, 3) = 4`.',
          'Index 2 is the end of the level, so jump: `jumps = 2`, `end = 4`.',
          'End 4 is the last index, so the answer is 2: jump from 0 to 1, then from 1 to 4.',
        ],
      },
      {
        title: 'Gas station',
        problem:
          'Around a circuit, `gas = [1, 2, 3, 4, 5]` and `cost = [3, 4, 5, 1, 2]` to reach the next station. From which station can you go all the way around?',
        insight: 'If the tank goes negative at i, no station from the current start through i can work, so restart at i + 1.',
        steps: [
          'Total gas is 15 and total cost is 15, so some start works.',
          'Start 0: the tank gets 1 - 3 = -2. Negative, so restart at 1 with an empty tank.',
          'Station 1: 2 - 4 = -2, restart at 2. Station 2: 3 - 5 = -2, restart at 3.',
          'Station 3: tank 4 - 1 = 3. Station 4: 3 + 5 - 2 = 6. The scan ends: the answer is 3.',
          'Why skipping is safe: any station between the old start and i was entered with a non-negative tank, so starting there only brings less fuel to i.',
        ],
      },
    ],
    variations: [
      {
        name: 'Interval scheduling',
        how: 'To keep the most non-overlapping intervals, sort by end time and take each interval that starts at or after the last taken end.',
      },
      {
        name: 'Two passes',
        how: 'For Candy, satisfy left neighbors in a left-to-right pass and right neighbors in a right-to-left pass, keeping the max of both at each child.',
      },
      {
        name: 'Greedy with a heap',
        how: 'When the best next choice changes as you go, as in task scheduling or refueling stops, keep candidates in a heap and pop the best one only when you need it.',
      },
    ],
    followUps: [
      {
        question: 'How do you know greedy is correct here?',
        answer:
          'Give an exchange argument or an invariant, such as reachable indices forming a prefix. If you cannot, look for a counterexample: coins `[1, 3, 4]` for amount 6 break greedy, so that problem needs DP.',
      },
      {
        question: 'What is the complexity of Jump Game?',
        answer: 'O(n) time and O(1) space: one scan that keeps a single number. A DP over which indices are reachable would cost O(n^2).',
      },
      {
        question: 'Why is Jump Game II greedy and not BFS?',
        answer:
          'It is BFS in disguise: the indices reachable in k jumps form a contiguous range, so each level is two numbers instead of a queue, giving O(n) time and O(1) space.',
      },
    ],
  },

  'bit-manipulation': {
    why: 'XOR is commutative and associative, with `x ^ x = 0` and `x ^ 0 = x`, so XOR-ing a list cancels every pair no matter the order and leaves only unpaired values. More generally, each bit position is independent, so one machine operation works on all 32 positions at once in O(1).',
    examples: [
      {
        title: 'Single number',
        problem: 'In `[5, 3, 7, 3, 5]`, every value appears twice except one. Find it in O(1) extra space.',
        insight: 'XOR everything together: the pairs cancel to 0 and only the single value survives.',
        steps: [
          'Start with x = 0. XOR in 5 (`101`): x = 5.',
          'XOR in 3 (`011`): `101 ^ 011 = 110`, so x = 6.',
          'XOR in 7 (`111`): `110 ^ 111 = 001`, so x = 1.',
          'XOR in 3: `001 ^ 011 = 010`, so x = 2. XOR in 5: `010 ^ 101 = 111`, so x = 7.',
          'The answer is 7. Both 3s and both 5s canceled, even though they were not next to each other.',
        ],
        visualize: { algorithmId: 'single-number-xor', input: { nums: [5, 3, 7, 3, 5] } },
      },
      {
        title: 'Missing number',
        problem: '`[3, 0, 1]` holds all but one of the numbers 0 to 3. Which one is missing?',
        insight: 'XOR every index 0 to n with every value; each present number appears twice and cancels.',
        steps: [
          'Start with x = n = 3, so the index n is included.',
          'i = 0: `x ^= 0 ^ 3`, giving 3 ^ 0 ^ 3 = 0.',
          'i = 1: `x ^= 1 ^ 0`, giving 1.',
          'i = 2: `x ^= 2 ^ 1`, giving 1 ^ 2 ^ 1 = 2. The answer is 2, with no risk of the overflow a sum could hit.',
        ],
      },
      {
        title: 'Number of 1 bits',
        problem: 'How many bits are set in 11, which is `1011` in binary?',
        insight: '`n & (n - 1)` clears the lowest set bit, so count how many times you can do it before n hits 0.',
        steps: [
          '`1011 & 1010 = 1010`: one bit cleared, count 1.',
          '`1010 & 1001 = 1000`: count 2.',
          '`1000 & 0111 = 0000`: count 3.',
          'n is 0, so the answer is 3. The loop runs once per set bit, not once per bit position.',
        ],
      },
    ],
    variations: [
      {
        name: 'Two single numbers',
        how: 'XOR everything to get `a ^ b`, pick its lowest set bit with `x & -x`, and XOR the numbers into two groups by that bit; each group yields one answer.',
      },
      {
        name: 'Others appear three times',
        how: 'XOR no longer cancels. Count how many numbers set each of the 32 bits; the single number has exactly the bits whose count is not a multiple of 3.',
      },
      {
        name: 'Subsets as masks',
        how: 'For n up to about 20, each `mask` from 0 to `(1 << n) - 1` is a subset: bit i set means include item i. Test it with `mask & (1 << i)`.',
      },
    ],
    followUps: [
      {
        question: 'How do you check whether n is a power of two?',
        answer: 'Check `n > 0` and `(n & (n - 1)) === 0`: a power of two has exactly one set bit, and clearing it leaves 0.',
      },
      {
        question: 'What changes with negative numbers in JavaScript?',
        answer:
          'Bitwise operators work on 32-bit signed integers, so `>>` copies the sign bit. Use `>>>` for an unsigned shift, for example `-1 >>> 0` is 4294967295.',
      },
      {
        question: 'Can you add two integers without `+`?',
        answer: '`a ^ b` is the sum without carries and `(a & b) << 1` is the carry. Repeat with those two until the carry is 0.',
      },
    ],
  },
};
