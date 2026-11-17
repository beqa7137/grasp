// The Storage Engines widget's model, for the mockup (browser) and enum.cjs (Node). The engine port is
// libs/engine/src/sysdesign/lessons/widgets/storage.ts (`storageScenario`, replacing `storageCost` in widgets.ts,
// whose only caller is the old widget) and storage-experiments.ts.
//
// A rough cost model of one workload (random single-record writes, point lookups) on a B-tree and on a leveled LSM
// tree. Every number the learner reads comes from the functions here. The write and read formulas are the old
// `storageCost`'s, so every number the lesson quotes stays; the model adds what the picture needs to draw them: the
// B-tree's pages level by level, the LSM tree's level sizes, where each written byte goes, the space each engine
// uses and the memory bloom filters take.
(function (root) {
  'use strict';

  const KB = 1024;
  const MB = 1024 ** 2;
  const GB = 1024 ** 3;
  /** RocksDB's default memtable. */
  const MEMTABLE_MB = 64;
  /** A separator key and a child pointer in an interior page. */
  const POINTER_B = 16;
  /** Pages of a B-tree built by random inserts sit about 70% full (ln 2 = 69% in theory: enum.cjs measures it). */
  const PAGE_FILL = 0.7;
  /** New data written, MB/s: fixed, so disk write rates are comparable across settings. */
  const WRITE_MBPS = 10;
  const BLOOM_BITS = 10;
  /** About 1% at 10 bits a key (enum.cjs measures it); the model's lookup ignores it. */
  const BLOOM_FALSE_POSITIVE = 0.01;
  const DATA_GB = [10, 100, 1000];
  const RECORD_B = [100, 200, 1000];
  const PAGE_KB = [4, 8, 16];
  const RATIOS = [4, 5, 10, 20];
  /** settings.op: which operation the stage follows. Numbers, as ExperimentSettings requires. */
  const OP_WRITE = 0;
  const OP_READ = 1;
  const BASE = { data: 100, record: 100, page: 4, ratio: 10, bloom: 1, op: OP_WRITE };
  /** The write row's fixed scale, in times the data: it holds every setting (5.1 to 165). */
  const WRITE_AXIS = 180;
  const SPACE_AXIS = 1.5;

  /**
   * A B-tree of `data` GB in pages of `page` KB, every page about 70% full. Interior pages hold 16-byte pointers.
   * A point lookup walks one page a level; every level above the leaves is cached, so it costs one disk read.
   * A random update changes one record in its leaf, appends a log record of the record's size, and writes the whole
   * page back, alone (no other update shares the write).
   */
  function btree(s) {
    const pageB = s.page * KB;
    const fanout = Math.max(2, Math.floor((PAGE_FILL * pageB) / POINTER_B));
    const recordsPerLeaf = (PAGE_FILL * pageB) / s.record;
    const leaves = Math.max(1, Math.ceil((s.data * GB) / (PAGE_FILL * pageB)));
    const pages = [leaves];
    while (pages[0] > 1) pages.unshift(Math.ceil(pages[0] / fanout));
    const height = pages.length;
    const interiorPages = pages.slice(0, -1).reduce((a, b) => a + b, 0);
    const writeBytes = pageB + s.record;
    const writeAmp = pageB / s.record + 1;
    return {
      pageB,
      fanout,
      recordsPerLeaf,
      leaves,
      /** Pages at each level, root first. */
      pages,
      height,
      interiorPages,
      memoryBytes: interiorPages * pageB,
      diskBytes: (interiorPages + leaves) * pageB,
      logBytes: s.record,
      writeBytes,
      writeAmp,
      /** Where the written bytes go, in times the data. */
      writeParts: [
        { id: 'page', amp: pageB / s.record },
        { id: 'log', amp: 1 },
      ],
      diskWriteMBps: WRITE_MBPS * writeAmp,
      pagesWalked: height,
      memoryHops: height - 1,
      lookupReads: 1,
      spaceAmp: ((interiorPages + leaves) * pageB) / (s.data * GB),
    };
  }

  /**
   * A leveled LSM tree of `data` GB with a 64 MB memtable. Levels are sized from the bottom up, as RocksDB sizes them
   * by default: the last holds the data, each level above is `ratio` times smaller, down to the last one larger than
   * the memtable. A write costs one log write, one flush, then about (ratio + 1) / 2 rewrites at each level: a level
   * takes `ratio` merges from above to fill, and the k-th rewrites the k parts then there. A lookup of a key that rests
   * in the last level reads one run with bloom filters (their false positives ignored) and every run without: the
   * flushed run and each level.
   */
  function lsm(s) {
    const memtables = (s.data * 1024) / MEMTABLE_MB;
    let levels = 0;
    for (let reach = 1; reach < memtables || levels < 1; reach *= s.ratio) levels++;
    const rewritesPerLevel = (s.ratio + 1) / 2;
    const writeAmp = 2 + levels * rewritesPerLevel;
    /** Bytes each level holds when full, top first. */
    const levelBytes = Array.from({ length: levels }, (_, j) => (s.data * GB) / s.ratio ** (levels - 1 - j));
    let stale = 0;
    for (let j = 1; j < levels; j++) stale += s.ratio ** -j;
    const keys = (s.data * GB) / s.record;
    const runs = levels + 1;
    return {
      memtableBytes: MEMTABLE_MB * MB,
      recordsPerMemtable: (MEMTABLE_MB * MB) / s.record,
      memtables,
      levels,
      levelBytes,
      rewritesPerLevel,
      mergesToFill: s.ratio,
      partsWritten: (s.ratio * (s.ratio + 1)) / 2,
      writeAmp,
      writeParts: [{ id: 'log', amp: 1 }, { id: 'flush', amp: 1 }, ...levelBytes.map((_, j) => ({ id: `L${j + 1}`, amp: rewritesPerLevel }))],
      diskWriteMBps: WRITE_MBPS * writeAmp,
      /** Sorted runs on disk a read may have to search: the flushed run and one per level. */
      runs,
      lookupReads: s.bloom ? 1 : runs,
      skipped: s.bloom ? runs - 1 : 0,
      /** Disk used per byte of live data when every level above the last is full of newer versions: the most. */
      spaceAmp: 1 + stale,
      lastShare: 1 / (1 + stale),
      keys,
      bloomBytes: (keys * BLOOM_BITS) / 8,
    };
  }

  function scenario(s) {
    const b = btree(s);
    const l = lsm(s);
    return {
      settings: s,
      btree: b,
      lsm: l,
      /** The record size above which the B-tree writes less than the LSM tree, at this page size and these levels. */
      crossoverRecordB: b.pageB / (l.writeAmp - 1),
      metrics: {
        btreeWrite: b.writeAmp,
        lsmWrite: l.writeAmp,
        btreeReads: b.lookupReads,
        lsmReads: l.lookupReads,
        btreeHeight: b.height,
        lsmLevels: l.levels,
        btreeSpace: b.spaceAmp,
        lsmSpace: l.spaceAmp,
        data: s.data,
      },
    };
  }
  const run = scenario;

  const ALL_SETTINGS = [];
  for (const data of DATA_GB) for (const record of RECORD_B) for (const page of PAGE_KB) for (const ratio of RATIOS) for (const bloom of [1, 0]) for (const op of [OP_WRITE, OP_READ]) ALL_SETTINGS.push({ data, record, page, ratio, bloom, op });

  // ---------------------------------------------------------------- formatting
  const trim = (v, d) => String(Number(v.toFixed(d)));
  const group = (v) => new Intl.NumberFormat('en-US').format(Math.round(v));
  /** Times the data: one decimal under 100 (29.5×, 5.1×), whole above (165×). */
  const formatAmp = (v) => `${v < 100 ? trim(v, 1) : group(v)}×`;
  /** Space: two decimals (1.11×). */
  const formatSpace = (v) => `${trim(v, 2)}×`;
  const formatB = (v) => `${group(v)} B`;
  const formatBytes = (v) => `${group(v)} bytes`;
  const formatSize = (bytes) => (bytes >= GB * 0.95 ? `${bytes >= 100 * GB ? group(bytes / GB) : trim(bytes / GB, 1)} GB` : `${group(bytes / MB)} MB`);
  const formatGb = (v) => `${group(v)} GB`;
  const formatKb = (v) => `${v} KB`;
  const formatRate = (v) => `${group(v)} MB/s`;
  const formatCount = (v) => (v >= 1e9 ? `${trim(v / 1e9, 2)} billion` : v >= 1e6 ? `${trim(v / 1e6, 1)} million` : group(v));
  const formatPct = (v) => `${trim(v, 1)}%`;
  const formatNum = (v) => (Number.isInteger(v) ? group(v) : trim(v, 2));
  const plural = (n, one, many) => (n === 1 ? one : many);
  const formatReads = (v) => `${v} disk ${plural(v, 'read', 'reads')}`;
  const formatLevels = (v) => `${v} ${plural(v, 'level', 'levels')}`;
  const formatPages = (v) => `${formatCount(v)} ${plural(v, 'page', 'pages')}`;
  const FORMAT = { amp: formatAmp, space: formatSpace, B: formatB, bytes: formatBytes, size: formatSize, gb: formatGb, kb: formatKb, rate: formatRate, count: formatCount, pct: formatPct, num: formatNum, reads: formatReads, levels: formatLevels, pages: formatPages };
  const formatSlot = (slot) => (slot.unit === 'word' ? slot.value : FORMAT[slot.unit](slot.value));
  const slotOf = (unit) => (value) => ({ value, unit });
  const word = (value) => ({ value, unit: 'word' });
  const amp = slotOf('amp');
  const bytes = slotOf('bytes');
  const size = slotOf('size');
  const gb = slotOf('gb');
  const kb = slotOf('kb');
  const rate = slotOf('rate');
  const pct = slotOf('pct');
  const num = slotOf('num');
  const reads = slotOf('reads');
  const levelsOf = slotOf('levels');
  const space = slotOf('space');
  function fillTemplate(t, slots) {
    return t.replace(/\{(\w+)\}/g, (_, k) => {
      if (!slots[k]) throw new Error(`No slot "${k}" for "${t}"`);
      return formatSlot(slots[k]);
    });
  }
  /** Digits a template may carry outside a slot (the engine's TEMPLATE_DIGITS_ALLOWED gains this one). */
  const ALLOWED = ['(ratio + 1) / 2'];
  function strayDigits(t) {
    let rest = t.replace(/\{\w+\}/g, '');
    for (const p of ALLOWED) rest = rest.split(p).join('');
    return rest.match(/\d+/g) ?? [];
  }

  // ---------------------------------------------------------------- experiments
  const SETUP = {
    update: { ...BASE },
    compaction: { ...BASE },
    record: { ...BASE },
    filters: { ...BASE, op: OP_READ },
    growth: { ...BASE },
    challenge: { ...BASE, ratio: 20, bloom: 0, op: OP_READ },
  };
  const CHALLENGE_BOUNDS = { lsmWrite: 20, lsmReads: 7, data: 100 };
  const CHALLENGE_GOAL = {
    all: [
      { metric: 'lsmWrite', below: CHALLENGE_BOUNDS.lsmWrite },
      { metric: 'lsmReads', below: CHALLENGE_BOUNDS.lsmReads },
      { metric: 'data', atLeast: CHALLENGE_BOUNDS.data },
    ],
    keep: { bloom: 0 },
  };
  const CHALLENGE_SOLUTION = { data: 100, ratio: 5, bloom: 0 };
  const BIG_PAGE = 16;
  const BIG_RECORD = 1000;
  const BIG_DATA = 1000;

  const EXPERIMENTS = [
    {
      id: 'page-rewrite',
      title: 'One small update',
      setup: SETUP.update,
      act: { run: 'btree' },
      ask: 'A B-tree with {page} pages holds {data} of records, {record} each. One record changes. Once the change is safe on disk, in its page and in the log, how many bytes has the engine written?',
      choices: [
        { text: '{record}: only the record that changed', value: 'record' },
        { text: '{twice}: the record, and a log record of the same size', value: 'twice' },
        { text: '{written}: the whole page, and a log record', value: 'written' },
      ],
      truth: 'written',
      reveal:
        '{written}: a B-tree changes its page in place, and a page goes to disk whole: {pageB} for a change of {record}, plus a log record of {record} so a crash can replay it. That is {amp} the data, and the page sits at a random place on the disk. With {bigPage} pages it would be {bigAmp}. The model is rough: it has every update write its page back alone, where a real buffer pool often gathers several changes to a hot page first.',
      focus: ['bt-transform', 'cost-write'],
      hide: ['btreeWrite'],
      slots: () => {
        const m = run(SETUP.update);
        const big = run({ ...SETUP.update, page: BIG_PAGE });
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
        };
      },
    },
    {
      id: 'lsm-rewrites',
      title: 'Appended, then merged',
      setup: SETUP.compaction,
      act: { run: 'lsm' },
      ask: 'An LSM tree never changes a file in place: a write is appended to the log and kept in the memtable, which is flushed to disk as a sorted file when it fills. Compaction then merges the record down through {levels}, each {ratio} the size of the one above, so a level fills after {ratioN} merges from above, and each merge rewrites everything the level already holds. How many times is a record written at each level, on average?',
      choices: [
        { text: '{one}: once, as a merge moves it down', value: 'one' },
        { text: '{perLevel}: in about half of the merges that fill its level', value: 'perLevel' },
        { text: '{ratio}: in every merge that fills its level', value: 'ratio' },
      ],
      truth: 'perLevel',
      reveal:
        '{perLevel}: a record that arrives with the first merge is written in all {ratioN}, one that arrives with the last only once, so the average is (ratio + 1) / 2. With one write to the log and one at the flush, {levels} of {perLevel} make {amp} the data. Every one of those writes is sequential, but the bytes add up: {newData} of new data becomes {disk} of disk writes, and when the disk cannot sustain that, compaction falls behind, files pile up and the engine stalls writes.',
      focus: ['lsm-stack', 'lsm-transform'],
      hide: ['lsmWrite'],
      slots: () => {
        const m = run(SETUP.compaction);
        return {
          levels: levelsOf(m.lsm.levels),
          ratio: amp(m.settings.ratio),
          ratioN: num(m.settings.ratio),
          perLevel: amp(m.lsm.rewritesPerLevel),
          amp: amp(m.lsm.writeAmp),
          one: amp(1),
          newData: rate(WRITE_MBPS),
          disk: rate(m.lsm.diskWriteMBps),
        };
      },
    },
    {
      id: 'record-size',
      title: 'Bigger records',
      setup: SETUP.record,
      act: { set: { record: BIG_RECORD }, run: 'btree' },
      ask: 'With records of {record}, the B-tree writes {btBefore} the data and the LSM tree {lsmBefore}. Store the same {data} as records of {bigRecord} instead. Whose write cost falls?',
      choices: [
        { text: '{both}: ten times the record, a tenth of the cost, {btTenth} and {lsmTenth}', value: 'both' },
        { text: "{btree}: to {btAfter}, against the LSM tree's unchanged {lsmAfter}", value: 'btree' },
        { text: "{lsm}: to {lsmTenth}, against the B-tree's unchanged {btBefore}", value: 'lsm' },
      ],
      truth: 'outcome',
      reveal:
        "{btree}: {btAfter}, so it now writes less than the LSM tree's {lsmAfter}. Writing a page costs the same {pageB} whatever changed inside it, so a record of {bigRecord} is about a quarter of what its update writes, where a record of {record} was about a fortieth. The LSM tree rewrites every byte the same number of times whatever the record size; its cost follows its levels. Small records favour the LSM tree, and at these settings the B-tree writes less once a record passes about {crossover}.",
      focus: ['bt-transform', 'cost-write'],
      hide: ['writesAfter'],
      slots: () => {
        const a = run(SETUP.record);
        const b = run({ ...SETUP.record, record: BIG_RECORD });
        // The right choice holds its truth in words, as the reveal spec asks.
        const WORDS = { btree: "Only the B-tree's", lsm: "Only the LSM tree's", both: 'Both', neither: 'Neither' };
        const btFalls = b.btree.writeAmp < a.btree.writeAmp;
        const lsmFalls = b.lsm.writeAmp < a.lsm.writeAmp;
        const outcome = btFalls && lsmFalls ? 'both' : btFalls ? 'btree' : lsmFalls ? 'lsm' : 'neither';
        return {
          record: bytes(a.settings.record),
          bigRecord: bytes(BIG_RECORD),
          data: gb(a.settings.data),
          btBefore: amp(a.btree.writeAmp),
          lsmBefore: amp(a.lsm.writeAmp),
          btAfter: amp(b.btree.writeAmp),
          lsmAfter: amp(b.lsm.writeAmp),
          btTenth: amp(a.btree.writeAmp / 10),
          lsmTenth: amp(a.lsm.writeAmp / 10),
          pageB: bytes(a.btree.pageB),
          crossover: bytes(Math.round(b.crossoverRecordB / 10) * 10),
          outcome: word(WORDS[outcome]),
          both: word(WORDS.both),
          btree: word(WORDS.btree),
          lsm: word(WORDS.lsm),
        };
      },
    },
    {
      id: 'no-filters',
      title: 'Without bloom filters',
      setup: SETUP.filters,
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
        const a = run(SETUP.filters);
        const b = run({ ...SETUP.filters, bloom: 0 });
        return {
          readsOn: reads(a.lsm.lookupReads),
          two: reads(2),
          readsOff: reads(b.lsm.lookupReads),
          levels: levelsOf(b.lsm.levels),
          lastShare: pct(Math.round(b.lsm.lastShare * 100)),
          skipped: num(a.lsm.skipped),
          bits: num(BLOOM_BITS),
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
      setup: SETUP.growth,
      act: { set: { data: BIG_DATA }, run: 'lsm' },
      ask: 'With {data} of data the B-tree writes {btBefore} the data and the LSM tree {lsmBefore}. The data grows to {bigData}, with the same records and settings. Whose write cost rises?',
      choices: [
        { text: '{lsm}: it needs another level', value: 'lsm' },
        { text: '{btree}: its tree grows taller', value: 'btree' },
        { text: '{both}: more data makes both trees deeper', value: 'both' },
      ],
      truth: 'outcome',
      reveal:
        '{lsm}: {lsmBefore} becomes {lsmAfter}. Ten times the data needs one more level at ratio {ratioN}, {levelsAfter} instead of {levelsBefore}, and every level adds about {perLevelN} rewrites. The B-tree still writes one page and one log record for an update, {btAfter}, however much data sits around it, and its walk is still {heightAfter} pages, since every level multiplies its reach by about {fanout}.',
      focus: ['lsm-stack', 'cost-write'],
      hide: ['writesAfter'],
      slots: () => {
        const a = run(SETUP.growth);
        const b = run({ ...SETUP.growth, data: BIG_DATA });
        const bt = b.btree.writeAmp > a.btree.writeAmp;
        const ls = b.lsm.writeAmp > a.lsm.writeAmp;
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
          outcome: word(bt && ls ? 'Both' : ls ? "Only the LSM tree's" : bt ? "Only the B-tree's" : 'Neither'),
          lsm: word("Only the LSM tree's"),
          btree: word("Only the B-tree's"),
          both: word('Both'),
        };
      },
    },
    {
      id: 'tune-ratio',
      title: 'Tune the size ratio',
      setup: SETUP.challenge,
      goal: CHALLENGE_GOAL,
      ask: 'This node has no memory to spare for bloom filters. Keep at least {minData} of data, and choose the size ratio so that the LSM tree writes under {maxAmp} the data and a lookup costs under {maxReads} disk reads.',
      reveal:
        'Ratio {solRatio}: {solLevels} of about {solPer} rewrites each, {solAmp} the data, and a lookup reads {solRuns} runs. At ratio {ten} there are only {tenLevels}, but each rewrites a record about {tenPer} times: {tenAmp}. At ratio {four} the tree writes the same {fourAmp} with {fourLevels}, so a lookup costs {fourReads}. The size ratio trades the bytes compaction writes against the runs a read must search, and against space: at ratio {solRatio} up to {solStale} more disk holds versions waiting to be merged away, against {tenStale} at ratio {ten}.',
      focus: [],
      hide: [],
      slots: () => {
        const at = (ratio) => run({ ...SETUP.challenge, ...CHALLENGE_SOLUTION, ratio });
        const sol = at(CHALLENGE_SOLUTION.ratio);
        const ten = at(10);
        const four = at(4);
        return {
          minData: gb(CHALLENGE_BOUNDS.data),
          maxAmp: amp(CHALLENGE_BOUNDS.lsmWrite),
          maxReads: num(CHALLENGE_BOUNDS.lsmReads),
          solRatio: num(CHALLENGE_SOLUTION.ratio),
          solLevels: levelsOf(sol.lsm.levels),
          solPer: num(sol.lsm.rewritesPerLevel),
          solAmp: amp(sol.lsm.writeAmp),
          solRuns: num(sol.lsm.lookupReads),
          ten: num(10),
          tenLevels: levelsOf(ten.lsm.levels),
          tenPer: num(ten.lsm.rewritesPerLevel),
          tenAmp: amp(ten.lsm.writeAmp),
          four: num(4),
          fourAmp: amp(four.lsm.writeAmp),
          fourLevels: levelsOf(four.lsm.levels),
          fourReads: reads(four.lsm.lookupReads),
          solStale: pct((sol.lsm.spaceAmp - 1) * 100),
          tenStale: pct((ten.lsm.spaceAmp - 1) * 100),
        };
      },
    },
  ];

  function renderExperiment(spec) {
    const slots = spec.slots();
    const fill = (t) => fillTemplate(t, slots);
    const choices = (spec.choices ?? []).map((c) => fill(c.text));
    let answer = -1;
    if (spec.choices && spec.truth) {
      const truth = fill(`{${spec.truth}}`);
      const matches = spec.choices.flatMap((c, i) => (fill(`{${c.value}}`) === truth ? [i] : []));
      if (matches.length !== 1) throw new Error(`${spec.id}: ${matches.length} choices equal the model's ${truth}`);
      answer = matches[0];
    }
    return { id: spec.id, title: fill(spec.title), ask: fill(spec.ask), choices, answer, reveal: fill(spec.reveal), slots, focus: spec.focus, hide: spec.hide };
  }

  const boundMet = (b, v) => ('below' in b ? v < b.below : v >= b.atLeast);
  const goalKept = (goal, s) => Object.entries(goal.keep ?? {}).every(([k, v]) => s[k] === v);
  const goalMet = (goal, s, metrics) => goalKept(goal, s) && goal.all.every((b) => boundMet(b, metrics[b.metric]));

  const api = {
    KB,
    MB,
    GB,
    MEMTABLE_MB,
    POINTER_B,
    PAGE_FILL,
    WRITE_MBPS,
    BLOOM_BITS,
    BLOOM_FALSE_POSITIVE,
    DATA_GB,
    RECORD_B,
    PAGE_KB,
    RATIOS,
    OP_WRITE,
    OP_READ,
    BASE,
    WRITE_AXIS,
    SPACE_AXIS,
    ALL_SETTINGS,
    btree,
    lsm,
    scenario,
    run,
    formatAmp,
    formatSpace,
    formatB,
    formatBytes,
    formatSize,
    formatGb,
    formatKb,
    formatRate,
    formatCount,
    formatPct,
    formatNum,
    formatReads,
    formatLevels,
    formatPages,
    formatSlot,
    fillTemplate,
    strayDigits,
    plural,
    EXPERIMENTS,
    SETUP,
    CHALLENGE_GOAL,
    CHALLENGE_BOUNDS,
    CHALLENGE_SOLUTION,
    renderExperiment,
    goalMet,
    goalKept,
    boundMet,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.StorageModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
