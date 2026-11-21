import { TEXT, type Part, type Role } from './latency-draw';
import { fontMeasure } from './stage-text';

/** The stage's roles, measured by `stage-text.ts` through the Latency stage's table: `nameS` is the 13 px mono figure. */
export type { Part, Role } from './latency-draw';
/** The minus and the approximately-equal sign are as wide as the plus in Inter; the advance table lacks them. */
const asPlus = (t: string) => t.replace(/[−≈]/g, '+');
export const tw = (text: string, role: Role) => TEXT.tw(asPlus(text), role);
export const partsWidth = (parts: readonly Part[]) => parts.reduce((s, [t, role, , dx = 0]) => s + tw(t, role) + dx, 0);
/** The 13 px mono role every figure on the stage uses. */
export const NUM: Role = 'nameS';

/**
 * What the widget's HTML text keeps on one line, beyond the house's number and unit: a byte count, a rate, a count of
 * reads or levels, a bound with its number ("under 20×", "at least 100 GB", "ratio 10"), a short quoted run ("not here"),
 * and a check's status with the word before it ("under 7: met"). Provided to every `g-code-text` in the widget.
 */
export const STORAGE_KEEP =
  /(?:\bp\d{2,3} |\b(?:under|at least) )?\d[\d,.]*(?:×| (?:ns|µs|ms|s|min|KB|MB\/s|MB|GB|TB|B|bytes|bits|levels?|runs?|pages?|disk reads?)(?![\w/]))(?:: (?:met|not yet)\b)?|\bratio \d+|"[^"\s]+(?: [^"\s]+){0,2}"|[^\s:]+: (?:met|not yet)\b/g;

/** Pairs a wrap never parts: a number and what it counts, "about 5", and a quoted run. */
const KEEP = /(\d[\d,.]*×?) (B|KB|MB|GB|MB\/s|bits|levels?|runs?|parts|merges|pages?|records|disk)\b/g;
const GLUE = '\u0001';

/**
 * Breaks stage text into lines no wider than `width`, keeping a number with its unit and a quoted run whole, and never
 * leaving one word alone on a last line when the line above can spare its last word.
 */
export function wrapKept(text: string, role: Role, width: number): string[] {
  const glued = text
    .replace(KEEP, `$1${GLUE}$2`)
    .replace(/\b(about|in|of|k|under|least) (\d)/g, `$1${GLUE}$2`)
    .replace(/"[^"]*"/g, (q) => q.replace(/ /g, GLUE));
  const open = (t: string) => t.replaceAll(GLUE, ' ');
  const fits = (t: string) => tw(open(t), role) <= width;
  const lines: string[] = [];
  let line = '';
  for (const word of glued.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (!line || fits(next)) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  if (lines.length > 1 && !lines[lines.length - 1].includes(' ')) {
    const prev = lines[lines.length - 2].split(' ');
    const moved = prev.length > 1 ? `${prev[prev.length - 1]} ${lines[lines.length - 1]}` : null;
    if (moved && fits(moved)) {
      lines[lines.length - 2] = prev.slice(0, -1).join(' ');
      lines[lines.length - 1] = moved;
    }
  }
  return lines.map(open);
}

/** Describe's table as `g-data-table` sets it: a cell bold as the current row's are, a head as its label caps. */
const TABLE = fontMeasure<'cell' | 'head'>({
  cell: { font: 'w700', size: 13 },
  head: { font: 'w600', size: 11, track: 0.12, upper: true },
});
/** A table cell's side padding: twice `--g-space-2`, or twice `--g-space-1` in a compact table. */
const CELL_PAD = { full: 16, compact: 8 };

/**
 * A table's width with no cell broken: each column as wide as its widest cell and its padding. Its digits are tabular,
 * so each is measured as the widest, a zero.
 */
export function tableWidth(head: readonly string[], rows: readonly (readonly string[])[], compact = false): number {
  const w = (t: string, role: 'cell' | 'head') => TABLE.tw(asPlus(t).replace(/\d/g, '0'), role);
  return head.reduce(
    (sum, h, i) => sum + Math.max(w(h, 'head'), ...rows.map((r) => w(r[i], 'cell'))) + CELL_PAD[compact ? 'compact' : 'full'],
    0,
  );
}
