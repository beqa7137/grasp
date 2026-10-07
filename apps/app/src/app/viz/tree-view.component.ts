import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { GRAPH_NODE_RADIUS, type NodeState, type TreeView } from '@grasp/engine';
import { BADGE_LINE_HEIGHT, BADGE_ROOM, badgeHalfWidth, badgeLines, besideReach, placeBadges, wrapBadge, type Spot } from './badges';
import { dims, type Focus } from './dim';
import { toward, type Point } from './geometry';
import { LegendComponent } from './legend.component';
import { DRAWING_BOX, NODE_STYLES } from './node-styles';

const SLOT = 46;
const LEVEL = 60;
const PAD = 26;
const MARGIN = PAD + SLOT / 2;
const RADIUS = GRAPH_NODE_RADIUS;
const BLANK_GAP = 6;
const BADGE_OFFSET = RADIUS + 9;
const ABOVE: Spot = { dy: -BADGE_OFFSET };
const BELOW: Spot = { dy: BADGE_OFFSET };
const BESIDE: Spot[] = [
  { dy: -BADGE_OFFSET, side: 1 },
  { dy: -BADGE_OFFSET, side: -1 },
  { dy: BADGE_OFFSET, side: 1 },
  { dy: BADGE_OFFSET, side: -1 },
];
const BADGE_SPOTS = [ABOVE, BELOW, ...BESIDE];
// A leaf's badge goes below it, where no link runs, so a row of leaf results reads as one line.
const LEAF_BADGE_SPOTS = [BELOW, ABOVE, ...BESIDE];
// Past this many characters a badge naming several pointers wraps onto a second line, so it stays about one long name wide.
const BADGE_LINE_CHARS = 13;

interface PlacedNode {
  id: string;
  label: string;
  x: number;
  y: number;
  state: NodeState;
  badge?: string;
  badgeAt: Point;
  badgeLines: string[];
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

/** Room past the usual margin at each side of a tree drawing, for badges beside the nodes at its edges. */
export interface SideRoom {
  left: number;
  right: number;
}

const NO_ROOM: SideRoom = { left: 0, right: 0 };

// Whole pixels, with the room a badge keeps from lines to spare: text can render a pixel or so wider than its 0.6em estimate,
// as Chromium on Linux draws it.
const roomFor = (reach: number) => (reach > 0 ? Math.ceil(reach + BADGE_ROOM) : 0);

/**
 * The room at each side that the badges of these trees reach into, found by laying each tree out with room for its widest badge
 * beside an edge node. A drawing of any of them with this room keeps one width and puts every badge where all that room would.
 */
export function sideRoomFor(trees: readonly (TreeView | undefined)[]): SideRoom {
  const drawn = trees.filter((tree) => tree !== undefined);
  let widest = 0;
  for (const tree of drawn)
    for (const n of tree.nodes) if (n.badge && !n.blank) widest = Math.max(widest, besideReach(wrapBadge(n.badge, BADGE_LINE_CHARS)));
  const full = roomFor(widest - MARGIN);
  if (!full) return NO_ROOM;
  const reach = { left: 0, right: 0 };
  for (const tree of drawn) {
    const { nodes, width } = layoutForest(tree, { left: full, right: full });
    for (const n of nodes) {
      if (!n.badge || n.blank) continue;
      const half = badgeHalfWidth(n.badge);
      reach.left = Math.max(reach.left, full - (n.badgeAt.x - half));
      reach.right = Math.max(reach.right, n.badgeAt.x + half - (width - full));
    }
  }
  return { left: roomFor(reach.left), right: roomFor(reach.right) };
}

/**
 * Leaves take consecutive slots left to right and every parent sits centred over its children,
 * so siblings keep their input order (a heap's left child stays on the left).
 */
export function layoutForest(tree: TreeView, room = NO_ROOM): { nodes: PlacedNode[]; links: Link[]; width: number; height: number } {
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
  const position = (id: string) => ({ x: MARGIN + room.left + slot.get(id)! * SLOT, y: PAD + depth.get(id)! * LEVEL + RADIUS });
  const placed = tree.nodes
    .filter((n) => slot.has(n.id))
    .map((n) => ({
      id: n.id,
      label: n.label,
      ...position(n.id),
      state: n.state ?? 'idle',
      badge: n.badge && wrapBadge(n.badge, BADGE_LINE_CHARS),
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
  const width = Math.max(1, next) * SLOT + 2 * PAD + room.left + room.right;
  const height = (levels - 1) * LEVEL + 2 * RADIUS + 2 * PAD;
  const isLeaf = (id: string) => !children.has(id) && !roots.includes(id);
  const lines = links.map(({ x1, y1, x2, y2 }) => [
    { x: x1, y: y1 },
    { x: x2, y: y2 },
  ]);
  const centres = placeBadges(placed, lines, RADIUS, (n) => (isLeaf(n.id) ? LEAF_BADGE_SPOTS : BADGE_SPOTS), {
    bounds: { left: 0, right: width, top: 0, bottom: height },
    leastBad: true,
  });
  const nodes = placed.map((n, i) => ({ ...n, badgeAt: centres[i], badgeLines: n.badge ? badgeLines(n.badge) : [] }));
  return { nodes, links, width, height };
}

@Component({
  selector: 'g-tree-view',
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [LegendComponent],
  template: `
    @let l = layout();
    <svg
      [attr.viewBox]="'0 0 ' + l.width + ' ' + l.height"
      [style.max-width.px]="l.width"
      [style.--vb-w]="l.width"
      [style.--vb-h]="l.height"
      role="img"
      [attr.aria-label]="ariaLabel()"
    >
      @for (link of l.links; track link.id) {
        <line class="link" [class.to-blank]="link.blank" [attr.x1]="link.x1" [attr.y1]="link.y1" [attr.x2]="link.x2" [attr.y2]="link.y2" />
      }
      @for (n of l.nodes; track n.id) {
        @if (n.blank) {
          <text class="blank" [attr.x]="n.x" [attr.y]="n.y">{{ n.label }}</text>
        } @else {
          <g class="node" [attr.data-state]="n.state" [class.dim]="dims(focus(), { view: 'tree', id: n.id }, n.state === 'active')">
            @if (n.marked) {
              <circle class="ring" [attr.cx]="n.x" [attr.cy]="n.y" [attr.r]="radius + 4" />
            }
            <circle class="body" [attr.cx]="n.x" [attr.cy]="n.y" [attr.r]="radius" />
            <text class="label" [attr.x]="n.x" [attr.y]="n.y">{{ n.label }}</text>
            @if (n.badge) {
              <text class="badge" [attr.x]="n.badgeAt.x" [attr.y]="n.badgeAt.y">
                @for (line of n.badgeLines; track $index) {
                  <tspan [attr.x]="n.badgeAt.x" [attr.y]="n.badgeAt.y + ($index - ($count - 1) / 2) * lineHeight">{{ line }}</tspan>
                }
              </text>
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
    DRAWING_BOX,
    `
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
  /** The side room of every frame the page will show here (see `sideRoomFor`), so that the drawing keeps one width. */
  readonly room = input<SideRoom>();
  /** A checkpoint's focus, which dims the other nodes. */
  readonly focus = input<Focus>(null);
  protected readonly dims = dims;

  protected readonly radius = RADIUS;
  protected readonly lineHeight = BADGE_LINE_HEIGHT;

  readonly layout = computed(() => layoutForest(this.view(), this.room() ?? sideRoomFor([this.view()])));

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
