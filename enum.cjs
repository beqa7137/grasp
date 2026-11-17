// Prints every number the Storage Engines widget shows, checks the model against independent computations, and
// enumerates the challenge.
//   1. The old `storageCost` formulas, re-implemented: write amplification, lookup reads and LSM levels are equal at
//      every setting, and the B-tree heights the lesson quotes are unchanged.
//   2. Every number the lesson quotes.
//   3. A real B+tree built by random inserts with page splits: its pages come out about 70% full (the model's constant),
//      its height and page counts match the model's, a lookup touches one page a level, and a buffer pool that gathers
//      updates writes almost one page an update when the data dwarfs the batch (the model's "alone").
//   4. A simulated LSM tree that counts the bytes it writes: exactly 2 + L (T + 1) / 2 times the data when every level
//      fills and merges whole (the model's rule, on full trees), and within a stated band at the widget's own sizes in
//      steady state with levels sized from the bottom up.
//   5. A small LSM tree of real keys with real bloom filters: runs read per lookup with and without filters, the
//      filters' false positive rate, and the space stale versions take.
//   6. Every experiment's text, slots, answer position and word claims; the challenge's passing set.
// Usage: node enum.cjs
'use strict';
const M = require('./model.js');

let checks = 0;
const failures = [];
function check(ok, what) {
  checks++;
  if (!ok) failures.push(what);
}
const close = (a, b, tol = 1e-9) => Math.abs(a - b) <= tol * Math.max(1, Math.abs(a), Math.abs(b));
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ---------------------------------------------------------------- 1. the old storageCost
function oldStorageCost(engine, { dataGB, recordBytes, pageKB, memtableMB, ratio, writeMBps, bloom }) {
  if (engine === 'btree') {
    const fanout = Math.max(2, Math.floor((pageKB * 1024) / 16));
    const leaves = Math.max(1, (dataGB * 1024 ** 3) / (pageKB * 1024));
    const levels = 1 + Math.ceil(Math.log(leaves) / Math.log(fanout));
    const writeAmplification = (pageKB * 1024) / recordBytes + 1;
    return { writeAmplification, lookupReads: 1, levels, diskWriteMBps: writeMBps * writeAmplification };
  }
  const levels = Math.max(1, Math.ceil(Math.log((dataGB * 1024) / memtableMB) / Math.log(ratio)));
  const writeAmplification = 2 + (levels * (ratio + 1)) / 2;
  return { writeAmplification, lookupReads: bloom ? 1 : levels + 1, levels, diskWriteMBps: writeMBps * writeAmplification };
}
console.log('== 1. Against the old storageCost ==');
const heightChanged = [];
for (const s of M.ALL_SETTINGS) {
  const m = M.run(s);
  const o = { dataGB: s.data, recordBytes: s.record, pageKB: s.page, memtableMB: M.MEMTABLE_MB, ratio: s.ratio, writeMBps: M.WRITE_MBPS, bloom: !!s.bloom };
  const ob = oldStorageCost('btree', o);
  const ol = oldStorageCost('lsm', o);
  check(close(m.btree.writeAmp, ob.writeAmplification), `B-tree write amp ${JSON.stringify(s)}`);
  check(close(m.btree.diskWriteMBps, ob.diskWriteMBps), `B-tree MB/s ${JSON.stringify(s)}`);
  check(m.btree.lookupReads === ob.lookupReads, `B-tree reads ${JSON.stringify(s)}`);
  check(close(m.lsm.writeAmp, ol.writeAmplification), `LSM write amp ${JSON.stringify(s)}`);
  check(m.lsm.levels === ol.levels, `LSM levels ${JSON.stringify(s)}`);
  check(m.lsm.lookupReads === ol.lookupReads, `LSM reads ${JSON.stringify(s)}`);
  if (m.btree.height !== ob.levels && !heightChanged.some((h) => h.data === s.data && h.page === s.page)) heightChanged.push({ data: s.data, page: s.page, old: ob.levels, now: m.btree.height });
}
console.log('B-tree heights that differ from the old formula (pages 70% full now, full before):', JSON.stringify(heightChanged));
for (const [data, page, h] of [
  [100, 4, 5],
  [100, 16, 4],
  [10, 4, 4],
  [1000, 4, 5],
])
  check(M.run({ ...M.BASE, data, page }).btree.height === h, `the lesson's height ${h} at ${data} GB, ${page} KB`);

// ---------------------------------------------------------------- 2. the lesson's numbers
console.log('\n== 2. The numbers the lesson quotes ==');
const at = (patch) => M.run({ ...M.BASE, ...patch });
const d = at({});
const lesson = [
  ['B-tree default 41.96', d.btree.writeAmp, 4096 / 100 + 1],
  ['B-tree default 419.6 MB/s', d.btree.diskWriteMBps, 419.6],
  ['LSM default 24', d.lsm.writeAmp, 24],
  ['LSM default 240 MB/s', d.lsm.diskWriteMBps, 240],
  ['B-tree 1,000 B about 5', at({ record: 1000 }).btree.writeAmp, 5.096],
  ['B-tree 200 B about 21.5', at({ record: 200 }).btree.writeAmp, 21.48],
  ['B-tree 16 KB about 165', at({ page: 16 }).btree.writeAmp, 164.84],
  ['B-tree 16 KB about 1,650 MB/s', at({ page: 16 }).btree.diskWriteMBps, 1648.4],
  ['LSM 10 GB 18.5', at({ data: 10 }).lsm.writeAmp, 18.5],
  ['LSM 1,000 GB 29.5', at({ data: 1000 }).lsm.writeAmp, 29.5],
  ['LSM ratio 5: 17', at({ ratio: 5 }).lsm.writeAmp, 17],
  ['LSM ratio 4: 17', at({ ratio: 4 }).lsm.writeAmp, 17],
  ['LSM ratio 20: 33.5', at({ ratio: 20 }).lsm.writeAmp, 33.5],
];
for (const [what, got, want] of lesson) check(close(got, want, 1e-6), `${what}: ${got}`);
check(d.lsm.levels === 4 && at({ data: 10 }).lsm.levels === 3 && at({ data: 1000 }).lsm.levels === 5, 'LSM levels 3, 4, 5 by data');
check(at({ ratio: 5 }).lsm.levels === 5 && at({ ratio: 4 }).lsm.levels === 6 && at({ ratio: 20 }).lsm.levels === 3, 'LSM levels 5, 6, 3 by ratio');
check(at({ bloom: 0 }).lsm.lookupReads === 5 && d.lsm.lookupReads === 1, 'bloom off 5 reads, on 1');
check(Math.abs((d.lsm.spaceAmp - 1) * 100 - 11.1) < 0.05, `space at ratio 10 about 11%: ${d.lsm.spaceAmp}`);
check(Math.abs((at({ ratio: 5 }).lsm.spaceAmp - 1) * 100 - 25) < 0.1, `space at ratio 5 about 25%: ${at({ ratio: 5 }).lsm.spaceAmp}`);
check(Math.abs((1e9 * M.BLOOM_BITS) / 8 / 1e9 - 1.25) < 1e-9, 'a billion keys at 10 bits: 1.25 GB');
console.log(`default: B-tree ${M.formatAmp(d.btree.writeAmp)}, ${M.formatRate(d.btree.diskWriteMBps)}; LSM ${M.formatAmp(d.lsm.writeAmp)}, ${M.formatRate(d.lsm.diskWriteMBps)}; crossover record ${d.crossoverRecordB.toFixed(1)} B`);

console.log('\nB-tree by data and page (pages root first):');
for (const data of M.DATA_GB)
  for (const page of M.PAGE_KB) {
    const b = at({ data, page }).btree;
    console.log(
      `  ${String(data).padStart(5)} GB ${String(page).padStart(2)} KB: height ${b.height}, fanout ${b.fanout}, pages ${b.pages.map((p) => M.formatCount(p)).join(' > ')}, in memory ${M.formatSize(b.memoryBytes)}, on disk ${M.formatSize(b.diskBytes)}, space ${M.formatSpace(b.spaceAmp)}; write ${M.RECORD_B.map((r) => `${r} B ${M.formatAmp(at({ data, page, record: r }).btree.writeAmp)}`).join(', ')}`,
    );
  }
console.log('LSM by data and ratio (levels top first):');
for (const data of M.DATA_GB)
  for (const ratio of M.RATIOS) {
    const l = at({ data, ratio }).lsm;
    console.log(
      `  ${String(data).padStart(5)} GB ratio ${String(ratio).padStart(2)}: ${l.levels} levels (${l.levelBytes.map(M.formatSize).join(', ')}), ${M.formatAmp(l.rewritesPerLevel)} a level, write ${M.formatAmp(l.writeAmp)} = ${M.formatRate(l.diskWriteMBps)}, reads ${l.lookupReads} or ${l.runs} without filters, space ${M.formatSpace(l.spaceAmp)}, last level ${M.formatPct(l.lastShare * 100)}`,
    );
  }
console.log('Bloom filter memory by data and record:', M.DATA_GB.flatMap((data) => M.RECORD_B.map((record) => `${data} GB/${record} B ${M.formatSize(at({ data, record }).lsm.bloomBytes)}`)).join('; '));

// Everything drawn lies on its fixed scale.
for (const s of M.ALL_SETTINGS) {
  const m = M.run(s);
  check(m.btree.writeAmp <= M.WRITE_AXIS && m.lsm.writeAmp <= M.WRITE_AXIS, `write amp on the axis ${JSON.stringify(s)}`);
  check(m.btree.spaceAmp <= M.SPACE_AXIS && m.lsm.spaceAmp <= M.SPACE_AXIS, `space on the axis ${JSON.stringify(s)}`);
  check(m.lsm.runs <= 8 && m.btree.height <= 5 && m.btree.height >= 3 && m.lsm.levels >= 2 && m.lsm.levels <= 7, `rows in the reserved range ${JSON.stringify(s)}`);
  check(m.lsm.levelBytes[0] > m.lsm.memtableBytes && close(m.lsm.levelBytes.at(-1), s.data * M.GB), `level sizes ${JSON.stringify(s)}`);
  check(close(m.btree.writeParts.reduce((a, p) => a + p.amp, 0), m.btree.writeAmp) && close(m.lsm.writeParts.reduce((a, p) => a + p.amp, 0), m.lsm.writeAmp), `write parts add up ${JSON.stringify(s)}`);
}

// ---------------------------------------------------------------- 3. a real B+tree
console.log('\n== 3. A B+tree built by random inserts ==');
function lowerBound(a, k) {
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (a[mid] < k) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
function upperBound(a, k) {
  let lo = 0;
  let hi = a.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (a[mid] <= k) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}
function buildBtree(N, leafCap, fanout, rnd) {
  let rootNode = { leaf: true, keys: [] };
  function insert(node, key) {
    if (node.leaf) {
      node.keys.splice(lowerBound(node.keys, key), 0, key);
      if (node.keys.length <= leafCap) return null;
      const right = { leaf: true, keys: node.keys.splice(node.keys.length >> 1) };
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
    const up = node.keys.pop();
    return { key: up, right: { leaf: false, keys, kids } };
  }
  const keys = Array.from({ length: N }, (_, i) => i);
  for (let i = N - 1; i > 0; i--) {
    const j = Math.floor(rnd() * (i + 1));
    [keys[i], keys[j]] = [keys[j], keys[i]];
  }
  for (const k of keys) {
    const split = insert(rootNode, k);
    if (split) rootNode = { leaf: false, keys: [split.key], kids: [rootNode, split.right] };
  }
  const levels = [];
  (function walk(node, depth) {
    (levels[depth] ??= { pages: 0, entries: 0 }).pages++;
    levels[depth].entries += node.leaf ? node.keys.length : node.kids.length;
    if (!node.leaf) for (const kid of node.kids) walk(kid, depth + 1);
  })(rootNode, 0);
  function lookup(key) {
    let node = rootNode;
    let pages = 1;
    while (!node.leaf) {
      node = node.kids[upperBound(node.keys, key)];
      pages++;
    }
    return { pages, found: node.keys[lowerBound(node.keys, key)] === key, leaf: node };
  }
  return { levels, lookup, height: levels.length };
}
for (const [N, pageB, recordB] of [
  [400000, 4096, 100],
  [150000, 4096, 100],
  [60000, 4096, 1000],
  [300000, 8192, 200],
]) {
  const leafCap = Math.floor(pageB / recordB);
  const fanout = Math.floor(pageB / M.POINTER_B);
  const rnd = mulberry32(7 + N);
  const t = buildBtree(N, leafCap, fanout, rnd);
  const leaves = t.levels.at(-1).pages;
  const leafFill = N / (leaves * leafCap);
  const interior = t.levels.slice(1, -1);
  const interiorFill = interior.length ? interior.reduce((a, l) => a + l.entries, 0) / (interior.reduce((a, l) => a + l.pages, 0) * fanout) : NaN;
  // The model's tree for the same records: pages 70% full.
  const modelLeaves = Math.ceil(N / (M.PAGE_FILL * leafCap));
  const modelFanout = Math.floor(M.PAGE_FILL * fanout);
  const modelPages = [modelLeaves];
  while (modelPages[0] > 1) modelPages.unshift(Math.ceil(modelPages[0] / modelFanout));
  let walked = 0;
  let found = 0;
  const lookups = 2000;
  for (let i = 0; i < lookups; i++) {
    const r = t.lookup(Math.floor(rnd() * N));
    walked += r.pages;
    found += r.found ? 1 : 0;
  }
  console.log(
    `  ${N} records of ${recordB} B in ${pageB} B pages: leaves ${leaves} (${(leafFill * 100).toFixed(1)}% full), interior ${isNaN(interiorFill) ? 'root only' : (interiorFill * 100).toFixed(1) + '% full'}, height ${t.height}; the model: ${modelLeaves} leaves, height ${modelPages.length}; a lookup walks ${(walked / lookups).toFixed(2)} pages`,
  );
  check(Math.abs(leafFill - M.PAGE_FILL) < 0.03, `leaf fill ${leafFill} near ${M.PAGE_FILL}`);
  check(Math.abs(leaves - modelLeaves) / modelLeaves < 0.04, `leaf count ${leaves} against the model's ${modelLeaves}`);
  check(t.height === modelPages.length, `simulated height ${t.height} against the model's ${modelPages.length}`);
  check(walked === lookups * t.height && found === lookups, 'a lookup touches one page a level and finds its key');
  // Updates: a buffer pool that writes dirty pages back every K updates writes one page for each distinct leaf.
  for (const share of [0.01, 0.16]) {
    const K = Math.max(1, Math.round(share * leaves));
    let pagesWritten = 0;
    const rounds = 40;
    for (let r = 0; r < rounds; r++) {
      const dirty = new Set();
      for (let i = 0; i < K; i++) dirty.add(t.lookup(Math.floor(rnd() * N)).leaf);
      pagesWritten += dirty.size;
    }
    const perUpdate = pagesWritten / (rounds * K);
    const expected = (1 - Math.exp(-share)) / share;
    if (N === 400000) console.log(`    a batch of ${K} updates (${share * 100}% of the leaves) writes ${perUpdate.toFixed(3)} pages an update (uniform keys predict ${expected.toFixed(3)}); the model writes 1`);
    check(Math.abs(perUpdate - expected) < 0.03, `pages per update ${perUpdate} against ${expected}`);
  }
}
// What a 60 s checkpoint would gather at the default: the model's "alone" overstates by this much.
{
  const updates = (M.WRITE_MBPS * M.MB) / M.BASE.record;
  const share = (updates * 60) / d.btree.leaves;
  const perUpdate = (1 - Math.exp(-share)) / share;
  console.log(`  at the default, 60 s of updates touch ${(share * 100).toFixed(1)}% of the leaves: ${perUpdate.toFixed(3)} page writes an update, ${M.formatAmp(perUpdate * (d.btree.pageB / M.BASE.record) + 1)} against the model's ${M.formatAmp(d.btree.writeAmp)}`);
  check(perUpdate > 0.9, 'the default data dwarfs a checkpoint of updates');
}

// ---------------------------------------------------------------- 4. an LSM tree that counts bytes
console.log('\n== 4. A simulated LSM tree, counting the bytes it writes ==');
/** Unique records into an empty tree until its last level is full; every level that fills merges whole into the next. */
function lsmFill(m, T, L) {
  const cap = Array.from({ length: L }, (_, j) => m * T ** (j + 1));
  const size = new Array(L).fill(0);
  const N = cap[L - 1];
  let written = 0;
  const perLevel = new Array(L).fill(0);
  function merge(j, n) {
    perLevel[j] += size[j] + n;
    written += size[j] + n;
    size[j] += n;
    if (size[j] >= cap[j] && j < L - 1) {
      const all = size[j];
      size[j] = 0;
      merge(j + 1, all);
    }
  }
  for (let k = 0; k < N / m; k++) {
    written += 2 * m;
    merge(0, m);
  }
  return { amp: written / N, perLevel: perLevel.map((w) => w / N) };
}
let fills = 0;
for (const m of [1, 3, 8])
  for (const T of [2, 3, 4, 5, 10, 20])
    for (let L = 1; L <= 5; L++) {
      if (m * T ** L > 2e6) continue;
      const sim = lsmFill(m, T, L);
      fills++;
      check(close(sim.amp, 2 + (L * (T + 1)) / 2), `fill m ${m} T ${T} L ${L}: ${sim.amp}`);
      check(sim.perLevel.every((p) => close(p, (T + 1) / 2)), `each level (T + 1) / 2 at m ${m} T ${T} L ${L}`);
    }
console.log(`  full trees (every level fills and merges whole), ${fills} shapes: bytes written are exactly 2 + L (T + 1) / 2 times the data, (T + 1) / 2 at every level`);

/** The widget's sizes in steady state: levels sized from the bottom up, random overwrites, the last level always full. */
function lsmSteady(dataMB, T, memMB) {
  const model = M.lsm({ data: dataMB / 1024, record: 100, ratio: T, bloom: 1 });
  const L = model.levels;
  const cap = model.levelBytes.map((b) => b / M.MB);
  const size = new Array(L).fill(0);
  size[L - 1] = dataMB;
  let written = 0;
  let ingested = 0;
  let spaceMax = 0;
  let spaceSum = 0;
  let steps = 0;
  const perLevel = new Array(L).fill(0);
  function merge(j, n) {
    if (j === L - 1) {
      // New versions replace old ones: the output is the data again.
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
  }
  const total = 60 * dataMB;
  while (ingested < total) {
    written += 2 * memMB;
    ingested += memMB;
    merge(0, memMB);
    const used = size.reduce((a, b) => a + b, 0) / dataMB;
    spaceMax = Math.max(spaceMax, used);
    spaceSum += used;
    steps++;
  }
  return { amp: written / ingested, perLevel: perLevel.map((w) => w / ingested), spaceMax, spaceMean: spaceSum / steps, model };
}
let worst = 0;
let worstSpace = 0;
for (const data of M.DATA_GB)
  for (const T of M.RATIOS) {
    const sim = lsmSteady(data * 1024, T, M.MEMTABLE_MB);
    const gap = sim.amp / sim.model.writeAmp - 1;
    worst = Math.max(worst, Math.abs(gap));
    worstSpace = Math.max(worstSpace, sim.spaceMax - sim.model.spaceAmp);
    console.log(
      `  ${String(data).padStart(5)} GB ratio ${String(T).padStart(2)}: simulated ${sim.amp.toFixed(2)}× (levels ${sim.perLevel.map((p) => p.toFixed(2)).join(', ')}) against the model's ${M.formatAmp(sim.model.writeAmp)} (${gap >= 0 ? '+' : ''}${(gap * 100).toFixed(1)}%); space at most ${sim.spaceMax.toFixed(3)}×, mean ${sim.spaceMean.toFixed(3)}×, the model's most ${M.formatSpace(sim.model.spaceAmp)}`,
    );
    // A two-level tree at ratio 20 is the outlier: its always-full last level costs the whole ratio.
    check(Math.abs(gap) < (data === 10 && T === 20 ? 0.16 : 0.08), `steady-state write amp within the band at ${data} GB ratio ${T}: ${sim.amp} against ${sim.model.writeAmp}`);
    check(sim.spaceMean <= sim.model.spaceAmp + 1e-9, `mean space under the model's most at ${data} GB ratio ${T}`);
  }
console.log(`  steady state, levels sized from the bottom up: the simulated tree's bytes are within 8% of the model at 11 of the 12 sizes and ${(worst * 100).toFixed(1)}% over it at the twelfth, 10 GB at ratio 20 (the always-full last level costs T, the small top level less than (T + 1) / 2, and the two nearly cancel but in a two-level tree); its space never passes the model's "at most" (${worstSpace.toFixed(3)}× at the closest)`);

// ---------------------------------------------------------------- 5. real keys, real bloom filters
console.log('\n== 5. A small LSM tree of real keys ==');
function bloomOf(keys, bitsPerKey) {
  const bits = Math.max(64, keys.length * bitsPerKey);
  const k = Math.max(1, Math.round(bitsPerKey * Math.LN2));
  const arr = new Uint8Array(Math.ceil(bits / 8));
  const h1 = (x) => Math.imul(x ^ (x >>> 16), 0x85ebca6b) >>> 0;
  const h2 = (x) => (Math.imul((x + 0x9e3779b9) ^ (x >>> 13), 0xc2b2ae35) >>> 0) | 1;
  const probes = (key) => {
    const a = h1(key + 1);
    const b = h2(key + 7);
    return Array.from({ length: k }, (_, i) => (a + Math.imul(i, b)) >>> 0).map((h) => h % bits);
  };
  for (const key of keys) for (const p of probes(key)) arr[p >> 3] |= 1 << (p & 7);
  return (key) => probes(key).every((p) => arr[p >> 3] & (1 << (p & 7)));
}
function lsmKeys(m, T, L, rounds, seed) {
  const N = m * T ** L;
  const rnd = mulberry32(seed);
  const cap = Array.from({ length: L }, (_, j) => m * T ** (j + 1));
  const mkRun = (map) => ({ map, maybe: bloomOf([...map.keys()], M.BLOOM_BITS) });
  const empty = () => mkRun(new Map());
  let memtable = new Map();
  let l0 = null;
  const levels = Array.from({ length: L }, empty);
  // Start full: every key in the last level.
  levels[L - 1] = mkRun(new Map(Array.from({ length: N }, (_, k) => [k, 0])));
  let written = 0;
  let ingested = 0;
  let seq = 1;
  function mergeDown(j, incoming) {
    const out = new Map(levels[j].map);
    for (const [k, v] of incoming) out.set(k, v);
    written += out.size;
    if (j < L - 1 && out.size >= cap[j]) {
      levels[j] = empty();
      mergeDown(j + 1, out);
    } else levels[j] = mkRun(out);
  }
  const stats = { lookups: 0, readsOff: 0, readsOn: 0, inLast: 0, readsOffLast: 0, negatives: 0, falsePositives: 0, runsMax: 0, spaceMax: 0, spaceSum: 0, spaceSteps: 0 };
  function lookup(key) {
    stats.lookups++;
    if (memtable.has(key)) return;
    const runs = [l0, ...levels].filter((r) => r && r.map.size);
    stats.runsMax = Math.max(stats.runsMax, runs.length);
    let off = 0;
    let on = 0;
    for (const r of runs) {
      off++;
      const maybe = r.maybe(key);
      const has = r.map.has(key);
      if (maybe) on++;
      if (!has) {
        stats.negatives++;
        if (maybe) stats.falsePositives++;
      } else {
        if (r === levels[L - 1]) {
          stats.inLast++;
          stats.readsOffLast += off;
        }
        break;
      }
    }
    stats.readsOff += off;
    stats.readsOn += on;
  }
  for (let round = 0; round < rounds; round++) {
    while (memtable.size < m) {
      memtable.set(Math.floor(rnd() * N), seq++);
      ingested++;
      written++;
    }
    if (l0) mergeDown(0, l0.map);
    l0 = mkRun(memtable);
    written += memtable.size;
    memtable = new Map();
    if (round > rounds / 4) {
      const stored = l0.map.size + levels.reduce((a, r) => a + r.map.size, 0);
      stats.spaceMax = Math.max(stats.spaceMax, stored / N);
      stats.spaceSum += stored / N;
      stats.spaceSteps++;
      if (round % 7 === 0) for (let i = 0; i < 300; i++) lookup(Math.floor(rnd() * N));
    }
  }
  return { N, amp: written / ingested, ...stats };
}
for (const [m, T, L] of [
  [64, 4, 3],
  [32, 10, 2],
  [16, 5, 4],
]) {
  const sim = lsmKeys(m, T, L, 1500, 11 + T);
  const model = { runs: L + 1, space: 1 + Array.from({ length: L - 1 }, (_, j) => T ** -(j + 1)).reduce((a, b) => a + b, 0), amp: 2 + (L * (T + 1)) / 2 };
  const fp = sim.falsePositives / sim.negatives;
  console.log(
    `  memtable ${m} keys, ratio ${T}, ${L} levels, ${sim.N} keys: without filters ${(sim.readsOff / sim.lookups).toFixed(2)} runs read a lookup (${(sim.readsOffLast / sim.inLast).toFixed(2)} for a key in the last level, ${((sim.inLast / sim.lookups) * 100).toFixed(0)}% of lookups; the model: ${model.runs}); with filters ${(sim.readsOn / sim.lookups).toFixed(3)} (the model: 1); false positives ${(fp * 100).toFixed(2)}%; space mean ${(sim.spaceSum / sim.spaceSteps).toFixed(3)}×, most ${sim.spaceMax.toFixed(3)}× (the model's most ${model.space.toFixed(3)}×); written ${sim.amp.toFixed(2)}× (the model ${model.amp})`,
  );
  check(sim.runsMax <= model.runs, `never more than ${model.runs} runs to search`);
  check(sim.readsOffLast / sim.inLast <= model.runs && sim.readsOffLast / sim.inLast > model.runs - 1.6, `a last-level key reads close to every run without filters: ${sim.readsOffLast / sim.inLast}`);
  check(sim.readsOn / sim.lookups < 1.08 && sim.readsOn / sim.lookups > 0.85, `about one read with filters: ${sim.readsOn / sim.lookups}`);
  check(fp > 0.003 && fp < 0.02, `false positives about 1%: ${fp}`);
  check(sim.spaceSum / sim.spaceSteps <= model.space, 'mean space under the model\'s most');
}

// ---------------------------------------------------------------- 6. experiments
console.log('\n== 6. Experiments ==');
const positions = [];
for (const spec of M.EXPERIMENTS) {
  const e = M.renderExperiment(spec);
  console.log(`\n[${e.id}] ${e.title}`);
  console.log(`  setup ${JSON.stringify(spec.setup)}${spec.act ? `, act ${JSON.stringify(spec.act)}` : ''}; hides ${JSON.stringify(spec.hide)}; focus ${JSON.stringify(spec.focus)}`);
  console.log(`  ASK    ${e.ask}`);
  e.choices.forEach((c, i) => console.log(`  ${i === e.answer ? '(*)' : '( )'}    ${c}`));
  console.log(`  REVEAL ${e.reveal}`);
  for (const t of [spec.title, spec.ask, spec.reveal, ...(spec.choices ?? []).map((c) => c.text)]) check(M.strayDigits(t).length === 0, `${spec.id}: a digit outside a slot in "${t}"`);
  for (const t of [e.title, e.ask, e.reveal, ...e.choices]) {
    check(!/—| /.test(t), `${spec.id}: an em dash or a non-breaking space`);
  }
  if (spec.choices) {
    positions.push(e.answer + 1);
    check(new Set(e.choices).size === e.choices.length, `${spec.id}: choices differ`);
    check(e.choices[e.answer].includes(M.formatSlot(e.slots[spec.truth])), `${spec.id}: the right choice holds its truth`);
  }
}
console.log(`\nanswer positions: ${positions.join(', ')}`);
check(JSON.stringify(positions) === JSON.stringify([3, 2, 2, 1, 1]), `answer positions ${positions}`);

// The reveals' word claims.
{
  const a = M.run(M.SETUP.record);
  const b = M.run({ ...M.SETUP.record, record: 1000 });
  check(Math.abs(1000 / b.btree.writeBytes - 0.25) < 0.06, `"about a quarter": ${1000 / b.btree.writeBytes}`);
  check(Math.abs(a.btree.writeBytes / 100 - 40) < 2.5, `"about a fortieth": 1 / ${a.btree.writeBytes / 100}`);
  check(close(b.lsm.writeAmp, a.lsm.writeAmp), 'E3: the LSM cost does not move with the record');
  check(b.btree.writeAmp < b.lsm.writeAmp && a.btree.writeAmp > a.lsm.writeAmp, 'E3: the order flips');
  check(b.settings.record / a.settings.record === 10, 'E3: "ten times the record"');
  const c = M.run(M.SETUP.compaction);
  check(c.lsm.mergesToFill === c.settings.ratio && c.lsm.partsWritten / c.settings.ratio === c.lsm.rewritesPerLevel, 'E2: the first of the merges writes ratio times, the last once, the average (ratio + 1) / 2');
  check(close(2 + c.lsm.levels * c.lsm.rewritesPerLevel, c.lsm.writeAmp), 'E2: log, flush and the levels make the total');
  check(Math.abs(b.crossoverRecordB - 178.1) < 0.1, `E3: crossover ${b.crossoverRecordB}`);
  const g0 = M.run(M.SETUP.growth);
  const g1 = M.run({ ...M.SETUP.growth, data: 1000 });
  check(g1.settings.data / g0.settings.data === 10, 'E5: "ten times"');
  check(g1.lsm.levels === g0.lsm.levels + 1, 'E5: "one more level"');
  check(g1.btree.height === g0.btree.height && close(g1.btree.writeAmp, g0.btree.writeAmp), 'E5: the B-tree "still"');
  const f = M.run(M.SETUP.filters);
  check(f.lsm.skipped === f.lsm.levels && f.lsm.runs === f.lsm.levels + 1, 'E4: every run but the last skipped');
  check(Math.abs(f.lsm.lastShare - 0.9) < 0.005, `E4: "about 90%": ${f.lsm.lastShare}`);
  const sol = M.run({ ...M.SETUP.challenge, ...M.CHALLENGE_SOLUTION });
  const four = M.run({ ...M.SETUP.challenge, ...M.CHALLENGE_SOLUTION, ratio: 4 });
  check(close(sol.lsm.writeAmp, four.lsm.writeAmp), 'challenge: ratio 4 writes "the same"');
  check(Number.isInteger(sol.lsm.rewritesPerLevel), 'challenge: the solution rewrites a whole number of times a level');
}

// The challenge: which settings pass.
{
  const spec = M.EXPERIMENTS.at(-1);
  const pass = M.ALL_SETTINGS.filter((s) => M.goalMet(spec.goal, s, M.run(s).metrics));
  const lsmConfigs = new Set(pass.map((s) => `${s.data} GB, ratio ${s.ratio}, bloom ${s.bloom ? 'on' : 'off'}`));
  const allLsm = new Set(M.ALL_SETTINGS.map((s) => `${s.data}|${s.ratio}|${s.bloom}`));
  console.log(`\nchallenge: ${pass.length} of ${M.ALL_SETTINGS.length} settings pass, all of them one LSM configuration of ${allLsm.size}: ${[...lsmConfigs].join('; ')} (the record size, the page size and the operation followed play no part in the goal: 3 x 3 x 2 = 18)`);
  check(lsmConfigs.size === 1 && pass.length === 18, `challenge passing set ${[...lsmConfigs]}`);
  check(pass.every((s) => s.data === M.CHALLENGE_SOLUTION.data && s.ratio === M.CHALLENGE_SOLUTION.ratio && s.bloom === 0), 'the solution is the one stated');
  check(!M.goalMet(spec.goal, spec.setup, M.run(spec.setup).metrics), 'the challenge starts unmet');
  for (const data of M.DATA_GB)
    for (const ratio of M.RATIOS) {
      const m = M.run({ ...spec.setup, data, ratio });
      console.log(`  ${String(data).padStart(5)} GB ratio ${String(ratio).padStart(2)}: writes ${M.formatAmp(m.lsm.writeAmp).padStart(6)} ${m.lsm.writeAmp < 20 ? 'ok ' : 'no '} reads ${m.lsm.lookupReads} ${m.lsm.lookupReads < 7 ? 'ok ' : 'no '} data ${data >= 100 ? 'ok' : 'no'}${M.goalMet(spec.goal, { ...spec.setup, data, ratio }, m.metrics) ? '   <= passes' : ''}`);
    }
  const margin = M.run({ ...spec.setup, ...M.CHALLENGE_SOLUTION }).lsm.writeAmp / M.CHALLENGE_BOUNDS.lsmWrite;
  console.log(`  the solution sits ${((1 - margin) * 100).toFixed(0)}% under the write bound`);
}

console.log(`\n${checks} checks, ${failures.length} failed`);
for (const f of failures) console.log(`  FAILED ${f}`);
process.exit(failures.length ? 1 : 0);
