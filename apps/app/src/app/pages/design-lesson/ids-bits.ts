import { formatDate, formatInt, idBits, leakLine, type IdField, type MintedId } from '@grasp/engine';
import { FIELD_CLASS, IDS_TEXT, chainLines, fits, hiddenBox, hit, label, r1, rect, small, text, type Ctx, type Part } from './ids-draw';
import { CONVERSION_LONGEST, MADE_BY_LONGEST, conversion, madeBy } from './ids-words';

const CELL_H = 18;
const ROW_BLOCK = CELL_H + 26;
const LINE = 15;
/** A leak line as long as any id can print: the time and the date are fixed widths. */
const LEAK_LONGEST =
  'Anyone holding this id can read when it was made (12:00:00.000 UTC on 24 September 2026, to the tick) and which generator made it (number 2).';
const NAMES: Record<IdField, readonly string[]> = {
  sign: ['sign', ''],
  time: ['timestamp', 'time', ''],
  gen: ['generator', 'gen', ''],
  seq: ['sequence', 'seq', ''],
};

/** Cells a row: 32 while a cell keeps 15 px, else 16, so every phone shows four rows. */
export const cellsPerRow = (full: number) => (Math.floor((full - 31 - 12) / 32) >= 15 ? 32 : 16);

/** The inspected id's field values, as the brackets name them. */
const valueOf = (x: MintedId, f: IdField) => (f === 'sign' ? 0 : f === 'time' ? x.ts : f === 'gen' ? x.number : x.seq);

/**
 * Band A, "One id, 64 bits": who made the id, its 64 bits as cells coloured by field with each field's bracket and
 * value, the clock's reading converted into the timestamp, the id as a number, and what anyone holding it can read.
 * Every block reserves the most lines it takes at this width, so no id moves the band.
 */
export function bitsBand(c: Ctx, y0: number): number {
  const { D, W, PAD, s, hid, shown } = c;
  const full = W - 2 * PAD;
  const L = c.m.layout;
  text(c, 'a-title', PAD, y0 + 27, label(W >= 360 ? 'One id, 64 bits' : 'One id'), { owner: 'a-head' });
  const wide = W >= 420;
  const nw = wide ? 92 : 44;
  hit(c, { kind: 'nav', x: W - PAD - nw, y: y0 + 4, w: nw, h: 44, owner: 'nav-newer', dir: 'newer', short: !wide });
  hit(c, { kind: 'nav', x: W - PAD - 2 * nw - 8, y: y0 + 4, w: nw, h: 44, owner: 'nav-older', dir: 'older', short: !wide });
  let y = y0 + 54;
  const madeRes = IDS_TEXT.wrap(MADE_BY_LONGEST, 'small', full).length;
  const made = !L.fits ? [] : shown ? IDS_TEXT.wrap(madeBy(s, shown), 'small', full) : ['No id made yet.'];
  made.forEach((t, i) => text(c, `made-${i}`, PAD, y + 11 + i * LINE, small(t, 'ink'), { owner: 'made' }));
  y += madeRes * LINE + 6;

  const per = cellsPerRow(full);
  const rows = 64 / per;
  const cw = Math.floor((full - (per - 1) - 12) / per);
  const bits = shown ? idBits(L, shown.id) : idBits(L, 0n);
  const key = shown?.key ?? 'none';
  const cellsTop = y;
  const labels: { field: IdField; x0: number; x1: number; y: number }[] = [];
  for (let r = 0; r < rows; r++) {
    const ry = y + r * ROW_BLOCK;
    let x = PAD;
    let spanStart = x;
    for (let k = 0; k < per; k++) {
      const b = bits[r * per + k];
      const prev = k ? bits[r * per + k - 1] : null;
      if (prev) x += 1 + (prev.field !== b.field ? 4 : 0);
      if (prev && prev.field !== b.field) {
        labels.push({ field: prev.field, x0: spanStart, x1: x - 5, y: ry });
        spanStart = x;
      }
      const cls = `cell ${FIELD_CLASS[b.field]} ${shown ? (b.bit ? 'one' : 'zero') : 'empty'}`;
      rect(c, 'marks', `cell-${key}-${b.index}`, cls, x, ry, cw, CELL_H, 2);
      if (shown)
        D.add('text', `cd-${key}-${b.index}`, {
          k: 'text',
          cls: '',
          x: r1(x + cw / 2),
          y: r1(ry + 13),
          anchor: 'middle',
          spans: [{ t: String(b.bit), cls: `t-mono cd ${FIELD_CLASS[b.field]} ${b.bit ? 'one' : 'zero'}` }],
        });
      x += cw;
    }
    labels.push({ field: bits[r * per + per - 1].field, x0: spanStart, x1: x, y: ry });
    D.mark({ x0: PAD, x1: x, y0: ry, y1: ry + CELL_H }, 'cells');
  }
  // Each field's bracket under each of its spans, its name and value under the longest, while it keeps 6 px from the
  // name before it on its row; a field with no room is named by the ledger below.
  const longest = new Map<IdField, (typeof labels)[number]>();
  for (const l of labels) if ((longest.get(l.field)?.x1 ?? 0) - (longest.get(l.field)?.x0 ?? 0) < l.x1 - l.x0) longest.set(l.field, l);
  const lastX1 = new Map<number, number>();
  labels.forEach((l, i) => {
    const by = l.y + CELL_H + 4;
    c.D.add('marks', `bracket-${i}`, {
      k: 'path',
      cls: `bracket ${FIELD_CLASS[l.field]}`,
      d: `M${r1(l.x0 + 0.5)} ${by - 3}v3h${r1(l.x1 - l.x0 - 1)}v-3`,
    });
    D.mark({ x0: l.x0, x1: l.x1, y0: by - 3, y1: by + 1 }, 'cells');
    if (longest.get(l.field) !== l || !shown) return;
    const value = hid.inspect ? '' : formatInt(valueOf(shown, l.field));
    const forms = NAMES[l.field].map((n) => [n, value].filter(Boolean).join(' ')).filter(Boolean);
    const cx = (l.x0 + l.x1) / 2;
    const room = Math.max(l.x1 - l.x0, 0) + 8;
    const t = forms.find((f) => {
      const w = IDS_TEXT.tw(f, 'smallB');
      return w <= room && cx - w / 2 >= (lastX1.get(l.y) ?? -Infinity) + 6 && cx - w / 2 >= PAD - 2 && cx + w / 2 <= W - PAD + 2;
    });
    if (!t) return;
    const box = text(c, `fname-${l.field}`, cx, by + 12, [[t, 'smallB', `fi ${FIELD_CLASS[l.field]}`]], {
      anchor: 'middle',
      owner: 'cells',
    });
    lastX1.set(l.y, box.x1);
  });
  if (!L.fits) {
    const msg = `No id: the clock is past the timestamp's end, ${formatDate(L.endMs) ?? 'long ago'}. A generator must refuse to mint.`;
    rect(c, 'top', 'overflow-ground', 'overflow-ground', PAD, cellsTop, full, rows * ROW_BLOCK - 8, 4);
    IDS_TEXT.wrap(msg, 'cap', full - 24).forEach((t, i) =>
      text(c, `overflow-${i}`, PAD + 12, cellsTop + 22 + i * 18, [[t, 'cap', 'bad']], { owner: 'cells overflow' }),
    );
  }
  y += rows * ROW_BLOCK + 2;

  const chainRes = chainLines(CONVERSION_LONGEST, 'small', full).length;
  const leakRes = IDS_TEXT.wrap(LEAK_LONGEST, 'small', full).length;
  const lowerH = chainRes * LINE + 6 + 22 + 16 + leakRes * LINE + 6;
  if (shown && hid.inspect)
    hiddenBox(c, 'inspect-hidden', PAD, y, full, lowerH, [
      "This id's digits and what they tell are hidden until you answer",
      'Hidden until you answer',
      'Hidden',
    ]);
  else if (shown) {
    chainLines(conversion(s, shown), 'small', full).forEach((t, i) =>
      text(c, `conv-${i}`, PAD, y + 11 + i * LINE, [[t, 'small', 'fi f-time']], { owner: 'conv' }),
    );
    const iy = y + chainRes * LINE + 6 + 15;
    const id: Part[] = [
      ['id ', 'nameS', 'muted'],
      [formatInt(shown.id), 'nameS', 'ink'],
    ];
    const box = text(c, 'id-value', PAD, iy, id, { owner: 'id' });
    if (shown.repeatOf && !hid.repeats) {
      const note = 'made twice: an earlier id has the same 64 bits';
      const beside = fits('small', W - PAD - box.x1 - 12)(note);
      text(c, 'id-twice', beside ? box.x1 + 12 : PAD, beside ? iy : iy + 16, small(note, 'bad'), { owner: 'twice' });
    }
    IDS_TEXT.wrap(leakLine(L, shown), 'small', full).forEach((t, i) =>
      text(c, `leak-${i}`, PAD, iy + 16 + 15 + i * LINE, small(t), { owner: 'leak' }),
    );
  }
  return y + lowerH + 6;
}
