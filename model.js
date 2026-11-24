// The Backups & Recovery widget's model (`recovery`), ported 1:1 to libs/engine/src/sysdesign/lessons/widgets/recovery.ts
// and recovery-experiments.ts. A schematic, worst-case model: one database, four recovery plans, one disaster that
// strikes at the worst moment of the backup cycle (just before the next full backup runs and just before the next log
// segment ships). Every number the widget prints comes from here; enum.cjs checks it against a simulated timeline.
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- the settings
  const DISK = 0;
  const DROP = 1;
  /** Disks lost, or a table dropped by mistake. */
  const DISASTERS = [DISK, DROP];
  /** The database, in GB. */
  const SIZES_GB = [500, 2000, 10000];
  /** How fast a restore copies the base backup back, GB a minute. */
  const RESTORE_GB_PER_MIN = [10, 25, 50];
  /** A full (base) backup every so many hours. */
  const BASE_EVERY_H = [24, 6, 1];
  /** A log segment (WAL, binlog) shipped to the archive every so many seconds. */
  const ARCHIVE_EVERY_S = [10, 60, 300];
  /** Log replay runs this many times as fast as the writes came in. */
  const REPLAY_SPEEDS = [5, 10, 20];
  /** The standby: asynchronous (it runs LAG_S behind) or synchronous (the primary waits for it). */
  const SYNC = [0, 1];

  /** An async standby's fixed replication lag, and the delayed replica's (it receives the log the same way). */
  const LAG_S = 5;
  /** Promoting a standby or a replica to primary takes a fixed minute. */
  const PROMOTE_MIN = 1;
  /** After a drop the primary keeps serving: a plan recovers to the side and copies the table back, a fixed minute. */
  const COPY_BACK_MIN = 1;
  /** The delayed replica applies the log this many hours after it arrives. */
  const DELAY_H = 1;

  const BASE = { disaster: DISK, size: 2000, restore: 10, base: 24, archive: 60, replay: 10, sync: 0 };
  const PLANS = ['full', 'pitr', 'standby', 'delayed'];

  /** The fixed axes. Before the disaster: seconds, log scale, 1 s to 24 h. After it: 0 to 24 h, linear, so every
   *  step's length is proportional to its minutes; the inset under it redraws the first INSET_MIN minutes, linear. */
  const BEFORE_AXIS = { minS: 1, maxS: 24 * 3600 };
  const AFTER_AXIS_H = 24;
  const INSET_MIN = 90;

  // ---------------------------------------------------------------- the model
  /**
   * Each plan's worst-case recovery point (seconds of writes lost, Infinity when it cannot bring the data back) and
   * recovery time (minutes until the database serves again, or after a drop until the table is back), with the steps
   * the time is made of. After a drop the primary keeps serving: every plan restores or rolls forward beside it and
   * copies the table back, because recovering in place would throw away every write made since the drop.
   */
  function plans(s) {
    const restoreMin = s.size / s.restore;
    const logH = s.base; // the log written since the last base backup, at the worst moment: a whole cycle
    const replayMin = (logH * 60) / s.replay;
    const delayedReplayMin = (DELAY_H * 60) / s.replay;
    const drop = s.disaster === DROP;
    const lag = s.sync ? 0 : LAG_S;
    const copyBack = drop ? [{ kind: 'copyBack', min: COPY_BACK_MIN }] : [];
    const full = {
      recovers: true,
      rpoS: s.base * 3600,
      steps: [{ kind: 'restore', min: restoreMin }, ...copyBack],
    };
    const pitr = {
      recovers: true,
      // A dead disk takes the log segment not yet shipped; a drop is replayed up to just before it.
      rpoS: drop ? 0 : s.archive,
      logH,
      steps: [
        { kind: 'restore', min: restoreMin },
        { kind: 'replay', min: replayMin },
        ...copyBack,
      ],
    };
    const standby = drop
      ? { recovers: false, rpoS: Infinity, lagS: lag, steps: [] }
      : { recovers: true, rpoS: lag, lagS: lag, steps: [{ kind: 'promote', min: PROMOTE_MIN }] };
    // The delayed replica holds the drop in its received log for DELAY_H: paused in time, it rolls forward to just
    // before it and the table is copied back. After a dead disk it applies the hour it holds, then is promoted.
    const delayed = {
      recovers: true,
      rpoS: drop ? 0 : LAG_S,
      lagS: LAG_S,
      steps: [{ kind: 'replay', min: delayedReplayMin }, drop ? { kind: 'copyBack', min: COPY_BACK_MIN } : { kind: 'promote', min: PROMOTE_MIN }],
    };
    const out = { full, pitr, standby, delayed };
    for (const p of PLANS) out[p].rtoMin = out[p].recovers ? out[p].steps.reduce((t, x) => t + x.min, 0) : Infinity;
    return out;
  }

  function scenario(settings) {
    const s = { ...BASE, ...settings };
    const p = plans(s);
    const finite = PLANS.filter((k) => p[k].recovers).map((k) => p[k].rtoMin);
    return {
      settings: s,
      plans: p,
      restoreMin: s.size / s.restore,
      replayMin: (s.base * 60) / s.replay,
      delayedReplayMin: (DELAY_H * 60) / s.replay,
      /** The full backups taken in the day before the disaster, newest first, in hours before it. */
      fullsH: Array.from({ length: Math.floor(24 / s.base) }, (_, k) => (k + 1) * s.base),
      lastRtoMin: Math.max(...finite),
      metrics: { pitrRto: p.pitr.rtoMin, pitrRpo: p.pitr.rpoS, base: s.base, size: s.size, archive: s.archive },
    };
  }
  const run = scenario;

  const ALL_SETTINGS = [];
  for (const disaster of DISASTERS)
    for (const size of SIZES_GB)
      for (const restore of RESTORE_GB_PER_MIN)
        for (const base of BASE_EVERY_H)
          for (const archive of ARCHIVE_EVERY_S)
            for (const replay of REPLAY_SPEEDS) for (const sync of SYNC) ALL_SETTINGS.push({ disaster, size, restore, base, archive, replay, sync });

  // ---------------------------------------------------------------- the scales
  /** Before the disaster: 0 at `x1` (the disaster), 1 s to 24 h on a log scale from `x1 - gap` back to `x0`. */
  function beforeX(sec, x0, x1, gap) {
    if (sec <= 0) return x1;
    const f = Math.log(sec / BEFORE_AXIS.minS) / Math.log(BEFORE_AXIS.maxS / BEFORE_AXIS.minS);
    return x1 - gap - f * (x1 - gap - x0);
  }
  /** After the disaster: 0 to 24 h, linear. */
  const afterX = (min, x0, x1) => x0 + ((x1 - x0) * min) / (AFTER_AXIS_H * 60);
  /** The inset: 0 to INSET_MIN minutes, linear; a later time is clamped to its right end. */
  const insetX = (min, x0, x1) => x0 + ((x1 - x0) * Math.min(min, INSET_MIN)) / INSET_MIN;

  // ---------------------------------------------------------------- formatting
  const trim = (v, d) => String(Number(v.toFixed(d)));
  const group = (v) => new Intl.NumberFormat('en-US').format(Math.round(v));
  /** A span of time: seconds under a minute, whole hours as hours, minutes under 100, then hours to a tenth. */
  const formatSpan = (sec) => {
    if (sec < 60) return `${trim(sec, 0)} s`;
    if (sec % 3600 === 0) return `${group(sec / 3600)} h`;
    if (sec < 100 * 60) return `${group(sec / 60)} min`;
    return `${trim(sec / 3600, 1)} h`;
  };
  /** Minutes in a ledger: whole minutes, grouped. */
  const formatMin = (min) => `${group(min)} min`;
  const formatSize = (gb) => (gb >= 1000 ? `${trim(gb / 1000, 1)} TB` : `${group(gb)} GB`);
  const formatSpeed = (gbPerMin) => `${group(gbPerMin)} GB/min`;
  const formatTimes = (v) => `${group(v)}×`;
  const formatNum = (v) => group(v);
  const FORMAT = { span: formatSpan, min: formatMin, size: formatSize, speed: formatSpeed, times: formatTimes, num: formatNum };
  const formatSlot = (slot) => (slot.unit === 'word' ? slot.value : FORMAT[slot.unit](slot.value));
  const slotOf = (unit) => (value) => ({ value, unit });
  const word = (value) => ({ value, unit: 'word' });
  const span = slotOf('span');
  const mins = slotOf('min');
  const size = slotOf('size');
  const speed = slotOf('speed');
  const times = slotOf('times');
  const num = slotOf('num');
  /** A recovery time in minutes, said as a span. */
  const rto = (min) => span(min * 60);
  function fillTemplate(t, slots) {
    return t.replace(/\{(\w+)\}/g, (_, k) => {
      if (!slots[k]) throw new Error(`No slot "${k}" for "${t}"`);
      return formatSlot(slots[k]);
    });
  }
  /** Digits a template may carry outside a slot (none: this widget's templates are digit-free). */
  const ALLOWED = [];
  function strayDigits(t) {
    let rest = t.replace(/\{\w+\}/g, '');
    for (const p of ALLOWED) rest = rest.split(p).join('');
    return rest.match(/\d+/g) ?? [];
  }

  // ---------------------------------------------------------------- experiments
  const SETUP = {
    // E1 and E5 ask about a dropped table; the stage a learner sees on load shows a dead disk. E2 asks at settings the
    // load-time stage does not show, so it never prints an answer (enum.cjs and the mockup's rest sweep check it).
    replicaDrop: { ...BASE, disaster: DROP },
    pitrTime: { ...BASE, size: 10000, restore: 50, base: 6, replay: 5 },
    archive: { ...BASE },
    growth: { ...BASE },
    delayed: { ...BASE, disaster: DROP, replay: 5 },
    challenge: { ...BASE },
  };
  const CHALLENGE_BOUNDS = { pitrRpo: 60, pitrRto: 60, base: 6 };
  const CHALLENGE_GOAL = {
    all: [
      { metric: 'pitrRpo', atMost: CHALLENGE_BOUNDS.pitrRpo },
      { metric: 'pitrRto', below: CHALLENGE_BOUNDS.pitrRto },
      { metric: 'base', atLeast: CHALLENGE_BOUNDS.base },
    ],
    keep: { size: 2000, disaster: DISK },
  };
  const CHALLENGE_SOLUTION = { restore: 50, base: 6, replay: 20 };
  const BIG_SIZE = 10000;
  const FAST_ARCHIVE = 10;

  const EXPERIMENTS = [
    {
      id: 'replica-drop',
      title: 'A replica is not a backup',
      setup: SETUP.replicaDrop,
      act: { run: 'recover' },
      ask: 'Just before the nightly full backup, someone drops the orders table. The standby applies every change {lag} after the primary does. What can the standby bring back?',
      choices: [
        { text: 'The table as it was {lag} before the drop: it runs {lag} behind', value: 'before' },
        { text: 'Everything but the last {lag} of writes, as after a dead disk', value: 'lastLag' },
        { text: 'Nothing: it applies the drop {lag} after the primary does', value: 'nothing' },
      ],
      truth: 'outcome',
      reveal:
        'Nothing: a standby copies every change within seconds, the drop included, so {lag} after the primary loses the table, the standby loses it too. A replica protects against losing a machine, not against losing the data: a bad migration or ransomware reaches it the same way. Point-in-time recovery, restored beside the primary, stops just before the drop and loses nothing, but gets the table back only in {pitrRto}. The delayed replica, which applies the log {delay} behind, still holds the table. So keep backups immutable in another account, retained long enough to reach back before a mistake noticed weeks later.',
      focus: ['a-standby', 'b-standby'],
      hide: ['replicasDrop'],
      slots: () => {
        const m = run(SETUP.replicaDrop);
        return {
          lag: span(LAG_S),
          delay: span(DELAY_H * 3600),
          pitrRto: rto(m.plans.pitr.rtoMin),
          outcome: word(m.plans.standby.recovers ? 'lastLag' : 'nothing'),
          before: word('before'),
          lastLag: word('lastLag'),
          nothing: word('nothing'),
        };
      },
    },
    {
      id: 'pitr-time',
      title: 'Restore, then replay',
      setup: SETUP.pitrTime,
      act: { run: 'recover' },
      ask: 'A {size} database restores at {speed}. A full base backup runs every {base}, the log is archived every {archive}, and replay runs {replay} as fast as the writes came in. The disks fail just before the next base backup. How long until point-in-time recovery serves again?',
      choices: [
        { text: '{restoreOnly}: the restore, since the log replays while the backup copies', value: 'restoreOnly' },
        { text: '{answer}: the restore, then {base} of log at {replay}', value: 'answer' },
        { text: "{dayLog}: the restore, then the day's {day} of log at {replay}", value: 'dayLog' },
      ],
      truth: 'answer',
      reveal:
        'Replay can start only once the restore is done, and it must apply every change since the base backup: {restoreMin} to copy {size} at {speed}, then {base} of log at {replay}, {replayMin}, so {totalMin} in all, {answer}. The size and the restore speed set the first term. The second is the log since the newest base backup, {base} here and not the whole day, at the replay speed. Only the last {archive} of writes, not yet archived, is lost.',
      focus: ['b-pitr', 'a-pitr'],
      hide: ['pitrTime'],
      slots: () => {
        const m = run(SETUP.pitrTime);
        const s = m.settings;
        return {
          size: size(s.size),
          speed: speed(s.restore),
          base: span(s.base * 3600),
          archive: span(s.archive),
          replay: times(s.replay),
          restoreOnly: rto(m.restoreMin),
          answer: rto(m.plans.pitr.rtoMin),
          dayLog: rto(m.restoreMin + (24 * 60) / s.replay),
          day: span(24 * 3600),
          restoreMin: mins(m.restoreMin),
          replayMin: mins(m.replayMin),
          totalMin: mins(m.plans.pitr.rtoMin),
        };
      },
    },
    {
      id: 'archive',
      title: 'Archive more often',
      setup: SETUP.archive,
      act: { set: { archive: FAST_ARCHIVE }, run: 'recover' },
      ask: 'Point-in-time recovery here loses up to {rpoBefore} of writes and serves again in {rtoBefore}. Archive the log every {archiveAfter} instead. What changes?',
      choices: [
        { text: 'Only the loss, to {rpoAfter}: the replay still starts at the base backup', value: 'rpo' },
        { text: 'Both: {rpoAfter} lost, and smaller pieces of log replay sooner', value: 'both' },
        { text: 'Neither: the full backups set how much is lost', value: 'neither' },
      ],
      truth: 'outcome',
      reveal:
        'Only the loss: {rpoAfter} instead of {rpoBefore}. The archive interval is how much log a dead disk can take with it. Recovery still restores the base backup and replays all {logH} of log since it, cut into more pieces but no shorter, so it serves again in {rtoAfter} as before. Archiving more often costs more stored objects and requests; streaming the log as it is written takes the loss to about a second.',
      focus: ['a-pitr', 'b-pitr'],
      hide: ['pitrAfter'],
      slots: () => {
        const m = run(SETUP.archive);
        const a = run({ ...SETUP.archive, archive: FAST_ARCHIVE });
        const changed = (k) => (a.plans.pitr[k] !== m.plans.pitr[k] ? 1 : 0);
        const outcome = changed('rpoS') && changed('rtoMin') ? 'both' : changed('rpoS') ? 'rpo' : 'neither';
        return {
          rpoBefore: span(m.plans.pitr.rpoS),
          rtoBefore: rto(m.plans.pitr.rtoMin),
          archiveAfter: span(FAST_ARCHIVE),
          rpoAfter: span(a.plans.pitr.rpoS),
          rtoAfter: rto(a.plans.pitr.rtoMin),
          logH: span(a.plans.pitr.logH * 3600),
          outcome: word(outcome),
          rpo: word('rpo'),
          both: word('both'),
          neither: word('neither'),
        };
      },
    },
    {
      id: 'growth',
      title: 'Five times the data',
      setup: SETUP.growth,
      act: { set: { size: BIG_SIZE }, run: 'recover' },
      ask: 'The database grows from {sizeBefore} to {sizeAfter}, with the same backups, standbys, restore speed and replay. Whose recovery time grows?',
      choices: [
        { text: "Every plan's: there is five times the data to bring back", value: 'all' },
        { text: "Only point-in-time recovery's: five times the log to replay", value: 'pitr' },
        { text: 'The two that restore a backup: they copy every byte back', value: 'restore' },
      ],
      truth: 'outcome',
      reveal:
        'The two that restore a backup: full backups go from {fullBefore} to {fullAfter} and point-in-time recovery from {pitrBefore} to {pitrAfter}, because copying {sizeAfter} at {speed} takes {restoreAfter}. The log to replay is the writes since the base backup, which do not grow with the size, and the standbys already hold every byte: they serve again in {standby} and {delayed} as before. A large database restores faster from a volume snapshot, back in minutes though slow until its blocks load, or fails over to a replica.',
      focus: ['b-all'],
      hide: ['rtoAfter'],
      slots: () => {
        const m = run(SETUP.growth);
        const a = run({ ...SETUP.growth, size: BIG_SIZE });
        const grew = PLANS.filter((p) => a.plans[p].rtoMin > m.plans[p].rtoMin);
        const outcome = grew.length === 4 ? 'all' : grew.join() === 'pitr' ? 'pitr' : grew.join() === 'full,pitr' ? 'restore' : 'other';
        return {
          sizeBefore: size(m.settings.size),
          sizeAfter: size(BIG_SIZE),
          speed: speed(m.settings.restore),
          fullBefore: rto(m.plans.full.rtoMin),
          fullAfter: rto(a.plans.full.rtoMin),
          pitrBefore: rto(m.plans.pitr.rtoMin),
          pitrAfter: rto(a.plans.pitr.rtoMin),
          restoreAfter: rto(a.restoreMin),
          standby: rto(a.plans.standby.rtoMin),
          delayed: rto(a.plans.delayed.rtoMin),
          outcome: word(outcome),
          all: word('all'),
          pitr: word('pitr'),
          restore: word('restore'),
        };
      },
    },
    {
      id: 'delayed',
      title: 'A replica an hour behind',
      setup: SETUP.delayed,
      act: { run: 'recover' },
      ask: 'Someone drops a table just before the nightly backup and notices within minutes. A delayed replica receives the log {lag} after the primary writes it but applies it only {delay} later, and its replay runs {replay} as fast as the writes came in. How soon can it give the table back, at the earliest, and how much is lost?',
      choices: [
        { text: '{answer}, nothing lost: pause it before it applies the drop, roll it forward to just before, copy the table back', value: 'answer' },
        { text: '{waitOut}, nothing lost: its {delay} delay cannot be skipped, so it must wait out the hour before replaying', value: 'waitOut' },
        { text: '{never}: like the standby, it applies the drop and loses the table', value: 'never' },
      ],
      truth: 'answer',
      reveal:
        'The table is back in {answer} with nothing lost: the drop sits in its log, received but not applied, for {delay}. The delay only holds back applying, so pause it before it applies the drop and replay what it has received, up to just before the drop, as fast as it can: at most {delay} of log at {replay}, {replayMin}. Then copy the table back in {copyBack}, while the primary keeps serving. Point-in-time recovery gets the same table back in {pitrRto}. The catch is the hour: a drop noticed later has reached this replica too, which is why it adds to backups and never replaces them.',
      focus: ['a-delayed', 'b-delayed'],
      hide: ['delayedOutcome'],
      slots: () => {
        const m = run(SETUP.delayed);
        return {
          lag: span(LAG_S),
          delay: span(DELAY_H * 3600),
          replay: times(m.settings.replay),
          answer: rto(m.plans.delayed.rtoMin),
          waitOut: rto(DELAY_H * 60 + m.delayedReplayMin + COPY_BACK_MIN),
          never: word('Nothing'),
          replayMin: mins(m.delayedReplayMin),
          copyBack: mins(COPY_BACK_MIN),
          pitrRto: rto(m.plans.pitr.rtoMin),
        };
      },
    },
    {
      id: 'meet',
      title: 'One minute, one hour',
      setup: SETUP.challenge,
      ask: 'Meet an RPO of {rpoGoal} and an RTO of {rtoGoal} for this {size} database with point-in-time recovery: tune the restore speed, the full backups and the replay. Each full backup reads all {size} from the primary, so run one no more often than every {baseFloor}.',
      goal: CHALLENGE_GOAL,
      reveal:
        'Restore at {speedSol}, a full backup every {baseSol} and replay at {replaySol}: {restoreSol} to restore {size}, then at most {baseSol} of log in {replaySolMin}, {rtoSol} in all; with the log archived every {archive} or more often, it loses at most that. At {replayMid} the replay alone takes {replayMidMin} and misses the hour; hourly full backups would make it, but read {size} from the primary {perDay} times a day. At {bigSize} nothing here meets the hour: copying it at {speedSol} takes {restoreBig} alone. So large databases restore from volume snapshots, or fail over to a standby for the dead disk and a delayed replica for the bad delete, and keep point-in-time recovery for the rest. And a recovery time is real only once a drill has measured it.',
      focus: ['b-pitr'],
      slots: () => {
        const sol = run({ ...SETUP.challenge, ...CHALLENGE_SOLUTION });
        const mid = run({ ...SETUP.challenge, ...CHALLENGE_SOLUTION, replay: 10 });
        const big = run({ ...SETUP.challenge, ...CHALLENGE_SOLUTION, size: BIG_SIZE });
        return {
          rpoGoal: span(CHALLENGE_BOUNDS.pitrRpo),
          rtoGoal: rto(CHALLENGE_BOUNDS.pitrRto),
          size: size(sol.settings.size),
          baseFloor: span(CHALLENGE_BOUNDS.base * 3600),
          speedSol: speed(sol.settings.restore),
          baseSol: span(sol.settings.base * 3600),
          replaySol: times(sol.settings.replay),
          restoreSol: mins(sol.restoreMin),
          replaySolMin: mins(sol.replayMin),
          rtoSol: mins(sol.plans.pitr.rtoMin),
          archive: span(sol.settings.archive),
          replayMid: times(mid.settings.replay),
          replayMidMin: mins(mid.replayMin),
          perDay: num(24),
          bigSize: size(BIG_SIZE),
          restoreBig: rto(big.restoreMin),
        };
      },
    },
  ];

  function renderExperiment(spec) {
    const slots = spec.slots();
    const fill = (t) => fillTemplate(t, slots);
    const choices = (spec.choices ?? []).map((c) => fill(c.text));
    let answer = -1;
    if (spec.choices && spec.truth) {
      const truth = fill(`{${spec.truth}}`);
      const matches = spec.choices.flatMap((c, i) => (fill(`{${c.value}}`) === truth ? [i] : []));
      if (matches.length !== 1) throw new Error(`${spec.id}: ${matches.length} choices equal the model's ${truth}`);
      answer = matches[0];
    }
    return { id: spec.id, title: fill(spec.title), ask: fill(spec.ask), choices, answer, reveal: fill(spec.reveal), slots, focus: spec.focus, hide: spec.hide ?? [] };
  }

  const boundMet = (b, v) => ('below' in b ? v < b.below : 'atMost' in b ? v <= b.atMost : v >= b.atLeast);
  const goalKept = (goal, s) => Object.entries(goal.keep ?? {}).every(([k, v]) => s[k] === v);
  const goalMet = (goal, s, metrics) => goalKept(goal, s) && goal.all.every((b) => boundMet(b, metrics[b.metric]));

  const api = {
    DISK,
    DROP,
    DISASTERS,
    SIZES_GB,
    RESTORE_GB_PER_MIN,
    BASE_EVERY_H,
    ARCHIVE_EVERY_S,
    REPLAY_SPEEDS,
    SYNC,
    LAG_S,
    PROMOTE_MIN,
    COPY_BACK_MIN,
    DELAY_H,
    BASE,
    PLANS,
    BEFORE_AXIS,
    AFTER_AXIS_H,
    INSET_MIN,
    ALL_SETTINGS,
    plans,
    scenario,
    run,
    beforeX,
    afterX,
    insetX,
    formatSpan,
    formatMin,
    formatSize,
    formatSpeed,
    formatTimes,
    formatNum,
    formatSlot,
    fillTemplate,
    strayDigits,
    EXPERIMENTS,
    SETUP,
    CHALLENGE_GOAL,
    CHALLENGE_BOUNDS,
    CHALLENGE_SOLUTION,
    renderExperiment,
    goalMet,
    goalKept,
    boundMet,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.RecoveryModel = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
