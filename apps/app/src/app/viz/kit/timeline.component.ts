import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { ChartAxis, ChartTone } from './chart-frame.component';
import { HandleComponent } from './handle.component';
import { linear } from './sparkline.component';
import { MARK_R, placeEventLabels, placeLaneLabels, type TimelineGeometry } from './timeline-layout';

export interface TimelineLane {
  id: string;
  label: string;
}

/** A stretch of time on a lane: a lease held, a pause, a window. Its label goes in the legend under the axis. */
export interface TimelineSpan {
  lane: string;
  from: number;
  to: number;
  tone: ChartTone;
  label: string;
}

/** A numbered moment on a lane, with its label under it, or over it when a message passes under. */
export interface TimelineEvent {
  lane: string;
  at: number;
  n: number;
  tone: ChartTone;
  label: string;
}

/**
 * A message from one lane at one time to another lane at a later time; a `rejected` one ends in ×. An end that names an
 * event (`n`) meets that event's marker, wherever it is drawn.
 */
export interface TimelineMessage {
  id: string;
  from: { lane: string; at: number; n?: number };
  to: { lane: string; at: number; n?: number };
  tone: ChartTone;
  rejected?: boolean;
}

/** A small mark on a lane: one of a stream of moments, as each of a series of reads. */
export interface TimelineMark {
  lane: string;
  at: number;
  tone: ChartTone;
}

/** A handle on a lane at `at`, snapping to `values` along the time axis; one that names an event (`n`) rings its marker. */
export interface TimelineHandle {
  id: string;
  lane: string;
  at: number;
  n?: number;
  values: readonly number[];
  label: string;
  valuetext: string;
}

const PAD = 16;
const LANE = 68;
const AXIS = 30;
/** A line of legend under the axis; the owner reserves as many as its longest legend needs, so nothing moves. */
const LEGEND_LINE = 20;
const R = MARK_R;
/** Where a lane's label, its line and its event labels sit in its row. */
const ROW = { label: 13, line: 36, events: 62 };

/** The timeline's geometry, for an owner that draws over it (an experiment's focus outline). */
export const TIMELINE = { pad: PAD, lane: LANE, axis: AXIS, legendLine: LEGEND_LINE, row: ROW };
export const timelineHeight = (lanes: number, legendLines: number) => lanes * LANE + AXIS + legendLines * LEGEND_LINE;

/**
 * A timeline (REDESIGN.md 3.3): lanes over a fixed time axis, their labels in a gutter at the left or over each row;
 * spans on a lane; numbered events, side by side when close in time, whose labels sit clear of messages and of each
 * other; small marks for a stream of moments; messages travelling between lanes (a sequence diagram turned on its side:
 * time runs left to right); and handles that drag a moment along its lane. With `now` set, only what has happened by
 * then is drawn, and a message in flight shows how far it has got.
 */
@Component({
  selector: 'g-timeline',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [HandleComponent],
  host: { '[style.width.px]': 'width()', '[style.height.px]': 'height()', '[class.large]': 'large()' },
  template: `
    <svg
      [attr.viewBox]="'0 0 ' + width() + ' ' + height()"
      [attr.width]="width()"
      [attr.height]="height()"
      role="img"
      [attr.aria-label]="summary()"
    >
      @for (l of laneRows(); track l.id) {
        <line class="lane" [attr.x1]="left()" [attr.x2]="width() - pad" [attr.y1]="l.y" [attr.y2]="l.y" />
      }
      @for (s of shownSpans(); track $index) {
        <rect [class]="'span ' + s.tone" [attr.x]="s.x" [attr.y]="s.y - 9" [attr.width]="s.width" height="18" />
      }
      @for (t of ticks(); track $index) {
        <line class="tick-mark" [attr.x1]="t.x" [attr.x2]="t.x" [attr.y1]="axisY()" [attr.y2]="axisY() + 4" />
        <text class="tick" text-anchor="middle" [attr.x]="t.x" [attr.y]="axisY() + 17">{{ t.label }}</text>
      }
      <line class="axis" [attr.x1]="left()" [attr.x2]="width() - pad" [attr.y1]="axisY()" [attr.y2]="axisY()" />
      @if (now() < axis().max) {
        <line class="now" [attr.x1]="nowX()" [attr.x2]="nowX()" y1="4" [attr.y2]="axisY()" />
      }
      @for (m of shownMessages(); track m.id) {
        <g [class]="'message ' + m.tone">
          <line [attr.x1]="m.x1" [attr.y1]="m.y1" [attr.x2]="m.x2" [attr.y2]="m.y2" />
          @if (m.arrived) {
            @if (m.rejected) {
              <path class="cross" [attr.transform]="'translate(' + m.x2 + ' ' + m.y2 + ')'" d="M-5 -5L5 5M5 -5L-5 5" />
            } @else {
              <path class="head" [attr.d]="m.head" />
            }
          } @else {
            <circle class="travel" [attr.cx]="m.x2" [attr.cy]="m.y2" r="4.5" />
          }
        </g>
      }
      @for (k of shownMarks(); track $index) {
        <circle [class]="'mark ' + k.tone" [attr.cx]="k.x" [attr.cy]="k.y" r="4" />
      }
      @for (e of shownEvents(); track e.n) {
        <g [class]="'event ' + e.tone">
          <circle class="back" [attr.cx]="e.x" [attr.cy]="e.y" [attr.r]="r" />
          <circle [attr.cx]="e.x" [attr.cy]="e.y" [attr.r]="r" />
          <text class="num" text-anchor="middle" [attr.x]="e.x" [attr.y]="e.y + 4">{{ e.n }}</text>
          <text class="event-label" [attr.x]="e.labelX + 3" [attr.y]="e.labelY">{{ e.label }}</text>
        </g>
      }
      @for (l of laneRows(); track l.id) {
        <text class="lane-label" [attr.x]="l.labelX" [attr.y]="l.labelY">{{ l.label }}</text>
      }
    </svg>
    @for (h of placedHandles(); track h.id) {
      <g-handle
        knob="ring"
        [class.ahead]="h.at > now()"
        [label]="h.label"
        [values]="h.values"
        [positions]="h.positions"
        [cross]="h.y"
        [valuetext]="h.valuetext"
        [disabled]="disabled()"
        [value]="h.at"
        (valueChange)="moved.emit({ id: h.id, value: $event })"
      />
    }
    <ul class="legend" [style.top.px]="axisY() + 26">
      @for (l of legend(); track $index) {
        <li>
          <svg width="16" height="12" aria-hidden="true"><rect [class]="'span ' + l.tone" x="1" y="1" width="14" height="10" /></svg>
          {{ l.label }}
        </li>
      }
    </ul>
  `,
  styles: `
    :host {
      position: relative;
      display: block;
    }
    .legend {
      position: absolute;
      left: 0;
      right: 0;
      list-style: none;
      margin: 0;
      padding: 0 var(--g-space-4);
      display: flex;
      flex-wrap: wrap;
      gap: 0 var(--g-space-3);
      font: 500 var(--g-text-label) / 1.55 var(--ion-font-family);
      color: var(--g-muted);
      li {
        display: flex;
        align-items: center;
        gap: var(--g-space-1);
        white-space: nowrap;
      }
    }
    svg {
      display: block;
      overflow: visible;
    }
    text {
      paint-order: stroke;
      stroke: var(--g-viz-stage);
      stroke-width: 3px;
      stroke-linejoin: round;
    }
    .lane-label {
      fill: var(--g-muted);
      font: 600 var(--g-text-label) var(--ion-font-family);
      letter-spacing: 0.04em;
    }
    :host(.large) {
      .lane-label,
      .event-label,
      .legend {
        font-size: var(--g-text-body-s);
      }
    }
    // While a play runs, a handle on a moment it has not reached yet would ring an empty spot: it fades until then.
    g-handle.ahead {
      opacity: 0.15;
    }
    .mark {
      stroke: var(--g-viz-stage);
      stroke-width: 1.5;
      &.critical {
        fill: var(--g-viz-critical);
      }
      &.final {
        fill: var(--g-viz-final);
      }
      &.current {
        fill: var(--g-viz-current);
      }
    }
    .lane {
      stroke: var(--g-line-strong);
      stroke-width: 1.5;
    }
    .axis,
    .tick-mark {
      stroke: var(--g-line-strong);
    }
    .tick {
      fill: var(--g-muted);
      font: 500 var(--g-text-label) var(--ion-font-family);
      font-variant-numeric: tabular-nums;
    }
    .span {
      stroke-width: 1.5;
      &.final {
        fill: var(--g-viz-final-soft);
        stroke: var(--g-viz-final);
      }
      &.current {
        fill: var(--g-viz-current-soft);
        stroke: var(--g-viz-current);
      }
      &.considering {
        fill: var(--g-viz-considering-soft);
        stroke: var(--g-viz-considering);
        stroke-dasharray: 4 3;
      }
      &.critical {
        fill: var(--g-danger-soft);
        stroke: var(--g-viz-critical);
        stroke-dasharray: 2 2;
      }
      &.muted,
      &.ink {
        fill: rgba(var(--g-text-rgb), 0.06);
        stroke: var(--g-muted);
        stroke-dasharray: 2 3;
      }
    }
    .message {
      color: var(--g-text);
      line {
        stroke: currentColor;
        stroke-width: 2;
      }
      .head {
        fill: currentColor;
      }
      .travel {
        fill: currentColor;
        stroke: var(--g-viz-stage);
      }
      .cross {
        fill: none;
        stroke: var(--g-viz-critical);
        stroke-width: 2.5;
        stroke-linecap: round;
      }
      &.current {
        color: var(--g-viz-current);
      }
      &.final {
        color: var(--g-viz-final);
      }
      &.considering {
        color: var(--g-viz-considering);
        line {
          stroke-dasharray: 5 4;
        }
      }
      &.critical {
        color: var(--g-viz-critical);
      }
      &.muted {
        color: var(--g-muted);
      }
    }
    .now {
      stroke: var(--g-accent);
      stroke-width: 1.5;
    }
    .event {
      circle {
        stroke-width: 2;
        fill: var(--g-viz-stage);
        stroke: var(--g-text);
      }
      // An opaque disc under a marker with a soft fill, so no line or span edge shows through its number.
      circle.back {
        fill: var(--g-viz-stage);
        stroke: none;
      }
      .num {
        font: 600 var(--g-text-label) var(--g-font-mono);
        fill: var(--g-text);
        stroke: none;
      }
      &.current circle {
        fill: var(--g-viz-current);
        stroke: var(--g-viz-current);
      }
      &.current .num {
        fill: var(--g-viz-current-ink);
      }
      &.final circle {
        fill: var(--g-viz-final-soft);
        stroke: var(--g-viz-final);
      }
      &.considering circle {
        fill: var(--g-viz-considering-soft);
        stroke: var(--g-viz-considering);
        stroke-dasharray: 3 2;
      }
      &.critical circle {
        fill: var(--g-viz-critical);
        stroke: var(--g-viz-critical);
      }
      &.critical .num {
        fill: var(--g-viz-stage);
      }
    }
    .event-label {
      fill: var(--g-text);
      font: 500 var(--g-text-label) var(--ion-font-family);
    }
  `,
})
export class TimelineComponent {
  readonly width = input.required<number>();
  readonly axis = input.required<ChartAxis>();
  readonly lanes = input.required<readonly TimelineLane[]>();
  readonly spans = input<readonly TimelineSpan[]>([]);
  readonly events = input<readonly TimelineEvent[]>([]);
  readonly messages = input<readonly TimelineMessage[]>([]);
  readonly handles = input<readonly TimelineHandle[]>([]);
  readonly marks = input<readonly TimelineMark[]>([]);
  /** A gutter this wide left of the time axis holds the lane labels beside their lines, so they never move. */
  readonly gutter = input(0);
  /** Larger labels, for a wide stage. */
  readonly large = input(false);
  readonly summary = input.required<string>();
  /** Only what has happened by this time is drawn. */
  readonly now = input(Infinity);
  readonly disabled = input(false);
  readonly moved = output<{ id: string; value: number }>();

  readonly pad = PAD;
  readonly r = R;
  readonly line = ROW.line;
  readonly labelRow = ROW.label;
  /** Lines kept for the legend whatever it holds now. */
  readonly legendLines = input(1);
  readonly height = computed(() => timelineHeight(this.lanes().length, this.legendLines()));
  readonly axisY = computed(() => this.lanes().length * LANE + 2);
  readonly left = computed(() => PAD + this.gutter());
  readonly xs = computed(() => linear(this.axis().min, this.axis().max, this.left(), this.width() - PAD));
  readonly nowX = computed(() => this.xs()(this.now()));
  readonly laneY = computed(() => new Map(this.lanes().map((l, i) => [l.id, i * LANE + ROW.line])));
  readonly laneRows = computed(() => {
    const placed = placeLaneLabels(this.geometry());
    return this.lanes().map((l) => ({ ...l, y: this.laneY().get(l.id)!, labelX: placed.get(l.id)!.x, labelY: placed.get(l.id)!.y }));
  });
  readonly ticks = computed(() => this.axis().ticks.map((t) => ({ x: this.xs()(t), label: this.axis().format(t) })));

  readonly shownSpans = computed(() =>
    this.spans()
      .filter((s) => s.from < Math.min(s.to, this.now()))
      .map((s) => {
        const x = this.xs()(s.from);
        const width = this.xs()(Math.min(s.to, this.now())) - x;
        return { ...s, x, width, y: this.laneY().get(s.lane)! };
      }),
  );

  /** Placed for the whole timeline, so labels never move while a play draws it. */
  readonly geometry = computed((): TimelineGeometry => ({
    lanes: this.lanes(),
    x: this.xs(),
    laneY: (lane) => this.laneY().get(lane)!,
    messages: this.messages(),
    width: this.width(),
    pad: PAD,
    row: ROW,
    gutter: this.gutter(),
    large: this.large(),
  }));
  readonly placedEvents = computed(() => placeEventLabels(this.events(), this.geometry()));
  readonly shownEvents = computed(() => this.placedEvents().filter((e) => e.at <= this.now()));
  readonly shownMarks = computed(() =>
    this.marks()
      .filter((k) => k.at <= this.now())
      .map((k) => ({ ...k, x: this.xs()(k.at), y: this.laneY().get(k.lane)! })),
  );
  readonly legend = computed(() => {
    const seen = new Set<string>();
    return this.spans().filter((s) => !seen.has(`${s.tone} ${s.label}`) && !!seen.add(`${s.tone} ${s.label}`));
  });

  readonly shownMessages = computed(() =>
    this.messages()
      .filter((m) => m.from.at <= this.now())
      .map((m) => {
        const [xs, ys] = [this.xs(), this.laneY()];
        const x = (end: TimelineMessage['from']) => this.placedEvents().find((e) => e.n === end.n)?.x ?? xs(end.at);
        const [x1, y1, x2, y2] = [x(m.from), ys.get(m.from.lane)!, x(m.to), ys.get(m.to.lane)!];
        const dir = Math.sign(y2 - y1) || 1;
        const start = { x: x1, y: y1 + dir * R };
        const end = { x: x2, y: y2 - dir * R };
        const share = m.to.at > m.from.at ? Math.min(1, (this.now() - m.from.at) / (m.to.at - m.from.at)) : 1;
        const head = { x: start.x + (end.x - start.x) * share, y: start.y + (end.y - start.y) * share };
        const angle = Math.atan2(end.y - start.y, end.x - start.x);
        const point = (len: number, turn: number) =>
          `${(end.x - len * Math.cos(angle + turn)).toFixed(1)} ${(end.y - len * Math.sin(angle + turn)).toFixed(1)}`;
        return {
          ...m,
          x1: start.x,
          y1: start.y,
          x2: head.x,
          y2: head.y,
          arrived: share >= 1,
          head: `M${end.x.toFixed(1)} ${end.y.toFixed(1)}L${point(8, 0.45)}L${point(8, -0.45)}Z`,
        };
      }),
  );

  /** Each handle's stops; the one it is at follows its event's marker when markers close in time sit side by side. */
  readonly placedHandles = computed(() =>
    this.handles().map((h) => {
      const marker = this.shownEvents().find((e) => e.n === h.n)?.x;
      const positions = h.values.map((v) => (v === h.at && marker !== undefined ? marker : this.xs()(v)));
      return { ...h, y: this.laneY().get(h.lane)!, positions };
    }),
  );
}
