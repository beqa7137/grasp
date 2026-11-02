# Consistency & Quorums widget (`quorum`): design brief

Redesign R41, second widget of the batch (REDESIGN.md 5.2, the R41 to R45 entry and its Data Modeling note; LOOP.md
row 122 is the house reference). Lesson: `/design/topics/sd-consistency`. This brief rebuilds the lost one from
`known.md`, which records the outcome of two design critiques, three reviews and a fix round; it keeps every decision
there and fills only what known.md leaves open (marked **Filled in**). Files beside it:

| File          | What it is                                                                                                                             |
| ------------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| `model.js`    | The model and the six experiments as slot templates, ported 1:1 to `libs/engine/src/sysdesign/lessons/widgets/quorum.ts`              |
| `enum.cjs`    | Prints every experiment number, enumerates the challenge (exactly one of 34 settings passes) and checks the model over 104,704 settings |
| `mockup.html` | The static mockup with the app's tokens and fonts: `?state=default\|stale\|down\|refused\|timeout\|sloppy\|slow\|ask\|reveal\|challenge&theme=light\|dark` (`ask` and `reveal` also take `&exp=1..6`; `&describe=1` opens Describe) |
| `shoot.cjs`   | Screenshots every state at 1280, 390 and 320 px in both themes and prints the page's own collision report, then sweeps settings and widths |
| `changes.md`  | Each critique and review item, and what changed for it                                                                                 |

## 1. The mechanism

**What the learner must see.** A write goes to every replica and returns at the W-th acknowledgement; a read waits for
R answers and returns the newest, writing it back to the stale ones first. Whether a read can miss the write is a
property of sets (every read set of R against the W that acked), separate from what one read happened to see. Then the
ways it breaks: a stall moves the W-th ack, a known-down replica refuses the write while one that dies mid-write leaves a
timeout whose outcome is unknown, and a sloppy quorum acks on stand-ins the read never asks.

**The scenario** (`quorumScenario(n, w, r, states, stall, sloppy)`, stateless): one write of v8 "Artemis" over v7
"Apollo", then one read, sent the moment the client hears back about the write (at the W-th ack; at once if refused;
at 2 s if it timed out). Settings: N 3 or 5; W and R 1..N; each replica `up`, `down`, `stops mid-write` or `back`
(down for the write, up for the read, so it missed it); the stall on or off; sloppy on or off. 2 × (9 × 4³ + 25 × 4⁵)
× 2 × 2 = 104,704 settings.

**Geometry** (known.md, exact). Three zones; the writer in zone A near R1, the reader in zone C near R3 or RN.
One-way delays from the writer: N 3: R1 1, R2 2, R3 20 ms; N 5: 1, 1.5, 2, 20, 20.5 ms. The reader's run the other way
(at N 3: R3 1, R2 2, R1 20). A round trip is twice the one-way delay, so ALL pays a cross-zone ack (40 ms at N 3).
Zones: N 3 A, B, C; N 5 A, A, B, C, C.

**Arrival rule** (the critic's correctness fix). What a replica holds is decided when the read request reaches it:
`holds v8 ⇔ applied ∧ landAt ≤ readAt`, with `landAt = writeOneWay + pause` and `readAt = readSentAt + readOneWay +
pause`. Never at the W-th ack. Default N 3 W 2 R 2: acked in 4 ms (R1 2, R2 4); v8 reaches R3 at 20 ms; the read
(sent at 4) reaches R3 at 5 and R2 at 6, hears R3 v7 and R2 v8, repairs R3 and returns v8, fresh, in 6 ms (4 + R3's
2 ms repair round trip). R2 both acked and answered. W 1 R 1 is a real stale read: the read reaches R3 at 3 ms, 17 ms
before v8 does.

**Stall.** The middle replica (R2 at N 3, R3 at N 5) adds `QUORUM_STALL_MS` = 100 ms (a GC pause) to everything it
handles: its ack (`writeRtt = 2·oneWay + 100`), what it holds (`landAt`), its read answer and its repair. QUORUM writes
go from 4 to 40 ms (the second ack is now R3's, cross-zone); ONE stays 2 ms; ALL takes 104. Reads take the R fastest
answers, so at N 3 only ALL waits for the paused replica (ONE 2, QUORUM 40, ALL 104 ms). Code uses the constant, never
a literal 100.

**Failures.**

- `down` and `back` are known down when the write is sent. If fewer than W replicas are live, the coordinator refuses
  the write up front: nothing is written (Cassandra's UnavailableException). Its count reads "2 live, 3 needed".
- `stops mid-write`: the coordinator believes it live and sends; it never acks and is unreachable for the read. If
  fewer than W ack, the write **times out** at `WRITE_TIMEOUT_MS` = 2,000 (Cassandra's `write_request_timeout`).
  Replicas that applied it keep v8, so a later read can return a write the client saw time out. Always "timed out",
  never "failed": the outcome is unknown, which is why retries must be idempotent.
- The read reaches `up` and `back` replicas. If fewer than R are reachable it fails: "2 reachable, 3 needed".

**Read.** The read set is the R reachable replicas with the fastest answers (`2·readOneWay + pause`): Cassandra asks
the R nearest by its latency-aware snitch, Dynamo asks all and takes the first R; the stall is why "fastest" matters.
If the answers mix v8 and v7, it returns v8 and **blocks on read repair**: `readMs = R-th answer + slowest repair round
trip` (the repair writes go out together). All v8 or all v7: no repair. Cassandra blocks the read on its repair so a
later QUORUM read cannot go backwards (older than 4.0; never attribute it to 4.0).

**Verdicts.** `fresh`, `stale` (acked write; the read returns v8 or v7), `refused` (nothing written; the read returns
v7, which is right), `timed-out` (the read returns v8 although the write timed out), `old` (a timed-out write whose read
hears only replicas that missed it), `failed-write`, `read-fails`. **Filled in:** known.md names `failed write` without
defining it. Here it is a timed-out write that no replica applied: the client sees the same timeout as `old`, but v8
exists nowhere, so only a retry can land it (1,116 settings). `read-fails` wins over every write outcome; the pill
still says the write's part in the writer box.

**Sloppy quorum.** Stand-ins H1 and H2 sit beside the writer (one-way **Filled in:** 1.5 and 2.5 ms; the first build's
values were lost and no quoted number depends on them). Each known-down home replica is replaced by the next stand-in,
up to two; stand-ins ack and hold a hint, and the read never asks them. Writes survive `min(n, n + 2 − w)` down, so the
W handle's "survives k down" agrees with the stand-ins drawn.

**Read-set guarantee.** `h` = home replicas among the W that acked (for a timed-out write, the home replicas that
applied it; for a refused one, 0). `staleReadSets = C(n − h, r)` of `C(n, r)`. The strip counts this guarantee,
separate from what the drawn read happened to see (`thisReadUnsure`: the drawn read set holds no acked home replica).
With R + W = N exactly one read set misses (C(r, r) = 1).

**Availability.** Each replica down 1% of the time, independently ("high, so the differences show"): writes succeed
with P(at least W of m up), m = N strict, N + 2 sloppy; reads with P(at least R of N up). The `nines` unit shows two
decimals, more only to show every leading nine, and never 100% (**Filled in:** the rule: `d = max(2, nines − 2)`
decimals, rounded, capped at `100 − 10^−d`): 97.03%, 99.97%, 99.90%, 99.9999%, 99.99999%.

**Checks** (`node enum.cjs`, all pass): every quoted fact above; the challenge's 34 settings with exactly N 5, W 4, R 2
passing; over all 104,704 settings, every strict setting with R + W > N whose read completes is fresh with 0 sets that
can miss (928 such settings), "survives k down" holds in all 13,440 settings it covers, every verdict occurs (fresh
15,264; stale 9,864; refused 16,792; timed-out 6,848; old 2,468; failed-write 1,116; read-fails 52,352), no nines text
reads 100%, every template's digits are slots, and answer positions are 3, 1, 2, 1, 3.

**Engine work.** New `libs/engine/src/sysdesign/lessons/widgets/quorum.ts` (`quorumScenario`, `QUORUM_ONE_WAY_MS`,
`QUORUM_STALL_MS`, `WRITE_TIMEOUT_MS`, `HINT_WINDOW_HOURS`, `REPLICA_DOWN_CHANCE`, `quorumLevelName`) and
`consistency-experiments.ts`. Retire `quorumRound`: only the old widget and `widgets.spec.ts` use it. Framework:
`ExperimentRun` gains `'write-read'` and `'read'`; `ExperimentBound` becomes `below | atLeast`, read through
`boundMet`/`boundLimit` (Caching, Load Balancing and Data Modeling unchanged); slot units `nines` and `ordinal`.
Lesson text fixes in `consistency.ts`: line ~17 "a read waits for R answers (Cassandra asks only the R nearest replicas;
Dynamo asks all and takes the first R) and returns the newest version among them."; line ~21 "is reported as failed (a
timeout) but is not rolled back"; "common default" → "usual choice" (Cassandra's default is ONE, drivers LOCAL_ONE);
`tryThis` goes.

## 2. The picture

One `g-stage`, read top to bottom as the story: the write, the replicas, the read, the guarantee, the times.

**Replicas** (the main drawing).

- **Header:** the play disc (36 px in a 44 px box, "Play the write, then the read"), the label "ONE WRITE, THEN ONE
  READ", and on wide stages a line legend (write, read, repair).
- **Writer** (top left, over zone A): a box with "WRITER · ZONE A", "v8 Artemis" and the write headline, "acked in
  4 ms" (final ink), "refused: 2 live, 3 needed" (critical), "timed out at 2 s" (warn). Sloppy: H1 and H2 stacked to
  its right, dashed, each with its v8 chip and "for R2" (idle "standing by" when no home replica is down).
- **W handle** beside the writer (wide) or above it (narrow): "W · acks a write waits for", a track with a stop per
  level, the levels named ONE, QUORUM and ALL and the unnamed ones by number (N 5: ONE 2 QUORUM 4 ALL; never "W 4,
  4"), and "survives 1 down · writes succeed 99.97%" (short "survives 1 down · 99.97%" where it does not fit).
- **Write fan:** one line from the writer to each live replica, ending on a round-trip chip above its card ("2 ms",
  "104 ms" when paused). Line lengths follow round trips (the writer sits over R1). Styles: the W that acked solid
  current blue, later acks faint, the W-th ack's chip ringed, a stopped replica's chip "no ack" (phone "×"), a refused
  write's lines dotted with "not sent" (phone "–"); no line to a known-down replica.
- **Replica cards:** a roving button group. Each card: the name (mono 15/13), its zone ("zone A", phone "A"), the value
  it holds (v8 final chip with "Artemis", v7 neutral with "Apollo", phone "v8"/"v7"), a repaired glyph, a pause glyph
  when stalled, and four state pips (up, down, stops mid-write, back) with the state word on wide stages ("up",
  "down", "stopped", "missed v8", "repaired", "paused"). Down is dashed and hatched; stopped is a critical dashed
  outline with ×. 44 px targets everywhere, five cards on a 252 px stage included (8 px sides, ≥3 px gaps).
- **BOTH ring:** a replica in the write set and the read set gets a 2.5 px final-green border (and an outer ring where
  the gaps allow); the caption under the pill says "R2 both acked and answered". It is the motion climax.
- **Read fan:** from a chip under each reachable card to the reader. Read set: solid considering amber, its chip "v8 ·
  4 ms" (phone "4 ms"); reachable but not needed: faint, chip muted; unreachable: dashed from under the chip row, with a
  critical × placed where no repair arc, line, mark or text is.
- **Repair arcs:** dashed final-green curves from the reader to each repaired replica's chip, bulging off the read line,
  with an arrowhead and "repair" where it fits.
- **Reader** (bottom right, under zone C): "READER · ZONE C", "sent at 4 ms" ("sent at once", "sent at 2 s"), and an
  answer chip per replica heard, newest first ("R2 v8", "R3 v7"), tracked by replica id.
- **R handle** beside the reader (wide) or under the pill (narrow): "R · answers a read waits for", same stops, "survives
  1 down · reads succeed 99.97%".
- **Verdict pill** under the reader, the heaviest mark: tone fill and line, a glyph and 13 px 600 text. "returns v8 ·
  fresh · 6 ms" (final, check), "returns v7 · stale · 2 ms" (critical, ×), "write refused · read 4 ms" (neutral),
  "write timed out · returns v8 · 40 ms" (warn, clock), "write timed out · read 2 ms" (`old`, neutral: the time is the
  read's), "write timed out, applied nowhere · read 2 ms" (neutral), "read fails · 1 reachable, 2 needed" (critical).
  Wraps at " · " to two lines on phones.

**Read-set strip** (right under the reader): "READ SETS OF 2" and the headline "0 of 3 can miss v8" (17 px mono; critical
when > 0, final when 0, muted when the write did not succeed). A column per read set (14 px cells, 12 on phones), a
row per replica with R1..RN heads on wide stages (acked rows in final ink), member cells amber, acked members green, an
× under each set that can miss, and the drawn read's set ringed. Legend: acked v8, in the read set, can miss, this
read. Then the overlap sentence ("Every read of 2 shares a replica with the 2 that acked.", or why not: "2 + 1 is not
above 3: a read of 2 can miss all 1 that acked.", the sloppy and timed-out forms) and the limit, muted: "Even then, R +
W > N alone is not linearizable: reads racing a write can disagree, and concurrent writes settled by last-write-wins
can drop one." Wide: sentences beside the grid; narrow: under it.

**Latency** (compact): "LATENCY log scale", a 1 to 200 ms log axis (1, 2, 5, 10, 20, 50, 100, "200 ms", the unit
label always kept), lanes "Write acks" and "Read answers". Opaque dots (write blue, stand-in hollow, read amber), the
W-th and R-th ringed with their labels ("acked 4 ms", "returned 6 ms (+2 repair)" with a green repair bar ending in a
tick; fallbacks "returned 6 ms", then "+2 ms repair"), names under the dots on a stage-coloured ground, grid under
every label, labels inside the plot, a timed-out write as a chevron at the right with "timed out at 2 s".

**Controls** (outside the stage): Replicas (N) as native radios drawn as `g-segmented` in `fieldset.group.n-control`
(3 replicas, 5 replicas); Conditions as two toggles ("R2 pauses · 100 ms GC pause", which names the middle replica of
the current N; "Sloppy quorum · stand-ins H1, H2"); a polite notice. Describe under the stage.

**Layout.** At container wide (the stage is 620 px at 1280) the stage takes the left column and the controls, the open
question and the cards the 340 px right one, as Data Modeling. Narrower, one column: the controls as the stage's first
rows (stage background, no border between), the stage, the open question, Describe, the cards.

**Heights** depend only on width and N (every text block that wraps reserves its longest form at that width; the
sweep checks it). Measured in the mockup:

| Stage width | N 3   | N 5   |
| ----------- | ----- | ----- |
| 620 (1280)  | 846   | 880   |
| 520         | 896   | 896   |
| 400         | 1,132 | 1,160 |
| 322 (390)   | 1,166 | 1,194 |
| 252 (320)   | 1,222 | 1,278 |

Phones are as short as collisions allow: each section stacks (W handle, writer, fan, cards, fan, reader, pill, R handle,
strip, latency). `widget-heights.ts` gets the built widget's measured heights, as before.

**Motion** (3.5's grammar; WAAPI on transform and opacity; pooled particles sampled with `getPointAtLength`).

- One clock for the whole play, in model milliseconds mapped by `s(t) = 700 ms × log2(1 + t / 1 ms)`: monotone, so
  every ordering the model decides is kept on screen (the read reaching R3 at 3 ms visibly beats v8's arrival at 20 ms),
  1 ms takes 0.7 s, the default play 2.4 s, a stalled ALL 4.7 s. A particle runs from `s(sent)` to `s(arrived)`, never
  under 140 ms.
- Write particles leave together; each card's value lands (v7 slides up and fades, v8 settles) at `landAt`; each ack
  returns; the W-th ack's chip and latency ring land and the writer reads "acked in 4 ms". A timed-out write shows a
  900 ms countdown ring on the writer after its last real ack ("waiting for a 3rd ack"), then "timed out at 2 s".
- The read leaves at the W-th ack. **Read-side marks appear as the read reaches them, never at t = 0:** a read chip
  under a card when the request reaches it, its answer chip at the reader and its latency dot when the answer arrives,
  the R-th ring at the R-th answer, the strip's count and × marks when the read is sent, the this-read ring at the R-th
  answer, a repair arc as its repair leaves.
- **The climax:** as the answer from the replica in both sets reaches the reader, the BOTH ring draws around its card
  (400 ms land with a fading second ring) and its answer chip lands. Repairs run, then the pill lands last.
- Plays pause by the widget host's visibility (IntersectionObserver on the host, plus `visibilitychange`), never one
  stage's (Data Modeling's phone bug). A settings change with no play running redraws the end state at once.
- **Reduced motion:** nothing moves. The stage shows the end state; a repaired card shows "~~v7~~ v8"; Play redraws and
  the notice says what happened in order ("Acked in 4 ms by R1 and R2. The read heard R3 (v7) and R2 (v8), repaired R3
  and returned v8 in 6 ms."). Every number is written on the drawing, so nothing is lost.

## 3. The experiments

Every number is a slot from `quorumScenario`; `enum.cjs` prints them all. A card sets the widget up (complete settings);
answering plays the act; the dock holds "your guess" through the play; the reveal is read out politely and its regions
get a focus outline with a "Look here" tag. Answer positions 3, 1, 2, 1, 3.

**E1 "Is R + W = N enough?"** (optional retitle "One more replica per read"). Setup N 5, W 2, R 3, all up; act
`write-read`. Ask: "Writes wait for 2 of 5 acks and a read asks 3, so 3 + 2 = 5. Of the 10 read sets of 3, how many can
miss v8?" Choices: "None: 3 + 2 covers all 5" / "3 of 10, as with 2" / **"1 of 10"**. Truth `staleSets` (1).
Reveal: "1 of 10: R3, R4 and R5 share no replica with the 2 that acked, and that is the read drawn here. It got v8 only
because v8 reached R3 at 2 ms, before the read did, and it repaired R4 and R5 before returning (7 ms in all). Had v8
reached R3 after the read, it would return v7. With R + W = N exactly one read set misses the write; R 4 makes it 4 + 2
> 5, and none can." Slots: w, n, r, sets, new, old, none, three (`C(3,2)` from R 2), two, one, miss, a/b/c (the missing
set), lucky (the read-set replica holding v8), land (its `landAt`), p/q (repairs), ms (`read.ms`), r1. Hides `count`.
Focus strip, reader.

**E2 "One replica down at ALL".** Setup N 3, W 3, R 1, R3 down; act `write-read`. Ask: "Writes wait for ALL 3 replicas,
reads for ONE, and R3 is down. What happens?" Choices: **"Writes are refused at once; reads still work"** / "Writes time
out after 2 s; reads still work" / "Both keep working". Truth from the model's write outcome (refused, timed out,
acked). Reveal: "Refused at once: the coordinator knows R3 is down, so it writes nothing and returns an error
(Cassandra's UnavailableException), and the read of R2 still works, returning v7. Had R3 stopped mid-write instead, the
coordinator could not know: the write would time out after 2 s, yet R1 and R2 would keep v8, so a later read can
return a write the client saw time out. With each replica down 1% of the time, writes at ALL succeed 97.03% of the
time, reads at ONE 99.9999%." Hides `write`, `verdict`, `availability`. Focus writer, handles.

**E3 "One replica stalls".** Setup N 3, W 2, R 2, stall on; act `write-read`. Ask: "R2 pauses for 100 ms (a GC pause), so
its round trip is now 104 ms. Writes at QUORUM took 4 ms. What do they take now?" Choices ascending: "4 ms, unchanged"
/ **"40 ms, R3's round trip"** / "104 ms, waiting for R2". Truth `write.ms`. Round trips stay visible (sorting them is
the skill). Reveal: "40 ms: a write goes to all 3 and returns at the 2nd ack, which is now R3's, across zones; ALL would
wait 104 ms for R2. ONE stays 2 ms. Reads hedge such stalls with speculative retry, asking one more replica; a write
already goes to all, so only W and replica placement help." Hides `write-time`, `verdict`. Focus latency, writer.

**E4 "The replica that missed a write".** Setup N 3, W 2, R 2, R3 back; act `read`. Ask: "R3 was down for the write and
is back. The read asks R3, which still has v7, and R2, which has v8. What happens to R3?" Choices: **"The read writes v8
to it before returning: read repair"** / "Nothing yet: the hint the coordinator kept replays v8 later" / "Nothing until
a background Merkle-tree repair". Truth: R3 in `read.repairs`. Reveal: "Read repair: R3 answered v7 and R2 v8, so the
read writes v8 to R3 and returns only then, 6 ms instead of 4 ms (Cassandra blocks the read on its repair, so a later
QUORUM read cannot go backwards). The hint the coordinator kept for R3 replays the write shortly after R3 returns (by
default Cassandra writes hints only for a replica's first 3 hours down); read repair fixes keys that are read;
Merkle-tree repair fixes the rest." Hides `repair`. Focus reader, cards.

**E5 "A sloppy quorum".** Setup N 3, W 2, R 2, sloppy, R2 and R3 back; act `read`. Ask: "R2 and R3 were down, so a sloppy
quorum took the write on R1 and stand-in H1. Both are back for the read, and 2 + 2 > 3. Can a read still miss v8?"
Choices: "No: R + W > N still holds" / "Yes: all 3 read sets can" / **"Yes: 1 of the 3 read sets can"**. Truth: `miss
=== sets ? all : miss > 0 ? yes : no`. Reveal: "Yes, 1 of the 3: a read never asks the stand-ins, and of the home
replicas only R1 has v8, so a read of R2 and R3, like this one, returns v7. H1 and H2 replay v8 to R2 and R3 shortly
after they return (hinted handoff); until then R + W > N promises nothing. A sloppy quorum trades the overlap for write
availability: 99.97% to 99.99999% here." Hides `verdict`, `count`. Focus stand-ins, strip.

**E6 Challenge "fast reads that stay fresh".** Setup N 3, W 2, R 2, stall on. Ask: "The middle replica keeps pausing for
100 ms. Choose N, W and R so that no read set can miss v8, reads take under 5 ms, writes under 50 ms, and writes survive
at least 1 replica down." Goal `all`: `canMiss below 1`, `readMs below 5`, `writeMs below 50`, `writeSurvives atLeast
1`; keep stall on, sloppy off, all up. The status line states the same bounds ("No read set can miss v8: 0 of 3 can,
met | reads 40 ms, under 5 ms: not yet | writes 40 ms, under 50 ms: met | writes survive 1 down, at least 1: met").
Exactly one of the 34 settings passes, N 5, W 4, R 2 (read 3 ms, write 41 ms). Reveal: "N 5, W 4, R 2: 2 + 4 > 5, the
read hears R5 and R4 in 3 ms, and the 4th ack, R5's, arrives at 41 ms, so the paused R3 is never waited on. The cost is
5 copies of every write, and writes succeed 99.90% of the time against QUORUM of 3's 99.97%. In an interview, also
name speculative retry (ask one more replica when one is slow), and say why LOCAL_QUORUM is not the answer here: a
quorum inside the reader's data center need not overlap a write acknowledged in the writer's." No hides (Describe still
waits). Focus reader, latency.

**One `hiding()` map** turns a question's hidden regions into every surface (known.md bug 1). Hiding holds through the
answer's own play (motion runs, hidden text stays "?") and releases at the reveal.

| Region         | Hidden on the stage                                                                                                                                                                         | Hidden elsewhere                                                                                     |
| -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| `count`        | strip headline "? of 10", the × marks, acked colours in cells and heads, the BOTH caption; the overlap sentence becomes "Does every read of 3 meet the 2 that acked?" (neutral and true)   | stage summary, Describe's sets row, the strip's accessible name, notices                             |
| `verdict`      | pill "returns ? · after your answer" (dashed), answer chips "R3 ?", read chips "? · 4 ms", BOTH ring and caption, repair arcs and glyphs, R-th ring and its label, the repair bar           | summary, notices, card names (no held or answered value), handles' text untouched                    |
| `write`        | writer status "outcome after your answer", cards' values "?", write lines neutral dashed, no W-th ring, write lane "acks after your answer", live counts                                    | summary, notices, card names, Describe                                                               |
| `write-time`   | "acked in ?", the W-th chip ring, the W-th latency ring and label (dots and round trips stay)                                                                                               | summary, Describe                                                                                    |
| `availability` | both handles' captions "survives ? down · writes succeed ?"                                                                                                                                 | the handles' `aria-valuetext`, Describe                                                              |
| `repair`       | repair arcs, particles and glyphs, the repaired card keeps v7 and its state word, the pill's time "? ms", the read lane ends at its R-th answer labelled "2nd answer 4 ms"                   | summary, notices, card names                                                                          |

Describe closes and waits ("Describe waits for your answer") while any question is open, the challenge included. The
settings an open question is about are locked; the cards carry titles only.

## 4. Accessibility

- The stage is `role="group"`, `aria-roledescription="visualization"`; its SVG has a one-sentence summary that obeys
  `hiding()` ("3 replicas, W QUORUM, R QUORUM. The write is acked in 4 ms by R1 and R2. returns v8 · fresh · 6 ms. 0 of
  3 read sets can miss v8.").
- Replica cards are a roving button group (one Tab stop, arrow keys move, Enter or Space advances the state). Each name
  says the replica, its state and the next action: "R3, back, missed the write. Activate to bring it up." A hover or
  focus hint names the next state ("Tap: take R2 down"). No name carries a value an open question hides.
- W and R are `g-handle` sliders: "W, acks a write waits for", `aria-valuetext` "QUORUM, 2 of 3: survives 1 down, writes
  succeed 99.97%" ("4 of 5", never "4, 4"); arrows, Home and End.
- N is a native radio group; the two conditions are native checkboxes; Play is a button; the dock is
  `app-widget-check`.
- After a play or a change, the notice (polite) says the outcome in words; the reveal is announced politely.
- Colour is never alone: v8 and v7 are always written; considering is amber plus a solid read line and the "v8 · 4 ms"
  text; critical carries ×; down carries hatch and dashes; the BOTH ring has its caption; the pill has a glyph and words.
  Tokens are the app's (`--g-viz-*`), checked by `theme-contrast.spec.ts`.
- 44 px targets: cards at five on 252 px, handles (44 px hit boxes, apart from every other target at every stop), Play.
- Describe: a `g-data-table` per replica (zone, state, write round trip, has v8 at, read reaches it, answered and
  repaired) in a `minmax(0, 1fr)` grid, scrolling inside its own box; `compact` heads on phones ("Rep.", "Write rtt").
- Reduced motion as in 2; the tools' `?motion=off` and `data-motion` give deterministic screenshots.

## 5. The prevention list (known.md's eight bugs)

1. **Giveaways while asking, on every surface.** One `hiding()` map (3) feeds the stage, summary, notices, card names,
   chips, the BOTH ring, repair particles, Describe, latency rows, handle captions and plays. The component spec's
   no-answer sweep moves every card, handle and toggle and starts every play during each question, with motion on and
   off, and checks no rendered or accessible text holds the answer or a false claim ("stale", "fresh", "meet any", "can
   fit in N without sharing", "both acked", "returns v"), and that no repair particle exists while asking. The mockup's
   `ask` state (E5) and `&exp=` show each question's hidden picture.
2. **`fieldset.group` beating `.n-control`.** The selector is `fieldset.group.n-control`; the layout spec includes 320 px
   and asserts the N control's box ends above the stage's.
3. **Elements tracked by `$index`.** Answer chips, line labels, read chips and latency dots are tracked by replica id,
   so v8 inserted before v7 animates in and v7 does not re-animate.
4. **Latency labels struck through.** Labels sit on a stage-coloured ground with the grid under them; markers end at
   their ring; dots are opaque; labels stay inside the plot with the fallbacks in 2; names and labels are measured with
   the mono measurement margin. `shoot.cjs` flags any grid line through text without a ground.
5. **Look-here tags clipped or missing.** Tags keep 3 px off the stage border and 16 px off corners, trying the frame
   edges, then just inside, then the gutter outside, then beside the frame; the sweep asserts every experiment's frames
   have a tag at 11 widths from 252 to 700 px, asking and revealed.
6. **Read-side marks at t = 0.** Each read-side mark has an appear time from the model (2, Motion); the component spec
   samples the play clock and asserts none shows before its event.
7. **The unreachable × on a repair arc** (N 5 W 1 R 4 back/down/back/up/up at 400 px). The × is placed along its dashed
   line where no arc, line, mark or text is, and the dashed line leaves from under the chip row so it never cuts a
   neighbour's chip; a timed-out stand-in's reply is drawn `applied`, not `fly`. The mockup sweep includes that setting.
8. **Plays paused by one stage's visibility.** The play clock pauses on the widget host's visibility and the page's.

The layout spec (`quorum-layout.spec.ts`) draws every N 3 setting and a stride of N 5 settings, every experiment asking
and revealed, at many widths from 248 to 700 px: no text on text, no line or mark through text, nothing off the stage,
hit boxes apart, one height per width and N. `shoot.cjs` runs the same checks on the mockup.

## 6. What a learner can say in an interview afterwards

- "A quorum write goes to all N replicas and returns at the W-th ack; a read returns the newest of R answers. R + W > N
  means every read set shares a replica with every acknowledged write set, so a completed read sees it."
- "With R + W = N there is always exactly one read set that misses the write; one more replica per read closes it."
- "W and R move latency, not just safety: a write waits for the W-th fastest replica, so one cross-zone or paused
  replica sets QUORUM's latency. Reads can hedge with speculative retry; writes cannot, so W and placement are the
  levers."
- "Cheap reads at ONE need writes at ALL, and ALL turns one down replica into refused writes (97% at 1% downtime per
  replica, against 99.97% for QUORUM)."
- "Refused and timed out are different: refused means nothing was written; a timeout means the outcome is unknown and
  some replicas may have it, so writes must be idempotent to retry."
- "Read repair fixes stale replicas a read touches, before it returns in Cassandra so later QUORUM reads cannot go
  backwards; hints cover replicas that were briefly down; Merkle-tree anti-entropy fixes the rest."
- "Sloppy quorums buy write availability by acking on stand-ins, and give up the overlap until hinted handoff
  delivers."
- "Even a strict quorum is not linearizable: racing reads can disagree and last-write-wins drops concurrent writes.
  LOCAL_QUORUM in the reader's region does not overlap a write acknowledged in the writer's."
- For the challenge: "N 5, W 4, R 2 keeps reads local and fresh with a paused replica, at the cost of five copies and
  slightly lower write availability."

## Notes for the owner

- **One known.md decision is physically inconsistent, not wrong in any claim:** the three zones put zone B 2 ms one way
  from both A and C while A to C is 20 ms. Real latencies cannot do that (via B would be 4 ms), and 20 ms one way is a
  cross-region figure; cross-zone round trips in one region are 1 to 2 ms. No number the widget quotes depends on the
  inconsistency, and the drawing claims no map (no zone band, no distances), so the numbers are kept as reviewed. If
  the owner wants it consistent, call A and C regions (or data centers, as the challenge's LOCAL_QUORUM line already
  does) and say "cross-region" where the experiments say "across zones"; R2's 2 ms to both would still need to move.
- Filled in where known.md is silent: the meaning of `failed write`, the stand-ins' delays, the nines rounding rule,
  read time with repair (R-th answer plus the slowest repair round trip), the read set as the R fastest answers, and
  `h` for timed-out and refused writes. Each is in 1 and checked by `enum.cjs`.
