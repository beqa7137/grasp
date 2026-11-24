// Prints every number the Unique IDs widget shows in its experiments and challenge, and checks the model against
// independent computations: ids built bit by bit as strings (a second implementation of the layout), a generator
// stepped microsecond by microsecond (a second implementation of the Snowflake algorithm), the burst's waits by
// formula, repeats and order by brute force, the birthday bound against the exact product and a seeded Monte Carlo
// count of real collisions at small widths, the lesson's quoted numbers, every sentence of every setting by rule,
// and the challenge by enumeration. Exits non-zero on any failed check.
// Usage: node enum.cjs [--quick]
'use strict';
const M = require('./model.js');
const { fmt } = M;

let checks = 0;
const fails = [];
function check(cond, what) {
  checks += 1;
  if (!cond) fails.push(what);
}
const near = (a, b, rel = 1e-9) => Math.abs(a - b) <= rel * Math.max(Math.abs(a), Math.abs(b), 1e-300);
const quick = process.argv.includes('--quick');

const GENS = [...Array(M.BITS_MAX + 1).keys()];
const all = [];
for (const gen of GENS)
  for (const seq of GENS)
    for (const tick of M.TICKS_MS)
      for (const epoch of [0, 1])
        for (const load of [0, 1])
          for (const fault of [0, 1, 2, 3])
            for (const guard of [0, 1]) all.push({ ...M.BASE, gen, seq, tick, epoch, load, fault, guard });
const layouts = all.filter((s) => s.epoch === 0 && s.load === 0 && s.fault === 0 && s.guard === 1);

// --- 1. The layout's arithmetic, against plain powers. ------------------------------------------------------------
for (const s of all.filter((s) => s.load === 0 && s.fault === 0 && s.guard === 1)) {
  const L = M.layout(s);
  check(L.timeBits + s.gen + s.seq + 1 === 64, `bits sum to 64 at ${JSON.stringify(s)}`);
  check(L.timeBits >= 31, 'timestamp keeps at least 31 bits');
  check(near(L.years * M.YEAR_MS, Math.pow(2, L.timeBits) * s.tick), 'lifetime is 2^time ticks');
  check(L.generators === Math.pow(2, s.gen) && L.perTick === Math.pow(2, s.seq), 'generators and ids a tick');
  check(L.perSecond === (Math.pow(2, s.seq) * 1000) / s.tick, 'ids a second');
  const fitsByDates = M.NOW_MS < M.EPOCH_MS[s.epoch] + L.lifetimeMs;
  check(L.fits === fitsByDates, `fits agrees with the dates at ${JSON.stringify(s)}`);
}

// --- 2. Ids bit by bit: a second implementation of the layout builds each id as a string of 64 characters. ----------
function idByString(L, ts, number, seq) {
  const field = (v, w) => (w === 0 ? '' : BigInt(v).toString(2).padStart(w, '0'));
  const t = field(ts, L.timeBits);
  const str = '0' + t + field(number, L.genBits) + field(seq, L.seqBits);
  if (str.length !== 64 || t.length !== L.timeBits) return null;
  return BigInt('0b' + str);
}
let idsChecked = 0;
for (const s of all.filter((s) => s.load === 0 || (s.gen === 10 && s.epoch === 0))) {
  const m = M.mint(s);
  const L = m.layout;
  for (const x of m.ids) {
    idsChecked += 1;
    const ref = idByString(L, x.ts, x.number, x.seq);
    check(ref !== null && ref === x.id, `id ${x.key} matches its bit string at ${JSON.stringify(s)}`);
    const d = M.decode(L, x.id);
    check(d.sign === 0 && d.ts === BigInt(x.ts) && d.gen === x.number && d.seq === x.seq, 'decode inverts encode');
    check(x.seq < L.perTick && x.number < L.generators, 'fields within their widths');
  }
  // Sorting: the id's order is the order of (timestamp, generator, sequence) compared field by field.
  const lex = [...m.ids].sort((a, b) => a.ts - b.ts || a.number - b.number || a.seq - b.seq || a.lane - b.lane);
  check(
    lex.every((x, i) => x.id === m.sorted[i].id),
    `numeric order is field order at ${JSON.stringify(s)}`,
  );
  // Repeats, by brute force over every pair.
  let pairs = 0;
  const firsts = new Set();
  const byMade = [...m.ids].sort((a, b) => a.issued - b.issued || a.lane - b.lane);
  for (const x of byMade) {
    const k = x.id.toString();
    if (firsts.has(k)) pairs += 1;
    firsts.add(k);
  }
  check(pairs === m.repeats.length, `repeats counted at ${JSON.stringify(s)}`);
  // No repeats unless a generator trusted a clock that stepped back, or two generators share a number.
  const canRepeat = (s.fault === M.FAULT.stepBack && !s.guard) || s.fault === M.FAULT.shared;
  if (!canRepeat) check(m.repeats.length === 0, `no repeats at ${JSON.stringify(s)}`);
  // With the guard, each generator's ids strictly increase in the order it made them.
  if (s.guard)
    for (const lane of m.lanes) check(lane.ids.every((x, i) => i === 0 || x.id > lane.ids[i - 1].id), 'guarded ids increase');
  // A sentence naming G2 as the cause of out-of-order ids is printed only when every such id is G2's.
  if (s.fault === M.FAULT.skew && m.lateByTick.length) check(m.lateLanes.every((g) => g === 2), 'skew late ids are G2s');
  // A drawn count never disagrees with the words: drawn + after = made.
  check(m.drawn.length + m.after === m.ids.length, 'drawn and after add up');
}

// --- 3. A generator stepped microsecond by microsecond (an independent form of the algorithm). ------------------
function stepped(s, g) {
  const L = M.layout(s);
  const tickUs = s.tick * 1000;
  const clock = (t) => {
    if (s.fault === M.FAULT.skew && g === 2) return t + M.SKEW_US;
    if (s.fault === M.FAULT.stepBack && g === 1) return t < M.STEP_AT_US ? t : t - M.STEP_US;
    return t;
  };
  const queue = [...(s.load === 1 && g === 0 ? Array(M.BURST).fill(M.BURST_AT_US) : M.ARRIVALS_US[g])];
  const out = [];
  let last = -Infinity;
  let seq = 0;
  for (let t = 0; queue.length; t++) {
    if (t > 2e7) return null;
    while (queue.length && queue[0] <= t) {
      const ts = Math.floor(clock(t) / tickUs);
      if (s.guard && ts < last) break;
      if (ts === last && seq + 1 >= L.perTick) break;
      seq = ts === last ? seq + 1 : 0;
      last = ts;
      out.push({ t, ts, seq, a: queue.shift() });
    }
  }
  return out;
}
const steppedSettings = all.filter(
  (s) => s.load === 0 && s.epoch === 0 && s.gen === 10 && [0, 1, 2, 12].includes(s.seq),
);
for (const s of steppedSettings)
  for (let g = 0; g < 3; g++) {
    const ref = stepped(s, g);
    const got = M.mint(s).lanes[g].ids;
    check(
      ref && ref.length === got.length && ref.every((r, i) => r.t === got[i].issued && r.ts === got[i].tick && r.seq === got[i].seq),
      `stepped generator agrees at ${JSON.stringify(s)} G${g}`,
    );
  }
// The burst: a full tick holds 2^seq ids, so the last request is served ceil(5,000 / 2^seq) - 1 ticks later.
for (const tick of M.TICKS_MS)
  for (const seq of GENS) {
    const s = { ...M.BASE, seq, tick, load: 1 };
    const m = M.mint(s);
    const ids = m.lanes[0].ids;
    const ticks = Math.ceil(M.BURST / 2 ** seq);
    const perTick = new Map();
    for (const x of ids) perTick.set(x.tick, (perTick.get(x.tick) ?? 0) + 1);
    check(perTick.size === ticks && [...perTick.values()].every((c) => c <= 2 ** seq), `burst ticks at seq ${seq}`);
    check(m.lastBurst.issued === (ticks - 1) * tick * 1000 || (ticks === 1 && m.lastBurst.issued === M.BURST_AT_US), `burst last at seq ${seq}`);
    if (seq <= 12 && tick === 1 && !quick) {
      const ref = stepped(s, 0);
      check(ref && ref.length === ids.length && ref[ref.length - 1].t === m.lastBurst.issued, `stepped burst at seq ${seq}`);
    }
  }

// --- 4. The birthday bound against the exact product and against real collisions. -------------------------------
for (const b of [16, 20, 24, 32])
  for (const n of [10, 100, 300, 1000, 3000]) {
    const exact = M.birthdayExact(b, n);
    const bound = M.birthday(b, n);
    if (n < 2 ** (b / 2) * 4) check(Math.abs(bound - exact) <= 0.02 * Math.max(exact, 1e-12) + 1e-4, `bound near exact at b=${b} n=${n}`);
  }
function rng(seed) {
  let x = seed >>> 0;
  return () => {
    x ^= x << 13;
    x >>>= 0;
    x ^= x >>> 17;
    x ^= x << 5;
    x >>>= 0;
    return x;
  };
}
const monte = [];
for (const [b, n] of [
  [16, 100],
  [16, 300],
  [16, 600],
  [20, 1200],
]) {
  const next = rng(0x9e3779b9 ^ (b * 7919 + n));
  const trials = quick ? 2000 : 20000;
  let hits = 0;
  for (let t = 0; t < trials; t++) {
    const seen = new Set();
    for (let i = 0; i < n; i++) {
      const v = next() & (2 ** b - 1);
      if (seen.has(v)) {
        hits++;
        break;
      }
      seen.add(v);
    }
  }
  const p = hits / trials;
  const bound = M.birthday(b, n);
  const sd = Math.sqrt((bound * (1 - bound)) / trials);
  monte.push(`  ${b} bits, ${n} ids: counted ${(p * 100).toFixed(2)}% over ${trials} trials, the bound says ${(bound * 100).toFixed(2)}%`);
  check(Math.abs(p - bound) <= 4 * sd + 0.004, `Monte Carlo near the bound at b=${b} n=${n}`);
}
// The square law: a thousand times the ids is a million times the chance while it is small.
check(near(M.birthday(122, 1e12) / M.birthday(122, 1e9), 1e6, 1e-6), 'square law');
check(near(M.birthday(64, M.evenOdds(64)), 0.5, 1e-9), 'even odds');

// --- 5. The lesson's numbers. -------------------------------------------------------------------------------------
const L0 = M.layout(M.BASE);
const lesson = [
  [fmt.years(L0.years), '69.7 years'],
  [fmt.int(L0.generators), '1,024'],
  [fmt.int(L0.perSecond), '4,096,000'],
  [fmt.years(M.layout({ ...M.BASE, tick: 10 }).years), '696.8 years'],
  [fmt.int(M.layout({ ...M.BASE, tick: 10 }).perSecond), '409,600'],
  [fmt.years(M.layout({ ...M.BASE, gen: 16 }).years), '1.1 years'],
  [fmt.int(M.layout({ ...M.BASE, gen: 16 }).generators), '65,536'],
  [fmt.int(M.layout({ ...M.BASE, gen: 12, seq: 10 }).perSecond), '1,024,000'],
  [fmt.years(M.layout({ ...M.BASE, gen: 12, seq: 10 }).years), '69.7 years'],
  [fmt.chance(M.birthday(122, 1e9)), 'about 9.4 × 10⁻²⁰'],
  [fmt.chance(M.birthday(64, 1e9)), 'about 2.7%'],
  [fmt.chance(M.birthday(64, 1e12)), 'near certain'],
  [fmt.chance(M.birthday(122, 1e12)), 'about 9.4 × 10⁻¹⁴'],
  [fmt.years(M.layout({ ...M.BASE, gen: 11 }).years), '34.8 years'],
  [fmt.date(M.layout({ ...M.BASE, epoch: 1 }).endMs), '7 September 2039'],
];
for (const [got, want] of lesson) check(got === want, `lesson number ${want} (got ${got})`);

// --- 6. Experiments: every choice stands for a different value, exactly one is the truth, answers vary. -----------
const exps = M.experiments();
const answers = exps.map((e) => e.choices.findIndex((c) => c.value === e.truth) + 1);
check(JSON.stringify(answers) === JSON.stringify([3, 1, 2, 1, 3]), `answer positions ${answers}`);
for (const e of exps) {
  check(new Set(e.choices.map((c) => String(c.value))).size === 3, `${e.id} choices distinct`);
  check(e.choices.filter((c) => c.value === e.truth).length === 1, `${e.id} one truth`);
  const lens = e.choices.map((c) => c.text.length);
  check(Math.max(...lens) < 2.6 * Math.min(...lens), `${e.id} choice lengths do not give it away`);
}
// E2 measures the burst it asks about; E4's repeats are real ids made twice; E3's tick holds G0 first.
const burst = M.mint({ ...M.setup.burst, load: 1 });
check(burst.lastBurst.wait === 3950, 'E2 last request waits 3.95 ms');
const clockM = M.mint({ ...M.setup.clock, fault: M.FAULT.stepBack });
check(clockM.repeats.length === 2 && clockM.repeats.every((x) => x.lane === 1), 'E4 G1 makes two ids twice');
const orderM = M.mint(M.setup.order);
check(orderM.sorted.filter((x) => x.tick === 7)[0].lane === 0, 'E3 G0 sorts first in tick 7');
// E3's and E4's setups at rest must not show their answers: the stage at E4's setup has no repeats.
check(M.mint(M.setup.clock).repeats.length === 0, 'E4 setup shows no repeats');

// --- 7. The challenge, by enumeration over every layout. --------------------------------------------------------
const passing = layouts.filter((s) => M.challengeStatus(s).met);
check(passing.length === 1 && passing[0].gen === 10 && passing[0].seq === 10 && passing[0].tick === 1, `challenge passes once (${passing.length})`);
check(!M.challengeStatus(M.BASE).met, 'challenge not met at the default');

// --- 8. Words, at every setting, by rule. ---------------------------------------------------------------------------
const NUMBER_NO_COMMA = /(?<![\d,.])\d{5,}(?![\d,])/;
const YEAR_OK = /\b(January|February|March|April|May|June|July|August|September|October|November|December) \d{4}\b/g;
let sentences = 0;
for (const s of [...all, ...[3, 6, 9, 12, 15].flatMap((count) => M.RANDOM_BITS.map((bits) => ({ ...M.BASE, bits, count })))]) {
  const text = M.summary(s);
  for (const sentence of text.split(/(?<=\.) /)) {
    sentences += 1;
    check(!/^\d/.test(sentence), `sentence opens on a numeral: ${sentence}`);
    check(!/NaN|Infinity|undefined|null/.test(sentence), `bad value: ${sentence}`);
    check(!/—| /.test(sentence), `em dash or nbsp: ${sentence}`);
    check(!NUMBER_NO_COMMA.test(sentence.replace(YEAR_OK, '')), `thousands separator: ${sentence}`);
    check(!/\b1 (ids|generators|ticks|numbers|bits)\b/.test(sentence), `plural after 1: ${sentence}`);
    check(!/\b([02-9]|\d{2,}) (id|generator|tick|number|request)(?![a-z]| bit)/.test(sentence.replace(/,/g, '')), `singular after many: ${sentence}`);
  }
}
for (const e of exps) for (const t of [e.ask, e.reveal, ...e.choices.map((c) => c.text)]) check(!/—/.test(t) && !/^\d/.test(t), `experiment text: ${t}`);

// --- Print. -------------------------------------------------------------------------------------------------------
console.log('Layouts');
for (const s of [M.BASE, { ...M.BASE, gen: 11 }, { ...M.BASE, tick: 10 }, { ...M.BASE, gen: 16 }, { ...M.BASE, gen: 10, seq: 10 }, { ...M.BASE, epoch: 1 }, { ...M.BASE, epoch: 1, gen: 16 }]) {
  const L = M.layout(s);
  console.log(
    `  gen ${s.gen}, seq ${s.seq}, ${s.tick} ms, epoch ${s.epoch ? 1970 : 2026}: time ${L.timeBits} bits, ${fmt.years(L.years)}, ${fmt.endWords(L)}, ${fmt.int(L.generators)} generators, ${fmt.int(L.perSecond)} ids a second each, fits ${L.fits}`,
  );
}
console.log('Mint at the default');
const m0 = M.mint(M.BASE);
for (const x of m0.sorted) console.log(`  ${x.id.toString().padStart(19)}  G${x.lane}  made ${fmt.ms(x.issued).padStart(7)}  tick ${x.tick}  seq ${x.seq}`);
console.log('Experiments');
for (const e of exps) {
  console.log(`  ${e.id}: ${e.ask}`);
  e.choices.forEach((c, i) => console.log(`    ${i + 1}${c.value === e.truth ? '*' : ' '} ${c.text}`));
  console.log(`    reveal: ${e.reveal}`);
}
console.log(`Challenge: ${M.CHALLENGE.ask} Passing: ${passing.map((s) => `gen ${s.gen}, seq ${s.seq}, ${s.tick} ms`).join('; ')} of ${layouts.length} layouts.`);
console.log('Birthday bound against counted collisions');
console.log(monte.join('\n'));
// An interview fact: UUIDv7 needs uniqueness only among the ids of one millisecond, in its 74 random bits.
const perMs = M.birthday(74, 1000);
console.log(
  `UUIDv7 at a million ids a second: ${fmt.chance(perMs)} a millisecond, ${fmt.chance(-Math.expm1(Math.log1p(-perMs) * 1000 * 3600 * 24 * 365.25))} a year (74 random bits, 1,000 ids a millisecond).`,
);
console.log(`${idsChecked} ids checked bit by bit, ${sentences} sentences checked, ${checks} checks.`);
if (fails.length) {
  console.log(`FAILED ${fails.length}:`);
  for (const f of [...new Set(fails)].slice(0, 40)) console.log('  ' + f);
  process.exit(1);
}
console.log('All checks pass.');
