import { describeSnap, is2D, isArray, type Snap, type TraceStep } from './snapshot';

const MAX_CELL_NOTES = 3;

/** JSON equality, comparing lists item by item so a large grid stops at its first changed cell. */
function same(a: Snap | undefined, b: Snap | undefined): boolean {
  if (a === b) return true;
  if (typeof a !== 'object' || typeof b !== 'object' || a === null || b === null || a.kind !== b.kind) return false;
  if ((a.kind === 'array' || a.kind === 'set') && (b.kind === 'array' || b.kind === 'set'))
    return a.truncated === b.truncated && a.items.length === b.items.length && a.items.every((item, i) => same(item, b.items[i]));
  return JSON.stringify(a) === JSON.stringify(b);
}

/** Positions where an array or a grid of the same shape changed, such as `[2]` or `[0][1]`, or null when the shape changed. */
function changedCells(before: Snap | undefined, after: Snap): [string, Snap][] | null {
  if (!isArray(before) || !isArray(after) || before.items.length !== after.items.length || before.truncated !== after.truncated)
    return null;
  const out: [string, Snap][] = [];
  for (const [i, item] of after.items.entries()) {
    if (same(before.items[i], item)) continue;
    const inner = is2D(after) ? changedCells(before.items[i], item) : null;
    if (inner) out.push(...inner.map(([at, v]): [string, Snap] => [`[${i}]${at}`, v]));
    else out.push([`[${i}]`, item]);
  }
  return out;
}

function changedVars(before: TraceStep | undefined, step: TraceStep): string[] {
  return Object.entries(step.vars).flatMap(([k, v]) => {
    if (before && same(before.vars[k], v)) return [];
    const cells = before ? changedCells(before.vars[k], v) : null;
    if (cells && cells.length <= MAX_CELL_NOTES) return cells.map(([at, value]) => `${k}${at} = ${describeSnap(value, 40)}`);
    return [`${k} = ${describeSnap(v, 40)}`];
  });
}

/** Diffs each step against the same call's previous step, so returning from a callee does not list the caller's variables as changed. */
export function narrate(steps: TraceStep[], labels: string[]): string[] {
  const latest = new Map<number, TraceStep>();
  return steps.map((step, i) => {
    const prev = steps[i - 1];
    const before = latest.get(step.call);
    latest.set(step.call, step);
    if (!prev) return 'Called with ' + changedVars(undefined, step).join(', ');
    if (step.call !== prev.call && !before) return `Called ${labels[step.call]}`;
    const changed = changedVars(before, step);
    if (step.call !== prev.call) changed.unshift(`Back in ${labels[step.call]}`);
    return changed.length ? changed.join(' · ') : 'No variables changed';
  });
}
