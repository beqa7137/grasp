import type { Param, Scalar, TableLegend, TableView } from '@grasp/engine';
import { describeSnap, is2D, isScalar, type ArraySnap, type Snap, type TraceCall, type TraceStep } from './snapshot';

const GRID_WORDS = new Set(['grid', 'board', 'matrix', 'mat', 'image', 'heights', 'dp', 'table', 'cells', 'seen', 'visited', 'vis']);
const LIST_WORDS = new Set(['edges', 'pairs', 'intervals', 'list', 'queue', 'stack', 'points']);
const CELL_PAIRS: [string, string][] = [
  ['r', 'c'],
  ['row', 'col'],
  ['y', 'x'],
  ['i', 'j'],
];

/**
 * A 2D local, or an int[][] parameter, named with a grid word is a grid (`gridCopy`, `DPTable`), unless its last word
 * names a list (`seenEdges`).
 */
function isGridName(name: string): boolean {
  const words = name
    .replace(/([a-z\d])([A-Z])|([A-Z])([A-Z][a-z])/g, '$1$3_$2$4')
    .toLowerCase()
    .split(/[_\d]+/)
    .filter(Boolean);
  return words.some((word) => GRID_WORDS.has(word)) && !LIST_WORDS.has(words.at(-1)!);
}

/** Grid parameters (char[][] or named like a grid), under both the problem's name and the learner's, matched by position. */
export function gridParams(params: readonly Param[], entry: TraceCall | undefined): ReadonlySet<string> {
  const names = new Set<string>();
  params.forEach((param, i) => {
    if (param.type !== 'char[][]' && !isGridName(param.name)) return;
    names.add(param.name);
    if (entry?.params[i]) names.add(entry.params[i]);
  });
  return names;
}

export const isGrid = (name: string, snap: Snap | undefined, grids: ReadonlySet<string>) =>
  is2D(snap) && (grids.has(name) || isGridName(name));

function gridName(step: TraceStep, grids: ReadonlySet<string>): string | undefined {
  return [...grids].find((name) => is2D(step.vars[name])) ?? Object.keys(step.vars).find((name) => isGrid(name, step.vars[name], grids));
}

function cells(grid: ArraySnap): (Scalar | null)[][] {
  const rows = grid.items as ArraySnap[];
  const width = Math.max(...rows.map((row) => row.items.length));
  return rows.map((row) => {
    const values: (Scalar | null)[] = row.items.map((item) => (isScalar(item) ? item : describeSnap(item, 6)));
    while (values.length < width) values.push(null);
    return values;
  });
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

/** Each step's grid as a table, marking the cell a row/column pair points at and the cells that differ from the grid's first snapshot. */
export function traceGrids(steps: TraceStep[], grids: ReadonlySet<string>): ({ name: string; view: TableView } | undefined)[] {
  const firstSeen = new Map<string, (Scalar | null)[][]>();
  const pointers = new Set<string>();
  let changed = false;
  const drawn = steps.map((step) => {
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
    const view: TableView = {
      rowLabels: values.map((_, r) => String(r)),
      colLabels: values[0].map((_, c) => String(c)),
      cells: values,
      active: pointed?.cell,
      path,
    };
    return { name, view };
  });
  const legend: TableLegend = {};
  if (pointers.size) legend.active = pointers.size === 1 ? [...pointers][0] : 'current cell';
  if (changed) legend.path = 'changed by your code';
  return drawn.map((grid) => grid && { name: grid.name, view: { ...grid.view, legend } });
}
