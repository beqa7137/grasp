import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { clockRun, type ClockMode } from '@grasp/engine';
import { RovingSelectDirective } from '../../core/roving-select.directive';

const POLLS = [16, 32, 64, 128, 256, 512, 1024];

/** Two nodes' clocks after a sync: how far apart they can be, and whether last write wins drops the later write. */
@Component({
  selector: 'app-clocks-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, RovingSelectDirective],
  template: `
    <div class="controls" role="radiogroup" aria-label="Timestamps">
      <button
        class="g-btn"
        role="radio"
        [attr.aria-checked]="mode() === 'wall'"
        [class.primary]="mode() === 'wall'"
        (click)="mode.set('wall')"
      >
        Wall clock
      </button>
      <button
        class="g-btn"
        role="radio"
        [attr.aria-checked]="mode() === 'hybrid'"
        [class.primary]="mode() === 'hybrid'"
        (click)="mode.set('hybrid')"
      >
        Hybrid logical clock
      </button>
    </div>
    <label class="slider">
      <span
        >Sync error <strong class="mono">{{ syncError() }} ms</strong></span
      >
      <input type="range" min="1" max="100" step="1" [value]="syncError()" (input)="syncError.set(+$any($event.target).value)" />
    </label>
    <label class="slider">
      <span
        >Drift <strong class="mono">{{ drift() }} ppm</strong></span
      >
      <input type="range" min="0" max="200" step="5" [value]="drift()" (input)="drift.set(+$any($event.target).value)" />
    </label>
    <div class="controls" role="radiogroup" aria-label="Sync every">
      <span class="muted">Sync every</span>
      @for (p of polls; track p) {
        <button class="g-btn" role="radio" [attr.aria-checked]="poll() === p" [class.primary]="poll() === p" (click)="poll.set(p)">
          {{ p }} s
        </button>
      }
    </div>
    <label class="slider">
      <span
        >B writes after A by <strong class="mono">{{ gap() }} ms</strong></span
      >
      <input type="range" min="0" max="500" step="5" [value]="gap()" (input)="gap.set(+$any($event.target).value)" />
    </label>
    <label class="toggle">
      <input type="checkbox" [checked]="saw()" (change)="saw.set($any($event.target).checked)" />
      B read A's write before writing
    </label>

    <dl class="readouts" aria-live="polite">
      <div>
        <dt>Worst skew between the two clocks</dt>
        <dd class="mono">{{ run().worstSkewMs | number: '1.1-1' }} ms</dd>
      </div>
      <div [class.bad]="run().laterWriteCanLose">
        <dt>B's later write</dt>
        <dd>{{ run().laterWriteCanLose ? 'Can lose to A' : 'Always wins' }}</dd>
      </div>
    </dl>
  `,
  styleUrl: './widget.scss',
  styles: `
    .controls .muted {
      font-size: 0.875rem;
    }
    .readouts {
      grid-template-columns: repeat(auto-fit, minmax(170px, 1fr));
    }
  `,
})
export class ClocksWidgetComponent {
  readonly polls = POLLS;
  readonly mode = signal<ClockMode>('wall');
  readonly syncError = signal(10);
  readonly drift = signal(50);
  readonly poll = signal(64);
  readonly gap = signal(5);
  readonly saw = signal(true);
  readonly run = computed(() =>
    clockRun(this.mode(), {
      syncErrorMs: this.syncError(),
      driftPpm: this.drift(),
      syncEverySec: this.poll(),
      gapMs: this.gap(),
      sawFirstWrite: this.saw(),
    }),
  );
}
