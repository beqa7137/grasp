// Prints every experiment number, proves the challenge passes at exactly one setting, and checks the model: against
// today's engine function at every setting, the binomial tail against brute-force enumeration of failure sets, the drawn
// steps (the leading term) against the exact tail, every word claim of the reveals, every format at every setting, and
// the whole model against a discrete-event simulation of disks failing and being repaired, at rates high enough to see
// thousands of losses. Exits 1 on any failed check.
// Usage: node enum.cjs [--fast]
'use strict';
const M = require('./model.js');
const fast = process.argv.includes('--fast');
let checks = 0;
const failures = [];
const check = (ok, what) => {
  checks++;
  if (!ok) failures.push(what);
};
const fmt = (v) => (Math.abs(v) < 1e-3 || Math.abs(v) >= 1e6 ? v.toExponential(3) : String(Math.round(v * 1e4) / 1e4));

// ---------------------------------------------------------------- the experiments, every number
console.log('Experiments (every slot from the model)\n');
const positions = [];
for (const spec of M.EXPERIMENTS) {
  const e = M.renderExperiment(spec);
  positions.push(e.answer + 1);
  console.log(`## ${e.title}${spec.goal ? ' (challenge)' : `, answer ${e.answer + 1}`}`);
  console.log(`setup ${JSON.stringify(spec.setup)}${spec.act ? ` act ${JSON.stringify(spec.act)}` : ''} hide ${JSON.stringify(spec.hide)} focus ${JSON.stringify(spec.focus)}`);
  console.log(`ask: ${e.ask}`);
  e.choices.forEach((c, i) => console.log(`  ${i === e.answer ? '*' : ' '} ${c}`));
  console.log(`reveal: ${e.reveal}`);
  console.log(`slots: ${JSON.stringify(e.slots)}\n`);
  check(new Set(e.choices.map((c) => c.split(':')[0])).size === e.choices.length, `${e.id}: two choices open on the same value`);
  for (const t of [e.ask, e.reveal, ...e.choices]) {
    check(!/—/.test(t), `${e.id}: an em dash`);
    check(!/NaN|undefined|Infinity/.test(t), `${e.id}: NaN or undefined in "${t}"`);
  }
}
console.log(`answer positions: ${positions.slice(0, 5).join(', ')}`);
check(positions.slice(0, 5).filter((p) => p === 2).length <= 2, 'answers mostly second');

// ---------------------------------------------------------------- the challenge, enumerated
const passing = M.ALL_SETTINGS.filter((s) => M.goalMet(M.CHALLENGE_GOAL, s));
console.log(`\nchallenge: ${passing.length} of ${M.ALL_SETTINGS.length} settings pass: ${JSON.stringify(passing)}`);
check(passing.length === 1 && JSON.stringify(passing[0]) === JSON.stringify(M.CHALLENGE_SOLUTION), 'the challenge passes at exactly its solution');
check(!M.goalMet(M.CHALLENGE_GOAL, M.EXPERIMENTS[5].setup), 'the challenge starts unmet');
const kept = M.ALL_SETTINGS.filter((s) => s.afr === 5);
console.log('the nearest misses at 5% (each bound in its own terms):');
for (const s of kept) {
  const m = M.run(s);
  const fails = M.CHALLENGE_GOAL.all.filter((b) => !M.boundMet(b, M.metricsOf(m)[b.metric])).map((b) => b.metric);
  if (fails.length === 1 && !s.rack) console.log(`  ${M.SCHEMES[s.scheme].short.padEnd(8)} ${String(s.repair).padStart(3)} h: fails only ${fails[0]} (lost a year of a billion ${fmt(m.perBillion)}, ${M.formatX(m.overhead)}, ${M.formatGbps(m.rebuildGbps)})`);
}

// ---------------------------------------------------------------- the model against today's engine function
let maxRel = 0;
for (const s of M.ALL_SETTINGS.filter((s) => !s.rack)) {
  const m = M.run(s);
  const sc = M.SCHEMES[s.scheme];
  const red = sc.kind === 'replicas' ? { kind: 'replicas', copies: sc.copies } : { kind: 'erasure', data: sc.data, parity: sc.parity };
  const today = M.durabilityToday(red, { afr: s.afr / 100, repairHours: s.repair });
  const rel = Math.abs(today.annualLoss - m.loss) / today.annualLoss;
  maxRel = Math.max(maxRel, rel);
  check(rel < 1e-12 && today.tolerates === m.t && today.overhead === m.overhead && today.repairRead === m.repairRead, `today's durability() differs at ${JSON.stringify(s)}`);
}
console.log(`\ntoday's durability() at all 80 one-piece-a-rack settings: largest relative difference ${maxRel.toExponential(1)}`);

// ---------------------------------------------------------------- the binomial tail by brute force over failure sets
for (const n of [1, 2, 8, 13])
  for (const k of [1, 2, 3, 4].filter((k) => k <= n))
    for (const p of [1e-4, 0.01, 0.2]) {
      let brute = 0;
      for (let mask = 0; mask < 1 << n; mask++) {
        let c = 0;
        for (let i = 0; i < n; i++) if (mask & (1 << i)) c++;
        if (c >= k) brute += p ** c * (1 - p) ** (n - c);
      }
      check(Math.abs(M.atLeast(n, k, p) - brute) <= 1e-12 * Math.max(brute, 1e-300) + 1e-300, `tail n${n} k${k} p${p}`);
    }
console.log('the binomial tail equals brute-force enumeration of every failure set (n 1 to 13, k 1 to 4, three rates)');

// ---------------------------------------------------------------- the steps the stage draws against the exact model
let worst = 0;
for (const s of M.ALL_SETTINGS) {
  const m = M.run(s);
  const gap = Math.abs(Math.log10(m.lead) - Math.log10(m.first * m.tail));
  worst = Math.max(worst, gap);
  const last = m.steps[m.steps.length - 1].level;
  check(Math.abs(last / m.lead - 1) < 1e-9, `the steps multiply to the leading term at ${JSON.stringify(s)}`);
  check(m.steps.length === m.t + 2, 'one step a further failure, plus the first failures and the ways');
}
console.log(`the drawn steps (the leading term) against the exact tail: at most ${worst.toFixed(4)} nines apart at any setting`);
check(worst < 0.01, 'steps within 0.01 nines of the exact model');

// ---------------------------------------------------------------- word claims
const r = (s) => M.run(s);
const c = M.E.copies;
const e2 = r({ ...c, repair: 168 }).loss / r(c).loss;
console.log(`\nE2: a week against a day is ${e2.toFixed(2)}× likelier (said "49×", and "7 × 7 is 49")`);
check(Math.abs(e2 / 49 - 1) < 0.02, 'E2 49x');
const e1 = r(c).loss / r({ ...c, scheme: 2 }).loss;
const e1n = r({ ...c, scheme: 2 }).nines - r(c).nines;
console.log(`E1: 6 + 3 is ${e1.toFixed(1)}× less likely than 3 copies, ${e1n.toFixed(2)} more nines (said "two more nines")`);
check(e1n > 1.95 && e1n < 2.1, 'E1 two more nines');
const w = M.E.wide;
const e4 = r({ ...w, afr: 10, repair: 168 }).loss / r(w).loss;
const e4lead = 5 ** 5 * 7 ** 4;
console.log(`E4: ${fmt(e4)}× likelier against 5^5 × 7^4 = ${fmt(e4lead)} (said "about 3,100 from the rate and 2,400 from the window", "millions")`);
check(Math.abs(e4 / e4lead - 1) < 0.03 && e4 > 1e6, 'E4 ratio');
const e5 = r({ ...c, rack: 1 });
console.log(`E5: one rack gives ${e5.nines.toFixed(3)} nines; two copies in a rack and one apart ${(-Math.log10(M.twoInOneRack(c))).toFixed(3)}`);
check(Math.abs(e5.loss - M.RACK_EVENT) / M.RACK_EVENT < 0.001, 'E5 the rack event sets the loss');
const e3 = r({ ...c, scheme: 3 });
check(e3.rebuildTB === 10 * M.DISK_TB && r(c).rebuildTB === M.DISK_TB, 'E3 rebuild reads');
console.log(`E3: a 10 + 4 rebuild of a 20 TB disk reads ${e3.rebuildTB} TB, ${e3.rebuildGbps.toFixed(2)} Gb/s over 24 h; copies ${r(c).rebuildGbps.toFixed(2)} Gb/s`);
// The repair window's power, at every setting: a window k times longer multiplies the loss by about k^t.
let powWorst = 0;
for (const s of M.ALL_SETTINGS.filter((s) => !s.rack && s.repair < 168)) {
  const a = r(s);
  const b = r({ ...s, repair: 168 });
  const k = 168 / s.repair;
  powWorst = Math.max(powWorst, Math.abs(Math.log10(b.loss / a.loss) - a.t * Math.log10(k)));
}
console.log(`the window's power: log of the loss ratio within ${powWorst.toFixed(4)} nines of t × log(k) at every setting`);
check(powWorst < 0.01, 'the window enters to the power t');
// The lesson's numbers.
const lesson = [
  ['3 copies, 2%, 24 h', c, 9.7],
  ['6 + 3, 2%, 24 h', { ...c, scheme: 2 }, 11.8],
  ['10 + 4, 2%, 24 h', w, 14.7],
  ['3 copies, 1 h', { ...c, repair: 1 }, 12.5],
  ['3 copies, 168 h', { ...c, repair: 168 }, 8.1],
  ['2 copies, 24 h', { ...c, scheme: 0 }, 5.7],
  ['2 copies, 168 h', { ...c, scheme: 0, repair: 168 }, 4.8],
  ['10 + 4, 10%, 168 h', { ...w, afr: 10, repair: 168 }, 7.9],
  ['2 copies, 10%, 168 h', { ...w, scheme: 0, afr: 10, repair: 168 }, 3.4],
  ['3 copies, 6 h', { ...c, repair: 6 }, 10.9],
];
console.log('\nthe lesson\'s nines against the model, rounded as the widget rounds:');
for (const [name, s, said] of lesson) {
  const got = M.formatNines(r(s).nines);
  console.log(`  ${name.padEnd(22)} ${got.padStart(5)}${Number(got) === said ? '' : `   the lesson says ${said}: fix it (brief 7)`}`);
  check(Number(got) === said, `lesson ${name}`);
}

// ---------------------------------------------------------------- formats at every setting
for (const s of M.ALL_SETTINGS) {
  const m = r(s);
  const said = [M.formatNines(m.nines), M.formatBillion(m.perBillion), M.oneIn(m.p), M.formatX(m.overhead), M.formatTB(m.rebuildTB), M.formatGbps(m.rebuildGbps), M.formatTB(m.rawTB), M.formatRate(m.first), M.oneIn(m.tail), M.formatCount(m.disks)];
  for (const t of said) check(t && !/NaN|Infinity|undefined|^0 |e[+-]/.test(t), `format "${t}" at ${JSON.stringify(s)}`);
  check(/ (a year|years)$/.test(M.formatBillion(m.perBillion)), 'billion keeps its unit');
  check(/^1 in \d/.test(M.oneIn(m.p)), 'a chance is 1 in N');
  check(m.nines > 0 && m.nines < 25, `nines on the 0 to 25 scale at ${JSON.stringify(s)}`);
  for (const st of m.steps) check(-Math.log10(st.level) > -0.3 && -Math.log10(st.level) < 25, `a step off the scale at ${JSON.stringify(s)}`);
}
const nn = M.ALL_SETTINGS.map((s) => r(s).nines);
console.log(`\nformats at all 160 settings; nines from ${Math.min(...nn).toFixed(2)} to ${Math.max(...nn).toFixed(2)}, every step level on the 0 to 25 nines scale`);
console.log(`  e.g. ${M.formatBillion(r(c).perBillion)}, ${M.formatBillion(r({ ...c, scheme: 0, afr: 10, repair: 168 }).perBillion)}, ${M.oneIn(r(c).p)}, staged chance ${M.oneIn(r(c).tail)}`);

// ---------------------------------------------------------------- the discrete-event simulation
function mulberry32(a) {
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/** One object of n pieces, each up for an exponential time at rate lambda a year, then down for exactly W years while it
 * is rebuilt. The object is lost when more than t pieces are down at once; it is then stored afresh. */
function simulate(n, t, lambda, W, years, seed) {
  const rnd = mulberry32(seed);
  let now = 0;
  let losses = 0;
  let ends = [];
  while (now < years) {
    const up = n - ends.length;
    const next = now - Math.log(1 - rnd()) / (lambda * up);
    const firstEnd = ends.length ? ends[0] : Infinity;
    if (firstEnd <= next) {
      now = firstEnd;
      ends.shift();
      continue;
    }
    now = next;
    ends.push(now + W);
    if (ends.length > t) {
      losses++;
      ends = [];
    }
  }
  return losses / years;
}
const runs = [
  [0, 1, 0.01, 2e5],
  [0, 1, 0.002, 1e6],
  [1, 1, 0.02, 3e6],
  [1, 1, 0.005, 2e7],
  [2, 1, 0.03, 3e5],
  [2, 1, 0.01, 4e6],
  [3, 1, 0.03, 5e5],
  [3, 1, 0.015, 3e6],
].filter((_, i) => !fast || i % 2 === 0);
console.log('\nthe model against a discrete-event simulation of failures and repairs (lambda a year, W the window in years):');
for (const [si, lambda, W, years] of runs) {
  const sc = M.SCHEMES[si];
  const n = sc.kind === 'replicas' ? sc.copies : sc.data + sc.parity;
  const t = sc.kind === 'replicas' ? sc.copies - 1 : sc.parity;
  const model = n * lambda * M.atLeast(n - 1, t, lambda * W);
  const sim = simulate(n, t, lambda, W, years, 7 + si);
  const lossesSeen = Math.round(sim * years);
  const sigma = 1 / Math.sqrt(lossesSeen);
  const ratio = sim / model;
  // The model is the first-order rate: it counts each first failure's window with p = lambda W, so it differs from the
  // process by O(n p) (overlapping windows, 1 - e^-x against x); the tolerance is that bias plus 4 sigma of the count.
  const tol = 4 * sigma + n * lambda * W;
  console.log(`  ${sc.short.padEnd(8)} p ${String(lambda * W).padEnd(5)} ${String(lossesSeen).padStart(6)} losses in ${fmt(years)} object-years: simulated ${fmt(sim)} a year, model ${fmt(model)}, ratio ${ratio.toFixed(3)} (tolerance ±${tol.toFixed(3)})`);
  check(Math.abs(ratio - 1) < tol, `simulation ${sc.short} at p ${lambda * W}`);
  check(ratio < 1 + 4 * sigma, `the model never under-counts: ${sc.short} at p ${lambda * W}`);
}
// The rack event: with every piece in one rack, the simulation's loss is the rack's rate whatever the disks do.
{
  const rnd = mulberry32(99);
  let lost = 0;
  const years = 2e6;
  let tt = 0;
  while (tt < years) {
    tt += -Math.log(1 - rnd()) / M.RACK_EVENT;
    if (tt < years) lost++;
  }
  const ratio = lost / years / M.RACK_EVENT;
  console.log(`  one rack: ${lost} rack events in ${fmt(years)} rack-years, ratio to RACK_EVENT ${ratio.toFixed(3)}`);
  check(Math.abs(ratio - 1) < 4 / Math.sqrt(lost), 'rack event rate');
}

console.log(`\n${checks} checks, ${failures.length} failed`);
for (const f of failures.slice(0, 20)) console.log(`  FAILED ${f}`);
process.exit(failures.length ? 1 : 0);
