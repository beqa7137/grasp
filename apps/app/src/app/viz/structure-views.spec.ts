import type { Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { GRAPH_NODE_RADIUS, getAlgorithm, mulberry32 } from '@grasp/engine';
import { GraphViewComponent } from './graph-view.component';
import { LegendComponent } from './legend.component';
import { TableViewComponent } from './table-view.component';
import { TreeViewComponent, layoutForest } from './tree-view.component';

describe('layoutForest', () => {
  it('centres parents over their children and keeps sibling order', () => {
    const { nodes } = layoutForest({
      nodes: [
        { id: 'a', label: '1', parent: null },
        { id: 'b', label: '2', parent: 'a' },
        { id: 'c', label: '3', parent: 'a' },
        { id: 'd', label: '4', parent: 'b' },
      ],
    });
    const at = Object.fromEntries(nodes.map((n) => [n.id, n]));
    expect(at['b'].x).toBeLessThan(at['c'].x);
    expect(at['a'].x).toBe((at['b'].x + at['c'].x) / 2);
    expect(at['d'].y).toBeGreaterThan(at['b'].y);
    expect(at['b'].y).toBeGreaterThan(at['a'].y);
  });

  it('lays out a forest side by side and survives a cycle or a dangling parent', () => {
    const forest = layoutForest({
      nodes: [
        { id: 'x', label: 'x', parent: null },
        { id: 'y', label: 'y', parent: null },
        { id: 'z', label: 'z', parent: 'missing' },
      ],
    });
    expect(new Set(forest.nodes.map((n) => n.x)).size).toBe(3);
    expect(new Set(forest.nodes.map((n) => n.y)).size).toBe(1);

    const cyclic = layoutForest({
      nodes: [
        { id: 'p', label: 'p', parent: 'q' },
        { id: 'q', label: 'q', parent: 'p' },
      ],
    });
    expect(cyclic.nodes).toHaveLength(0);
  });
});

const legendOf = (el: HTMLElement) => [...el.querySelectorAll('.legend span')].map((span) => span.textContent!.trim());

/** Points along a drawn edge, M…L… or M…Q…, close enough together that none can skip past a badge. */
function pathPoints(d: string) {
  const [sx, sy, ...rest] = d.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
  const [cx, cy, ex, ey] = rest.length === 4 ? rest : [(sx + rest[0]) / 2, (sy + rest[1]) / 2, rest[0], rest[1]];
  return Array.from({ length: 201 }, (_, k) => {
    const t = k / 200;
    return { x: (1 - t) ** 2 * sx + 2 * (1 - t) * t * cx + t ** 2 * ex, y: (1 - t) ** 2 * sy + 2 * (1 - t) * t * cy + t ** 2 * ey };
  });
}

// A badge is 11px monospace text, about 0.6em per character.
const badgeHalfWidth = (badge: string) => badge.length * 3.3;
const BADGE_HALF_HEIGHT = 5.5;

/** Badges on an edge, from the positions the graph view draws. */
function badgesOnEdges(id: string): string[] {
  const algo = getAlgorithm(id)!;
  return algo.trace(algo.defaultInput).flatMap((frame, k) => {
    const fixture = TestBed.createComponent(GraphViewComponent);
    fixture.componentRef.setInput('view', frame.graph);
    const { nodes, edges } = fixture.componentInstance;
    const paths = edges().map((e) => pathPoints(e.d));
    const onEdge = (x: number, y: number, badge: string) =>
      paths.some((points) => points.some((p) => Math.abs(p.x - x) <= badgeHalfWidth(badge) && Math.abs(p.y - y) <= BADGE_HALF_HEIGHT));
    return nodes().flatMap(({ x, badge, badgeY, label }) =>
      badge && onEdge(x, badgeY, badge) ? [`${id} frame ${k}: badge ${badge} of node ${label}`] : [],
    );
  });
}

/** Badges drawn over another badge, or moved above their node onto another node, across random inputs. */
function crowdedBadges(id: string, count: number): string[] {
  const algo = getAlgorithm(id)!;
  const rand = mulberry32(777);
  const fixture = TestBed.createComponent(GraphViewComponent);
  return Array.from({ length: count }, () => algo.randomInput(rand)).flatMap((input) =>
    algo.trace(algo.validate(input)).flatMap((frame, k) => {
      fixture.componentRef.setInput('view', frame.graph);
      const nodes = fixture.componentInstance.nodes();
      const where = `${id} ${JSON.stringify(input)} frame ${k}`;
      return nodes.flatMap((a, i) => {
        const { badge } = a;
        if (!badge) return [];
        const overBadges = nodes
          .slice(i + 1)
          .flatMap((b) =>
            b.badge &&
            Math.abs(a.x - b.x) < badgeHalfWidth(badge) + badgeHalfWidth(b.badge) &&
            Math.abs(a.badgeY - b.badgeY) < 2 * BADGE_HALF_HEIGHT
              ? [`${where}: badges of nodes ${a.label} and ${b.label} overlap`]
              : [],
          );
        const overNodes = nodes.flatMap((b) =>
          a.badgeY < a.y &&
          b !== a &&
          Math.abs(a.x - b.x) < badgeHalfWidth(badge) + GRAPH_NODE_RADIUS &&
          Math.abs(a.badgeY - b.y) < BADGE_HALF_HEIGHT + GRAPH_NODE_RADIUS
            ? [`${where}: badge of node ${a.label} moved onto node ${b.label}`]
            : [],
        );
        return [...overBadges, ...overNodes];
      });
    }),
  );
}

function render(component: Type<unknown>, view: unknown, legend = true): HTMLElement {
  const fixture = TestBed.createComponent(component);
  fixture.componentRef.setInput('view', view);
  fixture.componentRef.setInput('legend', legend);
  fixture.detectChanges();
  return fixture.nativeElement;
}

describe('structure views render real traces', () => {
  it('table: marks the active cell and its dependencies, and names them in the legend LCS gives', () => {
    const frames = getAlgorithm('lcs')!.trace({ a: 'AB', b: 'B' });
    const frame = frames.find((f) => f.table?.active && f.table.deps?.length)!;
    const el = render(TableViewComponent, frame.table);
    expect(el.querySelectorAll('.cell[data-role="active"]')).toHaveLength(1);
    expect(el.querySelectorAll('.cell[data-role="deps"]').length).toBe(frame.table!.deps!.length);
    expect(legendOf(el)).toEqual(['current cell', 'reads from', 'answer path']);
  });

  it('table: groups its headers and cells into rows, as a table role requires', () => {
    const table = getAlgorithm('lcs')!
      .trace({ a: 'AB', b: 'B' })
      .find((f) => f.table)!.table!;
    const el = render(TableViewComponent, table);
    const rows = Array.from(el.querySelectorAll('[role="table"] > [role="row"]'));
    expect(rows).toHaveLength(table.rowLabels.length + 1);
    expect(rows[0].querySelectorAll('[role="columnheader"]')).toHaveLength(table.colLabels.length);
    for (const row of rows.slice(1)) {
      expect(row.querySelectorAll('[role="rowheader"]')).toHaveLength(1);
      expect(row.querySelectorAll('[role="cell"]')).toHaveLength(table.colLabels.length);
    }
    expect(el.querySelectorAll('[role="table"] > :not([role="row"])')).toHaveLength(0);
  });

  it('table: shows the legend a tracer gives, and none without one or when turned off', () => {
    const bits = getAlgorithm('single-number-xor')!
      .trace({ nums: [4, 1, 4] })
      .find((f) => f.table?.deps?.length)!.table!;
    const el = render(TableViewComponent, bits);
    expect(legendOf(el)).toEqual(['bits of n that flip x', 'result']);
    expect(el.querySelector('.legend i[data-role="deps"]')).not.toBeNull();
    expect(render(TableViewComponent, bits, false).querySelector('.legend')).toBeNull();
    expect(render(TableViewComponent, { ...bits, legend: undefined }).querySelector('.legend')).toBeNull();
  });

  it('graph: draws every node and edge with arrowheads only on directed edges', () => {
    const frames = getAlgorithm('topo-sort')!.trace({
      n: 3,
      edges: [
        [0, 1],
        [1, 2],
        [2, 1],
      ],
    });
    const fixture = TestBed.createComponent(GraphViewComponent);
    fixture.componentRef.setInput('view', frames[0].graph);
    fixture.componentRef.setInput('legend', false);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('g.node')).toHaveLength(3);
    const edges = [...el.querySelectorAll('path.edge')];
    expect(edges).toHaveLength(3);
    expect(edges.every((e) => e.getAttribute('marker-end')?.startsWith('url(#g-graph-'))).toBe(true);
    // 1→2 and 2→1 bend apart instead of overlapping.
    expect(edges.filter((e) => e.getAttribute('d')!.includes('Q'))).toHaveLength(2);
    expect(el.querySelector('.legend')).toBeNull();
  });

  it('graph: shows the legend a tracer gives, and none without one or when turned off', () => {
    const pointers = getAlgorithm('linked-list-cycle')!.trace({ values: [4, 7, 1], pos: 0 })[0].graph!;
    const el = render(GraphViewComponent, pointers);
    expect(legendOf(el)).toEqual(['slow', 'fast', 'slow = fast']);
    expect(el.querySelector('.legend i[data-state="frontier"]')).not.toBeNull();
    expect(render(GraphViewComponent, pointers, false).querySelector('.legend')).toBeNull();
    expect(render(GraphViewComponent, { ...pointers, legend: undefined }).querySelector('.legend')).toBeNull();
    const queue = getAlgorithm('dijkstra')!.trace({ n: 2, edges: [[0, 1, 3]], source: 0 })[0].graph;
    expect(legendOf(render(GraphViewComponent, queue))).toEqual(['current', 'queued', 'done']);
  });

  it('graph: draws a badge below its node, or above it when an edge runs through the spot below and not the one above', () => {
    const el = render(GraphViewComponent, {
      nodes: [
        { id: 'a', label: 'top', x: 0.2, y: 0, badge: 'in 0' },
        { id: 'b', label: 'middle', x: 0.2, y: 0.5, badge: 'in 1' },
        { id: 'c', label: 'bottom', x: 0.2, y: 1, badge: 'in 1' },
        { id: 'd', label: 'alone', x: 0.8, y: 0.5, badge: 'in 0' },
      ],
      edges: [
        { from: 'a', to: 'b', directed: true },
        { from: 'b', to: 'c', directed: true },
      ],
    });
    const sides = [...el.querySelectorAll('g.node')].map((node) => {
      const offset = Number(node.querySelector('text.badge')!.getAttribute('y')) - Number(node.querySelector('circle')!.getAttribute('cy'));
      return `${node.querySelector('text.label')!.textContent} ${offset < 0 ? 'above' : 'below'}`;
    });
    expect(sides).toEqual(['top above', 'middle below', 'bottom below', 'alone below']);
  });

  it('graph: keeps badges off the edges of the linked list, Dijkstra and topological sort default traces', () => {
    expect(['linked-list-cycle', 'dijkstra', 'topo-sort'].flatMap(badgesOnEdges)).toEqual([]);
  });

  it('graph: never moves a badge onto another badge or node, even when stacked layers crowd a column', () => {
    expect(crowdedBadges('topo-sort', 50)).toEqual([]);
  });

  it('legend: marks each swatch with the attribute its view styles, and shows nothing without entries', () => {
    const fixture = TestBed.createComponent(LegendComponent);
    fixture.componentRef.setInput('legend', { active: 'current cell', deps: 'reads from' });
    fixture.componentRef.setInput('swatch', 'role');
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const swatches = [...el.querySelectorAll('i')].map((i) => [i.getAttribute('data-role'), i.getAttribute('data-state')]);
    expect(swatches).toEqual([
      ['active', null],
      ['deps', null],
    ]);
    fixture.componentRef.setInput('legend', {});
    fixture.detectChanges();
    expect(el.querySelector('.legend')).toBeNull();
  });

  it('tree: rings word ends in a trie and explains the ring in its legend', () => {
    const frames = getAlgorithm('trie')!.trace({ words: ['to', 'tea'], query: 'te' });
    const last = frames.at(-1)!;
    const fixture = TestBed.createComponent(TreeViewComponent);
    fixture.componentRef.setInput('view', last.tree);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('g.node').length).toBe(last.tree!.nodes.length);
    expect(el.querySelectorAll('circle.ring')).toHaveLength(2);
    expect(el.querySelectorAll('line.link').length).toBe(last.tree!.nodes.length - 1);
    expect(legendOf(el)).toEqual(['current', 'end of a word']);
  });

  it('tree: ends each link on the edge of a node, so no link shows through a see-through state fill', () => {
    const el = render(TreeViewComponent, getAlgorithm('tree-traversal')!.trace({ values: [2, 1, 3], order: 'inorder' })[0].tree);
    const circles = [...el.querySelectorAll('circle.body')].map((c) => ['cx', 'cy', 'r'].map((name) => Number(c.getAttribute(name))));
    const onAnEdge = ([x, y]: number[]) => circles.some(([cx, cy, r]) => Math.abs(Math.hypot(x - cx, y - cy) - r) < 0.01);
    const ends = [...el.querySelectorAll('line.link')].flatMap((line) => {
      const [x1, y1, x2, y2] = ['x1', 'y1', 'x2', 'y2'].map((name) => Number(line.getAttribute(name)));
      return [
        [x1, y1],
        [x2, y2],
      ];
    });
    expect(ends.length).toBeGreaterThan(0);
    expect(ends.filter((end) => !onAnEdge(end))).toEqual([]);
  });

  it('tree: draws a blank faintly and leaves it out of the node count', () => {
    const el = render(TreeViewComponent, {
      nodes: [
        { id: 'a', label: '1', parent: null },
        { id: 'a.left', label: '·', parent: 'a', blank: true },
        { id: 'b', label: '2', parent: 'a', state: 'active' },
      ],
    });
    expect(el.querySelector('svg')!.getAttribute('aria-label')).toBe('Tree with 2 nodes, current node 2');
    expect(el.querySelectorAll('g.node')).toHaveLength(2);
    expect(el.querySelector('text.blank')!.textContent).toBe('·');
    expect(el.querySelectorAll('line.link.to-blank')).toHaveLength(1);
  });

  it('tree: shows the legend a tracer gives, and none without one or when turned off', () => {
    const calls = getAlgorithm('subsets-backtracking')!.trace({ nums: [1, 2] })[3].tree;
    const el = render(TreeViewComponent, calls);
    expect(legendOf(el)).toEqual(['running', 'on the call stack', 'returned']);
    expect(el.querySelector('.legend i[data-state="frontier"]')).not.toBeNull();
    expect(render(TreeViewComponent, calls, false).querySelector('.legend')).toBeNull();
    const bst = getAlgorithm('tree-traversal')!.trace({ values: [2, 1], order: 'inorder' })[0].tree;
    expect(render(TreeViewComponent, bst).querySelector('.legend i[data-state="idle"]')).not.toBeNull();
    const heap = getAlgorithm('kth-largest')!.trace({ nums: [3, 1, 2], k: 2 })[1].tree;
    expect(render(TreeViewComponent, heap).querySelector('.legend')).toBeNull();
  });
});
