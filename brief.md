# Latency & Queueing widget (`queue-latency`): design brief

Redesign R41, the batch's third widget (REDESIGN.md 5.2: the R41 to R45 entry, its "Forms" bullet, the Data Modeling
note and the Consistency & Quorums note; LOOP.md rows 122 and 123 are the house references). Lesson:
`/design/topics/sd-latency`. Files beside this brief, on the orphan branch `design/r41-latency`:

| File          | What it is                                                                                                                                                                                                                                                                                                                                                       |
| ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `model.js`    | The exact model (M/M/c, M/D/c, one shared queue or a queue each), the seeded sample with its rest moment and play plans, and the six experiments as slot templates; ported to `libs/engine/src/sysdesign/lessons/widgets/queueing.ts` (beside `queueBacklog`, unchanged), `latency-sample.ts` and `latency-experiments.ts`                                       |
| `enum.cjs`    | Prints every experiment number, proves the challenge has exactly one passing setting of 98, checks the model against closed forms, Erlang's 1909 M/D/1 formula in BigInt arithmetic and a discrete-event simulation of every configuration, checks the reveals' word claims, and holds the sample's seed to hard bounds before typicality picks it (2,348 checks) |
| `mockup.html` | The mockup with the app's tokens and fonts: `?state=default\|quiet\|busy\|split\|pool\|steady\|calm\|down\|overload\|critical\|playing\|describe\|reduced\|ask&exp=1..5\|reveal&exp=1..5\|challenge&theme=light\|dark`; `ask` also takes `&phase=playing` (the answer's play, hiding held, `&frac=` its moment) and `challenge` takes `&start=1`                                  |
| `shoot.cjs`   | Screenshots every state at 1280, 390 and 320 px in both themes with the page's collision report and layout assertions, then sweeps every setting at 11 widths (at rest, through a free play, with curve and point ghosts), every experiment asking, playing and revealed, the no-answer sweep with four planted leaks, every page sentence, and the stage heights  |
| `changes.md`  | Each critique item and what changed for it                                                                                                                                                                                                                                                                                                                       |

## 1. The verdict, and the mechanism

**Today's widget against the bar.** One log chart of p50 and p99 against utilization, a slider and three tiles. It is
correct and it is the right curve, but it shows the outcome, not the cause. Nothing on it is a request; nothing waits.
A learner can read off "p99 at 90% is 461 ms" and still not be able to say why, which is the whole interview question
("why does latency explode near 100%?"). It also teaches only M/M/1, so the lesson's other claims (a pool sharing one
queue waits far less, steadier work halves the wait, a lost server pushes the rest past the knee) are text the learner
must take on trust. The R41 "Forms" bullet lets a chart-stage widget keep its picture "unless their brief finds the
picture short of the bar": it is short of it. The curve stays, as the consequence, under a drawing of the cause.

**What the learner must see.** Requests arrive at random to a server (or a pool) that needs a service time for each.
Random arrivals collide even when the server is idle half the time, so a queue forms in bursts; the busier the server,
the longer each burst's queue lasts, and near 100% waiting dominates the response time. The tail (p99) sits a fixed
multiple above the median for random work, so it gains many more milliseconds; a shared queue in front of a pool and
steadier work both cut the wait; losing a server multiplies the load on the rest by N / (N − 1), which can push them
past 100%, where nothing settles.

**What the widget draws, what experiments test, and what stays text** (as a senior interviewer would weigh them):

| Idea                                            | Weight | Where                                                                                                                  |
| ----------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------------------------------- |
| Utilization = arrival rate × service time       | core   | The load row's own words ("70% busy · 70 requests/s at random, 10 ms each on average"; phones "70/s at random, 10 ms each") |
| The queue forming from random collisions        | core   | The band and the timeline; E1                                                                                          |
| Mean S / (1 − u), the knee                      | core   | The curve; "where the time goes" bar; E2                                                                               |
| p99 vs p50 (4.6 × mean, 6.6 × p50 for M/M/1)    | core   | The curve, the headline, 100 requests at the model's quantiles; E2's reveal                                            |
| A pool sharing one queue (M/M/c, Erlang C)      | high   | Servers and Queue controls; the band rests on an idle server beside a long line; E3                                    |
| Variability (Pollaczek-Khinchine, (1 + CV²) / 2) | high  | Steady work toggle; the marginal's no-wait requests at exactly 10 ms; E4                                               |
| Headroom for a failure, N / (N − 1)             | high   | A server down toggle; the unstable state and the model's drift; E5 and the challenge                                   |
| Little's law                                    | medium | One line under the bar that multiplies out as printed ("2.33 in the system at once on average: 70/s × 33.3 ms")        |
| Fan-out tails (1 − 0.99^n)                      | medium | One model line under the chart at wide stages, beside the p99 tick it reads ("... at least one slower than p99 on 39.5% of loads") |
| Merged histograms, coordinated omission         | low    | Lesson text only: measurement practice, taught again by Observability (`error-budget`)                                 |

**Settings.** Servers c ∈ {1, 2, 3, 4}; queue one shared or a queue each (requests assigned at random); service random
(exponential, mean S = 10 ms) or steady (exactly 10 ms); one server down or not (two or more servers); load ρ₀, how busy
the fleet runs with every server up, at 14 stops (10, 20, 30, 40, 50, 60, 65, 70, 75, 80, 85, 90, 95, 98%). 364
settings in 26 configurations. The arrival rate is λ = ρ₀ c / S (shown in requests a second); with one server down the
m = c − 1 servers left take all of it, ρ = λ S / m. Changing the server count keeps ρ₀ (a fleet of c at this load), which
is what makes pool comparisons fair; losing a server keeps λ (the same traffic, fewer servers), which is what headroom
means. Exactly 100% is reachable (2 servers at 50% and 4 at 75% with one down) and has its own words (2).

**Formulas** (all in `model.js`, ported 1:1):

- M/M/1: T ~ Exp with mean S / (1 − ρ); p50 = mean ln 2, p99 = mean ln 100 (4.605 × mean, 6.644 × p50); P(wait) = ρ.
- M/M/c, one shared FCFS queue, a = λ S: Erlang C, C(c, a), by the stable recursion through Erlang B; the wait is 0 with
  probability 1 − C and else Exp(θ), θ = c/S − λ; mean wait C / θ; P(T > t) = (1 − C) e^(−t/S) + C · P(S + E > t) with
  P(S + E > t) = e^(−μt)(1 + μt · (1 − e^(−(θ−μ)t)) / ((θ − μ)t)), written with `expm1` so it stays exact as θ → μ.
- M/D/c: Crommelin's chain N′ = max(N − c, 0) + Poisson(λD) is exact for the number in system at any moment (every
  request in service at t has left by t + D; none that started after t has), so its stationary law π is the
  time-stationary one. π is solved by GTH state reduction on the chain truncated where the tail falls under 1e−15
  (only additions and multiplications of positive numbers, and the band of the chain is kept, so it is exact to rounding
  and fast: under 10 ms at 98%). Franx (2001): an arrival starts by kD + u (0 ≤ u < D) exactly when
  max(N − c, 0) + A ≤ (k + 1)c − 1, with A ~ Poisson(λ(D − u)) independent of N; T = W + D. Mean wait = E[max(N − c, 0)] / λ
  (Little). The percentiles have no closed form; they are found by bisection on this exact distribution to 1e−9 ms.
- A queue each: each server that is up is its own M/M/1 or M/D/1 at λ / m. The share of time some server idles while a
  request waits at another is 1 − ρ^m − (1 − ρ²)^m + (ρ − ρ²)^m (inclusion and exclusion over independent queues):
  57.4% at 4 servers and 80%, against 57.3% in a simulation (E3's reveal).
- Unstable (ρ ≥ 1, only reachable with a server down): no steady state; the model says how fast the queue grows,
  λ − m / S per second (none at exactly 100%, where the queue wanders without a bound).
- 100 requests: the model's quantiles at levels (i − 0.5)/100, so p99 lies between the 99th and 100th and p50 between
  the 50th and 51st (checked); the marginal draws them in three zones by index (2).

**Checks** (`node enum.cjs`, 2,348 pass): M/M/1 against its closed forms at every load; M/D/1's mean wait against
Pollaczek-Khinchine ρS / (2(1 − ρ)) at every load (exact to 1e−9); M/D/1's waiting-time distribution against Erlang's
1909 formula P(W ≤ xD) = (1 − ρ) Σₖ (ρ(k − x))ᵏ / k! · e^(−ρ(k − x)), evaluated in 160-digit BigInt fixed point because
its terms cancel to 40 digits (66 points from 10 to 98%, largest gap 8e−15); a discrete-event FCFS simulation of every
configuration at 30, 60, 80 and 90% (76 configurations, 3 to 12 million requests each): mean, p50, p99 and the chance to
wait agree, the largest gaps 1.1%, 0.7% and 2.1% against tolerances of 2 to 8% (widening with 1 / (1 − ρ), as busy
periods lengthen); a shared queue never waits longer than a queue each, steady never longer than random, p99 rises with
load in every configuration, Little's law holds. The reveals' word claims: "as long as the work itself", "3×", E3's
7.5 ms within 1% of 7.46 ms and "about 5×" rounding 5.4×, "exactly half" for one server and a pool's steady-to-random
ratio between 0.5 and 0.65 ("nearly halves"), E5's 120% and 40/s, and the idle-beside-a-line share against a simulation.
Every experiment number, its answer and the challenge's one solution are printed and checked.

**The sample** (what the upper half of the stage draws). A seeded run (mulberry32) with common random numbers: the same
stream of uniforms at every setting, so a higher load compresses the same arrivals and no request waits less (checked
request by request); 40,000 arrivals warm the system up, and the window is the 400 ms before the last one. With no
steady state the window is 4 s and starts empty (a ramp needs the window many times (λ + μ) / (λ − μ)²).

The seed must first meet hard bounds, then typicality decides. Bounds: the window's busy share within 7 points of ρ at
every experiment setting (E1 50%; E2 70 and 90%; E3 a queue each and one queue at 80%; E4 90% random and steady; E5
3 servers at 80%; the challenge's solution), E3's window holds a line of at least 8 beside an idle server, each
experiment's unstable window (E5 after the failure, the challenge's start) rises every second and ends at no less than
0.8 of its most and within 25% of the model's drift, and each answer's rest moment falls at 200 ms or later, so its play
is a full slice (3). Of seeds 1 to 60,000 four meet them all (`node enum.cjs --search=1-60000` reruns the search); the
most typical of the four (the window's busy share against ρ and its mean queue against λ W_q, averaged over every
stable setting, again over the experiments' settings, plus a quarter of the worst window) is **26159**: busy gaps of
−0.2 to −5.3 points at the experiments, a mean busy bias of +1.95 points over all 272 stable settings, E3's line of 16
beside an idle S1, E5's waiting count 45, 100, 134 and 144 at 1 to 4 s against the model's 160 by 4 s, and the
challenge's start 24, 46, 85 and 99 against 80. `enum.cjs` prints each bound for each seed and fails if `SAMPLE_SEED`
misses one.

**Honesty rule:** the sample is drawn and labelled as a sample ("A sample of random arrivals", "The last 400 ms of this
sample", "Queue at its longest · 10 waiting at 301 ms"); it is never summarized as a percentile, a mean or a utilization.
Every number in the lower half, the headline, the bar, the two facts, the curves, the 100 requests, the fan-out line and
every experiment slot comes from the exact model; the one model mark in the upper half, the drift line, says so ("the
model: +40 a second").

**Engine work.** `widgets/queueing.ts` keeps `queueBacklog` and `Backlog` byte for byte and gains `LATENCY_SERVICE_MS`,
`LATENCY_LOADS`, `LATENCY_SERVERS`, `erlangC`, `mmcLatency`, `mdcLatency`, `latencyQuantile`, `idleBesideShare`,
`latencyScenario(settings)` and `latencyCurve`; `queueLatency` is retired (only the old widget and `widgets.spec.ts` use
it). The seeded sample goes to its own `widgets/latency-sample.ts` (`latencySample`, `sampleAt`, `linesAt`,
`waitingSteps`, `restMoment`, `playPlan`; one responsibility per file). Settings are numbers, as `ExperimentSettings`
requires: `load` (%), `servers`, `queue` (0 shared, 1 a queue each), `service` (0 random, 1 steady), `down` (0 or 1).
`latency-experiments.ts` holds the six specs. Framework: `ExperimentRun` gains `'sample'`; `TEMPLATE_DIGITS_ALLOWED`
gains `'S / (1 − utilization)'` and `'(1 + CV²) / 2'`; the hide regions are `sample`, `numbers`, `after`, `ahead`,
`utilization` and `stability` (3), each named in a spec's own list. `queueing.spec.ts` pins every formula against the
closed forms, Erlang's formula (BigInt) and a smaller simulation, `latency-sample.spec.ts` pins the seed's bounds and
the rest moments, and `latency-experiments.spec.ts` pins every quoted number, the answers and the challenge's
enumeration.

## 2. The picture

One `g-stage`, read top to bottom as cause then consequence: a sample of requests (the load, the queue and the servers at
one moment, then the window as a timeline), then the exact model (the numbers, where the time goes, the curve and 100
requests). The stage's one full rule parts the two halves, and each half opens with a title in the title role (13 px
semibold, sentence case, text ink): "A sample of random arrivals" and "Response time, exact from the model" ("Response
time, from the model" on phones). Everything below a title is labelled in the micro caps label role, whose units keep
their SI case ("THE LAST 400 ms OF THIS SAMPLE": the number and unit sit in a tspan with `text-transform: none`, and
the measurement capitalizes the same way).

**Header.** The play disc (36 px in a 44 px box, "Play the sample"; "Stop the sample" with a pause glyph during a free
play), the title, and the key: an amber dot "waiting", a blue dot "in service" (beside the title when wide, its own row on
phones).

**Load.** "LOAD **70% busy** · 70 requests/s at random, 10 ms each on average" ("exactly 10 ms each" for steady work);
narrower, "70/s at random, 10 ms each" ("70/s, exactly 10 ms each"; with a server down "240/s at random, 10 ms each"),
under the track on phones, so the arrival rate and the work that make the utilization are both always there; with a server
down the head reads "**80% busy with all 3 up**". A `g-handle` slider on a full-width track with a stop per load (14
stops, positions linear in load, the fill in the accent: handles are UI), "10%" and "98%" under the ends on wide stages.
Its `aria-valuetext` is "70% busy, 70 requests a second". 8 px of space part the load from the band.

**The band** (the queue and the servers at one moment). Label row: the queue's label names the moment it shows (below),
and the servers' label says their load: "Server · 70% busy", "Servers · each 80% busy", "2 up · each 90% busy", "1 up ·
90% busy". Busy is only ever below 100%: past it, the offered load is a share of capacity, "2 up · 120% of capacity",
"1 up · 100% of capacity", in critical ink with a ×. On narrow stages the servers' label takes its own row (reserved per
width). Servers sit at the right, a column of boxes with a name (mono 13), a progress ring (the current tone grows around
the ring as the request in service is worked on; its dot sits in the middle), "idle" where it fits, an exit stub. Fewer
servers are drawn larger (one: 64 px boxes, ring 18 px; two: 44 px; three and four: 30 px), so one server fills the band
as four do. One shared queue: a lane from the left edge to a fork, amber dots (8 px radius for one server, 5 for four)
lined up from the fork leftward, oldest first, then "+N" in a chip when they pass the lane's room (the chip's own width
counted, so it never leaves the lane); the fork's curves run to every server. A queue each: a router diamond after
"random" on the inlet, curves to a lane per server, each lane its own amber line in front of its box. Lanes, the fork and
the router's curves are drawn in `--g-stroke` at 1.25 px (4.17:1 light, 3.98:1 dark: they are the routing E3 asks about);
lanes to a down server are dashed. A server down: hatched, dashed, "down" where it fits and a critical ×. Over capacity,
the boxes of the servers left take a critical outline. At rest, the request first in line says how long it has waited
("first in line: waiting 44 ms so far", then "first in line: 44 ms", "first: 44 ms"; sample, in warn ink, over the head
of the line it names, where it covers nothing). Under a shared line, where there is room, the last request to leave by
that moment is told in words: "Last to leave: waited 16 ms, then 26 ms of work" ("Last out: waited 16 ms, worked 26 ms";
with no wait "Last to leave: no wait, then 21 ms of work", "Last out: no wait, 21 ms"). It has no bar: a bar could share
neither the model bar's origin nor its scale in the band's room. It waits while the model's numbers wait (a sampled time
beside a hidden model time would read as the answer).

**The moment.** At rest the band shows one moment of the window, named on its own label and marked on the timeline (a
dotted line through every row, a ring on the waiting area there, the marker in the timeline's label row):

| Configuration                    | The moment                                                                 | Band label                                                       | Timeline marker                                                                 |
| -------------------------------- | -------------------------------------------------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| One shared queue                 | the first moment its line was longest                                      | "Queue at its longest · 10 waiting at 301 ms" ("Longest · ...")  | "drawn above: the longest queue, 10" ("above: the longest, 10", "longest: 10")   |
| A queue each                     | the longest single line while a server that is up sits idle               | "Queues · S1 idle beside a line of 16 at 398 ms" ("S1 idle beside 16, at 398 ms") | "drawn above: S1 idle beside a line of 16" ("S1 idle, 16 waiting", "idle beside 16", "idle, 16") |
| A queue each, no such moment, or an unstable ramp | the moment the most were waiting                            | "Queues at their fullest · 20 waiting at 376 ms" ("Fullest · ...") | "drawn above: the most waiting, 20" ("above: most, 20", "most: 20")             |
| Nobody waited                    | the window's end, no marker                                                | "Queue · nobody waited in this sample" ("Nobody waited ...")     | none                                                                            |

So the mechanism E3 teaches is on the stage whenever a queue each is chosen: seed 26159 at 4 servers and 80% rests on
S1 idle beside S3's line of 16 (the layout spec asserts an idle server beside a line of at least 5 in E3's asking frame;
the seed bound asks 8). During a play the band and the timeline follow the play's one clock and the label reads "Queue ·
1 waiting now" ("nobody waiting now"). The moment is the window's most telling one, and it says so; it is never offered
as typical.

**The timeline.** Space, not a rule, parts it from the band (16 px). Its label: "The last 400 ms of this sample" ("The
last 400 ms"); with no steady state "The first 4 s, starting empty" ("First 4 s, from empty", "4 s from empty"). A gutter of
row names, then rows on one time axis (0, 100, 200, 300, "400 ms"; every 200 ms or every second where ticks would touch):
arrival ticks (1.5 px, a tick per request; faded at 4 s, where they are a density), the number waiting as a stepped amber
area, and a row per server of busy blocks in the current tone, one block per request, back to back with no gap, with a
3 px notch of stage colour on the top edge where a request follows another without a pause: white is only ever idle
time. A hatched row for a server down. Server rows share 44 px.

**The waiting row's scale** is an axis, not an event: the smallest of 2, 5, 10, 20, 50, 100, 200, 500 and 1,000 that holds
the whole window (and the drift line's end), fixed for a whole play, so nothing already drawn shrinks as the queue grows.
A faint dotted line marks it across the row's top, its number at the line's left end. In an experiment the act's play
and the reveal keep the setup's scale, rising only if the new sample overflows it, so E3's shared queue and E4's steady
work show their shorter queues as shorter areas. A free change that moves the scale animates its number (240 ms).

**The model's drift.** With no steady state (ρ > 1) the waiting row also draws the model's expected queue from empty, a
dashed ink line rising at λ − m / S a second, keyed "the model: +40 a second" ("model: +40/s"; in the gutter under the
row's name as "+40/s" where the row has no room), so a noisy sample reads against the exact drift. At exactly 100% there
is no drift and no line.

**The model.** Headline: three columns, P99 (with a dashed critical swatch), P50 (solid current swatch), MEAN, each a
label over a 17 px mono value; the swatches are the chart's legend. Over capacity the row says "× No steady state" with
the swatches at its end, then "the queue grows by 40 requests a second" ("the queue grows by 40 a second", "grows by 40 a
second"); at exactly 100% "arrivals exactly match what the server left can serve" ("arrivals exactly match the capacity
left", "no slack left"). Then "ON AVERAGE" and one bar in a request's own order: the waiting (amber), then the work (10
ms, current tone), in proportion, "23 ms waiting" under its start and "10 ms of work" under its end, at least 16 px apart
(over capacity "waiting grows without bound", narrower "waiting: no bound"; a wait that would print as 0 reads "under
0.01 ms waiting"). Then two facts in body text, the second straight under the first's own lines and the block reserving
the most lines any setting needs at this width after both: "70% of requests wait at all." (steady: "...; the rest take
exactly 10 ms."; under 0.05%: "Under 0.1% of requests wait at all.") and "2.33 in the system at once on average: 70/s ×
33.3 ms (Little's law)." (the mean to one decimal under 100 ms, whole above, and L the printed rate times the printed
mean, so the line multiplies out as an interviewer would check it). Over capacity: "240/s arrive, and the 2 servers left
can serve 200/s." and "So 40 more arrive than leave each second, and every wait grows without bound."; at exactly 100%
"100/s arrive, exactly what the one server left can serve." and "With no slack, the queue wanders without a bound and the
waits keep growing."

**The chart.** "P50 AND P99 AGAINST UTILIZATION · LOG SCALE" with "100 REQUESTS" at the right on one row where it fits;
otherwise "P50 AND P99 · LOG SCALE" over "AGAINST UTILIZATION" ("BY UTILIZATION") and "100 REQUESTS", so phones keep both
the log scale and the axis's name. A plot of response time (log, 1 ms to 10 s, gridlines at each decade, labelled "1 ms"
... "10 s") against the utilization of the servers that are up (0 to 100%; ticks every 25% on a plot of 200 px or more,
else every 50%; the checker asks 6 px between tick labels), with this configuration's p50 (solid, current) and p99
(dashed, critical) from 0 to 99.5%, each named along its own side of its line only (p99 over, p50 under) where a name
covers nothing; the headline's swatches name them when a name finds no room. The cursor: a dotted vertical line at ρ, a
dot on each curve, their values ("154 ms", "23 ms", in the curves' inks, placed first, on a stage-coloured halo), and
dashed leaders to the marginal, drawn before any label so labels avoid them. Where p50 and p99 sit within 9 px (steady
work at low load) one marker carries both (the p50 dot in a p99 ring) and the two values stay apart, p99 over and p50
under ("13 ms", "10 ms"); one label "p50 and p99 10 ms" ("both 10 ms") only when they print the same. Over capacity the
cursor leaves the plot at its top right, where the curves leave as the waits grow without bound: a critical up-right
arrow at the plot's top corner (the spec asserts its y is the plot's top), and under it in the marginal column "120% of
capacity" and "no steady state". Utilizations print with one decimal where they have one, as the reveals do.

**Ghosts** keep the setting before a change, and never show while a question asks (3).

- A change that keeps the utilization (the queue, the work, the server count with every server up) leaves the old p99 as
  a dotted curve named for what it was: "p99, a queue each", "p99, one queue", "p99, random work", "p99, steady work",
  "p99, 2 servers", else "p99 before". The name sits only where the ghost is at least 10 px from both current curves, the
  nearest curve to it is the ghost and it is 24 px from another name; with no such place it is left out rather than
  ambiguous (the spec asserts the nearest curve).
- A change that moves the utilization (the load, a server down) would make an old curve lie: the axis is the load on the
  servers that are up, so "all three up" at 90% is not where the fleet was. It leaves the old cursor instead: hollow p50
  and p99 dots at the old ρ (one ringed hollow dot where they meet), the old p99 in muted ink ("before: 154 ms", the old
  p50 "23 ms" where it fits), and a dotted arrow to the new p99 dot or the chevron. It is left out where it would sit on
  the new dots. So E2's reveal keeps "from 70%", E5's "80% becomes 120%" and the free down toggle "60% becomes 90%".

**100 requests** (the marginal). Right of the plot, on the same time axis: the model's 100 quantiles as dots in rows
anchored at the ticks. The first 50 (levels 0.005 to 0.495) sit in rows wholly under the p50 tick, the next 49 in rows
wholly between the ticks, and the 100th (level 0.995) in a row wholly over the p99 tick; each row starts half a row plus a
1 px gap of stage colour off its tick (1.75 px from the tick's centre to a dot's edge), so no tick crosses a dot and the
curves visibly are the 50th and 99th of the 100. Where the ticks are closer than one row the marginal opens one row
between them and the p99 leader steps to its tick at the column's edge; when p50 and p99 are equal (steady work at
very low load, all 10 ms) one tick, half dashed, has 50 under it and 50 over. The dot size is the largest whose fullest
row fits the column (2.5 to 1.5 px radius wide, 2 to 1.25 on phones); a row that still overflows says "+N" beside it.
Steady work's requests that never wait all take exactly 10 ms: they are blue, and their count is always written under
their row ("97 at exactly 10 ms", "97 at 10 ms"), where steady work has no requests. Requests under 1 ms (random work)
sit in the lowest row and are counted inside the column beside it ("3 under 1 ms", "3 < 1 ms"). The layout spec asserts
the three zones' counts and that every drawn dot is wholly on its side of its ticks, at every setting and width.

**Fan-out.** At wide stages one muted model line under the chart, inside its outline: "Fan-out: a page that calls 50 of
these meets at least one slower than p99 on 39.5% of loads." (1 − 0.99^50; reserved at every wide width, hidden with
`numbers`). Phones leave it to the lesson text.

**Controls** (outside the stage, as Consistency & Quorums): Servers, a native radio group drawn as `g-segmented` (1, 2,
3, 4) in `fieldset.group.servers-control`; Queue, the same (One queue, A queue each); Conditions, two native checkboxes
drawn as toggles ("Steady work · 10 ms each", "A server down · its traffic moves"); the polite notice. At one server the
Queue radios and A server down are disabled (the house `input:disabled + span` opacity) and say why where they are: the
legend reads "QUEUE · one server has one queue" and the toggle "A server down · needs two or more" (in place, so the
controls keep their height). Describe sits under the stage.

**Layout.** At container wide the stage takes the left column (620 px at 1280) and the controls, the open question and
the cards the 340 px right column. Narrower, one column: the controls as the stage's first rows (stage background, no
border between), the stage, the open question, Describe, the cards. Below wide the notice is read out only (visually
hidden, as `_widget-controls.scss` does), so its length never moves the stage.

**Heights** depend only on the stage's width (every wrapped text reserves its longest form at that width; the band always
reserves four servers; the marginal and the chart are fixed). Measured in the mockup over every setting and every
experiment phase at 12 widths, and per pixel from 248 to 760 px over the default, the widest and the unstable settings
and every experiment phase:

| Stage width (px) | 248–286 | 287–374 | 375–457 | 458–531 | 532–585 | 586 and up |
| ---------------- | ------- | ------- | ------- | ------- | ------- | ---------- |
| Stage height     | 985     | 967     | 949     | 933     | 915     | 899        |

So 252 px (a 320 phone) is 985, 322 (390) and 344 (412) are 967, 620 (1280) is 899. `widget-heights.ts` gets the built
widget's measured whole heights at rest per host width; the mockup's whole-widget heights (its own page, so only a
guide): 1,710 at 320, 1,691 at 360, 375 and 390, 1,687 at 412 and 430, 989 at 1280.

**Motion** (3.5's grammar; WAAPI on transform and opacity; pooled particles, at most 60 live).

- **One clock.** A free play runs the sample's window on one monotone clock, screen time = 25 × model time (400 ms in
  10 s); over capacity, 2 × (4 s in 8 s). An experiment's answer plays the 200 ms of its new sample that end at its rest
  moment, also at 25 × (5 s), so the play ends on its climax; with no steady state the whole 4 s window in real time.
  The events before the slice are history and stand drawn when the play starts. The speed note is the running clock's own
  rate: "playing 25× slower" ("25× slower"), "playing in real time" ("real time"); omitted while `stability` hides.
  Nothing is drawn for an event before its moment: an arrival's tick and its dot joining the line land when the clock
  reaches its arrival (its dot travels the inlet for 300 ms of screen before it, a request in flight to the server); a
  request's service ring and busy block start at its start and grow with the clock; it leaves along the exit stub and
  fades at its departure; the waiting area extends with the clock. Queue dots are tracked by request id, so a line moving
  up one place slides (FLIP, at most 240 ms, never longer than one request's service on screen) and no dot re-animates.
- **The 120 ms rule.** No ring sweep, FLIP or particle runs shorter than 120 ms on screen: below it a ring is drawn full
  (busy) and queue dots step without sliding. At 25 × that leaves the requests under 4.8 ms; it covers both
  over-capacity plays (1 × and 2 ×), where no arrival travels: a request appears in the line at its moment and the "+N"
  chip's count swaps (never counts up) as the line grows.
- **The climax** is the rest moment: as the clock reaches it, the area there gets the 400 ms landing ring and the band is
  at the moment its label will name. When a free play ends the band crossfades (160 ms) to the rest moment, now marked.
- **An answer's play** applies the act (the load handle glides 240 ms, a control changes), keeps the setup's waiting
  scale, and plays the new sample's slice; hidden numbers stay "?" through it (3). At the reveal the model lands: values
  settle (400 ms), curves cut at the setup's load draw on to 99.5% and the cursor slides along them to the new load (520
  ms), the ghost keeps the setup (a curve or the old cursor with its arrow), and the focus outlines pulse. The sample is
  the play's payoff, so unlike Consistency & Quorums' E2 and E4 the mechanism always animates (LOOP.md's R41 follow-up).
- **Stop.** During a free play Play is Stop (a pause glyph, "Stop the sample"). Stop, or any change to the handle,
  Servers, Queue or Conditions, ends the play and draws the new rest state at once; the controls stay live during a free
  play, and only an answer's play locks them.
- **Plays pause** by the widget host's visibility (IntersectionObserver on the host, plus `visibilitychange`), never one
  stage's.
- **Reduced motion:** nothing moves. The stage is the rest state (the whole window, the band at its moment, the marker),
  so every mark and number is on the drawing. Play redraws it and shows what the sample did as a visible caption under
  the stage (HTML, outside the stage, so the stage's height stays a function of its width), also read out: "In this
  sample, 31 requests arrived in the last 400 ms. The line grew to 10 waiting at 301 ms; 3 were waiting at the end."
  (a queue each: "At 398 ms, S1 sat idle while 16 waited in S3's line; ..."). Arrivals are counted from the window's
  start (arrive ≥ 0) here, in the notice and in Describe.

## 3. The experiments

Every number is a slot from the model (`enum.cjs` prints them all); answer positions 3, 2, 1, 2, 3. A card sets the
widget up with complete settings, as a new start: whatever the learner had before leaves no ghost; answering plays its
act; the dock holds "your guess" ("Watch the picture: the answer plays out on it.") through the play; the reveal is read
out politely and its regions get a focus outline with the house "Look here" tag.

**E1 "Waiting at half load".** Setup 1 server, random, 50%; act `run: 'sample'`. Ask: "One server, 50% busy, so it sits
idle 50% of the time. Requests arrive at random, 50/s on average, and each needs 10 ms of work on average. On average,
how long does a request wait before the server starts on it?" Choices (ascending): "None: it has time to spare" / "2.5
ms: only the bursts wait" / **"10 ms: as long as the work itself"**. Truth: the mean wait, ρS / (1 − ρ). Reveal: "10 ms,
as long as the work itself. A request that arrives at a random moment finds the server busy 50% of the time, exactly its
utilization, so 50% of requests wait for the work ahead of them, 20 ms on average; over every request that is 10 ms, and
a request takes 20 ms in all. Waiting needs no overload, only collisions." Hides `sample` (asking only) and `numbers`
(asking and playing). While the sample hides, the band is drawn hidden the way the model bar is: dashed muted lanes and
ring tracks and a dashed chip in the lane, "Requests arrive after your answer" ("Arrivals after your answer", "After your
answer"), the label row "Queue"; never an idle server with nobody waiting, which would be the "None" answer's picture.
"Server · 50% busy" stays: it is the premise. Focus: the bar (work and waiting are equal halves: the answer drawn) and
the timeline (the bursts it comes from). Its play: 62 to 262 ms of the sample, 5 s.

**E2 "From 70% to 90% busy".** Setup 1 server, random, 70%; act `set: { load: 90 }`, `run: 'sample'`. Ask: "One server
at 70% busy: a request takes 33 ms on average, 10 ms of work and the rest waiting. Traffic grows by 28.6%, until the
server is 90% busy. What is the average now?" Choices (ascending): "43 ms: in step with the traffic" / **"100 ms: 3× as
long"** / "333 ms: 10× as long". Reveal: "100 ms: the mean is S / (1 − utilization), and going from 70% to 90% busy cuts
the idle share from 30% to 10%, so the time grows 3×. The work stays 10 ms; the waiting grows from 23 ms to 90 ms, and p99
from 154 ms to 461 ms. Each step of load costs more than the last, which is why a service that looked fine at 70% falls
over at 90%." Hides `ahead` (asking and playing: both curves stop at 70% with a dotted cut and "The rest after your
answer", "after your answer" or "?") and `after` (playing: the headline, bar, facts, cursor and 100 requests at 90%).
During the play the servers' label reads "Server · 90% busy", the question's own premise, and the old cursor stands at
70% as hollow dots ("before: 154 ms"); at the reveal its arrow runs to the new cursor at 90%. Focus: the chart, the bar.

**E3 "One queue or a queue each".** Setup 4 servers, a queue each, 80%; act `set: { queue: shared }`. Ask: "4 servers,
each 80% busy, each with its own queue, and every request goes to one of them at random: a request waits 40 ms on
average. Put all 4 behind one shared queue, at the same load. What is the average wait now?" Choices (ascending, one
shape and one precision): **"7.5 ms: about 5× shorter"** / "20 ms: half as long" / "40 ms: unchanged, each is as busy".
Reveal: "7.46 ms, 5.4× shorter: with a queue each, a request can wait behind a long one while another server sits idle;
here that happens 57.4% of the time. One shared queue hands each request to the first server that frees up, so it waits
only when all 4 are busy, which 59.6% of arrivals find, against 80% with a queue each. p99 falls from 230 ms to 69 ms.
This is why one line feeding a pool beats a line per checkout, and why least-loaded balancing beats random." Hides
`after` (playing: the new configuration's numbers and curves; the setup's p99 shows as the ghost "p99, a queue each").
While asking the band shows the premise and the mechanism: S1 idle beside S3's line of 16, named "Queues · S1 idle beside
a line of 16 at 398 ms" and "drawn above: S1 idle beside a line of 16". The play keeps the setup's waiting scale of 50,
so the shared queue's longest line of 9 fills a fifth of the row. Focus: the band, the numbers.

**E4 "Steadier work".** Setup 1 server, random, 90%; act `set: { service: steady }`. Ask: "One server, 90% busy.
Requests need 10 ms of work on average but vary at random, and wait 90 ms on average. Now every request takes exactly 10
ms. What is the average wait?" Choices (descending, each with its reason): "90 ms: unchanged, the load is the same" /
**"45 ms: half as long"** / "9 ms: a tenth, no request is slow any more". Reveal: "45 ms, exactly half. Arrivals still
collide at random, so the queue stays, but the Pollaczek-Khinchine formula ties the wait to how much service times vary
as well as to the load: the wait scales with (1 + CV²) / 2, where CV, the coefficient of variation, is the spread of
service times over their mean. Random times have a CV of 1 and steady ones 0, so steady halves the wait; work that varies
more than random (a few slow requests among many fast ones) waits longer still. p99 falls from 461 ms to 229 ms. Smaller,
more even units of work cut the tail without adding a server." Hides `after`. Focus: the bar, the chart (the ghost "p99,
random work" over the steady curves; the 100 requests' blue row at exactly 10 ms, "10 at 10 ms").

**E5 "Lose one of three".** Setup 3 servers, one shared queue, 80%; act `set: { down: 1 }`. Ask: "3 servers share one
queue at 80% busy, and p99 is 85 ms. One fails, and the others take its traffic. What is p99 now?" Choices: "127 ms: half
as long again, like the load" / "about 1 s: deep in the knee" / **"It never settles: the queue grows without bound"**
(two of the three sound alarming, so the odd one out is no cue). Truth: whether the 2 left are stable. Reveal: "It never
settles: 80% of 3 servers is 240/s, and the 2 left can serve only 200/s, so 40/s more arrive than leave, and the queue and
its waits keep growing. Losing one of 3 multiplies the load on the rest by 1.5×: 80% becomes 120%, and anything above
66.7% is more than 2 can serve. From 60%, the 2 left would run at 90%, with p99 233 ms. Size so the fleet minus one still
runs below the knee." (80%, not 75%: at 120% the 4 s window's drift of 160 is nearly four times its noise of about
√((240 + 200) × 4) ≈ 42, against 100 at 112.5%; and with E5 at 75% only one of the first 40,000 seeds met every bound.) Hides `after`, `utilization` (the servers read "2 up ·
each ?%", no critical outline or ×, no chevron) and `stability` (the timeline reads "The sample after the failure"
("After the failure"), with no speed note and no drift line; the axis keeps its 0 to 4 s). Its play is the whole 4 s in
real time, rings drawn full. At the reveal the hollow dots at 80% ("before: 85 ms") point their arrow at the chevron.
Focus: the chart, the band.

**E6 Challenge "busy, and safe when one fails".** Setup 2 servers, a queue each, 60%, one down (the remaining server at
120% of capacity: nothing settles). Ask: "A server has failed, and its traffic moved to the rest. Choose the servers, the
queue and the load so that p99 stays under 100 ms on the servers left while the fleet runs at least 60% busy with every
server up." Goal `all`: `p99` below 100, `load` at least 60; keep `down` 1 and `service` random. Of the 98 settings (2 to
4 servers × 2 queues × 14 loads, plus 1 server, which cannot lose one), exactly one passes: 4 servers, one shared queue,
60% (85 ms, 15% clear of the bound; 65% gives 121 ms). The status is the house checklist (no line over it until met),
under "Goal met:" while the goal holds and "You met it; now:" once the learner moves off it, each line in the house
`goalParts` form with its state in words: "p99 with one server down: 85 ms, under 100 ms: met" / "the fleet at 60% busy
with all up, at least 60%: met"; before: "p99 with one server down: grows without bound, needs under 100 ms: not yet".
Reveal: "4 servers sharing one queue at 60%: with one down, the 3 left are 80% busy and p99 is 85 ms. 3 servers at 60%
would leave 2 at 90%, p99 233 ms; a queue each would need the load down to 40%. A bigger pool runs hotter and still
rides out a failure: plan N+1 servers, each run at what the other N can absorb." No hides; Describe waits until the goal
is met ("Describe waits until you meet the goal.").

**One `hiding()` map** (prevention 1) from a question's regions to every surface; each region is named in the spec's own
`hide` list, so nothing is inferred from the act:

| Region        | When                    | On the stage                                                                                                                                                                              | Elsewhere                                                                                   |
| ------------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `sample`      | asking (E1)             | no request dots, ring arcs, "idle", head note, ticks, busy blocks, area, ring or marker; lanes and ring tracks dashed and muted, the chip "Requests arrive after your answer"; the timeline says the sample plays after the answer | the summary ("The sample of requests plays after your answer."), the notice, Describe      |
| `numbers`     | asking and playing (E1) | headline "?", dashed bar, the one hidden fact, no curves, cursor dots, leaders, ticks, 100 requests or fan-out ("after your answer"); the cursor line stays                               | the summary ("The model's numbers show after your answer."), notices, Describe, valuetext keeps the setting only |
| `after`       | playing (E2 to E5)      | everything `numbers` hides, at the act's new setting, plus the cursor and the new configuration's curves                                                                                  | as `numbers`                                                                                |
| `ahead`       | asking and playing (E2) | both curves end at the setup's utilization with a dotted cut and "The rest after your answer"                                                                                              | Describe (its table would list every load)                                                 |
| `utilization` | playing (E5)            | the servers' load ("2 up · each ?%"), the critical outlines and ×, the chevron and the marginal's "of capacity"                                                                            | the summary and notices (through `after`)                                                   |
| `stability`   | playing (E5)            | the window's length in words ("The sample after the failure"), the play's speed note and the drift line                                                                                    | as `after`                                                                                  |
| ghost         | asking (every question) | no ghost curve, hollow dots, arrow or ghost name: a card's setup is a new start                                                                                                            | none                                                                                        |

Hiding holds through the answer's own play and releases at the reveal. While any question asks or plays, Play, the load
handle, the Servers, Queue and Conditions fieldsets are disabled (`.play:disabled` at 0.55, `aria-disabled` on the
handle), the notice says "Play and the settings this question is about wait for your answer.", and Describe waits
("Describe waits for your answer."). Cards carry titles only.

## 4. Accessibility

- The stage is `role="group"`, `aria-roledescription="visualization"`, named "Latency and queueing: requests arriving at
  random to busy servers"; its SVG has a summary that obeys `hiding()`: "One server, 70% busy, requests taking 10 ms on
  average. The model gives p50 23 ms, p99 154 ms and a mean of 33 ms, of which 23 ms is waiting." (pool: "4 servers with
  one shared queue, 80% busy with all up, ..."; over capacity: "There is no steady state: 240/s arrive and the servers
  left serve 200/s, so the queue grows by 40 requests a second."; at exactly 100%: "There is no steady state: 100/s
  arrive, exactly what the server left can serve, so the queue wanders without a bound and the waits keep growing.").
- Play is a button ("Play the sample"; "Stop the sample" during a free play; "Play the sample, after your answer" while a
  question waits, disabled). The load is a `g-handle` slider, "Load, how busy the servers run", `aria-valuetext` "70%
  busy, 70 requests a second" ("80% busy with all 3 up, 240 requests a second"); arrows, Home, End, Page keys. Servers and
  Queue are native radio groups (one Tab stop each, arrows), the conditions native checkboxes; the dock is
  `app-widget-check`, whose checklist lines carry ": met" / ": not yet" in words (the ✓ and · are `aria-hidden`). There
  are no tappable marks on the stage, so no tap hints exist to clear (prevention 11).
- Notices (polite): after a change, a sentence about the new setting ("4 servers with one shared queue, each 80% busy:
  p99 69 ms, p50 13 ms, 59.6% of requests wait."); after a play, what the sample did (2, Reduced motion); the reveal is
  announced politely; nothing is announced while it hides.
- Colour is never alone: waiting is amber and in the line, service is blue and in the ring; p99 is dashed and named,
  p50 solid and named; down is hatch, dashes and the word; over capacity is ×, an arrow and words; the no-wait requests
  are blue and always counted in words; the drift is dashed and keyed. Tokens are the app's `--g-viz-*` (checked by
  `theme-contrast.spec.ts`); small text uses ink tokens that pass 4.5:1; the lanes and router curves use `--g-stroke`
  (3:1 for meaningful graphics in both themes).
- 44 px targets: Play, the handle (its hit box apart from Play's at every stop: checked), the segments and toggles.
- **Describe** (a `g-data-table` in a `minmax(0, 1fr)` grid, scrolling inside its own box): the summary sentence and the
  sample's line ("This sample: 31 requests arrived in the last 400 ms. The line grew to 10 waiting at 301 ms; 3 were
  waiting at the end."; a queue each: "... At 398 ms, S1 sat idle while 16 waited in S3's line; ..."; the most waiting:
  "The most were waiting at 376 ms: 20 across the 4 lines"), then a row per load stop for this configuration, the current
  one marked (`aria-current`) and scrolled into view inside the box when Describe opens. The box's height is its header
  plus 10.5 rows, measured, so a row is always cut through the middle and the box reads as one that scrolls. Columns:
  Load, then "Busy" (one server), "Each busy" (several) or "Load on each" (with a server down, where a row can pass
  100%: "120% (over)", "100% (full)"), Mean, p50, p99 (one decimal under 100 ms, whole above: "33.3 ms", "154 ms"), Wait
  at all ("<0.1%" under 0.05%). Past 100% the three time columns read "grows", with a note under the table "grows: no
  steady state; every wait grows without bound." Under a 560 px stage (the stage's measured width) it is `compact`: heads
  carry the unit ("Mean, ms", "p50, ms", "p99, ms"), cells are whole numbers, "∞" in all three time columns past 100%
  with the same note, so six columns fit 320 px without scrolling sideways; at 412, 1280 and 1440 px the full form fits.

## 5. The prevention list

1. **Giveaways while asking, on every surface.** The one `hiding()` map (3) feeds the stage, the summary, the notices,
   the handle's valuetext and Describe; Play, the handle and every control wait, so no play the learner starts can show
   an answer; the answer's play keeps the hiding until the reveal; a card's setup starts afresh, so no ghost of the
   learner's earlier setting can carry an answer in (E3 entered from 4 servers with one queue would draw the shared
   queue's p99; E4 entered from steady work would draw "half"). The mockup's `noAnswer()` (run by `shoot.cjs`) renders
   every question asking, entered from every act's target and the challenge's solution at 11 widths from 252 to 700 px
   and from all 26 configurations at 322 and 620 px, and its answer's play at five moments of its clock (920 renders),
   against each question's answer words (E5's include "starting empty", "from empty", "first 4 s", "× slower", "real
   time", "model:", "of capacity" and "120%"), the false claims (below) and structure: Play and the handle disabled; no
   sample mark and no solid lane or ring track while `sample` hides; no model mark (100 requests, cursor dots, bar fills,
   leaders, ticks, chevron, drift) and every headline stat "?" while numbers hide; no curve while `numbers` hides; no
   cursor during an `after` play; no curve past the cut while `ahead` hides; the servers' "?%" and no over-capacity mark
   while `utilization` hides; no drift line or speed note while `stability` hides; no ghost curve, hollow dot, arrow or
   ghost name while any question asks. It finds none, and it catches four planted leaks (E2 played without `after`; E1
   asked without `sample`; E5 played without `stability`; E3 asked with the ghost of the setting before it). The built
   component's sweep does the same with motion off and on, sampling the play frame by frame.
2. **False claims anywhere.** No hidden value has a default: hidden reads "?" or "after your answer", never 0. The false
   claim regexes ("0 waiting", "0% of requests", "0 more", "0 requests a second", "0 ms waiting", any "1xx% busy", NaN,
   undefined, Infinity) run over every free setting's stage at every swept width (5,064 renders) and over every page
   sentence of all 364 settings (the summary, the sample's story, Describe in both forms, the goal checks): none. So a
   value that would print as 0 says what it is ("Under 0.1% of requests wait at all.", "under 0.01 ms waiting", "nobody
   waited in this sample"), exactly 100% has its own words, and nothing past 100% is "busy". No sample number is
   presented as the model's: the sample's numbers are counts and times of drawn requests under labels that say
   "sample", "at 301 ms" or "now"; utilizations, percentiles and means are only the model's, and the one model mark in
   the sample half, the drift, says "the model". Every sentence is computed for its setting (steady work adds "the rest
   take exactly 10 ms" only when true; "p50 and p99 10 ms" only when they print the same; the busy head follows the
   count), and the reveals' word claims are slots or checked by `enum.cjs`. The layout spec also asserts that Little's
   law multiplies out as printed at every stable setting and that the speed note's number is the clock's rate.
3. **`$index` tracking.** Queue dots, ring dots, ticks, busy blocks and 100 requests carry stable ids (request index,
   quantile index); lines reorder as requests start, so the template tracks by id.
4. **Labels on lines; markers; rings.** Every stage text has a stage-coloured halo and is placed by a `Draw` that checks
   texts, marks and lines (curves, leaders, the cursor, the cut, the ghost and its arrow, lanes and their fork curves,
   the area's edge, the drift, the marker); marks and lines are laid before any label, and gridlines and the moving
   playhead run under grounded labels. Line names sit on their own side of their line only; a ghost's name sits nearest
   its own curve. Cursor dots sit on the curves they name. The checker flags text on text, a line through text, text on a
   mark, a dot on a dot, anything off the stage, x tick labels closer than 6 px, a text against a focus outline's
   stroke (neither 3 px inside nor 4 px clear) and any label with no place: zero over 180 screenshots, 5,064 setting
   renders and 297 experiment renders. Focus outlines take in their region's texts with 6 px to spare (3 at least); an
   outside text that would touch the stroke moves that side in or is taken in.
5. **Look-here tags.** House candidates on the outline's edge first (16 px off its corners), then just inside, then two
   inner rows, outside last; every experiment's frames have a placed tag at 11 widths, revealed and at the challenge.
6. **Marks before their event.** One monotone clock per play (2); each mark carries its model time (arrival, start,
   departure); ticks, dots, arcs and blocks appear when the clock reaches them, and the band never shows a request that
   has not arrived. The waiting scale is fixed for the play, so no drawn mark moves after it lands; the ring and marker
   appear only at rest.
7. **Visibility and reduced motion.** Plays pause on the widget host's visibility and the page's; Reduced motion draws
   the rest state, which holds every number and mark, and Play shows the sample's story as a caption.
8. **CSS specificity.** Every `fieldset.group` carries zero padding; a control's class only adds to it
   (`fieldset.group.servers-control`); the 320 px shots show the controls above the stage with no overlap.
9. **Words.** The summary, notices and facts are full sentences; plurals by count ("1 server", "4 servers", "1 was
   waiting", "31 requests"); "each 80% busy" only with several servers; "Busy" or "Each busy" by count; "of capacity",
   never "busy", past 100%; no sentence is spliced from chips. The challenge's status is the checklist with its states
   in words.
10. **Describe's width.** `minmax(0, 1fr)`, the table in its own scrolling box, compact under a 560 px stage, so it fits
    at 320 and 412 px and at 1280 and 1440 px; e2e checks no sideways page scroll at 320, 412, 1280 and 1440.
11. **Touch hints.** The stage has no tap targets but Play and the handle, so it has no hints to clear.
12. **Placeholder heights.** The stage height is a step function of width (2); `widget-heights.ts` gets the built
    widget's whole height at rest per host width from a measuring spec at 320, 360, 375, 390, 412 and 430 px and every
    50 px from 300 to 1,300, which fails on any drift over 3 px.
13. **Text measurement.** The mockup measures with canvas from the fonts the app ships; the build measures with
    per-character advances of the same fonts (Consistency & Quorums' `quorum-text.ts`), the label role uppercasing all
    but a unit after a number in both. This widget measures text, so it does LOOP.md's follow-up in the safe form: one
    `stage-text.ts` module (roles, `tw`, `wrap`, `partsWidth`, the advance tables) that Consistency & Quorums and this
    widget measure with, and that Data Modeling's `feed-layout.ts` uses through the same interface with its own fixed
    per-role advances kept as they are. Moving Data Modeling to measured advances would change its wrapping, its stage
    heights and its `widget-heights.ts` entries, so it stays a separate iteration (with feed-layout.spec, the
    placeholder re-measure at 320 to 430 px and on the 300 to 1,300 sweep, and a pixdiff of the Data Modeling lesson in
    both themes on desktop and a phone). Stage text never uses tabular digits, so measurement matches rendering; tables
    and the dock, which are HTML, keep `tabular-nums`.

## 6. What a learner can say in an interview afterwards

- "Utilization is arrival rate times service time. Random arrivals collide even at 50%: an arrival finds the server busy
  exactly as often as it is busy, so half of them wait."
- "For a single server with random arrivals and service, mean response is S / (1 − u): 2× at 50%, 3.3× at 70%, 10× at
  90%. From 70% to 90% is only 29% more traffic but three times the latency."
- "p99 is about 4.6 times the mean for M/M/1, so tails blow up first in absolute terms; I size against p99, not the
  mean. And with fan-out, a page that calls 50 services hits somebody's p99 on 40% of loads."
- "One shared queue in front of a pool waits far less than a queue per server at the same utilization (four servers at
  80%: 7.5 ms against 40 ms), because with a queue each a request can wait while another server idles, which happens
  more than half the time; that is why least-loaded balancing and work-stealing beat random assignment."
- "Variability costs latency: the wait scales with (1 + CV²) / 2, so steady service halves one server's wait at the same
  load (Pollaczek-Khinchine) and nearly halves a busy pool's, and real work that varies more than exponential waits
  longer; smaller, more uniform requests and isolating slow request types cut the tail without servers."
- "Little's law: requests in the system equal arrival rate times time in the system; it sizes pools and connection
  limits."
- "Headroom is about the fleet minus one: losing one of N multiplies the load on the rest by N / (N − 1). Three servers at
  80% become two at 120%, more than they can serve, so the queue grows without bound. Bigger pools can run hotter."

## 7. Lesson text fixes (`libs/engine/src/sysdesign/lessons/latency.ts`)

- `widget.tryThis` goes (the experiments replace it); `widget.experiments` takes `LATENCY_EXPERIMENTS`.
- "Why waiting explodes": after "Requests arrive in bursts, not evenly." add "An arrival finds the server busy exactly as
  often as it is busy, so at 50% half of all requests wait." Replace "and steadier service times cut the wait" with "and
  steady service times halve one server's wait at the same load (Pollaczek-Khinchine) and nearly halve a busy pool's".
- "Headroom": "Plan to run around 60 to 70% busy at peak. That keeps the tail flat, absorbs bursts and leaves room to lose
  a machine: with three servers at 60%, losing one puts the other two at 90%." is false at 70% for three servers (two at
  105% cannot keep up). Replace with: "Plan to run around 60 to 70% busy at peak in a large pool, and check the fleet minus
  one: losing one of N servers multiplies the load on the rest by N / (N − 1). Three servers at 60% become two at 90%;
  three at 70% become two at 105%, more than they can serve, and the queue grows without bound."
- "Size a fleet for a latency target", after step 4: add "That treats each server as its own queue, as random balancing
  does; least-loaded balancing behaves more like one shared queue and needs fewer." (every number in the example stays:
  100 / 4.6 ≈ 22 ms, 8 / 22 ≈ 0.36, so about 64%, 80 a server, 150 servers.)
- Nothing else changes: the why text's 10, 20 and 100 ms and 4.6×, the 40% fan-out figure (39.5%, as the stage's fan-out
  line prints it), the bottleneck example's 1.7× and 6.7× and the retry storm's 94% were checked against the model.

## Notes for the builder

- The mockup's geometry is the spec: the `Draw` placement order (marks and lines, then cursor values, then line names,
  then the ghost's words), the fallbacks for every label, the band's sizes by server count, the reserved rows, the
  marginal's zones. `latency-layout.ts` (a pure `buildStage(width, model, sample, view)` returning marks, as
  `quorum-stage.ts` does), `latency-words.ts` (`hiding()`, summary, notices, the sample's story, Describe, goal checks),
  `latency-motion.ts` (the clock, the play plans and appear times, the 120 ms rule), the component and its spec, a
  layout spec over every setting at 12 widths from 248 to 700 px with mid-play frame pairs (one waiting scale), ghosts
  of both kinds, and the assertions in 5 (zones, Little's law, the speed note, the chevron, the ghost's name, the false
  claims, E3's idle server), and e2e `latency-lesson.spec.ts`.
- The curves are 90 points per configuration (26 configurations), computed once per configuration and memoized; M/D/c's
  stationary law costs under 10 ms per point at 98% on a laptop, so a table is not needed, but the component should
  compute curves after first paint (a frame later, as Load Balancing's charts do).
- `content.md` (every string of the built widget, both checklist states included) is generated by a browser walk of the
  built widget, as for Data Modeling and Consistency & Quorums, and goes to content review with the experiments.
