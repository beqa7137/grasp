# Backups & Recovery widget: every string

Generated from the built widget (`recovery`) by a browser walk, and the experiments from the engine build.

## Experiments

### A dropped table

Ask: Just before the nightly full backup, someone drops the orders table. The standby applies every change 5 s after the primary does. What can the standby bring back?

- The table as it was 5 s before the drop: it runs 5 s behind
- Everything but the last 5 s of writes, as after a dead disk
- (answer) Nothing: it applies the drop 5 s after the primary does

Reveal: Nothing: a replica is not a backup. A standby copies every change within seconds, the drop included, so 5 s after the primary loses the table, the standby loses it too. It protects against losing a machine, not against losing the data: a bad migration or ransomware reaches it the same way, so keep backups immutable in another account, retained long enough to reach back before a mistake noticed weeks later. Point-in-time recovery, restored beside the primary, stops just before the drop and loses nothing, but gets the table back only in 5.8 h.

### Ten terabytes, disks lost

Ask: A 10 TB database restores at 50 GB/min. A full backup runs every 6 h, the log is archived every 1 min, and replay runs 5× as fast as the writes came in. The disks fail just before the next full backup. How long until point-in-time recovery serves again?

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

Reveal: The two that restore a backup: full backups go from 3.3 h to 16.7 h and point-in-time recovery from 5.7 h to 19.1 h, because copying 10 TB at 10 GB/min takes 16.7 h. The log to replay is the writes since the base backup, which depend on the write rate, here unchanged, not on the size, and the standbys already hold every byte: they serve again in 1 min and 7 min as before. A large database restores faster from a volume snapshot, back in minutes though slow until its blocks load, or fails over to a replica.

### A replica an hour behind

Ask: Someone drops a table just before the nightly full backup and notices within minutes. A delayed replica receives the log 5 s after the primary writes it but applies it only 1 h later, and its replay runs 5× as fast as the writes came in. How soon can it give the table back, at the earliest, and how much is lost?

- (answer) 13 min, nothing lost: pause it before it applies the drop, roll it forward to just before, copy the table back
- 73 min, nothing lost: its 1 h delay cannot be skipped, so it must wait out the hour before replaying
- Never: like the standby, it applies the drop and loses the table

Reveal: The table is back in 13 min with nothing lost: the drop sits in its log, received but not applied, for 1 h. The delay only holds back applying, so pause it before it applies the drop and replay what it has received, up to just before the drop, as fast as it can: at most 1 h of log at 5×, 12 min. Then copy the table back in 1 min, while the primary keeps serving. Point-in-time recovery gets the same table back in 8.2 h. The catch is the hour: a drop noticed later has reached this replica too, which is why it adds to backups and never replaces them.

### One minute, one hour

Ask: Meet an RPO of 1 min and an RTO of 1 h for this 2 TB database with point-in-time recovery: tune the restore speed, the full backups and the replay. Each full backup reads all 2 TB from the primary, so run one no more often than every 6 h.


Reveal: Restore at 50 GB/min, a full backup every 6 h and replay at 20×: 40 min to restore 2 TB, then at most 6 h of log in 18 min, 58 min in all; with the log archived every 1 min or more often, it loses at most that. At 10× the replay takes 36 min, 76 min in all with the restore, and misses the hour; hourly full backups would make it, but read 2 TB from the primary 24 times a day, unless they are incremental or taken from a standby. At 10 TB nothing here meets the hour: copying it at 50 GB/min takes 3.3 h alone. So large databases restore from volume snapshots, or fail over to a standby for the dead disk and a delayed replica for the bad delete, and keep point-in-time recovery for the rest. And a recovery time is real only once a drill has measured it.

## Desktop, Reduced motion

#### at rest

- The disaster
- Disks lost
- Table dropped
- Database
- 500 GB
- 2 TB
- 10 TB
- Change the disaster or any setting, or press Play to watch the disaster strike and each plan recover.
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
- receives the log 5 s after the primary, applies it 1 h later
- FULL BACKUP EVERY
- LOG ARCHIVED EVERY
- STANDBY
- TIME UNTIL IT SERVES AGAIN · RTO
- TIME AFTER THE DISASTER
- 12 h
- 18 h
- back in 3.3 h
- restore 2 TB at 10 GB/min: 200 min
- back in 5.7 h
- restore: 200 min; replay 24 h of log at 10×: 144 min; 344 min in all
- back in 1 min
- promote it: 1 min
- back in 7 min
- replay its 1 h of log at 10×: 6 min; promote it: 1 min
- FIRST 90 min, ZOOMED
- 0
- 15 min
- 30 min
- 45 min
- 75 min
- 90 min
- Point-in-time
- Standby
- Delayed replica
- RESTORE SPEED
- LOG REPLAY
- Full backup every
- Log archived every
- 5 min
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
- 1 A dropped table
- 2 Ten terabytes, disks lost
- 3 Archive more often
- 4 Five times the data
- 5 A replica an hour behind
- One minute, one hour
- Backups and recovery: one disaster, what four recovery plans lose and how long each takes to serve again
- A timeline of one disaster and four recovery plans for a 2 TB database whose disks fail at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h; point-in-time recovery, the base backup plus the log archived every 1 min, loses up to 1 min; the asynchronous standby loses up to 5 s; the delayed replica, 1 h behind, loses up to 5 s. After it, serving again: full backups in 3.3 h; point-in-time recovery in 5.7 h; the standby in 1 min; the delayed replica in 7 min. A schematic, worst-case model.
- Play the disaster and the recovery

#### after Table dropped

- With 2 TB and a table dropped, full backups lose up to 24 h of the table's writes and get the table back in 3.4 h; point-in-time recovery loses nothing and gets the table back in 5.8 h; the standby cannot bring the table back; the delayed replica loses nothing and gets the table back in 7 min.
- A 2 TB database takes writes all day. At the worst moment, just before the next full
- backup, someone drops a table.
- Each plan is judged by two numbers: the writes it loses (RPO) and the time until the table is
- back (RTO).
- DROP
- table dropped
- keeps serving; only the table is gone
- a full copy every 24 h: the table as of that copy
- loses nothing · was 1 min
- · was 1 min
- cannot bring it back
- applies every change 5 s after the primary: the drop too
- loses nothing · was 5 s
- · was 5 s
- the drop waits in its log for 1 h before it applies
- TIME UNTIL THE TABLE IS BACK · RTO
- TIME AFTER THE DROP
- table back in 3.4 h · was 3.3 h
- · was 3.3 h
- restore 2 TB beside the primary at 10 GB/min: 200 min; copy the table back: 1 min
- table back in 5.8 h · was 5.7 h
- · was 5.7 h
- restore beside the primary: 200 min; replay 24 h of log to just before the drop at 10×: 144 min; copy the table
- back: 1 min; 345 min in all
- never
- it has applied the drop too: no copy without it
- table back in 7 min
- pause it, replay its 1 h of log to just before the drop at 10×: 6 min; copy the table back: 1 min
- A timeline of one disaster and four recovery plans for a 2 TB database in which a table is dropped at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h of the table's writes; point-in-time recovery, the base backup plus the log archived every 1 min, loses nothing; the asynchronous standby cannot bring it back; the delayed replica, 1 h behind, loses nothing. After it, getting the table back: full backups in 3.4 h; point-in-time recovery in 5.8 h; the standby never; the delayed replica in 7 min. A schematic, worst-case model.

#### after 10 TB

- With 10 TB and a table dropped, full backups lose up to 24 h of the table's writes and get the table back in 16.7 h; point-in-time recovery loses nothing and gets the table back in 19.1 h; the standby cannot bring the table back; the delayed replica loses nothing and gets the table back in 7 min.
- A 10 TB database takes writes all day. At the worst moment, just before the next full
- loses nothing
- table back in 16.7 h · was 3.4 h
- · was 3.4 h
- restore 10 TB beside the primary at 10 GB/min: 1,000 min; copy the table back: 1 min
- table back in 19.1 h · was 5.8 h
- · was 5.8 h
- restore beside the primary: 1,000 min; replay 24 h of log to just before the drop at 10×: 144 min; copy the table
- back: 1 min; 1,145 min in all
- A timeline of one disaster and four recovery plans for a 10 TB database in which a table is dropped at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h of the table's writes; point-in-time recovery, the base backup plus the log archived every 1 min, loses nothing; the asynchronous standby cannot bring it back; the delayed replica, 1 h behind, loses nothing. After it, getting the table back: full backups in 16.7 h; point-in-time recovery in 19.1 h; the standby never; the delayed replica in 7 min. A schematic, worst-case model.

#### after 50 GB/min

- With 10 TB and a table dropped, full backups lose up to 24 h of the table's writes and get the table back in 3.4 h; point-in-time recovery loses nothing and gets the table back in 5.8 h; the standby cannot bring the table back; the delayed replica loses nothing and gets the table back in 7 min.
- table back in 3.4 h · was 16.7 h
- · was 16.7 h
- restore 10 TB beside the primary at 50 GB/min: 200 min; copy the table back: 1 min
- table back in 5.8 h · was 19.1 h
- · was 19.1 h
- A timeline of one disaster and four recovery plans for a 10 TB database in which a table is dropped at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h of the table's writes; point-in-time recovery, the base backup plus the log archived every 1 min, loses nothing; the asynchronous standby cannot bring it back; the delayed replica, 1 h behind, loses nothing. After it, getting the table back: full backups in 3.4 h; point-in-time recovery in 5.8 h; the standby never; the delayed replica in 7 min. A schematic, worst-case model.

#### after 6 h

- With 10 TB and a table dropped, full backups lose up to 6 h of the table's writes and get the table back in 3.4 h; point-in-time recovery loses nothing and gets the table back in 4 h; the standby cannot bring the table back; the delayed replica loses nothing and gets the table back in 7 min.
- loses 6 h · was 24 h
- · was 24 h
- a full copy every 6 h: the table as of that copy
- table back in 3.4 h
- table back in 4 h · was 5.8 h
- restore beside the primary: 200 min; replay 6 h of log to just before the drop at 10×: 36 min; copy the table
- back: 1 min; 237 min in all
- A timeline of one disaster and four recovery plans for a 10 TB database in which a table is dropped at the worst moment. Before the disaster, on a log scale: full backups every 6 h lose up to 6 h of the table's writes; point-in-time recovery, the base backup plus the log archived every 1 min, loses nothing; the asynchronous standby cannot bring it back; the delayed replica, 1 h behind, loses nothing. After it, getting the table back: full backups in 3.4 h; point-in-time recovery in 4 h; the standby never; the delayed replica in 7 min. A schematic, worst-case model.

#### after 1 h

- With 10 TB and a table dropped, full backups lose up to 1 h of the table's writes and get the table back in 3.4 h; point-in-time recovery loses nothing and gets the table back in 3.5 h; the standby cannot bring the table back; the delayed replica loses nothing and gets the table back in 7 min.
- loses 1 h · was 6 h
- · was 6 h
- a full copy every 1 h: the table as of that copy
- table back in 3.5 h · was 4 h
- · was 4 h
- restore beside the primary: 200 min; replay 1 h of log to just before the drop at 10×: 6 min; copy the table back:
- 1 min; 207 min in all
- A timeline of one disaster and four recovery plans for a 10 TB database in which a table is dropped at the worst moment. Before the disaster, on a log scale: full backups every 1 h lose up to 1 h of the table's writes; point-in-time recovery, the base backup plus the log archived every 1 min, loses nothing; the asynchronous standby cannot bring it back; the delayed replica, 1 h behind, loses nothing. After it, getting the table back: full backups in 3.4 h; point-in-time recovery in 3.5 h; the standby never; the delayed replica in 7 min. A schematic, worst-case model.

#### after 10 s

- loses 1 h
- the base backup, then the log archived every 10 s
- table back in 3.5 h
- A timeline of one disaster and four recovery plans for a 10 TB database in which a table is dropped at the worst moment. Before the disaster, on a log scale: full backups every 1 h lose up to 1 h of the table's writes; point-in-time recovery, the base backup plus the log archived every 10 s, loses nothing; the asynchronous standby cannot bring it back; the delayed replica, 1 h behind, loses nothing. After it, getting the table back: full backups in 3.4 h; point-in-time recovery in 3.5 h; the standby never; the delayed replica in 7 min. A schematic, worst-case model.

#### after Sync

- With 10 TB and a table dropped, full backups lose up to 1 h of the table's writes and get the table back in 3.4 h; point-in-time recovery loses nothing and gets the table back in 3.5 h; the synchronous standby cannot bring the table back; the delayed replica loses nothing and gets the table back in 7 min.
- Standby, synchronous
- applies every change with the primary: the drop too
- A timeline of one disaster and four recovery plans for a 10 TB database in which a table is dropped at the worst moment. Before the disaster, on a log scale: full backups every 1 h lose up to 1 h of the table's writes; point-in-time recovery, the base backup plus the log archived every 10 s, loses nothing; the synchronous standby cannot bring it back; the delayed replica, 1 h behind, loses nothing. After it, getting the table back: full backups in 3.4 h; point-in-time recovery in 3.5 h; the standby never; the delayed replica in 7 min. A schematic, worst-case model.

#### after 2 TB

- With 2 TB and a table dropped, full backups lose up to 1 h of the table's writes and get the table back in 41 min; point-in-time recovery loses nothing and gets the table back in 47 min; the synchronous standby cannot bring the table back; the delayed replica loses nothing and gets the table back in 7 min.
- table back in 41 min · was 3.4 h
- restore 2 TB beside the primary at 50 GB/min: 40 min; copy the table back: 1 min
- table back in 47 min · was 3.5 h
- · was 3.5 h
- restore beside the primary: 40 min; replay 1 h of log to just before the drop at 10×: 6 min; copy the table back:
- 1 min; 47 min in all
- A timeline of one disaster and four recovery plans for a 2 TB database in which a table is dropped at the worst moment. Before the disaster, on a log scale: full backups every 1 h lose up to 1 h of the table's writes; point-in-time recovery, the base backup plus the log archived every 10 s, loses nothing; the synchronous standby cannot bring it back; the delayed replica, 1 h behind, loses nothing. After it, getting the table back: full backups in 41 min; point-in-time recovery in 47 min; the standby never; the delayed replica in 7 min. A schematic, worst-case model.

#### after 24 h

- With 2 TB and a table dropped, full backups lose up to 24 h of the table's writes and get the table back in 41 min; point-in-time recovery loses nothing and gets the table back in 3.1 h; the synchronous standby cannot bring the table back; the delayed replica loses nothing and gets the table back in 7 min.
- loses 24 h · was 1 h
- · was 1 h
- table back in 41 min
- table back in 3.1 h · was 47 min
- · was 47 min
- restore beside the primary: 40 min; replay 24 h of log to just before the drop at 10×: 144 min; copy the table
- back: 1 min; 185 min in all
- A timeline of one disaster and four recovery plans for a 2 TB database in which a table is dropped at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h of the table's writes; point-in-time recovery, the base backup plus the log archived every 10 s, loses nothing; the synchronous standby cannot bring it back; the delayed replica, 1 h behind, loses nothing. After it, getting the table back: full backups in 41 min; point-in-time recovery in 3.1 h; the standby never; the delayed replica in 7 min. A schematic, worst-case model.

#### after 1 min

- table back in 3.1 h
- A timeline of one disaster and four recovery plans for a 2 TB database in which a table is dropped at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h of the table's writes; point-in-time recovery, the base backup plus the log archived every 1 min, loses nothing; the synchronous standby cannot bring it back; the delayed replica, 1 h behind, loses nothing. After it, getting the table back: full backups in 41 min; point-in-time recovery in 3.1 h; the standby never; the delayed replica in 7 min. A schematic, worst-case model.

#### after 10 GB/min

- With 2 TB and a table dropped, full backups lose up to 24 h of the table's writes and get the table back in 3.4 h; point-in-time recovery loses nothing and gets the table back in 5.8 h; the synchronous standby cannot bring the table back; the delayed replica loses nothing and gets the table back in 7 min.
- table back in 3.4 h · was 41 min
- · was 41 min
- table back in 5.8 h · was 3.1 h
- · was 3.1 h
- A timeline of one disaster and four recovery plans for a 2 TB database in which a table is dropped at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h of the table's writes; point-in-time recovery, the base backup plus the log archived every 1 min, loses nothing; the synchronous standby cannot bring it back; the delayed replica, 1 h behind, loses nothing. After it, getting the table back: full backups in 3.4 h; point-in-time recovery in 5.8 h; the standby never; the delayed replica in 7 min. A schematic, worst-case model.

#### after 500 GB

- With 500 GB and a table dropped, full backups lose up to 24 h of the table's writes and get the table back in 51 min; point-in-time recovery loses nothing and gets the table back in 3.3 h; the synchronous standby cannot bring the table back; the delayed replica loses nothing and gets the table back in 7 min.
- A 500 GB database takes writes all day. At the worst moment, just before the next full
- table back in 51 min · was 3.4 h
- restore 500 GB beside the primary at 10 GB/min: 50 min; copy the table back: 1 min
- table back in 3.3 h · was 5.8 h
- restore beside the primary: 50 min; replay 24 h of log to just before the drop at 10×: 144 min; copy the table
- back: 1 min; 195 min in all
- A timeline of one disaster and four recovery plans for a 500 GB database in which a table is dropped at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h of the table's writes; point-in-time recovery, the base backup plus the log archived every 1 min, loses nothing; the synchronous standby cannot bring it back; the delayed replica, 1 h behind, loses nothing. After it, getting the table back: full backups in 51 min; point-in-time recovery in 3.3 h; the standby never; the delayed replica in 7 min. A schematic, worst-case model.

#### after 5 min

- the base backup, then the log archived every 5 min
- table back in 51 min
- table back in 3.3 h
- A timeline of one disaster and four recovery plans for a 500 GB database in which a table is dropped at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h of the table's writes; point-in-time recovery, the base backup plus the log archived every 5 min, loses nothing; the synchronous standby cannot bring it back; the delayed replica, 1 h behind, loses nothing. After it, getting the table back: full backups in 51 min; point-in-time recovery in 3.3 h; the standby never; the delayed replica in 7 min. A schematic, worst-case model.

#### after 5×

- With 500 GB and a table dropped, full backups lose up to 24 h of the table's writes and get the table back in 51 min; point-in-time recovery loses nothing and gets the table back in 5.7 h; the synchronous standby cannot bring the table back; the delayed replica loses nothing and gets the table back in 13 min.
- table back in 5.7 h · was 3.3 h
- restore beside the primary: 50 min; replay 24 h of log to just before the drop at 5×: 288 min; copy the table
- back: 1 min; 339 min in all
- table back in 13 min · was 7 min
- · was 7 min
- pause it, replay its 1 h of log to just before the drop at 5×: 12 min; copy the table back: 1 min
- A timeline of one disaster and four recovery plans for a 500 GB database in which a table is dropped at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h of the table's writes; point-in-time recovery, the base backup plus the log archived every 5 min, loses nothing; the synchronous standby cannot bring it back; the delayed replica, 1 h behind, loses nothing. After it, getting the table back: full backups in 51 min; point-in-time recovery in 5.7 h; the standby never; the delayed replica in 13 min. A schematic, worst-case model.

#### after 20×

- With 500 GB and a table dropped, full backups lose up to 24 h of the table's writes and get the table back in 51 min; point-in-time recovery loses nothing and gets the table back in 2 h; the synchronous standby cannot bring the table back; the delayed replica loses nothing and gets the table back in 4 min.
- table back in 2 h · was 5.7 h
- restore beside the primary: 50 min; replay 24 h of log to just before the drop at 20×: 72 min; copy the table
- back: 1 min; 123 min in all
- table back in 4 min · was 13 min
- · was 13 min
- pause it, replay its 1 h of log to just before the drop at 20×: 3 min; copy the table back: 1 min
- A timeline of one disaster and four recovery plans for a 500 GB database in which a table is dropped at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h of the table's writes; point-in-time recovery, the base backup plus the log archived every 5 min, loses nothing; the synchronous standby cannot bring it back; the delayed replica, 1 h behind, loses nothing. After it, getting the table back: full backups in 51 min; point-in-time recovery in 2 h; the standby never; the delayed replica in 4 min. A schematic, worst-case model.

#### after Async

- With 500 GB and a table dropped, full backups lose up to 24 h of the table's writes and get the table back in 51 min; point-in-time recovery loses nothing and gets the table back in 2 h; the standby cannot bring the table back; the delayed replica loses nothing and gets the table back in 4 min.
- table back in 2 h
- table back in 4 min
- A timeline of one disaster and four recovery plans for a 500 GB database in which a table is dropped at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h of the table's writes; point-in-time recovery, the base backup plus the log archived every 5 min, loses nothing; the asynchronous standby cannot bring it back; the delayed replica, 1 h behind, loses nothing. After it, getting the table back: full backups in 51 min; point-in-time recovery in 2 h; the standby never; the delayed replica in 4 min. A schematic, worst-case model.

#### after Disks lost

- With 500 GB and the disks lost, full backups lose up to 24 h and serve again in 50 min; point-in-time recovery loses up to 5 min and serves again in 2 h; the standby loses up to 5 s and serves again in 1 min; the delayed replica loses up to 5 s and serves again in 4 min.
- A 500 GB database takes writes all day. Its disks fail at the worst moment: just before
- the next full backup and the next log archive.
- loses 5 min · was nothing
- · was nothing
- loses 5 s · was nothing
- back in 50 min · was 51 min
- · was 51 min
- restore 500 GB at 10 GB/min: 50 min
- back in 2 h
- restore: 50 min; replay 24 h of log at 20×: 72 min; 122 min in all
- back in 4 min
- replay its 1 h of log at 20×: 3 min; promote it: 1 min
- A timeline of one disaster and four recovery plans for a 500 GB database whose disks fail at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h; point-in-time recovery, the base backup plus the log archived every 5 min, loses up to 5 min; the asynchronous standby loses up to 5 s; the delayed replica, 1 h behind, loses up to 5 s. After it, serving again: full backups in 50 min; point-in-time recovery in 2 h; the standby in 1 min; the delayed replica in 4 min. A schematic, worst-case model.

#### after 25 GB/min

- With 500 GB and the disks lost, full backups lose up to 24 h and serve again in 20 min; point-in-time recovery loses up to 5 min and serves again in 92 min; the standby loses up to 5 s and serves again in 1 min; the delayed replica loses up to 5 s and serves again in 4 min.
- loses 5 min
- back in 20 min · was 50 min
- · was 50 min
- restore 500 GB at 25 GB/min: 20 min
- back in 92 min · was 2 h
- · was 2 h
- restore: 20 min; replay 24 h of log at 20×: 72 min; 92 min in all
- A timeline of one disaster and four recovery plans for a 500 GB database whose disks fail at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h; point-in-time recovery, the base backup plus the log archived every 5 min, loses up to 5 min; the asynchronous standby loses up to 5 s; the delayed replica, 1 h behind, loses up to 5 s. After it, serving again: full backups in 20 min; point-in-time recovery in 92 min; the standby in 1 min; the delayed replica in 4 min. A schematic, worst-case model.

#### after 10×

- With 500 GB and the disks lost, full backups lose up to 24 h and serve again in 20 min; point-in-time recovery loses up to 5 min and serves again in 2.7 h; the standby loses up to 5 s and serves again in 1 min; the delayed replica loses up to 5 s and serves again in 7 min.
- back in 20 min
- back in 2.7 h · was 92 min
- · was 92 min
- restore: 20 min; replay 24 h of log at 10×: 144 min; 164 min in all
- back in 7 min · was 4 min
- · was 4 min
- A timeline of one disaster and four recovery plans for a 500 GB database whose disks fail at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h; point-in-time recovery, the base backup plus the log archived every 5 min, loses up to 5 min; the asynchronous standby loses up to 5 s; the delayed replica, 1 h behind, loses up to 5 s. After it, serving again: full backups in 20 min; point-in-time recovery in 2.7 h; the standby in 1 min; the delayed replica in 7 min. A schematic, worst-case model.

#### Play, Disks lost

- The disks of this 500 GB database fail just before the next full backup and the next log archive. Full backups lose up to 24 h of writes and serve again in 20 min, restoring 500 GB at 25 GB/min. Point-in-time recovery loses up to 5 min, the log not yet archived; it restores the same base backup, then replays 24 h of log at 10×, and serves again in 2.7 h. The standby loses its 5 s of lag and is promoted in 1 min. The delayed replica loses the same 5 s and serves again in 7 min, once it has applied the hour it holds.
- Written below the picture.

#### Play, Table dropped

- A table is dropped just before the next full backup of this 500 GB database, and the primary keeps serving. Full backups lose up to 24 h of the table's writes and get the table back in 21 min, restoring 500 GB beside the primary at 25 GB/min and copying the table back. Point-in-time recovery replays to just before the drop and loses nothing; it restores the same base backup beside the primary, then replays 24 h of log at 10×, and gets the table back in 2.8 h. The standby applies the drop 5 s after the primary and cannot bring the table back. The delayed replica holds the drop in its log for 1 h: paused in time, it loses nothing and gets the table back in 7 min.
- loses nothing · was 5 min
- · was 5 min
- table back in 21 min · was 20 min
- · was 20 min
- restore 500 GB beside the primary at 25 GB/min: 20 min; copy the table back: 1 min
- table back in 2.8 h · was 2.7 h
- · was 2.7 h
- restore beside the primary: 20 min; replay 24 h of log to just before the drop at 10×: 144 min; copy the table
- back: 1 min; 165 min in all
- A timeline of one disaster and four recovery plans for a 500 GB database in which a table is dropped at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h of the table's writes; point-in-time recovery, the base backup plus the log archived every 5 min, loses nothing; the asynchronous standby cannot bring it back; the delayed replica, 1 h behind, loses nothing. After it, getting the table back: full backups in 21 min; point-in-time recovery in 2.8 h; the standby never; the delayed replica in 7 min. A schematic, worst-case model.

#### Describe

- back in 20 min · was 21 min
- · was 21 min
- back in 2.7 h · was 2.8 h
- · was 2.8 h
- Hide the description
- Plan
- Disaster
- Loses (RPO)
- Back in (RTO)
- 20 min
- 2.7 h
- 5 s
- 7 min
- a dropped table
- 21 min
- nothing
- 2.8 h
- the table
- Rows are this setting's: 500 GB restored at 25 GB/min, a full backup every 24 h, the log archived every 5 min and replayed at 10×, the standby 5 s behind. Worst case, from a schematic model.
- Each plan against each disaster, for these settings

#### experiment 1 asking

- Play and every setting wait for your answer.
- loses ?
- What it can bring back shows after your answer.
- table back in 5.8 h
- table back in ?
- Whether and when it gets the table back shows after your answer.
- Look here
- A schematic model. Its assumptions show after your answer.
- Describe waits for your answer.
- Just before the nightly full backup, someone drops the orders table. The standby applies every change 5 s after the primary does. What can the standby bring back?
- The table as it was 5 s before the drop: it runs 5 s behind
- Everything but the last 5 s of writes, as after a dead disk
- Nothing: it applies the drop 5 s after the primary does
- A timeline of one disaster and four recovery plans for a 2 TB database in which a table is dropped at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h of the table's writes; point-in-time recovery, the base backup plus the log archived every 1 min, loses nothing; the standby: what it can bring back shows after your answer; the delayed replica: what it can bring back shows after your answer. After it, getting the table back: full backups in 3.4 h; point-in-time recovery in 5.8 h; the standby: after your answer; the delayed replica: after your answer. A schematic, worst-case model.
- Play the disaster and the recovery, after your answer
- Experiment: A dropped table

#### experiment 1 revealed

- Nothing: a replica is not a backup. A standby copies every change within seconds, the drop included, so 5 s after the primary loses the table, the standby loses it too. It protects against losing a machine, not against losing the data: a bad migration or ransomware reaches it the same way, so keep backups immutable in another account, retained long enough to reach back before a mistake noticed weeks later. Point-in-time recovery, restored beside the primary, stops just before the drop and loses nothing, but gets the table back only in 5.8 h.
- your answer, wrong
- correct answer
- done

#### experiment 2 asking

- A 10 TB database takes writes all day. Its disks fail at the worst moment: just before
- loses 6 h
- a full copy every 6 h, in another account
- restore 10 TB at 50 GB/min: 200 min
- back in ?
- Its time to serve again shows after your answer.
- back in 13 min
- replay its 1 h of log at 5×: 12 min; promote it: 1 min
- A 10 TB database restores at 50 GB/min. A full backup runs every 6 h, the log is archived every 1 min, and replay runs 5× as fast as the writes came in. The disks fail just before the next full backup. How long until point-in-time recovery serves again?
- 3.3 h: the restore, since the log replays while the backup copies
- 4.5 h: the restore, then 6 h of log at 5×
- 8.1 h: the restore, then the day's 24 h of log at 5×
- A timeline of one disaster and four recovery plans for a 10 TB database whose disks fail at the worst moment. Before the disaster, on a log scale: full backups every 6 h lose up to 6 h; point-in-time recovery, the base backup plus the log archived every 1 min, loses up to 1 min; the asynchronous standby loses up to 5 s; the delayed replica, 1 h behind, loses up to 5 s. After it, serving again: full backups in 3.3 h; point-in-time recovery: after your answer; the standby in 1 min; the delayed replica in 13 min. A schematic, worst-case model.
- Experiment: Ten terabytes, disks lost

#### experiment 2 revealed

- With 10 TB and the disks lost, full backups lose up to 6 h and serve again in 3.3 h; point-in-time recovery loses up to 1 min and serves again in 4.5 h; the standby loses up to 5 s and serves again in 1 min; the delayed replica loses up to 5 s and serves again in 13 min.
- back in 4.5 h
- restore: 200 min; replay 6 h of log at 5×: 72 min; 272 min in all
- Replay can start only once the restore is done, and it must apply every change since the base backup: 200 min to copy 10 TB at 50 GB/min, then 6 h of log at 5×, 72 min, so 272 min in all, 4.5 h. The size and the restore speed set the first term. The second is the log since the newest base backup, 6 h here and not the whole day, at the replay speed. Only the last 1 min of writes, not yet archived, is lost.
- A timeline of one disaster and four recovery plans for a 10 TB database whose disks fail at the worst moment. Before the disaster, on a log scale: full backups every 6 h lose up to 6 h; point-in-time recovery, the base backup plus the log archived every 1 min, loses up to 1 min; the asynchronous standby loses up to 5 s; the delayed replica, 1 h behind, loses up to 5 s. After it, serving again: full backups in 3.3 h; point-in-time recovery in 4.5 h; the standby in 1 min; the delayed replica in 13 min. A schematic, worst-case model.

#### experiment 3 asking

- Point-in-time recovery here loses up to 1 min of writes and serves again in 5.7 h. Archive the log every 10 s instead. What changes?
- Only the loss, to 10 s: the replay still starts at the base backup
- Both: 10 s lost, and smaller pieces of log replay sooner
- Neither: the full backups set how much is lost
- Experiment: Archive more often

#### experiment 3 revealed

- With 2 TB and the disks lost, full backups lose up to 24 h and serve again in 3.3 h; point-in-time recovery loses up to 10 s and serves again in 5.7 h; the standby loses up to 5 s and serves again in 1 min; the delayed replica loses up to 5 s and serves again in 7 min.
- loses 10 s · was 1 min
- Only the loss: 10 s instead of 1 min. The archive interval is how much log a dead disk can take with it. Recovery still restores the base backup and replays all 24 h of log since it, cut into more pieces but no shorter, so it serves again in 5.7 h as before. Archiving more often costs more stored objects and requests; streaming the log as it is written takes the loss to about a second.
- A timeline of one disaster and four recovery plans for a 2 TB database whose disks fail at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h; point-in-time recovery, the base backup plus the log archived every 10 s, loses up to 10 s; the asynchronous standby loses up to 5 s; the delayed replica, 1 h behind, loses up to 5 s. After it, serving again: full backups in 3.3 h; point-in-time recovery in 5.7 h; the standby in 1 min; the delayed replica in 7 min. A schematic, worst-case model.
- your answer, correct

#### experiment 4 asking

- The database grows from 2 TB to 10 TB, with the same backups, standbys, restore speed and replay. Whose recovery time grows?
- Every plan's: there is five times the data to bring back
- Only point-in-time recovery's: five times the log to replay
- The two that restore a backup: they copy every byte back
- Experiment: Five times the data

#### experiment 4 revealed

- With 10 TB and the disks lost, full backups lose up to 24 h and serve again in 16.7 h; point-in-time recovery loses up to 1 min and serves again in 19.1 h; the standby loses up to 5 s and serves again in 1 min; the delayed replica loses up to 5 s and serves again in 7 min.
- back in 16.7 h · was 3.3 h
- restore 10 TB at 10 GB/min: 1,000 min
- back in 19.1 h · was 5.7 h
- restore: 1,000 min; replay 24 h of log at 10×: 144 min; 1,144 min in all
- The two that restore a backup: full backups go from 3.3 h to 16.7 h and point-in-time recovery from 5.7 h to 19.1 h, because copying 10 TB at 10 GB/min takes 16.7 h. The log to replay is the writes since the base backup, which depend on the write rate, here unchanged, not on the size, and the standbys already hold every byte: they serve again in 1 min and 7 min as before. A large database restores faster from a volume snapshot, back in minutes though slow until its blocks load, or fails over to a replica.
- A timeline of one disaster and four recovery plans for a 10 TB database whose disks fail at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h; point-in-time recovery, the base backup plus the log archived every 1 min, loses up to 1 min; the asynchronous standby loses up to 5 s; the delayed replica, 1 h behind, loses up to 5 s. After it, serving again: full backups in 16.7 h; point-in-time recovery in 19.1 h; the standby in 1 min; the delayed replica in 7 min. A schematic, worst-case model.

#### experiment 5 asking

- table back in 8.2 h
- restore beside the primary: 200 min; replay 24 h of log to just before the drop at 5×: 288 min; copy the table
- back: 1 min; 489 min in all
- Someone drops a table just before the nightly full backup and notices within minutes. A delayed replica receives the log 5 s after the primary writes it but applies it only 1 h later, and its replay runs 5× as fast as the writes came in. How soon can it give the table back, at the earliest, and how much is lost?
- 13 min, nothing lost: pause it before it applies the drop, roll it forward to just before, copy the table back
- 73 min, nothing lost: its 1 h delay cannot be skipped, so it must wait out the hour before replaying
- Never: like the standby, it applies the drop and loses the table
- A timeline of one disaster and four recovery plans for a 2 TB database in which a table is dropped at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h of the table's writes; point-in-time recovery, the base backup plus the log archived every 1 min, loses nothing; the asynchronous standby cannot bring it back; the delayed replica: what it can bring back shows after your answer. After it, getting the table back: full backups in 3.4 h; point-in-time recovery in 8.2 h; the standby never; the delayed replica: after your answer. A schematic, worst-case model.
- Experiment: A replica an hour behind

#### experiment 5 revealed

- With 2 TB and a table dropped, full backups lose up to 24 h of the table's writes and get the table back in 3.4 h; point-in-time recovery loses nothing and gets the table back in 8.2 h; the standby cannot bring the table back; the delayed replica loses nothing and gets the table back in 13 min.
- table back in 13 min
- The table is back in 13 min with nothing lost: the drop sits in its log, received but not applied, for 1 h. The delay only holds back applying, so pause it before it applies the drop and replay what it has received, up to just before the drop, as fast as it can: at most 1 h of log at 5×, 12 min. Then copy the table back in 1 min, while the primary keeps serving. Point-in-time recovery gets the same table back in 8.2 h. The catch is the hour: a drop noticed later has reached this replica too, which is why it adds to backups and never replaces them.
- A timeline of one disaster and four recovery plans for a 2 TB database in which a table is dropped at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h of the table's writes; point-in-time recovery, the base backup plus the log archived every 1 min, loses nothing; the asynchronous standby cannot bring it back; the delayed replica, 1 h behind, loses nothing. After it, getting the table back: full backups in 3.4 h; point-in-time recovery in 8.2 h; the standby never; the delayed replica in 13 min. A schematic, worst-case model.

#### challenge

- With 2 TB and the disks lost, full backups lose up to 24 h and serve again in 3.3 h; point-in-time recovery loses up to 1 min and serves again in 5.7 h; the standby loses up to 5 s and serves again in 1 min; the delayed replica loses up to 5 s and serves again in 7 min.
- 1 min goal
- 1 h goal
- Describe waits until you meet the goal.
- ✓point-in-time recovery loses at most 1 min (now up to 1 min): met
- ·point-in-time recovery serves again within 1 h (now 5.7 h): not yet
- ✓no more than one full backup every 6 h (now every 24 h): met
- Experiment: One minute, one hour

#### challenge after 50 GB/min

- With 2 TB and the disks lost, full backups lose up to 24 h and serve again in 40 min; point-in-time recovery loses up to 1 min and serves again in 3.1 h; the standby loses up to 5 s and serves again in 1 min; the delayed replica loses up to 5 s and serves again in 7 min.
- back in 40 min · was 3.3 h
- restore 2 TB at 50 GB/min: 40 min
- back in 3.1 h · was 5.7 h
- restore: 40 min; replay 24 h of log at 10×: 144 min; 184 min in all
- ·point-in-time recovery serves again within 1 h (now 3.1 h): not yet
- A timeline of one disaster and four recovery plans for a 2 TB database whose disks fail at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h; point-in-time recovery, the base backup plus the log archived every 1 min, loses up to 1 min; the asynchronous standby loses up to 5 s; the delayed replica, 1 h behind, loses up to 5 s. After it, serving again: full backups in 40 min; point-in-time recovery in 3.1 h; the standby in 1 min; the delayed replica in 7 min. A schematic, worst-case model.

#### challenge after 6 h

- With 2 TB and the disks lost, full backups lose up to 6 h and serve again in 40 min; point-in-time recovery loses up to 1 min and serves again in 76 min; the standby loses up to 5 s and serves again in 1 min; the delayed replica loses up to 5 s and serves again in 7 min.
- back in 40 min
- back in 76 min · was 3.1 h
- restore: 40 min; replay 6 h of log at 10×: 36 min; 76 min in all
- ·point-in-time recovery serves again within 1 h (now 76 min): not yet
- ✓no more than one full backup every 6 h (now every 6 h): met
- A timeline of one disaster and four recovery plans for a 2 TB database whose disks fail at the worst moment. Before the disaster, on a log scale: full backups every 6 h lose up to 6 h; point-in-time recovery, the base backup plus the log archived every 1 min, loses up to 1 min; the asynchronous standby loses up to 5 s; the delayed replica, 1 h behind, loses up to 5 s. After it, serving again: full backups in 40 min; point-in-time recovery in 76 min; the standby in 1 min; the delayed replica in 7 min. A schematic, worst-case model.

#### challenge after 20×

- With 2 TB and the disks lost, full backups lose up to 6 h and serve again in 40 min; point-in-time recovery loses up to 1 min and serves again in 58 min; the standby loses up to 5 s and serves again in 1 min; the delayed replica loses up to 5 s and serves again in 4 min.
- back in 58 min · was 76 min
- · was 76 min
- restore: 40 min; replay 6 h of log at 20×: 18 min; 58 min in all
- back in 4 min · was 7 min
- Goal met:
- ✓point-in-time recovery serves again within 1 h (now 58 min): met
- Restore at 50 GB/min, a full backup every 6 h and replay at 20×: 40 min to restore 2 TB, then at most 6 h of log in 18 min, 58 min in all; with the log archived every 1 min or more often, it loses at most that. At 10× the replay takes 36 min, 76 min in all with the restore, and misses the hour; hourly full backups would make it, but read 2 TB from the primary 24 times a day, unless they are incremental or taken from a standby. At 10 TB nothing here meets the hour: copying it at 50 GB/min takes 3.3 h alone. So large databases restore from volume snapshots, or fail over to a standby for the dead disk and a delayed replica for the bad delete, and keep point-in-time recovery for the rest. And a recovery time is real only once a drill has measured it.
- A timeline of one disaster and four recovery plans for a 2 TB database whose disks fail at the worst moment. Before the disaster, on a log scale: full backups every 6 h lose up to 6 h; point-in-time recovery, the base backup plus the log archived every 1 min, loses up to 1 min; the asynchronous standby loses up to 5 s; the delayed replica, 1 h behind, loses up to 5 s. After it, serving again: full backups in 40 min; point-in-time recovery in 58 min; the standby in 1 min; the delayed replica in 4 min. A schematic, worst-case model.

## Desktop, with motion

#### at rest

- The disaster
- Disks lost
- Table dropped
- Database
- 500 GB
- 2 TB
- 10 TB
- Change the disaster or any setting, or press Play to watch the disaster strike and each plan recover.
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
- receives the log 5 s after the primary, applies it 1 h later
- FULL BACKUP EVERY
- LOG ARCHIVED EVERY
- STANDBY
- TIME UNTIL IT SERVES AGAIN · RTO
- TIME AFTER THE DISASTER
- 12 h
- 18 h
- back in 3.3 h
- restore 2 TB at 10 GB/min: 200 min
- back in 5.7 h
- restore: 200 min; replay 24 h of log at 10×: 144 min; 344 min in all
- back in 1 min
- promote it: 1 min
- back in 7 min
- replay its 1 h of log at 10×: 6 min; promote it: 1 min
- FIRST 90 min, ZOOMED
- 0
- 15 min
- 30 min
- 45 min
- 75 min
- 90 min
- Point-in-time
- Standby
- Delayed replica
- RESTORE SPEED
- LOG REPLAY
- Full backup every
- Log archived every
- 5 min
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
- 1 A dropped table
- 2 Ten terabytes, disks lost
- 3 Archive more often
- 4 Five times the data
- 5 A replica an hour behind
- One minute, one hour
- Backups and recovery: one disaster, what four recovery plans lose and how long each takes to serve again
- A timeline of one disaster and four recovery plans for a 2 TB database whose disks fail at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h; point-in-time recovery, the base backup plus the log archived every 1 min, loses up to 1 min; the asynchronous standby loses up to 5 s; the delayed replica, 1 h behind, loses up to 5 s. After it, serving again: full backups in 3.3 h; point-in-time recovery in 5.7 h; the standby in 1 min; the delayed replica in 7 min. A schematic, worst-case model.
- Play the disaster and the recovery

#### after 10 s

- With 2 TB and the disks lost, full backups lose up to 24 h and serve again in 3.3 h; point-in-time recovery loses up to 10 s and serves again in 5.7 h; the standby loses up to 5 s and serves again in 1 min; the delayed replica loses up to 5 s and serves again in 7 min.
- loses 10 s · was 1 min
- · was 1 min
- the base backup, then the log archived every 10 s
- A timeline of one disaster and four recovery plans for a 2 TB database whose disks fail at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h; point-in-time recovery, the base backup plus the log archived every 10 s, loses up to 10 s; the asynchronous standby loses up to 5 s; the delayed replica, 1 h behind, loses up to 5 s. After it, serving again: full backups in 3.3 h; point-in-time recovery in 5.7 h; the standby in 1 min; the delayed replica in 7 min. A schematic, worst-case model.

#### after Sync

- With 2 TB and the disks lost, full backups lose up to 24 h and serve again in 3.3 h; point-in-time recovery loses up to 10 s and serves again in 5.7 h; the synchronous standby loses nothing and serves again in 1 min; the delayed replica loses up to 5 s and serves again in 7 min.
- loses 10 s
- Standby, synchronous
- loses nothing · was 5 s
- · was 5 s
- the primary waits for it on every commit
- A timeline of one disaster and four recovery plans for a 2 TB database whose disks fail at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h; point-in-time recovery, the base backup plus the log archived every 10 s, loses up to 10 s; the synchronous standby loses nothing; the delayed replica, 1 h behind, loses up to 5 s. After it, serving again: full backups in 3.3 h; point-in-time recovery in 5.7 h; the standby in 1 min; the delayed replica in 7 min. A schematic, worst-case model.

#### after 1 min

- With 2 TB and the disks lost, full backups lose up to 24 h and serve again in 3.3 h; point-in-time recovery loses up to 1 min and serves again in 5.7 h; the synchronous standby loses nothing and serves again in 1 min; the delayed replica loses up to 5 s and serves again in 7 min.
- loses 1 min · was 10 s
- · was 10 s
- loses nothing
- A timeline of one disaster and four recovery plans for a 2 TB database whose disks fail at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h; point-in-time recovery, the base backup plus the log archived every 1 min, loses up to 1 min; the synchronous standby loses nothing; the delayed replica, 1 h behind, loses up to 5 s. After it, serving again: full backups in 3.3 h; point-in-time recovery in 5.7 h; the standby in 1 min; the delayed replica in 7 min. A schematic, worst-case model.

#### after Async

- With 2 TB and the disks lost, full backups lose up to 24 h and serve again in 3.3 h; point-in-time recovery loses up to 1 min and serves again in 5.7 h; the standby loses up to 5 s and serves again in 1 min; the delayed replica loses up to 5 s and serves again in 7 min.
- loses 5 s · was nothing
- · was nothing

#### playing, Disks lost

- The day before: full backups copy the database; the log and both replicas get every write.
- takes writes all day
- restore 2 TB at 10 GB/min: …
- restore: …; replay 24 h of log at 10×: …
- promote it: …
- replay its 1 h of log at 10×: …; promote it: …
- Stop the disaster and the recovery

#### playing, Disks lost

- The disks fail: everything on the primary is gone.

#### playing, Disks lost

- Each plan's recovery point: the newest moment it can bring back.

#### playing, Disks lost

- Recovering after the disaster.
- recovering

#### playing, Disks lost

- Recovering: 7 min after the disaster.
- NOW 7 min AFTER THE DISASTER
- replay its 1 h of log at 10×: 6 min; promote it: …

#### playing, Disks lost

- Recovering: 10 min after the disaster.
- NOW 10 min AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 17 min after the disaster.
- NOW 17 min AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 20 min after the disaster.
- NOW 20 min AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 26 min after the disaster.
- NOW 26 min AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 33 min after the disaster.
- NOW 33 min AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 36 min after the disaster.
- NOW 36 min AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 43 min after the disaster.
- NOW 43 min AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 46 min after the disaster.
- NOW 46 min AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 53 min after the disaster.
- NOW 53 min AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 1 h after the disaster.
- NOW 1 h AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 63 min after the disaster.
- NOW 63 min AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 69 min after the disaster.
- NOW 69 min AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 73 min after the disaster.
- NOW 73 min AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 79 min after the disaster.
- NOW 79 min AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 86 min after the disaster.
- NOW 86 min AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 89 min after the disaster.
- NOW 89 min AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 99 min after the disaster.
- NOW 99 min AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 1.7 h after the disaster.
- NOW 1.7 h AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 1.8 h after the disaster.
- NOW 1.8 h AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 1.9 h after the disaster.
- NOW 1.9 h AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 2 h after the disaster.
- NOW 2 h AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 2.1 h after the disaster.
- NOW 2.1 h AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 2.2 h after the disaster.
- NOW 2.2 h AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 2.3 h after the disaster.
- NOW 2.3 h AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 2.4 h after the disaster.
- NOW 2.4 h AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 2.5 h after the disaster.
- NOW 2.5 h AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 2.6 h after the disaster.
- NOW 2.6 h AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 2.8 h after the disaster.
- NOW 2.8 h AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 2.9 h after the disaster.
- NOW 2.9 h AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 3 h after the disaster.
- NOW 3 h AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 3.1 h after the disaster.
- NOW 3.1 h AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 3.2 h after the disaster.
- NOW 3.2 h AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 3.3 h after the disaster.
- NOW 3.3 h AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 3.4 h after the disaster.
- NOW 3.4 h AFTER THE DISASTER
- restore: 200 min; replay 24 h of log at 10×: …

#### playing, Disks lost

- Recovering: 3.5 h after the disaster.
- NOW 3.5 h AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 3.6 h after the disaster.
- NOW 3.6 h AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 3.7 h after the disaster.
- NOW 3.7 h AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 3.8 h after the disaster.
- NOW 3.8 h AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 3.9 h after the disaster.
- NOW 3.9 h AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 4 h after the disaster.
- NOW 4 h AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 4.1 h after the disaster.
- NOW 4.1 h AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 4.3 h after the disaster.
- NOW 4.3 h AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 4.4 h after the disaster.
- NOW 4.4 h AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 4.5 h after the disaster.
- NOW 4.5 h AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 4.6 h after the disaster.
- NOW 4.6 h AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 4.7 h after the disaster.
- NOW 4.7 h AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 4.8 h after the disaster.
- NOW 4.8 h AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 5 h after the disaster.
- NOW 5 h AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 5.1 h after the disaster.
- NOW 5.1 h AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 5.2 h after the disaster.
- NOW 5.2 h AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 5.3 h after the disaster.
- NOW 5.3 h AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 5.4 h after the disaster.
- NOW 5.4 h AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 5.5 h after the disaster.
- NOW 5.5 h AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 5.6 h after the disaster.
- NOW 5.6 h AFTER THE DISASTER

#### playing, Disks lost

- Recovering: 5.7 h after the disaster.
- NOW 5.7 h AFTER THE DISASTER

#### playing, Disks lost

- Point-in-time recovery serves last, 5.7 h after the disaster.

#### playing, Table dropped

- A 2 TB database takes writes all day. At the worst moment, just before the next full
- backup, someone drops a table.
- TIME UNTIL THE TABLE IS BACK · RTO
- TIME AFTER THE DROP
- restore 2 TB beside the primary at 10 GB/min: …; copy the table back: …
- restore beside the primary: …; replay 24 h of log to just before the drop at 10×: …; copy the table back: …
- pause it, replay its 1 h of log to just before the drop at 10×: …; copy the table back: …
- A timeline of one disaster and four recovery plans for a 2 TB database in which a table is dropped at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h of the table's writes; point-in-time recovery, the base backup plus the log archived every 1 min, loses nothing; the asynchronous standby cannot bring it back; the delayed replica, 1 h behind, loses nothing. After it, getting the table back: full backups in 3.4 h; point-in-time recovery in 5.8 h; the standby never; the delayed replica in 7 min. A schematic, worst-case model.

#### playing, Table dropped

- A table is dropped, and every copy that applies the change loses it too.

#### playing, Table dropped

- DROP
- table dropped
- keeps serving; only the table is gone
- a full copy every 24 h: the table as of that copy
- applies every change 5 s after the primary: the drop too
- the drop waits in its log for 1 h before it applies

#### playing, Table dropped

- loses nothing · was 1 min

#### playing, Table dropped

- cannot bring it back

#### playing, Table dropped

- Recovering after the drop.
- Recovering: 3 min after the drop.
- NOW 3 min AFTER THE DROP
- never
- it has applied the drop too: no copy without it

#### playing, Table dropped

- Recovering: 10 min after the drop.
- NOW 10 min AFTER THE DROP
- table back in 7 min
- pause it, replay its 1 h of log to just before the drop at 10×: 6 min; copy the table back: 1 min

#### playing, Table dropped

- Recovering: 17 min after the drop.
- NOW 17 min AFTER THE DROP

#### playing, Table dropped

- Recovering: 23 min after the drop.
- NOW 23 min AFTER THE DROP

#### playing, Table dropped

- Recovering: 30 min after the drop.
- NOW 30 min AFTER THE DROP

#### playing, Table dropped

- Recovering: 33 min after the drop.
- NOW 33 min AFTER THE DROP

#### playing, Table dropped

- Recovering: 43 min after the drop.
- NOW 43 min AFTER THE DROP

#### playing, Table dropped

- Recovering: 46 min after the drop.
- NOW 46 min AFTER THE DROP

#### playing, Table dropped

- Recovering: 53 min after the drop.
- NOW 53 min AFTER THE DROP

#### playing, Table dropped

- Recovering: 56 min after the drop.
- NOW 56 min AFTER THE DROP

#### playing, Table dropped

- Recovering: 63 min after the drop.
- NOW 63 min AFTER THE DROP

#### playing, Table dropped

- Recovering: 70 min after the drop.
- NOW 70 min AFTER THE DROP

#### playing, Table dropped

- Recovering: 76 min after the drop.
- NOW 76 min AFTER THE DROP

#### playing, Table dropped

- Recovering: 83 min after the drop.
- NOW 83 min AFTER THE DROP

#### playing, Table dropped

- Recovering: 86 min after the drop.
- NOW 86 min AFTER THE DROP

#### playing, Table dropped

- Recovering: 93 min after the drop.
- NOW 93 min AFTER THE DROP

#### playing, Table dropped

- Recovering: 96 min after the drop.
- NOW 96 min AFTER THE DROP

#### playing, Table dropped

- Recovering: 1.7 h after the drop.
- NOW 1.7 h AFTER THE DROP

#### playing, Table dropped

- Recovering: 1.8 h after the drop.
- NOW 1.8 h AFTER THE DROP

#### playing, Table dropped

- Recovering: 1.9 h after the drop.
- NOW 1.9 h AFTER THE DROP

#### playing, Table dropped

- Recovering: 2 h after the drop.
- NOW 2 h AFTER THE DROP

#### playing, Table dropped

- Recovering: 2.1 h after the drop.
- NOW 2.1 h AFTER THE DROP

#### playing, Table dropped

- Recovering: 2.3 h after the drop.
- NOW 2.3 h AFTER THE DROP

#### playing, Table dropped

- Recovering: 2.4 h after the drop.
- NOW 2.4 h AFTER THE DROP

#### playing, Table dropped

- Recovering: 2.5 h after the drop.
- NOW 2.5 h AFTER THE DROP

#### playing, Table dropped

- Recovering: 2.6 h after the drop.
- NOW 2.6 h AFTER THE DROP

#### playing, Table dropped

- Recovering: 2.7 h after the drop.
- NOW 2.7 h AFTER THE DROP

#### playing, Table dropped

- Recovering: 2.8 h after the drop.
- NOW 2.8 h AFTER THE DROP

#### playing, Table dropped

- Recovering: 2.9 h after the drop.
- NOW 2.9 h AFTER THE DROP

#### playing, Table dropped

- Recovering: 3 h after the drop.
- NOW 3 h AFTER THE DROP

#### playing, Table dropped

- Recovering: 3.1 h after the drop.
- NOW 3.1 h AFTER THE DROP

#### playing, Table dropped

- Recovering: 3.3 h after the drop.
- NOW 3.3 h AFTER THE DROP

#### playing, Table dropped

- Recovering: 3.4 h after the drop.
- NOW 3.4 h AFTER THE DROP
- table back in 3.4 h · was 3.3 h
- · was 3.3 h
- restore 2 TB beside the primary at 10 GB/min: 200 min; copy the table back: 1 min
- restore beside the primary: 200 min; replay 24 h of log to just before the drop at 10×: …; copy the table back: …

#### playing, Table dropped

- Recovering: 3.5 h after the drop.
- NOW 3.5 h AFTER THE DROP

#### playing, Table dropped

- Recovering: 3.6 h after the drop.
- NOW 3.6 h AFTER THE DROP

#### playing, Table dropped

- Recovering: 3.7 h after the drop.
- NOW 3.7 h AFTER THE DROP

#### playing, Table dropped

- Recovering: 3.8 h after the drop.
- NOW 3.8 h AFTER THE DROP

#### playing, Table dropped

- Recovering: 3.9 h after the drop.
- NOW 3.9 h AFTER THE DROP

#### playing, Table dropped

- Recovering: 4 h after the drop.
- NOW 4 h AFTER THE DROP

#### playing, Table dropped

- Recovering: 4.2 h after the drop.
- NOW 4.2 h AFTER THE DROP

#### playing, Table dropped

- Recovering: 4.3 h after the drop.
- NOW 4.3 h AFTER THE DROP

#### playing, Table dropped

- Recovering: 4.4 h after the drop.
- NOW 4.4 h AFTER THE DROP

#### playing, Table dropped

- Recovering: 4.5 h after the drop.
- NOW 4.5 h AFTER THE DROP

#### playing, Table dropped

- Recovering: 4.6 h after the drop.
- NOW 4.6 h AFTER THE DROP

#### playing, Table dropped

- Recovering: 4.7 h after the drop.
- NOW 4.7 h AFTER THE DROP

#### playing, Table dropped

- Recovering: 4.8 h after the drop.
- NOW 4.8 h AFTER THE DROP

#### playing, Table dropped

- Recovering: 4.9 h after the drop.
- NOW 4.9 h AFTER THE DROP

#### playing, Table dropped

- Recovering: 5 h after the drop.
- NOW 5 h AFTER THE DROP

#### playing, Table dropped

- Recovering: 5.2 h after the drop.
- NOW 5.2 h AFTER THE DROP

#### playing, Table dropped

- Recovering: 5.3 h after the drop.
- NOW 5.3 h AFTER THE DROP

#### playing, Table dropped

- Recovering: 5.4 h after the drop.
- NOW 5.4 h AFTER THE DROP

#### playing, Table dropped

- Recovering: 5.5 h after the drop.
- NOW 5.5 h AFTER THE DROP

#### playing, Table dropped

- Recovering: 5.6 h after the drop.
- NOW 5.6 h AFTER THE DROP

#### playing, Table dropped

- Point-in-time recovery gets the table back last, 5.8 h after the drop.
- table back in 5.8 h · was 5.7 h
- · was 5.7 h
- restore beside the primary: 200 min; replay 24 h of log to just before the drop at 10×: 144 min; copy the table
- back: 1 min; 345 min in all

#### playing, Table dropped

- Each plan is judged by two numbers: the writes it loses (RPO) and the time until the table is
- back (RTO).

#### Describe

- loses 1 min · was nothing
- back in 3.3 h · was 3.4 h
- · was 3.4 h
- back in 5.7 h · was 5.8 h
- · was 5.8 h
- Hide the description
- Plan
- Disaster
- Loses (RPO)
- Back in (RTO)
- 3.3 h
- 5.7 h
- 5 s
- 7 min
- a dropped table
- 3.4 h
- nothing
- 5.8 h
- the table
- Rows are this setting's: 2 TB restored at 10 GB/min, a full backup every 24 h, the log archived every 1 min and replayed at 10×, the standby 5 s behind. Worst case, from a schematic model.
- Each plan against each disaster, for these settings

#### experiment 1 asking

- Play and every setting wait for your answer.
- loses ?
- What it can bring back shows after your answer.
- table back in 3.4 h
- table back in 5.8 h
- table back in ?
- Whether and when it gets the table back shows after your answer.
- Look here
- A schematic model. Its assumptions show after your answer.
- Describe waits for your answer.
- Just before the nightly full backup, someone drops the orders table. The standby applies every change 5 s after the primary does. What can the standby bring back?
- The table as it was 5 s before the drop: it runs 5 s behind
- Everything but the last 5 s of writes, as after a dead disk
- Nothing: it applies the drop 5 s after the primary does
- A timeline of one disaster and four recovery plans for a 2 TB database in which a table is dropped at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h of the table's writes; point-in-time recovery, the base backup plus the log archived every 1 min, loses nothing; the standby: what it can bring back shows after your answer; the delayed replica: what it can bring back shows after your answer. After it, getting the table back: full backups in 3.4 h; point-in-time recovery in 5.8 h; the standby: after your answer; the delayed replica: after your answer. A schematic, worst-case model.
- Play the disaster and the recovery, after your answer
- Experiment: A dropped table

#### experiment 1 playing

- Watch the picture: the answer plays out on it.

#### experiment 1 playing

- Recovering after the drop: the times show after your answer.

#### experiment 2 asking

- A 10 TB database takes writes all day. Its disks fail at the worst moment: just before
- the next full backup and the next log archive.
- loses 6 h
- a full copy every 6 h, in another account
- restore 10 TB at 50 GB/min: 200 min
- back in ?
- Its time to serve again shows after your answer.
- back in 13 min
- replay its 1 h of log at 5×: 12 min; promote it: 1 min
- A 10 TB database restores at 50 GB/min. A full backup runs every 6 h, the log is archived every 1 min, and replay runs 5× as fast as the writes came in. The disks fail just before the next full backup. How long until point-in-time recovery serves again?
- 3.3 h: the restore, since the log replays while the backup copies
- 4.5 h: the restore, then 6 h of log at 5×
- 8.1 h: the restore, then the day's 24 h of log at 5×
- A timeline of one disaster and four recovery plans for a 10 TB database whose disks fail at the worst moment. Before the disaster, on a log scale: full backups every 6 h lose up to 6 h; point-in-time recovery, the base backup plus the log archived every 1 min, loses up to 1 min; the asynchronous standby loses up to 5 s; the delayed replica, 1 h behind, loses up to 5 s. After it, serving again: full backups in 3.3 h; point-in-time recovery: after your answer; the standby in 1 min; the delayed replica in 13 min. A schematic, worst-case model.
- Experiment: Ten terabytes, disks lost

#### experiment 2 playing

- restore 10 TB at 50 GB/min: …
- replay its 1 h of log at 5×: …; promote it: …

#### experiment 2 playing

- Recovering after the disaster: the times show after your answer.

#### experiment 3 asking

- Point-in-time recovery here loses up to 1 min of writes and serves again in 5.7 h. Archive the log every 10 s instead. What changes?
- Only the loss, to 10 s: the replay still starts at the base backup
- Both: 10 s lost, and smaller pieces of log replay sooner
- Neither: the full backups set how much is lost
- Experiment: Archive more often

#### experiment 3 playing

- the base backup, then the log archived
- A timeline of one disaster and four recovery plans for a 2 TB database whose disks fail at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h; point-in-time recovery, the base backup plus the archived log: its loss shows after your answer; the asynchronous standby loses up to 5 s; the delayed replica, 1 h behind, loses up to 5 s. After it, serving again: full backups in 3.3 h; point-in-time recovery: after your answer; the standby in 1 min; the delayed replica in 7 min. A schematic, worst-case model.

#### experiment 4 asking

- The database grows from 2 TB to 10 TB, with the same backups, standbys, restore speed and replay. Whose recovery time grows?
- Every plan's: there is five times the data to bring back
- Only point-in-time recovery's: five times the log to replay
- The two that restore a backup: they copy every byte back
- Experiment: Five times the data

#### experiment 4 playing

- A timeline of one disaster and four recovery plans for a 10 TB database whose disks fail at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h; point-in-time recovery, the base backup plus the log archived every 1 min, loses up to 1 min; the asynchronous standby loses up to 5 s; the delayed replica, 1 h behind, loses up to 5 s. After it, serving again: full backups: after your answer; point-in-time recovery: after your answer; the standby: after your answer; the delayed replica: after your answer. A schematic, worst-case model.

#### experiment 5 asking

- table back in 8.2 h
- restore beside the primary: 200 min; replay 24 h of log to just before the drop at 5×: 288 min; copy the table
- back: 1 min; 489 min in all
- Someone drops a table just before the nightly full backup and notices within minutes. A delayed replica receives the log 5 s after the primary writes it but applies it only 1 h later, and its replay runs 5× as fast as the writes came in. How soon can it give the table back, at the earliest, and how much is lost?
- 13 min, nothing lost: pause it before it applies the drop, roll it forward to just before, copy the table back
- 73 min, nothing lost: its 1 h delay cannot be skipped, so it must wait out the hour before replaying
- Never: like the standby, it applies the drop and loses the table
- A timeline of one disaster and four recovery plans for a 2 TB database in which a table is dropped at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h of the table's writes; point-in-time recovery, the base backup plus the log archived every 1 min, loses nothing; the asynchronous standby cannot bring it back; the delayed replica: what it can bring back shows after your answer. After it, getting the table back: full backups in 3.4 h; point-in-time recovery in 8.2 h; the standby never; the delayed replica: after your answer. A schematic, worst-case model.
- Experiment: A replica an hour behind

#### experiment 5 playing

- restore beside the primary: …; replay 24 h of log to just before the drop at 5×: …; copy the table back: …

#### challenge

- 1 min goal
- 1 h goal
- Describe waits until you meet the goal.
- ✓point-in-time recovery loses at most 1 min (now up to 1 min): met
- ·point-in-time recovery serves again within 1 h (now 5.7 h): not yet
- ✓no more than one full backup every 6 h (now every 24 h): met
- Experiment: One minute, one hour

#### challenge after 50 GB/min

- With 2 TB and the disks lost, full backups lose up to 24 h and serve again in 40 min; point-in-time recovery loses up to 1 min and serves again in 3.1 h; the standby loses up to 5 s and serves again in 1 min; the delayed replica loses up to 5 s and serves again in 7 min.
- back in 40 min · was 3.3 h
- restore 2 TB at 50 GB/min: 40 min
- back in 3.1 h · was 5.7 h
- restore: 40 min; replay 24 h of log at 10×: 144 min; 184 min in all
- ·point-in-time recovery serves again within 1 h (now 3.1 h): not yet
- A timeline of one disaster and four recovery plans for a 2 TB database whose disks fail at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h; point-in-time recovery, the base backup plus the log archived every 1 min, loses up to 1 min; the asynchronous standby loses up to 5 s; the delayed replica, 1 h behind, loses up to 5 s. After it, serving again: full backups in 40 min; point-in-time recovery in 3.1 h; the standby in 1 min; the delayed replica in 7 min. A schematic, worst-case model.

#### challenge after 6 h

- With 2 TB and the disks lost, full backups lose up to 6 h and serve again in 40 min; point-in-time recovery loses up to 1 min and serves again in 76 min; the standby loses up to 5 s and serves again in 1 min; the delayed replica loses up to 5 s and serves again in 7 min.
- loses 6 h · was 24 h
- · was 24 h
- back in 40 min
- back in 76 min · was 3.1 h
- · was 3.1 h
- restore: 40 min; replay 6 h of log at 10×: 36 min; 76 min in all
- ·point-in-time recovery serves again within 1 h (now 76 min): not yet
- ✓no more than one full backup every 6 h (now every 6 h): met
- A timeline of one disaster and four recovery plans for a 2 TB database whose disks fail at the worst moment. Before the disaster, on a log scale: full backups every 6 h lose up to 6 h; point-in-time recovery, the base backup plus the log archived every 1 min, loses up to 1 min; the asynchronous standby loses up to 5 s; the delayed replica, 1 h behind, loses up to 5 s. After it, serving again: full backups in 40 min; point-in-time recovery in 76 min; the standby in 1 min; the delayed replica in 7 min. A schematic, worst-case model.

#### challenge after 20×

- With 2 TB and the disks lost, full backups lose up to 6 h and serve again in 40 min; point-in-time recovery loses up to 1 min and serves again in 58 min; the standby loses up to 5 s and serves again in 1 min; the delayed replica loses up to 5 s and serves again in 4 min.
- back in 58 min · was 76 min
- · was 76 min
- restore: 40 min; replay 6 h of log at 20×: 18 min; 58 min in all
- back in 4 min · was 7 min
- · was 7 min
- replay its 1 h of log at 20×: 3 min; promote it: 1 min
- Goal met:
- ✓point-in-time recovery serves again within 1 h (now 58 min): met
- Restore at 50 GB/min, a full backup every 6 h and replay at 20×: 40 min to restore 2 TB, then at most 6 h of log in 18 min, 58 min in all; with the log archived every 1 min or more often, it loses at most that. At 10× the replay takes 36 min, 76 min in all with the restore, and misses the hour; hourly full backups would make it, but read 2 TB from the primary 24 times a day, unless they are incremental or taken from a standby. At 10 TB nothing here meets the hour: copying it at 50 GB/min takes 3.3 h alone. So large databases restore from volume snapshots, or fail over to a standby for the dead disk and a delayed replica for the bad delete, and keep point-in-time recovery for the rest. And a recovery time is real only once a drill has measured it.
- A timeline of one disaster and four recovery plans for a 2 TB database whose disks fail at the worst moment. Before the disaster, on a log scale: full backups every 6 h lose up to 6 h; point-in-time recovery, the base backup plus the log archived every 1 min, loses up to 1 min; the asynchronous standby loses up to 5 s; the delayed replica, 1 h behind, loses up to 5 s. After it, serving again: full backups in 40 min; point-in-time recovery in 58 min; the standby in 1 min; the delayed replica in 4 min. A schematic, worst-case model.
- done

## Phone, 320 px

#### at rest

- The disaster
- Disks lost
- Table dropped
- Database
- 500 GB
- 2 TB
- 10 TB
- Change the disaster or any setting, or press Play to watch the disaster strike and each plan recover.
- One disaster, four plans
- A 2 TB database takes
- writes all day. Its disks fail
- at the worst moment: just
- before the next full backup
- and the next log archive.
- Each plan is judged by two
- numbers: the writes it loses (RPO)
- and the time until it serves
- again (RTO).
- WHAT EACH PLAN LOSES · RPO
- LOG SCALE
- DISKS FAIL
- 24 h
- 1 h
- 10 min
- Primary
- disks lost
- its disks fail at the worst moment
- Full backups
- loses 24 h
- a full copy every 24 h
- Point-in-time
- loses 1 min
- base backup, log every 1 min
- Standby
- loses 5 s
- 5 s behind the primary
- Delayed replica
- log in 5 s, applied 1 h later
- FULL BACKUP EVERY
- LOG ARCHIVED EVERY
- STANDBY
- UNTIL IT SERVES AGAIN · RTO
- TIME AFTER THE DISASTER
- 12 h
- 18 h
- back in 3.3 h
- restore 2 TB at 10 GB/min: 200 min
- back in 5.7 h
- restore: 200 min; replay 24 h of log at 10×:
- 144 min; 344 min in all
- back in 1 min
- promote it: 1 min
- back in 7 min
- replay its 1 h of log at 10×: 6 min; promote
- it: 1 min
- FIRST 90 min, ZOOMED
- 0
- 30 min
- RESTORE SPEED
- LOG REPLAY
- Full backup every
- 6 h
- Log archived every
- 10 s
- 1 min
- 5 min
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
- 1 A dropped table
- 2 Ten terabytes, disks lost
- 3 Archive more often
- 4 Five times the data
- 5 A replica an hour behind
- One minute, one hour
- Backups and recovery: one disaster, what four recovery plans lose and how long each takes to serve again
- A timeline of one disaster and four recovery plans for a 2 TB database whose disks fail at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h; point-in-time recovery, the base backup plus the log archived every 1 min, loses up to 1 min; the asynchronous standby loses up to 5 s; the delayed replica, 1 h behind, loses up to 5 s. After it, serving again: full backups in 3.3 h; point-in-time recovery in 5.7 h; the standby in 1 min; the delayed replica in 7 min. A schematic, worst-case model.
- Play the disaster and the recovery

#### after Table dropped

- With 2 TB and a table dropped, full backups lose up to 24 h of the table's writes and get the table back in 3.4 h; point-in-time recovery loses nothing and gets the table back in 5.8 h; the standby cannot bring the table back; the delayed replica loses nothing and gets the table back in 7 min.
- writes all day. At the worst
- moment, just before the
- next full backup, someone
- drops a table.
- and the time until the table is
- back (RTO).
- DROP
- table dropped
- keeps serving; only the table is gone
- loses nothing
- cannot bring it back
- applies the drop too
- the drop waits 1 h in its log
- UNTIL THE TABLE IS BACK · RTO
- TIME AFTER THE DROP
- 3.4 h · was 3.3 h
- · was 3.3 h
- restore 2 TB beside the primary
- at 10 GB/min: 200 min; copy the table
- back: 1 min
- 5.8 h · was 5.7 h
- · was 5.7 h
- restore beside the primary: 200 min;
- replay 24 h of log to just before the drop
- at 10×: 144 min; copy the table back: 1 min;
- 345 min in all
- never
- it has applied the drop too: no copy
- without it
- table back in 7 min
- pause it, replay its 1 h of log to just before
- the drop at 10×: 6 min; copy the table
- A timeline of one disaster and four recovery plans for a 2 TB database in which a table is dropped at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h of the table's writes; point-in-time recovery, the base backup plus the log archived every 1 min, loses nothing; the asynchronous standby cannot bring it back; the delayed replica, 1 h behind, loses nothing. After it, getting the table back: full backups in 3.4 h; point-in-time recovery in 5.8 h; the standby never; the delayed replica in 7 min. A schematic, worst-case model.

#### after 500 GB

- With 500 GB and a table dropped, full backups lose up to 24 h of the table's writes and get the table back in 51 min; point-in-time recovery loses nothing and gets the table back in 3.3 h; the standby cannot bring the table back; the delayed replica loses nothing and gets the table back in 7 min.
- A 500 GB database takes
- 51 min · was 3.4 h
- · was 3.4 h
- restore 500 GB beside the primary
- at 10 GB/min: 50 min; copy the table back:
- 3.3 h · was 5.8 h
- · was 5.8 h
- restore beside the primary: 50 min; replay
- 24 h of log to just before the drop at 10×:
- 144 min; copy the table back: 1 min;
- 195 min in all
- A timeline of one disaster and four recovery plans for a 500 GB database in which a table is dropped at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h of the table's writes; point-in-time recovery, the base backup plus the log archived every 1 min, loses nothing; the asynchronous standby cannot bring it back; the delayed replica, 1 h behind, loses nothing. After it, getting the table back: full backups in 51 min; point-in-time recovery in 3.3 h; the standby never; the delayed replica in 7 min. A schematic, worst-case model.

#### after 50 GB/min

- With 500 GB and a table dropped, full backups lose up to 24 h of the table's writes and get the table back in 11 min; point-in-time recovery loses nothing and gets the table back in 2.6 h; the standby cannot bring the table back; the delayed replica loses nothing and gets the table back in 7 min.
- 11 min · was 51 min
- · was 51 min
- at 50 GB/min: 10 min; copy the table back:
- 2.6 h · was 3.3 h
- restore beside the primary: 10 min; replay
- 155 min in all
- A timeline of one disaster and four recovery plans for a 500 GB database in which a table is dropped at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h of the table's writes; point-in-time recovery, the base backup plus the log archived every 1 min, loses nothing; the asynchronous standby cannot bring it back; the delayed replica, 1 h behind, loses nothing. After it, getting the table back: full backups in 11 min; point-in-time recovery in 2.6 h; the standby never; the delayed replica in 7 min. A schematic, worst-case model.

#### after 6 h

- With 500 GB and a table dropped, full backups lose up to 6 h of the table's writes and get the table back in 11 min; point-in-time recovery loses nothing and gets the table back in 47 min; the standby cannot bring the table back; the delayed replica loses nothing and gets the table back in 7 min.
- 6 h · was 24 h
- · was 24 h
- a full copy every 6 h
- table back in 11 min
- 47 min · was 2.6 h
- · was 2.6 h
- 6 h of log to just before the drop at 10×:
- 36 min; copy the table back: 1 min; 47 min
- in all
- A timeline of one disaster and four recovery plans for a 500 GB database in which a table is dropped at the worst moment. Before the disaster, on a log scale: full backups every 6 h lose up to 6 h of the table's writes; point-in-time recovery, the base backup plus the log archived every 1 min, loses nothing; the asynchronous standby cannot bring it back; the delayed replica, 1 h behind, loses nothing. After it, getting the table back: full backups in 11 min; point-in-time recovery in 47 min; the standby never; the delayed replica in 7 min. A schematic, worst-case model.

#### after 1 h

- With 500 GB and a table dropped, full backups lose up to 1 h of the table's writes and get the table back in 11 min; point-in-time recovery loses nothing and gets the table back in 17 min; the standby cannot bring the table back; the delayed replica loses nothing and gets the table back in 7 min.
- loses 1 h · was 6 h
- · was 6 h
- a full copy every 1 h
- 17 min · was 47 min
- · was 47 min
- 1 h of log to just before the drop at 10×:
- 6 min; copy the table back: 1 min; 17 min
- A timeline of one disaster and four recovery plans for a 500 GB database in which a table is dropped at the worst moment. Before the disaster, on a log scale: full backups every 1 h lose up to 1 h of the table's writes; point-in-time recovery, the base backup plus the log archived every 1 min, loses nothing; the asynchronous standby cannot bring it back; the delayed replica, 1 h behind, loses nothing. After it, getting the table back: full backups in 11 min; point-in-time recovery in 17 min; the standby never; the delayed replica in 7 min. A schematic, worst-case model.

#### after 10 s

- loses 1 h
- base backup, log every 10 s
- table back in 17 min
- A timeline of one disaster and four recovery plans for a 500 GB database in which a table is dropped at the worst moment. Before the disaster, on a log scale: full backups every 1 h lose up to 1 h of the table's writes; point-in-time recovery, the base backup plus the log archived every 10 s, loses nothing; the asynchronous standby cannot bring it back; the delayed replica, 1 h behind, loses nothing. After it, getting the table back: full backups in 11 min; point-in-time recovery in 17 min; the standby never; the delayed replica in 7 min. A schematic, worst-case model.

#### after Sync

- With 500 GB and a table dropped, full backups lose up to 1 h of the table's writes and get the table back in 11 min; point-in-time recovery loses nothing and gets the table back in 17 min; the synchronous standby cannot bring the table back; the delayed replica loses nothing and gets the table back in 7 min.
- A timeline of one disaster and four recovery plans for a 500 GB database in which a table is dropped at the worst moment. Before the disaster, on a log scale: full backups every 1 h lose up to 1 h of the table's writes; point-in-time recovery, the base backup plus the log archived every 10 s, loses nothing; the synchronous standby cannot bring it back; the delayed replica, 1 h behind, loses nothing. After it, getting the table back: full backups in 11 min; point-in-time recovery in 17 min; the standby never; the delayed replica in 7 min. A schematic, worst-case model.

#### after Disks lost

- With 500 GB and the disks lost, full backups lose up to 1 h and serve again in 10 min; point-in-time recovery loses up to 10 s and serves again in 16 min; the synchronous standby loses nothing and serves again in 1 min; the delayed replica loses up to 5 s and serves again in 7 min.
- a full copy every 1 h, in another account
- 10 s · was nothing
- · was nothing
- the primary waits for it on every commit
- 10 min · was 11 min
- · was 11 min
- restore 500 GB at 50 GB/min: 10 min
- 16 min · was 17 min
- · was 17 min
- restore: 10 min; replay 1 h of log at 10×:
- 6 min; 16 min in all
- A timeline of one disaster and four recovery plans for a 500 GB database whose disks fail at the worst moment. Before the disaster, on a log scale: full backups every 1 h lose up to 1 h; point-in-time recovery, the base backup plus the log archived every 10 s, loses up to 10 s; the synchronous standby loses nothing; the delayed replica, 1 h behind, loses up to 5 s. After it, serving again: full backups in 10 min; point-in-time recovery in 16 min; the standby in 1 min; the delayed replica in 7 min. A schematic, worst-case model.

#### after 24 h

- With 500 GB and the disks lost, full backups lose up to 24 h and serve again in 10 min; point-in-time recovery loses up to 10 s and serves again in 2.6 h; the synchronous standby loses nothing and serves again in 1 min; the delayed replica loses up to 5 s and serves again in 7 min.
- 24 h · was 1 h
- · was 1 h
- loses 10 s
- back in 10 min
- 2.6 h · was 16 min
- · was 16 min
- restore: 10 min; replay 24 h of log at 10×:
- 144 min; 154 min in all
- A timeline of one disaster and four recovery plans for a 500 GB database whose disks fail at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h; point-in-time recovery, the base backup plus the log archived every 10 s, loses up to 10 s; the synchronous standby loses nothing; the delayed replica, 1 h behind, loses up to 5 s. After it, serving again: full backups in 10 min; point-in-time recovery in 2.6 h; the standby in 1 min; the delayed replica in 7 min. A schematic, worst-case model.

#### after Async

- With 500 GB and the disks lost, full backups lose up to 24 h and serve again in 10 min; point-in-time recovery loses up to 10 s and serves again in 2.6 h; the standby loses up to 5 s and serves again in 1 min; the delayed replica loses up to 5 s and serves again in 7 min.
- loses 5 s · was nothing
- back in 2.6 h
- A timeline of one disaster and four recovery plans for a 500 GB database whose disks fail at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h; point-in-time recovery, the base backup plus the log archived every 10 s, loses up to 10 s; the asynchronous standby loses up to 5 s; the delayed replica, 1 h behind, loses up to 5 s. After it, serving again: full backups in 10 min; point-in-time recovery in 2.6 h; the standby in 1 min; the delayed replica in 7 min. A schematic, worst-case model.

#### after 10 TB

- With 10 TB and the disks lost, full backups lose up to 24 h and serve again in 3.3 h; point-in-time recovery loses up to 10 s and serves again in 5.7 h; the standby loses up to 5 s and serves again in 1 min; the delayed replica loses up to 5 s and serves again in 7 min.
- A 10 TB database takes
- 3.3 h · was 10 min
- · was 10 min
- restore 10 TB at 50 GB/min: 200 min
- 5.7 h · was 2.6 h
- A timeline of one disaster and four recovery plans for a 10 TB database whose disks fail at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h; point-in-time recovery, the base backup plus the log archived every 10 s, loses up to 10 s; the asynchronous standby loses up to 5 s; the delayed replica, 1 h behind, loses up to 5 s. After it, serving again: full backups in 3.3 h; point-in-time recovery in 5.7 h; the standby in 1 min; the delayed replica in 7 min. A schematic, worst-case model.

#### after 5 min

- With 10 TB and the disks lost, full backups lose up to 24 h and serve again in 3.3 h; point-in-time recovery loses up to 5 min and serves again in 5.7 h; the standby loses up to 5 s and serves again in 1 min; the delayed replica loses up to 5 s and serves again in 7 min.
- 5 min · was 10 s
- · was 10 s
- base backup, log every 5 min
- A timeline of one disaster and four recovery plans for a 10 TB database whose disks fail at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h; point-in-time recovery, the base backup plus the log archived every 5 min, loses up to 5 min; the asynchronous standby loses up to 5 s; the delayed replica, 1 h behind, loses up to 5 s. After it, serving again: full backups in 3.3 h; point-in-time recovery in 5.7 h; the standby in 1 min; the delayed replica in 7 min. A schematic, worst-case model.

#### after 20×

- With 10 TB and the disks lost, full backups lose up to 24 h and serve again in 3.3 h; point-in-time recovery loses up to 5 min and serves again in 4.5 h; the standby loses up to 5 s and serves again in 1 min; the delayed replica loses up to 5 s and serves again in 4 min.
- loses 5 min
- 4.5 h · was 5.7 h
- restore: 200 min; replay 24 h of log at 20×:
- 72 min; 272 min in all
- 4 min · was 7 min
- · was 7 min
- replay its 1 h of log at 20×: 3 min; promote
- A timeline of one disaster and four recovery plans for a 10 TB database whose disks fail at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h; point-in-time recovery, the base backup plus the log archived every 5 min, loses up to 5 min; the asynchronous standby loses up to 5 s; the delayed replica, 1 h behind, loses up to 5 s. After it, serving again: full backups in 3.3 h; point-in-time recovery in 4.5 h; the standby in 1 min; the delayed replica in 4 min. A schematic, worst-case model.

#### after 10 GB/min

- With 10 TB and the disks lost, full backups lose up to 24 h and serve again in 16.7 h; point-in-time recovery loses up to 5 min and serves again in 17.9 h; the standby loses up to 5 s and serves again in 1 min; the delayed replica loses up to 5 s and serves again in 4 min.
- 16.7 h · was 3.3 h
- restore 10 TB at 10 GB/min: 1,000 min
- 17.9 h · was 4.5 h
- · was 4.5 h
- restore: 1,000 min; replay 24 h of log
- at 20×: 72 min; 1,072 min in all
- back in 4 min
- A timeline of one disaster and four recovery plans for a 10 TB database whose disks fail at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h; point-in-time recovery, the base backup plus the log archived every 5 min, loses up to 5 min; the asynchronous standby loses up to 5 s; the delayed replica, 1 h behind, loses up to 5 s. After it, serving again: full backups in 16.7 h; point-in-time recovery in 17.9 h; the standby in 1 min; the delayed replica in 4 min. A schematic, worst-case model.

#### after 2 TB

- With 2 TB and the disks lost, full backups lose up to 24 h and serve again in 3.3 h; point-in-time recovery loses up to 5 min and serves again in 4.5 h; the standby loses up to 5 s and serves again in 1 min; the delayed replica loses up to 5 s and serves again in 4 min.
- 3.3 h · was 16.7 h
- · was 16.7 h
- 4.5 h · was 17.9 h
- · was 17.9 h
- A timeline of one disaster and four recovery plans for a 2 TB database whose disks fail at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h; point-in-time recovery, the base backup plus the log archived every 5 min, loses up to 5 min; the asynchronous standby loses up to 5 s; the delayed replica, 1 h behind, loses up to 5 s. After it, serving again: full backups in 3.3 h; point-in-time recovery in 4.5 h; the standby in 1 min; the delayed replica in 4 min. A schematic, worst-case model.

#### after 1 min

- With 2 TB and the disks lost, full backups lose up to 24 h and serve again in 3.3 h; point-in-time recovery loses up to 1 min and serves again in 4.5 h; the standby loses up to 5 s and serves again in 1 min; the delayed replica loses up to 5 s and serves again in 4 min.
- 1 min · was 5 min
- · was 5 min
- back in 4.5 h
- A timeline of one disaster and four recovery plans for a 2 TB database whose disks fail at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h; point-in-time recovery, the base backup plus the log archived every 1 min, loses up to 1 min; the asynchronous standby loses up to 5 s; the delayed replica, 1 h behind, loses up to 5 s. After it, serving again: full backups in 3.3 h; point-in-time recovery in 4.5 h; the standby in 1 min; the delayed replica in 4 min. A schematic, worst-case model.

#### after 10×

- With 2 TB and the disks lost, full backups lose up to 24 h and serve again in 3.3 h; point-in-time recovery loses up to 1 min and serves again in 5.7 h; the standby loses up to 5 s and serves again in 1 min; the delayed replica loses up to 5 s and serves again in 7 min.
- 5.7 h · was 4.5 h
- 7 min · was 4 min
- · was 4 min

#### Play, Disks lost

- The disks of this 2 TB database fail just before the next full backup and the next log archive. Full backups lose up to 24 h of writes and serve again in 3.3 h, restoring 2 TB at 10 GB/min. Point-in-time recovery loses up to 1 min, the log not yet archived; it restores the same base backup, then replays 24 h of log at 10×, and serves again in 5.7 h. The standby loses its 5 s of lag and is promoted in 1 min. The delayed replica loses the same 5 s and serves again in 7 min, once it has applied the hour it holds.
- Written below the picture.

#### Play, Table dropped

- A table is dropped just before the next full backup of this 2 TB database, and the primary keeps serving. Full backups lose up to 24 h of the table's writes and get the table back in 3.4 h, restoring 2 TB beside the primary at 10 GB/min and copying the table back. Point-in-time recovery replays to just before the drop and loses nothing; it restores the same base backup beside the primary, then replays 24 h of log at 10×, and gets the table back in 5.8 h. The standby applies the drop 5 s after the primary and cannot bring the table back. The delayed replica holds the drop in its log for 1 h: paused in time, it loses nothing and gets the table back in 7 min.

#### Describe

- 3.3 h · was 3.4 h
- 5.7 h · was 5.8 h
- Hide the description
- Plan
- Loses
- Back in
- Full backups, disk
- 3.3 h
- Point-in-time, disk
- 5.7 h
- Standby, disk
- 5 s
- Delayed replica, disk
- 7 min
- Full backups, drop
- 3.4 h
- Point-in-time, drop
- nothing
- 5.8 h
- Standby, drop
- the table
- Delayed replica, drop
- Rows are this setting's: 2 TB restored at 10 GB/min, a full backup every 24 h, the log archived every 1 min and replayed at 10×, the standby 5 s behind. Worst case, from a schematic model.
- Each plan against each disaster, for these settings

#### experiment 1 asking

- Play and every setting wait for your answer.
- loses ?
- shows after your answer
- table back in 3.4 h
- table back in 5.8 h
- table back in ?
- Whether and when it gets the table back
- shows after your answer.
- Look here
- A schematic model. Its assumptions show after your answer.
- Describe waits for your answer.
- Just before the nightly full backup, someone drops the orders table. The standby applies every change 5 s after the primary does. What can the standby bring back?
- The table as it was 5 s before the drop: it runs 5 s behind
- Everything but the last 5 s of writes, as after a dead disk
- Nothing: it applies the drop 5 s after the primary does
- A timeline of one disaster and four recovery plans for a 2 TB database in which a table is dropped at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h of the table's writes; point-in-time recovery, the base backup plus the log archived every 1 min, loses nothing; the standby: what it can bring back shows after your answer; the delayed replica: what it can bring back shows after your answer. After it, getting the table back: full backups in 3.4 h; point-in-time recovery in 5.8 h; the standby: after your answer; the delayed replica: after your answer. A schematic, worst-case model.
- Play the disaster and the recovery, after your answer
- Experiment: A dropped table

#### experiment 1 revealed

- Nothing: a replica is not a backup. A standby copies every change within seconds, the drop included, so 5 s after the primary loses the table, the standby loses it too. It protects against losing a machine, not against losing the data: a bad migration or ransomware reaches it the same way, so keep backups immutable in another account, retained long enough to reach back before a mistake noticed weeks later. Point-in-time recovery, restored beside the primary, stops just before the drop and loses nothing, but gets the table back only in 5.8 h.
- your answer, wrong
- correct answer
- done

#### experiment 2 asking

- loses 6 h
- back in ?
- Its time to serve again shows after
- your answer.
- back in 13 min
- replay its 1 h of log at 5×: 12 min; promote
- A 10 TB database restores at 50 GB/min. A full backup runs every 6 h, the log is archived every 1 min, and replay runs 5× as fast as the writes came in. The disks fail just before the next full backup. How long until point-in-time recovery serves again?
- 3.3 h: the restore, since the log replays while the backup copies
- 4.5 h: the restore, then 6 h of log at 5×
- 8.1 h: the restore, then the day's 24 h of log at 5×
- A timeline of one disaster and four recovery plans for a 10 TB database whose disks fail at the worst moment. Before the disaster, on a log scale: full backups every 6 h lose up to 6 h; point-in-time recovery, the base backup plus the log archived every 1 min, loses up to 1 min; the asynchronous standby loses up to 5 s; the delayed replica, 1 h behind, loses up to 5 s. After it, serving again: full backups in 3.3 h; point-in-time recovery: after your answer; the standby in 1 min; the delayed replica in 13 min. A schematic, worst-case model.
- Experiment: Ten terabytes, disks lost

#### experiment 2 revealed

- With 10 TB and the disks lost, full backups lose up to 6 h and serve again in 3.3 h; point-in-time recovery loses up to 1 min and serves again in 4.5 h; the standby loses up to 5 s and serves again in 1 min; the delayed replica loses up to 5 s and serves again in 13 min.
- restore: 200 min; replay 6 h of log at 5×:
- Replay can start only once the restore is done, and it must apply every change since the base backup: 200 min to copy 10 TB at 50 GB/min, then 6 h of log at 5×, 72 min, so 272 min in all, 4.5 h. The size and the restore speed set the first term. The second is the log since the newest base backup, 6 h here and not the whole day, at the replay speed. Only the last 1 min of writes, not yet archived, is lost.
- A timeline of one disaster and four recovery plans for a 10 TB database whose disks fail at the worst moment. Before the disaster, on a log scale: full backups every 6 h lose up to 6 h; point-in-time recovery, the base backup plus the log archived every 1 min, loses up to 1 min; the asynchronous standby loses up to 5 s; the delayed replica, 1 h behind, loses up to 5 s. After it, serving again: full backups in 3.3 h; point-in-time recovery in 4.5 h; the standby in 1 min; the delayed replica in 13 min. A schematic, worst-case model.

#### experiment 3 asking

- Point-in-time recovery here loses up to 1 min of writes and serves again in 5.7 h. Archive the log every 10 s instead. What changes?
- Only the loss, to 10 s: the replay still starts at the base backup
- Both: 10 s lost, and smaller pieces of log replay sooner
- Neither: the full backups set how much is lost
- Experiment: Archive more often

#### experiment 3 revealed

- With 2 TB and the disks lost, full backups lose up to 24 h and serve again in 3.3 h; point-in-time recovery loses up to 10 s and serves again in 5.7 h; the standby loses up to 5 s and serves again in 1 min; the delayed replica loses up to 5 s and serves again in 7 min.
- 10 s · was 1 min
- · was 1 min
- Only the loss: 10 s instead of 1 min. The archive interval is how much log a dead disk can take with it. Recovery still restores the base backup and replays all 24 h of log since it, cut into more pieces but no shorter, so it serves again in 5.7 h as before. Archiving more often costs more stored objects and requests; streaming the log as it is written takes the loss to about a second.
- A timeline of one disaster and four recovery plans for a 2 TB database whose disks fail at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h; point-in-time recovery, the base backup plus the log archived every 10 s, loses up to 10 s; the asynchronous standby loses up to 5 s; the delayed replica, 1 h behind, loses up to 5 s. After it, serving again: full backups in 3.3 h; point-in-time recovery in 5.7 h; the standby in 1 min; the delayed replica in 7 min. A schematic, worst-case model.
- your answer, correct

#### experiment 4 asking

- The database grows from 2 TB to 10 TB, with the same backups, standbys, restore speed and replay. Whose recovery time grows?
- Every plan's: there is five times the data to bring back
- Only point-in-time recovery's: five times the log to replay
- The two that restore a backup: they copy every byte back
- Experiment: Five times the data

#### experiment 4 revealed

- With 10 TB and the disks lost, full backups lose up to 24 h and serve again in 16.7 h; point-in-time recovery loses up to 1 min and serves again in 19.1 h; the standby loses up to 5 s and serves again in 1 min; the delayed replica loses up to 5 s and serves again in 7 min.
- 19.1 h · was 5.7 h
- at 10×: 144 min; 1,144 min in all
- The two that restore a backup: full backups go from 3.3 h to 16.7 h and point-in-time recovery from 5.7 h to 19.1 h, because copying 10 TB at 10 GB/min takes 16.7 h. The log to replay is the writes since the base backup, which depend on the write rate, here unchanged, not on the size, and the standbys already hold every byte: they serve again in 1 min and 7 min as before. A large database restores faster from a volume snapshot, back in minutes though slow until its blocks load, or fails over to a replica.
- A timeline of one disaster and four recovery plans for a 10 TB database whose disks fail at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h; point-in-time recovery, the base backup plus the log archived every 1 min, loses up to 1 min; the asynchronous standby loses up to 5 s; the delayed replica, 1 h behind, loses up to 5 s. After it, serving again: full backups in 16.7 h; point-in-time recovery in 19.1 h; the standby in 1 min; the delayed replica in 7 min. A schematic, worst-case model.

#### experiment 5 asking

- table back in 8.2 h
- at 5×: 288 min; copy the table back: 1 min;
- 489 min in all
- Someone drops a table just before the nightly full backup and notices within minutes. A delayed replica receives the log 5 s after the primary writes it but applies it only 1 h later, and its replay runs 5× as fast as the writes came in. How soon can it give the table back, at the earliest, and how much is lost?
- 13 min, nothing lost: pause it before it applies the drop, roll it forward to just before, copy the table back
- 73 min, nothing lost: its 1 h delay cannot be skipped, so it must wait out the hour before replaying
- Never: like the standby, it applies the drop and loses the table
- A timeline of one disaster and four recovery plans for a 2 TB database in which a table is dropped at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h of the table's writes; point-in-time recovery, the base backup plus the log archived every 1 min, loses nothing; the asynchronous standby cannot bring it back; the delayed replica: what it can bring back shows after your answer. After it, getting the table back: full backups in 3.4 h; point-in-time recovery in 8.2 h; the standby never; the delayed replica: after your answer. A schematic, worst-case model.
- Experiment: A replica an hour behind

#### experiment 5 revealed

- With 2 TB and a table dropped, full backups lose up to 24 h of the table's writes and get the table back in 3.4 h; point-in-time recovery loses nothing and gets the table back in 8.2 h; the standby cannot bring the table back; the delayed replica loses nothing and gets the table back in 13 min.
- 13 min
- the drop at 5×: 12 min; copy the table back:
- The table is back in 13 min with nothing lost: the drop sits in its log, received but not applied, for 1 h. The delay only holds back applying, so pause it before it applies the drop and replay what it has received, up to just before the drop, as fast as it can: at most 1 h of log at 5×, 12 min. Then copy the table back in 1 min, while the primary keeps serving. Point-in-time recovery gets the same table back in 8.2 h. The catch is the hour: a drop noticed later has reached this replica too, which is why it adds to backups and never replaces them.
- A timeline of one disaster and four recovery plans for a 2 TB database in which a table is dropped at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h of the table's writes; point-in-time recovery, the base backup plus the log archived every 1 min, loses nothing; the asynchronous standby cannot bring it back; the delayed replica, 1 h behind, loses nothing. After it, getting the table back: full backups in 3.4 h; point-in-time recovery in 8.2 h; the standby never; the delayed replica in 13 min. A schematic, worst-case model.

#### challenge

- 1 h goal
- Describe waits until you meet the goal.
- ✓point-in-time recovery loses at most 1 min (now up to 1 min): met
- ·point-in-time recovery serves again within 1 h (now 5.7 h): not yet
- ✓no more than one full backup every 6 h (now every 24 h): met
- Experiment: One minute, one hour

#### challenge after 50 GB/min

- With 2 TB and the disks lost, full backups lose up to 24 h and serve again in 40 min; point-in-time recovery loses up to 1 min and serves again in 3.1 h; the standby loses up to 5 s and serves again in 1 min; the delayed replica loses up to 5 s and serves again in 7 min.
- 40 min · was 3.3 h
- restore 2 TB at 50 GB/min: 40 min
- 3.1 h · was 5.7 h
- restore: 40 min; replay 24 h of log at 10×:
- 144 min; 184 min in all
- ·point-in-time recovery serves again within 1 h (now 3.1 h): not yet
- A timeline of one disaster and four recovery plans for a 2 TB database whose disks fail at the worst moment. Before the disaster, on a log scale: full backups every 24 h lose up to 24 h; point-in-time recovery, the base backup plus the log archived every 1 min, loses up to 1 min; the asynchronous standby loses up to 5 s; the delayed replica, 1 h behind, loses up to 5 s. After it, serving again: full backups in 40 min; point-in-time recovery in 3.1 h; the standby in 1 min; the delayed replica in 7 min. A schematic, worst-case model.

#### challenge after 6 h

- With 2 TB and the disks lost, full backups lose up to 6 h and serve again in 40 min; point-in-time recovery loses up to 1 min and serves again in 76 min; the standby loses up to 5 s and serves again in 1 min; the delayed replica loses up to 5 s and serves again in 7 min.
- back in 40 min
- 76 min · was 3.1 h
- · was 3.1 h
- restore: 40 min; replay 6 h of log at 10×:
- 36 min; 76 min in all
- ·point-in-time recovery serves again within 1 h (now 76 min): not yet
- ✓no more than one full backup every 6 h (now every 6 h): met
- A timeline of one disaster and four recovery plans for a 2 TB database whose disks fail at the worst moment. Before the disaster, on a log scale: full backups every 6 h lose up to 6 h; point-in-time recovery, the base backup plus the log archived every 1 min, loses up to 1 min; the asynchronous standby loses up to 5 s; the delayed replica, 1 h behind, loses up to 5 s. After it, serving again: full backups in 40 min; point-in-time recovery in 76 min; the standby in 1 min; the delayed replica in 7 min. A schematic, worst-case model.

#### challenge after 20×

- With 2 TB and the disks lost, full backups lose up to 6 h and serve again in 40 min; point-in-time recovery loses up to 1 min and serves again in 58 min; the standby loses up to 5 s and serves again in 1 min; the delayed replica loses up to 5 s and serves again in 4 min.
- 58 min · was 76 min
- · was 76 min
- restore: 40 min; replay 6 h of log at 20×:
- 18 min; 58 min in all
- Goal met:
- ✓point-in-time recovery serves again within 1 h (now 58 min): met
- Restore at 50 GB/min, a full backup every 6 h and replay at 20×: 40 min to restore 2 TB, then at most 6 h of log in 18 min, 58 min in all; with the log archived every 1 min or more often, it loses at most that. At 10× the replay takes 36 min, 76 min in all with the restore, and misses the hour; hourly full backups would make it, but read 2 TB from the primary 24 times a day, unless they are incremental or taken from a standby. At 10 TB nothing here meets the hour: copying it at 50 GB/min takes 3.3 h alone. So large databases restore from volume snapshots, or fail over to a standby for the dead disk and a delayed replica for the bad delete, and keep point-in-time recovery for the rest. And a recovery time is real only once a drill has measured it.
- A timeline of one disaster and four recovery plans for a 2 TB database whose disks fail at the worst moment. Before the disaster, on a log scale: full backups every 6 h lose up to 6 h; point-in-time recovery, the base backup plus the log archived every 1 min, loses up to 1 min; the asynchronous standby loses up to 5 s; the delayed replica, 1 h behind, loses up to 5 s. After it, serving again: full backups in 40 min; point-in-time recovery in 58 min; the standby in 1 min; the delayed replica in 4 min. A schematic, worst-case model.
