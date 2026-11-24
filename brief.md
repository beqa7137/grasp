# CDNs & Edge widget (`cdn`): design brief

Redesign R42, the batch's fourth remaining widget (REDESIGN.md 5.2: the R41 to R45 entry, its "Forms" bullet, which
names no picture for `cdn`, and the notes of the R41 widgets from Data Modeling to Storage Engines; LOOP.md rows 122 to
128 are the house references). Lesson: `/design/topics/sd-cdn`. Files beside this brief, on the orphan branch
`design/r42-cdn`:

| File          | What it is |
| ------------- | ---------- |
| `model.js`    | The analytic model (the old `cdnOutcome`'s rule, with the shield corrected and the edge's distance added), everything the picture reads (shares, rates, paths, half-hit ranks, the square's exact column areas, the three lanes), the seeded sample and its seed rule, the word formatting, and the five experiments and the challenge as slot templates; ported to `libs/engine/src/sysdesign/lessons/widgets/cdn.ts` and `cdn-experiments.ts` |
| `enum.cjs`    | Prints every number, checks the model against the old `cdnOutcome`, the lesson's quoted numbers, a discrete-event simulation of Zipf requests through a TTL cache at every location and at the shield, the square's areas, the sample, the experiments' text and word claims, and enumerates the challenge (4,945 checks; `--quick` skips the long simulations) |
| `mockup.html` | The mockup with the app's tokens and fonts: `?state=default\|shield\|many\|few\|short\|long\|busy\|quiet\|utm\|ghost\|playing(&frac=)\|describe\|reduced\|ask&exp=1..5(&phase=playing&frac=)\|reveal&exp=1..5\|challenge(&start=1)&theme=light\|dark`; any free state also takes `&rps=&pops=&ttl=&shield=&variants=` |
| `shoot.cjs`   | Screenshots every state at 1280, 390 and 320 px in both themes with the page's collision report and layout assertions, then sweeps all 192 settings at 14 stage widths at rest and at two moments of the play, every experiment asking, playing and revealed, the no-answer sweep (motion off and on) with a planted leak on each flag of the hiding map, the load-time stage against every answer, every sentence the page can print, the stage heights and the whole widget's heights per host width |
| `changes.md`  | Each critique item and what changed for it (round 0, the designer's own), and what is left open for the critics |

## 1. The verdict, and the mechanism

**Today's widget against the bar.** Two sliders, four TTL buttons, a checkbox, one stacked bar and three tiles. Every
number is right, and none of them is a picture of why. A learner can move the locations slider from 20 to 100, watch
"Edge hits" fall from 69% to 56% and the origin rise from 3,100 to 4,400 a second, and still not be able to say why
more locations make the origin busier, what a TTL does to one object's copy, why the most popular objects are safe and
the tail is not, or what the shield actually catches. That is the whole interview question ("your origin serves 10,000
requests a second of images: what does a CDN cut that to, what decides the hit rate, and why would you add a shield?"),
and the widget answers it with outcomes only. The three `tryThis` lines carry the reasoning in prose the learner must
read beside the controls; the owner's verdict ("just slide and buttons and no visual representation") holds. It also
teaches one false lesson: users reach the edge in 10 ms whatever the number of locations, so 1 location looks best on
every count, and the trade a CDN is bought for (closer edges against colder caches) is invisible.

**What the learner must see.** One request, then all of them.

- A user reaches the nearest of the CDN's locations (anycast or DNS steering): fewer, farther locations cost round
  trips on every request; more locations bring the edge closer.
- Each location keeps its own copies. A copy is fetched by a miss and lives for the TTL; every request for that object
  at that location within the TTL hits. So what decides a hit is how often an object is asked for **at one location
  within one TTL**: r·T. A popular object is asked for again long before its copy expires; a rare one never is.
- Popularity is a Zipf curve: a few objects take most requests, and a long tail of rare ones takes the rest (the
  90,000 least popular of 100,000 images take 19% of all requests). No edge keeps the tail warm.
- Adding locations splits the same traffic into more separate caches: each sees each object less often, so its hit
  rate falls and the origin works harder. An origin shield, one mid tier every location asks on a miss, sees every
  location's misses combined and gives the origin its load back.
- Each path has its latency: the edge's, plus the shield's on an edge miss, plus the origin's on a shield miss; the
  mean is their mix.

**The model (`model.js`, ported 1:1).** 100,000 objects with Zipf popularity, exponent 1: the object at rank k takes
the share w_k = (1/k) / H_N of all requests (H_N = 12.09, the 100,000th harmonic number). `rps` requests a second,
spread evenly over `pops` locations and, when the cache key is not normalized, over `variants` URLs an object. For one
key (one URL of one object):

- r = rps · w_k / variants, all locations together; at one location r / pops.
- Edge hit: h_e = x / (1 + x) with x = (r / pops) · T. This is exact for Poisson requests and a TTL counted from the
  miss: each copy's life is one miss followed on average by x hits (enum.cjs's simulation agrees to 0.06 points).
- Shield hit: h_s = y / (1 + y) with y = r (1 − h_e) (pops − 1) / pops · T. The shield sees every location's misses,
  but a location that misses fetched its own last copy at least a TTL ago, so only the **other** locations' misses can
  have left the shield a copy. The old `cdnOutcome` used all the misses (y = r (1 − h_e) T): it gave one location and a
  shield 5.4% shield hits where the simulation finds none (both copies were fetched by the same miss and expire
  together), and it was 0.2 to 0.4 points optimistic elsewhere. The corrected rule matches the simulation within 0.16
  points at every setting simulated, and it has a clean consequence the reveal of E3 uses: (1 − h_e)(1 − h_s) =
  1 / (1 + r·T), so **with a shield, the origin sees what one cache seeing all the traffic would send, whatever the
  number of locations** (enum.cjs checks it at all 96 shield settings).
- Shares: edge = Σ w_k h_e; shield = Σ w_k (1 − h_e) h_s; origin = the rest. Rates are shares of `rps`.
- Latency: users reach the nearest of n locations in 10 ms × √(20 / n) (users spread evenly over a plane, so the nearest
  of n evenly spread locations is about 1 / √n away; 44.7 ms at 1, 20 at 5, 10 at 20, 4.5 at 100); the shield adds
  30 ms; the origin adds 120 ms. Paths: an edge hit, the edge's; a shield hit, + 30 ms; an origin fetch, + 120 ms (and
  + 30 with a shield in the way). Mean = Σ share × path. Times are one request on a warm connection; a new connection
  also pays its TCP and TLS round trips, which end at the nearest location, so a CDN saves several long round trips,
  not one (the note says so).
- Freshness: a copy fetched from the shield lives a full TTL at the edge (the Age header is ignored), so with a shield
  an image can be up to two TTLs old (enum.cjs simulates it: 1.98 TTLs at most with a shield, 1.00 without). Real
  shields pass Age and the edge keeps only the shield copy's remaining life; the model's simpler rule keeps every
  checked number, and the note and the lesson say what it assumes. The challenge's cap is therefore "each cache may
  keep an image at most 5 minutes", never "at most 5 minutes stale".
- The half-hit rank (where a band of the square crosses one half): at the edge x = 1, rank = rps · T / (H_N · variants ·
  pops); at the shield y = 1, rank = rps · T (pops − 2) / (H_N · variants · pops) (a shield with fewer than 3 locations
  never reaches one half for any object).

The old rule's edge hit rate, origin share and rate are unchanged at every setting without a shield, and its mean
response at 20 locations (enum.cjs check 1), so every number the lesson quotes without a shield stands (69%, 3,100 a
second, 47 ms; 91, 80 and 56% at 1, 5 and 100 locations; 49, 82 and 96% at 5 seconds, 5 minutes and an hour; 50 and
87% at 1,000 and 100,000 a second). With the shield the origin's 886 a second becomes 913 (the lesson's "about 890"
becomes "about 910"; section 7), and an hour's TTL with the shield 27 a second (the lesson's 26).

**Settings.** Traffic 1,000, 10,000 or 100,000 requests a second; edge locations 1, 5, 20 or 100; TTL 5 seconds,
1 minute, 5 minutes or 1 hour; the shield on or off; the cache key the path only or with a tracking parameter of 10
values. 192 settings, all numbers as `ExperimentSettings` requires: `rps`, `pops`, `ttl` (seconds), `shield` (1 or 0),
`variants` (1 or 10).

**What the widget draws, what the experiments test, and what stays text** (weighed as a senior interviewer would):

| Idea | Weight | Where |
| ---- | ------ | ----- |
| Hit rate is per location; more locations split the traffic | core | The tiers (one cell a location, at every width, its green part its hits), the square's curve moving left, the lanes thinning; E2 |
| A copy lives for the TTL after its miss; r·T decides a hit | core | The lanes: copies as bars from their miss, hits inside them, misses after them; the half-hit rank; E1 |
| Zipf popularity and the long tail | core | The square: every request, objects by rank, each as wide as its share; the tail bracket ("the 90,000 least popular: 19.0% of requests"); E1, E4 |
| The origin shield catches what no one location can | core | The fan-in of every location's misses into the shield, its amber band, the shield track under each lane, its half-hit rank; E3, the challenge |
| Origin load = the misses that get through | core | The narrowing stream, the origin's red fill as its share, "30.8% of 10,000/s" (the conversion said where the share is drawn); E2 to E5 |
| Latency per path and its mean | core | The path strip (each path a bar on one ms scale, the mean a tick between them), the ledger "Mean response 46.9 ms = 69.2% × 10 ms + 30.8% × 130 ms"; E2's and E3's reveals; the challenge |
| Nearer edges against colder caches | high | The users row stands as far above the locations as the nearest one is (44 px × √(1 / n)), so the hairlines shorten as cells multiply and go colder; the edge bar shortens; E2's reveal; the challenge's trade |
| Handshakes end at the edge | high | The note (a new connection's TCP and TLS round trips end at the nearest location) and the lesson |
| Traffic raises the hit rate | high | E4; the square's curve moving right |
| Cache keys: query strings and Vary fragment the cache | high | The Cache key control; E5 (10 URLs an image act like ten times the locations, at the shield too) |
| Request collapsing and the herd on expiry | medium | The step line on each #1 miss ("the requests that arrive during its fetch wait for it (request collapsing), so one fetch goes on, not a herd"); the note; the lesson |
| Egress cost, edge compute, immutable versioned URLs | medium | Lesson text (section 7) |
| Anycast and DNS steering | medium | The users row's words ("each sent to its nearest location (anycast or DNS)"); the lesson |
| Stale-while-revalidate, purges, versioned URLs | medium | Lesson text: they change freshness and latency on expiry, not the hit rule drawn here; drawing them would need a second clock |
| Private responses, cookies, dynamic content at the edge | medium | Lesson text and pitfalls (they are what may not be cached at all) |

**Checks** (`node enum.cjs`, 6,873 pass with `--quick`; the full run adds the long simulations).

1. The old `cdnOutcome` re-implemented: edge hit rate equal at all 96 normalized settings; origin share, rate and mean
   (at 20) equal at every one without a shield; with a shield the old and new origin shares printed side by side. Ten
   URLs an image give exactly the shares of a tenth of the traffic.
2. Every number the lesson quotes, within its rounding.
3. A discrete-event simulation: Poisson arrivals, a Zipf object, a uniform location and URL each, a TTL cache at every
   location and at the shield, 2 TTLs of warm-up then 4 to 10 measured (0.5 to 60 million requests a setting), at 11
   settings including every experiment's and the challenge's: the edge within 0.06 points, the origin with a shield
   within 0.16, the mean within 3%. A one-object simulation of the stated freshness rule: at most one TTL old without a
   shield, up to two with one (the Age header ignored).
4. The square's three areas equal the model's shares to 1e−9 at every setting and three widths; every column's height
   lies in [0, 1] and the edge band never rises with rank (so a band crosses one half once).
5. The sample: a seed at all 192 settings (the largest 174), requests in time order, every miss starts a copy of
   exactly the TTL, every hit lies inside a copy, at most 249 marks a lane; the sampler itself is unbiased (the middle
   lane's long-run hit share within 1 point of the model at three settings).
6. The experiments: no digit outside a slot (but "?utm_source=…"), one right choice each, answers in positions 2, 1,
   3, 2, 1, every sentence free of em dashes and non-breaking spaces, no sentence opening on a numeral (the challenge's
   ask, reveal and checklist lines too, at all 192 settings), thousands separated; the word claims ("from about the
   12,400th" hits half; the 2,500th once a minute at a location; across the CDN the 100,000th is asked for 2.5 times
   per TTL; E2 rises while the edge falls and nears; E3's edge does not move, the shield's rank over 50 times the
   edge's, the mean falls; E4 more but under five times; E5 between the shield's old load and no shield, equal to 200
   locations at the edge but not behind the shield (10 URLs send 2,520 a second where 200 locations send 913), the
   shield winning back far less than the edge lost); every asked number differs from the load-time stage's same
   number; the challenge passes at exactly one of 192 settings.

**Honesty rule.** Every number on the stage is a slot of the analytic model, and the stage says so where each is read:
"Where the requests go · the model" over the tiers, "Every request, most popular objects first · the model" over the
square, the note under the stage that states the assumptions (independent Poisson requests spread evenly over the
locations, objects unchanged during their TTL, caches with no size limit, a miss fetched at once with request
collapsing keeping it to one fetch, the hit rule, the latency rule). The timeline is the one sample, and it says so in
its label ("The outlined location, 5 minutes · one sample"), its key ("One sample. …"), the guide under the stage and
the summary. Its
marks are never counted as the model's: the hit shares beside each lane are the model's ("edge hit 49.8%"), and a lane's
drawn hits are never totalled on the stage. A lane may show no request at all (the 25,000th is asked for once every 10
minutes at a location): that is the sample, and its words ("asked for once every 10 minutes here") make it expected.
The seed rule (`sample()`): the first seed whose sparse lanes have request counts within max(1, 30%) of their
expectation, a hit share within 0.2 of the model's where a lane has 5 or more requests, and a shield hit share within
0.3 where 4 or more misses reach it; dense lanes (more than 160 requests in the window) keep only their misses and
copies and draw the hits between as a band, labelled by the model's rate.

**Engine work.** New `widgets/cdn.ts`: `cdnScenario(settings)` (shares, rates, paths, mean, half-hit ranks, the
cumulative areas `F` and `G`, the lanes), `cdnColumns(scenario, n)`, `cdnSample(scenario)` with its seed rule,
`CDN_SETTINGS` (all 192), the constants (`CDN_OBJECTS`, `CDN_LANE_RANKS` 1, 2,500 and 25,000, `CDN_WINDOW_TTLS` 5,
the latency constants, the stops); `cdnOutcome` and `CdnOutcome` are retired from `widgets.ts` (the old widget was their
only caller; their spec moves). `cdn-experiments.ts` holds the six specs. Framework: `ExperimentRun` gains
`'timeline'`; the hide regions are `curve` and `outcome`; slot units gain `rate` ("913/s", three significant figures),
`rateAbout` (two), `rank` ("the 12,400th") and `ttl` ("1 minute", "a 1-minute TTL"); `TEMPLATE_DIGITS_ALLOWED` gains
"?utm_source=…". `cdn.spec.ts` pins the model, the lesson's numbers, a smaller simulation and the identity
(1 − h_e)(1 − h_s) = 1 / (1 + rT); `cdn-experiments.spec.ts` every quoted number, the answers, the word claims and the
challenge's enumeration.

## 2. The picture

One `g-stage` of three blocks under a header, each block with its own label row and a reserved 18 px foot (where a
reveal's "Look here" tag sits on its outline): **where the requests go** (the tiers), **the outlined location over five
TTLs** (the timeline, a sample), and **every request by popularity** (the square). Top to bottom: the system as an
interviewer draws it, then one location's copies up close, then every object at once. Colour says who answered a
request, everywhere: green the edge, amber the shield, red the origin; blue is a request still travelling. Dashed means
only "hidden until you answer".

**Header.** "A CDN of 20 locations serving 10,000 requests a second" in the title role, over "The site serves 100,000
images, popularity on a Zipf curve. Each location keeps a copy for 1 minute after a miss." (and "A tracking parameter gives each image 10 URLs,
each cached on its own." with 10 URLs). Lines reserved for the longest setting at this width.

**The tiers (the model).** An art column on the left and a label column on the right (232 px from a 480 px stage;
56% of the stage below it, at least 120 px). Under a 420 px stage every body takes its short form (`narrow`), so the
label column wraps to few lines. Widths in the art are shares of all requests on one fixed band (at most 150 px, 72% of
the art), so the picture's widths always add up:

- Users: a row of small dots across the art, each joined by a hairline to its nearest location (anycast or DNS). The
  row stands as far above the locations as the nearest location is from users: 44 px × √(1 / n) (44 at 1 location, 20
  at 5, 9.8 at 20, 4.4 at 100), the same law as the latency, so the hairlines visibly shorten as locations are added.
  Label: "10,000/s requests", "From users, each sent to its nearest location (anycast or DNS)." (narrow: "Each to its
  nearest location.").
- Locations: **every location is its own cell, at every width.** Cells sit in columns (the most columns that divide
  the locations evenly, up to 20, each slot at least 8 px); a column holds pops / cols cells stacked, parted by 1 px
  stage-coloured lines (rows at least 4 px; the grid's art is 18 px for one row of cells, else 40 px or more). So 100
  locations draw 100 cells (20 columns of 5 at 1280, 10 of 10 on a phone), 20 draw 20, and a change in the number of
  locations always changes what is drawn (asserted: the drawn cells equal the locations at every setting and width). A
  column's inner width is its locations' share of requests (a cell's area is its location's share); its green part,
  from the left, is its hits, the same fraction in every cell; the rest, blue, leaves its foot as that column's misses.
  The top-left cell is outlined in ink, exactly one cell (asserted): the timeline below follows that one location.
  Label: "6,920/s answered at the edge", "In 10 ms, for 69.2% of requests. Each of 20 locations, one cell each, takes
  500/s and keeps its own copies." (narrow: "In 10 ms, 69.2% of requests, at 500/s a location.").
- The fan-in: every column's misses curve into one merged band, side by side in order, so the shield (or with no
  shield the origin) visibly receives every location's misses combined. The band's width is the miss share. The
  travelling fill is `--g-viz-current` at 0.78 opacity: 3:1 or more against the stage in both themes (shoot.cjs
  prints it; it joins theme-contrast.spec's graphics list).
- The shield (on): a box that hugs the merged band; its amber part is the shield's share, the rest travels on. Its
  label column holds the Origin shield switch (a native checkbox drawn as the house switch, 44 px, "Shield" under a
  150 px column) and "2,160/s answered by the shield · In 40 ms, for 21.6% of requests. It sees every location's
  misses." Off: no box, the band passes straight down, and "No shield: every miss goes on to the origin." With 1
  location and the shield on: "With 1 location the shield never hits: its copy expires with the edge's. It adds 30 ms
  to every miss."
- The origin: a box that hugs its red fill, the origin's share. "913/s reach the origin · In 160 ms (the edge, the
  shield, then a round trip to the origin), for 9.1% of 10,000/s." (narrow: "In 160 ms, 9.1% of 10,000/s."). The share
  and its conversion to a rate are said together where the width is drawn; a hidden share is "?%".
- The path strip (fixed height): one row per path, "edge hit", "shield hit", "origin fetch", each a bar in the path's
  colour on one 0 to 200 ms scale, as long as its path, its time at the row's right ("10 ms", "40 ms", "130 ms"); the
  shield row reads "no shield" without one. The mean is an ink tick across the three rows with "mean 46.9 ms" under it
  (hidden while `mean` hides: "mean: after your answer"). Fewer locations visibly lengthen every bar.
- Under the strip, full width, the ledger, which reads off the bars: "Mean response 30.2 ms = 69.2% × 10 ms + 21.6% ×
  40 ms + 9.1% × 160 ms." Means are three significant figures everywhere ("26.0 ms").

**The timeline (one sample).** "The outlined location, 5 minutes · one sample" (then "Outlined location, 5 minutes ·
sample"; where neither fits beside Play, the second form on two lines, both inside Play's 44 px row, so the words
that tie it to the outlined cell never drop) with Play at the row's right (36 px disc in a 44 px box). Under it the
step line (at rest "Play runs these 5 minutes at the outlined location in 6 seconds.", so a 1-hour TTL's five hours
and a 5-second TTL's 25 seconds both say their speed). Then a lane for each of three objects, fixed by rank so a
setting's change shows: the 1st (8.3% of all requests), the 2,500th (near the default's half-hit rank) and the
25,000th (deep in the tail). A lane is its words, "#2,500 asked for about once a minute here · edge hit 49.8% · shield
hit 90.4%" (the rate at one location in words; the hit shares the model's), on one line where it fits and as two
lines where not; then its edge track over five TTLs:

- a copy is a soft green bar from the miss that fetched it, exactly one TTL long (a copy alive at the window's start
  began earlier and runs in from the left edge);
- a hit is a short green tick inside a copy; a miss is a tall ink tick whose end says who answered, in shape as well
  as colour: a miss the shield answered stops at the shield track in an amber square; a miss the origin answered runs
  past the shield track to a red dot below it (the request visibly went further). Without a shield the same red dot
  sits below the empty shield track;
- a dense lane (the 1st, asked for 41 times a second here) draws its hits as fine green hatching inside the copies,
  its misses one by one (one each time its copy expires);
- with the shield on, a thin shield track under each lane: the shield's copies (amber bars) and the other locations'
  misses for the same object arriving (small grey ticks, a hatched band where they are too many to draw). A shield
  copy that is alive when the outlined location misses is why its tick stops at a square. The sample's shield starts
  with a copy with probability hit(toShield, T), the stationary share of time the shield holds one.

The axis marks every TTL ("0", "1 min" … "5 min"); when any labels would come within 6 px, every other one is kept
from the start (0, 2, 4 TTLs) plus the last where it clears 6 px, so kept labels stay evenly spaced. Under the axis a
one-line key (two where the long form fits in two): "One sample. Bar: a copy · short tick: a hit · tall tick: a miss,
ending at the shield track if the shield answered, below it if the origin did." (short: "Bar: copy · short tick: hit ·
tall tick: miss, to the shield or below it"); while E1 asks, "One random sample: each tick is a request; what hit shows
after your answer." The full reading guide is HTML under the stage (below).

**The square (the model).** "Every request, most popular objects first · the model", a legend whose swatches carry
the three shares ("69.2% at the edge", "21.6% by the shield", "9.1% at the origin"), then the plot: the x axis is
every request, objects ordered by popularity, each object as wide as its share of requests; a column's height is where
its requests are answered: green from the foot by the edge hit share, amber above it by the shield's, red to the top,
a 1 px stage-coloured line parting the amber from the red (their colours alone meet at 1.2:1). So **each band's area
is exactly its share** (`columns()` takes each pixel column's exact mean over the objects in it; enum.cjs check 4).
The y axis reads "0%", "50%", "100%". Above the plot, the tail bracket over ranks 10,001 to 100,000, "the 90,000 least
popular: 19.0% of requests", and three small marks with the lanes' ranks (#1, #2,500, #25,000), nudged apart to keep
6 px, which tie the timeline to the curve. A 50% hairline; the half-hit points as rings (stroke only, around the
point; the edge's ink, the shield's a 2 px amber-ink stroke) with a hairline down to the axis, and each ring's rank
named in the axis row, centred on its hairline ("2,481st", "44,664th" in the shield's ink). Ring labels are placed
first (nudged apart to keep 6 px while each still spans its own hairline); then the rank boundaries 10, 100, 1,000,
10,000 and 100,000, each centred on a 4 px `--g-stroke` tick (the last end-anchored; the left edge unlabelled), every
other one kept from the end where they crowd, and any within 6 px of a ring label dropped (asserted: no hairline lands
under another label). One line of axis title ("Objects by popularity, each as wide as its share of requests", shorter
where it must be), then the key rows: "Half of its requests hit at the edge: the 2,481st", "Half of its edge misses
hit the shield: the 44,664th", a rank past the last object said of every object ("Every object's edge misses hit the
shield at least half the time"), one before the first of none.

**Under the stage** (HTML): Play's story when motion is reduced, the reading guide ("The timeline is one random sample
of the outlined location. A bar is a copy, alive for the TTL after the miss that fetched it. A short tick is a hit; a
tall tick is a miss, ending in a square on the shield track if the shield answered and running below it to a dot if
the origin did. In the square, objects are ordered by popularity rank, each as wide as its share of requests, and a
column's height is where its requests are answered."; while E1 asks, its first sentence is "… each tick is a request,
and what hit shows after your answer."), the model's note, Describe.

**Ghosts** keep the setting before a change in words only: "It was 3,080/s." after the origin's line, "It was 46.9
ms." after the mean ledger. No tick, no outline. None while a question is open.

**Controls off the stage** (`_widget-controls.scss`): Traffic (1,000/s, 10,000/s, 100,000/s), Edge locations (1, 5,
20, 100), TTL (5 s, 1 min, 5 min, 1 h) and Cache key (Path only, + utm_source), each a native radio group drawn as
`g-segmented` in a `fieldset.group` (the house zero padding; a control's own class only adds), and the polite notice.
The shield switch is on the stage beside what it changes. Under the stage: Play's story when motion is reduced, the
model's note, Describe.

**Layout.** At container wide the stage takes the left column (620 px at 1280) and the controls, the dock and the cards
the 340 px right column (`_widget-layout.scss`). Narrower, one column: the four controls as the stage's first rows,
the stage, the note, the dock, Describe, the cards; the notice is read out only. A checked segment keeps its weight
(prevention 20). In the one-column layout, choosing an answer first scrolls the timeline into view (`block: 'nearest'`),
where the play runs; the tiers and the square are above and below it and settle at the reveal.

**Heights** depend only on the stage's width: every text block reserves the lines its longest form needs at that width
over all 192 settings and both hidden forms (`reserve()`), the lanes reserve their shield track whether or not the
shield is on, and the blocks' art has fixed heights. Measured by `shoot.cjs` over every setting, every experiment phase
and both plays at 14 stage widths (one height per width, every setting and phase):

| Stage width (px) | 248 | 254 | 288 | 310 | 324 | 346 | 360 | 420 | 480 | 560 | 620 | 700 | 760 |
| ---------------- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Stage height     | 1,868 | 1,797 | 1,647 | 1,612 | 1,595 | 1,547 | 1,547 | 1,397 | 1,309 | 1,277 | 1,260 | 1,178 | 1,161 |

So a 320 phone's stage (254 px) is 1,797, a 390 phone's (324) 1,595, and 1280's (620) 1,260. The mockup's whole widget
at rest, only a guide for `widget-heights.ts` (the build's measuring spec measures the built widget): 2,991 at 320,
2,748 at 360, 2,712 at 375, 2,677 at 390, 2,626 at 412, 2,595 at 430 and 1,460 at 1280. After a Play under reduced
motion the story adds a few lines under the stage, a layout change below it that the e2e layout-shift expectations
include.

The largest SVG over every setting and phase has 733 elements.

**Motion** (3.5's grammar; WAAPI on transform and opacity; one pooled particle).

- **One clock.** Play runs the timeline's five TTLs in 6 s on one monotone clock (the window maps linearly; a 5-second
  TTL and a 1-hour TTL play alike, the axis says which). A playhead crosses the three lanes (drawn on the tracks only,
  never through their words). A request's tick lands when the clock reaches it; a copy grows from its miss with the
  playhead and stops at its TTL; a shield copy and the other locations' misses land the same way. Nothing is drawn for
  an event before its moment (asserted: no request or copy right of the playhead).
- **The particle.** At each miss at the outlined location one ink dot (3.5 px) leaves that box's foot, rides the fan-in
  to the shield and, if the shield had no copy, on to the origin, over 6% of the clock. It moves only on the streams,
  never across a label (the label column is separate).
- **The step, in words.** "2.1 min: requests arrive at the outlined location; a short tick found its copy there." and on a
  miss "3 min: #2,500 has no live copy here, a miss: the shield had a copy, 40 ms; a new copy lives 1 minute." It obeys
  `hiding()`.
- **The climax** is the tail lane: its one request in five minutes arriving to an empty track, a tall tick, and the dot
  travelling all the way down (with the shield, often stopping amber at the shield because another location kept it
  warm).
- **An answer's play** applies the act (a control changes; the tiers re-space over 240 ms, columns sliding in or out),
  then plays the timeline at the new setting; hidden numbers stay "?" through it. At the reveal the flows grow from the
  edge row down (400 ms), the square's bands rise, and the focus outlines appear.
- **Stop.** During a free play Play is Stop ("Stop the timeline"); Stop or any setting change ends the play and draws the
  new rest state at once. Only an answer's play locks the controls.
- **Plays pause** by the widget host's visibility (IntersectionObserver on the host reading the latest entry, plus
  `visibilitychange`), never the timeline block's.
- **Reduced motion:** nothing moves. The rest state already shows the whole sample (every request, copy and shield
  copy). Play redraws it and writes the story under the stage (HTML, read out): "In this sample of 5 minutes at the
  outlined location, #1 missed 5 times, once each time its copy expired, and every other request hit; #2,500 was
  asked for 4 times and missed 3 times; #25,000 was not asked for at all. A miss starts a copy that lives for the TTL.
  The hit shares beside each object are the model's." The step line reads "Played below the picture: motion is
  reduced."; the story scrolls into view only when off screen.

## 3. The experiments

Every number is a slot from the model (`node enum.cjs` prints them all); answer positions 3, 1, 3, 2, 1. Choices are
ordered by value, ascending or descending, so position never hints, and in no question is the answer the largest or
the smallest every time: E2's answer is the largest, E3's the smallest, E4's the middle, E5's the smallest of three
that all rise. A card sets the widget up with complete settings, as a new start: whatever the learner had before leaves
no ghost. Answering plays the act on the timeline (in one column, the timeline scrolls into view); the dock holds "your
guess" and "Watch the picture: the answer plays out on it." through the play; the reveal is read out politely and its
regions get a solid focus outline with the house "Look here" tag.

**E1 "Which objects hit".** Setup: the default with a 5-minute TTL, so the load-time stage's half-hit rank (the
2,481st) is not the answer. Act `run: 'timeline'`. Ask: "At 20 locations with a 5-minute TTL, the object at popularity
rank k is asked for about 827 ÷ k times a second, spread evenly over the locations. Each location keeps a copy for the
TTL after a miss. From about which rank down do most of an object's requests miss at the edge?" Choices (ascending):
"From about the 41st: below it, an object is asked for less than once a second at a location" / "From about the
2,500th: … less than once a minute …" / **"From about the 12,400th: … less than once per TTL …"**. Each wrong choice is
a real mistake (forgetting the TTL; using the default's TTL); all three state a rule, so the right one is the rule the
learner must know. Reveal: "From about the 12,400th. A copy lives for the TTL after the miss that fetched it, so what
decides a hit is how often its object is asked for at one location within one TTL. Split over 20 locations, the
12,400th most popular object is asked for about once every 5 minutes at each: one miss, then on average one hit, half
its requests. More popular objects hit more often; the 25,000th hits 33.2% of the time, and the 90,000 least popular
objects, 19.0% of all requests between them, hit least of all. The green area is the edge's share: 81.8%." Hides
`curve`. Focus: the square, the timeline.

**E2 "More locations".** Setup: the default (3,080 a second at the origin). Act `set: { pops: 100 }`. Ask: "The CDN
serves 10,000 requests a second from 20 locations, and 3,080 a second reach the origin. It moves to 100 locations with
the same traffic, each nearer its users. How many requests a second reach the origin now?" Choices (descending):
**"About 4,400: each location now sees each object less often before its copy expires"** / "About 3,100: the same
requests for the same objects" / "About 1,500: more caches hold more copies between them". Reveal: "About 4,400: 4,390
a second, up from 3,080. Every location keeps its own copies, so an object is fetched once per location per TTL, not
once per CDN. Split over 100 locations, each sees each object a fifth as often: the hit rate at the edge falls from
69.2% to 56.1%, and the curve moves left (the half-hit rank, from the 2,481st to the 496th). Users gain on hits: the
nearest location is 4.5 ms away instead of 10 ms. The mean response goes from 46.9 ms to 57.2 ms." Hides `outcome`.
Focus: the tiers, the square.

**E3 "An origin shield".** Setup: 100 locations, no shield (4,390 a second). Act `set: { shield: 1 }`. Ask: "At 100
locations, 4,390 requests a second reach the origin. Add an origin shield: one mid tier that every location asks on a
miss, before the origin, keeping copies for the same 1 minute. How many requests a second reach the origin now?"
Choices (descending): "About 4,400: the shield passes on what the locations miss" / "About 3,100: back where 20
locations left it" / **"About 910: fewer than with 20 locations and no shield"**. Reveal: "About 910: 913 a second. The
edge hit rate does not move (56.1%), but the shield's one cache sees the misses of all 100 locations combined, 4,390 a
second, so it keeps warm objects that no single location is asked for often enough: it answers 34.8% of all requests,
and its half-hit rank is the 48,635th, against the edge's 496th. That is what a single cache seeing all the traffic
would send: with a shield the origin's load no longer depends on the number of locations (913 a second at 20 too),
since an object leaves the shield once per TTL however many locations ask. A shield hit costs 30 ms more than an edge
hit, but the mean response falls from 57.2 ms to 28.6 ms, because far fewer requests cross to the origin." Hides
`outcome`. Focus: the tiers, the square.

**E4 "Ten times the traffic".** Setup: the default. Act `set: { rps: 100000 }`. Ask: "At 10,000 requests a second,
69.2% hit at the edge and 3,080 a second reach the origin. Traffic grows tenfold, to 100,000 requests a second, for the
same objects. How many requests a second reach the origin now?" Choices (descending): "About 31,000: ten times the
traffic, ten times the misses" / **"About 13,000: more misses, but far fewer than ten times as many"** / "About 3,100:
the edge absorbs the extra requests". Reveal: "About 13,000: 13,400 a second, 4.3 times as many, not ten. Each object
is asked for ten times as often, so its copy is asked for again sooner before it expires: the edge hit rate rises from
69.2% to 86.6%, and the half-hit rank moves from the 2,481st to the 24,814th. A CDN pays off most for the busiest
content. The misses that are left come from the long tail: objects asked for so rarely at any one location that even
ten times the traffic leaves most of their copies cold." Hides `outcome`. Focus: the tiers, the square.

**E5 "A tracking parameter".** Setup: the default with the shield (913 a second). Act `set: { variants: 10 }`. Ask:
"With the shield on, 913 requests a second reach the origin. Marketing links now add a tracking parameter with 10
values (?utm_source=…), spread evenly, and the CDN keys its cache on the full URL. The image served is the same. How
many requests a second reach the origin now?" Choices (ascending): **"About 2,500: the shield still helps, but each copy
is asked for a tenth as often"** / "About 5,000: the shield stops helping, as if it were off" / "About 9,100: ten URLs
an image, ten times the misses". Reveal: "About 2,500: 2,520 a second, up from 913. Each image is now 10 keys, each
asked for a tenth as often, at the edge and at the shield alike: to a cache that is the same as ten times the
locations. The edge hit rate falls from 69.2% to 50.4%; the shield still answers 24.4%, but of far colder keys. The fix
is the cache key, not the CDN: drop tracking parameters from it (and sort the rest), and the hit rate comes back."
Hides `outcome`. Focus: the tiers, the square.

**E6 Challenge "Fit the origin".** Setup: the default (3,080 a second, 46.9 ms). Ask: "Your origin serves 10,000
requests a second of images and can take at most 500 a second. Product wants a mean response under 18 ms, and images
may be at most 5 minutes stale. Choose the locations, the TTL and the shield." Goal `all`: `originRps` below 500,
`meanMs` below 18, `ttl` at most 300; keep `rps` 10,000 and `variants` 1. Exactly one of the 192 settings passes: 100
locations, 5 minutes, the shield (280 a second, 17.1 ms). Its near misses each teach one lever: 20 locations with the
same TTL and shield take the same 280 a second but 18.8 ms (the edge too far); 100 locations without the shield 3,080
a second (the split); a 1-hour TTL is too stale; 5 locations 26.1 ms. The status is the house checklist under "Your
goal:" at the start, "Goal met:" only while the goal holds and "Not yet:" otherwise, each line its value in words and
its state: "the origin takes 3,080/s, under 500/s: not yet" / "the mean response is 46.9 ms, under 18 ms: not yet" /
"the TTL is 1 minute, at most 5 minutes: met". Reveal (once met): "100 locations, a 5-minute TTL and the shield: 280 a
second reach the origin and the mean response is 17.1 ms. The TTL is as long as freshness allows; the 100 locations
bring the edge to 4.5 ms from users but split the traffic, so the edge hits only 69.2%; the shield, seeing every
location's misses, gives the origin its load back. With 20 locations the origin takes 280 a second, but users wait
18.8 ms on average." No hides; Describe waits until the goal is met. When the challenge opens, the notice says the
setting's sentence.

**One `hiding()` map** (prevention 1) from a question's regions to every surface; each region is named in the spec's
own `hide` list:

| Region / flag | When | On the stage | Elsewhere |
| ------------- | ---- | ------------ | --------- |
| `curve` → `curveNumbers`, `curveBands` | asking and playing (E1) | the square's bands and half-hit rings (a dashed box, "Which objects hit shows after your answer"), the legend's shares ("?% at the edge"), the half-hit ranks ("the edge: ?") | summary ("Which objects hit shows after your answer."), notice, Describe |
| `curve` → `laneHits` | asking and playing (E1) | each lane's "edge hit ?%" and "shield hit ?%" | the step and story ("The model's hit shares show after your answer.") |
| `curve` → `laneMarks` | asking (E1) | every sampled request drawn as a plain grey tick, all of one height; no copies, no dots, no shield copies | none |
| `outcome` → `tierNumbers`, `tierFlows`, `mean` | playing (E2 to E5) | every share and rate below the users ("?/s answered at the edge", "?% of requests"), the boxes' green parts, the streams, the shield's and origin's fills (one dashed box over the flows, "shows after your answer"), the mean ledger | summary, notice, Describe |
| `outcome` → `curveNumbers`, `curveBands`, `laneHits` | playing (E2 to E5) | as for `curve` | as above |
| `ghost` | open (every question) | no "It was" | none |

Hiding holds through the answer's own play and releases at the reveal. While any question asks or plays, Play, the
shield switch and the four fieldsets are disabled, the notice says "Play and every setting wait for your answer."
(never blank, not re-announced), and Describe waits ("Describe waits for your answer."). Cards carry titles only. The
model's note states the hit rule, which would answer E1, so while any question is open it reads "An analytic model
with a random sample beside it. Its assumptions show after your answer." No standing label says what a question asks:
the tiers say "each keeps its own copies" (true of every setting) and never "more locations, lower hit rate".

## 4. Accessibility

- The stage is `role="group"`, `aria-roledescription="visualization"`, named "CDNs and edge: where requests are
  answered, one location's copies, and every request by popularity"; its SVG has a summary that obeys `hiding()`: "A
  CDN with 20 locations serves 10,000 requests a second for 100,000 images with Zipf popularity; each location keeps a
  copy for 1 minute after a miss. By the model, 69.2% are answered at the edge in 10 ms, and 3,080/s reach the origin,
  in 130 ms: a mean response of 46.9 ms. Popular objects hit and the long tail misses: an object hits half the time at
  the edge from the 2,481st down. The timeline is one random sample of the outlined location's requests."
- Play is a button named for what it plays ("Play 5 minutes at the outlined location"; "Stop the timeline" while
  playing; "Play the timeline, after your answer" and disabled while a question waits). The shield is a native
  checkbox named "Origin shield" (the visible "Shield" on narrow stages is in its name). The four controls are native
  radio groups in fieldsets with their legends (one Tab stop each, arrows). The dock is `app-widget-check`; checklist
  lines carry ": met" and ": not yet" in words (the ✓ and · are `aria-hidden`). The stage has no tappable marks, so no
  tap hints exist to clear (prevention 11).
- Notices (polite, `aria-atomic`): after a change, the setting's sentence ("With 100 locations, a 1-minute TTL and no
  shield, 56.1% of 10,000 requests a second hit at the edge, 4,390/s reach the origin, and the mean response is 57.2
  ms."); during a play, the step as it changes; after a play, nothing new (the step line already said it) except under
  reduced motion, where the story is read; after a reveal and when the challenge opens, the setting's sentence; while
  a question is open, that the settings wait. Never blank (the no-answer sweep asserts it in every phase).
- Colour is never alone: who answered is said in words on every row ("answered at the edge", "by the shield", "reach
  the origin"), a hit tick is short and a miss tall with a dot, a copy is a bar with a stroke, the shield track is
  thinner; hidden is dashed and "?". Tokens are the app's `--g-viz-*` (final, considering, critical, current); small
  text uses ink tokens that pass 4.5:1 (`--g-found-ink`, `--g-warn-ink`, `--g-danger-ink`); boxes and tracks use
  `--g-stroke` (3:1), and the copy bars' strokes and the band fills join `theme-contrast.spec`'s 3:1 graphics list.
- 44 px targets: Play, the shield switch, every segment (the checker fails a target under 44 px or one on another, or on
  stage text, at every setting and width).
- **Describe** (a `g-data-table` in a `minmax(0, 1fr)` grid, scrolling inside its own box): the summary, then a row
  for each location count at this traffic, TTL and key, the current one marked (`aria-current`): Locations, Nearest
  ("10 ms"), Edge hit, Origin, "Origin, shield", Mean, "Mean, shield". Under a 560 px stage it is `compact`: bare
  numbers under unit heads ("Origin /s", "With shield /s", "Mean ms" for the current shield setting), the nearest
  column dropped, a number never parted from its unit; four rows need no scrolling, and both forms fit their box at 320,
  360, 390, 412, 1280 and 1440 px (checked by `shoot.cjs`).

## 5. The prevention list

1. **Giveaways while asking, on every surface.** One `hiding()` map (3) feeds the stage's marks and words, the summary,
   the notice, the step and story, the note, the controls and Describe. Every control and Play wait, so no play the
   learner starts can show an answer; the answer's own play keeps the hiding until the reveal; a card's setup starts
   afresh, so no ghost carries an answer in. `noAnswer()` (run by `shoot.cjs`) renders every question asking and at
   five moments of its answer's play, with motion off and on, at three widths, against the answer's words (E1: the
   half-hit rank in both forms, the lanes' hit shares; E2 to E5: the new origin rate in both roundings, the edge and
   origin shares, the mean, the half-hit rank, the shield's share) on the SVG text, every accessible name, the notice,
   the note, the controls' text and Describe; false claims; and structure (no flow, band or ring drawn while hidden, no
   sampled outcome while E1 asks, no ghost, every control disabled, the notice saying the settings wait, Describe
   waiting). `plantedLeaks()` turns each of the eight flags off in turn; the sweep must catch every one.
2. **False claims.** A hidden value is always "?" in a sentence that keeps its shape ("?/s answered at the edge"),
   never a default. The sample is never counted as the model (its words are the model's; the caption and summary say
   which is which). Words are true at every setting by rule: "drawn as 5 columns of 4" only when columns are fewer than
   locations; "With 1 location the shield never hits" only at 1 location; `FALSE_CLAIMS` (NaN, "1 locations", "2
   minute", "0/s", "??", thousands without separators, em dashes) runs over every render and every sentence of all 192
   settings (`pageWords()`).
3. **Elements tracked by $index while order changes.** Lanes are keyed by rank, requests by lane and time, copies by
   start, columns by index within a fixed count for a setting (they never reorder during a play), experiment cards by id.
4. **Labels on lines; rings and markers; ground; 6 px.** The label column never shares space with the art; the
   playhead is drawn on the tracks only; rank labels end at their ticks and drop under the 6 px rule; lane marks are
   nudged apart; half-hit rings are stroke only around the point, with the hairline starting at the ring; the checker
   fails text on text, labels within 6 px on a row, any mark under text, x ticks within 6 px, dots on dots, anything
   off the stage.
5. **Look-here tags.** Every block reserves its foot; a tag sits on its outline's foot at the right; `sweepExperiments`
   asserts each reveal draws as many tags as regions, none on text, none off the stage, at 14 widths.
6. **Marks before their moment.** One monotone clock; requests, copies and shield marks are drawn only up to it, the
   particle starts at its miss's moment; asserted by the layout assertions at every play moment of the sweep.
7. **Plays pause by the host's visibility;** reduced motion draws the end state, which is the whole sample, and
   writes the story.
8. **CSS specificity.** Every `fieldset.group` has the same zero padding and a control's class only adds to it; the
   shield switch and segments are checked for overflow at 320 (the switch shortens to "Shield").
9. **Words.** The summary, notices and story are full sentences generated from slots, plurals by count ("once", "4
   times", "1 location"), none opening on a numeral (asserted), thousands separated; the challenge's status is the
   checklist that says "Goal met" only while the goal holds; the notice after a reveal and when the challenge opens is
   the setting's sentence.
10. **Describe** fits or goes compact by stage width, in its own scrolling box (4).
11. **Touch hints.** None exist: no mark is tappable.
12. **Placeholder heights.** The stage's height is a function of its width only (`reserve()` over all settings and
   hidden forms); `shoot.cjs` prints the whole widget's height at 300 to 1,280 px for `widget-heights.ts`, and the
   build's measuring spec sweeps 300 to 1,300 px.
13. **Text measurement.** All stage text is measured through one module (here `tw`, in the app `stage-text.ts`) with
   the shipped fonts loaded before the first measure (the mockup awaits each face: an early canvas measure fell back
   to another font and pushed a lane label off the stage in the first round), proportional digits as drawn, 1 px slack.
14. **g-code-text.** HTML learner text keeps a number with its unit and an ordinal with its value (`nb()` in the
   mockup); every live region holding it is `aria-atomic`.
15. **Element counts.** Users, columns, ticks and band points are bounded by the stage's width: at most 20 columns, a
   dot per 9 px, one path point per pixel column, at most 160 drawn requests a lane (denser lanes draw a band); the
   largest SVG measured is printed by `shoot.cjs` and capped at 900 elements. The heaviest setting for the build's
   timing check is 100,000 requests a second, 5 locations, 1 hour, the shield on, 10 URLs (dense lanes on both tracks).
16. **Specs and e2e read state after drawing** (web-first assertions on the summary first); the widget's e2e runs on the
   WebKit iPhone project too.
17. **Marks mean one thing.** Dashed is only the hidden box; focus outlines are solid; an empty shield row is nothing
   and words, never a dashed box; rings are stroke only around the whole mark.
18. **Values on the drawn scale.** Every compared value is a share of one fixed band or the square's 0 to 100%; rates
   are said beside their shares; a ghost's old value is said in words ("It was 3,080/s."), never a tick.
19. **Units and conversions.** Every figure keeps its unit in every form ("913/s", "?/s", "10 ms"); the share-to-rate
   conversion is said where the share is drawn ("9.1% of 10,000/s"), and the mean is the drawn ledger of shares times
   paths.
20. **Layout.** Reserved lines collect at a block's foot (the knee rows last); a checked segment keeps its weight; in
   one column, answering scrolls the timeline into view first.
21. **Wrap that heights depend on** goes through the measured `wrap()` with the keep rule, never the browser's.
22. **One current state** feeds the stage, the dock, the notice, the summary and Describe (each reads the same
   scenario object); the challenge's "Goal met" and the stage are computed from the same setting. No NaN, Infinity or
   empty cell can appear: every figure is a formatted model value or "?", asserted in every render.
23. **Every new test passes on WebKit iPhone and in CI's shards:** deterministic waits for focus and inputs, the
   IntersectionObserver reads its latest entry; the builder dispatches `ci.yml` on the wip branch and reads the result
   before reporting done.

## 6. What a learner can say afterwards

"A CDN answers from a copy at the location nearest the user, and a copy lives for its TTL after the miss that fetched
it. So the hit rate for an object is about r·T / (1 + r·T), where r is how often it is requested **at one location**:
popular objects hit almost always, and the long tail of a Zipf distribution misses, because no single location sees it
twice within a TTL. At 10,000 requests a second over 100,000 images, 20 locations and a 1-minute TTL, about 69% hit at
the edge and the origin still serves about 3,100 a second. More locations bring the edge closer but split the traffic,
so each cache gets colder: at 100 locations the origin serves about 4,400. A longer TTL or more traffic raises the hit
rate; tracking parameters or a careless Vary split each object into many keys and lower it. An origin shield is one
cache that sees every location's misses, so the origin fetches each object about once per TTL no matter how many
locations there are: about 900 a second here, a tenth of the traffic, at the cost of one more hop on a miss."

## 7. Lesson text the widget needs

- Remove `widget.tryThis` (all three lines): the experiments carry them, and R45's acceptance says no `tryThis` remains.
- Concept "Origin shields and request collapsing": add after "instead of once per location per TTL": "With a shield,
  the origin's load no longer depends on how many locations there are: an object leaves the shield about once per TTL
  however many locations ask." (true by the identity in section 1).
- Concept "Edge locations and how users reach them": add "More locations put the edge closer to more users, but each
  location then sees less of the traffic, so its cache is colder: the trade the next concept describes."
- Example "More locations, more origin load": step 4, "brings origin load to about 900 requests a second" becomes
  "about 910"; the problem statement's "about 3,100" and "about 4,400" stand.
- The tryThis figure "with the shield the origin serves about 26 requests a second" at one hour, if any copy of it is
  kept elsewhere, becomes 27.
- Every other number in the lesson stands (enum.cjs check 2 holds them).
