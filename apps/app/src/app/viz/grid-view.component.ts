import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { GridView } from '@grasp/engine';

@Component({
  selector: 'g-grid-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="grid" [style.--cols]="cols()">
      @for (row of view().cells; track r; let r = $index) {
        @for (cell of row; track c; let c = $index) {
          <div class="cell" [attr.data-state]="cell">
            @if (cell === 'start') {
              <span class="tag">S</span>
            } @else if (cell === 'goal') {
              <span class="tag">G</span>
            } @else if (view().distances[r][c] !== null && cell !== 'wall') {
              <span class="d">{{ view().distances[r][c] }}</span>
            }
          </div>
        }
      }
    </div>
    @if (legend()) {
      <div class="legend">
        <span><i data-state="frontier"></i>in queue</span>
        <span><i data-state="visited"></i>expanded</span>
        <span><i data-state="current"></i>current</span>
        <span><i data-state="path"></i>shortest path</span>
      </div>
    }
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
    }
    .grid {
      display: grid;
      grid-template-columns: repeat(var(--cols), 1fr);
      gap: 4px;
      max-width: calc(var(--cols) * 52px);
      margin: 0 auto;
    }
    .cell {
      aspect-ratio: 1;
      border-radius: 8px;
      background: var(--g-raised);
      border: 1px solid var(--g-line);
      display: grid;
      place-items: center;
      transition:
        background 0.3s,
        border-color 0.3s,
        transform 0.3s;
    }
    .cell[data-state='wall'] {
      background: var(--g-wall);
      border-color: var(--g-wall);
      background-image: repeating-linear-gradient(45deg, transparent 0 5px, var(--g-wall-hatch) 5px 10px);
    }
    .cell[data-state='frontier'],
    .legend i[data-state='frontier'] {
      background: rgba(var(--g-warn-rgb), 0.16);
      border-color: rgba(var(--g-warn-rgb), 0.7);
    }
    .cell[data-state='visited'],
    .legend i[data-state='visited'] {
      background: rgba(var(--g-accent-rgb), 0.14);
      border-color: rgba(var(--g-accent-rgb), 0.35);
    }
    .cell[data-state='current'],
    .legend i[data-state='current'] {
      background: var(--g-active);
      border-color: var(--g-active);
    }
    .cell[data-state='current'] {
      transform: scale(1.08);
    }
    .cell[data-state='current'] .d {
      color: var(--g-on-fill);
      font-weight: 700;
    }
    .cell[data-state='path'],
    .legend i[data-state='path'] {
      background: rgba(var(--g-found-rgb), 0.28);
      border-color: var(--g-found);
    }
    .cell[data-state='start'],
    .cell[data-state='goal'] {
      border-color: var(--g-text);
    }
    .tag {
      white-space: nowrap;
      font: 700 13px/1 var(--g-font-display);
    }
    .d {
      white-space: nowrap;
      font: 11px/1 var(--g-font-mono);
      color: var(--g-muted);
    }
    .legend {
      display: flex;
      flex-wrap: wrap;
      gap: 14px;
      justify-content: center;
      margin-top: 14px;
      font-size: 0.75rem;
      color: var(--g-muted);
    }
    .legend span {
      display: inline-flex;
      align-items: center;
      gap: 6px;
    }
    .legend i {
      width: 12px;
      height: 12px;
      border-radius: 3px;
      display: inline-block;
      border: 1px solid;
    }
  `,
})
export class GridViewComponent {
  readonly view = input.required<GridView>();
  readonly legend = input(true);
  readonly cols = computed(() => this.view().cells[0]?.length ?? 1);
}
