import { StageDraw } from './stage-draw';
import { fontMeasure, type Part as StagePart } from './stage-text';

/**
 * The Backups & Recovery stage's type roles, as `recovery-stage.scss` sets them. The label role is drawn in the
 * capitals `caps` writes, so a unit keeps its case ("24 h", "10 GB/min") and the text measured is the text drawn.
 */
export type Role = 'title' | 'label' | 'cap' | 'capB' | 'small' | 'smallB';
export const TEXT = fontMeasure<Role>({
  title: { font: 'w600', size: 15 },
  label: { font: 'w600', size: 11, track: 0.12 },
  cap: { font: 'w500', size: 13 },
  capB: { font: 'w600', size: 13 },
  small: { font: 'w500', size: 11 },
  smallB: { font: 'w700', size: 11 },
});
export const tw = TEXT.tw;
export type Part = StagePart<Role>;

/** Layers bottom to top. */
export type Layer = 'back' | 'grid' | 'marks' | 'dots' | 'text' | 'top';
const LAYERS: readonly Layer[] = ['back', 'grid', 'marks', 'dots', 'text', 'top'];

export class Draw extends StageDraw<Role, Layer> {
  constructor(W: number) {
    super(W, TEXT, LAYERS);
  }
}

/** A label in capitals, but a unit after a number keeps its case, and so does GB/min. */
export const caps = (t: string) =>
  t
    .toUpperCase()
    .replace(/GB\/MIN/g, 'GB/min')
    .replace(/(\d) (MIN|H|S)\b/g, (_, d: string, u: string) => `${d} ${u.toLowerCase()}`);

/** Runs a stage wrap never parts: a number and its unit, "at 10×", "every 6 h", "up to 24 h", a quoted run. */
const STAGE_KEEP = [/(?:\b(?:at|every|in|of|up to|loses|back) )?\d[\d,.]*×?(?: (?:s|min|h|GB|TB|GB\/min)\b)?/g, /"[^"]*"/g];

/**
 * Stage text broken into lines no wider than `width`, keeping a number with its unit, and never leaving one word alone
 * on a last line when the line above can spare its last word.
 */
export function wrapKept(text: string, role: Role, width: number): string[] {
  const lines = TEXT.wrap(text, role, width, Infinity, STAGE_KEEP);
  if (lines.length > 1 && !lines[lines.length - 1].includes(' ')) {
    const prev = lines[lines.length - 2].split(' ');
    const moved = prev.length > 1 ? `${prev[prev.length - 1]} ${lines[lines.length - 1]}` : null;
    if (moved && tw(moved, role) <= width) {
      lines[lines.length - 2] = prev.slice(0, -1).join(' ');
      lines[lines.length - 1] = moved;
    }
  }
  return lines;
}

/**
 * What the widget's HTML text keeps on one line, beyond the house's number and unit: a span, a size or a speed with the
 * words that bound it ("up to 24 h", "at 10×", "every 6 h"), RPO and RTO, a quoted run, and a check's status with the
 * figure before it. Provided to every `g-code-text` in the widget.
 */
export const RECOVERY_KEEP =
  /(?:\b(?:up to|under|at least|at most|every|at|in) )?\d[\d,.]*(?:×| (?:s|min|h|GB\/min|GB|TB|times)(?![\w/]))(?:\)?: (?:met|not yet)\b)?|\bRPO\b|\bRTO\b|"[^"]*"/g;

/** Describe's table as `g-data-table` sets it: a cell bold as the current row's are, a head as its label caps. */
const TABLE = fontMeasure<'cell' | 'head'>({
  cell: { font: 'w700', size: 13 },
  head: { font: 'w600', size: 11, track: 0.12, upper: true },
});
const CELL_PAD = { full: 16, compact: 8 };

/** A table's width with no cell broken; its figure columns' digits are tabular, so each is measured as a zero. */
export function tableWidth(head: readonly string[], rows: readonly (readonly string[])[], compact = false, figuresFrom = 1): number {
  const w = (t: string, role: 'cell' | 'head', i: number) => TABLE.tw(i >= figuresFrom ? t.replace(/\d/g, '0') : t, role);
  return head.reduce(
    (sum, h, i) => sum + Math.max(w(h, 'head', i), ...rows.map((r) => w(r[i], 'cell', i))) + CELL_PAD[compact ? 'compact' : 'full'],
    0,
  );
}
