import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { fmt, type RoutePoint } from '@grasp/engine';

export interface SysEdgeView {
  key: string;
  from: string;
  to: string;
  d: string;
  mid: RoutePoint;
  /** The route as a polyline, for a traveling dot. */
  points: readonly RoutePoint[];
  rps: number;
  /** `1.5 + 4.5·sqrt(rps / the busiest edge's rps)` (REDESIGN.md 4.6). */
  width: number;
  /** The part of this edge's traffic its target refuses for want of capacity. */
  droppedRps: number;
  /** Replication into a replica, or work handed to a queue. */
  tag: 'repl' | 'async' | null;
  /** Whether the rps pill shows without hover: the three busiest edges and the selected one. */
  pill: boolean;
  /** Whether the rps pill fits on the route, with room for the red tail; on a shorter edge it never shows, not even on hover. */
  pillFits: boolean;
  /** Whether "−N rps dropped" fits beside the route, under its pill; the tail is drawn either way. */
  dropLabel: boolean;
}

/** Width of an edge carrying `rps` beside the board's busiest, `max`: a square root, so 3k against 200k reads about 3× thinner, not 1.4×. */
export const edgeWidth = (rps: number, max: number) => 1.5 + 4.5 * Math.sqrt(max > 0 ? Math.min(1, rps / max) : 0);

/** Approximate width of a label in the 11px mono pill, for its backing. */
export const pillWidth = (text: string) => text.length * 6.8 + 12;

/**
 * `g-sys-edge` (REDESIGN.md 4.6): a neutral routed edge with an arrowhead, only the share its target drops drawn as a
 * critical tail with "−1.0k rps dropped", dashed with a "repl" tag into a replica, tagged "async" into a queue, and an rps
 * pill on the busiest edges, on hover and on selection.
 */
@Component({
  selector: 'g[gSysEdge]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.idle]': 'view().rps === 0',
    '[class.repl]': "view().tag === 'repl'",
    '[class.pinned]': 'view().pill',
    '[class.roomy]': 'view().pillFits',
  },
  template: `
    @let e = view();
    <svg:path class="hit" [attr.d]="e.d" />
    <svg:path class="base" [attr.d]="e.d" [attr.stroke-width]="e.width" marker-end="url(#g-sys-arrow)" />
    @if (e.droppedRps > 0) {
      <!-- Where the label cannot fit, the whole edge turns critical, so what is refused stays visible. -->
      <svg:path
        class="tail"
        [attr.d]="e.d"
        pathLength="100"
        [attr.stroke-dasharray]="e.dropLabel ? '0 70 30' : '6 4'"
        [attr.stroke-width]="tailWidth()"
      />
    }
    @if (e.dropLabel) {
      <svg:text class="dropped" [attr.x]="e.mid[0]" [attr.y]="e.mid[1] + 22 * textScale()" text-anchor="middle">
        −{{ fmt(e.droppedRps) }} rps dropped
      </svg:text>
    }
    @if (e.tag) {
      <svg:text class="tag" [attr.x]="e.mid[0]" [attr.y]="e.mid[1] + (e.dropLabel ? 36 : 22) * textScale()" text-anchor="middle">
        {{ e.tag }}
      </svg:text>
    }
    <svg:g class="pill" [attr.transform]="'translate(' + e.mid[0] + ',' + e.mid[1] + ')'">
      <svg:rect [attr.x]="-pillW() / 2" [attr.y]="-9 * textScale()" [attr.width]="pillW()" [attr.height]="18 * textScale()" />
      <svg:text [attr.y]="4 * textScale()" text-anchor="middle">{{ rpsText() }}</svg:text>
    </svg:g>
  `,
  styleUrl: './sys-edge.component.scss',
})
export class SysEdgeComponent {
  readonly view = input.required<SysEdgeView>();
  /** How much the labels grow on a zoomed-out canvas, so they stay legible. */
  readonly textScale = input(1);
  readonly fmt = fmt;
  readonly rpsText = computed(() => `${fmt(this.view().rps)} rps`);
  readonly pillW = computed(() => pillWidth(this.rpsText()) * this.textScale());
  readonly tailWidth = computed(() => {
    const e = this.view();
    return Math.max(3, e.width * Math.min(1, e.droppedRps / Math.max(1, e.rps)));
  });
}
