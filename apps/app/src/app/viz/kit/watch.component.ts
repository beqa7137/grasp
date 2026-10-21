import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  afterRenderEffect,
  computed,
  inject,
  input,
  output,
  signal,
  untracked,
} from '@angular/core';
import { NgTemplateOutlet } from '@angular/common';
import type { Frame, Scalar } from '@grasp/engine';
import { uniqueId } from '../../core/unique-id';
import { MotionService, type StageStep } from './motion.service';
import { WhyComponent } from './why.component';

interface WatchRow {
  name: string;
  value: Scalar;
  /** The value before this step, when the step changed it. */
  was?: Scalar;
}

/**
 * The watch (REDESIGN.md 3.3): the frame's variables as rows of name, value and, where the step changed it, the old value
 * struck through, with a bar and a flash. Variables the stage already draws collapse under "On the stage". A value opens
 * its history (`g-why`).
 */
@Component({
  selector: 'g-watch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [NgTemplateOutlet, WhyComponent],
  template: `
    <ng-template #rowsOf let-rows>
      <dl class="rows">
        @for (row of rows; track row.name) {
          <div class="row" [class.changed]="row.was !== undefined">
            <dt class="mono">{{ row.name }}</dt>
            <dd>
              @if (row.was !== undefined) {
                <span class="flash" aria-hidden="true"></span>
              }
              <button
                class="value mono"
                [attr.aria-expanded]="open() === row.name"
                [attr.aria-controls]="open() === row.name ? whyId : null"
                [attr.aria-label]="
                  row.name + ' = ' + show(row.value) + (row.was !== undefined ? ', was ' + show(row.was) : '') + ': history'
                "
                (click)="toggle(row.name)"
              >
                <span>{{ show(row.value) }}</span>
                @if (row.was !== undefined) {
                  <s class="was">{{ show(row.was) }}</s>
                }
              </button>
              @if (open() === row.name) {
                <g-why class="why" [id]="whyId" [name]="row.name" [frames]="frames()" [index]="index()" (seek)="seek.emit($event)" />
              }
            </dd>
          </div>
        }
      </dl>
    </ng-template>
    <ng-container *ngTemplateOutlet="rowsOf; context: { $implicit: listed() }" />
    @if (staged().length) {
      <button class="g-btn ghost stage-toggle" [attr.aria-expanded]="stageOpen()" (click)="stageOpen.set(!stageOpen())">
        On the stage: {{ stagedNames() }}
      </button>
      @if (stageOpen()) {
        <ng-container *ngTemplateOutlet="rowsOf; context: { $implicit: staged() }" />
      }
    }
  `,
  styles: `
    :host {
      display: block;
    }
    .rows {
      margin: 0;
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(140px, 1fr));
      gap: var(--g-space-1);
    }
    .row {
      position: relative;
      display: grid;
      grid-template-columns: minmax(0, auto) minmax(0, 1fr);
      align-items: baseline;
      gap: var(--g-space-2);
      min-width: 0;
      padding: var(--g-space-1) var(--g-space-2);
      border-left: 2px solid transparent;
      border-radius: var(--g-radius-xs);
      background: var(--g-sunken);
    }
    /* A changed row's bar (3.3); the flash plays over it. */
    .row.changed {
      border-left-color: var(--g-state-current);
    }
    .flash {
      position: absolute;
      inset: 0;
      border-radius: inherit;
      background: var(--g-viz-current-soft);
      opacity: 0;
      pointer-events: none;
    }
    dt {
      font-size: var(--g-text-label);
      color: var(--g-muted);
      overflow-wrap: anywhere;
    }
    dd {
      margin: 0;
      min-width: 0;
    }
    .value {
      display: inline-flex;
      align-items: baseline;
      gap: var(--g-space-2);
      max-width: 100%;
      min-height: 32px;
      padding: 0;
      border: 0;
      background: none;
      color: var(--g-text);
      font-size: var(--g-text-body);
      font-weight: 600;
      text-align: left;
      cursor: pointer;
    }
    .value span {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .was {
      min-width: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      font-size: var(--g-text-body-s);
      font-weight: 500;
      color: var(--g-muted);
      white-space: nowrap;
    }
    .why {
      padding-bottom: var(--g-space-1);
    }
    .row:has(.why) {
      grid-column: 1 / -1;
    }
    .stage-toggle {
      margin-top: var(--g-space-2);
      font-size: var(--g-text-body-s);
    }
  `,
})
export class WatchComponent {
  readonly frames = input.required<readonly Frame[]>();
  /** The frame on show. */
  readonly index = input.required<number>();
  /** The step into it, whose changed variables are marked. */
  readonly step = input<StageStep | null>(null);
  /** Variables the stage already draws (pointers over their cells), which collapse under "On the stage". */
  readonly onStage = input<ReadonlySet<string>>(new Set());
  readonly seek = output<number>();
  private readonly motion = inject(MotionService, { optional: true });
  private readonly host: HTMLElement = inject(ElementRef).nativeElement;

  protected readonly whyId = uniqueId('g-why');
  readonly open = signal<string | null>(null);
  readonly stageOpen = signal(false);

  readonly rows = computed<WatchRow[]>(() => {
    const vars = this.frames()[this.index()]?.vars ?? {};
    const step = this.step();
    const was = new Map(
      step?.adjacent ? step.events.flatMap((e) => (e.kind === 'var' && e.from !== undefined ? [[e.name, e.from] as const] : [])) : [],
    );
    return Object.entries(vars)
      .filter(([name]) => name !== 'result')
      .map(([name, value]) => (was.has(name) ? { name, value, was: was.get(name) } : { name, value }));
  });
  readonly listed = computed(() => this.rows().filter((row) => !this.onStage().has(row.name)));
  readonly staged = computed(() => this.rows().filter((row) => this.onStage().has(row.name)));
  readonly stagedNames = computed(() =>
    this.staged()
      .map((row) => row.name)
      .join(', '),
  );

  constructor() {
    afterRenderEffect(() => {
      const step = this.step();
      untracked(() => this.flash(step));
    });
  }

  show(value: Scalar | undefined): string {
    return value === null || value === undefined ? '–' : String(value);
  }

  toggle(name: string) {
    this.open.update((open) => (open === name ? null : name));
  }

  /** Changed rows flash once, in the step's consequence (3.5). */
  private flash(step: StageStep | null) {
    const motion = this.motion;
    if (!motion || !step?.adjacent || step.scale === 0) return;
    for (const flash of this.host.querySelectorAll('.flash'))
      motion.animate(flash, [{ opacity: 1 }, { opacity: 0 }], {
        duration: motion.ms('land', step.scale),
        delay: motion.at('consequence', step.scale),
        easing: motion.ease('exit'),
        fill: 'none',
      });
  }
}
