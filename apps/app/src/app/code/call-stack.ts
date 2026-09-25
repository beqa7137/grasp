import { clip } from '@grasp/engine';
import { describeSnap, isArray, type TraceCall, type TraceStep } from './snapshot';

const CALL_STACK_ROWS = 6;
const MAX_ARG = 12;
/** An array of more items renders longer than MAX_ARG, `[1, 2, 3, 4, 5]` at its shortest. */
const MAX_ARG_ITEMS = 4;
const MAX_LABEL = 40;

/** Bottom call first, the order `g-list-view` stacks them; `more` counts the calls cut from below. */
export interface CallStackView {
  items: string[];
  more: number;
}

function argument(name: string, vars: TraceStep['vars']): string {
  const snap = vars[name];
  if (!(name in vars) || (isArray(snap) && snap.items.length > MAX_ARG_ITEMS)) return name;
  const value = describeSnap(snap, MAX_ARG + 1);
  return value.length > MAX_ARG ? name : value;
}

/** `name(args)` per call, with argument values read from the call's first step. */
export function callLabels(steps: TraceStep[], calls: TraceCall[]): string[] {
  const first: (TraceStep | undefined)[] = [];
  for (const step of steps) first[step.call] ??= step;
  return calls.map((call, id) => {
    const vars = first[id]?.vars ?? {};
    const withValues = `${call.name}(${call.params.map((name) => argument(name, vars)).join(', ')})`;
    return clip(withValues.length > MAX_LABEL ? `${call.name}(${call.params.join(', ')})` : withValues, MAX_LABEL);
  });
}

export function callStackAt(call: number, calls: TraceCall[], labels: string[]): CallStackView {
  const items: string[] = [];
  for (let id: number | null = call; id !== null && items.length < CALL_STACK_ROWS; id = calls[id].caller) items.unshift(labels[id]);
  return { items, more: calls[call].depth - items.length };
}
