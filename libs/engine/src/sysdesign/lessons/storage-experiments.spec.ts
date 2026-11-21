import { describe, expect, it } from 'vitest';
import { goalMet, renderExperiment } from './experiments.js';
import { SD_LESSONS } from './index.js';
import { STORAGE_LESSON } from './storage.js';
import { STORAGE_CHALLENGE_BOUNDS, STORAGE_CHALLENGE_SOLUTION, STORAGE_EXPERIMENTS, STORAGE_SETUP } from './storage-experiments.js';
import { formatAmp } from './widgets/storage-format.js';
import { STORAGE_BASELINE, STORAGE_SETTINGS, lsmSteady, storageScenario, type StorageSettings } from './widgets/storage.js';

const shown = Object.fromEntries(STORAGE_EXPERIMENTS.map((e) => [e.id, renderExperiment(e)]));
const run = (s: StorageSettings) => storageScenario(s);
const actOf = (id: string) => {
  const e = shown[id];
  return run({ ...STORAGE_BASELINE, ...e.setup, ...(e.act && 'set' in e.act ? e.act.set : {}) } as StorageSettings);
};

/** The brief's wording, every number filled from the model. */
const EXPECTED: Record<string, { ask: string; choices: string[]; reveal: string }> = {
  'page-rewrite': {
    ask: 'A B-tree with 8 KB pages holds 100 GB of records, 100 bytes each. One record changes. By the time the change has reached disk both in the log and in its page, how many bytes has the engine written?',
    choices: [
      '100 bytes: only the record that changed',
      '200 bytes: the record, and a log record of the same size',
      '8,292 bytes: the whole page, and a log record',
    ],
    reveal:
      '8,292 bytes: a B-tree changes its page in place, and a page goes to disk whole: 8,192 bytes for a change of 100 bytes, plus a log record of 100 bytes so a crash can replay it. That is 82.9× the data. At 10 MB/s of updates of 100 bytes, that is about 105,000 page writes a second, each at a random place on the disk. With 16 KB pages it would be 165×. The model is rough: it has every update write its page back alone, where a real buffer pool often gathers several changes to a hot page first.',
  },
  'lsm-rewrites': {
    ask: 'An LSM tree never changes a file in place: a write is appended to the log and kept in the memtable, which is flushed to disk as a sorted file when it fills. Compaction then merges the record down through 3 levels; from L1 down, each is 20× the size of the one above. The model counts every level as if it fills over 20 merges from above, each rewriting everything the level already holds, and then empties into the next. How many times is a record written at each level, on average?',
    choices: ['1×: once, as a merge moves it down', '10.5×: in each merge after it arrives', '20×: in every merge that fills its level'],
    reveal:
      "10.5×: a record that arrives with the first merge is written in all 20, one that arrives with the last only once, so the average is (ratio + 1) / 2. With one write to the log and one at the flush, 3 levels of 10.5× make 33.5× the data. Every one of those writes is sequential, but the bytes add up: 10 MB/s of new data becomes 335 MB/s of disk writes, and when the disk cannot sustain that, compaction falls behind, files pile up and the engine stalls writes. The model empties each level into the next once it is full. RocksDB keeps every level near its target and merges one file at a time into about 20 times its size below, so its worst case is nearer 20× a level, and real trees measure between the two. Size-tiered compaction, Cassandra's default, merges runs of similar size instead: about one write a tier, but more runs to search and up to twice the space.",
  },
  'record-size': {
    ask: 'With records of 100 bytes, the B-tree writes 42× the data and the LSM tree 24×. Store the same 100 GB as records of 1,000 bytes instead. Whose write cost falls?',
    choices: [
      'Both: ten times the record, about a tenth of the cost',
      "Only the B-tree's: its page costs the same whatever changes inside it",
      "Only the LSM tree's: fewer, bigger records to merge",
    ],
    reveal:
      "Only the B-tree's: 5.1×, so it now writes less than the LSM tree's 24×. Writing a page costs the same 4,096 bytes whatever changed inside it, so a record of 1,000 bytes fills about a quarter of the page it rewrites, where one of 100 bytes filled about a fortieth. The LSM tree rewrites every byte the same number of times whatever the record size; its cost follows its levels. Small records favor the LSM tree, and at these settings the B-tree writes less once a record passes about 180 bytes.",
  },
  'no-filters': {
    ask: 'A lookup in this LSM tree costs 1 disk read: for each sorted run on disk, a bloom filter in memory says whether the run can hold the key. Turn the filters off, and look up a key that was last written long ago. What does the lookup cost now?',
    choices: [
      '5 disk reads: one in every run, from the newest down to the last level',
      '2 disk reads: the newest run, then the last level',
      '1 disk read: every run is sorted, so one search finds the key',
    ],
    reveal:
      '5 disk reads: the newest version of a key can sit in any run, so without filters the engine searches each in turn, the flushed run and then all 4 levels, and most keys rest in the last level, which holds about 90% of the data. With filters, 4 runs answer "not here" from memory and only the last is read. The filters take about 10 bits a key, 1.3 GB of memory here, and they cannot answer a range scan, which opens every run either way. The B-tree walks 5 pages, 4 of them in memory: 1 disk read, filters or not.',
  },
  'more-data': {
    ask: 'With 100 GB of data the B-tree writes 42× the data and the LSM tree 24×. The data grows to 1,000 GB, with the same records and settings. Whose write cost rises?',
    choices: [
      "Only the LSM tree's: it needs another level",
      "Only the B-tree's: its tree grows taller",
      'Both: more data makes both trees deeper',
    ],
    reveal:
      "Only the LSM tree's: 24× becomes 29.5×. Ten times the data needs one more level at ratio 10, 5 instead of 4, and every level adds about 5.5 rewrites. The B-tree still writes one page and one log record for an update, 42×, however much data sits around it, and its walk is still 5 pages, since every level multiplies its reach by about 179. Both pay in memory instead: the B-tree's cached upper levels grow from 822 MB to 8 GB, and the LSM tree's filters from 1.3 GB to 12.5 GB, on top of block indexes about as large as the B-tree's upper levels.",
  },
  'tune-ratio': {
    ask: 'This node has no memory to spare for bloom filters. Keep at least 100 GB of data, and choose the size ratio so that the LSM tree writes under 20× the data and a lookup costs under 7 disk reads.',
    choices: [],
    reveal:
      'Ratio 5: 5 levels of about 3 rewrites each, 17× the data, and a lookup reads 6 runs. At ratio 10 there are only 4 levels, but each rewrites a record about 5.5 times: 24×. At ratio 4 the tree writes the same 17× with 6 levels, so a lookup costs 7 disk reads. The size ratio trades the bytes compaction writes against the runs a read must search, and against space: at ratio 5 up to about 25% more disk holds versions waiting to be merged away, against about 11% at ratio 10.',
  },
};

describe('the Storage Engines experiments', () => {
  it('replace the lesson tryThis, in the order of the interview arc', () => {
    expect(SD_LESSONS['sd-storage'].widget.experiments).toBe(STORAGE_EXPERIMENTS);
    expect(SD_LESSONS['sd-storage'].widget.tryThis).toBeUndefined();
    expect(STORAGE_EXPERIMENTS.map((e) => e.id)).toEqual([
      'page-rewrite',
      'lsm-rewrites',
      'record-size',
      'no-filters',
      'more-data',
      'tune-ratio',
    ]);
    expect(STORAGE_EXPERIMENTS.map((e) => e.act)).toEqual([
      { run: 'btree' },
      { run: 'lsm' },
      { set: { record: 1000 }, run: 'btree' },
      { set: { bloom: 0 }, run: 'lsm' },
      { set: { data: 1000 }, run: 'lsm' },
      undefined,
    ]);
  });

  it('say what the brief says, with every number from the model', () => {
    for (const e of Object.values(shown)) {
      expect({ ask: e.ask, choices: e.choices, reveal: e.reveal }, e.id).toEqual(EXPECTED[e.id]);
    }
  });

  it('put the answers at 3, 2, 2, 1 and 1, the largest number right in E1 and E4 and wrong in E2', () => {
    expect(STORAGE_EXPERIMENTS.filter((e) => !e.goal).map((e) => renderExperiment(e).answer + 1)).toEqual([3, 2, 2, 1, 1]);
  });

  it('name every region they hide, and point the reveal at the regions it is about', () => {
    expect(STORAGE_EXPERIMENTS.map((e) => e.hide ?? [])).toEqual([
      ['btreeWrite'],
      ['lsmWrite'],
      ['writesAfter'],
      ['readsWhy', 'readsAfter'],
      ['writesAfter'],
      [],
    ]);
    expect(STORAGE_EXPERIMENTS.map((e) => e.focus)).toEqual([
      ['bt-transform', 'cost-write'],
      ['lsm-all'],
      ['bt-transform', 'cost-write'],
      ['lsm-stack', 'cost-read'],
      ['lsm-stack', 'cost-write'],
      [],
    ]);
  });

  it('never ask what the stage prints on load', () => {
    const base = run(STORAGE_BASELINE);
    const asked: [number, number][] = [
      [run(STORAGE_SETUP.update).btree.writeBytes, base.btree.writeBytes],
      [run(STORAGE_SETUP.update).btree.writeAmp, base.btree.writeAmp],
      [run(STORAGE_SETUP.compaction).lsm.rewritesPerLevel, base.lsm.rewritesPerLevel],
      [run(STORAGE_SETUP.compaction).lsm.writeAmp, base.lsm.writeAmp],
      [actOf('record-size').btree.writeAmp, base.btree.writeAmp],
      [actOf('no-filters').lsm.lookupReads, base.lsm.lookupReads],
      [actOf('more-data').lsm.writeAmp, base.lsm.writeAmp],
    ];
    for (const [a, b] of asked) expect(a).not.toBe(b);
  });

  it('hold the reveals to the model in their words', () => {
    const a = run(STORAGE_SETUP.record);
    const b = actOf('record-size');
    expect(Math.abs(1000 / b.btree.pageB - 0.25)).toBeLessThan(0.01);
    expect(Math.abs(a.btree.pageB / 100 - 40)).toBeLessThan(1.5);
    expect(b.lsm.writeAmp).toBe(a.lsm.writeAmp);
    expect(b.btree.writeAmp < b.lsm.writeAmp && a.btree.writeAmp > a.lsm.writeAmp).toBe(true);
    const c = run(STORAGE_SETUP.compaction);
    const steady = lsmSteady(c.settings);
    expect(Math.abs(steady.perLevel.at(-1)! - c.settings.ratio)).toBeLessThan(0.01);
    expect(steady.perLevel[0]).toBeLessThan(c.lsm.rewritesPerLevel);
    expect(Math.abs(steady.amp / c.lsm.writeAmp - 1)).toBeLessThan(0.08);
    expect(c.lsm.partsWritten / c.settings.ratio).toBe(c.lsm.rewritesPerLevel);
    expect(run({ ...STORAGE_SETUP.update, page: 16 }).btree.writeAmp).toBeGreaterThan(run(STORAGE_SETUP.update).btree.writeAmp);
    const g0 = run(STORAGE_SETUP.growth);
    const g1 = actOf('more-data');
    expect(g1.lsm.levels).toBe(g0.lsm.levels + 1);
    expect(g1.btree.height).toBe(g0.btree.height);
    expect(g1.btree.writeAmp).toBe(g0.btree.writeAmp);
    expect(g1.btree.memoryBytes).toBeGreaterThan(9 * g0.btree.memoryBytes);
    expect(g1.lsm.bloomBytes).toBeCloseTo(10 * g0.lsm.bloomBytes);
    const f = run(STORAGE_SETUP.filters);
    expect([f.lsm.skipped, f.lsm.runs]).toEqual([f.lsm.levels, f.lsm.levels + 1]);
    expect(Math.abs(f.lsm.lastShare - 0.9)).toBeLessThan(0.005);
    const sol = run({ ...STORAGE_SETUP.challenge, ...STORAGE_CHALLENGE_SOLUTION });
    const four = run({ ...STORAGE_SETUP.challenge, ...STORAGE_CHALLENGE_SOLUTION, ratio: 4 });
    expect(sol.lsm.writeAmp).toBe(four.lsm.writeAmp);
    expect(Number.isInteger(sol.lsm.rewritesPerLevel)).toBe(true);
  });

  it('leave every true figure and the challenge solution off the rest of the lesson page', () => {
    const l = STORAGE_LESSON;
    const page = [
      l.why,
      ...l.concepts.flatMap((c) => [c.title, c.body]),
      ...l.examples.flatMap((x) => [x.title, x.problem, x.insight, ...x.steps]),
      ...l.pitfalls,
      ...l.followUps.flatMap((f) => [f.question, f.answer]),
    ].join(' ');
    const figures = (t: string) => t.match(/\d+(?:,\d{3})*(?:\.\d+)?/g) ?? [];
    const onPage = (f: string) => new RegExp(`(?<![\\d.,])${f.replace(/[.,]/g, '\\$&')}(?![\\d]|[.,]\\d)`).test(page);
    // A figure a learner could not guess: a decimal, a thousands figure or a count above 10, that the ask does not state.
    const nonTrivial = (f: string) => /[.,]/.test(f) || Number(f) > 10;
    const found: string[] = [];
    for (const e of Object.values(shown)) {
      if (e.answer < 0) continue;
      const asked = new Set(figures(e.ask));
      for (const f of figures(e.choices[e.answer])) if (nonTrivial(f) && !asked.has(f) && onPage(f)) found.push(`${e.id}: ${f}`);
    }
    const sol = run({ ...STORAGE_SETUP.challenge, ...STORAGE_CHALLENGE_SOLUTION });
    if (onPage(String(sol.lsm.writeAmp))) found.push(`challenge: ${sol.lsm.writeAmp}`);
    if (new RegExp(`ratio (?:to |of )?${STORAGE_CHALLENGE_SOLUTION.ratio}\\b`).test(page)) found.push('challenge: its ratio');
    expect(found).toEqual([]);
  });

  it('set a challenge exactly one LSM configuration of the 24 passes: 100 GB at ratio 5, filters off', () => {
    const e = shown['tune-ratio'];
    const pass = STORAGE_SETTINGS.filter((s) => goalMet(e.goal!, run(s).metrics, s));
    expect(pass).toHaveLength(18);
    expect(pass.every((s) => s.data === 100 && s.ratio === 5 && s.bloom === 0)).toBe(true);
    const start = run(e.setup as StorageSettings);
    expect(goalMet(e.goal!, start.metrics, start.settings)).toBe(false);
    const solved = run({ ...STORAGE_SETUP.challenge, ...STORAGE_CHALLENGE_SOLUTION });
    expect(formatAmp(solved.lsm.writeAmp)).toBe('17×');
    expect(1 - solved.lsm.writeAmp / STORAGE_CHALLENGE_BOUNDS.lsmWrite).toBeCloseTo(0.15);
    expect(solved.lsm.lookupReads).toBe(6);
    // With the filters on the same tree meets the bounds, but not the goal: it keeps them off.
    const on = run({ ...solved.settings, bloom: 1 });
    expect(goalMet(e.goal!, on.metrics, on.settings)).toBe(false);
  });
});
