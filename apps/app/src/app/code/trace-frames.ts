import type { ArrayView, CellState, Frame, GridView, Scalar, StackView } from '@grasp/engine';
import { describeSnap, isTree, type Snap, type TraceStep } from './snapshot';
import { traceTrees } from './tree-frames';

const INDEX_NAME = /^(i|j|l|r|lo|hi|left|right|mid|start|end|slow|fast|p|q|idx|index|pos|top)$|(idx|index|ptr|pointer|Idx|Index|Ptr)$/;
const WINDOWS: [string, string][] = [
  ['lo', 'hi'],
  ['left', 'right'],
  ['l', 'r'],
  ['start', 'end'],
];
const STACK_NAME = /stack|^stk$|^st$/i;
const QUEUE_NAME = /queue|^q$|deque|^dq$|frontier/i;
const ROW_NAMES = ['r', 'row', 'y', 'i'];
const COL_NAMES = ['c', 'col', 'x', 'j'];

type ArraySnap = Extract<Snap, { kind: 'array' }>;

const isArray = (s: Snap | undefined): s is ArraySnap => typeof s === 'object' && s !== null && s.kind === 'array';
const isScalar = (s: Snap | undefined): s is Scalar => s === null || ['number', 'string', 'boolean'].includes(typeof s);
const toScalar = (s: Snap): Scalar => (isScalar(s) ? s : describeSnap(s, 24));
const isGrid = (s: Snap | undefined): s is ArraySnap => isArray(s) && s.items.length > 0 && s.items.every(isArray);

export interface FrameOptions {
  /** The parameter that holds the main input: an array or string drawn with index pointers, or a tree drawn whole. */
  primary?: string;
  returned?: Snap;
  error?: string;
}

function primaryName(step: TraceStep, preferred?: string): string | undefined {
  if (preferred && (isArray(step.vars[preferred]) || typeof step.vars[preferred] === 'string')) return preferred;
  return Object.keys(step.vars).find((k) => isArray(step.vars[k]) && !isGrid(step.vars[k]));
}

function arrayView(step: TraceStep, name: string): ArrayView {
  const raw = step.vars[name];
  const values: Scalar[] = typeof raw === 'string' ? [...raw] : isArray(raw) ? raw.items.map(toScalar) : [];
  const pointers: Record<string, number> = {};
  for (const [key, v] of Object.entries(step.vars)) {
    if (key !== name && typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < values.length && INDEX_NAME.test(key))
      pointers[key] = v;
  }
  const view: ArrayView = { values, pointers };
  for (const [a, b] of WINDOWS) {
    if (a in pointers && b in pointers && pointers[a] <= pointers[b]) {
      view.window = [pointers[a], pointers[b]];
      break;
    }
  }
  return view;
}

function gridView(step: TraceStep, name: string): GridView {
  const rows = (step.vars[name] as ArraySnap).items as ArraySnap[];
  const find = (names: string[], limit: number) => {
    const key = names.find((n) => typeof step.vars[n] === 'number' && (step.vars[n] as number) >= 0 && (step.vars[n] as number) < limit);
    return key === undefined ? undefined : (step.vars[key] as number);
  };
  const r = find(ROW_NAMES, rows.length);
  const c = find(COL_NAMES, rows[0]?.items.length ?? 0);
  const cells: CellState[][] = rows.map((row, y) =>
    row.items.map((cell, x) => {
      if (y === r && x === c) return 'current';
      if (cell === '1' || cell === 1 || cell === true) return 'path';
      if (cell === '0' || cell === 0 || cell === false) return 'open';
      return 'visited';
    }),
  );
  return { cells, distances: rows.map((row) => row.items.map(() => null)) };
}

function listView(label: string, s: Snap): StackView {
  if (isArray(s)) return { label, items: s.items.map(toScalar) };
  if (typeof s === 'object' && s !== null && s.kind === 'set') return { label, items: s.items.map(toScalar) };
  if (typeof s === 'object' && s !== null && s.kind === 'map')
    return { label, items: s.entries.map(([k, v]) => `${describeSnap(k, 12)}→${describeSnap(v, 12)}`) };
  return { label, items: [describeSnap(s)] };
}

function changes(prev: TraceStep | undefined, step: TraceStep): string {
  if (!prev)
    return (
      'Called with ' +
      Object.entries(step.vars)
        .map(([k, v]) => `${k} = ${describeSnap(v, 40)}`)
        .join(', ')
    );
  const changed = Object.entries(step.vars)
    .filter(([k, v]) => JSON.stringify(prev.vars[k]) !== JSON.stringify(v))
    .map(([k, v]) => `${k} = ${describeSnap(v, 40)}`);
  return changed.length ? changed.join(' · ') : 'No variables changed';
}

/** Turns raw trace steps into the frames the visualizer components already know how to draw. */
export function toFrames(steps: TraceStep[], options: FrameOptions = {}): Frame[] {
  const trees = traceTrees(steps, options.primary);
  const frames = steps.map((step, i): Frame => {
    const frame: Frame = { line: step.line, vars: {}, note: changes(steps[i - 1], step) };
    const primary = trees ? undefined : primaryName(step, options.primary);
    const grid = Object.keys(step.vars).find((k) => isGrid(step.vars[k]));
    if (primary) frame.array = arrayView(step, primary);
    if (grid) frame.grid = gridView(step, grid);
    if (trees) frame.tree = trees[i];

    const extras = Object.entries(step.vars).filter(
      ([k, v]) => k !== primary && k !== grid && !isScalar(v) && !isTree(v) && (typeof v !== 'object' || v?.kind !== 'undefined'),
    );
    for (const [name, value] of extras) {
      if (STACK_NAME.test(name) && !frame.stack) frame.stack = listView(name, value);
      else if (QUEUE_NAME.test(name) && !frame.queue) frame.queue = listView(name, value);
      else if (typeof value === 'object' && value !== null && (value.kind === 'set' || value.kind === 'map') && !frame.set) {
        const view = listView(name, value);
        frame.set = { label: name, entries: view.items.map(String) };
      } else if (!frame.output && !isGrid(value)) frame.output = listView(name, value);
    }
    for (const [name, value] of Object.entries(step.vars)) {
      if (isScalar(value)) frame.vars[name] = value;
      else if (isTree(value)) frame.vars[name] = describeSnap(value);
    }
    return frame;
  });

  const last = frames.at(-1);
  if (last && (options.returned !== undefined || options.error)) {
    frames.push({
      ...last,
      note: options.error ? `Threw: ${options.error}` : `Returned ${describeSnap(options.returned!, 80)}`,
    });
  }
  return frames;
}
