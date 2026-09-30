import type { Lesson } from './types.js';

export const MINIMUM_SPANNING_TREE_LESSON: Lesson = {
  why: 'Split the nodes into any two groups: the cheapest edge between them belongs to some minimum spanning tree, because a spanning tree without it must cross between the groups on another edge, at least as heavy, and swapping the two costs nothing. Kruskal takes edges cheapest first, keeping each that joins two components; Prim grows one tree by its cheapest outgoing edge. Both finish with n - 1 edges.',
  examples: [
    {
      title: 'Connecting Cities With Minimum Cost',
      problem:
        'Cities 0 to 5 can be joined by roads `0-2:1`, `1-2:2`, `2-3:3`, `0-1:4`, `3-4:5`, `1-3:6`, `4-5:7`, `0-5:8` and `2-4:9`, written as city-city:cost. Connect every city at the least total cost.',
      insight: 'Take roads cheapest first, and keep a road only when union-find says its two cities are in different components.',
      steps: [
        'Sort the roads by cost. Every city starts as its own component: `{0} {1} {2} {3} {4} {5}`.',
        'Take 0-2 (1), 1-2 (2) and 2-3 (3): each joins two components, so the total is 1 + 2 + 3 = 6 and `{0, 1, 2, 3}` is one component.',
        'Road 0-1 (4): `find(0)` and `find(1)` return the same root, since 0-2-1 already joins them. Taking it would close a cycle, so skip it.',
        'Take 3-4 (5) for a total of 11. Skip 1-3 (6): 1 and 3 are already connected.',
        'Take 4-5 (7) for a total of 18. That is the fifth road, n - 1 for 6 cities, so every city is connected: stop, and never check 0-5 or 2-4.',
        'Return 18. Had the roads run out before n - 1 were taken, some city would be cut off, and the answer would be -1.',
      ],
      visualize: {
        algorithmId: 'kruskal-mst',
        input: {
          n: 6,
          edges: [
            [0, 1, 4],
            [0, 2, 1],
            [0, 5, 8],
            [1, 2, 2],
            [1, 3, 6],
            [2, 3, 3],
            [2, 4, 9],
            [3, 4, 5],
            [4, 5, 7],
          ],
        },
      },
    },
    {
      title: 'Min Cost to Connect All Points',
      problem:
        'Points `[0,0]`, `[2,2]`, `[3,10]`, `[5,2]` and `[7,0]` can be joined at the cost of their Manhattan distance, `|x1 - x2| + |y1 - y2|`. Connect them all at the least total cost.',
      insight:
        "Every pair is an edge, so the graph is dense. Run Prim with an array of each point's distance to the tree: O(n²), without sorting all n²/2 edges.",
      steps: [
        'Start the tree at `[0,0]`. Its distances to the other points are 4, 13, 7 and 7, so `dist = [0, 4, 13, 7, 7]`.',
        'Add the closest point, `[2,2]`, at 4. It is nearer to `[3,10]` (9) and to `[5,2]` (3), so those two distances drop.',
        'Add `[5,2]` at 3. It is 4 from `[7,0]`, whose distance drops from 7 to 4.',
        'Add `[7,0]` at 4. It is 14 from `[3,10]`, no better than 9, so last of all add `[3,10]` at 9.',
        'The total is 4 + 3 + 4 + 9 = 20. Each of the n rounds scans every point once: O(n²) time and O(n) space, with no edge list.',
      ],
    },
    {
      title: 'Optimize Water Distribution in a Village',
      problem:
        'Houses 1, 2 and 3 can each dig a well, costing 1, 2 and 2, or take water through pipes 1-2 and 2-3, costing 1 each. Supply every house at the least total cost.',
      insight:
        'Add a source, node 0, joined to each house by an edge that costs its well. A house has water exactly when it connects to node 0, so the answer is a minimum spanning tree of all n + 1 nodes.',
      steps: [
        'The edges are 0-1 at 1, 0-2 and 0-3 at 2 each (the wells), and 1-2 and 2-3 at 1 each (the pipes).',
        'Kruskal takes the three edges of cost 1: the well at house 1, then pipes 1-2 and 2-3. Each joins two components.',
        'That is 3 edges for 4 nodes: with the source there are n + 1 nodes, so the tree needs n edges, not n - 1. Stop there, so no other well is dug.',
        'The answer is 3. The source turns which houses get a well into one more edge choice, so a single MST decides the wells and the pipes together.',
      ],
      visualize: {
        algorithmId: 'kruskal-mst',
        input: {
          n: 4,
          edges: [
            [0, 1, 1],
            [0, 2, 2],
            [0, 3, 2],
            [1, 2, 1],
            [2, 3, 1],
          ],
        },
      },
    },
    {
      title: 'Find Critical and Pseudo-Critical Edges in MST',
      problem:
        'Nodes 0 to 3 have edges `0-1:1`, `1-2:1`, `2-3:2`, `0-3:2` and `0-2:3`, numbered 0 to 4. Which edges are in every minimum spanning tree (critical), and which are in some but not all (pseudo-critical)?',
      insight:
        'Find the MST weight W once. An edge is critical if the MST without it weighs more than W or cannot connect every node; otherwise it is pseudo-critical if a spanning tree built by Kruskal with it taken first still weighs W.',
      steps: [
        'Kruskal finds W = 4: edges 0-1 and 1-2 at 1, then one of 2-3 and 0-3 at 2.',
        'Without 0-1, the best tree is 1-2, 2-3 and 0-3 at 5, more than 4, so 0-1 is critical. The same holds for 1-2.',
        'Without 2-3, the tree 0-1, 1-2 and 0-3 still weighs 4, so 2-3 is not critical. Taking 2-3 first also gives 4, so it is pseudo-critical, and so is 0-3.',
        'Taking 0-2 first gives 3 + 1 + 2 = 6, more than 4, so 0-2 is in no MST. The answer is critical `[0, 1]` and pseudo-critical `[2, 3]`.',
        'Two Kruskal runs per edge after one sort cost O(E² · α(V)) time, plenty fast for a few hundred edges.',
      ],
    },
  ],
  variations: [
    {
      name: 'Prim with an array',
      how: 'When nearly every pair is an edge, as with points on a plane, keep `dist[v]`, the cheapest edge from the tree to v, and scan all nodes for the smallest each round. That is O(V²) with no heap and no edge list.',
    },
    {
      name: 'Maximum spanning tree',
      how: 'To keep the most valuable links, sort the edges from heaviest to lightest and run the same Kruskal. Each step still joins two components, so the result is a spanning tree of the largest total weight.',
    },
    {
      name: 'Minimum bottleneck path',
      how: 'The path between two nodes in an MST keeps its heaviest edge as light as any path can, as Path With Minimum Effort asks. Kruskal answers it directly: add edges until the two nodes share a root, and the weight of the edge that joined them is the answer (0 if they are the same node).',
    },
  ],
  followUps: [
    {
      question: 'Kruskal or Prim: which would you pick?',
      answer:
        'Kruskal for an edge list or a sparse graph: one O(E log E) sort, and union-find is short to write. Prim for an adjacency list, and Prim with a distance array for a dense graph such as all pairs of points, where O(V²) beats sorting V²/2 edges.',
    },
    {
      question: 'Why is it safe to take the cheapest edge between two components?',
      answer:
        'Split the nodes into that component and the rest; no edge already taken crosses the split, and this edge is the cheapest that does. If a cheapest tree that keeps the edges already taken left it out, adding it would close a cycle that crosses the split on another edge, at least as heavy and not one already taken. Swapping the two gives a spanning tree that costs no more.',
    },
    {
      question: 'How is Prim different from Dijkstra?',
      answer:
        'The code is nearly the same, but Prim keys a node by the one edge that would attach it to the tree, while Dijkstra keys it by the whole path length from the source. So Prim minimizes the total weight of the tree, not the distance to any one node.',
    },
  ],
};
