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
    <div class="table" role="table" [attr.aria-label]="ariaLabel()" [style.--cols]="v.colLabels.length + 1">
      <div class="corner" role="columnheader"></div>
      @for (label of v.colLabels; track $index) {
        <div class="head col" role="columnheader" [class.hot]="activeCol() === $index">{{ label }}</div>
      }
      @for (row of v.cells; track r; let r = $index) {
        <div class="head row" role="rowheader" [class.hot]="activeRow() === r">{{ v.rowLabels[r] }}</div>
        @for (cell of row; track c; let c = $index) {
          <div class="cell" role="cell" [attr.data-role]="roles().get(r + ',' + c)" [class.empty]="cell === null">
            {{ cell ?? '' }}
          </div>
        }
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
    .table {
      display: grid;
      grid-template-columns: repeat(var(--cols), minmax(0, 1fr));
      gap: 3px;
      max-width: calc(var(--cols) * 46px);
      margin: 0 auto;
    }
    .head,
    .corner {
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
      background: rgba(76, 201, 240, 0.1);
    }
    .cell {
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
      background: var(--g-active);
      border-color: var(--g-active);
      color: #0b0d12;
      transform: scale(1.06);
    }
    .cell[data-role='path'] {
      background: rgba(61, 220, 151, 0.22);
      border-color: var(--g-found);
      color: var(--g-found);
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
