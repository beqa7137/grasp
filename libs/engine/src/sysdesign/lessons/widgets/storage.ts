/**
 * The Storage Engines widget's rough cost model: random single-record writes and point lookups on a B-tree and on a
 * leveled LSM tree, with what the picture needs to draw them (the B-tree's pages level by level, the LSM tree's level
 * sizes, where each written byte goes, the space each engine uses and the memory bloom filters take).
 */

const KB = 1024;
const MB = 1024 ** 2;
const GB = 1024 ** 3;

/** RocksDB's default memtable. */
export const STORAGE_MEMTABLE_MB = 64;
/** A separator key and a child pointer in an interior page. */
export const STORAGE_POINTER_B = 16;
/** Pages of a B-tree built by random inserts sit about 70% full (ln 2 in theory; the spec measures it). */
export const STORAGE_PAGE_FILL = 0.7;
/** New data written, MB/s: fixed, so disk write rates compare across settings. */
export const STORAGE_WRITE_MBPS = 10;
export const STORAGE_BLOOM_BITS = 10;
export const STORAGE_DATA_GB = [10, 100, 1000] as const;
export const STORAGE_RECORD_B = [100, 200, 1000] as const;
export const STORAGE_PAGE_KB = [4, 8, 16] as const;
export const STORAGE_RATIOS = [4, 5, 10, 20] as const;
/** `op`: the operation the stage follows. */
export const STORAGE_OP = { write: 0, read: 1 } as const;
/** The write row's fixed scale in times the data: it holds every setting (5.1× to 165×). */
export const STORAGE_WRITE_AXIS = 180;
/** The disk-used row's fixed scale in times the live data. */
export const STORAGE_SPACE_AXIS = 1.5;
/** The level bars' one log scale, in bytes: the memtable to the largest data. */
export const STORAGE_LEVEL_SCALE = { lo: STORAGE_MEMTABLE_MB * MB, hi: 1000 * GB } as const;
export const STORAGE_BYTES = { KB, MB, GB } as const;

/** One setting, as numbers (`ExperimentSettings`): `bloom` 1 or 0, `op` as `STORAGE_OP`. */
export type StorageSettings = {
  data: number;
  record: number;
  page: number;
  ratio: number;
  bloom: number;
  op: number;
};
export const STORAGE_BASELINE: Readonly<StorageSettings> = { data: 100, record: 100, page: 4, ratio: 10, bloom: 1, op: 0 };

export interface BtreeCost {
  pageB: number;
  fanout: number;
  recordsPerLeaf: number;
  leaves: number;
  /** Pages at each level, root first. */
  pages: number[];
  height: number;
  interiorPages: number;
  memoryBytes: number;
  diskBytes: number;
  logBytes: number;
  writeBytes: number;
  writeAmp: number;
  diskWriteMBps: number;
  /** Each update writes one page at a random place: at the fixed rate of new data, this many a second. */
  randomWritesPerSec: number;
  pagesWalked: number;
  memoryHops: number;
  lookupReads: number;
  spaceAmp: number;
}

export interface LsmCost {
  memtableBytes: number;
  recordsPerMemtable: number;
  memtables: number;
  levels: number;
  /** Bytes each level holds when full, top first. */
  levelBytes: number[];
  rewritesPerLevel: number;
  mergesToFill: number;
  partsWritten: number;
  writeAmp: number;
  diskWriteMBps: number;
  /** Sorted runs on disk a lookup may search: the flushed run and one a level. */
  runs: number;
  lookupReads: number;
  skipped: number;
  /** Disk used per byte of live data when every level above the last is full of newer versions: the most. */
  spaceAmp: number;
  lastShare: number;
  keys: number;
  bloomBytes: number;
}

export interface StorageScenario {
  settings: StorageSettings;
  btree: BtreeCost;
  lsm: LsmCost;
  /** The record size above which the B-tree writes less than the LSM tree, at this page size and these levels. */
  crossoverRecordB: number;
  metrics: {
    btreeWrite: number;
    lsmWrite: number;
    btreeReads: number;
    lsmReads: number;
    btreeHeight: number;
    lsmLevels: number;
    btreeSpace: number;
    lsmSpace: number;
    data: number;
  };
}

/**
 * A B-tree of `data` GB in pages of `page` KB, every page about 70% full. A lookup walks one page a level and, with
 * every level above the leaves cached, reads one from disk. An update changes one record in its leaf, appends a log
 * record of the record's size, and writes the whole page back alone.
 */
export function btreeCost(s: StorageSettings): BtreeCost {
  const pageB = s.page * KB;
  const fanout = Math.max(2, Math.floor((STORAGE_PAGE_FILL * pageB) / STORAGE_POINTER_B));
  const leaves = Math.max(1, Math.ceil((s.data * GB) / (STORAGE_PAGE_FILL * pageB)));
  const pages = [leaves];
  while (pages[0] > 1) pages.unshift(Math.ceil(pages[0] / fanout));
  const height = pages.length;
  const interiorPages = pages.slice(0, -1).reduce((a, b) => a + b, 0);
  const writeAmp = pageB / s.record + 1;
  return {
    pageB,
    fanout,
    recordsPerLeaf: (STORAGE_PAGE_FILL * pageB) / s.record,
    leaves,
    pages,
    height,
    interiorPages,
    memoryBytes: interiorPages * pageB,
    diskBytes: (interiorPages + leaves) * pageB,
    logBytes: s.record,
    writeBytes: pageB + s.record,
    writeAmp,
    diskWriteMBps: STORAGE_WRITE_MBPS * writeAmp,
    randomWritesPerSec: (STORAGE_WRITE_MBPS * MB) / s.record,
    pagesWalked: height,
    memoryHops: height - 1,
    lookupReads: 1,
    spaceAmp: ((interiorPages + leaves) * pageB) / (s.data * GB),
  };
}

/**
 * A leveled LSM tree of `data` GB with a 64 MB memtable, its levels sized from the bottom up as RocksDB sizes them by
 * default. A write costs one log write, one flush, then about (ratio + 1) / 2 rewrites at each level: a level takes
 * `ratio` merges from above to fill, and the k-th rewrites the k parts then there. A lookup of a key that rests in the
 * last level reads one run with bloom filters (their false positives left out) and every run without.
 */
export function lsmCost(s: StorageSettings): LsmCost {
  const memtables = (s.data * 1024) / STORAGE_MEMTABLE_MB;
  let levels = 0;
  for (let reach = 1; reach < memtables || levels < 1; reach *= s.ratio) levels++;
  const rewritesPerLevel = (s.ratio + 1) / 2;
  const writeAmp = 2 + levels * rewritesPerLevel;
  let stale = 0;
  for (let j = 1; j < levels; j++) stale += s.ratio ** -j;
  const keys = (s.data * GB) / s.record;
  const runs = levels + 1;
  return {
    memtableBytes: STORAGE_MEMTABLE_MB * MB,
    recordsPerMemtable: (STORAGE_MEMTABLE_MB * MB) / s.record,
    memtables,
    levels,
    levelBytes: Array.from({ length: levels }, (_, j) => (s.data * GB) / s.ratio ** (levels - 1 - j)),
    rewritesPerLevel,
    mergesToFill: s.ratio,
    partsWritten: (s.ratio * (s.ratio + 1)) / 2,
    writeAmp,
    diskWriteMBps: STORAGE_WRITE_MBPS * writeAmp,
    runs,
    lookupReads: s.bloom ? 1 : runs,
    skipped: s.bloom ? runs - 1 : 0,
    spaceAmp: 1 + stale,
    lastShare: 1 / (1 + stale),
    keys,
    bloomBytes: (keys * STORAGE_BLOOM_BITS) / 8,
  };
}

const scenarios = new Map<string, StorageScenario>();

/** Both engines on one workload. Memoized: 432 settings, each read many times a render. */
export function storageScenario(input: StorageSettings): StorageScenario {
  const s: StorageSettings = {
    data: input.data,
    record: input.record,
    page: input.page,
    ratio: input.ratio,
    bloom: input.bloom ? 1 : 0,
    op: input.op ? 1 : 0,
  };
  const key = `${s.data}|${s.record}|${s.page}|${s.ratio}|${s.bloom}|${s.op}`;
  const hit = scenarios.get(key);
  if (hit) return hit;
  const b = btreeCost(s);
  const l = lsmCost(s);
  const out: StorageScenario = {
    settings: s,
    btree: b,
    lsm: l,
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
  scenarios.set(key, out);
  return out;
}

export const STORAGE_SETTINGS: readonly StorageSettings[] = STORAGE_DATA_GB.flatMap((data) =>
  STORAGE_RECORD_B.flatMap((record) =>
    STORAGE_PAGE_KB.flatMap((page) =>
      STORAGE_RATIOS.flatMap((ratio) => [1, 0].flatMap((bloom) => [0, 1].map((op) => ({ data, record, page, ratio, bloom, op })))),
    ),
  ),
);

export interface LsmSteady {
  amp: number;
  /** Bytes written at each level, top first, in times the data. */
  perLevel: number[];
  spaceMax: number;
  spaceMean: number;
}

const steadyMemo = new Map<string, LsmSteady>();

/**
 * The LSM tree's own sizes run in steady state (levels sized from the bottom up, random overwrites, the last level
 * always full), counting the bytes compaction writes: what a running tree spends against the model's (ratio + 1) / 2
 * a level. The spec pins the model's totals against it.
 */
export function lsmSteady(s: Pick<StorageSettings, 'data' | 'ratio'>): LsmSteady {
  const key = `${s.data}|${s.ratio}`;
  const hit = steadyMemo.get(key);
  if (hit) return hit;
  const model = lsmCost({ ...STORAGE_BASELINE, data: s.data, ratio: s.ratio });
  const L = model.levels;
  const dataMB = s.data * 1024;
  const cap = model.levelBytes.map((b) => b / MB);
  const size = Array.from({ length: L }, () => 0);
  size[L - 1] = dataMB;
  const perLevel = Array.from({ length: L }, () => 0);
  let written = 0;
  let ingested = 0;
  let spaceMax = 0;
  let spaceSum = 0;
  let steps = 0;
  const merge = (j: number, n: number) => {
    if (j === L - 1) {
      // New versions replace old ones: the last level's output is the data again.
      perLevel[j] += dataMB;
      written += dataMB;
      return;
    }
    perLevel[j] += size[j] + n;
    written += size[j] + n;
    size[j] += n;
    if (size[j] >= cap[j]) {
      const all = size[j];
      size[j] = 0;
      merge(j + 1, all);
    }
  };
  while (ingested < 60 * dataMB) {
    written += 2 * STORAGE_MEMTABLE_MB;
    ingested += STORAGE_MEMTABLE_MB;
    merge(0, STORAGE_MEMTABLE_MB);
    const used = size.reduce((a, b) => a + b, 0) / dataMB;
    spaceMax = Math.max(spaceMax, used);
    spaceSum += used;
    steps++;
  }
  const out = { amp: written / ingested, perLevel: perLevel.map((w) => w / ingested), spaceMax, spaceMean: spaceSum / steps };
  steadyMemo.set(key, out);
  return out;
}

/** The merge, counted from 1, that brings the followed record into a level of `ratio` merges: the middle one. */
export const recordMerge = (ratio: number) => Math.floor(ratio / 2) + 1;
