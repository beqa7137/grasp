/**
 * Backups & Recovery (REDESIGN.md 5.2, R42): a schematic, worst-case model of one database, four recovery plans and one
 * disaster that strikes at the worst moment of the backup cycle, just before the next full backup runs and just before
 * the next log segment ships. Each plan is judged by its recovery point (seconds of writes lost) and its recovery time
 * (minutes until the database serves again or, after a dropped table, until the table is back), with the steps that
 * time is made of.
 */

export const RECOVERY_DISASTER = { disk: 0, drop: 1 } as const;
export const RECOVERY_DISASTERS = [RECOVERY_DISASTER.disk, RECOVERY_DISASTER.drop] as const;
/** The database, in GB. */
export const RECOVERY_SIZES_GB = [500, 2000, 10000] as const;
/** How fast a restore copies the base backup back, in GB a minute. */
export const RECOVERY_RESTORE_GB_PER_MIN = [10, 25, 50] as const;
/** A full (base) backup every so many hours. */
export const RECOVERY_BASE_EVERY_H = [24, 6, 1] as const;
/** A log segment (WAL, binlog) shipped to the archive every so many seconds. */
export const RECOVERY_ARCHIVE_EVERY_S = [10, 60, 300] as const;
/** Log replay runs this many times as fast as the writes came in. */
export const RECOVERY_REPLAY_SPEEDS = [5, 10, 20] as const;
/** The standby: asynchronous (it runs `RECOVERY_LAG_S` behind) or synchronous (the primary waits for it). */
export const RECOVERY_SYNC = [0, 1] as const;

/** An async standby's fixed replication lag, and the delayed replica's (it receives the log the same way). */
export const RECOVERY_LAG_S = 5;
/** Promoting a standby or a replica to primary takes a fixed minute. */
export const RECOVERY_PROMOTE_MIN = 1;
/** After a drop the primary keeps serving: a plan recovers beside it and copies the table back in a fixed minute. */
export const RECOVERY_COPY_BACK_MIN = 1;
/** The delayed replica applies the log this many hours after the primary committed it. */
export const RECOVERY_DELAY_H = 1;

export type RecoverySettings = {
  disaster: number;
  size: number;
  restore: number;
  base: number;
  archive: number;
  replay: number;
  sync: number;
};

/** The lesson's database: 2 TB restored at 10 GB/min, a nightly full backup, the log every minute, replay at 10×. */
export const RECOVERY_BASELINE: Readonly<RecoverySettings> = {
  disaster: RECOVERY_DISASTER.disk,
  size: 2000,
  restore: 10,
  base: 24,
  archive: 60,
  replay: 10,
  sync: 0,
};

export type RecoveryPlanId = 'full' | 'pitr' | 'standby' | 'delayed';
export const RECOVERY_PLANS: readonly RecoveryPlanId[] = ['full', 'pitr', 'standby', 'delayed'];
export type RecoveryStepKind = 'restore' | 'replay' | 'promote' | 'copyBack';

export interface RecoveryStep {
  kind: RecoveryStepKind;
  min: number;
}

export interface RecoveryPlanRun {
  /** Whether the plan can bring the data back at all. */
  recovers: boolean;
  /** Worst-case seconds of writes lost; Infinity when it cannot bring the data back. */
  rpoS: number;
  /** Minutes until it serves again (after a drop, until the table is back); Infinity when it never does. */
  rtoMin: number;
  steps: readonly RecoveryStep[];
}

export interface RecoveryScenario {
  settings: RecoverySettings;
  plans: Readonly<Record<RecoveryPlanId, RecoveryPlanRun>>;
  drop: boolean;
  /** Copying the database back at the restore speed. */
  restoreMin: number;
  /** Replaying the log written since the base backup: at the worst moment, a whole cycle of it. */
  replayMin: number;
  /** Hours of log since the base backup. */
  logH: number;
  /** The delayed replica's replay of the hour it holds. */
  delayedReplayMin: number;
  /** The full backups taken in the day before the disaster, newest first, in hours before it. */
  fullsH: readonly number[];
  /** The last time any plan that recovers serves again. */
  lastRtoMin: number;
  metrics: Readonly<Record<string, number>>;
}

const sum = (steps: readonly RecoveryStep[]) => steps.reduce((t, s) => t + s.min, 0);

/**
 * Each plan at the worst moment. A full backup holds the moment it was taken. Point-in-time recovery restores the base
 * backup and replays every change since it: a dead disk loses the segment not yet shipped, a drop is replayed to just
 * before it. A standby applies every change within its lag, so it answers a dead disk and never a drop. The delayed
 * replica holds the last hour in its received log: it applies it and is promoted, or after a drop it is paused before
 * the drop and rolled forward to just before it. After a drop the primary keeps serving, so every plan recovers beside
 * it and copies the table back, because recovering in place would throw away every write made since the drop.
 */
export function recoveryScenario(input: Partial<RecoverySettings> = {}): RecoveryScenario {
  const s = { ...RECOVERY_BASELINE, ...input } as RecoverySettings;
  const drop = s.disaster === RECOVERY_DISASTER.drop;
  const restoreMin = s.size / s.restore;
  const logH = s.base;
  const replayMin = (logH * 60) / s.replay;
  const delayedReplayMin = (RECOVERY_DELAY_H * 60) / s.replay;
  const lag = s.sync ? 0 : RECOVERY_LAG_S;
  const copyBack: RecoveryStep[] = drop ? [{ kind: 'copyBack', min: RECOVERY_COPY_BACK_MIN }] : [];
  const plan = (recovers: boolean, rpoS: number, steps: RecoveryStep[]): RecoveryPlanRun => ({
    recovers,
    rpoS: recovers ? rpoS : Infinity,
    rtoMin: recovers ? sum(steps) : Infinity,
    steps,
  });
  const plans: Record<RecoveryPlanId, RecoveryPlanRun> = {
    full: plan(true, s.base * 3600, [{ kind: 'restore', min: restoreMin }, ...copyBack]),
    pitr: plan(true, drop ? 0 : s.archive, [{ kind: 'restore', min: restoreMin }, { kind: 'replay', min: replayMin }, ...copyBack]),
    standby: drop ? plan(false, Infinity, []) : plan(true, lag, [{ kind: 'promote', min: RECOVERY_PROMOTE_MIN }]),
    delayed: plan(true, drop ? 0 : RECOVERY_LAG_S, [
      { kind: 'replay', min: delayedReplayMin },
      drop ? { kind: 'copyBack', min: RECOVERY_COPY_BACK_MIN } : { kind: 'promote', min: RECOVERY_PROMOTE_MIN },
    ]),
  };
  return {
    settings: s,
    plans,
    drop,
    restoreMin,
    replayMin,
    logH,
    delayedReplayMin,
    fullsH: Array.from({ length: Math.floor(24 / s.base) }, (_, k) => (k + 1) * s.base),
    lastRtoMin: Math.max(...RECOVERY_PLANS.filter((p) => plans[p].recovers).map((p) => plans[p].rtoMin)),
    metrics: { pitrRto: plans.pitr.rtoMin, pitrRpo: plans.pitr.rpoS, base: s.base, size: s.size, archive: s.archive },
  };
}

/** Every setting the widget can show: 972. */
export const RECOVERY_SETTINGS: readonly RecoverySettings[] = RECOVERY_DISASTERS.flatMap((disaster) =>
  RECOVERY_SIZES_GB.flatMap((size) =>
    RECOVERY_RESTORE_GB_PER_MIN.flatMap((restore) =>
      RECOVERY_BASE_EVERY_H.flatMap((base) =>
        RECOVERY_ARCHIVE_EVERY_S.flatMap((archive) =>
          RECOVERY_REPLAY_SPEEDS.flatMap((replay) =>
            RECOVERY_SYNC.map((sync): RecoverySettings => ({ disaster, size, restore, base, archive, replay, sync })),
          ),
        ),
      ),
    ),
  ),
);

/** The fixed axes. Before the disaster: seconds on a log scale, 1 s to 24 h. After it: 0 to 24 h, linear. */
export const RECOVERY_BEFORE_AXIS = { minS: 1, maxS: 24 * 3600 } as const;
export const RECOVERY_AFTER_AXIS_H = 24;
/** The inset under the after axis redraws its first minutes, linear. */
export const RECOVERY_INSET_MIN = 90;

/** Before the disaster: 0 at `x1` (the disaster), 1 s to 24 h on a log scale from `x1 - gap` back to `x0`. */
export function recoveryBeforeX(sec: number, x0: number, x1: number, gap: number): number {
  if (sec <= 0) return x1;
  const { minS, maxS } = RECOVERY_BEFORE_AXIS;
  const f = Math.log(sec / minS) / Math.log(maxS / minS);
  return x1 - gap - f * (x1 - gap - x0);
}
/** After the disaster: 0 to 24 h, linear, so a step's length is proportional to its minutes. */
export const recoveryAfterX = (min: number, x0: number, x1: number) => x0 + ((x1 - x0) * min) / (RECOVERY_AFTER_AXIS_H * 60);
/** The inset: 0 to 90 minutes, linear; a later time is clamped to its right end. */
export const recoveryInsetX = (min: number, x0: number, x1: number) =>
  x0 + ((x1 - x0) * Math.min(min, RECOVERY_INSET_MIN)) / RECOVERY_INSET_MIN;
