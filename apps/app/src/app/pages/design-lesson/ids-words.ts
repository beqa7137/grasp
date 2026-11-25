import {
  ID_EPOCH_MS,
  ID_FAULT,
  ID_NOW_MS,
  ID_SKEW_US,
  ID_STEP_AT_US,
  ID_STEP_US,
  NO_MINT,
  chanceSentence,
  formatDate,
  formatIdMs,
  formatInt,
  formatYears,
  headSentence,
  idLayout,
  idMint,
  mintParts,
  randomSentence,
  roomSentence,
  timeSentence,
  tsShort,
  type IdMint,
  type IdSettings,
  type MintedId,
} from '@grasp/engine';
import { tableWidth } from './storage-text';

/**
 * What an open question hides, on every surface (stage, summary, notice, Describe, accessible names): one map from the
 * regions its `hide` list names. `lifetime` hides a lifetime other than the setup's (so only while E1's answer plays);
 * `burstAfter` a burst's later ticks while E2's plays; `order` the sorted list and the order sentence; `inspect` the
 * inspected id's digits and what they leak; `repeats` (which sets `order` and `inspect`) every mark and word of a repeat;
 * `chance` the random ids' chart and its arithmetic. While a question is open no ghost shows and every control waits.
 */
export interface Hid {
  lifeNew: boolean;
  burstAfter: boolean;
  order: boolean;
  inspect: boolean;
  repeats: boolean;
  chance: boolean;
  ghost: boolean;
  locked: boolean;
}
export type HidFlag = keyof Hid;
export type QuestionPhase = 'rest' | 'asking' | 'playing' | 'revealed';

/** `leak` switches flags off, for the no-answer sweep to prove it catches each one. */
export function hiding(hide: readonly string[], phase: QuestionPhase, leak: readonly HidFlag[] = []): Hid {
  const h = new Set(hide);
  const playing = phase === 'playing';
  const open = phase === 'asking' || playing;
  const repeats = h.has('repeats') && open;
  const map: Hid = {
    lifeNew: h.has('lifetime') && playing,
    burstAfter: h.has('burstAfter') && playing,
    order: (h.has('order') && open) || repeats,
    inspect: (h.has('inspect') && open) || repeats,
    repeats,
    chance: h.has('chance') && open,
    ghost: open,
    locked: open,
  };
  for (const flag of leak) map[flag] = false;
  return map;
}
export const NOTHING_HIDDEN = hiding([], 'rest');
/** Whether any part of the stage is hidden: Describe waits while one is. */
export const anyHidden = (hid: Hid) => hid.lifeNew || hid.burstAfter || hid.order || hid.inspect || hid.repeats || hid.chance;

/**
 * The runs no line of the widget's HTML text parts, for every `g-code-text` under it: a number with its unit, a
 * "(need ...)", "number 1", a date, a power of ten with its mantissa and a percentage.
 */
export const IDS_KEEP =
  /\d[\d,.]* (?:ns|µs|ms|s|min|KB|MB|GB|TB|years?|bits?|ids|generators?|ticks?|requests)\b|\(need [\d,]+(?: years)?\)|\bnumber \d\b|\d+ (?:January|February|March|April|May|June|July|August|September|October|November|December) \d{4}|\d[\d.]* × 10[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]+|\d[\d.]*%/g;

export const REST_NOTICE = 'Change the layout, the requests or what goes wrong; Play runs 8 ms of three generators, slowed down.';
export const PLAYING_NOTICE = 'Playing the mint: 8 ms of the clock, slowed down.';
export const ANSWER_NOTICE = 'Playing your guess.';
export const askNotice = (title: string, hid: Hid) =>
  anyHidden(hid) ? `${title}: the part it is about is hidden until you answer.` : `${title}.`;

/** Whether an id is shown: a hidden burst tick's ids are not. */
export function visible(m: IdMint, x: MintedId, hid: Hid): boolean {
  if (!hid.burstAfter || x.lane !== 0) return true;
  const first = m.lanes[0].ids[0];
  return !!first && x.tick === first.tick;
}

/** The layout's sentences, the lifetime said only when it is not hidden. */
export function layoutWords(s: IdSettings, hid: Hid): string {
  const L = idLayout(s);
  const time = hid.lifeNew
    ? `The timestamp counts ${s.tick} ms ticks from ${formatDate(L.epochMs)}; how long it lasts now is hidden until you answer.`
    : timeSentence(s, L);
  return `${headSentence(L)} ${time} ${roomSentence(L)}`;
}

/** The mint's sentences, each part a question hides said as hidden. */
export function mintWords(m: IdMint, hid: Hid): string {
  const p = mintParts(m);
  if (!p) return NO_MINT;
  const s = m.settings;
  const made = hid.burstAfter ? 'Three generators made ids without talking to each other.' : p.made;
  const repeats = hid.repeats ? 'Whether G1 makes any id twice is hidden until you answer.' : p.repeats;
  const guard = hid.repeats ? null : p.guard;
  const burst = hid.burstAfter ? "G0's burst is hidden until you answer." : p.burst;
  const order = hid.order ? 'The order of the ids is hidden until you answer.' : p.order;
  const after = hid.burstAfter ? null : p.after;
  const fault =
    s.fault === ID_FAULT.skew
      ? `G2's clock runs ${formatIdMs(ID_SKEW_US)} ahead.`
      : s.fault === ID_FAULT.stepBack
        ? `G1's clock steps back ${formatIdMs(ID_STEP_US)} at ${formatIdMs(ID_STEP_AT_US)}${s.guard ? ', and G1 keeps its last timestamp' : ', and G1 trusts it'}.`
        : s.fault === ID_FAULT.shared
          ? "G2 was handed G1's number, 1."
          : null;
  return [made, fault, p.idle, repeats, guard, burst, order, after].filter(Boolean).join(' ');
}

export function randomWords(s: IdSettings, hid: Hid): string {
  return hid.chance ? `Random ${s.bits}-bit ids: the chance of a repeat is hidden until you answer.` : randomSentence(s);
}

/** The stage's summary, its accessible name, in full sentences, obeying `hiding()`. */
export const summary = (m: IdMint, hid: Hid) => `${layoutWords(m.settings, hid)} ${mintWords(m, hid)} ${randomWords(m.settings, hid)}`;

/** What a control change says in the live notice: only what changed. */
export function changeSentence(key: keyof IdSettings, s: IdSettings, hid: Hid = NOTHING_HIDDEN): string {
  const L = idLayout(s);
  if (key === 'gen' || key === 'seq')
    return `The layout now has ${formatInt(L.genBits)} generator ${L.genBits === 1 ? 'bit' : 'bits'} and ${formatInt(L.seqBits)} sequence ${L.seqBits === 1 ? 'bit' : 'bits'}: ${formatInt(L.generators)} ${L.generators === 1 ? 'generator' : 'generators'}, ${formatInt(L.perSecond)} ids a second each; the timestamp keeps ${L.timeBits} bits ${hid.lifeNew ? 'and how long it lasts is hidden until you answer' : `and lasts ${formatYears(L.years)}`}.`;
  if (key === 'tick' || key === 'epoch') return `${timeSentence(s, L)} ${roomSentence(L)}`;
  if (key === 'bits' || key === 'count') return hid.chance ? randomWords(s, hid) : chanceSentence(s);
  return mintWords(idMint(s), hid);
}

/** Who made the inspected id, and when both readings differ, what its clock read. */
export function madeBy(s: IdSettings, x: MintedId): string {
  const at = `made by G${x.lane} at ${formatIdMs(x.issued)}`;
  if (Math.abs(x.clock - x.issued) < 1e-9) return at;
  if (s.fault === ID_FAULT.skew) return `${at}; G2's clock, ${formatIdMs(ID_SKEW_US)} ahead, read ${formatIdMs(x.clock)}`;
  return `${at}; G1's clock, stepped back ${formatIdMs(ID_STEP_US)}, read ${formatIdMs(x.clock)}`;
}
export const MADE_BY_LONGEST = "made by G1 at 7.85 ms; G1's clock, stepped back 2 ms, read 5.85 ms";

/** The conversion from the clock to the timestamp, as segments kept whole. */
export function conversion(s: IdSettings, x: MintedId): string[] {
  const L = idLayout(s);
  const us = (ID_NOW_MS - L.epochMs) * 1000 + x.clock;
  const frac =
    us % 1000
      ? `.${String(us % 1000)
          .padStart(3, '0')
          .replace(/0+$/, '')}`
      : '';
  return [
    `G${x.lane}'s clock: 12:00:00 + ${formatIdMs(x.clock)}`,
    `− epoch ${formatDate(L.epochMs)}`,
    `= ${formatInt(Math.floor(us / 1000))}${frac} ms`,
    `÷ ${s.tick} ms a tick, rounded down`,
    `= ${formatInt(x.ts)}, the timestamp`,
  ];
}
/** The longest conversion any id can print, for the lines its block reserves. */
export const CONVERSION_LONGEST = [
  "G2's clock: 12:00:00 + 9.85 ms",
  `− epoch ${formatDate(ID_EPOCH_MS[1])}`,
  '= 1,795,867,200,009.85 ms',
  '÷ 10 ms a tick, rounded down',
  '= 1,795,867,200,009, the timestamp',
];

export type TableForm = 'full' | 'compact';

/** Describe: every drawn id in id order with its fields, so a screen reader gets band A's content for every id. */
export function describeTable(m: IdMint, boxW: number) {
  const full = tableOf(m, 'full');
  return tableWidth(full.head, full.rows) <= boxW ? full : tableOf(m, 'compact');
}

export function tableOf(m: IdMint, form: TableForm) {
  const compact = form === 'compact';
  const ids = m.sorted.filter((x) => x.issued < 8000);
  const note = (x: MintedId) =>
    x.repeatOf ? 'made twice' : m.lateByTick.includes(x) ? 'sorts before an earlier id' : x.why === 'full' ? 'waited for a tick' : '';
  const head = compact
    ? ['#', 'timestamp · G · seq', 'Made', 'Note']
    : ['#', 'Id', 'Made by', 'Made at', 'Timestamp', 'Gen', 'Seq', 'Waited', 'Note'];
  const rows = ids
    .slice(0, 60)
    .map((x, i) =>
      compact
        ? [String(i + 1), `${tsShort(x)} · ${x.number} · ${formatInt(x.seq)}`, formatIdMs(x.issued), note(x)]
        : [
            String(i + 1),
            formatInt(x.id),
            `G${x.lane}`,
            formatIdMs(x.issued),
            formatInt(x.ts),
            String(x.number),
            formatInt(x.seq),
            x.wait > 0 ? formatIdMs(x.wait) : '',
            note(x),
          ],
    );
  const more = ids.length > rows.length ? ` The first ${rows.length} of ${formatInt(ids.length)} are listed.` : '';
  return {
    compact,
    head,
    rows,
    note: `Ids made in the first 8 ms of the stated clock, in id order.${more} The index strip under the chart is an illustration from one seeded draw.`,
  };
}
