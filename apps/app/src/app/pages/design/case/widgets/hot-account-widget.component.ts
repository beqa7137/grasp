import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  Injector,
  computed,
  effect,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { HOT_ACCOUNT_LIMITS, hotAccount, hotAccountCheckpoint, num, type HotAccountSettings, type WidgetCheckpoint } from '@grasp/engine';
import { refocusAfterRender } from '../../../../core/focus';
import { WidgetCheckComponent } from './widget-check.component';

type Setting = keyof HotAccountSettings;

const SLIDERS: { key: Setting; label: string; unit: string; spoken: (v: number) => string }[] = [
  { key: 'offered', label: 'Postings sent', unit: '/s', spoken: (v) => `${num(v)} postings a second` },
  { key: 'lockMs', label: 'Lock held per transaction', unit: ' ms', spoken: (v) => `${v} ms` },
  { key: 'subAccounts', label: 'Sub-accounts', unit: '', spoken: (v) => `${v} sub-account${v === 1 ? '' : 's'}` },
  { key: 'batch', label: 'Postings per transaction', unit: '', spoken: (v) => `${v} posting${v === 1 ? '' : 's'} a transaction` },
];

/** How long input must rest before the summary is announced, so dragging a slider does not queue an announcement per step. */
const SETTLE_MS = 600;

/** The fee account at peak: one row that every capture locks, and what splitting it and batching postings buy. */
@Component({
  selector: 'app-hot-account-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [WidgetCheckComponent],
  template: `
    @for (s of sliders; track s.key) {
      <label class="slider">
        <span
          >{{ s.label }} <strong class="mono">{{ format(settings()[s.key]) }}{{ s.unit }}</strong></span
        >
        <input
          type="range"
          [min]="limits[s.key].min"
          [max]="limits[s.key].max"
          [step]="limits[s.key].step"
          [value]="settings()[s.key]"
          [attr.aria-valuetext]="s.spoken(settings()[s.key])"
          (input)="set(s.key, +$any($event.target).value)"
        />
      </label>
    }

    <dl class="readouts">
      <div>
        <dt>Capacity</dt>
        <dd class="mono">{{ format(run().capacity) }}/s</dd>
      </div>
      <div>
        <dt>Rows per balance read</dt>
        <dd class="mono">{{ run().balanceRows }}</dd>
      </div>
      @if (chosen() !== null) {
        <div [class.bad]="run().utilization > 1">
          <dt>Committed</dt>
          <dd class="mono">{{ format(run().committed) }}/s</dd>
        </div>
        <div [class.bad]="run().utilization > 0.7">
          <dt>Busy</dt>
          <dd class="mono">{{ busy() }}</dd>
        </div>
        <div [class.bad]="run().queuedPerSecond > 0">
          <dt>Queue grows</dt>
          <dd class="mono">{{ run().queuedPerSecond ? format(run().queuedPerSecond) + '/s' : 'no' }}</dd>
        </div>
        <div [class.bad]="run().latencyMs === null">
          <dt>Wait per posting</dt>
          <dd class="mono">{{ latency() }}</dd>
        </div>
      }
    </dl>
    @if (chosen() === null) {
      <p class="muted hidden-note">Committed, busy, queue and wait show once you answer the prediction below.</p>
    }
    <p class="visually-hidden" role="status">{{ announcement() }}</p>
    <p class="muted note">
      Each row commits one transaction per lock hold, and postings are spread evenly over the sub-accounts. A batch holds the lock as long
      as one posting, since the commit dominates; its postings wait for the batch to fill. Waiting in line for a row's lock follows an M/D/1
      queue (random arrivals, a fixed hold), so it climbs steeply as a row nears full.
    </p>

    @if (last(); as l) {
      <div class="last" role="group" aria-label="Your last prediction" tabindex="-1" #lastEl>
        <p class="legend">Applied: {{ l.prompt }}</p>
        <p>{{ l.explain }}</p>
      </div>
    }
    <app-widget-check [check]="check()" [chosen]="chosen()" (chosenChange)="answer($event)">
      <div><button class="g-btn primary" (click)="apply()">Apply the change</button></div>
    </app-widget-check>
  `,
  styleUrl: '../../../design-lesson/widget.scss',
  styles: `
    .readouts {
      grid-template-columns: repeat(auto-fit, minmax(128px, 1fr));
    }
    .hidden-note {
      font-size: 0.8125rem;
      margin: 8px 0 0;
    }
    .note {
      font-size: 0.8125rem;
      margin: 10px 0 16px;
      line-height: 1.5;
    }
    .last {
      margin: 0 0 12px;
      padding: 10px 12px;
      border-radius: var(--g-radius-sm);
      background: var(--g-raised);
      font-size: 0.875rem;
      line-height: 1.5;
      outline: none;
      p {
        margin: 0;
      }
      .legend {
        font-weight: 600;
        margin-bottom: 4px;
      }
    }
  `,
})
export class HotAccountWidgetComponent {
  readonly sliders = SLIDERS;
  readonly limits = HOT_ACCOUNT_LIMITS;
  readonly settings = signal<HotAccountSettings>({ offered: 2_300, lockMs: 5, subAccounts: 1, batch: 1 });
  readonly run = computed(() => hotAccount(this.settings()));
  readonly check = computed(() => hotAccountCheckpoint(this.settings()));
  private readonly answered = signal<{ asked: HotAccountSettings; chosen: number } | null>(null);
  readonly chosen = computed(() => {
    const a = this.answered();
    return a?.asked === this.settings() ? a.chosen : null;
  });
  /** The check whose change was applied, kept in view until the next answer. */
  readonly last = signal<WidgetCheckpoint | null>(null);
  readonly busy = computed(() => `${num(this.run().utilization * 100)}%`);
  readonly latency = computed(() => {
    const ms = this.run().latencyMs;
    return ms === null ? 'grows without bound' : `${ms < 10 ? ms.toFixed(1) : num(ms)} ms`;
  });
  readonly announcement = signal('');

  readonly format = num;
  private readonly injector = inject(Injector);
  private readonly lastEl = viewChild<ElementRef<HTMLElement>>('lastEl');

  constructor() {
    let timer: ReturnType<typeof setTimeout> | undefined;
    inject(DestroyRef).onDestroy(() => clearTimeout(timer));
    effect(() => {
      const summary = this.summary();
      clearTimeout(timer);
      timer = setTimeout(() => this.announcement.set(summary), SETTLE_MS);
    });
  }

  private summary(): string {
    const run = this.run();
    const capacity = `Capacity ${num(run.capacity)} postings a second`;
    if (this.chosen() === null) return `${capacity}. Answer the prediction to see the rest.`;
    return `${capacity}, ${num(run.committed)} committed, ${this.busy()} busy, wait per posting ${this.latency()}.`;
  }

  set(key: Setting, value: number) {
    this.settings.update((s) => ({ ...s, [key]: value }));
  }

  answer(chosen: number | null) {
    if (chosen === null) return;
    this.answered.set({ asked: this.settings(), chosen });
    this.last.set(null);
  }

  apply() {
    const check = this.check();
    this.last.set(check);
    this.settings.set(check.change);
    refocusAfterRender(this.injector, () => this.lastEl()?.nativeElement);
  }
}
