import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { EdgeState, GraphView, NodeState } from '@grasp/engine';
import { NODE_STYLES } from './node-styles';

const WIDTH = 340;
const HEIGHT = 270;
const PAD = 30;
const RADIUS = 16;
const ARROW = 4;
const BEND = 22;
const BADGE_OFFSET = RADIUS + 10;
const EDGE_STATES: EdgeState[] = ['idle', 'active', 'chosen', 'skipped'];

interface Point {
  x: number;
  y: number;
}

interface DrawnEdge {
  id: string;
  d: string;
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

let instances = 0;

const toward = (from: Point, to: Point, distance: number): Point => {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  return { x: from.x + (dx / length) * distance, y: from.y + (dy / length) * distance };
};

const round = (n: number) => Math.round(n * 10) / 10;

@Component({
  selector: 'g-graph-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <svg [attr.viewBox]="viewBox" role="img" [attr.aria-label]="ariaLabel()">
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
    @if (legend() && legendEntries().length) {
      <div class="legend">
        @for (entry of legendEntries(); track entry[0]) {
          <span><i [attr.data-state]="entry[0]"></i>{{ entry[1] }}</span>
        }
      </div>
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
        stroke: var(--g-line-strong);
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
        fill: var(--g-line-strong);
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

  protected readonly viewBox = `0 0 ${WIDTH} ${HEIGHT}`;
  protected readonly radius = RADIUS;
  protected readonly edgeStates = EDGE_STATES;
  private readonly uid = `g-graph-${++instances}`;

  readonly legendEntries = computed(() => Object.entries(this.view().legend ?? {}));

  readonly nodes = computed<DrawnNode[]>(() =>
    this.view().nodes.map((n) => {
      const y = round(PAD + n.y * (HEIGHT - 2 * PAD));
      return {
        id: n.id,
        label: n.label,
        x: round(PAD + n.x * (WIDTH - 2 * PAD)),
        y,
        state: n.state ?? 'idle',
        badge: n.badge,
        badgeY: n.badgeAbove ? y - BADGE_OFFSET : y + BADGE_OFFSET,
      };
    }),
  );

  readonly edges = computed<DrawnEdge[]>(() => {
    const at = new Map(this.nodes().map((n) => [n.id, n]));
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
      const curveMid = bends ? { x: (from.x + to.x) / 4 + control.x / 2, y: (from.y + to.y) / 4 + control.y / 2 } : mid;
      return [{ id: `${i}:${e.from}-${e.to}`, d, state: e.state ?? 'idle', directed: e.directed, label: e.label, labelAt: curveMid }];
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
