import type { Param, Scalar, TableLegend, TableView } from '@grasp/engine';
import { describeSnap, isArray, isScalar, type ArraySnap, type Snap, type TraceCall, type TraceStep } from './snapshot';

/** Names that make a 2D local, or an int[][] parameter, a grid rather than a list of pairs such as edges or intervals. */
const GRID_NAME = /grid|board|matrix|^mat$|image|heights|dp|table|seen|visited|^vis$/i;
const CELL_PAIRS: [string, string][] = [
  ['r', 'c'],
  ['row', 'col'],
  ['y', 'x'],
  ['i', 'j'],
];

export const is2D = (s: Snap | undefined): s is ArraySnap => isArray(s) && s.items.length > 0 && s.items.every(isArray);

/**
 * The names of the parameters that are grids, a char[][] or one named like a grid: the problem's name for each, and the
 * name the learner's entry function gives it, matched by position.
 */
export function gridParams(params: readonly Param[], entry: TraceCall | undefined): ReadonlySet<string> {
  const names = new Set<string>();
  params.forEach((param, i) => {
    if (param.type !== 'char[][]' && !GRID_NAME.test(param.name)) return;
    names.add(param.name);
    if (entry?.params[i]) names.add(entry.params[i]);
  });
  return names;
}

/** A grid parameter is always a grid; any other 2D value is one when its name says so. */
export const isGrid = (name: string, snap: Snap | undefined, grids: ReadonlySet<string>) =>
  is2D(snap) && (grids.has(name) || GRID_NAME.test(name));

/** The grid drawn at a step: a grid parameter first, else the first grid the code made. */
export function gridName(step: TraceStep, grids: ReadonlySet<string>): string | undefined {
  return [...grids].find((name) => is2D(step.vars[name])) ?? Object.keys(step.vars).find((name) => isGrid(name, step.vars[name], grids));
}

function cells(grid: ArraySnap): (Scalar | null)[][] {
  const rows = grid.items as ArraySnap[];
  const width = Math.max(...rows.map((row) => row.items.length));
  return rows.map((row) =>
    Array.from({ length: width }, (_, c) =>
      c < row.items.length ? (isScalar(row.items[c]) ? row.items[c] : describeSnap(row.items[c], 6)) : null,
    ),
  );
}

function pointedCell(step: TraceStep, rows: number, cols: number): { cell: [number, number]; label: string } | undefined {
  const index = (name: string, limit: number) => {
    const v = step.vars[name];
    return typeof v === 'number' && Number.isInteger(v) && v >= 0 && v < limit ? v : undefined;
  };
  for (const [row, col] of CELL_PAIRS) {
    const r = index(row, rows);
    const c = index(col, cols);
    if (r !== undefined && c !== undefined) return { cell: [r, c], label: `[${row}][${col}]` };
  }
  return undefined;
}

/**
 * Draws the grid variable at each step as a table of its values: the cell a row and column variable point at, and the
 * cells that differ from the grid as the trace first saw it, such as land an island search has sunk.
 */
export function traceGrids(steps: TraceStep[], grids: ReadonlySet<string>): (TableView | undefined)[] {
  const firstSeen = new Map<string, (Scalar | null)[][]>();
  const pointers = new Set<string>();
  let changed = false;
  const tables = steps.map((step) => {
    const name = gridName(step, grids);
    if (!name) return undefined;
    const values = cells(step.vars[name] as ArraySnap);
    if (!firstSeen.has(name)) firstSeen.set(name, values);
    const start = firstSeen.get(name)!;
    const path: [number, number][] = [];
    values.forEach((row, r) => row.forEach((v, c) => v !== (start[r]?.[c] ?? null) && path.push([r, c])));
    const pointed = pointedCell(step, values.length, values[0].length);
    if (pointed) pointers.add(`${name}${pointed.label}`);
    changed ||= path.length > 0;
    return {
      rowLabels: values.map((_, r) => String(r)),
      colLabels: values[0].map((_, c) => String(c)),
      cells: values,
      active: pointed?.cell,
      path,
    } satisfies TableView;
  });
  const legend: TableLegend = {};
  if (pointers.size) legend.active = pointers.size === 1 ? [...pointers][0] : 'current cell';
  if (changed) legend.path = 'changed by your code';
  return tables.map((table) => table && { ...table, legend });
}
