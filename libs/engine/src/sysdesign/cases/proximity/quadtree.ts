import { mulberry32 } from '../../../algorithms/random.js';
import { num, spacedChoices, type WidgetCheckpoint } from '../widget-checkpoint.js';

/** Stated assumptions of the quadtree model: seeded places on a flat square region. */
export const QUADTREE = {
  places: 10_000,
  regionKm: 100,
  /** An index entry: id, latitude, longitude and a word of filter bits, 8 bytes each. */
  entryBytes: 32,
  /** A node: its square (4 numbers) and 4 child pointers, or a leaf's offset and count, 8 bytes each. */
  nodeBytes: 64,
  /** Each query asks for the nearest this many places. */
  nearest: 20,
  /** Queries start where places are, drawn from the same pattern with their own seed. */
  queries: 100,
  /** Splitting stops here, so places at one spot cannot split forever. */
  maxDepth: 24,
  scaleTo: 200_000_000,
  seed: 37,
  querySeed: 73,
} as const;

export const CAPACITY_LIMITS = { min: 5, max: 400, step: 5 } as const;

/** Places spread evenly, around one city with suburbs, or around three cities of different sizes. */
export type Density = 'even' | 'city' | 'cities';
export const DENSITIES: readonly Density[] = ['even', 'city', 'cities'];

export interface QuadtreeSettings {
  /** The most places a leaf holds before it splits into four. */
  capacity: number;
  density: Density;
}

export interface Square {
  x: number;
  y: number;
  size: number;
}

export interface QuadLeaf extends Square {
  depth: number;
  count: number;
}

export interface QuadtreeRun {
  /** The deepest leaf, the root at 0. */
  depth: number;
  nodes: number;
  leaves: QuadLeaf[];
  /** Every place pushed one level down by a split counts as a step: the sum of every place's depth. */
  buildSteps: number;
  memoryBytes: number;
  /** The same tree shape scaled to `QUADTREE.scaleTo` places. */
  scaledBytes: number;
  points: readonly [number, number][];
}

/** Per query, on average: nodes taken from the search queue, and places whose distance was computed. */
export interface QueryCost {
  visited: number;
  examined: number;
}

/** Clusters as [x, y, spread in km, share of places], the rest spread evenly. */
const CLUSTERS: Record<Density, [number, number, number, number][]> = {
  even: [],
  city: [[50, 50, 4, 0.8]],
  cities: [
    [30, 35, 4, 0.45],
    [72, 60, 2.5, 0.25],
    [40, 78, 6, 0.1],
  ],
};

function scatter(density: Density, count: number, seed: number): [number, number][] {
  const rand = mulberry32(seed);
  const { regionKm } = QUADTREE;
  const inside = (v: number) => v >= 0 && v < regionKm;
  return Array.from({ length: count }, (): [number, number] => {
    let pick = rand();
    for (const [cx, cy, spread, share] of CLUSTERS[density]) {
      if (pick >= share) {
        pick -= share;
        continue;
      }
      for (;;) {
        const r = spread * Math.sqrt(-2 * Math.log(1 - rand()));
        const t = 2 * Math.PI * rand();
        const p: [number, number] = [cx + r * Math.cos(t), cy + r * Math.sin(t)];
        if (inside(p[0]) && inside(p[1])) return p;
      }
    }
    return [rand() * regionKm, rand() * regionKm];
  });
}

const cache = new Map<string, [number, number][]>();
const memo = (key: string, make: () => [number, number][]) => cache.get(key) ?? cache.set(key, make()).get(key)!;

export const quadPlaces = (density: Density) => memo(`p:${density}`, () => scatter(density, QUADTREE.places, QUADTREE.seed));
export const quadQueries = (density: Density) => memo(`q:${density}`, () => scatter(density, QUADTREE.queries, QUADTREE.querySeed));

export interface QuadNode extends Square {
  depth: number;
  /** The node's places are `order[start]` to `order[end - 1]`, one range of an index array the whole tree shares. */
  order: Int32Array;
  start: number;
  end: number;
  kids: QuadNode[] | null;
}

/** A node's places, by index. */
export const placesIn = (n: QuadNode) => n.order.subarray(n.start, n.end);

/**
 * Splits in place: every node's places are one range of a single index array, and a split sorts its range into its four
 * quarters' ranges, so building allocates nothing per place.
 */
export function buildQuadtree(points: readonly [number, number][], capacity: number): QuadNode {
  const count = points.length;
  const order = new Int32Array(count);
  const xs = new Float64Array(count);
  const ys = new Float64Array(count);
  for (let i = 0; i < count; i++) {
    order[i] = i;
    xs[i] = points[i][0];
    ys[i] = points[i][1];
  }
  const scratch = new Int32Array(count);
  const quarters = new Uint8Array(count);
  const root: QuadNode = { x: 0, y: 0, size: QUADTREE.regionKm, depth: 0, order, start: 0, end: count, kids: null };
  const stack = [root];
  while (stack.length) {
    const node = stack.pop()!;
    const { start, end } = node;
    if (end - start <= capacity || node.depth >= QUADTREE.maxDepth) continue;
    const half = node.size / 2;
    const midX = node.x + half;
    const midY = node.y + half;
    const counts = [0, 0, 0, 0];
    for (let k = start; k < end; k++) {
      const i = order[k];
      const q = (xs[i] >= midX ? 1 : 0) + (ys[i] >= midY ? 2 : 0);
      quarters[k] = q;
      counts[q]++;
    }
    const starts = [start, start + counts[0], start + counts[0] + counts[1], start + counts[0] + counts[1] + counts[2]];
    const next = [...starts];
    for (let k = start; k < end; k++) scratch[next[quarters[k]]++] = order[k];
    for (let k = start; k < end; k++) order[k] = scratch[k];
    node.kids = [0, 1, 2, 3].map((q) => ({
      x: node.x + (q & 1) * half,
      y: node.y + (q >> 1) * half,
      size: half,
      depth: node.depth + 1,
      order,
      start: starts[q],
      end: starts[q] + counts[q],
      kids: null,
    }));
    for (const kid of node.kids) stack.push(kid);
  }
  return root;
}

/** The squared distance from a point to the nearest point of a square, 0 inside it. */
function gap2(px: number, py: number, s: Square): number {
  const dx = Math.max(s.x - px, 0, px - (s.x + s.size));
  const dy = Math.max(s.y - py, 0, py - (s.y + s.size));
  return dx * dx + dy * dy;
}

/** A binary min-heap keyed by distance, kept as two parallel arrays. */
class Queue<T> {
  private readonly keys: number[] = [];
  private readonly values: T[] = [];
  get size() {
    return this.keys.length;
  }
  push(d: number, v: T) {
    const { keys, values } = this;
    let i = keys.length;
    keys.push(d);
    values.push(v);
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (keys[parent] <= d) break;
      keys[i] = keys[parent];
      values[i] = values[parent];
      i = parent;
    }
    keys[i] = d;
    values[i] = v;
  }
  pop(): T {
    const { keys, values } = this;
    const top = values[0];
    const d = keys.pop()!;
    const v = values.pop()!;
    const n = keys.length;
    if (n) {
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        if (l >= n) break;
        const m = l + 1 < n && keys[l + 1] < keys[l] ? l + 1 : l;
        if (keys[m] >= d) break;
        keys[i] = keys[m];
        values[i] = values[m];
        i = m;
      }
      keys[i] = d;
      values[i] = v;
    }
    return top;
  }
}

/** Best-first search: always open the closest node or place next, and stop when `k` places have come out. */
export function nearestPlaces(root: QuadNode, points: readonly [number, number][], qx: number, qy: number, k: number) {
  const queue = new Queue<QuadNode | number>();
  queue.push(0, root);
  const found: number[] = [];
  let visited = 0;
  let examined = 0;
  while (queue.size && found.length < k) {
    const v = queue.pop();
    if (typeof v === 'number') {
      found.push(v);
      continue;
    }
    visited++;
    if (v.kids) for (const kid of v.kids) queue.push(gap2(qx, qy, kid), kid);
    else
      for (let j = v.start; j < v.end; j++) {
        const i = v.order[j];
        const dx = points[i][0] - qx;
        const dy = points[i][1] - qy;
        examined++;
        queue.push(dx * dx + dy * dy, i);
      }
  }
  return { found, visited, examined };
}

const RECENT = 24;
const recent = new Map<string, { root: QuadNode; run: QuadtreeRun; cost?: QueryCost }>();

/** A checkpoint asks about neighbouring settings too, so recent trees are kept, and their query cost once measured. */
function kept(s: QuadtreeSettings) {
  if (!(s.capacity >= 1)) throw new Error('A leaf must hold at least one place');
  const key = `${s.density}:${s.capacity}`;
  let entry = recent.get(key);
  if (!entry) {
    const root = buildQuadtree(quadPlaces(s.density), s.capacity);
    entry = { root, run: shape(root, s.density) };
    recent.set(key, entry);
    if (recent.size > RECENT) recent.delete(recent.keys().next().value!);
  }
  return entry;
}

/** The tree's shape: depth, nodes, leaves, build steps and memory. */
export const quadtree = (s: QuadtreeSettings): QuadtreeRun => kept(s).run;

/** Runs every seeded query for the nearest places against the tree: slower than the build, so only when asked for. */
export function quadtreeQueries(s: QuadtreeSettings): QueryCost {
  const entry = kept(s);
  if (entry.cost) return entry.cost;
  const points = quadPlaces(s.density);
  const queries = quadQueries(s.density);
  let visited = 0;
  let examined = 0;
  for (const [qx, qy] of queries) {
    const r = nearestPlaces(entry.root, points, qx, qy, QUADTREE.nearest);
    visited += r.visited;
    examined += r.examined;
  }
  entry.cost = { visited: visited / queries.length, examined: examined / queries.length };
  return entry.cost;
}

function shape(root: QuadNode, density: Density): QuadtreeRun {
  const points = quadPlaces(density);
  const leaves: QuadLeaf[] = [];
  let nodes = 0;
  let buildSteps = 0;
  const stack = [root];
  while (stack.length) {
    const n = stack.pop()!;
    nodes++;
    if (n.kids) stack.push(...n.kids);
    else {
      leaves.push({ x: n.x, y: n.y, size: n.size, depth: n.depth, count: n.end - n.start });
      buildSteps += (n.end - n.start) * n.depth;
    }
  }
  const { entryBytes, nodeBytes, scaleTo, places } = QUADTREE;
  return {
    depth: Math.max(...leaves.map((l) => l.depth)),
    nodes,
    leaves,
    buildSteps,
    memoryBytes: places * entryBytes + nodes * nodeBytes,
    scaledBytes: scaleTo * entryBytes + nodes * (scaleTo / places) * nodeBytes,
    points,
  };
}

export function bytesText(b: number): string {
  const [unit, size] = b >= 1e9 ? ['GB', 1e9] : b >= 1e6 ? ['MB', 1e6] : ['KB', 1e3];
  const v = b / (size as number);
  return `${v < 10 ? Number(v.toFixed(1)) : num(v)} ${unit}`;
}

export const DENSITY_TEXT: Record<Density, string> = {
  even: 'spread evenly',
  city: 'around one city',
  cities: 'around three cities',
};

type QuadQuestion = 'depth' | 'nodes' | 'examined';

/** Picked from the settings so it varies as the learner moves them. */
const questionFor = (s: QuadtreeSettings): QuadQuestion =>
  (['depth', 'nodes', 'examined'] as const)[(DENSITIES.indexOf(s.density) + Math.round(s.capacity / CAPACITY_LIMITS.step)) % 3];

const levels = (v: number) => `${num(v)} level${v === 1 ? '' : 's'}`;
const nodesText = (v: number) => `${num(v)} node${v === 1 ? '' : 's'}`;

/**
 * A prediction about the current settings, read from the run: how deep the tree goes, how many nodes it has, or how many
 * places a query for the nearest 20 checks. Distractors are what the same question gives under neighbouring settings.
 */
export function quadtreeCheckpoint(s: QuadtreeSettings, run = quadtree(s)): WidgetCheckpoint {
  // The capacity neighbours first: the query question measures only those, since queries cost more than a build.
  const nearby: QuadtreeSettings[] = [
    { ...s, capacity: s.capacity * 4 },
    { ...s, capacity: Math.max(1, Math.round(s.capacity / 4)) },
    ...DENSITIES.filter((d) => d !== s.density).map((density) => ({ ...s, density })),
  ];
  const { places, nearest } = QUADTREE;
  const situation = `${num(places)} places ${DENSITY_TEXT[s.density]}, at most ${num(s.capacity)} a leaf`;
  const question = questionFor(s);
  const neighbours = question === 'examined' ? [] : nearby.map(quadtree);
  if (question === 'depth') {
    const deepest = run.leaves.reduce((a, b) => (b.depth > a.depth ? b : a));
    const even = Math.log(places / s.capacity) / Math.log(4);
    return {
      prompt: `Predict: ${situation}. How many levels below the root is the deepest leaf?`,
      ...spacedChoices(
        run.depth,
        [Math.ceil(even), ...neighbours.map((n) => n.depth), Math.round(run.depth * 1.5), Math.round(run.depth / 2)],
        levels,
        1,
      ),
      explain: `Each level halves a square's side. The deepest leaf, ${levels(run.depth)} down, is a square ${Number(deepest.size.toFixed(3))} km wide, the size at which the densest spot holds no more than ${num(s.capacity)} places. Spread evenly, splitting would stop near log₄(${num(places)} / ${num(s.capacity)}) ≈ ${Number(even.toFixed(1))} levels; clusters split deeper only where they are dense.`,
    };
  }
  if (question === 'nodes') {
    const avg = places / run.leaves.length;
    return {
      prompt: `Predict: ${situation}. How many nodes does the tree have, leaves included?`,
      ...spacedChoices(run.nodes, [Math.ceil(places / s.capacity), ...neighbours.map((n) => n.nodes)], nodesText, 1),
      explain: `A split turns one leaf into four, so the tree has 1 + 4 × splits nodes: here ${num(run.leaves.length)} leaves and ${num(run.nodes - run.leaves.length)} inner nodes. A leaf holds ${Number(avg.toFixed(1))} places on average, fewer than ${num(s.capacity)}, because a split rarely divides a leaf evenly and some quarters are empty.`,
    };
  }
  const cost = quadtreeQueries(s);
  return {
    prompt: `Predict: ${situation}. A query asks for the nearest ${nearest}. How many places does it check the distance of, on average?`,
    ...spacedChoices(
      Math.round(cost.examined),
      [nearest, ...nearby.slice(0, 2).map((n) => Math.round(quadtreeQueries(n).examined))],
      (v) => `${num(v)} places`,
      1,
    ),
    explain: `The search opens the closest node first and checks every place in each leaf it opens, stopping once ${nearest} places are nearer than anything unopened: ${num(cost.visited)} nodes and ${num(cost.examined)} places a query on average. Big leaves mean fewer nodes but more places checked per leaf; tiny leaves mean more nodes to walk for each place.`,
  };
}
