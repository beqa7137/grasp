import { type Type } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { Locator } from '@grasp/engine';
import { ArrayViewComponent } from './array-view.component';
import { DIM_CELL, dims, type Focus } from './dim';
import { GraphViewComponent } from './graph-view.component';
import { GridViewComponent } from './grid-view.component';
import { NODE_STYLES } from './node-styles';
import { TableViewComponent } from './table-view.component';
import { TreeViewComponent } from './tree-view.component';

function render<T>(component: Type<T>, view: unknown, focus: Focus): HTMLElement {
  const fixture = TestBed.createComponent(component);
  fixture.componentRef.setInput('view', view);
  fixture.componentRef.setInput('focus', focus);
  fixture.detectChanges();
  return fixture.nativeElement;
}

const dimmed = (host: HTMLElement, selector: string) => [...host.querySelectorAll(selector)].map((el) => el.classList.contains('dim'));

describe('dims', () => {
  const focus: Locator[] = [
    { view: 'array', at: 2 },
    { view: 'table', at: [1, 0] },
    { view: 'graph', id: 'b' },
  ];

  it('dims what a focus leaves out, matching by view and place', () => {
    expect(dims(focus, { view: 'array', at: 2 })).toBe(false);
    expect(dims(focus, { view: 'array', at: 3 })).toBe(true);
    expect(dims(focus, { view: 'table', at: [1, 0] })).toBe(false);
    expect(dims(focus, { view: 'table', at: [0, 1] })).toBe(true);
    expect(dims(focus, { view: 'grid', at: [1, 0] }), 'another view at the same place').toBe(true);
    expect(dims(focus, { view: 'graph', id: 'b' })).toBe(false);
    expect(dims(focus, { view: 'tree', id: 'b' })).toBe(true);
  });

  it('never dims the current element, or anything without a focus', () => {
    expect(dims(focus, { view: 'array', at: 3 }, true)).toBe(false);
    expect(dims(null, { view: 'array', at: 3 })).toBe(false);
    expect(dims([], { view: 'array', at: 3 })).toBe(false);
  });

  it('fades fills and strokes, never text, which takes the discarded ink', () => {
    expect(DIM_CELL).toContain('opacity: calc(1 - var(--g-viz-dim))');
    expect(DIM_CELL).toMatch(/\.dim::before \{[^}]*z-index: -1;/);
    expect(NODE_STYLES).toMatch(
      /\.node\.dim :is\(\.body, \.ring\) \{\s*fill-opacity: var\(--g-viz-dim\);\s*stroke-opacity: var\(--g-viz-dim\);\s*\}/,
    );
    expect(NODE_STYLES).toMatch(/\.node\.dim :is\(\.label, \.badge\) \{\s*fill: var\(--g-viz-discarded-ink\);\s*\}/);
  });
});

describe('a checkpoint focus on the views', () => {
  beforeEach(() =>
    vi.stubGlobal(
      'ResizeObserver',
      class {
        observe() {}
        disconnect() {}
      },
    ),
  );
  afterEach(() => vi.unstubAllGlobals());

  it('dims array cells outside it, but not the current one', () => {
    const view = { values: [5, 6, 7, 8], pointers: {}, active: [0] };
    const host = render(ArrayViewComponent, view, [{ view: 'array', at: 2 }]);
    expect(dimmed(host, '.cell')).toEqual([false, true, false, true]);
    expect(dimmed(render(ArrayViewComponent, view, null), '.cell')).toEqual([false, false, false, false]);
  });

  it('dims grid and table cells by row and column', () => {
    const grid = {
      cells: [
        ['empty', 'current'],
        ['empty', 'wall'],
      ],
      distances: [
        [null, 0],
        [null, null],
      ],
    };
    expect(dimmed(render(GridViewComponent, grid, [{ view: 'grid', at: [1, 0] }]), '.cell')).toEqual([true, false, false, true]);

    const table = {
      rowLabels: ['a', 'b'],
      colLabels: ['x', 'y'],
      cells: [
        [1, 2],
        [3, null],
      ],
      active: [0, 0],
    };
    expect(dimmed(render(TableViewComponent, table, [{ view: 'table', at: [1, 0] }]), '.cell')).toEqual([false, true, false, true]);
  });

  it('dims graph nodes and the edges not between two focused nodes, and tree nodes', () => {
    const graph = {
      nodes: [
        { id: 'a', label: 'A', x: 0, y: 0, state: 'active' },
        { id: 'b', label: 'B', x: 1, y: 0 },
        { id: 'c', label: 'C', x: 0, y: 1 },
      ],
      edges: [
        { from: 'a', to: 'b', directed: false },
        { from: 'b', to: 'c', directed: false },
      ],
    };
    const host = render(GraphViewComponent, graph, [{ view: 'graph', id: 'b' }]);
    expect(dimmed(host, '.node')).toEqual([false, false, true]);
    expect(dimmed(host, '.edge')).toEqual([false, true]);

    const tree = {
      nodes: [
        { id: 'r', label: '1', parent: null, state: 'active' },
        { id: 'l', label: '2', parent: 'r' },
        { id: 'q', label: '3', parent: 'r' },
      ],
    };
    expect(dimmed(render(TreeViewComponent, tree, [{ view: 'tree', id: 'q' }]), '.node')).toEqual([false, true, false]);
  });
});
