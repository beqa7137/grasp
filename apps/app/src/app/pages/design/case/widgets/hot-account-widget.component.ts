import { ChangeDetectionStrategy, Component, ElementRef, Injector, computed, inject, signal, viewChild } from '@angular/core';
import { HOT_ACCOUNT_LIMITS, hotAccount, hotAccountCheckpoint, num, type HotAccountSettings } from '@grasp/engine';
import { refocusAfterRender } from '../../../../core/focus';
import { WidgetCheckComponent } from './widget-check.component';

type Setting = keyof HotAccountSettings;

const SLIDERS: { key: Setting; label: string; unit: string }[] = [
  { key: 'offered', label: 'Postings sent', unit: '/s' },
  { key: 'lockMs', label: 'Lock held per transaction', unit: ' ms' },
  { key: 'subAccounts', label: 'Sub-accounts', unit: '' },
  { key: 'batch', label: 'Postings per transaction', unit: '' },
];

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
          (input)="set(s.key, +$any($event.target).value)"
        />
      </label>
    }

    <dl class="readouts" aria-live="polite" tabindex="-1" #readouts>
      <div>
        <dt>Capacity</dt>
        <dd class="mono">{{ format(run().capacity) }}/s</dd>
      </div>
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
        <dt>Commit wait</dt>
        <dd class="mono">{{ latency() }}</dd>
      </div>
      <div>
        <dt>Rows per balance read</dt>
        <dd class="mono">{{ run().balanceRows }}</dd>
      </div>
    </dl>
    <p class="muted note">
      Each row commits one transaction per lock hold, and postings are spread evenly over the sub-accounts. A batch holds the lock as long
      as one posting, since the commit dominates; its postings wait for the batch to fill. Above 70% busy, real bursty traffic starts to
      queue.
    </p>

    <app-widget-check class="predict" [check]="check()" [chosen]="chosen()" (chosenChange)="answer($event)">
      <div><button class="g-btn primary" (click)="apply()">Apply the change</button></div>
    </app-widget-check>
  `,
  styleUrl: '../../../design-lesson/widget.scss',
  styles: `
    .readouts {
      outline: none;
      grid-template-columns: repeat(auto-fit, minmax(128px, 1fr));
    }
    .note {
      font-size: 0.8125rem;
      margin: 10px 0 16px;
      line-height: 1.5;
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
  readonly busy = computed(() => `${Math.round(this.run().utilization * 100).toLocaleString('en-US')}%`);
  readonly latency = computed(() => {
    const ms = this.run().latencyMs;
    return ms === null ? 'keeps growing' : `${ms < 10 ? ms.toFixed(1) : Math.round(ms)} ms`;
  });

  readonly format = num;
  private readonly injector = inject(Injector);
  private readonly readouts = viewChild.required<ElementRef<HTMLElement>>('readouts');

  set(key: Setting, value: number) {
    this.settings.update((s) => ({ ...s, [key]: value }));
  }

  answer(chosen: number | null) {
    if (chosen !== null) this.answered.set({ asked: this.settings(), chosen });
  }

  apply() {
    this.settings.set(this.check().change);
    refocusAfterRender(this.injector, () => this.readouts().nativeElement);
  }
}
