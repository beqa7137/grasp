import { ChangeDetectionStrategy, Component, computed, input, model, signal } from '@angular/core';
import { DataTableComponent } from './data-table.component';
import { HandleComponent } from './handle.component';
import { SparklineComponent, linear, type Point } from './sparkline.component';

export interface ChartAxis {
  min: number;
  max: number;
  ticks: readonly number[];
  format: (value: number) => string;
}

/** A diagram role (REDESIGN.md 3.6). */
export type ChartTone = 'ink' | 'final' | 'considering' | 'critical';

export interface ChartSeries {
  id: string;
  points: readonly Point[];
  /** The right-hand axis, for a second unit. */
  right?: boolean;
  tone: ChartTone;
  /** A second series is dashed, so it never relies on its hue. */
  dashed?: boolean;
  label: string;
}

/** A moment on the x axis: a dashed line through the plot, and its time on the axis in its tone. */
export interface ChartMarker {
  at: number;
  label: string;
  tone: ChartTone;
}

export interface ChartTable {
  head: readonly string[];
  rows: readonly (readonly string[])[];
}

const HEAD = 28;
/** Three lines of legend, so a narrow chart can wrap it without the plot moving. */
const LEGEND = 52;
const MARGIN = { top: 8, bottom: 40, left: 36, right: 12, rightAxis: 36 };
/** A regular tick this close to a marker's tick gives way to it. */
const TICK_ROOM = 24;

/**
 * A chart's frame (REDESIGN.md 3.3): fixed axes with ticks and units, so a run never rescales the picture; a threshold
 * line, shaded spans and markers; series drawn up to `upTo`; a legend under the plot, so no label crosses a line; a
 * playhead the learner drags on its own track under the time axis; and a toggle that swaps the drawing for its data
 * table in the same box.
 */
@Component({
  selector: 'g-chart-frame',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [DataTableComponent, HandleComponent, SparklineComponent],
  templateUrl: './chart-frame.component.html',
  styleUrl: './chart-frame.component.scss',
  host: { '[style.width.px]': 'width()', '[style.height.px]': 'height()' },
})
export class ChartFrameComponent {
  readonly heading = input.required<string>();
  readonly summary = input.required<string>();
  readonly width = input.required<number>();
  readonly height = input.required<number>();
  readonly x = input.required<ChartAxis>();
  readonly y = input.required<ChartAxis>();
  readonly y2 = input<ChartAxis>();
  readonly series = input<readonly ChartSeries[]>([]);
  readonly threshold = input<{ value: number; label: string }>();
  readonly spans = input<readonly { from: number; to: number; label: string }[]>([]);
  readonly markers = input<readonly ChartMarker[]>([]);
  readonly empty = input<string>();
  readonly upTo = input(Infinity);
  readonly table = input<ChartTable>();
  /** The table row to highlight and keep in view: the playhead's. */
  readonly tableRow = input(-1);
  /** The playhead's position on the x axis, one of `playheadValues`; none without them. */
  readonly playhead = model(0);
  readonly playheadValues = input<readonly number[]>([]);
  readonly playheadLabel = input('Time');
  readonly playheadText = input('');
  readonly disabled = input(false);
  readonly showTable = signal(false);

  readonly svgHeight = computed(() => this.height() - HEAD - LEGEND);
  readonly plot = computed(() => ({
    left: MARGIN.left,
    right: this.width() - (this.y2() ? MARGIN.rightAxis : MARGIN.right),
    top: MARGIN.top,
    bottom: this.svgHeight() - MARGIN.bottom,
  }));
  readonly xs = computed(() => linear(this.x().min, this.x().max, this.plot().left, this.plot().right));
  readonly ys = computed(() => linear(this.y().min, this.y().max, this.plot().bottom, this.plot().top));
  readonly y2s = computed(() => {
    const a = this.y2();
    return a ? linear(a.min, a.max, this.plot().bottom, this.plot().top) : this.ys();
  });
  readonly yTicks = computed(() => this.y().ticks.map((t) => ({ y: this.ys()(t), label: this.y().format(t) })));
  readonly y2Ticks = computed(() => this.y2()?.ticks.map((t) => ({ y: this.y2s()(t), label: this.y2()!.format(t) })) ?? []);
  /** Shown spans and markers: as far as the series are drawn, and none before there is data. */
  readonly shownSpans = computed(() =>
    this.empty()
      ? []
      : this.spans()
          .filter((s) => s.from < this.upTo())
          .map((s) => ({ x: this.xs()(s.from), width: this.xs()(Math.min(s.to, this.upTo())) - this.xs()(s.from) })),
  );
  readonly shownMarkers = computed(() =>
    this.empty()
      ? []
      : this.markers()
          .filter((m) => m.at <= this.upTo())
          .map((m) => ({ ...m, x: this.xs()(m.at) })),
  );
  /** The time ticks, with each span's end and each marker as a tick in its tone in place of a regular one too close. */
  readonly xTicks = computed(() => {
    const special = [
      ...(this.empty() ? [] : this.spans().map((s) => ({ at: s.to, tone: 'critical' }))),
      ...this.shownMarkers().map((m) => ({ at: m.at, tone: m.tone })),
    ].map((t) => ({ x: this.xs()(t.at), label: this.x().format(t.at), tone: t.tone }));
    const regular = this.x()
      .ticks.map((t) => ({ x: this.xs()(t), label: this.x().format(t), tone: '' }))
      .filter((t) => special.every((s) => Math.abs(s.x - t.x) >= TICK_ROOM));
    return [...regular, ...special];
  });
  readonly legend = computed(() => [
    ...this.series().map((s) => ({ label: s.label, kind: s.dashed ? 'dash' : 'line', tone: s.tone })),
    ...(this.threshold() ? [{ label: this.threshold()!.label, kind: 'dot', tone: 'critical' }] : []),
    ...(this.empty() ? [] : this.spans().map((s) => ({ label: s.label, kind: 'area', tone: 'critical' }))),
    ...(this.empty() ? [] : this.markers().map((m) => ({ label: m.label, kind: 'mark', tone: m.tone }))),
  ]);
  readonly playheadPositions = computed(() => this.playheadValues().map((v) => this.xs()(v)));
  readonly playheadX = computed(() => this.xs()(this.playhead()));
  /** The playhead's track runs under the time ticks. */
  readonly playheadCross = computed(() => HEAD + this.plot().bottom + 30);
}
