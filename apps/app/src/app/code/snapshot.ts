/** JSON-safe copy of a runtime value, as recorded in a trace step. */
export type Snap =
  | number
  | string
  | boolean
  | null
  | { kind: 'undefined' }
  | { kind: 'number'; text: string }
  | { kind: 'array'; items: Snap[]; truncated: number }
  | { kind: 'map'; entries: [Snap, Snap][]; truncated: number }
  | { kind: 'set'; items: Snap[]; truncated: number }
  | { kind: 'object'; entries: [string, Snap][]; truncated: number }
  | { kind: 'tree'; nodes: TreeSnapNode[]; clipped: boolean }
  | { kind: 'other'; text: string };

/** A node in a tree snapshot: `left` and `right` are node ids, which may name a node the snapshot did not reach. */
export interface TreeSnapNode {
  id: number;
  val: Snap;
  left: number | null;
  right: number | null;
}

export type TreeSnap = Extract<Snap, { kind: 'tree' }>;

export const isTree = (snap: Snap | undefined): snap is TreeSnap => typeof snap === 'object' && snap !== null && snap.kind === 'tree';

export interface TraceStep {
  line: number;
  vars: Record<string, Snap>;
}

const MAX_ITEMS = 64;
const MAX_TEXT = 200;
const MAX_DEPTH = 3;
const MAX_TREE_NODES = 63;

/** Numbers tree nodes by identity for one trace, so a node variable can be found in the tree drawn from the root. */
export class NodeIds {
  private readonly ids = new WeakMap<object, number>();
  private next = 1;

  of(node: object): number {
    let id = this.ids.get(node);
    if (id === undefined) this.ids.set(node, (id = this.next++));
    return id;
  }
}

interface NodeLike {
  val: unknown;
  left: unknown;
  right: unknown;
}

const isLink = (value: unknown) => value === null || value === undefined || (typeof value === 'object' && !Array.isArray(value));

/** Anything shaped like a binary tree node: the runner's nodes, a learner's own class, or plain objects. */
function isTreeNode(value: object): value is NodeLike {
  return !Array.isArray(value) && 'val' in value && 'left' in value && 'right' in value && isLink(value.left) && isLink(value.right);
}

/** A node nested inside another value keeps only itself: a stack of 64 nodes must not copy 64 subtrees on every step. */
function treeSnap(root: NodeLike, ids: NodeIds, depth: number): TreeSnap {
  const limit = depth === 0 ? MAX_TREE_NODES : 1;
  const nodes: TreeSnapNode[] = [];
  const queue: NodeLike[] = [root];
  const queued = new Set<object>([root]);
  const idOf = (link: unknown) => (link && typeof link === 'object' ? ids.of(link) : null);
  for (const node of queue) {
    if (nodes.length === limit) return { kind: 'tree', nodes, clipped: true };
    nodes.push({ id: ids.of(node), val: snapshot(node.val, ids, depth + 1), left: idOf(node.left), right: idOf(node.right) });
    for (const child of [node.left, node.right])
      if (child && typeof child === 'object' && !queued.has(child) && isTreeNode(child)) {
        queued.add(child);
        queue.push(child);
      }
  }
  return { kind: 'tree', nodes, clipped: false };
}

export function snapshot(value: unknown, ids = new NodeIds(), depth = 0): Snap {
  if (value === null) return null;
  switch (typeof value) {
    case 'number':
      return Number.isFinite(value) ? value : { kind: 'number', text: String(value) };
    case 'string':
      return value.length > MAX_TEXT ? `${value.slice(0, MAX_TEXT)}…` : value;
    case 'boolean':
      return value;
    case 'undefined':
      return { kind: 'undefined' };
    case 'bigint':
      return { kind: 'number', text: `${value}n` };
    case 'function':
    case 'symbol':
      return { kind: 'other', text: typeof value };
  }
  if (isTreeNode(value as object)) return treeSnap(value as NodeLike, ids, depth);
  if (depth >= MAX_DEPTH) return { kind: 'other', text: Array.isArray(value) ? `Array(${value.length})` : '{…}' };
  const take = <T>(items: T[]) => ({ items: items.slice(0, MAX_ITEMS), truncated: Math.max(0, items.length - MAX_ITEMS) });
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    const list = Array.from(value as ArrayLike<unknown>);
    const { items, truncated } = take(list);
    return { kind: 'array', items: items.map((v) => snapshot(v, ids, depth + 1)), truncated };
  }
  if (value instanceof Map) {
    const { items, truncated } = take([...value.entries()]);
    return { kind: 'map', entries: items.map(([k, v]) => [snapshot(k, ids, depth + 1), snapshot(v, ids, depth + 1)]), truncated };
  }
  if (value instanceof Set) {
    const { items, truncated } = take([...value.values()]);
    return { kind: 'set', items: items.map((v) => snapshot(v, ids, depth + 1)), truncated };
  }
  const { items, truncated } = take(Object.entries(value as object));
  return { kind: 'object', entries: items.map(([k, v]) => [k, snapshot(v, ids, depth + 1)]), truncated };
}

/** Compact one-line rendering, used in notes and the variables table. */
export function describeSnap(snap: Snap, max = 60): string {
  const text = render(snap);
  return text.length > max ? `${text.slice(0, max - 1)}…` : text;
}

function render(snap: Snap): string {
  if (snap === null) return 'null';
  if (typeof snap === 'string') return JSON.stringify(snap);
  if (typeof snap !== 'object') return String(snap);
  const more = (n: number) => (n ? `, …+${n}` : '');
  switch (snap.kind) {
    case 'undefined':
      return 'undefined';
    case 'number':
    case 'other':
      return snap.text;
    case 'array':
      return `[${snap.items.map(render).join(', ')}${more(snap.truncated)}]`;
    case 'set':
      return `Set{${snap.items.map(render).join(', ')}${more(snap.truncated)}}`;
    case 'map':
      return `Map{${snap.entries.map(([k, v]) => `${render(k)}→${render(v)}`).join(', ')}${more(snap.truncated)}}`;
    case 'object':
      return `{${snap.entries.map(([k, v]) => `${k}: ${render(v)}`).join(', ')}${more(snap.truncated)}}`;
    case 'tree':
      return `TreeNode(${render(snap.nodes[0].val)})`;
  }
}
