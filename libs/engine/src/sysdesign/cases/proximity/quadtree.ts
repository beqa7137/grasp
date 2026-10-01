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
  /** Per query, on average: nodes taken from the search queue, and places whose distance was computed. */
  visited: number;
  examined: number;
  points: readonly [number, number][];
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
  items: number[];
  kids: QuadNode[] | null;
}

export function buildQuadtree(points: readonly [number, number][], capacity: number): QuadNode {
  const root: QuadNode = { x: 0, y: 0, size: QUADTREE.regionKm, depth: 0, items: points.map((_, i) => i), kids: null };
  const stack = [root];
  while (stack.length) {
    const node = stack.pop()!;
    if (node.items.length <= capacity || node.depth >= QUADTREE.maxDepth) continue;
    const half = node.size / 2;
    node.kids = [0, 1, 2, 3].map((q) => ({
      x: node.x + (q & 1) * half,
      y: node.y + (q >> 1) * half,
      size: half,
      depth: node.depth + 1,
      items: [],
      kids: null,
    }));
    for (const i of node.items) {
      const [px, py] = points[i];
      node.kids[(px >= node.x + half ? 1 : 0) + (py >= node.y + half ? 2 : 0)].items.push(i);
    }
    node.items = [];
    stack.push(...node.kids);
  }
  return root;
}

/** The distance from a point to the nearest point of a square, 0 inside it. */
function gap(px: number, py: number, s: Square): number {
  const dx = Math.max(s.x - px, 0, px - (s.x + s.size));
  const dy = Math.max(s.y - py, 0, py - (s.y + s.size));
  return Math.hypot(dx, dy);
}

/** A binary min-heap keyed by distance. */
class Queue<T> {
  private readonly heap: { d: number; v: T }[] = [];
  get size() {
    return this.heap.length;
  }
  push(d: number, v: T) {
    const h = this.heap;
    h.push({ d, v });
    for (let i = h.length - 1; i > 0;) {
      const parent = (i - 1) >> 1;
      if (h[parent].d <= h[i].d) break;
      [h[parent], h[i]] = [h[i], h[parent]];
      i = parent;
    }
  }
  pop(): { d: number; v: T } {
    const h = this.heap;
    const top = h[0];
    const last = h.pop()!;
    if (h.length) {
      h[0] = last;
      for (let i = 0; ;) {
        const l = 2 * i + 1;
        const r = l + 1;
        let m = i;
        if (l < h.length && h[l].d < h[m].d) m = l;
        if (r < h.length && h[r].d < h[m].d) m = r;
        if (m === i) break;
        [h[m], h[i]] = [h[i], h[m]];
        i = m;
      }
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
    const { v } = queue.pop();
    if (typeof v === 'number') {
      found.push(v);
      continue;
    }
    visited++;
    if (v.kids) for (const kid of v.kids) queue.push(gap(qx, qy, kid), kid);
    else
      for (const i of v.items) {
        examined++;
        queue.push(Math.hypot(points[i][0] - qx, points[i][1] - qy), i);
      }
  }
  return { found, visited, examined };
}

const RECENT = 24;
const recent = new Map<string, QuadtreeRun>();

/** Builds and queries the tree; a checkpoint asks about neighbouring settings too, so recent runs are kept. */
export function quadtree(s: QuadtreeSettings): QuadtreeRun {
  if (!(s.capacity >= 1)) throw new Error('A leaf must hold at least one place');
  const key = `${s.density}:${s.capacity}`;
  const kept = recent.get(key);
  if (kept) return kept;
  const run = measure(s);
  recent.set(key, run);
  if (recent.size > RECENT) recent.delete(recent.keys().next().value!);
  return run;
}

function measure(s: QuadtreeSettings): QuadtreeRun {
  const points = quadPlaces(s.density);
  const root = buildQuadtree(points, s.capacity);
  const leaves: QuadLeaf[] = [];
  let nodes = 0;
  let buildSteps = 0;
  const stack = [root];
  while (stack.length) {
    const n = stack.pop()!;
    nodes++;
    if (n.kids) stack.push(...n.kids);
    else {
      leaves.push({ x: n.x, y: n.y, size: n.size, depth: n.depth, count: n.items.length });
      buildSteps += n.items.length * n.depth;
    }
  }
  const queries = quadQueries(s.density);
  let visited = 0;
  let examined = 0;
  for (const [qx, qy] of queries) {
    const r = nearestPlaces(root, points, qx, qy, QUADTREE.nearest);
    visited += r.visited;
    examined += r.examined;
  }
  const { entryBytes, nodeBytes, scaleTo, places } = QUADTREE;
  return {
    depth: Math.max(...leaves.map((l) => l.depth)),
    nodes,
    leaves,
    buildSteps,
    memoryBytes: places * entryBytes + nodes * nodeBytes,
    scaledBytes: scaleTo * entryBytes + nodes * (scaleTo / places) * nodeBytes,
    visited: visited / queries.length,
    examined: examined / queries.length,
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
  const other = (change: Partial<QuadtreeSettings>) => quadtree({ ...s, ...change });
  const neighbours = [
    other({ capacity: s.capacity * 4 }),
    other({ capacity: Math.max(1, Math.round(s.capacity / 4)) }),
    ...DENSITIES.filter((d) => d !== s.density).map((density) => other({ density })),
  ];
  const { places, nearest } = QUADTREE;
  const situation = `${num(places)} places ${DENSITY_TEXT[s.density]}, at most ${num(s.capacity)} a leaf`;
  const question = questionFor(s);
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
  return {
    prompt: `Predict: ${situation}. A query asks for the nearest ${nearest}. How many places does it check the distance of, on average?`,
    ...spacedChoices(Math.round(run.examined), [nearest, ...neighbours.map((n) => Math.round(n.examined))], (v) => `${num(v)} places`, 1),
    explain: `The search opens the closest node first and checks every place in each leaf it opens, stopping once ${nearest} places are nearer than anything unopened: ${num(run.visited)} nodes and ${num(run.examined)} places a query on average. Big leaves mean fewer nodes but more places checked per leaf; tiny leaves mean more nodes to walk for each place.`,
  };
}
