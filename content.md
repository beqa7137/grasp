# Backups & Recovery widget: every string

Generated from the built widget (`recovery`) by a browser walk, and the experiments from the engine build.

## Experiments

### A replica is not a backup

Ask: Just before the nightly full backup, someone drops the orders table. The standby applies every change 5 s after the primary does. What can the standby bring back?

- The table as it was 5 s before the drop: it runs 5 s behind
- Everything but the last 5 s of writes, as after a dead disk
- (answer) Nothing: it applies the drop 5 s after the primary does

Reveal: Nothing: a standby copies every change within seconds, the drop included, so 5 s after the primary loses the table, the standby loses it too. A replica protects against losing a machine, not against losing the data: a bad migration or ransomware reaches it the same way. Point-in-time recovery, restored beside the primary, stops just before the drop and loses nothing, but gets the table back only in 5.8 h. The delayed replica, which applies the log 1 h behind, still holds the table. So keep backups immutable in another account, retained long enough to reach back before a mistake noticed weeks later.

### Restore, then replay

Ask: A 10 TB database restores at 50 GB/min. A full base backup runs every 6 h, the log is archived every 1 min, and replay runs 5× as fast as the writes came in. The disks fail just before the next base backup. How long until point-in-time recovery serves again?

- 3.3 h: the restore, since the log replays while the backup copies
- (answer) 4.5 h: the restore, then 6 h of log at 5×
- 8.1 h: the restore, then the day's 24 h of log at 5×

Reveal: Replay can start only once the restore is done, and it must apply every change since the base backup: 200 min to copy 10 TB at 50 GB/min, then 6 h of log at 5×, 72 min, so 272 min in all, 4.5 h. The size and the restore speed set the first term. The second is the log since the newest base backup, 6 h here and not the whole day, at the replay speed. Only the last 1 min of writes, not yet archived, is lost.

### Archive more often

Ask: Point-in-time recovery here loses up to 1 min of writes and serves again in 5.7 h. Archive the log every 10 s instead. What changes?

- (answer) Only the loss, to 10 s: the replay still starts at the base backup
- Both: 10 s lost, and smaller pieces of log replay sooner
- Neither: the full backups set how much is lost

Reveal: Only the loss: 10 s instead of 1 min. The archive interval is how much log a dead disk can take with it. Recovery still restores the base backup and replays all 24 h of log since it, cut into more pieces but no shorter, so it serves again in 5.7 h as before. Archiving more often costs more stored objects and requests; streaming the log as it is written takes the loss to about a second.

### Five times the data

Ask: The database grows from 2 TB to 10 TB, with the same backups, standbys, restore speed and replay. Whose recovery time grows?

- Every plan's: there is five times the data to bring back
- Only point-in-time recovery's: five times the log to replay
- (answer) The two that restore a backup: they copy every byte back

Reveal: The two that restore a backup: full backups go from 3.3 h to 16.7 h and point-in-time recovery from 5.7 h to 19.1 h, because copying 10 TB at 10 GB/min takes 16.7 h. The log to replay is the writes since the base backup, which do not grow with the size, and the standbys already hold every byte: they serve again in 1 min and 7 min as before. A large database restores faster from a volume snapshot, back in minutes though slow until its blocks load, or fails over to a replica.

### A replica an hour behind

Ask: Someone drops a table just before the nightly backup and notices within minutes. A delayed replica receives the log 5 s after the primary writes it but applies it only 1 h later, and its replay runs 5× as fast as the writes came in. How soon can it give the table back, at the earliest, and how much is lost?

- (answer) 13 min, nothing lost: pause it before it applies the drop, roll it forward to just before, copy the table back
- 73 min, nothing lost: its 1 h delay cannot be skipped, so it must wait out the hour before replaying
- Nothing: like the standby, it applies the drop and loses the table

Reveal: The table is back in 13 min with nothing lost: the drop sits in its log, received but not applied, for 1 h. The delay only holds back applying, so pause it before it applies the drop and replay what it has received, up to just before the drop, as fast as it can: at most 1 h of log at 5×, 12 min. Then copy the table back in 1 min, while the primary keeps serving. Point-in-time recovery gets the same table back in 8.2 h. The catch is the hour: a drop noticed later has reached this replica too, which is why it adds to backups and never replaces them.

### One minute, one hour

Ask: Meet an RPO of 1 min and an RTO of 1 h for this 2 TB database with point-in-time recovery: tune the restore speed, the full backups and the replay. Each full backup reads all 2 TB from the primary, so run one no more often than every 6 h.


Reveal: Restore at 50 GB/min, a full backup every 6 h and replay at 20×: 40 min to restore 2 TB, then at most 6 h of log in 18 min, 58 min in all; with the log archived every 1 min or more often, it loses at most that. At 10× the replay alone takes 36 min and misses the hour; hourly full backups would make it, but read 2 TB from the primary 24 times a day. At 10 TB nothing here meets the hour: copying it at 50 GB/min takes 3.3 h alone. So large databases restore from volume snapshots, or fail over to a standby for the dead disk and a delayed replica for the bad delete, and keep point-in-time recovery for the rest. And a recovery time is real only once a drill has measured it.

## Desktop, Reduced motion

#### at rest

- One disaster, four recovery plans
- A 2 TB database takes writes all day. Its disks fail at the worst moment: just before the
- next full backup and the next log archive.
- Each plan is judged by two numbers: the writes it loses (RPO) and the time until it serves
- again (RTO).
- WHAT EACH PLAN LOSES · RPO
- TIME BEFORE THE DISASTER, LOG SCALE
- DISKS FAIL
- 24 h
- 6 h
- 1 h
- 10 min
- 1 min
- 10 s
- Primary
- disks lost
- takes writes all day; its disks fail at the worst moment
- Full backups
- loses 24 h
- a full copy every 24 h, in another account
- Point-in-time recovery
- loses 1 min
- the base backup, then the log archived every 1 min
- Standby, asynchronous
- loses 5 s
- applies every change 5 s after the primary
- Delayed replica, 1 h behind
- loses 5 s
- receives the log 5 s after the primary, applies it 1 h later
- FULL BACKUP EVERY
- LOG ARCHIVED EVERY
- STANDBY
- TIME UNTIL IT SERVES AGAIN · RTO
- TIME AFTER THE DISASTER
- DISKS FAIL
- 6 h
- 12 h
- 18 h
- 24 h
- Full backups
- back in 3.3 h
- restore 2 TB at 10 GB/min: 200 min
- Point-in-time recovery
- back in 5.7 h
- restore: 200 min; replay 24 h of log at 10×: 144 min; 344 min in all
- Standby, asynchronous
- back in 1 min
- promote it: 1 min
- Delayed replica, 1 h behind
- back in 7 min
- replay its 1 h of log at 10×: 6 min; promote it: 1 min
- FIRST 90 min, ZOOMED
- 0
- 15 min
- 30 min
- 45 min
- 1 h
- 75 min
- 90 min
- Full backups
- Point-in-time
- Standby
- Delayed replica
- RESTORE SPEED
- LOG REPLAY
- Backups and recovery: one disaster, what four recovery plans lose and how long each takes to serve again
- A timeline of one disaster and four recovery plans for a 2 TB database whose disks fail at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h; point-in-time recovery, the base backup plus the log archived every 1 min, loses up to 1 min; the asynchronous standby loses up to 5 s; the delayed replica, 1 h behind, loses up to 5 s. After it, serving again: full backups in 3.3 h; point-in-time recovery in 5.7 h; the standby in 1 min; the delayed replica in 7 min. A schematic, worst-case model.
- Play the disaster and the recovery
- The disaster
- Disks lost
- Table dropped
- Database
- 500 GB
- 2 TB
- 10 TB
- Change the disaster or any setting, or press Play to watch the disaster strike and each plan recover.
- Full backup every
- 24 h
- 6 h
- 1 h
- Log archived every
- 10 s
- 1 min
- 5 min
- Standby
- Async
- Sync
- Restore speed
- 10 GB/min
- 25 GB/min
- 50 GB/min
- Log replay
- 5×
- 10×
- 20×
- A schematic model, worst case: the disaster strikes just before the next full backup and the next log archive. Restores copy at a fixed speed; the log replays at a fixed multiple of the speed it was written; the standby runs a fixed 5 s behind and a promotion takes 1 min; the delayed replica receives the log 5 s behind and applies it 1 h behind, and the drop is noticed within that hour. After a drop the primary keeps serving: each plan recovers beside it, and copying the table back takes 1 min. Lower RPO and RTO cost more: more frequent full backups read the primary more often, and a sync standby adds a round trip to every commit. The clocks start when recovery starts: noticing the disaster, checking the data and repointing the application add to them.
- Describe
- 1 A replica is not a backup
- 2 Restore, then replay
- 3 Archive more often
- 4 Five times the data
- 5 A replica an hour behind
- One minute, one hour

#### after Table dropped

- A 2 TB database takes writes all day. At the worst moment, just before the next full
- backup, someone drops a table.
- Each plan is judged by two numbers: the writes it loses (RPO) and the time until the table is
- back (RTO).
- DROP
- table dropped
- keeps serving; only the table is gone
- a full copy every 24 h: the table as of that copy
- loses nothing · was 1 min
- cannot bring it back
- applies every change 5 s after the primary: the drop too
- loses nothing · was 5 s
- the drop waits in its log for 1 h before it applies
- TIME UNTIL THE TABLE IS BACK · RTO
- TIME AFTER THE DROP
- DROP
- table back in 3.4 h · was 3.3 h
- restore 2 TB beside the primary at 10 GB/min: 200 min; copy the table back: 1 min
- table back in 5.8 h · was 5.7 h
- restore beside the primary: 200 min; replay 24 h of log to just before the drop at 10×: 144 min; copy the table
- back: 1 min; 345 min in all
- never
- it has applied the drop too: no copy without it
- table back in 7 min
- pause it, replay its 1 h of log to just before the drop at 10×: 6 min; copy the table back: 1 min
- A timeline of one disaster and four recovery plans for a 2 TB database in which a table is dropped at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h of the table's writes; point-in-time recovery, the base backup plus the log archived every 1 min, loses nothing; the asynchronous standby cannot bring it back; the delayed replica, 1 h behind, loses nothing. After it, getting the table back: full backups in 3.4 h; point-in-time recovery in 5.8 h; the standby never; the delayed replica in 7 min. A schematic, worst-case model.
- With 2 TB and a table dropped, full backups lose up to 24 h of the table's writes and get the table back in 3.4 h; point-in-time recovery loses nothing and gets the table back in 5.8 h; the standby cannot bring the table back; the delayed replica loses nothing and gets the table back in 7 min.

#### after 10 TB

- A 10 TB database takes writes all day. At the worst moment, just before the next full
- loses nothing
- loses nothing
- table back in 16.7 h · was 3.4 h
- restore 10 TB beside the primary at 10 GB/min: 1,000 min; copy the table back: 1 min
- table back in 19.1 h · was 5.8 h
- restore beside the primary: 1,000 min; replay 24 h of log to just before the drop at 10×: 144 min; copy the table
- back: 1 min; 1,145 min in all
- A timeline of one disaster and four recovery plans for a 10 TB database in which a table is dropped at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h of the table's writes; point-in-time recovery, the base backup plus the log archived every 1 min, loses nothing; the asynchronous standby cannot bring it back; the delayed replica, 1 h behind, loses nothing. After it, getting the table back: full backups in 16.7 h; point-in-time recovery in 19.1 h; the standby never; the delayed replica in 7 min. A schematic, worst-case model.
- With 10 TB and a table dropped, full backups lose up to 24 h of the table's writes and get the table back in 16.7 h; point-in-time recovery loses nothing and gets the table back in 19.1 h; the standby cannot bring the table back; the delayed replica loses nothing and gets the table back in 7 min.

#### after 50 GB/min

- A 500 GB database takes writes all day. At the worst moment, just before the next full
- table back in 51 min · was 16.7 h
- restore 500 GB beside the primary at 10 GB/min: 50 min; copy the table back: 1 min
- table back in 3.3 h · was 19.1 h
- restore beside the primary: 50 min; replay 24 h of log to just before the drop at 10×: 144 min; copy the table
- back: 1 min; 195 min in all
- A timeline of one disaster and four recovery plans for a 500 GB database in which a table is dropped at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h of the table's writes; point-in-time recovery, the base backup plus the log archived every 1 min, loses nothing; the asynchronous standby cannot bring it back; the delayed replica, 1 h behind, loses nothing. After it, getting the table back: full backups in 51 min; point-in-time recovery in 3.3 h; the standby never; the delayed replica in 7 min. A schematic, worst-case model.
- With 500 GB and a table dropped, full backups lose up to 24 h of the table's writes and get the table back in 51 min; point-in-time recovery loses nothing and gets the table back in 3.3 h; the standby cannot bring the table back; the delayed replica loses nothing and gets the table back in 7 min.

#### after 6 h

- table back in 11 min · was 51 min
- restore 500 GB beside the primary at 50 GB/min: 10 min; copy the table back: 1 min
- table back in 2.6 h · was 3.3 h
- restore beside the primary: 10 min; replay 24 h of log to just before the drop at 10×: 144 min; copy the table
- back: 1 min; 155 min in all
- A timeline of one disaster and four recovery plans for a 500 GB database in which a table is dropped at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h of the table's writes; point-in-time recovery, the base backup plus the log archived every 1 min, loses nothing; the asynchronous standby cannot bring it back; the delayed replica, 1 h behind, loses nothing. After it, getting the table back: full backups in 11 min; point-in-time recovery in 2.6 h; the standby never; the delayed replica in 7 min. A schematic, worst-case model.
- With 500 GB and a table dropped, full backups lose up to 24 h of the table's writes and get the table back in 11 min; point-in-time recovery loses nothing and gets the table back in 2.6 h; the standby cannot bring the table back; the delayed replica loses nothing and gets the table back in 7 min.

#### after 1 h

- loses 6 h · was 24 h
- a full copy every 6 h: the table as of that copy
- table back in 11 min
- table back in 47 min · was 2.6 h
- restore beside the primary: 10 min; replay 6 h of log to just before the drop at 10×: 36 min; copy the table back:
- 1 min; 47 min in all
- A timeline of one disaster and four recovery plans for a 500 GB database in which a table is dropped at the worst moment. Before the disaster, on a log scale: full backups every 6 h lose up to 6 h of the table's writes; point-in-time recovery, the base backup plus the log archived every 1 min, loses nothing; the asynchronous standby cannot bring it back; the delayed replica, 1 h behind, loses nothing. After it, getting the table back: full backups in 11 min; point-in-time recovery in 47 min; the standby never; the delayed replica in 7 min. A schematic, worst-case model.
- With 500 GB and a table dropped, full backups lose up to 6 h of the table's writes and get the table back in 11 min; point-in-time recovery loses nothing and gets the table back in 47 min; the standby cannot bring the table back; the delayed replica loses nothing and gets the table back in 7 min.

#### after 10 s

- loses 1 h
- a full copy every 1 h: the table as of that copy
- the base backup, then the log archived every 10 s
- table back in 17 min
- restore beside the primary: 10 min; replay 1 h of log to just before the drop at 10×: 6 min; copy the table back:
- 1 min; 17 min in all
- A timeline of one disaster and four recovery plans for a 500 GB database in which a table is dropped at the worst moment. Before the disaster, on a log scale: full backups every 1 h lose up to 1 h of the table's writes; point-in-time recovery, the base backup plus the log archived every 10 s, loses nothing; the asynchronous standby cannot bring it back; the delayed replica, 1 h behind, loses nothing. After it, getting the table back: full backups in 11 min; point-in-time recovery in 17 min; the standby never; the delayed replica in 7 min. A schematic, worst-case model.
- With 500 GB and a table dropped, full backups lose up to 1 h of the table's writes and get the table back in 11 min; point-in-time recovery loses nothing and gets the table back in 17 min; the standby cannot bring the table back; the delayed replica loses nothing and gets the table back in 7 min.

#### after Sync

- the base backup, then the log archived every 5 min
- Standby, synchronous
- applies every change with the primary: the drop too
- Standby, synchronous
- A timeline of one disaster and four recovery plans for a 500 GB database in which a table is dropped at the worst moment. Before the disaster, on a log scale: full backups every 1 h lose up to 1 h of the table's writes; point-in-time recovery, the base backup plus the log archived every 5 min, loses nothing; the synchronous standby cannot bring it back; the delayed replica, 1 h behind, loses nothing. After it, getting the table back: full backups in 11 min; point-in-time recovery in 17 min; the standby never; the delayed replica in 7 min. A schematic, worst-case model.
- With 500 GB and a table dropped, full backups lose up to 1 h of the table's writes and get the table back in 11 min; point-in-time recovery loses nothing and gets the table back in 17 min; the synchronous standby cannot bring the table back; the delayed replica loses nothing and gets the table back in 7 min.

#### after 2 TB

- A 500 GB database takes writes all day. Its disks fail at the worst moment: just before
- the next full backup and the next log archive.
- a full copy every 1 h, in another account
- loses 5 min · was 0 s
- the primary waits for it on every commit
- loses 5 s · was 0 s
- back in 10 min · was 11 min
- restore 500 GB at 50 GB/min: 10 min
- back in 16 min · was 17 min
- restore: 10 min; replay 1 h of log at 10×: 6 min; 16 min in all
- A timeline of one disaster and four recovery plans for a 500 GB database whose disks fail at the worst moment. Before the disaster, on a log scale: full backups every 1 h lose up to 1 h; point-in-time recovery, the base backup plus the log archived every 5 min, loses up to 5 min; the synchronous standby loses nothing; the delayed replica, 1 h behind, loses up to 5 s. After it, serving again: full backups in 10 min; point-in-time recovery in 16 min; the standby in 1 min; the delayed replica in 7 min. A schematic, worst-case model.
- With 500 GB and the disks lost, full backups lose up to 1 h and serve again in 10 min; point-in-time recovery loses up to 5 min and serves again in 16 min; the synchronous standby loses nothing and serves again in 1 min; the delayed replica loses up to 5 s and serves again in 7 min.

#### after 24 h

- loses 5 min
- back in 40 min · was 10 min
- restore 2 TB at 50 GB/min: 40 min
- back in 46 min · was 16 min
- restore: 40 min; replay 1 h of log at 10×: 6 min; 46 min in all
- A timeline of one disaster and four recovery plans for a 2 TB database whose disks fail at the worst moment. Before the disaster, on a log scale: full backups every 1 h lose up to 1 h; point-in-time recovery, the base backup plus the log archived every 5 min, loses up to 5 min; the synchronous standby loses nothing; the delayed replica, 1 h behind, loses up to 5 s. After it, serving again: full backups in 40 min; point-in-time recovery in 46 min; the standby in 1 min; the delayed replica in 7 min. A schematic, worst-case model.
- With 2 TB and the disks lost, full backups lose up to 1 h and serve again in 40 min; point-in-time recovery loses up to 5 min and serves again in 46 min; the synchronous standby loses nothing and serves again in 1 min; the delayed replica loses up to 5 s and serves again in 7 min.

#### after 1 min

- loses 1 min · was 5 min
- back in 40 min
- back in 3.1 h
- restore: 40 min; replay 24 h of log at 10×: 144 min; 184 min in all
- A timeline of one disaster and four recovery plans for a 2 TB database whose disks fail at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h; point-in-time recovery, the base backup plus the log archived every 1 min, loses up to 1 min; the synchronous standby loses nothing; the delayed replica, 1 h behind, loses up to 5 s. After it, serving again: full backups in 40 min; point-in-time recovery in 3.1 h; the standby in 1 min; the delayed replica in 7 min. A schematic, worst-case model.
- With 2 TB and the disks lost, full backups lose up to 24 h and serve again in 40 min; point-in-time recovery loses up to 1 min and serves again in 3.1 h; the synchronous standby loses nothing and serves again in 1 min; the delayed replica loses up to 5 s and serves again in 7 min.

#### after 10 GB/min

- A timeline of one disaster and four recovery plans for a 2 TB database whose disks fail at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h; point-in-time recovery, the base backup plus the log archived every 1 min, loses up to 1 min; the asynchronous standby loses up to 5 s; the delayed replica, 1 h behind, loses up to 5 s. After it, serving again: full backups in 40 min; point-in-time recovery in 3.1 h; the standby in 1 min; the delayed replica in 7 min. A schematic, worst-case model.
- With 2 TB and the disks lost, full backups lose up to 24 h and serve again in 40 min; point-in-time recovery loses up to 1 min and serves again in 3.1 h; the standby loses up to 5 s and serves again in 1 min; the delayed replica loses up to 5 s and serves again in 7 min.

#### Describe

- back in 3.3 h · was 40 min
- back in 5.7 h · was 3.1 h
- Each plan against each disaster, for these settings
- With 2 TB and the disks lost, full backups lose up to 24 h and serve again in 3.3 h; point-in-time recovery loses up to 1 min and serves again in 5.7 h; the standby loses up to 5 s and serves again in 1 min; the delayed replica loses up to 5 s and serves again in 7 min.
- Hide the description
- Plan
- Disaster
- Loses (RPO)
- Back in (RTO)
- 3.3 h
- 5.7 h
- 5 s
- 5 s
- 7 min
- a dropped table
- 3.4 h
- a dropped table
- nothing
- 5.8 h
- a dropped table
- the table
- a dropped table
- nothing
- 7 min
- Rows are this setting's: 2 TB restored at 10 GB/min, a full backup every 24 h, the log archived every 1 min and replayed at 10×, the standby 5 s behind. Worst case, from a schematic model.

#### Play, Table dropped

- Written below the picture.
- A table is dropped just before the next full backup of this 2 TB database, and the primary keeps serving. Full backups lose up to 24 h of the table's writes and get the table back in 3.4 h, restoring 2 TB beside the primary at 10 GB/min and copying the table back. Point-in-time recovery replays to just before the drop and loses nothing; it restores the same base backup beside the primary, then replays 24 h of log at 10×, and gets the table back in 5.8 h. The standby applies the drop 5 s after it and cannot bring the table back. The delayed replica holds the drop in its log for 1 h: paused in time, it loses nothing and gets the table back in 7 min.
- A table is dropped just before the next full backup of this 2 TB database, and the primary keeps serving. Full backups lose up to 24 h of the table's writes and get the table back in 3.4 h, restoring 2 TB beside the primary at 10 GB/min and copying the table back. Point-in-time recovery replays to just before the drop and loses nothing; it restores the same base backup beside the primary, then replays 24 h of log at 10×, and gets the table back in 5.8 h. The standby applies the drop 5 s after it and cannot bring the table back. The delayed replica holds the drop in its log for 1 h: paused in time, it loses nothing and gets the table back in 7 min.

#### experiment 1 asking

- loses 1 min · was 0 s
- back in 3.3 h · was 3.4 h
- back in 5.7 h · was 5.8 h

#### experiment 1 revealed

- table back in 3.4 h
- table back in 5.8 h
- Look here
- Look here
- Experiment: A replica is not a backup
- Just before the nightly full backup, someone drops the orders table. The standby applies every change 5 s after the primary does. What can the standby bring back?
- your answer, wrong
- correct answer
- done
- Nothing: a standby copies every change within seconds, the drop included, so 5 s after the primary loses the table, the standby loses it too. A replica protects against losing a machine, not against losing the data: a bad migration or ransomware reaches it the same way. Point-in-time recovery, restored beside the primary, stops just before the drop and loses nothing, but gets the table back only in 5.8 h. The delayed replica, which applies the log 1 h behind, still holds the table. So keep backups immutable in another account, retained long enough to reach back before a mistake noticed weeks later.

#### experiment 2 asking

- A 10 TB database takes writes all day. Its disks fail at the worst moment: just before
- loses 6 h
- a full copy every 6 h, in another account
- restore 10 TB at 50 GB/min: 200 min
- back in ?
- Its time to serve again shows after your answer.
- back in 13 min
- replay its 1 h of log at 5×: 12 min; promote it: 1 min
- A timeline of one disaster and four recovery plans for a 10 TB database whose disks fail at the worst moment. Before the disaster, on a log scale: full backups every 6 h lose up to 6 h; point-in-time recovery, the base backup plus the log archived every 1 min, loses up to 1 min; the asynchronous standby loses up to 5 s; the delayed replica, 1 h behind, loses up to 5 s. After it, serving again: full backups in 3.3 h; point-in-time recovery: after your answer; the standby in 1 min; the delayed replica in 13 min. A schematic, worst-case model.
- Play the disaster and the recovery, after your answer
- Experiment: Restore, then replay
- Play and every setting wait for your answer.
- A schematic model. Its assumptions show after your answer.
- Describe waits for your answer.
- A 10 TB database restores at 50 GB/min. A full base backup runs every 6 h, the log is archived every 1 min, and replay runs 5× as fast as the writes came in. The disks fail just before the next base backup. How long until point-in-time recovery serves again?
- 3.3 h: the restore, since the log replays while the backup copies
- 4.5 h: the restore, then 6 h of log at 5×
- 8.1 h: the restore, then the day's 24 h of log at 5×

#### experiment 2 revealed

- back in 4.5 h
- restore: 200 min; replay 6 h of log at 5×: 72 min; 272 min in all
- A timeline of one disaster and four recovery plans for a 10 TB database whose disks fail at the worst moment. Before the disaster, on a log scale: full backups every 6 h lose up to 6 h; point-in-time recovery, the base backup plus the log archived every 1 min, loses up to 1 min; the asynchronous standby loses up to 5 s; the delayed replica, 1 h behind, loses up to 5 s. After it, serving again: full backups in 3.3 h; point-in-time recovery in 4.5 h; the standby in 1 min; the delayed replica in 13 min. A schematic, worst-case model.
- your answer, correct
- With 10 TB and the disks lost, full backups lose up to 6 h and serve again in 3.3 h; point-in-time recovery loses up to 1 min and serves again in 4.5 h; the standby loses up to 5 s and serves again in 1 min; the delayed replica loses up to 5 s and serves again in 13 min.
- Replay can start only once the restore is done, and it must apply every change since the base backup: 200 min to copy 10 TB at 50 GB/min, then 6 h of log at 5×, 72 min, so 272 min in all, 4.5 h. The size and the restore speed set the first term. The second is the log since the newest base backup, 6 h here and not the whole day, at the replay speed. Only the last 1 min of writes, not yet archived, is lost.

#### experiment 3 asking

- Experiment: Archive more often
- Point-in-time recovery here loses up to 1 min of writes and serves again in 5.7 h. Archive the log every 10 s instead. What changes?
- Only the loss, to 10 s: the replay still starts at the base backup
- Both: 10 s lost, and smaller pieces of log replay sooner
- Neither: the full backups set how much is lost

#### experiment 3 revealed

- loses 10 s · was 1 min
- A timeline of one disaster and four recovery plans for a 2 TB database whose disks fail at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h; point-in-time recovery, the base backup plus the log archived every 10 s, loses up to 10 s; the asynchronous standby loses up to 5 s; the delayed replica, 1 h behind, loses up to 5 s. After it, serving again: full backups in 3.3 h; point-in-time recovery in 5.7 h; the standby in 1 min; the delayed replica in 7 min. A schematic, worst-case model.
- With 2 TB and the disks lost, full backups lose up to 24 h and serve again in 3.3 h; point-in-time recovery loses up to 10 s and serves again in 5.7 h; the standby loses up to 5 s and serves again in 1 min; the delayed replica loses up to 5 s and serves again in 7 min.
- Only the loss: 10 s instead of 1 min. The archive interval is how much log a dead disk can take with it. Recovery still restores the base backup and replays all 24 h of log since it, cut into more pieces but no shorter, so it serves again in 5.7 h as before. Archiving more often costs more stored objects and requests; streaming the log as it is written takes the loss to about a second.

#### experiment 4 asking

- Experiment: Five times the data
- The database grows from 2 TB to 10 TB, with the same backups, standbys, restore speed and replay. Whose recovery time grows?
- Every plan's: there is five times the data to bring back
- Only point-in-time recovery's: five times the log to replay
- The two that restore a backup: they copy every byte back

#### experiment 4 revealed

- back in 16.7 h · was 3.3 h
- restore 10 TB at 10 GB/min: 1,000 min
- back in 19.1 h · was 5.7 h
- restore: 1,000 min; replay 24 h of log at 10×: 144 min; 1,144 min in all
- A timeline of one disaster and four recovery plans for a 10 TB database whose disks fail at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h; point-in-time recovery, the base backup plus the log archived every 1 min, loses up to 1 min; the asynchronous standby loses up to 5 s; the delayed replica, 1 h behind, loses up to 5 s. After it, serving again: full backups in 16.7 h; point-in-time recovery in 19.1 h; the standby in 1 min; the delayed replica in 7 min. A schematic, worst-case model.
- With 10 TB and the disks lost, full backups lose up to 24 h and serve again in 16.7 h; point-in-time recovery loses up to 1 min and serves again in 19.1 h; the standby loses up to 5 s and serves again in 1 min; the delayed replica loses up to 5 s and serves again in 7 min.
- The two that restore a backup: full backups go from 3.3 h to 16.7 h and point-in-time recovery from 5.7 h to 19.1 h, because copying 10 TB at 10 GB/min takes 16.7 h. The log to replay is the writes since the base backup, which do not grow with the size, and the standbys already hold every byte: they serve again in 1 min and 7 min as before. A large database restores faster from a volume snapshot, back in minutes though slow until its blocks load, or fails over to a replica.

#### experiment 5 asking

- loses ?
- What it can bring back shows after your answer.
- table back in 8.2 h
- restore beside the primary: 200 min; replay 24 h of log to just before the drop at 5×: 288 min; copy the table
- back: 1 min; 489 min in all
- table back in ?
- Whether and when it gets the table back shows after your answer.
- A timeline of one disaster and four recovery plans for a 2 TB database in which a table is dropped at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h of the table's writes; point-in-time recovery, the base backup plus the log archived every 1 min, loses nothing; the asynchronous standby cannot bring it back; the delayed replica: what it can bring back shows after your answer. After it, getting the table back: full backups in 3.4 h; point-in-time recovery in 8.2 h; the standby never; the delayed replica: after your answer. A schematic, worst-case model.
- Experiment: A replica an hour behind
- Someone drops a table just before the nightly backup and notices within minutes. A delayed replica receives the log 5 s after the primary writes it but applies it only 1 h later, and its replay runs 5× as fast as the writes came in. How soon can it give the table back, at the earliest, and how much is lost?
- 13 min, nothing lost: pause it before it applies the drop, roll it forward to just before, copy the table back
- 73 min, nothing lost: its 1 h delay cannot be skipped, so it must wait out the hour before replaying
- Nothing: like the standby, it applies the drop and loses the table

#### experiment 5 revealed

- table back in 13 min
- pause it, replay its 1 h of log to just before the drop at 5×: 12 min; copy the table back: 1 min
- A timeline of one disaster and four recovery plans for a 2 TB database in which a table is dropped at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h of the table's writes; point-in-time recovery, the base backup plus the log archived every 1 min, loses nothing; the asynchronous standby cannot bring it back; the delayed replica, 1 h behind, loses nothing. After it, getting the table back: full backups in 3.4 h; point-in-time recovery in 8.2 h; the standby never; the delayed replica in 13 min. A schematic, worst-case model.
- With 2 TB and a table dropped, full backups lose up to 24 h of the table's writes and get the table back in 3.4 h; point-in-time recovery loses nothing and gets the table back in 8.2 h; the standby cannot bring the table back; the delayed replica loses nothing and gets the table back in 13 min.
- The table is back in 13 min with nothing lost: the drop sits in its log, received but not applied, for 1 h. The delay only holds back applying, so pause it before it applies the drop and replay what it has received, up to just before the drop, as fast as it can: at most 1 h of log at 5×, 12 min. Then copy the table back in 1 min, while the primary keeps serving. Point-in-time recovery gets the same table back in 8.2 h. The catch is the hour: a drop noticed later has reached this replica too, which is why it adds to backups and never replaces them.

#### challenge after 50 GB/min

- 1 min goal
- back in 40 min · was 3.3 h
- back in 3.1 h · was 5.7 h
- 1 h goal
- Experiment: One minute, one hour
- Describe waits until you meet the goal.
- ✓point-in-time recovery loses at most 1 min (now up to 1 min): met
- ·point-in-time recovery serves again in under 1 h (now 3.1 h): not yet
- ✓no more than one full backup every 6 h (now every 24 h): met

#### challenge after 6 h

- back in 76 min · was 3.1 h
- restore: 40 min; replay 6 h of log at 10×: 36 min; 76 min in all
- A timeline of one disaster and four recovery plans for a 2 TB database whose disks fail at the worst moment. Before the disaster, on a log scale: full backups every 6 h lose up to 6 h; point-in-time recovery, the base backup plus the log archived every 1 min, loses up to 1 min; the asynchronous standby loses up to 5 s; the delayed replica, 1 h behind, loses up to 5 s. After it, serving again: full backups in 40 min; point-in-time recovery in 76 min; the standby in 1 min; the delayed replica in 7 min. A schematic, worst-case model.
- With 2 TB and the disks lost, full backups lose up to 6 h and serve again in 40 min; point-in-time recovery loses up to 1 min and serves again in 76 min; the standby loses up to 5 s and serves again in 1 min; the delayed replica loses up to 5 s and serves again in 7 min.
- ·point-in-time recovery serves again in under 1 h (now 76 min): not yet
- ✓no more than one full backup every 6 h (now every 6 h): met

#### challenge after 10×

- back in 58 min · was 76 min
- restore: 40 min; replay 6 h of log at 20×: 18 min; 58 min in all
- back in 4 min · was 7 min
- replay its 1 h of log at 20×: 3 min; promote it: 1 min
- A timeline of one disaster and four recovery plans for a 2 TB database whose disks fail at the worst moment. Before the disaster, on a log scale: full backups every 6 h lose up to 6 h; point-in-time recovery, the base backup plus the log archived every 1 min, loses up to 1 min; the asynchronous standby loses up to 5 s; the delayed replica, 1 h behind, loses up to 5 s. After it, serving again: full backups in 40 min; point-in-time recovery in 58 min; the standby in 1 min; the delayed replica in 4 min. A schematic, worst-case model.
- With 2 TB and the disks lost, full backups lose up to 6 h and serve again in 40 min; point-in-time recovery loses up to 1 min and serves again in 58 min; the standby loses up to 5 s and serves again in 1 min; the delayed replica loses up to 5 s and serves again in 4 min.
- Goal met:
- ✓point-in-time recovery serves again in under 1 h (now 58 min): met
- Restore at 50 GB/min, a full backup every 6 h and replay at 20×: 40 min to restore 2 TB, then at most 6 h of log in 18 min, 58 min in all; with the log archived every 1 min or more often, it loses at most that. At 10× the replay alone takes 36 min and misses the hour; hourly full backups would make it, but read 2 TB from the primary 24 times a day. At 10 TB nothing here meets the hour: copying it at 50 GB/min takes 3.3 h alone. So large databases restore from volume snapshots, or fail over to a standby for the dead disk and a delayed replica for the bad delete, and keep point-in-time recovery for the rest. And a recovery time is real only once a drill has measured it.

## Desktop, with motion

#### after 10 s

- loses 1 h · was 6 h
- table back in 17 min · was 47 min
- A timeline of one disaster and four recovery plans for a 500 GB database in which a table is dropped at the worst moment. Before the disaster, on a log scale: full backups every 1 h lose up to 1 h of the table's writes; point-in-time recovery, the base backup plus the log archived every 1 min, loses nothing; the asynchronous standby cannot bring it back; the delayed replica, 1 h behind, loses nothing. After it, getting the table back: full backups in 11 min; point-in-time recovery in 17 min; the standby never; the delayed replica in 7 min. A schematic, worst-case model.

#### after Sync

- A timeline of one disaster and four recovery plans for a 500 GB database in which a table is dropped at the worst moment. Before the disaster, on a log scale: full backups every 1 h lose up to 1 h of the table's writes; point-in-time recovery, the base backup plus the log archived every 5 min, loses nothing; the asynchronous standby cannot bring it back; the delayed replica, 1 h behind, loses nothing. After it, getting the table back: full backups in 11 min; point-in-time recovery in 17 min; the standby never; the delayed replica in 7 min. A schematic, worst-case model.

#### after 1 min

- loses 24 h · was 1 h
- back in 3.1 h · was 46 min
- A timeline of one disaster and four recovery plans for a 2 TB database whose disks fail at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h; point-in-time recovery, the base backup plus the log archived every 5 min, loses up to 5 min; the synchronous standby loses nothing; the delayed replica, 1 h behind, loses up to 5 s. After it, serving again: full backups in 40 min; point-in-time recovery in 3.1 h; the standby in 1 min; the delayed replica in 7 min. A schematic, worst-case model.
- With 2 TB and the disks lost, full backups lose up to 24 h and serve again in 40 min; point-in-time recovery loses up to 5 min and serves again in 3.1 h; the synchronous standby loses nothing and serves again in 1 min; the delayed replica loses up to 5 s and serves again in 7 min.

#### playing, Disks lost

- The day before: full backups, the archived log and both replicas copy every write.
- takes writes all day
- restore 2 TB at 10 GB/min: …
- restore: …; replay 24 h of log at 10×: …
- promote it: …
- replay its 1 h of log at 10×: …; promote it: …
- Stop the disaster and the recovery
- The day before: full backups, the archived log and both replicas copy every write.

#### playing, Disks lost

- The disks fail: everything on the primary is gone.
- The disks fail: everything on the primary is gone.

#### playing, Disks lost

- Each plan's recovery point: the newest moment it can bring back.
- Each plan's recovery point: the newest moment it can bring back.

#### playing, Disks lost

- Recovering: 23 min after the disaster.
- NOW 23 min AFTER THE DISASTER
- recovering
- recovering
- Recovering after the disaster.

#### playing, Disks lost

- Recovering: 66 min after the disaster.
- NOW 66 min AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 1.9 h after the disaster.
- NOW 1.9 h AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 2.6 h after the disaster.
- NOW 2.6 h AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 3.4 h after the disaster.
- NOW 3.4 h AFTER THE DISASTER
- restore: 200 min; replay 24 h of log at 10×: …

#### playing, Disks lost

- Recovering: 4.1 h after the disaster.
- NOW 4.1 h AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 4.8 h after the disaster.
- NOW 4.8 h AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 5.6 h after the disaster.
- NOW 5.6 h AFTER THE DISASTER

#### playing, Disks lost

- Point-in-time recovery serves last, 5.7 h after the disaster.

#### playing, Table dropped

- restore 2 TB beside the primary at 10 GB/min: …; copy the table back: …
- restore beside the primary: …; replay 24 h of log to just before the drop at 10×: …; copy the table back: …
- pause it, replay its 1 h of log to just before the drop at 10×: …; copy the table back: …

#### playing, Table dropped

- A table is dropped, and every copy that applies the change loses it too.
- A table is dropped, and every copy that applies the change loses it too.

#### playing, Table dropped

- Recovering: 23 min after the drop.
- NOW 23 min AFTER THE DROP
- Recovering after the drop.

#### playing, Table dropped

- Recovering: 70 min after the drop.
- NOW 70 min AFTER THE DROP

#### playing, Table dropped

- Recovering: 1.9 h after the drop.
- NOW 1.9 h AFTER THE DROP

#### playing, Table dropped

- Recovering: 2.6 h after the drop.
- NOW 2.6 h AFTER THE DROP

#### playing, Table dropped

- Recovering: 3.4 h after the drop.
- NOW 3.4 h AFTER THE DROP
- restore beside the primary: 200 min; replay 24 h of log to just before the drop at 10×: …; copy the table back: …

#### playing, Table dropped

- Recovering: 4.2 h after the drop.
- NOW 4.2 h AFTER THE DROP

#### playing, Table dropped

- Recovering: 4.9 h after the drop.
- NOW 4.9 h AFTER THE DROP

#### playing, Table dropped

- Recovering: 5.7 h after the drop.
- NOW 5.7 h AFTER THE DROP

#### playing, Table dropped

- Point-in-time recovery gets the table back last, 5.8 h after the drop.

#### experiment 1 playing

- A timeline of one disaster and four recovery plans for a 2 TB database in which a table is dropped at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h of the table's writes; point-in-time recovery, the base backup plus the log archived every 1 min, loses nothing; the standby: what it can bring back shows after your answer; the delayed replica: what it can bring back shows after your answer. After it, getting the table back: full backups in 3.4 h; point-in-time recovery in 5.8 h; the standby: after your answer; the delayed replica: after your answer. A schematic, worst-case model.
- Watch the picture: the answer plays out on it.

#### experiment 1 playing

- Recovering after the drop: the times show after your answer.
- Recovering after the drop: the times show after your answer.

#### experiment 2 playing

- restore 10 TB at 50 GB/min: …
- replay its 1 h of log at 5×: …; promote it: …

#### experiment 2 playing

- Recovering after the disaster: the times show after your answer.
- Recovering after the disaster: the times show after your answer.

#### experiment 3 playing

- the base backup, then the log archived
- A timeline of one disaster and four recovery plans for a 2 TB database whose disks fail at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h; point-in-time recovery, the base backup plus the archived log: its loss shows after your answer; the asynchronous standby loses up to 5 s; the delayed replica, 1 h behind, loses up to 5 s. After it, serving again: full backups in 3.3 h; point-in-time recovery: after your answer; the standby in 1 min; the delayed replica in 7 min. A schematic, worst-case model.

#### experiment 4 playing

- A timeline of one disaster and four recovery plans for a 10 TB database whose disks fail at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h; point-in-time recovery, the base backup plus the log archived every 1 min, loses up to 1 min; the asynchronous standby loses up to 5 s; the delayed replica, 1 h behind, loses up to 5 s. After it, serving again: full backups: after your answer; point-in-time recovery: after your answer; the standby: after your answer; the delayed replica: after your answer. A schematic, worst-case model.

#### experiment 5 playing

- restore beside the primary: …; replay 24 h of log to just before the drop at 5×: …; copy the table back: …

## Phone, 320 px

#### at rest

- One disaster, four plans
- A 2 TB database takes
- writes all day. Its disks fail
- at the worst moment: just
- before the next full backup
- and the next log archive.
- Each plan is judged by two
- numbers: the writes it loses (RPO)
- and the time until it serves
- its disks fail at the worst moment
- a full copy every 24 h
- base backup, log every 1 min
- 5 s behind the primary
- log in 5 s, applied 1 h later
- UNTIL IT SERVES AGAIN · RTO
- restore: 200 min; replay 24 h of log at 10×:
- 144 min; 344 min in all
- replay its 1 h of log at 10×: 6 min; promote
- it: 1 min

#### after Table dropped

- writes all day. At the worst
- moment, just before the
- next full backup, someone
- drops a table.
- and the time until the table is
- applies the drop too
- the drop waits 1 h in its log
- UNTIL THE TABLE IS BACK · RTO
- 3.4 h · was 3.3 h
- restore 2 TB beside the primary
- at 10 GB/min: 200 min; copy the table
- back: 1 min
- 5.8 h · was 5.7 h
- restore beside the primary: 200 min;
- replay 24 h of log to just before the drop
- at 10×: 144 min; copy the table back: 1 min;
- 345 min in all
- it has applied the drop too: no copy
- without it
- pause it, replay its 1 h of log to just before
- the drop at 10×: 6 min; copy the table
- back: 1 min

#### after 500 GB

- A 10 TB database takes
- 16.7 h · was 3.4 h
- restore 10 TB beside the primary
- at 10 GB/min: 1,000 min; copy the table
- 19.1 h · was 5.8 h
- restore beside the primary: 1,000 min;
- 1,145 min in all

#### after 50 GB/min

- A 500 GB database takes
- 51 min · was 16.7 h
- restore 500 GB beside the primary
- at 10 GB/min: 50 min; copy the table back:
- 3.3 h · was 19.1 h
- restore beside the primary: 50 min; replay
- 24 h of log to just before the drop at 10×:
- 144 min; copy the table back: 1 min;
- 195 min in all

#### after 6 h

- 11 min · was 51 min
- at 50 GB/min: 10 min; copy the table back:
- 2.6 h · was 3.3 h
- restore beside the primary: 10 min; replay
- 155 min in all

#### after 1 h

- 6 h · was 24 h
- a full copy every 6 h
- 47 min · was 2.6 h
- 6 h of log to just before the drop at 10×:
- 36 min; copy the table back: 1 min; 47 min
- in all

#### after 10 s

- a full copy every 1 h
- base backup, log every 10 s
- 1 h of log to just before the drop at 10×:
- 6 min; copy the table back: 1 min; 17 min

#### after Sync

- base backup, log every 5 min

#### after Disks lost

- 5 min · was 0 s
- 5 s · was 0 s
- 10 min · was 11 min
- 16 min · was 17 min
- restore: 10 min; replay 1 h of log at 10×:
- 6 min; 16 min in all

#### after 24 h

- 24 h · was 1 h
- 3.1 h · was 46 min
- restore: 40 min; replay 24 h of log at 10×:
- 144 min; 184 min in all

#### after Async

- 1 min · was 5 min

#### Describe

- 3.3 h · was 40 min
- 5.7 h · was 3.1 h

#### experiment 1 asking

- 1 min · was 0 s
- 3.3 h · was 3.4 h
- 5.7 h · was 5.8 h

#### experiment 2 revealed

- restore: 200 min; replay 6 h of log at 5×:
- 72 min; 272 min in all
- replay its 1 h of log at 5×: 12 min; promote

#### experiment 3 revealed

- 10 s · was 1 min

#### experiment 4 revealed

- 16.7 h · was 3.3 h
- 19.1 h · was 5.7 h
- restore: 1,000 min; replay 24 h of log
- at 10×: 144 min; 1,144 min in all

#### experiment 5 revealed

- at 5×: 288 min; copy the table back: 1 min;
- 489 min in all
- 13 min
- the drop at 5×: 12 min; copy the table back:

#### challenge after 50 GB/min

- ·point-in-time recovery serves again in under 1 h (now 5.7 h): not yet

#### challenge after 6 h

- 76 min · was 3.1 h
- restore: 40 min; replay 6 h of log at 10×:
- 36 min; 76 min in all

#### challenge after 10×

- 58 min · was 76 min
- restore: 40 min; replay 6 h of log at 20×:
- 18 min; 58 min in all
- 4 min · was 7 min
- replay its 1 h of log at 20×: 3 min; promote

