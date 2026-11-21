import { describe, expect, it } from 'vitest';
import {
  formatAmp,
  formatCount,
  formatLevels,
  formatPages,
  formatReads,
  formatSize,
  formatSpace,
  roundSignificant,
} from './storage-format.js';
import {
  STORAGE_BASELINE,
  STORAGE_BLOOM_BITS,
  STORAGE_DATA_GB,
  STORAGE_PAGE_FILL,
  STORAGE_POINTER_B,
  STORAGE_RATIOS,
  STORAGE_SETTINGS,
  STORAGE_SPACE_AXIS,
  STORAGE_WRITE_AXIS,
  lsmSteady,
  recordMerge,
  storageScenario,
  type StorageSettings,
} from './storage.js';

const GB = 1024 ** 3;
const MB = 1024 ** 2;
const at = (patch: Partial<StorageSettings>) => storageScenario({ ...STORAGE_BASELINE, ...patch });
const close = (a: number, b: number, eps = 1e-9) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));

function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** The retired `storageCost`, as it was: the model keeps its write, read and level numbers. */
function oldStorageCost(engine: 'btree' | 'lsm', s: StorageSettings) {
  if (engine === 'btree') {
    const fanout = Math.max(2, Math.floor((s.page * 1024) / 16));
    const leaves = Math.max(1, (s.data * GB) / (s.page * 1024));
    const levels = 1 + Math.ceil(Math.log(leaves) / Math.log(fanout));
    const writeAmplification = (s.page * 1024) / s.record + 1;
    return { writeAmplification, lookupReads: 1, levels, diskWriteMBps: 10 * writeAmplification };
  }
  const levels = Math.max(1, Math.ceil(Math.log((s.data * 1024) / 64) / Math.log(s.ratio)));
  const writeAmplification = 2 + (levels * (s.ratio + 1)) / 2;
  return { writeAmplification, lookupReads: s.bloom ? 1 : levels + 1, levels, diskWriteMBps: 10 * writeAmplification };
}

describe('the storage model', () => {
  it('covers 432 settings', () => {
    expect(STORAGE_SETTINGS).toHaveLength(432);
    expect(new Set(STORAGE_SETTINGS.map((s) => JSON.stringify(s))).size).toBe(432);
  });

  it("keeps the old storageCost's write, read and level numbers at every setting", () => {
    for (const s of STORAGE_SETTINGS) {
      const m = storageScenario(s);
      const b = oldStorageCost('btree', s);
      const l = oldStorageCost('lsm', s);
      expect(close(m.btree.writeAmp, b.writeAmplification)).toBe(true);
      expect(close(m.btree.diskWriteMBps, b.diskWriteMBps)).toBe(true);
      expect(m.btree.lookupReads).toBe(b.lookupReads);
      expect(close(m.lsm.writeAmp, l.writeAmplification)).toBe(true);
      expect(close(m.lsm.diskWriteMBps, l.diskWriteMBps)).toBe(true);
      expect(m.lsm.levels).toBe(l.levels);
      expect(m.lsm.lookupReads).toBe(l.lookupReads);
    }
    // Pages now sit 70% full, so two heights the lesson never quotes move; every height it quotes stays.
    const moved = STORAGE_SETTINGS.filter((s) => storageScenario(s).btree.height !== oldStorageCost('btree', s).levels);
    expect([...new Set(moved.map((s) => `${s.data}/${s.page}`))].sort()).toEqual(['10/16', '1000/8']);
    expect([at({}).btree.height, at({ page: 16 }).btree.height, at({ data: 10 }).btree.height, at({ data: 1000 }).btree.height]).toEqual([
      5, 4, 4, 5,
    ]);
  });

  it('builds the B-tree from pages 70% full, root first', () => {
    const b = at({}).btree;
    expect(b.fanout).toBe(Math.floor((STORAGE_PAGE_FILL * 4096) / STORAGE_POINTER_B));
    expect(b.fanout).toBe(179);
    expect([at({ page: 8 }).btree.fanout, at({ page: 16 }).btree.fanout]).toEqual([358, 716]);
    expect(b.leaves).toBe(Math.ceil((100 * GB) / (0.7 * 4096)));
    expect(b.pages).toEqual([1, 7, 1169, 209_214, 37_449_143]);
    expect(b.height).toBe(5);
    expect(b.interiorPages).toBe(1 + 7 + 1169 + 209_214);
    expect(formatSize(b.memoryBytes)).toBe('822 MB');
    expect(close(b.spaceAmp, ((b.interiorPages + b.leaves) * 4096) / (100 * GB))).toBe(true);
    expect(b.writeBytes).toBe(4196);
    expect(close(b.writeAmp, 41.96)).toBe(true);
    expect(close(b.randomWritesPerSec, (10 * MB) / 100)).toBe(true);
    expect([b.pagesWalked, b.memoryHops, b.lookupReads]).toEqual([5, 4, 1]);
    for (const s of STORAGE_SETTINGS) {
      const t = storageScenario(s).btree;
      expect(t.pages[0]).toBe(1);
      for (let i = 1; i < t.pages.length; i++) expect(t.pages[i - 1]).toBe(Math.ceil(t.pages[i] / t.fanout));
      expect(t.spaceAmp).toBeGreaterThan(1.42);
      expect(t.spaceAmp).toBeLessThan(1.45);
    }
  });

  it('sizes the LSM levels from the bottom up, the last holding the data', () => {
    const l = at({}).lsm;
    expect(l.levels).toBe(4);
    expect(l.levelBytes.map(formatSize)).toEqual(['102 MB', '1 GB', '10 GB', '100 GB']);
    expect(l.rewritesPerLevel).toBe(5.5);
    expect(l.partsWritten).toBe(55);
    expect(l.writeAmp).toBe(24);
    expect([l.runs, l.lookupReads, l.skipped]).toEqual([5, 1, 4]);
    expect(at({ bloom: 0 }).lsm).toMatchObject({ lookupReads: 5, skipped: 0 });
    expect(formatSpace(l.spaceAmp)).toBe('1.11×');
    expect(Math.abs(l.lastShare - 0.9)).toBeLessThan(0.005);
    expect(formatSize(l.bloomBytes)).toBe('1.3 GB');
    expect(l.recordsPerMemtable).toBeCloseTo((64 * MB) / 100);
    for (const s of STORAGE_SETTINGS) {
      const m = storageScenario(s).lsm;
      expect(m.levelBytes.at(-1)).toBeCloseTo(s.data * GB);
      expect(m.levelBytes[0]).toBeGreaterThan(m.memtableBytes);
      expect(s.ratio ** m.levels).toBeGreaterThanOrEqual(m.memtables);
      expect(s.ratio ** (m.levels - 1)).toBeLessThan(m.memtables);
      for (let j = 1; j < m.levels; j++) expect(m.levelBytes[j] / m.levelBytes[j - 1]).toBeCloseTo(s.ratio);
      expect(m.writeAmp).toBe(2 + m.levels * ((s.ratio + 1) / 2));
    }
  });

  it('quotes the numbers the lesson quotes', () => {
    expect(at({}).btree.diskWriteMBps).toBeCloseTo(419.6);
    expect(at({}).lsm.diskWriteMBps).toBe(240);
    expect(at({ record: 1000 }).btree.writeAmp).toBeCloseTo(5.096);
    expect(at({ record: 200 }).btree.writeAmp).toBeCloseTo(21.48);
    expect(at({ page: 16 }).btree.writeAmp).toBeCloseTo(164.84);
    expect(at({ page: 16 }).btree.diskWriteMBps).toBeCloseTo(1648.4);
    expect([at({ data: 10 }).lsm.writeAmp, at({ data: 1000 }).lsm.writeAmp]).toEqual([18.5, 29.5]);
    expect([at({ data: 10 }).lsm.levels, at({ data: 1000 }).lsm.levels]).toEqual([3, 5]);
    expect([at({ ratio: 5 }), at({ ratio: 4 }), at({ ratio: 20 })].map((m) => [m.lsm.levels, m.lsm.writeAmp])).toEqual([
      [5, 17],
      [6, 17],
      [3, 33.5],
    ]);
    expect((at({ ratio: 5 }).lsm.spaceAmp - 1) * 100).toBeCloseTo(25, 0);
    expect((1e9 * STORAGE_BLOOM_BITS) / 8 / 1e9).toBe(1.25);
    expect(at({}).crossoverRecordB).toBeCloseTo(178.09, 1);
  });

  it('keeps every setting on the fixed scales and in the reserved rows', () => {
    for (const s of STORAGE_SETTINGS) {
      const m = storageScenario(s);
      expect(Math.max(m.btree.writeAmp, m.lsm.writeAmp)).toBeLessThanOrEqual(STORAGE_WRITE_AXIS);
      expect(Math.max(m.btree.spaceAmp, m.lsm.spaceAmp)).toBeLessThanOrEqual(STORAGE_SPACE_AXIS);
      expect(m.lsm.runs).toBeLessThanOrEqual(8);
      expect(m.btree.height).toBeGreaterThanOrEqual(3);
      expect(m.btree.height).toBeLessThanOrEqual(5);
      expect(m.lsm.levels).toBeGreaterThanOrEqual(2);
      expect(m.lsm.levels).toBeLessThanOrEqual(7);
    }
  });

  it('says its numbers with their units, plural by count', () => {
    expect([formatAmp(29.5), formatAmp(5.096), formatAmp(164.84), formatAmp(24)]).toEqual(['29.5×', '5.1×', '165×', '24×']);
    expect([formatSize(102.4 * MB), formatSize(GB), formatSize(1.25e9), formatSize(100 * GB), formatSize(8.04e9)]).toEqual([
      '102 MB',
      '1 GB',
      '1.2 GB',
      '100 GB',
      '7.5 GB',
    ]);
    expect([formatCount(37_449_143), formatCount(1169), formatCount(2.1e9)]).toEqual(['37.4 million', '1,169', '2.1 billion']);
    expect([formatReads(1), formatReads(5), formatLevels(1), formatLevels(4), formatPages(1), formatPages(7)]).toEqual([
      '1 disk read',
      '5 disk reads',
      '1 level',
      '4 levels',
      '1 page',
      '7 pages',
    ]);
    expect(roundSignificant(104_857.6)).toBe(105_000);
  });

  it('brings the followed record in with the middle merge', () => {
    expect(STORAGE_RATIOS.map(recordMerge)).toEqual([3, 3, 6, 11]);
  });
});

describe('a real B+tree, built by random inserts', () => {
  const lowerBound = (a: number[], k: number) => {
    let lo = 0;
    let hi = a.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (a[mid] < k) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  const upperBound = (a: number[], k: number) => {
    let lo = 0;
    let hi = a.length;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (a[mid] <= k) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  };
  type Node = { leaf: true; keys: number[] } | { leaf: false; keys: number[]; kids: Node[] };
  function build(n: number, leafCap: number, fanout: number, rnd: () => number) {
    let root: Node = { leaf: true, keys: [] };
    const insert = (node: Node, key: number): { key: number; right: Node } | null => {
      if (node.leaf) {
        node.keys.splice(lowerBound(node.keys, key), 0, key);
        if (node.keys.length <= leafCap) return null;
        const right: Node = { leaf: true, keys: node.keys.splice(node.keys.length >> 1) };
        return { key: right.keys[0], right };
      }
      const i = upperBound(node.keys, key);
      const split = insert(node.kids[i], key);
      if (!split) return null;
      node.keys.splice(i, 0, split.key);
      node.kids.splice(i + 1, 0, split.right);
      if (node.kids.length <= fanout) return null;
      const mid = node.kids.length >> 1;
      const kids = node.kids.splice(mid);
      const keys = node.keys.splice(mid);
      const up = node.keys.pop()!;
      return { key: up, right: { leaf: false, keys, kids } };
    };
    const keys = Array.from({ length: n }, (_, i) => i);
    for (let i = n - 1; i > 0; i--) {
      const j = Math.floor(rnd() * (i + 1));
      [keys[i], keys[j]] = [keys[j], keys[i]];
    }
    for (const k of keys) {
      const split = insert(root, k);
      if (split) root = { leaf: false, keys: [split.key], kids: [root, split.right] };
    }
    const levels: number[] = [];
    const walk = (node: Node, depth: number) => {
      levels[depth] = (levels[depth] ?? 0) + 1;
      if (!node.leaf) for (const kid of node.kids) walk(kid, depth + 1);
    };
    walk(root, 0);
    const lookup = (key: number) => {
      let node = root;
      let pages = 1;
      while (!node.leaf) {
        node = node.kids[upperBound(node.keys, key)];
        pages++;
      }
      return { pages, found: node.keys[lowerBound(node.keys, key)] === key, leaf: node };
    };
    return { levels, lookup };
  }

  it.each([
    [150_000, 4096, 100],
    [60_000, 4096, 1000],
  ])('%i records of %i-byte pages and %i-byte records: pages about 70% full, the height the model gives', (n, pageB, recordB) => {
    const leafCap = Math.floor(pageB / recordB);
    const fanout = Math.floor(pageB / STORAGE_POINTER_B);
    const rnd = mulberry32(7 + n);
    const t = build(n, leafCap, fanout, rnd);
    const leaves = t.levels.at(-1)!;
    expect(Math.abs(n / (leaves * leafCap) - STORAGE_PAGE_FILL)).toBeLessThan(0.03);
    const modelLeaves = Math.ceil(n / (STORAGE_PAGE_FILL * leafCap));
    const pages = [modelLeaves];
    while (pages[0] > 1) pages.unshift(Math.ceil(pages[0] / Math.floor(STORAGE_PAGE_FILL * fanout)));
    expect(Math.abs(leaves - modelLeaves) / modelLeaves).toBeLessThan(0.04);
    expect(t.levels.length).toBe(pages.length);
    for (let i = 0; i < 500; i++) {
      const r = t.lookup(Math.floor(rnd() * n));
      expect(r.found && r.pages === t.levels.length).toBe(true);
    }
    // A buffer pool that writes back once a batch of updates has landed writes one page for each leaf the batch touched.
    for (const share of [0.01, 0.16]) {
      const k = Math.max(1, Math.round(share * leaves));
      let written = 0;
      for (let r = 0; r < 40; r++) {
        const dirty = new Set<Node>();
        for (let i = 0; i < k; i++) dirty.add(t.lookup(Math.floor(rnd() * n)).leaf);
        written += dirty.size;
      }
      expect(Math.abs(written / (40 * k) - (1 - Math.exp(-share)) / share)).toBeLessThan(0.03);
    }
  });

  it('writes back almost a page an update at the default, where data dwarfs a checkpoint of updates', () => {
    const b = at({}).btree;
    const share = (((10 * MB) / 100) * 60) / b.leaves;
    expect((1 - Math.exp(-share)) / share).toBeGreaterThan(0.9);
  });
});

describe('an LSM tree that counts the bytes it writes', () => {
  function fill(m: number, T: number, L: number) {
    const cap = Array.from({ length: L }, (_, j) => m * T ** (j + 1));
    const size = Array.from({ length: L }, () => 0);
    const perLevel = Array.from({ length: L }, () => 0);
    const n = cap[L - 1];
    let written = 0;
    const merge = (j: number, k: number) => {
      perLevel[j] += size[j] + k;
      written += size[j] + k;
      size[j] += k;
      if (size[j] >= cap[j] && j < L - 1) {
        const all = size[j];
        size[j] = 0;
        merge(j + 1, all);
      }
    };
    for (let i = 0; i < n / m; i++) {
      written += 2 * m;
      merge(0, m);
    }
    return { amp: written / n, perLevel: perLevel.map((w) => w / n) };
  }

  it('writes exactly 2 + L (T + 1) / 2 times the data on full trees, (T + 1) / 2 at every level', () => {
    for (const m of [1, 3])
      for (const T of [2, 4, 5, 10, 20])
        for (let L = 1; L <= 4; L++) {
          if (m * T ** L > 2e5) continue;
          const sim = fill(m, T, L);
          expect(sim.amp).toBeCloseTo(2 + (L * (T + 1)) / 2, 9);
          for (const p of sim.perLevel) expect(p).toBeCloseTo((T + 1) / 2, 9);
        }
  });

  it("stays near the model in steady state at the widget's sizes, and its space under the model's most", () => {
    for (const data of STORAGE_DATA_GB)
      for (const ratio of STORAGE_RATIOS) {
        const sim = lsmSteady({ data, ratio });
        const model = at({ data, ratio }).lsm;
        expect(Math.abs(sim.amp / model.writeAmp - 1)).toBeLessThan(data === 10 && ratio === 20 ? 0.16 : 0.08);
        expect(sim.spaceMean).toBeLessThanOrEqual(model.spaceAmp + 1e-9);
      }
    const e2 = lsmSteady({ data: 100, ratio: 20 });
    expect(e2.perLevel.at(-1)).toBeCloseTo(20, 2);
    expect(e2.perLevel[0]).toBeLessThan(10.5);
    expect(formatAmp(e2.amp)).toBe('35×');
    expect(lsmSteady({ data: 100, ratio: 10 }).amp).toBeCloseTo(23.5, 0);
  });

  it('reads about every run without filters and one with them, on real keys and real bloom filters', () => {
    const bloomOf = (keys: number[]) => {
      const bits = Math.max(64, keys.length * STORAGE_BLOOM_BITS);
      const k = Math.max(1, Math.round(STORAGE_BLOOM_BITS * Math.LN2));
      const arr = new Uint8Array(Math.ceil(bits / 8));
      const h1 = (x: number) => Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
      const h2 = (x: number) => (Math.imul((x + 0x9e3779b9) ^ (x >>> 13), 0xc2b2ae35) >>> 0) | 1;
      const probes = (key: number) => {
        const a = h1(key + 1);
        const b = h2(key + 7);
        return Array.from({ length: k }, (_, i) => ((a + Math.imul(i, b)) >>> 0) % bits);
      };
      for (const key of keys) for (const p of probes(key)) arr[p >> 3] |= 1 << (p & 7);
      return (key: number) => probes(key).every((p) => arr[p >> 3] & (1 << (p & 7)));
    };
    type Run = { map: Map<number, number>; maybe: (k: number) => boolean };
    const mkRun = (map: Map<number, number>): Run => ({ map, maybe: bloomOf([...map.keys()]) });
    for (const [m, T, L] of [
      [64, 4, 3],
      [16, 5, 3],
    ]) {
      const n = m * T ** L;
      const rnd = mulberry32(11 + T);
      const cap = Array.from({ length: L }, (_, j) => m * T ** (j + 1));
      const levels: Run[] = Array.from({ length: L }, () => mkRun(new Map()));
      levels[L - 1] = mkRun(new Map(Array.from({ length: n }, (_, k) => [k, 0])));
      let memtable = new Map<number, number>();
      let l0: Run | null = null;
      let seq = 1;
      const mergeDown = (j: number, incoming: Map<number, number>) => {
        const out = new Map(levels[j].map);
        for (const [k, v] of incoming) out.set(k, v);
        if (j < L - 1 && out.size >= cap[j]) {
          levels[j] = mkRun(new Map());
          mergeDown(j + 1, out);
        } else levels[j] = mkRun(out);
      };
      const st = { last: 0, offLast: 0, on: 0, lookups: 0, negatives: 0, falsePositives: 0, runsMax: 0 };
      for (let round = 0; round < 600; round++) {
        while (memtable.size < m) memtable.set(Math.floor(rnd() * n), seq++);
        if (l0) mergeDown(0, l0.map);
        l0 = mkRun(memtable);
        memtable = new Map();
        if (round < 150 || round % 7) continue;
        for (let i = 0; i < 300; i++) {
          const key = Math.floor(rnd() * n);
          st.lookups++;
          const runs = [l0, ...levels].filter((r) => r.map.size);
          st.runsMax = Math.max(st.runsMax, runs.length);
          let off = 0;
          for (const r of runs) {
            off++;
            const maybe = r.maybe(key);
            if (maybe) st.on++;
            if (r.map.has(key)) {
              if (r === levels[L - 1]) {
                st.last++;
                st.offLast += off;
              }
              break;
            }
            st.negatives++;
            if (maybe) st.falsePositives++;
          }
        }
      }
      expect(st.runsMax).toBeLessThanOrEqual(L + 1);
      expect(st.offLast / st.last).toBeLessThanOrEqual(L + 1);
      expect(st.offLast / st.last).toBeGreaterThan(L + 1 - 1.6);
      expect(st.on / st.lookups).toBeGreaterThan(0.85);
      expect(st.on / st.lookups).toBeLessThan(1.08);
      expect(st.falsePositives / st.negatives).toBeGreaterThan(0.003);
      expect(st.falsePositives / st.negatives).toBeLessThan(0.02);
    }
  });
});
