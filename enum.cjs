// Prints every number the CDNs & Edge widget shows, checks the model against independent computations, and
// enumerates the challenge.
//   1. The old `cdnOutcome` (libs/engine/src/sysdesign/lessons/widgets.ts), re-implemented: the edge hit rate is equal
//      at every setting with a normalized key, the origin share and rate at every one without a shield, and the mean
//      response there at 20 locations; with a shield, the old and new origin shares are printed side by side.
//   2. Every number the lesson quotes.
//   3. A discrete-event simulation: Zipf requests (Poisson arrivals, a uniform location and URL each) through a TTL
//      cache at every location and at the shield. The edge rule rT / (1 + rT) is exact for Poisson requests; the
//      shield's arrivals (the locations' misses) are not Poisson, and the simulation measures what that costs.
//   4. The square's areas equal the model's shares exactly, at every setting and several widths.
//   5. The timeline sample: a seed at every setting, counts within the rule, element counts bounded, and its long-run
//      hit share against the model.
//   6. Every experiment's text, slots, answer positions and word claims; the challenge's passing set.
// Usage: node enum.cjs [--quick] (skips the long simulations)
'use strict';
const M = require('./model.js');
const quick = process.argv.includes('--quick');

let checks = 0;
const failures = [];
function check(ok, what) {
  checks++;
  if (!ok) failures.push(what);
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;
const { fmt } = M;

// 1. The old cdnOutcome, as shipped.
function cdnOutcome({ rps, objects, zipf, pops, ttlSec, shield, edgeMs, shieldMs, originMs }) {
  const weights = Array.from({ length: objects }, (_, i) => 1 / (i + 1) ** zipf);
  const total = weights.reduce((a, b) => a + b, 0);
  const hit = (rate) => (rate * ttlSec) / (1 + rate * ttlSec);
  let edgeHits = 0;
  let shieldHits = 0;
  for (const w of weights) {
    const rate = (rps * w) / total;
    const edgeHit = hit(rate / pops);
    const missRate = rate * (1 - edgeHit);
    edgeHits += rate * edgeHit;
    if (shield) shieldHits += missRate * hit(missRate);
  }
  const originRps = rps - edgeHits - shieldHits;
  const edgeHitRate = edgeHits / rps;
  const meanMs = edgeMs + (1 - edgeHitRate) * (shield ? shieldMs : 0) + (originRps / rps) * originMs;
  return { edgeHitRate, originShare: originRps / rps, originRps, meanMs };
}
console.log('1. The old cdnOutcome against the model');
for (const s of M.SETTINGS.filter((x) => x.variants === 1)) {
  const o = cdnOutcome({ rps: s.rps, objects: 100000, zipf: 1, pops: s.pops, ttlSec: s.ttl, shield: !!s.shield, edgeMs: 10, shieldMs: 30, originMs: 120 });
  const a = M.scenario(s);
  check(near(o.edgeHitRate, a.edgeShare, 1e-9), `edge ${JSON.stringify(s)}`);
  if (s.shield) {
    if (s.rps === 10000 && s.ttl === 60) console.log(`   shield at ${s.pops} locations: origin ${fmt.pct(o.originShare)} (old rule) against ${fmt.pct(a.originShare)} (model)`);
    continue;
  }
  check(near(o.originShare, a.originShare, 1e-9), `origin share ${JSON.stringify(s)}`);
  check(near(o.originRps, a.originRps, 1e-6), `origin rps ${JSON.stringify(s)}`);
  if (s.pops === 20) check(near(o.meanMs, a.meanMs, 1e-9), `mean at 20 ${JSON.stringify(s)}`);
}
// Ten URLs an object is the same cache as ten times the traffic split ten ways: shares equal those at a tenth of the rps.
for (const s of M.SETTINGS.filter((x) => x.variants === 10 && x.rps > 1000)) {
  const a = M.scenario(s);
  const b = M.scenario({ ...s, rps: s.rps / 10, variants: 1 });
  check(near(a.edgeShare, b.edgeShare, 1e-9) && near(a.originShare, b.originShare, 1e-9), `variants equivalence ${JSON.stringify(s)}`);
}
console.log(`   ${checks} checks`);

// 2. The lesson's numbers (its tryThis lines and first example).
console.log('2. The lesson\'s numbers');
const sc = (o) => M.scenario({ ...M.BASE, ...o });
const quoted = [
  ['default edge 69%', sc({}).edgeShare, 0.69, 0.005],
  ['default origin 31%', sc({}).originShare, 0.31, 0.005],
  ['default origin 3,100/s', sc({}).originRps, 3100, 50],
  ['shield origin 9%', sc({ shield: 1 }).originShare, 0.09, 0.005],
  ['shield origin about 900/s (lesson 890)', sc({ shield: 1 }).originRps, 900, 25],
  ['default mean 47 ms', sc({}).meanMs, 47, 0.5],
  ['shield mean 30 ms', sc({ shield: 1 }).meanMs, 30, 0.5],
  ['1 location 91%', sc({ pops: 1 }).edgeShare, 0.91, 0.005],
  ['5 locations 80%', sc({ pops: 5 }).edgeShare, 0.8, 0.005],
  ['100 locations 56%', sc({ pops: 100 }).edgeShare, 0.56, 0.005],
  ['100 locations origin 44%', sc({ pops: 100 }).originShare, 0.44, 0.005],
  ['100 locations 4,400/s', sc({ pops: 100 }).originRps, 4400, 50],
  ['100 locations shield 9%', sc({ pops: 100, shield: 1 }).originShare, 0.09, 0.005],
  ['100 locations shield ~900/s', sc({ pops: 100, shield: 1 }).originRps, 900, 20],
  ['5 s 49%', sc({ ttl: 5 }).edgeShare, 0.49, 0.005],
  ['5 min 82%', sc({ ttl: 300 }).edgeShare, 0.82, 0.005],
  ['1 h 96%', sc({ ttl: 3600 }).edgeShare, 0.96, 0.005],
  ['1 h shield 27/s (lesson 26)', sc({ ttl: 3600, shield: 1 }).originRps, 27, 1],
  ['1,000/s 50%', sc({ rps: 1000 }).edgeShare, 0.5, 0.005],
  ['100,000/s 87%', sc({ rps: 100000 }).edgeShare, 0.87, 0.005],
  ['example: 1 h at 100 locations 88%', sc({ ttl: 3600, pops: 100 }).edgeShare, 0.88, 0.005],
];
for (const [what, got, want, tol] of quoted) {
  check(near(got, want, tol), `${what}: ${got}`);
  console.log(`   ${what.padEnd(36)} ${typeof got === 'number' && got < 1 ? fmt.pct(got) : got.toFixed(1)}`);
}
// The example's single image asked once a second: r·T = 3 at 20 locations (75%), 0.6 at 100 (37.5%), the shield 97%.
{
  const r = 1;
  const at20 = M.hit(r / 20, 60);
  const at100 = M.hit(r / 100, 60);
  const shield = M.hit(r * (1 - at100), 60);
  check(near(at20, 0.75, 1e-9) && near(at100, 0.375, 1e-9) && near(shield, 0.974, 0.001), 'example image');
}

// 3. A discrete-event simulation of the mechanism.
function des(s, { ttls = 10, warm = 2, seed = 7 } = {}) {
  const rand = M.mulberry32(seed);
  const N = M.OBJECTS;
  const cum = new Float64Array(N + 1);
  for (let k = 1; k <= N; k++) cum[k] = M.cumShare(k);
  const pick = (u) => {
    let lo = 1;
    let hi = N;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (cum[mid] >= u) hi = mid;
      else lo = mid + 1;
    }
    return lo;
  };
  const keys = N * s.variants;
  const edge = new Float32Array(keys * s.pops).fill(-1e9);
  const shield = new Float32Array(keys).fill(-1e9);
  const T = s.ttl;
  const end = (ttls + warm) * T;
  let t = 0;
  let n = 0;
  let e = 0;
  let sh = 0;
  let o = 0;
  let lat = 0;
  const em = M.edgeMs(s.pops);
  while (t < end) {
    t += -Math.log(1 - rand()) / s.rps;
    const k = pick(rand());
    const v = (rand() * s.variants) | 0;
    const loc = (rand() * s.pops) | 0;
    const kk = (k - 1) * s.variants + v;
    const ei = kk * s.pops + loc;
    const counting = t > warm * T;
    if (edge[ei] > t) {
      if (counting) {
        n++;
        e++;
        lat += em;
      }
      continue;
    }
    edge[ei] = t + T;
    if (s.shield) {
      if (shield[kk] > t) {
        if (counting) {
          n++;
          sh++;
          lat += em + M.SHIELD_MS;
        }
        continue;
      }
      shield[kk] = t + T;
    }
    if (counting) {
      n++;
      o++;
      lat += em + (s.shield ? M.SHIELD_MS : 0) + M.ORIGIN_MS;
    }
  }
  return { n, edge: e / n, shield: sh / n, origin: o / n, mean: lat / n };
}
console.log('3. Discrete-event simulation (edge exact for Poisson; shield approximate)');
const DES_SETTINGS = [
  ['default', { ...M.BASE }],
  ['E1 setup, 5 min', { ...M.BASE, ttl: 300 }],
  ['E2, 100 locations', { ...M.BASE, pops: 100 }],
  ['E3, 100 + shield', { ...M.BASE, pops: 100, shield: 1 }],
  ['shield, 20', { ...M.BASE, shield: 1 }],
  ['E5, 10 URLs + shield', { ...M.BASE, shield: 1, variants: 10 }],
  ['challenge solution', { ...M.BASE, pops: 100, ttl: 300, shield: 1 }],
  ['near miss, 20 + 5 min + shield', { ...M.BASE, ttl: 300, shield: 1 }],
  ['1 location + shield, 5 s', { ...M.BASE, pops: 1, ttl: 5, shield: 1 }],
  ['1,000/s, 1 h, 5 + shield', { rps: 1000, pops: 5, ttl: 3600, shield: 1, variants: 1 }],
  ['E4, 100,000/s', { ...M.BASE, rps: 100000 }],
];
let worstEdge = 0;
let worstShield = 0;
for (const [name, s] of quick ? DES_SETTINGS.slice(0, 3) : DES_SETTINGS) {
  const t0 = Date.now();
  const d = des(s, { ttls: s.ttl >= 300 ? 4 : 10 });
  const a = M.scenario(s);
  const de = d.edge - a.edgeShare;
  const ds = d.shield - a.shieldShare;
  worstEdge = Math.max(worstEdge, Math.abs(de));
  if (s.shield) worstShield = Math.max(worstShield, Math.abs(d.origin - a.originShare));
  check(Math.abs(de) < 0.004, `DES edge ${name}: ${d.edge} vs ${a.edgeShare}`);
  if (s.shield) check(Math.abs(d.origin - a.originShare) < 0.004, `DES origin with shield ${name}: ${d.origin} vs ${a.originShare}`);
  check(Math.abs(d.mean - a.meanMs) / a.meanMs < 0.03, `DES mean ${name}`);
  console.log(
    `   ${name.padEnd(32)} edge ${fmt.pct(d.edge)} (model ${fmt.pct(a.edgeShare)})  shield ${fmt.pct(d.shield)} (${fmt.pct(a.shieldShare)})  origin ${fmt.pct(d.origin)} (${fmt.pct(a.originShare)})  mean ${d.mean.toFixed(1)} (${a.meanMs.toFixed(1)}) ms  [${(d.n / 1e6).toFixed(1)}M requests, ${((Date.now() - t0) / 1000).toFixed(1)} s]`,
  );
}
console.log(`   worst edge gap ${(worstEdge * 100).toFixed(2)} points; worst origin gap with a shield ${(worstShield * 100).toFixed(2)} points`);

// 4. The square's areas are the shares, exactly.
console.log('4. The square\'s areas');
for (const s of M.SETTINGS) {
  const a = M.scenario(s);
  for (const n of [200, 333, 560]) {
    const cols = M.columns(a, n);
    const edge = cols.reduce((x, c) => x + c.edge, 0) / n;
    const shield = cols.reduce((x, c) => x + c.shield, 0) / n;
    check(near(edge, a.edgeShare, 1e-9) && near(shield, a.shieldShare, 1e-9), `areas ${JSON.stringify(s)} at ${n}`);
    check(cols.every((c) => c.edge >= -1e-9 && c.edge + c.shield <= 1 + 1e-9), `column heights ${JSON.stringify(s)}`);
  }
  // The curve falls with rank (popular first), so the half-hit rank is where the edge band crosses one half.
  const cols = M.columns(a, 400);
  check(cols.every((c, i) => i === 0 || c.edge <= cols[i - 1].edge + 1e-9), `edge falls ${JSON.stringify(s)}`);
}
console.log(`   ranks 1-10 take ${fmt.pct(M.cumShare(10))}, the first ${fmt.pct(M.share(1))}; ranks 10,001-100,000 take ${fmt.pct(1 - M.cumShare(10000))}`);
check(near(1 - M.cumShare(10000), 0.19, 0.001), 'tail share 19.0%');

// 5. The timeline sample.
console.log('5. The timeline sample');
let maxSeed = 0;
let maxMarks = 0;
let pooled = { n: 0, hits: 0, want: 0 };
for (const s of M.SETTINGS) {
  const a = M.scenario(s);
  const sm = M.sample(a);
  check(!!sm, `sample at ${JSON.stringify(s)}`);
  if (!sm) continue;
  maxSeed = Math.max(maxSeed, sm.seed);
  for (const [i, l] of sm.lanes.entries()) {
    const marks = l.reqs.length + l.copies.length + (l.shield ? l.shield.arrivals.length + l.shield.copies.length : 0);
    maxMarks = Math.max(maxMarks, marks);
    check(l.reqs.length <= M.DENSE + 40, `lane marks bounded ${JSON.stringify(s)} ${i}`);
    check(l.reqs.every((q, j) => j === 0 || q.at >= l.reqs[j - 1].at), 'requests in time order');
    check(l.copies.every((c) => Math.abs(c.to - c.from - s.ttl) < 1e-6 * s.ttl || c.earlier), 'copies last the TTL');
    check(l.reqs.filter((q) => !q.hit).every((q) => l.copies.some((c) => c.from === q.at)), 'every miss starts a copy');
    check(l.reqs.filter((q) => q.hit).every((q) => l.copies.some((c) => c.from <= q.at && q.at < c.to)), 'every hit inside a copy');
  }
}
// Unselected seeds: the sampler itself is unbiased (long-run hit share of the middle lane against the model).
for (const s of [M.BASE, { ...M.BASE, pops: 100 }, { ...M.BASE, ttl: 300 }]) {
  const a = M.scenario(s);
  const rand = M.mulberry32(99);
  let n = 0;
  let h = 0;
  for (let i = 0; i < 4000; i++) {
    const lane = a.lanes[1];
    // Re-run the edge lane rule directly: one long window.
    let t = 0;
    let end = rand() < lane.edge ? rand() * s.ttl : -1;
    const W = 5 * s.ttl;
    for (;;) {
      t += -Math.log(1 - rand()) / lane.perPop;
      if (t >= W) break;
      n++;
      if (t < end) h++;
      else end = t + s.ttl;
    }
  }
  pooled = { n, hits: h, want: a.lanes[1].edge };
  check(near(h / n, a.lanes[1].edge, 0.01), `sampler unbiased ${JSON.stringify(s)}: ${h / n} vs ${a.lanes[1].edge}`);
  console.log(`   lane #2,500 at ${s.pops} locations, ${fmt.ttlShort(s.ttl)}: sampled ${fmt.pct(h / n)} over ${n} requests, model ${fmt.pct(a.lanes[1].edge)}`);
}
console.log(`   every setting has a sample (largest seed ${maxSeed}); at most ${maxMarks} marks a lane`);

// 6. The experiments.
console.log('6. The experiments');
const DIGITS_OK = /\?utm_source=…/g;
const noDigits = (t, where) => check(!/\d/.test(t.replace(/\{\w+\}/g, '').replace(DIGITS_OK, '')), `digit outside a slot: ${where}`);
const base = M.scenario(M.BASE);
const positions = [];
for (const e of M.EXPERIMENTS) {
  const s2 = M.afterAct(e);
  const v = M.slots(e, e.setup, s2);
  noDigits(e.ask, `E${e.id} ask`);
  noDigits(e.reveal, `E${e.id} reveal`);
  e.choices.forEach((c, i) => noDigits(c.text, `E${e.id} choice ${i}`));
  const filled = e.choices.map((c) => M.fill(c.text, v));
  check(new Set(filled.map((t) => t.split(':')[0])).size === 3, `E${e.id} choices distinct`);
  check(e.choices.filter((c) => c.right).length === 1, `E${e.id} one right`);
  positions.push(e.choices.findIndex((c) => c.right) + 1);
  for (const t of [M.fill(e.ask, v), ...filled, M.fill(e.reveal, v)]) {
    check(!/—| /.test(t), `E${e.id} dash or nbsp`);
    check(!/(^|\. )\d/.test(t), `E${e.id} sentence opens on a numeral: ${t.slice(0, 40)}`);
    check(!/\d{4,}/.test(t.replace(/\d{1,3}(,\d{3})+/g, '')), `E${e.id} thousands separators`);
  }
  console.log(`   E${e.id} ${e.title}`);
  console.log(`      ask: ${M.fill(e.ask, v)}`);
  filled.forEach((t, i) => console.log(`      ${e.choices[i].right ? '*' : ' '} ${t}`));
  console.log(`      reveal: ${M.fill(e.reveal, v)}`);
}
check(positions.join() === '3,1,3,2,1', `answer positions ${positions}`);
console.log(`   answer positions ${positions.join(', ')}`);
// Word claims.
{
  const [e1, e2, e3, e4, e5] = M.EXPERIMENTS;
  const a1 = M.scenario(e1.setup);
  const k = a1.edgeKnee;
  const rank = (x) => Math.round(x);
  // E1: the right choice's rank is where a copy is asked for once per TTL; the wrong ones are the per-second and per-minute ranks.
  check(near(M.key(e1.setup, rank(k)).edge, 0.5, 0.001), 'E1 knee hits half');
  check(M.key(e1.setup, 41).perPop >= 0.99 && M.key(e1.setup, 41).perPop < 1.03, 'E1 41st once a second');
  check(Math.abs(M.key(e1.setup, 2500).perPop * 60 - 1) < 0.01, 'E1 2,500th once a minute');
  check(M.scenario(e1.setup).lanes[2].edge < 0.5, 'E1 25,000th misses mostly');
  // E1's answer is not on the load-time stage: the default's half-hit rank differs.
  check(fmt.ord(base.edgeKnee) !== M.slots(e1, e1.setup).knee, 'E1 answer not at rest');
  const b2 = M.scenario(M.afterAct(e2));
  check(b2.originRps > base.originRps && b2.edgeShare < base.edgeShare && b2.paths.edge < base.paths.edge, 'E2 rises, edge falls, nearer');
  const a3 = M.scenario(e3.setup);
  const b3 = M.scenario(M.afterAct(e3));
  check(a3.edgeShare === b3.edgeShare, 'E3 edge does not move');
  check(b3.originRps < base.originRps, 'E3 fewer than 20 locations without a shield');
  check(b3.meanMs < a3.meanMs, 'E3 mean falls');
  check(Math.abs(M.scenario({ ...M.afterAct(e3), pops: 20 }).originRps / b3.originRps - 1) < 0.1, 'E3 about what 20 locations and a shield send');
  check(b3.shieldKnee > 50 * b3.edgeKnee, 'E3 the shield keeps far more warm');
  const b4 = M.scenario(M.afterAct(e4));
  check(b4.originRps > base.originRps && b4.originRps < 5 * base.originRps, 'E4 more, far fewer than tenfold');
  check(b4.edgeShare > base.edgeShare, 'E4 edge rises');
  const a5 = M.scenario(e5.setup);
  const b5 = M.scenario(M.afterAct(e5));
  const off5 = M.scenario({ ...M.afterAct(e5), shield: 0 });
  check(b5.originRps > a5.originRps && b5.originRps < off5.originRps && b5.shieldShare > 0.2, 'E5 the shield still helps');
  check(near(b5.edgeShare, M.scenario({ ...e5.setup, pops: 200 }).edgeShare, 1e-9), 'E5 same as ten times the locations at the edge');
  // Every asked number differs from the load-time stage's same number.
  for (const e of [e2, e3, e4, e5]) check(fmt.sig3(M.scenario(M.afterAct(e)).originRps) !== fmt.sig3(base.originRps), `E${e.id} answer not at rest`);
}
// The challenge.
const pass = M.SETTINGS.filter((s) => M.goalParts(s).met);
check(pass.length === 1, `challenge passes at exactly one setting: ${JSON.stringify(pass)}`);
console.log('   E6 challenge: passing settings', JSON.stringify(pass));
console.log(`      ask: ${M.fill(M.CHALLENGE.ask, M.challengeSlots(M.BASE))}`);
console.log(`      reveal: ${M.fill(M.CHALLENGE.reveal, M.challengeSlots(pass[0]))}`);
noDigits(M.CHALLENGE.ask, 'challenge ask');
noDigits(M.CHALLENGE.reveal, 'challenge reveal');
console.log('      settings with rps 10,000, a normalized key and a TTL of at most 5 minutes:');
for (const s of M.SETTINGS.filter((x) => x.rps === 10000 && x.variants === 1 && x.ttl <= 300)) {
  const a = M.scenario(s);
  const g = M.goalParts(s);
  console.log(
    `      ${String(s.pops).padStart(3)} locations, ${fmt.ttlShort(s.ttl).padEnd(5)}, shield ${s.shield ? 'on ' : 'off'}: origin ${fmt.rate(a.originRps).padStart(8)}, mean ${fmt.ms(a.meanMs).padStart(8)} ${g.met ? 'PASS' : ''}`,
  );
}
const sol = M.scenario(pass[0] ?? M.BASE);
check(sol.originRps < 500 * 0.6 && sol.meanMs < 18 * 0.96, 'challenge margins');

// The default stage's figures, for the brief.
console.log('Default stage');
for (const s of [M.BASE, { ...M.BASE, shield: 1 }]) {
  const a = M.scenario(s);
  console.log(
    `   ${JSON.stringify(s)}: edge ${fmt.pct(a.edgeShare)} ${fmt.rate(a.edgeRps)}, shield ${fmt.pct(a.shieldShare)} ${fmt.rate(a.shieldRps)}, origin ${fmt.pct(a.originShare)} ${fmt.rate(a.originRps)}, paths ${fmt.ms(a.paths.edge)} ${fmt.ms(a.paths.shield)} ${fmt.ms(a.paths.origin)}, mean ${fmt.ms(a.meanMs)}, knee ${fmt.ord(a.edgeKnee)}, shield knee ${a.shieldKnee ? fmt.ord(a.shieldKnee) : '-'}`,
  );
  a.lanes.forEach((l) => console.log(`      #${fmt.group(l.rank)}: ${fmt.often(l.perPop)} here, per TTL ${l.perTtl.toFixed(3)}, hits ${fmt.pct(l.edge)}, shield ${fmt.pct(l.shieldHit)}`));
}

console.log(`\n${checks - failures.length} of ${checks} checks pass`);
if (failures.length) {
  console.log(failures.slice(0, 30).join('\n'));
  process.exit(1);
}
