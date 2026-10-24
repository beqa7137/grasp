import { FEED_FANOUT_ROWS_PER_S, feedAt, feedRowsPerPost, type FeedSettings } from '@grasp/engine';
import { PAD, X_DECADES, Y_MAX, decadeX, rateX, rowsY, textBox, textWidth, type Anchor, type TrafficLayout } from './feed-layout';
import { compact, count, rate } from './feed-page-view';
import { overlaps, type Box, type Focus } from './focus-layout';

export interface TrafficState {
  settings: FeedSettings;
  /** Denormalized, not selected, is what an experiment asks about: its line, break-even and region wait for the answer. */
  hideDenormalized: boolean;
  /** Whether the copy rewrite's falling-behind region shows: when copies are in play and nothing asks about it. */
  showBehind: boolean;
}

export interface PointLabel {
  x: number;
  y: number;
  anchor: Anchor;
  value: string;
  name: string;
  selected: boolean;
}

export interface TrafficView {
  normalized: string;
  denormalized: string | null;
  /** Where denormalized leaves the top of the chart, or null when it stays under it. */
  topArrow: number | null;
  reads: { y: number };
  writes: string | null;
  behind: { x: number } | null;
  breakEven: { x: number; clamped: boolean } | null;
  cursor: { x: number; clamped: boolean };
  points: { x: number; y: number; selected: boolean; over: boolean }[];
  labels: PointLabel[];
  asking: PointLabel | null;
  ticks: { x: number; label: string; anchor: Anchor; major: boolean }[];
  lineNames: { text: string; y: number }[];
  legend: {
    reads: string;
    writes: string | null;
    breakEven: { parts: { text: string; num?: boolean }[] } | null;
    behind: { limit: string } | null;
  };
  texts: Box[];
}

const SAMPLES = 160;
const decades = Array.from({ length: SAMPLES + 1 }, (_, i) => X_DECADES[0] + ((X_DECADES[1] - X_DECADES[0]) * i) / SAMPLES);

/** A line's path over the chart's range, stopping where it leaves the top. */
function linePath(P: TrafficLayout['plot'], fn: (r: number) => number): { d: string; out: number | null } {
  let d = '';
  for (const e of decades) {
    const v = fn(10 ** e);
    if (v > Y_MAX) return { d, out: decadeX(P, e) };
    d += `${d ? 'L' : 'M'}${decadeX(P, e).toFixed(1)} ${rowsY(P, v).toFixed(1)}`;
  }
  return { d, out: null };
}

/**
 * Which schema wins at the traffic: rows per post shown against renames per post shown, both lines, the reads and writes
 * under the selected one, where they cross (1 rename per Ada's post count), the current traffic's point on each, and,
 * when copies are in play, where the copy rewrite falls behind.
 */
export function trafficView(T: TrafficLayout, s: TrafficState): TrafficView {
  const P = T.plot;
  const { pageSize: p, postsPerAuthor: A, pagesPerSecond: pps, renamesPerSecond: rps } = s.settings;
  const den = s.settings.schema === 1;
  const texts: Box[] = [
    ...T.header.map((h, i) => textBox(h.toUpperCase(), 'label', PAD, 30 + i * 16)),
    textBox('Rows per post shown', 'cap', PAD, T.titleY),
  ];
  const subtitle = trafficSubtitle(T.wide);
  subtitle.forEach((line, i) => texts.push(textBox(line, 'small', PAD, T.titleY + 16 + i * 14)));
  const norm = (r: number) => feedRowsPerPost(false, r, A);
  const copy = (r: number) => feedRowsPerPost(true, r, A);
  const xMax = 10 ** X_DECADES[1];

  const normalized = linePath(P, norm).d;
  const denLine = linePath(P, copy);
  const showDen = !s.hideDenormalized;
  const floor = den ? 1 : 2;
  let writes: string | null = null;
  if (!(den && s.hideDenormalized)) {
    const fn = den ? copy : norm;
    let d = '';
    for (const e of decades) d += `${d ? 'L' : 'M'}${decadeX(P, e).toFixed(1)} ${rowsY(P, fn(10 ** e)).toFixed(1)}`;
    for (const e of [...decades].reverse()) d += `L${decadeX(P, e).toFixed(1)} ${rowsY(P, floor).toFixed(1)}`;
    writes = `${d}Z`;
  }
  const behindAt = FEED_FANOUT_ROWS_PER_S / (A * pps * p);
  const behind = s.showBehind && showDen && behindAt < xMax ? { x: Math.max(rateX(P, behindAt), P.l) } : null;
  const breakEven = showDen ? { x: Math.min(rateX(P, 1 / A), P.r), clamped: 1 / A > xMax } : null;

  const r = rps / (pps * p);
  const clamped = r > xMax;
  const cx = Math.min(rateX(P, r), P.r);
  const at = (fn: (r: number) => number) => fn(Math.min(r, xMax));
  const lines = [
    { den: false, v: at(norm), rows: feedAt(s.settings, 'join').rowsPerSecond },
    ...(showDen ? [{ den: true, v: at(copy), rows: feedAt(s.settings, 'denormalized').rowsPerSecond }] : []),
  ];
  const points = lines.map((l) => ({ x: cx, y: rowsY(P, l.v), selected: l.den === den, over: l.v > Y_MAX }));

  const name = (d: boolean) => (T.wide ? (d ? ' denormalized' : ' normalized') : '');
  const text = (l: (typeof lines)[number]) => `${count(l.rows)} rows/s${name(l.den)}`;
  const widest = Math.max(...lines.map((l) => textWidth(text(l), 'cap')), textWidth('denormalized: ?', 'small'));
  // The upper point's label goes above it and the lower one's below, so the two never meet.
  const upper = lines.reduce((u, l) => (l.v > u.v ? l : u), lines[0]);
  const ys = lines.map((l) => Math.max(P.t + 4, rowsY(P, l.v) + (l === upper && lines.length > 1 ? -10 : lines.length > 1 ? 18 : -10)));
  // An open question's placeholder sits a fixed step above the normalized label, wherever the hidden point would be.
  const askY = showDen ? null : ys[0] - 16 >= P.t + 4 ? ys[0] - 16 : ys[0] + 16;
  const rules = [breakEven?.x, behind?.x].filter((x): x is number => x !== undefined);
  const yTicks = Array.from({ length: Y_MAX + 1 }, (_, v) => textBox(String(v), 'small', P.l - 8, rowsY(P, v) + 4, 'end'));
  const side = (left: boolean) => {
    const x = left ? Math.max(cx - 10, P.l + 2 + widest) : cx + 10;
    const anchor: Anchor = left ? 'end' : 'start';
    const boxes = [...ys, ...(askY === null ? [] : [askY])].map((y) => textBox('x'.repeat(Math.ceil(widest / 7)), 'cap', x, y, anchor));
    const fits = left ? x - widest >= P.l + 2 : x + widest <= (T.wide ? P.r - 4 : T.width - 12);
    const crossings = boxes.reduce(
      (n, b) => n + rules.filter((rx) => rx > b.x && rx < b.x + b.width).length + yTicks.filter((t) => overlaps(t, b)).length,
      0,
    );
    return { x, anchor, fits, crossings };
  };
  // Left of the cursor once it is far in; either way, the side that fits and crosses fewer rules and ticks.
  const [preferred, other] = labelsLeft(T, cx) ? [side(true), side(false)] : [side(false), side(true)];
  const chosen = !preferred.fits && other.fits ? other : other.fits && other.crossings < preferred.crossings ? other : preferred;
  const labels: PointLabel[] = lines.map((l, i) => ({
    x: chosen.x,
    y: ys[i],
    anchor: chosen.anchor,
    value: count(l.rows),
    name: `rows/s${name(l.den)}`,
    selected: l.den === den,
  }));
  const asking: PointLabel | null =
    askY === null ? null : { x: chosen.x, y: askY, anchor: chosen.anchor, value: '?', name: 'denormalized:', selected: false };
  for (const l of [...labels, ...(asking ? [asking] : [])])
    texts.push(textBox(`${l.value} ${l.name}`, l.selected ? 'cap' : 'small', l.x, l.y, l.anchor));
  texts.push(...yTicks);

  const ticks = Array.from({ length: X_DECADES[1] - X_DECADES[0] + 1 }, (_, i) => X_DECADES[0] + i).map((e) => {
    const named: Record<number, string> = { [-9]: '1 per 1B', [-6]: '1 per 1M', [-2]: '1 per 100' };
    return {
      x: decadeX(P, e),
      label: named[e] ?? '',
      anchor: (e === X_DECADES[0] ? 'start' : e === X_DECADES[1] ? 'end' : 'middle') as Anchor,
      major: e in named,
    };
  });
  for (const t of ticks) if (t.label) texts.push(textBox(t.label, 'small', t.x, P.b + 18, t.anchor));
  const direction = T.wide ? 'renames per post shown · write-heavy →' : 'write-heavy →';
  texts.push(textBox('← read-heavy', 'small', P.l, P.b + 34));
  texts.push(textBox(direction, 'small', P.r, P.b + 34, 'end'));

  const lineNames = T.wide
    ? [
        { text: 'Normalized', y: rowsY(P, norm(xMax)) + 4 },
        ...(showDen
          ? [
              {
                text: denLine.out !== null ? '▲ Denormalized' : 'Denormalized',
                y: denLine.out !== null ? P.t + 4 : rowsY(P, copy(xMax)) + 4,
              },
            ]
          : []),
      ]
    : [];
  if (lineNames.length === 2 && Math.abs(lineNames[0].y - lineNames[1].y) < 14)
    lineNames[1].y = lineNames[0].y + (lineNames[1].y >= lineNames[0].y ? 14 : -14);
  for (const l of lineNames) texts.push(textBox(l.text, 'small', P.r + 8, l.y));

  const legend = {
    reads: den ? 'reads: 1 row a post' : T.wide ? 'reads: 2 rows a post (post + author)' : 'reads: 2 rows a post',
    writes: 'writes: renames shared out',
    breakEven: showDen
      ? {
          parts: [
            { text: 'break-even: 1 rename per ' },
            { text: T.wide ? count(A) : compact(A), num: true },
            { text: T.wide ? ' posts shown, Ada’s post count' : ' posts' },
          ],
        }
      : null,
    behind: behind ? { limit: rate(FEED_FANOUT_ROWS_PER_S / A) } : null,
  };
  const keys = legendKeys(T, den);
  texts.push(textBox(legend.reads, 'small', keys.reads.x + 17, keys.reads.y));
  texts.push(textBox(legend.writes, 'small', keys.writes.x + 17, keys.writes.y));
  if (keys.lines) {
    texts.push(textBox('normalized', 'small', keys.lines.x + 21, keys.lines.y));
    texts.push(textBox('denormalized', 'small', keys.lines.x + LINE_KEY_GAP + 21, keys.lines.y));
  }
  if (legend.breakEven)
    texts.push(textBox(legend.breakEven.parts.map((q) => q.text).join(''), 'small', keys.breakEven.x + 10, keys.breakEven.y));
  if (legend.behind)
    behindLines(T.wide, legend.behind.limit).forEach((line, i) =>
      texts.push(textBox(line, 'small', keys.behind.x + 17, keys.behind.y + i * 16)),
    );

  return {
    normalized,
    denormalized: showDen ? denLine.d : null,
    topArrow: showDen ? denLine.out : null,
    reads: { y: rowsY(P, floor) },
    writes,
    behind,
    breakEven,
    cursor: { x: cx, clamped },
    points,
    labels,
    asking,
    ticks,
    lineNames,
    legend,
    texts,
  };
}

/** Point labels sit left of the cursor once it is this far in: 190px wide, 110px narrow, at most half the plot. */
export const labelsLeft = (T: TrafficLayout, cx: number) => cx - T.plot.l > Math.min(T.wide ? 190 : 110, (T.plot.r - T.plot.l) / 2);

/** What the chart's y axis counts, under its title. */
export const trafficSubtitle = (wide: boolean) =>
  wide
    ? ['reads, plus each rename’s writes shared over the posts shown']
    : ['reads, plus each rename’s writes', 'shared over the posts shown,', 'against renames per post shown'];

/** The falling-behind key: one line wide, two narrow. */
export const behindLines = (wide: boolean, limit: string) => {
  const unit = limit === '1' ? 'rename/s' : 'renames/s';
  return wide ? [`copy rewrite falls behind above ${limit} ${unit}`] : ['copy rewrite falls behind', `above ${limit} ${unit}`];
};

/** Between the normalized and denormalized line keys on a narrow legend. */
export const LINE_KEY_GAP = 104;

/** Where each legend row's key starts: wide, reads and writes share a row; narrow, the line keys take a row of their own. */
export function legendKeys(T: TrafficLayout, den: boolean) {
  const y = T.legendYs;
  if (T.wide)
    return {
      reads: { x: T.plot.l, y: y[0] },
      writes: { x: T.plot.l + (den ? 130 : 220), y: y[0] },
      lines: null,
      breakEven: { x: T.plot.l, y: y[1] },
      behind: { x: T.plot.l, y: y[2] },
    };
  return {
    reads: { x: PAD, y: y[0] },
    writes: { x: PAD, y: y[1] },
    lines: { x: PAD, y: y[2] },
    breakEven: { x: PAD, y: y[3] },
    behind: { x: PAD, y: y[4] },
  };
}

/** The chart as rows, for its table: each decade of renames per post shown and the current traffic, which is marked. */
export function trafficTable(s: FeedSettings, wide: boolean): { head: string[]; rows: string[][]; active: number } {
  const { pageSize: p, postsPerAuthor: A, pagesPerSecond: pps, renamesPerSecond: rps } = s;
  const now = rps / (pps * p);
  const per = (r: number) => `1 per ${compact(1 / r)}`;
  const row = (r: number) => [per(r), feedRowsPerPost(false, r, A).toFixed(2), feedRowsPerPost(true, r, A).toFixed(2)];
  const decadesList = Array.from({ length: X_DECADES[1] - X_DECADES[0] + 1 }, (_, i) => 10 ** (X_DECADES[0] + i));
  const all = [...decadesList.filter((r) => Math.abs(Math.log10(r / now)) > 1e-9), now].sort((a, b) => a - b);
  const head = wide ? ['Renames a post', 'Normalized', 'Denormalized'] : ['Renames per post', 'Normalized', 'Denorm.'];
  return { head, rows: all.map(row), active: all.indexOf(now) };
}

/** The chart as the region a reveal points at: the whole plot with its ticks, its tag on the top edge at the left. */
export function trafficFocus(T: TrafficLayout): Focus[] {
  // The frame takes in the legend too: the reveals quote its break-even and its limit.
  const box = { x: 8, y: T.plot.t - 18, width: T.width - 16, height: T.legendYs.at(-1)! + 6 - (T.plot.t - 18) };
  return [{ id: 'balance', ...box, tag: { x: box.x + 12, y: box.y - 8 } }];
}
