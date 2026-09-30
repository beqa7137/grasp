import type { SdLesson } from './types.js';

export const RECOVERY_LESSON: SdLesson = {
  why: 'Every database eventually loses data: a disk dies, a region goes dark, an engineer runs a `DELETE` without a `WHERE`, or ransomware encrypts the volumes. What you get back is decided long before that day, by which copies exist, where they live and whether anyone has ever restored one. Interviewers ask two numbers, how much data you may lose and how long you may be down, and then check that the design actually delivers both for each kind of disaster.',
  widget: {
    kind: 'recovery',
    tryThis: [
      'Start from the defaults (nightly backup, disks lost, 2 TB, 10 GB a minute): the restore takes 3.3 h and up to 24 h of writes are lost. Pick point-in-time recovery: the loss drops to 1 min, the 60 s archive interval, but recovery grows to 5.7 h, 200 minutes to restore the base backup plus 144 to replay a day of log at 10 times speed. Pick the async standby: 5 s lost and back in 1 minute.',
      'Keep the standby and switch the disaster to a bad delete: the data does not come back, because the standby applied the delete within seconds. Pick point-in-time recovery: it stops just before the delete, so nothing is lost, still in 5.7 h. The nightly backup also recovers, but loses up to 24 h of writes.',
      'Pick point-in-time recovery and disks lost, then set the size to 10 TB: recovery takes 19.1 h. Raise the restore speed to 50 GB a minute: back to 5.7 h. Slide the archive interval to 10 s: the loss drops to 10 s and the recovery time does not move. The archive interval sets RPO; size, restore speed and replay set RTO.',
    ],
  },
  concepts: [
    {
      title: 'RPO and RTO',
      body: 'The recovery point objective (RPO) is how much recent data you may lose, measured as time: an RPO of 5 minutes means the restored system may lack the last 5 minutes of writes. The recovery time objective (RTO) is how long until the system serves again. The business sets both, per system, from what an hour of downtime and a lost hour of orders cost; engineering then picks the cheapest design that meets them and proves it in a drill. Near-zero RPO and RTO for every system is not a goal, it is an unbounded budget.',
    },
    {
      title: 'Backups are not replicas',
      body: 'A replica copies every change within seconds, including the mistakes: a dropped table, a bad migration or ransomware writing encrypted pages reaches every replica too. Replicas protect against losing a machine; backups protect against losing the data. You need both, and a backup that the same credentials can delete is only half a backup.',
    },
    {
      title: 'Full, incremental, differential',
      body: 'A full backup copies everything: simplest to restore, most expensive to take and store. An incremental copies what changed since the last backup of any kind: smallest and fastest to take, but a restore needs the full plus every incremental since, in order, and one missing link breaks the chain. A differential copies what changed since the last full: it grows through the week, but a restore needs only the full and the latest differential.',
    },
    {
      title: 'Point-in-time recovery',
      body: 'Take a base backup (in Postgres with `pg_basebackup` or a tool such as pgBackRest; in MySQL with Percona XtraBackup) and continuously archive the write-ahead log (Postgres WAL, MySQL binlog) to object storage. To recover, restore the base backup and replay the log up to a chosen moment, such as one second before the bad delete (`recovery_target_time` in Postgres, `mysqlbinlog` with `--stop-datetime` in MySQL). RPO is the log not yet archived, which Postgres bounds with `archive_timeout` or streaming archiving; RTO is the restore plus the replay, so taking base backups more often shortens recovery.',
    },
    {
      title: 'Snapshots and consistency',
      body: 'A storage snapshot (EBS, a SAN, LVM, ZFS) captures a volume at one instant, is fast to take and is usually incremental at the block level. It is crash-consistent: like pulling the power, which a database with a write-ahead log recovers from, as long as its data and log are captured at the same instant, so a database spread over several volumes needs a multi-volume snapshot. For application-consistent snapshots, have the database flush and pause its writes, or enter backup mode, first. A restored cloud volume may load its blocks lazily, so it runs slowly until it is warm.',
    },
    {
      title: '3-2-1 and ransomware',
      body: 'Keep at least 3 copies of the data, on 2 different kinds of storage, with 1 offsite. Against ransomware and a compromised admin account, make one copy immutable or offline: object storage with a write-once lock (S3 Object Lock in compliance mode) in a separate account with separate credentials, retained long enough to reach back before an intrusion that went unnoticed for weeks. Encrypt backups and keep the keys somewhere that survives the same disaster.',
    },
    {
      title: 'Restore drills and delayed replicas',
      body: 'An untested backup is a hope. Restore regularly and automatically into a scratch environment, check the data (row counts, checksums, a smoke query), and record how long it took: that is your real RTO, not the one on the design doc. A delayed replica applies changes an hour behind (`recovery_min_apply_delay` in Postgres, `SOURCE_DELAY` in MySQL), a middle ground: after a bad delete you pause it and roll it forward to just before the mistake, in minutes instead of hours.',
    },
    {
      title: 'Disaster recovery tiers and runbooks',
      body: 'For losing a whole region, the common tiers trade cost for speed. Backup and restore: copy backups to another region and rebuild there, RTO in hours. Pilot light: replicate the data live but keep the rest of the stack off or minimal, RTO in tens of minutes. Warm standby: a scaled-down full copy runs and scales up on failover, RTO in minutes. Active-active: every region serves traffic, RTO near zero, at the price of full capacity everywhere and conflict handling. Whichever tier you pick, write the runbook (who declares the disaster, the exact steps, how to fail back) and rehearse it.',
    },
  ],
  examples: [
    {
      title: 'Meet an RPO of 5 minutes and an RTO of 1 hour',
      problem:
        'An orders database holds 1,000 GB. The business asks for an RPO of 5 minutes and an RTO of 1 hour, for both a dead disk and a bad delete. Restores run at 5 GB a minute and log replays 10 times faster than it was written. Today there is a nightly full backup. Design the recovery.',
      insight: 'Check each plan against each disaster separately: the plan that is fast for a dead disk is often useless for a bad delete.',
      steps: [
        'Nightly backup: RPO up to 24 hours, far past 5 minutes. Restore time 1,000 / 5 = 200 minutes, past the hour too.',
        'Point-in-time recovery with the log archived every 60 s meets the RPO. But the RTO is 200 minutes of restore plus up to 24 hours of log / 10 = 144 minutes of replay, 344 minutes in all.',
        'For a dead disk, add a standby in another zone: failover in about a minute, losing only the replication lag, usually seconds. That meets both numbers.',
        'For a bad delete the standby copies the mistake, so point-in-time recovery has to meet the hour. Base backups every 6 hours cut the worst replay to 360 / 10 = 36 minutes, and restoring from a volume snapshot instead of copying 1,000 GB cuts the 200 minutes to a few, plus a warm-up.',
        'Or add a replica delayed by an hour: pause it, replay to one second before the delete, and promote it or copy the rows back, well inside the hour.',
      ],
    },
    {
      title: 'Undo a bad delete at 14:05',
      problem:
        'At 14:05 a script deletes 30,000 customer rows from a 2,000 GB Postgres database. The nightly base backup finished at 01:00 and WAL is archived continuously. Restores run at 10 GB a minute and replay at 10 times speed. The site keeps taking orders. How do you recover without losing the orders placed since 14:05?',
      insight: 'Restore to the side, not in place: recover a copy to just before the mistake and copy back only what was lost.',
      steps: [
        'Restore the 01:00 base backup to a new instance: 2,000 / 10 = 200 minutes.',
        'Replay WAL from 01:00 to 14:04:59, about 13 hours of log: 785 / 10 ≈ 79 minutes. The copy is ready about 280 minutes, 4.7 hours, after the restore starts.',
        'Restoring the primary in place would roll back every order placed after 14:05. Instead, copy the 30,000 rows from the side instance back into the live database, checking for rows since recreated with the same keys.',
        'The site stays up throughout. With a replica delayed by an hour, the same repair starts within minutes: pause replay before 15:05, when the delete would arrive, and roll forward to 14:04:59.',
        'Afterwards, write the runbook down and schedule a drill: the 280 minutes is only a real number once you have measured it.',
      ],
    },
    {
      title: 'Price incremental against differential backups',
      problem:
        'A 2,000 GB database changes about 100 GB of distinct blocks a day. You take a full backup every Sunday and keep 4 weeks. Compare daily incrementals with daily differentials for storage and for the restore on Saturday.',
      insight: 'Incrementals save storage; differentials save restore steps. The cost of each shows up in a different place.',
      steps: [
        'Incrementals: each of the 6 weekdays stores its own 100 GB, so a week holds 2,000 + 600 = 2,600 GB, and 4 weeks 10,400 GB.',
        'Differentials: day k stores all changes since Sunday, up to k × 100 GB, so 100 + 200 + ... + 600 = 2,100 GB beside the full, 4,100 GB a week and 16,400 GB for 4 weeks.',
        'A Saturday restore from incrementals reads the full plus 6 incrementals in order, and fails if any one is corrupt. From differentials it reads the full plus the one 600 GB differential.',
        'If the same rows churn every day, the differentials stay near 100 GB and the gap nearly closes, which is why real change rates matter more than the rule of thumb.',
        'Either way, 3-2-1 multiplies it: a second copy offsite, and ideally an immutable one, so budget storage for two or three times these figures.',
      ],
    },
  ],
  pitfalls: [
    'Treating replicas or RAID as backups: they survive a dead disk but copy a bad delete, a bad migration or ransomware within seconds.',
    'Never restoring: backups that are empty, missing the log, encrypted with a lost key or too slow to restore are found only during the disaster.',
    'Keeping every copy in the same account with the same credentials, so one compromised admin or ransomware deletes the backups with the data.',
    'Quoting RTO as the restore alone: replaying the log, warming caches, checking the data and repointing the application all count.',
  ],
  followUps: [
    {
      question: 'How do you choose RPO and RTO for a system?',
      answer:
        'Ask the business what an hour of downtime and an hour of lost writes cost, per system: payments and orders need seconds and minutes, an analytics warehouse that can be rebuilt may accept a day. Then price the designs that meet them and let the owners confirm the trade.',
    },
    {
      question: 'Why not just take a snapshot every 5 minutes instead of archiving the log?',
      answer:
        'You can, and the RPO is then about 5 minutes, but you can only return to a snapshot, not to one second before a delete, and snapshots usually live in the same account and region as the volume. Log archiving gives any point in time; copy snapshots and log to another region and account either way.',
    },
    {
      question: 'Is active-active always the best disaster recovery?',
      answer:
        'It gives the lowest RTO, but it costs full capacity in every region, forces you to handle writes from two regions or give each record a home region, and still needs backups: a bad delete reaches every region at once. Most systems choose pilot light or warm standby and spend the difference on drills.',
    },
  ],
};
