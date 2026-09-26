import { ErrorHandler, type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ALGORITHMS, GRAPH_NODE_RADIUS, getAlgorithm, mulberry32, type LevelOrder, type TreeView } from '@grasp/engine';
import { traceJs } from '../code/execute-js';
import { toFrames } from '../code/trace-frames';
import { exampleTree } from '../code/tree-frames';
import { ArrayViewComponent, longestValue } from './array-view.component';
import { GraphViewComponent } from './graph-view.component';
import { LegendComponent } from './legend.component';
import { ListViewComponent } from './list-view.component';
import { TableViewComponent } from './table-view.component';
import type { Point } from './geometry';
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

/** Points along a drawn edge, M…L… or M…Q…, at most 2 px apart, so none can skip past a badge. */
function pathPoints(d: string) {
  const [sx, sy, ...rest] = d.match(/-?\d+(?:\.\d+)?/g)!.map(Number);
  const [cx, cy, ex, ey] = rest.length === 4 ? rest : [(sx + rest[0]) / 2, (sy + rest[1]) / 2, rest[0], rest[1]];
  const pieces = Math.max(1, Math.ceil((Math.hypot(cx - sx, cy - sy) + Math.hypot(ex - cx, ey - cy)) / 2));
  return Array.from({ length: pieces + 1 }, (_, k) => {
    const t = k / pieces;
    return { x: (1 - t) ** 2 * sx + 2 * (1 - t) * t * cx + t ** 2 * ex, y: (1 - t) ** 2 * sy + 2 * (1 - t) * t * cy + t ** 2 * ey };
  });
}

// A badge is 11px monospace text, about 0.6em per character.
const badgeHalfWidth = (badge: string) => badge.length * 3.3;
const BADGE_HALF_HEIGHT = 5.5;

interface DrawnBadge extends Point {
  badge: string;
}

const onPath = (paths: Point[][], { x, y, badge }: DrawnBadge) =>
  paths.some((points) => points.some((p) => Math.abs(p.x - x) <= badgeHalfWidth(badge) && Math.abs(p.y - y) <= BADGE_HALF_HEIGHT));
const badgesOverlap = (a: DrawnBadge, b: DrawnBadge) =>
  Math.abs(a.x - b.x) < badgeHalfWidth(a.badge) + badgeHalfWidth(b.badge) && Math.abs(a.y - b.y) < 2 * BADGE_HALF_HEIGHT;
const onNode = (a: DrawnBadge, node: Point) =>
  Math.abs(a.x - node.x) < badgeHalfWidth(a.badge) + GRAPH_NODE_RADIUS && Math.abs(a.y - node.y) < BADGE_HALF_HEIGHT + GRAPH_NODE_RADIUS;

/** Badges on an edge, from the positions the graph view draws. */
function badgesOnEdges(id: string): string[] {
  const algo = getAlgorithm(id)!;
  return algo.trace(algo.defaultInput).flatMap((frame, k) => {
    const fixture = TestBed.createComponent(GraphViewComponent);
    fixture.componentRef.setInput('view', frame.graph);
    const { nodes, edges } = fixture.componentInstance;
    const paths = edges().map((e) => pathPoints(e.d));
    return nodes().flatMap(({ x, badge, badgeY, label }) =>
      badge && onPath(paths, { x, y: badgeY, badge }) ? [`${id} frame ${k}: badge ${badge} of node ${label}`] : [],
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
        const drawn = { x: a.x, y: a.badgeY, badge };
        const overBadges = nodes
          .slice(i + 1)
          .flatMap((b) =>
            b.badge && badgesOverlap(drawn, { x: b.x, y: b.badgeY, badge: b.badge })
              ? [`${where}: badges of nodes ${a.label} and ${b.label} overlap`]
              : [],
          );
        const overNodes = nodes.flatMap((b) =>
          a.badgeY < a.y && b !== a && onNode(drawn, b) ? [`${where}: badge of node ${a.label} moved onto node ${b.label}`] : [],
        );
        return [...overBadges, ...overNodes];
      });
    }),
  );
}

/** Tree badges on a link, over a node or another badge, or outside the drawing, from the layout the tree view draws. */
function treeBadgeClashes(tree: TreeView): string[] {
  const { nodes, links, width, height } = layoutForest(tree);
  const paths = links.map(({ x1, y1, x2, y2 }) => pathPoints(`M${x1},${y1} L${x2},${y2}`));
  return nodes.flatMap((a, i) => {
    const { badge, badgeAt } = a;
    if (!badge) return [];
    const drawn = { ...badgeAt, badge };
    const w = badgeHalfWidth(badge);
    const clashes = {
      'on a link': onPath(paths, drawn),
      'over a node': nodes.some((b) => b !== a && onNode(drawn, b)),
      'over a badge': nodes.slice(i + 1).some((b) => b.badge && badgesOverlap(drawn, { ...b.badgeAt, badge: b.badge })),
      outside: drawn.x - w < 0 || drawn.x + w > width || drawn.y - BADGE_HALF_HEIGHT < 0 || drawn.y + BADGE_HALF_HEIGHT > height,
    };
    return Object.entries(clashes).flatMap(([clash, found]) => (found ? [`badge ${badge} of node ${a.label} ${clash}`] : []));
  });
}

const treeOf = (...nodes: [id: string, parent: string | null, badge?: string][]): TreeView => ({
  nodes: nodes.map(([id, parent, badge]) => ({ id, label: id, parent, badge })),
});

/** The tree a code trace draws for these values, with one pointer badge on the node labelled `label`. */
const codeTree = (values: LevelOrder, label: string, badge: string): TreeView => ({
  nodes: exampleTree(values)!.nodes.map((n) => (n.label === label ? { ...n, badge } : n)),
});

const TRACED_TREE_CODE: [entry: string, code: string][] = [
  [
    'diameterOfBinaryTree',
    `function diameterOfBinaryTree(root) {
  let best = 0;
  const height = (node) => {
    if (!node) return 0;
    const left = height(node.left);
    const right = height(node.right);
    best = Math.max(best, left + right);
    return 1 + Math.max(left, right);
  };
  height(root);
  return best;
}`,
  ],
  [
    'inorderTraversal',
    `function inorderTraversal(root) {
  const out = [];
  const stack = [];
  let curr = root;
  while (curr || stack.length) {
    while (curr) {
      stack.push(curr);
      curr = curr.left;
    }
    curr = stack.pop();
    out.push(curr.val);
    curr = curr.right;
  }
  return out;
}`,
  ],
  [
    'lowestCommonAncestor',
    `function lowestCommonAncestor(root) {
  const p = root.left;
  const q = root.right;
  const walk = (node) => {
    if (!node || node === p || node === q) return node;
    const left = walk(node.left);
    const right = walk(node.right);
    return left && right ? node : left || right;
  };
  return walk(root);
}`,
  ],
];
const TRACED_TREES = [
  [1, 2, 3, 4, 5],
  [1, 2, null, 3, 4, 5, null, null, 6],
  [3, 9, 20, null, null, 15, 7],
  [1, null, 2, null, 3],
  [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15],
];

/** jsdom lays nothing out, so it has no ResizeObserver: this one reports only when a test says the view resized. */
class FakeResizeObserver {
  static observers: FakeResizeObserver[] = [];
  constructor(readonly report: () => void) {
    FakeResizeObserver.observers.push(this);
  }
  observe() {}
  disconnect() {}
}

function render(component: Type<unknown>, view: unknown, legend = true): HTMLElement {
  const fixture = TestBed.createComponent(component);
  fixture.componentRef.setInput('view', view);
  fixture.componentRef.setInput('legend', legend);
  fixture.detectChanges();
  return fixture.nativeElement;
}

/** Where the tree view draws each badge: above or below its node, and left or right only when the whole badge clears the node's centre. */
function badgeSpots(tree: TreeView): string[] {
  return [...render(TreeViewComponent, tree).querySelectorAll('g.node')].flatMap((node) => {
    const badge = node.querySelector('text.badge');
    if (!badge) return [];
    const [x, y] = ['cx', 'cy'].map((name) => Number(node.querySelector('circle.body')!.getAttribute(name)));
    const [badgeX, badgeY] = ['x', 'y'].map((name) => Number(badge.getAttribute(name)));
    const half = badgeHalfWidth(badge.textContent!.trim());
    const side = badgeX + half < x ? ' left' : badgeX - half > x ? ' right' : badgeX === x ? '' : ' off centre';
    return [`${node.querySelector('text.label')!.textContent} ${badgeY < y ? 'above' : 'below'}${side}`];
  });
}

describe('structure views render real traces', () => {
  beforeEach(() => {
    FakeResizeObserver.observers = [];
    vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  });
  afterEach(() => vi.unstubAllGlobals());

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

  for (const { rule, tree, spots } of [
    {
      rule: 'above a node, else beside it away from its link, and below a leaf',
      tree: treeOf(['r', null, 'root'], ['a', 'r', 'node'], ['b', 'r'], ['a1', 'a', 'leaf'], ['a2', 'a']),
      spots: ['r above', 'a above left', 'a1 below'],
    },
    {
      rule: 'below a leaf even when its link leaves room above',
      tree: treeOf(['r', null], ['a', 'r', 'x'], ['b', 'r']),
      spots: ['a below'],
    },
    {
      rule: 'below a node when its link crosses the spot above and its children leave room below',
      tree: treeOf(['r', null], ['l', 'r'], ['a', 'r', 'ab'], ['m', 'r'], ['b', 'a'], ['c', 'a'], ['b1', 'b'], ['b2', 'b']),
      spots: ['a below'],
    },
    {
      rule: 'beside a node rather than above it when its link only just misses the badge',
      tree: treeOf(['r', null], ['a', 'r', 'ab'], ['b', 'r'], ['a1', 'a']),
      spots: ['a above left'],
    },
    {
      rule: 'beside a node when the spot above sticks out of the drawing',
      tree: treeOf(['r1', null, 'root, node, curr'], ['r2', null], ['r3', null]),
      spots: ['r1 above right'],
    },
    {
      rule: 'at its first spot, on a link, when every spot inside the drawing crosses one',
      tree: codeTree([1, 2, null, 3], '2', 'currentNode'),
      spots: ['2 above'],
    },
    {
      rule: 'at its first spot, past the edge of the drawing, when every spot inside it crosses a link',
      tree: codeTree([1, 2, null, 3], '3', 'prev, curr, node'),
      spots: ['3 below'],
    },
  ]) {
    it(`tree: draws a badge ${rule}`, () => {
      expect(badgeSpots(tree)).toEqual(spots);
    });
  }

  it('tree: keeps badges off links, nodes and other badges, and inside the drawing, in every tree visualizer', () => {
    const rand = mulberry32(777);
    const seen = new Set<string>();
    const clashes = ALGORITHMS.filter((algo) => algo.trace(algo.defaultInput).some((frame) => frame.tree)).flatMap((algo) =>
      [algo.defaultInput, ...Array.from({ length: 20 }, () => algo.validate(algo.randomInput(rand)))].flatMap((input) =>
        algo.trace(input).flatMap((frame, k) => {
          const key = JSON.stringify(frame.tree);
          if (!frame.tree || seen.has(key)) return [];
          seen.add(key);
          return treeBadgeClashes(frame.tree).map((clash) => `${algo.id} ${JSON.stringify(input)} frame ${k}: ${clash}`);
        }),
      ),
    );
    expect(clashes).toEqual([]);
  });

  it('tree: keeps badges off links, nodes and other badges, and inside the drawing, in traced code and a crowded forest', () => {
    const traced = TRACED_TREE_CODE.flatMap(([entry, code]) =>
      TRACED_TREES.flatMap((input) =>
        toFrames(traceJs(code, 'javascript', entry, ['tree'], [input], 2000), [{ name: 'root', type: 'tree' }]).flatMap((frame, k) =>
          frame.tree ? treeBadgeClashes(frame.tree).map((clash) => `${entry} ${JSON.stringify(input)} frame ${k}: ${clash}`) : [],
        ),
      ),
    );
    const forest = treeOf(...['r1', 'r2', 'r3', 'r4'].map((id): [string, null, string] => [id, null, 'slow, fast']));
    expect([...traced, ...treeBadgeClashes(forest)]).toEqual([]);
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

  it("tree: counts the nodes in each state in its label, in the legend's words", () => {
    const nodes: TreeView['nodes'] = [
      { id: 'a', label: '1', parent: null, state: 'frontier' },
      { id: 'b', label: '2', parent: 'a', state: 'frontier' },
      { id: 'c', label: '3', parent: 'a', state: 'done' },
      { id: 'd', label: '4', parent: 'b', state: 'active' },
      { id: 'e', label: '5', parent: 'b', state: 'idle' },
    ];
    const label = (view: TreeView) => render(TreeViewComponent, view).querySelector('svg')!.getAttribute('aria-label');
    const legend = { active: 'a variable points here', frontier: 'on the call stack', done: 'returned', idle: 'not visited yet' };
    expect(label({ nodes, legend })).toBe('Tree with 5 nodes, current node 4, 2 on the call stack, 1 returned');
    expect(label({ nodes })).toBe('Tree with 5 nodes, current node 4');
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

  it('array: sizes every cell for the longest value, in either row or in any frame the page will show', () => {
    const fixture = TestBed.createComponent(ArrayViewComponent);
    fixture.componentRef.setInput('view', { values: [-100, -50, 1, 3, 5, 8, 13, 21, 34, 55, 89, 144], pointers: { lo: 0, hi: 11 } });
    fixture.detectChanges();
    const track: HTMLElement = fixture.nativeElement.querySelector('.track');
    expect(track.style.getPropertyValue('--chars')).toBe('4');
    fixture.componentRef.setInput('view', { values: [7, 2], pointers: {} });
    fixture.detectChanges();
    expect(track.style.getPropertyValue('--chars')).toBe('1');
    fixture.componentRef.setInput('aligned', { label: 'next greater', values: [-1, -1] });
    fixture.detectChanges();
    expect(track.style.getPropertyValue('--chars')).toBe('2');
    fixture.componentRef.setInput('longest', 4);
    fixture.detectChanges();
    expect(track.style.getPropertyValue('--chars')).toBe('4');
  });

  it('array: measures the longest of any values in characters', () => {
    expect(longestValue([7, -100, 'ab', null, true])).toBe(4);
    expect(longestValue([])).toBe(1);
  });

  it('array: draws an aligned output under the array, lit where the array is settled', () => {
    const fixture = TestBed.createComponent(ArrayViewComponent);
    fixture.componentRef.setInput('view', { values: [4, 2, 5], pointers: { i: 1 }, settled: [0] });
    fixture.componentRef.setInput('aligned', { label: 'next greater', values: [5, -1, -1] });
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const [array, output] = [...el.querySelectorAll('.cells')];
    expect(el.querySelector('.row-label')!.textContent).toBe('next greater');
    expect([...output.querySelectorAll('.cell')].map((c) => c.textContent!.trim())).toEqual(['5', '-1', '-1']);
    expect([...output.querySelectorAll('.cell')].map((c) => c.classList.contains('found'))).toEqual([true, false, false]);
    expect(array.querySelector('.cell.settled')!.textContent!.trim()).toBe('4');
    expect(el.querySelectorAll('.ptr')).toHaveLength(1);
  });

  it('array: takes keyboard focus as a labelled region only while it is wider than its view, which then scrolls', () => {
    const fixture = TestBed.createComponent(ArrayViewComponent);
    fixture.componentRef.setInput('view', { values: [-999, -998, -997], pointers: {} });
    fixture.detectChanges();
    const host: HTMLElement = fixture.nativeElement;
    const resize = (scrollWidth: number) => {
      Object.defineProperty(host, 'scrollWidth', { value: scrollWidth, configurable: true });
      Object.defineProperty(host, 'clientWidth', { value: 250, configurable: true });
      FakeResizeObserver.observers.forEach((observer) => observer.report());
      fixture.detectChanges();
    };
    resize(250);
    expect(host.hasAttribute('tabindex')).toBe(false);
    expect(host.hasAttribute('role')).toBe(false);
    resize(626);
    expect(host.getAttribute('tabindex')).toBe('0');
    expect(host.getAttribute('role')).toBe('region');
    expect(host.getAttribute('aria-label')).toBe('Array');
    resize(250);
    expect(host.hasAttribute('tabindex')).toBe(false);
  });

  it('array: leaves out a pointer or active cell beyond its ends when it follows the cells a step works on', () => {
    const errors: unknown[] = [];
    TestBed.configureTestingModule({ providers: [{ provide: ErrorHandler, useValue: { handleError: (e: unknown) => errors.push(e) } }] });
    const fixture = TestBed.createComponent(ArrayViewComponent);
    fixture.componentRef.setInput('view', { values: [1, 2, 3], pointers: { lo: 1, hi: -1 } });
    TestBed.tick();
    fixture.componentRef.setInput('view', { values: [1, 2, 3], pointers: { i: 2 }, active: [-1] });
    TestBed.tick();
    expect(errors).toEqual([]);
  });

  it('list: counts the items left out below a vertical list', () => {
    const fixture = TestBed.createComponent(ListViewComponent);
    fixture.componentRef.setInput('label', 'call stack');
    fixture.componentRef.setInput('items', ['f(1)', 'f(0)']);
    fixture.componentRef.setInput('orientation', 'vertical');
    fixture.componentRef.setInput('more', 4);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect([...el.querySelectorAll('.items > *')].map((item) => item.textContent!.trim())).toEqual(['+4 more', 'f(1)', 'f(0)']);
    fixture.componentRef.setInput('more', 0);
    fixture.detectChanges();
    expect(el.querySelector('.more')).toBeNull();
  });

  it('list: is a list named by its label, and reads as its label and "empty" when there is nothing in it', () => {
    const fixture = TestBed.createComponent(ListViewComponent);
    fixture.componentRef.setInput('label', 'call stack');
    fixture.componentRef.setInput('items', ['f(1)', 'f(0)']);
    fixture.componentRef.setInput('more', 4);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    const list = el.querySelector('[role="list"]')!;
    const label = el.querySelector(`#${list.getAttribute('aria-labelledby')}`)!;
    expect(label.textContent).toBe('call stack');
    expect(label.getAttribute('aria-hidden')).toBe('true');
    expect([...list.querySelectorAll('[role="listitem"]')].map((item) => item.textContent!.trim())).toEqual(['+4 more', 'f(1)', 'f(0)']);
    fixture.componentRef.setInput('items', []);
    fixture.componentRef.setInput('more', 0);
    fixture.detectChanges();
    expect(el.querySelector('[role="list"], [aria-labelledby], [aria-hidden]')).toBeNull();
    expect(el.querySelector('.empty')!.textContent).toBe('empty');
  });
});
