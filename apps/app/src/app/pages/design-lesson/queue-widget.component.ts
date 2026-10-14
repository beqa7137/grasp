import { ChangeDetectionStrategy, Component, computed, signal, viewChild } from '@angular/core';
import { formatNumber } from './number-format';
import { queueBacklog } from '@grasp/engine';
import { ChartFrameComponent, type ChartAxis, type ChartDot, type ChartSeries } from '../../viz/kit/chart-frame.component';
import { StageComponent } from '../../viz/kit/stage.component';

const SECONDS = 120;
const BASE = 800;
const SPIKE_START = 10;
const SPIKE_END = 40;
const PER_CONSUMER = 1_000;
/** The largest backlog the controls allow: a 6,000/s spike against one consumer for 30 seconds. */
const MAX_PEAK = (6_000 - PER_CONSUMER) * (SPIKE_END - SPIKE_START);
const STAGE_H = 320;
const X: ChartAxis = { min: 0, max: SECONDS, ticks: [0, 30, 60, 90, 120], format: (v) => `${v} s` };
const Y: ChartAxis = { min: 0, max: MAX_PEAK, ticks: [0, 50_000, 100_000, 150_000], format: (v) => (v ? `${v / 1_000}k` : '0') };

/** Producers spike from second 10 to 40; set the consumers and watch the backlog build and drain, on fixed axes. */
@Component({
  selector: 'app-queue-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StageComponent, ChartFrameComponent],
  template: `
    <g-stage [height]="stageHeight" label="Messages waiting in the queue over two minutes">
      @if (stage().width(); as width) {
        <g-chart-frame
          class="chart"
          heading="Messages waiting"
          [summary]="summary()"
          [width]="width - 24"
          [height]="stageHeight - 16"
          [x]="x"
          [y]="y"
          [series]="series()"
          [spans]="spans"
          [markers]="markers()"
          [dots]="peakDot()"
          [legendLines]="2"
        />
      }
    </g-stage>

    <label class="slider">
      <span
        >Spike rate <strong class="mono">{{ num(spikeRate()) }}/s</strong> (normally {{ num(base) }}/s)</span
      >
      <input type="range" min="1000" max="6000" step="250" [value]="spikeRate()" (input)="spikeRate.set(+$any($event.target).value)" />
    </label>
    <div class="controls" role="group" aria-label="Consumers">
      <button class="g-btn" [disabled]="consumers() <= 1" (click)="consumers.set(consumers() - 1)" aria-label="Fewer consumers">−</button>
      <span class="mono">{{ consumers() }} consumer{{ consumers() === 1 ? '' : 's' }} · {{ num(backlog().capacity) }}/s</span>
      <button class="g-btn" [disabled]="consumers() >= 8" (click)="consumers.set(consumers() + 1)" aria-label="More consumers">+</button>
    </div>
    <dl class="readouts" aria-live="polite">
      <div>
        <dt>Peak backlog</dt>
        <dd class="mono">{{ num(peak()) }}</dd>
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
    g-stage {
      margin-bottom: var(--g-space-3);
    }
    .chart {
      position: absolute;
      left: var(--g-space-3);
      top: var(--g-space-2);
    }
    .controls .mono {
      min-width: 12em;
      text-align: center;
    }
  `,
})
export class QueueWidgetComponent {
  readonly num = formatNumber;
  readonly stage = viewChild.required(StageComponent);
  readonly stageHeight = STAGE_H;
  readonly x = X;
  readonly y = Y;
  readonly base = BASE;
  readonly spans = [{ from: SPIKE_START, to: SPIKE_END, label: `spike, ${SPIKE_START} s to ${SPIKE_END} s`, tone: 'considering' as const }];
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
  readonly peakDot = computed((): ChartDot[] => {
    const depth = this.backlog().depth;
    const peak = this.peak();
    return peak ? [{ x: depth.indexOf(peak) + 1, y: peak, tone: 'current', label: `peak ${peak.toLocaleString('en-US')}` }] : [];
  });
  /** At the peak, the newest message waits for everything ahead of it to drain at the capacity. */
  readonly oldestWait = computed(() => {
    const wait = this.peak() / this.backlog().capacity;
    return wait < 1 ? 'under 1 s' : `${Math.round(wait)} s`;
  });
  readonly series = computed((): ChartSeries[] => [
    {
      id: 'depth',
      tone: 'current',
      label: 'messages waiting',
      points: [[0, 0], ...this.backlog().depth.map((d, t) => [t + 1, d] as const)],
    },
  ]);
  readonly markers = computed(() => {
    const drain = this.backlog().drainSeconds;
    return drain === null || this.peak() === 0
      ? []
      : [{ at: SPIKE_END + drain, label: `drained ${drain} s after the spike`, tone: 'final' as const }];
  });
  readonly summary = computed(() => {
    const drain = this.backlog().drainSeconds;
    return `With ${this.consumers()} consumers and a spike of ${this.spikeRate()} a second, the backlog peaks at ${this.peak()} messages and ${
      this.peak() === 0 ? 'never builds up' : drain === null ? 'never drains' : `drains ${drain} seconds after the spike`
    }.`;
  });
}
