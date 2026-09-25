import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { NodeState, TreeView } from '@grasp/engine';
import { LegendComponent } from './legend.component';
import { NODE_STYLES } from './node-styles';

const SLOT = 46;
const LEVEL = 60;
const PAD = 26;
const RADIUS = 16;

interface PlacedNode {
  id: string;
  label: string;
  x: number;
  y: number;
  state: NodeState;
  badge?: string;
  marked: boolean;
}

interface Link {
  id: string;
  x1: number;
  y1: number;
  x2: number;
  y2: number;
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
  const nodes = tree.nodes
    .filter((n) => slot.has(n.id))
    .map((n) => ({ id: n.id, label: n.label, ...position(n.id), state: n.state ?? 'idle', badge: n.badge, marked: !!n.marked }));
  const links = tree.nodes.flatMap((n) => {
    if (n.parent === null || !slot.has(n.parent) || !slot.has(n.id) || n.parent === n.id) return [];
    const from = position(n.parent);
    const to = position(n.id);
    // Links stop at each node's edge, or they would show through the see-through state fills and cross the labels.
    const dx = to.x - from.x;
    const dy = to.y - from.y;
    const trim = RADIUS / Math.hypot(dx, dy);
    return [{ id: `${n.parent}>${n.id}`, x1: from.x + dx * trim, y1: from.y + dy * trim, x2: to.x - dx * trim, y2: to.y - dy * trim }];
  });
  return { nodes, links, width: Math.max(1, next) * SLOT + 2 * PAD, height: (levels - 1) * LEVEL + 2 * RADIUS + 2 * PAD };
}

@Component({
  selector: 'g-tree-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LegendComponent],
  template: `
    @let l = layout();
    <svg [attr.viewBox]="'0 0 ' + l.width + ' ' + l.height" [style.max-width.px]="l.width" role="img" [attr.aria-label]="ariaLabel()">
      @for (link of l.links; track link.id) {
        <line class="link" [attr.x1]="link.x1" [attr.y1]="link.y1" [attr.x2]="link.x2" [attr.y2]="link.y2" />
      }
      @for (n of l.nodes; track n.id) {
        <g class="node" [attr.data-state]="n.state">
          @if (n.marked) {
            <circle class="ring" [attr.cx]="n.x" [attr.cy]="n.y" [attr.r]="radius + 4" />
          }
          <circle class="body" [attr.cx]="n.x" [attr.cy]="n.y" [attr.r]="radius" />
          <text class="label" [attr.x]="n.x" [attr.y]="n.y">{{ n.label }}</text>
          @if (n.badge) {
            <text class="badge" [attr.x]="n.x" [attr.y]="n.y - radius - 9">{{ n.badge }}</text>
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
        margin: 0 auto;
        overflow: visible;
      }
      .link {
        stroke: var(--g-stroke);
        stroke-width: 2;
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
    const nodes = this.view().nodes;
    const roots = nodes.filter((n) => n.parent === null).length;
    const active = nodes.find((n) => n.state === 'active');
    const shape = roots > 1 ? `Forest of ${roots} trees` : 'Tree';
    return `${shape} with ${nodes.length} nodes${active ? `, current node ${active.label}` : ''}`;
  });
}
