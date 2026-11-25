import {
  RECOVERY_CHALLENGE_BOUNDS,
  RECOVERY_COPY_BACK_MIN,
  RECOVERY_DELAY_H,
  RECOVERY_DISASTER,
  RECOVERY_LAG_S,
  RECOVERY_PLANS,
  RECOVERY_PROMOTE_MIN,
  formatDbSize,
  formatMinutes,
  formatRecoveryTime,
  formatRestoreSpeed,
  formatSpan,
  formatTimes,
  recoveryScenario,
  type RecoveryPlanId,
  type RecoveryPlanRun,
  type RecoveryScenario,
  type RecoverySettings,
} from '@grasp/engine';
import { PLAN, recoverMinAt } from './recovery-motion';
import { tableWidth } from './recovery-text';

/**
 * What an open question hides, on every surface: one map from the regions a question names in its own `hide` list.
 * `replicasDrop` (E1) and `delayedOutcome` (E5) hide what the replicas can bring back after a drop: their words and
 * numbers while the question asks and while its answer plays, and while it asks the marks that would draw the answer.
 * `pitrTime` (E2) hides point-in-time recovery's time to serve, `pitrAfter` (E3) both its numbers at the act's setting
 * while the answer plays, and `rtoAfter` (E4) every plan's time there. While an answer plays, its mechanism is drawn and
 * its outcome marks wait for the reveal (`outcomesHeld`). No ghost of an earlier setting shows while a question is
 * open, and Play and every control wait.
 */
export interface Hid {
  standbyWords: boolean;
  standbyMarks: boolean;
  delayedWords: boolean;
  delayedMarks: boolean;
  pitrRto: boolean;
  pitrRpo: boolean;
  pitrRtoMarks: boolean;
  allRto: boolean;
  /** A hidden bar's dashed box spans the whole axis, never the hidden time. */
  boxFull: boolean;
  outcomesHeld: boolean;
  ghost: boolean;
  locked: boolean;
}
export type HidFlag = keyof Hid;
export type QuestionPhase = 'rest' | 'asking' | 'playing' | 'revealed';

/** `leak` switches flags off, for the no-answer sweep to prove it catches each one. */
export function hiding(hide: readonly string[], phase: QuestionPhase, leak: readonly HidFlag[] = []): Hid {
  const h = new Set(hide);
  const asking = phase === 'asking';
  const playing = phase === 'playing';
  const open = asking || playing;
  const replicas = h.has('replicasDrop') || h.has('delayedOutcome');
  const map: Hid = {
    standbyWords: h.has('replicasDrop') && open,
    standbyMarks: h.has('replicasDrop') && asking,
    delayedWords: replicas && open,
    delayedMarks: replicas && asking,
    pitrRto: (h.has('pitrTime') && open) || ((h.has('pitrAfter') || h.has('rtoAfter')) && playing),
    pitrRpo: h.has('pitrAfter') && playing,
    pitrRtoMarks: h.has('pitrTime') && asking,
    allRto: h.has('rtoAfter') && playing,
    boxFull: true,
    outcomesHeld: playing,
    ghost: open,
    locked: open,
  };
  for (const flag of leak) map[flag] = false;
  return map;
}
export const NOTHING_HIDDEN = hiding([], 'rest');

export const rtoHidden = (hid: Hid, p: RecoveryPlanId) =>
  hid.allRto || (p === 'pitr' && hid.pitrRto) || (p === 'standby' && hid.standbyWords) || (p === 'delayed' && hid.delayedWords);
export const rpoHidden = (hid: Hid, p: RecoveryPlanId) =>
  (p === 'pitr' && hid.pitrRpo) || (p === 'standby' && hid.standbyWords) || (p === 'delayed' && hid.delayedWords);
export const marksHidden = (hid: Hid, p: RecoveryPlanId) => (p === 'standby' && hid.standbyMarks) || (p === 'delayed' && hid.delayedMarks);
export const anyTimeHidden = (hid: Hid) => RECOVERY_PLANS.some((p) => rtoHidden(hid, p));
/** Whether any number is hidden: Describe waits while one is. */
export const anyHidden = (hid: Hid) => anyTimeHidden(hid) || RECOVERY_PLANS.some((p) => rpoHidden(hid, p));

export const span = formatSpan;
export const rtoSpan = formatRecoveryTime;
const DELAY = span(RECOVERY_DELAY_H * 3600);
const LAG = span(RECOVERY_LAG_S);
export const isDrop = (s: RecoverySettings) => s.disaster === RECOVERY_DISASTER.drop;

/** Each row's name forms, longest first: the layout picks one per width, the same in both blocks. */
export const NAMES: Readonly<Record<RecoveryPlanId | 'primary', (s: RecoverySettings) => readonly string[]>> = {
  primary: () => ['Primary'],
  full: () => ['Full backups'],
  pitr: () => ['Point-in-time recovery', 'Point-in-time'],
  standby: (s) => (s.sync ? ['Standby, synchronous', 'Sync standby', 'Standby'] : ['Standby, asynchronous', 'Async standby', 'Standby']),
  delayed: () => [`Delayed replica, ${DELAY} behind`, 'Delayed replica'],
};
/** The inset's names, in its narrow left column. */
export const SHORT_NAMES: Readonly<Record<RecoveryPlanId, string>> = {
  full: 'Full backups',
  pitr: 'Point-in-time',
  standby: 'Standby',
  delayed: 'Delayed replica',
};

export const lossWords = (p: RecoveryPlanRun) =>
  !p.recovers ? 'cannot bring it back' : p.rpoS === 0 ? 'loses nothing' : `loses ${span(p.rpoS)}`;
export const backIn = (drop: boolean) => (drop ? 'table back in' : 'back in');
export const serveWords = (p: RecoveryPlanRun, drop: boolean) => (!p.recovers ? 'never' : `${backIn(drop)} ${rtoSpan(p.rtoMin)}`);
export const HIDDEN_OUTCOME = 'What it can bring back shows after your answer.';
export const hiddenTime = (drop: boolean) =>
  drop ? 'Whether and when it gets the table back shows after your answer.' : 'Its time to serve again shows after your answer.';
export const disasterName = (drop: boolean) => (drop ? 'DROP' : 'DISKS FAIL');

/** A block A row's note, longest form first; the words that tell the disaster wait for its strike. */
export function noteForms(key: RecoveryPlanId | 'primary', m: RecoveryScenario, hid: Hid, struck: boolean): readonly string[] {
  const s = m.settings;
  const drop = m.drop;
  const every = span(s.base * 3600);
  switch (key) {
    case 'primary':
      if (!struck) return ['takes writes all day'];
      return drop
        ? ['keeps serving; only the table is gone', 'only the table is gone']
        : ['takes writes all day; its disks fail at the worst moment', 'its disks fail at the worst moment'];
    case 'full':
      return drop && struck
        ? [`a full copy every ${every}: the table as of that copy`, `a full copy every ${every}`]
        : [`a full copy every ${every}, in another account`, `a full copy every ${every}`];
    case 'pitr':
      return hid.pitrRpo
        ? ['the base backup, then the log archived']
        : [`the base backup, then the log archived every ${span(s.archive)}`, `base backup, log every ${span(s.archive)}`];
    case 'standby':
      if (drop && struck && !hid.standbyWords)
        return s.sync
          ? ['applies every change with the primary: the drop too', 'applies the drop too']
          : [`applies every change ${LAG} after the primary: the drop too`, 'applies the drop too'];
      return s.sync
        ? ['the primary waits for it on every commit', 'confirms every commit']
        : [`applies every change ${LAG} after the primary`, `${LAG} behind the primary`];
    case 'delayed':
      if (drop && struck && !hid.delayedWords)
        return [`the drop waits in its log for ${DELAY} before it applies`, `the drop waits ${DELAY} in its log`];
      return [`receives the log ${LAG} after the primary, applies it ${DELAY} later`, `log in ${LAG}, applied ${DELAY} later`];
  }
}

interface Ledger {
  steps?: readonly (readonly [string, number])[];
  total?: boolean;
  fixed?: string;
}
/** A block B row's ledger: its steps, each with its minutes, and the total where there is one. */
export function ledgerParts(key: RecoveryPlanId, m: RecoveryScenario): Ledger {
  const s = m.settings;
  const drop = m.drop;
  const to = drop ? ' to just before the drop' : '';
  const copy: [string, number][] = drop ? [['copy the table back', RECOVERY_COPY_BACK_MIN]] : [];
  switch (key) {
    case 'full':
      return {
        steps: [
          [`restore ${formatDbSize(s.size)}${drop ? ' beside the primary' : ''} at ${formatRestoreSpeed(s.restore)}`, m.restoreMin],
          ...copy,
        ],
      };
    case 'pitr':
      return {
        steps: [
          [drop ? 'restore beside the primary' : 'restore', m.restoreMin],
          [`replay ${span(s.base * 3600)} of log${to} at ${formatTimes(s.replay)}`, m.replayMin],
          ...copy,
        ],
        total: true,
      };
    case 'standby':
      return m.plans.standby.recovers
        ? { steps: [['promote it', RECOVERY_PROMOTE_MIN]] }
        : { fixed: 'it has applied the drop too: no copy without it' };
    case 'delayed':
      return {
        steps: [
          [`${drop ? 'pause it, replay' : 'replay'} its ${DELAY} of log${to} at ${formatTimes(s.replay)}`, m.delayedReplayMin],
          drop ? ['copy the table back', RECOVERY_COPY_BACK_MIN] : ['promote it', RECOVERY_PROMOTE_MIN],
        ],
      };
  }
}

/** The ledger as printed once the recovery clock stands at `passed` minutes: a step's minutes land as it ends. */
export function ledger(key: RecoveryPlanId, m: RecoveryScenario, passed = Infinity): string {
  const L = ledgerParts(key, m);
  if (L.fixed) return passed >= 0 ? L.fixed : '';
  let t = 0;
  const out = (L.steps ?? []).map(([label, min]) => {
    t += min;
    return `${label}: ${passed >= t ? formatMinutes(min) : '…'}`;
  });
  if (L.total && passed >= t) out.push(`${formatMinutes(t)} in all`);
  return out.join('; ');
}

export function workload(s: RecoverySettings): string {
  const size = formatDbSize(s.size);
  return isDrop(s)
    ? `A ${size} database takes writes all day. At the worst moment, just before the next full backup, someone drops a table.`
    : `A ${size} database takes writes all day. Its disks fail at the worst moment: just before the next full backup and the next log archive.`;
}

export const REST_STEP = 'Each plan is judged by two numbers: the writes it loses (RPO) and the time until it serves again (RTO).';
export const REST_STEP_DROP = 'Each plan is judged by two numbers: the writes it loses (RPO) and the time until the table is back (RTO).';
export const HISTORY_STEP = 'The day before: full backups copy the database; the log and both replicas get every write.';
export const STRIKE_DISK = 'The disks fail: everything on the primary is gone.';
export const STRIKE_DROP = 'A table is dropped, and every copy that applies the change loses it too.';
export const POINTS_STEP = "Each plan's recovery point: the newest moment it can bring back.";
export const TOLD_STEP = 'Written below the picture.';
export const OVER_STEP = 'The recovery is over.';
const after = (drop: boolean) => (drop ? 'after the drop' : 'after the disaster');

/** The plan that serves (or gets the table back) last. */
export function lastPlan(m: RecoveryScenario): RecoveryPlanId {
  return RECOVERY_PLANS.filter((p) => m.plans[p].recovers).reduce((a, p) => (m.plans[p].rtoMin > m.plans[a].rtoMin ? p : a));
}

/** The step line: at rest what the stage judges, during a play what it is doing; no form carries a hidden number. */
export function stepOf(m: RecoveryScenario, frac: number | null, hid: Hid): string {
  const drop = m.drop;
  if (frac === null) return drop ? REST_STEP_DROP : REST_STEP;
  if (frac < PLAN.historyEnd) return HISTORY_STEP;
  if (frac < PLAN.points[0]) return drop ? STRIKE_DROP : STRIKE_DISK;
  if (frac < PLAN.recoverStart) return POINTS_STEP;
  if (frac < PLAN.recoverEnd) {
    const min = Math.round(recoverMinAt(m, frac));
    if (anyTimeHidden(hid)) return `Recovering ${after(drop)}: the times show after your answer.`;
    return min < 1 ? `Recovering ${after(drop)}.` : `Recovering: ${rtoSpan(min)} ${after(drop)}.`;
  }
  if (anyTimeHidden(hid)) return OVER_STEP;
  const last = lastPlan(m);
  const name = NAMES[last](m.settings)[0].split(',')[0];
  return drop
    ? `${name} gets the table back last, ${rtoSpan(m.plans[last].rtoMin)} after the drop.`
    : `${name} serves last, ${rtoSpan(m.plans[last].rtoMin)} after the disaster.`;
}
/** The notice while a play runs: each step once, the recovery without its counting clock, which stays on the stage. */
export function playNotice(m: RecoveryScenario, frac: number, hid: Hid): string {
  return frac >= PLAN.recoverStart && frac < PLAN.recoverEnd ? stepOf(m, PLAN.recoverStart, hid) : stepOf(m, frac, hid);
}
/** Every step a play can print, for the lines the header reserves. */
export const ALL_STEPS: readonly string[] = [
  REST_STEP,
  REST_STEP_DROP,
  HISTORY_STEP,
  STRIKE_DISK,
  STRIKE_DROP,
  POINTS_STEP,
  TOLD_STEP,
  'Point-in-time recovery gets the table back last, 21.5 h after the drop.',
  'Recovering after the disaster: the times show after your answer.',
  'Recovering after the disaster.',
  'Recovering: 99 min after the disaster.',
  'Recovering: 21.5 h after the disaster.',
];

/** What a play did, in order: the notice after a play and the Reduced-motion story. Every number is written out. */
export function story(m: RecoveryScenario, hid: Hid = NOTHING_HIDDEN): string {
  const s = m.settings;
  const P = m.plans;
  const drop = m.drop;
  const size = formatDbSize(s.size);
  const out: string[] = [];
  if (drop) {
    out.push(`A table is dropped just before the next full backup of this ${size} database, and the primary keeps serving.`);
    out.push(
      `Full backups lose up to ${span(P.full.rpoS)} of the table's writes and get the table back in ${rtoSpan(P.full.rtoMin)}, restoring ${size} beside the primary at ${formatRestoreSpeed(s.restore)} and copying the table back.`,
    );
    out.push(
      hid.pitrRto
        ? 'Point-in-time recovery replays to just before the drop and loses nothing; it restores the same base backup beside the primary, then replays the log since it.'
        : `Point-in-time recovery replays to just before the drop and loses nothing; it restores the same base backup beside the primary, then replays ${span(s.base * 3600)} of log at ${formatTimes(s.replay)}, and gets the table back in ${rtoSpan(P.pitr.rtoMin)}.`,
    );
  } else {
    out.push(`The disks of this ${size} database fail just before the next full backup and the next log archive.`);
    out.push(
      hid.allRto
        ? `Full backups lose up to ${span(P.full.rpoS)} of writes and restore ${size} at ${formatRestoreSpeed(s.restore)}.`
        : `Full backups lose up to ${span(P.full.rpoS)} of writes and serve again in ${rtoSpan(P.full.rtoMin)}, restoring ${size} at ${formatRestoreSpeed(s.restore)}.`,
    );
    const loss = hid.pitrRpo ? 'loses what its last archive missed' : `loses up to ${span(P.pitr.rpoS)}, the log not yet archived`;
    out.push(
      hid.pitrRto
        ? `Point-in-time recovery ${loss}; it restores the same base backup, then replays the log since it.`
        : `Point-in-time recovery ${loss}; it restores the same base backup, then replays ${span(s.base * 3600)} of log at ${formatTimes(s.replay)}, and serves again in ${rtoSpan(P.pitr.rtoMin)}.`,
    );
  }
  if (hid.standbyWords) out.push('What the standby can bring back shows after your answer.');
  else if (!P.standby.recovers)
    out.push(`The standby applies the drop ${s.sync ? 'with the primary' : `${LAG} after the primary`} and cannot bring the table back.`);
  else
    out.push(
      hid.allRto
        ? `The standby loses ${P.standby.rpoS ? span(P.standby.rpoS) : 'nothing'} and is promoted.`
        : `The standby loses ${P.standby.rpoS ? `its ${span(P.standby.rpoS)} of lag` : 'nothing'} and is promoted in ${formatMinutes(RECOVERY_PROMOTE_MIN)}.`,
    );
  if (hid.delayedWords) out.push('What the delayed replica can bring back shows after your answer.');
  else if (drop)
    out.push(
      hid.allRto
        ? `The delayed replica holds the drop in its log for ${DELAY}: paused in time, it loses nothing.`
        : `The delayed replica holds the drop in its log for ${DELAY}: paused in time, it loses nothing and gets the table back in ${rtoSpan(P.delayed.rtoMin)}.`,
    );
  else {
    // "The same" only when the sentence before it said this very loss.
    const same = !hid.standbyWords && P.standby.recovers && P.standby.rpoS === P.delayed.rpoS;
    const loss = same ? `loses the same ${span(P.delayed.rpoS)}` : `loses ${span(P.delayed.rpoS)}, the log it had not yet received,`;
    out.push(
      hid.allRto
        ? `The delayed replica ${loss} once it has applied the hour it holds.`
        : `The delayed replica ${loss} and serves again in ${rtoSpan(P.delayed.rtoMin)}, once it has applied the hour it holds.`,
    );
  }
  return out.join(' ');
}

/** One sentence for a setting: the notice after a change, after a reveal and when the challenge opens. */
export function settingSentence(m: RecoveryScenario): string {
  const s = m.settings;
  const P = m.plans;
  const drop = m.drop;
  // "Full backups" is plural: its verbs agree.
  const one = (key: RecoveryPlanId, name: string, many = false) => {
    const p = P[key];
    if (!p.recovers) return `${name} cannot bring the table back`;
    const of = drop && key === 'full' ? " of the table's writes" : '';
    const loss = p.rpoS === 0 ? (many ? 'lose nothing' : 'loses nothing') : `${many ? 'lose' : 'loses'} up to ${span(p.rpoS)}${of}`;
    const back = drop ? `${many ? 'get' : 'gets'} the table back in` : `${many ? 'serve' : 'serves'} again in`;
    return `${name} ${loss} and ${back} ${rtoSpan(p.rtoMin)}`;
  };
  const lead = `With ${formatDbSize(s.size)} and ${drop ? 'a table dropped' : 'the disks lost'}`;
  return `${lead}, ${one('full', 'full backups', true)}; ${one('pitr', 'point-in-time recovery')}; ${one('standby', s.sync ? 'the synchronous standby' : 'the standby')}; ${one('delayed', 'the delayed replica')}.`;
}

export const REST_NOTICE = 'Change the disaster or any setting, or press Play to watch the disaster strike and each plan recover.';
export const WAIT_NOTICE = 'Play and every setting wait for your answer.';
export const ANSWER_NOTICE = 'Your answer is in. The disaster plays out on the picture; the numbers show at the reveal.';

/** The stage's summary, in full sentences, obeying `hiding()`. */
export function summary(m: RecoveryScenario, hid: Hid): string {
  const s = m.settings;
  const P = m.plans;
  const drop = m.drop;
  const before = [
    `full backups every ${span(s.base * 3600)} lose up to ${span(P.full.rpoS)}${drop ? " of the table's writes" : ''}`,
    hid.pitrRpo
      ? 'point-in-time recovery, the base backup plus the archived log: its loss shows after your answer'
      : `point-in-time recovery, the base backup plus the log archived every ${span(s.archive)}, ${P.pitr.rpoS ? `loses up to ${span(P.pitr.rpoS)}` : 'loses nothing'}`,
    hid.standbyWords
      ? 'the standby: what it can bring back shows after your answer'
      : `the ${s.sync ? 'synchronous' : 'asynchronous'} standby ${!P.standby.recovers ? 'cannot bring it back' : P.standby.rpoS ? `loses up to ${span(P.standby.rpoS)}` : 'loses nothing'}`,
    hid.delayedWords
      ? 'the delayed replica: what it can bring back shows after your answer'
      : `the delayed replica, ${DELAY} behind, ${P.delayed.rpoS ? `loses up to ${span(P.delayed.rpoS)}` : 'loses nothing'}`,
  ];
  const NAME: Record<RecoveryPlanId, string> = {
    full: 'full backups',
    pitr: 'point-in-time recovery',
    standby: 'the standby',
    delayed: 'the delayed replica',
  };
  const afterIt = RECOVERY_PLANS.map((k) =>
    rtoHidden(hid, k) ? `${NAME[k]}: after your answer` : P[k].recovers ? `${NAME[k]} in ${rtoSpan(P[k].rtoMin)}` : `${NAME[k]} never`,
  );
  return [
    `A timeline of one disaster and four recovery plans for a ${formatDbSize(s.size)} database ${drop ? 'in which a table is dropped' : 'whose disks fail'} at the worst moment.`,
    `Before the disaster, on a log scale: ${before.join('; ')}.`,
    `${drop ? 'After it, getting the table back' : 'After it, serving again'}: ${afterIt.join('; ')}.`,
    'A schematic, worst-case model.',
  ].join(' ');
}

export const MODEL_NOTE = `A schematic model, worst case: the disaster strikes just before the next full backup and the next log archive. Restores copy at a fixed speed; the log replays at a fixed multiple of the speed it was written; the standby runs a fixed ${LAG} behind and a promotion takes ${formatMinutes(RECOVERY_PROMOTE_MIN)}; the delayed replica receives the log ${LAG} behind and applies it ${DELAY} behind, and the drop is noticed within that hour. After a drop the primary keeps serving: each plan recovers beside it, and copying the table back takes ${formatMinutes(RECOVERY_COPY_BACK_MIN)}. Lower RPO and RTO cost more: more frequent full backups read the primary more often, and a sync standby adds a round trip to every commit. The clocks start when recovery starts: noticing the disaster, checking the data and repointing the application add to them.`;
/** The note states the model's assumptions, two of which are answers: it waits while a question is open. */
export const noteText = (hid: Hid) => (hid.locked ? 'A schematic model. Its assumptions show after your answer.' : MODEL_NOTE);

/**
 * The challenge's status: each bound first, the current value in parentheses, and its state in words. While a setting the
 * goal keeps is off (a drop, another size), no bound is judged, so no line reads met.
 */
export function goalParts(m: RecoveryScenario, judged = true): { text: string; met: boolean }[] {
  const b = RECOVERY_CHALLENGE_BOUNDS;
  const said = (met: boolean) => (judged ? `: ${met ? 'met' : 'not yet'}` : '');
  const p = m.plans.pitr;
  const l = judged && p.rpoS <= b.pitrRpo;
  const r = judged && p.rtoMin <= b.pitrRto;
  const f = judged && m.settings.base >= b.base;
  return [
    {
      met: l,
      text: `point-in-time recovery loses at most ${span(b.pitrRpo)} (now ${p.rpoS ? `up to ${span(p.rpoS)}` : 'nothing'})${said(l)}`,
    },
    {
      met: r,
      text: `point-in-time recovery ${m.drop ? 'gets the table back' : 'serves again'} within ${rtoSpan(b.pitrRto)} (now ${rtoSpan(p.rtoMin)})${said(r)}`,
    },
    {
      met: f,
      text: `no more than one full backup every ${span(b.base * 3600)} (now every ${span(m.settings.base * 3600)})${said(f)}`,
    },
  ];
}

const PLAN_ROW: Readonly<Record<RecoveryPlanId, string>> = {
  full: 'Full backups',
  pitr: 'Point-in-time recovery',
  standby: 'Standby',
  delayed: 'Delayed replica',
};
/** Under this stage width Describe's table is compact: three columns, the disaster in the plan's cell. */
export const COMPACT_UNDER = 560;

/**
 * Describe: a row for each plan against each disaster, for this setting, the current disaster's rows marked. Compact
 * under a 560 px stage, or wherever the full table would not fit its box unbroken.
 */
export function describeTable(m: RecoveryScenario, boxW: number, stageW: number) {
  const full = tableOf(m, false);
  return stageW >= COMPACT_UNDER && tableWidth(full.head, full.rows, false, 2) <= boxW ? full : tableOf(m, true);
}

export function tableOf(m: RecoveryScenario, compact: boolean) {
  const s = m.settings;
  const head = compact ? ['Plan', 'Loses', 'Back in'] : ['Plan', 'Disaster', 'Loses (RPO)', 'Back in (RTO)'];
  const rows: string[][] = [];
  const now: number[] = [];
  for (const disaster of [RECOVERY_DISASTER.disk, RECOVERY_DISASTER.drop]) {
    const mm = recoveryScenario({ ...s, disaster });
    for (const k of RECOVERY_PLANS) {
      const p = mm.plans[k];
      const loses = !p.recovers ? 'the table' : p.rpoS === 0 ? 'nothing' : span(p.rpoS);
      const back = p.recovers ? rtoSpan(p.rtoMin) : 'never';
      const drop = disaster === RECOVERY_DISASTER.drop;
      if (disaster === s.disaster) now.push(rows.length);
      rows.push(
        compact
          ? [`${k === 'pitr' ? 'Point-in-time' : PLAN_ROW[k]}, ${drop ? 'drop' : 'disk'}`, loses, back]
          : [PLAN_ROW[k], drop ? 'a dropped table' : 'disks lost', loses, back],
      );
    }
  }
  const note = `Rows are this setting's: ${formatDbSize(s.size)} restored at ${formatRestoreSpeed(s.restore)}, a full backup every ${span(s.base * 3600)}, the log archived every ${span(s.archive)} and replayed at ${formatTimes(s.replay)}, the standby ${s.sync ? 'synchronous' : `${LAG} behind`}. Worst case, from a schematic model.`;
  return { compact, head, rows, now, note };
}
