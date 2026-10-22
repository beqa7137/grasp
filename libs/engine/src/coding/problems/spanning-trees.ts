import { rangeOf } from '../../algorithms/input.js';
import { randInt, shuffle } from '../../algorithms/random.js';
import type { CodingProblemDefinition } from '../types.js';

const COST = 100_000;

/**
 * Kruskal over edges [a, b, w] between nodes 0 to nodes - 1, taken in the order given: the weight of the forest it
 * builds and how many edges that forest has, n - 1 exactly when it spans all n nodes.
 */
export function kruskal(nodes: number, edges: readonly (readonly number[])[]): { weight: number; used: number } {
  const parent = Int32Array.from({ length: nodes }, (_, i) => i);
  const size = new Int32Array(nodes).fill(1);
  const find = (x: number) => {
    while (parent[x] !== x) x = parent[x] = parent[parent[x]];
    return x;
  };
  let weight = 0;
  let used = 0;
  for (const [a, b, w] of edges) {
    let [ra, rb] = [find(a), find(b)];
    if (ra === rb) continue;
    if (size[ra] < size[rb]) [ra, rb] = [rb, ra];
    parent[rb] = ra;
    size[ra] += size[rb];
    weight += w;
    used++;
  }
  return { weight, used };
}

const byWeight = <T extends readonly number[]>(edges: readonly T[]) => [...edges].sort((a, b) => a[2] - b[2]);

/** Distinct points with coordinates from lo to hi. */
function distinctPoints(rand: () => number, n: number, lo: number, hi: number): number[][] {
  const seen = new Set<string>();
  const points: number[][] = [];
  while (points.length < n) {
    const point = [randInt(rand, lo, hi), randInt(rand, lo, hi)];
    if (seen.has(`${point}`)) continue;
    seen.add(`${point}`);
    points.push(point);
  }
  return points;
}

/** Two different nodes from first to last, in random order. */
function distinctEnds(rand: () => number, first: number, last: number): [number, number] {
  const a = randInt(rand, first, last);
  const b = randInt(rand, first, last - 1);
  return [a, b < a ? b : b + 1];
}

/** A random tree on the nodes first to first + n - 1, plus extra edges, each [a, b, weight], shuffled; extras may repeat a pair. */
function treePlusEdges(rand: () => number, n: number, first: number, extra: number, maxWeight: number): number[][] {
  const labels = shuffle(rand, rangeOf(first, first + n - 1));
  const edges = labels.slice(1).map((v, i) => [labels[randInt(rand, 0, i)], v]);
  for (let k = 0; k < extra; k++) edges.push(distinctEnds(rand, first, first + n - 1));
  return shuffle(rand, edges).map(([a, b]) => [a, b, randInt(rand, 0, maxWeight)]);
}

const pairKey = (a: number, b: number) => `${Math.min(a, b)}-${Math.max(a, b)}`;

/** A connected graph on nodes 0 to n - 1 with count edges, no two joining the same pair, as [a, b, weight] with a < b. */
function distinctPairGraph(rand: () => number, n: number, count: number, maxWeight: number): number[][] {
  const labels = shuffle(rand, rangeOf(0, n - 1));
  const pairs = new Set(labels.slice(1).map((v, i) => pairKey(labels[randInt(rand, 0, i)], v)));
  while (pairs.size < count) pairs.add(pairKey(...distinctEnds(rand, 0, n - 1)));
  return shuffle(rand, [...pairs]).map((key) => [...key.split('-').map(Number), randInt(rand, 1, maxWeight)]);
}

export const minCostConnectPoints: CodingProblemDefinition = {
  statement: [
    'You are given `points`, where `points[i] = [x, y]` is a point on a plane. Joining two points costs the Manhattan distance between them, `|x1 - x2| + |y1 - y2|`.',
    'Return the least total cost of joins that connect every point to every other, directly or through other points.',
    'Up to 1,000 points make about 500,000 pairs: sorting every pair, O(n² log n), is fast enough, and Prim with a distance array needs only O(n²) time and no pair list.',
  ],
  constraints: ['1 ≤ points.length ≤ 1000', '-10^6 ≤ x, y ≤ 10^6', 'All points are distinct'],
  entry: 'minCostConnectPoints',
  params: [{ name: 'points', type: 'int[][]' }],
  returns: 'int',
  compare: 'exact',
  examples: [
    {
      args: [
        [
          [0, 0],
          [2, 2],
          [3, 10],
          [5, 2],
          [7, 0],
        ],
      ],
      explanation: 'Join [0,0] to [2,2] (4), [2,2] to [5,2] (3), [5,2] to [7,0] (4) and [2,2] to [3,10] (9): 20 in all',
    },
    {
      args: [
        [
          [3, 12],
          [-2, 5],
          [-4, 1],
        ],
      ],
      explanation: 'Join [-4,1] to [-2,5] (6) and [-2,5] to [3,12] (12); joining [3,12] to [-4,1] directly would cost 18',
    },
    { args: [[[0, 0]]], explanation: 'A single point needs no joins' },
  ],
  edgeCases: [
    [
      [
        [0, 0],
        [1, 1],
      ],
    ],
    [
      [
        [-1_000_000, -1_000_000],
        [1_000_000, 1_000_000],
      ],
    ],
    [
      [
        [0, 0],
        [0, 5],
        [0, 1],
        [0, 3],
      ],
    ],
    [
      [
        [0, 0],
        [1, 0],
        [0, 1],
        [1, 1],
      ],
    ],
    [
      [
        [2, -3],
        [-17, -8],
        [13, 8],
        [-17, -15],
      ],
    ],
  ],
  randomCase: (rand) => [distinctPoints(rand, randInt(rand, 1, 6), -10, 10)],
  // 1,000 points: scanning every pair of a tree point and an outside point in each round takes (n³ - n) / 6 steps.
  performanceCase: (rand) => [distinctPoints(rand, 1000, -1_000_000, 1_000_000)],
  solve(points: number[][]) {
    const n = points.length;
    const dist = new Float64Array(n).fill(Infinity);
    const inTree = new Uint8Array(n);
    dist[0] = 0;
    let total = 0;
    for (let round = 0; round < n; round++) {
      let u = -1;
      for (let j = 0; j < n; j++) if (!inTree[j] && (u < 0 || dist[j] < dist[u])) u = j;
      inTree[u] = 1;
      total += dist[u];
      const [x, y] = points[u];
      for (let j = 0; j < n; j++) {
        if (inTree[j]) continue;
        const d = Math.abs(x - points[j][0]) + Math.abs(y - points[j][1]);
        if (d < dist[j]) dist[j] = d;
      }
    }
    return total;
  },
  approach:
    "Prim with an array instead of a heap: `dist[j]` is point j's cheapest join to the tree so far. Each round adds the closest point outside the tree and lowers the other points' distances through it, n rounds of O(n) each. Kruskal also passes, but it first builds and sorts all n·(n - 1) / 2 pairs, O(n² log n).",
  complexity: { time: 'O(n²)', space: 'O(n)' },
};

export const connectingCities: CodingProblemDefinition = {
  statement: [
    'There are `n` cities labeled 1 to `n`. Each `[x, y, cost]` in `connections` is a road you could build between cities `x` and `y` for `cost`, usable both ways; two cities may have more than one such road.',
    'Return the least total cost of roads that connect every city to every other, directly or through other cities, or -1 if the roads cannot connect them all.',
  ],
  constraints: ['2 ≤ n ≤ 10^5', '1 ≤ connections.length ≤ 10^5', '1 ≤ x, y ≤ n and x ≠ y', '0 ≤ cost ≤ 10^5'],
  entry: 'minimumCost',
  params: [
    { name: 'n', type: 'int' },
    { name: 'connections', type: 'int[][]' },
  ],
  returns: 'int',
  compare: 'exact',
  examples: [
    {
      args: [
        3,
        [
          [1, 2, 5],
          [1, 3, 6],
          [2, 3, 1],
        ],
      ],
      explanation: 'Build 2-3 (1) and 1-2 (5); 1-3 would then close a cycle',
    },
    {
      args: [
        4,
        [
          [1, 2, 3],
          [3, 4, 4],
        ],
      ],
      explanation: 'No road joins cities 1 and 2 to cities 3 and 4',
    },
  ],
  edgeCases: [
    [2, [[1, 2, 0]]],
    [
      2,
      [
        [1, 2, 7],
        [2, 1, 3],
      ],
    ],
    [3, [[1, 2, 1]]],
    [
      4,
      [
        [1, 2, 1],
        [2, 3, 1],
        [3, 1, 1],
        [3, 4, 5],
      ],
    ],
    [
      5,
      [
        [1, 2, 4],
        [2, 3, 4],
        [3, 4, 4],
        [4, 5, 4],
        [1, 5, 1],
      ],
    ],
    [
      4,
      [
        [1, 2, 1],
        [3, 4, 1],
        [1, 2, 2],
      ],
    ],
  ],
  randomCase: (rand) => {
    const n = randInt(rand, 2, 7);
    const edges = treePlusEdges(rand, n, 1, randInt(rand, 0, 4), 9);
    return [n, edges.slice(0, Math.max(1, edges.length - randInt(rand, 0, 2)))];
  },
  // Always connected: 60,000 cities and 100,000 roads, so a Prim that scans every road once for each city it adds is too slow.
  performanceCase: (rand) => [60_000, treePlusEdges(rand, 60_000, 1, 40_001, COST)],
  solve(n: number, connections: number[][]) {
    const { weight, used } = kruskal(n + 1, byWeight(connections));
    return used === n - 1 ? weight : -1;
  },
  approach:
    'Kruskal: sort the roads by cost and take each one whose two cities union-find puts in different components. If fewer than n - 1 roads were taken, some city is cut off, so return -1. Give union-find path compression and union by rank: without them a find can walk a long chain of parents, and 10^5 roads take seconds.',
  complexity: { time: 'O(E log E) for E roads', space: 'O(n + E)' },
};

export const criticalMstEdges: CodingProblemDefinition = {
  statement: [
    'A connected, undirected graph has nodes 0 to `n - 1`, and edge `i` is `edges[i]`, written `[a, b, weight]`. A minimum spanning tree (MST) is a set of edges that connects every node at the least possible total weight.',
    'An edge is critical if every MST contains it, so leaving it out of the graph makes the least total weight grow, or leaves no spanning tree at all. An edge is pseudo-critical if some MSTs contain it and some do not.',
    'Return `[critical, pseudo]`: the indices of the critical edges and of the pseudo-critical edges, each list in increasing order.',
  ],
  constraints: [
    '2 ≤ n ≤ 100',
    '1 ≤ edges.length ≤ min(200, n·(n - 1) / 2)',
    '0 ≤ a < b < n and 1 ≤ weight ≤ 1000',
    'No two edges join the same pair, and the graph is connected',
  ],
  entry: 'findCriticalAndPseudoCriticalEdges',
  params: [
    { name: 'n', type: 'int' },
    { name: 'edges', type: 'int[][]' },
  ],
  returns: 'int[][]',
  compare: 'exact',
  examples: [
    {
      args: [
        5,
        [
          [0, 1, 1],
          [1, 2, 1],
          [2, 3, 2],
          [0, 3, 2],
          [0, 4, 3],
          [3, 4, 3],
          [1, 4, 6],
        ],
      ],
      explanation: 'Every MST weighs 7 and takes edges 0 and 1; it takes one of edges 2 and 3, and one of edges 4 and 5',
    },
    {
      args: [
        4,
        [
          [0, 1, 1],
          [1, 2, 1],
          [2, 3, 1],
          [0, 3, 1],
        ],
      ],
      explanation: 'Any three of the four equal edges form an MST, so each is in some but not all of them',
    },
  ],
  edgeCases: [
    [2, [[0, 1, 5]]],
    [
      4,
      [
        [0, 1, 1],
        [1, 2, 2],
        [2, 3, 3],
      ],
    ],
    [
      3,
      [
        [0, 1, 1],
        [1, 2, 1],
        [0, 2, 2],
      ],
    ],
    [
      4,
      [
        [0, 1, 1],
        [1, 2, 1],
        [0, 2, 1],
        [2, 3, 10],
      ],
    ],
    [
      4,
      [
        [0, 1, 1],
        [1, 2, 1],
        [2, 3, 2],
        [0, 3, 2],
        [0, 2, 3],
      ],
    ],
  ],
  randomCase: (rand) => {
    const n = randInt(rand, 2, 6);
    return [n, distinctPairGraph(rand, n, randInt(rand, n - 1, Math.min(10, (n * (n - 1)) / 2)), 4)];
  },
  performanceCase: (rand) => [100, distinctPairGraph(rand, 100, 200, 30)],
  solve(n: number, edges: number[][]) {
    const sorted = byWeight(edges.map(([a, b, w], i) => [a, b, w, i]));
    const best = kruskal(n, sorted).weight;
    const critical: number[] = [];
    const pseudo: number[] = [];
    for (const edge of sorted) {
      const rest = sorted.filter((other) => other !== edge);
      const without = kruskal(n, rest);
      if (without.used < n - 1 || without.weight > best) critical.push(edge[3]);
      else if (kruskal(n, [edge, ...rest]).weight === best) pseudo.push(edge[3]);
    }
    return [critical.sort((a, b) => a - b), pseudo.sort((a, b) => a - b)];
  },
  approach:
    'Find the MST weight W with Kruskal once. For each edge, run Kruskal without it: if the tree cannot reach every node or weighs more than W, the edge is critical. Otherwise run Kruskal with the edge taken first: if that tree still weighs W, the edge is pseudo-critical.',
  complexity: { time: 'O(E log E + E² · α(n))', space: 'O(n + E)' },
};

export const waterDistribution: CodingProblemDefinition = {
  statement: [
    'A village has `n` houses labeled 1 to `n`. House `i` can get water from a well dug there for `wells[i - 1]`, or through pipes from a house that has water.',
    'Each `[house1, house2, cost]` in `pipes` is a pipe you could lay between two houses, carrying water both ways; two houses may have more than one such pipe. Return the least total cost to supply every house with water.',
  ],
  constraints: [
    '2 ≤ n ≤ 10^5 and wells.length = n',
    '1 ≤ pipes.length ≤ 10^5',
    '1 ≤ house1, house2 ≤ n and house1 ≠ house2',
    '0 ≤ wells[i], cost ≤ 10^5',
  ],
  entry: 'minCostToSupplyWater',
  params: [
    { name: 'n', type: 'int' },
    { name: 'wells', type: 'int[]' },
    { name: 'pipes', type: 'int[][]' },
  ],
  returns: 'int',
  compare: 'exact',
  examples: [
    {
      args: [
        3,
        [1, 2, 2],
        [
          [1, 2, 1],
          [2, 3, 1],
        ],
      ],
      explanation: 'Dig a well at house 1 (1) and lay both pipes (1 each)',
    },
    {
      args: [
        2,
        [1, 1],
        [
          [1, 2, 1],
          [1, 2, 2],
        ],
      ],
      explanation: 'Two wells cost 2, and so do one well and the cheaper pipe',
    },
  ],
  edgeCases: [
    [2, [0, 0], [[1, 2, 5]]],
    [
      3,
      [5, 5, 5],
      [
        [1, 2, 1],
        [2, 3, 1],
        [1, 3, 1],
      ],
    ],
    [
      3,
      [1, 2, 2],
      [
        [1, 2, 5],
        [2, 3, 5],
      ],
    ],
    [
      4,
      [1, 9, 9, 1],
      [
        [1, 2, 1],
        [3, 4, 1],
      ],
    ],
    [
      5,
      [3, 1, 4, 1, 5],
      [
        [1, 2, 2],
        [2, 3, 2],
        [3, 4, 2],
        [4, 5, 2],
        [1, 5, 9],
      ],
    ],
  ],
  randomCase: (rand) => {
    const n = randInt(rand, 2, 5);
    const pipes = Array.from({ length: randInt(rand, 1, 6) }, () => [...distinctEnds(rand, 1, n), randInt(rand, 0, 9)]);
    return [n, Array.from({ length: n }, () => randInt(rand, 0, 9)), pipes];
  },
  // 60,000 houses and 100,000 pipes: a Prim from the source that scans every well and pipe for each house it adds is too slow.
  performanceCase: (rand) => {
    const n = 60_000;
    const pipes = Array.from({ length: 100_000 }, () => [...distinctEnds(rand, 1, n), randInt(rand, 0, COST)]);
    return [n, Array.from({ length: n }, () => randInt(rand, 0, COST)), pipes];
  },
  solve(n: number, wells: number[], pipes: number[][]) {
    return kruskal(n + 1, byWeight([...wells.map((w, i) => [0, i + 1, w]), ...pipes])).weight;
  },
  approach:
    'Add a source, node 0, with an edge to each house that costs its well: a house has water exactly when it connects to node 0. Kruskal over the wells and pipes together then finds the cheapest tree on the n + 1 nodes, choosing wells and pipes in one pass. Union-find needs path compression and union by rank here too, or its finds walk long chains of parents.',
  complexity: { time: 'O((n + E) log(n + E)) for E pipes', space: 'O(n + E)' },
};
