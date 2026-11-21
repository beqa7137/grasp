import {
  STORAGE_BLOOM_BITS,
  STORAGE_LEVEL_SCALE,
  STORAGE_RATIOS,
  formatAmp,
  formatLevels,
  formatSize,
  formatSlot,
  recordMerge,
} from '@grasp/engine';
import { r1 } from './latency-draw';
import { departures, stationsOf } from './storage-motion';
import {
  PANEL,
  circle,
  fitsIn,
  hit,
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
import { tw, wrapKept, type Part, type Role } from './storage-text';
import { DOES, chargedOnly, plural } from './storage-words';

/** One block read from a run, as wide at every level: a lookup reads a block, never the run. */
export const BLOCK_W = 6;

/** A level bar's width on the one log scale, 64 MB to 1,000 GB, shared by every setting. */
export const levelBarWidth = (bytes: number, bmin: number, bmax: number) =>
  bmin + (bmax - bmin) * (Math.log(bytes / STORAGE_LEVEL_SCALE.lo) / Math.log(STORAGE_LEVEL_SCALE.hi / STORAGE_LEVEL_SCALE.lo));

/**
 * The LSM tree's panel: its head, size ratio and Bloom filters; the memtable and the log in memory over the sorted runs
 * on disk, newest on top, with the record's trail down them (a write) or the lookup's way through them (a read, a
 * filter a run beside them when filters are on); then the staircase that says why a level costs what it costs, or what
 * the filters did, and the ledger.
 */
export function lsmPanel(c: Ctx, x: number, y: number, pw: number): number {
  const { D, m, hid, view } = c;
  const s = m.settings;
  const l = m.lsm;
  const w = write(m);
  const { P, on } = stepper(c, 'lsm');
  const L = l.levels;
  const kind = w ? 'w' : 'r';
  const avg = formatSlot({ value: l.rewritesPerLevel, unit: 'num' });
  panelHead(c, x, y, pw, 'lsm', DOES.lsm);
  let cy = y + PANEL.head + 6;
  segments(c, x, cy, pw, 'ratio', STORAGE_RATIOS, s.ratio, String, 'Size ratio');
  cy += PANEL.knob;
  hit(c, {
    kind: 'toggle',
    x,
    y: cy + 6,
    w: pw,
    h: 44,
    owner: 'bloom',
    checked: !!s.bloom,
    label: 'Bloom filters',
    sub: s.bloom ? `${formatSize(l.bloomBytes)} of memory` : 'off: no filter memory',
  });
  cy += PANEL.toggle + PANEL.toggleGap;

  const top = cy;
  const long = pw >= 270;
  const trailX0 = 30;
  const chipW =
    Math.max(
      tw('skipped', 'small'),
      tw(long ? '≈10.5× model' : '≈10.5×', 'mono'),
      tw(long ? '1 read, found' : '1 read', 'small'),
      tw('found', 'small'),
    ) + 2;
  const memW = w ? Math.max(Math.round((pw - chipW - 8) * 0.5), trailX0 + 12 + tw('memtable', 'small') + 8) : pw - chipW - 8;
  const logX = x + memW + 8;
  const logW = pw - chipW - 8 - memW - 8;
  const filters = !w && !!s.bloom;
  const headA = filters
    ? pickLast(['In memory · the memtable and a filter a run', 'In memory · memtable and filters', 'In memory'], fitsIn('label', pw))
    : 'In memory';
  text(c, 'lsm-mem-caption', x, cy + 11, label(headA), { owner: 'lsm-label' });
  if (w) {
    const headW = tw('written', 'small') + 8;
    const logHead = pickLast(['On disk · the log', 'The log, on disk', 'The log', 'Log'], (t) => logX + tw(t, 'label') <= x + pw - headW);
    text(c, 'lsm-log-caption', logX, cy + 11, label(logHead), { owner: 'lsm-label' });
    text(c, 'lsm-written-head', x + pw, cy + 11, small('written'), { anchor: 'end', owner: 'lsm-label' });
  }
  const memY = cy + 18;
  const memH = 26;
  const trailX = x + trailX0;
  rect(c, 'marks', 'memtable', 'run box', x + 0.5, memY, memW - 1, memH, 5, 'lsm-stack');
  const memForms: Part[][] = [
    `memtable · ${formatSize(l.memtableBytes)}, sorted`,
    `memtable · ${formatSize(l.memtableBytes)}`,
    'memtable',
  ].map((t) => [[t, 'small', 'ink']]);
  text(c, 'mem-text', trailX + 12, memY + 17, pickLast(memForms, partsFit(x + memW - 4 - trailX - 12)), {
    cls: 'on-box',
    owner: 'lsm-stack',
  });
  if (w) {
    rect(c, 'marks', 'lsm-logtrack', 'logtrack', logX, memY + 6, logW, 14, 3, 'lsm-stack');
    // Once the record is in the log and the memtable, the write is answered: said inside the log's track.
    if (on('mem')) text(c, 'lsm-answered', logX + 5, memY + 17, small('answered', 'final-ink'), { cls: 'on-box', owner: 'lsm-stack' });
    else {
      let d = '';
      for (let tx = logX + 6; tx < logX + logW - 8; tx += 6) d += `M${r1(tx)} ${memY + 9}v8`;
      D.add('marks', 'lsm-log-ticks', { k: 'path', cls: 'rec-ticks', d });
    }
  }
  D.mark({ x0: x, x1: x + pw - chipW - 8, y0: memY, y1: memY + memH }, 'lsm-stack');
  const chip = (yc: number, t: string, cls: string, role: Role, id: string) =>
    text(c, id, x + pw, yc + 4, [[t, role, cls]], { anchor: 'end', owner: 'lsm-chip' });
  if (w && on('log')) {
    rect(c, 'marks', 'lsm-log', 'slice logged', logX + logW - 5, memY + 6, 5, 14, 1, 'lsm-stack');
    chip(memY + memH / 2, hid.lsmNumbers ? '?×' : '1×', hid.lsmNumbers ? 'muted' : 'amber-ink', 'mono', 'chip-log');
  }
  if (on('mem')) {
    circle(c, 'dots', 'mem-mark', `ringm ${kind}`, trailX, memY + memH / 2, 4.5, 'lsm-stack');
    if (!w && !hid.readNumbers) chip(memY + memH / 2, 'not here', 'muted', 'small', 'chip-mem');
  }
  cy = memY + memH + 6;
  // The ratio claim starts at L1: L0, the flushed memtable, is not ratio times smaller than L1.
  const labelX = trailX + 14;
  const labelD = pickLast(
    [
      `On disk · from L1 down, each level ${s.ratio}× the one above, log scale`,
      `On disk · from L1 down, each level ${s.ratio}× the one above`,
      `On disk · L1 to L${L}, ${s.ratio}× apart`,
      'On disk · sorted runs',
      'On disk',
    ],
    (t) => labelX + tw(t, 'label') <= x + pw,
  );
  text(c, 'stack-caption', labelX, cy + 11, label(labelD), { owner: 'lsm-label' });
  cy += 16;
  const n = L + 1;
  const pitch = PANEL.rows / n;
  const barH = Math.min(12, pitch - 8);
  const sizes = [l.memtableBytes, ...l.levelBytes].map(formatSize);
  const sizeW = Math.max(...sizes.map((t) => tw(t, 'small')));
  // Bars start one ring radius right of the trail, so no dot or ring sits on a bar's outline.
  const bx = trailX + 11;
  const bmin = 16;
  const bmax = pw - (bx - x) - 6 - sizeW - 8 - chipW;
  if (filters) rect(c, 'back', 'filter-column', 'fcol', trailX - 9, memY + memH - 1, 18, cy + PANEL.rows - (memY + memH) - 1, 4);
  const rowsY: number[] = [];
  let reachedLast = -1;
  for (let j = 0; j < n; j++) if (on(`run${j}`)) reachedLast = j;
  c.meta.runs = [];
  for (let j = 0; j <= L; j++) {
    const yc = cy + (j + 0.5) * pitch;
    rowsY.push(yc);
    const bytes = j === 0 ? l.memtableBytes : l.levelBytes[j - 1];
    const bw = levelBarWidth(bytes, bmin, bmax);
    c.meta.runs.push({ bytes, w: r1(bw), bmin, bmax });
    const reached = on(`run${j}`);
    const readHere = !w && reached && (!s.bloom || j === L);
    text(c, `level-${j}`, x, yc + 4, [[`L${j}`, 'mono', 'muted']], { owner: 'lsm-stack' });
    // A bar's length and fill say only what its run holds; a read takes one block of it, the same at every level.
    rect(c, 'marks', `run-${j}`, 'run', bx, yc - barH / 2, bw, barH, 2.5, 'lsm-stack');
    if (readHere)
      rect(c, 'marks', `block-${j}`, 'block', bx + (bw - BLOCK_W) * 0.6, yc - barH / 2 - 1.5, BLOCK_W, barH + 3, 1, 'lsm-stack');
    D.mark({ x0: bx, x1: bx + bw, y0: yc - barH / 2, y1: yc + barH / 2 }, 'lsm-stack');
    const sizeForms = j === 0 ? [`${sizes[0]}, flushed`, sizes[0]] : j === L ? [`${sizes[j]}, the data`, sizes[j]] : [sizes[j]];
    const sizeText = pickLast(sizeForms, (t) => bx + bw + 6 + tw(t, 'small') <= x + pw - chipW - 6);
    text(c, `size-${j}`, bx + bw + 6, yc + 4, small(sizeText), { owner: 'lsm-size' });
    if (filters) rect(c, 'marks', `filter-${j}`, 'filt', trailX - 5, yc - 4, 10, 8, 2);
    if (!reached) continue;
    if (w) {
      // The record rests in the last level it has reached: a solid dot there, hollow rings where it passed.
      if (j < reachedLast) circle(c, 'dots', `pass-${j}`, 'ring-pass', trailX, yc, 4, 'lsm-stack');
      else {
        circle(c, 'dots', `rest-${j}`, 'dot w', trailX, yc, 4, 'lsm-stack');
      }
      D.mark({ x0: trailX - 4, x1: trailX + 4, y0: yc - 4, y1: yc + 4 }, 'lsm-stack');
      // A level the drawing shows too small for `ratio` merges carries the model's charge, named as the model's.
      const charge = chargedOnly(m, j);
      const t = hid.lsmNumbers ? '?×' : j === 0 ? '1×' : long ? `≈${avg}× ${charge ? 'model' : 'avg'}` : charge ? 'model' : `≈${avg}×`;
      chip(yc, t, hid.lsmNumbers ? 'muted' : 'amber-ink', 'mono', `chip-${j}`);
    } else {
      const last = j === L;
      if (s.bloom && !last) {
        // The filter, in memory, answers "not here": the mark lands on the filter, and the run is not opened.
        circle(c, 'dots', `skip-${j}`, 'skip', trailX, yc, 4.5, 'lsm-stack');
        line(c, 'dots', `slash-${j}`, 'skip-slash', trailX - 3, yc + 3, trailX + 3, yc - 3);
        if (!hid.readNumbers) chip(yc, 'skipped', 'muted', 'small', `chip-${j}`);
      } else {
        circle(c, 'dots', `read-${j}`, 'dot r', trailX, yc, 4, 'lsm-stack');
        D.mark({ x0: trailX - 4, x1: trailX + 4, y0: yc - 4, y1: yc + 4 }, 'lsm-stack');
        const found = last && on('found');
        if (!hid.readNumbers)
          chip(yc, found ? (long ? '1 read, found' : 'found') : '1 read', found ? 'final-ink' : 'cur-ink', 'small', `chip-${j}`);
      }
      if (last && on('found')) circle(c, 'dots', 'found-ring', 'found-ring', trailX, yc, 7.5, 'lsm-stack');
    }
  }
  // The trail: the record's way down, or the lookup's, as far as the clock has come.
  if (on('mem') && reachedLast >= 0)
    line(c, 'links', 'trail', `trail ${kind}`, trailX, memY + memH / 2 + 5, trailX, rowsY[reachedLast], 'lsm-stack');
  if (view.play?.engine === 'lsm') {
    const steps = stationsOf('lsm', m);
    const leave = departures('lsm', m);
    const ys = [memY + memH / 2, ...rowsY];
    for (let i = 0; i + 1 < steps.length; i++)
      c.meta.keys.push({ from: leave[steps[i + 1]], to: P[steps[i + 1]], x1: trailX, y1: ys[i], x2: trailX, y2: ys[i + 1] });
  }
  // The outline's foot falls in the reserved tag row, so its tag sits on the stroke clear of the last run's labels.
  D.region('lsm-stack', { x: x - 6, y: top - 4, w: pw + 12, h: PANEL.lsmTop + 16 + PANEL.rows + 14 });
  cy += PANEL.rows + 10 + PANEL.tagRow;

  const tY = cy;
  if (w) staircase(c, x, tY, pw, on, P['stair0'], P['stair1'], avg);
  else filterBlock(c, x, tY, pw, on);
  D.region('lsm-transform', { x: x - 6, y: tY - 4, w: pw + 12, h: PANEL.transform + 6 });
  // The stack and its transform as one region, for a reveal that points at both: two outlines would touch.
  D.region('lsm-all', { x: x - 6, y: top - 4, w: pw + 12, h: tY + PANEL.transform - top + 6 });
  return tY + PANEL.transform;
}

/** Why a level costs what it costs: `ratio` merges fill it, merge k writing k parts, the record outlined from its own. */
function staircase(c: Ctx, x: number, tY: number, pw: number, on: (k: string) => boolean, stair0: number, stair1: number, avg: string) {
  const { D, m, hid, view } = c;
  const l = m.lsm;
  const T = m.settings.ratio;
  const L = l.levels;
  // Nothing is drawn for an event before its moment: the level's heading waits for its first merge, as its rows do.
  const before = view.play?.engine === 'lsm' && view.play.frac < stair0 - 1e-9;
  if (!before)
    text(
      c,
      'stair-caption',
      x,
      tY + 11,
      label(pickLast([`L2 filling · ${T} merges from L1`, `L2 filling · ${T} merges`, 'L2 filling'], fitsIn('label', pw))),
      { owner: 'lsm-stair' },
    );
  const SW = 84;
  const SH = 62;
  const sy = tY + 18;
  const textX = x + SW + 12;
  const textW = pw - SW - 12;
  let lines: string[];
  let sayNow = true;
  if (hid.lsmMarks) {
    rect(c, 'marks', 'stair-hidden', 'hidden-box', x + 0.5, sy, SW - 1, SH, 3);
    lines = wrapKept("This level's merges draw after your answer.", 'small', textW);
  } else {
    const playing = view.play?.engine === 'lsm';
    const from = playing ? Math.max(0, Math.min(1, (view.play!.frac - stair0) / (stair1 - stair0))) : 1;
    const rowsShown = Math.ceil(T * from - 1e-9);
    // The sentence counts every row, so it waits until the last row is drawn.
    sayNow = !playing || view.play!.frac >= stair1 - 1e-9;
    const cw = SW / T;
    const rh = SH / T;
    const cells = cw >= 5 && rh >= 4;
    let soft = '';
    let fresh = '';
    for (let k = 1; k <= rowsShown; k++) {
      const ry = sy + (k - 1) * rh;
      if (k > 1) {
        if (cells)
          for (let i = 0; i < k - 1; i++)
            soft += `M${r1(x + i * cw + 0.75)} ${r1(ry + 0.75)}h${r1(cw - 2.5)}v${r1(rh - 2.5)}h${r1(-(cw - 2.5))}z`;
        else soft += `M${r1(x + 0.5)} ${r1(ry + 0.5)}h${r1((k - 1) * cw - 2)}v${r1(Math.max(0.5, rh - 2))}h${r1(-((k - 1) * cw - 2))}z`;
      }
      fresh += `M${r1(x + (k - 1) * cw)} ${r1(ry)}h${r1(cw - 1)}v${r1(rh - 1)}h${r1(-(cw - 1))}z`;
    }
    D.add('marks', 'stair', { k: 'path', cls: `rewritten${cells ? '' : ' thin'}`, d: soft });
    D.add('marks', 'stair-new', { k: 'path', cls: 'stair-new', d: fresh });
    // The record the play follows arrives with the middle merge and is written in every merge after it.
    const kr = recordMerge(T);
    const times = T - kr + 1;
    const outlined = `Outlined: the record, written ${times} times.`;
    // The outline and the sentence that names it are one unit: a form that drops the sentence drops the outline too, and
    // the restated count goes before the sentence does.
    const full = [
      `Merge k writes the k − 1 parts there and the new one: ${l.partsWritten} parts for ${T} new, about ${avg}× each. ${outlined}`,
      `Merge k writes k parts: the k − 1 already there and the new one. ${l.partsWritten} parts for ${T} new: about ${avg}× each. ${outlined}`,
      `Merge k writes k parts: ${l.partsWritten} for ${T} new, about ${avg}× each. ${outlined}`,
      `Merge k writes k parts, about ${avg}× each. ${outlined}`,
      `Merge k writes k parts: ${l.partsWritten} for ${T} new, about ${avg}× each.`,
    ];
    const quiet = [
      'Each merge from above rewrites what the level already holds; the outlined record is rewritten in each merge after it arrives.',
      'Each merge rewrites what the level holds; the outlined record, in each merge after it arrives.',
      'Each merge from above rewrites what the level already holds.',
      'Each merge rewrites the whole level.',
    ];
    lines = pickLast(
      (hid.lsmNumbers ? quiet : full).map((t) => wrapKept(t, 'small', textW)),
      (ls) => ls.length <= 4,
    );
    // One decision draws the outline and its sentence: the outline waits while the sentence does.
    if (sayNow && rowsShown >= kr && /outlined/i.test(lines.join(' ')))
      rect(
        c,
        'marks',
        'stair-mine',
        'mine',
        x + (kr - 1) * cw - 0.75,
        sy + (kr - 1) * rh - 0.75,
        cw + 0.5,
        (rowsShown - kr + 1) * rh + 0.5,
        1,
      );
  }
  D.mark({ x0: x, x1: x + SW, y0: sy, y1: sy + SH }, 'lsm-stair');
  if (sayNow)
    lines.forEach((t, i) => text(c, i ? `stair-text-${i}` : 'stair-text', textX, sy + 10 + i * 13, small(t), { owner: 'lsm-stair' }));
  if (on('ledger')) {
    const levels = formatLevels(L);
    const l1 = hid.lsmNumbers
      ? ['1 log + 1 flush + ? levels × ?']
      : [
          `1 log + 1 flush + ${levels} × ${avg} on average`,
          `1 log + 1 flush + ${levels} × ${avg} avg`,
          `1 log + 1 flush + ${levels} × ${avg}`,
          `1 + 1 + ${L} × ${avg}`,
        ];
    text(c, 'lsm-ledger', x, tY + 91, [[pickLast(l1, fitsIn('mono', pw)), 'mono', 'ink']], { owner: 'lsm-ledger' });
    text(
      c,
      'lsm-total',
      x,
      tY + 113,
      [
        [hid.lsmNumbers ? '?×' : formatAmp(l.writeAmp), 'head', hid.lsmNumbers ? 'muted' : 'amber-ink'],
        [' the data', 'cap', 'ink', 5],
      ],
      { owner: 'lsm-ledger' },
    );
  }
}

/** What the filters did for the lookup, or what their absence costs, and the ledger right under its last line. */
function filterBlock(c: Ctx, x: number, tY: number, pw: number, on: (k: string) => boolean) {
  const { D, m, hid } = c;
  const s = m.settings;
  const l = m.lsm;
  const labelF = s.bloom
    ? pickLast(
        [
          `Bloom filters · ${STORAGE_BLOOM_BITS} bits a key, ${formatSize(l.bloomBytes)} of memory`,
          `Bloom filters · ${formatSize(l.bloomBytes)} of memory`,
          'Bloom filters, in memory',
        ],
        fitsIn('label', pw),
      )
    : 'No bloom filters';
  text(c, 'filter-caption', x, tY + 11, label(labelF), { owner: 'lsm-stair' });
  const fit = (forms: string[]) =>
    pickLast(
      forms.map((t) => wrapKept(t, 'small', pw)),
      (ls) => ls.length <= 4,
    );
  const bloomForms = [
    `Each run's filter answers from memory: ${l.skipped} say "not here", so only the last run is read from disk. Each filter lets about 1 lookup in 100 through for nothing, so about ${l.skipped} in 100 read a run they did not need; the model leaves that out.`,
    `${l.skipped} filters say "not here" from memory; only the last run is read. False positives, about 1 lookup in 100 per filter, are left out.`,
  ];
  const offForms = [
    "Any run may hold the key's newest version, so each is read in turn, newest first, until the last level turns it up.",
    'Any run may hold the newest version, so each is read in turn.',
  ];
  const reads = (v: number) => `${v} ${plural(v, 'read', 'reads')}`;
  let lastY = tY + 28;
  if (hid.readWhy) {
    // The arithmetic hides in the house hidden mark: a dashed box as tall as the sentence it stands for.
    const boxH = fit(bloomForms).length * 13 + 8;
    rect(c, 'marks', 'why-hidden', 'hidden-box', x + 0.5, tY + 18, pw - 1, boxH, 3);
    wrapKept('How the filters decide shows after your answer.', 'small', pw - 16).forEach((t, i) =>
      text(c, i ? `filter-text-${i}` : 'filter-text', x + 8, tY + 32 + i * 13, small(t), { owner: 'lsm-stair' }),
    );
    D.mark({ x0: x, x1: x + pw, y0: tY + 18, y1: tY + 18 + boxH }, 'lsm-stair');
    lastY = tY + 18 + boxH - 2;
  } else if (on('ledger') || hid.readNumbers) {
    const lines = hid.readNumbers ? ['The count shows at the reveal.'] : fit(s.bloom ? bloomForms : offForms);
    lines.forEach((t, i) => text(c, i ? `filter-text-${i}` : 'filter-text', x, tY + 28 + i * 13, small(t), { owner: 'lsm-stair' }));
    lastY = tY + 28 + (lines.length - 1) * 13;
  }
  if (!on('ledger')) return;
  const l1 = hid.readNumbers
    ? ['? runs − ? skipped = ? reads']
    : hid.readWhy
      ? [`? runs − ? skipped = ${reads(l.lookupReads)}`]
      : s.bloom
        ? [`${l.runs} runs − ${l.skipped} skipped = ${reads(l.lookupReads)}`, `= ${reads(l.lookupReads)}`]
        : [`${l.runs} runs, none skipped = ${reads(l.lookupReads)}`, `${l.runs} runs = ${reads(l.lookupReads)}`];
  const ly = lastY + 17;
  text(c, 'lsm-ledger', x, ly, [[pickLast(l1, fitsIn('mono', pw)), 'mono', 'ink']], { owner: 'lsm-ledger' });
  text(
    c,
    'lsm-total',
    x,
    ly + 22,
    [
      [hid.readNumbers ? '?' : String(l.lookupReads), 'head', hid.readNumbers ? 'muted' : 'cur-ink'],
      [hid.readNumbers ? ' disk reads' : ` disk ${plural(l.lookupReads, 'read', 'reads')}`, 'cap', 'ink', 5],
    ],
    { owner: 'lsm-ledger' },
  );
}
