# Backups & Recovery widget (`recovery`): design brief

Redesign R42, the third of its four remaining widgets (REDESIGN.md 5.2: the R41 to R45 entry, its "Forms" bullet and
the notes of the R41 widgets from Data Modeling to Storage Engines; LOOP.md rows 122 to 128 are the house references).
Lesson: `/design/topics/sd-recovery`. REDESIGN.md names no picture for this widget: its form comes from this brief and
its critics. Files beside this brief, on the orphan branch `design/r42-recovery`:

| File          | What it is |
| ------------- | ---------- |
| `model.js`    | The schematic worst-case model (four plans, two disasters, the two scales) and the six experiments as slot templates; ported 1:1 to `libs/engine/src/sysdesign/lessons/widgets/recovery.ts` and `recovery-experiments.ts` |
| `enum.cjs`    | Prints every number and checks the model against the lesson's quoted numbers, a second-by-second simulated timeline (writes, full backups, archived segments, both replicas, the disaster at every moment of the cycle), a second-by-second simulated recovery (copy, replay, promote), the experiments' word claims by rule over all 972 settings, the load-time stage against every answer, and enumerates the challenge (12,108 checks) |
| `mockup.html` | The mockup with the app's tokens and fonts: `?state=default\|drop\|big\|frequent\|small\|playing\|describe\|reduced\|ask&exp=1..5\|reveal&exp=1..5\|challenge&theme=light\|dark`; `playing` takes `&frac=` (the play's clock, 0 to 1) and `&disaster=1`; `ask` takes `&phase=playing&frac=` (the answer's play, hiding held); `challenge` takes `&start=1`. Its Play button plays the clock for a reader |
| `shoot.cjs`   | Screenshots every state at 1280, 390 and 320 px in both themes with the page's collision report and layout assertions, then sweeps every setting at many widths (at rest, through the play, after a change with its ghost), every experiment asking, playing and revealed, the no-answer sweep with eighteen planted leaks, the load-time stage against every answer, every sentence of every setting, Describe's box at four widths, the stage heights per width and the widget's heights |
| `changes.md`  | Each critique item and what changed for it |

## 1. The verdict, and the mechanism

**Today's widget against the bar.** Three plan buttons, two disaster buttons, four size and four speed buttons, a
slider that appears for one plan, and three tiles ("Data comes back", "Writes lost (RPO)", "Back in service (RTO)").
Every number is right and none of them is a picture. A learner can read "RPO 1 min, RTO 5.7 h" and still not say why
point-in-time recovery loses a minute (the log segment not yet shipped), why it takes hours (a restore of the whole
database, then a replay of a day of log, one after the other), why the standby is back in a minute but useless after a
`DROP TABLE` (it applies the drop five seconds later), or which knob moves which number. It shows one plan at a time,
so the comparison the interview asks for, "which plan meets RPO one minute and RTO one hour, and what happens when
someone drops a table?", needs three taps and a memory. Far below the bar.

**What the learner must see.** Every plan is judged by two numbers, and both are distances in time from the disaster:

- **Backwards: the recovery point (RPO).** What a plan can bring back is the newest moment some surviving copy holds.
  A full backup holds the moment it was taken; point-in-time recovery holds the base backup plus every archived log
  segment, so it reaches the last segment shipped (a dead disk takes the one being filled) or, after a drop, any moment
  before it; an async standby holds everything but its lag, a sync one everything; a delayed replica has received the
  log seconds behind but applied it an hour behind.
- **Forwards: the recovery time (RTO).** Restoring copies the database back at a fixed speed (size over throughput);
  point-in-time recovery then replays every change since the base backup at a multiple of the speed it was written,  and only after the copy is done; a replica only needs promoting, a delayed one first applies the hour it holds.
  After a dropped table the primary keeps serving: every plan recovers *beside* it (a restore to the side, a paused
  delayed replica) and copies the table back, because restoring or promoting in place would throw away every write
  made since the drop (the lesson's worked example 2). So after a drop the RTO is the time until the table is back.
- **A replica is not a backup.** A replica applies every change, so a drop, a bad migration or ransomware reaches it in
  seconds: it answers a dead disk and never a bad delete. Only a copy that can stop before the mistake (point-in-time
  recovery, a delayed replica caught in time) brings the table back.

So the picture is one disaster in the middle of time: what each plan loses is drawn to its left, how long each takes to
serve again to its right, and the knobs sit beside the side they move.

**What the widget draws, what experiments test, and what stays text** (as a senior interviewer weighs them):

| Idea | Weight | Where |
| ---- | ------ | ----- |
| RPO and RTO, the two numbers a plan is judged by | core | The stage's two blocks ("What each plan loses · RPO", "Time until it serves again · RTO"), the step line at rest, every row's two values, the challenge |
| Restore time = size / throughput | core | The full backups' ledger "restore 2 TB at 10 GB/min: 200 min", its blue bar, the same blue first step of point-in-time recovery's bar; E4; the challenge |
| PITR = base backup + continuous log archiving; RPO = the archive interval for a dead disk, zero for a pinpointed drop | core | The PITR row: the base backup's box, the amber comb of shipped segments, the recovery point at the last one and the lost hatch after it; after a drop, the comb to the disaster and "loses nothing"; E3 |
| PITR's RTO = restore, then replay of everything since the base | core | Its bar on a linear axis, so restore and replay are drawn at their minutes: blue restore then amber replay; the ledger "restore: 200 min; replay 24 h of log at 10×: 144 min; 344 min in all"; the first-90-min inset; E2, E3, the challenge |
| After a drop, recover beside the primary and copy the table back | core | Drop mode's words ("TIME UNTIL THE TABLE IS BACK", "table back in 5.8 h", "restore 2 TB beside the primary", "copy the table back: 1 min", the primary's "keeps serving; only the table is gone"); E1, E5 |
| Base backup frequency trades RTO (less replay) against cost (each reads the whole database) | core | The "Full backup every" control moves the box, the full backups' loss and the replay; the challenge's bound |
| Async and sync standbys: failover in a minute, RPO the lag or zero | core | The standby row: blue band to its lag, its ring, "loses 5 s" or "loses nothing"; green 1 min bar; the Sync control |
| Replicas copy logical errors | core | After a drop, the standby's ✕ at the disaster, "cannot bring it back", "never", the ledger "it has applied the drop too"; E1 |
| Delayed replicas | high | Its row: applied band an hour behind, received log after it, the drop waiting in its log; E5 and the challenge's reveal |
| Worst case, not expected | high | The workload sentence ("at the worst moment: just before the next full backup and the next log archive"), the model note, `enum.cjs` section 2 |
| Backups off the primary's failure domain, immutable, retained | medium | The full backups' note "in another account", E1's reveal (immutable, in another account, retained long enough to reach back before a mistake noticed weeks later), the lesson's 3-2-1 concept |
| Lower RPO and RTO cost more | medium | The model note (more frequent full backups read the primary more often, a sync standby adds a round trip to every commit), E3's reveal (requests), the challenge's bound |
| Restore drills | medium | The model note ("the clocks start when recovery starts"), the challenge's last sentence, the lesson |
| Full, incremental, differential | medium | Lesson text and its third worked example: a restore chain drawn would double the backup row for a point the example already prices |
| Snapshots, DR tiers, runbooks | low | Lesson text; E4's and the challenge's reveals name snapshots |

**Settings** (numbers, as `ExperimentSettings` requires): `disaster` (0 disks lost, 1 a dropped table), `size` (500,
2,000, 10,000 GB), `restore` (10, 25, 50 GB/min), `base` (a full backup every 24, 6 or 1 h), `archive` (a segment every
10, 60 or 300 s), `replay` (5, 10, 20 times the write rate), `sync` (0 async, 1 sync). 972 settings. Fixed: the async
lag 5 s (`LAG_S`), promotion 1 min (`PROMOTE_MIN`), the replica's delay 1 h (`DELAY_H`). The default is the lesson's:
2 TB, 10 GB/min, nightly, 60 s, 10×, async, disks lost.

**Formulas** (all in `model.js`, ported 1:1; the disaster strikes just before the next full backup and the next archive):

- restore = size / restore speed (minutes); replay = base × 60 / replay speed (minutes: the whole cycle of log).
- Full backups: RPO = base × 3,600 s, either disaster; RTO = restore (+ 1 min copy-back after a drop).
- Point-in-time recovery: RPO = archive (dead disk) or 0 (drop); RTO = restore + replay (+ 1 min copy-back after a drop).
- After a drop, full backups, point-in-time recovery and the delayed replica end with a fixed 1 min step,
  `COPY_BACK_MIN`, copying the table back to the primary, which kept serving; none promotes (checked over every drop
  setting). Full backups' drop loss is "24 h of the table's writes".
- Standby: dead disk, RPO = 5 s (async) or 0 (sync), RTO = 1 min; drop: it cannot bring the data back (RPO and RTO
  infinite, drawn and said as "cannot bring it back" and "never", never as a number).
- Delayed replica: RPO = 5 s (dead disk) or 0 (drop, noticed within the hour); RTO = 60 / replay speed + 1 min (it
  applies the hour it holds, then is promoted; after a drop it is paused before the drop, rolled forward to just
  before it, and the table is copied back). Its delay counts from the primary's commit time, as Postgres's
  `recovery_min_apply_delay` and MySQL's `SOURCE_DELAY` do.
- Every step is a whole number of minutes at every setting (checked), so every ledger adds up as printed. Spans print
  as seconds under a minute, whole hours as hours, minutes under 100, then hours to a tenth (200 min is "3.3 h").
- Scales. Before the disaster: 1 s to 24 h on a log scale from a ring's radius in (so a ring at 24 h stays over the
  track), ending 14 px before the disaster line (zero losses sit 10 px before the line, the ring's outer edge 2 px
  clear of it). After it: 0 to 24 h, linear, so every step's length is proportional to its minutes in every bar
  (checked over every setting in `enum.cjs` and asserted per drawn step); a step under 1.5 px is drawn 1.5 px and its
  minutes are in the ledger. Under block B an inset, "FIRST 90 MIN, ZOOMED", redraws only the part of each bar inside
  0 to 90 min on its own linear scale (no bar ever mixes two scales), where the 1 min promotion, the delayed replica's
  minutes and the challenge's 1 h goal read at their lengths; a bar that runs on past 90 min ends at the inset's edge
  with a chevron. Recovery times run 1 min to 21.5 h and losses up to 24 h, all on the scales (checked).

The old `recovery()` returned a day of loss for the nightly backup and a day of replay for point-in-time recovery: the
new model is the same at the default (every lesson number holds: 200, 144, 344 minutes, 3.3, 5.7 and 19.1 h, 1 min,
5 s), and makes the cycle a setting and adds the delayed replica and the sync standby.

**Checks** (`node enum.cjs`, 20,866 pass).

1. The lesson's numbers (above), the "10 s interval moves the loss and not the time" claim, worked example 1's 200 and
   36 minutes.
2. A simulated timeline, second by second at a 0.5 s write resolution: full backups at every cycle, a segment shipped
   every `archive` seconds carrying the writes since the last, the standby applying each write `lag` later, the delayed
   replica receiving 5 s and applying an hour later, the disaster at forty moments through the cycle and at its end.
   For every plan, disaster, cycle, interval and standby mode (144 cases), the worst loss measured from the copies
   equals the model's within the 0.5 s resolution, and the worst moment is the cycle's end: the model's "worst case" is
   measured, not asserted. The standby after a drop carries the drop in every case.
3. A simulated recovery, second by second (1,944 recoveries): copy the size at the restore speed, replay exactly the log
   between the base and the target (the last archived segment, or just before the drop), promote. The model is never
   under the simulation, and over it by at most one minute (it replays the whole cycle where a dead disk's replay stops
   at the last segment, `archive` seconds short); every shown time agrees as printed.
4. The experiments: no digit outside a slot, one right answer each, positions 3, 2, 1, 3, 1; every word claim held by   rule over all 972 settings ("the archive interval never moves the recovery time", "size grows exactly the two
   restores, never the replicas or the replay"); every compared value on the scales (E2's 8.1 h, E5's 73 min); E2's
   three times distinct with the answer the middle one; E5 asks for the earliest time; no drop sentence of E1 or E5
   says "serve again", "promote" or "back in" without "table"; no answer on the load-time stage; and the challenge
   (below) at exactly one restore, base and replay triple.

**Honesty rule.** Every number the learner reads is the model's, and the model says what it is where the numbers are
read: "A schematic model, worst case" opens the note under the stage, which states every assumption (a fixed restore
speed, replay at a fixed multiple of the write rate, a fixed 5 s lag and 1 min promotion, the delayed replica's hour,
the drop noticed within it, the clocks starting when recovery starts); the summary ends "A schematic, worst-case
model."; the workload sentence names the worst moment; Describe's note says "Worst case, from a schematic model." The
drawn moments are the ones the numbers come from: a ring sits at its loss on the before scale and the lost hatch runs
from it to the disaster line, so the drawn gap is the RPO; a bar ends at its time on the linear after scale, its
steps the ledger's steps at the ledger's minutes, so the drawn bar is the RTO (asserted at every setting and width).
A step under 1.5 px (a 1 min promotion) is drawn 1.5 px from its own start (the next step keeps its own length), and
its minutes are in the ledger under it.

**Engine work.** New `widgets/recovery.ts` (`recoveryScenario(settings)`, `RECOVERY_SETTINGS`, the constants, the two
scale functions `beforeX` and `afterX`), retiring `recovery()`, `RecoveryRun`, `RecoveryPlan` and `Disaster` (their
only caller is the old widget; their spec moves). `recovery-experiments.ts` holds the six specs. Framework:
`ExperimentRun` gains `'recover'` (play the disaster and the recovery); `SlotUnit` gains `span` (seconds as a span),
`min` (ledger minutes), `size` exists (here GB to "2 TB"; a `tb` unit if the storage one cannot be shared), `speed`
("10 GB/min"); `times` exists. No template digits are allowed (the list gains nothing). The hide regions are
`replicasDrop`, `pitrTime`, `pitrAfter`, `rtoAfter` and `delayedOutcome` (3). `recovery.spec.ts` pins the formulas, the
lesson's numbers and both simulations at a coarser step; `recovery-experiments.spec.ts` every quoted number, the
answers, the word claims and the challenge's enumeration.

## 2. The picture

One `g-stage`, top to bottom at every width: the header, block A (before the disaster), its controls, a rule, block B
(after it), its controls. Nothing sits side by side, so the phone and the desktop read the same way, and each block's
rows line up with the plan rows of the other.

**Header.** "One disaster, four recovery plans" (title role; "One disaster, four plans" where Play would touch it)
with the Play disc (36 px in a 44 px box) at the right. Under it the workload, muted, its longest form's lines reserved
at this width: "A 2 TB database takes writes all day. Its disks fail at the worst moment: just before the next full
backup and the next log archive." ("… At the worst moment, just before the next full backup, someone drops a table.").
Under it the step line, in ink, its longest step's lines reserved: at rest "Each plan is judged by two numbers: the
writes it loses (RPO) and the time until it serves again (RTO)."; during a play, the play's step (Motion).

**Block A: what each plan loses.** Head "WHAT EACH PLAN LOSES · RPO", subtitle right "TIME BEFORE THE DISASTER, LOG
SCALE" (on phones under it, "BEFORE THE DISASTER, LOG SCALE"). A tick row: 24 h at the left edge, then 6 h, 1 h,
10 min, 1 min, 10 s, 1 s as width allows (24 h, 1 h and 1 min always; 6 px apart, asserted), and at the right end the
disaster's name in the critical ink, "DISKS FAIL" or "DROP". The disaster is one 2 px critical line from the tick row
down through every row's track. Five rows, each a name line (name left in ink, value right), a 12 px track, a note line:

- **Primary** "disks lost" / "table dropped": a grey band of writes all day, a critical ✕ at the line (a dead disk) or
  a critical drop tick (a drop). Note "takes writes all day; its disks fail at the worst moment" / after a drop "keeps
  serving; only the table is gone".
- **Full backups** "loses 24 h": a blue box (3 by 7 px) at each full backup of the day (1, 4 or 24 of them: at 1 h they
  narrow to keep 1 px apart), drawn above a soft blue band to the newest (what it holds); the recovery point ring
  round the newest box and the lost hatch from the ring's outer edge to the line. Note "a full copy every 24 h, in
  another account" (after a drop "…: the table as it was then").
- **The ring** is stroke only, r 7 with a 2 px stroke, centred on its moment: round a backup box it clears the box by
  2 px, so the box shows inside it (asserted: every full and base box has no filled mark over it and no ring stroke
  across it, at every setting and width). Grid ticks leave a gap round a ring, the challenge's goal tick included.
- **Point-in-time recovery** "loses 1 min": the base backup's box, then the archived log in amber: a tick a segment
  where they stand 2.5 px apart, and from the base backup to where they would crowd a solid band in the ticks' own
  ink and opacity (asserted), so the log only gets denser toward the left and never fades to the pale received-log
  fill; up to the last segment shipped, the ring there, the hatch after it. After a drop the comb runs to the line, the
  drop tick on it, the ring just before the line: "loses nothing". Note "the base backup, then the log archived every
  1 min".
- **Standby, asynchronous** "loses 5 s": the blue applied band to 5 s, ring, hatch. Sync: band to the line, "loses
  nothing". After a drop: the band to the line and a ✕ there, "cannot bring it back", note "applies every change 5 s
  after the primary: the drop too".
- **Delayed replica, 1 h behind** "loses 5 s": the blue applied band to 1 h, then the amber received log to 5 s, ring,
  hatch. After a drop: the received log runs to the line with the drop tick on it, ring just before: "loses nothing",
  note "the drop waits in its log for 1 h before it applies".

The values are critical ink for a loss, green for "loses nothing", critical for "cannot bring it back". Each plan's
name form ("Point-in-time recovery" or "Point-in-time", "Standby, asynchronous", "Async standby" or "Standby") is chosen
once per width, the longest that leaves room for its shortest value in both blocks at every setting, so a row reads as
the same plan in A and B. Under the
rows: three on-stage controls, native radio groups drawn as `g-segmented`, each in a `fieldset.group`: "Full backup
every" (24 h, 6 h, 1 h), "Log archived every" (10 s, 1 min, 5 min), "Standby" (Async, Sync); one row from a 520 px
stage (widths by segment count), stacked under it.

**Block B: time until it serves again** (after a drop: until the table is back). Head "TIME UNTIL IT SERVES AGAIN ·
RTO" / "TIME UNTIL THE TABLE IS BACK · RTO" ("UNTIL THE TABLE IS BACK · RTO" where the long form does not fit),
subtitle "TIME AFTER THE DISASTER" / "TIME AFTER THE DROP" (right, or its own line where any variant would not fit:
decided by width alone). During the recovery the subtitle's slot counts the clock in the ink ("NOW 2.9 h AFTER THE
DISASTER"), so a phone that has block B in view sees the clock beside the bars. The disaster is the axis's origin: its
tick reads "DISKS FAIL" / "DROP" in the critical ink and the 2 px critical line crosses every track at x0 (drawn
across tracks only, never through a label). Ticks 1 h, 3 h, 6 h, 12 h, 18 h, 24 h as width allows (6 h, 12 h and
24 h always), linear. Four rows, the same plans, each a name line (value right: "back in 3.3 h" / "table back in 3.4 h",
green, or "never", critical; a ghost's "· was 5.7 h" in the muted ink), a track, and a ledger that wraps. A row takes
only its own ledger lines, so the rows keep equal gaps (asserted); the slack up to the most any setting needs collects
in one reserved band at the block's foot, above its controls, so the height stays a function of the width:

- **Full backups**: a blue restore bar, a green serve dot at its end; "restore 2 TB at 10 GB/min: 200 min" (after a
  drop "restore 2 TB beside the primary at 10 GB/min: 200 min; copy the table back: 1 min", the copy-back step green).
- **Point-in-time recovery**: blue restore, then amber replay; "restore: 200 min; replay 24 h of log at 10×: 144 min;
  344 min in all" (after a drop "restore beside the primary: 200 min; replay 24 h of log to just before the drop at
  10×: 144 min; copy the table back: 1 min; 345 min in all").
- **Standby**: a green 1 min promotion; "promote it: 1 min". After a drop: no bar but a solid hairline the axis's
  width (an empty set is never a dashed box), "never", "it has applied the drop too: no copy without it".
- **Delayed replica**: amber replay of its hour, green promotion; "replay its 1 h of log at 10×: 6 min; promote it:
  1 min" (after a drop "pause it, replay its 1 h of log to just before the drop at 10×: 6 min; copy the table back:
  1 min").
- A serve dot centres on its bar's end only when the bar is at least the dot's diameter long; otherwise it sits just
  right of the end, so a 1.5 px step stays visible and nothing is drawn left of the origin.

**The inset, "FIRST 90 MIN, ZOOMED"**, under block B's rows: ticks 0, 15 min … 1 h, 75 min, 90 min as width allows
(0, 1 h, 90 min always), four 6 px tracks with the short plan names in a left column, each bar redrawn from 0 to 90
min at the inset's scale (its own steps, colours and green dot when it ends inside), a chevron where it runs on, the
origin line at x0, the playhead while the recovery's clock is inside the first 90 min. In the challenge its 1 h tick
reads "1 h goal" in the accent with accent grid lines: the goal sits inside the inset, never at its edge, so 58 min
and 76 min read apart.

Then "Restore speed" (10, 25, 50 GB/min) and "Log replay" (5×, 10×, 20× the writes; "5×" where the long form does
not fit) on stage. The colours carry one meaning each across both blocks: blue a copy of the data (a backup, a
replica's applied rows, and the restore that copies a backup back), amber the log (archived, received, replayed),
green a promotion and serving again, critical hatch writes lost, the critical line the disaster. Every colour is also
said in the row's words.

**Ghosts** keep the setting before a change, in words: "back in 3.9 h · was 5.7 h" with a solid ink tick across the
bar at the old time, "loses 10 s · was 1 min" in block A; the "· was …" part is set in the muted ink, the new value in
its semantic colour. No tick without its "was" (asserted); none while a question is open.

**Off the stage** (`_widget-controls.scss`): "The disaster" (Disks lost, Table dropped) and "Database" (500 GB, 2 TB,
10 TB), native radio groups drawn as `g-segmented` in `fieldset.group`s, and the polite notice. Under the stage: Play's
story when motion is reduced, the model's note, Describe.

**Layout.** At container wide the stage takes the left column (620 px at 1280) and the controls, the open question and
the cards the right (`_widget-layout.scss`); narrower, one column: the two off-stage controls as the stage's first
rows, the stage, the note, the question, Describe, the cards; the notice is read out only.

**Heights** depend only on the stage's width (the workload, the step and every ledger reserve their longest form's
lines at that width over all 972 settings; rows are fixed; the control rows switch at 520 px). `shoot.cjs` measures
every setting, a play frame of every seventeenth and every experiment phase at 18 widths: one height each. The mockup
measures 944 px at a 620 px stage (1280), about 1,330 at a 252 px stage (320) and 1,290 at 322 (390): the table is in
`shoot.cjs`'s output; `widget-heights.ts` takes the built widget's measured heights.

**Motion** (3.5's grammar; WAAPI on transform and opacity; one clock a play, 7.5 s).

- **The history** (0 to 0.2 of the clock): a cursor sweeps block A from 24 h to the disaster; every mark appears as the
  cursor reaches its moment (full backups, the base, each archived segment, the replicas' bands), so nothing is drawn
  for an event before it happens. Step: "The day before: full backups, the archived log and both replicas copy every
  write."
- **Words keep the clock** (prevention 6). Before its moment a value slot is empty (no text, so no false claim): the
  primary's value, the disaster's name (in A's tick row and at B's origin) and every note that tells the disaster
  ("its disks fail", "the drop too", "the drop waits in its log", "only the table is gone") land at the strike; each
  row's loss lands with its ring; block B's values are empty until the recovery starts, then "recovering", then "back
  in …" or "never" (the standby after a drop has no copy, so "never" lands as the recovery starts); a ledger shows its
  step names with "…" and each step's minutes land as the playhead passes that step's end, "in all" with the green
  dot. `motionSweep` checks this at every 0.05 of the clock, at three widths, for five settings.
- **The strike** (0.24): the disaster line drops through block A, the primary takes its ✕ or drop tick, and after a
  drop the drop lands on the archived log, on the standby (its ✕) and in the delayed replica's received log. Step:
  "The disks fail: everything on the primary is gone." / "A table is dropped, and every copy that applies the change
  loses it too."
- **The recovery points** (0.30 to 0.39, a row at a time): each ring lands and its hatch grows to the line, its value
  appearing with it. Step: "Each plan's recovery point: the newest moment it can bring back."
- **The recovery, the climax** (0.44 to 0.96): a playhead runs down block B from 0 to the last plan's time at a uniform
  speed (the axis is linear, so x and time agree), and through the inset while the clock is inside its 90 min. Each
  bar grows behind it, restore then replay then promotion or copy-back; when the playhead passes a bar's end its green
  dot and "back in 3.3 h" land; until then the row reads "recovering". The step and block B's head count the clock
  ("Recovering: 2.1 h after the disaster.") and the step ends with "Point-in-time recovery serves last, 5.7 h after the
  disaster." ("… gets the table back last, 5.8 h after the drop."). In the one-column layout, at 0.44 block B is
  scrolled into view (`scrollIntoView({ block: 'nearest' })`, as an answer's play does); reduced motion has no play.
- **An answer's play** applies the act (a control changes, the marks move over 240 ms), then plays the clock. One
  rule for a hidden region: its mechanism is drawn (the drop travelling into each replica's log, the bars growing) and
  its outcome marks (✕, ring, hatch, green dot, the "never" hairline) and words are held until the reveal, where they
  land together in the 400 ms settle. Hidden values read "loses ?" and "back in ?" from their moments ("recovering"
  is kept for rows whose outcome shows: a hidden standby is not recovering, so the word would be a claim). The step
  reads "Recovering after the disaster: the times show after your answer." (3). The no-answer sweep's structural check
  enforces the held marks at every play moment, proven by two planted leaks. At the reveal the focus outlines pulse.
- **Stop.** During a free play Play shows a stop square (it ends the play, it does not pause): "Stop the disaster and
  the recovery"; Stop or any change ends the play and draws the rest state at once.
- **Plays pause** by the widget host's visibility (IntersectionObserver on the host, its latest entry, plus
  `visibilitychange`), never the stage's.
- **Reduced motion:** nothing moves. The rest state is the end state, every mark and number on it. Play writes the
  story under the stage (HTML, so the stage's height stays a function of its width; a layout change below the stage
  that the e2e layout-shift expectations include), read out too; the step line reads "Written below the picture.":
  "The disks of this 2 TB database fail just before the next full backup and the next log archive. Full backups lose up
  to 24 h of writes and serve again in 3.3 h, restoring 2 TB at 10 GB/min. Point-in-time recovery loses up to 1 min,
  the log not yet archived; it restores the same base backup, then replays 24 h of log at 10×, and serves in 5.7 h. The
  standby loses its 5 s of lag and is promoted in 1 min. The delayed replica loses the same 5 s and serves in 7 min,
  once it has applied the hour it holds."

## 3. The experiments

Every number is a slot from the model (`enum.cjs` prints them all); answer positions 3, 2, 1, 3, 1. No question is
answered by a choice's shape: every choice of a question carries a number or none does; E2's right choice is the
middle number; E4's is the only one without the word "five", E1's and E5's right choices are respectively the last and
the first. A card sets the widget up with complete settings, as a new start (no ghost); answering plays its act; the
dock holds "your guess" through the play; the reveal is read out politely and its regions get a solid focus outline
with the house "Look here" tag. In the one-column layout, choosing an answer first scrolls the block its play is about
into view (block A for E1, E3 and E5; block B for E2 and E4), then plays. The dock's question is a `fieldset` legend
in every phase (asking, playing, revealed) with the same box, so it never rewraps when an answer is chosen (checked).

**E1 "A replica is not a backup".** Setup the default with a dropped table (the load-time stage shows a dead disk);
act `run: 'recover'`. Ask: "Just before the nightly full backup, someone drops the orders table. The standby applies
every change 5 s after the primary does. What can the standby bring back?" Choices: "The table as it was 5 s before
the drop: it runs 5 s behind" / "Everything but the last 5 s of writes, as after a dead disk" / **"Nothing: it applies
the drop 5 s after the primary does"**. Reveal: "Nothing: a standby copies every change within seconds, the drop
included, so 5 s after the primary loses the table, the standby loses it too. A replica protects against losing a
machine, not against losing the data: a bad migration or ransomware reaches it the same way. Point-in-time recovery,
restored beside the primary, stops just before the drop and loses nothing, but gets the table back only in 5.8 h. The
delayed replica, which applies the log 1 h behind, still holds the table. So keep backups immutable in another
account, retained long enough to reach back before a mistake noticed weeks later." Hides `replicasDrop` (both replicas, since the delayed replica surviving would
answer by contrast): while it asks, each replica's band stops at what it held at the drop and a dashed box runs from
there to the line, no ring, no ✕, no drop tick; values "loses ?" and "table back in ?", notes "What it can bring back shows after your answer.", block B and the inset a
dashed box the axis's width and "Whether and when it gets the table back shows after your answer.". A hidden box in
block A ends at the disaster line's left edge, never across it (asserted). Its play draws the drop travelling into
both logs; the ✕, rings and dots wait for the reveal. Focus: the standby's rows in A and B.

**E2 "Restore, then replay".** Setup 10 TB, 50 GB/min, a full backup every 6 h, 1 min archive, replay 5× (the
load-time stage shows none of these); act `run`. Ask: "A 10 TB database restores at 50 GB/min. A full base backup runs
every 6 h, the log is archived every 1 min, and replay runs 5× as fast as the writes came in. The disks fail just
before the next base backup. How long until point-in-time recovery serves again?" Choices: "3.3 h: the restore, since
the log replays while the backup copies" / **"4.5 h: the restore, then 6 h of log at 5×"** / "8.1 h: the restore, then
the day's 24 h of log at 5×" (the base-versus-day misconception; the ask itself rules out a 1× replay). Reveal:
"Replay can start only once the restore is done, and it must apply every change since the base backup: 200 min to
copy 10 TB at 50 GB/min, then 6 h of log at 5×, 72 min, so 272 min in all, 4.5 h. The size and the restore speed set
the first term. The second is the log since the newest base backup, 6 h here and not the whole day, at the replay
speed. Only the last 1 min of writes, not yet archived, is lost." Hides `pitrTime`: its value, ledger and bar (a
dashed box the axis's width while asking); the full backups' "restore 10 TB at 50 GB/min: 200 min" stands, the premise
of the first term. The step does not count the clock. Focus: PITR's rows in B and A.

**E3 "Archive more often".** Setup the default; act `set: { archive: 10 }`, `run`. Ask: "Point-in-time recovery here
loses up to 1 min of writes and serves again in 5.7 h. Archive the log every 10 s instead. What changes?" Choices:
**"Only the loss, to 10 s: the replay still starts at the base backup"** / "Both: 10 s lost, and smaller pieces of log
replay sooner" / "Neither: the full backups set how much is lost". Reveal: "Only the loss: 10 s instead of 1 min. The
archive interval is how much log a dead disk can take with it. Recovery still restores the base backup and replays all
24 h of log since it, cut into more pieces but no shorter, so it serves again in 5.7 h as before. Archiving more often
costs more stored objects and requests; streaming the log as it is written takes the loss to about a second." Hides
`pitrAfter` while the answer plays (PITR's loss and time at 10 s: "?"; the comb thickening is the play). Focus:
PITR's rows in A and B.

**E4 "Five times the data".** Setup the default; act `set: { size: 10000 }`, `run`. Ask: "The database grows from
2 TB to 10 TB, with the same backups, standbys, restore speed and replay. Whose recovery time grows?" Choices:
"Every plan's: there is five times the data to bring back" / "Only point-in-time recovery's: five times the log to
replay" / **"The two that restore a backup: they copy every byte back"**. Reveal: "The two that restore a backup: full
backups go from 3.3 h to 16.7 h and point-in-time recovery from 5.7 h to 19.1 h, because copying 10 TB at 10 GB/min
takes 16.7 h. The log to replay is the writes since the base backup, which do not grow with the size, and the standbys
already hold every byte: they serve again in 1 min and 7 min as before. A large database restores faster from a volume
snapshot, back in minutes though slow until its blocks load, or fails over to a replica." Hides `rtoAfter` while it
plays (every block B value and ledger; the bars growing are the play). Focus: block B.

**E5 "A replica an hour behind".** Setup the default with a dropped table and replay 5× (13 min, not the 7 min a
learner may have seen at E1's reveal); act `run`. Ask: "Someone drops a table just before the nightly backup and
notices within minutes. A delayed replica receives the log 5 s after the primary writes it but applies it only 1 h
later, and its replay runs 5× as fast as the writes came in. How soon can it give the table back, at the earliest, and
how much is lost?" Choices: **"13 min, nothing lost: pause it before it applies the drop, roll it forward to just
before, copy the table back"** / "73 min, nothing lost: its 1 h delay cannot be skipped, so it must wait out the hour
before replaying" (a real misconception, not a slower valid procedure) / "Nothing: like the standby, it applies the
drop and loses the table". Reveal: "The table is back in 13 min with nothing lost: the drop sits in its log, received
but not applied, for 1 h. The delay only holds back applying, so pause it before it applies the drop and replay what it
has received, up to just before the drop, as fast as it can: at most 1 h of log at 5×, 12 min. Then copy the table
back in 1 min, while the primary keeps serving. Point-in-time recovery gets the same table back in 8.2 h. The catch is
the hour: a drop noticed later has reached this replica too, which is why it adds to backups and never replaces
them." Hides `delayedOutcome` (the delayed replica's rows, as E1 hides them; the standby's
"cannot bring it back" stands: it is the trap the third choice names). Focus: the delayed replica's rows.

**E6 Challenge "One minute, one hour".** Setup the default (point-in-time recovery 1 min and 5.7 h). Ask: "Meet an RPO
of 1 min and an RTO of 1 h for this 2 TB database with point-in-time recovery: tune the restore speed, the full backups
and the replay. Each full backup reads all 2 TB from the primary, so run one no more often than every 6 h." Goal
`all`: `pitrRpo` at most 60, `pitrRto` below 60, `base` at least 6; keep `size: 2000, disaster: DISK` (after a drop the
archive sets no loss, so the RPO bound would mean nothing). Of the 27 restore, base and replay triples exactly one
passes: 50 GB/min, every 6 h, 20× (40 + 18 = 58 min), at a 10 s or 1 min archive (5 min misses the RPO); hourly
backups are fast enough but break the bound; `enum.cjs` asserts the triple is unique and prints the table. 4 of the
972 settings pass. While the challenge is open the inset's 1 h tick reads "1 h goal" in the accent with accent grid
lines (block B's linear axis has no room for it next to the origin), and the 1 min tick in A reads "1 min goal" where
the tick row has room (grid lines keep a gap round a ring). The status is the house checklist ("Goal met:" only while
it holds), each line the goal first and the current value in parentheses: "point-in-time recovery loses at most 1 min
(now up to 1 min): met" / "point-in-time recovery serves again in under 1 h (now 5.7 h): not yet" / "no more than one
full backup every 6 h (now every 24 h): met"; off the keep, "The goal keeps 2 TB and the disks lost.". Reveal: "Restore
at 50 GB/min, a full backup every 6 h and replay at 20×: 40 min to restore 2 TB, then at most 6 h of log in 18 min, 58
min in all; with the log archived every 1 min or more often, it loses at most that. At 10× the replay alone takes 36 min and misses the hour; hourly full backups would make
it, but read 2 TB from the primary 24 times a day. At 10 TB nothing here meets the hour: copying it at 50 GB/min takes
3.3 h alone. So large databases restore from volume snapshots, or fail over to a standby for the dead disk and a
delayed replica for the bad delete, and keep point-in-time recovery for the rest. And a recovery time is real only
once a drill has measured it." Describe waits until the goal is met.

**One `hiding()` map** (prevention 1), each region named in the spec's own `hide` list:

| Region | When | On the stage | Elsewhere |
| ------ | ---- | ------------ | --------- |
| `replicasDrop` | asking and playing (E1) | both replicas' values "?" and outcome notes; while asking also their rings, hatches, ✕, drop tick and bars (dashed boxes, block B's and the inset's the axis's width); while playing their outcome marks (`outcomesHeld`) | the summary, the step, the story, Describe |
| `pitrTime` | asking and playing (E2) | PITR's time and ledger; while asking its bar (a dashed box the axis's width); the step's clock | as above |
| `pitrAfter` | playing (E3) | PITR's loss and time and their words at the act's setting | as above |
| `rtoAfter` | playing (E4) | every time and ledger in block B, the step's clock | as above |
| `delayedOutcome` | asking and playing (E5) | the delayed replica's as `replicasDrop` | as above |
| `outcomesHeld` | playing | every hidden region's ✕, ring, hatch, green dot and "never" hairline wait for the reveal | none |
| ghost | any question open | no tick, no "was" | none |
| locked | any question open | Play and every control disabled | the notice "Play and every setting wait for your answer." (never blank), the model note "A schematic model. Its assumptions show after your answer." (two of its assumptions answer E1 and E5), Describe "Describe waits for your answer." |

## 4. Accessibility

- The stage is `role="group"`, `aria-roledescription="visualization"`, named "Backups and recovery: one disaster, what
  four recovery plans lose and how long each takes to serve again"; its SVG has the summary, which obeys `hiding()`:
  "A timeline of one disaster and four recovery plans for a 2 TB database whose disks fail at the worst moment. Before
  the disaster, on a log scale: full backups every 24 h lose up to 24 h; point-in-time recovery, the base backup plus
  the log archived every 1 min, loses up to 1 min; the asynchronous standby loses up to 5 s; the delayed replica, 1 h
  behind, loses up to 5 s. After it, serving again: full backups in 3.3 h; point-in-time recovery in 5.7 h; the standby
  in 1 min; the delayed replica in 7 min. A schematic, worst-case model."
- Play is a button named for what it plays ("Play the disaster and the recovery", "Stop …", "…, after your answer"
  disabled while a question waits). The five on-stage and two off-stage controls are native radio groups in
  fieldsets with those legends (one Tab stop each, arrows). The dock is `app-widget-check`: checklist lines carry
  ": met" and ": not yet" in words. No mark is tappable, so no touch hints exist (prevention 11).
- Notices (polite, `aria-atomic`): after a change, the setting's sentence ("With 2 TB and the disks lost, full backups
  lose up to 24 h and serve again in 3.3 h; point-in-time recovery loses up to 1 min and serves again in 5.7 h; the
  standby loses up to 5 s and serves again in 1 min; the delayed replica loses up to 5 s and serves again in 7 min.");
  during a play the step as it changes; after a play under reduced motion the story; after a reveal and when the
  challenge opens the setting's sentence; while a question is open that the settings wait. Never blank.
- Colour is never alone: every row says its loss and its time in words, the hatch says "loses", the ✕ says "cannot
  bring it back", the bars' steps are named in the ledger. Tokens are the app's `--g-viz-*`; small text uses ink
  tokens at 4.5:1; the band strokes, comb, hatch line and ring join `theme-contrast.spec`'s 3:1 graphics list.
- 44 px targets: Play and every segment (74 px wide at the narrowest, 44 tall); the checker fails a target under 44 px,
  one hit box on another, a control on a label, at every setting and width.
- **Describe** (a `g-data-table` in a `minmax(0, 1fr)` grid, scrolling inside its own box): the summary, then a row
  for each plan against each disaster (8 rows), the current disaster's rows marked (`aria-current`), and a note naming
  the settings ("Rows are this setting's: 2 TB restored at 10 GB/min, a full backup every 24 h, the log archived every  1 min and replayed at 10×, the standby 5 s behind. Worst case, from a schematic model."). Columns: Plan, Disaster,
  Loses (RPO), Back in (RTO); the standby after a drop loses "the table" and is back "never". Tabular digits only on the
  two figure columns (`td.num`), never on prose, labels or the checklist (Inter's tabular hyphen spreads
  "point-in-time"; checked). Under a 560 px stage `compact`: Plan ("Point-in-time, drop"), Loses, Back in. It fits at
  320, 412, 1280 and 1440 px with no kept run on two lines (checked).

## 5. The prevention list

1. **Giveaways on every surface.** One `hiding()` map (3) feeds the stage marks and words, the value lines, the
   ledgers, the step, the summary, the notice, the story, the note and Describe; Play and every control wait; the
   answer's play keeps the words hidden until the reveal; a card's setup starts afresh. `noAnswer()` renders every
   question asking (entered afresh and from six other settings: every act's target, the challenge's solution, a sync
   standby after a drop, a small database with hourly backups) and its play at seven moments, at 14 widths, against its
   answer's words in both phases, the false claims and structure (Play and controls disabled, no ghost, each hidden
   value "?", no digit in a hidden ledger, no hidden outcome drawn while asking, each hidden box the axis's width, no
   clock in the step). It is proven by eighteen planted leaks, one a flag of the map (each must be caught where the
   clean view is clean). `restLeaks()` checks the load-time stage against every asked answer.
2. **False claims.** No hidden value has a default ("?" and "after your answer", never 0 or "never"); "cannot" and
   "never" are words, never Infinity; the false-claim rules (NaN, Infinity, a bare 0 with a unit, "back in never",
   "??", an em dash, a non-breaking space) run over every stage render and every sentence of all 972 settings. The
   layout assertions hold by rule at every setting and width: a ring at its loss, a hatch from it to the line exactly
   when it loses something, "loses nothing" never over a hatch, "never" never over a bar, a bar ending at its time, the
   PITR ledger adding up, every full backup of the day drawn.
3. **Stable ids.** Rows are tracked by plan id, full backup boxes by their age, archive ticks are one path, segments
   by their step kind; nothing is tracked by `$index`.
4. **Labels and lines.** Grid lines run only across tracks, never through a label line; the disaster line runs at the
   right edge, values end 10 px before it; every text has a stage-coloured halo; the ring is a stroke round its own
   point; tick labels keep 6 px (asserted per axis); the checker flags text on text, labels under 6 px apart, any line
   through text, any mark under text, dots on dots, off-stage marks, and controls on labels.
5. **Look-here tags.** A tag sits on its outline's foot (or top) from its left end toward the middle, never in the
   column where the values right-align, and keeps 6 px from every text in both directions (checked); rows keep a
   28 px gap and an outline runs 14 px under its texts, so a row's outline has room for its tag at the foot; `sweepExperiments` asserts a tag for every outline of every reveal at 14
   widths, and `touchingOutlines()` proves the 6 px rule on two neighbouring rows.
6. **Marks and words before their event.** One clock, every mark and every word at its moment (the history cursor, the
   strike, a row's point, the playhead, a ledger step's end); a value slot is empty before its moment; "recovering"
   until the bar ends; `motionSweep` checks every 0.05 of the clock.
7. **Visibility and reduced motion.** The host's visibility pauses the play; reduced motion's rest state is the end
   state with every number, and Play writes the story.
8. **CSS specificity.** Every `fieldset.group` carries zero padding; on-stage groups are placed by the layout in
   absolute boxes; the 320 px shots show every segment inside the stage and the checker measures each control's words.
9. **Words.** Full sentences (asserted: each ends as one, none opens on a numeral, thousands separated, no doubled
   word or space); plurals are not needed (every count is a span with its unit); no sentence is spliced from chips;
   the challenge's status is the checklist; the notice says the setting's sentence after a reveal and when the
   challenge opens.
10. **Describe's width.** `minmax(0, 1fr)`, its own scrolling box, compact under 560 px; checked at 320, 412, 1280 and
    1440 px.
11. **Touch hints.** No tappable marks, so none to clear.
12. **Placeholder heights.** The stage height is a function of width alone (2); `widget-heights.ts` takes the built
    widget's measured whole heights at 320, 360, 375, 390, 412 and 430 px and every 50 px from 300 to 1,300.
13. **Text measurement.** The mockup measures with canvas from the shipped fonts; the build through `stage-text.ts`
    (the label role uppercases all but units: "GB/min", "min", "h", "s" keep their case); no tabular digits on stage.
14. **Learner text in HTML** goes through `g-code-text` ("10 GB/min", "5.7 h", "at 10×", "up to 24 h", "RPO"); every
    live region holding it is `aria-atomic`.
15. **Element counts.** Full backup boxes at most 24, archive ticks one path capped by the width (2.5 px apart), four
    rows a block: the most SVG elements in any render is printed by `shoot.cjs` (under 420 asserted). Every setting is
    as heavy as the default; keydown to the second frame is one layout of some 250 marks.
16. **Specs read after drawing**: web-first assertions on the summary before any number; the e2e
    (`recovery-lesson.spec.ts`) runs on desktop, the Android phone and the WebKit iPhone.
17. **Marks mean one thing.** Dashed only for hidden (asserted; the focus outline is solid here, unlike the house's
    dashed one, so a dash never means two things); an empty set is a solid hairline; the hatch is loss only; the ring
    is a recovery point only, stroke only, never covering the box it points at; Play's square means Stop.
18. **On the scale.** Both axes are fixed and hold every setting and every compared value (checked); nothing is cut;
    a ghost's old value is said beside it.
19. **Units and conversions.** Every figure keeps its unit in every form; conversions are drawn: size to restore time
    (the ledger beside the bar), log hours to replay minutes (the ledger and the amber step), minutes to hours (the
    ledger's minutes beside the value's hours), seconds to the scale (the log axis's ticks), the two scales of block B
    (its seam and subtitle).
20. **Layout.** Reserved lines collect at each block's foot (block B's ledger slack in one band above its controls, so
    its rows keep equal gaps, asserted); a checked segment keeps its weight; in the one-column layout an answer scrolls
    its block into view before its play, and a free play scrolls block B in as the recovery starts.
21. **Wraps** use `stage-text.ts`'s measurement with the keep rules and the no-orphan rule; the reserved lines are
    computed from the same wrap over every setting, never from the browser's wrap.
22. **One state, every surface.** One `scenario` feeds the stage, the dock's checklist, the notice and Describe; no
    surface prints NaN, Infinity or an empty cell mid-play ("recovering" and "…" stand for a time not yet reached).
23. **WebKit and CI.** Every new test uses deterministic waits; the e2e runs on the iPhone project; the builder
    dispatches `ci.yml` on the wip branch before reporting done.

## 6. What a learner can say in an interview afterwards

- "I size recovery with two numbers per system: RPO, how much recent data we may lose, and RTO, how long until we serve
  again. I design for the worst moment, not the average."
- "Restore time is size over throughput: 2 TB at 10 GB a minute is over three hours before anything else happens."
- "Point-in-time recovery is a base backup plus the log archived every few seconds. A dead disk loses the segment not
  yet shipped; a bad delete loses nothing, because I replay to just before it. But the replay comes after the restore
  and covers everything since the base: taking base backups more often, or faster replay, is what shortens it, not
  archiving more often."
- "A standby gives me a minute of RTO and seconds of RPO for a dead machine, zero with synchronous replication, and
  nothing for a dropped table: it applies the drop five seconds later. Replicas are not backups."
- "When someone drops a table the primary is still serving, so I never restore it in place: I restore point-in-time
  recovery beside it, or pause a delayed replica, roll it to just before the drop, and copy the table back."
- "For 10 TB with RPO one minute and RTO one hour: a standby in another zone for the dead disk, a replica delayed by
  an hour for the bad delete (pause it, roll forward to just before, copy the table back: minutes), and point-in-time recovery to
  object storage in another account with object lock as the backstop, restored from snapshots, because copying 10 TB
  takes hours. And I schedule restore drills, because an untested backup is a hope."

## 7. Lesson text fixes (`libs/engine/src/sysdesign/lessons/recovery.ts`)

- `widget.tryThis` goes (the experiments replace it); `widget.experiments` takes `RECOVERY_EXPERIMENTS`.
- "Restore drills and delayed replicas": "A delayed replica applies changes an hour behind" gains "(counted from the
  primary's commit time)", so the concept and the model's hour agree.
- "Point-in-time recovery": after "RPO is the log not yet archived", add "and RTO is the restore and then the replay of
  everything since the base backup, one after the other", the sentence E2 tests.
- Nothing else changes; checked against the model: worked example 1's 200, 144, 344 and 36 minutes, example 2's 200
  and 79 (13 h of log, not worst case: the lesson says so by its 14:05 timing), the why text quotes no answer.
  Worked example 2's "restore to the side, not in place" is now what the widget draws after a drop.

## Notes for the builder

- The mockup's geometry is the spec: the header's reserved lines, `labelRow`, `fitTicks`, `nameFor`, the row (name
  line, 12 px track, note line, 28 px gap), the comb's 2.5 px rule and solid crowd band, the stroke-only ring and its
  hatch, the 1.5 px step floor, the inset, the ledger slack band, the control rows' 520 px switch, the scales in
  `model.js` (`afterX` linear, `insetX`). Suggested files: `recovery-layout.ts` (a pure `buildStage(width, model,
  view)` returning marks), `recovery-words.ts` (`hiding()`, names, values, notes, ledgers, the summary, the notice, the
  steps, the story, Describe, the goal checks), `recovery-motion.ts` (the clock's moments, the cursor and the
  playhead), a prims component, the widget component and its spec (the no-answer sweep with its eighteen leaks and the
  rest sweep), `recovery-layout.spec.ts`, `recovery-words.spec.ts`, `recovery-motion.spec.ts`, and e2e
  `recovery-lesson.spec.ts`.
- The model is closed-form: 972 settings in a few milliseconds; the reserved-line maxima are computed once per width.
- `content.md` (every string of the built widget, both checklist states included) is generated by a browser walk of
  the built widget and goes to content review with the experiments.
