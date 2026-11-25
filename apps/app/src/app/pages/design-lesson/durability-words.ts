import {
  DURABILITY_ALONE_HOURS,
  DURABILITY_CHALLENGE_BOUNDS,
  DURABILITY_CHALLENGE_STORED,
  DURABILITY_DATA_TB,
  DURABILITY_DISK_TB,
  DURABILITY_DISK_WRITE_GBPS,
  DURABILITY_RACK_EVENT,
  bigCount,
  durabilityFailedIndex,
  formatAbout,
  formatAfr,
  formatBillion,
  formatFew,
  formatGbps,
  formatNinesCount,
  formatOverhead,
  formatPerYear,
  formatRatio,
  formatRepairHours,
  formatTB,
  formatWhole,
  listOf,
  oneIn,
  ordinalWord,
  plural,
  sig2,
  type DurabilityPlayKind,
  type DurabilityPlayState,
  type DurabilityScenario,
  type DurabilityStep,
} from '@grasp/engine';
import { tableWidth } from './storage-text';

/**
 * What an open question hides, on every surface: one map from the regions a question names in its own `hide` list.
 * `steps`, while it asks and plays, hides the model's factors (the walk's rows, the window's chance in the race's
 * sentence); `after`, while the answer plays, hides everything the model says at the act's new setting: the steps and
 * the yearly loss (the headline's nines, the last row, the summary's, readout's and facts' numbers); `reads`, while the
 * answer plays, hides the rebuild's reads (the stubs, dots and blocks, their words, the facts' read clause, the race's
 * "read from"). A lost object has nothing to read, so "nothing is left to rebuild from" shows whatever hides. No ghost
 * of an earlier setting shows while a question is open, every control waits, and so does Describe.
 */
export interface Hid {
  steps: boolean;
  loss: boolean;
  reads: boolean;
  ghost: boolean;
  waits: boolean;
}
export type HidFlag = keyof Hid;
export type QuestionPhase = 'rest' | 'asking' | 'playing' | 'revealed';

/** `leak` switches flags off, for the no-answer sweep to prove it catches each one. */
export function hiding(hide: readonly string[], phase: QuestionPhase, leak: readonly HidFlag[] = []): Hid {
  const h = new Set(hide);
  const open = phase === 'asking' || phase === 'playing';
  const after = phase === 'playing' && h.has('after');
  const map: Hid = {
    steps: open && (h.has('steps') || after),
    loss: after,
    reads: phase === 'playing' && h.has('reads'),
    ghost: open,
    waits: open,
  };
  for (const flag of leak) map[flag] = false;
  return map;
}
export const NOTHING_HIDDEN = hiding([], 'rest');

export const WAIT_NOTICE = 'Play, Stage a loss and the settings wait for your answer.';
export const ANSWER_HELD = 'Watch the picture: the answer plays out on it.';

const SC = (m: DurabilityScenario) => m.scheme.short;
const schemeName = (m: DurabilityScenario) => `${SC(m)}${m.replicas ? '' : ' erasure coding'}`;
export const pieceWord = (m: DurabilityScenario, n = 2) => (m.replicas ? plural(n, 'copy', 'copies') : plural(n, 'piece', 'pieces'));
export const failedName = (m: DurabilityScenario) => m.pieces[durabilityFailedIndex(m)].id;

function storedWords(m: DurabilityScenario): string {
  if (m.replicas) return `${m.n} full copies, ${formatOverhead(m.overhead)} its size`;
  const part = m.need === 6 ? 'sixth' : 'tenth';
  return `${m.n} pieces, ${m.need} of data and ${m.t} of parity, each a ${part} of its size: ${formatOverhead(m.overhead)} in all`;
}
const placeWords = (m: DurabilityScenario) =>
  m.settings.rack
    ? `every ${pieceWord(m, 1)} on its own disk, all in one rack`
    : `every ${pieceWord(m, 1)} on its own disk in its own rack`;
/** Objects lost a year among a billion, said as the average it is. */
export const billionWords = (m: DurabilityScenario) => `on average ${formatBillion(m.perBillion)}`;

/** The stage's summary, in full sentences, obeying `hiding()`. */
export function summary(m: DurabilityScenario, hid: Hid): string {
  const s = m.settings;
  const a = `One object stored as ${schemeName(m)}: ${storedWords(m)}, ${placeWords(m)}. Disks fail independently at ${formatAfr(s.afr)} a year, and a lost ${pieceWord(m, 1)} is detected and rebuilt in ${formatRepairHours(s.repair)}. It survives any ${m.t} lost ${pieceWord(m, m.t)}.`;
  if (hid.loss) return `${a} The model’s yearly loss shows after your answer.`;
  return `${a} The model gives ${formatNinesCount(m.nines)} nines, a yearly loss chance of ${oneIn(m.loss)}: among a billion such objects, ${billionWords(m)}.`;
}

/** One sentence for a setting: the notice after a change, after a reveal and when the challenge opens. */
export function settingSentence(m: DurabilityScenario): string {
  const s = m.settings;
  return `Stored as ${schemeName(m)} at ${formatAfr(s.afr)} a year with ${formatRepairHours(s.repair)} repairs${s.rack ? ', all in one rack' : ''}: ${formatNinesCount(m.nines)} nines, ${billionWords(m)} among a billion objects, at ${formatOverhead(m.overhead)} storage.`;
}

/** The one-column layout's readout under the controls. */
export function readoutText(m: DurabilityScenario, hid: Hid): string {
  const loss = hid.loss ? '? nines' : `${formatNinesCount(m.nines)} nines, ${billionWords(m)} among a billion`;
  return `Stored as ${SC(m)}, ${formatOverhead(m.overhead)} · ${loss}`;
}

/** The clause every rebuild faster than one disk writes prints: what makes the window physically possible. */
export const SPREAD = 'in parallel on many other disks';

/** The race's sentence: what the drawn repair is, and what a loss would take. */
export function raceSentence(m: DurabilityScenario, ps: DurabilityPlayState, kind: DurabilityPlayKind, hid: Hid): string {
  const s = m.settings;
  const f = failedName(m);
  const others = m.n - 1;
  if (kind === 'staged' && s.rack) {
    if (!ps.lost) return 'Staged, not sampled: a rack event is coming.';
    return `Staged, not sampled: a rack event destroys the one rack and every ${pieceWord(m, 1)} in it at once, before any repair can start, so nothing is left to rebuild from. A rack event is assumed here once in ${formatWhole(1 / DURABILITY_RACK_EVENT)} years.`;
  }
  if (kind === 'staged') {
    const names = ps.stagedDown.map((i) => m.pieces[i].id);
    const verb = names.length === 1 ? 'fails' : 'fail';
    if (!ps.failed) return 'Staged, not sampled: a loss is coming.';
    if (!ps.lost)
      return `Staged, not sampled: ${f} fails, and its repair starts.${names.length ? ` Then ${listOf(names)} ${verb} too.` : ''}`;
    const left = m.n - 1 - names.length;
    const chance = hid.steps ? '' : ` A first failure leads here about once in ${bigCount(1 / m.tail)} times.`;
    return m.replicas
      ? `Staged, not sampled: ${f} fails, and before its ${formatRepairHours(s.repair)} repair ends ${listOf(names)} ${verb} too. No copy is left: the object is lost.${chance}`
      : `Staged, not sampled: ${f} fails, and before its ${formatRepairHours(s.repair)} repair ends ${listOf(names)} ${verb} too. Only ${left} pieces are left, and any rebuild needs ${m.need}: the object is lost.${chance}`;
  }
  if (!ps.failed)
    return `Every ${pieceWord(m, 1)} is whole. Play a repair: a disk fails, and its ${pieceWord(m, 1)} is rebuilt on a free disk.`;
  const rack = s.rack ? ` All ${m.n} share one rack: a rack event would take them at once.` : '';
  if (!ps.rebuilt && ps.progress === 0)
    return `${f} fails, and its ${formatRepairHours(s.repair)} repair starts: a free disk will take its place.${rack}`;
  const reads = hid.reads ? '' : `, read from ${m.replicas ? 'a surviving copy' : `${m.repairRead} of the others`}`;
  const spread = m.spread ? `, while the rest of the failed disk is rebuilt ${SPREAD}` : '';
  const head = ps.rebuilt
    ? `${f} is rebuilt on a free disk in ${formatRepairHours(s.repair)}${reads}${spread}.`
    : `${f} is being rebuilt on a free disk${reads}${spread}.`;
  const need =
    m.t === m.n - 1
      ? m.t === 1
        ? 'the other copy'
        : m.t === 2
          ? 'both other copies'
          : `all ${others} others`
      : `${m.t} of the ${others} others`;
  const chance = hid.steps
    ? ' The chance of that shows after your answer.'
    : ` ${others === 1 ? 'It' : 'Each'} fails within ${formatRepairHours(s.repair)} with chance ${oneIn(m.p)}, so in a typical repair ${others === 1 ? 'it does not' : 'none does'}.`;
  return `${head} A loss would need ${need} to fail before it ends.${chance}${rack}`;
}

/** The facts at the stage's foot: the cost of a billion objects, the rebuild's reads, and what a short window takes. */
export function factsSentence(m: DurabilityScenario, hid: Hid, ghost: DurabilityScenario | null): string {
  const s = m.settings;
  const cost = `A billion 1 MB objects, ${formatTB(DURABILITY_DATA_TB)}, take ${formatTB(m.rawTB)} on ${formatWhole(m.disks)} disks of ${formatTB(DURABILITY_DISK_TB)}; at ${formatAfr(s.afr)}, about ${formatFew(m.failsYear)} of them ${formatFew(m.failsYear) === '1' ? 'fails' : 'fail'} a year.`;
  const reads = hid.reads
    ? ' The rebuild’s reads show after your answer.'
    : ` Each rebuild reads ${formatTB(m.rebuildTB)}: ${formatGbps(m.rebuildGbps)} to finish in ${formatRepairHours(s.repair)}.`;
  const alone = ` One disk writes about ${formatGbps(DURABILITY_DISK_WRITE_GBPS)}, so a ${formatTB(DURABILITY_DISK_TB)} disk refilled alone takes ${formatAbout(DURABILITY_ALONE_HOURS)}; a faster repair spreads the lost pieces over many disks, each rebuilt in parallel.`;
  const before = ghost && !hid.ghost && !hid.loss ? ` Before this change: ${formatNinesCount(ghost.nines)} nines.` : '';
  return cost + reads + alone + before;
}

/** Describe's note on the steps against the exact model, computed for the setting. */
export function exactWords(m: DurabilityScenario): string {
  if (m.replicas) return 'For copies the steps are the model exactly: a loss needs every other copy.';
  const pct = Math.abs(m.exactGap) * 100;
  const said = pct < 0.01 ? 'under 0.01%' : `${String(Number(sig2(pct).toFixed(2)))}%`;
  return `The steps multiply the leading term of the model; its exact sum also weighs the other pieces surviving the window and the rarer cases of more failures, ${said} ${m.exactGap < 0 ? 'less' : 'more'} here.`;
}

export type StepRow = DurabilityStep | { kind: 'rack' } | { kind: 'final' };

/** A step row's words, longest first: the stage's rows and Describe's row heads both take them. */
export function stepWords(m: DurabilityScenario, row: StepRow, hidLoss = false): string[] {
  const s = m.settings;
  const win = formatRepairHours(s.repair);
  if (row.kind === 'first')
    return [
      `First failures: ${m.n} ${pieceWord(m, m.n)} × ${formatAfr(s.afr)} a year`,
      `First failures: ${m.n} × ${formatAfr(s.afr)}`,
      'First failures',
    ];
  if (row.kind === 'window') {
    if (row.i === 1)
      return [
        `A given other ${pieceWord(m, 1)} fails before the ${win} repair ends`,
        `Another fails within ${win}`,
        `One more within ${win}`,
      ];
    return [`And a ${ordinalWord(row.i)} given ${pieceWord(m, 1)}`, `And a ${ordinalWord(row.i)}`];
  }
  if (row.kind === 'ways') {
    if (m.ways === 1)
      return [
        `One choice only: ${m.t === 1 ? 'the other copy' : m.t === 2 ? 'both other copies' : `all ${m.t} other copies`}`,
        'One choice only',
      ];
    return [`Any ${m.t} of the ${m.n - 1} others will do`, `Any ${m.t} of the ${m.n - 1}`, `Any ${m.t} of ${m.n - 1}`];
  }
  if (row.kind === 'rack') {
    const years = `once in ${formatWhole(1 / DURABILITY_RACK_EVENT)} years`;
    return [`Or a rack event (assumed), ${years}`, 'Or a rack event (assumed)', `Or a rack event, ${years}`, 'Rack event'];
  }
  if (hidLoss) return ['Lost in a year'];
  const rack = !s.rack
    ? ['', '']
    : m.rack >= m.indep
      ? [', set by the rack event (assumed)', ' (rack event)']
      : [', with the rack event (assumed)', ' (with rack event)'];
  return [
    `Lost in a year: ${oneIn(m.loss)}${rack[0]}`,
    `Lost a year: ${oneIn(m.loss)}${rack[0]}`,
    `Lost a year: ${oneIn(m.loss)}${rack[1]}`,
  ];
}

/** A step's value as its row prints it. */
export function stepValue(row: DurabilityStep): string {
  if (row.kind === 'first') return formatPerYear(row.level);
  if (row.kind === 'window') return `× ${oneIn(row.factor)}`;
  return `× ${formatWhole(row.factor)}`;
}

/** The rebuild's reads, in words, longest first: the stubs and the read blocks (one a piece read, each a disk) say the same. */
export function readWords(m: DurabilityScenario): string[] {
  const what = m.replicas ? '1 copy' : `${m.repairRead} pieces`;
  const read = formatTB(m.rebuildTB);
  const disk = formatTB(DURABILITY_DISK_TB);
  return [
    `the rebuild reads ${what}: ${read} for a ${disk} disk`,
    `reads ${what}: ${read} for a ${disk} disk`,
    `${read} read for a ${disk} disk`,
    `${read} read`,
  ];
}

export const ratioWords = (now: DurabilityScenario, before: DurabilityScenario) =>
  now.loss >= before.loss ? `${formatRatio(now.loss / before.loss)} likelier` : `${formatRatio(before.loss / now.loss)} less likely`;

/** The standing note under the stage: the model's assumptions and what it leaves out. */
export function noteText(m: DurabilityScenario): string {
  const rack = m.settings.rack
    ? ` Here every ${pieceWord(m, 1)} shares one rack, and a rack event, assumed once in ${formatWhole(1 / DURABILITY_RACK_EVENT)} years, destroys them all.`
    : '';
  return `The model: disks fail independently at a constant rate, a lost piece is rebuilt in a fixed window, and the object is lost only when more pieces fail inside that window than the scheme tolerates. Real failures come together: a rack, a power event, a bad batch of disks or a software bug can take many pieces at once, which makes real losses far likelier than these nines. A latent bad sector, found only when a rebuild reads it, is one more failure inside the window, which is why systems scrub their disks to find them first. And durability is not backup: a delete or a bad overwrite reaches every piece.${rack}`;
}

/** The challenge's status, each bound in the ask's own terms with its state in words. */
export function goalChecks(m: DurabilityScenario): { text: string; met: boolean }[] {
  const b = DURABILITY_CHALLENGE_BOUNDS;
  const said = (met: boolean) => (met ? 'met' : 'not yet');
  const a = m.perBillion < b.perBillion;
  const o = m.overhead < b.overhead;
  const g = m.rebuildGbps < b.rebuildGbps;
  return [
    { met: a, text: `${billionWords(m)} among a billion, fewer than 1 every ${formatWhole(1 / b.perBillion)} years: ${said(a)}` },
    { met: o, text: `stored at ${formatOverhead(m.overhead)}, at most ${formatOverhead(DURABILITY_CHALLENGE_STORED)}: ${said(o)}` },
    { met: g, text: `a rebuild reads ${formatGbps(m.rebuildGbps)}, under ${formatGbps(b.rebuildGbps)}: ${said(g)}` },
  ];
}

/**
 * Under Reduced motion, Play steps a play's moments, each its own picture and sentence: the failure, mid-repair, the
 * end. A staged loss that needs one more failure has no middle (the failure that ends it is the end), and a rack event
 * strikes every piece at once, so its staged loss is one moment, its end.
 */
export const momentsOf = (m: DurabilityScenario, kind: DurabilityPlayKind) =>
  kind !== 'staged' ? 3 : m.settings.rack ? 1 : m.t >= 2 ? 3 : 2;
export const momentLabel = (k: number, of: number) => `Next moment, ${k + 1} of ${of}`;

export interface ControlState {
  /** A question is open: the controls wait for its answer. */
  locked: boolean;
  /** A play runs with motion. */
  running: boolean;
  /** Under Reduced motion, the moment last stepped to, of `moments`. */
  step: number | null;
  moments: number;
  kind: DurabilityPlayKind;
}

/**
 * The Play disc's and the Stage a loss pill's words, longest first, and what each accessible name adds after the words
 * shown: a control's name always starts with its visible text.
 */
export function playLabel(c: ControlState): { forms: string[]; more: string } {
  if (c.step !== null) return { forms: [momentLabel(c.step + 1, c.moments), `Next, ${c.step + 2} of ${c.moments}`], more: '' };
  if (c.running)
    return {
      forms: c.kind === 'staged' ? ['Staging a loss', 'Staging'] : ['Repairing', 'Repairing'],
      more: c.locked ? ': your answer plays' : ', press to stop',
    };
  return { forms: ['Play a repair', 'Repair'], more: c.locked ? ', after your answer' : '' };
}
export function stageLabel(c: ControlState): { forms: string[]; more: string } {
  const forms = ['Stage a loss', 'Stage loss'];
  if (c.locked) return { forms, more: ', after your answer' };
  if (c.kind === 'staged' && c.step !== null) return { forms, more: `: next moment, ${c.step + 2} of ${c.moments}` };
  if (c.kind === 'staged' && c.running) return { forms, more: ', press to stop' };
  if (c.kind === 'staged') return { forms, more: ', press to clear it' };
  return { forms, more: ': a loss played on purpose, not sampled from the model' };
}

/**
 * Describe: a row per step of the model and the yearly loss, its heads the stage's own row words (the middle form, the
 * shortest when compact). It takes the widest form that fits `boxW` unbroken.
 */
export function describeTable(m: DurabilityScenario, boxW: number) {
  const full = tableOf(m, false);
  return tableWidth(full.head, full.rows) <= boxW ? full : tableOf(m, true);
}

export function tableOf(m: DurabilityScenario, compact: boolean) {
  const nines = (level: number) => formatNinesCount(-Math.log10(level));
  const head = compact ? ['Step', 'Factor', 'Nines'] : ['Step', 'Factor', 'Chance a year', 'Nines'];
  const rows = m.steps.map((st) => {
    const forms = stepWords(m, st);
    const name = compact ? forms[forms.length - 1] : forms[Math.min(1, forms.length - 1)];
    const chance = st.level >= 0.01 ? formatPerYear(st.level) : oneIn(st.level);
    return compact ? [name, stepValue(st), nines(st.level)] : [name, stepValue(st), chance, nines(st.level)];
  });
  if (m.settings.rack) {
    const years = `once in ${formatWhole(1 / DURABILITY_RACK_EVENT)} years`;
    const share = `${oneIn(DURABILITY_RACK_EVENT)} a year`;
    const rackForms = stepWords(m, { kind: 'rack' });
    rows.push(
      compact
        ? [rackForms[rackForms.length - 1], share, nines(DURABILITY_RACK_EVENT)]
        : [rackForms[1], years, share, nines(DURABILITY_RACK_EVENT)],
    );
  }
  rows.push(
    compact
      ? ['Lost in a year', oneIn(m.loss), formatNinesCount(m.nines)]
      : ['Lost in a year', 'the exact model', oneIn(m.loss), formatNinesCount(m.nines)],
  );
  return { compact, head, rows, active: rows.length - 1 };
}
