# Durability widget (`durability`): design brief

Redesign R42, the batch's third widget after Data Modeling and Unique IDs (REDESIGN.md 5.2: the R41 to R45 entry, its
"Forms" bullet, which leaves `durability`'s picture to this brief and its critics, and the R41 widgets' notes; LOOP.md
rows 122 to 128 are the house references). Lesson: `/design/topics/sd-durability`. Files beside this brief, on the
orphan branch `design/r42-durability`:

| File          | What it is |
| ------------- | ---------- |
| `model.js`    | The exact model (today's `durability()` formula unchanged, with its steps, the rack event and the cost of a billion objects), the play clock and the staged loss, the formats, and the six experiments as slot templates; ported to `widgets/durability.ts`, `durability-format.ts`, `durability-plays.ts` and `durability-experiments.ts` |
| `enum.cjs`    | Prints every experiment number, proves the challenge passes at exactly one of 160 settings, checks the model against today's engine function, the binomial tail against brute-force enumeration of failure sets, the drawn steps against the exact tail, every word claim of the reveals and the lesson's nines, every format at every setting, and the whole model against a discrete-event simulation of disks failing and being repaired at rates high enough to see thousands of losses (7,086 checks; `--fast` halves the simulation) |
| `mockup.html` | The live mockup with the app's tokens and fonts: `?state=default\|copies2\|ec63\|ec104\|slow\|batch\|rack\|before\|playing\|playing104\|staging\|staged\|staged104\|rackevent\|describe\|reduced\|ask&exp=1..5\|reveal&exp=1..5\|challenge&theme=light\|dark`; `ask` takes `&phase=playing&frac=0..1` (the answer's play, hiding held), `challenge` takes `&start=1`, `&motion=off` plays as Reduced motion does. The settings, Play a repair, Stage a loss, the cards and the choices all work |
| `shoot.cjs`   | Screenshots every state at 1280, 390 and 320 px in both themes with the page's collision report and layout assertions, then sweeps all 160 settings at 12 widths at rest and through both plays (with ghosts), every experiment asking, playing and revealed, the no-answer sweep with six planted leaks, every page sentence of every setting, and the stage heights |
| `changes.md`  | What the mockup's own rounds found and what changed; the critics' items go there next |

## 1. The verdict, and the mechanism

**Today's widget against the bar.** Four scheme buttons, an AFR slider, five repair-time buttons and five number tiles
("9.7", "1 in 5,600,000,000", "1x") over a muted caveat. Every number is right and nothing is drawn: no object, no piece,
no disk, no failure, no repair, no window. A learner can read "6 + 3: 11.8 nines" and still be unable to say why half the
storage loses less, why a week of repair costs 49 times a day and not 7, or why the caveat under the tiles (racks, power,
bad batches) matters more than every tile above it, which is exactly what an interviewer probes. It is far below the
bar; only the formula survives.

**What the learner must see.** An object cut into pieces (or copied), each piece on its own disk, the stored bytes drawn
to scale against the object's. A disk fails; its piece is detected and rebuilt on a free disk from the survivors, reading one copy or k
pieces, over a repair window drawn on a fixed week. The object is lost only if, inside that window, more of the other
pieces fail than the scheme tolerates. Then the arithmetic as a walk along a nines scale: first failures a year, times
the window's chance once for every further failure a loss needs, times the ways of choosing those pieces, landing at the
yearly loss, read on the same axis as objects lost a year among a billion. And beside it the thing the arithmetic
leaves out: a rack event, which takes every piece in one rack at once and needs no window.

**What the widget draws, what experiments test, and what stays text** (weighed as a senior interviewer would):

| Idea | Weight | Where |
| ---- | ------ | ----- |
| Durability is the chance an object is never lost, a year at a time; nines | core | The title of the model's half, the headline's NINES, the last row, the summary |
| Pieces on separate disks; replication (n copies, n× storage, tolerates n − 1) against Reed-Solomon (k + m, (k + m) / k, tolerates m, any k rebuild) | core | The stored bar (pieces to scale, its arithmetic "stored: 9 × 1/6 = 1.5×") and its key; the disks; the headline's STORED and SURVIVES; E1 |
| A failed piece rebuilt from survivors in a repair window | core | The race: the window on a fixed 0 to 168 h axis, the rebuild filling it, the free disk filling and holding the rebuilt piece |
| Loss = more than t further failures inside the window: pieces × AFR × P(≥ t of the rest fail in it) | core | The steps (first failures, the window's chance t times, the ways), each a row; the staged loss acts it out; E1, E2, E4 |
| The window enters with a power (7× longer is 49× for three copies) | core | Each window row is one arrow of length log10(1/p): a longer window shortens every one of them; E2 (and E4, where the rate enters t + 1 times) |
| Repair traffic: a copy reads 1, a k + m code reads k; rebuild bandwidth; LRCs | high | The read stubs from the k sources into one bus to the free disk (one stub a piece read), "reads 10 pieces: 200 TB a disk", the cost sentence's Gb/s; E3; the challenge; LRC in E3's reveal |
| What it costs at a billion objects (raw bytes, disks, failures a year, rebuild Gb/s) | high | The billion axis under the steps (1,000, **1**, 0.001 lost a year), the cost sentence at the foot, the challenge |
| Correlated failures dwarf the arithmetic; placement across failure domains | core | Placement: "A rack each" / "One rack"; the rack row (0.1% a year, assumed) and the red bar it sets; Stage a loss as a rack event; E5; the standing note |
| Durability is not availability, and not backup | medium | The standing note ("a delete or a bad overwrite reaches every piece"); lesson text |
| Scrubbing, latent sector errors, hot/cold tiering, zone placement of 6 + 3 | medium | E5's reveal (3 zones of 3); lesson text |

**Settings** (numbers, as `ExperimentSettings` requires): `scheme` (0 two copies, 1 three copies, 2 RS 6 + 3, 3 RS
10 + 4), `afr` (1, 2, 5, 10, percent a year), `repair` (1, 6, 24, 72, 168 h), `rack` (0 a rack each, 1 one rack): 160
settings. The free-play default is three copies at 2% and 24 h, a rack each: 9.7 nines, the lesson's first example.

**Formulas** (all in `model.js`, ported 1:1; YEAR_H 8,760, a 20 TB disk, a billion 1 MB objects = 1 PB):

- n pieces (copies, or k + m), t tolerated (n − 1, or m), overhead n or n / k, a rebuild reads 1 or k pieces.
- p = AFR × repair / 8,760, the chance a given other piece fails inside the window.
- Independent loss a year: `indep = min(1, n × AFR × P(Bin(n − 1, p) ≥ t))`, today's `durability()` to the bit (checked
  at all 80 rack-each settings: largest relative difference 7.5e-16).
- With every piece in one rack, a rack event (RACK_EVENT = 0.001 a year, an assumption said wherever it is used) loses
  it at once: `loss = indep + rack − indep × rack` (written so a tiny `indep` keeps its digits; the first port computed
  1 − (1 − indep)(1 − rack) and lost 14.75 to rounding noise, enum.cjs now guards the lesson's 14.7).
- Nines −log10(loss); objects lost a year among a billion = 10^9 × loss.
- **The steps** the stage draws are the leading term of the same product: first = n × AFR, then × p once for each of
  the t further failures, then × C(n − 1, t). The exact tail adds the cases of more than t failures; at every setting
  the two are within 0.006 nines (checked), so the walk lands where the model does.
- Cost: raw = 1 PB × overhead on raw / 20 TB disks, failures a year = disks × AFR, a rebuild reads (1 or k) × 20 TB, at
  rebuild reads × 8 / window seconds Gb/s.
- **What makes a short window possible**: one disk writes about 2 Gb/s (`DISK_WRITE_GBPS`), so a 20 TB disk refilled alone
  takes 22 h, "about a day". A rebuild that must write faster (every window under 24 h) spreads the failed disk's pieces
  over many disks, each rebuilt in parallel (declustered placement); the facts say so at every setting and the race's
  sentence adds "spread over many disks" wherever `writeGbps > DISK_WRITE_GBPS` (enum.cjs checks all 160). The window
  runs from the failure to full redundancy: detection counts as much as the rebuild (the control's full name is "Time
  to full redundancy: detect and rebuild", the race row "Detection and rebuild of c3", E2's reveal says it).
- **Clustered losses**: the yearly loss among a billion is an average. The billion objects share the store's disks
  (70 for the challenge's 10 + 4), so t + 1 disks down at once lose every object with a piece on each of them:
  10^9 × C(D − t − 1, n − t − 1) / C(D, n), about 170,000 objects, about once in 12 million years. Every surface says
  "on average"; E6's reveal says the rest. Copysets and scatter width trade how often for how many.
- **The steps against the exact model** (Describe says it per setting): for copies they are the model exactly (a loss
  needs every other copy, so the tail is p^(n−1)); for codes the exact sum also weighs the other pieces surviving the
  window and the rarer cases of more failures, and is slightly *less* than the steps (0.01% to 0.72% less at the
  widget's settings), so the drawn walk is conservative.

**Checks** (`node enum.cjs`, 7,086 pass): today's engine function at every setting; the binomial tail equals
brute-force enumeration of every failure set (n 1 to 13, k 1 to 4, three rates); the steps within 0.006 nines of the
exact model; the window's power at every setting (a window k times longer multiplies the loss by k^t within 0.006
nines); every reveal claim ("49×", "7 × 7 is 49", "two more nines", "about 3,100 from the rate and 2,400 from the
window", "millions", "3.0", "7.3", 200 TB and 19 Gb/s); the lesson's ten quoted nines (all agree, 14.7 included); every
format at every setting (a unit always, "1 in N" for chances, nines on the 0 to 25 scale); the challenge (exactly one
of 160). **The simulation**: one object of n pieces, each up for an exponential time at rate λ, down for exactly W
while rebuilt, lost when more than t are down at once. At p = λW from 0.002 to 0.03, with 1,200 to 4,100 losses a run,
the simulated rate over the model's is 0.98 to 1.02 for two copies, 0.92 to 0.97 for three, 0.83 to 0.95 for 6 + 3 and
0.76 to 0.91 for 10 + 4: the model is the first-order rate and over-counts by O(n p) (it uses p = λW, not 1 − e^−λW,
and counts each first failure's window whatever overlaps it), never under-counts (checked), and converges as p shrinks.
At the widget's own rates p ≤ 0.0019, so n p ≤ 2.7%: the model is honest and slightly conservative. The rack event's
rate is simulated too (2,024 events in 2 million rack-years).

**Honesty rule.** Every number the learner reads is a slot from the model. The plays draw **one repair**: a typical
one, in which none of the others fails (said, with why: "Each fails within 24 h with chance 1 in 18,000, so in a
typical repair none does."), or a **staged loss**, tagged "STAGED, NOT SAMPLED" on the race and opening its sentence
with "Staged, not sampled:", whose own chance is the model's ("A first failure leads here about once in 330 million
times."). No count from a play is ever a yearly loss, and no play is a sample. Under the stage, always: "The model:
disks fail independently at a constant rate, a lost piece is rebuilt in a fixed window, and the object is lost only
when more pieces fail inside that window than the scheme tolerates. Real failures come together: a rack, a power event,
a bad batch of disks or a software bug can take many pieces at once, which makes real losses far likelier than these
nines. And durability is not backup: a delete or a bad overwrite reaches every piece." With one rack it adds "Here
every piece shares one rack, and a rack event, assumed once in 1,000 years, destroys them all." The rack row says
"(assumed)" on the stage.

**Engine work.** `widgets/durability.ts`: `durabilityScenario(settings)` (everything `run` returns), `atLeast`,
`choose`, the constants; `durability()` keeps its signature for its spec and is no longer exported to the app once the
old widget goes (its only caller). `durability-format.ts`: `oneIn`, `bigCount`, `formatNines`, `formatBillion`,
`formatTB`, `formatGbps`, `formatRatio`. `durability-plays.ts`: `playPlan`, `playState`, `stagedFailures`, `sources`,
`failedIndex`. `durability-experiments.ts`: the six specs. Framework: `ExperimentRun` gains `'repair'` and `'staged'`;
slot units gain `nines`, `oneIn`, `ratio`, `tb`, `gbps`, `billion`; `TEMPLATE_DIGITS_ALLOWED` gains "6 + 3",
"10 + 4", "any 6", "any 10", "of its 14", "of the 13", "groups of 6", "12 data pieces", "3 zones", "3 pieces each",
"4 failures", "5 times", "1 MB", "Nine disks", "of the 8"; the hide regions are `steps` and `after`.

## 2. The picture

One `g-stage`, read top to bottom as the object, its disks, one repair, then the model. One full rule parts what
happens (above) from what the model says (below), whose title is "The yearly chance of losing it, from the model"
("Yearly loss, from the model" under a 520 px stage).

**Header.** The play disc (36 px in a 44 px box) with its words "Play a repair" ("Repair" where both buttons would not
fit; "Repairing" and a pause glyph during a play; "Next moment, 2 of 3" under Reduced motion), and at the right the
pill "Stage a loss" (44 px tall, outlined in the critical tone while the staged play shows).

**A. The object and what is stored.** The object as an ink bar of width U, "the object, 1 MB"; under it the stored bar,
one segment per piece at the piece's size (a copy U, a k + m piece U / k), data and copies in the current tone, parity
in the considering tone, a 1.2 px notch of stage between segments, "stored: 9 × 1/6 = 1.5×" beside it: the overhead
drawn as a transform, not told. U is the largest that fits every scheme's stored bar and words at this width, so
switching scheme changes only the bar. A key row under it ("6 data pieces", "3 parity pieces"; "3 full copies"). A down
piece's segment is hatched; a lost object's bar carries a critical ×.

**B. On the disks** (revised after the critique: see the critics' rules at the end of this section). "On 9 disks, each in its own rack" ("9 disks, a rack each"; "…, all in one rack"). One disk a
piece, tall rounded rects (44 px on wide stages, 36 on phones), tinted by kind, each in a thin rack frame (one frame
round them all with one rack, struck in the critical tone by a rack event), then 12 px apart the free disk in its own frame.
Names over the disks ("c1", "d3", "p2") where every name fits its slot (24 px), else only the failed disk's and the
spare's. A failed disk is hatched with a critical ×; the free disk is empty, fills from the bottom in the final tone as the
rebuild runs, and ends outlined in the final tone under the rebuilt piece's name. **The rebuild's reads**: a stub down
from every piece it reads (the first survivor for copies, the first k survivors for a code, skipping a staged failure)
into one bus that turns up into the free disk with an arrowhead; while it runs, one dot a source travels its stub, the bus
and the riser (k dots at most, never more). Under it: "the rebuild reads 6 pieces: 6 × 20 TB = 120 TB for a disk"
("reads 6 pieces: 120 TB a disk"; "reads 6 pieces"). When the object is lost there is nothing to read: "nothing is left
to rebuild from" in the critical ink.

**C. The race.** "After c3 fails: the repair race" ("After c3 fails"; "After the rack event: no race"). A fixed axis of
one week, 0 to 168 h, gridlines every 24 h (labels every 24 h wide, 0, 24, 72, 168 h on phones), so a 24 h window is a
seventh of the axis and a week fills it: the window's length is read, not told. Row one, "Repair of c3, from its
failure at 0": the window as a soft current band with a solid fill that grows with the rebuild, ending in a ringed check
and "rebuilt in 24 h" (or stopped, critical, "stopped: too few left"). Row two, "The 8 others": a track on which a
staged failure is a × at its moment, its name above it, and the loss "lost"; after a typical repair "none failed" at its
right end. Under the axis the race's sentence (full sentences, lines reserved at the race's foot, the longest any
setting and play needs at this width): "c3 is rebuilt on a free disk in 24 h, read from a surviving copy. A loss would
need both other copies to fail before it ends. Each fails within 24 h with chance 1 in 18,000, so in a typical repair
none does."

**D. The model.** The headline: STORED "1.5×", SURVIVES "any 3", NINES "11.8" (17 px mono, three columns at every
width). Then **the steps**, a walk along one nines scale ("Nines, each step right is 10× less likely"; "Nines · a step
is 10× less likely"), 0 to 24 labelled (every 3 wide; 0, 6, 9, 12, 18, 24 on phones), the scale running from −0.6 so
that 14 pieces at 10% (1.4 first failures a year, −0.15 nines) still sit on it. A row a factor, its words over its mark:

- "First failures: 9 pieces × 2% a year": a short ink line from 0 to a dot, "0.18 a year".
- "A given other piece fails before the 24 h repair ends" ("Another fails within 24 h"), then "And a second given
  piece", "And a third…": each a current-tone arrow rightward from a tick at the level before, "× 1 in 18,000". After a
  change of window or rate the old chance stays in words, "× 1 in 2,600 (was 1 in 18,000)".
- "Any 3 of the 8 others will do": a considering-tone arrow back left, "× 56" ("One choice only: the 2 other copies",
  "× 1", a lone tick, for copies).
- With one rack, "Or a rack event takes every piece at once (assumed)": a critical bar from 0 to 3 nines, "0.1% a year".
- "Lost in a year: 1 in 600 billion" (bold): an ink bar from 0 to a 5 px dot at the model's nines (critical when a
  rack event sets it), "11.8 nines" beside the dot, or inside the bar's end in stage-coloured type where the dot is
  near the right edge. After a change an open caret above the bar at the old value with "before 9.7" where it fits, and
  always the facts' last line "Before this change: 9.7 nines."

The 9 nines gridline is stronger. Under the plot the same axis read as **objects lost a year among a billion**: "1
million", "1,000", **"1"**, "0.001", "0.000001" (phones "1,000", **"1**", "0.001"), titled "Objects lost a year, among a
billion": the conversion from nines to an interviewer's answer is the axis itself. The challenge's goal is a 1.5 px
mark at 10 nines on the last row, muted until met, final once met, "goal: 10 nines". The facts at the foot: "A billion
1 MB objects, 1 PB, take 1.5 PB on 75 disks of 20 TB; at 2% about 1.5 of them fail a year. Each rebuild reads 120 TB: 11
Gb/s to finish in 24 h."

**The critics' rules** (round 3; these override the paragraphs above where they differ):

- *The free disk*, never "spare": it carries no name at rest beyond its frame's caption "free"; once rebuilt its name is
  "→c3", so no two disks share a name (asserted). A short window is said as physics: "One disk writes about 2 Gb/s, so
  a 20 TB disk refilled alone takes about a day; a faster repair spreads the lost pieces over many disks, each rebuilt
  in parallel."
- *Racks* are frames in `--g-stroke` (3:1, `theme-contrast.spec`), 4 px apart, captioned just above ("a rack each";
  "one rack", critical when struck; "free" over the free disk's own frame). Parity disks carry a 3.5 px solid cap band,
  and the stored bar is bracketed by kind ("6 data", "3 parity"; "3 full copies"), so kind never rests on colour.
- *The reads* are their own region, `reads`, hidden only by E3 (`hide: ['after', 'reads']`). Under the bus the read
  volume is drawn: one block a piece read, each one disk, then "the rebuild reads 6 pieces: 120 TB for a 20 TB disk"
  ("120 TB read"). A lost object always shows "nothing is left to rebuild from", never a placeholder; a reads box is
  drawn only when the play's end state rebuilds (asserted, and in the no-answer sweep).
- *The race*: before the failure the title is "The repair race" and the row "Repair"; the piece's name lands with its ×
  (asserted). The axis ends 10 px inside the stage so the end check clears any outline. A rack event: "After the rack
  event" ("Rack event"), row one "No repair: the rack took every piece at 0", row two "The 2 others, in the same event"
  with one × at 0 and "c1 and c2 lost at 0" ("all 13 lost at 0"); n − 1 crosses at one instant would sit on each other,
  so one × carries them and its words name them. A staged play always draws "STAGED, NOT SAMPLED" first and the title
  falls back ("After d3 fails" > "d3 fails"). Staged crosses are named above (or numbered, with the numbers on the struck
  disks); where they cannot stand their width + 4 px apart on the week, the race is drawn on its window instead (axis
  0, window, 1.5 × window; title "After d3 fails: the race, zoomed to its window").
- *The steps*: one row pitch, 34 px; payload values in the 13 px cap role on stages from 520 px. The rack row folds into
  the last row's words ("Lost in a year: 1 in 1,000, set by the rack event (assumed)"), its red bar kept, so six step
  rows at most, and the last row sits at a fixed place under them (the unused rows are gridded scale, not a slab at the
  foot). With a ghost the old walk is drawn: each step's old arrow a 1 px `--g-stroke` hairline 12 px under the new one
  with an open caret tip; "(was …)" on every changed window row and on the first failures; the window rows' old and
  new arrows differ by one amount, log10 of the window ratio (asserted).
- *The last row* places in this order: the bar and dot; the value beside the dot (right, inside the bar's end in stage
  type, above), never farther than 8 px (asserted); the ghost caret with "before 9.7" as one unit on its outer side in a
  lane above the bar, a bracket from caret to dot and the ratio ("49× likelier", "110× less likely") on the dot's side;
  the goal's words within 8 px of the goal mark. Whatever finds no place goes into the row's words ("(before 1 in 5.6
  billion)", ", 49× likelier", " · goal: 10 nines"); no far-edge fallback exists. No other value stands within 12 px of
  the caret (asserted). During a play NINES reads "…" until the last row lands.
- *The challenge* also marks 1.5× on the stored bar ("at most 1.5×" where it fits). The read-rate bound has no gauge (see
  changes.md); it is in the checklist and the facts.
- *Placeholders* are at least the text's height plus 8 px, words inset 4 px (asserted).

**Controls** (outside the stage, the house layout): "Stored as" (2 copies, 3 copies, 6 + 3, 10 + 4), "Disks failing a
year" (1%, 2%, 5%, 10%), "Repair time" (1 h, 6 h, 24 h, 72 h, 168 h), "Placement" (A rack each, One rack): native radio
groups drawn as segments, 44 px, nowrap, a checked segment changing colour only. In the one-column layout a readout,
"Stored as 6 + 3, 1.5× · 11.8 nines, 1 every 600 years among a billion" (three lines reserved), and the polite notice
(read out only below wide).

**Layout.** At container wide the stage takes the left column (620 px at 1280) and the controls, the open question and
the cards the 340 px right column; narrower, one column: controls, stage, question, the standing note, Describe, cards.

**Heights** depend only on the stage's width: six step rows and the last row at a fixed place, and every wrapped text
its longest form at that width. Measured over every setting, both plays and the hidden states:

| Stage width (px) | 252 | 270 | 286 | 300 | 322 | 344 | 360–374 | 400–430 | 460 | 520–560 | 620–700 | 760 |
| ---------------- | --- | --- | --- | --- | --- | --- | ------- | ------- | --- | ------- | ------- | --- |
| Stage height     | 1,277 | 1,243 | 1,226 | 1,209 | 1,192 | 1,175 | 1,158 | 1,124 | 1,107 | 1,098 | 1,064 | 1,030 |

`widget-heights.ts` gets the built widget's measured whole heights per host width (prevention 12). At 520 the wide form
takes the taller disks (8 px), so the height rises once there.

**Motion** (WAAPI on transform and opacity; the mockup redraws per frame, the build must not).

- **One clock a play** (`playPlan`): the failure at 0.35 s; the window from 0.9 s for 1.4 s + 2.2 s × √(repair / 168)
  (1.6 s for 1 h, 2.5 s for 24 h, 3.6 s for a week: a week visibly lasts longer, a short window never flashes); the t
  window rows land evenly inside it; the rebuild lands at its end; the ways row 0.45 s later; the last row 0.5 s after
  that; 0.9 s of rest. Nothing for an event is drawn before its moment: a row's words and mark land together, the free disk
  fills with the window's fill, the playhead runs only inside the window.
- **The climax** of a repair is the free disk filling as the window closes, then the walk ending at the model's dot on the
  billion axis. Of a staged loss, the last staged × inside the window: the window stops in critical, the object's bar is
  crossed, the reads disappear, and the sentence turns to "the object is lost". Of a rack event (one rack), the whole rack
  struck at once at 0.35 s with no window at all, and the rack row landing first.
- **Plays pause** by the widget host's visibility (IntersectionObserver on the host, reading the latest entry, plus
  `visibilitychange`). Any setting change or Stop ends the play and draws the new rest state.
- **Reduced motion**: the rest state is the play's end (the failure, the full window, the rebuilt free disk, every row), so
  nothing is lost; Play steps three moments ("Next moment, 1 of 3": the failure; mid-repair; rebuilt), Stage a loss the
  same for the staged loss, and the notice says each moment's sentence.
- **Phones**: choosing an answer scrolls the disks' row to the top (block start, under any sticky header) whenever the
  stage is taller than the viewport; the e2e phone spec asserts the free disk is in view while the answer plays;
  at the reveal the first focus outline is brought into view if it is off screen.

## 3. The experiments

Every number is a slot from `model.js` (`node enum.cjs` prints them all). Answer positions **1, 2, 3, 3, 1**. A card sets
the widget up as a new start (no ghost carries in), answering plays its act, the dock holds "your guess" ("Watch the
picture: the answer plays out on it."), the reveal is read out politely and its regions get a focus outline with one
"Look here" tag each.

**E1 "Half the storage"** (setup 3 copies, 2%, 24 h; act `set {scheme: 6 + 3}`, run `repair`; hides `after`; focus
steps, pieces). Ask: "Three copies on separate disks store 3× and survive any 2 lost copies; with disks failing at 2% a
year and 24 h repairs the model gives 9.7 nines. Switch to 6 + 3 erasure coding: 6 data pieces and 3 parity pieces, any
6 of which rebuild the object, stored at 1.5×, half as much. How likely is a loss in a year now?" Choices: **"About
110× less likely: a loss now takes 4 failures inside one repair"** / "About as likely: 3 more pieces to fail cancel the
extra parity" / "About 3× likelier: 9 disks see 3× as many first failures as 3". Reveal: "About 110× less likely: 11.8
nines against 9.7. Nine disks do see 3× as many first failures, 0.18 a year against 0.06 a year, and any 3 of the 8
others can finish the job, 56 ways. But a loss now needs 3 more failures inside one 24 h repair instead of 2, and each
is a 1 in 18,000 chance: one more such factor outweighs 3× and 56. Half the storage buys two more nines; the price
moves to the repair, which now reads 6 pieces instead of 1." The play: nine disks arrive, d3 fails, six read dots run,
the window closes; the steps and the loss stay hidden (one dashed box "The steps show after your answer", the last row
"after your answer", NINES "?") until the reveal lands the walk: the first failures' dot moves left (3× more of them) and the
ways arrow pulls back (56), but a third window arrow carries the dot 4.3 nines further right.

**E2 "A week to repair"** (setup 3 copies, 2%, 24 h; act `set {repair: 168}`; hides `steps`, `after`; focus steps,
race). Ask: "Three copies at 2% a year, each lost copy rebuilt in 24 h: 9.7 nines. A busy cluster throttles its repairs,
and each now takes a week, 168 h, 7× longer. How much likelier is a loss in a year?" Choices: "7× likelier: the danger
lasts 7× as long" / **"49× likelier: both other copies must fail inside the longer window"** / "340× likelier: all three
copies spend 7× as long in the window". Reveal: "49× likelier: 8.1 nines against 9.7. A loss needs both other copies to
fail before the repair ends, and each one's chance of failing inside the window grows with the window, from 1 in 18,000
to 1 in 2,600. Two such chances multiply: 7 × 7 is 49. The window enters the loss once for every failure the scheme
tolerates, which is why systems rebuild from many disks in parallel and put repairs ahead of other work. The window runs
from the failure to full redundancy: a slow failure detector lengthens it just as a slow rebuild does." While it asks
the setup's steps are hidden (their two window rows are the answer's mechanism) behind one dashed box of fixed height
(so it does not count the rows), and the race sentence drops its chance. The play: the window band grows to the whole
week. At the reveal both window arrows are visibly shorter, each "× 1 in 2,600 (was 1 in 18,000)", and the last dot
stands left of the caret "before 9.7".

**E3 "The repair bill"** (setup 3 copies, 2%, 24 h; act `set {scheme: 10 + 4}`; hides `after`, `reads`; focus pieces, race).
Ask: "A 20 TB disk fails. Under three copies its rebuild reads 20 TB: each lost copy is copied from a surviving one.
Switch to 10 + 4 erasure coding, which stores 1.4×: any 10 of its 14 pieces rebuild the object. How much does rebuilding
the same 20 TB disk read now?" Choices: "20 TB: one piece rebuilds one piece" / "28 TB: 1.4× the disk, like its
storage" / **"200 TB: 10 pieces for every lost one"**. Reveal: "200 TB: a lost piece is decoded, not copied, and
decoding takes any 10 of the 13 pieces left. So a 10 + 4 rebuild reads 10× the lost data, and finishing it in 24 h
takes 19 Gb/s of reads against 1.9 Gb/s for copies. That is the price of 1.4× storage: repair traffic, and slower reads
of a missing piece. Locally repairable codes cut it: Azure's code splits 12 data pieces into two groups of 6, each with
a local parity, and rebuilds a lost data piece from the 6 of its group." While it plays the bus area is one dashed box
"its reads show after your answer" and no read dot runs; at the reveal ten stubs drop into the bus.

**E4 "A bad batch"** (setup 10 + 4, 2%, 24 h; act `set {afr: 10, repair: 168}`; hides `steps`, `after`; focus steps,
headline). Ask: "10 + 4 erasure coding at 2% a year with 24 h repairs: 14.7 nines. Then a bad batch of disks starts
failing at 10% a year, 5× more, and the strained cluster takes a week, 168 h, to rebuild each one, 7× longer. How many
nines are left?" Choices: "13.2: a loss is 35× likelier, 5× the failures in a 7× longer window" / "11.7: about 1,200×
likelier, as if two failures had to line up" / **"7.9: the rate and the window count once for every failure a loss
needs"**. Reveal: "7.9 nines: a loss is about 7.4 million times likelier. The failure rate enters 5 times, once for the
first failure and once for each of the 4 more a loss needs, and the window enters 4 times, once for each of those:
about 3,100 from the rate and 2,400 from the window. The more failures a scheme tolerates, the harder a worse failure
rate and a slower repair hit it, though it still keeps the most nines: two copies at these settings keep 3.4. Measure
failure rates and repair times in production, and re-run the numbers when they move." (The ask's 14.7 is the lesson's;
see 7.)

**E5 "One rack"** (setup 3 copies, 2%, 24 h; act `set {rack: 1}`, run `staged`; hides `after`; focus pieces, steps).
Ask: "Three copies at 2% and 24 h: 9.7 nines, each copy in its own rack. Now put all three in one rack, and say a
rack-wide event that destroys every disk in it (a fire, a power fault, a bad firmware push) strikes a rack once in
1,000 years. How many nines are left?" Choices: **"3.0: one event takes every copy at once"** / "7.3: the event must
still race a repair" / "9.7: three disks still have to fail". Reveal: "3.0 nines: a loss once in 1,000 years, about 5.6
million times likelier than at 9.7 nines. A rack event needs no repair window to lose the object: it takes all three
copies at once, so no small chance multiplies it down. This is why correlated failures, not independent disks, set real
losses. Place pieces so no rack or zone holds more than the scheme can lose: if only two copies shared a rack, an event
would leave the third racing its repair, 7.3 nines; 6 + 3 across 3 zones, 3 pieces each, survives a zone, with no spare
until it returns." Its play is the staged rack event, tagged as staged; the numbers stay hidden until the reveal lands
the red rack row and the last bar beside it, far left of the independent walk.

**E6 Challenge "A billion objects"** (setup 3 copies, 5%, 24 h; goal `all`: lost a year among a billion below 0.1,
overhead below 1.6, rebuild below 10 Gb/s; keep `afr` 5, whose segments are disabled with "· the goal keeps 5%"). Ask:
"Your disks fail at 5% a year. Store a billion objects of 1 MB, 1 PB in all, and lose fewer than 1 in 10 years: a 10×
margin on 1 a year for what the simple model rounds off. Correlated failures are met by placement, not by margin, so keep
pieces in separate racks. Store at most 1.5×, and keep any one disk's rebuild
under 10 Gb/s of reads." Exactly one of 160 settings passes: **10 + 4, 72 h, a rack each** (10.8 nines, 1 every 70
years, 1.4×, 6.2 Gb/s). The nearest misses each fail one bound clearly: 6 + 3 at 24 h reads 11 Gb/s, 10 + 4 at 168 h
loses 0.42 a year, 10 + 4 at 24 h reads 19 Gb/s. The status is the house checklist, its lines in the ask's terms with
their states in words ("1 every 70 years among a billion, fewer than 1 in 10 years: met" / "1.4× stored, at most
1.5×: met" / "a rebuild reads 6.2 Gb/s, under 10 Gb/s: met"), under "Goal met:" only while all hold. Reveal: "10 + 4 in
separate racks, rebuilt in 72 h: 10.8 nines, 1 every 70 years among a billion, at 1.4× storage, 1.4 PB on 70 disks. That is an average: the billion objects share 70 disks, so a
loss, when it comes, takes about 170,000 objects at once, about once in 12 million years; limiting which disks share
objects trades how often for how many. A rebuild reads 200 TB, 6.2 Gb/s spread over 72 h. Three copies would store 3 PB; 6 + 3 needs 24 h repairs for the margin,
and reading 120 TB that fast is 11 Gb/s; a week's repairs lose it. The design: a wide erasure code, repairs throttled
but bounded, pieces in separate racks, and nines quoted only as the model's, since correlated failures, bugs and deletes
are not in them." The trade-off it makes a learner feel: a faster repair buys nines and costs bandwidth, a wider code
saves bytes and costs reads.

**One `hiding()` map** (prevention 1), each region named in the question's own `hide` list:

| Region | When | On the stage | Elsewhere |
| ------ | ---- | ------------ | --------- |
| `steps` | asking and playing (E2, E4) | no step arrow, tick, value or row words: one dashed box "The steps show after your answer", the same height whatever the scheme; the race sentence without its chance ("The chance of that shows after your answer."); no "(was …)" | Describe waits; the notice says the wait sentence |
| `after` | playing (E1 to E5) | everything `steps` hides, at the act's new setting; the last row a dashed box "after your answer"; NINES "?" | the summary ("The model's yearly loss shows after your answer."), the readout ("? nines"), the notice, Describe |
| `reads` | playing (E3 only) | no read stubs, dots or blocks: the bus a dashed box "the rebuild's reads show after your answer"; the facts' read clause replaced by "The rebuild's reads show after your answer."; the race sentence without "read from …" (a lost object shows "nothing is left to rebuild from" instead, always) | none |
| ghost | asking and playing (every question) | no caret, no "before", no "(was …)", no "Before this change" | none |

Hiding holds through the answer's own play and releases at the reveal. While a question asks or plays, Play, Stage a
loss and every setting are disabled, the notice says "Play, Stage a loss and the settings wait for your answer.", and
Describe waits.

## 4. Accessibility

- The stage is `role="group"`, `aria-roledescription="visualization"`, named "Durability: one object's pieces on their
  disks, a repair racing further failures, and the model's yearly chance of a loss"; its SVG carries the summary, which
  obeys `hiding()`: "One object stored as 6 + 3 erasure coding: 9 pieces, 6 of data and 3 of parity, each a sixth of its
  size: 1.5× in all, every piece on its own disk in its own rack. Disks fail independently at 2% a year, and a lost
  piece is rebuilt in 24 h. It survives any 3 lost pieces. The model gives 11.8 nines, a yearly loss chance of 1 in 600
  billion: among a billion such objects, 1 every 600 years."
- "Repair time" is a radio group named "Time to full redundancy: detect and rebuild".
- Play is a button ("Play a repair"; "Stop" during a play; "Next moment, 2 of 3" under Reduced motion; "Play a repair,
  after your answer" disabled while a question waits); Stage a loss is a toggle button (`aria-pressed`, "Stage a loss:
  play a loss, staged and named as staged"): a second press returns to the typical repair at rest, unpressed. The settings are native radio groups with full names ("6 + 3 erasure
  coding", "5% of disks fail a year", "168 h, a week", "Every piece in one rack"): arrows move within a group, Tab between
  groups. No mark on the stage is tappable, so there are no touch hints to clear.
- Notices (polite, `aria-atomic`): after a change the setting's sentence ("Stored as 6 + 3 erasure coding at 2% a year
  with 24 h repairs: 11.8 nines, 1 every 600 years among a billion objects, at 1.5× storage."); after a play its end
  sentence (the race's); each stepped moment's sentence; the reveal politely; when a challenge opens and after a reveal,
  the setting's sentence (never blank); nothing while a question hides.
- Colour is never alone: a down disk is hatched and crossed, the window's state is a check or "stopped" in words, data
  and parity are named in the key, the rack event's row says "(assumed)", the staged play carries its tag and its
  sentence, an arrow's direction carries "×" and the value. Small text uses ink tokens at 4.5:1; marks use `--g-viz-*` and
  `--g-stroke` at 3:1 (checked by `theme-contrast.spec.ts`).
- 44 px targets: Play, Stage a loss, every segment (44 px tall).
- **Describe** (`g-data-table` in a `minmax(0, 1fr)` grid, scrolling inside its own box): the summary, the race's
  sentence and the cost, and the exactness sentence computed per setting ("For copies the steps are the model exactly:
  a loss needs every other copy." / "…, 0.12% less here."); then a row per step, its header the stage's own row words
  (`stepWords`: the middle form, the shortest when compact; unique and never "Any 2 of the 2", checked at all 160
  settings) and the yearly loss: Step, Factor, Chance a year, Nines (compact
  under a 600 px stage: Step, Factor, Nines). The build measures the widest form that fits by `stage-text.ts` at 252,
  322, 344, 600 and 620 px (Storage's lesson: measure, not a breakpoint), so 320, 412, 1280 and 1440 never scroll
  sideways.

## 5. The prevention list

1. **Giveaways on every surface.** One `hiding()` (3) feeds the stage, the summary, the readout, the notice and
   Describe; Play, Stage a loss and every setting wait, so no play the learner starts can show an answer; the answer's
   play keeps the hiding to the reveal; a card's setup starts afresh (no ghost). The hidden-steps box has one height for
   every scheme, so it cannot count the steps. The mockup's `noAnswer()` renders every question asking (entered from
   four settings: the default, the challenge's solution, the act's own target and the heaviest setting) and its play at
   five moments, at 12 widths (540 renders), against each question's answer strings (its nines, ratio, chances, "And a
   fourth", "0.1% a year", "10 pieces", "200 TB", "19 Gb/s") on the stage, its labels, the controls, the readout and
   Describe, and structurally (no step arrow or rack bar while `steps` hides, no last dot or bar while the loss hides,
   no read stub or dot while the reads hide, no ghost caret, Play disabled): zero. It catches all six planted leaks
   (E2 and E4 without `steps`, E1 without the loss, E3 without the reads, E5 without both, E1 with a ghost). The
   built component's spec runs the same with motion off and on, frame by frame through the play.
2. **False claims.** No hidden value has a default: hidden reads "?" or "after your answer". The false-claim list (NaN,
   undefined, Infinity, an em dash, exponent notation, "0 pieces", "1 copies", "1 years") runs over every rendered stage
   (5,600 setting renders, 384 experiment renders) and every page sentence of all 160 settings: none. A play is never
   the model (Honesty rule, 1). Sentences are computed per setting ("both other copies", "the other copy", "4 of the 13
   others"); the layout assertions check by rule at every setting and frame that the race's sentence and the picture
   agree on a loss and on the rebuild, that a lost object is crossed, that a staged play says it is staged, that the
   read stubs equal the scheme's read (or none once lost), that the last dot sits at the model's nines, and that nothing
   hidden is drawn.
3. **`$index` tracking.** Pieces are tracked by id ("d3"), rows by kind and index ("window-2"), read dots by source id,
   staged failures by piece id; a scheme change replaces the set, a play adds marks by id.
4. **Labels and lines.** Every stage text has a stage-coloured halo and is placed by the house `Draw` (marks and lines
   first, then labels with candidates and fallbacks). Gridlines run under grounded axis labels only; the checker flags
   text on text, a line or dashed box through text, text on a mark, off-stage text or marks, dots on dots, axis labels
   under 6 px apart (race, nines, billion axes), text against a focus outline's stroke, a text under a hit box, and any
   label with no place: zero at every setting, width and frame. The read dots move only on the stubs, the bus and the
   riser, which no label crosses; the playhead stays in the band and on the track.
5. **Look-here tags.** One tag per outline (regions that touch merge), on the outline's edge first, then inside; every
   revealed frame and the met challenge at 12 widths hold exactly one placed tag per outline (asserted).
6. **Marks before their event.** One monotone clock per play (`playPlan`); every row (words and mark), the failure, each
   staged ×, the free disk's fill, the check and the loss appear at their moment and not before (the mockup draws from
   `playState(tau)`; the sweep samples four moments of both plays at every setting).
7. **Visibility and reduced motion.** Plays pause on the host's visibility and the page's; Reduced motion draws the end
   state (every mark and number) and Play steps the three moments.
8. **CSS specificity.** Every `fieldset.group` has zero padding and a control's class only adds to it; 320 px shots show
   the four groups above the stage with "168 h" and "3 copies" on one line (nowrap, 3 px side padding).
9. **Words.** Summary, notices, race and facts are full sentences with plural grammar; no sentence opens on a numeral
   (checked over every page sentence: the notice now opens "Stored as 2 copies…"); thousands separators ("18,000",
   "1,000"); the challenge's status is the checklist, "Goal met:" only while all three hold; the notice is never blank.
10. **Describe** fits or goes compact by measured width and scrolls in its own box (4).
11. **Touch hints**: none exist (no tappable mark).
12. **Placeholder heights**: a step function of the stage's width (2); the build measures the widget at 320, 360, 375,
    390, 412 and 430 px and every 50 px from 300 to 1,300 into `widget-heights.ts`, failing on drift over 3 px.
13. **Text measurement.** The mockup measures with canvas from the shipped fonts; the build through `stage-text.ts`
    (the label role uppercases all but a unit after a number: "24 h", "20 TB", "Gb/s"); stage text never uses tabular
    digits.
14. **Learner text in HTML** goes through `g-code-text` with this widget's keep rule (`DURABILITY_KEEP`): a number with
    its unit, "1 in 18,000" whole, "6 + 3" whole, "× 56" whole, a count with its period ("1 every 600 years", "1.5 a
   year", "1 in 10 years", "5.6 million years"; checked on every HTML sentence of every setting and every experiment, and
   by the shots: no kept span breaks at any width); every live region holding it is
    `aria-atomic`. The stage's own wrap keeps the same pairs.
15. **Element counts** bounded by the scheme and the width, never by data: at most 15 disks and frames, 10 read stubs and
    dots, 8 rows, 4 staged ×; about 160 nodes at the heaviest setting (10 + 4, one rack, staged). A play moves the dots,
    the band's fill and the playhead by transform and adds a row's group on its event; the builder measures keydown to
    the second frame (a scheme change to 10 + 4 in one rack) under 150 ms on a Pixel 7 profile at 4× CPU, and 60 fps
    through the staged play there.
16. **Zoneless reads.** Specs and e2e wait for the state's summary (web-first assertions); `durability-lesson.spec.ts`
    runs on desktop, the phone and the WebKit iPhone project.
17. **Marks mean one thing.** Dashed only for "hidden until you answer" (the steps box, the last row, the bus box), with
    one house exception accepted: the shared focus box's dashed outline, which only shows at a reveal, when no
    placeholder exists. The free disk is a solid empty disk, never dashed; a cross is a down disk or a lost object; hatched is down; the ghost is an
    open caret above the bar with its words; focus outlines are stroke only round the whole region.
18. **On the scale.** Every value any setting, ask, reveal or ghost uses lies on −0.6 to 25 nines (the extremes: 1.4
    first failures a year at −0.15; 10 + 4 at 1% and 1 h, 24.6 before its ways, 21.8 nines), checked for every step of
    every setting; nothing is cut. The ghost's old value is said beside its caret where it fits and always in the facts.
19. **Units.** No figure drops its unit in any fallback ("reads 6 pieces: 120 TB a disk", "1 every 600 years", "0.18 a
    year", "× 1 in 18,000"). The conversions a learner must make are drawn: object to stored bytes (the bar of pieces),
    nines to objects a year (the billion axis), window to chance (the arrow's length on the scale), hours (the week axis).
20. **Layout.** Reserved lines collect at their box's foot (the race sentence under the axis, the facts at the stage's
    foot, unused step rows below the plot); a checked segment keeps its weight; choosing an answer on a phone brings the
    stage's top into view.
21. **Wrap the same everywhere.** Every wrapped stage text is laid out by `stage-text.ts` (`proseLines`, the keep rule,
    slack), and every reserve is the measured maximum over all settings and plays at that width.
22. **One state, every surface.** The band, dock, stage, readout and Describe all read one `durabilityScenario` and one
    `playState`; mid-play no surface shows NaN or an empty cell (a row not yet landed is absent, not blank).
23. **CI.** Every new spec waits deterministically (focus via `expect.poll`, the IntersectionObserver reading its latest
    entry) and runs on the WebKit iPhone project; the build dispatches `ci.yml` on its wip branch before reporting done.

## 6. What a learner can say in an interview afterwards

- "Durability is the chance an object is never lost in a year. To lose it, after one disk fails, more pieces than the
  scheme tolerates must fail before that repair ends. So the yearly loss is about pieces × AFR × the chance enough of
  the rest fail inside the window."
- "Three copies at 2% and a day's repair is about 9.7 nines; 6 + 3 erasure coding stores half as much and gets about
  11.8, because a loss needs one more failure inside the same window, a 1 in 18,000 factor, which beats the extra disks."
- "The repair window enters once per tolerated failure: a week instead of a day is 7 × 7 = 49 times the loss for three
  copies. Fast, parallel rebuilds are the cheapest durability there is."
- "Erasure coding moves the cost to repair: rebuilding a 20 TB disk under 10 + 4 reads 200 TB, about 19 Gb/s to finish
  in a day. LRCs cut that by repairing from a local group."
- "For a billion objects to lose fewer than one a year I need 9 nines, and I want margin: at 5% AFR, 10 + 4 rebuilt
  within 72 hours gives about 10.8 nines, 1.4 PB raw for 1 PB, 70 disks, rebuilds of 6 Gb/s."
- "Those nines assume independent failures. One rack holding every piece makes it about 3 nines: correlated failures,
  not disks, set real losses. So no rack or zone holds more pieces than the scheme can lose, and backups still matter,
  because a bad delete is durably stored on every piece."

## 7. Lesson text fixes (`libs/engine/src/sysdesign/lessons/durability.ts`)

- `widget.tryThis` goes (the experiments replace it; its three paragraphs quote the old widget's controls);
  `widget.experiments` takes `DURABILITY_EXPERIMENTS`.
- Every quoted nines value agrees with the model as the widget rounds it (enum.cjs checks the ten: 9.7, 11.8, 14.7,
  12.5, 8.1, 5.7, 4.8, 7.9, 3.4, 10.9); keep them.
- "Correlated failures and failure domains": "The simple model, and the widget, assume disks fail independently" stays
  true for the arithmetic; add after it: "The widget's one-rack placement shows what a single shared cause does: with a
  rack event assumed once in 1,000 years, three copies in one rack keep 3 nines instead of 9.7." (E5's numbers, slots.)
- "Repair speed is the main lever": "Halving the repair time of three copies cuts losses about four times; for 6 + 3
  about eight times" is right (2^t); add "a week instead of a day costs three copies about 49 times" (E2).
- The second example's "about 18.5 Gb/s" and "1.85 Gb/s" agree with the model (18.52, 1.85); the widget prints two
  significant figures (19 and 1.9), which content review should accept as the same figure.
- Nothing else changes.

## Notes for the builder

- Words live in `durability-words.ts`, ported from model.js's words section (`summary`, `raceSentence`,
  `factsSentence`, `exactWords`, `stepWords`, …), so enum.cjs checks the same functions the stage and Describe use.
- The mockup's geometry is the spec: the `Draw` placement order (racks, disks, reads; the race; the walk, its values,
  the ghost's caret then its words; the goal), the fallbacks for every label, the reserves. Files: `durability-layout.ts`
  (a pure `buildStage(width, scenario, play, view)` returning marks), `durability-words.ts` (`hiding()`, the summary,
  notice, race, facts, readout, Describe, goal checks), `durability-motion.ts` (the clock and the dots), the component
  (`durability-widget.component.ts`, now lazy through `app-lazy-widget`, keeping the kind `durability`) and its spec (the
  no-answer sweep with motion off and on and the six leaks), a layout spec over all 160 settings at 12 widths from 248
  to 700 px with play frames and ghosts and the assertions in 5, and e2e `durability-lesson.spec.ts`.
- The mockup redraws the whole stage each frame of a play; the build must not (prevention 15).
- `content.md` (every string of the built widget, both checklist states) is generated by a browser walk of the built
  widget and goes to content review with the experiments.
