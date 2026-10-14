import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ChartFrameComponent, type ChartAxis, type ChartBars, type ChartMarker, type ChartTable } from './chart-frame.component';

export interface HistogramBin {
  from: number;
  to: number;
  /** A share of all values, 0 to 1. */
  share: number;
}

/**
 * A distribution on a fixed axis (REDESIGN.md 3.3): bars for this run's bins, a dashed outline of the previous run's (a
 * ghost, so a change shows as a shift), and p50 and p99 as markers named in the legend with their values.
 */
@Component({
  selector: 'g-histogram',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ChartFrameComponent],
  template: `
    <g-chart-frame
      [heading]="heading()"
      [summary]="summary()"
      [width]="width()"
      [height]="height()"
      [x]="x()"
      [y]="y()"
      [bars]="bars()"
      [markers]="markers()"
      [table]="table()"
      [legendLines]="legendLines()"
    />
  `,
  host: { '[style.display]': "'block'" },
})
export class HistogramComponent {
  readonly heading = input.required<string>();
  readonly summary = input.required<string>();
  readonly width = input.required<number>();
  readonly height = input.required<number>();
  readonly x = input.required<ChartAxis>();
  readonly y = input.required<ChartAxis>();
  readonly bins = input.required<readonly HistogramBin[]>();
  readonly ghost = input<readonly HistogramBin[] | null>(null);
  readonly label = input('this run');
  readonly p50 = input.required<number>();
  readonly p99 = input.required<number>();
  /** How the legend says p50 and p99; the axis's tick format by default. */
  readonly format = input<(value: number) => string>();
  readonly table = input<ChartTable>();
  readonly legendLines = input(3);

  readonly bars = computed((): ChartBars[] => {
    const toItems = (bins: readonly HistogramBin[]) => bins.map((b) => ({ from: b.from, to: b.to, value: b.share }));
    const ghost = this.ghost();
    return [
      { id: 'now', tone: 'current', label: this.label(), items: toItems(this.bins()) },
      ...(ghost ? [{ id: 'ghost', tone: 'muted' as const, ghost: true, label: 'previous run', items: toItems(ghost) }] : []),
    ];
  });
  readonly markers = computed((): ChartMarker[] => {
    const format = this.format() ?? this.x().format;
    return [
      { at: this.p50(), label: `p50 ${format(this.p50())}`, tone: 'ink', tick: false },
      { at: this.p99(), label: `p99 ${format(this.p99())}`, tone: 'considering', tick: false },
    ];
  });
}
