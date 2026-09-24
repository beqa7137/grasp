import { describe, expect, it } from 'vitest';
import { GRAPH_BOX, listLayout, type Point } from './layout.js';

type Link = [from: number, to: number];

const clearance = (a: Point, b: Point, p: Point) => {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / (dx * dx + dy * dy)));
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
};

const side = (a: Point, b: Point, p: Point) => Math.sign((b.x - a.x) * (p.y - a.y) - (b.y - a.y) * (p.x - a.x));
const crosses = (a: Point, b: Point, c: Point, d: Point) => side(a, b, c) * side(a, b, d) < 0 && side(c, d, a) * side(c, d, b) < 0;

const nextLinks = (n: number, pos: number): Link[] => [
  ...Array.from({ length: n - 1 }, (_, i): Link => [i, i + 1]),
  ...(pos >= 0 ? [[n - 1, pos] as Link] : []),
];

function layoutProblems(n: number, pos: number): string[] {
  const nodes = listLayout(n, pos);
  const at = nodes.map(({ x, y }) => ({ x: x * GRAPH_BOX.width, y: y * GRAPH_BOX.height }));
  const links = nextLinks(n, pos);
  const problems = [
    nodes.some(({ x, y }) => x < -0.05 || x > 1.05 || y < 0 || y > 1) && 'a node leaves the drawing',
    ...at.flatMap((a, i) => at.slice(i + 1).map((b, k) => Math.hypot(a.x - b.x, a.y - b.y) < 56 && `nodes ${i} and ${i + 1 + k} crowd`)),
    ...links.flatMap(([from, to]) =>
      at.map(
        (p, node) => node !== from && node !== to && clearance(at[from], at[to], p) < 24 && `edge ${from}>${to} runs through node ${node}`,
      ),
    ),
    ...links.flatMap(([a, b], i) =>
      links.slice(i + 1).map(([c, d]) => crosses(at[a], at[b], at[c], at[d]) && `edges ${a}>${b} and ${c}>${d} cross`),
    ),
  ];
  return problems.flatMap((problem) => (problem ? [`n=${n} pos=${pos}: ${problem}`] : []));
}

describe('listLayout', () => {
  it('lays out every list size and back link with room between nodes, and edges that miss other nodes', () => {
    const problems = Array.from({ length: 8 }, (_, k) => k + 1).flatMap((n) =>
      Array.from({ length: n }, (_, k) => k - 1).flatMap((pos) => layoutProblems(n, pos)),
    );
    expect(problems).toEqual([]);
  });
});
