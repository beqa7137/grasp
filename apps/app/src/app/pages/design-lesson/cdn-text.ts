import { StageDraw } from './stage-draw';
import { fontMeasure, type Part as StagePart } from './stage-text';

/** The CDNs & Edge stage's type roles, as `cdn-stage.scss` sets them. Stage text keeps proportional digits, as measured. */
export type Role = 'label' | 'title' | 'cap' | 'capB' | 'small' | 'smallB' | 'mono' | 'num';
export const TEXT = fontMeasure<Role>({
  label: { font: 'w600', size: 11, track: 0.12, upper: true, units: true },
  title: { font: 'w600', size: 15 },
  cap: { font: 'w500', size: 13 },
  capB: { font: 'w600', size: 13 },
  small: { font: 'w500', size: 11 },
  smallB: { font: 'w700', size: 11 },
  mono: { font: 'mono', size: 11 },
  num: { font: 'mono', size: 13 },
});
/** The line each role's paragraphs advance by. */
export const LH: Readonly<Record<Role, number>> = {
  label: 14,
  title: 20,
  cap: 17,
  capB: 17,
  small: 14,
  smallB: 14,
  mono: 14,
  num: 17,
};
export type Part = StagePart<Role>;

/** √ and ÷ are not in the advance table; they are about as wide as a plus. */
const plain = (t: string) => t.replace(/[√−]/g, '+');
export const tw = (text: string, role: Role) => TEXT.tw(plain(text), role);

export type Layer = 'back' | 'grid' | 'links' | 'clip' | 'marks' | 'dots' | 'text' | 'top';
const LAYERS: readonly Layer[] = ['back', 'grid', 'links', 'clip', 'marks', 'dots', 'text', 'top'];

/** The stage's drawing: its roles and layers on the shared `StageDraw`, and the stage lines a wrap left one word alone. */
export class CdnDraw extends StageDraw<Role, Layer> {
  readonly orphans: string[] = [];
  constructor(W: number) {
    super(W, TEXT, LAYERS, 'label');
  }
}

/**
 * The stage's keep rule: a number never parts from its unit ("10 ms", "500/s a location", "?% of"), nor a ghost
 * sentence from its words ("It was 18.8 ms."), nor a share from the path it multiplies ("69.2% × 10 ms"). Only the
 * number and its unit are kept, never the words before them, so no line strands "Each"; a rate that ends a sentence
 * keeps its "of", so it never stands alone on a line between the share and a ghost.
 */
const KEEP_STAGE = [
  /It was [^ ]+(?: ms)?\./g,
  /of \d[\d,.]*\/s\./g,
  /\d[\d,.]*% × \d[\d,.]* ms/g,
  /(?:\d[\d,.]*|\?)% of misses/g,
  /(?:\d[\d,.]*(?:%|\/s)?|\?%|\?\/s) (?:ms|s|min|h|minutes?|seconds?|hours?|locations?|requests|URLs|times|a second|a minute|a location)\b/g,
];
const HOLD = '';

/**
 * Breaks stage text into lines no wider than `width` by the shipped fonts' advances, never inside a kept run, and never
 * leaving one word alone on a last line when the line above can spare its last word. Heights depend on it, so the
 * browser's own wrap never decides a line.
 */
export function wrap(text: string, role: Role, width: number): string[] {
  const held = KEEP_STAGE.reduce((t, re) => t.replace(re, (m) => m.replaceAll(' ', HOLD)), text);
  const open = (t: string) => t.replaceAll(HOLD, ' ');
  const fits = (t: string) => tw(open(t), role) <= width;
  const lines: string[] = [];
  let line = '';
  for (const word of held.split(' ')) {
    const next = line ? `${line} ${word}` : word;
    if (!line || fits(next)) line = next;
    else {
      lines.push(line);
      line = word;
    }
  }
  if (line) lines.push(line);
  const last = lines.length - 1;
  if (last > 0 && !lines[last].includes(' ') && !lines[last].includes(HOLD)) {
    const prev = lines[last - 1].split(' ');
    const moved = prev.length > 1 ? `${prev[prev.length - 1]} ${lines[last]}` : null;
    if (moved && fits(moved)) {
      lines[last - 1] = prev.slice(0, -1).join(' ');
      lines[last] = moved;
    }
  }
  return lines.map(open);
}
export const linesOf = (text: string, role: Role, width: number) => wrap(text, role, width).length;
/** The first of `forms` that fits, longest first, or the last. */
export const pickLast = <T>(forms: readonly T[], fits: (f: T) => boolean): T => forms.find(fits) ?? forms[forms.length - 1];

/**
 * What the widget's HTML text keeps on one line: a number with its unit or its rate, a hidden figure ("?%", "?/s"),
 * "(?utm_source=…)", the model's two formulas and a hyphened duration ("5-minute") whole, and a checklist verdict
 * with the number and unit before it ("18 ms: met"). Provided to every `g-code-text` in the widget.
 */
export const CDN_KEEP =
  /\(\?utm_source=…\)|\d+ ms × √\(20 ÷ n\)|rT ÷ \(1 \+ rT\)|\d+-(?:second|minute|hour)\b|(?:\d[\d,.]*(?:%|\/s)?|\?%|\?\/s|\?(?= ms))(?: (?:ms|s|min|h|minutes?|seconds?|hours?|locations?|requests|URLs|times|a second|a minute|a location)\b)?(?:: (?:met|not yet)\b)?/g;

/** Describe's table as `g-data-table` sets it: a cell bold as the current row's are, a head as its label caps. */
const TABLE = fontMeasure<'cell' | 'head'>({
  cell: { font: 'w700', size: 13 },
  head: { font: 'w600', size: 11, track: 0.12, upper: true },
});
const CELL_PAD = { full: 16, compact: 8 };

/** A table's width with no cell broken: its digits are tabular, so each is measured as the widest, a zero. */
export function tableWidth(head: readonly string[], rows: readonly (readonly string[])[], compact = false): number {
  const w = (t: string, role: 'cell' | 'head') => TABLE.tw(t.replace(/\d/g, '0'), role);
  return head.reduce(
    (sum, h, i) => sum + Math.max(w(h, 'head'), ...rows.map((r) => w(r[i], 'cell'))) + CELL_PAD[compact ? 'compact' : 'full'],
    0,
  );
}
