import { YEAR_MS, formatInt, formatYears, idLayout, idLedger, type IdSettings } from '@grasp/engine';
import { sampleLine } from './latency-draw';
import { IDS_TEXT, chainLines, hiddenBox, line, r1, rect, small, text, type Ctx, type Part } from './ids-draw';

const LINE = 18;
const RULER = { from: 30, to: 67, h: 70, axis: 48 };
const RULER_LABELS: readonly [string, number][] = [
  ['1 month', YEAR_MS / 12],
  ['1 year', YEAR_MS],
  ['100 years', 100 * YEAR_MS],
  ['10,000 years', 1e4 * YEAR_MS],
  ['1 million years', 1e6 * YEAR_MS],
  ['1 billion years', 1e9 * YEAR_MS],
];
export const NEED_YEARS = 200;
const bitsWord = (n: number) => `${n} ${n === 1 ? 'bit' : 'bits'}`;

/** The ledger's name column: beside the chains from 480 px, above them below. */
export const nameColumn = (W: number) => (W >= 480 ? 150 : 0);

const needGen = '(need 1,000)';
const needSeq = '(need 1,000,000)';

/** The ghost of an earlier lifetime in words: what it was, and what the bits moved did to it. */
export function ghostWords(was: IdSettings, now: IdSettings): string | null {
  const a = idLayout(was);
  const b = idLayout(now);
  if (Math.abs(a.years - b.years) < 1e-9) return null;
  const d = b.timeBits - a.timeBits;
  const why =
    d === 0
      ? `a ${now.tick} ms tick makes it ${now.tick > was.tick ? 'ten times as long' : 'a tenth as long'}`
      : Math.abs(d) === 1
        ? `one bit ${d < 0 ? 'fewer halves' : 'more doubles'} it`
        : `${Math.abs(d)} bits ${d < 0 ? 'fewer divide' : 'more multiply'} it by ${formatInt(2 ** Math.abs(d))}`;
  return `was ${formatYears(a.years)} with ${a.timeBits} bits${d === 0 ? ` and a ${was.tick} ms tick` : ''}: ${why}`;
}

const timeChain = (s: IdSettings, hidden: boolean) => {
  const t = idLedger(s).time.chain;
  return hidden ? [t[0], t[1], '= ?'] : t;
};
const reserveOf = (lists: readonly (readonly string[])[], width: number) =>
  Math.max(1, ...lists.map((segs) => chainLines(segs, 'cap', width).length));
const proseRes = (t: string, width: number) => IDS_TEXT.wrap(t, 'small', width).length;

const LONGEST = (() => {
  const time: string[][] = [];
  const gen: string[][] = [];
  const seq: string[][] = [];
  for (let b = 0; b <= 16; b++)
    for (const tick of [1, 10]) {
      const s = { gen: b, seq: b, tick, epoch: 1, load: 0, fault: 0, guard: 1, bits: 64, count: 9 };
      time.push(idLedger({ ...s, seq: 0 }).time.chain, idLedger({ ...s, gen: 16 }).time.chain);
      gen.push([...idLedger(s).gen.chain, needGen]);
      const sc = idLedger(s).seq.chain;
      seq.push([...sc, needSeq]);
    }
  return {
    time,
    gen,
    seq,
    end: '1 January 1970 to about 2.9 billion years after the epoch',
    ghost: 'was 1.1 billion years with 63 bits and a 10 ms tick: a 1 ms tick makes it a tenth as long',
  };
})();

/** The ruler's x for a span of `ms`: a log axis, one step a bit. */
const rulerX = (x0: number, w: number, ms: number) => x0 + ((Math.log2(ms) - RULER.from) / (RULER.to - RULER.from)) * w;

/**
 * Band B, what each field buys: the timestamp's chain, its dates and the lifetime ruler (one step mark a bit), the
 * generators' chain and the sequence's. In the challenge each chain names its need and the ruler draws the goal.
 */
export function ledgerBand(c: Ctx, y0: number): number {
  const { D, W, PAD, s, hid, view } = c;
  const full = W - 2 * PAD;
  const nc = nameColumn(W);
  const cx = PAD + nc;
  const cw = full - nc;
  const L = c.m.layout;
  const led = idLedger(s);
  const ghostSet = view.ghost && (!hid.ghost || hid.lifeNew) ? view.ghost : null;
  line(c, 'grid', 'b-rule', 'rule', 0, y0, W, y0);
  let y = y0 + 12;
  const row = (id: string, name: string, cls: string): number => {
    rect(c, 'marks', `chip-${id}`, `chip ${cls}`, PAD, y + 4, 10, 10, 2);
    text(c, `name-${id}`, PAD + 16, y + 14, [[name, 'capB', 'ink']], { owner: `row-${id}` });
    return nc ? y : y + LINE;
  };
  const chain = (id: string, segs: readonly string[], top: number, reserve: number, owner: string) => {
    chainLines(segs, 'cap', cw).forEach((t, i) => text(c, `${id}-${i}`, cx, top + 14 + i * LINE, [[t, 'cap', 'ink']], { owner }));
    return top + reserve * LINE;
  };

  const timeTop = y;
  let ty = row('time', `Timestamp, ${bitsWord(L.timeBits)}`, 'f-time');
  ty = chain('time-chain', timeChain(s, hid.lifeNew), ty, reserveOf(LONGEST.time, cw), 'row-time');
  const endRes = proseRes(LONGEST.end, cw);
  const ghostRes = proseRes(LONGEST.ghost, cw);
  const wordsH = (endRes + ghostRes) * 15 + 4;
  if (hid.lifeNew)
    hiddenBox(
      c,
      'life-hidden',
      cx,
      ty + 2,
      cw,
      wordsH - 2,
      hid.answered ? ['Its dates show at the reveal', 'Shown at the reveal'] : ['Its dates are hidden until you answer', 'Hidden until you answer'],
    );
  else {
    IDS_TEXT.wrap(led.time.end, 'small', cw).forEach((t, i) =>
      text(c, `time-end-${i}`, cx, ty + 12 + i * 15, small(t), { owner: 'row-time' }),
    );
    const gw = ghostSet ? ghostWords(ghostSet, s) : null;
    if (gw)
      IDS_TEXT.wrap(gw, 'small', cw).forEach((t, i) =>
        text(c, `ghost-words-${i}`, cx, ty + 12 + (endRes + i) * 15, small(t, 'ink'), { owner: 'ghost' }),
      );
  }
  ty += wordsH;
  ty = ruler(c, ty, cx, cw, ghostSet);
  D.region('ledgerTime', { x: PAD - 2, y: timeTop - 4, w: full + 4, h: ty - timeTop + 2 });
  y = ty + 8;

  let gy = row('gen', `Generator, ${bitsWord(L.genBits)}`, 'f-gen');
  const gens = [...led.gen.chain, ...(view.challenge ? [needGen] : [])];
  gy = chain('gen-chain', gens, gy, reserveOf(LONGEST.gen, cw), 'row-gen');
  y = gy + 8;
  let sy = row('seq', `Sequence, ${bitsWord(L.seqBits)}`, 'f-seq');
  const sc = led.seq.chain;
  sy = chain('seq-chain', [...sc, ...(view.challenge ? [needSeq] : [])], sy, reserveOf(LONGEST.seq, cw), 'row-seq');
  const totalRes = proseRes('4,294,967,296,000,000 ids a second from all 65,536', cw);
  IDS_TEXT.wrap(led.seq.total, 'small', cw).forEach((t, i) =>
    text(c, `seq-total-${i}`, cx, sy + 12 + i * 15, small(t), { owner: 'row-seq' }),
  );
  return sy + totalRes * 15 + 12;
}

/** The lifetime ruler: a log axis with a step mark every bit, the lifetime, today, the ghost and the goal, named above. */
function ruler(c: Ctx, top: number, x0: number, w: number, ghostSet: IdSettings | null): number {
  const { D, hid, view } = c;
  const L = c.m.layout;
  const ay = top + RULER.axis;
  const X = (ms: number) => rulerX(x0, w, ms);
  line(c, 'grid', 'ruler-axis', 'ruler-axis', x0, ay, x0 + w, ay);
  let d = '';
  for (let b = RULER.from; b <= RULER.to; b++) d += `M${r1(X(2 ** b))} ${ay - 4}v8`;
  D.add('grid', 'ruler-steps', { k: 'path', cls: 'ruler-step', d });
  D.mark({ x0, x1: x0 + w, y0: ay - 5, y1: ay + 5 }, 'ruler');
  let last = -Infinity;
  for (const [t, ms] of RULER_LABELS) {
    const x = X(ms);
    const tw = IDS_TEXT.tw(t, 'small');
    const a = Math.max(x0, Math.min(x0 + w - tw, x - tw / 2));
    if (a < last + 6) continue;
    text(c, `ruler-label-${t}`, a, ay + 19, small(t), { owner: 'ruler-axis' });
    last = a + tw;
  }
  const marks: { id: string; x: number; top: number; parts: Part[]; short?: Part[]; optional?: boolean }[] = [];
  const nowMs = L.elapsedMs;
  const today = !L.fits
    ? 'past the end'
    : nowMs < YEAR_MS
      ? `${Math.round(nowMs / 86_400_000)} days in`
      : `${formatYears(nowMs / YEAR_MS)} in`;
  if (view.challenge) {
    const nx = X(L.elapsedMs + NEED_YEARS * YEAR_MS);
    rect(c, 'back', 'need-band', 'need-band', nx, ay - 6, x0 + w - nx, 12);
    line(c, 'marks', 'need-tick', 'need-tick', nx, ay - 8, nx, ay + 8);
    D.mark({ x0: nx - 2, x1: nx + 2, y0: ay - 8, y1: ay + 8 }, 'need');
  }
  if (!hid.lifeNew) {
    const lx = X(L.lifetimeMs);
    D.add('dots', 'life-marker', { k: 'circle', cls: `life-marker slide${L.fits ? '' : ' out'}`, cx: r1(lx), cy: ay, r: 5.5, slide: true });
    D.mark({ x0: lx - 6, x1: lx + 6, y0: ay - 6, y1: ay + 6 }, 'life');
    marks.push({ id: 'life', x: lx, top: ay - 7, parts: [[`lasts ${formatYears(L.years)}`, 'smallB', 'acc-ink']] });
  } else marks.push({ id: 'life', x: x0 + 20, top: ay - 7, parts: [['lasts ?', 'smallB', 'muted']] });
  if (view.challenge)
    marks.push({
      id: 'need',
      x: X(L.elapsedMs + NEED_YEARS * YEAR_MS),
      top: ay - 9,
      parts: small(`need ${NEED_YEARS} years from today`, 'ink'),
      short: small(`need ${NEED_YEARS} yr`, 'ink'),
    });
  const tx = X(nowMs);
  D.add('marks', 'today', { k: 'path', cls: `today${L.fits ? '' : ' out'}`, d: `M${r1(tx - 4)} ${ay - 12}h8l-4 6z` });
  D.mark({ x0: tx - 4, x1: tx + 4, y0: ay - 12, y1: ay - 6 }, 'today');
  marks.push({ id: 'today', x: tx, top: ay - 13, parts: small(`today, ${today}`, L.fits ? 'ink' : 'bad'), short: small('today', L.fits ? 'ink' : 'bad') });
  if (ghostSet) {
    const was = idLayout(ghostSet);
    if (Math.abs(was.lifetimeMs - L.lifetimeMs) > 1e-6) {
      const gx = X(was.lifetimeMs);
      rect(c, 'marks', 'ghost-tick', 'ghost-tick', gx - 1.5, ay - 7, 3, 14, 1);
      D.mark({ x0: gx - 3, x1: gx + 3, y0: ay - 7, y1: ay + 7 }, 'ghost');
      marks.push({ id: 'was', x: gx, top: ay - 8, parts: small(`was ${formatYears(was.years)}`), optional: true });
      const lx = X(L.lifetimeMs);
      if (!hid.lifeNew && Math.abs(lx - gx) >= 12)
        D.add('marks', 'ghost-arc', {
          k: 'path',
          cls: 'ghost-arc',
          d: `M${r1(gx)} ${ay - 8}Q${r1((gx + lx) / 2)} ${ay - 18} ${r1(lx)} ${ay - 9}`,
        });
    }
  }
  nameMarks(c, marks, x0 - 4, x0 + w + 4, ay - 20);
  return top + RULER.h;
}

type RulerMark = { id: string; x: number; top: number; parts: Part[]; short?: Part[]; optional?: boolean };

/** Lefts for labels of widths `ws` wanting to centre on `xs` (in x order), 8 px apart within [lo, hi], or null. */
function pack(ws: readonly number[], xs: readonly number[], lo: number, hi: number): number[] | null {
  const left = ws.map((w, i) => Math.min(Math.max(xs[i] - w / 2, lo), hi - w));
  for (let i = 1; i < left.length; i++) left[i] = Math.max(left[i], left[i - 1] + ws[i - 1] + 8);
  const n = left.length;
  if (n && left[n - 1] + ws[n - 1] > hi) {
    left[n - 1] = hi - ws[n - 1];
    for (let i = n - 2; i >= 0; i--) left[i] = Math.min(left[i], left[i + 1] - 8 - ws[i]);
  }
  return !n || left[0] >= lo ? left : null;
}

/**
 * The ruler's names in one row over the marks, in the marks' order, each as near its own mark as the others allow; one
 * off its mark hangs on a leader down to it, and in the marks' order no two leaders cross. Long names shorten, then
 * an optional one drops, before a name moves up a row.
 */
function nameMarks(c: Ctx, all: readonly RulerMark[], lo: number, hi: number, baseline: number) {
  const { D } = c;
  const marks = [...all].sort((a, b) => a.x - b.x);
  const width = (p: Part[]) => IDS_TEXT.partsWidth(p);
  const shortenable = marks.filter((m) => m.short).sort((a, b) => width(b.parts) - width(a.parts));
  const tries: { short: Set<string>; drop: boolean }[] = [];
  for (let k = 0; k <= shortenable.length; k++) tries.push({ short: new Set(shortenable.slice(0, k).map((m) => m.id)), drop: false });
  tries.push({ short: new Set(shortenable.map((m) => m.id)), drop: true });
  const formOf = (m: RulerMark, t: (typeof tries)[number]) => (t.short.has(m.id) ? m.short! : m.parts);
  let rows: RulerMark[][] = [];
  let chosen = tries.at(-1)!;
  for (const t of tries) {
    const row = marks.filter((m) => !(t.drop && m.optional));
    if (pack(row.map((m) => width(formOf(m, t))), row.map((m) => m.x), lo, hi)) {
      rows = [row];
      chosen = t;
      break;
    }
  }
  if (!rows.length) {
    const row = marks.filter((m) => !m.optional);
    const up = row.filter((m) => m.id !== 'life').sort((a, b) => width(formOf(b, chosen)) - width(formOf(a, chosen)))[0];
    rows = [row.filter((m) => m !== up), up ? [up] : []];
  }
  const boxes: { x0: number; x1: number }[] = [];
  rows.forEach((row, r) => {
    const ws = row.map((m) => width(formOf(m, chosen)));
    const y = baseline - r * 18;
    // A name a row up hangs from a gap between the names below it, the gap nearest its mark.
    const gaps = r ? gapsBetween(boxes, lo, hi) : [];
    const at = row.map((m) => (r ? nearestIn(gaps, m.x) : m.x));
    const lefts = pack(ws, at, lo, hi);
    if (!lefts) {
      for (const m of row) D.missing.push(formOf(m, chosen).map((p) => p[0]).join(''));
      return;
    }
    row.forEach((m, i) => {
      const box = D.text(`ruler-name-${m.id}`, lefts[i], y, formOf(m, chosen), { owner: `ruler-${m.id}` });
      if (!r) boxes.push(box);
      const lx = Math.max(box.x0 + 2, Math.min(box.x1 - 2, at[i]));
      if (Math.abs(lx - m.x) < 3 && r === 0) return;
      const pts: [number, number][] = [[m.x, m.top]];
      if (r) pts.push([lx, baseline + 0.22 * 11 + 1.5]);
      pts.push([lx, box.y1 + 1.5]);
      D.add('marks', `ruler-leader-${m.id}`, {
        k: 'path',
        cls: 'ruler-leader',
        d: pts.map(([px, py], k) => `${k ? 'L' : 'M'}${r1(px)} ${r1(py)}`).join(''),
      });
      D.link(
        pts.slice(1).flatMap((p, k) => sampleLine(pts[k][0], pts[k][1], p[0], p[1], 2)),
        `ruler-${m.id}`,
      );
    });
  });
}

/** The x stretches of [lo, hi] no box covers, kept 4 px from each box. */
function gapsBetween(boxes: readonly { x0: number; x1: number }[], lo: number, hi: number): [number, number][] {
  const out: [number, number][] = [];
  let from = lo;
  for (const b of [...boxes].sort((a, c) => a.x0 - c.x0)) {
    if (b.x0 - 4 > from) out.push([from, b.x0 - 4]);
    from = Math.max(from, b.x1 + 4);
  }
  if (hi > from) out.push([from, hi]);
  return out;
}
const nearestIn = (gaps: readonly [number, number][], x: number) =>
  gaps.map(([a, b]) => Math.max(a, Math.min(b, x))).reduce((best, v) => (Math.abs(v - x) < Math.abs(best - x) ? v : best), gaps[0]?.[0] ?? x);
