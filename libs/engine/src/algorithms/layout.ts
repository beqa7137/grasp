import type { Edge } from './input.js';

export interface Point {
  x: number;
  y: number;
}

/** Evenly spaced on a circle inside the unit box, starting at the top. */
export function circleLayout(n: number): Point[] {
  return Array.from({ length: n }, (_, i) => {
    const angle = -Math.PI / 2 + (2 * Math.PI * i) / n;
    return { x: 0.5 + 0.42 * Math.cos(angle), y: 0.5 + 0.42 * Math.sin(angle) };
  });
}

/**
 * Left-to-right layers by longest path from a source, so every edge of a DAG points rightwards.
 * Returns null when the graph has a cycle.
 */
export function layeredLayout(n: number, edges: Edge[]): Point[] | null {
  const indeg = Array(n).fill(0);
  const adj: number[][] = Array.from({ length: n }, () => []);
  for (const [u, v] of edges) {
    adj[u].push(v);
    indeg[v]++;
  }
  const layer = Array(n).fill(0);
  const queue = [...Array(n).keys()].filter((v) => indeg[v] === 0);
  let seen = 0;
  while (queue.length) {
    const u = queue.shift()!;
    seen++;
    for (const v of adj[u]) {
      layer[v] = Math.max(layer[v], layer[u] + 1);
      if (--indeg[v] === 0) queue.push(v);
    }
  }
  if (seen < n) return null;
  const layers = Math.max(...layer) + 1;
  const rows = new Map<number, number[]>();
  layer.forEach((l, v) => rows.set(l, [...(rows.get(l) ?? []), v]));
  const points: Point[] = Array.from({ length: n }, () => ({ x: 0, y: 0 }));
  for (const [l, members] of rows) {
    members.forEach((v, i) => {
      points[v] = { x: layers === 1 ? 0.5 : 0.08 + (0.84 * l) / (layers - 1), y: (i + 1) / (members.length + 1) };
    });
  }
  return points;
}
