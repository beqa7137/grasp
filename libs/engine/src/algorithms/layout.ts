import type { Edge } from './input.js';

export interface Point {
  x: number;
  y: number;
}

/** The graph view spreads the unit box over this many SVG units and draws each node as a circle of GRAPH_NODE_RADIUS. */
export const GRAPH_BOX = { width: 280, height: 210 };
export const GRAPH_NODE_RADIUS = 16;

const MAX_LIST_COLUMNS = 6;
const MAX_LIST_SPACING = 80;
const LIST_ROW_SPACING = 84;
const LINK_CLEARANCE = 6;

type Cell = [col: number, row: number];

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

/**
 * The list reads left to right along the top row. A loop continues as a two-row ring whose last node sits right under the
 * node it links back to, so the back edge is short and straight. A long list without a loop wraps onto the second row.
 */
function listCells(n: number, pos: number): Cell[] {
  const top = pos < 0 ? Math.min(n, MAX_LIST_COLUMNS - 1) : pos + Math.ceil((n - pos) / 2);
  const cells = Array.from({ length: n }, (_, i): Cell => (i < top ? [i, 0] : [pos < 0 ? 2 * top - 1 - i : n - 1 - i + pos, 1]));
  // A tail too long for the top row starts one row down, under the node it links to.
  return top > MAX_LIST_COLUMNS ? cells.map(([col, row], i): Cell => (i === 0 ? [0, 1] : [col - 1, row])) : cells;
}

const columnSpacing = (cols: number) => (cols > 1 ? Math.min(MAX_LIST_SPACING, GRAPH_BOX.width / (cols - 1)) : 0);

/** Cells centered in the unit box, spaced in GRAPH_BOX units so the grid stays square. */
function placeCells(cells: Cell[], rowSpacing = LIST_ROW_SPACING): Point[] {
  const cols = Math.max(...cells.map(([col]) => col)) + 1;
  const rows = Math.max(...cells.map(([, row]) => row)) + 1;
  const spacing = columnSpacing(cols);
  const round = (v: number) => Math.round(v * 1000) / 1000;
  return cells.map(([col, row]) => ({
    x: round(0.5 + ((col - (cols - 1) / 2) * spacing) / GRAPH_BOX.width),
    y: round(0.5 + ((row - (rows - 1) / 2) * rowSpacing) / GRAPH_BOX.height),
  }));
}

/** A linked list of n nodes whose last node links back to index pos (-1 for none). */
export function listLayout(n: number, pos: number): Point[] {
  return placeCells(listCells(n, pos));
}

/**
 * A list of n nodes, one column each, with nodes first to last dropped to a second row. The rows sit far enough apart
 * that a link from the node before the dip to its last node, or from its first node to the node after it, clears the
 * dipped nodes it passes by LINK_CLEARANCE.
 */
export function dipLayout(n: number, first: number, last: number): Point[] {
  const spacing = columnSpacing(n);
  const clear = GRAPH_NODE_RADIUS + LINK_CLEARANCE;
  const span = last - first + 1;
  const needed = spacing > clear ? Math.ceil((clear * span * spacing) / Math.sqrt(spacing ** 2 - clear ** 2)) : 0;
  const rowSpacing = Math.max(LIST_ROW_SPACING, needed);
  return placeCells(
    Array.from({ length: n }, (_, i): Cell => [i, i >= first && i <= last ? 1 : 0]),
    rowSpacing,
  );
}
