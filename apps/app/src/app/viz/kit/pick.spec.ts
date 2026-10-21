import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import type { ArrayView, GridView, Locator } from '@grasp/engine';
import { ArrayViewComponent } from '../array-view.component';
import { GridViewComponent } from '../grid-view.component';
import type { PickAsk, PickGhost } from './pick';

@Component({
  imports: [ArrayViewComponent, GridViewComponent],
  template: `
    <p id="ask">Tap a cell.</p>
    <g-array-view [view]="array" [pick]="ask()" [ghost]="ghost()" (picked)="picks.push($event)" />
    <g-grid-view [view]="grid" [pick]="ask()" (picked)="picks.push($event)" />
  `,
})
class Host {
  readonly array: ArrayView = { values: [2, 5, 8, 12], pointers: { mid: 1 }, active: [1] };
  readonly grid: GridView = {
    cells: [
      ['start', 'open', 'wall'],
      ['frontier', 'open', 'goal'],
    ],
    distances: [
      [0, null, null],
      [1, null, null],
    ],
  };
  readonly ask = signal<PickAsk | null>(null);
  readonly ghost = signal<PickGhost | null>(null);
  readonly picks: Locator[] = [];
}

function setup() {
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const host = fixture.componentInstance;
  const cells = (view: string) => [...root.querySelectorAll<HTMLElement>(`${view} [data-pick]`)];
  const key = (el: Element, k: string) => {
    const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true });
    el.dispatchEvent(e);
    fixture.detectChanges();
    return e;
  };
  const open = (ask: Partial<PickAsk> = {}) => {
    host.ask.set({ labelledBy: 'ask', describedBy: 'ask', count: 1, picked: [], focusAt: 1, ...ask });
    fixture.detectChanges();
    TestBed.tick();
  };
  return { fixture, host, root, cells, key, open };
}

describe('pick cells', () => {
  // jsdom lays nothing out, so it has no ResizeObserver, which the array view uses to tell when it scrolls.
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

  it('are plain cells, marked as pick targets, until an ask opens', () => {
    const { cells } = setup();
    expect(cells('g-array-view')).toHaveLength(4);
    expect(cells('g-grid-view')).toHaveLength(6);
    for (const cell of cells('g-array-view')) {
      expect(cell.getAttribute('role')).toBeNull();
      expect(cell.getAttribute('tabindex')).toBeNull();
    }
  });

  it('become a radio group named by the ask, with focus on the first cell rather than the current one', () => {
    const { root, cells, open } = setup();
    open();
    const group = root.querySelector('g-array-view [role="radiogroup"]')!;
    expect(group.getAttribute('aria-labelledby')).toBe('ask');
    const [first, ...rest] = cells('g-array-view');
    expect(first.getAttribute('role')).toBe('radio');
    expect(first.getAttribute('aria-checked')).toBe('false');
    expect(first.getAttribute('aria-label')).toBe('index 0, 2');
    expect(first.tabIndex).toBe(0);
    for (const cell of rest) expect(cell.tabIndex).toBe(-1);
    expect(document.activeElement === first || document.activeElement === cells('g-grid-view')[0]).toBe(true);
  });

  it('move with the arrows, Home and End, and pick with Enter, Space or a tap', () => {
    const { host, cells, key, open } = setup();
    open();
    const array = cells('g-array-view');
    expect(key(array[0], 'ArrowRight').defaultPrevented).toBe(true);
    expect(array[1].tabIndex).toBe(0);
    key(array[1], 'End');
    expect(array[3].tabIndex).toBe(0);
    expect(key(array[3], 'Home').defaultPrevented).toBe(true);
    key(array[0], 'ArrowLeft');
    expect(array[0].tabIndex).toBe(0);
    key(array[0], 'Enter');
    key(array[0], ' ');
    array[2].click();
    expect(host.picks).toEqual([
      { view: 'array', at: 0 },
      { view: 'array', at: 0 },
      { view: 'array', at: 2 },
    ]);
  });

  it('move by rows on a grid, and name each cell by its place and state', () => {
    const { host, cells, key, open } = setup();
    open();
    const grid = cells('g-grid-view');
    expect(grid[3].getAttribute('aria-label')).toBe('(1,0), in queue');
    key(grid[0], 'ArrowDown');
    expect(grid[3].tabIndex).toBe(0);
    key(grid[3], ' ');
    expect(host.picks).toEqual([{ view: 'grid', at: [1, 0] }]);
  });

  it('take checkboxes for a two-cell answer, checked as picked', () => {
    const { root, cells, open } = setup();
    open({ count: 2, picked: [{ view: 'array', at: 3 }] });
    expect(root.querySelector('g-array-view [role="group"]')).not.toBeNull();
    const array = cells('g-array-view');
    expect(array[3].getAttribute('role')).toBe('checkbox');
    expect(array[3].getAttribute('aria-checked')).toBe('true');
    expect(array[3].classList).toContain('picked');
  });

  it("ignore taps once the ask closes, and draw the learner's ghost, then its verdict", () => {
    const { fixture, host, cells } = setup();
    cells('g-array-view')[1].click();
    expect(host.picks).toEqual([]);
    host.ghost.set({ cells: [{ view: 'array', at: 2 }], verdict: 'pending' });
    fixture.detectChanges();
    const cell = cells('g-array-view')[2];
    expect(cell.classList).toContain('you');
    expect(cell.classList).not.toContain('you-wrong');
    host.ghost.set({ cells: [{ view: 'array', at: 2 }], verdict: 'wrong' });
    fixture.detectChanges();
    expect(cell.classList).toContain('you-wrong');
  });
});
