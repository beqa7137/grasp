import { StageDraw } from './stage-draw';
import { fontMeasure, type Part as StagePart } from './stage-text';

/** The Durability stage's type roles, as `durability-stage.scss` sets them; `tiny` names a disk, in the mono label size. */
export type Role = 'label' | 'cap' | 'capB' | 'small' | 'smallB' | 'mono' | 'tiny' | 'head';
export const TEXT = fontMeasure<Role>({
  label: { font: 'w600', size: 11, track: 0.12, upper: true },
  cap: { font: 'w500', size: 13 },
  capB: { font: 'w600', size: 13 },
  small: { font: 'w500', size: 11 },
  smallB: { font: 'w700', size: 11 },
  mono: { font: 'mono', size: 11 },
  tiny: { font: 'mono', size: 11 },
  head: { font: 'mono', size: 17 },
});
export const tw = TEXT.tw;
export type Part = StagePart<Role>;

export type Layer = 'back' | 'grid' | 'links' | 'marks' | 'dots' | 'text' | 'top';
const LAYERS: readonly Layer[] = ['back', 'grid', 'links', 'marks', 'dots', 'text', 'top'];

/** The Durability stage's drawing: its roles and layers on the shared `StageDraw`. */
export class Draw extends StageDraw<Role, Layer> {
  constructor(W: number) {
    super(W, TEXT, LAYERS, null);
  }
}

const SCALE = '(?:thousand|million|billion|trillion|quadrillion|quintillion|sextillion)';
/**
 * The runs a wrapped stage line never parts: "1 in 18,000" whole, "6 + 3", a number with its unit or what it counts, "×"
 * with its factor, a count with its period ("1 every 600 years", "0.18 a year").
 */
export const STAGE_KEEP: readonly RegExp[] = [
  new RegExp(`\\b1 in \\d[\\d.,]*(?: ${SCALE})?`, 'g'),
  /\d+ \+ \d+/g,
  new RegExp(`\\d[\\d.,]*%? (?:h|TB|PB|MB|Gb/s|nines|copies|copy|pieces|piece|years|disks|ways|${SCALE})\\b`, 'g'),
  /× \d/g,
  /\d ×/g,
  /\d[\d.,]* every \d/g,
  /\bevery \d/g,
  new RegExp(`${SCALE} (?:years|times)\\b`, 'g'),
  /\d[\d.,]*%? a year\b/g,
];

const STATUS = '(?:: (?:met|not yet)\\b)?';
/**
 * What every `g-code-text` in the widget keeps on one line: the stage's runs, and a check's status with the bound before
 * it ("met" never starts a line alone).
 */
export const DURABILITY_KEEP = new RegExp(
  [
    `\\b1 in \\d[\\d.,]*(?: ${SCALE})?(?: years)?`,
    `\\d[\\d.,]* every \\d[\\d.,]*(?: ${SCALE})? years${STATUS}`,
    '\\d+ \\+ \\d+',
    `× (?:1 in )?\\d[\\d.,]*(?: ${SCALE})?`,
    `\\d[\\d.,]*(?:%|×)?(?: ${SCALE})? (?:h|TB|PB|MB|Gb/s|nines|copies|copy|pieces|piece|years|disks|ways|times|objects|failures|survivors|a year)\\b${STATUS}`,
    `\\d[\\d.,]*(?:%|×)${STATUS}`,
    '[^\\s:]+: (?:met|not yet)\\b',
  ].join('|'),
  'g',
);

/** Stage prose broken at `width` with the keep rule. */
export const wrapStage = (text: string, role: Role, width: number) => TEXT.wrap(text, role, width, Infinity, STAGE_KEEP);
