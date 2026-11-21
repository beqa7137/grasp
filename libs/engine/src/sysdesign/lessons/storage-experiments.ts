import { slotOf, word, type ExperimentGoal, type ExperimentSpec } from './experiments.js';
import { roundSignificant } from './widgets/storage-format.js';
import {
  STORAGE_BASELINE,
  STORAGE_BLOOM_BITS,
  STORAGE_OP,
  STORAGE_WRITE_MBPS,
  storageScenario,
  type StorageSettings,
} from './widgets/storage.js';

const amp = slotOf('amp');
const bytes = slotOf('bytes');
const size = slotOf('size');
const gb = slotOf('gb');
const kb = slotOf('kb');
const rate = slotOf('rate');
const pct = slotOf('pct');
const num = slotOf('num');
const reads = slotOf('reads');
const levels = slotOf('levels');

/**
 * E1 and E2 ask about another setting than the default, so the stage a learner sees on load never prints their
 * answers; E6 starts where its reveal's levels and rewrites are on the stage.
 */
export const STORAGE_SETUP = {
  update: { ...STORAGE_BASELINE, page: 8 },
  compaction: { ...STORAGE_BASELINE, ratio: 20 },
  record: { ...STORAGE_BASELINE },
  filters: { ...STORAGE_BASELINE, op: STORAGE_OP.read },
  growth: { ...STORAGE_BASELINE },
  challenge: { ...STORAGE_BASELINE, ratio: 20, bloom: 0, op: STORAGE_OP.write },
} as const satisfies Record<string, StorageSettings>;

const BIG_PAGE = 16;
const BIG_RECORD = 1000;
const BIG_DATA = 1000;

export const STORAGE_CHALLENGE_BOUNDS = { lsmWrite: 20, lsmReads: 7, data: 100 } as const;
export const STORAGE_CHALLENGE_GOAL: ExperimentGoal = {
  all: [
    { metric: 'lsmWrite', below: STORAGE_CHALLENGE_BOUNDS.lsmWrite },
    { metric: 'lsmReads', below: STORAGE_CHALLENGE_BOUNDS.lsmReads },
    { metric: 'data', atLeast: STORAGE_CHALLENGE_BOUNDS.data },
  ],
  keep: { bloom: 0 },
};
/** The one LSM configuration of the 24 that meets the challenge. */
export const STORAGE_CHALLENGE_SOLUTION = { data: 100, ratio: 5, bloom: 0 } as const;

const run = (s: StorageSettings) => storageScenario(s);
/** Whose write cost moved, in the words a choice holds its truth in. */
const whose = (bt: boolean, ls: boolean) => (bt && ls ? 'Both' : bt ? "Only the B-tree's" : ls ? "Only the LSM tree's" : 'Neither');

export const STORAGE_EXPERIMENTS: readonly ExperimentSpec[] = [
  {
    id: 'page-rewrite',
    title: 'One small update',
    setup: STORAGE_SETUP.update,
    act: { run: 'btree' },
    ask: 'A B-tree with {page} pages holds {data} of records, {record} each. One record changes. By the time the change has reached disk both in the log and in its page, how many bytes has the engine written?',
    choices: [
      { text: '{record}: only the record that changed', value: 'record' },
      { text: '{twice}: the record, and a log record of the same size', value: 'twice' },
      { text: '{written}: the whole page, and a log record', value: 'written' },
    ],
    truth: 'written',
    reveal:
      '{written}: a B-tree changes its page in place, and a page goes to disk whole: {pageB} for a change of {record}, plus a log record of {record} so a crash can replay it. That is {amp} the data. At {newData} of updates of {record}, that is about {randomWrites} page writes a second, each at a random place on the disk. With {bigPage} pages it would be {bigAmp}. The model is rough: it has every update write its page back alone, where a real buffer pool often gathers several changes to a hot page first.',
    focus: ['bt-transform', 'cost-write'],
    hide: ['btreeWrite'],
    slots: () => {
      const m = run(STORAGE_SETUP.update);
      const big = run({ ...STORAGE_SETUP.update, page: BIG_PAGE });
      return {
        page: kb(m.settings.page),
        data: gb(m.settings.data),
        record: bytes(m.settings.record),
        twice: bytes(2 * m.settings.record),
        written: bytes(m.btree.writeBytes),
        pageB: bytes(m.btree.pageB),
        amp: amp(m.btree.writeAmp),
        bigPage: kb(BIG_PAGE),
        bigAmp: amp(big.btree.writeAmp),
        newData: rate(STORAGE_WRITE_MBPS),
        randomWrites: num(roundSignificant(m.btree.randomWritesPerSec)),
      };
    },
  },
  {
    id: 'lsm-rewrites',
    title: 'Appended, then merged',
    setup: STORAGE_SETUP.compaction,
    act: { run: 'lsm' },
    ask: 'An LSM tree never changes a file in place: a write is appended to the log and kept in the memtable, which is flushed to disk as a sorted file when it fills. Compaction then merges the record down through {levels}; from L1 down, each is {ratio} the size of the one above. The model counts every level as if it fills over {ratioN} merges from above, each rewriting everything the level already holds, and then empties into the next. How many times is a record written at each level, on average?',
    choices: [
      { text: '{one}: once, as a merge moves it down', value: 'one' },
      { text: '{perLevel}: in each merge after it arrives', value: 'perLevel' },
      { text: '{ratio}: in every merge that fills its level', value: 'ratio' },
    ],
    truth: 'perLevel',
    reveal:
      "{perLevel}: a record that arrives with the first merge is written in all {ratioN}, one that arrives with the last only once, so the average is (ratio + 1) / 2. With one write to the log and one at the flush, {levels} of {perLevel} make {amp} the data. Every one of those writes is sequential, but the bytes add up: {newData} of new data becomes {disk} of disk writes, and when the disk cannot sustain that, compaction falls behind, files pile up and the engine stalls writes. The model empties each level into the next once it is full. RocksDB keeps every level near its target and merges one file at a time into about {ratioN} times its size below, so its worst case is nearer {ratio} a level, and real trees measure between the two. Size-tiered compaction, Cassandra's default, merges runs of similar size instead: about one write a tier, but more runs to search and up to twice the space.",
    focus: ['lsm-all'],
    hide: ['lsmWrite'],
    slots: () => {
      const m = run(STORAGE_SETUP.compaction);
      return {
        levels: levels(m.lsm.levels),
        ratio: amp(m.settings.ratio),
        ratioN: num(m.settings.ratio),
        perLevel: amp(m.lsm.rewritesPerLevel),
        amp: amp(m.lsm.writeAmp),
        one: amp(1),
        newData: rate(STORAGE_WRITE_MBPS),
        disk: rate(m.lsm.diskWriteMBps),
      };
    },
  },
  {
    id: 'record-size',
    title: 'Bigger records',
    setup: STORAGE_SETUP.record,
    act: { set: { record: BIG_RECORD }, run: 'btree' },
    ask: 'With records of {record}, the B-tree writes {btBefore} the data and the LSM tree {lsmBefore}. Store the same {data} as records of {bigRecord} instead. Whose write cost falls?',
    choices: [
      { text: '{both}: ten times the record, about a tenth of the cost', value: 'both' },
      { text: '{btree}: its page costs the same whatever changes inside it', value: 'btree' },
      { text: '{lsm}: fewer, bigger records to merge', value: 'lsm' },
    ],
    truth: 'outcome',
    reveal:
      "{btree}: {btAfter}, so it now writes less than the LSM tree's {lsmAfter}. Writing a page costs the same {pageB} whatever changed inside it, so a record of {bigRecord} fills about a quarter of the page it rewrites, where one of {record} filled about a fortieth. The LSM tree rewrites every byte the same number of times whatever the record size; its cost follows its levels. Small records favor the LSM tree, and at these settings the B-tree writes less once a record passes about {crossover}.",
    focus: ['bt-transform', 'cost-write'],
    hide: ['writesAfter'],
    slots: () => {
      const a = run(STORAGE_SETUP.record);
      const b = run({ ...STORAGE_SETUP.record, record: BIG_RECORD });
      return {
        record: bytes(a.settings.record),
        bigRecord: bytes(BIG_RECORD),
        data: gb(a.settings.data),
        btBefore: amp(a.btree.writeAmp),
        lsmBefore: amp(a.lsm.writeAmp),
        btAfter: amp(b.btree.writeAmp),
        lsmAfter: amp(b.lsm.writeAmp),
        pageB: bytes(a.btree.pageB),
        crossover: bytes(Math.round(b.crossoverRecordB / 10) * 10),
        outcome: word(whose(b.btree.writeAmp < a.btree.writeAmp, b.lsm.writeAmp < a.lsm.writeAmp)),
        both: word(whose(true, true)),
        btree: word(whose(true, false)),
        lsm: word(whose(false, true)),
      };
    },
  },
  {
    id: 'no-filters',
    title: 'Without bloom filters',
    setup: STORAGE_SETUP.filters,
    act: { set: { bloom: 0 }, run: 'lsm' },
    ask: 'A lookup in this LSM tree costs {readsOn}: for each sorted run on disk, a bloom filter in memory says whether the run can hold the key. Turn the filters off, and look up a key that was last written long ago. What does the lookup cost now?',
    choices: [
      { text: '{readsOff}: one in every run, from the newest down to the last level', value: 'readsOff' },
      { text: '{two}: the newest run, then the last level', value: 'two' },
      { text: '{readsOn}: every run is sorted, so one search finds the key', value: 'readsOn' },
    ],
    truth: 'readsOff',
    reveal:
      '{readsOff}: the newest version of a key can sit in any run, so without filters the engine searches each in turn, the flushed run and then all {levels}, and most keys rest in the last level, which holds about {lastShare} of the data. With filters, {skipped} runs answer "not here" from memory and only the last is read. The filters take about {bits} bits a key, {memory} of memory here, and they cannot answer a range scan, which opens every run either way. The B-tree walks {height} pages, {hops} of them in memory: {btReads}, filters or not.',
    focus: ['lsm-stack', 'cost-read'],
    hide: ['readsWhy', 'readsAfter'],
    slots: () => {
      const a = run(STORAGE_SETUP.filters);
      const b = run({ ...STORAGE_SETUP.filters, bloom: 0 });
      return {
        readsOn: reads(a.lsm.lookupReads),
        two: reads(2),
        readsOff: reads(b.lsm.lookupReads),
        levels: levels(b.lsm.levels),
        lastShare: pct(Math.round(b.lsm.lastShare * 100)),
        skipped: num(a.lsm.skipped),
        bits: num(STORAGE_BLOOM_BITS),
        memory: size(a.lsm.bloomBytes),
        height: num(a.btree.height),
        hops: num(a.btree.memoryHops),
        btReads: reads(a.btree.lookupReads),
      };
    },
  },
  {
    id: 'more-data',
    title: 'Ten times the data',
    setup: STORAGE_SETUP.growth,
    act: { set: { data: BIG_DATA }, run: 'lsm' },
    ask: 'With {data} of data the B-tree writes {btBefore} the data and the LSM tree {lsmBefore}. The data grows to {bigData}, with the same records and settings. Whose write cost rises?',
    choices: [
      { text: '{lsm}: it needs another level', value: 'lsm' },
      { text: '{btree}: its tree grows taller', value: 'btree' },
      { text: '{both}: more data makes both trees deeper', value: 'both' },
    ],
    truth: 'outcome',
    reveal:
      "{lsm}: {lsmBefore} becomes {lsmAfter}. Ten times the data needs one more level at ratio {ratioN}, {levelsAfter} instead of {levelsBefore}, and every level adds about {perLevelN} rewrites. The B-tree still writes one page and one log record for an update, {btAfter}, however much data sits around it, and its walk is still {heightAfter} pages, since every level multiplies its reach by about {fanout}. Both pay in memory instead: the B-tree's cached upper levels grow from {btMemBefore} to {btMemAfter}, and the LSM tree's filters from {bloomBefore} to {bloomAfter}, on top of block indexes about as large as the B-tree's upper levels.",
    focus: ['lsm-stack', 'cost-write'],
    hide: ['writesAfter'],
    slots: () => {
      const a = run(STORAGE_SETUP.growth);
      const b = run({ ...STORAGE_SETUP.growth, data: BIG_DATA });
      return {
        data: gb(a.settings.data),
        bigData: gb(BIG_DATA),
        btBefore: amp(a.btree.writeAmp),
        lsmBefore: amp(a.lsm.writeAmp),
        btAfter: amp(b.btree.writeAmp),
        lsmAfter: amp(b.lsm.writeAmp),
        ratioN: num(a.settings.ratio),
        levelsBefore: num(a.lsm.levels),
        levelsAfter: num(b.lsm.levels),
        perLevelN: num(b.lsm.rewritesPerLevel),
        heightAfter: num(b.btree.height),
        fanout: num(b.btree.fanout),
        btMemBefore: size(a.btree.memoryBytes),
        btMemAfter: size(b.btree.memoryBytes),
        bloomBefore: size(a.lsm.bloomBytes),
        bloomAfter: size(b.lsm.bloomBytes),
        outcome: word(whose(b.btree.writeAmp > a.btree.writeAmp, b.lsm.writeAmp > a.lsm.writeAmp)),
        lsm: word(whose(false, true)),
        btree: word(whose(true, false)),
        both: word(whose(true, true)),
      };
    },
  },
  {
    id: 'tune-ratio',
    title: 'Challenge: tune the size ratio',
    setup: STORAGE_SETUP.challenge,
    goal: STORAGE_CHALLENGE_GOAL,
    ask: 'This node has no memory to spare for bloom filters. Keep at least {minData} of data, and choose the size ratio so that the LSM tree writes under {maxAmp} the data and a lookup costs under {maxReads} disk reads.',
    reveal:
      'Ratio {solRatio}: {solLevels} of about {solPer} rewrites each, {solAmp} the data, and a lookup reads {solRuns} runs. At ratio {ten} there are only {tenLevels}, but each rewrites a record about {tenPer} times: {tenAmp}. At ratio {four} the tree writes the same {fourAmp} with {fourLevels}, so a lookup costs {fourReads}. The size ratio trades the bytes compaction writes against the runs a read must search, and against space: at ratio {solRatio} up to about {solStale} more disk holds versions waiting to be merged away, against about {tenStale} at ratio {ten}.',
    focus: [],
    hide: [],
    slots: () => {
      const at = (ratio: number) => run({ ...STORAGE_SETUP.challenge, ...STORAGE_CHALLENGE_SOLUTION, ratio });
      const sol = at(STORAGE_CHALLENGE_SOLUTION.ratio);
      const ten = at(10);
      const four = at(4);
      return {
        minData: gb(STORAGE_CHALLENGE_BOUNDS.data),
        maxAmp: amp(STORAGE_CHALLENGE_BOUNDS.lsmWrite),
        maxReads: num(STORAGE_CHALLENGE_BOUNDS.lsmReads),
        solRatio: num(STORAGE_CHALLENGE_SOLUTION.ratio),
        solLevels: levels(sol.lsm.levels),
        solPer: num(sol.lsm.rewritesPerLevel),
        solAmp: amp(sol.lsm.writeAmp),
        solRuns: num(sol.lsm.lookupReads),
        ten: num(10),
        tenLevels: levels(ten.lsm.levels),
        tenPer: num(ten.lsm.rewritesPerLevel),
        tenAmp: amp(ten.lsm.writeAmp),
        four: num(4),
        fourAmp: amp(four.lsm.writeAmp),
        fourLevels: levels(four.lsm.levels),
        fourReads: reads(four.lsm.lookupReads),
        solStale: pct(Math.round((sol.lsm.spaceAmp - 1) * 100)),
        tenStale: pct(Math.round((ten.lsm.spaceAmp - 1) * 100)),
      };
    },
  },
];
