import { describe, expect, it } from 'vitest';
import { experimentTemplates, goalMet, renderExperiment, strayDigits } from './experiments.js';
import { SD_LESSONS } from './index.js';
import {
  RECOVERY_CHALLENGE_BOUNDS,
  RECOVERY_CHALLENGE_GOAL,
  RECOVERY_CHALLENGE_SOLUTION,
  RECOVERY_EXPERIMENTS,
  RECOVERY_FAST_ARCHIVE,
  RECOVERY_SETUP,
} from './recovery-experiments.js';
import { formatRecoveryTime } from './widgets/recovery-format.js';
import {
  RECOVERY_ARCHIVE_EVERY_S,
  RECOVERY_BASELINE,
  RECOVERY_BASE_EVERY_H,
  RECOVERY_DISASTER,
  RECOVERY_PLANS,
  RECOVERY_REPLAY_SPEEDS,
  RECOVERY_RESTORE_GB_PER_MIN,
  RECOVERY_SETTINGS,
  recoveryScenario,
  type RecoverySettings,
} from './widgets/recovery.js';

const shown = Object.fromEntries(RECOVERY_EXPERIMENTS.map((e) => [e.id, renderExperiment(e)]));
const run = (s: RecoverySettings) => recoveryScenario(s);
const time = formatRecoveryTime;

/** The brief's wording, every number filled from the model. */
const EXPECTED: Record<string, { ask: string; choices: string[]; reveal: string }> = {
  'replica-drop': {
    ask: 'Just before the nightly full backup, someone drops the orders table. The standby applies every change 5 s after the primary does. What can the standby bring back?',
    choices: [
      'The table as it was 5 s before the drop: it runs 5 s behind',
      'Everything but the last 5 s of writes, as after a dead disk',
      'Nothing: it applies the drop 5 s after the primary does',
    ],
    reveal:
      'Nothing: a replica is not a backup. A standby copies every change within seconds, the drop included, so 5 s after the primary loses the table, the standby loses it too. It protects against losing a machine, not against losing the data: a bad migration or ransomware reaches it the same way, so keep backups immutable in another account, retained long enough to reach back before a mistake noticed weeks later. Point-in-time recovery, restored beside the primary, stops just before the drop and loses nothing, but gets the table back only in 5.8 h.',
  },
  'pitr-time': {
    ask: 'A 10 TB database restores at 50 GB/min. A full backup runs every 6 h, the log is archived every 1 min, and replay runs 5× as fast as the writes came in. The disks fail just before the next full backup. How long until point-in-time recovery serves again?',
    choices: [
      '3.3 h: the restore, since the log replays while the backup copies',
      '4.5 h: the restore, then 6 h of log at 5×',
      "8.1 h: the restore, then the day's 24 h of log at 5×",
    ],
    reveal:
      'Replay can start only once the restore is done, and it must apply every change since the base backup: 200 min to copy 10 TB at 50 GB/min, then 6 h of log at 5×, 72 min, so 272 min in all, 4.5 h. The size and the restore speed set the first term. The second is the log since the newest base backup, 6 h here and not the whole day, at the replay speed. Only the last 1 min of writes, not yet archived, is lost.',
  },
  archive: {
    ask: 'Point-in-time recovery here loses up to 1 min of writes and serves again in 5.7 h. Archive the log every 10 s instead. What changes?',
    choices: [
      'Only the loss, to 10 s: the replay still starts at the base backup',
      'Both: 10 s lost, and smaller pieces of log replay sooner',
      'Neither: the full backups set how much is lost',
    ],
    reveal:
      'Only the loss: 10 s instead of 1 min. The archive interval is how much log a dead disk can take with it. Recovery still restores the base backup and replays all 24 h of log since it, cut into more pieces but no shorter, so it serves again in 5.7 h as before. Archiving more often costs more stored objects and requests; streaming the log as it is written takes the loss to about a second.',
  },
  growth: {
    ask: 'The database grows from 2 TB to 10 TB, with the same backups, standbys, restore speed and replay. Whose recovery time grows?',
    choices: [
      "Every plan's: there is five times the data to bring back",
      "Only point-in-time recovery's: five times the log to replay",
      'The two that restore a backup: they copy every byte back',
    ],
    reveal:
      'The two that restore a backup: full backups go from 3.3 h to 16.7 h and point-in-time recovery from 5.7 h to 19.1 h, because copying 10 TB at 10 GB/min takes 16.7 h. The log to replay is the writes since the base backup, which depend on the write rate, here unchanged, not on the size, and the standbys already hold every byte: they serve again in 1 min and 7 min as before. A large database restores faster from a volume snapshot, back in minutes though slow until its blocks load, or fails over to a replica.',
  },
  delayed: {
    ask: 'Someone drops a table just before the nightly full backup and notices within minutes. A delayed replica receives the log 5 s after the primary writes it but applies it only 1 h later, and its replay runs 5× as fast as the writes came in. How soon can it give the table back, at the earliest, and how much is lost?',
    choices: [
      '13 min, nothing lost: pause it before it applies the drop, roll it forward to just before, copy the table back',
      '73 min, nothing lost: its 1 h delay cannot be skipped, so it must wait out the hour before replaying',
      'Never: like the standby, it applies the drop and loses the table',
    ],
    reveal:
      'The table is back in 13 min with nothing lost: the drop sits in its log, received but not applied, for 1 h. The delay only holds back applying, so pause it before it applies the drop and replay what it has received, up to just before the drop, as fast as it can: at most 1 h of log at 5×, 12 min. Then copy the table back in 1 min, while the primary keeps serving. Point-in-time recovery gets the same table back in 8.2 h. The catch is the hour: a drop noticed later has reached this replica too, which is why it adds to backups and never replaces them.',
  },
  meet: {
    ask: 'Meet an RPO of 1 min and an RTO of 1 h for this 2 TB database with point-in-time recovery: tune the restore speed, the full backups and the replay. Each full backup reads all 2 TB from the primary, so run one no more often than every 6 h.',
    choices: [],
    reveal:
      'Restore at 50 GB/min, a full backup every 6 h and replay at 20×: 40 min to restore 2 TB, then at most 6 h of log in 18 min, 58 min in all; with the log archived every 1 min or more often, it loses at most that. At 10× the replay takes 36 min, 76 min in all with the restore, and misses the hour; hourly full backups would make it, but read 2 TB from the primary 24 times a day, unless they are incremental or taken from a standby. At 10 TB nothing here meets the hour: copying it at 50 GB/min takes 3.3 h alone. So large databases restore from volume snapshots, or fail over to a standby for the dead disk and a delayed replica for the bad delete, and keep point-in-time recovery for the rest. And a recovery time is real only once a drill has measured it.',
  },
};

describe('the Backups & Recovery experiments', () => {
  it('replace the lesson tryThis', () => {
    expect(SD_LESSONS['sd-recovery'].widget.experiments).toBe(RECOVERY_EXPERIMENTS);
    expect(SD_LESSONS['sd-recovery'].widget.tryThis).toBeUndefined();
    expect(RECOVERY_EXPERIMENTS.map((e) => e.id)).toEqual(['replica-drop', 'pitr-time', 'archive', 'growth', 'delayed', 'meet']);
  });

  it('read as the brief words them, every number from the model, at answer positions 3, 2, 1, 3, 1', () => {
    for (const e of RECOVERY_EXPERIMENTS) {
      const r = shown[e.id];
      expect({ ask: r.ask, choices: r.choices, reveal: r.reveal }).toEqual(EXPECTED[e.id]);
      for (const t of experimentTemplates(e)) expect(strayDigits(t)).toEqual([]);
    }
    expect(RECOVERY_EXPERIMENTS.slice(0, 5).map((e) => shown[e.id].answer)).toEqual([2, 1, 0, 2, 0]);
  });

  it('never answers by a choice’s shape: E2’s answer is its middle number, E4’s the only choice without "five"', () => {
    const e2 = shown['pitr-time'].choices.map((c) => Number(c.split(' h')[0]));
    expect([...e2].sort((a, b) => a - b)[1]).toBe(e2[shown['pitr-time'].answer]);
    expect(new Set(e2).size).toBe(3);
    const e4 = shown['growth'].choices;
    expect(e4.filter((c) => !c.includes('five'))).toEqual([e4[shown['growth'].answer]]);
    // E5 asks for the earliest time; the wait-out choice is later.
    expect(shown['delayed'].ask).toContain('at the earliest');
    const e5 = run(RECOVERY_SETUP.delayed);
    expect(time(e5.plans.delayed.rtoMin)).toBe('13 min');
    // No drop sentence of E1 or E5 says a plan serves again, is promoted or is "back in" without the table.
    for (const id of ['replica-drop', 'delayed']) {
      const r = shown[id];
      for (const t of [r.ask, ...r.choices, r.reveal])
        for (const sentence of t.split(/(?<=\.) /)) {
          expect(sentence).not.toMatch(/serve again|promot/);
          if (/back in/.test(sentence)) expect(sentence).toMatch(/table/);
        }
    }
  });

  it('say a bound is missed only by a time over it: a clause that misses the hour, or a time "alone", names one above 1 h', () => {
    const minutes = (t: string) => [...t.matchAll(/([\d.]+) (min|h)\b/g)].map((x) => Number(x[1]) * (x[2] === 'h' ? 60 : 1));
    for (const e of RECOVERY_EXPERIMENTS)
      for (const clause of shown[e.id].reveal.split(/(?<=[.;])\s+/))
        if (/misses the hour|\balone\b/.test(clause) && e.goal)
          expect(Math.max(0, ...minutes(clause)), clause).toBeGreaterThan(RECOVERY_CHALLENGE_BOUNDS.pitrRto);
  });

  it('title each card in at most 26 characters, one line on the narrowest card', () => {
    for (const e of RECOVERY_EXPERIMENTS) expect(e.title.length, e.title).toBeLessThanOrEqual(26);
  });

  it('hold every word claim by rule over all 972 settings', () => {
    for (const s of RECOVERY_SETTINGS) {
      const m = run(s);
      // "the archive interval never moves the recovery time"
      for (const archive of RECOVERY_ARCHIVE_EVERY_S) {
        const a = run({ ...s, archive });
        for (const p of RECOVERY_PLANS) expect(a.plans[p].rtoMin).toBe(m.plans[p].rtoMin);
      }
      // "size grows exactly the two restores, never the replicas or the replay"
      const big = run({ ...s, size: 10000 });
      if (s.size < 10000) {
        expect(big.plans.full.rtoMin).toBeGreaterThan(m.plans.full.rtoMin);
        expect(big.plans.pitr.rtoMin).toBeGreaterThan(m.plans.pitr.rtoMin);
      }
      expect(big.plans.standby.rtoMin).toBe(m.plans.standby.rtoMin);
      expect(big.plans.delayed.rtoMin).toBe(m.plans.delayed.rtoMin);
      expect(big.replayMin).toBe(m.replayMin);
      // "a replica applies the drop": the standby never brings a dropped table back; the delayed replica always does.
      if (s.disaster === RECOVERY_DISASTER.drop) {
        expect(m.plans.standby.recovers).toBe(false);
        expect(m.plans.delayed.recovers && m.plans.delayed.rpoS === 0).toBe(true);
        expect(m.plans.pitr.rpoS).toBe(0);
      }
    }
    // E3: a 10 s archive moves only the loss.
    const a = run({ ...RECOVERY_SETUP.archive, archive: RECOVERY_FAST_ARCHIVE });
    expect(a.plans.pitr.rpoS).toBe(10);
    expect(a.plans.pitr.rtoMin).toBe(run(RECOVERY_SETUP.archive).plans.pitr.rtoMin);
  });

  it('compares only values on the drawn scales: every time within 24 h, every loss within 1 s to 24 h', () => {
    const e2 = run(RECOVERY_SETUP.pitrTime);
    expect(e2.restoreMin + (24 * 60) / e2.settings.replay).toBe(488);
    expect(488).toBeLessThanOrEqual(24 * 60);
    expect(60 + run(RECOVERY_SETUP.delayed).delayedReplayMin + 1).toBe(73);
  });

  it('never prints an answer on the load-time stage', () => {
    const rest = run(RECOVERY_BASELINE);
    // E1 and E5 are about a drop and E2 about other settings; the load shows a dead disk at the default.
    expect(rest.drop).toBe(false);
    expect(time(rest.plans.pitr.rtoMin)).not.toBe('4.5 h');
    expect(time(rest.plans.delayed.rtoMin)).not.toBe('13 min');
  });

  it('has exactly one restore, base and replay triple that meets the challenge, at a 10 s or 1 min archive', () => {
    const goal = RECOVERY_CHALLENGE_GOAL;
    const passing: string[] = [];
    for (const restore of RECOVERY_RESTORE_GB_PER_MIN)
      for (const base of RECOVERY_BASE_EVERY_H)
        for (const replay of RECOVERY_REPLAY_SPEEDS) {
          const s = { ...RECOVERY_SETUP.challenge, restore, base, replay };
          if (goalMet(goal, run(s).metrics, s)) passing.push(`${restore}/${base}/${replay}`);
        }
    const { restore, base, replay } = RECOVERY_CHALLENGE_SOLUTION;
    expect(passing).toEqual([`${restore}/${base}/${replay}`]);
    const sol = run({ ...RECOVERY_SETUP.challenge, ...RECOVERY_CHALLENGE_SOLUTION });
    expect(sol.plans.pitr.rtoMin).toBe(58);
    const all = RECOVERY_SETTINGS.filter((s) => goalMet(goal, run(s).metrics, s));
    expect(all).toHaveLength(4);
    expect(new Set(all.map((s) => s.archive))).toEqual(new Set([10, 60]));
    // The setup does not meet it, so the challenge opens with work to do.
    expect(goalMet(goal, run(RECOVERY_SETUP.challenge).metrics, RECOVERY_SETUP.challenge)).toBe(false);
    // After a drop the goal's keep fails, whatever the numbers.
    const dropped = { ...RECOVERY_SETUP.challenge, ...RECOVERY_CHALLENGE_SOLUTION, disaster: RECOVERY_DISASTER.drop };
    expect(goalMet(goal, run(dropped).metrics, dropped)).toBe(false);
  });
});
