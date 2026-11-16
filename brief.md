# Latency & Queueing widget (`queue-latency`): design brief

Redesign R41, the batch's third widget (REDESIGN.md 5.2: the R41 to R45 entry, its "Forms" bullet, the Data Modeling
note and the Consistency & Quorums note; LOOP.md rows 122 and 123 are the house references). Lesson:
`/design/topics/sd-latency`. Files beside this brief, on the orphan branch `design/r41-latency`:

| File          | What it is                                                                                                                                                                                                                                                                                        |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `model.js`    | The exact model (M/M/c, M/D/c, one shared queue or a queue each), the seeded sample and the six experiments as slot templates; ported to `libs/engine/src/sysdesign/lessons/widgets/queueing.ts` (beside `queueBacklog`, unchanged) and `latency-experiments.ts`                                |
| `enum.cjs`    | Prints every experiment number, proves the challenge has exactly one passing setting of 98, and checks the model against closed forms, Erlang's 1909 M/D/1 formula in BigInt arithmetic, and a discrete-event simulation of every configuration; picks the sample's seed (2,002 checks, all pass) |
| `mockup.html` | The mockup with the app's tokens and fonts: `?state=default\|quiet\|busy\|split\|pool\|steady\|down\|overload\|playing\|describe\|ask&exp=1..5\|reveal&exp=1..5\|challenge&theme=light\|dark`; `ask` also takes `&phase=playing` (the answer's play, hiding held) and `challenge` takes `&start=1`                         |
| `shoot.cjs`   | Screenshots every state at 1280, 390 and 320 px in both themes with the page's own collision report, then sweeps every setting at 11 widths (and mid-play), every experiment asking, playing and revealed, runs the no-answer sweep, proves it catches two planted leaks, and prints stage heights  |
| `changes.md`  | Each critique item and what changed for it                                                                                                                                                                                                                                                        |

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

| Idea                                            | Weight | Where                                                                                          |
| ----------------------------------------------- | ------ | ---------------------------------------------------------------------------------------------- |
| Utilization = arrival rate × service time       | core   | The load handle's own words ("70% busy · 70 requests/s"), the servers' "each 80% busy"          |
| The queue forming from random collisions        | core   | The band and the timeline; E1                                                                  |
| Mean S / (1 − u), the knee                      | core   | The curve; "where the time goes" bar; E2                                                        |
| p99 vs p50 (4.6 × mean, 6.6 × p50 for M/M/1)    | core   | The curve, the headline, 100 requests at the model's quantiles; E2's reveal                    |
| A pool sharing one queue (M/M/c, Erlang C)      | high   | Servers and Queue controls; the band shows an idle server beside a long line; E3                |
| Steadier work (M/D/1, Pollaczek-Khinchine)      | high   | Steady work toggle; the marginal's pile at exactly 10 ms; E4                                    |
| Headroom for a failure                          | high   | A server down toggle; the unstable state; E5 and the challenge                                  |
| Little's law                                    | medium | One line under the bar ("2.33 in the system at once: 70/s × 33 ms"), every setting              |
| Fan-out tails (1 − 0.99^n)                      | medium | Lesson text only: it is percentile arithmetic, not queueing; drawing it needs a second picture |
| Merged histograms, coordinated omission         | low    | Lesson text only: measurement practice, taught again by Observability (`error-budget`)          |

**Settings.** Servers c ∈ {1, 2, 3, 4}; queue one shared or a queue each (requests assigned at random); service random
(exponential, mean S = 10 ms) or steady (exactly 10 ms); one server down or not (two or more servers); load ρ₀, how busy
the fleet runs with every server up, at 14 stops (10, 20, 30, 40, 50, 60, 65, 70, 75, 80, 85, 90, 95, 98%). 364
settings. The arrival rate is λ = ρ₀ c / S (shown in requests a second); with one server down the m = c − 1 servers left
take all of it, ρ = λ S / m. Changing the server count keeps ρ₀ (a fleet of c at this load), which is what makes pool
comparisons fair; losing a server keeps λ (the same traffic, fewer servers), which is what headroom means.

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
- A queue each: each server that is up is its own M/M/1 or M/D/1 at λ / m.
- Unstable (ρ ≥ 1, only reachable with a server down): no steady state; the model says how fast the queue grows,
  λ − m / S per second.
- 100 requests: the model's quantiles at levels (i − 0.5)/100, so p99 lies between the 99th and 100th, and p50 between
  the 50th and 51st (checked).

**Checks** (`node enum.cjs`, 2,002 pass): M/M/1 against its closed forms at every load; M/D/1's mean wait against
Pollaczek-Khinchine ρS / (2(1 − ρ)) at every load (exact to 1e−9); M/D/1's waiting-time distribution against Erlang's
1909 formula P(W ≤ xD) = (1 − ρ) Σₖ (ρ(k − x))ᵏ / k! · e^(−ρ(k − x)), evaluated in 160-digit BigInt fixed point because
its terms cancel to 40 digits (66 points from 10 to 98%, largest gap 8e−15); a discrete-event FCFS simulation of every
configuration at 30, 60, 80 and 90% (76 configurations, 3 to 12 million requests each): mean, p50, p99 and the chance to
wait agree, the largest gaps 1.1%, 0.7% and 2.1% against tolerances of 2 to 8% (widening with 1 / (1 − ρ), as busy periods
lengthen); a shared queue never waits longer
than a queue each, steady never longer than random, p99 rises with load in every configuration, Little's law holds.
Every experiment number, its answer and the challenge's one solution are printed and checked.

**The sample** (what the upper half of the stage draws). A seeded run (mulberry32) with common random numbers: the same
stream of uniforms at every setting, so a higher load compresses the same arrivals and no request waits less (checked
request by request); 40,000 arrivals warm the system up, and the window is the 400 ms before the last one. With no
steady state the window is 4 s and starts empty (a ramp needs the window many times (λ + μ) / (λ − μ)²; enum.cjs checks
both unstable states ramp quarter by quarter). The seed (31) is the one of 64 whose windows sit closest to the model
(the window's busy share against ρ and its mean queue against λ W_q, averaged over every stable setting, again over the
experiments' settings, plus a quarter of the worst window), so the picture is typical. **Honesty rule:** the sample is drawn and labelled as a sample ("A
sample of random arrivals", "The last 400 ms of this sample", "8 waiting at 51 ms"); it is never summarized as a
percentile, a mean or a utilization. Every number in the lower half, the headline, the bar, the two facts, the curves,
the 100 requests and every experiment slot comes from the exact model.

**Engine work.** `widgets/queueing.ts` keeps `queueBacklog` and `Backlog` byte for byte and gains `LATENCY_SERVICE_MS`,
`LATENCY_LOADS`, `LATENCY_SERVERS`, `erlangC`, `mmcLatency`, `mdcLatency`, `latencyQuantile`, `latencyScenario(settings)`
and `latencyCurve`; `queueLatency` is retired (only the old widget and `widgets.spec.ts` use it). The seeded sample goes
to its own `widgets/latency-sample.ts` (`latencySample`, `sampleAt`, `waitingSteps`; one responsibility per file).
Settings are numbers, as `ExperimentSettings` requires: `load` (%), `servers`, `queue` (0 shared, 1 a queue each),
`service` (0 random, 1 steady), `down` (0 or 1). `latency-experiments.ts` holds the six specs. Framework: `ExperimentRun`
gains `'sample'`; `TEMPLATE_DIGITS_ALLOWED` gains `'S / (1 − utilization)'`; the hide regions are `sample`, `numbers`,
`after` and `ahead` (3). `queueing.spec.ts` pins every formula against the closed forms, Erlang's formula (BigInt) and a
smaller simulation, and `latency-experiments.spec.ts` pins every quoted number, the answers and the challenge's
enumeration.

## 2. The picture

One `g-stage`, read top to bottom as cause then consequence: a sample of requests (the load, the queue and the servers at
one moment, then the window as a timeline), then the exact model (the numbers, where the time goes, the curve and 100
requests). A hairline rule and a label start each part, so the eye knows which half is the sample and which the model.

**Header.** The play disc (36 px in a 44 px box, "Play the sample"), the label "A sample of random arrivals" (narrowest
form "Random arrivals"), and the key: an amber dot "waiting", a blue dot "in service" (beside the label when wide, its own
row on phones).

**Load.** "LOAD **70% busy** · 70 requests/s at random, 10 ms each on average" ("exactly 10 ms each" for steady work;
"70 requests/s at random" where the rest does not fit; phones put it under the track); with a server down, "**60% busy
with all 4 up** · 240 requests/s at random, ...". A `g-handle` slider on a full-width track with a stop per load (14 stops,
positions linear in load, the fill in the accent: handles are UI), "10%" and "98%" under the ends on wide stages. Its
`aria-valuetext` is "70% busy, 70 requests a second".

**The band** (the queue and the servers at one moment). Label row: "QUEUE · 8 WAITING AT 51 MS" left and "SERVER · 70%
BUSY" right ("SERVERS · EACH 80% BUSY", "3 UP · EACH 80% BUSY", "2 UP · EACH 112.5% BUSY" or "1 UP · 120% BUSY" with × in critical ink); on
narrow stages the servers' label takes its own row (reserved per width). Servers sit at the right, a column of boxes
with a name (mono 13), a progress ring (the current tone grows around the ring as the request in service is worked on;
its dot sits in the middle), "idle" where it fits, an exit stub. Fewer servers are drawn larger (one: 64 px boxes, ring
18 px; two: 44 px; three and four: 30 px), so one server fills the band as four do. One shared queue: a lane from the
left edge to a fork, amber dots (8 px radius for one server, 5 for four) lined up from the fork leftward, oldest first,
then "+N" in a chip when they pass the lane's room; the fork's curves run to every server. A queue each: a router
diamond after "random" on the inlet, curves to a lane per server, each lane its own amber line in front of its box, so
an idle server beside a long line is in plain sight. A server down: hatched, dashed, "down" where it fits and a critical
×, its lane dashed and empty. Over capacity, the boxes of the servers left take a critical outline. At rest, the
request first in line says how long it has waited ("first in line: waiting 65 ms so far", sample, in warn ink, placed
over the head of the longest line where it covers nothing, shorter forms after). Under the line, where there is room
(not with a queue each), the last request to leave by that moment is a small bar in the model bar's colours: "Last to
leave: waited 97 ms, then 54 ms of work" ("Last out: waited 97 ms, worked 54 ms"), so one request's waiting and work sit
above the model's average for every request. During a play it swaps at each departure; it waits while the model's
numbers wait (a sampled time beside a hidden model time would read as the answer).

**The moment.** At rest the band shows the moment the window's queue was longest, and the timeline marks it: a dotted
line at that moment, a ring on the waiting area's peak, and in the timeline's label row "drawn above: the longest queue, 8"
(shorter forms "above: the longest, 8", "above: 8"). During a play the band and the timeline follow the play's one clock.

**The timeline.** "THE LAST 400 MS OF THIS SAMPLE" ("THE LAST 400 MS" on phones; "THE FIRST 4 S, STARTING EMPTY" over
capacity). A gutter of row names, then rows on one time axis (0, 100, 200, 300, "400 ms"; every 200 ms or every second
where ticks would touch): arrival ticks (1.5 px, a tick per request; faded at 4 s, where they are a density), the number
waiting as a stepped amber area with its scale at the top of the gutter (2, 5, 10, 20, 50, ... the smallest that holds
the window's longest queue), and a row per server of busy blocks in the current tone, one block per request with a
hairline gap where the next starts (so a busy period is visibly many requests), a hatched row for a server down. Server
rows share 44 px (one server: a 44 px band of work and gaps).

**The model.** "RESPONSE TIME · EXACT, FROM THE MODEL" ("· THE MODEL" on phones). Headline: three columns, P99 (with a
dashed critical swatch), P50 (solid current swatch), MEAN, each a label over a 17 px mono value; the swatches are the
chart's legend. Over capacity the row says "× No steady state" and "the queue grows by 25 requests a second". Then "ON
AVERAGE" and one bar: the work (10 ms, current tone) and the waiting (amber) in proportion, "10 ms of work" under its
start and "23 ms waiting" under its end. Then two facts in body text, each reserving its longest form's lines per width:
"70% of requests wait at all." (steady: "...; the rest take exactly 10 ms.") and "2.33 in the system at once on average:
70/s × 33 ms (Little's law)."; over capacity, "225/s arrive, and the 2 servers left can serve 200/s." and "So 25 more
arrive than leave each second, and every wait grows without bound."

**The chart.** "P50 AND P99 AGAINST UTILIZATION · LOG SCALE" ("AGAINST UTILIZATION" on phones, with "100 REQUESTS" at the
right, on a second row where both do not fit). A plot of response time (log, 1 ms to 10 s, gridlines at each decade,
labelled "1 ms" ... "10 s") against the utilization of the servers that are up (0 to 100%; ticks every 25%, every 50% on
a plot under 180 px), with this configuration's p50 (solid, current) and p99 (dashed, critical) from 0 to 99.5%, each
named along its own side of its line only (p99 over, p50 under) where a name covers nothing; the headline's swatches name
them when a name finds no room. The cursor: a dotted vertical line at ρ, a dot on each curve, their values ("154 ms",
"23 ms", in the curves' inks, placed first, on a stage-coloured halo), and dashed leaders to the marginal. When p50 and p99
meet (steady work at low load, both exactly 10 ms) one dot carries both, ringed in critical, labelled "p50 and p99 10 ms"
("both 10 ms", then "10 ms"). After a change of configuration the previous one's p99 stays as a dotted ghost named for
what it was ("a queue each", "random work", "all three up", or "before"). Over capacity the cursor leaves the plot: a
critical chevron at its right edge and, in the marginal column, "112.5% busy" and "no steady state". Utilizations print with one decimal where they have one, as the reveals do.

**100 requests** (the marginal). Right of the plot, on the same time axis: the model's 100 quantiles as dots binned by
height (5 or 6 px pitch), each bin's dots side by side, so the column is the distribution on its side; a p50 tick and a
p99 tick (the leaders' colours) cross it, and exactly one dot lies past the p99 tick. The dot size is the largest whose
fullest bin fits the column (2.5 to 1.5 px radius wide, 2 to 1.25 on phones). Steady work's requests that never wait all
take exactly 10 ms; they are blue and, when they overflow their row, the rest are counted under it ("+70 more at 10 ms",
"+70 more"), where steady work has no requests. Requests under 1 ms (random work only) sit in the lowest bin and are
counted under the column ("3 under 1 ms", "3 < 1 ms").

**Controls** (outside the stage, as Consistency & Quorums): Servers, a native radio group drawn as `g-segmented` (1, 2,
3, 4) in `fieldset.group.servers-control`; Queue, the same (One queue, A queue each; disabled at one server); Conditions,
two native checkboxes drawn as toggles ("Steady work · 10 ms each", "A server down · its traffic moves"; the second
disabled at one server); the polite notice. Describe sits under the stage.

**Layout.** At container wide the stage takes the left column (620 px at 1280) and the controls, the open question and
the cards the 340 px right column. Narrower, one column: the controls as the stage's first rows (stage background, no
border between), the stage, the open question, Describe, the cards.

**Heights** depend only on the stage's width (every wrapped text reserves its longest form at that width; the band always
reserves four servers; the marginal and the chart are fixed). Measured in the mockup over every setting and every
experiment phase (one value per width at 10 sampled widths) and per pixel for the default and widest settings:

| Stage width (px) | 248–271 | 272–281 | 282–286 | 287–487 | 488–499 | 500–519 | 520–531 | 532 and up |
| ---------------- | ------- | ------- | ------- | ------- | ------- | ------- | ------- | ---------- |
| Stage height     | 993     | 975     | 959     | 941     | 925     | 907     | 883     | 865        |

So 252 px (a 320 phone) is 993, 322 (390) and 344 (412) are 941, 620 (1280) is 865. `widget-heights.ts` gets the built
widget's measured whole heights at rest per host width; the mockup's whole-widget heights (its own page, so only a
guide): 1,774 at 320, 1,722 at 360 and 375, 1,702 at 390, 1,698 at 412 and 430, 955 at 1280.

**Motion** (3.5's grammar; WAAPI on transform and opacity; pooled particles, at most 60 live).

- **One clock.** A free play runs the sample's window on one monotone clock, screen time = 25 × model time (400 ms in
  10 s); over capacity, 2 × (4 s in 8 s). An experiment's answer plays its new sample at 8 × (3.2 s), or 1 × over
  capacity. Nothing is drawn for an event before its moment: an arrival's tick and its dot joining the line land when the
  clock reaches its arrival (its dot travels the inlet for 300 ms of screen before it, a request in flight to the
  server); a request's service ring and busy block start at its start and grow with the clock; it leaves along the exit
  stub and fades at its departure; the waiting area extends with the clock. Queue dots are tracked by request id, so a
  line moving up one place slides (FLIP, at most 240 ms, never longer than one request's service on screen) and no dot
  re-animates.
- **Over capacity** no arrival travels (it would be a stream past the particle cap): a request appears in the line at
  its moment and the "+N" chip's count swaps (never counts up) as the line grows.
- **The climax** is the window's longest queue: as the clock reaches it, the waiting area's peak gets the 400 ms landing
  ring and the line in the band is at its longest. When the play ends the band crossfades (160 ms) to the rest moment,
  the same moment, now marked with its dotted line and "drawn above: the longest queue, 8".
- **An answer's play** applies the act (the load handle glides 240 ms, a control changes), clears the timeline and plays
  the new sample; hidden numbers stay "?" through it (3). At the reveal the model lands: values settle (400 ms), curves cut
  at the setup's load draw on to 99.5% and the cursor slides along them to the new load (520 ms), a ghost keeps the
  setup's p99, and the focus outlines pulse. The sample is the play's payoff, so unlike Consistency & Quorums' E2 and E4
  the mechanism always animates (LOOP.md's R41 follow-up).
- **Plays pause** by the widget host's visibility (IntersectionObserver on the host, plus `visibilitychange`), never one
  stage's. A settings change with no play running draws the rest state at once.
- **Reduced motion:** nothing moves. The stage is the rest state (the whole window, the band at the longest queue, the
  marker), so every mark and number is on the drawing; Play redraws it and the notice says what the sample did, in
  order: "In this sample, 34 requests arrived in the last 400 ms. The line grew to 8 waiting at 51 ms; 1 was waiting at
  the end." Every number is written, so nothing is lost.

## 3. The experiments

Every number is a slot from the model (`enum.cjs` prints them all); answer positions 3, 2, 1, 2, 3. A card sets the
widget up with complete settings; answering plays its act; the dock holds "your guess" ("Watch the picture: the answer
plays out on it.") through the play; the reveal is read out politely and its regions get a focus outline with the house
"Look here" tag.

**E1 "Waiting at half load".** Setup 1 server, random, 50%; act `run: 'sample'`. Ask: "One server, 50% busy, so it sits
idle 50% of the time. Requests arrive at random, 50/s on average, and each needs 10 ms of work on average. On average,
how long does a request wait before the server starts on it?" Choices (ascending): "None: it has time to spare" / "2.5
ms: only the bursts wait" / **"10 ms: as long as the work itself"**. Truth: the mean wait, ρS / (1 − ρ). Reveal: "10 ms,
as long as the work itself. A request that arrives at a random moment finds the server busy 50% of the time, exactly its
utilization, so 50% of requests wait for the work ahead of them, 20 ms on average; over every request that is 10 ms, and
a request takes 20 ms in all. Waiting needs no overload, only collisions." (Asking how many wait would be guessable from
"50% busy": the answer is the utilization itself; asking the wait is not, and the reveal still teaches that an arrival
finds the server busy exactly as often as it is busy.) Slots: load, idle, rate, service, quarter, chance,
waitWhenWaiting, meanWaitAll, mean; enum.cjs checks "as long as the work itself". Hides `sample` (asking only: no requests, ticks, busy blocks, area,
ring arc or head note; "REQUESTS ARRIVE AFTER YOUR ANSWER", "The sample plays after your answer") and `numbers` (asking
and playing: headline "?", the bar dashed with "work and waiting after your answer", one fact "Who waits, and how many
are in the system at once, show after your answer.", no curves, dots, leaders or 100 requests, "after your answer" in the
marginal; the cursor line stays at 50%, the premise). Focus: the bar (work and waiting are equal halves: the answer
drawn) and the timeline (the bursts it comes from). "Server · 50% busy" stays: it is
the premise, not the answer.

**E2 "From 70% to 90% busy".** Setup 1 server, random, 70%; act `set: { load: 90 }`, `run: 'sample'`. Ask: "One server
at 70% busy: a request takes 33 ms on average, 10 ms of work and the rest waiting. Traffic grows by 28.6%, until the
server is 90% busy. What is the average now?" Choices (ascending): "43 ms: in step with the traffic" / **"100 ms: 3× as
long"** / "333 ms: 10× as long". Reveal: "100 ms: the mean is S / (1 − utilization), and going from 70% to 90% busy cuts
the idle share from 30% to 10%, so the time grows 3×. The work stays 10 ms; the waiting grows from 23 ms to 90 ms, and
p99 from 154 ms to 461 ms. Each step of load costs more than the last, which is why a service that looked fine at 70%
falls over at 90%." Hides `ahead` (asking and playing: both curves stop at 70% with a dotted cut and "The rest after your
answer", "after your answer" or "?" beside it) and `after` (playing: the headline, bar, facts, cursor and 100 requests at
90% wait). Focus: the chart, the bar.

**E3 "One queue or a queue each".** Setup 4 servers, a queue each, 80%; act `set: { queue: shared }`. Ask: "4 servers,
each 80% busy, each with its own queue, and every request goes to one of them at random: a request waits 40 ms on
average. Put all 4 behind one shared queue, at the same load. What is the average wait now?" Choices (ascending, one
shape): **"7.46 ms: 5.4× shorter"** / "20 ms: half as long" / "40 ms: unchanged, each is as busy". Reveal:
"7.46 ms, 5.4× shorter: with a queue each, a request can wait behind a long one while another server sits idle. One
shared queue hands each request to the first server that frees up, so it waits only when all 4 are busy, which 59.6% of
arrivals find, against 80% with a queue each. p99 falls from 230 ms to 69 ms. This is why one line feeding a pool beats a
line per checkout, and why least-loaded balancing beats random." Hides `after` (playing: the new configuration's numbers
and curves; the setup's p99 shows as the "before" ghost). While asking the band shows the premise: an idle S2 beside S3's
line of 11. Focus: the band, the numbers.

**E4 "Steadier work".** Setup 1 server, random, 90%; act `set: { service: steady }`. Ask: "One server, 90% busy. Requests
need 10 ms of work on average but vary at random, and wait 90 ms on average. Now every request takes exactly 10 ms. What
is the average wait?" Choices (descending): "90 ms: the load is the same" / **"45 ms: half"** / "9 ms: no request is slow
any more". Reveal: "45 ms, exactly half. Arrivals still collide at random, so the queue stays, but the
Pollaczek-Khinchine formula ties the wait to how much service times vary as well as to the load, and random times double
the wait that steady ones give at the same load. p99 falls from 461 ms to 229 ms. Smaller, more even units of work cut
the tail without adding a server." Hides `after`. Focus: the bar, the chart (the ghost "random work" over the steady
curves; the 100 requests' blue no-wait row at exactly 10 ms).

**E5 "Lose one of three".** Setup 3 servers, one shared queue, 75%; act `set: { down: 1 }`. Ask: "3 servers share one
queue at 75% busy, and p99 is 71 ms. One fails, and the others take its traffic. What is p99 now?" Choices: "107 ms: half
as long again, like the load" / "355 ms: about five times as long" / **"It never settles: the queue grows without
bound"**. Truth: whether the 2 left are stable. Reveal: "It never settles: 75% of 3 servers is 225/s, and the 2 left can
serve only 200/s, so 25/s more arrive than leave, and the queue and its waits keep growing. Losing one of 3 multiplies
the load on the rest by 1.5×: 75% becomes 112.5%, and anything above 66.7% is more than 2 can serve. From 60%, the 2 left
would run at 90%, with p99 233 ms. Size so the fleet minus one still runs below the knee." (75%, not 70%: at 112.5% the
4 s window's drift outruns its noise, so the play shows a ramp; at 105% it would look like a busy steady queue.) Hides
`after`, including the servers' new utilization ("2 UP · EACH ?% BUSY") and the over-capacity chevron, headline and
marginal, since 112.5% is the answer. Focus: the chart, the band.

**E6 Challenge "busy, and safe when one fails".** Setup 2 servers, a queue each, 60%, one down (the remaining server at
120%: nothing settles). Ask: "A server has failed, and its traffic moved to the rest. Choose the servers, the queue and
the load so that p99 stays under 100 ms on the servers left while the fleet runs at least 60% busy with every server up."
Goal `all`: `p99` below 100, `load` at least 60; keep `down` 1 and `service` random. Of the 98 settings (2 to 4 servers ×
2 queues × 14 loads, plus 1 server, which cannot lose one), exactly one passes: 4 servers, one shared queue, 60% (85 ms,
15% clear of the bound; 65% gives 121 ms). The status is the house checklist (no line over it until met), under "Goal met:" while the
goal holds and "You met it; now:" once the learner moves off it: "✓ p99 with one server down: 85 ms, under 100 ms" / "✓ the fleet at
60% busy with all up, at least 60%" ("· p99 with one server down: no steady state, under 100 ms" before). Reveal: "4
servers sharing one queue at 60%: with one down, the 3 left are 80% busy and p99 is 85 ms. 3 servers at 60% would leave 2
at 90%, p99 233 ms; a queue each would need the load down to 40%. A bigger pool runs hotter and still rides out a
failure: plan N+1 servers, each run at what the other N can absorb." No hides; Describe waits until the goal is met.

**One `hiding()` map** (prevention 1) from a question's regions to every surface:

| Region    | When                    | On the stage                                                                                                                                                                  | Elsewhere                                                                                   |
| --------- | ----------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| `sample`  | asking (E1)             | no request dots, ring arcs, "idle", head note, ticks, busy blocks, area, peak ring or marker; "REQUESTS ARRIVE AFTER YOUR ANSWER" ("ARRIVALS AFTER YOUR ANSWER"); the timeline says the sample plays after the answer | the summary ("The sample of requests plays after your answer."), the notice, Describe      |
| `numbers` | asking and playing (E1) | headline "?", dashed bar, the one hidden fact, no curves, cursor dots, leaders, ticks or 100 requests ("after your answer"); the cursor line stays                             | the summary ("The model's numbers show after your answer."), notices, Describe, valuetext keeps the setting only |
| `after`   | playing (E2 to E5)      | everything `numbers` hides, at the act's new setting, plus the cursor; the new configuration's curves (the setup's p99 stays as "before"); the servers' utilization when the act changes it (E5) | as `numbers`                                                                                |
| `ahead`   | asking and playing (E2) | both curves end at the setup's utilization with a dotted cut and "The rest after your answer"                                                                                  | Describe (its table would list every load)                                                 |

Hiding holds through the answer's own play and releases at the reveal. While any question asks or plays, Play, the load
handle, the Servers, Queue and Conditions fieldsets are disabled (`.play:disabled` at 0.55, `aria-disabled` on the
handle), the notice says "Play and the settings this question is about wait for your answer.", and Describe waits
("Describe waits for your answer."), the unmet challenge included. Cards carry titles only.

## 4. Accessibility

- The stage is `role="group"`, `aria-roledescription="visualization"`, named "Latency and queueing: requests arriving at
  random to busy servers"; its SVG has a summary that obeys `hiding()`: "One server, 70% busy, requests taking 10 ms on
  average. The model gives p50 23 ms, p99 154 ms and a mean of 33 ms, of which 23 ms is waiting." (pool: "4 servers with
  one shared queue, 80% busy with all up, ..."; over capacity: "There is no steady state: 225/s arrive and the servers
  left serve 200/s, so the queue grows by 25 requests a second.").
- Play is a button ("Play the sample"; "Play the sample, after your answer" while a question waits, disabled). The load is
  a `g-handle` slider, "Load, how busy the servers run", `aria-valuetext` "70% busy, 70 requests a second" ("60% busy with
  all 4 up, 240 requests a second"); arrows, Home, End, Page keys. Servers and Queue are native radio groups (one Tab stop
  each, arrows), the conditions native checkboxes; the dock is `app-widget-check`. There are no tappable marks on the
  stage, so no tap hints exist to clear (prevention 11).
- Notices (polite): after a change, a sentence about the new setting ("4 servers with one shared queue, each 80% busy:
  p99 69 ms, p50 13 ms, 59.6% of requests wait."); after a play, what the sample did (2, Reduced motion); the reveal is
  announced politely; nothing is announced while it hides.
- Colour is never alone: waiting is amber and in the line, service is blue and in the ring; p99 is dashed and named,
  p50 solid and named; down is hatch, dashes and the word; over capacity is × and words; the no-wait requests are blue and
  counted in words. Tokens are the app's `--g-viz-*` (checked by `theme-contrast.spec.ts`); small text uses ink tokens
  that pass 4.5:1 (current and critical inks pass on the stage in both themes).
- 44 px targets: Play, the handle (its hit box apart from Play's at every stop: checked), the segments and toggles.
- **Describe** (a `g-data-table` in a `minmax(0, 1fr)` grid, scrolling inside its own box, at most 300 px tall): the summary
  sentence and the sample's line ("This sample: 34 requests arrived in the last 400 ms, and the line was longest at 51 ms,
  with 8 waiting, the moment the drawing shows."), then a row per load stop for this configuration, the current one marked (`aria-current`): Load, Each
  busy, Mean, p50, p99, Wait at all ("grows" and "–" past 100%). Under a 560 px stage it is `compact`: heads carry the unit
  ("Mean, ms", "p50, ms", "p99, ms"), cells are bare numbers ("∞" past 100%), so six columns fit 320 px without scrolling
  sideways; at 412, 1280 and 1440 px the full form fits.

## 5. The prevention list

1. **Giveaways while asking, on every surface.** The one `hiding()` map (3) feeds the stage, the summary, the notices,
   the handle's valuetext and Describe; Play, the handle and every control wait, so no play the learner starts can show
   an answer; the answer's play keeps the hiding until the reveal. The mockup's `noAnswer()` (run by `shoot.cjs`) renders
   every question asking and its answer's play at five moments (0, 15, 45, 80, 100% of the window) at 11 widths from 252
   to 700 px (330 renders) against each question's answer words, false claims (regexes: "0 waiting" as a hidden default,
   "0% of requests", NaN, undefined, Infinity) and structure: Play and the handle disabled; no sample mark while `sample`
   hides; no model mark (100 requests, cursor dots, bar fills, leaders, ticks, chevron) and every headline stat "?" while
   numbers hide; no curve while `numbers` hides; no cursor during an `after` play; no curve past the cut while `ahead`
   hides; no new utilization during E5's play. It finds none, and it catches both planted leaks (E2 played without
   `after`; E1 asked without `sample`). The built component's sweep does the same with motion off and on, sampling the
   play frame by frame.
2. **False claims anywhere.** No hidden value has a default: hidden reads "?" or "after your answer", never 0 (the sweep's
   regexes). No sample number is presented as the model's: the sample's numbers are counts and times of drawn requests
   under labels that say "sample", "at 51 ms" or "now"; utilizations, percentiles and means are only the model's. Every
   sentence is computed for its setting (steady work adds "the rest take exactly 10 ms" only when it is true; over
   capacity replaces the facts; "first in line" only at rest), and the reveals' word claims ("exactly half", "3×",
   "1.5×") are slots or checked by `enum.cjs`.
3. **`$index` tracking.** Queue dots, ring dots, ticks, busy blocks and 100 requests carry stable ids (request index,
   quantile index); lines reorder as requests start, so the template tracks by id.
4. **Labels on lines; markers; rings.** Every stage text has a stage-coloured halo and is placed by a `Draw` that checks
   texts, marks and lines (curves, leaders, the cursor, the cut, lanes and their fork curves, the area's edge, the marker);
   gridlines run under grounded labels. Line names sit on their own side of their line only. Cursor dots sit on the curves
   they name; when p50 and p99 meet they become one dot in a ring whose stroke stays 2.5 px inside its neighbours. The
   checker flags text on text, a line through text, text on a mark, a dot on a dot, anything off the stage and any label
   with no place: zero over 2,040 setting renders and 187 experiment renders.
5. **Look-here tags.** House candidates (frame edges 16 px off corners, just inside, the gutter outside) plus two
   interior rows under the frame's top; every experiment's frames have a placed tag at 11 widths, revealed and at the
   challenge (checked).
6. **Marks before their event.** One monotone clock per play (2); each mark carries its model time (arrival, start,
   departure); ticks, dots, arcs and blocks appear when the clock reaches them, and the band never shows a request that
   has not arrived. The peak ring and marker appear only at rest, when the whole window is past.
7. **Visibility and reduced motion.** Plays pause on the widget host's visibility and the page's; Reduced motion draws the
   rest state, which holds every number and mark.
8. **CSS specificity.** Every `fieldset.group` carries zero padding; a control's class only adds to it
   (`fieldset.group.servers-control`); the 320 px shots show the controls above the stage with no overlap.
9. **Words.** The summary, notices and facts are full sentences; plurals by count ("1 server", "4 servers", "1 is
   waiting", "34 requests"); "each 80% busy" only with several servers; no sentence is spliced from chips. The challenge's
   status is the checklist under "Goal met:" only while both bounds hold.
10. **Describe's width.** `minmax(0, 1fr)`, the table in its own scrolling box, compact under a 560 px stage, so it fits at
    320 and 412 px and at 1280 and 1440 px; e2e checks no sideways page scroll at 320, 412, 1280 and 1440.
11. **Touch hints.** The stage has no tap targets but Play and the handle, so it has no hints to clear.
12. **Placeholder heights.** The stage height is a step function of width (2); `widget-heights.ts` gets the built widget's
    whole height at rest per host width from a measuring spec at 320, 360, 375, 390, 412 and 430 px and every 50 px from
    300 to 1,300, which fails on any drift over 3 px.
13. **Text measurement.** The mockup measures with canvas from the fonts the app ships; the build measures with
    per-character advances of the same fonts (Consistency & Quorums' `quorum-text.ts`). This widget measures text, so it
    does LOOP.md's follow-up: one `stage-text.ts` module (roles, advances, `tw`, `wrap`, `partsWidth`) shared by
    Consistency & Quorums, Data Modeling (its fixed per-role advances in `feed-layout.ts` give way to the measured ones,
    rounded up the same way) and this widget. Stage text never uses tabular digits, so measurement matches rendering;
    tables and the dock, which are HTML, keep `tabular-nums`.

## 6. What a learner can say in an interview afterwards

- "Utilization is arrival rate times service time. Random arrivals collide even at 50%: an arrival finds the server busy
  exactly as often as it is busy, so half of them wait."
- "For a single server with random arrivals and service, mean response is S / (1 − u): 2× at 50%, 3.3× at 70%, 10× at
  90%. From 70% to 90% is only 29% more traffic but three times the latency."
- "p99 is about 4.6 times the mean for M/M/1, so tails blow up first in absolute terms; I size against p99, not the
  mean."
- "One shared queue in front of a pool waits far less than a queue per server at the same utilization (four servers at
  80%: 7.5 ms against 40 ms), which is why least-loaded balancing and work-stealing beat random assignment."
- "Variability costs latency: steady service halves the wait at the same load (Pollaczek-Khinchine), so smaller, more
  uniform requests and isolating slow request types cut the tail without servers."
- "Little's law: requests in the system equal arrival rate times time in the system; it sizes pools and connection
  limits."
- "Headroom is about the fleet minus one: losing one of N multiplies the load on the rest by N / (N − 1). Three servers at
  75% become two at 112.5%, more than they can serve, so the queue grows without bound. Bigger pools can run hotter."

## 7. Lesson text fixes (`libs/engine/src/sysdesign/lessons/latency.ts`)

- `widget.tryThis` goes (the experiments replace it); `widget.experiments` takes `LATENCY_EXPERIMENTS`.
- "Why waiting explodes": after "Requests arrive in bursts, not evenly." add "An arrival finds the server busy exactly as
  often as it is busy, so at 50% half of all requests wait." Replace "and steadier service times cut the wait" with "and
  steady service times halve the wait at the same load (the Pollaczek-Khinchine formula)".
- "Headroom": "Plan to run around 60 to 70% busy at peak. That keeps the tail flat, absorbs bursts and leaves room to lose
  a machine: with three servers at 60%, losing one puts the other two at 90%." is false at 70% for three servers (two at
  105% cannot keep up). Replace with: "Plan to run around 60 to 70% busy at peak in a large pool, and check the fleet minus
  one: losing one of N servers multiplies the load on the rest by N / (N − 1). Three servers at 60% become two at 90%;
  three at 70% become two at 105%, more than they can serve, and the queue grows without bound."
- "Size a fleet for a latency target", after step 4: add "That treats each server as its own queue, as random balancing
  does; least-loaded balancing behaves more like one shared queue and needs fewer." (every number in the example stays:
  100 / 4.6 ≈ 22 ms, 8 / 22 ≈ 0.36, so about 64%, 80 a server, 150 servers.)
- Nothing else changes: the why text's 10, 20 and 100 ms and 4.6×, the 40% fan-out figure, the bottleneck example's 1.7×
  and 6.7× and the retry storm's 94% were checked against the model.

## Notes for the builder

- The mockup's geometry is the spec: the `Draw` placement order (cursor values, then line names, then the ghost's name),
  the fallbacks for every label, the band's sizes by server count, the reserved rows. `latency-layout.ts` (a pure
  `buildStage(width, model, sample, view)` returning marks, as `quorum-stage.ts` does), `latency-words.ts` (`hiding()`,
  summary, notices, Describe), `latency-motion.ts` (the clock and appear times), the component and its spec, a layout spec
  over every setting at 12 widths from 248 to 700 px plus mid-play frames, and e2e `latency-lesson.spec.ts`.
- The curves are 90 points per configuration (32 configurations), computed once per configuration and memoized; M/D/c's
  stationary law costs under 10 ms per point at 98% on a laptop, so a table is not needed, but the component should
  compute curves after first paint (a frame later, as Load Balancing's charts do).
- `content.md` (every string of the built widget) is generated by a browser walk of the built widget, as for Data
  Modeling and Consistency & Quorums, and goes to content review with the experiments.
