import { rangeOf } from '../../algorithms/input.js';
import { randInt, shuffle } from '../../algorithms/random.js';

export function randomEdges(rand: () => number, n: number, count: number, directed: boolean): number[][] {
  const seen = new Set<string>();
  const edges: number[][] = [];
  for (let tries = 0; edges.length < count && tries < count * 4 + 20; tries++) {
    const a = randInt(rand, 0, n - 1);
    const b = randInt(rand, 0, n - 1);
    const id = directed ? `${a}>${b}` : `${Math.min(a, b)}-${Math.max(a, b)}`;
    if (a === b || seen.has(id)) continue;
    seen.add(id);
    edges.push([a, b]);
  }
  return edges;
}

/** Prerequisite pairs [a, b] (b before a) that follow a hidden order, optionally with one edge that closes a cycle. */
export function randomDag(rand: () => number, n: number, count: number, cyclic: boolean): number[][] {
  const rank = shuffle(
    rand,
    Array.from({ length: n }, (_, i) => i),
  );
  const pairs = randomEdges(rand, n, count, false).map(([x, y]) => (rank[x] < rank[y] ? [y, x] : [x, y]));
  if (cyclic && pairs.length) {
    const [a, b] = pairs[randInt(rand, 0, pairs.length - 1)];
    const reverse = pairs.findIndex(([x, y]) => x === b && y === a);
    if (reverse === -1) pairs.push([b, a]);
  }
  return pairs;
}

export function randomWeighted(rand: () => number, n: number, count: number): number[][] {
  return randomEdges(rand, n, count, true).map(([u, v]) => [u + 1, v + 1, randInt(rand, 0, 100)]);
}

/** Two different nodes from `nodes` that no edge in `edges` joins yet. */
function unjoinedPair(rand: () => number, nodes: readonly number[], edges: readonly number[][]): number[] {
  for (;;) {
    const a = nodes[randInt(rand, 0, nodes.length - 1)];
    const b = nodes[randInt(rand, 0, nodes.length - 1)];
    if (a !== b && !edges.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) return [a, b];
  }
}

const eitherWay = (rand: () => number, a: number, b: number) => (rand() < 0.5 ? [a, b] : [b, a]);

/** A random tree on the nodes 1 to n plus one extra edge, shuffled, each edge written in a random direction. */
export function treePlusEdge(rand: () => number, n: number): number[][] {
  const labels = shuffle(rand, rangeOf(1, n));
  const edges = labels.slice(1).map((v, i) => [labels[randInt(rand, 0, i)], v]);
  edges.push(unjoinedPair(rand, labels, edges));
  return shuffle(rand, edges).map(([a, b]) => eitherWay(rand, a, b));
}

/**
 * n / 2 separate pairs, then edges that join one pair at a time to a growing tree, each written in a random direction;
 * the extra edge comes after 95% of the joins. Searching the graph built so far from the same end of every edge, first or
 * second, then visits about (n / 2)² / 2 nodes, even when it searches only once both nodes already have an edge.
 */
export function joinedPairs(rand: () => number, n: number): number[][] {
  const labels = shuffle(rand, rangeOf(1, n));
  const pairs: number[][] = [];
  for (let i = 0; i < n; i += 2) pairs.push(eitherWay(rand, labels[i], labels[i + 1]));
  const tree = labels.slice(0, 2);
  const joins: number[][] = [];
  const extraAt = Math.floor(0.95 * (n / 2));
  for (let i = 1; i < n / 2; i++) {
    if (i === extraAt) joins.push(unjoinedPair(rand, tree, [...pairs, ...joins]));
    joins.push(eitherWay(rand, tree[randInt(rand, 0, tree.length - 1)], labels[2 * i + randInt(rand, 0, 1)]));
    tree.push(labels[2 * i], labels[2 * i + 1]);
  }
  return [...pairs, ...joins];
}
