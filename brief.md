# Unique IDs widget (`id-layout`): design brief

Redesign R42, the first of the batch's four remaining widgets (REDESIGN.md 5.2: the R41 to R45 entry, its "Forms"
bullet, which names no picture for `id-layout`, and the notes of the R41 widgets from Data Modeling to Storage
Engines; LOOP.md rows 122 to 128 are the house references). Lesson: `/design/topics/sd-ids`. Files beside this brief,
on the orphan branch `design/r42-ids`:

| File          | What it is |
| ------------- | ---------- |
| `model.js`    | The layout (fields, lifetime, generators, ids a tick and a second), a real Snowflake generator run on a stated clock and stated requests (three generators, waits, clock faults, a shared number), ids as BigInt, the birthday bound, the words (summary, ledger, sentences) and the five experiments and challenge as slot values; ported to `libs/engine/src/sysdesign/lessons/widgets/ids.ts`, `ids-format.ts` and `ids-experiments.ts` |
| `enum.cjs`    | Prints every number, checks 1.5 million ids against a second implementation that builds each id as a 64-character bit string, the generator against a second one stepped microsecond by microsecond, the burst against its formula, repeats and order by brute force, the birthday bound against the exact product and against collisions counted in 20,000 seeded trials at 16 and 20 bits, the lesson's 15 quoted numbers, 180,000 sentences of every setting by rule, the answer positions, and the challenge by enumeration over all 578 layouts (exactly one passes). About 5.7 million checks |
| `mockup.html` | The mockup with the app's tokens and fonts: `?state=default\|tick10\|gen11\|gen16\|gen0\|seq0\|epoch1970\|overflow\|burst\|skew\|stepback\|naive\|shared\|random64\|trillion\|playing\|reduced\|describe\|ask&exp=1..5\|play&exp=1..5\|reveal&exp=1..5\|challenge&theme=light\|dark`; any setting by name (`gen=`, `seq=`, `tick=`, `epoch=`, `load=`, `fault=`, `guard=`, `bits=`, `count=`), `playing` and `play` take `&frac=` (the moment of the 8 ms), `reveal` takes `&pick=` (the learner's guess), `challenge` takes `&solved=1`, any state takes `&leak=<flag>` (a planted leak for the sweep) |
| `shoot.cjs`   | Screenshots every state at 1280, 390 and 320 px in both themes with the page's collision report, then sweeps 1,100 settings at four widths, every reveal's "Look here" tags at 14 widths, the no-answer sweep (each question asking and at four moments of its answer's play, motion off and on, text and structure) proven by eight planted leaks, and prints the stage heights per width |
| `changes.md`  | Each critique item and what changed for it (round 0, the designer's own) |

## 1. The verdict, and the mechanism

**Today's widget against the bar.** Two sliders, two button rows, a bar of four flex segments and four number tiles
("Lasts 69.7 years", "Generators 1,024", "Ids/s each 4,096,000", "Chance of any repeat"). Every number is right and none
of them is a mechanism: the learner never sees an id. No bit is drawn, no clock ticks, no generator makes anything, so
the widget cannot show the three facts the interview turns on: that the timestamp is in the high bits (so ids sort by
time, but only to the tick, and within a tick by generator), that the sequence runs out and the generator then waits,
and that the whole scheme is safe only while clocks move forward and generator numbers are unique. Its random panel
prints "about 2.7%" with no picture of why a billion ids against 18 billion billion values collide at all. Far below
the owner's bar; it is redrawn.

**What the learner must see.** An id being made, bit by bit, by generators that never talk to each other.

- **What an id must do.** Unique always; compact (64 bits is half a UUID in every key and index); often roughly
  time-ordered, so an index takes inserts at its right edge.
- **The ways to make one.** A single database counter (simple, ordered, a bottleneck and a single point of failure);
  counters split by range or stride (each generator hands out its own block: hi/lo, Flickr's odd and even ticket
  servers); random ids (UUIDv4: 122 random bits, no coordination, collisions by the birthday bound, inserts scattered
  across the index); time-ordered layouts (Snowflake: 1 sign bit, 41 bits of 1 ms ticks from a custom epoch, 10
  generator bits, 12 sequence bits; ULID and UUIDv7 put a 48-bit millisecond timestamp first and random bits after).
- **The layout is the design.** With `g` generator bits and `s` sequence bits the timestamp keeps `t = 63 - g - s`
  bits, and exactly:
  - lifetime = `2^t × tick` (69.7 years at 41 bits and 1 ms; `2^t` ticks from the epoch, so the end date is the epoch
    plus that);
  - generators at once = `2^g`;
  - ids a tick per generator = `2^s`; ids a second per generator = `2^s × 1000 / tick_ms`; in all, `2^g` times that.
  - So every bit moved between fields halves one figure and doubles another.
- **The id** is `ts << (g + s) | generator << s | seq`, with `ts = floor((clock - epoch) / tick)`. Numeric order is
  therefore (timestamp, generator, sequence) in that order.
- **The generator** (the Snowflake algorithm, exactly as the model runs it): requests are served in arrival order; the
  timestamp is the clock's tick; within one tick the sequence counts 0, 1, 2...; when all `2^s` values of a tick are
  used, the generator waits for the next tick. With "keep the last timestamp" on, a clock behind the last timestamp
  used waits until it catches up (Twitter's refuses; the lesson says wait out a small jump, refuse a large one); with it
  off, the generator trusts its clock and starts the sequence at 0 again, which can reissue an id.
- **What breaks.** A clock stepping back (repeats, or with the guard a wait); clocks skewed between machines (ids order
  only roughly across generators); two generators handed the same number (repeats with no error); the epoch running out
  (counting 41 bits of ms from 1970 ends on 7 September 2039; past the end a generator must refuse).
- **Random ids.** The chance of any repeat among `n` ids of `b` uniform random bits is about
  `1 - e^(-n² / 2^(b+1))` (the birthday bound, an approximation, said so wherever it is read): it grows with the square
  of the count while small, reaches one half near `sqrt(2 ln 2 × 2^b)` ids (5.1 billion at 64 bits, 2.7 × 10¹⁸ at
  122), and a billion 64-bit ids give about 2.7%.

**What the widget draws, what experiments test, and what stays text** (as a senior interviewer would weigh them):

| Idea | Weight | Where |
| ---- | ------ | ----- |
| The 64 bits as fields; the field widths are the design | core | Band A: the id's 64 bits as cells coloured by field, the bit values written in them, field names over them; the steppers |
| Lifetime = 2^t × tick; one bit halves or doubles it | core | Band B's timestamp row "2⁴¹ ticks × 1 ms = 69.7 years", the end date, the lifetime ruler on a log scale where each tick mark is one bit; a ghost "was 69.7 years with 41 bits: one bit fewer halves it"; E1, the challenge |
| Generators = 2^g; ids a second = 2^s × ticks a second | core | Band B's two chains; a lane that cannot get a number ("no number: 1 generator bit gives only 2 numbers"); the challenge |
| The clock's reading becomes the timestamp | core | The drawn conversion under the bits: "G2's clock: 12:00:00 + 2.9 ms − epoch 1 January 2026 = 28,296,000,002.9 ms ÷ 1 ms a tick, rounded down = 28,296,000,002" |
| Generators mint alone, never colliding | core | Band C: three lanes over 8 ms of a stated clock, every id a dot at its moment, the sequence numbers over a tick's dots |
| Sequence runs out; the generator waits | core | The burst: a gauge a tick filling to 2^s, a bracket "4 full ticks of 1,024", "904" in the last, the wait line; E2 |
| Ids sort by time only to the tick, then by generator | core | Band D: every id in id order, each with a dot at the moment it was made, joined by a line that steps back inside a tick; E3 |
| Clock stepping back: repeats, or a wait with the guard | core | The fault "G1's clock steps back", the guard toggle; repeats ringed red in the lane and "same id as the row above" in the sorted list; E4 |
| Birthday bound, the square law | core | Band E: chance of any repeat against ids made, log on both axes, 64 and 122 bits, the marker at the chosen count, a drawn triangle "× 1,000 ids" along, "× 10⁶" up; E5 |
| Two generators with one number | high | The fault "G2 given number 1": five repeats ringed; free play and the lesson's pitfall |
| Clock skew orders ids roughly | high | The fault "G2's clock ahead": five ids out of time order, amber in the sorted list with a one-line legend |
| Epoch runs out | high | Epoch 1970 ends on 7 September 2039; with 16 generator bits it ended in 1971 and every lane refuses |
| Random keys scatter inserts in the index | high | "Where 24 new ids land in the index": the last page against 11 of 12 pages (an illustration from a seeded draw, said so in the brief and Describe) |
| One counter; ranges and strides; hi/lo | medium | Lesson text (concept 2). Drawing a counter would be a second widget; the interview point (a bottleneck and a single point of failure) is one sentence |
| UUIDv7 and ULID | medium | The index strip names "time-ordered ids" for both; lesson text; the interview fact below |
| Ids in URLs, base62 short codes, JSON precision | medium | Lesson text and pitfalls |

**The model, ported.** `model.js` is the engine module's whole content (`layout`, `encode`, `decode`, `bits`, `mint`,
`groups`, `birthday`, `birthdayExact`, `evenOdds`, the format helpers and the sentences). Settings, all numbers as
`ExperimentSettings` requires: `gen` and `seq` (0 to 16), `tick` (1 or 10), `epoch` (0 custom 2026, 1 Unix), `load`
(0 the stated trickle, 1 a burst of 5,000 requests to G0 at 0.05 ms), `fault` (0 none, 1 G2's clock 2 ms ahead, 2 G1's
clock steps back 2 ms at 5.5 ms, 3 G2 handed number 1), `guard` (0 or 1), `bits` (64 or 122), `count` (10^3 to 10^15).
The stated clock starts at 12:00:00.000 UTC on 24 November 2026; the stated requests are 20 arrival times over 8 ms
(G0 7, G1 7, G2 6), chosen so that one tick holds three ids from one generator, one id has generator and sequence
above 0 (G2 at 2.9 ms, the id the bits show at rest), and in the tick at 7 ms the generator that made its id last (G0)
sorts first. The old `idLayout` and `collisionChance` are retired (their only caller is the old widget); `layout`
returns their numbers at every setting.

**Honesty.** Every number is a slot from the model: lifetimes, counts and rates are exact powers of two for the
layout; dates are the epoch plus `2^t` ticks; every drawn id is the id the layout makes from the stated clock (its bits,
its decimal value, its order, its wait, its repeat), and `enum.cjs` rebuilds each from a bit string. The mint's 20 ids
are a stated sample of requests, never a rate: the rates are the ledger's, and the sub-caption says "None talks to
another" and names the clock. A collision chance is always "about ...", by the birthday bound; the index strip's 24
inserts are an illustration from a seeded draw, said in its caption ("Where 24 new ids land") and in Describe. The
model's simplifications are stated where the learner reads them: a perfect clock unless a fault says otherwise (the
lane notes say which clock is wrong and by how much), generator numbers assigned without error unless the fault says
"G2 given number 1", uniform random bits (the chart's title says "by the birthday bound").

## 2. The picture

One `g-stage`, five bands top to bottom, each with a small-caps label. Height is a function of the stage width and the
settings' line counts only (no play changes it); see the heights at the end of this section.

- **Band A, "One id, 64 bits".** The inspected id (at rest G2's id at 2.9 ms, or the first repeat when there is one;
  while playing the newest id; a tap on any dot or row inspects it) as 64 cells in one row (two rows of 32 under 560
  px), separated by a gap between fields, coloured by field (sign grey, timestamp `--g-viz-current`, generator
  `--g-viz-considering`, sequence `--g-viz-final`): a 1 is a filled cell with its digit in the stage colour, a 0 a tinted
  cell with its digit in the field colour. Field names over each field, the longest form that fits its span
  ("timestamp · 41 bits", "generator 10", "10"). Under the bits: the field values in mono, wrapped only at their joins
  ("timestamp 28,296,000,002 · generator 2 · sequence 1"), the drawn conversion from the clock to the timestamp
  (segments, each kept whole), and the id in decimal ("id 118,682,025,992,396,801", with "made twice" in danger ink for
  a repeat). Overflow: "No id: the clock is past the timestamp's end, 2 February 1971. A generator must refuse to mint."
- **Band B, what each field buys.** Three rows, a colour chip and name in a 150 px column (above the chain when narrow),
  then the chain: "2⁴¹ ticks × 1 ms = 69.7 years", "1 January 2026 to 7 September 2095"; "2¹⁰ = 1,024 generators at
  once"; "2¹² = 4,096 ids a tick × 1,000 ticks a second = 4,096,000 ids a second each", "4,194,304,000 ids a second
  from all 1,024". Under the timestamp row, the **lifetime ruler**: a log axis from 2^30 to 2^67 ms with a step mark at
  every bit (one bit, one step, twice as long), labels 1 month to 1 billion years (the widest form at which all keep 6
  px apart: "1 year" then "1 yr", then every other label), the lifetime as an accent dot named "lasts 69.7 years", and
  today as a small triangle named "today, 328 days in" (from the epoch to the stated clock). A change of the steppers
  leaves its ghost in words under the end date: "was 69.7 years with 41 bits: one bit fewer halves it".
- **Band C, "Three generators, no coordination".** Lanes G0, G1, G2 (name, then "number 0"; "#0" when narrow; a
  fault's note under the name: "clock runs 2 ms ahead", "clock steps back 2 ms at 5.5", "handed G1's number" in danger
  ink) over a fixed axis of 0 to 8 ms, alternate ticks shaded so a tick's ids share a band (with a 10 ms tick, "One 10
  ms tick spans all 8 ms drawn"). Each id is a 4.5 px dot (3.5 px narrow) at the moment it is made; the inspected id is
  accent with a ring; a repeat is critical with a critical ring (stroke only, around the whole dot). Sequence numbers
  sit over a tick's dots only when some are above 0 ("0 1 2"), so the 20 zeros do not crowd the lanes. A request that
  waited: a thin amber line from its arrival (a small ring) to its dot, "waits 0.7 ms: clock behind" under it when it
  fits and on wide stages only. A tick with more than three ids (the burst) is one gauge, filled to the ids made over
  the `2^s` a tick holds; full gauges share one bracket "4 full ticks of 1,024" (short form "4 × 1,024"), the last
  partial gauge its count "904", and "last waits 3.95 ms" beside them when it fits (the sentence always says it). Ids
  made after 8 ms are counted in the lane's gutter in warn ink ("+3 after 8 ms"), never drawn. A lane that cannot run
  says why in its own row. The step back is a short critical tick at 5.5 ms with "−2 ms".
- **Band D, "Sorted by id".** Every id in id order on the same time axis as the lanes: the gutter holds its decimal
  value (wide) and "tick · G · seq" (always; "5·1·0" when narrow); in the plot, a dot at the moment it was made, and a
  hairline through the dots in row order, drawn under them. Where the line steps back, an id made later sorts first: a
  rising staircase with a step back in every tick. A burst's tick is one row ("1,024 ids", "0 · 0 · 0–1,023") with a
  bar from its first to its last id's moment. Repeats: the row in danger ink and "same id as the row above" beside
  the dot; out-of-time-order ids (skew or a step back) amber, with one legend line under the list. "3 more ids made
  after 8 ms are not drawn" under the list when there are.
- **Band E, "Random ids beside them".** Left (60% wide, full width narrow): "Chance of any repeat, by the birthday
  bound", log axes 10³ to 10¹⁵ ids and 10⁻²⁴ to 1, both curves (the chosen one accent and thicker, the other the stroke
  tone), named at their ends ("64 bits", "122 bits, UUIDv4"), a vertical line and a marker at the chosen count with its
  value ("about 9.4 × 10⁻²⁰", "near certain", "..., below the chart" when under 10⁻²⁴), and, while the chance is small
  and the curve on the chart, the square law as a drawn triangle ending at the marker: "× 1,000 ids" along, "× 10⁶" up.
  Right (or under): "Where 24 new ids land in the index": 12 leaf pages twice; time-ordered ids fill the last page ("all
  24 in 1 page, which stays in memory"), random ids touch 11 of 12 ("each read from disk once the index outgrows
  memory").
- **Placement.** Every label is measured by `stage-text.ts`'s roles (Inter 500/600/700 at 11 and 13 px, JetBrains Mono
  600 at 10, 11 and 13 px), wrapped by measure with 6 px held back and a keep rule (a number with its unit, an operator
  with its operand, a field name with its value: segments are never split), placed from candidate positions that cross
  no curve, dot or text (the marker's figure and the curve names), and checked by the collision report.
- **Controls** (HTML, beside the stage at 1000 px and up, under the dock narrow): The layout: Generator bits and
  Sequence bits steppers (− value +, 44 px, one bit a press: the unit of the trade; there are no boundary handles on
  the bits because at 0 generator bits both boundaries share one place and two 44 px targets would overlap). Tick (1 ms,
  10 ms) and Epoch (2026, 1970) segments. Requests to G0 (A trickle, 5,000 at once). What goes wrong: four segments
  two by two (Nothing, G2's clock ahead, G1's clock steps back, G2 given number 1) and the toggle "Keep the last
  timestamp (wait if the clock is behind it)". Random ids: 64 random bits, 122 (UUIDv4), and Ids made (a range of 13
  decades with its output "A billion ids (1,000,000,000)"). A checked segment changes colour, never weight. The notice
  (polite, atomic) sits at the foot of the controls at wide and is read out only below it.
- **Layout.** Wide (page ≥ 1000 px): stage column `minmax(0, 1fr)`, a 320 px side column holding the dock (when an
  experiment or the challenge is open), the controls and the experiment cards, sticky. Narrow: stage, dock, controls,
  Describe, cards. Stage heights at the default, from the mockup: see `shoot.cjs`'s last line, quoted at the end of
  `changes.md`; the builder measures its own into `widget-heights.ts` at 320, 360, 375, 390, 412 and 430 px and sweeps
  300 to 1,300.

**Motion.** Play runs the 8 ms of the stated clock in 8 s on one monotone play clock (`t` from 0 to 8,000 µs), paused
by the widget host's visibility, never by one band's. Marks appear as their events arrive and never before: a dot at
its `issued` moment, its bits in band A (the inspected id is always the newest made), its row inserted at its rank in
band D (rows tracked by the id's stable key `g1-4`, never `$index`, since rows insert mid-list), a gauge filling as its
tick's ids are made, a wait line when its id is made, a repeat ring when the second copy is made. A thin accent line
marks the clock's now across the lanes. The climax is the end of a fault's play: the repeats ring red in the lanes and
in the list, or, for the burst, the last gauge closes and "last waits 3.95 ms" appears. Changing the layout plays
nothing; its ghost is said in words. Reduced motion: Play draws the end state at once and a caption under the stage
(no live role) says "Reduced motion: the mint is drawn at its end." with the mint sentence; no meaning is in motion
alone. The frame cost is bounded by the stage: 64 cells, at most 20 dots and 20 rows in steady load, and in a burst at
most one gauge a tick (8) and one row a tick, whatever the count of ids (5,000); the chart is two paths of 241 points.
A play redraws only the marks whose event the clock passed (at most 20 events in 8 s; the now line moves on the
compositor).

## 3. The experiments

Five predictions and a challenge. Answers sit at positions 3, 1, 2, 1, 3 (`enum.cjs` asserts them), and choice
lengths are within 2.6 times of each other. Each card sets its setup, asks with its hidden regions hidden on every
surface, plays its act on answering with the same regions still hidden, then reveals: the regions return, the choices
are marked, the reveal is read out, and the focus regions get a solid accent outline with a "Look here" tag.

1. **One bit for the generators.** Setup: the default (Snowflake). Ask: "Snowflake's timestamp has 41 bits of 1 ms
   ticks and lasts 69.7 years. Move one bit from it to the generators, for 2,048 generators. How long does the
   timestamp last now?" Choices: "About 139.4 years" / "About 68.7 years: one year less" / **"About 34.8 years"**.
   Act: set `gen: 11` (the ruler's marker moves one bit step). Reveal: "The timestamp now holds 2⁴⁰ ticks, and 2⁴⁰ × 1
   ms is 34.8 years, ending on 3 November 2060 instead of 7 September 2095. A bit is a doubling, so every bit moved out
   of the timestamp halves its lifetime, and every bit moved in doubles it: the marker on the ruler steps one bit
   left." Focus: the timestamp row and the ruler. Hides (`lifetime`): band B's result ("= ?" in the chain, a dashed
   "Hidden until you answer" box for the end date), the ruler's lifetime marker and its name, the summary's timestamp
   sentence, Describe. The chain "2⁴⁰ ticks × 1 ms =" stays: computing it is the lesson, and nothing on the stage
   prints the product.
2. **A burst in one tick.** Setup: default with 10 sequence bits (steady load, so nothing waits on the stage). Ask:
   "With 10 sequence bits a generator has 1,024 sequence numbers a tick. G0 gets 5,000 requests at 0.05 ms. How long
   does the last of them wait for its id?" Choices: **"About 4 ms, four ticks later"** / "None: they all fit in that
   tick" / "About 1 ms, until the next tick". Act: set `load: 1`, play. Reveal: "Each tick gives G0 only 1,024 ids,
   so the 5,000 requests take 5 ticks: four full gauges, then 904 ids in the last, and the last request waits 3.95 ms.
   The generator never repeats a sequence number; it waits for the clock. The other generators are not slowed at
   all." Focus: G0's lane. Hides (`burstAfter`): G0's ticks after the first (a dashed box over them in the lane, "Later
   ticks hidden until you answer"), the bracket and counts, the wait line, G0's later rows in the sorted list, the
   burst sentence.
3. **Which id sorts first.** Setup: the default. Ask: "In the tick at 7 ms, G2 makes an id at 7.1 ms and G0 makes one
   at 7.8 ms. Which id is smaller, so it sorts first?" Choices: "G2's: it was made first" / **"G0's: its generator
   number is lower"** / "Whichever has the lower sequence number". Act: play. Reveal: "Both ids carry the same
   timestamp, the tick at 7 ms. The next bits are the generator's number, and 0 is below 2, so G0's id sorts first
   although it was made 0.7 ms later; the sequence bits come last and only break ties within one generator. Ids sort
   by time only to the tick." Focus: the sorted list. Hides (`order`): the whole sorted list (one dashed box: every tick
   shows the same rule, so hiding only tick 7 would leave the answer in tick 0), the inspected id's bits and decimal
   value (comparing decimals would answer it), the summary's order sentence, Describe. The field order in band A's
   names stays: reasoning from the layout is the point.
4. **The clock steps back.** Setup: default with the guard off and no fault (nothing repeats at rest). Ask: "G1 trusts
   its clock: it does not keep its last timestamp. At 5.5 ms its clock steps back 2 ms. What happens to the ids it
   makes after that?" Choices: **"Some repeat ids it already made"** / "They sort before its earlier ids, but none
   repeats" / "Nothing goes wrong: the sequence keeps them apart". Act: set `fault: 2`, play. Reveal: "Two ids are made
   twice: after the step G1's clock reads ticks it has used, and its sequence starts again at 0, so it makes the same
   timestamp, number and sequence as before. Turn on "Keep the last timestamp" and G1 waits 0.7 ms for its clock to
   pass the last timestamp it used, and none repeats." Focus: G1's lane and the sorted list. Hides (`repeats`, which
   also sets `order`): repeat colours and rings in the lanes (dots drawn plain), the sorted list, the inspected id, the
   repeat and order sentences ("Whether any id repeats is hidden until you answer."), Describe.
5. **A billion random ids.** Setup: 122 random bits, a billion ids (the stage shows "about 9.4 × 10⁻²⁰", not the
   answer). Ask: "A billion ids, each 64 random bits: 2⁶⁴ values, about 18 billion billion. What is the chance that any
   two are equal?" Choices: "About 1 in 18.4 billion" / "About 50%" / **"About 2.7%"**. Act: set `bits: 64`. Reveal: "By
   the birthday bound the chance is about 2.7%: every pair of ids is a chance to collide, and a billion ids make about
   5.0 × 10¹⁷ pairs. One new id against the rest is the 1 in 18.4 billion. At 122 bits, a UUIDv4's, the same billion
   gives about 9.4 × 10⁻²⁰." Focus: the chart. Hides (`chance`): both curves, the marker and its figure, the triangle
   (one dashed box over the plot, "The curves are hidden until you answer"; the axes stay), the random sentence,
   Describe; the "64 random bits" segment is locked while asking, as every control is.
6. **Challenge: size the layout.** "Design the layout for up to 1,000 generators, each able to make 1,000,000 ids a
   second on its own, lasting at least 200 years." Goal `all`: `generators atLeast 1000`, `perSecond atLeast 1e6`,
   `years atLeast 200`. Exactly one of the 578 layouts passes: 10 generator bits, 10 sequence bits, a 1 ms tick
   (43 timestamp bits, 278.7 years). The dock's checklist says each bound with the current value ("1,024 generators
   (need 1,000)", "4,096,000 ids a second each (need 1,000,000)", "lasts 69.7 years (need 200)"), "2 of 3 met" or
   "Goal met" only while all three hold; the notice says the setting's sentence when the challenge opens, and "Goal
   met." plus it when met by hand or keyboard. The answer is the interview's reasoning: the sequence needs only 10 bits
   (1,024 a ms), so give the two spare bits to the timestamp, which quadruples its lifetime.

Slots: every number in an ask, choice or reveal comes from `experiments()` (years, dates, counts, ms, chance). Word
slots carry no digits (the "four" of E2 is a number word from the model).

## 4. Accessibility

- The stage is `role="img"` named by the summary (`summaryText()`, the same string Describe shows), which hides what
  the open question hides. Band labels are text in the SVG; the stage reads as one image.
- Live notice: one polite, `aria-atomic="true"` region; never blank: the setting's sentence at rest; the question's
  title and "the part it is about is hidden until you answer" while asking; "Playing your guess." while the answer
  plays; the reveal after; the setting's sentence (or "Goal met." and it) for the challenge.
- Keyboard: steppers are buttons (− and + with names "One generator bit fewer/more"; the value is an `output`), the
  segments are native radios in fieldsets with legends (arrow keys move within), the guard a native checkbox, Ids made a
  native range with `aria-describedby` its output. Play is a 44 px button named "Play the mint: 8 ms of the clock,
  slowed down". Tapping a dot or a row to inspect is a convenience; the same ids are a table in Describe.
- Every target is at least 44 px; the two-by-two fault segments keep 44 px when their labels wrap to two lines.
- Describe: "Describe the ids" opens the summary and a table of the ids in id order (#, id, made by, made at, tick,
  sequence, waited, note), the first 40 rows with "The first 40 of 5,012 ids in id order." for a burst. It is a
  `minmax(0, 1fr)` grid with the table scrolling inside its own box (max 360 px), and it goes compact (#, tick · G ·
  seq, made, note) when the stage is under 520 px. Disabled, with "Describe opens after you answer.", while a question
  asks and plays.

## 5. The prevention list

1. **Giveaways on every surface.** One `hiding()` map (the mockup's, ported as `ids-words.ts`) from the five hidden
   regions to flags (`lifetime`, `burstAfter`, `order`, `inspect`, `repeats`, `chance`, `summary`, `describe`), read by
   the stage, the summary, the notice, Describe, the story and the stage's accessible name; the hide holds through the
   answer's play (the `play` state) and releases at the reveal. No control text names an answer (the fault segments
   name the premise, which the question states anyway). The no-answer sweep (`shoot.cjs`) checks each question asking
   and at four moments of its play, with motion off and on: forbidden text (the truth's figure, the reveal's figures,
   "same id", "made twice", "904") over the SVG text, the stage's title, the notice, Describe, every aria-label and the
   story; and structure (no lifetime marker, no gauge after the first, no sorted dots or order line, no bit digits, no
   repeat rings, no curves). It is proven by a leak planted on each flag a question uses (eight in all) that it must
   catch.
2. **False claims.** Every sentence is built from the model for the setting it is printed at, and `enum.cjs` checks all
   18,496 mint settings and 10 random ones by rule: no sentence opens on a numeral, no NaN, Infinity or "undefined", no
   number of five or more digits without separators (dates excepted), plural and singular agree with their numbers, the
   skew sentence names G2 only when every out-of-order id is G2's, a wait is called "a tick holds only N ids" only when
   the wait came from a full tick (the clock guard's waits say "clock behind"), a 10 ms tick says "every id here shares
   one timestamp", lanes that cannot run say why. Hidden values are replaced by a hidden box or "= ?", never by a
   default; a sample (the 20 ids) is never called a rate.
3. **Track by stable id.** Rows and dots are keyed by the id's key (`g2-1`), groups by their first id's key; rows insert
   mid-list while a play runs.
4. **Labels.** Lane and row labels sit in a gutter the plot never enters; sequence numbers over dots, outside the lane
   line; wait labels under the line and only where they collide with nothing; the ruler's names over the line, nudged
   apart, its tick labels under it; curve names placed off every curve; text has a stage-coloured halo (paint-order
   stroke). Rings stroke only, 3.5 px outside their dot. The collision report checks text on text, labels under 6 px
   apart on a row, lines and curves through text, dots under text, marks under text, dots on dots (the stated arrivals
   keep 0.4 ms apart so dots clear at 320 px), marks off the stage and the Play button over text.
5. **Look-here tags.** A tag goes at the first corner of its outline that covers no text; `shoot.cjs` asserts every
   reveal has a visible tag per focus region, inside the stage, with no collision, at 14 widths from 300 to 1,280.
6. **Marks before their event.** One play clock; every mark tests `issued <= t` (dots, rows, gauges by the ids made so
   far, wait lines, repeat rings, the inspected id).
7. **Visibility and reduced motion.** The play pauses on the widget host's visibility (`document.hidden` in the
   mockup); Reduced motion draws the end state and writes the story; nothing is said only by motion.
8. **CSS traps.** Every `fieldset.group` carries zero padding and its class only adds; controls are checked at 320 px.
9. **Words.** Full sentences built from the model; numbers that open a sentence are words ("Two ids repeat", "In all,
   5,012 ids"); thousands separators throughout; the challenge's status is a checklist with "Goal met" only while all
   bounds hold; the notice says the setting's sentence after a reveal and when the challenge opens, never blank.
10. **Describe** fits or goes compact by stage width (under 520 px) and scrolls inside its own box; checked at 320,
    412, 1,280 and 1,440 px by the builder's layout spec.
11. **Touch hints.** The only on-stage hint is the inspect tap; its "Tap a dot to see its bits" hint clears on Play, a
    settings change, an outside tap and after 4 s.
12. **Placeholder heights.** Every band's height is a function of width and of the setting's line counts (wrapped by
    measure), so the builder's measured heights at 320, 360, 375, 390, 412 and 430 px are exact and swept 300 to 1,300.
    The lazy placeholder uses the default's.
13. **Text measurement.** One module (`stage-text.ts`) with the roles above; digits in mono are tabular by nature, and
    Inter labels are measured as drawn (proportional), never with `tabular-nums`.
14. **g-code-text.** Learner text in HTML (the dock, reveal, notice, Describe's summary, the checklist) goes through
    `g-code-text` with a widget keep rule for "2⁴¹ ticks", "1 ms", "4,096,000 ids", "9.4 × 10⁻²⁰", "0 · 0 · 0" and dates
    ("7 September 2095" on one line); the notice is `aria-atomic`.
15. **Element counts.** Bounded by the stage: 64 cells, 20 dots and rows (one gauge and one row a tick for a burst of
    any size), 37 ruler steps, 12 pages twice, 6 insert marks a page; the chart is two paths. Keydown to the second
    frame and the play's frame rate are measured by the builder on a Pixel 7 profile at 4x CPU in the burst at 0
    sequence bits (5,000 ids in the model, 8 gauges drawn).
16. **Zoneless reads.** Specs wait for the summary or a web-first assertion before reading; the e2e runs on the WebKit
    iPhone project too.
17. **Marks mean one thing.** Dashed is used only for "hidden until you answer" (the hidden boxes); focus outlines are
    solid; an empty page is a solid hairline box; rings stroke only, around the whole dot.
18. **On-scale values.** E1's 34.8 years and 69.7 sit on the ruler (2^30 to 2^67 ms covers every layout: 2^31 to
    2^63 × 10 ms); E5's 2.7% and 9.4 × 10⁻²⁰ on the chart (10⁻²⁴ to 1); a chance under 10⁻²⁴ is said "below the chart";
    ids after 8 ms are counted in words in their lane and under the list. Ghosts are words ("was 69.7 years with 41
    bits"), never a bare tick.
19. **Units and drawn conversions.** Shortest forms keep the unit ("1 yr", "4 × 1,024", "+3 after 8 ms"); the clock to
    timestamp conversion, the lifetime product, the ids-a-second product and the square law are each drawn on the stage.
20. **Layout.** Reserved lines collect at each band's foot; a checked segment keeps its weight; on the phone layout,
    answering scrolls the band its act plays on into view (E1 band B, E2 band C, E3 and E4 band D, E5 band E) before
    the play starts.
21. **Wrap by measure.** All stage text and the HTML texts a height depends on wrap with `stage-text.ts`'s measure,
    6 px slack and keep rules; segments (field values, the conversion) wrap only at their joins.
22. **One state.** The band, the dock's checklist, the stage and Describe read one computed state (`view.s` and its
    mint), so a goal reached by stepper, keyboard or play shows the same everywhere; no surface shows NaN, Infinity or an
    empty cell mid-play (rows exist only for made ids, and the inspected id is null until the first id, which the band
    says: "No id made yet: press Play.").
23. **WebKit and CI.** The builder's tests use deterministic waits (no focus or input races), read the latest
    IntersectionObserver entry, pass on the WebKit iPhone project, and run in a ci.yml dispatch on the wip branch.

## 6. What a learner can say in an interview afterwards

"For a million ids a second across a few hundred machines I would not use one database counter: it is a bottleneck and
a single point of failure. I'd use a Snowflake-style 64-bit id: a sign bit, then a timestamp, then a generator number,
then a sequence. The widths are the design. 10 generator bits give 1,024 machines. A million a second over 500
machines is 2 a millisecond each, so even 10 sequence bits (1,024 a millisecond, about a million a second per
machine) is huge headroom; that leaves 43 bits of millisecond timestamp, about 279 years from a custom epoch (41 bits
is 69.7; counted from 1970 it runs out in 2039). Every bit I move halves or doubles one of those. Ids sort by time to
the millisecond, then by machine, so order across machines is only rough, and clock skew blurs it further. What can
break: a clock stepping back (a generator keeps its last timestamp and waits or refuses), two machines with one number
(lease numbers from etcd or ZooKeeper and stop on lease loss), a burst over a tick's sequence (it waits for the next
millisecond), and the epoch running out. If I can't manage generator numbers, UUIDv7 needs none: 128 bits, still
time-ordered for the index; its 74 random bits only need to be unique within a millisecond, so at a million ids a
second the chance of any repeat is about 2.6 × 10⁻¹⁷ a millisecond, about 8.4 × 10⁻⁷ a year. Plain random 64-bit ids
are not safe: a billion give about a 2.7% chance of a repeat by the birthday bound, and random keys scatter inserts
across the index."

## 7. Lesson text fixes (`libs/engine/src/sysdesign/lessons/ids.ts`)

- Remove `widget.tryThis` (all three lines); the experiments replace it.
- Concept "Random ids and the birthday bound": keep, but it quotes E5's answer ("a billion already gives about a
  2.7% chance"). Change to "a few billion already make a repeat likely" so the page above the widget does not answer
  E5; the reveal carries 2.7%.
- Concept "The Snowflake layout": it says "2^41 ms is about 69.7 years", which E1's ask states anyway; keep. Add one
  clause the widget shows: "ids from the same millisecond sort by generator, not by when they were made".
- Concept "Clocks and generator ids": keep; it matches the guard toggle ("waits out a small backwards jump").
- Worked example "Size a Snowflake layout for a peak": its numbers (12 and 10 bits, 41 timestamp bits) differ from the
  challenge's solution (10 and 10, 43 bits), so it does not answer the challenge; keep.
- The engine's content spec gains a check that no lesson text prints "34.8 years", "3.95 ms", "2.7%" or "278.7 years"
  (E1, E2, E5 and the challenge's answers), as the Storage note's engine check does.
