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
  | { kind: 'other'; text: string };

export interface TraceStep {
  line: number;
  vars: Record<string, Snap>;
}

const MAX_ITEMS = 64;
const MAX_TEXT = 200;
const MAX_DEPTH = 3;

export function snapshot(value: unknown, depth = 0): Snap {
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
  if (depth >= MAX_DEPTH) return { kind: 'other', text: Array.isArray(value) ? `Array(${value.length})` : '{…}' };
  const take = <T>(items: T[]) => ({ items: items.slice(0, MAX_ITEMS), truncated: Math.max(0, items.length - MAX_ITEMS) });
  if (Array.isArray(value) || ArrayBuffer.isView(value)) {
    const list = Array.from(value as ArrayLike<unknown>);
    const { items, truncated } = take(list);
    return { kind: 'array', items: items.map((v) => snapshot(v, depth + 1)), truncated };
  }
  if (value instanceof Map) {
    const { items, truncated } = take([...value.entries()]);
    return { kind: 'map', entries: items.map(([k, v]) => [snapshot(k, depth + 1), snapshot(v, depth + 1)]), truncated };
  }
  if (value instanceof Set) {
    const { items, truncated } = take([...value.values()]);
    return { kind: 'set', items: items.map((v) => snapshot(v, depth + 1)), truncated };
  }
  const { items, truncated } = take(Object.entries(value as object));
  return { kind: 'object', entries: items.map(([k, v]) => [k, snapshot(v, depth + 1)]), truncated };
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
  }
}
