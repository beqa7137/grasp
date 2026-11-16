// Prints every experiment's slots and filled text from model.js, proves the challenge has exactly one passing setting,
// and checks the model three independent ways: closed forms (M/M/1, Pollaczek-Khinchine), Erlang's 1909 M/D/1 formula
// in exact BigInt arithmetic, and a discrete-event simulation of every configuration. Then it checks the seeded sample:
// common random numbers (more load never shortens a wait) and how typical its window is, and picks the seed.
// Usage: node enum.cjs [--quick] (fewer simulated requests). Exits 1 on any failed check.
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
const rel = (a, b) => Math.abs(a - b) / Math.max(Math.abs(b), 1e-12);

// ------------------------------------------------------------------ experiments
console.log('== Experiments');
const positions = [];
for (const spec of M.EXPERIMENTS) {
  const e = M.renderExperiment(spec);
  console.log(`\n# ${e.id}: ${e.title}`);
  console.log(`setup ${JSON.stringify(spec.setup)}  act ${JSON.stringify(spec.act ?? null)}  hide ${JSON.stringify(spec.hide)}  focus ${JSON.stringify(spec.focus)}`);
  console.log(`slots ${Object.entries(e.slots).map(([k, s]) => `${k}=${s.unit === 'word' ? JSON.stringify(s.value) : `${+s.value.toFixed(4)} ${s.unit}`}`).join(', ')}`);
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
    check(!/—/.test(text), `${spec.id}: em dash`);
    check(!/ /.test(text), `${spec.id}: non-breaking space`);
  }
  const distinct = new Set(e.choices);
  check(distinct.size === e.choices.length, `${spec.id}: two choices read the same`);
}
console.log(`\nanswer positions ${positions.join(', ')}`);
check(positions.join(',') === '3,2,1,2,3', 'answer positions are 3, 2, 1, 2, 3');

// The claims the reveals make in words, checked against the model.
{
  const idle = M.run({ load: 50 });
  check(rel(idle.waitChance, 0.5) < 1e-12, 'E1: half of requests wait at 50% (PASTA: P(wait) = utilization)');
  check(rel(idle.meanWait, 10) < 1e-9 && rel(idle.mean, 20) < 1e-9, 'E1: mean wait 10 ms, mean 20 ms');
  const a = M.run({ load: 70 });
  const b = M.run({ load: 90 });
  check(rel(b.mean / a.mean, 3) < 1e-9, 'E2: 70% to 90% triples the mean');
  check(rel(b.p99 / b.p50, Math.log(100) / Math.LN2) < 1e-6, 'M/M/1: p99 = 6.64 x p50 at every load');
  check(rel(b.p99 / b.mean, Math.log(100)) < 1e-6, 'M/M/1: p99 = 4.61 x mean');
  const split = M.run({ servers: 4, queue: 'split', load: 80 });
  const shared = M.run({ servers: 4, queue: 'shared', load: 80 });
  check(split.meanWait / shared.meanWait > 5 && split.meanWait / shared.meanWait < 6, 'E3: a shared queue cuts the wait 5 to 6 times');
  const st = M.run({ load: 90, service: 'steady' });
  check(rel(st.meanWait, M.run({ load: 90 }).meanWait / 2) < 1e-9, 'E4: steady service halves the mean wait (M/D/1)');
  const lose = M.run({ servers: 3, load: 70, down: 1 });
  check(!lose.stable && rel(lose.rho, 1.05) < 1e-9 && rel(lose.growthPerS, 10) < 1e-9, 'E5: two of three at 105%, growing by 10/s');
  const safe = M.run({ servers: 3, load: 60, down: 1 });
  check(safe.stable && rel(safe.rho, 0.9) < 1e-9, 'E5: from 60% the two left run at 90%');
}

// ------------------------------------------------------------------ challenge
console.log('\n== Challenge: every server count, queue and load, one server down, random service');
const challenge = M.EXPERIMENTS.find((e) => e.goal);
const passing = [];
let count = 0;
for (const servers of M.SERVERS)
  for (const queue of M.QUEUES)
    for (const load of M.LOADS) {
      if (servers === 1 && queue === 'split') continue;
      count++;
      const s = { load, servers, queue, service: 'random', down: servers > 1 ? 1 : 0 };
      const m = M.run(s);
      const met = M.goalMet(challenge.goal, m.settings, m.metrics);
      if (met) passing.push(`${servers} ${queue} ${load}%`);
      if (met || load === 60 || load === 65) console.log(`${met ? 'PASS' : '    '} ${servers} servers ${queue.padEnd(6)} ${String(load).padStart(2)}%  p99 ${m.stable ? M.formatMs(m.p99) : 'grows without bound'}`);
    }
console.log(`${count} settings, passing: ${passing.join(', ')}`);
check(count === 98, '98 challenge settings (1 server has no queue choice and cannot lose one)');
check(passing.length === 1 && passing[0] === '4 shared 60%', 'exactly 4 servers, one shared queue, 60% passes');
{
  const s = M.run({ ...M.CHALLENGE_SOLUTION, service: 'random', down: 1 });
  check(s.p99 < M.CHALLENGE_BOUNDS.p99 * 0.9, 'the solution is clear of the p99 bound by 10%');
  const next = M.run({ ...M.CHALLENGE_SOLUTION, load: 65, service: 'random', down: 1 });
  check(next.p99 > M.CHALLENGE_BOUNDS.p99 * 1.1, 'the next load is past the bound by 10%');
  const setup = M.run(challenge.setup);
  check(!M.goalMet(challenge.goal, setup.settings, setup.metrics), 'the challenge does not start met');
}

// ------------------------------------------------------------------ closed forms
console.log('\n== Closed forms');
for (const load of M.LOADS) {
  const m = M.run({ load });
  const rho = load / 100;
  const mean = M.SERVICE_MS / (1 - rho);
  check(rel(m.mean, mean) < 1e-12, `M/M/1 mean at ${load}%`);
  check(rel(m.p50, mean * Math.LN2) < 1e-8, `M/M/1 p50 at ${load}%`);
  check(rel(m.p99, mean * Math.log(100)) < 1e-8, `M/M/1 p99 at ${load}%`);
  const d = M.run({ load, service: 'steady' });
  check(rel(d.meanWait, (rho * M.SERVICE_MS) / (2 * (1 - rho))) < 1e-9, `M/D/1 mean wait (Pollaczek-Khinchine) at ${load}%`);
  check(rel(d.waitChance, rho) < 1e-9, `M/D/1 chance to wait at ${load}%`);
  for (const c of [2, 3, 4]) {
    const sp = M.run({ load, servers: c, queue: 'split' });
    check(rel(sp.p99, m.p99) < 1e-9, `a queue each at ${c} servers is M/M/1 at ${load}%`);
    const sh = M.run({ load, servers: c });
    check(sh.meanWait <= m.meanWait + 1e-12 && sh.p99 <= m.p99 + 1e-9, `one shared queue never waits longer, ${c} at ${load}%`);
    const sd = M.run({ load, servers: c, service: 'steady' });
    check(sd.meanWait <= sh.meanWait + 1e-12, `steady never waits longer, ${c} at ${load}%`);
    check(rel(sh.inSystem, sh.waiting + (load / 100) * c) < 1e-9, `Little: in system = waiting + busy servers, ${c} at ${load}%`);
  }
}
for (const servers of M.SERVERS)
  for (const queue of M.QUEUES)
    for (const service of M.SERVICES)
      for (const down of [0, 1]) {
        if (servers === 1 && (queue === 'split' || down)) continue;
        let last = 0;
        for (const load of M.LOADS) {
          const m = M.run({ load, servers, queue, service, down });
          if (!m.stable) break;
          check(m.p99 >= last - 1e-9 && (m.p99 > last || m.p99 - M.SERVICE_MS < 1e-6), `p99 rises with load: ${servers} ${queue} ${service} down ${down} at ${load}%`);
          check(m.p50 <= m.p99 && m.p50 >= 0, `p50 under p99 at ${servers} ${queue} ${service} ${load}%`);
          check(m.dots.length === 100 && m.dots.every((v, i) => i === 0 || v >= m.dots[i - 1]), 'the 100 quantile dots ascend');
          check(m.dots[98] <= m.p99 && m.dots[99] >= m.p99, 'p99 lies between the 99th and 100th dot');
          last = m.p99;
        }
      }

// ------------------------------------------------------------------ Erlang's M/D/1 formula, exact
console.log("\n== Erlang's M/D/1 waiting-time formula in BigInt fixed point against Franx's chain");
{
  const DIGITS = 160n;
  const SCALE = 10n ** DIGITS;
  const fact = [1n];
  for (let i = 1; i <= 2000; i++) fact.push(fact[i - 1] * BigInt(i));
  // e^(p/q) in fixed point: halve until small, sum the series, square back.
  const expFixed = (p, q) => {
    let s = 0;
    while (p > q * 2n ** BigInt(s) / 4n) s++;
    const den = q * 2n ** BigInt(s);
    let term = SCALE;
    let sum = SCALE;
    for (let n = 1n; n < 120n; n++) {
      term = (term * p) / (den * n);
      if (term === 0n) break;
      sum += term;
    }
    for (let i = 0; i < s; i++) sum = (sum * sum) / SCALE;
    return sum;
  };
  // P(W <= x D) = (1 - rho) sum_{k=0}^{floor x} (rho (k - x))^k / k! e^(-rho (k - x)), rho = rn/rd, x = xn/xd.
  const erlang = (rn, rd, xn, xd) => {
    let sum = 0n;
    const K = xn / xd;
    for (let k = 0n; k <= K; k++) {
      const yn = rn * (xn - k * xd); // rho (x - k) = yn / yd >= 0
      const yd = rd * xd;
      const pw = (yn ** k * SCALE) / (yd ** k * fact[Number(k)]);
      const term = (pw * expFixed(yn, yd)) / SCALE;
      sum += k % 2n === 0n ? term : -term;
    }
    return Number((sum * (rd - rn) * 10n ** 15n) / (rd * SCALE)) / 1e15;
  };
  let worst = 0;
  for (const load of [10, 50, 70, 90, 95, 98]) {
    const lambda = load / 100 / M.SERVICE_MS;
    const d = M.mdc(1, lambda);
    for (const x of [0, 0.5, 1, 2.5, 4, 7.5, 12, 20, 33.5, 60, 100]) {
      const xd = 10n;
      const xn = BigInt(Math.round(x * 10));
      const exact = erlang(BigInt(load), 100n, xn, xd);
      const franx = 1 - d.waitTail(x * M.SERVICE_MS);
      worst = Math.max(worst, Math.abs(exact - franx));
      check(Math.abs(exact - franx) < 1e-9, `M/D/1 at ${load}%: P(W <= ${x} D) Erlang ${exact} against Franx ${franx}`);
    }
  }
  console.log(`largest difference over 66 points: ${worst.toExponential(2)}`);
}

// ------------------------------------------------------------------ discrete-event simulation
console.log('\n== Discrete-event simulation of every configuration (FCFS, Poisson arrivals)');
function simulate(s, n, seed) {
  const m = M.run(s);
  const up = m.up;
  const lambda = m.ratePerS / 1000;
  const rand = M.mulberry32(seed);
  const free = new Float64Array(up);
  const resp = new Float64Array(n);
  let t = 0;
  let waited = 0;
  let waitSum = 0;
  const warm = Math.floor(n / 10);
  for (let i = 0; i < n + warm; i++) {
    t += -Math.log(1 - rand()) / lambda;
    const work = s.service === 'steady' ? M.SERVICE_MS : -M.SERVICE_MS * Math.log(1 - rand());
    let k = 0;
    if (s.queue === 'split' && up > 1) k = Math.min(up - 1, Math.floor(rand() * up));
    else for (let j = 1; j < up; j++) if (free[j] < free[k]) k = j;
    const start = Math.max(t, free[k]);
    free[k] = start + work;
    if (i >= warm) {
      resp[i - warm] = start + work - t;
      waitSum += start - t;
      if (start > t) waited++;
    }
  }
  const sorted = Array.from(resp).sort((a, b) => a - b);
  const mean = sorted.reduce((a, b) => a + b, 0) / n;
  return { mean, p50: sorted[Math.floor(0.5 * n)], p99: sorted[Math.floor(0.99 * n)], waitChance: waited / n, meanWait: waitSum / n };
}
{
  const N = quick ? 400000 : 3000000;
  let worst = { mean: 0, p50: 0, p99: 0 };
  let runs = 0;
  for (const servers of M.SERVERS)
    for (const queue of M.QUEUES)
      for (const service of M.SERVICES)
        for (const down of [0, 1])
          for (const load of [30, 60, 80, 90]) {
            if (servers === 1 && (queue === 'split' || down)) continue;
            const s = { load, servers, queue, service, down };
            const m = M.run(s);
            if (!m.stable) continue;
            // Near saturation the sample's tail needs more requests (busy periods are long), so scale n by 1 / (1 - rho)^2.
            const n = Math.min(quick ? 2e6 : 1.2e7, Math.round(N * Math.max(1, 0.04 / (1 - m.rho) ** 2)));
            const sim = simulate(s, n, 1234 + runs);
            runs++;
            const tol = { mean: 0.02 + 0.02 / (1 - m.rho), p50: 0.02 + 0.02 / (1 - m.rho), p99: 0.03 + 0.03 / (1 - m.rho) };
            for (const k of ['mean', 'p50', 'p99']) {
              const r = rel(sim[k], m[k]);
              worst[k] = Math.max(worst[k], r);
              check(r < tol[k], `simulation ${k} ${servers} ${queue} ${service} down ${down} ${load}%: ${sim[k].toFixed(2)} against ${m[k].toFixed(2)}`);
            }
            check(Math.abs(sim.waitChance - m.waitChance) < 0.01 + 0.01 / (1 - m.rho), `simulation chance to wait ${servers} ${queue} ${service} ${load}%`);
          }
  console.log(`${runs} configurations; largest relative gaps: mean ${(worst.mean * 100).toFixed(2)}%, p50 ${(worst.p50 * 100).toFixed(2)}%, p99 ${(worst.p99 * 100).toFixed(2)}%`);
}

// ------------------------------------------------------------------ the sample
console.log('\n== The seeded sample');
const ALL = [];
for (const servers of M.SERVERS)
  for (const queue of M.QUEUES)
    for (const service of M.SERVICES)
      for (const down of [0, 1])
        for (const load of M.LOADS) {
          if (servers === 1 && (queue === 'split' || down)) continue;
          ALL.push({ load, servers, queue, service, down });
        }
console.log(`${ALL.length} settings`);
// Typicality: the window's busy share against the utilization, and its average queue against the model's.
function score(seed) {
  let worst = 0;
  let total = 0;
  for (const s of ALL) {
    const m = M.run(s);
    if (!m.stable) continue;
    const st = M.sampleStats(M.sample(s, seed));
    const busyGap = Math.abs(st.busy - m.rho);
    const qGap = Math.abs(Math.log((st.waiting + 0.25) / (m.waiting + 0.25)));
    const v = busyGap + qGap / 3;
    worst = Math.max(worst, v);
    total += v;
  }
  return { worst, mean: total / ALL.length };
}
{
  const seeds = quick ? [M.SAMPLE_SEED] : Array.from({ length: 24 }, (_, i) => i + 1);
  const scored = seeds.map((seed) => ({ seed, ...score(seed) })).sort((a, b) => a.mean - b.mean);
  for (const r of scored.slice(0, 5)) console.log(`seed ${r.seed}: mean gap ${r.mean.toFixed(3)}, worst ${r.worst.toFixed(3)}`);
  if (!quick) check(scored[0].seed === M.SAMPLE_SEED, `SAMPLE_SEED is the most typical of ${seeds.length} (it is ${scored[0].seed})`);
  // Report how far the chosen seed's windows sit from the model, setting by setting, at the loads the experiments use.
  for (const s of [{ load: 50 }, { load: 70 }, { load: 90 }, { load: 80, servers: 4, queue: 'split' }, { load: 80, servers: 4 }, { load: 90, service: 'steady' }, { load: 70, servers: 3 }, { load: 60, servers: 4, down: 1 }]) {
    const m = M.run(s);
    const smp = M.sample(s);
    const st = M.sampleStats(smp);
    console.log(`  ${JSON.stringify(s).padEnd(52)} window: ${smp.reqs.length} requests, busy ${(st.busy * 100).toFixed(0)}% (model ${(m.rho * 100).toFixed(0)}%), waiting ${st.waiting.toFixed(2)} on average (model ${m.waiting.toFixed(2)})`);
  }
}
// Common random numbers: at a higher load the same request (by index) never waits less, and the window's waiting grows.
{
  for (const servers of [1, 2, 4])
    for (const service of M.SERVICES) {
      let lastAvg = -1;
      let prev = null;
      for (const load of M.LOADS) {
        const s = { load, servers, service };
        const smp = M.sample(s);
        const st = M.sampleStats(smp);
        if (servers === 1) {
          if (prev) {
            const byId = new Map(prev.reqs.map((r) => [r.id, r.start - r.arrive]));
            let worse = 0;
            for (const r of smp.reqs) if (byId.has(r.id) && r.start - r.arrive < byId.get(r.id) - 1e-6) worse++;
            check(worse === 0, `one server, ${service}: ${worse} requests wait less at ${load}% than one stop lower`);
          }
          prev = smp;
        }
        check(st.waiting >= lastAvg * 0.8, `the window's average queue roughly grows with load: ${servers} ${service} ${load}% (${st.waiting.toFixed(2)} after ${lastAvg.toFixed(2)})`);
        lastAvg = st.waiting;
      }
    }
}
{
  // Unstable settings start empty and grow: the window ends with more waiting than it starts.
  const s = { load: 70, servers: 3, down: 1 };
  const smp = M.sample(s);
  const steps = M.waitingSteps(smp);
  check(steps[steps.length - 1][1] > 0, 'an unstable window ends with a queue');
}

console.log(`\n${checks} checks, ${failures} failed`);
process.exit(failures ? 1 : 0);
