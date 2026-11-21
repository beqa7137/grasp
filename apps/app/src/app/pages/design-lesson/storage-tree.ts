import { STORAGE_PAGE_KB, formatAmp, formatB, formatCount, formatKb, formatPages, formatReads, formatSize } from '@grasp/engine';
import { sampleLine } from './latency-draw';
import {
  PANEL,
  circle,
  fitsIn,
  label,
  line,
  panelHead,
  partsFit,
  pickLast,
  rect,
  segments,
  small,
  stepper,
  text,
  write,
  type Ctx,
} from './storage-draw';
import { departures } from './storage-motion';
import { tw, type Part } from './storage-text';
import { DOES, plural } from './storage-words';

const BW = 16;
const BH = 12;
const BG = 5;
/** Pages drawn a row, root first, at most; and which page of each row the walk takes. */
const WANT = [1, 3, 5, 7, 7];
const PATH = [0, 1, 3, 1, 3];

/**
 * The B-tree's panel: its head and page size, the tree (a row a level, the levels above the leaves in the memory band,
 * the leaves under it on disk) with the walk through it, then the leaf page to scale with what the operation changed or
 * read, the log record or the walk, and the ledger that turns them into the cost. `extra` stretches the tree's band, so
 * side by side both panels end level.
 */
export function btreePanel(c: Ctx, x: number, y: number, pw: number, extra: number): number {
  const { D, m, hid, view } = c;
  const s = m.settings;
  const b = m.btree;
  const w = write(m);
  const { P, on } = stepper(c, 'btree');
  const leave = departures('btree', m);
  const h = b.height;
  panelHead(c, x, y, pw, 'btree', DOES.btree);
  let cy = y + PANEL.head + 6;
  segments(c, x, cy, pw, 'page', STORAGE_PAGE_KB, s.page, formatKb, 'Page size');
  cy += PANEL.knob + 10;

  const treeTop = cy;
  const memory = formatSize(b.memoryBytes);
  const hops = b.memoryHops;
  const labelA = pickLast(
    [
      `Cached in memory · ${hops} levels, ${memory} · ${b.fanout} children a page`,
      `Cached in memory · ${hops} levels, ${memory}`,
      `In memory · ${hops} levels, ${memory}`,
      `In memory · ${memory}`,
    ],
    fitsIn('label', pw),
  );
  text(c, 'bt-mem-caption', x, cy + 11, label(labelA), { owner: 'bt-label' });
  const bandY = cy + 18;
  const UB = PANEL.tree - 18 - 10 - 16 - 4 - 14 + extra;
  rect(c, 'back', 'bt-band', 'band', x, bandY, pw, UB, 8);
  const countW = Math.max(...b.pages.slice(0, -1).map((n) => tw(formatPages(n), 'small')));
  const zone = (x0: number, x1: number) => ({ cx: (x0 + x1) / 2, max: Math.max(2, Math.floor((x1 - x0 - 14) / (BW + BG))) });
  const upper = zone(x + 8, x + pw - countW - 14);
  const leafZone = zone(x + 2, x + pw - Math.max(tw('written back', 'small'), tw(formatReads(1), 'small'), tw('read first', 'small')) - 8);
  const leafY = bandY + UB + 10 + 8;
  const rows = b.pages.map((n, k) => {
    const leaf = k === h - 1;
    const z = leaf ? leafZone : upper;
    const drawn = Math.min(n, Math.min(leaf ? 7 : WANT[k], z.max));
    const more = n > drawn;
    const total = drawn * BW + (drawn - 1) * BG + (more ? 14 : 0);
    const x0 = z.cx - total / 2;
    return {
      n,
      leaf,
      drawn,
      more,
      x0,
      total,
      cy: leaf ? leafY : bandY + ((k + 0.5) * UB) / (h - 1),
      idx: Math.min(drawn - 1, PATH[k]),
      cx: (i: number) => x0 + i * (BW + BG) + BW / 2,
    };
  });
  // The caption carries no verb, and sits under the leaves because the fan lines into the leaf row would cross it.
  const labelB = pickLast(
    [`On disk · ${formatCount(b.leaves)} leaf pages`, `On disk · ${formatCount(b.leaves)} leaves`],
    fitsIn('label', pw),
  );
  text(c, 'bt-leaf-caption', x, leafY + 12 + 11, label(labelB), { owner: 'bt-label' });
  const pageWritten = w && on('page') && !hid.btMarks;
  rows.forEach((r, k) => {
    if (k < h - 1) {
      const next = rows[k + 1];
      const px = r.cx(r.idx);
      for (let i = 0; i < next.drawn; i++) {
        const walked = i === next.idx && on(`walk${k + 1}`);
        const [x1, y1, x2, y2] = [px, r.cy + BH / 2, next.cx(i), next.cy - BH / 2];
        line(c, 'links', `fan-${k}-${i}`, walked ? 'walk' : 'fan', x1, y1, x2, y2, 'bt-tree');
        D.link(sampleLine(x1, y1, x2, y2), 'bt-tree');
      }
      if (view.play?.engine === 'btree')
        c.meta.keys.push({
          from: leave[`walk${k + 1}`],
          to: P[`walk${k + 1}`],
          x1: px,
          y1: r.cy + BH / 2,
          x2: next.cx(next.idx),
          y2: next.cy - BH / 2,
        });
    }
    const reached = on(`walk${k}`);
    for (let i = 0; i < r.drawn; i++) {
      let cls = 'pg';
      if (i === r.idx && reached) {
        cls = 'pg mem-hit';
        // A write reads its leaf from disk first (the read tone), then writes the page back (amber).
        if (r.leaf && !w) cls = 'pg disk-read';
        if (r.leaf && w && !hid.btMarks) cls = pageWritten ? 'pg written' : 'pg disk-read';
      }
      rect(c, 'marks', `pg-${k}-${i}`, cls, r.cx(i) - BW / 2, r.cy - BH / 2, BW, BH, 2.5, 'bt-tree');
    }
    D.mark({ x0: r.x0 - 2, x1: r.x0 + r.total + 2, y0: r.cy - BH / 2 - 2, y1: r.cy + BH / 2 + 2 }, 'bt-tree');
    if (r.more)
      for (let i = 0; i < 3; i++) circle(c, 'marks', `more-${k}-${i}`, 'more', r.x0 + r.drawn * (BW + BG) + 2 + i * 4.5, r.cy, 1.25);
    if (!r.leaf) text(c, `count-${k}`, x + pw - 8, r.cy + 4, small(formatPages(r.n)), { anchor: 'end', cls: 'on-box', owner: 'bt-count' });
    // The fanout between two counts it multiplies (not under the root, which is partial).
    if (k >= 1 && k + 1 <= h - 2)
      text(c, `fanout-${k}`, x + pw - 8, (r.cy + rows[k + 1].cy) / 2 + 4, small(`×${b.fanout}`), {
        anchor: 'end',
        cls: 'on-box',
        owner: 'bt-count',
      });
  });
  if (on(`walk${h - 1}`) && !hid.btMarks) {
    const action: [string, string] | null = !w
      ? [formatReads(b.lookupReads), 'cur-ink']
      : pageWritten
        ? ['written back', 'amber-ink']
        : view.play?.engine === 'btree'
          ? ['read first', 'cur-ink']
          : null;
    if (action) text(c, 'bt-leaf-action', x + pw, leafY + 4, small(...action), { anchor: 'end', owner: 'bt-count' });
  }
  c.meta.btRows = rows.map((r) => ({ n: r.n, drawn: r.drawn, more: r.more }));
  D.region('bt-tree', { x: x - 6, y: treeTop - 4, w: pw + 12, h: PANEL.tree + extra + 6 });
  cy = treeTop + PANEL.tree + extra + 14;

  // The leaf page to scale: whole records only ("about 29 records" draws 29 slots of the record's width), then free room.
  const tY = cy;
  const nRec = Math.max(1, Math.round(b.recordsPerLeaf));
  const stripShown = on('strip');
  const labelT = pickLast(
    [
      `The leaf page · ${formatB(b.pageB)}, about ${nRec} records`,
      `Leaf page · ${formatB(b.pageB)}, about ${nRec} records`,
      `The leaf page · ${formatB(b.pageB)}`,
    ],
    fitsIn('label', pw),
  );
  const sy = tY + 18;
  const sh = 20;
  const recPx = (s.record / b.pageB) * pw;
  const fillEdge = x + Math.min(pw, nRec * recPx);
  const recW = Math.max(3, recPx);
  const recX = x + Math.floor((0.16 * pw) / recPx) * recPx;
  c.meta.freeEdge = null;
  if (stripShown) {
    text(c, 'bt-strip-caption', x, tY + 11, label(labelT), { owner: 'bt-strip' });
    const cls = w ? (hid.btMarks ? 'strip hidden' : pageWritten ? 'strip rewritten' : 'strip') : 'strip read';
    rect(c, 'marks', 'page-strip', cls, x + 0.75, sy, pw - 1.5, sh, 3, 'bt-strip');
    if (recPx >= 5 && !hid.btMarks) {
      let d = '';
      for (let i = 1; i < nRec; i++) d += `M${Math.round((x + i * recPx) * 10) / 10} ${sy + 4}v${sh - 8}`;
      c.D.add('marks', 'rec-ticks', { k: 'path', cls: 'rec-ticks', d });
    }
    if (!hid.btMarks && fillEdge < x + pw - 2) {
      line(c, 'marks', 'free-edge', 'free-edge', fillEdge, sy + 1.5, fillEdge, sy + sh - 1.5);
      c.meta.freeEdge = { x: Math.round(fillEdge * 10) / 10, x0: x, recPx };
    }
    if (!hid.btMarks && x + pw - fillEdge >= tw('free', 'small') + 12)
      text(c, 'free-word', (fillEdge + x + pw) / 2, sy + 14, small('free'), { anchor: 'middle', cls: 'on-chip', owner: 'bt-strip' });
    D.mark({ x0: x, x1: x + pw, y0: sy, y1: sy + sh }, 'bt-strip');
    // Inside the strip's stroke: new bytes amber, a changed record not yet written ink, a found record green.
    if (on('slice')) {
      const sx0 = Math.max(recX, x + 1.5);
      const kind = w ? (pageWritten ? 'new' : 'changed') : 'found';
      rect(c, 'marks', 'record-slice', `slice ${kind}`, sx0, sy + 1.5, Math.min(recW, x + pw - 1.5 - sx0), sh - 3, 1, 'bt-strip');
    }
    // Under the strip: what changed, at its record; what was written again unchanged, at the page's right end.
    const noteY = sy + sh + 14;
    const leftForms = w ? [`${formatB(s.record)} changed`, formatB(s.record)] : [`the record, ${formatB(s.record)}`, formatB(s.record)];
    const rightForms = !w
      ? [`${formatB(b.pageB)} read from disk`, `${formatB(b.pageB)} read`]
      : !pageWritten
        ? []
        : hid.btNumbers
          ? ['? B rewritten unchanged', '? B written back', '? B written']
          : [
              `${formatB(b.pageB - s.record)} rewritten unchanged`,
              `${formatB(b.pageB)} written back whole`,
              `${formatB(b.pageB)} written back`,
              `${formatB(b.pageB)} written`,
            ];
    const fits = (lf: string, rf: string | null) => recX + tw(lf, 'small') + 10 <= x + pw - (rf ? tw(rf, 'small') : 0);
    const cands: [string, string | null][] = rightForms.length
      ? rightForms
          .flatMap((r, ri) => leftForms.map((l, li) => [l, r, ri + li] as const))
          .sort((a, b2) => a[2] - b2[2])
          .map(([l, r]) => [l, r])
      : leftForms.map((l) => [l, null]);
    const [lf, rf] = cands.find(([l, r]) => fits(l, r)) ?? cands[cands.length - 1];
    if (on('slice'))
      text(c, 'record-note', recX, noteY, small(lf, w ? (pageWritten ? 'amber-ink' : 'ink') : 'final-ink'), { owner: 'bt-note' });
    if (rf) text(c, 'page-note', x + pw, noteY, small(rf, w ? 'amber-ink' : 'cur-ink'), { anchor: 'end', owner: 'bt-note' });
  }
  // The log (a write), on the strip's own scale: the write is answered once its record is here. The pages walked (a lookup).
  const rowY = sy + sh + 22;
  if (w) {
    if (on('log') || hid.btMarks) {
      text(c, 'bt-log-caption', x, rowY + 11, label('Log'), { owner: 'bt-log' });
      const tx = x + tw('Log', 'label') + 8;
      const trackW = Math.max(recW + 30, Math.min(0.38 * pw, 110));
      const end = tx + trackW + 8;
      if (hid.btMarks) {
        rect(c, 'marks', 'log-hidden', 'hidden-box', tx, rowY + 3, trackW, 9, 2);
        const note = pickLast(['shows after your answer', 'after your answer'], (t) => end + tw(t, 'small') <= x + pw);
        text(c, 'log-note', end, rowY + 11, small(note), { owner: 'bt-log' });
      } else {
        rect(c, 'marks', 'logtrack', 'logtrack', tx, rowY + 3, trackW, 9, 2, 'bt-log');
        rect(c, 'marks', 'log-slice', 'slice logged', tx + trackW - recW, rowY + 3, recW, 9, 1, 'bt-log');
        const added = hid.btNumbers ? '+? B' : `+${formatB(b.logBytes)}`;
        const forms: Part[][] = [
          [
            [`${added} appended`, 'small', 'amber-ink'],
            [' · answered', 'small', 'final-ink'],
          ],
          [
            [added, 'small', 'amber-ink'],
            [' · answered', 'small', 'final-ink'],
          ],
          [[added, 'small', 'amber-ink']],
        ];
        text(c, 'log-note', end, rowY + 11, pickLast(forms, partsFit(x + pw - end)), { owner: 'bt-log' });
      }
      D.mark({ x0: tx, x1: tx + trackW, y0: rowY + 3, y1: rowY + 12 }, 'bt-log');
    }
  } else if (on('log')) {
    text(c, 'bt-walk-caption', x, rowY + 11, label('Walk'), { owner: 'bt-log' });
    const tx = x + tw('Walk', 'label') + 8;
    for (let k = 0; k < h; k++)
      rect(c, 'marks', `pwalk-${k}`, `pwalk${k === h - 1 ? ' disk' : ''}`, tx + k * 13, rowY + 3, 9, 9, 2, 'bt-log');
    D.mark({ x0: tx, x1: tx + h * 13, y0: rowY + 3, y1: rowY + 12 }, 'bt-log');
    const at = tx + h * 13 + 6;
    const walk = pickLast(
      [`${hops} in memory, ${b.lookupReads} from disk`, `${hops} cached, ${b.lookupReads} read`],
      (t) => at + tw(t, 'small') <= x + pw,
    );
    text(c, 'walk-note', at, rowY + 11, small(walk), { owner: 'bt-log' });
  }
  if (on('ledger')) {
    const l1 = w
      ? hid.btNumbers
        ? ['? B + ? B = ? B written']
        : [`${formatB(b.pageB)} + ${formatB(b.logBytes)} = ${formatB(b.writeBytes)} written`, `= ${formatB(b.writeBytes)} written`]
      : [`${h} pages walked − ${hops} in memory = ${b.lookupReads} read`, `${h} pages − ${hops} cached = ${b.lookupReads} read`];
    text(c, 'bt-ledger', x, tY + 89, [[pickLast(l1, fitsIn('mono', pw)), 'mono', 'ink']], { owner: 'bt-ledger' });
    const l2: Part[] = w
      ? [
          [hid.btNumbers ? '?×' : formatAmp(b.writeAmp), 'head', hid.btNumbers ? 'muted' : 'amber-ink'],
          [' the data', 'cap', 'ink', 5],
        ]
      : [
          [String(b.lookupReads), 'head', 'cur-ink'],
          [` disk ${plural(b.lookupReads, 'read', 'reads')}`, 'cap', 'ink', 5],
        ];
    text(c, 'bt-total', x, tY + 111, l2, { owner: 'bt-ledger' });
  }
  D.region('bt-transform', { x: x - 6, y: tY - 4, w: pw + 12, h: PANEL.transform + 6 });
  return tY + PANEL.transform;
}
