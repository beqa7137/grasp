import { rangeOf } from '../../algorithms/input.js';
import { distinctInts, randInt, shuffle } from '../../algorithms/random.js';
import type { CodingProblemDefinition } from '../types.js';
import { randomDag, randomEdges } from './graph-inputs.js';
import { MinHeap } from './min-heap.js';

const MOD = 1_000_000_007;

const eitherWay = (rand: () => number, edge: number[]) => {
  if (rand() < 0.5) [edge[0], edge[1]] = [edge[1], edge[0]];
  return edge;
};

/** Undirected adjacency in flat arrays: the neighbors of node v fill `to` and `edge` from `first[v]` up to `first[v + 1]`. */
function adjacency(n: number, edges: number[][]) {
  const first = new Int32Array(n + 1);
  for (const [a, b] of edges) {
    first[a + 1]++;
    first[b + 1]++;
  }
  for (let v = 0; v < n; v++) first[v + 1] += first[v];
  const next = first.slice(0, n);
  const to = new Int32Array(2 * edges.length);
  const edge = new Int32Array(2 * edges.length);
  edges.forEach(([a, b], i) => {
    to[next[a]] = b;
    edge[next[a]++] = i;
    to[next[b]] = a;
    edge[next[b]++] = i;
  });
  return { first, to, edge };
}

/**
 * The best chance of reaching each node from `start`, where chances along a path multiply: Dijkstra on the largest product.
 * `via`, when given, receives the index of the edge each node was last improved through.
 */
export function bestChances(n: number, edges: number[][], start: number, via?: Int32Array): Float64Array {
  const { first, to, edge } = adjacency(n, edges);
  const best = new Float64Array(n);
  best[start] = 1;
  const heap = new MinHeap();
  heap.push([-1, start]);
  while (heap.size) {
    const [negative, node] = heap.pop();
    if (-negative < best[node]) continue;
    for (let k = first[node]; k < first[node + 1]; k++) {
      const chance = (-negative * edges[edge[k]][2]) / 100;
      if (chance <= best[to[k]]) continue;
      best[to[k]] = chance;
      if (via) via[to[k]] = edge[k];
      heap.push([-chance, to[k]]);
    }
  }
  return best;
}

/** Whether a best chance times 10^6 stays a thousandth away from a half, as the statement promises. */
function roundsSafely(chance: number): boolean {
  const scaled = chance * 1e6;
  return Math.abs(scaled - Math.floor(scaled) - 0.5) >= 1e-3;
}

const EVEN_CHANCES = [10, 20, 25, 40, 50, 60, 75, 80, 90, 100];

/**
 * A chain from start to end whose last 20 edges are 97 to 99 percent and the rest certain, hidden among 50,001 random edges
 * of at most 50 percent that can never beat it, since the chain keeps more than 0.97^20 > 0.54.
 */
function chanceChain(rand: () => number): [number, number[][], number, number] {
  const n = 100_000;
  let lossy: number[];
  do lossy = Array.from({ length: 20 }, () => randInt(rand, 97, 99));
  while (!roundsSafely(lossy.reduce((chance, percent) => (chance * percent) / 100, 1)));
  const labels = shuffle(rand, rangeOf(0, n - 1));
  const joined = new Set<number>();
  const pair = (a: number, b: number) => Math.min(a, b) * n + Math.max(a, b);
  const edges: number[][] = [];
  for (let i = 0; i + 1 < n; i++) {
    edges.push([labels[i], labels[i + 1], i + 21 >= n ? lossy[i + 21 - n] : 100]);
    joined.add(pair(labels[i], labels[i + 1]));
  }
  while (edges.length < 150_000) {
    const a = randInt(rand, 0, n - 1);
    const b = randInt(rand, 0, n - 1);
    if (a === b || joined.has(pair(a, b))) continue;
    joined.add(pair(a, b));
    edges.push([a, b, randInt(rand, 1, 50)]);
  }
  return [n, shuffle(rand, edges).map((edge) => eitherWay(rand, edge)), labels[0], labels[n - 1]];
}

export const maxProbability: CodingProblemDefinition = {
  statement: [
    'There are `n` nodes labelled 0 to `n - 1`. Each `[a, b, p]` in `edges` is an undirected edge between `a` and `b` that you cross safely with a chance of `p` percent. Chances along a path multiply: a 50 percent edge followed by an 80 percent edge gets you through 40 percent of the time.',
    'Return the highest chance of getting from `start` to `end`, as a probability from 0 to 1 multiplied by 1,000,000 and rounded to the nearest integer, or 0 if no path joins them. The tests keep that product at least a thousandth away from any half-integer, so floating-point error cannot tip the rounding.',
  ],
  constraints: [
    '2 ≤ n ≤ 10^5',
    '0 ≤ edges.length ≤ 2·10^5',
    '1 ≤ p ≤ 100',
    '0 ≤ a, b < n, a ≠ b, and no two edges join the same pair',
    '0 ≤ start, end < n and start ≠ end',
  ],
  entry: 'maxProbability',
  params: [
    { name: 'n', type: 'int' },
    { name: 'edges', type: 'int[][]' },
    { name: 'start', type: 'int' },
    { name: 'end', type: 'int' },
  ],
  returns: 'int',
  compare: 'exact',
  examples: [
    {
      args: [
        3,
        [
          [0, 1, 50],
          [1, 2, 50],
          [0, 2, 20],
        ],
        0,
        2,
      ],
      explanation:
        'Going through node 1 succeeds with probability 0.5 × 0.5 = 0.25, better than 0.2 for the direct edge, so the answer is 250000',
    },
    {
      args: [
        3,
        [
          [0, 1, 50],
          [1, 2, 50],
          [0, 2, 30],
        ],
        0,
        2,
      ],
    },
    { args: [3, [[0, 1, 50]], 0, 2] },
  ],
  edgeCases: [
    [2, [], 0, 1],
    [
      4,
      [
        [0, 1, 10],
        [0, 2, 100],
        [2, 1, 100],
        [1, 3, 100],
      ],
      0,
      3,
    ],
    [2, [[1, 0, 100]], 0, 1],
    [2, [[0, 1, 1]], 1, 0],
    [
      5,
      [
        [0, 1, 90],
        [1, 2, 90],
        [2, 3, 90],
        [3, 4, 90],
        [0, 4, 60],
      ],
      0,
      4,
    ],
    [
      5,
      [
        [0, 1, 37],
        [2, 1, 37],
        [2, 3, 37],
        [4, 3, 37],
      ],
      0,
      4,
    ],
    [
      5,
      [
        [3, 4, 33],
        [2, 3, 33],
        [1, 2, 33],
        [0, 1, 33],
      ],
      4,
      0,
    ],
    [
      4,
      [
        [0, 1, 100],
        [1, 2, 100],
        [2, 3, 1],
        [0, 3, 2],
      ],
      0,
      3,
    ],
    [
      6,
      [
        [0, 1, 80],
        [1, 2, 80],
        [3, 4, 100],
        [4, 5, 100],
      ],
      0,
      5,
    ],
    [
      4,
      [
        [0, 1, 99],
        [1, 3, 10],
        [0, 2, 50],
        [2, 3, 50],
      ],
      3,
      0,
    ],
  ],
  randomCase: (rand) => {
    for (;;) {
      const n = randInt(rand, 2, 8);
      const edges = randomEdges(rand, n, randInt(rand, 0, (n * (n - 1)) / 2), false).map(([a, b]) => [
        a,
        b,
        rand() < 0.5 ? EVEN_CHANCES[randInt(rand, 0, EVEN_CHANCES.length - 1)] : randInt(rand, 1, 100),
      ]);
      const start = randInt(rand, 0, n - 1);
      const end = (start + randInt(rand, 1, n - 1)) % n;
      if (roundsSafely(bestChances(n, edges, start)[end])) return [n, edges, start, end];
    }
  },
  // A 99,999-edge chain whose nodes almost all have a certain path from start: a Dijkstra that scans every node for the
  // next one to settle makes about 10^10 steps, and Bellman-Ford needs a round for each backward step along the chain.
  performanceCase: (rand) => chanceChain(rand),
  solve(n: number, edges: number[][], start: number, end: number) {
    return Math.round(bestChances(n, edges, start)[end] * 1e6);
  },
  approach:
    'Dijkstra with the largest probability first: pop the node with the best chance from a max-heap, and push a neighbor whenever its chance times the edge chance beats what it has. Multiplying by a chance of at most 1 never helps, so the first time a node comes off the heap its chance is final. Taking `-log(p)` as an edge length turns this into ordinary shortest paths.',
  complexity: { time: 'O(E log V)', space: 'O(V + E)' },
};

/** The least time to reach each intersection from 0 and the number of routes that take it, modulo 10^9 + 7. */
export function fastestRoutes(n: number, roads: number[][]): { time: Float64Array; ways: number[] } {
  const { first, to, edge } = adjacency(n, roads);
  const time = new Float64Array(n).fill(Infinity);
  const ways = Array<number>(n).fill(0);
  time[0] = 0;
  ways[0] = 1;
  const heap = new MinHeap();
  heap.push([0, 0]);
  while (heap.size) {
    const [t, u] = heap.pop();
    if (t > time[u]) continue;
    for (let k = first[u]; k < first[u + 1]; k++) {
      const v = to[k];
      const arrive = t + roads[edge[k]][2];
      if (arrive < time[v]) {
        time[v] = arrive;
        ways[v] = ways[u];
        heap.push([arrive, v]);
      } else if (arrive === time[v]) ways[v] = (ways[v] + ways[u]) % MOD;
    }
  }
  return { time, ways };
}

/** `diamonds` squares in a row, each offering two equal routes, so 2^diamonds fastest routes join the ends. */
function diamondChain(diamonds: number): [number, number[][]] {
  const n = 3 * diamonds + 1;
  const roads: number[][] = [];
  for (let d = 0; d < diamonds; d++) {
    const at = 3 * d;
    roads.push([at, at + 1, 2], [at, at + 2, 3], [at + 1, at + 3, 3], [at + 2, at + 3, 2]);
  }
  return [n, roads];
}

/** A rows × cols grid with 0 at one corner and n - 1 at the other: every monotone route is fastest. */
function roadGrid(rand: () => number, rows: number, cols: number): [number, number[][]] {
  const n = rows * cols;
  const labels = [0, ...shuffle(rand, rangeOf(1, n - 2)), n - 1];
  const across = randInt(rand, 1, 1_000_000_000);
  const down = randInt(rand, 1, 1_000_000_000);
  const roads: number[][] = [];
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      const cell = r * cols + c;
      if (c + 1 < cols) roads.push(eitherWay(rand, [labels[cell], labels[cell + 1], across]));
      if (r + 1 < rows) roads.push(eitherWay(rand, [labels[cell], labels[cell + cols], down]));
    }
  return [n, shuffle(rand, roads)];
}

export const countPaths: CodingProblemDefinition = {
  statement: [
    'There are `n` intersections labelled 0 to `n - 1`. Each `[u, v, time]` in `roads` is a two-way road between `u` and `v` that takes `time` minutes to drive.',
    'Return the number of different routes from intersection 0 to intersection `n - 1` that take the least total time, modulo 1,000,000,007. Routes differ when their sequences of roads differ. When `n` is 1 the answer is 1, for the route with no roads, and when `n - 1` cannot be reached it is 0.',
  ],
  constraints: ['1 ≤ n ≤ 10^5', '0 ≤ roads.length ≤ 2·10^5', '1 ≤ time ≤ 10^9', '0 ≤ u, v < n, u ≠ v, and no two roads join the same pair'],
  entry: 'countPaths',
  params: [
    { name: 'n', type: 'int' },
    { name: 'roads', type: 'int[][]' },
  ],
  returns: 'int',
  compare: 'exact',
  examples: [
    {
      args: [
        7,
        [
          [0, 6, 7],
          [0, 1, 2],
          [1, 2, 3],
          [1, 3, 3],
          [6, 3, 3],
          [3, 5, 1],
          [6, 5, 1],
          [2, 5, 1],
          [0, 4, 5],
          [4, 6, 2],
        ],
      ],
      explanation: 'The least time is 7 minutes, and four routes take it: 0 → 6, 0 → 4 → 6, 0 → 1 → 2 → 5 → 6 and 0 → 1 → 3 → 5 → 6',
    },
    { args: [2, [[1, 0, 10]]] },
  ],
  edgeCases: [
    [1, []],
    [2, []],
    [3, [[0, 1, 1]]],
    [
      4,
      [
        [0, 1, 1],
        [1, 3, 1],
        [0, 2, 1],
        [2, 3, 1],
        [0, 3, 2],
      ],
    ],
    [
      3,
      [
        [0, 1, 500_000_000],
        [1, 2, 500_000_000],
        [0, 2, 1_000_000_000],
      ],
    ],
    [
      4,
      [
        [0, 3, 10],
        [0, 1, 1],
        [1, 2, 1],
        [2, 3, 1],
      ],
    ],
    [
      4,
      [
        [0, 1, 5],
        [0, 2, 1],
        [2, 1, 1],
        [1, 3, 1],
      ],
    ],
    diamondChain(31),
  ],
  randomCase: (rand) => {
    const n = randInt(rand, 1, 8);
    const layer = rangeOf(0, n - 1).map((v) => (v === 0 ? 0 : v === n - 1 ? 3 : randInt(rand, 1, 2)));
    const count = randInt(rand, Math.max(0, n - 2), (n * (n - 1)) / 2);
    const roads = randomEdges(rand, n, count, false).map(([u, v]) => [
      u,
      v,
      Math.max(1, Math.abs(layer[u] - layer[v])) + (rand() < 0.3 ? 1 : 0),
    ]);
    return [n, roads];
  },
  // Every route that only moves toward the far corner of a grid of about 250 × 400 is fastest, far more than 10^12 of them, and
  // almost every intersection is nearer than the far corner, so a Dijkstra that scans for the nearest makes 10^10 steps.
  performanceCase: (rand) => {
    const rows = randInt(rand, 240, 260);
    return roadGrid(rand, rows, Math.floor(100_000 / rows));
  },
  solve(n: number, roads: number[][]) {
    return fastestRoutes(n, roads).ways[n - 1];
  },
  approach:
    'Dijkstra from 0 that also counts routes: a strictly shorter time to a node replaces its count with the count of the node it came from, and an equal time adds that count. All roads take positive time, so every node on a fastest route to `v` settles before `v`, and each count is complete when its node leaves the heap. Keep the counts modulo 10^9 + 7.',
  complexity: { time: 'O(E log V)', space: 'O(V + E)' },
};

/** Two courses per layer, each layer wholly after the one before, and every other course after the last layer. */
function layeredCourses(rand: () => number, n: number): number[][] {
  const labels = shuffle(rand, rangeOf(1, n));
  const layers = Array.from({ length: 35 }, (_, i) => [labels[1 + 2 * i], labels[2 + 2 * i]]);
  const relations: number[][] = layers[0].map((course) => [labels[0], course]);
  for (let layer = 0; layer + 1 < layers.length; layer++)
    for (const before of layers[layer]) for (const after of layers[layer + 1]) relations.push([before, after]);
  for (const before of layers[layers.length - 1]) for (let i = 71; i < n; i++) relations.push([before, labels[i]]);
  return shuffle(rand, relations);
}

export const minimumTime: CodingProblemDefinition = {
  statement: [
    'There are `n` courses labelled 1 to `n`, and course `i` takes `time[i - 1]` months. Each pair `[prev, next]` in `relations` means course `prev` must be finished before course `next` can start. The relations never form a cycle.',
    'You may take any number of courses at the same time, and a course can start as soon as all its prerequisites are finished. Return the fewest months needed to finish every course.',
  ],
  constraints: [
    '1 ≤ n ≤ 5·10^4',
    '0 ≤ relations.length ≤ 10^5',
    'time.length = n',
    '1 ≤ time[i] ≤ 10^4',
    '1 ≤ prev, next ≤ n and prev ≠ next',
    'pairs are distinct and form no cycle',
    'No chain of prerequisites has more than 100 courses, so a recursive DFS stays shallow',
  ],
  entry: 'minimumTime',
  params: [
    { name: 'n', type: 'int' },
    { name: 'relations', type: 'int[][]' },
    { name: 'time', type: 'int[]' },
  ],
  returns: 'int',
  compare: 'exact',
  examples: [
    {
      args: [
        3,
        [
          [1, 3],
          [2, 3],
        ],
        [3, 2, 5],
      ],
      explanation: 'Courses 1 and 2 start together. Course 3 waits for course 1 to finish at month 3, then ends at month 8',
    },
    {
      args: [
        5,
        [
          [1, 5],
          [2, 5],
          [3, 5],
          [3, 4],
          [4, 5],
        ],
        [1, 2, 3, 4, 5],
      ],
      explanation: 'Course 4 ends at month 3 + 4 = 7, and course 5 then takes 5 more months',
    },
  ],
  edgeCases: [
    [1, [], [7]],
    [3, [], [4, 9, 2]],
    [
      3,
      [
        [1, 2],
        [2, 3],
      ],
      [1, 1, 1],
    ],
    [2, [[2, 1]], [10_000, 10_000]],
    [
      4,
      [
        [1, 2],
        [2, 3],
      ],
      [2, 2, 2, 10],
    ],
    [3, [[2, 3]], [10, 1, 1]],
    [
      4,
      [
        [1, 2],
        [1, 3],
        [2, 4],
        [3, 4],
      ],
      [1, 5, 2, 1],
    ],
    [
      5,
      [
        [1, 2],
        [2, 3],
        [4, 5],
      ],
      [1, 1, 1, 5, 5],
    ],
  ],
  randomCase: (rand) => {
    const n = randInt(rand, 1, 8);
    const pairs = randomDag(rand, n, randInt(rand, 0, 2 * n), false);
    return [n, pairs.map(([after, before]) => [before + 1, after + 1]), Array.from({ length: n }, () => randInt(rand, 1, 10))];
  },
  // 35 layers of two courses, each after both of the layer before, fan out to every other course: a recursive search
  // without a memo follows 2^35 prerequisite chains into each of them.
  performanceCase: (rand) => {
    const n = 50_000;
    return [n, layeredCourses(rand, n), Array.from({ length: n }, () => randInt(rand, 1, 10_000))];
  },
  solve(n: number, relations: number[][], time: number[]) {
    const following: number[][] = Array.from({ length: n + 1 }, () => []);
    const waiting = Array<number>(n + 1).fill(0);
    for (const [prev, next] of relations) {
      following[prev].push(next);
      waiting[next]++;
    }
    const start = Array<number>(n + 1).fill(0);
    const queue: number[] = [];
    for (let course = 1; course <= n; course++) if (!waiting[course]) queue.push(course);
    let finish = 0;
    for (let head = 0; head < queue.length; head++) {
      const course = queue[head];
      const end = start[course] + time[course - 1];
      finish = Math.max(finish, end);
      for (const next of following[course]) {
        start[next] = Math.max(start[next], end);
        if (--waiting[next] === 0) queue.push(next);
      }
    }
    return finish;
  },
  approach:
    "Kahn's algorithm, carrying times: a course starts at the latest finish among its prerequisites and ends its own time later, and the answer is the latest end of all. Taking courses in topological order means each start is final before the course is dequeued. A DFS that memoizes each course's finish also works; without the memo it repeats every chain.",
  complexity: { time: 'O(n + relations.length)', space: 'O(n + relations.length)' },
};

/** Distinct lowercase names of five letters, so none can be mistaken for another. */
function names(rand: () => number, count: number): string[] {
  return distinctInts(rand, count, 0, 26 ** 5 - 1).map((code) =>
    rangeOf(0, 4)
      .map((i) => String.fromCharCode(97 + (Math.floor(code / 26 ** i) % 26)))
      .join(''),
  );
}

/**
 * 60,000 recipes in a chain, each needing the one before and a supply, listed in random order, and 6,000 that can never be
 * cooked, each needing 24 supplies before a missing name or another recipe of a circular trio.
 */
function recipeBook(rand: () => number): [string[], string[], string[]] {
  const chain = 60_000;
  const blocked = 6_000;
  const pool = names(rand, chain + blocked + 1_000 + blocked / 2);
  const recipes = pool.slice(0, chain + blocked);
  const supplies = pool.slice(chain + blocked, chain + blocked + 1_000);
  const missing = pool.slice(chain + blocked + 1_000);
  const supply = () => supplies[randInt(rand, 0, supplies.length - 1)];
  const needs = recipes.map((_, i): string[] => {
    if (i === 0) return [supply()];
    if (i < chain) return shuffle(rand, [recipes[i - 1], supply()]);
    const k = i - chain;
    const trio = k - blocked / 2;
    const blocker = trio < 0 ? missing[k] : recipes[chain + blocked / 2 + trio - (trio % 3) + ((trio + 1) % 3)];
    return [...shuffle(rand, supplies).slice(0, 24), blocker];
  });
  const order = shuffle(rand, rangeOf(0, recipes.length - 1));
  return [order.map((i) => recipes[i]), order.map((i) => needs[i].join(' ')), shuffle(rand, supplies)];
}

const DISHES = ['bread', 'cake', 'soup', 'stew', 'pie', 'tart', 'jam', 'flan'];
const PANTRY = ['salt', 'milk', 'egg', 'rice', 'corn', 'bean'];

export const findAllRecipes: CodingProblemDefinition = {
  statement: [
    'You can cook the dish `recipes[i]` once you have every ingredient named in `ingredients[i]`, a string of names separated by single spaces, such as `"yeast flour"`. Names never contain spaces. An ingredient is either a supply or another recipe, which you must cook first; cooking a recipe gives you as much of it as you need.',
    'You start with an unlimited amount of every name in `supplies`. Return the names of all the recipes you can cook, in any order. Recipes that need each other in a circle can never be cooked, and neither can a recipe that needs a name that is neither a supply nor a recipe you can cook.',
  ],
  constraints: [
    '1 ≤ recipes.length ≤ 10^5',
    'ingredients.length = recipes.length',
    'each ingredients[i] is one or more names joined by single spaces, with no leading or trailing space',
    'all the ingredient strings hold at most 3·10^5 names in total',
    '0 ≤ supplies.length ≤ 10^4',
    'every name is 1 to 10 lowercase letters, so no name contains a space',
    'recipe names are distinct and none is a supply; supplies are distinct',
    'a recipe never lists itself or the same ingredient twice',
    'Recipes can depend on each other in chains of thousands, too deep for a recursive DFS',
  ],
  entry: 'findAllRecipes',
  params: [
    { name: 'recipes', type: 'string[]' },
    { name: 'ingredients', type: 'string[]' },
    { name: 'supplies', type: 'string[]' },
  ],
  returns: 'string[]',
  compare: 'unordered',
  examples: [
    {
      args: [
        ['bread', 'sandwich'],
        ['yeast flour', 'bread meat'],
        ['yeast', 'flour', 'meat'],
      ],
      explanation: 'Bread needs only supplies, and the sandwich needs the bread you cooked plus meat',
    },
    {
      args: [
        ['bread', 'sandwich', 'burger'],
        ['yeast flour', 'bread meat', 'sandwich meat bread'],
        ['yeast', 'flour', 'meat'],
      ],
    },
    { args: [['bread'], ['yeast flour'], ['yeast', 'corn']] },
  ],
  edgeCases: [
    [
      ['sandwich', 'bread'],
      ['bread meat', 'yeast flour'],
      ['yeast', 'flour', 'meat'],
    ],
    [['a', 'b'], ['b', 'a'], []],
    [
      ['tea', 'cake', 'pie'],
      ['water leaf', 'pie egg', 'cake egg'],
      ['water', 'leaf', 'egg'],
    ],
    [['soup'], ['salt stone'], ['salt']],
    [['x', 'y'], ['missing', 'x salt'], ['salt']],
    [['d', 'c', 'b', 'a'], ['c', 'b', 'a', 'salt'], ['salt']],
    [['pie', 'jam'], ['jam flour', 'fruit'], ['fruit']],
  ],
  randomCase: (rand) => {
    const recipes = shuffle(rand, DISHES).slice(0, randInt(rand, 1, 6));
    const ingredients = recipes.map((dish) => {
      const options = shuffle(rand, [...PANTRY, ...recipes.filter((other) => other !== dish)]);
      return options.slice(0, randInt(rand, 1, Math.min(3, options.length))).join(' ');
    });
    return [recipes, ingredients, shuffle(rand, PANTRY).filter(() => rand() < 0.85)];
  },
  // Sweeping the list until nothing new can be cooked takes about 30,000 sweeps, one per backward step along the chain,
  // and each sweep reads the 25 ingredients of all 6,000 blocked recipes: over 4·10^9 lookups.
  performanceCase: (rand) => recipeBook(rand),
  solve(recipes: string[], ingredients: string[], supplies: string[]) {
    const index = new Map(recipes.map((name, i) => [name, i]));
    const stocked = new Set(supplies);
    const waiting = Array<number>(recipes.length).fill(0);
    const usedBy: number[][] = recipes.map(() => []);
    ingredients.forEach((list, i) => {
      for (const name of list.split(' ')) {
        if (stocked.has(name)) continue;
        const recipe = index.get(name);
        if (recipe === undefined) waiting[i] = Infinity;
        else {
          usedBy[recipe].push(i);
          waiting[i]++;
        }
      }
    });
    const cooked = recipes.flatMap((_, i) => (waiting[i] === 0 ? [i] : []));
    for (let head = 0; head < cooked.length; head++) for (const next of usedBy[cooked[head]]) if (--waiting[next] === 0) cooked.push(next);
    return cooked.map((i) => recipes[i]);
  },
  approach:
    "Split each ingredient string on spaces, then run Kahn's algorithm over the recipes: supplies are ready from the start, each recipe counts the recipe ingredients it still waits for, and a recipe that needs an unknown name never becomes ready. Start from the recipes waiting for nothing; cooking one lowers the count of every recipe that uses it, and those that reach 0 are cooked next. Recipes on a cycle never reach 0.",
  complexity: { time: 'O(R + I + S) for R recipes, I ingredient names and S supplies', space: 'O(R + I + S)' },
};

export const makeConnected: CodingProblemDefinition = {
  statement: [
    'There are `n` computers labelled 0 to `n - 1`, and each `[a, b]` in `connections` is a cable joining computers `a` and `b`. Computers joined directly or through other computers can talk to each other.',
    'In one operation you may unplug any cable and plug it in between two computers that no cable joins. Return the fewest operations that let every computer talk to every other, or -1 if there are not enough cables.',
  ],
  constraints: [
    '1 ≤ n ≤ 10^5',
    '0 ≤ connections.length ≤ min(n·(n - 1) / 2, 10^5)',
    '0 ≤ a, b < n, a ≠ b, and no two cables join the same pair',
  ],
  entry: 'makeConnected',
  params: [
    { name: 'n', type: 'int' },
    { name: 'connections', type: 'int[][]' },
  ],
  returns: 'int',
  compare: 'exact',
  examples: [
    {
      args: [
        4,
        [
          [0, 1],
          [0, 2],
          [1, 2],
        ],
      ],
      explanation: 'Computers 0, 1 and 2 stay joined without the cable between 1 and 2, so move it to computer 3',
    },
    {
      args: [
        6,
        [
          [0, 1],
          [0, 2],
          [0, 3],
          [1, 2],
          [1, 3],
        ],
      ],
    },
    {
      args: [
        6,
        [
          [0, 1],
          [0, 2],
          [0, 3],
          [1, 2],
        ],
      ],
      explanation: 'Joining six computers takes at least five cables, and there are only four',
    },
  ],
  edgeCases: [
    [1, []],
    [2, []],
    [2, [[0, 1]]],
    [
      3,
      [
        [0, 1],
        [1, 2],
      ],
    ],
    [
      5,
      [
        [0, 1],
        [1, 2],
        [2, 0],
        [3, 4],
      ],
    ],
    [
      4,
      [
        [0, 1],
        [1, 2],
        [2, 0],
      ],
    ],
    [
      5,
      [
        [0, 1],
        [1, 2],
        [0, 2],
      ],
    ],
    [
      6,
      [
        [0, 1],
        [0, 2],
        [1, 2],
        [3, 4],
        [3, 5],
        [4, 5],
      ],
    ],
  ],
  randomCase: (rand) => {
    const n = randInt(rand, 1, 8);
    return [n, randomEdges(rand, n, randInt(rand, Math.max(0, n - 3), Math.min((n * (n - 1)) / 2, n + 2)), false)];
  },
  // About 80,000 cables join two separate groups: relabelling a whole group on every join touches 10^5 labels each time.
  performanceCase: (rand) => [100_000, randomEdges(rand, 100_000, 100_000, false)],
  solve(n: number, connections: number[][]) {
    if (connections.length < n - 1) return -1;
    const parent = rangeOf(0, n - 1);
    const find = (x: number): number => {
      while (parent[x] !== x) x = parent[x] = parent[parent[x]];
      return x;
    };
    let groups = n;
    for (const [a, b] of connections) {
      const ra = find(a);
      const rb = find(b);
      if (ra !== rb) {
        parent[ra] = rb;
        groups--;
      }
    }
    return groups - 1;
  },
  approach:
    'Joining `n` computers takes at least `n - 1` cables, so return -1 with fewer. Otherwise there are always enough spare cables: count the connected groups with union-find, and each move joins two groups, so the answer is the number of groups minus one.',
  complexity: { time: 'O(n + E·α(n))', space: 'O(n)' },
};

/** Each cell's distance to the nearest land, found by a BFS from all the land at once; -1 everywhere when there is none. */
export function landDistances(grid: number[][]): Int32Array {
  const n = grid.length;
  const distance = new Int32Array(n * n).fill(-1);
  const queue: number[] = [];
  for (let r = 0; r < n; r++)
    for (let c = 0; c < n; c++)
      if (grid[r][c]) {
        distance[r * n + c] = 0;
        queue.push(r * n + c);
      }
  for (let head = 0; head < queue.length; head++) {
    const cell = queue[head];
    const r = Math.floor(cell / n);
    const c = cell % n;
    for (const next of [r > 0 ? cell - n : -1, r + 1 < n ? cell + n : -1, c > 0 ? cell - 1 : -1, c + 1 < n ? cell + 1 : -1])
      if (next >= 0 && distance[next] < 0) {
        distance[next] = distance[cell] + 1;
        queue.push(next);
      }
  }
  return distance;
}

/** Land 30 to 50 cells deep along one side of a 500 × 500 grid, so most water is hundreds of steps from it. */
function landBand(rand: () => number): number[][] {
  const side = 500;
  const depth = rangeOf(0, side - 1).map(() => randInt(rand, 30, 50));
  const grid = rangeOf(0, side - 1).map((r) => rangeOf(0, side - 1).map((c) => (r < depth[c] ? 1 : 0)));
  const turned = rand() < 0.5 ? grid : grid.map((_, r) => grid.map((row) => row[r]));
  return rand() < 0.5 ? turned : turned.reverse();
}

export const maxDistance: CodingProblemDefinition = {
  statement: [
    '`grid` is an n × n map where 1 is land and 0 is water. The distance between cells `(r1, c1)` and `(r2, c2)` is `|r1 - r2| + |c1 - c2|`.',
    'Find the water cell that is farthest from its nearest land cell, and return that distance. Return -1 if the grid has no land or no water.',
  ],
  constraints: ['1 ≤ n ≤ 500', 'grid is n × n', 'grid[r][c] is 0 or 1'],
  entry: 'maxDistance',
  params: [{ name: 'grid', type: 'int[][]' }],
  returns: 'int',
  compare: 'exact',
  examples: [
    {
      args: [
        [
          [1, 0, 1],
          [0, 0, 0],
          [1, 0, 1],
        ],
      ],
      explanation: 'The middle cell is 2 away from every corner, and every other water cell is 1 away from land',
    },
    {
      args: [
        [
          [1, 0, 0],
          [0, 0, 0],
          [0, 0, 0],
        ],
      ],
      explanation: 'The bottom-right cell is 2 rows and 2 columns from the only land, a distance of 4',
    },
  ],
  edgeCases: [
    [[[0]]],
    [[[1]]],
    [
      [
        [1, 1],
        [1, 1],
      ],
    ],
    [
      [
        [0, 0, 0],
        [0, 0, 0],
        [0, 0, 0],
      ],
    ],
    [
      [
        [0, 1],
        [1, 1],
      ],
    ],
    [
      [
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 1],
      ],
    ],
    [
      [
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
        [0, 0, 1, 0, 0],
        [0, 0, 0, 0, 0],
        [0, 0, 0, 0, 0],
      ],
    ],
    [
      [
        [1, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 0],
        [0, 0, 0, 1],
      ],
    ],
  ],
  randomCase: (rand) => {
    const n = randInt(rand, 1, 6);
    const land = rand() * 0.5;
    return [rangeOf(1, n).map(() => rangeOf(1, n).map(() => (rand() < land ? 1 : 0)))];
  },
  // About 20,000 land cells and 230,000 water cells up to 470 steps from them: measuring every water cell against every
  // land cell, or running a BFS from each water cell until it meets land, takes billions of steps.
  performanceCase: (rand) => [landBand(rand)],
  solve(grid: number[][]) {
    const distance = landDistances(grid);
    let farthest = 0;
    let land = 0;
    for (const d of distance) {
      if (d === 0) land++;
      farthest = Math.max(farthest, d);
    }
    return land === 0 || land === distance.length ? -1 : farthest;
  },
  approach:
    'Multi-source BFS: queue every land cell at distance 0, then give each unvisited neighbor of a popped cell its distance plus one. Moving one side at a time with nothing in the way covers exactly the given distance, and all the land starts together, so each water cell is first reached from its nearest land. The last distance assigned is the answer.',
  complexity: { time: 'O(n²)', space: 'O(n²)' },
};
