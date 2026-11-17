# Capacity & Scaling widget (`pipeline`): design brief

Redesign R41, the batch's fourth widget (REDESIGN.md 5.2: the R41 to R45 entry, its "Forms" bullet, and the Data
Modeling, Consistency & Quorums and Latency & Queueing notes; LOOP.md rows 122 to 124 and their follow-ups are the house
references). Lesson: `/design/topics/sd-capacity`. Files beside this brief, on the orphan branch `design/r41-capacity`:

| File          | What it is                                                                                                                                                                                                                                                                                                                            |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `model.js`    | The model (tiers, per-request costs, zones and the drawn order of each tier's instances, worker pools, one database admission) and the six experiments as slot templates; ported to `libs/engine/src/sysdesign/lessons/widgets/capacity.ts` and `capacity-experiments.ts`, retiring `pipeline()` from `widgets.ts` |
| `enum.cjs`    | Prints every experiment number, proves the challenge has exactly one passing setting of 3,528, checks the reveals' word claims, checks that every lane fits the axis and that the drawn zone groups are what a zone loss takes, holds the model to its invariants at all 197,568 settings, and checks it against an independent request-by-request token-bucket simulation of 8,605 settings ({{CHECKS}} checks) |
| `mockup.html` | The mockup with the app's tokens and fonts: `?state=default\|calm\|cached\|replicas\|scaled\|zone\|slow\|overload\|outage\|playing\|describe\|reduced\|ask&exp=1..5\|reveal&exp=1..5\|challenge&theme=light\|dark`; `ask` also takes `&phase=playing` (the answer's play, hiding held, `&frac=` its moment) and `challenge` takes `&start=1` |
| `shoot.cjs`   | Screenshots every state at 1280, 390 and 320 px in both themes with the page's collision report and layout assertions; sweeps settings at 12 widths (at rest, mid-ramp with particles, with a one-change ghost, reduced motion); every experiment asking, playing and revealed; the no-answer sweep with six planted leaks; one planted fault per new rule; every page sentence; the phone view at each play's and reveal's anchor; the stage's top over every condition; Describe's width; and the stage heights |
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
tier's limit in requests a second is its capacity divided by that cost, and the stage draws that division. Drawn on one
shared axis in requests a second, every tier's limit is a bar, and the stream is a band as wide as the rate it carries:
where a bar is shorter than the stream arriving at it, the excess is shed right there, and the stream below is
narrower. The shortest bar caps what is served. Raise it and the stream widens until it meets the next shortest bar. How
full each instance is, is that tier's utilization; a mark at 70% and the rest of the bar are its headroom. A cache
shortens no bar but makes the database's bar longer, since each request costs it less; replicas lengthen the read bar by
less each time, since every one replays every write; a lone primary lengthens only by a bigger machine. Each tier's
instances are grouped by zone, zone A's group last, so where that group starts is the limit that survives losing zone A;
losing it takes zone A's group from every tier at once (a third of a tier spread evenly, more of one that is not) and a
replica's promotion. A slow dependency shrinks the app servers' bar while their CPUs idle, because each request holds a
worker longer (Little's law).

**What the widget draws, what experiments test, and what stays text** (as a senior interviewer would weigh them):

| Idea                                                                    | Weight | Where                                                                                                                                  |
| ----------------------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------- |
| The bottleneck caps throughput; the excess is shed where it happens     | core   | The stream narrowing at a full lane, the shed block with its ×, the red part of the stream above it; the bottleneck's box in the critical tone; E1 |
| A request costs each tier differently; compare limits in requests a second | core | One axis in requests a second for every lane; the primary's step arrow from its machine's queries to its lane's end ("÷ 2 queries a request"); each database block's conversion ("8,000 queries/s ÷ 2 queries a request = 4,000 requests/s"); E1, E2 |
| Raising the bottleneck moves the limit to the next tier                 | core   | Steppers on every tier; the ramp's climax; ghosts of the old limits; E1's reveal names the next tier; the challenge                    |
| Utilization and headroom per tier, sized for peak at 60 to 70%          | core   | Each instance filled to how busy it is, heat by load, a 70% mark in every instance; "80% busy · 2,000/s spare"; the challenge's 30% headroom |
| The read/write split, the cache and replicas replaying every write      | high   | Writes hatched in the database fills; the cache line; the replicas' conversion "(0.2 replayed writes + 0.9 reads)"; E2, E3           |
| Losing the largest failure domain (a zone of three)                     | high   | Zone groups under every lane (B, C, A), zone A's lost group hatched at its old place; "4 of 6 up"; "if zone A fails" ticks at rest and in the challenge; a replica promoted to primary; E4 and the challenge |
| What does not scale by adding copies: a single write primary            | high   | The primary's bar grows only with "a bigger machine" and stops at the largest; E3's reveal (no number of replicas passes the write ceiling) |
| Little's law sizing pools; a slow dependency exhausts the pools in front of it | high | One server's worker pool (100 cells) and "50 of 100 busy: 1,000/s × 50 ms in flight"; "Slow queries" condition; E5                  |
| Autoscaling and load testing on the right signal                        | medium | E5's reveal: CPU sits at 13.3% while four fifths are shed, so an autoscaler on CPU adds nothing; the lesson's flash-sale example carries the lag |
| Vertical against horizontal                                              | medium | The primary is one machine that only grows (−/+ size, "the largest machine"); app servers and replicas add copies; E3, the challenge  |
| Hot keys and locks                                                       | medium | E5's ask (lock waits on a hot row hold every request 500 ms); lesson text: a hot key is "one thing every request needs", the lone primary's picture |
| Losing or cold-starting the cache                                        | medium | The footnote (the cache runs a node in every zone) and a lesson pitfall: with the cache gone, each request costs the database 2 queries instead of 0.38 |
| Queues past the limit                                                    | low    | Lesson text: the widget sheds rather than queues, and says so under the stage                                                        |

**Settings.** `traffic` in requests a second, at 14 stops (1,000 to 8,000 by 1,000, then 10,000 to 20,000 by 2,000);
`lb` load balancers, 1 to 6, each 5,000 requests a second; `app` app servers, 1 to 21, each 1,500 requests a second of
CPU and 100 workers; `size` the database machine, 4,000 or 8,000 queries a second (the largest on offer; replicas match
the primary); `replicas` 0 to 6; `cache` 0 or 1 (90% of reads hit; it runs a node in each zone); `zone` 0 or 1 (zone A
down); `slow` 0 or 1 (each request holds its worker 500 ms instead of 50 ms). 197,568 settings. One request makes 2
queries, 1.8 reads and 0.2 writes (the lesson's first worked example), so every number of that example is a setting here.

**Formulas** (all in `model.js`, ported 1:1):

- Zones: load balancers and app servers are spread A, B, C, A, ..., replicas B, C, A, B, ...; zone A, the largest
  failure domain, holds `ceil(n / 3)` load balancers and app servers, `floor(n / 3)` replicas, and the primary. A tier is
  drawn zone B first, then C, then A (`zoneLane`), each instance with a stable id (tier, zone, index in the zone), so
  zone A's group is last and where it starts is the limit that survives zone A. With zone A down, the last surviving
  replica in drawn order is promoted to primary (one replica fewer); with none, the primary is lost and every request
  fails. The cache runs a node in each zone, so its hit rate survives.
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
  `100% − busiest`, shed after zone A fails (the model run with `zone: 1`), machines `lb + app + 1 + replicas + 3 × cache`.

**Checks** (`node enum.cjs`, {{CHECKS}} pass). Every experiment number is printed with its slots. The reveals' word
claims: E1's ramp fills the database first and the load balancers end exactly 100% busy; E2's ratio is 2 / 0.38 = 5.26×
and "about 21,000/s"; replay takes exactly half of every replica at 1 to 6 replicas and none passes 40,000/s; E3's limits
before and after and the write ceiling lie on the axis; E4 sheds a tenth, only at the app servers, which carry 1.5× their
load, its load balancers and app servers are spread evenly over the three zones, a replica is promoted, and the one
replica left runs at 42.8%; E5's workers bind at 200/s, a fifth is served, CPU is 13.3% busy and the database does less
work. Every limit an experiment's ask, reveal or ghost compares lies on the axis, and the longest lane at any setting is
40,000/s, the axis's end. The zones as drawn: for every tier and count, every instance has its own id, zone A's group is
drawn last, its size is what the zone loss takes, the survivors keep their drawn places, and zone A's group starts at the
limit that survives it. At all 197,568 settings: conservation (traffic = served + every shed), served = the smallest
limit, utilization in [0, 1], 100% wherever a tier sheds, workers within the pool, a replica's load = replay + reads. The
challenge: of 3,528 settings exactly one passes, it uses exactly the 29 machines allowed with the cache's three nodes
counted, and moving any lever of it back (5 load balancers, 16 app servers, the smaller machine, 1 or 0 replicas, no
cache) fails it. The **independent simulation** walks every request in turn through token buckets refilled at each
instance's limit (load balancers and app servers in turn, database buckets holding 50 ms of tokens), worker pools that
hold each request for its time and start in the state they run in, zones assigned by instance index with a promoted
replica, and one database admission; over the last four of five seconds it matches the model at 8,605 settings (every
experiment setting, the challenge and a stride of all) within half a percent of the traffic plus a request per instance,
sheds tier by tier and utilization within 1 point (largest served gap 33/s, at 4,200/s).

**Honesty rule.** Every number the learner reads is a slot or a model value at the drawn setting. The particles of a
play are a picture of the stream: their count follows the model's rates (one dot per 1,500 requests a second per 24 px
of stream) and no number is ever read from them. The model's simplifications sit under the stage, in HTML: "Simplified:
every request costs a tier the same, its instances are alike, and past its limit a tier sheds rather than queues. The
cache runs a node in every zone, so losing one keeps its hit rate."

**Engine work.** `widgets/capacity.ts` (`CAPACITY_*` constants, `capacityRun(settings)`, `capacityMetrics`,
`capacityRamp`, `capacityZoneLane`, `CAPACITY_SETTINGS`), retiring `pipeline` and `Pipeline` from `widgets.ts` (the old
widget is its only caller; `widgets.spec.ts` ports its cases). Settings are numbers, as `ExperimentSettings` requires.
`ExperimentRun` gains `'ramp'` and `'flow'`. `capacity-experiments.ts` holds the six specs and a `count` slot helper that
throws on a value that is not a whole number (so a float like 3,599.9999 can never print as "3600"). `capacity.spec.ts`
pins the formulas, the invariants over every setting, the ramp, the zones and the drawn zone order;
`capacity-experiments.spec.ts` every quoted number, the answers and the challenge's enumeration; the simulation is a spec
of its own with a stride of the settings.

## 2. The picture

One `g-stage`, read top to bottom as the requests travel: the traffic, then each tier's box with the stream between
them, then what is served. Every horizontal position is on one axis in requests a second, 0 to 40,000 (ticks 0, 10,000,
20,000, 30,000 and 40,000): the longest lane at any setting is the primary's write ceiling, 8,000 / 0.2 = 40,000, so no
lane is ever cut, every instance that is up is drawn whole at its true width, and every old limit a ghost marks is on
the axis. The axis is shared by the traffic handle (its rail runs to 20,000, the traffic's top), the stream and every
lane, so a bar's length is comparable across tiers at a glance. The trade is width: 1,000 requests a second is 5.1 px on
a 252 px stage, so below 6 px a strand marks every 2,000 rather than every 1,000.

**Header.** The play disc (36 px in a 44 px box, "Ramp the traffic up to its setting"; "Stop the ramp" during a play),
the title "Requests through the tiers" ("Through the tiers" where it would not fit) in the title role, and the legend:
the stream swatch "requests"; a five-step heat ramp "busy: under 50 · 70 · 85% · full"; an empty segment with its notch
"spare, 70% mark"; a neutral hatch over grey "writes"; a hatched grey segment "lost"; the × "shed"; a dashed critical tick
"if zone A fails". Beside the title when all of it fits, else in the fewest rows that fit under it, split as evenly as
they allow (2 rows at 620 px, 3 at 322, 4 at 252).

**Traffic.** "TRAFFIC 8,000 requests a second" ("8,000 requests/s", "8,000/s" by width), a `g-handle` slider on a rail
from 0 to 20,000 with a stop per traffic step, its fill in the accent (handles are UI), and the axis's ticks under it,
kept 6 px apart at every width. The stream starts right under the ticks at the handle's width.

**The stream.** In each gap between boxes a band from the axis's zero to the rate it carries, in the current tone, with
a stage-coloured strand every 1,000 requests a second (2,000 where 1,000 is under 6 px), so its width reads as a count,
and a solid right edge. The part the next tier will shed is drawn at the band's right in the critical tone, ending on the
box's edge with a critical underline. At rest the shed's × sits on the lane's shed block only (one mark per shed); during
a play a × at the middle of the red part is the landing point the red particles turn into, and the climax ring circles
it. Inside a box the stream pours into the lane as a comb: one tooth on each instance's load, since the load balancer
spreads requests evenly; the replicas take their teeth from the divider, since every admitted request also sends its
reads there. No word is ever in the stream's path, so a particle never crosses a label (checked).

**A tier's box** (load balancers, app servers; the database holds two blocks, the primary and the replicas). Each block,
top-down and packed (the box's reserved slack collects at its foot, never between two blocks):

1. **The lane** (22 px), at the block's top where the stream pours in: one segment per instance that is up, each as wide
   as its share of the tier's limit (so the lane's end is the tier's limit), in the drawn zone order, filled from its
   left to how busy the tier is, in heat by load (current under 50%, then the three heat tokens, critical when full and
   shedding: 3.6's heat roles, whose second encoding is the length and the % in words), with a 70% notch (a 1.25 px
   stroke-ink tick over a 3 px raised under-stroke, top and bottom of the segment), so headroom reads as a mark. The
   lane's end gets a 1.5 px cap in `--g-stroke` (3:1 against the box in both themes; `theme-contrast.spec.ts` pairs it).
   The database's fills hatch their writes' share (a replica's replayed writes). Past the lane's end, a shed block
   (critical hatch) from the limit to what arrived, its × inside it, or just after it when the block is under 16 px.
   Then, in the row's empty track: "limit 10,000/s" (load balancers and app servers) at the lane's end, or past the shed's
   ×, where it fits; else in the strip just under the lane's end; else the status carries it (never beside a ghost tick,
   where it would read as the old limit's label). Gridlines at 10,000, 20,000 and 30,000 run through the row, behind the
   segments, and break around a word in the track. At rest and in the challenge, a dashed critical tick at the limit
   that would survive zone A ("if zone A fails"), never while a question asks or plays. A ghost (below) last.
2. **The strip** (18 px) under the lane: each zone's group of instances underlined and lettered ("B", "C", "A", the
   letter left out where it would crowd its neighbour), so where zone A's group starts is the limit that survives zone
   A; with zone A down its group stays at its old place as hatched grey 5 px segments, "A" under them, and the lane above
   ends where the survivors end. Under the primary instead: the step from its machine to its lane, a thin arrow from
   where its queries a second would sit (8,000) to its lane's end, labelled "÷ 2 queries a request" ("÷ 2 a request",
   "÷ 2" by room), the primary's own zone named in its fleet ("in zone A").
3. **The header** (44 px, or 61 when the fleet takes two lines under the name): the name in the label role ("LOAD
   BALANCERS", "APP SERVERS", "DATABASE PRIMARY" or "PRIMARY", "READ REPLICAS") and the fleet in the title weight beside
   it when both fit, else under it, wrapping rather than ever dropping a count, a promotion or a unit: "2 × 5,000/s";
   "4 of 6 up × 5,000/s"; "8,000 queries/s, the largest machine, in zone A"; "8,000 queries/s, a promoted replica";
   "2 × 8,000 queries/s"; "1 of 3 left × 8,000 queries/s"; "none"; a hidden tier its count alone ("6 up", "4 of 6 up"). At
   the right a − and a + key (32 px keys in 44 px targets).
4. **The status** in words, short: "**80% busy** · 2,000/s spare"; "**Full** · 2,000/s shed, the bottleneck" (critical ink
   on "Full"); "**100% busy** · nothing spare"; "**Idle** · nothing reaches it"; "**None left:** zone A held them all."
   (or "the only one"); replicas say "each" only when two or more are up. A limit with no room at the lane's end, and a
   ghost's old limit with no room beside its tick, join it: "· limit 20,000/s · limit was 30,000/s".
5. **A database block's conversion**, the step E1 asks for, in words: "8,000 queries/s ÷ 2 queries a request = **4,000
   requests/s**" (no replicas; "÷ 0.38" with the cache), "8,000 queries/s ÷ 0.2 writes a request = **40,000 requests/s**"
   (with replicas), and for the replicas "8,000 queries/s ÷ (0.2 replayed writes + 0.9 reads) = **7,273 requests/s**"; a
   ghost's old limit with no room in the lane's row or strip joins it (", was 4,000/s"). A database lane's limit is said
   here, in requests in full beside a machine sized in queries, so its status says no limit.
6. **The app servers' worker pool**: ten blocks of ten cells, one server's 100 workers, "WORKERS ON ONE SERVER" beside it
   ("ONE SERVER'S WORKERS" on its own line above it where that does not fit), then "**50 of 100 busy**: 1,000/s × 50 ms in
   flight (Little's law)."; when the CPU is the limit and the tier sheds, "**75 of 100 busy**: 1,500/s × 50 ms in flight;
   the CPU, not the pool, is full." (the meter in heat of 75 of 100); only when the workers are the limit and the tier
   sheds, "**100 of 100 busy**: 200/s × 500 ms. The 1,000/s sent to each would need 500 workers; its CPU sits 13.3%
   busy." with the meter in the critical tone; with nothing arriving, "**0 of 100 busy**: nothing reaches the app servers."
7. **The cache line** at the database's foot: "**Cache on:** 1.62 of 1.8 reads a request hit it; 0.18 reach the
   database." / "**Cache off:** all 1.8 reads a request reach the database."

No replicas draws a solid hairline track and "**None:** the primary takes every read." ("**None:** reads fail with the
primary." when the primary is lost); a tier with nothing left draws one hatched lost segment with a ×. Dashes mean
"hidden" and nothing else. The bottleneck's box (only while something is shed and no lane hides) takes a 1.5 px critical
border. Boxes are raised surfaces on the stage's dot grid; their texts carry a halo of the box's colour.

**Served.** The stream leaves the database onto a served bar (final green) on a track the axis's length, then
"SERVED **6,000/s** of 8,000/s · 2,000/s shed, 25%" (or "· nothing shed"), the served number in the house's 17 px mono
value role, the largest text on the stage; " of 8,000/s" never breaks after "of", and "·" opens the run after it.

**Ghosts.** After a change (a stepper press or a toggle; a reveal shows the setup's), each lane whose limit moved shows
its old end as a dotted tick in the text ink with a 4.5 px raised under-stroke, drawn above the fills; never while a
question asks. Its label "limit was 9,000/s" goes beside the tick in the lane's row, else in the strip (under the tick or
past the strip's groups), else into the block's status (load balancers, app servers) or conversion (database); never on
the header row. When the change is zone A's loss, zone A's lost group, hatched at its old place, ends exactly at the old
limit and is the ghost: no tick is drawn, and "limit was 15,000/s" follows the lost group in the strip. At a reveal the
ghosts are the setup's limits, so a change reads as a move ("from 4,000 to 21,053").

**Controls.** On the stage: Play, the traffic handle, and each tier's − / + (load balancers 1 to 6, app servers 1 to 21,
the database machine 4,000 or 8,000 queries a second, replicas 0 to 6); a key at its end is disabled and the fleet says
why ("the largest machine"). Outside the stage, in the house's place (`fieldset.group.conditions-control`), three native
checkboxes drawn as toggles, stretched to one height: "Cache reads · 90% hit", "Zone A down · one zone of three", "Slow
queries · 500 ms a request" ("500 ms" under a 420 px viewport). A checked toggle changes its fill, border and inset
shadow and shows a ✓ (`aria-hidden`, its space kept when unchecked), never its weight, so checking one moves nothing
(asserted: the stage's top is one value over all eight combinations at 320, 390 and 412 px). Then the polite notice.
Under the stage: the simplifications line (HTML, 11 px muted), then Describe.

**Layout.** At container wide the stage takes the left column (620 px at 1280) and the conditions, the notice, the open
question and the cards the 340 px right column (`_widget-layout.scss`). Narrower, one column: the conditions as the
stage's first rows (stage background), the stage, the simplifications line, the open question, Describe, the cards; the
notice is read out only (visually hidden, as `_widget-controls.scss` does), so its length never moves the stage.

**Heights** depend only on the stage's width: each box reserves the most any setting needs at that width (measured over
2,701 extreme and experiment settings at rest, with every lane hidden, and with a ghost of each of their one-change
neighbours, then held by the sweep to every setting), its slack at its foot. Measured in the mockup:

{{HEIGHTS}}

**Motion** (3.5's grammar; WAAPI on transform and opacity; pooled particles, at most 60 live).

- **The ramp (Play).** One monotone clock steps the traffic through its stops from 1,000 to the setting, one stop each
  360 ms (`--g-motion-layout`): the handle glides (240 ms), the stream's widths and the fills ease (240 ms), values swap
  and flash, never count up; a block below a status that grows a line glides with it (240 ms). A shed (its block, the red
  part of the stream and its landing ×) appears only at the stop where its tier's limit is passed, never before. **The
  climax** is the first stop where a tier sheds: a 400 ms landing ring, stroke only, around the gap's × above that tier
  (a stream mark in the gap, where no word sits; never on a lane or its shed block), with its box's critical border, then
  600 ms of dwell; with nothing shed, the ring sits in the gap above the busiest lane's end at the last stop. At the
  lowest stop there is nothing to step, so Play runs the stream's particles for 2.4 s at that rate. The play ends on the
  setting, at rest. Any change, or Stop, ends it at once.
- **Particles** fall through the gaps only, behind the boxes, at 60 px a second, spawned at a gap's top at a random
  position across the stream's width at a rate of one per 600 requests a second (one dot per 1,500 requests a second per
  24 px of stream); a dot in the part the next tier sheds is critical and turns into the × on the box's edge (240 ms
  fade). None crosses a box, so none crosses a word; no transit is under 240 ms.
- **An answer's play.** One rule for every question: the climax ring lands on the gap's × above the tier that first
  sheds, a stream mark that is already visible, never a hidden lane's end. E1 runs the ramp from 1,000 to 10,000 with the
  database's lanes hidden: the stream widens, sheds open where they happen, and at the 5,000 stop the ring lands on the
  × above the database and the clock dwells 600 ms there before it climbs on (the app servers shed from 7,000, after it).
  E2 to E5 apply the act (the toggle flips, the key presses and the count changes), the changed lanes cross-fade to their
  hidden form (160 ms), the stream re-flows (360 ms) and particles run for 2.4 s; the ring lands on the first new × (E4,
  E5); E2's red part closes and E3 changes no flow, so they end on their dwell. **At the reveal** the hidden lanes draw
  on: segments appear, fills grow from the setup's level to the new one (520 ms), the setup's limits stay as ghosts,
  numbers land (400 ms) and the focus outlines pulse with their "Look here" tags.
- **Where the page is, on a phone.** In the one-column layout the stage is taller than a phone's view, and the dock sits
  under it. Choosing an answer glides the page (instantly under reduced motion) so the play's anchor, with the stream gap
  above it, sits 8 px under the app's header: the load balancers' box for E1 and E4 (E1's ramp changes every lane it
  shows, and its ring lands above the database), the database's for E2 and E3, the app servers' for E5. The play and the
  reveal's draw-on happen there; at the reveal the page glides so its topmost focus region sits 8 px under the header,
  and once the reveal has landed (1.2 s) to the dock's reveal, whose last line, "See it on the picture", brings the focus
  region back. The mockup's `anchorFit` checks that the anchor box, the lanes the play changes that stay visible and the
  gap its ring lands in fit a 650 px view under a 56 px header, and every focus region at the reveal, at 252 and 322 px;
  `shoot.cjs` saves each of those phone views (`view-play1-390-dark.png` ...); the widget's e2e asserts the focus
  regions intersect the viewport during the play and at the reveal on the Android and WebKit iPhone projects.
- **Plays pause** by the widget host's visibility (IntersectionObserver on the host, plus `visibilitychange`), never one
  stage's.
- **Reduced motion:** nothing moves. Play draws the setting at rest with the gap's × above the first tier to shed ringed
  (the busiest lane's end when none sheds), and the notice reads the ramp's story; in the one-column layout, where the
  notice is read out only, the same story shows as a plain paragraph under the stage (not a live region, so it is heard
  once), and at wide widths, where the notice shows, it is not repeated. "Play stepped the traffic from 1,000 to 8,000
  requests a second. At 7,000, the app servers began to shed first; at 8,000, 6,000 a second are served and 2,000 shed."
  At the lowest stop: "Play ran 1,000 requests a second through the tiers. ..." No meaning lives only in motion.

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
the stage, the load balancers end exactly full at 10,000, and the answer needs the per-request cost, which the stage
does not compute for the learner while it asks (the database's conversion and step arrow hide). Reveal: "The database,
at 4,000/s: each request costs it 2 queries, so its 8,000 queries a second carry only 4,000 requests a second, fewer than
the app servers' 6,000/s or the load balancers' 10,000/s. Compare tiers by their limit in requests a second, never by
their raw size. At 10,000/s only 4,000/s are served: the app servers, full at 6,000/s, shed 4,000/s, and the database
sheds 2,000/s more. Cache the reads or add replicas first; the app servers come next, and the load balancers end exactly
100% busy." Hides `db` (asking and playing). Focus: the primary's block (its lane, its step arrow from 8,000 to 4,000,
"÷ 2 queries a request", and its conversion), the totals.

**E2 "Cache the reads".** Setup 10,000/s, 3 load balancers, 8 app servers, an 8,000-query primary, no replicas, no
cache (the database tops out at 4,000 and sheds 6,000); act `set: { cache: 1 }`. Ask: "The database tops out at 4,000/s.
Each request makes 1.8 reads and 0.2 writes, 2 queries in all, against its 8,000 queries a second. Put a cache in front of
the reads, and 90% of them hit it. How many requests a second can the database take now?" Choices (ascending, one shape):
"About 8,000/s: twice as many" / **"About 21,000/s: 5× as many"** / "40,000/s: 10× as many, like the hit rate". Reveal:
"21,053/s, 5.3× as many: the cache answers 1.62 of each request's 1.8 reads, so only 0.18 reads and the 0.2 writes reach
the database, 0.38 queries a request instead of 2. Its 8,000 queries a second now serve 21,053/s, not the 40,000/s a 90%
hit rate suggests: writes never hit a cache. All 10,000/s are served now, and the app servers, 83.3% busy, are the
busiest tier." Hides `after` (playing). Focus: the primary's block (its ghost at 4,000, its lane to 21,053 and the step
arrow from 8,000 to it, "÷ 0.38 a request").

**E3 "Two more replicas".** Setup 20,000/s, 6 load balancers, 20 app servers, an 8,000-query primary, 2 replicas, the
cache; act `set: { replicas: 4 }`. Ask: "At 20,000/s, the database takes 4,000 writes a second and, after the cache,
3,600 reads. The 2 read replicas share the reads, each 72.5% busy. Add 2 more. How busy is each replica now?" Choices:
**"About 61%: a little less"** / "About 36%: half as busy" / "72.5%: unchanged, each holds every row". While it asks, the
`replay` region hides what a replica does beyond its reads: its fills take a neutral dotted pattern (a solid fill would
claim it replays nothing) and its conversion reads "Each takes 0.09 reads a request; what else each does shows after
your answer." The ask alone lets a sharp learner deduce the replay (72.5% of 8,000 is 5,800 queries a second, more than
the 1,800 reads); the stage no longer states it. Reveal: "61.3%: every replica replays every write, 4,000 a second, which
takes 50% of its 8,000 queries a second however many replicas share the reads. Only the 3,600 reads a second split:
1,800 each with 2 replicas, 900 with 4. Twice the replicas raise their limit from 27,586/s to 32,653/s, 18.4% more, and
no number of them passes 40,000/s, where replaying the writes alone fills a replica. Replicas scale reads, not writes."
The reveal draws the hatch on; the ghost at 27,586 and the lane's end at 32,653 both sit on the axis, short of the
primary's lane at 40,000. Hides `after` and `replay`. Focus: the replicas.

**E4 "Lose a zone".** Setup 10,000/s, 3 load balancers, 9 app servers, an 8,000-query primary, 3 replicas, the cache
(the busiest tier 74.1%); act `set: { zone: 1 }`. Ask: "The load balancers and app servers are spread evenly over zones
A, B and C, and no tier runs above 74.1%; all 10,000/s are served. Zone A fails with every instance in it, and a replica
takes over from the primary. How many requests a second are shed?" Choices: "None: every tier has 25.9% to spare" /
"About 3,300/s: a third, the zone's share" / **"1,000/s: a tenth"**. While it asks, the `zones` region hides the zone
groups and the "if zone A fails" ticks (they would draw the answer). Reveal: "1,000/s, a tenth: the 6 app servers left
can take 9,000/s, so the 74.1% they ran at becomes 111.1% of what they can serve. Losing one zone of three multiplies the
load on what is left by 1.5× when a tier is spread evenly, so size every tier so that what survives the largest zone
still carries the peak. The load balancers end exactly 100% busy, with nothing to spare. The database loses its primary
and a replica yet keeps room: a replica became the primary (writes fail for the seconds that takes), and the one left
runs at 42.8%." The reveal draws zone A's groups hatched at their old places under the load balancers, the app servers
and the replicas, each ending at its tier's old limit and labelled "limit was 15,000/s", "limit was 13,500/s" and "limit
was 30,769/s". Hides `after` and `zones`. Focus: the app servers, the load
balancers.

**E5 "A slow database".** Setup 6,000/s, 2 load balancers, 6 app servers, an 8,000-query primary, 2 replicas, the cache;
act `set: { slow: 1 }`. Ask: "Each app server has 100 workers, and a request holds one for its whole 50 ms: at 6,000/s,
50 of each server's 100 are busy. Lock waits on a hot row make every request take 500 ms, though the database does no
more work. How many requests a second are served?" Choices: **"1,200/s: a fifth"** / "6,000/s: all of them, each one
slower" / "600/s: a tenth, like the slowdown". Reveal: "1,200/s, a fifth: requests in flight equal throughput times time
(Little's law). Each server's 100 workers hold at most 100 requests at once, and at 500 ms each that is 200/s; 6 servers
serve 1,200/s. The other 4,800/s are shed at the app servers while their CPUs sit 13.3% busy: waiting on the database
used up the workers in front of it. An autoscaler watching CPU sees 13.3% and adds nothing: scale and load-test on pool
saturation and latency. Serving 6,000/s at 500 ms needs 3,000 requests in flight. Set timeouts, fix the lock contention,
and shed load early rather than only growing the pool." Hides `after` (the app lane, its fleet's per-server figure, so
the fleet reads "6 up", and the worker pool; the database's lanes, whose load the act changes). Focus: the app servers'
box, pool included.

**E6 Challenge "16,000/s with a zone to spare".** Setup 16,000/s, 2 load balancers, 8 app servers, a 4,000-query primary,
no replicas, no cache. Ask: "Serve 16,000/s with every tier keeping at least 30% headroom, nothing shed when zone A fails,
and at most 29 machines in all; a cache runs a node in each of the 3 zones." Goal `all`: `shed` below 1, `headroom` at
least 30, `zoneShed` below 1, `machines` below 30; keep `traffic` 16,000, `zone` 0, `slow` 0. Machines count the cache as
three nodes. Of 3,528 settings (6 × 21 × 2 × 7 × 2) exactly one passes: 6 load balancers, 17 app servers, the 8,000-query
primary, 2 replicas and the cache, 29 machines; every lever is needed (5 load balancers or 16 app servers shed after the
zone loss, the smaller machine runs its writes at 80%, one replica runs at 76%, no replica loses every write with the
zone, no cache needs 12 replicas). The stage shows the zone criterion while the learner works: every lane's zone groups
and its "if zone A fails" tick, so whether the stream passes the tick is in view. The status is the house checklist (no
line over it until met), "Goal met:" while the goal holds and "You met it; now:" once the learner moves off it, each line
with its state in words: "served: all 16,000/s: met" / "headroom: the busiest tier 62.7% busy leaves 37.3%, at least 30%:
met" ("headroom: the busiest tier is full, so none: not yet" while a tier sheds) / "zone A lost: nothing shed: met" (else
every tier that sheds with its own amount: "zone A lost: 11,000/s shed at the load balancers and 5,000/s at the app
servers: not yet", or with one tier "zone A lost: it held 6 of 16 app servers; the 10 left shed 1,000/s: not yet", or
"the primary falls with it, and no replica takes over: not yet") / "machines: 29, the cache's 3 nodes among them, at most
29: met". With a kept setting off: "The goal keeps every zone up and the database fast; it tries losing zone A for you."
Reveal: "The fleet that fits: 6 load balancers, 17 app servers, a primary of 8,000 queries/s, 2 replicas and the cache's 3
nodes, 29 machines; the busiest tier runs at 62.7%. Zone A holds 2 of the load balancers and 6 of the app servers, so
losing it leaves 4 load balancers 80% busy and 11 app servers 97% busy, while one replica takes over as primary and the
other carries every read at 76%. With 16 app servers zone A would hold 6, and the 10 left would shed 1,000/s; with no
replica the primary would fall with its zone and every write with it." Describe waits until the goal is met. Opening
it, the notice says the setting's sentence.

**One `hiding()` map** (prevention 1) from a question's regions to every surface; each region is named in the spec's own
`hide` list:

| Region   | When                          | On the stage                                                                                                                                                                                                 | Elsewhere                                                  |
| -------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------- |
| `db`     | asking and playing (E1)       | the primary's and replicas' lanes drawn empty and dashed ("after your answer"), no segment, fill, notch, shed block, comb tooth, ghost or zone tick; their statuses "?% busy · after your answer"; their conversions "8,000 queries/s; what that carries in requests shows after your answer."; no step arrow; no bottleneck border | the summary ("Of 1,000 requests a second offered, what each tier takes shows after your answer."), the tier lines, Describe |
| `after`  | playing (E2 to E5)            | the same, for the lanes the act changes (computed: limit, load, instances up or shed differ), the pool when it changes; a hidden load balancer or app tier's fleet shows its count alone ("6 up") | as `db`                                                    |
| totals   | playing, when the act changes what is served or shed (E1, E2, E4, E5) | "SERVED ? of 10,000/s · shed after your answer"; the served bar stays, as the stream's end                                                    | the summary                                                |
| `replay` | asking (E3)                   | the replicas' fills in a neutral dotted pattern, no writes hatch; their conversion "Each takes 0.09 reads a request; what else each does shows after your answer." | none                                                       |
| `zones`  | asking (E4)                   | no zone groups, letters or lost hatching, no "if zone A fails" tick                                                                                                                                         | none                                                       |
| ghost    | asking (every question)       | no ghost tick or "limit was" label                                                                                                                                                                             | none                                                       |

The "if zone A fails" ticks show only at rest and in the challenge. The fleets, the per-request costs the ask states, the
cache line and the traffic are the question's premise and stay. Hiding holds through the answer's own play and releases
at the reveal; the stream is the mechanism the play shows, as the sample is in Latency & Queueing.

## 4. Accessibility

- The stage is `role="group"`, `aria-roledescription="visualization"`, named "Capacity: requests flowing through load
  balancers, app servers and a database"; its SVG has a summary that obeys `hiding()`: "Of 8,000 requests a second,
  6,000 are served and 2,000 shed. The app servers are the bottleneck, full at 6,000 a second. The load balancers are at
  80%; the database primary is at 15%; the read replicas are at 82.5% each." With nothing shed: "All 16,000 requests a
  second are served. The app servers are the busiest, at 62.7%. ..."; ties name every tied tier ("The load balancers and
  the app servers are the busiest, at 66.7%."); one replica is "the read replica is at 76%"; a tier no load reaches
  "receives nothing"; with nothing served, "none are served".
- **What the steppers set, for a screen reader.** Each tier has a visually hidden line in the stage group, obeying
  `hiding()`, that its − and + point to with `aria-describedby`: "Load balancers: 2, each 5,000 a second; limit 10,000 a
  second.", "App servers: 4, each 1,500 a second; limit 6,000 a second." ("each 200 a second, as its workers allow" when
  they bind; "6; their limit shows after your answer." while hidden), "Database machine: 8,000 queries a second, the
  largest; limit 40,000 requests a second.", "Read replicas: 2, each 8,000 queries a second; limit 7,273 requests a
  second." ("2, 1 left after zone A"; "none"). After a stepper or toggle change the notice opens with what changed, then
  the setting's sentence: "App servers: now 9. Of 16,000 requests a second, ..." (no numeral opens a sentence).
- Play is a button ("Ramp the traffic up to its setting"; "Stop the ramp"; "Ramp the traffic, after your answer" while
  a question waits, disabled). The traffic is a `g-handle` slider, "Traffic, requests a second", `aria-valuetext` "8,000
  requests a second"; arrows step a stop, Page keys three, Home and End. The steppers are buttons named for what they do
  ("Fewer app servers", "More app servers", "A smaller database machine", "A bigger database machine", "Fewer read
  replicas", "More read replicas"), disabled at their ends. The conditions are native checkboxes; the dock is
  `app-experiment-dock` with `goalChecks`, whose lines carry ": met" / ": not yet" in words (the ✓ and · are
  `aria-hidden`). Tab order follows the drawing: Play, traffic, each tier's − and +, the conditions, Describe.
- Notices (polite, `aria-atomic`, through `g-code-text`): after a change, what changed and the setting's sentence; after
  a play, the ramp's story; while a question asks, the wait sentence; after a reveal and when the challenge opens, the
  setting's sentence. Never blank. Reduced motion's caption is a plain paragraph, so the story is announced once.
- Colour is never alone: full is critical and the word "Full" and a shed block with ×; heat has the fill's length, the
  70% notch and the % in words; writes are hatched and named; shed has × and words; hidden lanes are dashed and say
  "after your answer"; lost instances are hatched, lettered and leave the fleet ("4 of 6 up"); the bottleneck's border is
  backed by "the bottleneck" in its status; a checked condition shows a ✓. Tokens are the app's `--g-viz-*` and heat
  roles (checked by `theme-contrast.spec.ts`, which gains the lane cap's `--g-stroke` against `--g-raised` at 3:1); small
  text uses ink tokens that pass 4.5:1.
- 44 px targets: Play, the handle (its hit box apart from Play's and the ticks' at every stop), every − and +.
- **Describe** (a `g-data-table` in a `minmax(0, 1fr)` grid, scrolling inside its own box): the summary sentence, then a
  row per tier and one for the whole path. Columns: Tier, Up ("4 of 6" with zone A down), Limit, Arriving, Busy ("full"
  where a tier sheds, "idle" where nothing reaches it), Shed ("none"); the path row gives the machines, the smallest
  limit, the traffic and the total shed. Under a 560 px stage it is `compact`, five columns: the count joins the tier's
  cell ("LBs 2", "App 4 of 6", "Primary 1*", "Replicas 1 of 3"), heads carry the unit ("Limit/s", "In/s", "Shed/s"),
  cells are bare numbers, and a note says "29 machines in all, the cache's 3 nodes among them." and "1*: a replica
  promoted to primary."; it fits without scrolling at 320, 390 and 412 px (asserted), and the full form at 1280 and 1440.

## 5. The prevention list

1. **Giveaways while asking, on every surface.** One `hiding()` map (3) feeds the stage, the summary, the tier lines, the
   notices, the handle and steppers, and Describe; Play, the handle, every stepper and the conditions wait, so no play the
   learner starts can show an answer; the answer's play keeps the hiding until the reveal; a card's setup starts afresh
   (no ghost carries an earlier setting in). The mockup's `noAnswer()` (run by `shoot.cjs`) renders every question asking,
   entered from every act's target and the challenge's solution, and its answer's play at five moments, at six widths
   ({{NOANSWER}} renders), against each question's answer words and patterns (E1: "bottleneck", "÷ 2", "= 4,000
   requests", "limit 4,000 requests", "Served 4,000", "4,000 requests a second"; E2: "21,053/s", "21,000/s", "5.3×",
   "0.38", "21,053"; E3: "61.3%", "61%", "32,653", "900", "replay"; E4: "1,000/s shed", "9,000/s", "111.1%", "Full",
   "bottleneck"; E5: "1,200/s", "200/s", "13.3%", "4,800/s", "workers bind", "Full", "would need"), the false claims (2),
   and structure: Play and the handle disabled and every stepper disabled; in every hidden lane no fill, notch, writes
   hatch, dotted split, shed block, comb tooth, lost hatching, zone tick or ghost, a status with no number but its "?",
   a conversion with no "÷" or "=", no step arrow, and a hidden load balancer or app tier's fleet with no "×"; the pool
   with no filled cell; the totals "?"; no bottleneck border while lanes hide; a climax ring only on a gap's ×; no ghost
   while asking; no replay while E3 asks; no zones while E4 asks; no "if zone A fails" tick during a question. It finds
   none, and it catches six planted leaks (E1 asked with nothing hidden; E2 played without `after`; E3 asked with a ghost
   of four replicas; E5 played with the pool left out of the hidden lanes; E5 played with the app fleet's per-server
   figure shown; E3 asked with the replicas' replay shown). The built component's sweep does the same with motion off and
   on, sampling the play frame by frame.
2. **False claims anywhere.** No hidden value has a default: hidden reads "?" or "after your answer", never 0 and never
   "nothing shed", and a hidden tier's per-instance figure is left out rather than replaced. A tier no load reaches says
   "Idle · nothing reaches it" and "receives nothing", not "0% busy" or "at 0%"; nothing past its limit is called busy
   ("Full", Describe's "full"); a lost tier says "None left"; a lost primary takes no reads ("None: reads fail with the
   primary."). The false-claim rules (NaN, undefined, Infinity, "0% busy", "at 0%", any busy over 100%, a number past 999
   without its separator, "1 load balancers", "a 8,000", "0 are served", "leaves 0%", "a third lost" or "half lost", "from
   1,000 to 1,000") run over every stage of the settings sweep ({{SWEEP}} renders: a stride of every setting at 12 widths,
   at rest, mid-ramp, with a one-change ghost and under reduced motion), over the whole widget's HTML of every state
   (toggles and their hints, notice, stage, its hidden tier lines, caption, Describe, dock), and over every page sentence
   of a third of all settings (summary, ramp story, tier lines, statuses, Describe both ways, goal checks); none. On the
   stage, a number of 1,000 or more stands with its unit (never "2 × 8,000"). Every sentence is computed for its setting:
   "each" and the plural only with two or more replicas up, "is" for the primary and for one replica, every tied tier
   named, "a promoted replica" only when one was, "No tier shed" never beside a full one, the lowest stop's story "ran"
   rather than "stepped from 1,000 to 1,000", Describe's Busy "full" where a tier sheds, and the zone line naming each
   tier that sheds with its own amount, the amounts summing to the zone loss's shed. Layout spec assertions: every lane's
   drawn end is its limit; it draws one segment per instance up, each fill its segment's width times the utilization
   (within 0.5 px); zone A's group starts at the limit that survives zone A; a lost group draws exactly the instances
   zone A held; every fleet's per-instance figure is the model's at the drawn setting; the pool is critical only with 100
   workers in flight and the workers the limit; every shed block ends where the stream above it does; the served bar is
   what is served; Little's law multiplies out as printed; every ghost has its label; text in a box stacks with no hole
   over two lines; and each box's content fits its reserve. Particles are never counted in words. **Each new rule is
   proven by a planted fault it must report** (`plantedFaults()`): a lane missing an instance, fills at 80% of their
   share, a critical pool while the CPU binds, a lost primary taking reads (stage and words), the slow app fleet's CPU
   figure, a unitless replicas fleet, a dashed lane for no replicas, a ring on a lane's end, a ghost with no label,
   "each" with one replica, "at 0%", Describe's "100%" for a shedding tier, "from 1,000 to 1,000", the zone loss's whole
   shed given to one tier, a tie naming one tier, "No tier filled" at 100%, and the static "a third lost" toggle hint.
3. **`$index` tracking.** Instances, comb teeth and particles carry stable ids (an instance by tier, zone and index in
   the zone, `zoneLane`'s id; a particle's pool slot), so a zone loss removes zone A's group and keeps every survivor's
   place, and a stepper adds or removes one instance in its zone; particles keep their id from spawn to exit.
4. **Labels on lines; markers; rings.** Every stage text sits on its box's colour or the stage's (a halo); gridlines run
   only through lanes, behind segments, and break around a word in the track; the stream's path holds no word (checked:
   "text in the stream's path"); a lane's limit label sits at its end or not at all (beside a ghost it would read as the
   old limit's); a ghost's label is placed only where it crosses no gridline, lane, tick or text; the climax ring is stroke
   only, around the gap's ×, and covers no segment or shed block (asserted); × glyphs carry a ground disc; dashes mean
   hidden and nothing else (asserted). The checker flags text on text, a line through text (gridlines, ticks, caps,
   arrows, the divider, zone underlines), text on a mark, text under a control, dots on dots, anything off the stage, axis
   labels closer than 6 px, text within 6 px of a focus outline's stroke, focus outlines closer than 8 px, and any label
   or tag with no place: zero over every screenshot and every sweep render.
5. **Look-here tags.** Focus outlines sit 4 px outside a box's border (so a bottleneck's border and its outline are one
   shape, offset), or inside the database box for one of its blocks; regions in one box are one outline with one tag
   (E5's focus is the app servers' box, pool included). House candidates on the outline's edge first (16 px off its
   corners), then just inside, two inner rows, at the outline's own right edge and the stage's, outside last; the stream
   and hit boxes are obstacles. Every reveal at 12 widths has a placed tag and a labelled ghost for every limit its act
   moved (the sweep asserts both).
6. **Marks before their event.** The ramp has one monotone clock; a shed's block, red stream part and × appear at the stop
   where its tier's limit is passed; the climax ring lands with it; particles become × only on reaching the box's edge;
   at the reveal fills grow from the setup's level, so nothing appears before the change that causes it.
7. **Visibility and reduced motion.** Plays pause on the widget host's visibility and the page's; Reduced motion draws the
   rest state, which holds every number, and Play rings the first tier to shed and has the notice read the ramp's story.
8. **CSS specificity.** Every `fieldset.group` carries zero padding; a control's class only adds to it
   (`fieldset.group.conditions-control`); the 320 px shots show the conditions above the stage with no overlap. A checked
   toggle never changes its font weight (the stage's top is asserted equal over all eight condition settings).
9. **Words.** The summary, notices and ramp story are full sentences; no sentence opens on a numeral ("Of 8,000 requests a
   second, 6,000 are served", checked over every sentence); plurals and "each" by count; thousands separators everywhere
   (checked); no sentence spliced from pills. The challenge's status is the checklist with its states in words, "Goal
   met:" only while the goal holds; the notice is never blank. Stage text wraps keeping a number with its unit, "of"
   with what follows, an operator with its operand, and "·" with the run after it, and never leaves one word alone on a
   last line.
10. **Describe's width.** `minmax(0, 1fr)`, the table in its own scrolling box, compact (five columns) under a 560 px
    stage, so it fits at 320, 390 and 412 px with no scrolling (asserted) and at 1280 and 1440 px; e2e checks no sideways
    page scroll at all four.
11. **Touch hints.** No mark on the stage is tappable: its controls are Play, the handle and the steppers, all real
    controls, so there is no hint to clear.
12. **Placeholder heights.** The stage height is a function of width (2); `widget-heights.ts` gets the built widget's whole
    heights at 320, 360, 375, 390, 412 and 430 px and on a sweep from 300 to 1,300, failing on a drift over 3 px.
13. **Text measurement.** The mockup measures with canvas from the fonts the app ships; the build measures through
    `stage-text.ts` (`fontMeasure` with this widget's roles: label 11 px caps, caption 13 px, its bold, small 11 px and the
    17 px mono value), the one text measurement module. Stage text never uses tabular digits, so measurement matches
    rendering; the HTML tables and the dock keep `tabular-nums`.
14. **Learner text in HTML** (the notices, the ramp caption, the tier lines, the simplifications line, Describe's
    sentence, the dock's question, choices, checks and reveal) renders through `g-code-text`, so no line parts a number
    from its unit ("500 ms"); every live region holding it is `aria-atomic` (templates.spec enforces it). Stage text is
    laid by `stage-text.ts`'s `wrap`, which keeps the same glue as the mockup's `flow` (9).
15. **Element counts** are bounded by the stage, never by data: at most 6 + 21 + 1 + 6 instance segments and as many comb
    teeth, notches and lost segments, one strand path per gap, at most 60 pooled particles, ten pool blocks; the whole SVG
    stays under 500 elements at the heaviest setting (21 app servers, 6 replicas, every shed, zone A down). Keydown to
    the second frame stays under 150 ms on a Pixel 7 at 4× CPU (a change recomputes one `capacityRun` and its zone run,
    microseconds, and redraws one stage), and a ramp holds 60 fps there (transforms and opacity only).
16. **Specs and e2e** read the widget's state only after zoneless Angular has drawn it (web-first assertions, or wait for
    the setting's summary first); the widget's e2e runs on the desktop, Android and WebKit iPhone projects, and on the
    phone projects asserts the focus regions are in view during each answer's play and at its reveal.

## 6. What a learner can say in an interview afterwards

- "First I turn traffic into load per tier: requests times what one request costs there. A database sees queries, not
  requests: at 2 queries a request, 8,000 queries a second is only 4,000 requests a second."
- "Throughput is the smallest limit in that list. Adding capacity anywhere else changes nothing; raising the bottleneck
  moves the limit to the next tier, so I list every tier's limit and the order in which they fill."
- "At 10× the traffic the busiest tier today breaks first, often the database. My order there: cache the reads, add read
  replicas, scale the primary up, then cut or shard the writes; then scale the stateless app servers out and check the
  load balancers, which teams forget."
- "A 90% cache hit rate does not buy 10×: writes never hit a cache, so 2 queries a request become 0.38, about 5×. And if
  the cache is lost or cold, every read comes back: plan for the database to survive that, or warm it first."
- "Replicas scale reads, not writes. Every replica replays every write, so with heavy writes each new replica buys less,
  and no number of them passes the write ceiling of one primary. Beyond the largest machine, writes need sharding."
- "I size for peak at 60 to 70% and check the loss of the largest failure domain: with three zones spread evenly the two
  left carry 1.5×, so what survives the largest zone must still carry the peak; with uneven counts the largest zone holds
  more. A lone primary needs a replica in another zone to take over, and writes fail while it is promoted."
- "Little's law sizes pools: in flight equals throughput times latency. 100 workers at 500 ms serve 200 a second, so a
  slow dependency, say lock waits on a hot row, exhausts the pools in front of it while their CPUs idle; I'd add
  timeouts, bulkheads and load shedding, and autoscale and load-test on pool saturation and latency, not CPU."
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
- **Peak plus headroom** keeps its mechanism (E4 asks for a number it does not state) and gains one sentence: "When the
  primary's zone fails, a replica is promoted, and writes fail until the promotion finishes, seconds to minutes."
- **A new pitfall**, "Counting on the cache to be there": "A cache that is lost or starts cold sends every read back to
  the database: at 2 queries a request instead of 0.38, the same database carries about a fifth of the requests. Run the
  cache in every zone, warm it before a launch, and know what the database can carry without it."
- **Pools and in-flight work** keeps its mechanism (E5 asks for a number it does not state). The first worked example's
  constants (1,500 a second per app server, 4,000 queries a second per database machine, 2 queries a request at 90%
  reads, a 90% cache) are the widget's, so its steps can be replayed on the stage; its numbers stay as they are (checked
  against the model: 2,000, 0.38, 10,500, 7,600, 50%, 1,600 and 3 replicas).
- Nothing else changes: the other worked examples, the pitfalls and the follow-ups agree with the model.

## Notes for the builder

- The mockup's geometry is the spec: the block order (lane at the block's top, strip, header, status, conversion), the
  packing with the slack at each box's foot, the 44 px header with the steppers, the comb, the stream's gaps and strands,
  the lane row's label order (shed, limit, ghost) and the ghost's row, strip and status fallbacks, the reserves per width,
  the ghost and tag candidates. `capacity-layout.ts` (a pure `buildStage(width, run, view)` returning marks, as
  `latency-layout.ts` does, with `laneInfo` and `planStage` as its planning steps), `capacity-words.ts` (`hiding()`,
  fleets, statuses, conversions, the pool line, totals, summary, tier lines, notices with their change line, the ramp
  story, Describe, goal checks and the zone line), `capacity-motion.ts` (the ramp's clock and stops, the dwell, the
  particles' spawn and exits, the climax, the phone anchors), the component and its spec, and `capacity-layout.spec.ts`
  over a stride of every setting at 12 widths from 248 to 700 px with ramp frames, one-change ghosts and reduced motion,
  every experiment asking, playing and revealed, and the assertions in 5, each with its planted fault.
- `content.md` (every string of the built widget, both checklist states included) is generated by a browser walk of the
  built widget, as for the other three, and goes to content review with the experiments.
