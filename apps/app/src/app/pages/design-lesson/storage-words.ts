import {
  STORAGE_BLOOM_BITS,
  STORAGE_CHALLENGE_BOUNDS,
  STORAGE_MEMTABLE_MB,
  STORAGE_OP,
  STORAGE_PAGE_FILL,
  STORAGE_PAGE_KB,
  STORAGE_RATIOS,
  STORAGE_SETTINGS,
  STORAGE_WRITE_MBPS,
  formatAmp,
  formatB,
  formatBytes,
  formatCount,
  formatGb,
  formatKb,
  formatLevels,
  formatRate,
  formatReads,
  formatSize,
  formatSlot,
  formatSpace,
  storageScenario,
  type StorageScenario,
  type StorageSettings,
} from '@grasp/engine';
import { departures, planOf, type Engine } from './storage-motion';
import { tableWidth } from './storage-text';

/**
 * What an open question hides, on every surface: one map from the regions a question names in its own `hide` list.
 * `btreeWrite` and `lsmWrite` hide one engine's write cost (its numbers while the question asks and while its answer
 * plays, and while it asks the marks that would draw the answer: the page written back, the level's merges).
 * `writesAfter` hides both engines' write numbers while the answer plays at the act's new setting, `readsAfter` the LSM
 * tree's lookup numbers there, and `readsWhy`, while the question asks, the lookup's arithmetic. No ghost of an earlier
 * setting shows while a question is open, and every control waits.
 */
export interface Hid {
  btNumbers: boolean;
  btMarks: boolean;
  lsmNumbers: boolean;
  lsmMarks: boolean;
  readNumbers: boolean;
  readWhy: boolean;
  /** A hidden read row's dashed box spans the row's whole scale, never the hidden count. */
  pipBox: boolean;
  ghost: boolean;
  locked: boolean;
}
export type HidFlag = keyof Hid;
export type QuestionPhase = 'rest' | 'asking' | 'playing' | 'revealed';

/** `leak` switches flags off, for the no-answer sweep to prove it catches each one. */
export function hiding(hide: readonly string[], phase: QuestionPhase, leak: readonly HidFlag[] = []): Hid {
  const h = new Set(hide);
  const asking = phase === 'asking';
  const playing = phase === 'playing';
  const open = asking || playing;
  const writesAfter = h.has('writesAfter') && playing;
  const map: Hid = {
    btNumbers: (h.has('btreeWrite') && open) || writesAfter,
    btMarks: h.has('btreeWrite') && asking,
    lsmNumbers: (h.has('lsmWrite') && open) || writesAfter,
    lsmMarks: h.has('lsmWrite') && asking,
    readNumbers: h.has('readsAfter') && playing,
    readWhy: h.has('readsWhy') && asking,
    pipBox: true,
    ghost: open,
    locked: open,
  };
  for (const flag of leak) map[flag] = false;
  return map;
}
export const NOTHING_HIDDEN = hiding([], 'rest');
/** Whether any number is hidden: Describe waits while one is. */
export const anyHidden = (hid: Hid) => hid.btNumbers || hid.lsmNumbers || hid.readNumbers || hid.readWhy;

export const plural = (n: number, one: string, many: string) => (n === 1 ? one : many);
const num = (v: number) => formatSlot({ value: v, unit: 'num' });
export const isWrite = (s: StorageSettings) => s.op === STORAGE_OP.write;
export const opWord = (s: StorageSettings) => (isWrite(s) ? 'write' : 'lookup');
export const ENGINE: Readonly<Record<Engine, string>> = { btree: 'B-tree', lsm: 'LSM tree' };
/** Where each family runs, as it runs there: Postgres's tables are not updated in place (only its indexes are B-trees), and Cassandra levels only with leveled compaction. */
export const ALSO: Readonly<Record<Engine, readonly string[]>> = {
  btree: ['InnoDB, SQLite, Postgres indexes', 'InnoDB, SQLite'],
  lsm: ['RocksDB; Cassandra with leveled compaction', 'RocksDB, LevelDB'],
};
export const DOES: Readonly<Record<Engine, string>> = { btree: 'sorted pages, updated in place', lsm: 'appended, then merged down' };
export const REST_NOTICE = "Change the workload or an engine's setting; each Play follows the write or the lookup through its engine.";
export const WAIT_NOTICE = 'Play and every setting wait for your answer.';
export const answerNotice = (engine: Engine) => `Your answer is in. It plays on the ${ENGINE[engine]}; the numbers show at the reveal.`;
/**
 * Whether the model's (ratio + 1) / 2 rewrites at level `j` (from 1) are its own charge, not what the drawn level takes:
 * levels are sized from the bottom up, so L1 may hold fewer than `ratio` memtables and fill after fewer merges.
 */
export const chargedOnly = (m: StorageScenario, j: number) =>
  j === 1 && m.lsm.levelBytes[0] < m.settings.ratio * m.lsm.memtableBytes - 1e-6;

/** The workload, longest form first. */
export function premise(s: StorageSettings): string[] {
  const base = `${formatGb(s.data)} of records, ${formatBytes(s.record)} each`;
  return isWrite(s)
    ? [`${base}, rewritten at random at ${formatRate(STORAGE_WRITE_MBPS)}. Follow one write.`]
    : [`${base}. Follow one lookup, for a key last written long ago.`, `${base}. Follow one lookup of an old key.`];
}
/** Every workload a setting can print, for the lines the header reserves. */
export const ALL_PREMISES: readonly (readonly string[])[] = STORAGE_SETTINGS.filter((s) => s.page === 4 && s.ratio === 10 && s.bloom).map(
  premise,
);

/**
 * What a play is doing at its clock's moment, longest form first: it stands under the engine's name while the play runs
 * and is read out. No form carries a number the question hides.
 */
export function stepForms(engine: Engine, m: StorageScenario, frac: number, hid: Hid): string[] {
  const s = m.settings;
  const P = planOf(engine, m);
  const leave = departures(engine, m);
  const at = (k: string) => leave[k] ?? P[k];
  const write = isWrite(s);
  const steps: [number, string[]][] = [];
  if (engine === 'btree') {
    const h = m.btree.height;
    for (let k = 0; k < h - 1; k++)
      steps.push([
        at(`walk${k}`),
        k === 0 ? ['at the root, in memory'] : [`level ${k + 1} of ${h}, in memory`, `level ${k + 1}, in memory`],
      ]);
    steps.push([at(`walk${h - 1}`), write ? ['its leaf, read from disk', 'leaf read from disk'] : ['the leaf, read from disk']]);
    if (write) {
      steps.push([P['slice'], hid.btNumbers ? ['its record changed'] : [`its record changed, ${formatB(s.record)}`, 'its record changed']]);
      steps.push([P['log'], ['a log record appended: the write is safe and answered', 'log appended: answered']]);
      steps.push([P['page'], ['later, the whole page written back', 'later, the page written back']]);
    } else steps.push([P['slice'], ['the record found in the page']]);
  } else {
    const L = m.lsm.levels;
    if (write) {
      steps.push([P['log'], ['appended to the log: no read first', 'appended to the log']]);
      steps.push([P['mem'], ['in the memtable too: safe and answered', 'in the memtable: answered']]);
      steps.push([
        at('run0'),
        [
          `later, memtable full after ${formatCount(Math.round(m.lsm.recordsPerMemtable))} writes: flushed`,
          'later, memtable full: flushed',
        ],
      ]);
      for (let j = 1; j <= L; j++)
        steps.push([
          at(`run${j}`),
          hid.lsmNumbers
            ? [`later, merged down into L${j}`]
            : chargedOnly(m, j)
              ? [
                  `later, merged into L${j}; the model charges ≈${num(m.lsm.rewritesPerLevel)}× there`,
                  `merged into L${j}; model: ≈${num(m.lsm.rewritesPerLevel)}×`,
                  `later, merged into L${j}`,
                ]
              : [`later, merged into L${j}, ≈${num(m.lsm.rewritesPerLevel)}× there on average`, `later, merged into L${j}`],
        ]);
      steps.push([
        P['stair0'],
        [`L2 fills over ${s.ratio} merges; the record is rewritten in each one after it arrives`, `L2 fills over ${s.ratio} merges`],
      ]);
      steps.sort((a, b) => a[0] - b[0]);
    } else {
      steps.push([P['mem'], ['the memtable: not here']]);
      for (let j = 0; j <= L; j++)
        steps.push([at(`run${j}`), s.bloom && j < L ? [`L${j}: its filter says "not here"`, `L${j}: skipped`] : [`L${j}: read from disk`]]);
      steps.push([P['found'], [`found in L${L}`]]);
    }
  }
  return steps.filter(([t]) => frac >= t - 1e-9).at(-1)?.[1] ?? [write ? 'a write arrives' : 'a lookup arrives'];
}

/** What a play did, in order: the notice after a play and the Reduced-motion story. Every number is written out. */
export function story(engine: Engine, m: StorageScenario, hid: Hid = NOTHING_HIDDEN): string {
  const s = m.settings;
  const b = m.btree;
  const l = m.lsm;
  if (engine === 'btree') {
    const walk = `walks ${b.height} pages from the root to a leaf, ${b.memoryHops} of them in memory`;
    if (!isWrite(s)) return `The lookup ${walk}, and reads the leaf from disk: ${formatReads(b.lookupReads)}.`;
    if (hid.btNumbers)
      return `The write ${walk}, reads its leaf from disk, changes its record there and appends a log record: the write is safe and answered. Later the page goes back to disk. The bytes show at the reveal.`;
    return `The write ${walk}, reads its leaf from disk, changes ${formatBytes(s.record)} there and appends ${formatBytes(b.logBytes)} to the log: the write is safe and answered. Later the whole page goes back to disk, ${formatBytes(b.pageB)}: ${formatBytes(b.writeBytes)} written for ${formatBytes(s.record)} of data, ${formatAmp(b.writeAmp)}.`;
  }
  if (!isWrite(s)) {
    if (hid.readNumbers) return 'The lookup checks the memtable, then goes down the runs on disk. The count shows at the reveal.';
    if (hid.readWhy)
      return `The lookup checks the memtable, then asks the bloom filter of each run on disk, and reads the last level: ${formatReads(l.lookupReads)}.`;
    return s.bloom
      ? `The lookup checks the memtable, then asks the bloom filter of each run, in memory: ${l.skipped} runs say "not here", and only the last level is read from disk: ${formatReads(l.lookupReads)}.`
      : `The lookup checks the memtable, then reads every run on disk in turn, the flushed run and ${formatLevels(l.levels)}, until the last level turns the key up: ${formatReads(l.lookupReads)}.`;
  }
  const answered = 'The write is appended to the log and kept in the memtable, with no read first: it is safe and answered.';
  if (hid.lsmNumbers)
    return `${answered} Later it is flushed to disk when the memtable fills, then merged down through ${formatLevels(l.levels)}. The count shows at the reveal.`;
  return `${answered} Later, when the ${formatSize(l.memtableBytes)} memtable fills, it is flushed to disk as one sorted run, and compaction merges the record down through ${formatLevels(l.levels)}, rewriting it about ${num(l.rewritesPerLevel)} times at each level in the model: ${formatAmp(l.writeAmp)} the data in all.`;
}

/** One sentence for a setting: the notice after a change, after a reveal and when the challenge opens. */
export function settingSentence(m: StorageScenario, hid: Hid = NOTHING_HIDDEN): string {
  const s = m.settings;
  const b = m.btree;
  const l = m.lsm;
  const filters = `bloom filters ${s.bloom ? 'on' : 'off'}`;
  const bt = hid.btNumbers
    ? `The B-tree has ${formatKb(s.page)} pages`
    : `The B-tree, with ${formatKb(s.page)} pages, writes ${formatAmp(b.writeAmp)} the data, and a lookup reads ${b.lookupReads} ${plural(b.lookupReads, 'page', 'pages')} from disk`;
  const ls =
    hid.lsmNumbers || hid.readNumbers
      ? `the LSM tree has ${formatLevels(l.levels)} at ratio ${s.ratio}, ${filters}`
      : `the LSM tree, with ${formatLevels(l.levels)} at ratio ${s.ratio} and ${filters}, writes ${formatAmp(l.writeAmp)}, and a lookup reads ${l.lookupReads} ${plural(l.lookupReads, 'run', 'runs')}`;
  return `${bt}; ${ls}.`;
}

/** The stage's summary, in full sentences, obeying `hiding()`. */
export function summary(m: StorageScenario, hid: Hid): string {
  const s = m.settings;
  const b = m.btree;
  const l = m.lsm;
  return [
    `A B-tree and an LSM tree each hold ${formatGb(s.data)} of data in records of ${formatBytes(s.record)}; the stage follows one ${opWord(s)} through both.`,
    `B-tree, ${formatKb(s.page)} pages: each page points to about ${b.fanout} children, so ${b.height} levels hold the data, ${b.memoryHops} of them cached in memory.`,
    hid.btNumbers
      ? 'Its write cost shows after your answer.'
      : `An update writes its whole page and a log record, ${formatBytes(b.writeBytes)} for ${formatBytes(s.record)}: ${formatAmp(b.writeAmp)} the data. A lookup costs ${formatReads(b.lookupReads)}.`,
    `LSM tree, size ratio ${s.ratio}, bloom filters ${s.bloom ? 'on' : 'off'}: a flushed run and ${formatLevels(l.levels)} on disk.`,
    hid.lsmNumbers
      ? 'Its write cost shows after your answer.'
      : `A record is written once to the log, once at the flush and about ${num(l.rewritesPerLevel)} times at each level in the model: ${formatAmp(l.writeAmp)} the data.`,
    hid.readNumbers ? "Its lookup's cost shows at the reveal." : `A lookup costs ${formatReads(l.lookupReads)}.`,
    `Disk used: about ${formatSpace(b.spaceAmp)} the live data for the B-tree, at most ${formatSpace(l.spaceAmp)} for the LSM tree.`,
    'A rough model.',
  ].join(' ');
}

export const MODEL_NOTE = `A rough model. B-tree: every update writes its whole page back alone, plus a log record (its leaf is read from disk first when it is not in memory; that read is not counted); InnoDB's doublewrite buffer and Postgres's full-page log images can write a page twice, and the model counts it once; pages are about ${Math.round(STORAGE_PAGE_FILL * 100)}% full; every level above the leaves stays in memory. LSM tree: a ${STORAGE_MEMTABLE_MB} MB memtable; one log write, one flush, then about (ratio + 1) / 2 rewrites at each level, on average, as if each level filled over ratio merges from above, then emptied (L1 often costs less); bloom filters take ${STORAGE_BLOOM_BITS} bits a key, and their false positives, about 1 lookup in 100 for each run, are left out; each run's block index stays in memory, as the B-tree's upper levels do, and is not drawn. The level bars share one log scale. New data arrives at ${formatRate(STORAGE_WRITE_MBPS)}.`;
/** The note states the model's assumptions, two of which are answers: it waits while a question is open. */
export const noteText = (hid: Hid) => (hid.locked ? 'A rough model. Its assumptions show after your answer.' : MODEL_NOTE);

/** The challenge's status: each bound in the ask's own terms, with its state in words. */
export function goalParts(m: StorageScenario): { text: string; met: boolean }[] {
  const b = STORAGE_CHALLENGE_BOUNDS;
  const said = (met: boolean) => (met ? 'met' : 'not yet');
  const w = m.lsm.writeAmp < b.lsmWrite;
  const r = m.lsm.lookupReads < b.lsmReads;
  const d = m.settings.data >= b.data;
  return [
    { met: w, text: `the LSM tree writes ${formatAmp(m.lsm.writeAmp)} the data, under ${formatAmp(b.lsmWrite)}: ${said(w)}` },
    { met: r, text: `a lookup costs ${formatReads(m.lsm.lookupReads)}, under ${b.lsmReads}: ${said(r)}` },
    { met: d, text: `the data is ${formatGb(m.settings.data)}, at least ${formatGb(b.data)}: ${said(d)}` },
  ];
}

export type TableForm = 'full' | 'short' | 'compact';

/**
 * Describe: a row for the B-tree at each page size and for the LSM tree at each size ratio, for this workload, the two
 * current rows marked. Its form is the widest that fits `boxW` unbroken: full, then with a one-word lookup head (the
 * note says whether filters are on), then compact, where every head is one token that may wrap and every cell a bare
 * number, rounded as the stage rounds it.
 */
export function describeTable(m: StorageScenario, boxW: number) {
  const full = tableOf(m, 'full');
  if (tableWidth(full.head, full.rows) <= boxW) return full;
  const short = tableOf(m, 'short');
  return tableWidth(short.head, short.rows) <= boxW ? short : tableOf(m, 'compact');
}

export function tableOf(m: StorageScenario, form: TableForm) {
  const s = m.settings;
  const compact = form === 'compact';
  const head = compact
    ? ['Engine', 'Levels', 'Write, ×', 'Reads', 'Disk, ×']
    : ['Engine', 'Levels', 'Written', 'Disk writes', form === 'full' ? `Lookup, filters ${s.bloom ? 'on' : 'off'}` : 'Lookup', 'Disk used'];
  const row = (name: string, levels: string, e: { writeAmp: number; diskWriteMBps: number; lookupReads: number; spaceAmp: number }) =>
    compact
      ? [name, levels, formatAmp(e.writeAmp).replace('×', ''), String(e.lookupReads), String(Number(e.spaceAmp.toFixed(2)))]
      : [name, levels, formatAmp(e.writeAmp), formatRate(e.diskWriteMBps), formatReads(e.lookupReads), formatSpace(e.spaceAmp)];
  const rows = [
    ...STORAGE_PAGE_KB.map((page) => {
      const b = storageScenario({ ...s, page }).btree;
      return row(compact ? `B-tree, ${formatKb(page)}` : `B-tree, ${formatKb(page)} pages`, String(b.height), b);
    }),
    // The B-tree's levels are its height, leaves included; the LSM tree's are its levels and the flushed run.
    ...STORAGE_RATIOS.map((ratio) => {
      const l = storageScenario({ ...s, ratio }).lsm;
      return row(compact ? `LSM, ratio ${ratio}` : `LSM tree, ratio ${ratio}`, compact ? `${l.levels}+L0` : `${l.levels} + L0`, l);
    }),
  ];
  const note = `Rows are this workload's: ${formatGb(s.data)} in records of ${formatBytes(s.record)}, bloom filters ${s.bloom ? 'on' : 'off'}. The LSM tree's disk use is an upper bound.`;
  return {
    compact,
    head,
    rows,
    active: (STORAGE_PAGE_KB as readonly number[]).indexOf(s.page),
    also: STORAGE_PAGE_KB.length + (STORAGE_RATIOS as readonly number[]).indexOf(s.ratio),
    note,
  };
}
