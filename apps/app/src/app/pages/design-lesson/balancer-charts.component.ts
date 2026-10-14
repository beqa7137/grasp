import { ChangeDetectionStrategy, Component, computed, input, output, viewChild } from '@angular/core';
import {
  LB_HIST_BINS,
  LB_HIST_MAX_MS,
  LB_HIST_MIN_MS,
  LB_LOADS,
  LB_POLICIES,
  LB_REQUESTS,
  formatDuration,
  formatPct,
  histogramEdges,
  type BalanceRun,
  type Balancer,
} from '@grasp/engine';
import { ChartFrameComponent, type ChartAxis, type ChartDot, type ChartSeries, type ChartTable } from '../../viz/kit/chart-frame.component';
import { HistogramComponent, type HistogramBin } from '../../viz/kit/histogram.component';
import { StageComponent } from '../../viz/kit/stage.component';
import { balancerChartsLayout } from './balancer-layout';
import { FocusBoxComponent } from './focus-box.component';

export const POLICY_LABELS: Record<Balancer, string> = {
  'round-robin': 'Round-robin',
  random: 'Random',
  'least-connections': 'Least connections',
  'two-choices': 'Two random choices',
};
/** Each policy's name at its line's end on the p99 chart. */
const SHORT: Record<Balancer, string> = {
  'round-robin': 'RR',
  random: 'Random',
  'least-connections': 'LC',
  'two-choices': '2 choices',
};
/** The table's heads, short enough that none wraps on a phone. */
const HEAD: Record<Balancer, string> = { 'round-robin': 'RR', random: 'Rand', 'least-connections': 'LC', 'two-choices': 'P2C' };
/** Each policy keeps one dash pattern on the p99 chart, so its line is told by shape as well as by its name. */
const DASH: Record<Balancer, string | undefined> = {
  'round-robin': undefined,
  random: '2 3',
  'least-connections': '8 4',
  'two-choices': '8 3 2 3',
};

const msTick = (v: number) => (v >= 1_000 ? `${(v / 1_000).toLocaleString('en-US')} s` : `${v} ms`);
const HIST_X: ChartAxis = { min: LB_HIST_MIN_MS, max: LB_HIST_MAX_MS, ticks: [1, 100, 10_000, 1_000_000], format: msTick, log: true };
const HIST_Y: ChartAxis = { min: 0, max: 0.5, ticks: [0, 0.25, 0.5], format: (v) => `${v * 100}%` };
const LOAD_X: ChartAxis = { min: 50, max: 95, ticks: [50, 60, 70, 80, 90], format: (v) => `${v}%` };
const P99_Y: ChartAxis = { min: 10, max: 1_000_000, ticks: [10, 100, 1_000, 10_000, 100_000, 1_000_000], format: msTick, log: true };
const HIST_EDGES = Array.from({ length: LB_HIST_BINS }, (_, i) => {
  const [from, to] = histogramEdges(i);
  return { from, to };
});
const EMPTY_HIST = HIST_EDGES.map((e) => ({ ...e, share: 0 }));

/** What a bin holds, in words: the first bin holds everything faster, the last everything slower. */
function binText(i: number) {
  const { from, to } = HIST_EDGES[i];
  if (i === 0) return `under ${formatDuration(to)}`;
  if (i === LB_HIST_BINS - 1) return `${formatDuration(from)} and over`;
  return `${formatDuration(from)} to ${formatDuration(to)}`;
}

/**
 * The Load Balancing widget's charts, on a stage of their own: the latency histogram, filling in as the replay answers
 * requests, with the previous run as a ghost; and p99 against load for every policy, each line named at its end, whose
 * handle is the load. Its own component, so a change to the fleet never re-renders a chart, and a chart's change only it.
 */
@Component({
  selector: 'app-balancer-charts',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [StageComponent, HistogramComponent, ChartFrameComponent, FocusBoxComponent],
  template: `
    <g-stage [height]="layout().height" label="Latency and p99 against load">
      @if (stage().width() > 0) {
        @let C = layout();
        <g-histogram
          class="chart"
          [style.left.px]="C.histogram.x"
          [style.top.px]="C.histogram.y"
          heading="Latency"
          [summary]="histSummary()"
          [width]="C.histogram.width"
          [height]="C.histogram.height"
          [x]="histX"
          [y]="histY"
          [bins]="histBins()"
          [ghost]="ghostBins()"
          [label]="partial() ? 'answered so far' : 'this run'"
          [p50]="run()?.p50Ms ?? 1"
          [p99]="answered()?.p99Ms ?? run()?.p99Ms ?? 1"
          [table]="histTable()"
          [format]="formatDuration"
          [legendLines]="2"
        />
        <g-chart-frame
          class="chart"
          [style.left.px]="C.chart.x"
          [style.top.px]="C.chart.y"
          heading="p99 by load"
          [summary]="p99Summary()"
          [width]="C.chart.width"
          [height]="C.chart.height"
          [x]="loadX"
          [y]="p99Y"
          [series]="p99Series()"
          [dots]="p99Dots()"
          [endLabels]="64"
          [legendLines]="2"
          [table]="p99Table()"
          [tableRow]="loads.indexOf($any(load()))"
          [playheadValues]="loads"
          playheadLabel="Load on the chart"
          [playheadText]="loadText()"
          [disabled]="locked()"
          [playhead]="load()"
          (playheadChange)="loadChange.emit($event)"
        />
        <svg
          class="focus"
          [attr.viewBox]="'0 0 ' + C.width + ' ' + C.height"
          [attr.width]="C.width"
          [attr.height]="C.height"
          aria-hidden="true"
        >
          @for (f of C.focus; track f.id) {
            <g app-focus [box]="f" [on]="focusOn().includes(f.id)" />
          }
        </svg>
      }
    </g-stage>
  `,
  styles: `
    :host {
      display: block;
      min-width: 0;
    }
    .chart {
      position: absolute;
    }
    svg.focus {
      position: absolute;
      left: 0;
      top: 0;
      pointer-events: none;
    }
  `,
})
export class BalancerChartsComponent {
  readonly run = input<BalanceRun | null>(null);
  readonly sweep = input<Readonly<Record<Balancer, readonly number[]>> | null>(null);
  readonly policy = input<Balancer>('round-robin');
  readonly load = input(70);
  /** The replay's sample, or null at the run's end. */
  readonly sample = input<number | null>(null);
  readonly ghost = input<readonly number[] | null>(null);
  readonly failed = input<string | null>(null);
  readonly locked = input(false);
  readonly loadText = input('');
  readonly focusOn = input<readonly string[]>([]);
  readonly loadChange = output<number>();

  readonly histX = HIST_X;
  readonly histY = HIST_Y;
  readonly loadX = LOAD_X;
  readonly p99Y = P99_Y;
  readonly loads = LB_LOADS;
  readonly formatDuration = formatDuration;

  readonly stage = viewChild.required(StageComponent);
  readonly layout = computed(() => balancerChartsLayout(Math.max(256, this.stage().width())));

  readonly partial = computed(() => this.sample() !== null);
  /** The requests answered by the replay's moment, or every request at the run's end. */
  readonly answered = computed(() => {
    const run = this.run();
    const i = this.sample();
    if (!run) return null;
    return i === null || !run.answered ? { histogram: run.histogram ?? [], p99Ms: run.p99Ms } : run.answered[i];
  });
  readonly histBins = computed((): HistogramBin[] => {
    const shares = this.answered()?.histogram;
    return shares?.length ? shares.map((share, i) => ({ ...HIST_EDGES[i], share })) : EMPTY_HIST;
  });
  readonly ghostBins = computed((): HistogramBin[] | null => this.ghost()?.map((share, i) => ({ ...HIST_EDGES[i], share })) ?? null);
  readonly histTable = computed((): ChartTable => ({
    head: ['Latency', 'Requests'],
    rows: this.histBins().flatMap((b, i) => (b.share > 0 ? [[binText(i), formatPct(b.share * 100)]] : [])),
  }));
  readonly histSummary = computed(() => {
    const r = this.run();
    if (!r) return this.failed() ?? 'Latency: running.';
    const p99 = this.answered()?.p99Ms;
    return this.partial()
      ? `Latency of the requests answered so far: p99 ${p99 == null ? 'none yet' : formatDuration(p99)}.`
      : `Latency of ${LB_REQUESTS.toLocaleString('en-US')} requests: p50 ${formatDuration(r.p50Ms)}, p99 ${formatDuration(r.p99Ms)}.`;
  });

  readonly p99Series = computed((): ChartSeries[] => {
    const sweep = this.sweep();
    if (!sweep) return [];
    return LB_POLICIES.map((p) => ({
      id: p,
      label: POLICY_LABELS[p],
      short: SHORT[p],
      tone: p === this.policy() ? 'current' : 'muted',
      thin: p !== this.policy(),
      dash: DASH[p],
      points: LB_LOADS.map((load, i) => [load, sweep[p][i]] as const),
    }));
  });
  readonly p99Dots = computed((): ChartDot[] => {
    const sweep = this.sweep();
    const i = (LB_LOADS as readonly number[]).indexOf(this.load());
    if (!sweep || i < 0) return [];
    const p = this.policy();
    return [{ x: this.load(), y: sweep[p][i], tone: 'current', label: `${SHORT[p]} at ${this.load()}%: ${formatDuration(sweep[p][i])}` }];
  });
  readonly p99Table = computed((): ChartTable | undefined => {
    const sweep = this.sweep();
    if (!sweep) return undefined;
    return {
      head: ['Load', ...LB_POLICIES.map((p) => HEAD[p])],
      rows: LB_LOADS.map((load, i) => [`${load}%`, ...LB_POLICIES.map((p) => formatDuration(sweep[p][i]))]),
    };
  });
  readonly p99Summary = computed(() => {
    const sweep = this.sweep();
    if (!sweep) return this.failed() ?? 'p99 against load: running.';
    const i = (LB_LOADS as readonly number[]).indexOf(this.load());
    return `p99 against load from 50% to 95% for each policy (P2C is two random choices). At ${this.load()}%: ${LB_POLICIES.map(
      (p) => `${POLICY_LABELS[p]} ${formatDuration(sweep[p][i])}`,
    ).join(', ')}.`;
  });
}
