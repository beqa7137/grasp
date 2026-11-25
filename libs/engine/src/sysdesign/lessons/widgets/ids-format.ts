import {
  ID_BURST,
  ID_COUNT_EXP,
  ID_FAULT,
  ID_LOAD,
  ID_SKEW_US,
  ID_STEP_AT_US,
  ID_STEP_US,
  ID_WINDOW_US,
  birthdayChance,
  evenOdds,
  expectedPairs,
  idLayout,
  idMint,
  type IdLayout,
  type IdMint,
  type IdSettings,
  type MintedId,
} from './ids.js';

/** How the Unique IDs widget says its numbers and sentences, on the stage and in its experiments' slots. */

const GROUPED = new Intl.NumberFormat('en-US');
export const formatInt = (n: number | bigint) => GROUPED.format(typeof n === 'bigint' ? n : Math.round(n));
const SUP: Record<string, string> = { '-': '⁻', 0: '⁰', 1: '¹', 2: '²', 3: '³', 4: '⁴', 5: '⁵', 6: '⁶', 7: '⁷', 8: '⁸', 9: '⁹' };
export const sup = (n: number) => String(n).replace(/./g, (c) => SUP[c]);
export const formatPow2 = (n: number) => `2${sup(n)}`;
export const formatPow10 = (n: number) => `10${sup(n)}`;

export function formatYears(y: number): string {
  if (y >= 1e9) return `${(y / 1e9).toFixed(1)} billion years`;
  if (y >= 1e6) return `${(y / 1e6).toFixed(1)} million years`;
  if (y >= 1000) return `${formatInt(y)} years`;
  if (y >= 1) return `${y.toFixed(1)} years`;
  const d = y * 365.25;
  return `${d.toFixed(d >= 10 ? 0 : 1)} days`;
}
const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
/** A day as "7 September 2095", or null past the year 9999. */
export function formatDate(ms: number): string | null {
  if (!Number.isFinite(ms) || ms > 8.64e15) return null;
  const d = new Date(ms);
  if (d.getUTCFullYear() > 9999) return null;
  return `${d.getUTCDate()} ${MONTHS[d.getUTCMonth()]} ${d.getUTCFullYear()}`;
}
/** The end of the timestamp: a date while one exists, else how far off it is. */
export const endWords = (L: IdLayout) => formatDate(L.endMs) ?? `about ${formatYears(L.years)} after the epoch`;
/** Microseconds as milliseconds, to 0.01 ms under 10, 0.1 ms under 100, else whole: "2.9 ms", "0.05 ms", "78 ms". */
export const formatIdMs = (us: number) => {
  const v = us / 1000;
  if (v >= 100) return `${formatInt(v)} ms`;
  const d = v < 10 ? 100 : 10;
  return `${Math.round(v * d) / d} ms`;
};
export function formatSci(x: number): string {
  let e = Math.floor(Math.log10(x));
  let m = x / 10 ** e;
  if (+m.toFixed(1) >= 10) {
    m /= 10;
    e += 1;
  }
  return `${m.toFixed(1)} × ${formatPow10(e)}`;
}
/** A chance from the birthday bound, always with "about": it is an approximation. */
export function formatChance(p: number): string {
  if (p >= 0.995) return 'near certain';
  if (p >= 0.1) return `about ${Math.round(p * 100)}%`;
  if (p >= 0.01) return `about ${(p * 100).toFixed(1)}%`;
  if (p >= 1e-6) return `about 1 in ${formatInt(1 / p)}`;
  return `about ${formatSci(p)}`;
}
const COUNT_NAMES: Record<number, string> = { 3: 'a thousand', 6: 'a million', 9: 'a billion', 12: 'a trillion', 15: 'a quadrillion' };
/** A count of ids by its power of ten: "a billion", or "10⁸". */
export const countName = (exp: number) => COUNT_NAMES[exp] ?? formatPow10(exp);
export const countFigure = (exp: number) => (exp % 3 === 0 ? formatInt(10 ** exp) : formatPow10(exp));
export function idCountWords(x: number): string {
  if (x >= 1e9 && x < 1e12) return `${(x / 1e9).toFixed(1)} billion`;
  if (x >= 1e6 && x < 1e9) return `${(x / 1e6).toFixed(1)} million`;
  return formatSci(x);
}
export const plural = (n: number, one: string, many: string) => `${formatInt(n)} ${n === 1 ? one : many}`;
export const genName = (lane: number) => `G${lane}`;
export const NUMBER_WORDS = ['No', 'One', 'Two', 'Three', 'Four', 'Five', 'Six', 'Seven', 'Eight', 'Nine'];
/** A count that opens a sentence, in words while it is small, so no sentence opens on a numeral. */
export const opening = (n: number, one: string, many: string) =>
  n < 10 ? `${NUMBER_WORDS[n]} ${n === 1 ? one : many}` : `In all, ${formatInt(n)} ${many}`;

/** The moment an id says it was made, read back from its bits: the epoch plus its timestamp in ticks. */
export function idTime(L: IdLayout, x: Pick<MintedId, 'ts'>): string {
  const at = L.epochMs + x.ts * L.tick;
  const d = new Date(at);
  const pad = (v: number, n = 2) => String(v).padStart(n, '0');
  return `${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:${pad(d.getUTCSeconds())}.${pad(d.getUTCMilliseconds(), 3)} UTC on ${formatDate(at)}`;
}
/** What anyone holding the id learns from it. */
export const leakLine = (L: IdLayout, x: MintedId) =>
  `Anyone holding this id can read when it was made (${idTime(L, x)}, to the tick) and which generator made it (number ${formatInt(x.number)}).`;
/** The timestamp field shortened to its last digits, for the sorted list. */
export const tsShort = (x: Pick<MintedId, 'ts'>) => `…${String(x.ts).slice(-3)}`;

/** Each field's chain: the arithmetic of what it buys. */
export function idLedger(s: IdSettings) {
  const L = idLayout(s);
  return {
    time: {
      chain: [`${formatPow2(L.timeBits)} ticks`, `× ${s.tick} ms`, `= ${formatYears(L.years)}`],
      end: L.fits ? `${formatDate(L.epochMs)} to ${endWords(L)}` : `ran out on ${endWords(L)}`,
    },
    gen: { chain: [formatPow2(L.genBits), `= ${plural(L.generators, 'generator', 'generators')} at once`] },
    seq: {
      chain: [
        `${formatPow2(L.seqBits)} = ${plural(L.perTick, 'id', 'ids')} a tick`,
        `× ${formatInt(L.ticksPerSecond)} ticks a second`,
        `= ${formatInt(L.perSecond)} ids a second each`,
      ],
      total: `${formatInt(L.totalPerSecond)} ids a second from all ${formatInt(L.generators)}`,
    },
  };
}

export const headSentence = (L: IdLayout) =>
  `The 64 bits are 1 sign bit, ${L.timeBits} timestamp bits, ${plural(L.genBits, 'generator bit', 'generator bits')} and ${plural(L.seqBits, 'sequence bit', 'sequence bits')}.`;
export const timeSentence = (s: IdSettings, L: IdLayout) =>
  L.fits
    ? `The timestamp counts ${s.tick} ms ticks from ${formatDate(L.epochMs)} and lasts ${formatYears(L.years)}${formatDate(L.endMs) ? `, to ${formatDate(L.endMs)}` : ''}.`
    : `The timestamp counts ${s.tick} ms ticks from ${formatDate(L.epochMs)} and ran out on ${endWords(L)}, so today's clock no longer fits and every generator must refuse to mint.`;
export const roomSentence = (L: IdLayout) =>
  `There is room for ${plural(L.generators, 'generator', 'generators')}, ${L.generators === 1 ? 'making' : 'each making'} up to ${formatInt(L.perSecond)} ids a second.`;
export function layoutSentence(s: IdSettings): string {
  const L = idLayout(s);
  return `${headSentence(L)} ${timeSentence(s, L)} ${roomSentence(L)}`;
}

/** The mint's sentences by part, so a question can hide one part and keep the rest. */
export interface MintParts {
  made: string;
  idle: string | null;
  repeats: string;
  guard: string | null;
  burst: string | null;
  order: string;
  after: string | null;
}

export function mintParts(m: IdMint): MintParts | null {
  const s = m.settings;
  const L = m.layout;
  if (!L.fits) return null;
  const running = m.lanes.filter((l) => l.runs);
  const idle = m.lanes.filter((l) => !l.runs);
  const who = running.length === 1 ? 'One generator' : `${NUMBER_WORDS[running.length]} generators`;
  const repeats = m.repeats.length
    ? s.fault === ID_FAULT.shared
      ? `${opening(m.repeats.length, 'id repeats', 'ids repeat')}: G1 and G2 share the number 1, so in a tick where both make an id with the same sequence, the ids are equal.`
      : `${opening(m.repeats.length, 'id repeats', 'ids repeat')}: G1 trusted its clock when it stepped back ${formatIdMs(ID_STEP_US)}, reissuing timestamps it had used.`
    : 'No id repeats.';
  let guard: string | null = null;
  if (s.fault === ID_FAULT.stepBack && s.guard) {
    const w = m.lanes[1].ids.find((x) => x.wait > 0 && x.issued > ID_STEP_AT_US);
    if (w)
      guard = `G1's clock stepped back ${formatIdMs(ID_STEP_US)}; it checked its clock against its last timestamp and waited ${formatIdMs(w.wait)} for its clock to catch up.`;
  }
  let burst: string | null = null;
  if (s.load === ID_LOAD.burst && m.lastBurst) {
    const t = m.lastBurst;
    burst =
      t.wait > 0
        ? `G0's burst of ${formatInt(ID_BURST)} requests needs ${plural(Math.ceil(ID_BURST / L.perTick), 'tick', 'ticks')} of ${plural(L.perTick, 'id', 'ids')}, so its last request waits ${formatIdMs(t.wait)}.`
        : `G0's burst of ${formatInt(ID_BURST)} requests fits in one tick of ${plural(L.perTick, 'id', 'ids')}, so none waits.`;
  } else {
    const full = m.waited.filter((x) => x.why === 'full').length;
    if (full)
      burst = `${opening(full, 'request', 'requests')} waited for a later tick because a tick holds only ${plural(L.perTick, 'id', 'ids')} a generator.`;
  }
  const late = m.lateByTick.length;
  const order =
    late && s.fault === ID_FAULT.skew
      ? `${opening(late, 'id', 'ids')} from G2, whose clock runs ${formatIdMs(ID_SKEW_US)} ahead, ${late === 1 ? 'sorts' : 'sort'} after ids made later.`
      : late
        ? `G1's clock now runs ${formatIdMs(ID_STEP_US)} behind, so ${plural(late, 'id', 'ids')} made earlier ${late === 1 ? 'sorts' : 'sort'} after ids G1 made later.`
        : s.tick === 10 && new Set(m.drawn.map((x) => x.ts)).size === 1
          ? 'With a 10 ms tick every id drawn here shares one timestamp, so they sort by generator, then by sequence.'
          : 'They sort by tick, then by generator, then by sequence, so time order holds only to the tick.';
  return {
    made: `${who} made ${plural(m.ids.length, 'id', 'ids')}${running.length > 1 ? ' without talking to each other' : ''}.`,
    idle: idle.length
      ? `${idle.map((l) => genName(l.lane)).join(' and ')} cannot run: ${plural(L.genBits, 'generator bit gives', 'generator bits give')} only ${plural(L.generators, 'number', 'numbers')}.`
      : null,
    repeats,
    guard,
    burst,
    order,
    after: m.after ? `${opening(m.after, 'id was', 'ids were')} made after the ${formatIdMs(ID_WINDOW_US)} drawn.` : null,
  };
}
export const NO_MINT = 'No generator mints: the clock is past the end of the timestamp field.';
export function mintSentence(s: IdSettings): string {
  const p = mintParts(idMint(s));
  if (!p) return NO_MINT;
  return [p.made, p.idle, p.repeats, p.guard, p.burst, p.order, p.after].filter(Boolean).join(' ');
}

export const chanceSentence = (s: Pick<IdSettings, 'bits' | 'count'>) =>
  `Among ${countName(s.count)} random ${s.bits}-bit ids, the chance of any repeat is ${formatChance(birthdayChance(s.bits, 10 ** s.count))}, by the birthday bound.`;
export function randomSentence(s: Pick<IdSettings, 'bits' | 'count'>): string {
  const e = evenOdds(s.bits);
  const odds =
    e <= 10 ** ID_COUNT_EXP.max
      ? `It reaches even odds near ${idCountWords(e)} ids.`
      : `It reaches even odds only near ${formatSci(e)} ids, past the chart.`;
  return `${chanceSentence(s)} ${odds} A thousand times the ids makes the chance about a million times larger while it is small.`;
}

/** Why the chance is what it is, as segments: the pairs, each pair's chance, the repeats expected, the chance. */
export function pairsChain(s: Pick<IdSettings, 'bits' | 'count'>): string[] {
  const n = 10 ** s.count;
  const expect = expectedPairs(s.bits, n);
  const expectTxt = expect >= 1000 || expect < 0.001 ? formatSci(expect) : expect >= 10 ? formatInt(expect) : expect.toPrecision(2);
  return [
    `${formatPow10(s.count)} ids`,
    `→ about ${formatSci((n * (n - 1)) / 2)} pairs`,
    `× 1 in ${formatSci(2 ** s.bits)} each`,
    `≈ ${expectTxt} repeats expected`,
    `→ chance ${formatChance(birthdayChance(s.bits, n))}`,
  ];
}

/** The challenge's checks, each "(need ...)" in the ask's own terms. */
export function idGoalParts(s: IdSettings): { text: string; met: boolean }[] {
  const L = idLayout(s);
  return [
    { met: L.generators >= 1000, text: `${plural(L.generators, 'generator', 'generators')} (need 1,000)` },
    { met: L.perSecond >= 1e6, text: `${formatInt(L.perSecond)} ids a second each (need 1,000,000)` },
    {
      met: L.yearsLeft >= 200,
      text: L.yearsLeft > 0 ? `lasts ${formatYears(L.yearsLeft)} from today (need 200 years)` : 'already ran out (need 200 years)',
    },
  ];
}
