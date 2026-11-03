// Prints every experiment's slots and filled text from model.js, proves the challenge has exactly one passing setting
// of its 34 (N 3 or 5, every W and R, the stall on, all up, strict), and checks the model's claims over all 104,704
// settings (N, W, R, four states per replica, stall, sloppy). Exits 1 on any failed check.
'use strict';
const M = require('./model.js');

let failures = 0;
const check = (ok, msg) => {
  if (!ok) {
    failures++;
    console.log(`FAIL ${msg}`);
  }
};

console.log('== Experiments');
const positions = [];
for (const spec of M.EXPERIMENTS) {
  const e = M.renderExperiment(spec);
  console.log(`\n# ${e.id}: ${e.title}`);
  console.log(`setup ${JSON.stringify(spec.setup)}  hide ${JSON.stringify(spec.hide)}  focus ${JSON.stringify(spec.focus)}`);
  console.log(`slots ${Object.entries(e.slots).map(([k, s]) => `${k}=${s.unit === 'word' ? JSON.stringify(s.value) : `${s.value}${s.unit === 'num' ? '' : ' ' + s.unit}`}`).join(', ')}`);
  console.log(`ASK    ${e.ask}`);
  e.choices.forEach((c, i) => console.log(`  ${i === e.answer ? '*' : ' '} ${i + 1}. ${c}`));
  console.log(`REVEAL ${e.reveal}`);
  if (e.answer >= 0) positions.push(e.answer + 1);
  const templates = [spec.title, spec.ask, ...(spec.choices ?? []).map((c) => c.text), spec.reveal];
  for (const t of templates) {
    const stray = M.strayDigits(t);
    check(stray.length === 0, `${spec.id}: stray digits ${stray} in "${t}"`);
  }
  for (const [k, s] of Object.entries(e.slots)) check(s.unit !== 'word' || !/\d/.test(s.value), `${spec.id}: word slot ${k} carries digits`);
  for (const text of [e.title, e.ask, ...e.choices, e.reveal]) {
    check(!/\u2014/.test(text), `${spec.id}: em dash`);
    check(!/\u00a0/.test(text), `${spec.id}: non-breaking space`);
  }
}
console.log(`\nanswer positions ${positions.join(', ')}`);
check(positions.join(',') === '3,1,2,1,3', 'answer positions are 3, 1, 2, 1, 3');

console.log('\n== Challenge: every N, W, R with the stall, all up, strict');
const challenge = M.EXPERIMENTS.find((e) => e.goal);
const passing = [];
let count = 0;
for (const n of M.SIZES)
  for (let w = 1; w <= n; w++)
    for (let r = 1; r <= n; r++) {
      count++;
      const s = { n, w, r, states: Array(n).fill('up'), stall: 1, sloppy: 0 };
      const m = M.run(s);
      const met = M.goalMet(challenge.goal, s, m.metrics);
      const f = (v) => (Number.isFinite(v) ? M.formatMs(v) : 'fails');
      console.log(
        `${met ? 'PASS' : '    '} N${n} W${w} R${r}  can miss ${m.staleSets} of ${m.readSets}  read ${f(m.metrics.readMs)}  write ${f(m.metrics.writeMs)}  survives ${m.survives.write}  writes ${M.formatNines(m.avail.write)}`,
      );
      if (met) passing.push(`N${n} W${w} R${r}`);
    }
console.log(`${count} settings, passing: ${passing.join(', ')}`);
check(count === 34, '34 challenge settings');
check(passing.length === 1 && passing[0] === 'N5 W4 R2', 'exactly N5 W4 R2 passes');
const sol = M.run({ n: 5, w: 4, r: 2, states: Array(5).fill('up'), stall: 1, sloppy: 0 });
check(sol.read.ms === 3 && sol.write.ms === 41, 'the solution reads in 3 ms and writes in 41 ms');
check(M.eachQuorum(5) === 5, 'EACH_QUORUM at N 5 waits for all 5, as the reveal says "all"');
console.log('status at setup:', M.goalStatus(M.run(challenge.setup)).join(' | '));
console.log('status at solution:', M.goalStatus(sol).join(' | '));

console.log('\n== Quoted facts');
const facts = [
  ['default N3 W2 R2 acked', M.run(M.BASE).write.ms, 4],
  ['default read, repair included', M.run(M.BASE).read.ms, 6],
  ['default repairs R3', M.run(M.BASE).read.repairs.join(), '2'],
  ['default both', M.run(M.BASE).both.join(), '1'],
  ['W1 R1 stale', M.run({ ...M.BASE, w: 1, r: 1 }).verdict, 'stale'],
  ['W1 R1 read reaches R3 at', M.run({ ...M.BASE, w: 1, r: 1 }).read.answers[0].readAt, 3],
  ['stall QUORUM write', M.run({ ...M.BASE, stall: 1 }).write.ms, 40],
  ['stall ONE write', M.run({ ...M.BASE, stall: 1, w: 1 }).write.ms, 2],
  ['stall ALL write', M.run({ ...M.BASE, stall: 1, w: 3 }).write.ms, 104],
  ['stall ONE read', M.run({ ...M.BASE, stall: 1, r: 1 }).read.ms, 2],
  ['stall QUORUM read', M.run({ ...M.BASE, stall: 1 }).read.ms, 40],
  ['stall ALL read', M.run({ ...M.BASE, stall: 1, r: 3 }).read.ms, 104],
  ['ALL write availability', M.formatNines(M.run({ ...M.BASE, w: 3 }).avail.write), '97.03%'],
  ['ONE read availability', M.formatNines(M.run({ ...M.BASE, r: 1 }).avail.read), '99.9999%'],
  ['QUORUM of 3 writes', M.formatNines(M.run(M.BASE).avail.write), '99.97%'],
  ['sloppy QUORUM of 3 writes', M.formatNines(M.run({ ...M.BASE, sloppy: 1 }).avail.write), '99.99999%'],
  ['N5 W4 writes', M.formatNines(sol.avail.write), '99.90%'],
  ['E5 read set (home replicas again)', M.run({ ...M.BASE, states: ['up', 'back', 'back'], sloppy: 1 }).read.set.join(), '1,2'],
  ['sloppy read uses H1 for the down R3', M.run({ ...M.BASE, r: 3, states: ['up', 'up', 'down'], sloppy: 1 }).read.set.join(), '0,1,3'],
  ['sloppy N3 W2 R2, R2 and R3 down: H1 and H2 answer', M.run({ ...M.BASE, states: ['up', 'down', 'down'], sloppy: 1 }).verdict, 'fresh'],
  ['a stand-in read round trip', M.run({ ...M.BASE, r: 3, states: ['up', 'up', 'down'], sloppy: 1 }).all[3].readRtt, 43],
  ['read short of a stopped replica times out', M.run({ ...M.BASE, states: ['up', 'mid', 'mid'] }).read.outcome, 'timed-out'],
  ['read short of known-down replicas fails at once', M.run({ ...M.BASE, states: ['up', 'down', 'down'] }).read.outcome, 'fails'],
];
for (const [name, got, want] of facts) {
  console.log(`${String(got) === String(want) ? 'ok  ' : 'FAIL'} ${name}: ${got}`);
  check(String(got) === String(want), name);
}

console.log('\n== Every setting');
let settings = 0;
const verdicts = {};
let freshClaim = 0;
let survivesClaim = 0;
let readSurvivesClaim = 0;
let refusedNoCopy = 0;
let standInReads = 0;
const readOutcomes = {};
let nines100 = 0;
const stateLists = (n) => {
  const out = [];
  const walk = (acc) => {
    if (acc.length === n) return void out.push(acc);
    for (const s of M.STATES) walk([...acc, s]);
  };
  walk([]);
  return out;
};
for (const n of M.SIZES)
  for (let w = 1; w <= n; w++)
    for (let r = 1; r <= n; r++)
      for (const states of stateLists(n))
        for (const stall of [0, 1])
          for (const sloppy of [0, 1]) {
            settings++;
            const m = M.quorumScenario(n, w, r, states, stall, sloppy);
            verdicts[m.verdict] = (verdicts[m.verdict] ?? 0) + 1;
            if (!sloppy && r + w > n && m.write.outcome === 'acked' && m.read.set.length) {
              freshClaim++;
              check(m.verdict === 'fresh' && m.staleSets === 0, `strict R + W > N not fresh: N${n} W${w} R${r} ${states} stall ${stall}`);
            }
            const down = states.filter((s) => s === 'down' || s === 'back').length;
            if (!states.includes('mid') && down <= m.survives.write) {
              survivesClaim++;
              check(m.write.outcome === 'acked', `survives ${m.survives.write} but refused with ${down} down: N${n} W${w} sloppy ${sloppy}`);
            }
            const stillDown = states.filter((s) => s === 'down').length;
            if (!states.includes('mid') && stillDown <= m.survives.read) {
              readSurvivesClaim++;
              check(m.read.set.length > 0, `reads survive ${m.survives.read} but fail with ${stillDown} down: N${n} W${w} R${r} ${states} sloppy ${sloppy}`);
            }
            if (m.readStandIns.length) {
              standInReads++;
              const written = m.write.outcome !== 'refused';
              check(written ? m.read.returns === M.VERSIONS.new : m.read.returns !== M.VERSIONS.new, 'a stand-in answers with the write it holds, or no copy');
            }
            if (m.read.outcome === 'no-copy') {
              refusedNoCopy++;
              check(m.verdict === 'refused', 'only a refused write leaves a read with no copy');
            }
            if (!m.read.set.length) readOutcomes[m.read.outcome] = (readOutcomes[m.read.outcome] ?? 0) + 1;
            if (m.write.outcome === 'acked') check(m.write.ms < M.TIMEOUT_MS, 'acked before the timeout');
            for (const p of [m.avail.write, m.avail.read]) if (M.formatNines(p) === '100.00%' || /^100/.test(M.formatNines(p))) nines100++;
          }
console.log(`${settings} settings; verdicts ${JSON.stringify(verdicts)}`);
console.log(`strict R + W > N with a completed read: ${freshClaim}, all fresh; "survives k down" held in ${survivesClaim} for writes, ${readSurvivesClaim} for reads`);
console.log(`sloppy reads that used a stand-in: ${standInReads}; reads that did not complete: ${JSON.stringify(readOutcomes)}`);
console.log(`refused sloppy writes whose read heard only stand-ins with no copy of the key: ${refusedNoCopy}`);
check(settings === 104704, '104,704 settings');
check(nines100 === 0, 'nines never print 100%');
check(Object.keys(verdicts).length === 7, 'all seven verdicts occur');

console.log(failures ? `\n${failures} checks failed` : '\nall checks pass');
process.exit(failures ? 1 : 0);
