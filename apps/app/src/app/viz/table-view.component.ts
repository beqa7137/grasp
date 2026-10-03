import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { TableLegend, TableView } from '@grasp/engine';
import { LegendComponent } from './legend.component';

type CellRole = keyof TableLegend;

const key = ([r, c]: [number, number]) => `${r},${c}`;

@Component({
  selector: 'g-table-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LegendComponent],
  template: `
    @let v = view();
    <div class="table" role="table" [attr.aria-label]="ariaLabel()" [style.--cols]="v.colLabels.length" [style.--rows]="v.cells.length">
      <div role="row">
        <div class="corner" role="cell"></div>
        @for (label of v.colLabels; track $index) {
          <div class="head col" role="columnheader" [class.hot]="activeCol() === $index">{{ label }}</div>
        }
      </div>
      @for (row of v.cells; track r; let r = $index) {
        <div role="row">
          <div class="head row" role="rowheader" [class.hot]="activeRow() === r">{{ v.rowLabels[r] }}</div>
          @for (cell of row; track c; let c = $index) {
            <div class="cell" role="cell" [attr.data-role]="roles().get(r + ',' + c)" [class.empty]="cell === null">
              {{ cell ?? '' }}
            </div>
          }
        </div>
      }
    </div>
    @if (legend()) {
      <g-legend [legend]="view().legend" swatch="role" />
    }
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
    }
    /*
     * The padding holds the active cell's scale-up, so a table as wide as its container never overflows it. The row
     * headers' column never gets narrower than its longest label, which takes the room from the cells. Inside a stage of
     * fixed height (a size container, as in the player) the square cells also shrink until the table and its legend fit
     * its height; with no such container cqh is the viewport's height, which leaves the width alone.
     */
    .table {
      display: grid;
      grid-template-columns: minmax(max-content, 1fr) repeat(var(--cols), minmax(0, 1fr));
      gap: 3px;
      padding-inline: 2px;
      max-width: min(calc((var(--cols) + 1) * 46px + 4px), calc((100cqh - 72px) * (var(--cols) + 1) / (var(--rows) + 1)));
      margin: 0 auto;
    }
    /* Rows exist for assistive tech; the cells lay out on the table's grid. */
    [role='row'] {
      display: contents;
    }
    .head,
    .corner {
      white-space: nowrap;
      display: grid;
      place-items: center;
      font: 600 12px/1 var(--g-font-mono);
      color: var(--g-muted);
      min-height: 22px;
      border-radius: 6px;
      transition:
        color 0.2s,
        background 0.2s;
    }
    .head.hot {
      color: var(--g-active);
      background: rgba(var(--g-active-rgb), 0.1);
    }
    .cell {
      white-space: nowrap;
      aspect-ratio: 1;
      display: grid;
      place-items: center;
      border-radius: 7px;
      background: var(--g-raised);
      border: 1px solid var(--g-line-strong);
      font: 600 clamp(10px, 2.4vw, 14px) / 1 var(--g-font-mono);
      color: var(--g-text);
      transition:
        background 0.25s,
        border-color 0.25s,
        transform 0.25s;
    }
    .cell.empty {
      background: transparent;
      border-style: dashed;
      border-color: var(--g-line);
    }
    .cell[data-role='deps'] {
      border-color: var(--g-pointer);
      box-shadow: inset 0 0 0 1px var(--g-pointer);
      color: var(--g-pointer);
    }
    .cell[data-role='active'] {
      background: var(--g-state-current);
      border-color: var(--g-state-current);
      color: var(--g-state-current-ink);
      transform: scale(1.06);
    }
    .cell[data-role='path'] {
      background: var(--g-state-path-fill);
      border-color: var(--g-state-path-line);
      color: var(--g-found-ink);
    }
    g-legend {
      --g-legend-gap: 14px;
    }
  `,
})
export class TableViewComponent {
  readonly view = input.required<TableView>();
  readonly legend = input(true);

  readonly roles = computed(() => {
    const v = this.view();
    const roles = new Map<string, CellRole>();
    for (const cell of v.path ?? []) roles.set(key(cell), 'path');
    for (const cell of v.deps ?? []) roles.set(key(cell), 'deps');
    if (v.active) roles.set(key(v.active), 'active');
    return roles;
  });

  readonly activeRow = computed(() => this.view().active?.[0] ?? null);
  readonly activeCol = computed(() => this.view().active?.[1] ?? null);

  readonly ariaLabel = computed(() => {
    const v = this.view();
    const active = v.active ? `, current cell row ${v.active[0]} column ${v.active[1]}` : '';
    return `Table with ${v.cells.length} rows and ${v.colLabels.length} columns${active}`;
  });
}
