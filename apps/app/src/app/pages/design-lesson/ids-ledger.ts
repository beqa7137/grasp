import { YEAR_MS, formatInt, formatYears, idLayout, idLedger, type IdSettings } from '@grasp/engine';
import { IDS_TEXT, chainLines, hiddenBox, line, r1, rect, small, text, type Ctx, type Part } from './ids-draw';

const LINE = 18;
const RULER = { from: 30, to: 67, h: 88 };
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
    hiddenBox(c, 'life-hidden', cx, ty + 2, cw, wordsH - 2, ['Its dates are hidden until you answer', 'Hidden until you answer']);
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
  const ay = top + 66;
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
  const marks: { id: string; x: number; parts: Part[]; short?: Part[]; optional?: boolean }[] = [];
  const nowMs = L.elapsedMs;
  const today = nowMs < YEAR_MS ? `${Math.round(nowMs / 86_400_000)} days in` : `${formatYears(nowMs / YEAR_MS)} in`;
  if (!hid.lifeNew) {
    const lx = X(L.lifetimeMs);
    D.add('dots', 'life-marker', { k: 'circle', cls: 'life-marker slide', cx: r1(lx), cy: ay, r: 5.5, slide: true });
    D.mark({ x0: lx - 6, x1: lx + 6, y0: ay - 6, y1: ay + 6 }, 'life');
    marks.push({ id: 'life', x: lx, parts: [[`lasts ${formatYears(L.years)}`, 'smallB', 'acc-ink']] });
  } else marks.push({ id: 'life', x: x0 + 20, parts: [['lasts ?', 'smallB', 'muted']] });
  const tx = X(nowMs);
  D.add('marks', 'today', { k: 'path', cls: 'today', d: `M${r1(tx - 4)} ${ay - 12}h8l-4 6z` });
  D.mark({ x0: tx - 4, x1: tx + 4, y0: ay - 12, y1: ay - 6 }, 'today');
  marks.push({ id: 'today', x: tx, parts: small(`today, ${today}`, 'ink') });
  if (ghostSet) {
    const was = idLayout(ghostSet);
    if (Math.abs(was.lifetimeMs - L.lifetimeMs) > 1e-6) {
      const gx = X(was.lifetimeMs);
      rect(c, 'marks', 'ghost-tick', 'ghost-tick', gx - 1.5, ay - 7, 3, 14, 1);
      D.mark({ x0: gx - 3, x1: gx + 3, y0: ay - 7, y1: ay + 7 }, 'ghost');
      marks.push({ id: 'was', x: gx, parts: small(`was ${formatYears(was.years)}`), optional: true });
      const lx = X(L.lifetimeMs);
      if (!hid.lifeNew && Math.abs(lx - gx) >= 12)
        D.add('marks', 'ghost-arc', {
          k: 'path',
          cls: 'ghost-arc',
          d: `M${r1(gx)} ${ay - 8}Q${r1((gx + lx) / 2)} ${ay - 18} ${r1(lx)} ${ay - 9}`,
        });
    }
  }
  if (view.challenge) {
    const nx = X(L.elapsedMs + NEED_YEARS * YEAR_MS);
    line(c, 'marks', 'need-tick', 'need-tick', nx, ay - 8, nx, ay + 8);
    D.mark({ x0: nx - 2, x1: nx + 2, y0: ay - 8, y1: ay + 8 }, 'need');
    marks.push({
      id: 'need',
      x: nx,
      parts: small(`need ${NEED_YEARS} years from today`, 'ink'),
      short: small(`need ${NEED_YEARS} yr`, 'ink'),
    });
  }
  for (const mk of marks) {
    const cands: [number, number, 'start' | 'middle' | 'end'][] = [];
    for (const dy of [0, 18, 36])
      for (const dx of [0, 10, -10, 20, -20, 30, -30, 40, -40, 60, -60]) cands.push([mk.x + dx, ay - 20 - dy, 'middle']);
    for (const dy of [0, 18, 36]) cands.push([x0, ay - 20 - dy, 'start'], [x0 + w, ay - 20 - dy, 'end']);
    const o = { minX: x0 - 4, maxX: x0 + w + 4, minY: top, owner: `ruler-${mk.id}`, margin: 6, optional: mk.optional };
    if (!mk.short || !D.place(`ruler-name-${mk.id}`, cands, mk.parts, { ...o, optional: true }))
      D.place(`ruler-name-${mk.id}`, cands, mk.short ?? mk.parts, o);
  }
  return top + RULER.h;
}
