import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { GRAPH_BOX, GRAPH_NODE_RADIUS, type EdgeState, type GraphView, type NodeState } from '@grasp/engine';
import { uniqueId } from '../core/unique-id';
import { BADGE_HALF_HEIGHT, placeBadges, type Spot } from './badges';
import { toward, type Point } from './geometry';
import { LegendComponent } from './legend.component';
import { NODE_STYLES } from './node-styles';

const PAD = 30;
const WIDTH = GRAPH_BOX.width + 2 * PAD;
const HEIGHT = GRAPH_BOX.height + 2 * PAD;
const RADIUS = GRAPH_NODE_RADIUS;
const ARROW = 4;
const BEND = 22;
const CURVE_PIECES = 8;
const BADGE_OFFSET = RADIUS + 10;
const BADGE_REACH = BADGE_OFFSET + BADGE_HALF_HEIGHT;
const BADGE_SPOTS: Spot[] = [{ dy: BADGE_OFFSET }, { dy: -BADGE_OFFSET }];
const EDGE_STATES: EdgeState[] = ['idle', 'active', 'chosen', 'skipped'];

interface DrawnEdge {
  id: string;
  d: string;
  /** The drawn line, with a bend split into straight pieces. */
  points: Point[];
  state: EdgeState;
  directed: boolean;
  label?: string;
  labelAt: Point;
}

interface DrawnNode {
  id: string;
  label: string;
  x: number;
  y: number;
  state: NodeState;
  badge?: string;
  badgeY: number;
}

const round = (n: number) => Math.round(n * 10) / 10;

const curveAt = (start: Point, control: Point, end: Point, t: number): Point => ({
  x: (1 - t) ** 2 * start.x + 2 * (1 - t) * t * control.x + t ** 2 * end.x,
  y: (1 - t) ** 2 * start.y + 2 * (1 - t) * t * control.y + t ** 2 * end.y,
});

@Component({
  selector: 'g-graph-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LegendComponent],
  template: `
    <svg [attr.viewBox]="viewBox()" role="img" [attr.aria-label]="ariaLabel()">
      <defs>
        @for (state of edgeStates; track state) {
          <marker
            [attr.id]="markerId(state)"
            viewBox="0 0 10 10"
            refX="8"
            refY="5"
            markerWidth="7"
            markerHeight="7"
            orient="auto-start-reverse"
          >
            <path d="M0,1 L9,5 L0,9 z" class="arrow" [attr.data-state]="state" />
          </marker>
        }
      </defs>
      @for (e of edges(); track e.id) {
        <path
          class="edge"
          [attr.d]="e.d"
          [attr.data-state]="e.state"
          [attr.marker-end]="e.directed ? 'url(#' + markerId(e.state) + ')' : null"
        />
        @if (e.label) {
          <text class="edge-label" [attr.data-state]="e.state" [attr.x]="e.labelAt.x" [attr.y]="e.labelAt.y">{{ e.label }}</text>
        }
      }
      @for (n of nodes(); track n.id) {
        <g class="node" [attr.data-state]="n.state">
          <circle class="body" [attr.cx]="n.x" [attr.cy]="n.y" [attr.r]="radius" />
          <text class="label" [attr.x]="n.x" [attr.y]="n.y">{{ n.label }}</text>
          @if (n.badge) {
            <text class="badge" [attr.x]="n.x" [attr.y]="n.badgeY">{{ n.badge }}</text>
          }
        </g>
      }
    </svg>
    @if (legend()) {
      <g-legend [legend]="view().legend" swatch="state" />
    }
  `,
  styles: [
    NODE_STYLES,
    `
      :host {
        display: block;
        width: 100%;
      }
      svg {
        display: block;
        width: 100%;
        max-width: 460px;
        margin: 0 auto;
        overflow: visible;
      }
      .edge {
        fill: none;
        stroke: var(--g-stroke);
        stroke-width: 2;
        transition:
          stroke 0.25s,
          stroke-width 0.25s;
      }
      .edge[data-state='active'] {
        stroke: var(--g-active);
        stroke-width: 3.5;
      }
      .edge[data-state='chosen'] {
        stroke: var(--g-found);
        stroke-width: 3;
      }
      .edge[data-state='skipped'] {
        stroke: var(--g-faint);
        stroke-dasharray: 4 4;
      }
      .arrow {
        fill: var(--g-stroke);
      }
      .arrow[data-state='active'] {
        fill: var(--g-active);
      }
      .arrow[data-state='chosen'] {
        fill: var(--g-found);
      }
      .arrow[data-state='skipped'] {
        fill: var(--g-faint);
      }
      .edge-label {
        font: 600 11px var(--g-font-mono);
        fill: var(--g-muted);
        text-anchor: middle;
        dominant-baseline: central;
        paint-order: stroke;
        stroke: var(--g-surface);
        stroke-width: 4px;
        stroke-linejoin: round;
      }
      .edge-label[data-state='active'] {
        fill: var(--g-active);
      }
      .edge-label[data-state='chosen'] {
        fill: var(--g-found);
      }
    `,
  ],
})
export class GraphViewComponent {
  readonly view = input.required<GraphView>();
  readonly legend = input(true);

  /**
   * The box's full width, so every graph draws at one scale, but only the height its node rows and their badges reach: a
   * layout with flat rows, such as layers or a list, leaves no empty band above and below it.
   */
  protected readonly viewBox = computed(() => {
    const ys = this.placed().map((n) => n.y);
    if (!ys.length) return `0 0 ${WIDTH} ${HEIGHT}`;
    const top = Math.max(0, Math.min(...ys) - BADGE_REACH);
    const bottom = Math.min(HEIGHT, Math.max(...ys) + BADGE_REACH);
    return `0 ${round(top)} ${WIDTH} ${round(bottom - top)}`;
  });
  protected readonly radius = RADIUS;
  protected readonly edgeStates = EDGE_STATES;
  private readonly uid = uniqueId('g-graph');

  private readonly placed = computed(() =>
    this.view().nodes.map((n) => ({
      id: n.id,
      label: n.label,
      x: round(PAD + n.x * GRAPH_BOX.width),
      y: round(PAD + n.y * GRAPH_BOX.height),
      state: n.state ?? 'idle',
      badge: n.badge,
    })),
  );

  /** Each badge sits below its node, or above it when the spot below is blocked and the spot above is clear. */
  readonly nodes = computed<DrawnNode[]>(() => {
    const placed = this.placed();
    const edges = this.edges().map((e) => e.points);
    const centres = placeBadges(placed, edges, RADIUS, () => BADGE_SPOTS);
    return placed.map((n, i) => ({ ...n, badgeY: centres[i].y }));
  });

  readonly edges = computed<DrawnEdge[]>(() => {
    const at = new Map(this.placed().map((n) => [n.id, n]));
    const directedPairs = new Set(this.view().edges.flatMap((e) => (e.directed ? [`${e.from}>${e.to}`] : [])));
    return this.view().edges.flatMap((e, i) => {
      const from = at.get(e.from);
      const to = at.get(e.to);
      if (!from || !to) return [];
      const gap = e.directed ? RADIUS + ARROW : RADIUS;
      // A two-way pair would draw on top of itself, so each direction bends to its own side.
      const bends = e.directed && directedPairs.has(`${e.to}>${e.from}`);
      const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
      const length = Math.hypot(to.x - from.x, to.y - from.y) || 1;
      const control = bends ? { x: mid.x - ((to.y - from.y) / length) * BEND, y: mid.y + ((to.x - from.x) / length) * BEND } : mid;
      const start = toward(from, control, RADIUS);
      const end = toward(to, control, gap);
      const d = bends
        ? `M${round(start.x)},${round(start.y)} Q${round(control.x)},${round(control.y)} ${round(end.x)},${round(end.y)}`
        : `M${round(start.x)},${round(start.y)} L${round(end.x)},${round(end.y)}`;
      const points = bends
        ? Array.from({ length: CURVE_PIECES + 1 }, (_, k) => curveAt(start, control, end, k / CURVE_PIECES))
        : [start, end];
      const curveMid = bends ? { x: (from.x + to.x) / 4 + control.x / 2, y: (from.y + to.y) / 4 + control.y / 2 } : mid;
      return [
        { id: `${i}:${e.from}-${e.to}`, d, points, state: e.state ?? 'idle', directed: e.directed, label: e.label, labelAt: curveMid },
      ];
    });
  });

  readonly ariaLabel = computed(() => {
    const v = this.view();
    const active = v.nodes.find((n) => n.state === 'active');
    return `Graph with ${v.nodes.length} nodes and ${v.edges.length} edges${active ? `, current node ${active.label}` : ''}`;
  });

  protected markerId(state: EdgeState) {
    return `${this.uid}-${state}`;
  }
}
