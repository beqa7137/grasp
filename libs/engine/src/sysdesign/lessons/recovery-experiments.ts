import { slotOf, word, type ExperimentGoal, type ExperimentSpec } from './experiments.js';
import {
  RECOVERY_BASELINE,
  RECOVERY_BASE_EVERY_H,
  RECOVERY_COPY_BACK_MIN,
  RECOVERY_DELAY_H,
  RECOVERY_DISASTER,
  RECOVERY_LAG_S,
  RECOVERY_PLANS,
  recoveryScenario,
  type RecoverySettings,
} from './widgets/recovery.js';

const span = slotOf('span');
const mins = slotOf('min');
const tb = slotOf('tb');
const speed = slotOf('speed');
const times = slotOf('times');
const num = slotOf('num');
/** A recovery time in minutes, said as a span. */
const rto = (min: number) => span(min * 60);

/**
 * E1 and E5 ask about a dropped table, where the stage a learner sees on load shows a dead disk; E2 asks at settings
 * the load-time stage does not show, so it never prints an answer.
 */
export const RECOVERY_SETUP = {
  replicaDrop: { ...RECOVERY_BASELINE, disaster: RECOVERY_DISASTER.drop },
  pitrTime: { ...RECOVERY_BASELINE, size: 10000, restore: 50, base: 6, replay: 5 },
  archive: { ...RECOVERY_BASELINE },
  growth: { ...RECOVERY_BASELINE },
  delayed: { ...RECOVERY_BASELINE, disaster: RECOVERY_DISASTER.drop, replay: 5 },
  challenge: { ...RECOVERY_BASELINE },
} as const satisfies Record<string, RecoverySettings>;

export const RECOVERY_CHALLENGE_BOUNDS = { pitrRpo: 60, pitrRto: 60, base: 6 } as const;
export const RECOVERY_CHALLENGE_GOAL: ExperimentGoal = {
  all: [
    { metric: 'pitrRpo', atMost: RECOVERY_CHALLENGE_BOUNDS.pitrRpo },
    { metric: 'pitrRto', atMost: RECOVERY_CHALLENGE_BOUNDS.pitrRto },
    { metric: 'base', atLeast: RECOVERY_CHALLENGE_BOUNDS.base },
  ],
  // After a drop the archive sets no loss, so the loss bound would mean nothing.
  keep: { size: 2000, disaster: RECOVERY_DISASTER.disk },
};
/** The one restore, base and replay triple of the 27 that meets the challenge. */
export const RECOVERY_CHALLENGE_SOLUTION = { restore: 50, base: 6, replay: 20 } as const;
export const RECOVERY_BIG_SIZE = 10000;
export const RECOVERY_FAST_ARCHIVE = 10;

/** The most frequent full backup, which the reveal prices. */
const HOURLY = RECOVERY_BASE_EVERY_H[RECOVERY_BASE_EVERY_H.length - 1];
/** Each outcome choice opens with the words its truth is told in. */
const E1 = { before: 'The table as it was', lastLag: 'Everything but the last', nothing: 'Nothing' } as const;
const E3 = { rpo: 'Only the loss', both: 'Both', neither: 'Neither' } as const;
const E4 = { all: "Every plan's", pitr: "Only point-in-time recovery's", restore: 'The two that restore a backup' } as const;
const run = (s: RecoverySettings) => recoveryScenario(s);

export const RECOVERY_EXPERIMENTS: readonly ExperimentSpec[] = [
  {
    id: 'replica-drop',
    title: 'A dropped table',
    setup: RECOVERY_SETUP.replicaDrop,
    act: { run: 'recover' },
    ask: 'Just before the nightly full backup, someone drops the orders table. The standby applies every change {lag} after the primary does. What can the standby bring back?',
    choices: [
      { text: 'The table as it was {lag} before the drop: it runs {lag} behind', value: 'before' },
      { text: 'Everything but the last {lag} of writes, as after a dead disk', value: 'lastLag' },
      { text: 'Nothing: it applies the drop {lag} after the primary does', value: 'nothing' },
    ],
    truth: 'outcome',
    reveal:
      'Nothing: a replica is not a backup. A standby copies every change within seconds, the drop included, so {lag} after the primary loses the table, the standby loses it too. It protects against losing a machine, not against losing the data: a bad migration or ransomware reaches it the same way, so keep backups immutable in another account, retained long enough to reach back before a mistake noticed weeks later. Point-in-time recovery, restored beside the primary, stops just before the drop and loses nothing, but gets the table back only in {pitrRto}.',
    focus: ['a-standby', 'b-standby'],
    hide: ['replicasDrop'],
    slots: () => {
      const m = run(RECOVERY_SETUP.replicaDrop);
      return {
        lag: span(RECOVERY_LAG_S),
        pitrRto: rto(m.plans.pitr.rtoMin),
        outcome: word(m.plans.standby.recovers ? E1.lastLag : E1.nothing),
        before: word(E1.before),
        lastLag: word(E1.lastLag),
        nothing: word(E1.nothing),
      };
    },
  },
  {
    id: 'pitr-time',
    title: 'Ten terabytes, disks lost',
    setup: RECOVERY_SETUP.pitrTime,
    act: { run: 'recover' },
    ask: 'A {size} database restores at {speed}. A full backup runs every {base}, the log is archived every {archive}, and replay runs {replay} as fast as the writes came in. The disks fail just before the next full backup. How long until point-in-time recovery serves again?',
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
      const m = run(RECOVERY_SETUP.pitrTime);
      const s = m.settings;
      return {
        size: tb(s.size),
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
    setup: RECOVERY_SETUP.archive,
    act: { set: { archive: RECOVERY_FAST_ARCHIVE }, run: 'recover' },
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
      const m = run(RECOVERY_SETUP.archive);
      const a = run({ ...RECOVERY_SETUP.archive, archive: RECOVERY_FAST_ARCHIVE });
      const rpo = a.plans.pitr.rpoS !== m.plans.pitr.rpoS;
      const time = a.plans.pitr.rtoMin !== m.plans.pitr.rtoMin;
      return {
        rpoBefore: span(m.plans.pitr.rpoS),
        rtoBefore: rto(m.plans.pitr.rtoMin),
        archiveAfter: span(RECOVERY_FAST_ARCHIVE),
        rpoAfter: span(a.plans.pitr.rpoS),
        rtoAfter: rto(a.plans.pitr.rtoMin),
        logH: span(a.logH * 3600),
        outcome: word(rpo && time ? E3.both : rpo ? E3.rpo : E3.neither),
        rpo: word(E3.rpo),
        both: word(E3.both),
        neither: word(E3.neither),
      };
    },
  },
  {
    id: 'growth',
    title: 'Five times the data',
    setup: RECOVERY_SETUP.growth,
    act: { set: { size: RECOVERY_BIG_SIZE }, run: 'recover' },
    ask: 'The database grows from {sizeBefore} to {sizeAfter}, with the same backups, standbys, restore speed and replay. Whose recovery time grows?',
    choices: [
      { text: "Every plan's: there is five times the data to bring back", value: 'all' },
      { text: "Only point-in-time recovery's: five times the log to replay", value: 'pitr' },
      { text: 'The two that restore a backup: they copy every byte back', value: 'restore' },
    ],
    truth: 'outcome',
    reveal:
      'The two that restore a backup: full backups go from {fullBefore} to {fullAfter} and point-in-time recovery from {pitrBefore} to {pitrAfter}, because copying {sizeAfter} at {speed} takes {restoreAfter}. The log to replay is the writes since the base backup, which depend on the write rate, here unchanged, not on the size, and the standbys already hold every byte: they serve again in {standby} and {delayed} as before. A large database restores faster from a volume snapshot, back in minutes though slow until its blocks load, or fails over to a replica.',
    focus: ['b-all'],
    hide: ['rtoAfter'],
    slots: () => {
      const m = run(RECOVERY_SETUP.growth);
      const a = run({ ...RECOVERY_SETUP.growth, size: RECOVERY_BIG_SIZE });
      const grew = RECOVERY_PLANS.filter((p) => a.plans[p].rtoMin > m.plans[p].rtoMin).join();
      const outcome = grew === RECOVERY_PLANS.join() ? E4.all : grew === 'pitr' ? E4.pitr : grew === 'full,pitr' ? E4.restore : 'Another';
      return {
        sizeBefore: tb(m.settings.size),
        sizeAfter: tb(RECOVERY_BIG_SIZE),
        speed: speed(m.settings.restore),
        fullBefore: rto(m.plans.full.rtoMin),
        fullAfter: rto(a.plans.full.rtoMin),
        pitrBefore: rto(m.plans.pitr.rtoMin),
        pitrAfter: rto(a.plans.pitr.rtoMin),
        restoreAfter: rto(a.restoreMin),
        standby: rto(a.plans.standby.rtoMin),
        delayed: rto(a.plans.delayed.rtoMin),
        outcome: word(outcome),
        all: word(E4.all),
        pitr: word(E4.pitr),
        restore: word(E4.restore),
      };
    },
  },
  {
    id: 'delayed',
    title: 'A replica an hour behind',
    setup: RECOVERY_SETUP.delayed,
    act: { run: 'recover' },
    ask: 'Someone drops a table just before the nightly full backup and notices within minutes. A delayed replica receives the log {lag} after the primary writes it but applies it only {delay} later, and its replay runs {replay} as fast as the writes came in. How soon can it give the table back, at the earliest, and how much is lost?',
    choices: [
      {
        text: '{answer}, nothing lost: pause it before it applies the drop, roll it forward to just before, copy the table back',
        value: 'answer',
      },
      {
        text: '{waitOut}, nothing lost: its {delay} delay cannot be skipped, so it must wait out the hour before replaying',
        value: 'waitOut',
      },
      { text: '{never}: like the standby, it applies the drop and loses the table', value: 'never' },
    ],
    truth: 'answer',
    reveal:
      'The table is back in {answer} with nothing lost: the drop sits in its log, received but not applied, for {delay}. The delay only holds back applying, so pause it before it applies the drop and replay what it has received, up to just before the drop, as fast as it can: at most {delay} of log at {replay}, {replayMin}. Then copy the table back in {copyBack}, while the primary keeps serving. Point-in-time recovery gets the same table back in {pitrRto}. The catch is the hour: a drop noticed later has reached this replica too, which is why it adds to backups and never replaces them.',
    focus: ['a-delayed', 'b-delayed'],
    hide: ['delayedOutcome'],
    slots: () => {
      const m = run(RECOVERY_SETUP.delayed);
      return {
        lag: span(RECOVERY_LAG_S),
        delay: span(RECOVERY_DELAY_H * 3600),
        replay: times(m.settings.replay),
        answer: rto(m.plans.delayed.rtoMin),
        waitOut: rto(RECOVERY_DELAY_H * 60 + m.delayedReplayMin + RECOVERY_COPY_BACK_MIN),
        never: word('Never'),
        replayMin: mins(m.delayedReplayMin),
        copyBack: mins(RECOVERY_COPY_BACK_MIN),
        pitrRto: rto(m.plans.pitr.rtoMin),
      };
    },
  },
  {
    id: 'meet',
    title: 'One minute, one hour',
    setup: RECOVERY_SETUP.challenge,
    ask: 'Meet an RPO of {rpoGoal} and an RTO of {rtoGoal} for this {size} database with point-in-time recovery: tune the restore speed, the full backups and the replay. Each full backup reads all {size} from the primary, so run one no more often than every {baseFloor}.',
    goal: RECOVERY_CHALLENGE_GOAL,
    reveal:
      'Restore at {speedSol}, a full backup every {baseSol} and replay at {replaySol}: {restoreSol} to restore {size}, then at most {baseSol} of log in {replaySolMin}, {rtoSol} in all; with the log archived every {archive} or more often, it loses at most that. At {replayMid} the replay takes {replayMidMin}, {rtoMid} in all with the restore, and misses the hour; hourly full backups would make it, but read {size} from the primary {perDay} times a day, unless they are incremental or taken from a standby. At {bigSize} nothing here meets the hour: copying it at {speedSol} takes {restoreBig} alone. So large databases restore from volume snapshots, or fail over to a standby for the dead disk and a delayed replica for the bad delete, and keep point-in-time recovery for the rest. And a recovery time is real only once a drill has measured it.',
    focus: ['b-pitr'],
    slots: () => {
      const sol = run({ ...RECOVERY_SETUP.challenge, ...RECOVERY_CHALLENGE_SOLUTION });
      const mid = run({ ...RECOVERY_SETUP.challenge, ...RECOVERY_CHALLENGE_SOLUTION, replay: 10 });
      const big = run({ ...RECOVERY_SETUP.challenge, ...RECOVERY_CHALLENGE_SOLUTION, size: RECOVERY_BIG_SIZE });
      return {
        rpoGoal: span(RECOVERY_CHALLENGE_BOUNDS.pitrRpo),
        rtoGoal: rto(RECOVERY_CHALLENGE_BOUNDS.pitrRto),
        size: tb(sol.settings.size),
        baseFloor: span(RECOVERY_CHALLENGE_BOUNDS.base * 3600),
        speedSol: speed(sol.settings.restore),
        baseSol: span(sol.settings.base * 3600),
        replaySol: times(sol.settings.replay),
        restoreSol: mins(sol.restoreMin),
        replaySolMin: mins(sol.replayMin),
        rtoSol: mins(sol.plans.pitr.rtoMin),
        archive: span(sol.settings.archive),
        replayMid: times(mid.settings.replay),
        replayMidMin: mins(mid.replayMin),
        rtoMid: mins(mid.plans.pitr.rtoMin),
        perDay: num(24 / HOURLY),
        bigSize: tb(RECOVERY_BIG_SIZE),
        restoreBig: rto(big.restoreMin),
      };
    },
  },
];
