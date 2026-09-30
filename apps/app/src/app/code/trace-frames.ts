import type { ArrayView, Frame, Param, Scalar, StackView } from '@grasp/engine';
import { callLabels, callStackAt, type CallStackView } from './call-stack';
import type { TraceOutcome } from './protocol';
import { gridParams, isGrid, traceGrids } from './grid-frames';
import { describeSnap, is2D, isArray, isList, isScalar, isTree, type Snap, type TraceStep } from './snapshot';
import { narrate } from './trace-notes';
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

export interface TraceFrame extends Frame {
  calls?: CallStackView;
}

const toScalar = (s: Snap): Scalar => (isScalar(s) ? s : describeSnap(s, 24));

function primaryName(step: TraceStep, grid: string | undefined, preferred?: string): string | undefined {
  if (preferred && preferred !== grid && (isArray(step.vars[preferred]) || typeof step.vars[preferred] === 'string')) return preferred;
  return Object.keys(step.vars).find((k) => {
    const v = step.vars[k];
    return isArray(v) && v.items.length > 0 && !is2D(v);
  });
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

function listView(label: string, s: Snap): StackView {
  if (isArray(s)) return { label, items: s.items.map(toScalar) };
  if (typeof s === 'object' && s !== null && s.kind === 'set') return { label, items: s.items.map(toScalar) };
  if (typeof s === 'object' && s !== null && s.kind === 'map')
    return { label, items: s.entries.map(([k, v]) => `${describeSnap(k, 12)}→${describeSnap(v, 12)}`) };
  return { label, items: [describeSnap(s)] };
}

/** Turns a trace into the frames the visualizer components already know how to draw, plus the call stack. */
export function toFrames(trace: Pick<TraceOutcome, 'steps' | 'calls' | 'returned' | 'error'>, params: readonly Param[]): TraceFrame[] {
  const { steps, calls } = trace;
  const entry = steps.length ? calls[steps[0].call] : undefined;
  const inputs = new Set(entry?.params);
  const preferred = entry?.params[0] ?? params[0]?.name;
  const grids = gridParams(params, entry);
  const trees = traceTrees(steps, calls, preferred);
  const tables = traceGrids(steps, grids);
  const labels = callLabels(steps, calls);
  const showCalls = calls.some((call) => call.depth > 1);
  const notes = narrate(steps, labels);
  const frames = steps.map((step, i): TraceFrame => {
    const frame: TraceFrame = { line: step.line, vars: {}, note: notes[i] };
    const table = tables[i];
    const grid = table?.name;
    const primary = trees ? undefined : primaryName(step, grid, preferred);
    if (primary) frame.array = arrayView(step, primary);
    if (table) frame.table = table.view;
    if (trees) frame.tree = trees[i];
    if (showCalls) frame.calls = callStackAt(step.call, calls, labels);

    // Values the code made take the single output slot before inputs such as a given edge list.
    const extras = Object.entries(step.vars)
      .filter(
        ([k, v]) =>
          k !== primary && k !== grid && !isScalar(v) && !isTree(v) && !isList(v) && (typeof v !== 'object' || v?.kind !== 'undefined'),
      )
      .sort(([a], [b]) => Number(inputs.has(a)) - Number(inputs.has(b)));
    for (const [name, value] of extras) {
      if (STACK_NAME.test(name) && !frame.stack) frame.stack = listView(name, value);
      else if (QUEUE_NAME.test(name) && !frame.queue) frame.queue = listView(name, value);
      else if (typeof value === 'object' && value !== null && (value.kind === 'set' || value.kind === 'map') && !frame.set) {
        const view = listView(name, value);
        frame.set = { label: name, entries: view.items.map(String) };
      } else if (!frame.output && !isGrid(name, value, grids)) frame.output = listView(name, value);
    }
    for (const [name, value] of Object.entries(step.vars)) {
      if (isScalar(value)) frame.vars[name] = value;
      else if (isTree(value) || isList(value)) frame.vars[name] = describeSnap(value);
    }
    return frame;
  });

  const last = frames.at(-1);
  if (last && (trace.returned !== undefined || trace.error)) {
    frames.push({
      ...last,
      calls: trace.error ? last.calls : last.calls && { items: [], more: 0 },
      note: trace.error ? `Threw: ${trace.error.message}` : `Returned ${describeSnap(trace.returned!, 80)}`,
    });
  }
  return frames;
}
