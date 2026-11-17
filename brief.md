# Reliability widget (`availability`): design brief

Redesign R41, the batch's fifth widget (REDESIGN.md 5.2: the R41 to R45 entry, "Reliability: `availability`, as a
reliability block diagram", its "Forms" bullet, and the Data Modeling, Consistency & Quorums and Latency & Queueing notes;
LOOP.md rows 122 to 124 are the house references). Lesson: `/design/topics/sd-reliability`. Files beside this brief, on
the orphan branch `design/r41-reliability`:

| File          | What it is                                                                                                                                                                                                                                                                                                                                                          |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `model.js`    | The exact model (series, parallel, shared failures, failover), the seeded simulated year with its rest moment and play plans, and the six experiments as slot templates; ported to `libs/engine/src/sysdesign/lessons/widgets/reliability.ts`, `reliability-sample.ts` and `reliability-experiments.ts`                                                             |
| `enum.cjs`    | Prints every experiment number, proves the challenge has exactly one passing setting of 162, checks the model against first principles (state enumeration, inclusion and exclusion) and against a discrete-event simulation of failures and repairs (every part configuration over 300,000 years, whole chains over 100,000), checks the reveals' word claims and every format, and holds the year's seed to its hard bounds (282,878 checks) |
| `mockup.html` | The mockup with the app's tokens and fonts, live (steppers, toggles, Play, cards and choices work): `?state=default\|series\|pairs\|shared\|failover\|real\|triples\|optional\|playing\|hold\|describe\|reduced\|ask&exp=1..5\|reveal&exp=1..5\|challenge&theme=light\|dark`; `ask` also takes `&phase=playing` (the answer's play, hiding held, `&frac=` its moment), `challenge` takes `&start=1`, and `&motion=off` plays as Reduced motion does |
| `shoot.cjs`   | Screenshots every state at 1280, 390 and 320 px in both themes with the page's collision report and layout assertions, then sweeps every setting at 12 widths (at rest, through a free play, with ghosts), every experiment asking, playing and revealed, the no-answer sweep with six planted leaks, every page sentence of every setting, and the stage heights          |
| `changes.md`  | What the mockup's own rounds found, the critique of the first complete design and what changed for each item                                                                                                                                                                                                                                                        |

## 1. The verdict, and the mechanism

**Today's widget against the bar.** Three bordered boxes, each with a select (99%, 99.9%, 99.95%, 99.99%) and a − / +
pair, over two tiles (99.950%, 4.4 h) and a caveat in muted text. It is the product formula with a form on top: nothing
is a request, nothing is a chain, nothing ever fails. A learner can read "99.950%" and still not be able to say why the
database is the part to fix, why a second copy is worth three nines on paper, or why a real pair never delivers them,
which is the interview question. Its one honest sentence, that the model assumes independence and instant failover, is
exactly the part an interviewer probes, and the widget cannot show it. It is far below the bar. Nothing of it is kept
but the idea of parts with copies.

**What the learner must see.** A request crosses a chain of parts and needs every one of them. Each part is a set of
copies, any one of which can carry it. Over a year each copy is down now and then; a part with one copy is down whenever
that copy is; a part with copies is down only while all of them are, which by chance almost never happens; and the
request fails whenever any part it needs is down, so its row of failures is the union of its parts' rows. Then the two
ways redundancy underdelivers: an outage whose cause the copies share takes them all at once and passes straight
through, and a failover that takes time lets through the first minutes of every outage of the copy in use. And the
currency: nines against downtime a year, with the weakest part capping the chain.

**What the widget draws, what experiments test, and what stays text** (as a senior interviewer would weigh them):

| Idea                                                               | Weight | Where                                                                                                                                             |
| ------------------------------------------------------------------ | ------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Series: every part needed, availabilities multiply, downtime adds  | core   | The chain; the request's row as the union of the parts' strips; the request's bar; E1                                                             |
| Parallel: down only with all copies, unavailabilities multiply     | core   | Copies as parallel boxes and as rows; a copy's tick with nothing under it; each copy one 3-nine segment of its part's bar; E2                     |
| The weakest link caps the chain (the single point of failure)      | core   | The cap line from the weakest part's end to the request's row; E3; the challenge                                                                  |
| Nines against downtime a year (and a 30 day window)                | core   | The nines scale: availability over, downtime a year under; the headline                                                                           |
| Correlated failures (a zone, a deploy, a shared dependency)        | core   | Shared failures: ticks in one column in every copy's row, the part's strip and the request's row; the bar's solid length against its paper length; E4 |
| Failover is not instant (detection plus switch on every failure)   | core   | Failover 5 min: a short mark in the strip and the request's row under each outage of the copy in use; the band's stop bar, then the path through the next copy; E5 |
| MTBF / (MTBF + MTTR): faster recovery buys nines                   | high   | A tick is a failure, its height the time to recover (1 h tall, 5 min short); "8.76 outages a year × 1 h each" under the stage; E5's reveal        |
| Hard against soft dependencies (graceful degradation)              | high   | Recs optional: a bypass wire in parallel with the part, its outages drawn hollow and never reaching the request; the challenge                     |
| SLOs and error budgets                                             | medium | "Down in 30 days" in the headline (a 99.9% request reads 43 min, the lesson's 43.2); the challenge's target; otherwise lesson text and Observability's `error-budget` widget |
| Blast radius, cells, staged rollouts                               | medium | E4's reveal names them as the fix; lesson text                                                                                                    |
| Capacity under redundancy (two servers at 70% are not redundant)   | medium | Stated under the stage ("one copy can carry the full load"); Latency & Queueing's E5 teaches it                                                   |
| Fencing, split brain, retries, circuit breakers                    | low    | Lesson text only                                                                                                                                  |

**The world.** Four parts in a row: Load balancer, App servers, Database, Recommendations (short names LB, App, DB,
Recs). Every copy of every part is the same: down 1 h for every 999 h up, 99.9% available, 8.76 outages a year of
exactly 1 h (MTBF 999 h, MTTR 1 h). One level everywhere is deliberate: the nines arithmetic can then be done in the
head (one copy 3 nines, two 6, three 9; k single parts k × 8.8 h), and the weakest link is what an interviewer calls
it, the part with the fewest copies.

**Settings** (numbers, as `ExperimentSettings` requires): `lb`, `app`, `db`, `recs` (copies, 1 to 3), `optional` (0 or
1: recommendations are optional, the page renders without them), `shared` (0 or 1: 1 in 10 of a copy's outages has a
cause every copy of its part shares), `failover` (0 or 1: traffic takes 5 min to move off the copy in use when it dies).
648 settings. The free-play default is 2, 3, 1, 1 with every condition off: 99.8%, 17.5 h a year, the database and
recommendations the weakest links.

**Formulas** (all in `model.js`, ported 1:1; u = 0.001, r = 1 h, β = 0.1, t = 5 min, a year 8,760 h, a month 720 h):

- One copy: unavailability u.
- A part of n ≥ 2 copies: the shared cause is down u_s = β u of the time when `shared` is on (else 0); a copy's own
  cause is down u_o = 1 − (1 − u) / (1 − u_s), so that each copy is still exactly 99.9%: (1 − u_o)(1 − u_s) = 1 − u.
  All copies down on their own causes at once: u_o^n. Failover: each own outage of the copy in use (the first copy
  that is up) costs t while another copy is up, one every r / u_o hours: f = (t u_o / r)(1 − u_o^(n−1)) when `failover`
  is on. The part is up with probability (1 − u_s)(1 − u_o^n − f); its downtime splits exactly into shared u_s,
  failover (1 − u_s) f and "all down by chance" (1 − u_s) u_o^n.
- The paper value of a part is u^n (what the arithmetic promises: independent failures, instant failover).
- An optional part leaves the chain. The request: 1 − Π(1 − u_part) over the parts it needs (computed with `log1p` and
  `expm1` so 1e−9 survives); parts fail independently of each other.
- Downtime a year u × 8,760 h, in 30 days u × 720 h, nines −log10(u). The weakest link is the needed part with the
  largest u (ties are all named). Failures of the request a year: 8.76 a single part, and for a set of copies 0.876
  shared outages (when on) + its failovers (when on, 8.76 or 7.88 a year) + n (8,760 u_o / r) u_o^(n−1) chance overlaps
  (0.0175 a year for a pair: one in 57 years).
- Failover's one simplification: for 3 copies the formula leaves out a backup that dies while it serves (2 s a year);
  the simulation includes it and cannot tell the two apart. For 2 copies the formula is exact for the simulated process.

**Checks** (`node enum.cjs`, 282,878 pass): a copy is MTBF / (MTBF + MTTR); the parallel rule by enumerating the 2^n
states of independent copies; each copy adds 3 nines; the causes add up to the part at all 12 configurations; a single
copy is 99.9% whatever the conditions; shared failures cap a part at 4 nines; more copies never hurt; the series rule by
inclusion and exclusion at all 648 settings, never better than the weakest part and never worse than the sum. A
discrete-event simulation of one part (each copy up for an exponential time, down exactly 1 h; the shared cause the
same; the request on the first copy that is up, 5 min to switch when it dies, failback at once) for all 9 configurations
over 300,000 years: total, shared, failover and chance-overlap shares and the failures a year agree within 2% (8% for a
pair's 5,000 overlaps, an absolute floor for three copies' 8). The same process at 5% copies, where all copies down
together is frequent: u_o^n within 3% for 2 and 3 copies, with and without shared failures. Whole chains at the eleven
experiment settings over 100,000 years, and the union of four single parts measured interval by interval (35 h, just
under their sum). Every reveal's word claim ("almost never coincide", "unchanged", "0.1% of 0.1%", "about 100×",
"however many copies", "about 26 times", "once in 19 years"), every downtime and availability any setting prints (a
unit always, never a bare 0, never 100%), the causes as printed to the minute, and the nines ladder 36.5 d, 3.65 d,
8.8 h, 53 min, 5.3 min, 32 s, 3.2 s, 0.32 s, 0.03 s.

**The simulated year** (what the upper half of the stage draws). 52 weeks; an outage is an hour in one week, drawn as a
tick in that week's column. Common random numbers: every copy slot draws its own outages once (Poisson 7.88 "own" and
0.88 "extra"), and a setting only chooses which show, so adding a copy adds a row and changes nothing else. With shared
failures on, a part's first copy's "extra" outages become the part's shared outages and strike every copy; with them
off, each copy keeps its own extras. The first copies' outages take different weeks across the whole chain and a part's
copies never share a week, so (checked at all 648 settings) the request fails at most once in a week and two ticks of a
part stand in one column only in a shared outage, in which case every copy has one and the strip has one. What reaches
the request is then a rule, not a draw: a single copy's outage (1 h), a shared outage (1 h), and, with failover on, the
first 5 min of each own outage of the first copy. By construction no two copies of a part are down together by chance
in this year; the model's average for a pair is one such overlap in 57 years, and Describe says both.

The seed must meet hard bounds: every first copy has 8 to 10 outages (the average is 8.76) and every other copy 5 to
12; every part has exactly one shared outage (0.88); four single parts fail the request 35 times (35.04), the default
17 or 18 (17.5), pairs with failover 26 or 27 (26.3), pairs with shared failures 3 (2.6), pairs on paper never; every
experiment setting's rest moment falls in weeks 3 to 48 and a free play's holds stand 2 weeks apart or more. The first
seed that meets them all is **3282478** (`node enum.cjs --search=1-20000000` reruns the search: 6 seeds of the first 16
million). `enum.cjs` prints each bound and fails if `SAMPLE_SEED` misses one, and checks at every setting that the
year's count of failures is within 3 standard deviations of the model's average.

**Honesty rule.** The year is drawn and labelled as one simulated year ("One simulated year · a tick marks an outage,
not its length", "In this simulated year the request failed 17 times, 17 h in all"); its counts are never called an
availability, a downtime a year or an average. Every number in the lower half, the headline, the bars, the scale, the
facts and every experiment slot comes from the model, under "Availability, exact from the model". A tick is a marker of
when, not an interval: an hour is a sixteenth of a pixel of a 620 px stage's year, and the label says so. The model's
simplifications are written where the learner reads them, under the stage: "Every copy is 99.9% available: 8.76 outages
a year × 1 h each is 8.76 h down, or up 999 h for every 1 h down. Parts fail independently of each other, and one copy
can carry the full load. Here copies fail independently, and traffic moves off a dead copy at once." (the last sentence
follows the conditions: "Here 1 in 10 of a copy's outages is shared by every copy of its part, and traffic takes 5 min
to move off a dead copy; recommendations are optional, so their outages (the hollow marks) never reach the request.").

**Engine work.** `widgets/reliability.ts`: the constants, `partAvailability(n, shared, failover)`,
`reliabilityScenario(settings)` (the parts, the request, the weakest links, failures a year, copies), `formatDown`,
`formatAvailability`. `widgets/reliability-sample.ts`: `reliabilityYear(settings)`, `restMoment`, `answerHold`,
`playPlan`, `seedBounds` (one responsibility per file). `reliability-experiments.ts`: the six specs.
`chainAvailability` and its `Availability` type leave `widgets.ts` with the old widget, their only caller, and their
cases leave `widgets.spec.ts`. Framework: `ExperimentRun` gains `'year'`; `SlotUnit` gains `down` (hours, said in the
unit an interviewer would use) and `avail`; the hide regions are `sample`, `request`, `weakest` and `after` (3), each
named in a spec's own list; no template needs a digit outside its slots. `reliability.spec.ts` pins every formula
against the enumerations and a smaller simulation, `reliability-sample.spec.ts` the seed's bounds and the rules that
hold at every setting, `reliability-experiments.spec.ts` every quoted number, the answers and the challenge's
enumeration.

## 2. The picture

One `g-stage`, read top to bottom as cause then consequence: the chain at one moment, the simulated year, then the
exact model. The stage's one full rule parts the year from the model, and each half opens with a title in the title
role (13 px semibold, sentence case): "A request through its chain, over one simulated year" ("One request, one
simulated year", "One simulated year") and "Availability, exact from the model" ("Availability, from the model").
Everything below a title is labelled in the micro caps label role, whose units keep their case.

**Header.** The play disc (36 px in a 44 px box, "Play the year"; "Stop the year" with a pause glyph during a free
play) and the title; under them the key, on its own row at every width: a neutral tick "a copy down, 1 h", a tall
critical tick "a part down, 1 h: the request fails", a short critical tick "a failover, 5 min: it fails too" (phones,
two rows: "copy down, 1 h", "failover, 5 min" over "part down, 1 h: the request fails").

**The chain** (a reliability block diagram at one moment). Parts left to right, each a column: its name (all four full
names where every one fits its column, else all four short ones, never a mix), its copies as boxes stacked about the
chain's axis (one on the axis, two about it, three with the middle one on it), a bus each side with a stub to every
copy, a wire along the axis from part to part, a lead-in from a dot (named "request" on wide stages) and a lead-out to
the outcome. Wires are structure, in `--g-stroke` at 1.25 px. The request's path is the current tone at 2.75 px: along
the axis, up or down the bus to the copy in use (the first that is up), through its box (the box takes the tone's
stroke) and back to the axis. A copy that is down is hatched with a critical × and its name muted. Where a part cannot
carry the request the path ends at a critical stop bar before the part, and the outcome is a critical ringed × ("fails"
beside it on wide stages); else a ringed check in the final tone ("served"). A cross is only ever a copy that is down
or the outcome; the bar is only ever where the path stops. An optional part has a bypass wire in parallel with it, over
its column and named "optional" on the lane where the word fits: in block-diagram terms a dependency made optional is a
part in parallel with a wire. Copy boxes carry their names ("DB 1") where the longest fits beside a down mark in every
box, else their numbers in every box alike.

**The moment.** At rest the band shows one moment of the year, said in words under the chain and marked on the year
(a hairline through every row with a small head, and a ring, stroke only, round the whole tick it is about):

| The setting's year                                   | The moment (the weakest part; of several tied, the last in the chain) | Words under the chain                                                                                          |
| ---------------------------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| The weakest part has one copy                        | its first outage                                                      | "Week 3: the recommendations service is down for 1 h and has no other copy, so the request fails."             |
| It has copies, and shared failures are on            | its first shared outage                                               | "Week 44: a shared failure takes both databases down at once for 1 h, so the request fails."                   |
| It has copies, failover is on, shared failures off   | its first failover                                                    | "Week 4: DB 1 dies. For 5 min requests still go to it and fail, then DB 2 carries them."                       |
| It has copies and neither is on (nothing fails)      | the first outage of its first copy, absorbed                          | "Week 4: DB 1 is down for 1 h. DB 2 carries the request, so nothing fails."                                    |

The failover moment draws the first 5 min: DB 1 hatched, the path stopped at its bar, DB 2 in the soft current tone as
the copy traffic is moving to. The words are a full sentence, wrapped, with the most lines any moment needs at that
width reserved under it (2 wide, 3 on phones), so the reserve sits at the band's foot. A week's number, a copy's name,
a number and its unit, and "17 × 1 h" never part across lines (the app's `g-code-text` rule, here in the stage's own
wrap).

**The year.** Its label: "One simulated year · a tick marks an outage, not its length" ("One simulated year · ticks
are not to scale"; phones "A simulated year" with "ticks not to scale" at the row's right end). A gutter of short part
names, then per part: a 24 px area with a row per copy (24, 12 or 8 px each, a hairline under each), the copy's
outages as neutral ticks (1.5 to 3 px wide, one path per row); then the part's strip, 8 px on a faint band: a critical
tick where the part let the request down (full height for 1 h, half for a 5 min failover), hollow in the stroke tone
for an optional part (down, but skipped). Under the four groups the request's row on a faint band: a critical tick,
tall or short, for each failure, so the row is the union of the strips of the parts the request needs. Then the weeks'
axis (0, 13, 26, 39, "52 weeks", "52 wk" where it is tight) and the year's own sentence, with its lines reserved at the
foot: "In this simulated year the request failed 27 times, 5 h in all: 3 × 1 h and 24 × 5 min." ("... 17 times, 17 h
in all: each for 1 h."; "... never failed; the model's long-run average is below."; during a free play "So far this
simulated year the request has failed 6 times, 6 h in all."). A single copy's row is one tall tick over its strip's
tick over the request's tick: the single point of failure reads as the heaviest column on the stage.

**The model.** Headline: AVAILABLE, DOWN A YEAR, DOWN IN 30 DAYS, each a label over a 17 px mono value in three columns
(phones: three rows, the name left and the value right, so "99.9999999%" and "under 0.01 s" fit). Then **the nines
scale**: "The nines scale · each step right is 10× less downtime" ("Nines · each step is 10× less downtime", "Nines ·
a step is 10× less"), an axis from 0 to 9.3 nines with a gridline at each nine, named over the plot in availability
("90%", "99%", "99.9%", "99.99%", then "5 nines" to "9 nines"; phones "3", "6", "9 nines") and under it in downtime a
year ("down a year": "36.5 d", "3.65 d", "8.8 h", "53 min", "5.3 min", "32 s", "3.2 s", "0.32 s", "0.03 s"; phones
"8.8 h", "32 s", "0.03 s"): the conversion an interviewer expects, drawn as the scale itself. A row per part: a bar
from 0, one 3-nine segment per copy with a notch of stage colour between segments, solid in the current tone as far as
the model's value and in the same tone at 22% from there to the paper value, with "on paper 32 s" beside the soft end
where it fits; so a pair with shared failures is a solid length to 4 nines and a soft one to 6, the gap being what the
arithmetic promised and the copies do not deliver. Every value any setting takes lies on the scale (the longest, three
copies on paper, is 9 nines). The part's downtime a year stands in a value column at the right; an optional part's bar
is muted and its value reads "optional". The last row is the request: an ink bar to its nines and its downtime in
bold. **The cap**: a critical line from the weakest part's end down through the request's row, a critical end cap on
every tied weakest part, their values in bold critical ink and, where there is room in the request's row, "capped by
the weakest link" ("capped here"); the request's bar always ends left of it.

**Facts and the ghost.** Under the scale, body text with its lines reserved at the stage's foot: the weakest link
("Weakest links: DB and Recs (1 copy each), each down 8.8 h a year."; all four tied: "all 4 parts"), then what the
conditions do: on paper "On paper each copy adds 3 nines: a part is down only while all its copies are."; with a
condition on, the least redundant set's downtime as a sum that adds up as printed, "A pair: 92 min a year = 53 min
shared + 39 min failover + 26 s both down by chance." ("A set of 3: ..."; with no set of copies in the chain, "No
needed part has a second copy yet, so shared failures and failover change nothing."). After a change the setting
before it stays as a hollow tick on the request's row, named beside it where there is room ("before 95 s") and always
in words as the facts' last line, "Before this change: 95 s a year." (the challenge: "At the start: 20.6 h a year."); it
never shows while a question asks.

**Controls** (outside the stage, as Latency & Queueing): "Copies of each part", four steppers in a 2 × 2 grid, each a
44 px − and + about the part's short name over its count (− disabled at 1, + at 3); "Conditions", three native
checkboxes drawn as toggles in one row ("Recs optional", "Shared failures", "Failover 5 min"), which keep their weight
and size when checked; the polite notice. Under the stage: the model's standing sentence (above) and Describe.

**Layout.** At container wide the stage takes the left column (620 px at 1280) and the controls, the open question and
the cards the 340 px right column. Narrower, one column: the controls as the stage's first rows, the stage, the open
question, the standing sentence, Describe, the cards. Below wide the notice is read out only.

**Heights** depend only on the stage's width (every wrapped text reserves its longest form at that width; the chain
always reserves three copies and the bypass lane; the year always reserves three rows a part). Measured in the mockup
per pixel from 248 to 780 px, and over every setting and every experiment phase at 16 widths:

| Stage width (px) | 248–252 | 253–295 | 296–324 | 325–335 | 336–372 | 373–510 | 511–519 | 520–622 | 623–634 | 635–697 | 698 and up |
| ---------------- | ------- | ------- | ------- | ------- | ------- | ------- | ------- | ------- | ------- | ------- | ---------- |
| Stage height     | 1,032   | 1,014   | 996     | 978     | 960     | 942     | 924     | 886     | 868     | 850     | 832        |

So 252 px (a 320 phone) is 1,032, 322 (390) is 996, 344 (412) is 960, 620 (1280) is 886. `widget-heights.ts` gets the
built widget's measured whole heights at rest per host width; the mockup's whole-widget heights (its own page, so only
a guide): 1,889 at 320, 1,847 at 360, 1,829 at 375 and 390, 1,774 at 412 and 430, 1,047 at 1280.

**Motion** (3.5's grammar; WAAPI on transform and opacity; the mockup's Play shows it).

- **One clock.** A play sweeps the year once: 52 weeks in 5.2 s, a week every 100 ms. The clock is monotone and holds
  1.1 s on each moment the band acts out, so a free play runs 5.2 s plus at most four holds: the first event of each
  kind the year has (a single copy's outage, a shared outage, a failover, an absorbed outage), in time order. Nothing
  is drawn for an event before its moment: every tick, strip mark and request mark appears as the playhead reaches its
  week (one clip per group that follows the clock, so a frame writes a few attributes and no tick is its own node).
- **A hold.** The playhead stops on the week, the band becomes that moment and its sentence is said: the copy hatches
  and takes its ×; in an absorbed outage the path swings to the next copy (240 ms); where the part falls, the path
  retracts to the stop bar and the outcome turns; in a failover the hold has two beats, the stop (the first 55%), then
  the path through the next copy and the outcome back to served. Between holds the band is the chain with every copy up
  and reads "Week 12 of 52: every part has a copy up, and the request is served." No band change is shorter than
  240 ms, so the 120 ms rule holds with room.
- **The climax** of a free play is the request's row filling as the union of the strips above it; when the play ends
  the band crossfades (160 ms) to the rest moment, now marked. An answer's play applies the act (a box and its row
  arrive, a toggle turns), sweeps the new year at the same rate and holds once, on its own climax: the first event in a
  part the act changed, a shared outage before a failover before an absorbed outage of its first copy (E2: DB 1's first
  outage, with DB 2 now carrying the request; E4: the first shared outage; E5: the first failover); with no part
  changed (E1) the rest moment. Hidden numbers stay "?" through it (3). At the reveal the model lands: values settle
  (400 ms), bars grow or shrink to their lengths and the cap line slides (520 ms), the ghost keeps the setup, and the
  focus outlines pulse.
- **Stop.** During a free play Play is Stop. Stop, or any change to a stepper or a toggle, ends the play and draws the
  new rest state at once; the controls stay live during a free play, and only an answer's play locks them.
- **Plays pause** by the widget host's visibility (IntersectionObserver on the host, plus `visibilitychange`), never
  one stage's.
- **Reduced motion:** nothing moves. The stage is the rest state (the whole year, the band at its moment, the marker),
  so every mark and number is on the drawing. Play redraws it and shows what the year held as a visible caption under
  the stage (HTML, outside the stage, so the stage keeps its height), also read out: the moment's sentence, then the
  year's ("Week 4: DB 1 dies. For 5 min requests still go to it and fail, then DB 2 carries them. In this simulated
  year the request failed 27 times, 2.2 h in all: each for 5 min."). An answer goes straight to its reveal.
- **Phones.** In the one-column layout, choosing an answer first brings the stage's top into view, where the chain and
  the year, the parts the answer plays on, fit one screen (prevention 20).

## 3. The experiments

Every number is a slot from the model (`enum.cjs` prints them all); answer positions 3, 1, 3, 2, 1. A card sets the
widget up with complete settings, as a new start: whatever the learner had before leaves no ghost; answering plays its
act; the dock holds "your guess" ("Watch the picture: the answer plays out on it.") through the play; the reveal is
read out politely and its regions get a focus outline with the house "Look here" tag. The five build on one another:
the series rule on single copies, a second copy, the weakest link, then the two reasons the second copy underdelivers.
The first two set-ups hold single copies only, so no premise shows a pair's number before the question about it.

**E1 "Four parts in a row".** Setup 1, 1, 1, 1, nothing optional, on paper; act `run: 'year'`. Ask: "A page request
needs 4 parts in turn: a load balancer, an app server, a database and a recommendations service. There is one copy of
each, and each is 99.9% available: down 8.8 h a year, in outages of 1 h. How long is the request down a year?" Choices
(ascending): "8.8 h: a chain is as good as its weakest part" / "17.5 h: twice that, as outages often coincide" /
**"35 h: every part's outages count in full"**. Reveal: "35 h: the request needs every part, so it fails whenever any
one of them is down. Outages of 1 h that strike independently almost never coincide, so the downtime of 4 parts adds
up: 4 × 8.8 h is 35 h, and the availabilities multiply to 99.6%. A chain is always worse than its weakest part, and
every hard dependency you add costs its whole downtime." Hides `sample` (asking: the chain is drawn with its wires and
boxes and no path, the outcome a dashed "?", "The year plays after your answer."; the year has its rows and no tick,
its request row a dashed box "plays after your answer") and `request` (asking and playing: the headline "?", the
request's bar a dashed box "after your answer", no cap, "The request's numbers and its weakest link show after your
answer."). The four parts' own bars (3 nines, 8.8 h) stay: they are the premise. Its play is the union happening: four
rows of ticks land, and every one lands again in the request's row, which ends four times as dense as any row above
it. During the play the year's sentence only says where to look ("Watch the request's row: it collects every failure
that reaches it."): the year's own total, 35 h, is the answer's number. Focus: the year, the scale.

**E2 "A second database".** Setup 1, 1, 1, recommendations optional (26.3 h); act `set: { db: 2 }`. Ask: "A load
balancer, an app server and a database, one copy of each, and each down 8.8 h a year; recommendations are optional now.
Give the database a second copy that fails independently of the first, and say traffic moves to it at once. How long is
the database part down a year now?" Choices (ascending): **"32 s: only while both are down at once"** / "53 min: a
tenth, a copy buys one more nine" / "4.4 h: half, two copies share the failures". Reveal: "32 s: the part is down only
while both copies are down at once. Each is down 0.1% of the time, so both are down 0.1% of 0.1%: 99.9999% available,
32 s a year against 8.8 h. Unavailabilities multiply, so each independent copy adds 3 nines. The request is still down
17.5 h a year, because the two parts left with one copy now set it. And 32 s is the ceiling of the arithmetic, not a
forecast: it holds only if the copies never fail together and traffic moves instantly." Hides `after`. Its play: a
second box and a second row arrive; the hold is DB 1's first outage with the path through DB 2; the database's strip
stays empty all year and the request's row loses a third of its marks. Focus: the year, the scale (the database's bar
now two segments, 6 nines).

**E3 "One more app server".** Setup 2, 2, 1, recommendations optional (8.8 h); act `set: { app: 3 }`. Ask: "The request
passes 2 load balancers, 2 app servers and 1 database, every copy 99.9% available; recommendations are optional. It is
down 8.8 h a year. Add a third app server. How long is the request down a year now?" Choices (ascending):
"4.4 h: half, as three app servers never fail together" / "5.9 h: a third less, like the share of servers added" /
**"8.8 h: unchanged, the app servers were never the limit"**. Reveal: "8.8 h, unchanged: the request is down because
of the database, a single copy down 8.8 h a year. The app servers were down together only 32 s a year as a pair, and
0.03 s as three. Polishing a strong part buys nothing you can measure: the weakest link caps the chain, so find the
single point of failure before adding copies anywhere else." Hides `weakest` (asking and playing: the cap line, its end
caps and words, the marked values and the weakest-link sentence, which is the answer's principle: "The weakest link
shows after your answer.") and `after`. Focus: the scale (the app servers' bar grows to 9 nines and the request's does
not move), the chain.

**E4 "Failures the copies share".** Setup 2, 2, 2, recommendations optional, on paper (95 s); act `set: { shared: 1 }`.
Ask: "Two copies of every part the request needs: on paper it is down only 95 s a year. Now say 1 in 10 of a copy's
outages come from something its twin shares, such as the zone both run in or a bad deploy that reaches both. How long
is the request down a year now?" Choices (ascending): "104 s: a tenth more than on paper" / **"2.6 h: about 100× what
the paper says"** / "26.3 h: as much as with one copy of each". Reveal: "2.6 h, about 100× the paper's 95 s. A second
copy removes only the outages that are a copy's own. A shared one takes both copies down together, so it passes
straight through: 53 min a year for each part, however many copies it has. With 1 in 10 of outages shared, copies buy
at most one more nine, 99.99% a part and not 99.9999%. So spread copies across zones, roll changes out in stages and
split users into cells: the fix is fewer shared causes, not more copies." Hides `after`. Its play: three columns where
both copies' ticks stand together, each with its strip mark and its request mark; the hold is the first. At the reveal
each part's bar keeps a soft length from 4 to 6 nines, "on paper 32 s". Focus: the year, the scale.

**E5 "Failover takes time".** Same setup; act `set: { failover: 1 }`. Ask: "Two copies of every part the request needs,
failing independently: on paper it fails only when both copies of a part are down at once, about once in 19 years. But
moving traffic off a dead copy takes 5 min: health checks must notice, then the switch happens. About how many times a
year does the request fail now?" Choices: **"About 26 times: at every failure of a copy in use"** / "About 9 times: as
often as a single copy fails" / "Still about once in 19 years: the standby was ready". Reveal: "About 26 times a year,
5 min each: 2.2 h a year instead of 95 s. Redundancy does not remove a copy's failures, it shortens them: each of the
8.76 outages a year of the copy in use now ends when traffic has moved, after 5 min, not when the repair is done, after
1 h. Availability is MTBF / (MTBF + MTTR), and a standby turns the time to recover from the repair time into the
failover time. So past four nines no human can be in the loop: detection and the switch must be automatic, and
rehearsed." Hides `after`. Its play: a short mark under every outage of every first copy, 27 in this year (the model's
average is 26.3, and the reveal's number is the model's); the hold is the first, in two beats. Focus: the year, the
chain.

**E6 Challenge "Three nines from seven copies".** Setup 2, 3, 1, 1, nothing optional, shared failures and failover on
(20.6 h). Ask: "This design has shared failures and a 5 min failover, as real ones do, and the request is down 20.6 h a
year. Promise three nines: bring it under 8.76 h a year, 99.9%, with no more than the 7 copies it runs now." Goal
`all`: `down` below 8.76, `copies` below 8; keep `shared` 1 and `failover` 1 (their toggles are disabled, and the
legend says "Conditions · the goal keeps both failures on"). Of the 162 settings exactly one passes: 2, 2, 2, 1 with
recommendations optional (4.6 h, 99.947%; the nearest miss with 7 copies or fewer is 11.8 h, so no rounding can blur
the line). The status is the house checklist (no line over it until met), under "Goal met:" while the goal holds, each
line with its state in words: "the request down 4.6 h a year, under 8.76 h: met" / "7 copies in all, no more than 7:
met"; before: "the request down 20.6 h a year, under 8.76 h: not yet". Reveal: "Run 2 load balancers, 2 app servers and
2 databases, with recommendations optional: down 4.6 h a year, 99.947%. Moving one app server to the database removes
the single point of failure, and making recommendations optional takes a whole part out of the chain; the third app
server was buying nothing. The 4.6 h left are shared outages and failovers, which no further copy removes: the next
nine comes from fewer shared causes and a faster switch." No hides; Describe waits until the goal is met.

**One `hiding()` map** (prevention 1) from a question's regions to every surface; each region is named in the spec's
own `hide` list:

| Region    | When                          | On the stage                                                                                                                                                                                                        | Elsewhere                                                                                                  |
| --------- | ----------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `sample`  | asking (E1)                   | no tick, strip mark, request mark, ring or moment line; the chain with no path, no down copy and a dashed "?" outcome; "The year plays after your answer."; the request's row a dashed box; no year sentence        | the summary ("The simulated year plays after your answer."), the notice, Describe                          |
| `request` | asking and playing (E1)       | every headline value "?"; the request's bar a dashed box and its value "?"; no cap line, end cap, cap words or marked value; the facts replaced by one sentence; during the play the year's sentence holds its count | the summary ("The model's numbers for the request show after your answer."), notices, Describe             |
| `weakest` | asking and playing (E3)       | no cap line, end cap, cap words or marked value; "The weakest link shows after your answer."                                                                                                                        | the summary and notices name no weakest link                                                               |
| `after`   | playing (E2 to E5)            | everything `request` and `weakest` hide, at the act's new setting, and for every part the act changed its bar (a dashed box), its paper label and its value ("?")                                                   | as `request`                                                                                               |
| ghost     | asking and playing (every question) | no hollow tick, "before" words or "Before this change" sentence: a card's setup is a new start                                                                                                                | none                                                                                                       |

Hiding holds through the answer's own play and releases at the reveal. While any question asks or plays, Play, the
steppers and the toggles are disabled, the notice says "Play and the settings this question is about wait for your
answer.", and Describe waits ("Describe waits for your answer."). Cards carry titles only. Dashes on the stage mean
"hidden until you answer" and nothing else.

## 4. Accessibility

- The stage is `role="group"`, `aria-roledescription="visualization"`, named "Reliability: a request crossing a chain
  of parts, each a set of copies, over a simulated year"; its SVG has a summary that obeys `hiding()`: "A request
  crosses 2 load balancers, 3 app servers, 1 database and 1 recommendations service, every copy 99.9% available;
  copies fail independently, and traffic moves off a dead copy at once. The model gives 99.8% available: down 17.5 h a
  year, 86 min in 30 days. Weakest links: the database and recommendations (1 copy each), each down 8.8 h a year."
- Play is a button ("Play the year"; "Stop the year" during a free play; "Play the year, after your answer" while a
  question waits, disabled). Each stepper is two buttons ("Fewer databases", "More databases"; disabled at the bounds)
  about an `output` named "Database: 1 copy". The conditions are native checkboxes named in full ("Shared failures: 1 in
  10 of a copy's outages hits every copy of its part", "Failover takes 5 min: traffic needs that long to move off a
  dead copy", "Recommendations optional: the page renders without them"). The dock is `app-widget-check`, whose
  checklist lines carry ": met" / ": not yet" in words (the ✓ and · are `aria-hidden`). There are no tappable marks on
  the stage, so no tap hints exist to clear (prevention 11).
- Notices (polite, `aria-atomic`): after a change, the setting's sentence ("The request is 99.97% available, down 2.6 h
  a year. Weakest links: the load balancer, the app servers and the database (2 copies each), each down 53 min a
  year."); after a play, the moment and the year in words; the reveal is announced politely; nothing is announced while
  it hides; when a challenge opens and after a reveal the notice says the setting's sentence, never nothing.
- Colour is never alone: a copy that is down is hatched, crossed and its name muted; the path that stops has a bar and
  the outcome a ringed × and the word; a failure is a tick in the request's row, tall or short; an optional part is
  muted, named "optional" and its marks are hollow; the paper length is soft and named "on paper"; the weakest link is
  a line, end caps, bold values and a sentence. Tokens are the app's `--g-viz-*` (checked by
  `theme-contrast.spec.ts`); small text uses ink tokens that pass 4.5:1; wires use `--g-stroke` (3:1 for meaningful
  graphics in both themes).
- 44 px targets: Play, each stepper button, each toggle (48 px high).
- **Describe** (a `g-data-table` in a `minmax(0, 1fr)` grid, scrolling inside its own box): the summary and the
  conditions' sentence; the year's sentence, the moment the picture rests on, and how the year is drawn ("The year is
  drawn with a week between any two outages of one part, so two ticks in one column are always one shared outage; by
  chance alone a pair overlaps about once in 57 years."); then a row per part and one for the request. Columns: Part
  (with "weakest link" under a weakest part's name), Copies, Available, Down a year, In 30 days, Simulated year
  ("9 failures, 9 h", "none"). Under a 600 px stage it is `compact`: short names, and Part, Copies, Down a year, This
  year ("9×, 9 h"). Measured over all 648 settings: it fits its box with no sideways scroll at 252, 292, 344, 599, 600
  and 620 px, so at 320, 412, 1280 and 1440 px the page never scrolls sideways.

## 5. The prevention list

1. **Giveaways while asking, on every surface.** The one `hiding()` map (3) feeds the stage, the summary, the notices
   and Describe; Play, the steppers and the toggles wait, so no play the learner starts can show an answer; the answer's
   play keeps the hiding until the reveal, and during it the year's own count is held back too, since a year's total is
   close to the model's; a card's setup starts afresh, so no ghost carries an answer in; E2's and E1's set-ups hold no
   pair, so 32 s is on no surface before it is asked. The mockup's `noAnswer()` renders every question asking, entered
   from eight other settings (every act's target, the challenge's solution, the default, a full house), and its
   answer's play at five moments, at 12 widths from 252 to 700 px (780 renders), against each question's answer words
   (the scales' own tick labels excepted: they are the axes at every setting), the false claims (below) and structure:
   Play disabled; no ghost tick, ghost words or ghost sentence; no tick, ring, moment line, path, down box or outcome
   while `sample` hides; every headline value "?", no request bar, cap or weakest-link words and no counted year while
   `request` hides; no cap line, end cap, cap words or marked value while `weakest` hides; no bar, paper label or value
   for a changed part during an `after` play. It finds none, and it catches six planted leaks (E1 asked without
   `sample`; E1 asked without `request`; E2 played without `after`; E4 played with its changed parts shown; E3 asked
   with the ghost of the setting before it; E3 asked without `weakest`). The built component's sweep does the same with
   motion off and on, sampling the play frame by frame.
2. **False claims anywhere.** No hidden value has a default: hidden reads "?" or "after your answer". The false-claim
   list ("0 times", "0 h", "0 s", "100%", "1 times", "1 copies", "failed 1 time", NaN, undefined, Infinity) runs over
   every free setting's stage at every swept width (11,340 renders) and over every page sentence of all 648 settings
   (the summary, the notice, the facts, the year, the moment, Describe in both forms, the goal checks): none. So no
   downtime prints as 0 ("under 0.01 s"), no availability as 100%, "once" and "twice" are words, and a year with no
   failure says so. The year is never presented as the model: its numbers are counts and hours under "simulated", and
   the layout spec asserts, at every setting and width, that every row draws exactly its copy's outages, that the
   request's row is exactly the union of the strips of the parts it needs, that two copies of a part stand in one
   column only in a shared outage (with the strip marked), that the year's sentence counts what the row draws, that the
   band agrees with its sentence (fails, served, a copy down), that the ring is round a drawn tick, that each bar ends
   at its own value, that the request's bar never passes a part's or its cap, and that the causes add up as printed.
   Every sentence is computed for its setting (the facts follow the conditions and the copies; "both" or "all 3" by
   count), and the reveals' word claims are slots or checked by `enum.cjs`.
3. **`$index` tracking.** Parts are tracked by id, copies by part and number, outages by part, copy and week; adding a
   copy adds a row and a box and reorders nothing, and the template tracks by those ids.
4. **Labels on lines; markers; rings.** Every stage text has a stage-coloured halo and is placed by a `Draw` that
   checks texts, marks and lines (wires, the path, the bypass, the cap line); marks and lines are laid before any
   label. Gridlines and the playhead run under grounded labels only. The ring is stroke only, round the whole tick, and
   its line has its head clear of the label row. The checker flags text on text, a line through text, text on a mark,
   anything off the stage, text under a hit box, axis labels closer than 6 px (the weeks, the nines and the downtime
   each as their own row), a text against a focus outline's stroke and any label or tag with no place: zero over 174
   screenshots, 11,340 setting renders and 324 experiment renders. Nothing moves across a label: the only moving marks
   are the playhead, which stays in the rows, and the path, which stays on its wires.
5. **Look-here tags.** House candidates on the outline's edge first (16 px, then 6 px off its corners), then just
   inside, then inner rows, outside last; every revealed frame and the met challenge hold one placed tag per focus
   region at 12 widths (asserted: the tag count equals the focus count).
6. **Marks before their event.** One monotone clock per play (2), checked at every setting never to run back and to
   end at week 52; every tick, strip mark and request mark carries its week and appears when the playhead reaches it;
   the band changes only on a hold, at the held week.
7. **Visibility and reduced motion.** Plays pause on the widget host's visibility and the page's; Reduced motion draws
   the rest state, which holds every number and mark, and Play shows the moment and the year as a caption.
8. **CSS specificity.** Every `fieldset.group` carries zero padding; a control's class only adds to it
   (`fieldset.group.copies-control`, `.conditions-control`); the 320 px shots show the controls above the stage with no
   overlap.
9. **Words.** The summary, notices, facts, moments and year are full sentences; plurals by count ("1 copy", "2 copies",
   "once", "twice", "17 times", "1 failure"); no sentence opens on a numeral (checked over every page sentence; a
   reveal and a choice open on the answer's own value, as the house's do); no sentence is spliced from chips. The
   challenge's status is the checklist with its states in words and says "Goal met:" only while the goal holds; the
   notice is never blank after a reveal or when a challenge opens.
10. **Describe's width.** `minmax(0, 1fr)`, the table in its own scrolling box, compact under a 600 px stage; measured
    to fit at every setting (4); e2e checks no sideways page scroll at 320, 412, 1280 and 1440.
11. **Touch hints.** The stage has no tap targets but Play, so it has no hints to clear.
12. **Placeholder heights.** The stage height is a step function of width (2); `widget-heights.ts` gets the built
    widget's whole height at rest per host width from a measuring spec at 320, 360, 375, 390, 412 and 430 px and every
    50 px from 300 to 1,300, which fails on any drift over 3 px.
13. **Text measurement.** The mockup measures with canvas from the fonts the app ships; the build measures through
    `stage-text.ts` (roles, `tw`, `wrap`, `partsWidth`, the advance tables), the label role uppercasing all but a unit
    after a number. Stage text never uses tabular digits, so measurement matches rendering; the table and the dock,
    which are HTML, keep `tabular-nums`.
14. **Learner text in HTML** (the dock, the notice, the standing sentence, Describe, the caption) goes through
    `g-code-text`, so no line parts a number from its unit, "17 × 1 h", a copy's name or a week's number; every live
    region holding it is `aria-atomic` (`templates.spec` enforces it). The stage's own wrap keeps the same pairs whole.
15. **Element counts.** A row's ticks are one path, a strip's marks one path, the request's marks one path: at most 12
    + 4 + 1 tick paths whatever the year holds, and the whole stage is about 200 nodes at its fullest setting (3, 3, 3,
    3). A play moves one clip per group and the playhead; the band re-renders only on a hold. The builder measures
    keydown to the second frame (a stepper press at 3, 3, 3, 3 with both conditions on) under 150 ms on a Pixel 7
    profile at 4× CPU throttle, and 60 fps through a play there.
16. **Zoneless reads.** Specs and e2e read the widget only after the state's summary is drawn (web-first assertions);
    `reliability-lesson.spec.ts` runs on desktop, the phone and the WebKit iPhone project.
17. **Marks mean one thing.** Dashed is only "hidden until you answer" (the hidden bars, the hidden request row, the
    "?" outcome, the path placeholder). An unused copy slot is nothing, not a dashed box. A cross is a copy that is
    down or the failed outcome; a bar is where the path stops; hollow is "down, but skipped" (an optional part's
    marks) or the setting before (the ghost tick, always with its words). The ring and the focus outline are stroke
    only, round the whole mark.
18. **On the scale.** Every value any setting, ask, reveal or ghost compares lies on the nines scale (0 to 9.3 nines;
    the largest is 9), so nothing is cut at its end. The ghost's old value is said beside its tick where there is room
    and always in the facts' last line.
19. **Units and conversions.** `formatDown` never drops its unit ("0.03 s", "under 0.01 s", "53 min", "8.8 h", "1 h",
    never "60 min"); the shortest forms keep theirs ("9×, 9 h", "52 wk"). The conversion the learner must make, nines
    to downtime, is the scale itself (two labelled edges of one axis), and copies to nines is the bar's segments.
20. **Layout.** Reserved lines collect at a box's foot: the moment's under the chain, the year's under its axis, the
    facts' at the stage's foot, and the ghost's sentence is the facts' last line so no reserve opens between two text
    blocks. A checked toggle keeps its weight and size. On a phone, choosing an answer first brings the stage's top
    into view (2, Motion).

## 6. What a learner can say in an interview afterwards

- "A request needs every part on its path, so availabilities multiply and downtime adds: four services at 99.9% are
  99.6%, 35 hours a year, four times any one of them. Every hard dependency I add costs its whole downtime."
- "Copies in parallel are down only together, so unavailabilities multiply: on paper each independent copy of a 99.9%
  part adds three nines, 8.8 hours to 32 seconds."
- "The weakest link caps the chain. Before adding copies anywhere I find the single point of failure: a third app
  server changes nothing if the database is one box."
- "That 32 seconds is a ceiling, not a forecast. If even 1 in 10 of a copy's outages has a cause its twin shares, a
  zone or a bad deploy, those pass straight through: 53 minutes a year, one more nine at most, however many copies. The
  fix is fewer shared causes: zones, staged rollouts, cells."
- "Failover is downtime on every failure. Redundancy does not remove failures, it shortens them from the repair time to
  the failover time: availability is MTBF over MTBF plus MTTR. Nine failures a year behind a 5 minute failover is 44
  minutes, so past four nines detection and the switch must be automatic and rehearsed."
- "To add a nine to this design I would remove the single point of failure, take optional dependencies off the critical
  path so the page degrades instead of failing, then cut shared causes and failover time. I would promise 99.9%: three
  hard parts as pairs with honest failover and shared outages is about 4.6 hours a year."
- "Nines in the currency you asked for: 99.9% is 8.8 hours a year or 43 minutes a month, 99.99% is 53 minutes a year,
  99.999% is 5."

## 7. Lesson text fixes (`libs/engine/src/sysdesign/lessons/reliability.ts`)

- `widget.tryThis` goes (the experiments replace it, and its three paragraphs quote the old widget's levels: 99.950%,
  4.4 h, 99.99997%, 98.9505%); `widget.experiments` takes `RELIABILITY_EXPERIMENTS`.
- "Series and parallel": after "so three copies at 99% give 1 − 0.01^3, 99.9999%." add "Each independent copy adds its
  own nines: one copy at 99.9% is down 8.8 hours a year, two are down together about 32 seconds." (the widget's E2).
- "Independence is the assumption that fails": after "sits in series with all of them." add "If even 1 in 10 of a
  copy's outages has a cause its twin shares, those pass straight through, and extra copies buy at most one more nine."
  (E4: β u = 99.99%, checked by `enum.cjs`).
- "Detection and failover": after "Redundancy only helps if traffic moves off a dead part." add "And the move takes
  time on every failure: a copy that fails 9 times a year behind a 5 minute failover costs about 44 minutes a year."
  (8.76 × 5 = 43.8).
- "SLOs, error budgets, MTBF and MTTR": after "fast rollback, good alerts, automated failover." add "A standby works
  the same way: it does not stop failures, it turns the time to recover from the repair time into the failover time."
- Nothing else changes; these were checked against the model: the why text's 99.6% and 35 hours (E1), "Nines and what
  they cost" (5,256, 526, 263, 53 and 5 minutes against the scale's 3.65 d, 8.8 h, 53 min and 5.3 min; 0.1% of 43,200
  minutes is the headline's 43 min at 99.9%), the first example's 0.996006, 2,099 and 1,575 minutes (26.3 h, E4's
  third choice) and 99.975% (0.999^(1/4)), and the second example's 263 minutes, 8 seconds, 53, 20 and 73 minutes.

## Notes for the builder

- The mockup's geometry is the spec: the `Draw` placement order (marks and lines, then values, then the paper labels,
  the ghost and its words, then the cap words), the fallbacks for every label, the chain's sizes by width (boxes 26 px
  high on wide stages, 22 px on phones; the wide form from a 520 px stage), the reserved lines, the scale's label sets by fit.
  `reliability-layout.ts` (a pure `buildStage(width, model, year, view)` returning marks, as `quorum-stage.ts` and
  `latency-layout.ts` do), `reliability-words.ts` (`hiding()`, the summary, notices, moments, the year, the facts,
  Describe, the goal checks), `reliability-motion.ts` (the clock, the holds, the band's beats), the component
  (`reliability-widget.component.ts`, lazy through `app-lazy-widget`; `availability-widget.component.ts` goes) and its
  spec (the no-answer sweep with motion off and on and the six leaks), a layout spec over every setting at 12 widths
  from 248 to 700 px with mid-play frames and ghosts and the assertions in 5, and e2e `reliability-lesson.spec.ts`.
- The widget keeps its kind, `availability`, so the lesson registry and routes do not change.
- The mockup redraws the whole stage each frame of a play; the build must not (prevention 15).
- `content.md` (every string of the built widget, both checklist states included) is generated by a browser walk of the
  built widget, as for the three house widgets, and goes to content review with the experiments.
