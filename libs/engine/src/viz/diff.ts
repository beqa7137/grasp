import type { Frame, GraphView, Scalar, TableView, TreeView } from '../algorithms/types.js';
import { LIST_NAMES, listItems, movedItems, pairKeys, type FrameKeys, type ListName } from './keys.js';

export type ViewName = 'array' | ListName | 'grid' | 'table' | 'graph' | 'tree' | 'vars';

/** A place in a view: an index, a [row, column] cell, or a node or edge id (`a->b`). */
export type At = number | [number, number] | string;

/**
 * One visible change between two frames, derived from the frames themselves (REDESIGN.md 3.4), tagged with the view it
 * happens in. A step with none is "no visible change".
 */
export type VizEvent =
  /** The comparison a step decides on, from the frame's lens, over the array cells it reads. */
  | { view: 'array'; kind: 'compare'; text: string; at: number[] }
  | { view: 'array'; kind: 'move'; pointer: string; from: number | null; to: number | null }
  | { view: 'array'; kind: 'window'; from: [number, number] | null; to: [number, number] | null }
  /** Two cells or items trade places; `a` and `b` are where they were. */
  | { view: 'array' | ListName; kind: 'swap'; a: number; b: number }
  /** A cell or item moves to another index, other than by a swap. */
  | { view: 'array' | ListName; kind: 'shift'; from: number; to: number }
  | {
      view: 'array' | ListName | 'grid' | 'table' | 'graph' | 'tree';
      kind: 'write';
      at: At;
      from: Scalar | undefined;
      to: Scalar | undefined;
    }
  | { view: ListName; kind: 'push' | 'pop'; at: number; value: Scalar }
  /** Elements that join or leave a state, such as cells that become current or nodes that settle. */
  | { view: ViewName; kind: 'mark'; state: string; added: At[]; removed: At[] }
  | { view: 'array' | 'graph' | 'tree'; kind: 'add' | 'remove'; at: At[] }
  /** A tree node's parent or a graph's edge set changed. */
  | { view: 'graph' | 'tree'; kind: 'link'; at: string; from: string | null; to: string | null }
  /** A view's labels or legend changed. */
  | { view: ViewName; kind: 'label' }
  | { view: ViewName; kind: 'show' | 'hide' }
  | { view: 'vars'; kind: 'var'; name: string; from: Scalar | undefined; to: Scalar | undefined };

const COMPARISON = /^(.+?)\s(<=|>=|<|>|===|!==|==|!=|≤|≥)\s(.+?)(?:\s→.*)?$/;

/** The comparison a lens evaluates ("16 < 23" of "16 < 23 → lo = 5"), or null when it compares nothing. */
export function lensComparison(lens: string | undefined): string | null {
  const match = lens?.match(COMPARISON);
  return match ? `${match[1]} ${match[2]} ${match[3]}` : null;
}

const equal = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

function marks(view: ViewName, state: string, before: readonly At[], after: readonly At[]): VizEvent[] {
  const id = (at: At) => JSON.stringify(at);
  const was = new Set(before.map(id));
  const now = new Set(after.map(id));
  const added = after.filter((at) => !was.has(id(at)));
  const removed = before.filter((at) => !now.has(id(at)));
  return added.length || removed.length ? [{ view, kind: 'mark', state, added, removed }] : [];
}

/** The states of a view's elements: each state's members, in the order they appear. */
function statesOf<T>(items: readonly T[], at: (item: T, i: number) => At, state: (item: T) => string | undefined) {
  const out = new Map<string, At[]>();
  items.forEach((item, i) => {
    const s = state(item);
    if (s === undefined) return;
    out.set(s, [...(out.get(s) ?? []), at(item, i)]);
  });
  return out;
}

function markAll(view: ViewName, before: Map<string, At[]>, after: Map<string, At[]>): VizEvent[] {
  return [...new Set([...before.keys(), ...after.keys()])].flatMap((s) => marks(view, s, before.get(s) ?? [], after.get(s) ?? []));
}

/** Kept cells or items that changed place: a pair that traded places is a swap, any other a shift. */
function moves(view: 'array' | ListName, before: readonly string[], after: readonly string[]): VizEvent[] {
  const events: VizEvent[] = [];
  const swapped = new Set<number>();
  for (const [from, to] of movedItems(before, after)) {
    if (swapped.has(from)) continue;
    if (before[to] !== undefined && before[to] === after[from]) {
      swapped.add(from).add(to);
      events.push({ view, kind: 'swap', a: Math.min(from, to), b: Math.max(from, to) });
    } else events.push({ view, kind: 'shift', from, to });
  }
  return events;
}

function arrayEvents(a: Frame, b: Frame, ka: FrameKeys, kb: FrameKeys): VizEvent[] {
  const x = a.array!;
  const y = b.array!;
  const events: VizEvent[] = [];
  const oldAt = new Map((ka.array ?? []).map((key, i) => [key, i]));
  const newAt = new Map((kb.array ?? []).map((key, i) => [key, i]));
  (kb.array ?? []).forEach((key, i) => {
    const from = oldAt.get(key);
    if (from !== undefined && x.values[from] !== y.values[i])
      events.push({ view: 'array', kind: 'write', at: i, from: x.values[from], to: y.values[i] });
  });
  events.push(...moves('array', ka.array ?? [], kb.array ?? []));
  const added = (kb.array ?? []).flatMap((key, i) => (oldAt.has(key) ? [] : [i]));
  const removed = (ka.array ?? []).flatMap((key, i) => (newAt.has(key) ? [] : [i]));
  if (added.length) events.push({ view: 'array', kind: 'add', at: added });
  if (removed.length) events.push({ view: 'array', kind: 'remove', at: removed });

  for (const pointer of new Set([...Object.keys(x.pointers), ...Object.keys(y.pointers)])) {
    const from = x.pointers[pointer] ?? null;
    const to = y.pointers[pointer] ?? null;
    if (from !== to) events.push({ view: 'array', kind: 'move', pointer, from, to });
  }
  if (!equal(x.window ?? null, y.window ?? null))
    events.push({ view: 'array', kind: 'window', from: x.window ?? null, to: y.window ?? null });
  for (const state of ['active', 'settled', 'found'] as const) events.push(...marks('array', state, x[state] ?? [], y[state] ?? []));
  return events;
}

function listEvents(list: ListName, a: Frame, b: Frame, ka: FrameKeys, kb: FrameKeys): VizEvent[] {
  const before = listItems(a, list)!;
  const after = listItems(b, list)!;
  const oldKeys = ka[list] ?? [];
  const newKeys = kb[list] ?? [];
  const events: VizEvent[] = [];
  const kept = new Set(newKeys);
  oldKeys.forEach((key, i) => {
    if (!kept.has(key)) events.push({ view: list, kind: 'pop', at: i, value: before[i] });
  });
  const oldAt = new Map(oldKeys.map((key, i) => [key, i]));
  newKeys.forEach((key, i) => {
    const from = oldAt.get(key);
    if (from === undefined) events.push({ view: list, kind: 'push', at: i, value: after[i] });
    else if (before[from] !== after[i]) events.push({ view: list, kind: 'write', at: i, from: before[from], to: after[i] });
  });
  events.push(...moves(list, oldKeys, newKeys));
  const label = list === 'set' ? [a.set!.label, b.set!.label] : [a[list]!.label, b[list]!.label];
  if (label[0] !== label[1]) events.push({ view: list, kind: 'label' });
  if (list === 'set') events.push(...marks('set', 'active', a.set!.active ? [a.set!.active] : [], b.set!.active ? [b.set!.active] : []));
  return events;
}

function gridEvents(a: Frame, b: Frame): VizEvent[] {
  const x = a.grid!;
  const y = b.grid!;
  const cells = (g: typeof x) => g.cells.flatMap((row, r) => row.map((state, c) => ({ state, at: [r, c] as [number, number] })));
  const events = markAll(
    'grid',
    statesOf(
      cells(x),
      (cell) => cell.at,
      (cell) => cell.state,
    ),
    statesOf(
      cells(y),
      (cell) => cell.at,
      (cell) => cell.state,
    ),
  );
  y.distances.forEach((row, r) =>
    row.forEach((to, c) => {
      const from = x.distances[r]?.[c];
      if (from !== to) events.push({ view: 'grid', kind: 'write', at: [r, c], from: from ?? undefined, to: to ?? undefined });
    }),
  );
  return events;
}

function tableEvents(x: TableView, y: TableView): VizEvent[] {
  const events: VizEvent[] = [];
  y.cells.forEach((row, r) =>
    row.forEach((to, c) => {
      const from = x.cells[r]?.[c];
      if (from !== to) events.push({ view: 'table', kind: 'write', at: [r, c], from: from ?? undefined, to: to ?? undefined });
    }),
  );
  if (x.cells.length > y.cells.length || x.cells.some((row, r) => row.length > (y.cells[r]?.length ?? 0)))
    events.push({ view: 'table', kind: 'label' });
  events.push(...marks('table', 'active', x.active ? [x.active] : [], y.active ? [y.active] : []));
  events.push(...marks('table', 'deps', x.deps ?? [], y.deps ?? []));
  events.push(...marks('table', 'path', x.path ?? [], y.path ?? []));
  if (!equal([x.rowLabels, x.colLabels, x.legend], [y.rowLabels, y.colLabels, y.legend])) events.push({ view: 'table', kind: 'label' });
  return events;
}

const edgeId = (e: { from: string; to: string }) => `${e.from}->${e.to}`;

function graphEvents(x: GraphView, y: GraphView): VizEvent[] {
  const events: VizEvent[] = [];
  const oldNodes = new Map(x.nodes.map((n) => [n.id, n]));
  const newNodes = new Map(y.nodes.map((n) => [n.id, n]));
  const addedNodes = y.nodes.filter((n) => !oldNodes.has(n.id)).map((n) => n.id);
  const removedNodes = x.nodes.filter((n) => !newNodes.has(n.id)).map((n) => n.id);
  if (addedNodes.length) events.push({ view: 'graph', kind: 'add', at: addedNodes });
  if (removedNodes.length) events.push({ view: 'graph', kind: 'remove', at: removedNodes });
  for (const n of y.nodes) {
    const old = oldNodes.get(n.id);
    if (!old) continue;
    if (old.badge !== n.badge) events.push({ view: 'graph', kind: 'write', at: n.id, from: old.badge, to: n.badge });
    if (old.label !== n.label || old.x !== n.x || old.y !== n.y) events.push({ view: 'graph', kind: 'label' });
  }
  events.push(
    ...markAll(
      'graph',
      statesOf(
        x.nodes,
        (n) => n.id,
        (n) => n.state ?? 'idle',
      ),
      statesOf(
        y.nodes,
        (n) => n.id,
        (n) => n.state ?? 'idle',
      ),
    ),
  );
  const oldEdges = new Map(x.edges.map((e) => [edgeId(e), e]));
  const newEdges = new Map(y.edges.map((e) => [edgeId(e), e]));
  for (const [id, e] of newEdges) {
    const old = oldEdges.get(id);
    if (!old) events.push({ view: 'graph', kind: 'link', at: id, from: null, to: e.to });
    else {
      if (old.label !== e.label) events.push({ view: 'graph', kind: 'write', at: id, from: old.label, to: e.label });
      if (old.directed !== e.directed) events.push({ view: 'graph', kind: 'label' });
    }
  }
  for (const [id, e] of oldEdges) if (!newEdges.has(id)) events.push({ view: 'graph', kind: 'link', at: id, from: e.to, to: null });
  events.push(
    ...markAll(
      'graph',
      statesOf(x.edges, edgeId, (e) => `edge ${e.state ?? 'idle'}`),
      statesOf(y.edges, edgeId, (e) => `edge ${e.state ?? 'idle'}`),
    ),
  );
  if (!equal(x.legend ?? null, y.legend ?? null)) events.push({ view: 'graph', kind: 'label' });
  return events;
}

function treeEvents(x: TreeView, y: TreeView): VizEvent[] {
  const events: VizEvent[] = [];
  const oldNodes = new Map(x.nodes.map((n) => [n.id, n]));
  const newNodes = new Map(y.nodes.map((n) => [n.id, n]));
  const added = y.nodes.filter((n) => !oldNodes.has(n.id)).map((n) => n.id);
  const removed = x.nodes.filter((n) => !newNodes.has(n.id)).map((n) => n.id);
  if (added.length) events.push({ view: 'tree', kind: 'add', at: added });
  if (removed.length) events.push({ view: 'tree', kind: 'remove', at: removed });
  for (const n of y.nodes) {
    const old = oldNodes.get(n.id);
    if (!old) continue;
    if (old.parent !== n.parent) events.push({ view: 'tree', kind: 'link', at: n.id, from: old.parent, to: n.parent });
    if (old.badge !== n.badge) events.push({ view: 'tree', kind: 'write', at: n.id, from: old.badge, to: n.badge });
    if (old.label !== n.label || !!old.blank !== !!n.blank)
      events.push({ view: 'tree', kind: 'write', at: n.id, from: old.label, to: n.label });
  }
  events.push(
    ...markAll(
      'tree',
      statesOf(
        x.nodes,
        (n) => n.id,
        (n) => n.state ?? 'idle',
      ),
      statesOf(
        y.nodes,
        (n) => n.id,
        (n) => n.state ?? 'idle',
      ),
    ),
  );
  events.push(
    ...marks(
      'tree',
      'marked',
      x.nodes.filter((n) => n.marked).map((n) => n.id),
      y.nodes.filter((n) => n.marked).map((n) => n.id),
    ),
  );
  if (!equal(x.legend ?? null, y.legend ?? null)) events.push({ view: 'tree', kind: 'label' });
  return events;
}

function varEvents(a: Frame, b: Frame): VizEvent[] {
  const names = new Set([...Object.keys(a.vars), ...Object.keys(b.vars)]);
  return [...names].flatMap((name): VizEvent[] =>
    a.vars[name] === b.vars[name] ? [] : [{ view: 'vars', kind: 'var', name, from: a.vars[name], to: b.vars[name] }],
  );
}

/** The comparison `b`'s line decides on, anchored on the array cells it reads, or on none when its operands are not on the array. */
function compareEvent(a: Frame, b: Frame): VizEvent[] {
  const match = b.lens?.match(COMPARISON);
  if (!match || !b.array) return [];
  const [, left, op, right] = match;
  const cells = b.array.values.length;
  // Current cells are operands only when they hold one of the compared values; else the cells whose index a pointer names.
  const current = [...(a.array?.active ?? []), ...(b.array.active ?? [])].filter(
    (i) => i < cells && [left, right].includes(String(b.array!.values[i])),
  );
  const named = Object.values(b.array.pointers).filter((i) => i < cells && [left, right].includes(String(i)));
  const at = [...new Set(current.length ? current : named)].sort((p, q) => p - q);
  return [{ view: 'array', kind: 'compare', text: `${left} ${op} ${right}`, at }];
}

/** Every visible change from frame `a` to frame `b`; keys from `traceKeys` tell moves from writes across a run. */
export function diffFrames(a: Frame, b: Frame, keys: [FrameKeys, FrameKeys] = pairKeys(a, b)): VizEvent[] {
  const [ka, kb] = keys;
  const events: VizEvent[] = [...compareEvent(a, b)];
  const pair = <K extends keyof Frame>(
    view: ViewName,
    key: K,
    diff: (x: NonNullable<Frame[K]>, y: NonNullable<Frame[K]>) => VizEvent[],
  ) => {
    const x = a[key];
    const y = b[key];
    if (x && y) events.push(...diff(x as NonNullable<Frame[K]>, y as NonNullable<Frame[K]>));
    else if (y) events.push({ view, kind: 'show' });
    else if (x) events.push({ view, kind: 'hide' });
  };
  pair('array', 'array', () => arrayEvents(a, b, ka, kb));
  for (const list of LIST_NAMES) pair(list, list, () => listEvents(list, a, b, ka, kb));
  pair('grid', 'grid', () => gridEvents(a, b));
  pair('table', 'table', tableEvents);
  pair('graph', 'graph', graphEvents);
  pair('tree', 'tree', treeEvents);
  events.push(...varEvents(a, b));
  return events;
}
