export type RecoveryPlan = 'nightly' | 'pitr' | 'standby';
export type Disaster = 'hardware' | 'delete';

export interface RecoveryRun {
  /** Whether the plan can bring the data back at all. */
  recovers: boolean;
  /** Worst-case seconds of writes lost (recovery point). */
  rpoSec: number;
  /** Minutes until the database serves again (recovery time). */
  rtoMin: number;
}

/**
 * A database of `sizeGB` fails, by losing its disks or by a bad delete someone runs. A nightly full backup restores at
 * `restoreGBPerMin` and loses up to a day. Point-in-time recovery restores the nightly base backup, then replays up to a
 * day of archived log `replaySpeed` times faster than it was written, and loses at most `archiveEverySec` of writes, or
 * nothing after a delete, since it stops just before it. An async standby takes over in a minute, losing its replication
 * lag, but a delete reaches it too.
 */
export function recovery(
  plan: RecoveryPlan,
  disaster: Disaster,
  options: { sizeGB: number; restoreGBPerMin: number; archiveEverySec: number; replaySpeed: number; lagSec: number },
): RecoveryRun {
  const { sizeGB, restoreGBPerMin, archiveEverySec, replaySpeed, lagSec } = options;
  const restoreMin = sizeGB / restoreGBPerMin;
  if (plan === 'nightly') return { recovers: true, rpoSec: 24 * 3600, rtoMin: restoreMin };
  if (plan === 'pitr')
    return { recovers: true, rpoSec: disaster === 'delete' ? 0 : archiveEverySec, rtoMin: restoreMin + (24 * 60) / replaySpeed };
  return disaster === 'delete' ? { recovers: false, rpoSec: Infinity, rtoMin: Infinity } : { recovers: true, rpoSec: lagSec, rtoMin: 1 };
}
