import { ChangeDetectionStrategy, Component, computed, input, model, signal } from '@angular/core';
import { DataTableComponent } from './data-table.component';
import { HandleComponent } from './handle.component';
import { SparklineComponent, linear, logScale, type Point, type Scale } from './sparkline.component';

export interface ChartAxis {
  min: number;
  max: number;
  ticks: readonly number[];
  format: (value: number) => string;
  /** Equal ratios take equal lengths: for latencies that run from milliseconds to minutes. */
  log?: boolean;
}

/** A diagram role (REDESIGN.md 3.6); `muted` is a series in the background of a `current` one. */
export type ChartTone = 'ink' | 'final' | 'considering' | 'critical' | 'current' | 'muted';

export interface ChartSeries {
  id: string;
  points: readonly Point[];
  /** The right-hand axis, for a second unit. */
  right?: boolean;
  tone: ChartTone;
  /** A second series is dashed, so it never relies on its hue. */
  dashed?: boolean;
  /** A dash pattern of its own, when several background series must tell apart without hue. */
  dash?: string;
  thin?: boolean;
  label: string;
  /** A short name drawn at the line's end, in the frame's `endLabels` margin. */
  short?: string;
}

/** Bars over spans of the x axis, as a histogram draws; a `ghost` set is a dashed outline (the previous run). */
export interface ChartBars {
  id: string;
  tone: ChartTone;
  label: string;
  ghost?: boolean;
  items: readonly { from: number; to: number; value: number }[];
}

/** A moment on the x axis: a dashed line through the plot, and (unless `tick` is false) its value on the axis in its tone. */
export interface ChartMarker {
  at: number;
  label: string;
  tone: ChartTone;
  tick?: boolean;
}

/** A value marked on the plot, as the current setting's point on a curve; one above the axis is a cap at its top. */
export interface ChartDot {
  x: number;
  y: number;
  tone: ChartTone;
  label: string;
}

export interface ChartTable {
  head: readonly string[];
  rows: readonly (readonly string[])[];
}

type LegendKind = 'line' | 'area' | 'mark' | 'threshold' | 'ghost' | 'dot';

const HEAD = 28;
const LEGEND_LINE = 17;
const MARGIN = { top: 8, bottom: 40, left: 36, right: 12, rightAxis: 36 };
/** A regular tick this close to a marker's tick gives way to it. */
const TICK_ROOM = 24;
/** End labels keep this far apart, so two lines that meet still name both. */
const END_ROOM = 14;
/** A bar with any value keeps this much height, so a tail of a few requests still shows on its axis. */
const MIN_BAR = 2;

/** Moves sorted label positions apart by at least `room`, keeping them inside [top, bottom]. */
export function spreadLabels(ys: readonly number[], room: number, top: number, bottom: number): number[] {
  const order = ys.map((y, i) => ({ y, i })).sort((a, b) => a.y - b.y);
  const out = order.map((o) => o.y);
  for (let k = 1; k < out.length; k++) out[k] = Math.max(out[k], out[k - 1] + room);
  out[out.length - 1] = Math.min(out[out.length - 1] ?? 0, bottom);
  for (let k = out.length - 2; k >= 0; k--) out[k] = Math.min(out[k], out[k + 1] - room);
  if (out.length && out[0] < top) for (let k = 0; k < out.length; k++) out[k] = Math.max(out[k], top + k * room);
  const placed: number[] = [];
  order.forEach((o, k) => (placed[o.i] = out[k]));
  return placed;
}

const scale = (a: ChartAxis, r0: number, r1: number): Scale => (a.log ? logScale : linear)(a.min, a.max, r0, r1);

/**
 * A chart's frame (REDESIGN.md 3.3): fixed axes (linear or log) with ticks and units, so a run never rescales the
 * picture; a threshold line, shaded spans, bars and markers; series drawn up to `upTo`; a legend under the plot, so no
 * label crosses a line; a playhead the learner drags on its own track under the x axis; and a toggle that swaps the
 * drawing for its data table in the same box.
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
  readonly bars = input<readonly ChartBars[]>([]);
  readonly threshold = input<{ value: number; label: string }>();
  /** Shaded stretches of the x axis: over capacity (critical, the default), or a spike or burst (considering). */
  readonly spans = input<readonly { from: number; to: number; label: string; tone?: ChartTone }[]>([]);
  readonly markers = input<readonly ChartMarker[]>([]);
  readonly dots = input<readonly ChartDot[]>([]);
  /** A line at this x value, for a setting the learner moves elsewhere (a slider beside the chart). */
  readonly cursor = input<number | null>(null);
  /** Lines of legend reserved under the plot, so a narrow chart can wrap it without the plot moving; 0 hides it. */
  readonly legendLines = input(3);
  /** A right margin this wide for the series' `short` names at their line ends; 0 for none. */
  readonly endLabels = input(0);
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

  readonly legendHeight = computed(() => (this.legendLines() ? this.legendLines() * LEGEND_LINE + 1 : 0));
  readonly svgHeight = computed(() => this.height() - HEAD - this.legendHeight());
  readonly plot = computed(() => ({
    left: MARGIN.left,
    right: this.width() - (this.y2() ? MARGIN.rightAxis : this.endLabels() || MARGIN.right),
    top: MARGIN.top,
    bottom: this.svgHeight() - MARGIN.bottom,
  }));
  readonly xs = computed(() => scale(this.x(), this.plot().left, this.plot().right));
  readonly ys = computed(() => scale(this.y(), this.plot().bottom, this.plot().top));
  readonly y2s = computed(() => {
    const a = this.y2();
    return a ? scale(a, this.plot().bottom, this.plot().top) : this.ys();
  });
  readonly yTicks = computed(() => this.y().ticks.map((t) => ({ y: this.ys()(t), label: this.y().format(t) })));
  readonly y2Ticks = computed(() => this.y2()?.ticks.map((t) => ({ y: this.y2s()(t), label: this.y2()!.format(t) })) ?? []);
  /** Shown spans and markers: as far as the series are drawn, and none before there is data. */
  readonly shownSpans = computed(() =>
    this.empty()
      ? []
      : this.spans()
          .filter((s) => s.from < this.upTo())
          .map((s) => ({
            x: this.xs()(s.from),
            width: this.xs()(Math.min(s.to, this.upTo())) - this.xs()(s.from),
            tone: s.tone ?? 'critical',
          })),
  );
  readonly shownMarkers = computed(() =>
    this.empty()
      ? []
      : this.markers()
          .filter((m) => m.at <= this.upTo())
          .map((m) => ({ ...m, x: this.xs()(m.at) })),
  );
  readonly shownBars = computed(() => {
    if (this.empty()) return [];
    const [xs, ys, bottom] = [this.xs(), this.ys(), this.plot().bottom];
    return this.bars().map((b) => {
      const rects = b.items.map((i) => ({
        x: xs(i.from),
        width: xs(i.to) - xs(i.from),
        y: i.value > 0 && !b.ghost ? Math.min(ys(i.value), bottom - MIN_BAR) : ys(i.value),
      }));
      // A ghost is its bars' outline: one step path, so the bars in front stay readable through it.
      const steps = rects.map((r) => `V${r.y}H${r.x + r.width}`).join('');
      return {
        ...b,
        rects: rects.filter((r) => r.y < bottom).map((r) => ({ ...r, height: bottom - r.y })),
        outline: rects.length ? `M${rects[0].x} ${bottom}${steps}V${bottom}` : '',
      };
    });
  });
  /** The x ticks, with each span's end and each ticked marker as a tick in its tone in place of a regular one too close. */
  readonly xTicks = computed(() => {
    const special = [
      ...(this.empty() ? [] : this.spans().map((s) => ({ at: s.to, tone: s.tone ?? 'critical' }))),
      ...this.shownMarkers()
        .filter((m) => m.tick !== false)
        .map((m) => ({ at: m.at, tone: m.tone })),
    ].map((t) => ({ x: this.xs()(t.at), label: this.x().format(t.at), tone: t.tone }));
    const regular = this.x()
      .ticks.map((t) => ({ x: this.xs()(t), label: this.x().format(t), tone: '' }))
      .filter((t) => special.every((s) => Math.abs(s.x - t.x) >= TICK_ROOM));
    // A tick at the plot's right end ends there, so its label never runs past the frame.
    return [...regular, ...special].map((t) =>
      t.x > this.width() - TICK_ROOM ? { ...t, x: Math.min(this.width() - 1, t.x + 6), anchor: 'end' } : { ...t, anchor: 'middle' },
    );
  });
  readonly shownDots = computed(() => {
    if (this.empty()) return [];
    const top = this.plot().top;
    return this.dots().map((d) => ({ ...d, cx: this.xs()(d.x), cy: this.ys()(d.y), over: d.y > this.y().max, top }));
  });
  /** Each named series' end label, beside its last drawn point, spread apart so none covers another. */
  readonly endTexts = computed(() => {
    if (this.empty() || !this.endLabels()) return [];
    const named = this.series().filter((s) => s.short && s.points.some(([x]) => x <= this.upTo()));
    const ys = named.map((s) => {
      const last = s.points.filter(([x]) => x <= this.upTo()).at(-1)!;
      return (s.right ? this.y2s() : this.ys())(last[1]);
    });
    const p = this.plot();
    const placed = spreadLabels(ys, END_ROOM, p.top + 4, p.bottom);
    return named.map((s, i) => ({ id: s.id, text: s.short!, tone: s.tone, x: p.right + 6, y: placed[i] + 4 }));
  });
  /** Legend items keyed by what they name, so a value changing in a label updates its text rather than its whole item. */
  readonly legend = computed(() => {
    const items: { id: string; label: string; kind: LegendKind; tone: string; dash?: string }[] = [
      ...this.series().map((s) => ({
        id: `s ${s.id}`,
        label: s.label,
        kind: 'line' as const,
        tone: s.tone,
        dash: s.dashed ? '6 5' : s.dash,
      })),
      ...this.bars().map((b) => ({
        id: `b ${b.id}`,
        label: b.label,
        kind: b.ghost ? ('ghost' as const) : ('area' as const),
        tone: b.tone,
      })),
    ];
    if (this.threshold()) items.push({ id: 'threshold', label: this.threshold()!.label, kind: 'threshold', tone: 'critical' });
    if (!this.empty()) {
      items.push(
        ...this.spans().map((s, i) => ({ id: `span ${i}`, label: s.label, kind: 'area' as const, tone: `span ${s.tone ?? 'critical'}` })),
      );
      items.push(...this.markers().map((m, i) => ({ id: `mark ${i}`, label: m.label, kind: 'mark' as const, tone: m.tone })));
      items.push(...this.dots().map((d, i) => ({ id: `dot ${i}`, label: d.label, kind: 'dot' as const, tone: d.tone })));
    }
    return items;
  });
  readonly playheadPositions = computed(() => this.playheadValues().map((v) => this.xs()(v)));
  readonly playheadX = computed(() => this.xs()(this.playhead()));
  /** The playhead's track runs under the x ticks. */
  readonly playheadCross = computed(() => HEAD + this.plot().bottom + 30);
}
