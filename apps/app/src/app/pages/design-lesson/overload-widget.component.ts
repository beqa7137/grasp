import { ChangeDetectionStrategy, Component, computed, signal, viewChild } from '@angular/core';
import { formatNumber } from './number-format';
import { overload, type ShedPolicy } from '@grasp/engine';
import { RovingSelectDirective } from '../../core/roving-select.directive';
import { ChartFrameComponent, type ChartAxis, type ChartBars, type ChartDot } from '../../viz/kit/chart-frame.component';
import { StageComponent } from '../../viz/kit/stage.component';

const POLICIES: { policy: ShedPolicy; label: string }[] = [
  { policy: 'none', label: 'Queue everything' },
  { policy: 'bounded', label: 'Bounded queue' },
  { policy: 'deadline', label: 'Drop expired' },
];
const CAPACITY = 1000;
const BURST_SEC = 10;
const STAGE_H = 320;
const X: ChartAxis = { min: 0, max: 60, ticks: [0, 20, 40, 60], format: (v) => `${v} s` };
/**
 * Fixed for every setting, and linear so the queue's ramp and drain read as the triangle they are: the default burst's
 * 10,000 fills a third of it. A queue past 30,000 (retries, or a 3,000/s burst) runs off the top, and its peak says so.
 */
const Y_MAX = 30_000;
const Y: ChartAxis = { min: 0, max: Y_MAX, ticks: [0, 10_000, 20_000, 30_000], format: (v) => (v ? `${v / 1_000}k` : '0') };

/** A burst over capacity for 10 s: how each queueing policy and client retries decide who is answered in time. */
@Component({
  selector: 'app-overload-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [RovingSelectDirective, StageComponent, ChartFrameComponent],
  template: `
    <div class="controls" role="radiogroup" aria-label="Policy">
      @for (p of policies; track p.policy) {
        <button
          class="g-btn"
          role="radio"
          [attr.aria-checked]="policy() === p.policy"
          [class.primary]="policy() === p.policy"
          (click)="policy.set(p.policy)"
        >
          {{ p.label }}
        </button>
      }
    </div>
    <label class="slider">
      <span
        >Burst on top of 800/s <strong class="mono">+{{ num(burst()) }}/s</strong></span
      >
      <input type="range" min="0" max="3000" step="100" [value]="burst()" (input)="burst.set(+$any($event.target).value)" />
    </label>
    <label class="slider">
      <span
        >Client timeout <strong class="mono">{{ timeout() }} s</strong></span
      >
      <input type="range" min="1" max="10" step="1" [value]="timeout()" (input)="timeout.set(+$any($event.target).value)" />
    </label>
    @if (policy() === 'bounded') {
      <label class="slider">
        <span
          >Queue bound <strong class="mono">{{ num(cap()) }}</strong></span
        >
        <input type="range" min="0" max="10000" step="500" [value]="cap()" (input)="cap.set(+$any($event.target).value)" />
      </label>
    }
    <div class="controls" role="radiogroup" aria-label="Retries">
      <span class="muted">Retries</span>
      @for (r of [0, 1, 2]; track r) {
        <button class="g-btn" role="radio" [attr.aria-checked]="retries() === r" [class.primary]="retries() === r" (click)="retries.set(r)">
          {{ r }}
        </button>
      }
    </div>

    <g-stage [height]="stageHeight" label="Requests waiting over a minute">
      @if (stage().width(); as width) {
        <g-chart-frame
          class="chart"
          heading="Requests waiting, each second"
          [summary]="chartLabel()"
          [width]="width - 24"
          [height]="stageHeight - 16"
          [x]="x"
          [y]="y"
          [bars]="bars()"
          [spans]="burstSpan"
          [dots]="peakDot()"
          [legendLines]="2"
        />
      }
    </g-stage>

    <dl class="readouts" aria-live="polite">
      <div [class.bad]="run().goodputPct < 90">
        <dt>Users served in time</dt>
        <dd class="mono">{{ num(run().goodputPct, 1, 0) }}%</dd>
      </div>
      <div [class.bad]="run().late > 0">
        <dt>Answered too late</dt>
        <dd class="mono">{{ num(run().late) }}</dd>
      </div>
      <div>
        <dt>Turned away</dt>
        <dd class="mono">{{ num(run().rejected) }}</dd>
      </div>
      <div>
        <dt>Dropped unanswered</dt>
        <dd class="mono">{{ num(run().expired) }}</dd>
      </div>
      <div>
        <dt>Requests sent</dt>
        <dd class="mono">{{ num(run().sent) }}</dd>
      </div>
      <div [class.bad]="run().maxWaitSec > timeout()">
        <dt>Longest wait</dt>
        <dd class="mono">{{ run().maxWaitSec }} s</dd>
      </div>
      <div [class.bad]="run().recoverSec === null">
        <dt>Recovered</dt>
        <dd>{{ run().recoverSec === null ? 'Not within a minute' : run().recoverSec + ' s after the burst' }}</dd>
      </div>
    </dl>
    <p class="muted note">The service answers {{ num(capacity) }} requests a second; the burst lasts 10 s.</p>
  `,
  styleUrl: './widget.scss',
  styles: `
    .controls .muted {
      font-size: 0.875rem;
    }
    g-stage {
      margin-top: var(--g-space-3);
    }
    .chart {
      position: absolute;
      left: var(--g-space-3);
      top: var(--g-space-2);
    }
    .readouts {
      grid-template-columns: repeat(auto-fit, minmax(150px, 1fr));
    }
    .note {
      font-size: 0.8125rem;
      margin: 10px 0 0;
    }
  `,
})
export class OverloadWidgetComponent {
  readonly num = formatNumber;
  readonly policies = POLICIES;
  readonly capacity = CAPACITY;
  readonly stage = viewChild.required(StageComponent);
  readonly stageHeight = STAGE_H;
  readonly x = X;
  readonly y = Y;
  readonly burstSpan = [{ from: 0, to: BURST_SEC, label: `the burst, ${BURST_SEC} s`, tone: 'considering' as const }];
  readonly policy = signal<ShedPolicy>('none');
  readonly burst = signal(1200);
  readonly timeout = signal(2);
  readonly cap = signal(1000);
  readonly retries = signal(0);
  readonly run = computed(() =>
    overload(this.policy(), {
      capacity: CAPACITY,
      base: 800,
      burst: this.burst(),
      burstSec: BURST_SEC,
      timeoutSec: this.timeout(),
      queueCap: this.cap(),
      retries: this.retries(),
    }),
  );
  readonly bars = computed((): ChartBars[] => [
    { id: 'queue', tone: 'current', label: 'requests waiting', items: this.run().queue.map((value, t) => ({ from: t, to: t + 1, value })) },
  ]);
  readonly peak = computed(() => {
    const queue = this.run().queue;
    const value = Math.max(0, ...queue);
    return { value, at: queue.indexOf(value) + 0.5 };
  });
  readonly peakDot = computed((): ChartDot[] => {
    const { value, at } = this.peak();
    if (!value) return [];
    const label = `peak ${value.toLocaleString('en-US')}${value > Y_MAX ? ', above the chart' : ''}`;
    return [{ x: at, y: value, tone: 'current', label }];
  });
  readonly chartLabel = computed(() => `Queue over a minute, peaking at ${this.peak().value.toLocaleString('en-US')} requests waiting`);
}
