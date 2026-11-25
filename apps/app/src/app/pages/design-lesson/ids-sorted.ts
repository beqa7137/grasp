import { ID_ROW_SLOTS, ID_WINDOW_US, formatIdMs, formatInt, idRows, tsShort, type IdRow } from '@grasp/engine';
import { sampleLine } from './latency-draw';
import { IDS_TEXT, hiddenBox, label, line, r1, rect, small, text, type Ctx } from './ids-draw';
import { visible } from './ids-words';

const ROW = 16;
const WIDEST_ID = '9,223,372,036,854,775,807';
const WIDEST_KEY = ['…000 · 0 · 0–65,535', '…000·0·0–65,535'];
export const LEGEND = 'A hollow amber dot sorts before an id made earlier, in an earlier tick: out of time order.';

/** The row's fields as the gutter names them: the timestamp's last digits, the generator number, the sequence. */
export const rowKey = (row: IdRow, tight = false) =>
  [tsShort(row.x), row.x.number, row.group ? `${formatInt(row.group.seqFrom)}–${formatInt(row.group.seqTo)}` : formatInt(row.x.seq)].join(
    tight ? '·' : ' · ',
  );
/** Below this width the fields drop their spaces, so the plot keeps room. */
const tightOf = (W: number) => W < 420;

/** The list shows decimal ids from this width; below it, only the fields. */
const idColumn = (W: number, PAD: number) => {
  const idW = IDS_TEXT.tw(WIDEST_ID, 'mono') + 12;
  const keyW = IDS_TEXT.tw(WIDEST_KEY[tightOf(W) ? 1 : 0], 'mono') + 12;
  return W - 2 * PAD - idW - keyW >= 200 ? { idW, keyW } : { idW: 0, keyW };
};

/**
 * Band D, "Sorted by id": every id in id order in 21 fixed slots, each with its fields, and in the plot a dot at the
 * moment it was made, joined in row order, over the true ticks. A row steps back inside a tick; an id out of time order
 * across ticks is hollow amber, and a repeat says so right below its twin.
 */
export function sortedBand(c: Ctx, y0: number): number {
  const { D, W, PAD, s, m, hid, view } = c;
  const full = W - 2 * PAD;
  line(c, 'grid', 'd-rule', 'rule', 0, y0, W, y0);
  const head = text(c, 'd-title', PAD, y0 + 28, label('Sorted by id'), { owner: 'd-head' });
  const gloss = 'the order an index keeps them in';
  if (head.x1 + 10 + IDS_TEXT.tw(gloss, 'small') <= W - PAD) text(c, 'd-gloss', head.x1 + 10, y0 + 28, small(gloss), { owner: 'd-head' });
  const { idW, keyW } = idColumn(W, PAD);
  if (idW) text(c, 'd-col-id', PAD, y0 + 48, small('id'), { owner: 'd-cols' });
  text(c, 'd-col-key', PAD + idW, y0 + 48, small(tightOf(W) ? 'timestamp·G·seq' : 'timestamp · G · seq'), { owner: 'd-cols' });
  const top = y0 + 56;
  const x0 = PAD + idW + keyW;
  const w = W - PAD - x0;
  const X = (us: number) => x0 + (Math.min(us, ID_WINDOW_US) / ID_WINDOW_US) * w;
  const rowsH = ID_ROW_SLOTS * ROW;
  const legendRes = IDS_TEXT.wrap(LEGEND, 'small', full).length;
  const bandH = rowsH + 30 + legendRes * 14 + 6;
  D.region('sorted', { x: PAD - 2, y: y0 + 12, w: full + 4, h: bandH + 44 });
  if (hid.order) {
    hiddenBox(c, 'order-hidden', PAD, top, full, bandH, [
      'The order of the ids is hidden until you answer',
      'Hidden until you answer',
      'Hidden',
    ]);
    return top + bandH + 8;
  }
  const tickUs = s.tick * 1000;
  for (let k = 0; k * tickUs < ID_WINDOW_US; k++)
    if (k % 2 === 0) rect(c, 'back', `d-band-${k}`, 'tick-band', X(k * tickUs), top, X((k + 1) * tickUs) - X(k * tickUs), rowsH);
  const rows = idRows(m).filter((r) => visible(m, r.x, hid));
  const late = new Set(m.lateByTick.map((x) => x.key));
  const pts: [number, number][] = [];
  rows.forEach((row, i) => {
    if (c.view.t !== null && row.made > c.view.t) return;
    const ry = top + i * ROW;
    const cy = ry + ROW / 2;
    if (idW) text(c, `row-id-${row.key}`, PAD, ry + 12, [[formatInt(row.x.id), 'mono', 'ink']], { owner: 'rows' });
    text(
      c,
      `row-key-${row.key}`,
      PAD + idW,
      ry + 12,
      [[rowKey(row, tightOf(W)), 'mono', !hid.repeats && row.x.repeatOf ? 'bad' : 'muted']],
      { owner: 'rows' },
    );
    const x = X(row.made);
    pts.push([x, cy]);
    const repeat = !hid.repeats && !!row.x.repeatOf;
    const cls = `rdot${late.has(row.x.key) ? ' late' : ''}${repeat ? ' repeat' : ''}${c.shown?.key === row.x.key ? ' inspected' : ''}`;
    D.add('dots', `rdot-${row.key}`, { k: 'circle', cls, cx: r1(x), cy, r: 3.5 });
    D.mark({ x0: x - 3.5, x1: x + 3.5, y0: cy - 3.5, y1: cy + 3.5 }, `rdot-${row.key}`);
    if (view.pair?.includes(row.x.key)) D.add('dots', `pair-ring-row-${row.key}`, { k: 'circle', cls: 'pair-ring', cx: r1(x), cy, r: 7 });
  });
  for (let i = 1; i < pts.length; i++)
    D.add('links', `order-${i}`, {
      k: 'line',
      cls: 'order-line',
      x1: r1(pts[i - 1][0]),
      y1: pts[i - 1][1],
      x2: r1(pts[i][0]),
      y2: pts[i][1],
    });
  D.link(
    pts.slice(1).flatMap((p, i) => sampleLine(pts[i][0], pts[i][1], p[0], p[1], 2)),
    'order',
  );
  // Notes go in the plot beside their row, after every dot and line is known, so none lands on one.
  rows.forEach((row, i) => {
    if (c.view.t !== null && row.made > c.view.t) return;
    const ry = top + i * ROW + 12;
    const x = X(row.made);
    const note = !hid.repeats && row.x.repeatOf ? ['same id as the row above', 'same as above'] : null;
    const pairNote =
      view.pair && row.x.key === view.pair[0]
        ? [
            `made ${formatIdMs(row.x.issued - (m.ids.find((y) => y.key === view.pair![1])?.issued ?? row.x.issued))} later, sorts first`,
            'sorts first',
          ]
        : null;
    for (const forms of [note, pairNote]) {
      if (!forms) continue;
      const cands = forms.flatMap((f) => [
        [x + 10, ry, 'start', f] as const,
        [x - 10, ry, 'end', f] as const,
        ...Array.from({ length: Math.floor(w / 12) }, (_, k) => [x0 + 2 + k * 12, ry, 'start', f] as const),
      ]);
      const hit = cands.find(([cx, cy, a, f]) => {
        const tw = IDS_TEXT.tw(f, 'small');
        const bx = a === 'start' ? cx : cx - tw;
        return bx >= x0 && bx + tw <= W - PAD && D.free({ x0: bx, x1: bx + tw, y0: cy - 8, y1: cy + 2.5 }, '', 1);
      });
      if (hit)
        text(c, `row-note-${row.key}`, hit[0], hit[1], small(hit[3], note === forms ? 'bad' : 'ink'), { anchor: hit[2], owner: 'notes' });
      else if (forms !== note) D.missing.push(forms[0]);
    }
  });
  if (hid.burstAfter && rows.length < ID_ROW_SLOTS)
    hiddenBox(c, 'rows-hidden', x0 - keyW - idW, top + rows.length * ROW + 2, full, (ID_ROW_SLOTS - rows.length) * ROW - 2, [
      "G0's later ids are hidden until you answer",
      'Hidden until you answer',
      'Hidden',
    ]);
  const ay = top + rowsH + 4;
  line(c, 'grid', 'd-axis', 'axis', x0, ay, x0 + w, ay);
  for (let ms = 0; ms <= 8; ms += w < 150 ? 4 : 2)
    text(c, `d-axis-${ms}`, X(ms * 1000), ay + 15, small(ms === 8 ? '8 ms' : String(ms)), {
      anchor: ms === 8 ? 'end' : 'middle',
      owner: 'd-axis',
    });
  if (m.lateByTick.length)
    IDS_TEXT.wrap(LEGEND, 'small', full - 14).forEach((t, i) => {
      if (i === 0) D.add('dots', 'legend-dot', { k: 'circle', cls: 'rdot late', cx: PAD + 4, cy: ay + 30, r: 3.5 });
      text(c, `d-legend-${i}`, PAD + 14, ay + 34 + i * 14, small(t), { owner: 'legend' });
    });
  return top + bandH + 8;
}
