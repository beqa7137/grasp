import { TestBed } from '@angular/core/testing';
import { getAlgorithm } from '@grasp/engine';
import { GraphViewComponent } from './graph-view.component';
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

describe('structure views render real traces', () => {
  it('table: marks the active cell and its dependencies, with the DP legend by default', () => {
    const frames = getAlgorithm('lcs')!.trace({ a: 'AB', b: 'B' });
    const frame = frames.find((f) => f.table?.active && f.table.deps?.length)!;
    const fixture = TestBed.createComponent(TableViewComponent);
    fixture.componentRef.setInput('view', frame.table);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelectorAll('.cell[data-role="active"]')).toHaveLength(1);
    expect(el.querySelectorAll('.cell[data-role="deps"]').length).toBe(frame.table!.deps!.length);
    expect(legendOf(el)).toEqual(['current cell', 'reads from', 'answer path']);
  });

  it('table: names its highlights with the legend the tracer gives', () => {
    const frame = getAlgorithm('single-number-xor')!
      .trace({ nums: [4, 1, 4] })
      .find((f) => f.table?.deps?.length)!;
    const fixture = TestBed.createComponent(TableViewComponent);
    fixture.componentRef.setInput('view', frame.table);
    fixture.detectChanges();
    const el: HTMLElement = fixture.nativeElement;
    expect(legendOf(el)).toEqual(['bits of n that flip x', 'result']);
    expect(el.querySelector('.legend i[data-role="deps"]')).not.toBeNull();
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

  it('tree: shows the legend a tracer gives, and none without one or when turned off', () => {
    const render = (view: unknown, legend = true) => {
      const fixture = TestBed.createComponent(TreeViewComponent);
      fixture.componentRef.setInput('view', view);
      fixture.componentRef.setInput('legend', legend);
      fixture.detectChanges();
      return fixture.nativeElement as HTMLElement;
    };
    const calls = getAlgorithm('subsets-backtracking')!.trace({ nums: [1, 2] })[3].tree;
    expect(legendOf(render(calls))).toEqual(['running', 'on the call stack', 'returned']);
    expect(render(calls).querySelector('.legend i[data-state="frontier"]')).not.toBeNull();
    expect(render(calls, false).querySelector('.legend')).toBeNull();
    const heap = getAlgorithm('kth-largest')!.trace({ nums: [3, 1, 2], k: 2 })[1].tree;
    expect(render(heap).querySelector('.legend')).toBeNull();
  });
});
