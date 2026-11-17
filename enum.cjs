// Prints every number the Reliability widget's experiments quote, proves the challenge has exactly one passing setting,
// and checks the model against independent computations:
//   1. the closed forms against first principles (series by inclusion and exclusion, parallel by enumeration of states);
//   2. a discrete-event simulation of one part's failures and repairs (alternating renewal processes, the shared cause,
//      the copy in use and its failover), for every part configuration, over 300,000 simulated years each;
//   3. the same simulation at a 5% copy, where all copies of a part being down together is frequent enough to measure;
//   4. a simulation of whole chains (the union of their parts' outages) at the experiments' settings;
//   5. the reveals' word claims; 6. every sentence-level format; 7. the simulated year's seed against its hard bounds.
// Usage: node enum.cjs [--search=1-20000000] [--years=300000]
'use strict';
const M = require('./model.js');

const args = process.argv.slice(2);
const opt = (name) => args.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
let checks = 0;
let failed = 0;
function check(name, ok, detail = '') {
  checks++;
  if (!ok) {
    failed++;
    console.log(`FAIL ${name} ${detail}`);
  }
}
const near = (a, b, rel) => Math.abs(a - b) <= rel * Math.max(Math.abs(a), Math.abs(b), 1e-300);

// ---------------------------------------------------------------- the seed search
if (opt('search')) {
  const [lo, hi] = opt('search').split('-').map(Number);
  const found = [];
  for (let s = lo; s <= hi; s++) if (M.seedOk(s)) found.push(s);
  console.log(`seeds ${lo} to ${hi} that meet every bound: ${found.length ? found.join(', ') : 'none'}`);
  process.exit(0);
}

// ---------------------------------------------------------------- 1. closed forms from first principles
{
  const u = M.COPY_U;
  check('a copy is up MTBF / (MTBF + MTTR)', near(1 - u, M.MTBF_H / (M.MTBF_H + M.MTTR_H), 1e-12));
  check('a copy fails 8.76 times a year', near(M.FAILS_PER_YEAR, 8.76, 1e-12));
  for (const n of M.COPIES) {
    // Parallel, by enumerating the 2^n up or down states of independent copies.
    let allDown = 0;
    for (let mask = 0; mask < 1 << n; mask++) {
      let p = 1;
      let downs = 0;
      for (let i = 0; i < n; i++) {
        const down = (mask >> i) & 1;
        p *= down ? u : 1 - u;
        downs += down;
      }
      if (downs === n) allDown += p;
    }
    const m = M.partModel(n, 0, 0);
    check(`paper, ${n} copies: down only with all copies`, near(m.u, allDown, 1e-9), `${m.u} vs ${allDown}`);
    check(`paper, ${n} copies: each copy adds 3 nines`, near(M.nines(m.u), 3 * n, 1e-9));
    for (const shared of [0, 1])
      for (const failover of [0, 1]) {
        const p = M.partModel(n, shared, failover);
        const sum = p.causes.single + p.causes.shared + p.causes.failover + p.causes.overlap;
        check(`causes add up (${n}, ${shared}, ${failover})`, near(sum, p.u, 1e-12));
        if (n === 1) check(`one copy is 99.9% whatever the conditions (${shared}, ${failover})`, p.u === u);
        if (n > 1 && shared) check(`a copy stays 99.9% with shared failures (${n})`, near((1 - M.BETA * u) * (1 - (1 - (1 - u) / (1 - M.BETA * u))), 1 - u, 1e-12));
        if (n > 1 && shared) check(`shared failures cap a part at one more nine (${n}, ${failover})`, p.u >= M.BETA * u && M.nines(p.u) <= 4);
        check(`more copies never hurt (${n}, ${shared}, ${failover})`, n === 1 || p.u <= M.partModel(n - 1, shared, failover).u * (1 + 1e-12));
      }
  }
  // Series, by inclusion and exclusion over which parts are down.
  for (const s of allSettings()) {
    const m = M.chain(s);
    const us = m.parts.filter((p) => !p.optional).map((p) => p.u);
    let anyDown = 0;
    for (let mask = 1; mask < 1 << us.length; mask++) {
      let p = 1;
      let bits = 0;
      for (let i = 0; i < us.length; i++)
        if ((mask >> i) & 1) {
          p *= us[i];
          bits++;
        }
      anyDown += bits % 2 ? p : -p;
    }
    check('series by inclusion and exclusion', near(m.u, anyDown, 1e-9), JSON.stringify(s));
    check('a chain is never better than its weakest part', m.u >= Math.max(...us) * (1 - 1e-12));
    check('a chain is never worse than the sum of its parts', m.u <= us.reduce((a, b) => a + b, 0) * (1 + 1e-12));
  }
}
function allSettings() {
  const out = [];
  for (const lb of M.COPIES)
    for (const app of M.COPIES)
      for (const db of M.COPIES)
        for (const recs of M.COPIES)
          for (const optional of [0, 1]) for (const shared of [0, 1]) for (const failover of [0, 1]) out.push({ lb, app, db, recs, optional, shared, failover });
  return out;
}

// ---------------------------------------------------------------- 2 to 4. the simulation
/**
 * One part over `years`: each copy alternates between up (exponential, mean `mtbfOwn`) and down (exactly `mttr`); with
 * shared failures a cause of its own does the same and takes every copy with it. The request uses the first copy that
 * is up; when the copy in use dies and another is up, the part is down for `failover` hours, then uses the first that
 * is up; a copy that returns takes traffic back at once. Returns the down share by cause and the failures a year.
 */
function simulatePart({ n, uCopy, shared, failover, years, seed, beta = M.BETA, mttr = M.MTTR_H }) {
  const rand = M.mulberry32(seed);
  const exp = (mean) => -Math.log(1 - rand()) * mean;
  const H = years * M.YEAR_H;
  const uShared = shared && n > 1 ? beta * uCopy : 0;
  const uOwn = 1 - (1 - uCopy) / (1 - uShared);
  const mtbfOwn = (mttr * (1 - uOwn)) / uOwn;
  // Each process (a copy's own cause, or the shared cause as process n) holds its next transition; the loop takes the
  // earliest, so nothing is stored but the state.
  const procs = n + (uShared ? 1 : 0);
  const mtbfShared = uShared ? (mttr * (1 - uShared)) / uShared : Infinity;
  const nextAt = new Float64Array(procs);
  const isDown = new Uint8Array(procs);
  for (let i = 0; i < procs; i++) nextAt[i] = exp(i < n ? mtbfOwn : mtbfShared);
  const down = new Array(n).fill(false);
  let sharedDown = false;
  let inUse = 0;
  let switchAt = Infinity;
  let last = 0;
  const time = { shared: 0, failover: 0, overlap: 0 };
  let fails = 0;
  let wasDown = false;
  const firstUp = () => down.findIndex((d) => !d);
  const state = () => (sharedDown ? 'shared' : down.every(Boolean) ? 'overlap' : inUse === -1 ? 'failover' : null);
  const advance = (t) => {
    const st = state();
    if (st) time[st] += t - last;
    last = t;
  };
  const note = () => {
    const isDown = state() !== null;
    if (isDown && !wasDown) fails++;
    wasDown = isDown;
  };
  for (;;) {
    let who = 0;
    for (let i = 1; i < procs; i++) if (nextAt[i] < nextAt[who]) who = i;
    const next = nextAt[who];
    if (switchAt <= next) {
      if (switchAt >= H) break;
      advance(switchAt);
      inUse = firstUp();
      switchAt = Infinity;
      note();
      continue;
    }
    if (next >= H) break;
    const t = next;
    const goesDown = !isDown[who];
    isDown[who] = goesDown ? 1 : 0;
    nextAt[who] = t + (goesDown ? mttr : exp(who < n ? mtbfOwn : mtbfShared));
    advance(t);
    if (who === n) sharedDown = goesDown;
    else if (goesDown) {
      down[who] = true;
      if (who === inUse) {
        inUse = -1;
        if (firstUp() !== -1 && failover > 0) switchAt = t + failover;
        else if (firstUp() !== -1) inUse = firstUp();
      }
    } else {
      down[who] = false;
      if (switchAt === Infinity && (inUse === -1 || who < inUse)) inUse = who;
    }
    note();
  }
  advance(H);
  return { shared: time.shared / H, failover: time.failover / H, overlap: time.overlap / H, u: (time.shared + time.failover + time.overlap) / H, failsPerYear: fails / years };
}

const YEARS = Number(opt('years') ?? 300000);
console.log(`\nSimulated parts (${YEARS.toLocaleString('en-US')} years each): model against simulation, down a year`);
let seed = 1;
for (const n of M.COPIES)
  for (const shared of [0, 1])
    for (const failover of [0, 1]) {
      if (n === 1 && (shared || failover)) continue;
      const m = M.partModel(n, shared, failover);
      const sim = simulatePart({ n, uCopy: M.COPY_U, shared, failover: failover ? M.FAILOVER_H : 0, years: YEARS, seed: seed++ });
      const line = (name, model, got, tol, floor) => {
        const ok = Math.abs(model - got) <= Math.max(tol * model, floor);
        check(`simulation, ${n} copies shared ${shared} failover ${failover}: ${name}`, ok, `${model} vs ${got}`);
        return `${name} ${M.formatDown(model * M.YEAR_H)} / ${M.formatDown(got * M.YEAR_H)}`;
      };
      // Tolerances: 2% where an effect has thousands of events a year-set behind it, 8% for a pair's rare overlaps
      // (about 5,000 in the run), and an absolute floor where three copies overlap about 8 times in the whole run.
      const parts = [line('total', m.u, sim.u, n === 2 && !shared && !failover ? 0.08 : 0.02, 2e-9)];
      if (shared) parts.push(line('shared', m.causes.shared, sim.shared, 0.02, 0));
      if (failover) parts.push(line('failover', m.causes.failover, sim.failover, 0.02, 0));
      if (n > 1) parts.push(line('all down', m.causes.overlap, sim.overlap, n === 2 ? 0.08 : 1, 2e-9));
      check(`simulation, ${n} ${shared} ${failover}: failures a year`, Math.abs(m.failsPerYear - sim.failsPerYear) <= Math.max(0.03 * m.failsPerYear, 0.002), `${m.failsPerYear} vs ${sim.failsPerYear}`);
      console.log(`  ${n} cop${n === 1 ? 'y  ' : 'ies'} shared ${shared} failover ${failover}: ${parts.join('; ')}; fails a year ${m.failsPerYear.toFixed(3)} / ${sim.failsPerYear.toFixed(3)}`);
    }

// The overlap term where it is frequent: 5% copies, so two overlap 0.25% of the time and three 0.0125%.
console.log('\nThe same process with 5% copies (overlaps frequent enough to measure): own^n against simulation');
for (const n of [2, 3])
  for (const shared of [0, 1]) {
    const uCopy = 0.05;
    const uShared = shared ? M.BETA * uCopy : 0;
    const uOwn = 1 - (1 - uCopy) / (1 - uShared);
    const sim = simulatePart({ n, uCopy, shared, failover: 0, years: 20000, seed: seed++ });
    const model = (1 - uShared) * uOwn ** n;
    check(`5% copies, ${n} copies shared ${shared}: all down together`, near(model, sim.overlap, 0.03), `${model} vs ${sim.overlap}`);
    if (shared) check(`5% copies, ${n} copies: the shared share`, near(uShared, sim.shared, 0.03), `${uShared} vs ${sim.shared}`);
    console.log(`  ${n} copies shared ${shared}: all down ${(model * 100).toFixed(4)}% / ${(sim.overlap * 100).toFixed(4)}%`);
  }

/** A whole chain: each part simulated on its own stream, the request down while any needed part is. */
function simulateChain(settings, years, seedBase) {
  const s = { ...M.BASE, ...settings };
  // Parts are independent, so the request's down share is 1 - the product of the parts' simulated up shares; the
  // union itself is measured for single-copy chains below, interval by interval.
  let up = 1;
  let fails = 0;
  M.PARTS.forEach((p, i) => {
    if (p.id === 'recs' && s.optional) return;
    const sim = simulatePart({ n: s[p.id], uCopy: M.COPY_U, shared: s.shared, failover: s.failover ? M.FAILOVER_H : 0, years, seed: seedBase + i });
    up *= 1 - sim.u;
    fails += sim.failsPerYear;
  });
  return { u: 1 - up, failsPerYear: fails };
}
/** The union measured directly: k single copies, the request down while any is (merged intervals). */
function simulateUnion(k, years, seedBase) {
  const rand = M.mulberry32(seedBase);
  const exp = (mean) => -Math.log(1 - rand()) * mean;
  const H = years * M.YEAR_H;
  const nextAt = new Float64Array(k);
  const isDown = new Uint8Array(k);
  for (let i = 0; i < k; i++) nextAt[i] = exp(M.MTBF_H);
  let total = 0;
  let sum = 0;
  let downs = 0;
  let last = 0;
  for (;;) {
    let who = 0;
    for (let i = 1; i < k; i++) if (nextAt[i] < nextAt[who]) who = i;
    const t = Math.min(H, nextAt[who]);
    if (downs > 0) total += t - last;
    sum += downs * (t - last);
    last = t;
    if (t >= H) break;
    const goesDown = !isDown[who];
    isDown[who] = goesDown ? 1 : 0;
    downs += goesDown ? 1 : -1;
    nextAt[who] = t + (goesDown ? M.MTTR_H : exp(M.MTBF_H));
  }
  return { u: total / H, sum: sum / H };
}
console.log('\nSimulated chains (100,000 years): model against simulation, down a year');
const E = M.EXPERIMENT_SETTINGS();
for (const [name, s] of Object.entries(E)) {
  const m = M.chain(s);
  const sim = simulateChain(s, 100000, 1000 + seed++ * 10);
  const tol = m.u < 1e-5 ? 0.12 : 0.02;
  check(`chain ${name}: down a year`, near(m.u, sim.u, tol), `${m.u} vs ${sim.u}`);
  check(`chain ${name}: failures a year`, Math.abs(m.failsPerYear - sim.failsPerYear) <= Math.max(0.03 * m.failsPerYear, 0.01), `${m.failsPerYear} vs ${sim.failsPerYear}`);
  console.log(`  ${name.padEnd(14)} ${M.formatDown(m.downH).padEnd(7)} / ${M.formatDown(sim.u * M.YEAR_H).padEnd(7)}  fails a year ${m.failsPerYear.toFixed(2)} / ${sim.failsPerYear.toFixed(2)}`);
}
{
  const un = simulateUnion(4, 200000, 77);
  const m = M.chain(E.series);
  check('four single parts: the union of their outages is the model', near(m.u, un.u, 0.01), `${m.u} vs ${un.u}`);
  check('four single parts: the union is just under the sum (outages rarely coincide)', un.u < un.sum && un.sum - un.u < 0.004 * un.sum, `${un.u} vs ${un.sum}`);
  console.log(`  union of 4 single parts, measured interval by interval: ${M.formatDown(un.u * M.YEAR_H)} (the sum of the four: ${M.formatDown(un.sum * M.YEAR_H)}); the model: ${M.formatDown(m.downH)}`);
}

// ---------------------------------------------------------------- the experiments
console.log('\nExperiments');
const answers = [];
M.EXPERIMENTS.forEach((spec, i) => {
  const e = M.renderExperiment(spec);
  for (const t of [spec.title, spec.ask, spec.reveal, ...(spec.choices ?? []).map((c) => c.text)]) check(`E${i + 1}: no stray digits in "${t.slice(0, 40)}"`, M.strayDigits(t).length === 0, M.strayDigits(t).join(' '));
  console.log(`\nE${i + 1} ${e.title}  [${JSON.stringify(spec.setup)}${spec.act?.set ? ` then ${JSON.stringify(spec.act.set)}` : ''}]`);
  console.log(`  ask: ${e.ask}`);
  e.choices.forEach((c, k) => console.log(`   ${k === e.answer ? '*' : ' '} ${c}`));
  console.log(`  reveal: ${e.reveal}`);
  if (e.choices.length) {
    answers.push(e.answer + 1);
    check(`E${i + 1}: three distinct choices`, new Set(e.choices).size === 3);
  }
  for (const t of [e.ask, e.reveal, ...e.choices]) {
    check(`E${i + 1}: no em dash or non-breaking space`, !/[— ]/.test(t));
    // A reveal and a choice open on the answer's own value; no other sentence opens on a numeral.
    check(`E${i + 1}: no sentence opens on a numeral`, !/[.?!] \d/.test(t) && (t !== e.ask || !/^\d/.test(t)), t);
  }
});
console.log(`\nanswer positions: ${answers.join(', ')}`);
check('answer positions vary and are not mostly second', new Set(answers).size === 3 && answers.filter((a) => a === 2).length <= 1);

// ---------------------------------------------------------------- the reveals' word claims
{
  const series = M.chain(E.series);
  check('E1 "almost never coincide": the union is within 0.2% of the sum', near(series.u, 4 * M.COPY_U, 0.002));
  check('E1 the sum prints as the model does', M.formatDown(4 * M.hoursAYear(M.COPY_U)) === M.formatDown(series.downH));
  const a = M.chain(E.weakestBefore);
  const b = M.chain(E.weakestAfter);
  check('E2 "unchanged": before and after print the same', M.formatDown(a.downH) === M.formatDown(b.downH));
  check('E2 "nothing you can measure": the change is under a minute a year', (a.downH - b.downH) * 60 < 1);
  check('E2 the weakest link is the database before and after', a.weakest.join() === 'db' && b.weakest.join() === 'db');
  const pair = M.partModel(2, 0, 0);
  check('E3 "0.1% of 0.1%"', near(pair.u, M.COPY_U * M.COPY_U, 1e-12));
  check('E3 "a tenth" is one more nine', near(M.nines(M.COPY_U / 10), 4, 1e-9));
  const sh = M.chain(E.sharedAfter);
  const paper = M.chain(E.pairs);
  check('E4 "about 100x"', Math.abs(sh.u / paper.u - 100) < 2, String(sh.u / paper.u));
  check('E4 "however many copies": three copies fall to shared outages as two do', near(M.partModel(3, 1, 0).causes.shared, M.partModel(2, 1, 0).causes.shared, 1e-12));
  check('E4 "at most one more nine": the shared share alone is 99.99%', M.formatAvail(M.partModel(2, 1, 0).causes.shared) === '99.99%');
  check('E4 the 1 in 10 is BETA', M.SHARE_WORDS === `1 in ${Math.round(1 / M.BETA)}`);
  const fo = M.chain(E.failoverAfter);
  check('E5 "about 26 times": three parts, each at every failure of its copy in use', Math.round(fo.failsPerYear) === Math.round(3 * M.FAILS_PER_YEAR));
  check('E5 downtime is failures x failover time, within 1%', near(fo.downH, (fo.failsPerYear * M.FAILOVER_MIN) / 60, 0.01), `${fo.downH} vs ${(fo.failsPerYear * M.FAILOVER_MIN) / 60}`);
  check('E5 "once in 19 years" on paper', Math.round(1 / paper.failsPerYear) === 19, String(1 / paper.failsPerYear));
  check('E5 "past four nines": a 5 min failover alone holds a pair under four nines... 44 min a year against 53', M.hoursAYear(M.partModel(2, 0, 1).u) * 60 < 53 && M.hoursAYear(M.partModel(2, 0, 1).u) * 60 > 40);
}

// ---------------------------------------------------------------- the challenge
{
  const spec = M.EXPERIMENTS[5];
  const passing = [];
  let n = 0;
  for (const s of allSettings()) {
    if (!M.goalKept(spec.goal, s)) continue;
    n++;
    if (M.goalMet(spec.goal, s)) passing.push(s);
  }
  console.log(`\nChallenge: ${passing.length} of ${n} settings pass: ${passing.map((s) => JSON.stringify(s)).join(' ')}`);
  check('the challenge has exactly one passing setting', passing.length === 1);
  check('the passing setting is the stated solution', passing.length === 1 && Object.entries(M.CHALLENGE_SOLUTION).every(([k, v]) => passing[0][k] === v));
  check('the challenge does not start met', !M.goalMet(spec.goal, spec.setup));
  const sol = M.chain({ ...spec.setup, ...M.CHALLENGE_SOLUTION });
  check('the solution clears the bound by a margin a rounding cannot hide', sol.downH < 0.6 * M.CHALLENGE_BOUNDS.down);
  // The nearest misses, for the reveal and the brief.
  const miss = allSettings()
    .filter((s) => M.goalKept(spec.goal, s) && !M.goalMet(spec.goal, s))
    .map((s) => ({ s, m: M.chain(s) }))
    .filter((x) => x.m.copies <= 7)
    .sort((x, y) => x.m.downH - y.m.downH)
    .slice(0, 3);
  for (const x of miss) console.log(`  nearest miss with 7 copies or fewer: ${JSON.stringify(x.s)} ${M.formatDown(x.m.downH)}`);
  check('the nearest miss is far from the bound', miss[0].m.downH > 1.1 * M.CHALLENGE_BOUNDS.down);
}

// ---------------------------------------------------------------- formats over every setting
{
  const seen = new Set();
  for (const s of allSettings()) {
    const m = M.chain(s);
    for (const v of [m.downH, m.monthH, ...m.parts.map((p) => p.downH), ...m.parts.map((p) => p.paperDownH)]) {
      const t = M.formatDown(v);
      seen.add(t);
      check('a downtime keeps its unit', /^(under )?[\d.,]+ (s|min|h|d)$/.test(t), t);
      check('a downtime is never a bare zero', !/^0 /.test(t), t);
    }
    const a = M.formatAvail(m.u);
    check('an availability never prints as 100%', a !== '100%' && /^\d+(\.\d+)?%$/.test(a), a);
    for (const p of m.parts) check('a part availability never prints as 100%', M.formatAvail(p.u) !== '100%', M.formatAvail(p.u));
    // The causes line adds up as printed (shared + failover + both down = the part, each rounded as shown).
    for (const p of m.parts) {
      if (p.copies === 1) continue;
      const min = (u) => M.hoursAYear(u) * 60;
      const printed = Math.round(min(p.causes.shared)) + Math.round(min(p.causes.failover));
      check('a part\'s causes add up as printed, to the minute', Math.abs(printed - Math.round(min(p.u))) <= 1, `${printed} vs ${min(p.u)}`);
    }
  }
  check('nines ladder', ['36.5 d', '3.65 d', '8.8 h', '53 min', '5.3 min', '32 s', '3.2 s', '0.32 s', '0.03 s'].every((t, i) => M.formatDown(M.hoursAYear(10 ** -(i + 1))) === t), [1, 2, 3, 4, 5, 6, 7, 8, 9].map((k) => M.formatDown(M.hoursAYear(10 ** -k))).join(' '));
  console.log(`\n${allSettings().length} settings; ${seen.size} distinct downtimes printed`);
}

// ---------------------------------------------------------------- the simulated year
{
  console.log(`\nThe simulated year, seed ${M.SAMPLE_SEED}`);
  const bounds = M.seedBounds(M.SAMPLE_SEED);
  for (const b of bounds) {
    check(`seed: ${b.name}`, b.ok, String(b.value));
    console.log(`  ${b.ok ? 'ok  ' : 'MISS'} ${b.name}: ${b.value}`);
  }
  // Rules that hold at every setting: one request failure a week at most, a part's copies never share a week unless it
  // is one shared outage, and what reaches the request is exactly what the rule says.
  for (const s of allSettings()) {
    const smp = M.sample(s);
    const weeks = smp.fails.map((e) => e.week);
    check('at most one failure of the request in a week', new Set(weeks).size === weeks.length, JSON.stringify(s));
    for (const p of smp.parts) {
      const seen = new Map();
      p.rows.forEach((r, i) => {
        for (const t of r) {
          if (seen.has(t.week)) check('copies of a part share a week only in a shared outage', t.shared && seen.get(t.week).shared, `${p.id} week ${t.week}`);
          else seen.set(t.week, t);
          check('a shared tick appears in every copy', !t.shared || p.rows.every((o) => o.some((x) => x.week === t.week && x.shared)));
          check('a copy has no two outages in a week', r.filter((x) => x.week === t.week).length === 1);
          void i;
        }
      });
      for (const e of p.events) {
        const wantHours = e.kind === 'failover' ? M.FAILOVER_H : M.MTTR_H;
        check('an event lasts what its kind says', e.hours === wantHours);
        check('a single copy only has outages, a set of copies never', (p.n === 1) === (e.kind === 'outage'));
        check('shared outages only with the condition on', e.kind !== 'shared' || s.shared === 1);
        check('failovers only with the condition on', e.kind !== 'failover' || s.failover === 1);
      }
    }
    const m = M.chain(s);
    const rest = M.restMoment(s);
    check('every setting has a rest moment', !!rest, JSON.stringify(s));
    check('the rest moment is in the focus part', rest.part === m.focusPart);
    check('the rest moment fails exactly when the year has a failure from the focus part', rest.fails === smp.parts.find((p) => p.id === m.focusPart).events.length > 0);
    // The sample never claims more than a typical year: its count is within 3 standard deviations of the model's.
    const sd = Math.sqrt(Math.max(m.failsPerYear, 0.05));
    check('the year\'s failures are within 3 sd of the model\'s average', Math.abs(smp.count - m.failsPerYear) <= 3 * sd + 0.5, `${smp.count} vs ${m.failsPerYear} ${JSON.stringify(s)}`);
    const plan = M.playPlan(s);
    let prev = -1;
    for (let ms = 0; ms <= plan.total; ms += 50) {
      const at = plan.at(ms);
      check('the play clock never runs back', at.weeks >= prev - 1e-9);
      prev = at.weeks;
    }
    check('a play ends at the year\'s end', near(plan.at(plan.total).weeks, M.WEEKS, 1e-9));
    check('a free play holds at most four times', plan.holds.length <= 4);
  }
  for (const [name, s] of Object.entries(E)) {
    const smp = M.sample(s);
    const m = M.chain(s);
    const r = M.restMoment(s);
    console.log(`  ${name.padEnd(14)} the year: ${String(smp.count).padStart(2)} failures, ${M.formatDown(smp.hours).padEnd(7)} | the model: ${m.failsPerYear.toFixed(2)} a year, ${M.formatDown(m.downH).padEnd(7)} | rests on week ${r.week + 1}, ${r.part} ${r.kind} | free play holds weeks ${M.playPlan(s).holds.map((h) => `${h.week + 1} ${h.kind}`).join(', ')}`);
  }
}

console.log(`\n${checks - failed} of ${checks} checks pass`);
process.exit(failed ? 1 : 0);
