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
    <div class="fit" [style.--cols]="v.colLabels.length" [style.--rows]="v.cells.length" [style.--label-chars]="labelChars()">
      <div class="table" role="table" [attr.aria-label]="ariaLabel()">
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
    .fit {
      --cap: calc((var(--cols) + 1) * 46px + 4px);
      --cell-text: clamp(10px, 2.4vw, 14px);
    }
    /*
     * The padding holds the active cell's scale-up, so a table as wide as its container never overflows it. The row
     * headers' column never gets narrower than its longest label, which takes the room from the cells.
     */
    .table {
      display: grid;
      grid-template-columns: minmax(max-content, 1fr) repeat(var(--cols), minmax(0, 1fr));
      gap: 3px;
      padding-inline: 2px;
      max-width: var(--cap);
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
      font: 600 var(--cell-text) / 1 var(--g-font-mono);
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
    /*
     * In the player's stage the table's box and its legend join the stage's column, whose height is fixed: the box starts
     * as tall as the table at its full width and gives the views above it and the legend, on as many lines as it wraps to,
     * the room they need, down to cells 1.6 times their text and as wide as the longest column label (7.2px a character
     * of its 12px mono font, and 4px), which never asks for more than the drawing floor of their full 46px; the square
     * cells then shrink until the table fits the box. Under the 22px header row each row is a cell and a 3px gap, the row
     * headers taking the cells' height.
     */
    @container stage (height > 0px) {
      :host {
        display: contents;
      }
      .fit {
        --full: calc(22px + var(--rows) * (min(100cqw, var(--cap)) - 1px) / (var(--cols) + 1));
        container-type: size;
        flex: 0 1 var(--full);
        min-height: min(
          var(--full),
          calc(
            22px + var(--rows) *
              (max(1.6 * var(--cell-text), min(var(--label-chars) * 7.2px + 4px, var(--g-drawing-floor, 0) * 46px)) + 3px)
          )
        );
      }
      .table {
        max-width: min(var(--cap), calc((100cqh - 22px) * (var(--cols) + 1) / var(--rows) + 1px));
      }
      .head.row {
        min-height: 0;
      }
      /* The column's own 10px gap comes first. */
      g-legend {
        --g-legend-gap: 4px;
      }
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

  readonly labelChars = computed(() => Math.max(1, ...this.view().colLabels.map((label) => [...label].length)));

  readonly activeRow = computed(() => this.view().active?.[0] ?? null);
  readonly activeCol = computed(() => this.view().active?.[1] ?? null);

  readonly ariaLabel = computed(() => {
    const v = this.view();
    const active = v.active ? `, current cell row ${v.active[0]} column ${v.active[1]}` : '';
    return `Table with ${v.cells.length} rows and ${v.colLabels.length} columns${active}`;
  });
}
