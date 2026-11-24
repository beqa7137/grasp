// Prints every number the widget and its experiments use, and checks the model (model.js) four ways:
// 1. the formulas against the lesson's own quoted numbers;
// 2. a simulated timeline, second by second, of writes, full backups, archived log segments, an async or sync standby
//    and a delayed replica, struck by a dead disk or a dropped table at every moment of the backup cycle: the data each
//    plan brings back is measured from the copies it holds, and the worst moment is the model's;
// 3. a simulated recovery, second by second: copying the base backup at its speed, replaying the log it needs at the
//    replay speed, promoting a replica, measured until it serves;
// 4. the experiments: digits only in slots, one right answer each, answer positions varied, every word claim of a
//    reveal held by the model, every compared value on the drawn scale, no answer on the load-time stage, and the
//    challenge enumerated over every setting.
// Usage: node enum.cjs [--quiet]
'use strict';
const M = require('./model.js');

const quiet = process.argv.includes('--quiet');
const log = (...a) => quiet || console.log(...a);
let checks = 0;
const failures = [];
function check(ok, what) {
  checks++;
  if (!ok) failures.push(what);
}
const near = (a, b, tol) => Math.abs(a - b) <= tol;

// ---------------------------------------------------------------- 1. the lesson's numbers
{
  const d = M.run(M.BASE);
  log('Default (2 TB, 10 GB/min, full backup every 24 h, log every 60 s, replay 10x, async standby, disks lost):');
  for (const p of M.PLANS) log(`  ${p.padEnd(8)} RPO ${M.formatSpan(d.plans[p].rpoS).padEnd(6)} RTO ${M.formatSpan(d.plans[p].rtoMin * 60)} (${d.plans[p].steps.map((s) => `${s.kind} ${s.min} min`).join(' + ')})`);
  check(d.restoreMin === 200, 'lesson: 2 TB at 10 GB/min restores in 200 minutes');
  check(M.formatSpan(d.plans.full.rtoMin * 60) === '3.3 h', 'lesson: the nightly backup restores in 3.3 h');
  check(d.plans.full.rpoS === 24 * 3600, 'lesson: the nightly backup loses up to 24 h');
  check(d.replayMin === 144, 'lesson: a day of log replays at 10x in 144 minutes');
  check(M.formatSpan(d.plans.pitr.rtoMin * 60) === '5.7 h' && d.plans.pitr.rpoS === 60, 'lesson: point-in-time recovery loses 1 min and takes 5.7 h');
  check(d.plans.standby.rpoS === 5 && d.plans.standby.rtoMin === 1, 'lesson: the async standby loses 5 s and is back in 1 minute');
  const drop = M.run({ ...M.BASE, disaster: M.DROP });
  check(!drop.plans.standby.recovers && drop.plans.pitr.rpoS === 0 && drop.plans.full.rpoS === 86400, 'lesson: after a delete the standby does not recover, PITR loses nothing, the nightly 24 h');
  // Worked example 2: after a drop, restore to the side and copy the rows back; never in place, which would roll back
  // every write since the drop. Every drop recovery ends copying the table back, and none promotes.
  for (const s of M.ALL_SETTINGS.filter((x) => x.disaster === M.DROP)) {
    const P = M.run(s).plans;
    for (const p of ['full', 'pitr', 'delayed']) check(P[p].steps.at(-1).kind === 'copyBack' && !P[p].steps.some((st) => st.kind === 'promote'), `drop: ${p} recovers beside the primary and copies the table back`);
  }
  const ten = M.run({ ...M.BASE, size: 10000 });
  check(M.formatSpan(ten.plans.pitr.rtoMin * 60) === '19.1 h', 'lesson: 10 TB at 10 GB/min recovers in 19.1 h');
  const tenFast = M.run({ ...M.BASE, size: 10000, restore: 50 });
  check(M.formatSpan(tenFast.plans.pitr.rtoMin * 60) === '5.7 h', 'lesson: at 50 GB/min, 10 TB recovers in 5.7 h');
  const tenFastArchive = M.run({ ...M.BASE, size: 10000, restore: 50, archive: 10 });
  check(tenFastArchive.plans.pitr.rpoS === 10 && tenFastArchive.plans.pitr.rtoMin === tenFast.plans.pitr.rtoMin, 'lesson: a 10 s archive cuts the loss to 10 s and leaves the time');
  // Worked example 1 (1,000 GB at 5 GB/min, base backups every 6 h): 200 minutes, then 36 of replay.
  check(1000 / 5 === 200 && (6 * 60) / 10 === 36, 'worked example 1: 200 minutes of restore, 36 of replay with 6-hourly bases');
}

// ---------------------------------------------------------------- 2. a simulated timeline: what each copy holds
// Writes arrive every DT seconds. Full backups run at every multiple of the cycle C; a log segment ships at every
// multiple of A, carrying the writes since the last; the standby applies each write `lag` seconds after it; the
// delayed replica receives each write LAG_S after it and applies it DELAY_H later. The disaster strikes at T, any
// moment of the cycle; a drop is a write at T that every copy that has applied it carries.
const DT = 0.5;
function holdings(base, archive, sync, T) {
  const C = base * 3600;
  const lag = sync ? 0 : M.LAG_S;
  let lastFull = null;
  let archived = null;
  let standby = null;
  let delayedRecv = null;
  // Step through time: each copy's latest write is updated as events happen, never computed from a formula.
  for (let t = 0; t < T; t += DT) {
    if (Math.abs(t / C - Math.round(t / C)) < 1e-9) lastFull = t; // a full backup holds every write up to t
    if (t > 0 && Math.abs(t / archive - Math.round(t / archive)) < 1e-9) archived = t; // a segment ships
    if (t - lag >= 0) standby = t - lag; // the write made at t - lag reaches the standby now
    if (t - M.LAG_S >= 0) delayedRecv = t - M.LAG_S;
  }
  const latestWrite = Math.ceil(T / DT) * DT - DT; // the last write before T
  return { lastFull, archived, standby, delayedRecv, latestWrite, lag };
}
/** Seconds of writes lost, measured from what the copies hold at T; Infinity if the copy carries the drop. */
function simulatedLoss(plan, disaster, h, T) {
  const drop = disaster === M.DROP;
  if (plan === 'full') return T - h.lastFull;
  if (plan === 'pitr') return drop ? T - h.latestWrite - DT + DT : T - (h.archived ?? h.lastFull); // replay stops at the last write before the drop
  if (plan === 'standby') return drop ? Infinity : h.lag === 0 ? T - h.latestWrite - DT + DT : T - h.standby;
  // The delayed replica: after a dead disk it applies all it received; after a drop it stops just before it.
  return drop ? T - h.latestWrite - DT + DT : T - h.delayedRecv;
}
{
  let worstChecked = 0;
  for (const base of M.BASE_EVERY_H)
    for (const archive of M.ARCHIVE_EVERY_S)
      for (const sync of M.SYNC)
        for (const disaster of M.DISASTERS) {
          const C = base * 3600;
          const model = M.run({ ...M.BASE, base, archive, sync, disaster }).plans;
          // Every moment of the cycle, on a grid fine enough to land just before each archive tick, and the worst moment.
          const moments = [];
          for (let T = archive - 0.01; T < C; T += archive * Math.max(1, Math.round(C / archive / 40))) moments.push(T);
          moments.push(C - 0.01);
          const worst = {};
          for (const T of moments) {
            const h = holdings(base, archive, sync, T);
            for (const p of M.PLANS) worst[p] = Math.max(worst[p] ?? 0, simulatedLoss(p, disaster, h, T));
          }
          for (const p of M.PLANS) {
            const want = model[p].rpoS;
            const got = worst[p];
            const ok = want === Infinity ? got === Infinity : near(got, want, DT + 0.02);
            check(ok, `timeline: ${p} after ${disaster ? 'a drop' : 'a dead disk'} (base ${base} h, archive ${archive} s, sync ${sync}): simulated worst loss ${got.toFixed(2)} s, model ${want} s`);
            worstChecked++;
          }
        }
  log(`\nTimeline: ${worstChecked} plan losses, each the worst over the backup cycle, match the model within ${DT} s.`);
}

// ---------------------------------------------------------------- 3. a simulated recovery: time to serve again
function simulatedRecovery(plan, s) {
  const C = s.base * 3600;
  const drop = s.disaster === M.DROP;
  const T = C - 0.01;
  const h = holdings(s.base, s.archive, s.sync, T);
  if (plan === 'standby' && drop) return Infinity;
  let t = 0;
  const step = 1;
  if (plan === 'full' || plan === 'pitr') {
    let copied = 0; // GB
    while (copied < s.size - 1e-9) {
      copied += (s.restore / 60) * step;
      t += step;
    }
    if (plan === 'full') return t / 60 + (drop ? M.COPY_BACK_MIN : 0);
    // Replay every write from the base backup to the target: the last archived segment, or just before the drop.
    const target = drop ? T : h.archived;
    let replayed = 0;
    const backlog = target - h.lastFull;
    while (replayed < backlog - 1e-9) {
      replayed += s.replay * step;
      t += step;
    }
    return t / 60 + (drop ? M.COPY_BACK_MIN : 0);
  }
  if (plan === 'delayed') {
    // Its delay counts from the primary's commit time (Postgres's recovery_min_apply_delay, MySQL's SOURCE_DELAY):
    // applied up to an hour before the disaster; it replays up to what it received, or to just before the drop.
    const applied = T - M.DELAY_H * 3600;
    const target = drop ? T : h.delayedRecv;
    let replayed = 0;
    while (replayed < target - applied - 1e-9) {
      replayed += s.replay * step;
      t += step;
    }
    // After a drop it is paused and the table copied back; after a dead disk it is promoted.
    return (t + (drop ? M.COPY_BACK_MIN : M.PROMOTE_MIN) * 60) / 60;
  }
  return (t + M.PROMOTE_MIN * 60) / 60;
}
{
  const seen = new Set();
  let n = 0;
  let worstGap = 0;
  for (const s of M.ALL_SETTINGS) {
    const key = `${s.disaster}${s.size}${s.restore}${s.base}${s.replay}${s.archive}`;
    if (seen.has(key) || s.sync) continue;
    seen.add(key);
    const model = M.run(s).plans;
    for (const p of M.PLANS) {
      const got = simulatedRecovery(p, s);
      const want = model[p].rtoMin;
      // The model replays the whole cycle or the whole hour; a dead disk's replay stops at the last segment archived or
      // received, `archive` or 5 s short, so the model is over the simulation by at most that log's replay.
      const tol = p === 'pitr' ? s.archive / s.replay / 60 + 0.02 : p === 'delayed' ? M.LAG_S / s.replay / 60 + 0.02 : 0.02;
      const ok = want === Infinity ? got === Infinity : got <= want + 0.02 && near(got, want, tol);
      if (want !== Infinity) worstGap = Math.max(worstGap, Math.abs(got - want));
      check(ok, `recovery: ${p} at ${JSON.stringify(s)}: simulated ${got.toFixed(3)} min, model ${want} min`);
      n++;
    }
  }
  log(`Recovery: ${n} recoveries simulated second by second; the model is never under the simulation and at most ${worstGap.toFixed(2)} min over it (it rounds the replay up to the whole cycle).`);
  // The printed span agrees with the simulation wherever the span is rounded (the shown figure, not the exact one).
  let shown = 0;
  for (const s of M.ALL_SETTINGS.filter((x) => !x.sync && x.archive === 60)) {
    const model = M.run(s).plans;
    for (const p of M.PLANS) {
      if (!model[p].recovers) continue;
      const sim = simulatedRecovery(p, s);
      check(M.formatSpan(model[p].rtoMin * 60) === M.formatSpan(Math.round(sim * 60)) || Math.abs(sim - model[p].rtoMin) < 0.2, `shown RTO for ${p}`);
      shown++;
    }
  }
  log(`Shown recovery times: ${shown} agree with the simulated ones as printed.`);
}

// ---------------------------------------------------------------- the scales hold every value
{
  let maxRto = 0;
  let maxRpo = 0;
  let minRto = Infinity;
  for (const s of M.ALL_SETTINGS) {
    const m = M.run(s);
    for (const p of M.PLANS) {
      if (!m.plans[p].recovers) continue;
      maxRto = Math.max(maxRto, m.plans[p].rtoMin);
      minRto = Math.min(minRto, m.plans[p].rtoMin);
      maxRpo = Math.max(maxRpo, m.plans[p].rpoS);
      // Every printed span is a whole minute or second: the ledgers add up as printed.
      for (const st of m.plans[p].steps) check(Number.isInteger(st.min), `a step of ${st.min} min is not whole (${JSON.stringify(s)})`);
    }
    check(m.fullsH.length <= 24 && m.fullsH.at(-1) <= 24, 'at most 24 full backups in the day drawn');
  }
  check(maxRto <= M.AFTER_AXIS_H * 60, `the after axis holds every recovery time (max ${maxRto} min)`);
  check(maxRpo <= M.BEFORE_AXIS.maxS, `the before axis holds every recovery point (max ${maxRpo} s)`);
  log(`\nScales: recovery times ${minRto} min to ${M.formatSpan(maxRto * 60)} (axis 24 h); recovery points up to ${M.formatSpan(maxRpo)} (axis 24 h). ${M.ALL_SETTINGS.length} settings.`);
  // The after axis is linear: within every bar, a step's width over its minutes is the same, at every setting.
  const w = 1000;
  for (const s of M.ALL_SETTINGS) {
    const P = M.run(s).plans;
    for (const p of M.PLANS) {
      let t = 0;
      for (const st of P[p].steps) {
        const per = (M.afterX(t + st.min, 0, w) - M.afterX(t, 0, w)) / st.min;
        check(near(per, w / (24 * 60), 1e-9), `a ${st.kind} step of ${p} drawn at its own scale`);
        t += st.min;
      }
    }
  }
  check(M.afterX(24 * 60, 0, w) === w && M.beforeX(86400, 0, w, 10) === 0 && M.beforeX(1, 0, w, 10) === w - 10, 'the axes span their boxes');
  check(M.insetX(M.INSET_MIN, 0, w) === w && M.insetX(60, 0, w) < w && M.insetX(600, 0, w) === w, 'the inset holds the first 90 min and the 1 h goal inside it');
}

// ---------------------------------------------------------------- 4. the experiments
{
  const B = M.BASE;
  const positions = [];
  log('\nExperiments:');
  for (const spec of M.EXPERIMENTS) {
    const e = M.renderExperiment(spec);
    log(`\n[${spec.id}] ${e.title}\n  ask: ${e.ask}`);
    e.choices.forEach((c, i) => log(`  ${i === e.answer ? '*' : ' '} ${c}`));
    log(`  reveal: ${e.reveal}`);
    for (const t of [spec.title, spec.ask, spec.reveal, ...(spec.choices ?? []).map((c) => c.text)]) {
      const stray = M.strayDigits(t);
      check(stray.length === 0, `${spec.id}: digits outside a slot: ${stray.join(', ')} in "${t.slice(0, 50)}"`);
    }
    for (const t of [e.ask, e.reveal, ...e.choices]) {
      check(!/—| /.test(t), `${spec.id}: an em dash or a non-breaking space`);
      check(!/NaN|Infinity|undefined/.test(t), `${spec.id}: NaN or Infinity in "${t.slice(0, 40)}"`);
      check(e.choices.includes(t) || !/(^|[.?!] )\d/.test(t), `${spec.id}: a sentence opens on a numeral in "${t.slice(0, 60)}"`);
      check(!/\d{4,}/.test(t), `${spec.id}: a number with no thousands separator`);
    }
    if (spec.choices) positions.push(e.answer + 1);
    // Every time an experiment compares lies on the drawn scales.
    for (const [k, v] of Object.entries(e.slots)) {
      if (v.unit === 'span') check(v.value <= 24 * 3600, `${spec.id}: ${k} = ${M.formatSlot(v)} is off the 24 h scales`);
      if (v.unit === 'min') check(v.value <= 24 * 60, `${spec.id}: ${k} off the scale`);
    }
  }
  log(`\nAnswer positions: ${positions.join(', ')}`);
  check(positions.join() === '3,2,1,3,1', 'answer positions 3, 2, 1, 3, 1');
  check(new Set(positions).size === 3, 'every position is used');

  const run = M.run;
  const E = Object.fromEntries(M.EXPERIMENTS.map((s) => [s.id, s]));
  // E1: the standby cannot bring the table back; PITR loses nothing; the delayed replica still holds the table.
  {
    const m = run(E['replica-drop'].setup);
    check(!m.plans.standby.recovers && m.plans.pitr.rpoS === 0 && m.plans.delayed.recovers && m.plans.delayed.rpoS === 0, 'E1: the standby loses the table, PITR and the delayed replica do not');
  }
  // E2: the three choices are restore only, restore + replay, restore + replay at 1x; all distinct, on the scale.
  {
    const s = E['pitr-time'].slots();
    check(new Set([s.restoreOnly, s.answer, s.dayLog].map(M.formatSlot)).size === 3, 'E2: three distinct times');
    check(s.restoreOnly.value < s.answer.value && s.answer.value < s.dayLog.value, 'E2: the answer is the middle number');
    check(M.formatSlot(s.dayLog) === '8.1 h', `E2: a day of log after the restore is 8.1 h (${M.formatSlot(s.dayLog)})`);
    check(s.restoreMin.value + s.replayMin.value === s.totalMin.value, 'E2: the reveal adds up');
    const asked = M.formatSlot(s.answer);
    check(asked === '4.5 h', `E2: the answer is 4.5 h (${asked})`);
  }
  // E3: "as before": the recovery time does not move with the archive interval; the loss does.
  {
    const a = run({ ...B, archive: 10 });
    const b = run(B);
    check(a.plans.pitr.rtoMin === b.plans.pitr.rtoMin && a.plans.pitr.rpoS === 10, 'E3: only the loss changes');
    for (const s of M.ALL_SETTINGS) {
      const t = run({ ...s, archive: 10 });
      const u = run({ ...s, archive: 300 });
      check(t.plans.pitr.rtoMin === u.plans.pitr.rtoMin, 'E3 by rule: the archive interval never moves the recovery time');
    }
  }
  // E4: by rule, size moves exactly the two restores, never the replay or the replicas.
  for (const s of M.ALL_SETTINGS) {
    const a = run({ ...s, size: 500 });
    const b = run({ ...s, size: 10000 });
    check(b.plans.full.rtoMin > a.plans.full.rtoMin && b.plans.pitr.rtoMin > a.plans.pitr.rtoMin, 'E4 by rule: the restores grow');
    check(b.plans.standby.rtoMin === a.plans.standby.rtoMin && b.plans.delayed.rtoMin === a.plans.delayed.rtoMin && b.replayMin === a.replayMin, 'E4 by rule: the replicas and the replay do not');
  }
  // E5: "at most 1 h of log"; the wait-out distractor is longer; the answer differs from E1's reveal-time 7 min.
  {
    const m = run(E.delayed.setup);
    check(m.plans.delayed.rtoMin === 13 && m.plans.delayed.rpoS === 0, 'E5: 13 min, nothing lost');
    const sl = E.delayed.slots();
    check(sl.waitOut.value > sl.answer.value && M.formatSlot(sl.waitOut) !== M.formatSlot(sl.answer), 'E5: waiting out the hour is later than the earliest');
    check(/at the earliest/.test(M.renderExperiment(E.delayed).ask), 'E5 asks for the earliest time, so one choice is right');
    check(M.formatSpan(m.plans.delayed.rtoMin * 60) !== M.formatSpan(run(E['replica-drop'].setup).plans.delayed.rtoMin * 60), "E5's answer is not on E1's revealed stage");
  }
  // After a drop the primary keeps serving: no drop sentence says a plan serves again, is promoted, or is "back in"
  // without the table (worked example 2: restore to the side, copy the table back).
  {
    const dropRule = (t) => t.split(/(?<=[.?!])\s+|;\s+/).filter((x) => /serve again|serves again|promote|back in/i.test(x) && !/table/.test(x));
    for (const id of ['replica-drop', 'delayed']) {
      const e = M.renderExperiment(E[id]);
      for (const t of [e.ask, e.reveal, ...e.choices]) for (const bad of dropRule(t)) check(false, `${id}: a drop sentence without the table: "${bad}"`);
      checks++;
    }
  }
  // No asked answer is printed on the stage a learner sees on load (the default, a dead disk).
  {
    const d = run(B);
    const shown = new Set();
    for (const p of M.PLANS) {
      shown.add(`loses ${M.formatSpan(d.plans[p].rpoS)}`);
      shown.add(`back in ${M.formatSpan(d.plans[p].rtoMin * 60)}`);
    }
    const asked = [
      'cannot bring it back',
      `back in ${M.formatSlot(E['pitr-time'].slots().answer)}`,
      `loses ${M.formatSlot(E.archive.slots().rpoAfter)}`,
      `back in ${M.formatSlot(E.growth.slots().fullAfter)}`,
      `back in ${M.formatSlot(E.growth.slots().pitrAfter)}`,
      `back in ${M.formatSlot(E.delayed.slots().answer)}`,
    ];
    for (const a of asked) check(!shown.has(a), `the load-time stage prints the answer "${a}"`);
    log(`Asked answers, none on the load-time stage: ${asked.join('; ')}`);
  }
  // The challenge: every setting, then the PITR configurations it may tune.
  {
    const spec = E.meet;
    const pass = M.ALL_SETTINGS.filter((s) => M.goalMet(spec.goal, s, run(s).metrics));
    const configs = new Set(pass.map((s) => `${s.restore}/${s.base}/${s.replay}`));
    const archives = new Set(pass.map((s) => s.archive));
    log(`\nChallenge: ${pass.length} of ${M.ALL_SETTINGS.length} settings pass, ${configs.size} restore/base/replay triple: ${[...configs].join(', ')} (restore GB/min / base h / replay x), at archives ${[...archives].join(' and ')} s.`);
    check(configs.size === 1 && configs.has('50/6/20'), 'the challenge passes at exactly one restore, base and replay triple');
    check([...archives].sort((a, b) => a - b).join() === '10,60', 'the RPO bound passes the 10 s and 1 min archives, not 5 min');
    check(!M.goalMet(spec.goal, { ...spec.setup, ...M.CHALLENGE_SOLUTION, archive: 300 }, run({ ...spec.setup, ...M.CHALLENGE_SOLUTION, archive: 300 }).metrics), 'a 5 min archive misses the RPO');
    check(!M.goalMet(spec.goal, spec.setup, run(spec.setup).metrics), 'the challenge does not start met');
    log('  restore  base  replay  PITR RTO');
    for (const restore of M.RESTORE_GB_PER_MIN)
      for (const base of M.BASE_EVERY_H)
        for (const replay of M.REPLAY_SPEEDS) {
          const s = { ...spec.setup, restore, base, replay };
          const m = run(s);
          log(`  ${String(restore).padStart(7)} ${String(base).padStart(5)} ${String(replay).padStart(7)}  ${String(m.plans.pitr.rtoMin).padStart(5)} min${M.goalMet(spec.goal, s, m.metrics) ? '  passes' : base < 6 ? '  (base too often)' : ''}`);
        }
    const sol = run({ ...spec.setup, ...M.CHALLENGE_SOLUTION });
    check(sol.plans.pitr.rtoMin === 58, 'the solution serves in 58 min');
    check(!M.goalMet(spec.goal, { ...spec.setup, ...M.CHALLENGE_SOLUTION, disaster: M.DROP }, run({ ...spec.setup, ...M.CHALLENGE_SOLUTION, disaster: M.DROP }).metrics), 'the goal keeps the dead disk: after a drop the archive sets no loss');
    check(run({ ...spec.setup, ...M.CHALLENGE_SOLUTION, replay: 10 }).plans.pitr.rtoMin >= 60, 'reveal: at 10x it misses the hour');
    check(run({ ...spec.setup, ...M.CHALLENGE_SOLUTION, base: 1, replay: 10 }).plans.pitr.rtoMin < 60, 'reveal: hourly full backups would make it');
    const bigBest = Math.min(...M.ALL_SETTINGS.filter((s) => s.size === 10000).map((s) => run(s).plans.pitr.rtoMin));
    check(bigBest > 60, `reveal: at 10 TB nothing meets the hour (best ${bigBest} min)`);
    const delayedBig = run({ ...spec.setup, size: 10000 }).plans.delayed;
    check(delayedBig.rtoMin < 60 && delayedBig.rpoS <= 60, 'the delayed replica meets both at 10 TB (the interview answer)');
  }
}

log(`\n${checks} checks, ${failures.length} failed.`);
for (const f of failures.slice(0, 30)) console.log(`  FAIL ${f}`);
process.exit(failures.length ? 1 : 0);
