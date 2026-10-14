import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

export type Scale = (value: number) => number;
export type Point = readonly [number, number];

/** A linear map from `[d0, d1]` onto `[r0, r1]`, clamped to the range so a value past the axis stays on the frame. */
export function linear(d0: number, d1: number, r0: number, r1: number): Scale {
  const [lo, hi] = r0 < r1 ? [r0, r1] : [r1, r0];
  return (v) => Math.min(hi, Math.max(lo, r0 + ((v - d0) / (d1 - d0)) * (r1 - r0)));
}

/** A log map from `[d0, d1]` onto `[r0, r1]`, clamped like `linear`: equal ratios take equal lengths. */
export function logScale(d0: number, d1: number, r0: number, r1: number): Scale {
  const at = linear(Math.log10(d0), Math.log10(d1), r0, r1);
  return (v) => at(Math.log10(Math.max(v, d0 / 10)));
}

/** The SVG path through `points` (data units) up to x = `upTo`, rounded to tenths of a pixel. */
export function sparkPath(points: readonly Point[], x: Scale, y: Scale, upTo = Infinity): string {
  const r = (v: number) => Math.round(v * 10) / 10;
  return points
    .filter(([px]) => px <= upTo)
    .map(([px, py], i) => `${i ? 'L' : 'M'}${r(x(px))} ${r(y(py))}`)
    .join('');
}

/** A series line on a chart (REDESIGN.md 3.3): drawn into an SVG group, with the scales of the frame it sits in. */
@Component({
  selector: 'g[g-sparkline]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<svg:path class="line" [class.dashed]="dashed()" [attr.stroke-dasharray]="dash()" [attr.d]="d()" />`,
  styles: `
    .line {
      fill: none;
      stroke: currentColor;
      stroke-width: 2.5;
      stroke-linejoin: round;
      stroke-linecap: round;
    }
    .dashed {
      stroke-dasharray: 6 5;
      stroke-linecap: butt;
    }
    :host(.thin) .line {
      stroke-width: 1.5;
    }
  `,
})
export class SparklineComponent {
  readonly points = input.required<readonly Point[]>();
  readonly x = input.required<Scale>();
  readonly y = input.required<Scale>();
  readonly upTo = input(Infinity);
  readonly dashed = input(false);
  /** A dash pattern of its own, so several series tell apart without hue. */
  readonly dash = input<string>();
  readonly d = computed(() => sparkPath(this.points(), this.x(), this.y(), this.upTo()));
}
