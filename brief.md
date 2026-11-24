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
| `changes.md`  | Each critique item and what changed for it (round 0, the designer's own; round 1, the two critics and the showcase) |

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
| Ids sort by time only to the tick, then by generator | core | Band D: every id in id order, each with a dot at the moment it was made, joined by a line that steps back inside a tick |
| Clock stepping back: repeats, or a wait with the guard | core | The fault "G1's clock steps back", the guard toggle; repeats ringed red in the lane and "same id as the row above" in the sorted list; E4 |
| Birthday bound, the square law | core | Band E: chance of any repeat against ids made, log on both axes, 64 and 122 bits, the marker at the chosen count, a drawn triangle "× 1,000 ids" along, "× 10⁶" up; E5 |
| Two generators with one number | high | The fault "G2 given number 1": five repeats ringed; free play and the lesson's pitfall |
| Clock skew orders ids roughly | core | The fault "G2's clock ahead": G2's lane on its own clock's ticks, ids out of time order hollow amber in the sorted list with a legend; E3 |
| An id leaks when and where it was made | high | Band A's last line reads the time and generator back from the bits |
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

One `g-stage`, five bands top to bottom, each with a small-caps label. **The stage's height is a function of its
width alone**: every block whose line count can change (the made-by line, the conversion, the repeat note, the leak
line, the ledger's chains, end date and ghost, the ruler's three name rows, the lanes' caption, the 21 row slots of the
sorted list and its foot, the pairs chain) reserves the most lines it takes at that width over every setting it can
show. No setting, question, play moment or reveal moves a band; `shoot.cjs` asserts one height per width over every
render (1,754 px at 1280, 2,932 at 390, 3,106 at 320, with the control groups on the stage), and the builder's layout
spec asserts it at rest, asking, at four play moments and at the reveal of every experiment at every swept width.

- **Band A, "One id, 64 bits".** A 44 px header row: the name, and **Older id / Newer id** buttons (44 px, "‹" and
  "›" on a phone, named "Older id" and "Newer id") that step through the ids made so far in made order; a tap on a dot
  or a row is a convenience. Then who made it, in reserved lines: "made by G2 at 2.9 ms", and when the lane's clock is
  wrong both readings in the fault's words: "made by G1 at 6.3 ms; G1's clock, stepped back 2 ms, read 4.3 ms". The 64
  cells always in **two rows of 32** (four rows of 16 when a row of 32 would give cells under 15 px, so on every
  phone), a gap between fields, coloured by field. A 1 is filled with the field's fill token and an on-fill digit; a 0
  is the field's tint with its digit in the field's **ink token**, at 4.5:1 or more in both themes (light: time
  #065a87, generator #7f4a00, sequence #02583f; dark: #6cc6ee, #f0b860, #3ddc97; the light fills use the inks too, so a
  white 1 is 5.6:1 or more). Under each field's spans a **bracket** in the field's colour, and under its longest span
  its name and decimal value, centred, in its ink: "timestamp 28,296,000,002", "generator 2", "sequence 1", "sign 0"
  (shorter forms "time ...", then the value alone, when a span is narrow). Under the bits, in the timestamp's ink, the
  conversion as a chain wrapped only at its joins: "G2's clock: 12:00:00 + 2.9 ms  − epoch 1 January 2026  =
  28,296,000,002.9 ms  ÷ 1 ms a tick, rounded down  = 28,296,000,002, the timestamp": the same number sits under the
  timestamp bracket (an arrow from the chain into the bracket would cross the bit rows, so the link is the number and
  the colour). Then "id 118,682,025,992,396,801" (mono, grouped), "made twice: an earlier id has the same 64 bits" in
  danger ink for a repeat (beside it, or on its own reserved line), and **what the id leaks**: "Anyone holding this id can
  read when it was made (12:00:00.002 UTC on 24 November 2026, to the tick) and which generator made it (number 2)."
  The time is read back from the bits (epoch + timestamp × tick), so it is honest to the tick. Overflow: "No id: the
  clock is past the timestamp's end, 2 February 1971. A generator must refuse to mint." While playing, the newest id
  composes in order over 300 ms: the timestamp cells fill from the chain, the generator field lights, the sequence
  steps up from the previous id of the same tick (Reduced motion: the final bits at once, said in the caption).
- **Band B, what each field buys.** Three rows, chip and name in a 150 px column (above the chain on a phone).
  Timestamp: "2⁴¹ ticks × 1 ms = 69.7 years", "1 January 2026 to 7 September 2095", and after a stepper press the
  ghost in words, "was 69.7 years with 41 bits: one bit fewer halves it" (or "2 bits fewer divide it by 4"). The
  **lifetime ruler**: a log axis from 2^30 to 2^67 ms with a step mark at every bit (±4 px, stroke-tone ink: one bit,
  one step, twice as long), labels 1 month to 1 billion years; the lifetime as an accent dot named "lasts 69.7 years";
  today as a triangle named "today, 328 days in"; after a layout change the **ghost**, a hollow tick at the old
  lifetime named "was 69.7 years", with an arrow arc to the new dot where the step is 12 px or more; in the challenge a
  goal tick "need 200 years from today" ("need 200 yr"). Names sit in three reserved rows over the line, by priority
  (lasts, today, was, need), each at the nearest clear place within 40 px of its mark. Generator: "2¹⁰ = 1,024
  generators at once" and, in the challenge, "(need 1,000)". Sequence: "2¹² = 4,096 ids a tick × 1,000 ticks a second
  = 4,096,000 ids a second each" ("(need 1,000,000)" in the challenge), "4,194,304,000 ids a second from all 1,024".
- **Narrow stages: controls under their band.** Under 1000 px the controls move onto the stage, each group a
  `fieldset` with its legend in a surface panel placed in a slot the stage reserves (its measured height): the layout
  steppers, Tick and Epoch under band B; Requests to G0, What goes wrong and the guard between band C and band D (the
  lanes they change are just above, the sorted list just below); Random ids and Ids made under band E. So every control
  is within a scroll of what it changes. Wide, the controls stay in the sticky side column.
- **Band C, "Three generators, no coordination".** Play (44 px; a Pause toggle with the name "Pause the mint" while it
  runs) at the right of the header. The caption says the axis is true time and that a faulty lane shows its own ticks.
  Three lanes of 74 px each (content kept 7 px inside the lane, so a lane's outline can run on its boundary). Each lane
  is **shaded by its own clock's ticks**, so a dot always lies in the band of the tick it carries (`enum.cjs` checks it
  for every id of every setting). A faulty lane has a strip with its own tick numbers ("G2's clock" 2, 3, ... 9; G1's
  0 to 5, then 3, 4, 5 again after the step, a critical tick at 5.5 ms and "−2 ms" where it clears). Gutter: name,
  "number 0" ("#0"), the fault's note, and "+3 after 8 ms". Each id a dot at its moment (4.5 px, 3.5 narrow); the
  inspected id accent and ringed; sequence numbers over each dot when they keep 6 px apart, else over the group. A
  tick's ids stay dots while they were made at least 0.4 ms apart (seven ids in one 10 ms tick are seven dots); only ids
  made at one moment (a burst) become a **column gauge**: 7 px wide (5 narrow), its left edge at the moment the tick's
  ids were made, rising from the lane line, full at 2^s, so x stays time. Full columns share a bracket "4 full ticks of
  1,024" ("4 × 1,024"), the last its count "904", then "last waits 3.95 ms"; the amber wait line runs from the
  requests' arrival to the last column's left edge (4.0 ms). A repeat: the second copy filled critical with a ring, its
  first copy hollow critical, joined by a thin critical hairline (under the lane in one lane, straight across lanes for
  the shared number), each drawn at the repeat's moment and only where it crosses no word. A lane that cannot run says
  why and draws no lane line. A thin accent now line crosses the lanes while playing, broken around every word.
- **Band D, "Sorted by id".** Every id in id order; the gutter holds the grouped decimal id (wide) and "…002 · 2 · 1"
  under the header "timestamp · G · seq": the timestamp's last digits, so the same word names the same number in band A,
  here and in Describe. In the plot a dot at the moment each id was made, a hairline through them in row order, the
  true ticks shaded through the plot and an axis under it, so a step back inside a shaded band reads as "within the
  tick". **21 row slots always** (the most any setting makes); rows sit at their final rank, and while playing a row not
  yet made is an empty slot with no words and no dot. Equal ids sort by when they were made, so a repeat always sits
  directly below its twin and reads "same id as the row above" (placed where it crosses no line; the collision report
  asserts the row above holds the same id). Out-of-time-order ids are **hollow amber** (shape and colour), named in a
  legend inside the band's region. E3's reveal rings the two ids it asked about here and in the lanes, with "made 0.7
  ms later, sorts first" (or "sorts first") beside G1's row.
- **Band E, "Random ids beside them".** The chart as before (log axes, both curves, the marker, "about ...", "below
  the chart"). The marker's line is registered for placement; the square-law triangle ends 4 px left of it (up leg
  offset), and when the leftward base would leave the chart it is drawn to the right ("× 1,000 ids" along, "× 10⁶" up,
  ending at 10¹² ids and about 9.4 × 10⁻¹⁴ at the default). Curve names, the marker's figure and the triangle's labels
  are placed off every curve, **grid line**, dot and word. Under the chart, the **pairs chain** at the chosen count:
  "10⁹ ids → about 5.0 × 10¹⁷ pairs × 1 in 1.8 × 10¹⁹ each ≈ 0.027 repeats expected → chance about 2.7%" (each segment
  kept whole; "≈ 2.7 × 10⁴ repeats expected → chance near certain" at a trillion: the expected count and the chance are
  told apart). Right (or under): the index strip.
- **Placement and the collision report.** Every label is measured by `stage-text.ts`'s roles and placed from
  candidates clear of every word, dot, line (lane, grid, order, now, arcs, triangle, a fault's step), curve, mark and
  hidden box. The report checks text on text, labels under 6 px apart, every registered line and curve through text,
  dots on dots and under text, marks under text, the Play and nav buttons and the control groups over text, focus
  outlines within 6 px of any word or dot, tags on any word, dot, line or mark of any band, text under a hidden box that
  is not its own, marks off the stage and a repeat's note whose row above is not its twin; the now line is tested at the
  sampled play moments.
- **Hidden boxes** are opaque (stage fill, dashed stroke), painted after every mark but the focus outlines, each the
  exact size of what it hides (band A's lower block, the end date and ghost lines, G0's lane after its first tick, the
  sorted list's slots, axis and foot, the plot and the pairs chain), with their words centred, so no grid, lane or now
  line crosses them and the stage keeps its height.

**Motion.** Play runs the 8 ms of the stated clock in 8 s on one monotone play clock (`t` from 0 to 8,000 µs), paused by
the widget host's visibility. Marks appear as their events arrive and never before: a dot at its `issued` moment, its
bits composing in band A, its row in its slot, a column filling, a wait line, a repeat's ring, its first copy's hollow
ring and the hairline. While playing the notice says "Playing the mint: 8 ms of the clock, slowed down." and the
setting's sentence only when the play ends. Changing the layout plays nothing: the ruler's dot steps (200 ms) and leaves
its ghost. E5 has no play: its reveal slides the marker up from the 122-bit chance to the 64-bit one (600 ms). Reduced
motion: end states at once, a caption under the stage "Reduced motion: the mint is drawn at its end." with the mint
sentence; nothing is said by motion alone. Element counts: 64 cells, at most 20 dots and 21 rows, one column a tick for
a burst of any size, two chart paths.

## 3. The experiments

Five predictions and a challenge. Answers sit at positions 3, 1, 2, 1, 3 (`enum.cjs` asserts them); choice lengths are
within 2.6 times of each other; **no experiment's setup or act passes the challenge** (`enum.cjs`). Each card sets its
setup and asks with its hidden regions hidden on every surface; it plays its act on answering with them still hidden;
then reveals (outlines 8 px outside their region, a lane's on its boundary, each with a "Look here" tag). A hide flag
covers only what can answer: `lifetime` hides a lifetime other than the setup's, `burstAfter` only a burst's later ticks,
so E1 and E2 ask over a stage with nothing hidden.

1. **One bit for the generators.** Setup: Snowflake (the default). While asking the ruler shows "lasts 69.7 years" and
   the chain "2⁴¹ ticks × 1 ms = 69.7 years". Ask: "Snowflake's timestamp has 41 bits of 1 ms ticks and lasts 69.7
   years. Move one bit from it to the generators, for 2,048 generators. How long does the timestamp last now?"
   Choices: "About 139.4 years" / "About 68.7 years: one year less" / **"About 34.8 years"**. Act: `gen: 11`. During the
   play: "2⁴⁰ ticks × 1 ms = ?", the end date and ghost words in a hidden box, the ghost tick "was 69.7 years" and a
   dashed box on the ruler where the new dot will land, named "lasts ?" (the guess is held; the box gives no figure).
   Reveal: "The timestamp now holds 2⁴⁰ ticks, and 2⁴⁰ × 1 ms is 34.8 years, ending on 3 November 2060 instead of 7
   September 2095. A bit is a doubling, so every bit moved out of the timestamp halves its lifetime, and every bit moved
   in doubles it: on the ruler the marker steps one bit left of its ghost." The dot animates the one step. Focus: the
   timestamp row and ruler. Structure checks: one lifetime marker and no ghost while asking; no lifetime marker during the
   play.
2. **A burst in one tick.** Setup: gen 12, seq 10 (41 timestamp bits, 69.7 years, 4,096 generators: the lesson's own
   worked-example layout, not the challenge's answer). Asked over the plain trickle, nothing hidden. Ask: "With 10
   sequence bits a generator has 1,024 sequence numbers a tick. G0 gets 5,000 requests at 0.05 ms. How long does the
   last of them wait for its id?" Choices: **"About 4 ms, four ticks later"** / "None: they all fit in that tick" /
   "About 1 ms, until the next tick". Act: `load: 1`, play; G0's later ticks are a hidden box "G0's later ticks are
   hidden until the reveal" in the lane and "G0's later ids ..." in the list's empty slots; no bracket, count or wait
   line. Reveal: "Each tick gives G0 only 1,024 ids, so the 5,000 requests take 5 ticks: four full gauges, then 904 ids
   in the last, and the last request waits 3.95 ms. ..." Focus: G0's lane.
3. **Which id sorts first.** Re-aimed at clock skew, which the rest view does not settle (at rest the earlier-made id
   sorts first; `enum.cjs` checks both). Setup: fault 1 (G2's clock 2 ms ahead). Ask: "G2's clock runs 2 ms ahead. G2
   makes an id at 3.7 ms and G1 makes one at 4.4 ms, by true time. Which id is smaller, so it sorts first?" Choices:
   "G2's: it was made first" / **"G1's: its timestamp is lower"** / "Whichever has the lower sequence number". Act:
   play. Hides (`order`, `inspect`): the sorted list (its slots, axis and foot as one box), the id's digits and the
   lower block of band A (the field names and brackets stay), the order sentence, Describe. Reveal: "G2's clock read 5.7
   ms when it made its id, so its timestamp is the tick at 5 ms; G1's id carries the tick at 4 ms. The timestamp is the
   high bits, so G1's id sorts first although it was made 0.7 ms later. Each generator stamps ids with its own clock, so
   across machines ids are only as time-ordered as their clocks agree." Focus: the sorted list, with the pair ringed.
4. **The clock steps back.** As before (setup guard off, no fault; act fault 2; hides `repeats`, which sets `order`).
   The reveal now shows the pairs: G1's second copies ringed, the first copies hollow, the hairlines, and both rows
   "same id as the row above" directly under their twins.
5. **A billion random ids.** As before (setup 122 bits, a billion; hides `chance`: the plot and the pairs chain, two
   opaque boxes, the box's words set between grid rows). No play: answering reveals at once and the marker slides up.
   The reveal's pair count and the "1 in 18.4 billion" distractor are now drawn in the chain ("× 1 in 1.8 × 10¹⁹ each" is
   one pair's chance; the distractor is one id against the rest).
6. **Challenge: size the layout.** "Design the layout for up to 1,000 generators, each able to make 1,000,000 ids a
   second on its own, lasting at least 200 years from today." Bounds: `generators ≥ 1000`, `perSecond ≥ 1e6`,
   `yearsLeft ≥ 200` (from the stated clock to the timestamp's end, so the epoch counts). Exactly one layout passes,
   on either epoch: 10 and 10 bits, 1 ms (278.7 years from 2026, 222 left on the 1970 epoch). The checklist: "1,024
   generators (need 1,000)", "4,096,000 ids a second each (need 1,000,000)", "lasts 68.8 years from today (need 200
   years)", each "(need ...)" kept whole by g-code-text's keep rule; the goals are also drawn on the stage (the ruler's
   goal tick, the chains' "need").

Slots: every number in an ask, choice or reveal comes from `experiments()`. The dock's choice tags ("Your guess",
"Right") sit on the choice's top border, out of the text flow, so no choice changes size when tagged (layout check: each
choice's height is equal before and after). On a phone the dock moves above the stage while an experiment or the
challenge is open, and answering scrolls the band its act plays on into view.

## 4. Accessibility

- The stage is `role="img"` named by the summary, which hides what the open question hides.
- Live notice: one polite, `aria-atomic="true"` region that says **only what changed**: a stepper "The layout now has
  11 generator bits and 12 sequence bits: 2,048 generators, 4,096,000 ids a second each; the timestamp keeps 40 bits and
  lasts 34.8 years."; Tick or Epoch the timestamp's sentence; a mint control the mint sentence; Random ids the chance.
  "Playing the mint: 8 ms of the clock, slowed down." while playing. The question's title while asking (with "the part
  it is about is hidden until you answer" only when something is hidden), "Playing your guess." during the play, the
  reveal after, "Goal met." plus the layout when the challenge is met. The full summary lives in the stage's name and
  Describe.
- Keyboard: steppers are buttons; segments native radios in fieldsets with legends; the guard a checkbox; Ids made a
  range with its output (two reserved lines on a phone); Play/Pause a 44 px button; **Older id / Newer id** 44 px
  buttons step the inspected id (disabled while it is hidden); a tap on a dot or row is a convenience only.
- Every target is at least 44 px; the fault segment keeps "number 1" whole ("G2 given / number 1" at 320 px).
- Describe: a table in id order with the fields of each id (#, id, made by, made at, timestamp, generator, sequence,
  waited, note; compact: #, timestamp · G · seq, made, note), so screen-reader users get band A's content for every id.
- The audit adds the cell-digit contrast (each field's ink on its tint, on-fill digits on fills) and a colour-blind
  simulation (deuteranopia, protanopia) of band D, where out-of-order ids are hollow as well as amber.

## 5. The prevention list

1. **Giveaways on every surface.** One `hiding()` map, read by the stage, the summary, the notice, Describe, the story
   and every accessible name; flags cover only what can answer. The no-answer sweep checks each question asking and at
   five moments of its play (E5 has none), motion off and on, for forbidden text (E1 "34.8", "3 November 2060",
   "halves"; E2 "3.95 ms", "904", "4 × 1,024", "full ticks"; E3 "sorts after", "sorts first", "made 0.7 ms later";
   E4 "same id", "made twice", "Two ids"; E5 "2.7%", "0.027") and structure, and fails on any collision in those
   renders; proven by a planted leak on each flag.
2. **False claims.** Sentences built from the model, checked by rule at every setting; equal ids sort by when they were
   made, so "same id as the row above" is always true (`enum.cjs` and the collision report); every dot is in its own
   tick's band (`enum.cjs`); a lane's band A header names both readings of a wrong clock.
3. **Track by stable id**; rows have fixed slots at their final rank.
4. **Labels.** Candidates clear of lines, grid lines and dots; hidden boxes opaque; the now line broken around words.
5. **Look-here tags** inside or outside their outline, clear of every word, dot, line and mark of any band; outlines 6 px
   or more from any word; swept at 14 widths.
6. **Marks before their event.** One play clock.
7. **Visibility and reduced motion.**
8. **CSS traps.** `.segment > span` styles only the segment's face (a nested keep span is not a second button).
9. **Words.** Grouped thousands everywhere, ids included; one term, "timestamp", for the field in all three places.
10. **Describe** compact under 520 px, its box scrolls.
11. **Touch hints.** None needed: Older and Newer are visible buttons.
12. **Placeholder heights.** One height per width, measured into `widget-heights.ts` at 320, 360, 375, 390, 412 and 430
    px (with the control groups on the stage) and asserted over every setting and experiment phase.
13. **Text measurement.** One module.
14. **g-code-text** keep rule: numbers with units, "(need 1,000,000)", "number 1", dates, "9.4 × 10⁻²⁰".
15. **Element counts** bounded by the stage.
16. **Zoneless reads.**
17. **Marks mean one thing.** Dashed only for hidden; hollow amber for out of time order; hollow critical for a
    repeat's first copy; a hollow tick for a ghost.
18. **On-scale values**, and ghosts drawn (a hollow tick with words) as well as said.
19. **Drawn conversions**: the clock-to-timestamp chain, field values under brackets, the lifetime chain, the pairs
    chain, the square law.
20. **Layout.** Nothing moves a band; a tagged choice keeps its size; controls within a scroll of their band.
21. **Wrap by measure** with keep rules and reserved line counts.
22. **One state.**
23. **WebKit and CI.**

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

The lesson page renders Try it first and the concepts, worked examples and follow-ups below it, so any of them can
answer a prediction before the learner scrolls back. Each fix removes an answer, never the idea:

- Remove `widget.tryThis` (all three lines); the experiments replace it.
- Concept "Random ids and the birthday bound": "a billion already gives about a 2.7% chance" becomes "a few billion
  already make a repeat likely" (E5).
- Concept "The Snowflake layout": keep "2^41 ms is about 69.7 years" (E1's ask states it). No clause is added.
- Worked example "Size a Snowflake layout for a peak": its step that prints the 40-bit lifetime ("about 34.8 years")
  becomes "each extra bit halves the lifetime", with no figure (E1). Its step "Ids sort by millisecond, then by
  generator" becomes "across generators they are only roughly time-ordered" (E3), naming no tie-break.
- Concept "Clocks and generator ids": "a generator could reissue a timestamp and sequence it already used" becomes "if
  an NTP step moves it back, the generator's ids are no longer safe", without saying they repeat (E4).
- Follow-up "ids from the same millisecond sort by generator id" becomes "across generators they are only roughly
  time-ordered" (E3).
- The engine's content spec gains a check over every string of the lesson (concepts, examples, follow-ups, pitfalls)
  that bans "34.8", "3.95 ms", "2.7%", "278.7", "sort by generator", "then by generator", "reissue" and "same timestamp
  and sequence" (E1, E2, E5, the challenge, E3 and E4), as the Storage note's engine check does.
