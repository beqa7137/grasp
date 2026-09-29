import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { overload, type ShedPolicy } from '@grasp/engine';
import { RovingSelectDirective } from '../../core/roving-select.directive';

const POLICIES: { policy: ShedPolicy; label: string }[] = [
  { policy: 'none', label: 'Queue everything' },
  { policy: 'bounded', label: 'Bounded queue' },
  { policy: 'deadline', label: 'Drop expired' },
];
const CAPACITY = 1000;
const CHART = { width: 300, height: 80 };

/** A burst over capacity for 10 s: how each queueing policy and client retries decide who is answered in time. */
@Component({
  selector: 'app-overload-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe, RovingSelectDirective],
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
        >Burst on top of 800/s <strong class="mono">+{{ burst() | number }}/s</strong></span
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
          >Queue bound <strong class="mono">{{ cap() | number }}</strong></span
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

    <svg class="chart" [attr.viewBox]="'0 0 ' + chart.width + ' ' + chart.height" role="img" [attr.aria-label]="chartLabel()">
      @for (b of bars(); track $index) {
        <rect [attr.x]="b.x" [attr.y]="b.y" [attr.width]="b.w" [attr.height]="b.h" />
      }
      <line class="burst" [attr.x1]="burstX()" [attr.x2]="burstX()" y1="0" [attr.y2]="chart.height" />
    </svg>
    <p class="muted caption">Requests waiting, second by second over a minute; the line marks the end of the burst.</p>

    <dl class="readouts" aria-live="polite">
      <div [class.bad]="run().goodputPct < 90">
        <dt>Users served in time</dt>
        <dd class="mono">{{ run().goodputPct | number: '1.0-1' }}%</dd>
      </div>
      <div [class.bad]="run().late > 0">
        <dt>Answered too late</dt>
        <dd class="mono">{{ run().late | number }}</dd>
      </div>
      <div>
        <dt>Turned away</dt>
        <dd class="mono">{{ run().rejected | number }}</dd>
      </div>
      <div>
        <dt>Dropped unanswered</dt>
        <dd class="mono">{{ run().expired | number }}</dd>
      </div>
      <div>
        <dt>Requests sent</dt>
        <dd class="mono">{{ run().sent | number }}</dd>
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
    <p class="muted note">The service answers {{ capacity | number }} requests a second; the burst lasts 10 s.</p>
  `,
  styleUrl: './widget.scss',
  styles: `
    .controls .muted {
      font-size: 0.875rem;
    }
    .chart {
      display: block;
      width: 100%;
      height: auto;
      margin-top: 12px;
      rect {
        fill: var(--g-accent);
      }
      .burst {
        stroke: var(--g-muted);
        stroke-dasharray: 3 3;
      }
    }
    .caption {
      font-size: 0.8125rem;
      margin: 4px 0 0;
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
  readonly policies = POLICIES;
  readonly capacity = CAPACITY;
  readonly chart = CHART;
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
      burstSec: 10,
      timeoutSec: this.timeout(),
      queueCap: this.cap(),
      retries: this.retries(),
    }),
  );
  readonly bars = computed(() => {
    const queue = this.run().queue;
    const top = Math.max(1, ...queue);
    const w = CHART.width / queue.length;
    return queue.map((n, i) => {
      const h = (n / top) * CHART.height;
      return { x: i * w, y: CHART.height - h, w: Math.max(0, w - 1), h };
    });
  });
  readonly burstX = computed(() => (CHART.width / this.run().queue.length) * 10);
  readonly chartLabel = computed(
    () => `Queue over a minute, peaking at ${Math.max(0, ...this.run().queue).toLocaleString('en-US')} requests waiting`,
  );
}
