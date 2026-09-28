import { ChangeDetectionStrategy, Component, computed, signal } from '@angular/core';
import { DecimalPipe } from '@angular/common';
import { queueBacklog } from '@grasp/engine';

const SECONDS = 120;
const BASE = 800;
const SPIKE_START = 10;
const SPIKE_END = 40;
const PER_CONSUMER = 1_000;
/** The largest backlog the controls allow: a 6,000/s spike against one consumer for 30 seconds. */
const MAX_PEAK = (6_000 - PER_CONSUMER) * (SPIKE_END - SPIKE_START);
const W = 320;
const H = 140;

/** Producers spike from second 10 to 40; set the consumers and watch the backlog build and drain. */
@Component({
  selector: 'app-queue-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DecimalPipe],
  template: `
    <svg [attr.viewBox]="'-4 -4 ' + (w + 8) + ' ' + (h + 8)" role="img" [attr.aria-label]="summary()">
      <rect class="spike" [attr.x]="spikeX.start" y="0" [attr.width]="spikeX.end - spikeX.start" [attr.height]="h" />
      <line class="axis" x1="0" [attr.y1]="h" [attr.x2]="w" [attr.y2]="h" />
      <path class="depth" [attr.d]="area()" />
    </svg>
    <p class="legend muted"><span class="key spike"></span>spike, seconds 10 to 40 · {{ seconds }} seconds shown</p>

    <label class="slider">
      <span
        >Spike rate <strong class="mono">{{ spikeRate() | number }}/s</strong> (normally {{ base | number }}/s)</span
      >
      <input type="range" min="1000" max="6000" step="250" [value]="spikeRate()" (input)="spikeRate.set(+$any($event.target).value)" />
    </label>
    <div class="controls" role="group" aria-label="Consumers">
      <button class="g-btn" [disabled]="consumers() <= 1" (click)="consumers.set(consumers() - 1)" aria-label="Fewer consumers">−</button>
      <span class="mono">{{ consumers() }} consumer{{ consumers() === 1 ? '' : 's' }} · {{ backlog().capacity | number }}/s</span>
      <button class="g-btn" [disabled]="consumers() >= 8" (click)="consumers.set(consumers() + 1)" aria-label="More consumers">+</button>
    </div>
    <dl class="readouts" aria-live="polite">
      <div>
        <dt>Peak backlog</dt>
        <dd class="mono">{{ peak() | number }}</dd>
      </div>
      <div [class.bad]="backlog().drainSeconds === null">
        <dt>Drained</dt>
        <dd class="mono">
          {{ peak() === 0 ? 'no backlog' : backlog().drainSeconds === null ? 'never' : backlog().drainSeconds + ' s after spike' }}
        </dd>
      </div>
      <div>
        <dt>Longest wait</dt>
        <dd class="mono">{{ oldestWait() }}</dd>
      </div>
    </dl>
  `,
  styleUrl: './widget.scss',
  styles: `
    .spike {
      fill: var(--g-warn);
      opacity: 0.12;
    }
    .key.spike {
      background: var(--g-warn);
      opacity: 0.5;
      height: 10px;
    }
    path.depth {
      fill: var(--g-accent-soft);
      stroke: var(--g-accent);
    }
    .controls .mono {
      min-width: 12em;
      text-align: center;
    }
  `,
})
export class QueueWidgetComponent {
  readonly w = W;
  readonly h = H;
  readonly seconds = SECONDS;
  readonly base = BASE;
  readonly spikeX = { start: (SPIKE_START / SECONDS) * W, end: (SPIKE_END / SECONDS) * W };
  readonly spikeRate = signal(3_000);
  readonly consumers = signal(2);
  readonly backlog = computed(() =>
    queueBacklog({
      seconds: SECONDS,
      baseRate: BASE,
      spikeRate: this.spikeRate(),
      spikeStart: SPIKE_START,
      spikeEnd: SPIKE_END,
      consumers: this.consumers(),
      perConsumer: PER_CONSUMER,
    }),
  );
  readonly peak = computed(() => Math.max(...this.backlog().depth));
  /** At the peak, the newest message waits for everything ahead of it to drain at the capacity. */
  readonly oldestWait = computed(() => {
    const wait = this.peak() / this.backlog().capacity;
    return wait < 1 ? 'under 1 s' : `${Math.round(wait)} s`;
  });
  readonly area = computed(() => {
    const depth = this.backlog().depth;
    const top = MAX_PEAK;
    const points = depth.map((d, t) => `${((t / (SECONDS - 1)) * W).toFixed(1)},${(H - (Math.min(d, top) / top) * H).toFixed(1)}`);
    return `M0,${H}L${points.join('L')}L${W},${H}Z`;
  });
  readonly summary = computed(() => {
    const drain = this.backlog().drainSeconds;
    return `With ${this.consumers()} consumers and a spike of ${this.spikeRate()} a second, the backlog peaks at ${this.peak()} messages and ${
      this.peak() === 0 ? 'never builds up' : drain === null ? 'never drains' : `drains ${drain} seconds after the spike`
    }.`;
  });
}
