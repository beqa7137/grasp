# Capacity & Scaling widget (`pipeline`): design brief

Redesign R41, the batch's fourth widget (REDESIGN.md 5.2: the R41 to R45 entry, its "Forms" bullet, and the Data
Modeling, Consistency & Quorums and Latency & Queueing notes; LOOP.md rows 122 to 124 and their follow-ups are the house
references). Lesson: `/design/topics/sd-capacity`. Files beside this brief, on the orphan branch `design/r41-capacity`:

| File          | What it is                                                                                                                                                                                                                                                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `model.js`    | The model (tiers, per-request costs, zones, worker pools, one database admission) and the six experiments as slot templates; ported to `libs/engine/src/sysdesign/lessons/widgets/capacity.ts` and `capacity-experiments.ts`, retiring `pipeline()` from `widgets.ts`                                                                   |
| `enum.cjs`    | Prints every experiment number, proves the challenge has exactly one passing setting of 3,528, checks the reveals' word claims, holds the model to its invariants at all 197,568 settings, and checks it against an independent request-by-request token-bucket simulation of 8,605 settings (366 checks)                               |
| `mockup.html` | The mockup with the app's tokens and fonts: `?state=default\|calm\|cached\|replicas\|scaled\|zone\|slow\|overload\|outage\|playing\|describe\|reduced\|ask&exp=1..5\|reveal&exp=1..5\|challenge&theme=light\|dark`; `ask` also takes `&phase=playing` (the answer's play, hiding held, `&frac=` its moment) and `challenge` takes `&start=1` |
| `shoot.cjs`   | Screenshots every state at 1280, 390 and 320 px in both themes with the page's collision report and layout assertions, then sweeps settings at 12 widths (at rest, mid-ramp with particles, with a ghost), every experiment asking, playing and revealed, the no-answer sweep with four planted leaks, every page sentence, and the stage heights |
| `changes.md`  | Each critique item and what changed for it                                                                                                                                                                                                                                                                                            |

## 1. The verdict, and the mechanism

**Today's widget against the bar.** A traffic slider, three tier cards with − and + buttons, a utilization bar each and
three tiles (served, dropped, bottleneck). It computes the right minimum, but it shows the outcome and hides every cause.
Nothing flows: the learner never sees requests arrive, pass a tier or get shed. Each tier is a box of "requests a
second", so the one idea that makes capacity planning hard, that a request costs a different amount of work at each
tier (a database sees queries, not requests; a cache takes most reads; every replica replays every write), cannot even
be expressed. The database is "instances" that scale linearly, which the lesson itself says is false for a primary. No
failure domain, no headroom target, no worker pool, no experiment: three "Things to try" paragraphs of 60 to 80
number-dense words. It cannot answer the interview question "at 10 times the traffic, what breaks first, and what do
you do about it?", because the answer depends on exactly what it does not draw. It is far below the bar.

**What the learner must see.** A request stream enters at the top and passes three tiers in order. Each tier is a set
of instances; each instance has a limit in its own unit; one request costs that tier a fixed amount of work, so the
tier's limit in requests a second is its capacity divided by that cost. Drawn on one shared axis in requests a second,
every tier's limit is a bar, and the stream is a band as wide as the rate it carries: where a bar is shorter than the
stream arriving at it, the excess is shed right there, and the stream below is narrower. The shortest bar caps what is
served. Raise it and the stream widens until it meets the next shortest bar. How full each bar is, is that tier's
utilization; the rest of the bar is its headroom. A cache shortens no bar but makes the database's bar longer, since
each request costs it less; replicas lengthen the read bar by less each time, since every one replays every write; a
lone primary lengthens only by a bigger machine. Losing a zone takes a third of every tier at once. A slow dependency
shrinks the app servers' bar while their CPUs idle, because each request holds a worker longer (Little's law).

**What the widget draws, what experiments test, and what stays text** (as a senior interviewer would weigh them):

| Idea                                                                    | Weight | Where                                                                                                                                  |
| ----------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| The bottleneck caps throughput; the excess is shed where it happens     | core   | The stream narrowing at a full lane, the shed block and the red part of the stream with its ×; the bottleneck's box in the critical tone; E1 |
| A request costs each tier differently; compare limits in requests a second | core | One axis in requests a second for every lane; each lane's cost line ("0.2 writes and 1.8 reads a request"); the database's bar length; E1, E2 |
| Raising the bottleneck moves the limit to the next tier                 | core   | Steppers on every tier; the ramp's climax; E1's reveal names the next tier; the challenge                                             |
| Utilization and headroom per tier, sized for peak at 60 to 70%          | core   | Each instance filled to how busy it is, heat by load; "80% busy · 2,000/s spare"; the challenge's 30% headroom                       |
| The read/write split, the cache and replicas replaying every write      | high   | Writes hatched in the database fills; the cache line; replicas' cost line; E2, E3                                                    |
| Losing the largest failure domain (a zone of three)                     | high   | "Zone A down" condition; "4 of 6 up"; ghosts of the old limits; a replica promoted to primary; E4 and the challenge                   |
| What does not scale by adding copies: a single write primary            | high   | The primary's bar grows only with "a bigger machine" and stops at the largest; E3's reveal (no number of replicas passes the write ceiling) |
| Little's law sizing pools; a slow dependency exhausts the pools in front of it | high | One server's worker pool (100 cells) and "50 of 100 busy: 1,000/s × 50 ms in flight"; "Slow queries" condition; E5                  |
| Vertical against horizontal                                              | medium | The primary is one machine that only grows (−/+ size, "the largest machine"); app servers and replicas add copies; E3, the challenge  |
| Hot keys and locks                                                       | medium | Lesson text: they are another "one thing every request needs", the same picture as the lone primary; drawing them needs a key model  |
| Autoscaling lag                                                          | medium | Lesson text and its worked example (the flash sale): it is a time-domain effect, and drawing it would need a second, timed stage; the ramp shows what breaks first, which is what an autoscaler would have to beat |
| Load testing, queues past the limit                                      | low    | Lesson text: the widget sheds rather than queues, and says so on the stage                                                            |

**Settings.** `traffic` in requests a second, at 14 stops (1,000 to 8,000 by 1,000, then 10,000 to 20,000 by 2,000);
`lb` load balancers, 1 to 6, each 5,000 requests a second; `app` app servers, 1 to 21, each 1,500 requests a second of
CPU and 100 workers; `size` the database machine, 4,000 or 8,000 queries a second (the largest on offer; replicas match
the primary); `replicas` 0 to 6; `cache` 0 or 1 (90% of reads hit); `zone` 0 or 1 (zone A down); `slow` 0 or 1 (each
request holds its worker 500 ms instead of 50 ms). 197,568 settings. One request makes 2 queries, 1.8 reads and 0.2
writes (the lesson's first worked example), so every number of that example is a setting here.

**Formulas** (all in `model.js`, ported 1:1):

- Zones: instances spread A, B, C, A, ...; zone A, the largest failure domain, holds `ceil(n / 3)` load balancers and app
  servers and the primary; replicas start in zone B, so zone A holds `floor(n / 3)` of them. With zone A down a
  surviving replica is promoted to primary (one replica fewer); with none, the primary is lost and every request fails.
- Load balancers: limit `up × 5,000`. App servers: each takes `min(1,500, 100 × 1,000 / ms)` (CPU, or workers by
  Little's law: 100 workers held `ms` each), so 1,500 normally and 200 when slow; limit `up × that`.
- Database cost of one request: misses `m = 1.8 × (1 − 0.9 × cache)`; with replicas, the primary takes the 0.2 writes,
  limit `size / 0.2`, and each replica replays every write and takes its share of the reads, `0.2 + m / up`, limit
  `size / (0.2 + m / up)`; with none, the primary takes all, limit `size / (0.2 + m)`.
- Flow, in order: load balancers take `min(traffic, limit)` and shed the rest; app servers take `min(that, limit)`; the
  database admits `min(that, primary limit, replicas limit)` in one admission (every request needs both its write and its
  reads) and sheds the rest, at whichever of the two is smaller. Served is the smallest limit or the traffic. A request
  shed at one tier costs nothing below it; the tiers above did its work, so their utilization counts it.
- Utilization: what arrived over the limit for load balancers and app servers (at most 100%); for the database, what it
  admitted times its cost over the machine size; the writes' share is drawn apart. Workers in flight on each server:
  `passed / up × ms / 1,000`; what the arriving load would need: `arriving / up × ms / 1,000`.
- The bottleneck is the smallest limit; the next is the smallest of the rest. The challenge's measures: shed, headroom
  `100% − busiest`, shed after zone A fails (the model run with `zone: 1`), machines `lb + app + 1 + replicas`.

**Checks** (`node enum.cjs`, 366 pass). Every experiment number is printed with its slots. The reveals' word claims:
E1's ramp fills the database first and the load balancers end exactly 100% busy; E2's ratio is 2 / 0.38 = 5.26× and
"about 21,000/s"; replay takes exactly half of every replica at 1 to 6 replicas and none passes 40,000/s; E4 sheds a
tenth, only at the app servers, which carry 1.5× their load, and a replica is promoted; E5's workers bind at 200/s, a
fifth is served, CPU is 13.3% busy and the database does less work. At all 197,568 settings: conservation (traffic =
served + every shed), served = the smallest limit, utilization in [0, 1], 100% wherever a tier sheds, workers within the
pool, a replica's load = replay + reads. The challenge: of 3,528 settings exactly one passes, and moving any lever of it
back (5 load balancers, 16 app servers, the smaller machine, 1 or 0 replicas, no cache) fails it. The **independent
simulation** walks every request in turn through token buckets refilled at each instance's limit (load balancers and app
servers in turn, database buckets holding 50 ms of tokens), worker pools that hold each request for its time and start
in the state they run in, zones assigned by instance index with a promoted replica, and one database admission; over the
last four of five seconds it matches the model at 8,605 settings (every experiment setting, the challenge and a stride
of all) within half a percent of the traffic plus a request per instance, sheds tier by tier and utilization within 1
point (largest served gap 33/s, at 4,200/s).

**Honesty rule.** Every number the learner reads is a slot or a model value at the drawn setting. The particles of a
play are a picture of the stream: their count follows the model's rates (one dot per 1,500 requests a second per 24 px
of stream) and no number is ever read from them. The model's simplifications are on the stage, under the totals:
"Simplified: every request costs a tier the same, its instances are alike, and past its limit a tier sheds rather than
queues."

**Engine work.** `widgets/capacity.ts` (`CAPACITY_*` constants, `capacityRun(settings)`, `capacityMetrics`,
`capacityRamp`, `CAPACITY_SETTINGS`), retiring `pipeline` and `Pipeline` from `widgets.ts` (the old widget is its only
caller; `widgets.spec.ts` ports its cases). Settings are numbers, as `ExperimentSettings` requires. `ExperimentRun`
gains `'ramp'` and `'flow'`. `capacity-experiments.ts` holds the six specs and a `count` slot helper that throws on a
value that is not a whole number (so a float like 3,599.9999 can never print as "3600"). `capacity.spec.ts` pins the
formulas, the invariants over every setting, the ramp and the zones; `capacity-experiments.spec.ts` every quoted number,
the answers and the challenge's enumeration; the simulation is a spec of its own with a stride of the settings.

## 2. The picture

One `g-stage`, read top to bottom as the requests travel: the traffic, then each tier's box with the stream between
them, then what is served. Every horizontal position is on one axis in requests a second (0 to 24,000; a lane longer
than that is cut at the axis's end with a break mark and says its limit in words), shared by the traffic handle, the
stream and every lane, so a bar's length is comparable across tiers at a glance.

**Header.** The play disc (36 px in a 44 px box, "Ramp the traffic up to its setting"; "Stop the ramp" during a play),
the title "Requests through the tiers" ("Through the tiers" where it would not fit) in the title role, and the legend
(the stream swatch "requests", a heat swatch "busy", an empty segment "spare", a hatched swatch "writes", the × "shed")
beside the title when wide, in rows under it on phones.

**Traffic.** "TRAFFIC 8,000 requests a second" ("8,000 requests/s", "8,000/s" by width), a `g-handle` slider on a rail
from 0 to 20,000 with a stop per traffic step, its fill in the accent (handles are UI), and the axis's ticks "0",
"10,000", "20,000" under it, kept 6 px apart at every width. The stream starts right under the ticks at the handle's
width.

**The stream.** In each gap between boxes a band from the axis's zero to the rate it carries, in the current tone, with
a stage-coloured strand every 1,000 requests a second (so its width reads as a count), and a solid right edge. The part
the next tier will shed is drawn at the band's right in the critical tone, ending on the box's edge with a ×. Inside a
box the stream pours into the lane as a comb: one tooth on each instance's load, since the load balancer spreads
requests evenly. No word is ever in the stream's path, so a particle never crosses a label (checked).

**A tier's box** (load balancers, app servers; the database holds two blocks). In order:

1. **The lane**, at the box's top where the stream pours in: one segment per instance that is up, each as wide as its
   own limit (so the lane's end is the tier's limit), filled from its left to how busy it is, in heat by load (current
   under 50%, then the three heat tokens, critical when full and shedding: 3.6's heat roles, whose second encoding is
   the length and the % in words). The database's fills hatch their writes' share (a replica's replayed writes). Past
   the lane's end, a shed block (critical hatch, a ×) from the limit to what arrived. Gridlines at 10,000 and 20,000
   run through each lane only, behind the segments. A lane cut at the axis's end gets a break mark.
2. **The header** (44 px): the name in the label role ("LOAD BALANCERS", "APP SERVERS", "DATABASE PRIMARY" or "PRIMARY",
   "READ REPLICAS") and the fleet in the title weight ("2 × 5,000/s"; "4 of 6 up × 5,000/s" with zone A down;
   "8,000 queries/s, the largest machine"; "8,000 queries/s, a promoted replica"; "2 × 8,000 queries/s"; "none"), on
   one line or two by width; at the right a − and a + key (32 px keys in 44 px targets).
3. **The status** in words: "**80% busy** · limit 10,000/s · 2,000/s spare"; "**Full** · limit 6,000/s · 2,000/s shed,
   the bottleneck" (critical ink on "Full"); "**100% busy** · limit 10,000/s · nothing spare"; "**Idle** · ... · nothing
   reaches it"; "**None left:** zone A held every load balancer."; replicas say "each". A database lane names its limit's
   unit in full, beside a machine sized in queries: "**15% busy** · limit 40,000 requests/s, off the axis · 34,000/s
   spare" ("off the axis" only on wide stages; the break mark says it on phones).
4. **Its cost** where it is not one request: the app servers' **worker pool** (ten blocks of ten cells, one server's 100
   workers, "WORKERS ON ONE SERVER", then "**50 of 100 busy**: 1,000/s × 50 ms in flight (Little's law).", or when the
   pool binds "**100 of 100 busy**: 200/s × 500 ms. The 1,000/s sent to each would need 500; its CPU sits 13.3% busy.");
   the primary's "0.2 writes a request; its reads go to the replicas." ("0.2 writes and 1.8 reads a request, all of them
   here."); the replicas' "Each replays every write, 0.2 a request, and takes 0.09 reads a request."; and at the
   database's foot the cache line ("**Cache on:** 1.62 of each request's 1.8 reads hit it; 0.18 reach the database." /
   "**Cache off:** all 1.8 reads of each request reach the database.").

The bottleneck's box (only while something is shed) takes a 1.5 px critical border. Boxes are raised surfaces on the
stage's dot grid; their texts carry a halo of the box's colour.

**Served.** The stream leaves the database onto a served bar (final green) on a track the axis's length, then
"SERVED **6,000/s** of 8,000/s · 2,000/s shed, 25%" (or "· nothing shed"), the served number in the house's 17 px mono
value role, the largest text on the stage. Then the simplifications line (above).

**Ghosts.** After a change, each lane whose limit moved shows its old end as a dashed tick, "was 9,000/s" beside it where
it covers nothing; never while a question asks. At a reveal the ghosts are the setup's limits, so a change reads as a
move ("from 4,000 to 21,053").

**Controls.** On the stage: Play, the traffic handle, and each tier's − / + (load balancers 1 to 6, app servers 1 to 21,
the database machine 4,000 or 8,000 queries a second, replicas 0 to 6); a key at its end is disabled and the fleet says
why ("the largest machine"). Outside the stage, in the house's place (`fieldset.group.conditions-control`), three native
checkboxes drawn as toggles: "Cache reads · 90% hit", "Zone A down · a third lost", "Slow queries · 500 ms each"; then
the polite notice. Describe sits under the stage.

**Layout.** At container wide the stage takes the left column (620 px at 1280) and the conditions, the notice, the open
question and the cards the 340 px right column (`_widget-layout.scss`). Narrower, one column: the conditions as the
stage's first rows (stage background), the stage, the open question, Describe, the cards; the notice is read out only
(visually hidden, as `_widget-controls.scss` does), so its length never moves the stage.

**Heights** depend only on the stage's width: every wrapped text reserves the most lines any setting needs at that width
(measured over 2,701 extreme and experiment settings, then held by the sweep to every setting). Measured in the mockup:

| Stage width (px) | 252   | 270   | 300   | 322   | 344   | 360   | 400 | 460 | 520 | 560 | 620 | 700 |
| ---------------- | ----- | ----- | ----- | ----- | ----- | ----- | --- | --- | --- | --- | --- | --- |
| Stage height     | 1,167 | 1,115 | 1,064 | 1,047 | 1,029 | 1,029 | 946 | 926 | 917 | 866 | 838 | 838 |

Per pixel from 248 to 760 px it is a step function (`heightSteps()` in the mockup); a stage of at least the width in
the first row is the height under it. The step at 520 px is the stage's side padding growing from 12 to 16 px.

| From (px) | 248 | 258 | 262 | 265 | 282 | 288 | 293 | 303 | 328 | 366 | 367 | 387 | 393 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Height | 1,167 | 1,152 | 1,132 | 1,115 | 1,098 | 1,081 | 1,064 | 1,047 | 1,029 | 997 | 980 | 963 | 946 |

| From (px) | 422 | 504 | 514 | 518 | 519 | 520 | 522 | 526 | 527 | 570 | 701 | 744 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Height | 926 | 909 | 892 | 875 | 858 | 917 | 900 | 883 | 866 | 838 | 823 | 806 |

So 252 px (a 320 phone) is 1,167, 322 px (390) is 1,047, 344 px (412) is 1,029 and 620 px (1280) is 838; the built
stage's steps will fall a few px off these (per-character advances against the mockup's canvas), and its layout spec
pins its own. `widget-heights.ts` gets the built widget's whole heights at rest per host width from a measuring spec
at 320, 360, 375, 390, 412 and 430 px and every 50 px from 300 to 1,300, failing on any drift over 3 px.

**Motion** (3.5's grammar; WAAPI on transform and opacity; pooled particles, at most 60 live).

- **The ramp (Play).** One monotone clock steps the traffic through its stops from 1,000 to the setting, one stop each
  360 ms (`--g-motion-layout`): the handle glides (240 ms), the stream's widths and the fills ease (240 ms), values swap
  and flash, never count up. A shed (its block, the red part of the stream and its ×) appears only at the stop where its
  tier's limit is passed, never before. **The climax** is the first stop where a tier sheds: a 400 ms landing ring on
  that lane's end and its box's critical border, then 600 ms of dwell; with nothing shed, the busiest lane is ringed at
  the last stop. At the lowest stop there is nothing to step, so Play runs the stream's particles for 2.4 s at that
  rate. The play ends on the setting, at rest. Any change, or Stop, ends it at once.
- **Particles** fall through the gaps only, behind the boxes, at 60 px a second, spawned at a gap's top at a random
  position across the stream's width at a rate of one per 600 requests a second (one dot per 1,500 requests a second per
  24 px of stream); a dot in the part the next tier sheds is critical and turns into a × on the box's edge (240 ms fade).
  None crosses a box, so none crosses a word; no transit is under 240 ms.
- **An answer's play.** E1 runs the ramp from 1,000 to 10,000 with every lane hidden: the stream widens, sheds open
  where they happen, and the climax ring lands on the first × (the database's edge). E2 to E5 apply the act (the toggle
  flips, the key presses and the count changes), the changed lanes cross-fade to their hidden form (160 ms), the stream
  re-flows (360 ms) and particles run for 2.4 s; the climax is the first new × (E4, E5), or the red part closing (E2);
  E3 changes no flow, so it ends on its dwell. **At the reveal** the hidden lanes draw on: segments appear, fills grow
  from the setup's level to the new one (520 ms), the setup's limits stay as ghosts, numbers land (400 ms) and the focus
  outlines pulse with their "Look here" tags.
- **Plays pause** by the widget host's visibility (IntersectionObserver on the host, plus `visibilitychange`), never one
  stage's.
- **Reduced motion:** nothing moves. Play draws the setting at rest with the first tier to fill ringed and writes the
  ramp's story as a visible caption under the stage (HTML, so the stage's height stays a function of its width), also
  read out: "Play stepped the traffic from 1,000 to 8,000 requests a second. At 7,000, the app servers filled first and
  began to shed; at 8,000, 6,000 a second are served and 2,000 shed." No meaning lives only in motion.

## 3. The experiments

Every number is a slot (`enum.cjs` prints them all); answer positions 3, 2, 1, 3, 1. A card sets the widget up with
complete settings, as a new start: whatever the learner had before leaves no ghost. While a question asks or its answer
plays, Play, the traffic handle, every stepper and the conditions wait (`aria-disabled` handle, disabled buttons and
fieldset), the notice says "Play and the settings this question is about wait for your answer.", Describe waits ("Describe
waits for your answer."), and the dock holds "your guess" with "Watch the picture: the answer plays out on it." The
reveal is read out politely and atomically; its regions get the house focus outline and "Look here" tag.

**E1 "Ten times the traffic".** Setup 1,000/s, 2 load balancers, 4 app servers, an 8,000-query primary, no replicas, no
cache; act `set: { traffic: 10000 }, run: 'ramp'`. Ask: "Today 1,000 requests a second arrive, and every tier has room
to spare. Each request passes a load balancer and an app server, then makes 2 queries to the database. Traffic grows
10×, to 10,000/s. Which tier runs out first?" Choices (the tiers in drawn order, each with its fleet): "The load
balancers: 2 of 5,000/s each" / "The app servers: 4 of 1,500/s each" / **"The database: one primary of 8,000
queries/s"**. Truth: the ramp's first tier to shed. Uncertain because the database's raw size is the largest number on
the stage, the load balancers end exactly full at 10,000, and the answer needs the per-request cost. Reveal: "The
database, at 4,000/s: each request costs it 2 queries, so its 8,000 queries a second carry only 4,000 requests a second,
fewer than the app servers' 6,000/s or the load balancers' 10,000/s. Compare tiers by their limit in requests a second,
never by their raw size. At 10,000/s only 4,000/s are served: the app servers, full at 6,000/s, shed 4,000/s, and the
database sheds 2,000/s more. Cache the reads or add replicas first; the app servers come next, and the load balancers end
exactly 100% busy." Hides `limits` (asking and playing). Focus: the database, the totals.

**E2 "Cache the reads".** Setup 10,000/s, 3 load balancers, 8 app servers, an 8,000-query primary, no replicas, no
cache (the database tops out at 4,000 and sheds 6,000); act `set: { cache: 1 }`. Ask: "The database tops out at 4,000/s.
Each request makes 1.8 reads and 0.2 writes, 2 queries in all, against its 8,000 queries a second. Put a cache in front of
the reads, and 90% of them hit it. How many requests a second can the database take now?" Choices (ascending, one shape):
"About 8,000/s: twice as many" / **"About 21,000/s: 5× as many"** / "40,000/s: 10× as many, like the hit rate". Reveal:
"21,053/s, 5.3× as many: the cache answers 1.62 of each request's 1.8 reads, so only 0.18 reads and the 0.2 writes reach
the database, 0.38 queries a request instead of 2. Its 8,000 queries a second now serve 21,053/s, not the 40,000/s a 90%
hit rate suggests: writes never hit a cache. All 10,000/s are served now, and the app servers, 83.3% busy, are the
busiest tier." Hides `after` (playing). Focus: the database (the primary's ghost at 4,000 and its lane past 21,000).

**E3 "Two more replicas".** Setup 20,000/s, 6 load balancers, 20 app servers, an 8,000-query primary, 2 replicas, the
cache; act `set: { replicas: 4 }`. Ask: "At 20,000/s, the database takes 4,000 writes a second and, after the cache,
3,600 reads. The 2 read replicas share the reads, each 72.5% busy. Add 2 more. How busy is each replica now?" Choices:
**"About 61%: a little less"** / "About 36%: half as busy" / "72.5%: unchanged, each holds every row". Asking, the
replicas' fills already hatch their replayed writes (half of each), which is the premise, not the answer. Reveal:
"61.3%: every replica replays every write, 4,000 a second, which takes 50% of its 8,000 queries a second however many
replicas share the reads. Only the 3,600 reads a second split: 1,800 each with 2 replicas, 900 with 4. Twice the
replicas raise their limit from 27,586/s to 32,653/s, 18.4% more, and no number of them passes 40,000/s, where replaying
the writes alone fills a replica. Replicas scale reads, not writes." Hides `after`. Focus: the replicas.

**E4 "Lose a zone".** Setup 10,000/s, 3 load balancers, 9 app servers, an 8,000-query primary, 3 replicas, the cache
(the busiest tier 74.1%); act `set: { zone: 1 }`. Ask: "Every tier is spread evenly over zones A, B and C, and none runs
above 74.1%; all 10,000/s are served. Zone A fails with every instance in it, and a replica takes over from the primary.
How many requests a second are shed?" Choices: "None: every tier has 25.9% to spare" / "About 3,300/s: a third, the
zone's share" / **"1,000/s: a tenth"**. Reveal: "1,000/s, a tenth: the 6 app servers left can take 9,000/s, so the 74.1%
they ran at becomes 111.1% of what they can serve. Losing one zone of three multiplies the load on what is left by 1.5×,
so any tier above 66.7% sheds. The load balancers end exactly 100% busy, with nothing to spare, and the database barely
notices: a replica became the primary. Size every tier for peak at or under 66.7% of its capacity, or spread over more
zones." Hides `after`. Focus: the app servers, the load balancers (their ghosts at 13,500 and 15,000).

**E5 "A slow database".** Setup 6,000/s, 2 load balancers, 6 app servers, an 8,000-query primary, 2 replicas, the cache;
act `set: { slow: 1 }`. Ask: "Each app server has 100 workers, and a request holds one for its whole 50 ms: at 6,000/s,
50 of each server's 100 are busy. A slow query plan makes every request take 500 ms, though the database does no more
work. How many requests a second are served?" Choices: **"1,200/s: a fifth"** / "6,000/s: all of them, each one slower"
/ "600/s: a tenth, like the slowdown". Reveal: "1,200/s, a fifth: requests in flight equal throughput times time
(Little's law). Each server's 100 workers hold at most 100 requests at once, and at 500 ms each that is 200/s; 6 servers
serve 1,200/s. The other 4,800/s are shed at the app servers while their CPUs sit 13.3% busy: the slow database used up
the workers in front of it. Serving 6,000/s at 500 ms needs 3,000 requests in flight. Set timeouts, fix the slow query,
and shed load early rather than only growing the pool." Hides `after` (the app lane, its fleet's per-server figure, and
the worker pool). Focus: the app servers, the worker pool.

**E6 Challenge "16,000/s with a zone to spare".** Setup 16,000/s, 2 load balancers, 8 app servers, a 4,000-query primary,
no replicas, no cache. Ask: "Serve 16,000/s with every tier keeping at least 30% headroom, nothing shed when zone A fails,
and at most 26 machines in all." Goal `all`: `shed` below 1, `headroom` at least 30, `zoneShed` below 1, `machines` below
27; keep `traffic` 16,000, `zone` 0, `slow` 0. Of 3,528 settings (6 × 21 × 2 × 7 × 2) exactly one passes: 6 load
balancers, 17 app servers, the 8,000-query primary, 2 replicas and the cache; every lever is needed (5 load balancers or
16 app servers shed after the zone loss, the smaller machine runs its writes at 80%, one replica runs at 76%, no replica
loses every write with the zone, no cache needs 12 replicas). The status is the house checklist (no line over it until
met), "Goal met:" while the goal holds and "You met it; now:" once the learner moves off it, each line with its state in
words: "served: all 16,000/s: met" / "headroom: the busiest tier 62.7% busy leaves 37.3%, at least 30%: met" / "zone A
lost: nothing shed: met" (else "zone A lost: 1,000/s shed at the app servers: not yet", or "the primary falls with it,
and no replica takes over: not yet") / "machines: 26, at most 26: met". With a kept setting off: "The goal keeps every zone
up and the database fast; it tries losing zone A for you." Reveal: "The fleet that fits: 6 load balancers, 17 app servers,
the cache, a primary of 8,000 queries/s and 2 replicas, 26 machines. Every tier keeps its headroom, and losing zone A
leaves 4 load balancers 80% busy and 11 app servers 97% busy, while one replica takes over as primary and the other
carries every read at 76%. With 16 app servers the zone loss would shed 1,000/s, and with no replica the primary would
fall with its zone and every write with it." Describe waits until the goal is met. Opening it, the notice says the
setting's sentence.

**One `hiding()` map** (prevention 1) from a question's regions to every surface; each region is named in the spec's own
`hide` list:

| Region   | When                    | On the stage                                                                                                                                                       | Elsewhere                                                  |
| -------- | ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `limits` | asking and playing (E1) | every lane drawn empty and dashed ("after your answer"), no segment, fill, shed block, comb tooth, ghost or ring; every status "?% busy · limit after your answer"; the pool "? of 100 busy"; the totals "SERVED ? of 1,000/s · shed after your answer"; no bottleneck border | the summary ("Of 1,000 requests a second offered, what each tier takes shows after your answer."), the notice, Describe |
| `after`  | playing (E2 to E5)      | the same, for the lanes the act changes (computed: limit, load, instances up or shed differ) and the totals; a hidden app tier's fleet shows its CPU figure, "6 × 1,500/s"; the stream, its strands and its particles stay | as `limits`                                                |
| ghost    | asking (every question) | no ghost tick or "was" label                                                                                                                                         | none                                                       |

The fleets, the per-request costs, the cache line and the traffic are the question's premise and stay. Hiding holds
through the answer's own play and releases at the reveal; the stream is the mechanism the play shows, as the sample is
in Latency & Queueing.

## 4. Accessibility

- The stage is `role="group"`, `aria-roledescription="visualization"`, named "Capacity: requests flowing through load
  balancers, app servers and a database"; its SVG has a summary that obeys `hiding()`: "Of 8,000 requests a second,
  6,000 are served and 2,000 shed. The app servers are the bottleneck, full at 6,000 a second. The load balancers are at
  80%; the database primary is at 15%; the read replicas are at 82.5% each." With nothing shed: "All 16,000 requests a
  second are served. The app servers are the busiest, at 62.7%. ..."
- Play is a button ("Ramp the traffic up to its setting"; "Stop the ramp"; "Ramp the traffic, after your answer" while
  a question waits, disabled). The traffic is a `g-handle` slider, "Traffic, requests a second", `aria-valuetext` "8,000
  requests a second"; arrows step a stop, Page keys three, Home and End. The steppers are buttons named for what they do
  ("Fewer app servers", "More app servers", "A smaller database machine", "A bigger database machine", "Fewer read
  replicas", "More read replicas"), disabled at their ends. The conditions are native checkboxes; the dock is
  `app-experiment-dock` with `goalChecks`, whose lines carry ": met" / ": not yet" in words (the ✓ and · are
  `aria-hidden`). Tab order follows the drawing: Play, traffic, each tier's − and +, the conditions, Describe.
- Notices (polite, `aria-atomic`, through `g-code-text`): after a change, the setting's sentence ("Of 8,000 requests a
  second, 6,000 are served and 2,000 shed. The app servers are the bottleneck, full at 6,000 a second. ..."); after a
  play, the ramp's story; while a question asks, the wait sentence; after a reveal and when the challenge opens, the
  setting's sentence. Never blank.
- Colour is never alone: full is critical and the word "Full" and a shed block with ×; heat has the fill's length and the
  % in words; writes are hatched and named; shed has × and words; hidden lanes are dashed and say "after your answer";
  lost instances leave the fleet ("4 of 6 up"); the bottleneck's border is backed by "the bottleneck" in its status.
  Tokens are the app's `--g-viz-*` and heat roles (checked by `theme-contrast.spec.ts`); small text uses ink tokens that
  pass 4.5:1.
- 44 px targets: Play, the handle (its hit box apart from Play's and the ticks' at every stop), every − and +.
- **Describe** (a `g-data-table` in a `minmax(0, 1fr)` grid, scrolling inside its own box): the summary sentence, then a
  row per tier and one for the whole path. Columns: Tier, Up ("4 of 6" with zone A down), Limit, Arriving, Busy, Shed
  ("none"); the path row gives the machines, the smallest limit, the traffic and the total shed. Under a 560 px stage it
  is `compact`: heads carry the unit ("Limit/s", "In/s", "Shed/s"), names shorten ("LBs", "App", "Primary", "Replicas"),
  cells are bare numbers, "1*" marks a promoted primary with a note under the table, so six columns fit 320 px; at 412,
  1280 and 1440 px the full form fits.

## 5. The prevention list

1. **Giveaways while asking, on every surface.** One `hiding()` map (3) feeds the stage, the summary, the notices, the
   handle and steppers, and Describe; Play, the handle, every stepper and the conditions wait, so no play the learner
   starts can show an answer; the answer's play keeps the hiding until the reveal; a card's setup starts afresh (no ghost
   carries an earlier setting in). The mockup's `noAnswer()` (run by `shoot.cjs`) renders every question asking, entered
   from every act's target and the challenge's solution, and its answer's play at five moments, at six widths (360
   renders), against each question's answer words and patterns (E1: "4,000/s", "bottleneck", "Full", any "limit N", any
   "N% busy", any "N/s shed" or "spare"; E2: "21,053", "21,000", "5.3×", "0.38"; E3: "61.3%", "61%", "32,653", "900"; E4:
   "1,000/s shed", "9,000/s", "111.1%", "Full", "bottleneck"; E5: "1,200/s", "200/s", "13.3%", "4,800/s", "Full"), the
   false claims (2), and structure: Play and the handle disabled and every stepper disabled; in every hidden lane no fill,
   writes hatch, shed block or ghost, and a status with no number but its "?"; the pool with no filled cell; the totals
   "?"; no bottleneck border and no climax ring while lanes hide; no ghost while asking. It finds none, and it catches four
   planted leaks (E1 asked without `limits`; E2 played without `after`; E3 asked with a ghost of four replicas; E5 played
   with the app tier left out of the hidden lanes). The built component's sweep does the same with motion off and on,
   sampling the play frame by frame.
2. **False claims anywhere.** No hidden value has a default: hidden reads "?" or "after your answer", never 0 and never
   "nothing shed". A tier no load reaches says "Idle · ... · nothing reaches it", not "0% busy"; nothing past its limit is
   called busy ("Full"); a lost tier says "None left". The false-claim rules (NaN, undefined, Infinity, "0% busy", any
   busy over 100%, a number past 999 without its separator, "1 load balancers", "a 8,000") run over every stage of the
   settings sweep (148,940 renders: a stride of every setting at 12 widths, at rest, mid-ramp and with a ghost) and every page sentence of a third of all settings (summary, ramp story, Describe both
   ways, goal checks); none. Every sentence is computed for its setting ("each" only for replicas, "is" for the primary,
   "a promoted replica" only when one was), and every lane's drawn end is its limit, every shed block ends where the
   stream above it does, the served bar is what is served, and Little's law multiplies out as printed (layout spec
   assertions). Particles are never counted in words.
3. **`$index` tracking.** Instances, comb teeth and particles carry stable ids (tier and instance index; a particle's pool
   slot); instances are only ever added or removed at a lane's end, and particles keep their id from spawn to exit.
4. **Labels on lines; markers; rings.** Every stage text sits on its box's colour or the stage's (a halo); gridlines run
   only through lanes, behind segments, where no word sits; the stream's path holds no word (checked: "text in the
   stream's path"); a ghost's label is placed only where it crosses no gridline, lane or text; the climax ring sits on a
   lane's end with nothing else there; × glyphs carry a ground disc. The checker flags text on text, a line through text,
   text on a mark, text under a control, dots on dots, anything off the stage, axis labels closer than 6 px, text against
   a focus outline's stroke, and any label or tag with no place: zero over every screenshot and every sweep render.
5. **Look-here tags.** House candidates on the outline's edge first (16 px off its corners), then just inside, two inner
   rows, at the outline's own right edge and the stage's, outside last; the stream and hit boxes are obstacles. Every
   reveal at 12 widths has a placed tag (the sweep asserts a tag exists).
6. **Marks before their event.** The ramp has one monotone clock; a shed's block, red stream part and × appear at the stop
   where its tier's limit is passed; the climax ring lands with it; particles become × only on reaching the box's edge;
   at the reveal fills grow from the setup's level, so nothing appears before the change that causes it.
7. **Visibility and reduced motion.** Plays pause on the widget host's visibility and the page's; Reduced motion draws the
   rest state, which holds every number, and Play rings the first tier to fill and writes the ramp's story.
8. **CSS specificity.** Every `fieldset.group` carries zero padding; a control's class only adds to it
   (`fieldset.group.conditions-control`); the 320 px shots show the conditions above the stage with no overlap.
9. **Words.** The summary, notices and ramp story are full sentences; no sentence opens on a numeral ("Of 8,000 requests a
   second, 6,000 are served", checked over every sentence); plurals by count; thousands separators everywhere (checked);
   no sentence spliced from pills. The challenge's status is the checklist with its states in words, "Goal met:" only
   while the goal holds; the notice is never blank.
10. **Describe's width.** `minmax(0, 1fr)`, the table in its own scrolling box, compact under a 560 px stage, so it fits
    at 320 and 412 px and at 1280 and 1440 px; e2e checks no sideways page scroll at all four.
11. **Touch hints.** No mark on the stage is tappable: its controls are Play, the handle and the steppers, all real
    controls, so there is no hint to clear.
12. **Placeholder heights.** The stage height is a function of width (2); `widget-heights.ts` gets the built widget's whole
    heights at 320, 360, 375, 390, 412 and 430 px and on a sweep from 300 to 1,300, failing on a drift over 3 px.
13. **Text measurement.** The mockup measures with canvas from the fonts the app ships; the build measures through
    `stage-text.ts` (`fontMeasure` with this widget's roles: label 11 px caps, caption 13 px, its bold, small 11 px and the
    17 px mono value), the one text measurement module. Stage text never uses tabular digits, so measurement matches
    rendering; the HTML tables and the dock keep `tabular-nums`.
14. **Learner text in HTML** (the notices, the ramp caption, Describe's sentence, the dock's question, choices, checks and
    reveal) renders through `g-code-text`, so no line parts a number from its unit ("500 ms"); every live region holding
    it is `aria-atomic` (templates.spec enforces it). Stage text is laid by `stage-text.ts`'s `wrap`, which never breaks
    a number from its unit either.
15. **Element counts** are bounded by the stage, never by data: at most 6 + 21 + 1 + 6 instance segments and as many comb
    teeth, one strand path per gap, at most 60 pooled particles, ten pool blocks; the whole SVG stays under 400 elements
    at the heaviest setting (21 app servers, 6 replicas, every shed). Keydown to the second frame stays under 150 ms on a
    Pixel 7 at 4× CPU (a change recomputes one `capacityRun`, microseconds, and redraws one stage), and a ramp holds 60 fps
    there (transforms and opacity only).
16. **Specs and e2e** read the widget's state only after zoneless Angular has drawn it (web-first assertions, or wait for
    the setting's summary first); the widget's e2e runs on the desktop, Android and WebKit iPhone projects.

## 6. What a learner can say in an interview afterwards

- "First I turn traffic into load per tier: requests times what one request costs there. A database sees queries, not
  requests: at 2 queries a request, 8,000 queries a second is only 4,000 requests a second."
- "Throughput is the smallest limit in that list. Adding capacity anywhere else changes nothing; raising the bottleneck
  moves the limit to the next tier, so I list every tier's limit and the order in which they fill."
- "At 10× the traffic the busiest tier today breaks first, often the database. My order there: cache the reads, add read
  replicas, scale the primary up, then cut or shard the writes; then scale the stateless app servers out and check the
  load balancers, which teams forget."
- "A 90% cache hit rate does not buy 10×: writes never hit a cache, so 2 queries a request become 0.38, about 5×."
- "Replicas scale reads, not writes. Every replica replays every write, so with heavy writes each new replica buys less,
  and no number of them passes the write ceiling of one primary. Beyond the largest machine, writes need sharding."
- "I size for peak at 60 to 70% and check the loss of the largest failure domain: with three zones the two left carry
  1.5×, so anything above two thirds sheds. A lone primary needs a replica in another zone to take over."
- "Little's law sizes pools: in flight equals throughput times latency. 100 workers at 500 ms serve 200 a second, so a
  slow dependency exhausts the pools in front of it while their CPUs idle; I'd add timeouts, bulkheads and load shedding."
- "Vertical is simpler until the largest machine; horizontal works for stateless tiers. Autoscaling lags by minutes and
  does not scale the database, so I pre-scale for known spikes and keep a floor."

## 7. Lesson text fixes (`libs/engine/src/sysdesign/lessons/capacity.ts`)

- `widget.tryThis` goes (the experiments replace it); `widget.experiments` takes `CAPACITY_EXPERIMENTS`.
- **Why it matters** quotes E1's exact answer (load balancers 10,000, app servers 6,000, the database 4,000, the database
  first): replace "load balancers good for 10,000 requests a second and app servers good for 6,000 still serve only 4,000
  if the database tops out there" with "load balancers good for 12,000 requests a second and app servers good for 9,000
  still serve only 5,000 if the database tops out there" (the reveal spec's "why quotes no answer" check holds it).
- **The bottleneck caps throughput**: "The widget simplifies: each request costs the same at every tier, and load past the
  bottleneck is dropped rather than queued" is now false (costs differ by tier). Replace with "The widget simplifies:
  every request costs a given tier the same work, a tier's instances are alike, and load past a tier's limit is shed
  rather than queued".
- **Vertical versus horizontal**: "The widget treats database instances as interchangeable, which holds for read
  replicas or shards, not for a lone primary." is now false. Replace with "The widget draws the difference: app servers
  and replicas scale by adding copies, the primary only by a bigger machine, and every replica replays every write, so
  replicas raise the read limit but never the write limit."
- **Pools and in-flight work** and **Peak plus headroom** keep their mechanisms (E4 and E5 ask for numbers they do not
  state). The first worked example's constants (1,500 a second per app server, 4,000 queries a second per database
  machine, 2 queries a request at 90% reads, a 90% cache) are the widget's, so its steps can be replayed on the stage;
  its numbers stay as they are (checked against the model: 2,000, 0.38, 10,500, 7,600, 50%, 1,600 and 3 replicas).
- Nothing else changes: the other worked examples, the pitfalls and the follow-ups agree with the model.

## Notes for the builder

- The mockup's geometry is the spec: the block order (lane at the box's top, header, status, cost), the 44 px header
  with the steppers, the comb, the stream's gaps and strands, the reserved lines per width, the ghost and tag candidates.
  `capacity-layout.ts` (a pure `buildStage(width, run, view)` returning marks, as `latency-layout.ts` does),
  `capacity-words.ts` (`hiding()`, statuses, costs, the pool line, totals, summary, notices, the ramp story, Describe,
  goal checks), `capacity-motion.ts` (the ramp's clock and stops, the particles' spawn and exits, the climax), the
  component and its spec, and `capacity-layout.spec.ts` over a stride of every setting at 12 widths from 248 to 700 px
  with ramp frames and ghosts, every experiment asking, playing and revealed, and the assertions in 5.
- `content.md` (every string of the built widget, both checklist states included) is generated by a browser walk of the
  built widget, as for the other three, and goes to content review with the experiments.
