import { FEED_PLACES } from '@grasp/engine';
import type { Box } from './focus-layout';

export const PAD = 16;
/** From this stage width the drawing takes its wide form: labels beside handles, one row of chips, a legend column. */
export const WIDE_FROM = 520;
/** From this width the two tables sit side by side; narrower, authors goes under posts. */
export const TABLES_SIDE_FROM = 320;
/** A handle's hit box, and every other target on the stage. */
export const HIT = 44;
/** The read lanes' fixed axis. */
export const AXIS_MS = 120;
export const LINE = 17;

/** The stage's type roles, as `feed-model-widget.component.scss` sets them. */
export type TextRole = 'mono' | 'small' | 'cap' | 'label' | 'head';
/** Measured average advances in px (Inter and JetBrains Mono at the roles' sizes), rounded up so checks err toward room. */
const ADVANCE: Record<TextRole, number> = { mono: 7, small: 6, cap: 7, label: 8.4, head: 10.8 };
const HEIGHT: Record<TextRole, number> = { mono: 11, small: 11, cap: 13, label: 11, head: 17 };

export const textWidth = (text: string, role: TextRole) => text.length * ADVANCE[role];

export type Anchor = 'start' | 'middle' | 'end';

/** A text's box from its anchor point and baseline, for collision checks. */
export function textBox(text: string, role: TextRole, x: number, y: number, anchor: Anchor = 'start'): Box {
  const width = textWidth(text, role);
  const left = anchor === 'start' ? x : anchor === 'end' ? x - width : x - width / 2;
  return { x: left, y: y - HEIGHT[role] + 1, width, height: HEIGHT[role] + 2 };
}

/** A section's label and its headline (a value in mono, then its unit) on the right, as boxes. */
export function headerBoxes(label: string, labelX: number, value: string, unit: string, right: number, y: number, labelY = 30): Box[] {
  const unitBox = textBox(unit, 'cap', right, y, 'end');
  const valueBox = textBox(value, 'head', unitBox.x - 4, y, 'end');
  return [textBox(label.toUpperCase(), 'label', labelX, labelY), unitBox, valueBox];
}

/** Splits `text` into at most `lines` lines that fit `width`, breaking at spaces; the last line takes what is left. */
export function wrap(text: string, role: TextRole, width: number, lines: number): string[] {
  const words = text.split(' ');
  const out: string[] = [];
  let line = '';
  for (const word of words) {
    const next = line ? `${line} ${word}` : word;
    if (line && textWidth(next, role) > width && out.length < lines - 1) {
      out.push(line);
      line = word;
    } else line = next;
  }
  return [...out, line];
}

/** A handle's track with its stops: their x, the stop labels' row, and the snapped value's row over the knob. */
export interface Track {
  x0: number;
  x1: number;
  y: number;
  positions: number[];
  label: { x: number; y: number };
}

function track(x0: number, x1: number, y: number, stops: number, label: { x: number; y: number }): Track {
  return { x0, x1, y, positions: Array.from({ length: stops }, (_, i) => x0 + ((x1 - x0) * i) / (stops - 1)), label };
}

/** A handle's track: wide, its name to the left at `labelWidth`; narrow, its name on a row above. */
function namedTrack(width: number, wide: boolean, y: number, stops: number, labelWidth: number, inset = 8): Track {
  return wide
    ? track(PAD + labelWidth, width - PAD - inset, y, stops, { x: PAD, y: y + 4 })
    : track(PAD + inset, width - PAD - inset, y, stops, { x: PAD, y: y - 32 });
}

/** A track's texts: its name, each stop's label, and the snapped value over the knob at `index`. */
export function trackBoxes(t: Track, stops: readonly string[], index: number, value: string, name: string): Box[] {
  const last = stops.length - 1;
  return [
    ...(name ? [textBox(name, 'cap', t.label.x, t.label.y)] : []),
    ...stops.map((label, i) =>
      textBox(
        label,
        'small',
        i === 0 ? t.positions[i] - 4 : i === last ? t.positions[i] + 4 : t.positions[i],
        t.y + 22,
        i === 0 ? 'start' : i === last ? 'end' : 'middle',
      ),
    ),
    textBox(value, 'mono', valueX(t, index, value), t.y - 15, 'middle'),
  ];
}

/** Where a track's snapped value sits: over the knob, slid in at the ends so it stays over the stop labels' span. */
export function valueX(t: Track, index: number, value: string): number {
  const half = textWidth(value, 'mono') / 2;
  return Math.min(t.x1 + 4 - half, Math.max(t.x0 - 4 + half, t.positions[index]));
}

export interface Chip {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** One feed page: the read lanes on a fixed 0 to 120 ms axis, then the database's place as four chips. */
export interface ReadLayout {
  width: number;
  wide: boolean;
  height: number;
  px0: number;
  px1: number;
  headlineY: number;
  rowA: number;
  rowB: number;
  braceY: number;
  appY: number;
  dbY: number;
  rulerY: number;
  axisY: number;
  chips: Chip[];
  /** "Database", beside the chips when wide. */
  chipLabel: { x: number; y: number } | null;
  /** Below 360px the magnifier takes a row of its own under the lanes, so N+1's trips stay countable. */
  magnifier: { width: number; top: number; height: number; slot: number; below: boolean };
}

export function readLayout(width: number): ReadLayout {
  const wide = width >= WIDE_FROM;
  const px0 = PAD + (wide ? 56 : 40);
  const px1 = width - PAD;
  // Narrow, the headline takes a row of its own under the section's label.
  const dy = wide ? 0 : 24;
  const appY = 112 + dy;
  const dbY = 176 + dy;
  const below = !wide && width < 360;
  const axisY = dbY + 36 + (below ? 64 : 0);
  const chipTop = axisY + 30;
  const labelWidth = wide ? 74 : 0;
  const perRow = wide || width - 2 * PAD >= 4 * 98 + 18 ? 4 : 2;
  const gap = 6;
  const chipWidth = (width - 2 * PAD - labelWidth - (perRow - 1) * gap) / perRow;
  const chips = FEED_PLACES.map((_, i) => ({
    x: PAD + labelWidth + (i % perRow) * (chipWidth + gap),
    y: chipTop + Math.floor(i / perRow) * (HIT + gap),
    width: chipWidth,
    height: HIT,
  }));
  return {
    width,
    wide,
    height: chips.at(-1)!.y + HIT + 22,
    px0,
    px1,
    headlineY: wide ? 32 : 56,
    rowA: 66 + dy,
    rowB: 86 + dy,
    braceY: 98 + dy,
    appY,
    dbY,
    rulerY: dbY + 16,
    axisY,
    chips,
    chipLabel: wide ? { x: PAD, y: chipTop + 27 } : null,
    magnifier: below
      ? { width: width - 2 * PAD, top: dbY + 30, height: 56, slot: 22, below }
      : { width: wide ? 176 : 104, top: 100 + dy, height: 86, slot: wide ? 40 : 24, below },
  };
}

export const timeX = (L: ReadLayout, ms: number) => L.px0 + ((L.px1 - L.px0) * Math.min(ms, AXIS_MS)) / AXIS_MS;

export interface Card {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** The posts and authors tables, the posts-a-page handle under them, and the note line; `top` is where they start. */
export interface TablesLayout {
  top: number;
  height: number;
  side: boolean;
  posts: Card;
  authors: Card;
  rowH: number;
  headH: number;
  pageTrack: Track;
  note: { x: number; y: number; width: number; lines: number };
}

export const TABLE_ROWS = 4;
const ROW_H = 21;
const HEAD_H = 44;
const MORE_H = 22;
const OFF_H = 26;
export const CARD_H = HEAD_H + TABLE_ROWS * ROW_H + MORE_H + OFF_H;

export function tablesLayout(width: number, top: number): TablesLayout {
  const wide = width >= WIDE_FROM;
  const side = width >= TABLES_SIDE_FROM;
  const cardTop = top + 46;
  let posts: Card;
  let authors: Card;
  if (side) {
    const aw = wide ? 156 : 96;
    const gap = wide ? 40 : 24;
    const pw = width - 2 * PAD - aw - gap;
    posts = { x: PAD, y: cardTop, width: pw, height: CARD_H };
    authors = { x: PAD + pw + gap, y: cardTop, width: aw, height: CARD_H };
  } else {
    posts = { x: PAD, y: cardTop, width: width - 2 * PAD, height: CARD_H };
    authors = { x: PAD, y: cardTop + CARD_H + 30, width: width - 2 * PAD, height: CARD_H };
  }
  const cardsBottom = authors.y + CARD_H;
  const handleY = cardsBottom + (wide ? 34 : 60);
  const pageTrack = wide
    ? track(PAD + 104, posts.x + posts.width - 8, handleY, 4, { x: PAD, y: handleY + 4 })
    : namedTrack(width, false, handleY, 4, 0);
  const lines = wide ? 1 : 2;
  const noteY = handleY + 46;
  return {
    top,
    height: noteY + (lines - 1) * LINE + 18 - top,
    side,
    posts,
    authors,
    rowH: ROW_H,
    headH: HEAD_H,
    pageTrack,
    note: { x: PAD, y: noteY, width: width - 2 * PAD, lines },
  };
}

/** Ada's rename: her posts handle, the 100 copies, their legend, and the copy rewrite's bar. */
export interface WriteLayout {
  width: number;
  wide: boolean;
  height: number;
  headlineY: number;
  postsTrack: Track;
  caption: { y: number; lines: number };
  grid: { x: number; y: number; cols: number; rows: number; pitch: number; width: number; height: number };
  legend: { x: number; ys: number[] };
  bar: { x0: number; x1: number; labelY: number; y: number; captionY: number; lines: number };
}

export const GRID_CELLS = 100;

export function writeLayout(width: number): WriteLayout {
  const wide = width >= WIDE_FROM;
  const legendWidth = 168;
  const cols = wide ? 25 : 20;
  const rows = GRID_CELLS / cols;
  const pitch = Math.min(wide ? 16 : 15, Math.floor((width - 2 * PAD - (wide ? legendWidth : 0)) / cols));
  const postsTrack = namedTrack(width, wide, wide ? 70 : 130, 5, 96);
  const caption = { y: postsTrack.y + 48, lines: wide ? 1 : 2 };
  const gridY = caption.y + (caption.lines - 1) * LINE + 12;
  const grid = { x: PAD, y: gridY, cols, rows, pitch, width: cols * pitch - 3, height: rows * pitch - 3 };
  const legend = wide
    ? { x: PAD + grid.width + 18, ys: [0, 1, 2].map((i) => gridY + 9 + i * 20) }
    : { x: PAD, ys: [0, 1, 2].map((i) => gridY + grid.height + 22 + i * 20) };
  const labelY = wide ? gridY + grid.height + 30 : legend.ys[2] + 30;
  const lines = wide ? 2 : 4;
  const bar = { x0: PAD, x1: wide ? PAD + grid.width : width - PAD, labelY, y: labelY + 10, captionY: labelY + 42, lines };
  return {
    width,
    wide,
    height: bar.captionY + (lines - 1) * (LINE + 1) + 16,
    headlineY: wide ? 32 : 62,
    postsTrack,
    caption,
    grid,
    legend,
    bar,
  };
}

/** Traffic: the two rate handles, then rows per post shown against renames per post shown, with its legend. */
export interface TrafficLayout {
  width: number;
  wide: boolean;
  height: number;
  pagesTrack: Track;
  renamesTrack: Track;
  titleY: number;
  /** The header's label, on two lines where Table would cover one. */
  header: string[];
  subtitleLines: number;
  plot: { l: number; r: number; t: number; b: number };
  legendYs: number[];
}

/** Renames per post shown, as powers of ten: the chart's x range. */
export const X_DECADES = [-9, -2] as const;
export const Y_MAX = 4;

export function trafficLayout(width: number): TrafficLayout {
  const wide = width >= WIDE_FROM;
  const label = 'Traffic · which schema wins';
  const header = textWidth(label.toUpperCase(), 'label') + PAD > width - 72 ? ['Traffic ·', 'which schema wins'] : [label];
  const dy = (header.length - 1) * 16;
  const pagesTrack = namedTrack(width, wide, (wide ? 76 : 92) + dy, 5, 136, 10);
  const renamesTrack = namedTrack(width, wide, pagesTrack.y + (wide ? 56 : 84), 5, 136, 10);
  const titleY = renamesTrack.y + 46;
  const subtitleLines = wide ? 1 : 3;
  const t = titleY + (wide ? 52 : 78);
  const b = t + (wide ? 160 : 150);
  const plot = { l: PAD + 24, r: width - PAD - (wide ? 96 : 10), t, b };
  const legendYs = (wide ? [54, 72, 90] : [54, 70, 86, 104, 122, 138]).map((d) => b + d);
  return { width, wide, height: legendYs.at(-1)! + 14, pagesTrack, renamesTrack, titleY, header, subtitleLines, plot, legendYs };
}

export const decadeX = (P: TrafficLayout['plot'], decade: number) =>
  P.l + ((decade - X_DECADES[0]) / (X_DECADES[1] - X_DECADES[0])) * (P.r - P.l);
export const rateX = (P: TrafficLayout['plot'], renamesPerPost: number) => decadeX(P, Math.log10(renamesPerPost));
export const rowsY = (P: TrafficLayout['plot'], rows: number) => P.b - (Math.min(rows, Y_MAX) / Y_MAX) * (P.b - P.t);
