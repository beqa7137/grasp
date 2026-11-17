# Storage Engines widget (`storage-engine`): design brief

Redesign R41, the batch's seventh widget (REDESIGN.md 5.2: the R41 to R45 entry, "Storage Engines: `storage-engine`, as
B-tree and LSM levels", and the Data Modeling, Consistency & Quorums and Latency & Queueing notes; LOOP.md rows 122 to
124 are the house references). Lesson: `/design/topics/sd-storage`. Files beside this brief, on the orphan branch
`design/r41-storage`:

| File          | What it is                                                                                                                                                                                                                                                                                                                                                                  |
| ------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `model.js`    | The rough cost model (the old `storageCost`'s formulas, plus what the picture needs: the B-tree's pages level by level, the LSM tree's level sizes, where each written byte goes, space, bloom filter memory) and the six experiments as slot templates; ported to `libs/engine/src/sysdesign/lessons/widgets/storage.ts` and `storage-experiments.ts`                          |
| `enum.cjs`    | Prints every number, checks the model against the old `storageCost`, the lesson's quoted numbers, a real B+tree built by random inserts, a simulated LSM tree that counts the bytes it writes, a small LSM tree of real keys with real bloom filters, the experiments' word claims, and enumerates the challenge (5,108 checks)                                                |
| `mockup.html` | The mockup with the app's tokens and fonts: `?state=default\|read\|bigpage\|bigrecord\|nobloom\|tall\|small\|playing\|describe\|reduced\|ask&exp=1..5\|reveal&exp=1..5\|challenge&theme=light\|dark`; `playing` takes `&engine=btree\|lsm&frac=&op=&bloom=`, `ask` takes `&phase=playing` (the answer's play, hiding held, `&frac=` its moment), `challenge` takes `&start=1` |
| `shoot.cjs`   | Screenshots every state at 1280, 390 and 320 px in both themes with the page's collision report and layout assertions, then sweeps every setting at 14 widths (at rest, through both plays, after a change with its ghost), every experiment asking, playing and revealed, the no-answer sweep with eleven planted leaks, every page sentence, the stage heights and Describe's widths |
| `changes.md`  | Each critique item and what changed for it                                                                                                                                                                                                                                                                                                                                  |

## 1. The verdict, and the mechanism

**Today's widget against the bar.** Four sliders, three page-size buttons, a checkbox, and eight tiles (height, write
amplification, disk writes and reads per lookup, twice). Every number on it is right, and none of them is a picture: a
learner can read "B-tree 42×, LSM 24×" and still not be able to say where the 42 comes from, what a level is, why a
bigger record rescues one engine and not the other, or what a bloom filter spares. That is the whole interview question
("write-heavy ingest or read-heavy lookups: which engine, and what do you pay for it?"), and the widget answers it with
the answer only. REDESIGN.md asks for "B-tree and LSM levels"; it gets them, drawn, with one write and one lookup
travelling through each.

**What the learner must see.** The two families on the same workload, side by side.

- A B-tree is a few levels of pages; each page points to a few hundred children, so the height is tiny and all but the
  leaves fit in memory. A lookup walks one page a level and reads one page from disk. An update walks the same path,
  changes one record in its leaf, appends a log record, and writes the whole page back in place: for a small record
  that is the page size over the record size, at a random place on the disk.
- An LSM tree appends a write to its log and keeps it in the memtable (one sequential write), flushes the memtable as
  a sorted run (a second), and then compaction merges the record down level by level. A level takes `ratio` merges
  from above to fill and each merge rewrites what the level already holds, so a record is written about
  (ratio + 1) / 2 times at each level: the cost follows the number of levels, not the record. A lookup checks the
  memtable and then every run from the newest down; a bloom filter per run, in memory, lets it skip the runs that
  cannot hold the key.
- So each engine's cost hangs on a different thing (the record against the page; the levels), and each amplification
  has a visible cause: bytes written (the whole page; the rewrites at every level), runs read (one path; every run
  unless a filter says no), disk used (pages part empty; old versions not yet merged away).

**What the widget draws, what experiments test, and what stays text** (as a senior interviewer would weigh them):

| Idea                                                         | Weight | Where                                                                                                                              |
| ------------------------------------------------------------ | ------ | ---------------------------------------------------------------------------------------------------------------------------------- |
| B-tree height from fanout; one page a level                  | core   | The tree: a row a level with the model's page counts, the walk through it                                                           |
| Upper levels cached, one disk read                           | core   | The memory band ("cached in memory · 4 levels, 822 MB") over the leaves ("on disk"); the walk row; E4's reveal                      |
| An update rewrites a whole page plus a log record            | core   | The leaf page to scale: the changed record against the page written back, the log record on the same scale; E1                      |
| Write amplification = page / record + 1                      | core   | The ledger under the page ("4,096 B + 100 B = 4,196 B written", "42× the data"); E1, E3                                             |
| LSM: log, memtable, flush, levels                            | core   | The stack: memtable and log, the flushed run L0, the levels with the model's sizes, the record's trail through them                 |
| About (ratio + 1) / 2 writes a level; cost grows with levels | core   | "≈5.5×" at every level, the staircase "one level filling", the ledger "1 log + 1 flush + 4 levels × 5.5"; E2, E5, the challenge      |
| A lookup searches every run; bloom filters skip              | core   | The lookup's trail: "skipped" marks or a read at every run; the filters' memory on their toggle; E4                                 |
| Sequential against random writes                             | high   | "whole pages, at random places" and "appends and merges, all sequential" on the write rows; the log's append; E1's and E2's reveals |
| Space amplification                                          | high   | The "disk used" row: the leaf page's free room (drawn in the page) and "at most: old versions not yet merged away"                  |
| The size ratio's trade (writes, runs to read, space)         | high   | The Size ratio control redraws the levels, the staircase and all three rows; the challenge                                          |
| Compaction debt and write stalls                             | medium | The MB/s of disk writes beside every write figure, at a stated 10 MB/s of new data; E2's reveal; the lesson's third example         |
| Range scans (filters do not help)                            | medium | E4's reveal; the lesson's bloom filter concept                                                                                      |
| Leveled against size-tiered compaction                       | medium | Lesson text only: a second policy would double the LSM picture (more runs a level, another staircase) for one sentence of gain      |
| Where each family is used                                    | low    | Beside each engine's name ("Postgres, InnoDB, SQLite"; "RocksDB, Cassandra"); the lesson's last concept                             |
| Tombstones, WAL group commit                                 | low    | Lesson text only                                                                                                                   |

**Settings.** Data 10, 100 or 1,000 GB; record 100, 200 or 1,000 bytes; the B-tree's page 4, 8 or 16 KB; the LSM
tree's size ratio 4, 5, 10 or 20 and bloom filters on or off; and what the stage follows, a write or a lookup. 432
settings (216 pairs of engines, each with two operations followed). New data arrives at a fixed 10 MB/s, so disk write
rates compare across settings; the memtable is RocksDB's default 64 MB. Settings are numbers, as `ExperimentSettings`
requires: `data`, `record`, `page`, `ratio`, `bloom` (1 or 0), `op` (0 a write, 1 a lookup).

**Formulas** (all in `model.js`, ported 1:1). The write and read formulas are the old `storageCost`'s; `enum.cjs`
holds them equal at every setting.

- B-tree. Pages are 70% full (`PAGE_FILL`, the lesson's "around 70%"). Leaves = ⌈data / (0.7 × page)⌉; an interior
  page holds ⌊0.7 × page / 16⌋ children (179, 358, 716); the pages at each level are the leaves divided by the fanout,
  rounded up, until one remains, and the height is the number of levels (4 or 5 here). In memory: every interior page
  (822 MB at the default). A lookup walks `height` pages and reads 1 from disk. An update writes page + record bytes:
  write amplification page / record + 1. Disk used: all pages over the data, 1.43 to 1.44×.
- LSM tree. Levels L = the smallest L with ratio^L ≥ data / 64 MB (2 to 7 here). Level sizes from the bottom up, as
  RocksDB sizes them by default: the last holds the data, each level above is `ratio` times smaller (100 GB, 10 GB,
  1 GB, 102 MB at the default); every level drawn is larger than the memtable (checked). Writes at each level
  (ratio + 1) / 2; write amplification 2 + L (ratio + 1) / 2 (the log, the flush, the levels). A lookup of a key that
  rests in the last level reads 1 run with filters and L + 1 without (the flushed run and each level). Disk used at
  most 1 + Σ ratio^−j over the levels above the last (1.11× at ratio 10, 1.25× at 5), the last level's share its
  inverse (90%, 80%). Bloom filter memory: keys × 10 bits (1.3 GB at the default).
- Disk writes = 10 MB/s × write amplification. The record size above which the B-tree writes less: page / (LSM write
  amplification − 1), 178 bytes at the default.

One model change, said plainly: the old `storageCost` packed pages full; the model now applies the lesson's own 70% to
leaves and interior pages alike, so the page counts, the memory figure and the space figure agree with each other. Two
heights move, neither quoted anywhere: 10 GB in 16 KB pages (3 to 4) and 1,000 GB in 8 KB pages (4 to 5). Every height
the lesson quotes stays (5 at 100 GB and 4 KB, 4 at 16 KB, 4 and 5 at 10 and 1,000 GB).

**Checks** (`node enum.cjs`, 5,108 pass).

1. The old `storageCost`, re-implemented: write amplification, disk write rate, lookup reads and LSM levels are equal
   at all 432 settings; the four quoted heights are unchanged.
2. Every number the lesson quotes: 41.96 and 419.6 MB/s, 24 and 240, about 5 at 1,000-byte records, 21.5 at 200, 165
   and 1,650 at 16 KB, 18.5 and 29.5 at 10 and 1,000 GB, 17, 17 and 33.5 at ratios 5, 4 and 20, 5 reads without
   filters, 11% and 25% of space, 1.25 GB of filter for a billion keys.
3. A real B+tree built by random inserts with page splits (four shapes, 60,000 to 400,000 records): leaves come out
   69.4 to 72.8% full, so 0.7 is measured, not assumed; the leaf count is within 4% of the model's and the height
   equal; every lookup touches exactly one page a level. The "written back alone" assumption is measured too: a buffer
   pool that gathers a batch of updates before writing writes 0.99 pages an update when the batch touches 1% of the
   leaves and 0.92 at 16%; at the default, 60 s of updates touch 16.8% of the leaves, so a 60 s checkpoint would pay
   38.7× against the model's 42×. The model is the limit of data much larger than a checkpoint's updates, and E1's
   reveal and the note under the stage say so.
4. A simulated LSM tree that counts the bytes it writes. On full trees (every level fills and merges whole into the
   next; 87 shapes of memtable, ratio and depth) the bytes are exactly 2 + L (T + 1) / 2 times the data, (T + 1) / 2 at
   every level: the model's rule is exact for its own mechanism. At the widget's own twelve sizes, in steady state
   (levels sized from the bottom up, random overwrites, the last level always full, so it costs the whole ratio while
   the small top level costs less), the simulated bytes are within 8% of the model at eleven sizes and 15% over it at
   the twelfth (10 GB at ratio 20, a two-level tree): 23.5 against 24 at the default, 17.27 against 17 at the
   challenge's solution, 29.0 against 29.5 at E5's. The simulated space never passes the model's "at most".
5. A small LSM tree of real keys with real bloom filters (three shapes): without filters a key in the last level reads
   2.9 to 4.4 runs against the model's 3 to 5 (the model counts every level as holding a run, the worst case, and says
   "a key last written long ago"); with filters 1.02 to 1.04 against the model's 1; the filters' false positive rate
   measures 1.1 to 1.3% at 10 bits a key ("about 1 in 100"); mean space sits under the model's "at most".
6. Every experiment's text has no digit outside a slot (but "(ratio + 1) / 2"), each right choice holds its truth, the
   answer positions are 3, 2, 2, 1, 1, the reveals' word claims hold ("about a quarter", "about a fortieth", "ten
   times", "one more level", "still", "the same", "about 90%"), and the challenge passes at exactly one LSM
   configuration (3).

**Honesty rule.** Every number on the stage is the model's, and the stage says the model is rough where the numbers
are read: the cost block's title ("What each engine pays · from the rough model under the stage"), the "≈" on every
per-level figure, "about" and "at most" on space, and the note under the stage, which states the assumptions: every
update writes its page back alone, pages about 70% full, every level above the leaves in memory, a 64 MB memtable, one
log write, one flush and about (ratio + 1) / 2 rewrites at each level as it fills, filters at 10 bits a key with their
false positives left out, 10 MB/s of new data. Drawn pages and bars are schematic and say so by construction: a tree
row draws at most seven pages and three dots when there are more, with the model's count in words beside it (never more
pages than exist: a root with two children draws two); level bars step in width and carry the model's size in words;
the leaf page and its log record are to scale (the changed record's width is record / page of the strip, with a 3 px
floor that only 100 and 200-byte records in 8 and 16 KB pages reach on a phone). A play draws one write's or one
lookup's events and never counts for the model: a level shows the record arriving once, and the figure beside it is the
model's "≈5.5×"; the staircase is the model's own arithmetic (ratio rows, row k of k parts), exact.

**Engine work.** New `widgets/storage.ts`: `storageScenario(settings)` (the `btree`, `lsm`, `crossoverRecordB` and
`metrics` of `model.js`), `STORAGE_SETTINGS` (all 432), the constants (`STORAGE_MEMTABLE_MB`, `STORAGE_PAGE_FILL`,
`STORAGE_WRITE_MBPS`, `STORAGE_BLOOM_BITS`, the stops, the two fixed axes); `storageCost` and `StorageCost` are retired
from `widgets.ts` (their only caller is the old widget, their spec moves). `storage-experiments.ts` holds the six
specs. Framework: `ExperimentRun` gains `'btree'` and `'lsm'` (play the followed operation through that engine);
`TEMPLATE_DIGITS_ALLOWED` gains "(ratio + 1) / 2"; slot units gain `amp` (one decimal under 100, whole above: the
house `times` would print 29.5× as 30×), `bytes`, `size`, `gb`, `kb`, `rate`, `reads` and `levels` (plural by count);
the hide regions are `btreeWrite`, `lsmWrite`, `writesAfter`, `readsWhy` and `readsAfter` (3). `storage.spec.ts` pins
the formulas, the lesson's numbers, the B+tree and both LSM simulations at smaller sizes, and
`storage-experiments.spec.ts` every quoted number, the answers, the word claims and the challenge's enumeration.

## 2. The picture

One `g-stage`: a title and the workload, the two engines (side by side from a 500 px stage, stacked below it), and
under a rule what each pays. An engine's panel is the same at every width from 224 px, top to bottom: its name and
Play, its own settings, its structure with the operation's path through it, and the transform from that path to its
cost.

**Header.** "One write, through both engines" ("One lookup, through both engines"), in the title role, over the
workload in body text: "100 GB of records, 100 bytes each, rewritten at random at 10 MB/s. Follow one write." ("…
Follow one lookup, for a key last written long ago."). The lines the longest workload needs at this width are reserved
(three up to a 332 px stage, two to 583, one above), so no setting moves the stage.

**An engine's head.** A Play disc (36 px in a 44 px box), the name in the title role with where it runs beside it
where that fits ("B-tree · Postgres, InnoDB, SQLite"; "LSM tree · RocksDB, Cassandra"), and under the name what the
engine does ("pages rewritten in place"; "appended, then merged down"). While its play runs, that line is the play's
step, in ink (below, Motion).

**The engines' own settings sit on the stage, beside what they change**, as native radio groups drawn as
`g-segmented` and one native checkbox drawn as a toggle, placed by the layout: Page size (4 KB, 8 KB, 16 KB) in the
B-tree's panel; Size ratio (4, 5, 10, 20) and Bloom filters in the LSM tree's. The toggle's second line is the
filters' price or absence: "1.3 GB of memory", "off: every run is read". On a phone the LSM panel is two screens below
the top of the widget; a ratio control up there would change a picture the learner cannot see.

**The B-tree.** "CACHED IN MEMORY · 4 LEVELS, 822 MB" ("IN MEMORY · …" narrower) over a band (the raised fill) that
holds a row for each level above the leaves; under the band the leaf row on the stage's own ground, and under it "READ
FROM DISK · 37.4 MILLION LEAF PAGES" ("ON DISK · …", "… LEAVES"). The caption sits under the leaves, not over them,
because the fan lines into the leaf row would cross it. A row draws its pages as 16 × 12 px boxes, centered: 1, then at
most 3, 5, 7, 7 (5 on a phone), never more than the level holds, with three small dots after the last when the level
holds more, and the model's count at the row's right end ("1 page", "7 pages", "1,169 pages", "209,214 pages"). Thin
lines fan from the walked page to every page drawn on the next row; the walk is the same path in the current tone. The
upper rows spread over the band's fixed height, so three, four or five levels fill the same block. A walked page above
the leaves is outlined in the current tone (visited, in memory); the leaf is filled: the current tone when a lookup
reads it ("1 disk read" at the row's end), amber when a write writes it back ("written back").

**The leaf page, to scale** (the B-tree's transform). "THE LEAF PAGE · 4,096 B, ABOUT 29 RECORDS" over a strip the
panel's width: record ticks across the 70% that is full (where a record is 5 px or more), a rule and "free" over the
rest. Following a write: the changed record is an ink slice of its true share of the page, "100 B changed" under it;
the whole strip takes the amber of a byte written, "4,096 B written back whole" under its right end; the next row is
the log on the same scale, a track with the new record at its end, as wide as the slice above ("LOG ▭▮ +100 B
appended"), so the sliver that changed and the page that was written are one comparison. Then the ledger, in mono:
"4,096 B + 100 B = 4,196 B written", and the total in the 17 px mono head: "42× the data". Following a lookup: the
strip is the blue of a page read, the record found is green ("the record, 100 B", "4,096 B read from disk"), the next
row is the walk as five small pages, four hollow and one filled ("WALK ▢▢▢▢▮ 4 in memory, 1 from disk"), and the
ledger "5 pages walked − 4 in memory = 1 read", "1 disk read".

**The LSM tree.** "IN MEMORY" over the memtable (a raised box: "memtable · 64 MB, sorted") and, following a write,
"ON DISK · THE LOG" over the log (a track of earlier records with the new one, amber, at its end) and "written" over a
right-hand column of counts. Under them "ON DISK · SORTED RUNS, EACH LEVEL 10× THE ONE ABOVE" (shorter forms down to
"ON DISK"), set to the right of the trail so the trail never crosses it, and a row for each sorted run, newest on top:
L0, the flushed run, then L1 to the last level. A row is its name in mono, a bar (bars step wider down the stack; they
are not to scale, and each says its size from the model: "64 MB, flushed", "102 MB", "1 GB", "10 GB", "100 GB"), and at
the right end the operation's count there. The rows spread over a fixed height, so 3 to 8 rows fill the same block. The
trail runs from the memtable down through the runs:

- a write: a hollow amber ring in the memtable (memory), the amber record at the log's end "1×", an amber dot in every
  run it is written into, "1×" at L0 and "≈5.5×" at each level;
- a lookup: a hollow blue ring in the memtable, "not here"; with filters, a muted ring with a slash in every run a
  filter rules out, "skipped", and a blue dot in the last, "1 read", in a green ring (found); without filters a blue
  dot and "1 read" in every run. A lookup never reads the log, so the log is not drawn and the memtable takes the row.

**Why a level costs what it costs** (the LSM tree's transform, following a write). "ONE LEVEL FILLING · 10 MERGES
FROM ABOVE" over a staircase: `ratio` rows, row k is k parts wide, its last part (the new one) in full amber and the
parts rewritten in a lighter amber; beside it "Merge k of 10 rewrites the k parts then there: 55 parts written for 10
of data, about 5.5× each." Then the ledger "1 log + 1 flush + 4 levels × 5.5" and "24× the data". Following a lookup:
"BLOOM FILTERS · 10 BITS A KEY, 1.3 GB OF MEMORY" over "Each run's filter answers from memory: 4 say "not here", so
only the last run is read. About 1 lookup in 100 reads a run for nothing; the model leaves that out.", the ledger "5
runs − 4 skipped = 1 read" and "1 disk read"; with filters off "NO BLOOM FILTERS", "Any run may hold the key's newest
version, so each is read in turn, newest first, until the last level turns it up.", "5 runs, none skipped = 5 read",
"5 disk reads".

**What each engine pays** (under the stage's one full rule; the title "What each engine pays · from the rough model
under the stage", shorter on phones, always leaving a "Look here" tag's width free at its right end).

- "WRITTEN TO DISK, × THE NEW DATA · AT 10 MB/s OF NEW DATA" ("DISK WRITES FOR 10 MB/s OF NEW DATA", "FOR 10 MB/s
  OF NEW DATA"): a row an engine, its name with how it writes ("B-tree · whole pages, at random places", "LSM tree ·
  appends and merges, all sequential"), its figure at the right ("42× · 420 MB/s of disk writes"), and a bar on one
  fixed linear axis, 0 to 180×, ticks at 0, 50×, 100×, 150×. The axis holds every setting (5.1× to 165×), so no value
  an experiment compares leaves it and nothing rescales. A bar is cut where its bytes go: the page and its log record;
  the log, the flush and each level (a cut is drawn where the parts on both sides are 2.4 px or wider, so on a phone
  the log and the flush read as one sliver). The conversion to MB/s is on the stage twice: the label names the 10 MB/s
  and every figure carries its product.
- "DISK READS FOR ONE LOOKUP": a row an engine, a pip a read (1 to 8), the count at the right.
- "DISK USED, × THE LIVE DATA": a row an engine with its reason ("B-tree · pages about 70% full", "LSM tree · at
  most: old versions not yet merged away"), a bar on a fixed 0 to 1.5× axis, solid to 1× and hatched beyond it (the
  house hatch of what is not live), a tick "1× · the live data alone".

**Ghosts** keep the setting before a change, in words. A changed write figure reads "19.5× · 195 MB/s · was 24×" with
a solid ink tick across its bar at the old value; a changed read count "5 · was 1". No tick is ever drawn without its
"was" (asserted), and none shows while a question is open (3).

**Controls off the stage** (`_widget-controls.scss`): Follow (A write, A lookup), Data (10 GB, 100 GB, 1,000 GB) and
Record size (100 B, 200 B, 1,000 B) as native radio groups drawn as `g-segmented`, each in a `fieldset.group`, and the
polite notice. Under the stage: Play's story when motion is reduced, the model's note, Describe.

**Layout.** At container wide the stage takes the left column (620 px at 1280) and the controls, the open question
and the cards the 340 px right column (`_widget-layout.scss`). Narrower, one column: the three controls as the stage's
first rows, the stage, the note, the open question, Describe, the cards; the notice is read out only. Inside the stage
the engines sit side by side from 500 px (two 224 px panels) and stack below it, the B-tree first.

**Heights** depend only on the stage's width (the workload reserves its longest form's lines; the tree and the stack
spread their rows over fixed blocks; every transform block and cost row is fixed). Measured in the mockup over every
setting, both plays and every experiment phase at 14 widths, and per pixel from 248 to 800 px:

| Stage width (px) | 248–332 | 333–499 | 500–583 | 584 and up |
| ---------------- | ------- | ------- | ------- | ---------- |
| Stage height     | 1,416   | 1,398   | 880     | 862        |

So 252 px (a 320 phone) and 322 (390) are 1,416, 344 (412) is 1,398, 620 (1280) is 862. A phone's stage is long (two
whole mechanisms and their comparison; Consistency & Quorums is 1,272 to 1,331 there), which is why each engine carries
its own Play, settings and total. `widget-heights.ts` gets the built widget's measured whole heights at rest per host
width; the mockup's whole-widget heights (its own page, so only a guide): 2,363 at 320, 2,324 at 360 and 375, 2,304 at
390, 2,286 at 412 and 430, 1,062 at 1280.

**Motion** (3.5's grammar; WAAPI on transform and opacity; one pooled particle a play).

- **One clock a play.** Each engine's Play runs the followed operation through that engine on one monotone clock
  (`planOf` in the mockup): the B-tree's write 4 s, its lookup 2.6 s, the LSM tree's write 4.5 s plus 0.5 s a level,
  its lookup 1.6 s plus 0.5 s a run. Nothing is drawn for an event before its moment: a page takes its outline as the
  key reaches it; the leaf page's strip appears when the walk ends, the changed slice lands, then the log record, then
  the whole strip turns amber (and the leaf in the tree with it, and "written back"), then the ledger; the record's
  dot and its count land in a run as the trail reaches it; the staircase draws row by row from the record's arrival in
  the first level; a lookup's skip or read lands run by run and the green ring last. The other engine's panel and the
  cost block stand as they are.
- **The step, in words.** While a play runs, the line under the engine's name says what is happening now, longest form
  that fits: "at the root, in memory", "level 3 of 5, in memory", "at its leaf page", "its record changed, 100 B", "a
  log record appended", "the whole page written back"; "appended to the log", "kept in the memtable, in memory",
  "memtable full after 671,089 writes: flushed" ("memtable full: flushed to disk"), "merged into L2, rewritten about
  5.5× there" ("merged down into L2"); "the memtable: not here", "L1: its filter says "not here"" ("L1: skipped"),
  "L4: read from disk", "found in L4". It obeys `hiding()`: no form carries a hidden number.
- **The key** is one ink dot (3.5 px) that travels the walk's own edges and the stack's own trail; neither path
  crosses a label (the counts sit in their own column; the stack's caption starts right of the trail).
- **The climax** of the B-tree's write is the whole page turning amber for a sliver of change (a 400 ms sweep across
  the strip); of the LSM tree's write, the staircase completing as the record reaches the last level and the ledger
  adding up; of a lookup, the read landing in its green ring.
- **An answer's play** applies the act (a control changes; the tree or the stack re-spaces over 240 ms, a new level
  sliding in), then plays the act's engine; hidden numbers stay "?" through it (3). At the reveal the values settle
  (400 ms), the bars grow from their ghosts' ticks, and the focus outlines pulse.
- **Stop.** During a free play that engine's Play is Stop (a pause glyph, "Stop the write through the B-tree"). Stop,
  or any change to a setting, ends the play and draws the new rest state at once; the controls stay live during a free
  play, and only an answer's play locks them.
- **Plays pause** by the widget host's visibility (IntersectionObserver on the host, plus `visibilitychange`), never
  one stage's or one panel's.
- **Reduced motion:** nothing moves. The stage is the rest state, the operation's whole path with every mark and
  number on it. Play redraws it and writes what happened under the stage (HTML, so the stage's height stays a function
  of its width), also read out: "The write walks 5 pages from the root to a leaf, 4 of them in memory, changes 100
  bytes there and appends 100 bytes to the log. Then the whole page goes back to disk, 4,096 bytes: 4,196 bytes written
  for 100 bytes of data, 42×." ("The write is appended to the log and kept in the memtable. When the memtable's 64 MB
  fill, it is flushed to disk as one sorted run, and compaction merges the record down through 4 levels, rewriting it
  about 5.5 times at each: 24× the data in all."; "The lookup checks the memtable, then asks the bloom filter of each
  run on disk: 4 runs say "not here" from memory, and only the last level is read: 1 disk read.").

## 3. The experiments

Every number is a slot from the model (`enum.cjs` prints them all); answer positions 3, 2, 2, 1, 1. No question is
answered by a choice's shape or size: the largest number is right in E1 and E4 and wrong in E2; E3 and E5 each offer
both "Only the B-tree's" and "Only the LSM tree's". A card sets the widget up with complete settings, as a new start:
whatever the learner had before leaves no ghost; answering plays its act on the engine it names (on a phone the
engine's panel is first brought into view); the dock holds "your guess" ("Watch the picture: the answer plays out on
it.") through the play; the reveal is read out politely and its regions get a focus outline with the house "Look here"
tag.

**E1 "One small update".** Setup the default, following a write; act `run: 'btree'`. Ask: "A B-tree with 4 KB pages
holds 100 GB of records, 100 bytes each. One record changes. Once the change is safe on disk, in its page and in the
log, how many bytes has the engine written?" Choices (ascending): "100 bytes: only the record that changed" / "200
bytes: the record, and a log record of the same size" / **"4,196 bytes: the whole page, and a log record"**. Reveal:
"4,196 bytes: a B-tree changes its page in place, and a page goes to disk whole: 4,096 bytes for a change of 100 bytes,
plus a log record of 100 bytes so a crash can replay it. That is 42× the data, and the page sits at a random place on
the disk. With 16 KB pages it would be 165×. The model is rough: it has every update write its page back alone, where a
real buffer pool often gathers several changes to a hot page first." Hides `btreeWrite`: while it asks, the leaf page
is a dashed outline holding only the changed record ("100 B changed", "written after your answer"), the log a dashed
track, the leaf in the tree only visited, the ledger "? B written" and "?× the data", the B-tree's write row a dashed
bar and "?×". Its play walks the tree and writes the page back (the strip turns amber: the answer drawn), with every
byte count still "?" ("? B written back", "+? B appended"). Focus: the leaf page, the write row.

**E2 "Appended, then merged".** Setup the default; act `run: 'lsm'`. Ask: "An LSM tree never changes a file in
place: a write is appended to the log and kept in the memtable, which is flushed to disk as a sorted file when it
fills. Compaction then merges the record down through 4 levels, each 10× the size of the one above, so a level fills
after 10 merges from above, and each merge rewrites everything the level already holds. How many times is a record
written at each level, on average?" Choices (ascending): "1×: once, as a merge moves it down" / **"5.5×: in about
half of the merges that fill its level"** / "10×: in every merge that fills its level". Reveal: "5.5×: a record that
arrives with the first merge is written in all 10, one that arrives with the last only once, so the average is
(ratio + 1) / 2. With one write to the log and one at the flush, 4 levels of 5.5× make 24× the data. Every one of
those writes is sequential, but the bytes add up: 10 MB/s of new data becomes 240 MB/s of disk writes, and when the
disk cannot sustain that, compaction falls behind, files pile up and the engine stalls writes." Hides `lsmWrite`:
while it asks, every count in the stack is "?×", the staircase is a dashed box ("One level's merges draw after your
answer."), the ledger "?" and "?× the data", the LSM write row dashed. Its play sends the record down the stack and
draws the staircase row by row, its words without numbers ("Each merge from above rewrites what the level already
holds."). Focus: the stack, the staircase.

**E3 "Bigger records".** Setup the default; act `set: { record: 1000 }`, `run: 'btree'`. Ask: "With records of 100
bytes, the B-tree writes 42× the data and the LSM tree 24×. Store the same 100 GB as records of 1,000 bytes instead.
Whose write cost falls?" Choices: "Both: ten times the record, a tenth of the cost, 4.2× and 2.4×" / **"Only the
B-tree's: to 5.1×, against the LSM tree's unchanged 24×"** / "Only the LSM tree's: to 2.4×, against the B-tree's
unchanged 42×". Reveal: "Only the B-tree's: 5.1×, so it now writes less than the LSM tree's 24×. Writing a page costs
the same 4,096 bytes whatever changed inside it, so a record of 1,000 bytes is about a quarter of what its update
writes, where a record of 100 bytes was about a fortieth. The LSM tree rewrites every byte the same number of times
whatever the record size; its cost follows its levels. Small records favour the LSM tree, and at these settings the
B-tree writes less once a record passes about 180 bytes." Hides `writesAfter` (playing: both engines' write numbers at
the new record size; the changed record, now a quarter of its page, is the play). The setup's own picture is the
premise and the reasoning: the ledgers "4,096 B + 100 B" and "1 log + 1 flush + 4 levels × 5.5" stand while it asks,
and only one of them has the record in it. Focus: the leaf page, the write row (its ghosts "was 42×" and no ghost on
the LSM tree's, which did not move).

**E4 "Without bloom filters".** Setup the default, following a lookup; act `set: { bloom: 0 }`, `run: 'lsm'`. Ask: "A
lookup in this LSM tree costs 1 disk read: for each sorted run on disk, a bloom filter in memory says whether the run
can hold the key. Turn the filters off, and look up a key that was last written long ago. What does the lookup cost
now?" Choices (descending): **"5 disk reads: one in every run, from the newest down to the last level"** / "2 disk
reads: the newest run, then the last level" / "1 disk read: every run is sorted, so one search finds the key". Reveal:
"5 disk reads: the newest version of a key can sit in any run, so without filters the engine searches each in turn,
the flushed run and then all 4 levels, and most keys rest in the last level, which holds about 90% of the data. With
filters, 4 runs answer "not here" from memory and only the last is read. The filters take about 10 bits a key, 1.3 GB
of memory here, and they cannot answer a range scan, which opens every run either way. The B-tree walks 5 pages, 4 of
them in memory: 1 disk read, filters or not." Hides `readsWhy` (asking: the lookup's arithmetic, "5 runs − 4 skipped =
1 read" and the sentence that counts the filters, read "?" and "How the filters decide shows after your answer."; the
setup's skip marks and its "1 disk read" stay: they are the premise) and `readsAfter` (playing: the LSM tree's counts,
ledger, total, pips and read figure; the reads land run by run on the stack, which is the play). Focus: the stack, the
read row.

**E5 "Ten times the data".** Setup the default; act `set: { data: 1000 }`, `run: 'lsm'`. Ask: "With 100 GB of data
the B-tree writes 42× the data and the LSM tree 24×. The data grows to 1,000 GB, with the same records and settings.
Whose write cost rises?" Choices: **"Only the LSM tree's: it needs another level"** / "Only the B-tree's: its tree
grows taller" / "Both: more data makes both trees deeper". Reveal: "Only the LSM tree's: 24× becomes 29.5×. Ten times
the data needs one more level at ratio 10, 5 instead of 4, and every level adds about 5.5 rewrites. The B-tree still
writes one page and one log record for an update, 42×, however much data sits around it, and its walk is still 5
pages, since every level multiplies its reach by about 179." Hides `writesAfter`. The play is the stack gaining a
level (and the tree's counts growing tenfold on the same five rows). Focus: the stack, the write row.

**E6 Challenge "Tune the size ratio".** Setup 100 GB, ratio 20, bloom filters off, following a lookup (33.5× written,
4 disk reads). Ask: "This node has no memory to spare for bloom filters. Keep at least 100 GB of data, and choose the
size ratio so that the LSM tree writes under 20× the data and a lookup costs under 7 disk reads." Goal `all`:
`lsmWrite` below 20, `lsmReads` below 7, `data` at least 100; keep `bloom` 0. Of the 24 LSM configurations (3 data
sizes × 4 ratios × filters on or off) exactly one passes: 100 GB at ratio 5 (17×, 15% under the bound, and 6 reads).
Ratio 4 writes the same 17× and costs 7 reads; ratio 10 costs 24×; at 1,000 GB ratio 4 writes 19.5× and costs 8 reads;
10 GB fails the data bound. The record size, the page size and the operation followed play no part in an LSM tree's
cost (E3's lesson), so 18 of the 432 settings pass, all of them that one configuration: `enum.cjs` prints the table.
The status is the house checklist (no line over it until met), under "Goal met:" while the goal holds and "You met it;
now:" once the learner moves off it, each line in the house `goalParts` form with its state in words: "the LSM tree
writes 33.5× the data, under 20×: not yet" / "a lookup costs 4 disk reads, under 7: met" / "the data is 100 GB, at
least 100 GB: met"; with the filters turned on, "The goal keeps bloom filters off." Reveal: "Ratio 5: 5 levels of about
3 rewrites each, 17× the data, and a lookup reads 6 runs. At ratio 10 there are only 4 levels, but each rewrites a
record about 5.5 times: 24×. At ratio 4 the tree writes the same 17× with 6 levels, so a lookup costs 7 disk reads.
The size ratio trades the bytes compaction writes against the runs a read must search, and against space: at ratio 5
up to 25% more disk holds versions waiting to be merged away, against 11.1% at ratio 10." No hides; Describe waits until
the goal is met ("Describe waits until you meet the goal.").

**One `hiding()` map** (prevention 1) from a question's regions to every surface; each region is named in the spec's
own `hide` list, so nothing is inferred from the act:

| Region        | When                    | On the stage                                                                                                                                                                                             | Elsewhere                                                                                         |
| ------------- | ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| `btreeWrite`  | asking and playing (E1) | the B-tree's byte counts ("? B written back", "+? B appended", "? B written", "?× the data"), its write row (a dashed bar, "?×"); while asking also the marks: the page's written extent and the log record (dashed), the leaf's "written back" | the summary ("Its write cost shows after your answer."), the notice, the play's step and story, Describe |
| `lsmWrite`    | asking and playing (E2) | every count in the stack ("?×"), the staircase's words, the ledger, the total, its write row; while asking also the staircase (a dashed box)                                                              | as above                                                                                          |
| `writesAfter` | playing (E3, E5)        | both engines' write numbers at the act's setting: everything `btreeWrite` and `lsmWrite` hide but the marks, which are the play                                                                           | as above                                                                                          |
| `readsWhy`    | asking (E4)             | the lookup's arithmetic: the ledger ("?") and the sentence that counts the filters                                                                                                                       | the play's story (it names no count of skipped runs)                                              |
| `readsAfter`  | playing (E4)            | the LSM tree's lookup numbers at the act's setting: the stack's counts, the ledger, the total ("? disk reads"), its pips and figure (a dashed pill, "?")                                                  | the summary ("Its lookup's cost shows at the reveal."), the notice, the step and story            |
| ghost         | open (every question)   | no ghost tick and no "was": a card's setup is a new start                                                                                                                                                | none                                                                                              |

Hiding holds through the answer's own play and releases at the reveal. While any question asks or plays, both Plays,
Page size, Size ratio, Bloom filters and the Follow, Data and Record size fieldsets are disabled, the notice says "Play
and every setting wait for your answer.", and Describe waits ("Describe waits for your answer."). Cards carry titles
only.

## 4. Accessibility

- The stage is `role="group"`, `aria-roledescription="visualization"`, named "Storage engines: one write or one lookup
  through a B-tree and an LSM tree"; its SVG has a summary that obeys `hiding()`: "A B-tree and an LSM tree each hold
  100 GB of data in records of 100 bytes; the stage follows one write through both. B-tree, 4 KB pages: 5 levels, 4 of
  them cached in memory. An update writes its whole page and a log record, 4,196 bytes for 100 bytes: 42× the data. A
  lookup costs 1 disk read. LSM tree, size ratio 10, bloom filters on: a flushed run and 4 levels on disk. A record is
  written once to the log, once at the flush and about 5.5 times at each level: 24× the data. A lookup costs 1 disk
  read. Disk used: about 1.44× the live data for the B-tree, at most 1.11× for the LSM tree. A rough model."
- Each Play is a button named for what it plays: "Play the write through the B-tree", "Play the lookup through the LSM
  tree"; "Stop the write through the B-tree" during its play; "…, after your answer" and disabled while a question
  waits. Page size and Size ratio are native radio groups in fieldsets with those legends (one Tab stop each, arrows),
  Bloom filters a native checkbox whose second line is its description; Follow, Data and Record size the same off the
  stage. The dock is `app-widget-check`, whose checklist lines carry ": met" and ": not yet" in words (the ✓ and · are
  `aria-hidden`). The stage has no tappable marks, so no tap hints exist to clear (prevention 11).
- Notices (polite, `aria-atomic`): after a change, the setting's sentence ("The B-tree, with 4 KB pages, writes 42×
  the data, and a lookup reads 1 page from disk; the LSM tree, with 6 levels at ratio 4 and bloom filters on, writes
  17×, and a lookup reads 1 run."); during a play, its step as it changes; after a play, its story (2, Reduced
  motion); after a reveal and when the challenge opens, the setting's sentence; while a question asks, that the
  settings wait. It is never blank but while an answer plays.
- Colour is never alone: a byte written is amber and counted in words ("written back", "1×", "≈5.5×"); a read is blue
  and says "read"; a skipped run is a slashed ring and "skipped"; the found key is a green ring and "found" in the
  step; hidden is dashed and "?" or "after your answer"; overhead is hatched and named. Tokens are the app's
  `--g-viz-*` (checked by `theme-contrast.spec.ts`); small text uses ink tokens that pass 4.5:1; page and run outlines
  use `--g-stroke` (3:1 for meaningful graphics in both themes).
- 44 px targets: both Plays, every segment (53 px wide at the narrowest, 44 tall), the toggle; the checker fails a
  target under 44 px or one hit box on another, at every setting and width.
- **Describe** (a `g-data-table` in a `minmax(0, 1fr)` grid, scrolling inside its own box): the summary sentence, then
  a row for the B-tree at each page size and for the LSM tree at each size ratio, for this workload, the two current
  rows marked (`aria-current`), and a note ("Rows are this workload's: 100 GB in records of 100 bytes, bloom filters
  on. The LSM tree's disk use is its most."). Columns: Engine, Levels, Written ("42×"), Disk writes ("420 MB/s"),
  Lookup ("1 disk read"), Disk used ("1.44×"). Under a 560 px stage it is `compact`: heads carry the unit ("Write, ×",
  "Disk, ×"), row names shorten ("LSM, ratio 10"), the MB/s column goes (it is ten times the one beside it), cells are
  bare numbers rounded as the stage rounds them. Seven rows need no scrolling; both forms fit their box at 320, 412,
  1280 and 1440 px (checked by `shoot.cjs`).

## 5. The prevention list

1. **Giveaways while asking, on every surface.** The one `hiding()` map (3) feeds the stage, the summary, the notice,
   the play's step and story, and Describe; both Plays and every control wait, so no play the learner starts can show
   an answer; the answer's play keeps the hiding until the reveal; a card's setup starts afresh, so no ghost carries an
   answer in (E3 entered from 1,000-byte records would draw "was 5.1×"). The mockup's `noAnswer()` (run by
   `shoot.cjs`) renders every question asking, entered afresh and from eight other settings (every act's target, the
   challenge's solution and two more), and its answer's play at five moments of its clock, at 14 widths from 248 to
   700 px (980 renders), against each question's answer words on the stage, in its accessible names, the notice, the
   summary and the play's story, the false claims (below) and structure: every Play and on-stage setting disabled; no
   ghost tick or "was"; while `btreeWrite` hides, no B-tree write bar, "?×" for its figure and total, no digit in the
   page's note, the log's note or the ledger, and while asking no written page, written leaf, log record or leaf
   action; while `lsmWrite` hides, no LSM write bar, every count "?×", no digit in the staircase's words, and while
   asking no staircase; while `readsWhy` hides, no digit in the lookup's ledger or its sentence; while `readsAfter`
   hides, no LSM pip, "?" for its figure and total, no count on the stack. It finds none, and it catches a leak planted
   on every flag of the map (eleven: the page written back drawn while E1 asks; the B-tree's numbers shown while E1
   asks and while it plays; the level's merges drawn while E2 asks; the LSM tree's numbers while E2 plays; each
   engine's new numbers while E3 plays; the reads while E4 plays; the lookup's arithmetic while E4 asks; the LSM
   tree's new numbers while E5 plays; a ghost while E3 asks). Each leak is tried against a clean render of the same
   view, so a leak that "passes" because the clean view was already dirty fails too. The built component's sweep does
   the same with motion off and on, moving every control during each question and sampling the play frame by frame.
2. **False claims anywhere.** No hidden value has a default: hidden reads "?", "?×" or "after your answer", never 0.
   The false claim rules (NaN, undefined, Infinity; any bare 0 before a unit; "1 levels", "1 pages", "1 disk reads",
   "1 runs" and a plural count with a singular noun; "??"; an em dash or a non-breaking space) run over every free
   setting's stage at every swept width (9,000 renders) and over every sentence off the stage for all 432 settings
   (the summary, the notice, both plays' stories, Describe in both forms, the goal checks). No animation's count
   stands for the model's: a play draws one arrival a level under the model's "≈5.5×", and the staircase is the
   model's arithmetic. Every sentence is computed for its setting (filters on or off; "the flushed run and 4
   levels"), and the layout spec asserts by rule, at every setting and width, that a write bar is as long as its
   number on the axis and its figure prints that number, a space bar's hatch likewise, a read row has a pip a read, a
   tree row never draws more pages than its level holds and shows its dots exactly when it holds more, and the stack
   draws a run for every level and the flushed run.
3. **`$index` tracking.** Tree rows are tracked by level from the root, pages by their place in the row, runs by level
   number, staircase rows by merge number, bar parts by name (`page`, `log`, `flush`, `L1` …); a level added or
   removed keeps every other run's identity, so E5's new level slides in and nothing else re-animates.
4. **Labels on lines; markers; rings.** Every stage text has a stage-coloured halo (the raised fill inside the band and
   the memtable), and marks and lines are laid before any label. The leaves' caption sits under the leaf row because
   the fan lines would cross it over the row; the stack's caption starts right of the trail; counts sit in their own
   right-hand column, sizes after their bars, the leaf's action at its row's end. The found ring is a stroke around
   the whole read dot; a walked page's outline is its own stroke. The checker flags text on text, two labels on a line
   closer than 6 px, a line through text (fans, the walk, the trail, ticks, rules), text on a mark, a dot on a dot,
   text or a mark off the stage, x tick labels closer than 6 px, a text against a focus outline's stroke, a hit box on
   another or under 44 px, a control's words overflowing its box, and any label or tag with no place: zero over 180
   screenshots, 9,000 setting renders and 448 experiment renders. The key in flight rides the walk and the trail,
   which cross no label.
5. **Look-here tags.** Edge candidates first (16 px off the corners), then just inside, then any free row inside the
   outline, outside last. Two regions with no free row of their own keep a tag's width free by construction: the cost
   block's title is cut to leave 96 px at its right end, and the read row's label likewise. `sweepExperiments` asserts
   a placed tag for every outline of every reveal at 14 widths.
6. **Marks before their event.** One monotone clock a play; every mark carries its moment (`planOf`), and the step's
   words change at the same moments, so nothing is drawn or said for an event before it happens. The cost block's
   numbers are the model's statement of the setting, not events, and stand through a free play.
7. **Visibility and reduced motion.** Plays pause on the widget host's visibility and the page's; Reduced motion draws
   the rest state, which holds the whole path and every number, and Play writes the story.
8. **CSS specificity.** Every `fieldset.group` carries zero padding, and the on-stage groups are placed by the layout
   in absolute boxes of their own, so no control's class can add padding over another's; the 320 px shots show every
   segment inside its panel, and the checker measures each control's words against its box.
9. **Words.** The summary, notice and stories are full sentences (asserted: each ends as one, none opens on a numeral,
   thousands carry separators, no doubled space); plurals by count through `formatReads`, `formatLevels` and
   `formatPages`; no sentence is spliced from chips. The challenge's status is the checklist with its states in words,
   "Goal met:" only while the goal holds; the notice says the setting's sentence after a reveal and when the challenge
   opens.
10. **Describe's width.** `minmax(0, 1fr)`, the table in its own box, compact under a 560 px stage: it fits at 320 and
    412 px (compact) and at 1280 and 1440 px (full), with no sideways scroll of the box or the page (checked); e2e
    checks the same four widths.
11. **Touch hints.** The stage has no tap targets but its Plays, radios and checkbox, so it has no hints to clear.
12. **Placeholder heights.** The stage height is a step function of width (2); `widget-heights.ts` gets the built
    widget's whole height at rest per host width from a measuring spec at 320, 360, 375, 390, 412 and 430 px and every
    50 px from 300 to 1,300, which fails on any drift over 3 px.
13. **Text measurement.** The mockup measures with canvas from the fonts the app ships; the build measures through
    `stage-text.ts` (per-character advances of the same fonts, the label role uppercasing all but a unit: "MB/s" keeps
    its case here, as "ms" does in Latency & Queueing). This widget adds the 13 px and 17 px mono roles (`num`, `head`)
    to its advance tables. Stage text never uses tabular digits; the Describe table and the dock, which are HTML, keep
    `tabular-nums`.
14. **Learner text in HTML** (the notice, Play's story, the model's note, Describe's sentence and note, the dock's
    question, choices, goal and checks) renders through `g-code-text`, so no line parts a number from its unit ("4,196
    bytes", "10 MB/s", "42×", "ratio 10"); the mockup marks the same runs. Every live region that holds it is
    `aria-atomic` (`templates.spec` enforces it). Wrapped stage text keeps the same pairs through `stage-text.ts`.
15. **Element counts bounded by the stage, never by the data.** Pages drawn are capped a row (at most 7), runs by the
    model (at most 8), pips at 8; record ticks, the log's ticks, both staircase tones and a bar's cuts are one path
    each. The most SVG elements in any render of the sweep is 346 (asserted under 420). The heaviest setting is no
    heavier than the lightest, so keydown to the second frame is one layout of some 350 marks; the build measures it on
    a Pixel 7 profile at 4× CPU and holds it under 150 ms, and a play (one particle, opacity and transform only) at 60
    fps.
16. **Specs and e2e read the widget's state only after it is drawn**: web-first assertions on the stage's summary (it
    names the setting) before any read of a number; the widget's e2e (`storage-lesson.spec.ts`) runs on desktop, the
    Android phone and the WebKit iPhone project.
17. **Marks mean one thing.** Dashed is only "hidden until you answer" (the layout spec fails a dashed mark with no
    question open). A filter's skip is a slashed ring, not a dashed one; the free room in a page is a solid rule and
    the word "free"; overhead is the house hatch; a ghost is a solid tick. No ring or outline covers its mark.
18. **Every compared value lies on the drawn scale.** The write axis is fixed at 0 to 180× and holds every setting
    (5.1× to 165×; `enum.cjs` checks all 432), the space axis 0 to 1.5× (1.05× to 1.44×), the read row up to 8 pips
    (1 to 8). Nothing is cut at a scale's end. A ghost's old value is said in words beside its figure ("was 24×"),
    never left as a bare tick (asserted).
19. **Units and conversions.** A figure's shortest form keeps its unit ("42×", "100 B", "+100 B", "1 read"); fallbacks
    drop qualifiers, never the unit. Every conversion is drawn: bytes changed to bytes written (the strip, the log on
    its scale and the ledger); bytes written to "× the data" (the ledger's second line); merges to rewrites a level
    (the staircase); levels to the total (the ledger "1 log + 1 flush + 4 levels × 5.5" and the cut bar); × to MB/s
    (the write row's label names the 10 MB/s and every figure carries its product); pages walked to disk reads (the
    walk row and its ledger); runs to disk reads (the stack's marks and "5 runs − 4 skipped = 1 read").
20. **Layout.** No reserved empty line sits between two text blocks: the tree and the stack spread their rows over
    their blocks, the workload's spare lines and the transform's spare lines fall at each block's foot. A checked
    segment keeps its weight (500), so no label re-wraps and nothing moves when a control is chosen. In the one-column
    layout, choosing an answer first scrolls the panel its act plays on into view (the B-tree's for E1 and E3, the LSM
    tree's for E2, E4 and E5), then starts the play.

## 6. What a learner can say in an interview afterwards

- "A B-tree updates in place: a small change rewrites its whole page plus a log record, so write amplification is
  about the page size over the record size: 42× for 100-byte records in 4 KB pages, at random places on the disk.
  Bigger pages make it worse, bigger records better."
- "Its reads are cheap and predictable: one page a level, a few hundred children a page, so 4 or 5 levels for a
  terabyte, and everything above the leaves fits in memory: one disk read."
- "An LSM tree only appends: the log, a flush, then compaction rewrites each record about half the size ratio times at
  every level, so the cost follows the number of levels, about 24× at four levels of ratio 10, whatever the record
  size. That is why small records favour it and large ones do not."
- "Every write is sequential, but compaction is the bill: at 10 MB/s of new data that is 240 MB/s of disk writes, and
  if the disk cannot keep up, compaction falls behind and the engine stalls writes."
- "A lookup may have to search every sorted run; bloom filters, about 10 bits a key in memory, turn that back into one
  read for point lookups. They do nothing for range scans, and they cost real memory: over a gigabyte for a billion
  keys."
- "The size ratio is the tuning knob: a smaller ratio means fewer rewrites a level but more levels to read and more
  old versions on disk. Ratio 10 leaves about 10% of the disk to stale versions; a B-tree's pages sit about 70% full."
- "So: write-heavy ingest of small records, LSM, and I pay in compaction bandwidth, read amplification without
  filters, and memory for them; read-heavy lookups and range scans with steady latency, B-tree, and I pay in random
  page writes."

## 7. Lesson text fixes (`libs/engine/src/sysdesign/lessons/storage.ts`)

- `widget.tryThis` goes (the experiments replace it); `widget.experiments` takes `STORAGE_EXPERIMENTS`. Its caveats
  move to where the numbers are read: the note under the stage and E1's reveal.
- "LSM trees: memtable, SSTables, compaction": replace "Moving data down a level rewrites the overlapping part of the
  level below, several times the data moved, which the widget models as about (ratio + 1) / 2 rewrites per level."
  with "Moving data down a level rewrites the overlapping part of the level below: a level takes about ratio merges
  from above to fill and each one rewrites what is already there, which the widget models as about (ratio + 1) / 2
  rewrites per level." (the staircase's sentence, so the concept and the picture say the same thing).
- Nothing else changes. Checked against the model: the why text quotes no answer's number (the reveal spec holds it to
  that); "3 to 5 levels deep", "about one disk read", "around 70% full" (now the model's own constant, measured at 69
  to 73% by `enum.cjs`); "about 10% of space at ratio 10 because the last level holds about 90% of the data" (11.1%,
  90%); "about 10 bits per key gives roughly a 1% false positive rate, so a billion keys cost about 1.25 GB" (measured
  1.1 to 1.3%); the metrics example's 42, 840 MB/s, 5 levels, 29.5 and 590 MB/s; the compaction example's 24, 240,
  17, 17, 33.5, 80% and 90%, 11% and 25%; the follow-up's "the model counts it in both engines".

## Notes for the builder

- The mockup's geometry is the spec: `PANEL` (the block heights), the tree's row caps and walk path, the stack's
  spread, the strip's scale and floor, the chip column, the staircase box, the fixed axes, the reserved tag room, and
  the fallbacks of every label. Suggested files: `storage-layout.ts` (a pure `buildStage(width, model, view)` returning
  marks, as `latency-layout.ts` does; `storage-tree.ts` and `storage-stack.ts` if it passes 700 lines),
  `storage-words.ts` (`hiding()`, the summary, the notice's sentence, the steps, the stories, Describe, the goal
  checks), `storage-motion.ts` (`planOf`, the clock, the particle), a prims component, the widget component and its
  spec (the no-answer sweep with the eleven leaks), `storage-layout.spec.ts` over every setting at the mockup's widths
  with the assertions of 5, `storage-words.spec.ts` over every setting, `storage-motion.spec.ts`, and e2e
  `storage-lesson.spec.ts`.
- The on-stage controls are real inputs positioned over the stage from the layout's hit boxes (as the Play disc and
  the load handle are in Latency & Queueing): two `fieldset.group`s of radios and one checkbox. They take part in the
  layout spec (hit boxes apart, inside the stage, 44 px, words inside their box).
- The model is closed-form and cheap (no table, no worker): 432 settings compute in under a millisecond each.
- `content.md` (every string of the built widget, both checklist states included) is generated by a browser walk of
  the built widget, as for the other three, and goes to content review with the experiments.
