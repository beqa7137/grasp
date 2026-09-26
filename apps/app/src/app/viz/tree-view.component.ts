import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { GRAPH_NODE_RADIUS, type NodeState, type TreeView } from '@grasp/engine';
import { placeBadges, type Spot } from './badges';
import { toward, type Point } from './geometry';
import { LegendComponent } from './legend.component';
import { NODE_STYLES } from './node-styles';

const SLOT = 46;
const LEVEL = 60;
const PAD = 26;
const RADIUS = GRAPH_NODE_RADIUS;
const BLANK_GAP = 6;
const BADGE_OFFSET = RADIUS + 9;
const ABOVE: Spot = { dy: -BADGE_OFFSET };
const BELOW: Spot = { dy: BADGE_OFFSET };
const BESIDE: Spot[] = [
  { dy: -BADGE_OFFSET, side: 1 },
  { dy: -BADGE_OFFSET, side: -1 },
];
const BADGE_SPOTS = [ABOVE, BELOW, ...BESIDE];
// A leaf's badge goes below it, where no link runs, so a row of leaf results reads as one line.
const LEAF_BADGE_SPOTS = [BELOW, ABOVE, ...BESIDE];

interface PlacedNode {
  id: string;
  label: string;
  x: number;
  y: number;
  state: NodeState;
  badge?: string;
  badgeAt: Point;
  marked: boolean;
  blank: boolean;
}

interface Link {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
  blank: boolean;
}

/**
 * Leaves take consecutive slots left to right and every parent sits centred over its children,
 * so siblings keep their input order (a heap's left child stays on the left).
 */
export function layoutForest(tree: TreeView): { nodes: PlacedNode[]; links: Link[]; width: number; height: number } {
  const ids = new Set(tree.nodes.map((n) => n.id));
  const children = new Map<string, string[]>();
  const roots: string[] = [];
  for (const n of tree.nodes) {
    if (n.parent !== null && ids.has(n.parent) && n.parent !== n.id) children.set(n.parent, [...(children.get(n.parent) ?? []), n.id]);
    else roots.push(n.id);
  }

  const slot = new Map<string, number>();
  const depth = new Map<string, number>();
  let next = 0;
  const place = (id: string, level: number): number => {
    depth.set(id, level);
    const xs = (children.get(id) ?? []).filter((k) => !depth.has(k)).map((k) => place(k, level + 1));
    const x = xs.length ? (xs[0] + xs[xs.length - 1]) / 2 : next++;
    slot.set(id, x);
    return x;
  };
  for (const root of roots) place(root, 0);

  const levels = Math.max(0, ...depth.values()) + 1;
  const position = (id: string) => ({ x: PAD + slot.get(id)! * SLOT + SLOT / 2, y: PAD + depth.get(id)! * LEVEL + RADIUS });
  const placed = tree.nodes
    .filter((n) => slot.has(n.id))
    .map((n) => ({
      id: n.id,
      label: n.label,
      ...position(n.id),
      state: n.state ?? 'idle',
      badge: n.badge,
      marked: !!n.marked,
      blank: !!n.blank,
    }));
  const links = tree.nodes.flatMap((n) => {
    if (n.parent === null || !slot.has(n.parent) || !slot.has(n.id) || n.parent === n.id) return [];
    const from = position(n.parent);
    const to = position(n.id);
    // End links at the node edge; the state fills are see-through.
    const start = toward(from, to, RADIUS);
    const end = toward(to, from, n.blank ? BLANK_GAP : RADIUS);
    return [{ id: `${n.parent}>${n.id}`, x1: start.x, y1: start.y, x2: end.x, y2: end.y, blank: !!n.blank }];
  });
  const width = Math.max(1, next) * SLOT + 2 * PAD;
  const height = (levels - 1) * LEVEL + 2 * RADIUS + 2 * PAD;
  const isLeaf = (id: string) => !children.has(id) && !roots.includes(id);
  const lines = links.map(({ x1, y1, x2, y2 }) => [
    { x: x1, y: y1 },
    { x: x2, y: y2 },
  ]);
  const centres = placeBadges(placed, lines, RADIUS, (n) => (isLeaf(n.id) ? LEAF_BADGE_SPOTS : BADGE_SPOTS), {
    left: 0,
    right: width,
    top: 0,
    bottom: height,
  });
  const nodes = placed.map((n, i) => ({ ...n, badgeAt: centres[i] }));
  return { nodes, links, width, height };
}

@Component({
  selector: 'g-tree-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LegendComponent],
  template: `
    @let l = layout();
    <svg [attr.viewBox]="'0 0 ' + l.width + ' ' + l.height" [style.max-width.px]="l.width" role="img" [attr.aria-label]="ariaLabel()">
      @for (link of l.links; track link.id) {
        <line class="link" [class.to-blank]="link.blank" [attr.x1]="link.x1" [attr.y1]="link.y1" [attr.x2]="link.x2" [attr.y2]="link.y2" />
      }
      @for (n of l.nodes; track n.id) {
        @if (n.blank) {
          <text class="blank" [attr.x]="n.x" [attr.y]="n.y">{{ n.label }}</text>
        } @else {
          <g class="node" [attr.data-state]="n.state">
            @if (n.marked) {
              <circle class="ring" [attr.cx]="n.x" [attr.cy]="n.y" [attr.r]="radius + 4" />
            }
            <circle class="body" [attr.cx]="n.x" [attr.cy]="n.y" [attr.r]="radius" />
            <text class="label" [attr.x]="n.x" [attr.y]="n.y">{{ n.label }}</text>
            @if (n.badge) {
              <text class="badge" [attr.x]="n.badgeAt.x" [attr.y]="n.badgeAt.y">{{ n.badge }}</text>
            }
          </g>
        }
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
        margin: 0 auto;
        overflow: visible;
      }
      .link {
        stroke: var(--g-stroke);
        stroke-width: 2;
      }
      .link.to-blank {
        stroke: var(--g-faint);
        stroke-dasharray: 4 4;
      }
      .blank {
        font: 600 12px var(--g-font-mono);
        fill: var(--g-faint);
        text-anchor: middle;
        dominant-baseline: central;
      }
    `,
  ],
})
export class TreeViewComponent {
  readonly view = input.required<TreeView>();
  readonly legend = input(true);

  protected readonly radius = RADIUS;

  readonly layout = computed(() => layoutForest(this.view()));

  readonly ariaLabel = computed(() => {
    const { nodes: all, legend } = this.view();
    const nodes = all.filter((n) => !n.blank);
    const roots = nodes.filter((n) => n.parent === null).length;
    const active = nodes.find((n) => n.state === 'active');
    const shape = roots > 1 ? `Forest of ${roots} trees` : 'Tree';
    const counts = (['frontier', 'done'] as const).flatMap((state) => {
      const count = nodes.filter((n) => n.state === state).length;
      return count && legend?.[state] ? [`${count} ${legend[state]}`] : [];
    });
    return [`${shape} with ${nodes.length} nodes`, ...(active ? [`current node ${active.label}`] : []), ...counts].join(', ');
  });
}
