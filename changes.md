# Unique IDs widget: critique and changes

Round 0 is the designer's own critique, driven by `shoot.cjs` (state screenshots at 1280, 390 and 320 px in both themes,
the 916-render setting sweep at four widths, the "Look here" sweep at 14 widths and the no-answer sweep with planted
leaks) and by reading the screenshots. Round 1 is for the two design critics.

## Round 0

| # | Critique item | What changed |
| - | ------------- | ------------ |
| 1 | The no-answer sweep caught E1's end date ("3 November 2060") in the stage's accessible name while the answer played: the summary dropped the timestamp sentence with a regex that stopped at the decimal point of "34.8". | The hidden sentence is replaced up to the sentence that follows it, not to the first period; the sweep runs on every state since. |
| 2 | The sweep caught E2's answer ("3.95 ms") in the Reduced motion story, which printed the unfiltered mint sentence. | The story and the summary read one filtered function (`mintWords`), so a hidden sentence is hidden on both. |
| 3 | The sweep caught E2's answer while it played: the inspected id (the newest made) was a burst id from the fourth tick, "made by G0 at 4 ms, sequence 903". | The inspected id is chosen only from ids the hiding map shows. |
| 4 | While E2 played, the sorted list drew a "?" row for each hidden burst tick, so counting them told how many ticks the burst took. | G0's later rows are left out and one dashed box says "G0's later ids are hidden until you answer". |
| 5 | The sweep's words were too broad ("repeat" matched "Whether any id repeats is hidden"; "904" matched digits inside 19-digit ids). | Forbidden phrases are matched as whole numbers and phrases; the hidden sentence reads "Whether G1 makes any id twice is hidden until you answer." Every planted leak (eight) is still caught. |
| 6 | E1's structure check counted the chart's marker as the lifetime marker. | The lifetime marker has its own class (`life-marker`); E1 focuses the timestamp row, whose region holds the ruler. |
| 7 | "Look here" tags covered band headers ("the order an index keeps them in", "Random ids beside them") and the ghost line at 300 to 390 px. | Focus regions start above their band's header, and the tag tries every 40 px along the outline's top and bottom before falling back; 0 failures over 70 reveals. |
| 8 | Dots on dots at 300 and 320 px (G0's three ids in one tick, G2's two). | The stated arrivals keep 0.4 ms apart and dots are 3 px under a 290 px stage. |
| 9 | A burst at 0 or 1 sequence bits drew its ids as stacked dots (they are made at the same moment). | A group stays dots only while its ids are made at different moments; otherwise it is a gauge. |
| 10 | "+5 after 8 ms" collided with a fault's note in the lane gutter; at 320 px it ran into the plot. | Lanes grow to three gutter lines when needed; the count's short form is "+3,976 later". |
| 11 | Twenty "0" sequence labels crowded the lanes and collided at 320 px. | Sequence numbers sit only over a tick's dots when one is above 0 ("0 1 2"); the caption says a dot with none is sequence 0. |
| 12 | The sorted list's decimal ids ran into the "tick · G · seq" column. | The gutter is measured from a 19-digit id and the widest fields. Narrow stages show "5·1·0" only. |
| 13 | The square-law triangle's labels ran into the marker's figure and the index panel. | The triangle ends at the marker and is drawn only while the chance is small and its whole base is on the chart; the up leg says "× 10⁶". |
| 14 | Curve names and the marker's figure crossed curves ("122 bits", "near certain"). | All three are placed from candidate positions that cross no curve, dot or text. |
| 15 | A chance under 10⁻²⁴ drew its marker on the axis as if it were 10⁻²⁴. | A chevron at the axis points off the chart, with the value and "below the chart" in words. |
| 16 | Field names of one-bit fields collided ("1" / "1"). | A field name that cannot keep 6 px from its neighbour is left to the ledger, which names every field. |
| 17 | The question sat 1,600 px below the fold on a wide screen. | The dock sits at the top of the sticky side column at 1000 px and up; narrow, it follows the stage. |
| 18 | "−2 ms" over G1's lane collided with sequence labels and gauges. | The step back is a short critical tick on the lane; the gutter note says "clock steps back 2 ms at 5.5". |
| 19 | The first build had no CSS (a token block cut short) and measured text before the fonts loaded. | The tokens are copied whole; the page loads every role's font before measuring. |

**Open for the critics.** The stage is tall (1,260 px at 1280, 1,598 px at 390): the random band could be a second
stage. Counters, ranges and hi/lo stay lesson text. There are no handles on the bits (two boundary handles share one
place at 0 generator bits), so the steppers carry the trade. The mockup does not implement the tap to inspect an id,
and it redraws the whole SVG every frame of a play, which the builder must not.

## Round 1

Two design critics (C1, C2) and the showcase (S). Every must and should is applied unless a row says why not; the cheap
nice items are taken. Checks after the round: `enum.cjs` passes (about 6.5 million checks), `shoot.cjs` reports zero
collisions over every state at 1280, 390 and 320 px in both themes, the setting sweep, the Look-here sweep at 14 widths
and the no-answer sweep, and one stage height per width over every render.

| # | From | Severity | Critique item | What changed |
| - | ---- | -------- | ------------- | ------------ |
| 1 | C1 | must | Lesson text answers four of five predictions; brief section 7 kept "34.8 years" and added an E3 clause | Section 7 rewritten: no clause added; the worked example says "each extra bit halves the lifetime" with no figure; the clocks concept says the ids "are no longer safe"; the follow-up and example say "across generators they are only roughly time-ordered"; the 2.7% fix kept; the engine check bans "34.8", "3.95 ms", "2.7%", "278.7", "sort by generator", "then by generator", "reissue", "same timestamp and sequence" in every lesson string. The premise is corrected: the lesson renders below Try it. |
| 2 | C1 | must | Lanes shaded by true time contradict a faulty clock | Each lane is shaded by its own clock's ticks (`ownTicks`); a faulty lane has a strip "G2's clock" with its own tick numbers (G1's run 0 to 5, then 3, 4, 5 after the critical step tick); repeats join their first copy with a critical hairline under the `repeats` flag; `enum.cjs` checks every dot lies in the band of its own tick. The "tick 4, sequence 0 again" label on the arc is not drawn: in a 74 px lane it would always cross the sequence or wait row; the row note and band A's "made twice" carry it. |
| 3 | C1 | must | E1's reveal points at motion never seen; hiding 69.7 buys nothing | `lifetime` hides only a lifetime other than the setup's: asking shows "lasts 69.7 years" and "2⁴¹ ticks × 1 ms = 69.7 years". The play shows "2⁴⁰ ticks × 1 ms = ?", the ghost tick "was 69.7 years" and a dashed box where the dot lands; the reveal draws the ghost, the new dot and an arrow arc (the dot animates one step; Reduced motion draws both). Deviation: the ghost appears with the act, not only at the reveal, because it marks the change the act made and gives the play its reference; the structure check is "no ghost while asking, no lifetime marker while playing". |
| 4 | C1 | should | E2's setup is the challenge's solution | E2's setup is gen 12, seq 10 (41 bits, 69.7 years, 4,096 generators); `enum.cjs` asserts no experiment's setup or act passes the challenge. |
| 5 | C1 | should | E3 not uncertain; its play shows nothing | Option (a): E3 asks about clock skew (G2 at 3.7 ms, 2 ms ahead, against G1 at 4.4 ms; G1's sorts first); `enum.cjs` checks the answer and that the rest view orders them the other way. |
| 6 | C1 | should | Hidden regions collapse | Every hidden box is the exact size of what it hides, and every variable block reserves its widest lines, so the stage height is a function of width alone; `shoot.cjs` asserts one height per width over every render, including each experiment asking, at five play moments and revealed. |
| 7 | C1 | should | Missed collisions: hidden box through "today", amber legend vs focus outline, order line through repeat labels | The E1 end-date box sits in the ledger's reserved lines, never on the ruler; the legend is inside band D's region; repeat notes are placed from candidates clear of the order line. The report now checks hidden boxes over text, outlines within 6 px of any word or dot, and every registered line (order line included) through text. |
| 8 | C1 | should | E5's reveal turns on a conversion only in words; the triangle's up leg sits on the marker line | The pairs chain under the chart ("10⁹ ids → about 5.0 × 10¹⁷ pairs × 1 in 1.8 × 10¹⁹ each ≈ 0.027 repeats expected → chance about 2.7%"), hidden under `chance`; the up leg is 4 px left of the marker line. |
| 9 | C1 | should | The stage never shows that an id leaks information | Band A's last line: "Anyone holding this id can read when it was made (12:00:00.002 UTC on 24 November 2026, to the tick) and which generator made it (number 2)." Read back from the bits, so it says "to the tick" (the critic's "12:00:00.0029" is finer than the id holds). Hidden under `inspect`. |
| 10 | C1 | nice | E5's play is an empty box | Taken: E5 reveals on answering and the marker slides up the curve (`play&exp=5` renders the slide; Reduced motion draws the end). |
| 11 | C1 | nice | The challenge ignores the epoch; "(need 1,000,000)" wraps | Taken: the bound is "at least 200 years from today" (`yearsLeft`); one layout passes on either epoch (222 years left on 1970); "(need ...)" is kept whole. |
| 12 | C2 | must | A repeat sorts above its twin | `mint()` breaks equal ids by made order; `enum.cjs` asserts the row above every repeat holds its id; the report asserts each note's row above is its twin. |
| 13 | C2 | must | The burst gauge uses x for a count | Column gauges: vertical, at the moment the tick's ids were made, full at 2^s; the wait line ends at the last column's left edge (4.0 ms); bracket and "904" stay above. |
| 14 | C2 | must | Stage height changes in a play and when a question opens | Band D keeps 21 slots (the most any setting makes, checked by `enum.cjs`), rows at their final rank, unmade slots empty; hidden boxes keep their size; see 6. |
| 15 | C2 | must | Missed collisions (E1 box, E4 legend and tag, E4 tag on a dot, E2 label on the outline, E1 outline 2 px from labels) | Outlines sit 8 px outside their region (a lane's on its boundary, with lane content kept 7 px inside); tags are placed from candidates inside and outside the outline clear of every word, dot, line and mark; the report counts tag on dot, tag on line, tag on mark, outline within 6 px of words and dots, at 14 widths. |
| 16 | C2 | must | On phones controls sit under the whole stage | Under 1000 px the control groups sit on the stage in reserved slots: layout under band B, mint controls between the lanes and the sorted list, random under band E; heights measured into the slots. |
| 17 | C2 | should | 64 cells too small at 1280; light 0 digits under 4.5:1 | Always two rows of 32 (four of 16 on phones): cells about 19 px at 1280 and 20 px at 390. Digits in each field's ink token (5.6 to 8.7:1); light fills use the inks so white 1s pass too. The audit gains a cell-digit contrast check (brief section 4). |
| 18 | C2 | should | Field values are a sentence, not drawn against the bits | Brackets under each field's spans with its name and value centred under the longest; the conversion chain in the timestamp's ink ends on the same number. No arrow into the bracket: with two or four bit rows it would cross the cells (stated in the brief). |
| 19 | C2 | should | Band D has no tick boundaries | The true ticks are shaded through the sorted plot, with an axis under it. The optional gutter hairlines are left out: the shading already groups a tick's rows. |
| 20 | C2 | should | Out-of-order encoded by colour alone | Hollow amber dots, named in the legend ("A hollow amber dot is ..."); the audit gains a colour-blind simulation of band D (brief section 4). |
| 21 | C2 | should | The now line crosses hidden-box text | Hidden boxes are opaque and painted after the now line; the now line is also broken around every word, and its segments are in the report at the sampled play moments. |
| 22 | C2 | should | Labels on lines (E5 hidden text on a grid line; "refuses" on the lane line) | E5's box is opaque with its words set between grid rows; a refusing lane draws no lane line; lane and grid lines are registered for the report. |
| 23 | C2 | should | Inspecting needs a pointer | Older id / Newer id 44 px buttons in band A's header; Describe's table has every id's timestamp, generator and sequence. |
| 24 | C2 | should | A tagged choice re-wraps | Tags sit on the choice's top border, out of the text flow (a layout check keeps each choice's height). |
| 25 | C2 | should | E2's ask hides premise data | `burstAfter` hides only a burst's later ticks, so E2 asks over the full trickle; the play's box says "G0's later ticks are hidden until the reveal". |
| 26 | C2 | should | "G2 given number 1" orphans "1" at 320 | "number 1" is kept whole (it wraps before "number"); controls are in the 320 px shots. |
| 27 | C2 | nice | Square law not drawn at the default | Taken: the triangle is drawn to the right when the left base leaves the chart (to 10¹² ids, about 9.4 × 10⁻¹⁴). |
| 28 | C2 | nice | E1's old position only in words; faint step marks | Taken: the ghost tick "was 69.7 years" with an arrow arc; step marks ±4 px in stroke ink. The "÷ 2" label and "40 bits" under the dot are not drawn: one bit step is 7 to 13 px wide, and the ledger head ("Timestamp, 40 bits") and the ghost words ("one bit fewer halves it") say both. |
| 29 | C2 | nice | The summary describes the mint mid-play; Play has no pause | Taken: "Playing the mint: 8 ms of the clock, slowed down." while playing; Play becomes Pause ("Pause the mint"). |
| 30 | C2 | nice | Repeats do not point at their first copy | Taken with 2: first copies hollow critical, hairlines drawn at the repeat's moment. |
| 31 | S | must | "same id as the row above" on the wrong row | Same as 12. |
| 32 | S | must | Focus outline through stage text | Same as 15: a region is its band's whole extent, legend and bracket labels included, the outline 8 px outside it. |
| 33 | S | must | Tag covers a dot of the next lane | Same as 15: tags avoid dots, lines, marks and words of every band. |
| 34 | S | must | Hidden box on "today, 328 days in" | Same as 7; hidden boxes are opaque and the report checks them against text. |
| 35 | S | should | Now line and grid lines cross hidden text | Same as 21 and 22. |
| 36 | S | should | Curve and triangle labels on grid lines | Grid lines are registered and every candidate placement rejects them. |
| 37 | S | should | Ids ungrouped in band D and Describe | Every decimal id goes through the grouping formatter; the gutter is measured from the grouped widest id. |
| 38 | S | should | "tick" means two numbers | One term: "timestamp". Band D and compact Describe show its last digits ("…002 · 2 · 1"); full Describe shows the whole timestamp. |
| 39 | S | should | The lane does not pair a repeat with its first copy; "−2 ms" missing | Same as 30; "−2 ms" placed beside the step tick from candidates (the gutter note is its fallback). |
| 40 | S | should | Band A says 6.3 ms, the conversion 4.3 ms | The header names both: "made by G1 at 6.3 ms; G1's clock, stepped back 2 ms, read 4.3 ms" (reserved lines). |
| 41 | S | should | A 10 ms tick turns dots into empty gauges | A tick is a gauge only when its ids were made less than 0.4 ms apart (`DOT_GAP_US`); seven ids in one 10 ms tick are seven dots. |
| 42 | S | should | The id is never made bit by bit | Brief: while playing the newest id composes over 300 ms (timestamp from the chain, the generator field, the sequence stepping up from the previous id of its tick); Reduced motion draws it at once and says so. The static mockup cannot show the motion; the builder's motion spec samples it. |
| 43 | S | should | The notice describes the mint mid-play | Same as 29. |
| 44 | S | should | The notice re-reads 18 lines on every change | The notice says only what changed (`changeSentence`); the summary lives in the stage's name and Describe. |
| 45 | S | should | The checklist splits "(need 1,000,000)" | Same as 11. |
| 46 | S | nice | Goals not drawn on the stage | Taken: a goal tick "need 200 years from today" on the ruler and "(need 1,000)" and "(need 1,000,000)" on the chains in the challenge. |
| 47 | S | nice | E3's reveal does not single out the two ids | Taken: both are ringed in the lanes and the list, with "made 0.7 ms later, sorts first" (or "sorts first") beside G1's row. |
| 48 | S | nice | On phones the question is far from its band | Taken: under 1000 px the dock moves above the stage while an experiment or the challenge is open. |
