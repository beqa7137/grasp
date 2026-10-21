import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  input,
  output,
  untracked,
} from '@angular/core';
import type { CellState, GridView, Locator } from '@grasp/engine';
import { DIM_CELL, dims, type Focus } from './dim';
import { LANDING, land } from './kit/flip';
import { MotionService, type StageStep } from './kit/motion.service';
import { PICK_CELL, PickCellDirective, PickGroupDirective, type PickAsk, type PickGhost } from './kit/pick';

/** What a screen reader hears for a cell's state while it can be picked, in the legend's words. */
const STATE_LABELS: Record<CellState, string> = {
  open: 'open',
  wall: 'wall',
  start: 'start',
  goal: 'goal',
  visited: 'expanded',
  frontier: 'in queue',
  current: 'current',
  path: 'shortest path',
};

@Component({
  selector: 'g-grid-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div
      class="grid"
      [style.--cols]="cols()"
      [gPickGroup]="pick()"
      [pickGhost]="ghost()"
      [pickColumns]="cols()"
      (picked)="picked.emit($event)"
    >
      @for (row of view().cells; track r; let r = $index) {
        @for (cell of row; track c; let c = $index) {
          <div
            class="cell"
            [gPickCell]="{ view: 'grid', at: [r, c] }"
            [pickLabel]="'(' + r + ',' + c + '), ' + stateLabel(cell)"
            [attr.data-state]="cell"
            [attr.data-at]="r + ',' + c"
            [class.dim]="dims(focus(), { view: 'grid', at: [r, c] }, cell === 'current')"
          >
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
    <div class="legend">
      <span><i data-state="frontier"></i>in queue</span>
      <span><i data-state="visited"></i>expanded</span>
      <span><i data-state="current"></i>current</span>
      <span><i data-state="path"></i>shortest path</span>
    </div>
  `,
  imports: [PickGroupDirective, PickCellDirective],
  styles: [
    DIM_CELL,
    LANDING,
    PICK_CELL,
    `
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
        position: relative;
        aspect-ratio: 1;
        border-radius: 8px;
        background: var(--g-raised);
        border: 1px solid var(--g-line);
        display: grid;
        place-items: center;
        transition:
          background var(--g-motion-step),
          border-color var(--g-motion-step),
          transform var(--g-motion-step);
      }
      .cell[data-state='wall'] {
        background: var(--g-wall);
        border-color: var(--g-wall);
        background-image: repeating-linear-gradient(45deg, transparent 0 5px, var(--g-wall-hatch) 5px 10px);
      }
      .cell[data-state='frontier'],
      .legend i[data-state='frontier'] {
        background: var(--g-state-frontier-fill);
        border-color: var(--g-state-frontier-line);
        border-style: dashed;
      }
      .cell[data-state='visited'],
      .legend i[data-state='visited'] {
        background: var(--g-state-visited-fill);
        border-color: var(--g-state-visited-line);
      }
      .cell[data-state='current'],
      .legend i[data-state='current'] {
        background: var(--g-state-current);
        border-color: var(--g-state-current);
      }
      .cell[data-state='current'] {
        transform: scale(1.08);
      }
      .cell[data-state='current'] .d {
        color: var(--g-state-current-ink);
        font-weight: 700;
      }
      .cell[data-state='path'],
      .legend i[data-state='path'] {
        background: var(--g-state-path-fill);
        border-color: var(--g-state-path-line);
      }
      .cell[data-state='start'],
      .cell[data-state='goal'] {
        border-color: var(--g-text);
      }
      .tag {
        white-space: nowrap;
        font: 600 13px/1 var(--g-font-mono);
      }
      .d {
        white-space: nowrap;
        font: 11px/1 var(--g-font-mono);
        color: var(--g-text);
      }
      .cell[data-state='visited'] .d {
        color: var(--g-muted);
      }
      .cell.dim :is(.d, .tag) {
        color: var(--g-viz-discarded-ink);
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
  ],
})
export class GridViewComponent {
  readonly view = input.required<GridView>();
  /** A checkpoint's focus, which dims the other cells. */
  readonly focus = input<Focus>(null);
  /** The step into this frame: its distances land in their cells. Nothing in a grid moves, so it leaves no trails. */
  readonly step = input<StageStep | null>(null);
  /** An open pick ask, which makes the cells a radio group. */
  readonly pick = input<PickAsk | null>(null);
  /** The learner's committed pick, drawn on its cells. */
  readonly ghost = input<PickGhost | null>(null);
  readonly picked = output<Locator>();
  protected readonly stateLabel = (state: CellState) => STATE_LABELS[state];
  private readonly motion = inject(MotionService, { optional: true });
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;
  protected readonly dims = dims;
  readonly cols = computed(() => this.view().cells[0]?.length ?? 1);

  constructor() {
    afterRenderEffect(() => {
      const step = this.step();
      untracked(() => this.play(step));
    });
  }

  private play(step: StageStep | null) {
    const motion = this.motion;
    if (!motion || !step?.adjacent || step.scale === 0) return;
    const s = step.scale;
    const timing = {
      duration: motion.ms('land', s),
      delay: motion.at('consequence', s) - motion.ms('quick', s),
      easing: motion.ease('standard'),
    };
    for (const e of step.events) {
      if (e.view !== 'grid' || e.kind !== 'write' || !Array.isArray(e.at)) continue;
      const cell = this.host.querySelector<HTMLElement>(`[data-at="${e.at.join(',')}"]`);
      const value = cell?.querySelector<HTMLElement>('.d');
      if (cell && value) land(motion, cell, value, e.from === undefined ? '' : String(e.from), timing);
    }
  }
}
