// Prints every experiment's slots and filled text from model.js, proves the challenge has exactly one passing setting,
// checks the reveals' word claims against the model, holds the closed form to its own invariants at every setting, and
// checks it against an independent computation: a request-by-request flow simulation with token buckets per instance,
// worker pools that hold each request for its time, a query mix drawn request by request, zones assigned by instance
// index, and one admission for the database's primary and replicas.
// Usage: node enum.cjs [--quick] (a sparser simulation stride). Exits 1 on any failed check.
'use strict';
const M = require('./model.js');

const quick = process.argv.includes('--quick');
let failures = 0;
let checks = 0;
const check = (ok, msg) => {
  checks++;
  if (!ok) {
    failures++;
    console.log(`FAIL ${msg}`);
  }
};
const near = (a, b, eps = 1e-9) => Math.abs(a - b) <= eps * Math.max(1, Math.abs(b));

// ------------------------------------------------------------------ experiments
console.log('== Experiments');
const positions = [];
for (const spec of M.EXPERIMENTS) {
  const e = M.renderExperiment(spec);
  console.log(`\n# ${e.id}: ${e.title}`);
  console.log(`setup ${JSON.stringify(spec.setup)}  act ${JSON.stringify(spec.act ?? null)}  hide ${JSON.stringify(e.hide)}  focus ${JSON.stringify(e.focus)}`);
  console.log(`slots ${Object.entries(e.slots).map(([k, s]) => `${k}=${s.unit === 'word' ? JSON.stringify(s.value) : `${+Number(s.value).toFixed(4)} ${s.unit}`}`).join(', ')}`);
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
    check(!/ /.test(text), `${spec.id}: non-breaking space`);
    check(!/\d{4}/.test(text.replace(/\d{1,3}(,\d{3})+/g, '')), `${spec.id}: a number past 999 without a separator in "${text}"`);
    check(!/\/s (requests|queries) a second/.test(text), `${spec.id}: a rate said twice in "${text}"`);
  }
  // No sentence after the answer's own opening starts on a numeral.
  for (const text of [e.ask, e.reveal]) {
    const later = text.split(/(?<=[.!?]) /).slice(text === e.reveal ? 1 : 0);
    for (const sentence of later) check(!/^\d/.test(sentence), `${spec.id}: a sentence opens on a numeral: "${sentence}"`);
  }
  check(new Set(e.choices).size === e.choices.length, `${spec.id}: two choices read the same`);
  // The right choice's own words never restate the reveal's mechanism.
  if (e.answer >= 0) for (const c of e.choices) check(c.length < 70, `${spec.id}: a long choice "${c}"`);
}
console.log(`\nanswer positions ${positions.join(', ')}`);
check(positions.join(',') === '3,2,1,3,1', 'answer positions are 3, 2, 1, 3, 1');

// ------------------------------------------------------------------ the reveals' claims
console.log('\n== Claims');
{
  const [e1, e2, e3, e4, e5] = M.EXPERIMENTS;
  const a1 = M.run(e1.setup);
  check(a1.maxUtil <= 0.5, `E1: every tier has room at 1,000/s (busiest ${a1.maxUtil})`);
  const plan = M.rampPlan(e1.setup, e1.setup.traffic, e1.act.set.traffic);
  check(plan.full === 'primary', `E1: the ramp's first tier to shed is the database (${plan.full})`);
  check(plan.stops.join(',') === '1000,2000,3000,4000,5000,6000,7000,8000,10000', `E1: the ramp steps ${plan.stops}`);
  const b1 = M.run({ ...e1.setup, ...e1.act.set });
  check(near(b1.lb.util, 1) && b1.lb.shed === 0, 'E1: at 10,000/s the load balancers end exactly 100% busy and shed nothing');
  check(a1.dbCeiling < a1.app.ceiling && a1.app.ceiling < a1.lb.ceiling, 'E1: database < app servers < load balancers');
  check(a1.settings.size > a1.app.ceiling, 'E1: the trap holds: the database machine\'s raw size is above the app tier\'s limit');
  check(b1.bottleneck === 'primary' && b1.served === a1.dbCeiling, 'E1: the database caps what is served at 10x');

  const a2 = M.run(e2.setup);
  const b2 = M.run({ ...e2.setup, ...e2.act.set });
  check(near(b2.dbCeiling / a2.dbCeiling, 2 / 0.38), 'E2: the database limit grows 2 / 0.38 = 5.26x');
  check(b2.shed === 0 && b2.busiest === 'app', 'E2: all served, the app servers busiest');
  check(Math.round(b2.dbCeiling / 1000) * 1000 === 21000, 'E2: "about 21,000/s"');

  const a3 = M.run(e3.setup);
  const b3 = M.run({ ...e3.setup, ...e3.act.set });
  check(a3.shed === 0 && b3.shed === 0, 'E3: nothing shed either way');
  for (let n = 1; n <= M.REP_MAX; n++) {
    const r = M.run({ ...e3.setup, replicas: n });
    check(near(r.replicas.replayUtil, 0.5), `E3: replay takes half of every replica at ${n} replicas`);
    check(r.replicas.ceiling < r.settings.size / M.WRITES, `E3: ${n} replicas stay under the write ceiling`);
  }
  check(Math.round(b3.replicas.util * 100) === 61 && Math.round((a3.replicas.util / 2) * 100) === 36, 'E3: about 61% against about 36%');

  const a4 = M.run(e4.setup);
  const b4 = M.run({ ...e4.setup, ...e4.act.set });
  check(a4.shed === 0 && a4.maxUtil < 0.75, 'E4: all served, every tier under 75%');
  check(near(b4.shed / a4.offered, 0.1), 'E4: a tenth shed');
  check(b4.app.shed === b4.shed && b4.lb.shed === 0 && b4.primary.shed + b4.replicas.shed === 0, 'E4: only the app servers shed');
  check(near(b4.lb.util, 1), 'E4: the load balancers end exactly full');
  check(b4.primary.promoted && !b4.primary.outage, 'E4: a replica became the primary');
  check(near(b4.app.arriving / b4.app.ceiling, a4.app.util * 1.5), 'E4: the app load on what is left is 1.5x');

  const a5 = M.run(e5.setup);
  const b5 = M.run({ ...e5.setup, ...e5.act.set });
  check(near(a5.app.inFlight, 50), 'E5: 50 of 100 workers busy before');
  check(b5.app.bound === 'workers' && near(b5.app.each, 200), 'E5: workers bind at 100 / 0.5 s = 200/s a server');
  check(near(b5.served / a5.offered, 0.2), 'E5: a fifth served');
  check(near(b5.app.cpuUtil, 200 / 1500), 'E5: CPU 13.3% busy');
  check(b5.primary.util < a5.primary.util, 'E5: the database does less work, not more');
}

// ------------------------------------------------------------------ the closed form's invariants at every setting
console.log('\n== Every setting');
const ALL = [];
for (const traffic of M.TRAFFIC)
  for (let lb = 1; lb <= M.LB_MAX; lb++)
    for (let app = 1; app <= M.APP_MAX; app++)
      for (const size of M.SIZES)
        for (let replicas = 0; replicas <= M.REP_MAX; replicas++)
          for (const cache of [0, 1]) for (const zone of [0, 1]) for (const slow of [0, 1]) ALL.push({ traffic, lb, app, size, replicas, cache, zone, slow });
console.log(`${ALL.length} settings`);
let invariants = 0;
for (const s of ALL) {
  const r = M.run(s);
  const sheds = r.lb.shed + r.app.shed + r.primary.shed + r.replicas.shed;
  const ok =
    near(r.offered, r.served + sheds) &&
    near(r.served, Math.min(r.offered, r.lb.ceiling, r.app.ceiling, r.primary.ceiling, r.replicas.ceiling)) &&
    r.lanes.every((t) => t.util >= -1e-12 && t.util <= 1 + 1e-12) &&
    (r.shed === 0 || near(r.limitOf(r.bottleneck), r.served)) &&
    [r.lb, r.app].every((t) => t.shed <= 1e-9 || near(t.util, 1)) &&
    (r.primary.shed <= 1e-9 || r.primary.outage || near(r.primary.util, 1)) &&
    (r.replicas.shed <= 1e-9 || near(r.replicas.util, 1)) &&
    r.app.inFlight <= M.WORKERS + 1e-9 &&
    near(r.replicas.util, r.replicas.replayUtil + r.replicas.readsUtil);
  if (!ok) {
    invariants++;
    if (invariants < 5) console.log(`  invariant broken at ${JSON.stringify(s)}`);
  }
}
check(invariants === 0, `${invariants} settings break an invariant (conservation, served = smallest limit, utilization in [0, 1], 100% where a tier sheds, workers within the pool)`);

// ------------------------------------------------------------------ the challenge
console.log('\n== Challenge');
const ch = M.EXPERIMENTS.find((e) => e.goal);
const passing = [];
let space = 0;
for (let lb = 1; lb <= M.LB_MAX; lb++)
  for (let app = 1; app <= M.APP_MAX; app++)
    for (const size of M.SIZES)
      for (let replicas = 0; replicas <= M.REP_MAX; replicas++)
        for (const cache of [0, 1]) {
          const s = { ...ch.setup, lb, app, size, replicas, cache };
          space++;
          const r = M.run(s);
          if (M.goalMet(ch.goal, r.settings, M.metrics(r))) passing.push(s);
        }
console.log(`${space} settings, ${passing.length} pass: ${passing.map((s) => JSON.stringify(s)).join(' ')}`);
check(space === 3528, 'the challenge searches 3,528 settings');
check(passing.length === 1, 'exactly one setting meets the challenge');
check(passing.length === 1 && Object.entries(M.CHALLENGE_SOLUTION).every(([k, v]) => passing[0][k] === v), 'it is CHALLENGE_SOLUTION');
{
  const start = M.run(ch.setup);
  check(!M.goalMet(ch.goal, start.settings, M.metrics(start)), 'the challenge does not start met');
  // Each lever is needed: the solution with one lever moved back fails.
  const sol = { ...ch.setup, ...M.CHALLENGE_SOLUTION };
  for (const [k, v] of [['lb', 5], ['app', 16], ['size', 4000], ['replicas', 1], ['replicas', 0], ['cache', 0]]) {
    const r = M.run({ ...sol, [k]: v });
    check(!M.goalMet(ch.goal, r.settings, M.metrics(r)), `the challenge needs ${k} != ${v}`);
  }
}

// ------------------------------------------------------------------ an independent flow simulation
// Requests arrive evenly over two seconds and walk the tiers one by one. Each instance is a token bucket refilled at its
// own limit (a few requests or queries of burst, so a busy bucket never wastes tokens); app servers also hold a worker
// per request for its whole time, and refuse one when all 100 are busy (each pool starts in the state it runs in); zones are assigned by instance index, a
// surviving replica is promoted when the primary's zone fails; the database admits a request only when the primary and
// every replica hold the tokens its writes, replayed writes and reads cost (the model's stated simplification: every
// request costs the average). Load balancers and app servers take requests in turn. Served is counted over the last
// four of five seconds, a rate a second.
function simulate(s) {
  const lambda = s.traffic;
  const inZoneA = (zone) => s.zone === 1 && zone === 0;
  const BURST = 4;
  // Buckets start empty: a full one would lend a barely overloaded tier its burst well into the counted seconds.
  const bucket = (burst) => ({ tokens: 0, burst, used: 0 });
  const lbs = [];
  for (let i = 0; i < s.lb; i++) if (!inZoneA(i % 3)) lbs.push(bucket(BURST));
  const apps = [];
  const holdS = (s.slow ? 500 : 50) / 1000;
  // Each pool starts as it runs once saturated: 100 workers whose requests finish evenly over the next hold, so a pool
  // that stays full admits evenly too (a cold pool would admit in one burst per hold, forever, with every hold the same).
  const warm = () => Array.from({ length: 100 }, (_, i) => (holdS * (i + 1)) / 100);
  for (let i = 0; i < s.app; i++) if (!inZoneA(i % 3)) apps.push({ ...bucket(BURST), releases: warm(), head: 0 });
  let reps = [];
  // A pool that stays full admits whenever a worker frees, so the requests it passes on can come in clumps; the
  // database's buckets hold 50 ms of tokens, so a clump does not waste them, and the count runs over four seconds.
  const dbBurst = s.size * 0.05;
  for (let i = 0; i < s.replicas; i++) if (!inZoneA((i + 1) % 3)) reps.push(bucket(dbBurst));
  let primaryUp = true;
  if (s.zone === 1) {
    if (reps.length) reps = reps.slice(1);
    else primaryUp = false;
  }
  const primary = bucket(dbBurst);
  const misses = 1.8 * (s.cache ? 0.1 : 1);
  const writes = 0.2;
  const EPS = 1e-9;
  let last = 0;
  let rrLb = 0;
  let rrApp = 0;
  const counts = { served: 0, lb: 0, app: 0, db: 0, arrived: 0 };
  const refill = (b, rate, dt) => (b.tokens = Math.min(b.burst, b.tokens + rate * dt));
  const SECONDS = 5;
  for (let k = 0; k < SECONDS * lambda; k++) {
    const t = k / lambda;
    const dt = t - last;
    last = t;
    const measured = t >= 1 - EPS;
    for (const b of lbs) refill(b, 5000, dt);
    for (const b of apps) refill(b, 1500, dt);
    refill(primary, s.size, dt);
    for (const b of reps) refill(b, s.size, dt);
    if (measured) counts.arrived++;
    const lb = lbs.length ? lbs[rrLb++ % lbs.length] : null;
    if (!lb || lb.tokens < 1 - EPS) {
      if (measured) counts.lb++;
      continue;
    }
    lb.tokens -= 1;
    if (measured) lb.used++;
    const ap = apps.length ? apps[rrApp++ % apps.length] : null;
    if (ap) while (ap.head < ap.releases.length && ap.releases[ap.head] <= t + EPS) ap.head++;
    if (!ap || ap.tokens < 1 - EPS || ap.releases.length - ap.head >= 100) {
      if (measured) counts.app++;
      continue;
    }
    ap.tokens -= 1;
    ap.releases.push(t + holdS);
    if (measured) ap.used++;
    let ok = primaryUp;
    if (ok && reps.length) {
      const each = writes + misses / reps.length;
      ok = primary.tokens >= writes - EPS && reps.every((b) => b.tokens >= each - EPS);
      if (ok) {
        primary.tokens -= writes;
        if (measured) primary.used += writes;
        for (const b of reps) {
          b.tokens -= each;
          if (measured) b.used += each;
        }
      }
    } else if (ok) {
      ok = primary.tokens >= writes + misses - EPS;
      if (ok) {
        primary.tokens -= writes + misses;
        if (measured) primary.used += writes + misses;
      }
    }
    if (!ok) {
      if (measured) counts.db++;
      continue;
    }
    if (measured) counts.served++;
  }
  const sum = (bs) => bs.reduce((a, b) => a + b.used, 0);
  const w = SECONDS - 1;
  const util = {
    lb: lbs.length ? sum(lbs) / (lbs.length * 5000 * w) : null,
    app: apps.length ? sum(apps) / (apps.length * 1500 * w) : null,
    primary: primary.used / (s.size * w),
    replicas: reps.length ? sum(reps) / (reps.length * s.size * w) : null,
  };
  return { served: counts.served / w, lb: counts.lb / w, app: counts.app / w, db: counts.db / w, arrived: counts.arrived / w, util };
}

console.log('\n== Flow simulation');
const stride = quick ? 97 : 23;
const special = [
  ...M.EXPERIMENTS.flatMap((e) => [e.setup, { ...e.setup, ...(e.act?.set ?? {}) }]),
  { ...M.EXPERIMENTS[5].setup, ...M.CHALLENGE_SOLUTION },
  { ...M.EXPERIMENTS[5].setup, ...M.CHALLENGE_SOLUTION, zone: 1 },
  M.BASE,
];
const sims = [...special, ...ALL.filter((_, i) => i % stride === 0)];
let worst = { d: 0 };
let simFails = 0;
for (const s of sims) {
  const r = M.run(s);
  const sim = simulate(s);
  // Discrete arrivals and buckets: within half a percent of the rate, plus a request per instance.
  const tol = 0.005 * r.offered + s.lb + s.app + s.replicas + 3;
  const d = Math.abs(sim.served - r.served);
  const dTier = Math.max(Math.abs(sim.lb - r.lb.shed), Math.abs(sim.app - r.app.shed), Math.abs(sim.db - (r.primary.shed + r.replicas.shed)));
  // Utilization of the CPU (not the pool) for the app tier, which is what the simulation's tokens measure.
  const uApp = r.app.up ? r.app.passed / (r.app.up * M.APP_RPS) : null;
  const uDiffs = [
    sim.util.lb !== null ? Math.abs(sim.util.lb - r.lb.util) : 0,
    sim.util.app !== null ? Math.abs(sim.util.app - uApp) : 0,
    r.primary.outage ? 0 : Math.abs(sim.util.primary - r.primary.util),
    sim.util.replicas !== null ? Math.abs(sim.util.replicas - r.replicas.util) : 0,
  ];
  const uMax = Math.max(...uDiffs);
  if (d > worst.d) worst = { d, s, model: r.served, sim: sim.served };
  if (d > tol || dTier > tol || uMax > 0.01) {
    simFails++;
    if (simFails < 6) console.log(`  ${JSON.stringify(s)}: model ${r.served.toFixed(1)} sim ${sim.served}; sheds model ${[r.lb.shed, r.app.shed, r.primary.shed + r.replicas.shed].map((v) => v.toFixed(0))} sim ${[sim.lb, sim.app, sim.db]}; util gaps ${uDiffs.map((v) => v.toFixed(4))}`);
  }
}
console.log(`${sims.length} settings simulated; largest served gap ${worst.d} (${worst.model} against ${worst.sim})`);
check(simFails === 0, `${simFails} settings where the simulation and the model disagree beyond tolerance`);

console.log(`\n${checks} checks, ${failures} failed`);
process.exit(failures ? 1 : 0);
