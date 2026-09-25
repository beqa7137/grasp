import { describeSnap, type TraceCall, type TraceStep } from './snapshot';

/** Rows the call stack panel shows; deeper stacks keep the calls nearest the top and count the rest. */
const CALL_STACK_ROWS = 6;
const MAX_ARG = 12;
const MAX_LABEL = 40;

/** The calls on the stack at a step, bottom first as `g-list-view` stacks them, with the count left out below. */
export interface CallStackView {
  items: string[];
  more: number;
}

const clip = (text: string, max: number) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

/** An argument shows its value when that is short, such as a number or a tree node, and its parameter name otherwise. */
function argument(name: string, vars: TraceStep['vars']): string {
  if (!(name in vars)) return name;
  const value = describeSnap(vars[name], MAX_ARG + 1);
  return value.length > MAX_ARG ? name : value;
}

/** Each call as a stack trace shows it: its name, and the arguments it was called with, read from its first step. */
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
