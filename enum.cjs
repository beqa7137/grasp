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
    check(!/\u2014/.test(text), `${spec.id}: em dash`);
    check(!/\u00a0/.test(text), `${spec.id}: non-breaking space`);
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
  check(rel(idle.meanWait, M.SERVICE_MS) < 1e-9, 'E1: "as long as the work itself" holds at 50%');
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
  const lose = M.run({ servers: 3, load: 80, down: 1 });
  check(!lose.stable && rel(lose.rho, 1.2) < 1e-9 && rel(lose.growthPerS, 40) < 1e-9, 'E5: two of three at 120%, growing by 40/s');
  const safe = M.run({ servers: 3, load: 60, down: 1 });
  check(safe.stable && rel(safe.rho, 0.9) < 1e-9, 'E5: from 60% the two left run at 90%');
  const e3 = M.renderExperiment(M.EXPERIMENTS[2]).slots;
  check(rel(e3.afterRound.value, e3.after.value) < 0.01, `E3: the choice's ${e3.afterRound.value} ms is within 1% of the model's ${e3.after.value}`);
  check(Math.abs(e3.ratio.value - e3.ratioRound.value) < 0.5, `E3: "about ${e3.ratioRound.value}x" rounds the model's ${e3.ratio.value.toFixed(2)}x`);
  // The pools' steady-to-random ratio: one server halves exactly; a pool "nearly halves" (0.5 to 0.65 from 30% to 90%).
  for (const c of [2, 3, 4])
    for (const load of [30, 60, 80, 90]) {
      const r = M.run({ load, servers: c, service: 'steady' }).meanWait / M.run({ load, servers: c }).meanWait;
      check(r > 0.5 && r < 0.65, `steady service nearly halves a pool's wait: ${c} at ${load}%, ${r.toFixed(3)}`);
    }
  // Exactly 100%: no steady state and no drift, so the words say the queue wanders, never "grows by 0".
  const critical = [];
  for (const c of [2, 3, 4]) for (const load of M.LOADS) for (const queue of M.QUEUES) for (const service of M.SERVICES) {
    const m = M.run({ load, servers: c, queue, service, down: 1 });
    if (Math.abs(m.rho - 1) < 1e-9) {
      critical.push(`${c} ${queue} ${service} ${load}%`);
      check(!m.stable && Math.abs(m.growthPerS) < 1e-9, `exactly 100% at ${c} servers ${load}%: unstable, no drift`);
    }
  }
  console.log(`exactly 100% busy with one down: ${critical.join(', ')}`);
}
// E3's reveal: with a queue each, the share of time some server is idle while a request waits at another, against a
// simulation of 4 independent M/M/1 queues (the time average equals what arrivals see, by PASTA).
{
  const rho = 0.8;
  const c = 4;
  const formula = M.idleBesideShare(rho, c);
  const rand = M.mulberry32(97);
  const lambda = rho / M.SERVICE_MS;
  const mu = 1 / M.SERVICE_MS;
  const n = new Array(c).fill(0);
  let t = 0;
  let hit = 0;
  const T = quick ? 2e6 : 2e7;
  while (t < T) {
    const rate = c * lambda + n.filter((k) => k > 0).length * mu;
    const dt = -Math.log(1 - rand()) / rate;
    if (n.some((k) => k === 0) && n.some((k) => k >= 2)) hit += dt;
    t += dt;
    let u = rand() * rate;
    for (let i = 0; i < c; i++) {
      if (u < lambda) {
        n[i]++;
        u = Infinity;
        break;
      }
      u -= lambda;
      if (n[i] > 0) {
        if (u < mu) {
          n[i]--;
          u = Infinity;
          break;
        }
        u -= mu;
      }
    }
  }
  console.log(`E3: idle beside a waiting request ${(formula * 100).toFixed(2)}% by the formula, ${((hit / t) * 100).toFixed(2)}% simulated`);
  check(Math.abs(hit / t - formula) < 0.01, 'E3: the idle-beside-a-line share matches a simulation of 4 queues at 80%');
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
const show = (s) => `${s.servers ?? 1} ${s.queue ?? 'shared'} ${s.service ?? 'random'}${s.down ? ' down' : ''} ${s.load}%`;
// The settings each experiment shows: setups, acts and the challenge's solution.
const BUSY_AT = [
  { load: 50 },
  { load: 70 },
  { load: 90 },
  { load: 80, servers: 4, queue: 'split' },
  { load: 80, servers: 4 },
  { load: 90, service: 'steady' },
  { load: 80, servers: 3 },
  { load: 60, servers: 4, down: 1 },
];
const RAMPS = [
  { load: 80, servers: 3, down: 1 },
  { load: 60, servers: 2, queue: 'split', down: 1 },
];
const ANSWERS = [{ load: 50 }, { load: 90 }, { load: 80, servers: 4 }, { load: 90, service: 'steady' }];
const POOL_SPLIT = { load: 80, servers: 4, queue: 'split' };
const waitingAt = (steps, t) => steps.filter((p) => p[0] <= t).at(-1)[1];
/** A ramp: the count waiting at each second rises, the end holds at least 0.8 of the window's most, and the end is within
 * 25% of the model's drift over the window. */
function ramp(s, seed) {
  const smp = M.sample(s, seed);
  const steps = M.waitingSteps(smp);
  const at = [1000, 2000, 3000, 4000].map((t) => waitingAt(steps, t - 1e-6));
  const most = Math.max(...steps.map((p) => p[1]));
  const drift = (M.run(s).growthPerS * smp.window) / 1000;
  const rises = at.every((v, i) => i === 0 || v > at[i - 1]);
  return { at, most, drift, ok: rises && at[3] >= 0.8 * most && Math.abs(at[3] - drift) <= 0.25 * drift };
}
/** The hard bounds every seed must meet before typicality decides between them. */
function bounds(seed) {
  const busy = BUSY_AT.map((s) => {
    const st = M.sampleStats(M.sample(s, seed));
    return { s, gap: (st.busy - M.run(s).rho) * 100 };
  });
  const pool = M.sample(POOL_SPLIT, seed).rest;
  const ramps = RAMPS.map((s) => ({ s, ...ramp(s, seed) }));
  const answers = ANSWERS.map((s) => ({ s, t: M.sample(s, seed).rest.t }));
  const ok = {
    busy: busy.every((b) => Math.abs(b.gap) <= 7),
    pool: pool.kind === 'idle' && pool.n >= 8,
    ramps: ramps.every((r) => r.ok),
    answers: answers.every((a) => a.t >= M.ANSWER_SLICE_MS),
  };
  return { busy, pool, ramps, answers, ok, all: Object.values(ok).every(Boolean) };
}
const printBounds = (seed, b) =>
  console.log(
    `seed ${String(seed).padStart(3)}: busy gaps ${b.busy.map((x) => x.gap.toFixed(1)).join(' ')} (max ${Math.max(...b.busy.map((x) => Math.abs(x.gap))).toFixed(1)}) ${b.ok.busy ? 'ok' : 'NO'}; ` +
      `E3 ${b.pool.kind} line ${b.pool.n} ${b.ok.pool ? 'ok' : 'NO'}; ramps ${b.ramps.map((r) => `${r.at.join('/')} of ${Math.round(r.drift)}`).join(', ')} ${b.ok.ramps ? 'ok' : 'NO'}; ` +
      `answers' moments ${b.answers.map((a) => Math.round(a.t)).join(' ')} ms ${b.ok.answers ? 'ok' : 'NO'}`,
  );
// Typicality, among the seeds that meet every bound: the window's busy share against the utilization, and its average
// queue against the model's, over every stable setting and again over the settings the experiments show, plus a quarter
// of the worst gap.
function gap(s, seed) {
  const m = M.run(s);
  if (!m.stable) return 0;
  const st = M.sampleStats(M.sample(s, seed));
  return Math.abs(st.busy - m.rho) + Math.abs(Math.log((st.waiting + 0.25) / (m.waiting + 0.25))) / 3;
}
function score(seed) {
  let all = 0;
  let worst = 0;
  for (const s of ALL) {
    const g = gap(s, seed);
    all += g;
    worst = Math.max(worst, g);
  }
  const key = BUSY_AT.reduce((t, s) => t + gap(s, seed), 0) / BUSY_AT.length;
  return { mean: all / ALL.length, key, worst, total: all / ALL.length + key + worst / 4 };
}
// The search: `--search=1-60000` scans a range of seeds against the bounds (about 15 minutes for the whole range on one
// core; split the range across processes). Of seeds 1 to 60,000 these four meet every bound; the default run re-checks
// them and picks the most typical, which must be SAMPLE_SEED.
const SEARCHED = { range: [1, 60000], passing: [26159, 27425, 30512, 57837] };
{
  const arg = process.argv.find((a) => a.startsWith('--search='));
  const [lo, hi] = arg ? arg.split('=')[1].split('-').map(Number) : [0, -1];
  const SEEDS = arg ? Array.from({ length: hi - lo + 1 }, (_, i) => lo + i) : quick ? [M.SAMPLE_SEED] : [...new Set([...SEARCHED.passing, M.SAMPLE_SEED])];
  const passing = [];
  for (const seed of SEEDS) {
    const b = bounds(seed);
    if (b.all) passing.push(seed);
    if (b.all || seed === M.SAMPLE_SEED) printBounds(seed, b);
  }
  console.log(`${passing.length} of ${SEEDS.length} seeds meet every bound${arg ? '' : ` (searched ${SEARCHED.range.join(' to ')})`}`);
  if (!arg && !quick) check(passing.join(',') === SEARCHED.passing.join(','), "the recorded search's seeds still meet every bound");
  const chosen = bounds(M.SAMPLE_SEED);
  for (const [k, v] of Object.entries(chosen.ok)) check(v, `SAMPLE_SEED ${M.SAMPLE_SEED} meets the ${k} bound`);
  if (!quick) {
    const scored = passing.map((seed) => ({ seed, ...score(seed) })).sort((a, b) => a.total - b.total);
    for (const r of scored.slice(0, 6)) console.log(`seed ${r.seed}: mean gap ${r.mean.toFixed(3)}, at the experiments ${r.key.toFixed(3)}, worst ${r.worst.toFixed(3)}, score ${r.total.toFixed(3)}`);
    check(scored.length > 0 && scored[0].seed === M.SAMPLE_SEED, `SAMPLE_SEED is the most typical seed that meets every bound (it is ${scored[0]?.seed})`);
  }
  for (const s of [...BUSY_AT, ...ANSWERS.slice(1, 2)]) {
    const m = M.run(s);
    const smp = M.sample(s);
    const st = M.sampleStats(smp);
    console.log(`  ${show(s).padEnd(28)} window: ${smp.reqs.filter((r) => r.arrive >= 0).length} arrivals, busy ${(st.busy * 100).toFixed(1)}% (model ${(m.rho * 100).toFixed(1)}%), waiting ${st.waiting.toFixed(2)} on average (model ${m.waiting.toFixed(2)}), rest ${smp.rest.kind} ${smp.rest.n} at ${smp.rest.t.toFixed(1)} ms`);
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
// The rest moments the stage draws: a queue each shows a line beside an idle server whenever the window has one.
{
  let idle = 0;
  let splits = 0;
  for (const s of ALL) {
    const smp = M.sample(s);
    if (!smp.split) continue;
    splits++;
    if (smp.rest.kind === 'idle') {
      idle++;
      const { lines, busy } = M.linesAt(smp, smp.rest.t);
      check(!busy[smp.rest.idle] && lines[smp.rest.line] === smp.rest.n, `${show(s)}: the rest moment has S${smp.rest.idle + 1} idle beside a line of ${smp.rest.n}`);
    }
  }
  console.log(`  a queue each: ${idle} of ${splits} windows show a line beside an idle server at rest`);
  const pool = M.sample(POOL_SPLIT).rest;
  console.log(`  E3's asking frame: S${pool.idle + 1} idle beside S${pool.line + 1}'s line of ${pool.n} at ${pool.t.toFixed(1)} ms (${pool.total} waiting in all)`);
  check(pool.kind === 'idle' && pool.n >= 5, "E3's asking frame has an idle server beside a line of at least 5");
}
// Unstable windows: the experiments' ramps, and the model's drift line fits the waiting row's scale at every setting.
{
  for (const s of RAMPS) {
    const r = ramp(s);
    console.log(`  ${show(s)}: waiting at 1, 2, 3 and 4 s ${r.at.join(', ')}; the window's most ${r.most}; the model's drift over 4 s ${r.drift}`);
    check(r.ok, `the unstable window ${show(s)} ramps (every second rises, ends at 0.8 of its most, within 25% of the drift)`);
  }
  const SCALES = [2, 5, 10, 20, 50, 100, 200, 500, 1000];
  let unstable = 0;
  for (const s of ALL) {
    const m = M.run(s);
    if (m.stable) continue;
    unstable++;
    const smp = M.sample(s);
    const end = (m.growthPerS * smp.window) / 1000;
    const most = Math.max(...M.waitingSteps(smp).map((p) => p[1]));
    check(SCALES.some((q) => q >= Math.max(end, most)), `${show(s)}: a waiting scale holds the drift line's end ${end} and the sample's ${most}`);
    check(smp.rest.kind === 'longest' || smp.rest.kind === 'most', `${show(s)}: an unstable window rests on its longest queue`);
  }
  console.log(`  ${unstable} unstable settings; the drift line fits every waiting scale`);
}
// The answers' plays: each runs the 200 ms that end at its rest moment, 25x slower; with no steady state, 4 s in real time.
{
  for (const spec of M.EXPERIMENTS.filter((e) => e.act)) {
    const s = { ...spec.setup, ...(spec.act.set ?? {}) };
    const smp = M.sample(s);
    const p = M.playPlan(smp, true);
    console.log(`  ${spec.id}: plays ${p.from.toFixed(1)} to ${p.to.toFixed(1)} ms of ${show(s)} at ${p.rate}x, ${(((p.to - p.from) * p.rate) / 1000).toFixed(1)} s on screen`);
    check(p.to - p.from >= M.ANSWER_SLICE_MS - 1e-9 || !smp.stable, `${spec.id}: the answer plays a full ${M.ANSWER_SLICE_MS} ms`);
  }
}

console.log(`\n${checks} checks, ${failures} failed`);
process.exit(failures ? 1 : 0);
