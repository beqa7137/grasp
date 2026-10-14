import { ChangeDetectionStrategy, Component, computed, signal, viewChild } from '@angular/core';
import { formatNumber } from './number-format';
import { queueLatency } from '@grasp/engine';
import { ChartFrameComponent, type ChartAxis, type ChartDot, type ChartSeries } from '../../viz/kit/chart-frame.component';
import { StageComponent } from '../../viz/kit/stage.component';

const SERVICE_MS = 10;
const STAGE_H = 340;
/**
 * Fixed for every setting and logarithmic: p50 at no load (7 ms) and p99 at 99% busy (4.6 s) both fit, so every
 * utilization the lesson suggests stays on the chart.
 */
const X: ChartAxis = { min: 0, max: 100, ticks: [0, 25, 50, 75, 100], format: (v) => `${v}%` };
const Y: ChartAxis = {
  min: 5,
  max: 10_000,
  ticks: [10, 100, 1_000, 10_000],
  format: (v) => (v >= 1_000 ? `${v / 1_000} s` : `${v} ms`),
  log: true,
};

const curve = (ms: (u: number) => number): [number, number][] =>
  Array.from({ length: 199 }, (_, i) => [i / 2, ms(i / 200)] as [number, number]);

/** Drag utilization and watch the queueing curve: p50 and p99 of a server that needs 10 ms per request. */
@Component({
  selector: 'app-latency-widget',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StageComponent, ChartFrameComponent],
  template: `
    <g-stage [height]="stageHeight" label="Latency against how busy the server is">
      @if (stage().width(); as width) {
        <g-chart-frame
          class="chart"
          heading="Latency against utilization"
          [summary]="summary()"
          [width]="width - 24"
          [height]="stageHeight - 16"
          [x]="x"
          [y]="y"
          [series]="series"
          [markers]="markers"
          [dots]="dots()"
          [cursor]="percent()"
          [legendLines]="2"
        />
      }
    </g-stage>

    <label class="slider">
      <span
        >Utilization <strong class="mono">{{ percent() }}%</strong></span
      >
      <input type="range" min="10" max="99" step="1" [value]="percent()" (input)="percent.set(+$any($event.target).value)" />
    </label>
    <dl class="readouts" aria-live="polite">
      <div>
        <dt>p50</dt>
        <dd class="mono">{{ num(latency().p50, 0, 0) }} ms</dd>
      </div>
      <div>
        <dt>p99</dt>
        <dd class="mono">{{ num(latency().p99, 0, 0) }} ms</dd>
      </div>
      <div>
        <dt>Mean vs idle</dt>
        <dd class="mono">{{ num(latency().mean / service, 1, 1) }}x</dd>
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
  `,
})
export class LatencyWidgetComponent {
  readonly num = formatNumber;
  readonly stage = viewChild.required(StageComponent);
  readonly stageHeight = STAGE_H;
  readonly x = X;
  readonly y = Y;
  readonly service = SERVICE_MS;
  readonly percent = signal(50);
  readonly latency = computed(() => queueLatency(SERVICE_MS, this.percent() / 100));
  readonly series: ChartSeries[] = [
    { id: 'p50', tone: 'current', label: 'p50', points: curve((u) => queueLatency(SERVICE_MS, u).p50) },
    { id: 'p99', tone: 'critical', dashed: true, label: 'p99', points: curve((u) => queueLatency(SERVICE_MS, u).p99) },
  ];
  readonly markers = [{ at: 70, label: '70% busy', tone: 'final' as const, tick: false }];
  readonly dots = computed((): ChartDot[] => [
    { x: this.percent(), y: this.latency().p50, tone: 'current', label: `p50 now, ${Math.round(this.latency().p50)} ms` },
    { x: this.percent(), y: this.latency().p99, tone: 'critical', label: `p99 now, ${Math.round(this.latency().p99)} ms` },
  ]);
  readonly summary = computed(
    () =>
      `At ${this.percent()}% utilization, p50 is ${Math.round(this.latency().p50)} ms and p99 is ${Math.round(this.latency().p99)} ms, for a 10 ms request.`,
  );
}
