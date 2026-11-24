# Durability design: changes

The mockup's own rounds (before the critics). Each item is what a round found, then what changed.

## Round 1: the first complete render (zero-collision pass)

- **The model printed 14.8 nines for 10 + 4 at 2% and 24 h; the lesson says 14.7.** `1 − (1 − indep)(1 − rack)` lost
  the 1.8e-15 to rounding. -> `loss = indep + rack − indep × rack`; enum.cjs checks the lesson's ten nines.
- **Two copies crashed the page** (the failed piece was always the third). -> `failedIndex`: the third, or the second
  of two.
- **The rebuilt spare drew black** (`--g-viz-final-soft` missing from the mockup's tokens). -> Added for both themes.
- **The failure × sat on the "Repair of c3" label.** -> The window starts at the failure and the row says so ("Repair of
  c3, from its failure at 0"); no separate glyph.
- **"144 h" and "168 h, a week" collided** at 620 px. -> Plain hour labels; the week is the axis's span.
- **The headline crowded the nines scale's label, and focus outlines cut the headline's values.** -> 78 px from
  headline to scale; regions sized with 4 px clearance; tags gain inner candidates.
- **The final value had no room on phones** ("11.8 nines: 1 in 600 billion"). -> The chance moved into the row's words
  ("Lost in a year: 1 in 600 billion"), the dot keeps "11.8 nines", and where the dot is near the edge the value sits
  inside the bar's end in stage-coloured type.
- **The ghost caret crossed the last row's words.** -> The last row has 10 px more room; the caret is drawn first, the
  value placed, then "before 9.7" where free; the facts always say it.
- **The goal mark ran through every row's words.** -> The goal is a mark on the last row only, drawn before the values
  so they avoid it; its words take the first free place beside it.
- **A dashed box's words ran past the box at 252 px.** -> The box spans the stage; a shorter form under 252.
- **Segments wrapped "24 h" and "2 copies" at 320 px.** -> nowrap with 3 px side padding (prevention 8).

## Round 2: honesty and motion (the sweep over every setting)

- **The staged loss drew read stubs from pieces that had failed, and kept reading after the object was lost.** -> The
  rebuild reads only whole pieces; once lost, no stubs, and "nothing is left to rebuild from".
- **Rows' words showed before their marks during a play** (prevention 6). -> A row's words land with its mark.
- **"(was 1 in 7,300)" appeared on two of four rows in the challenge** (the ghost was three copies). -> A row's old
  chance is said only when the scheme is the same.
- **"A loss would need all 2 others"; "Only one choice of 2 copies: the 2 others".** -> "both other copies"; "One choice
  only: the 2 other copies".
- **The notice and readout opened on a numeral** ("2 copies at 1% …"). -> "Stored as 2 copies at 1% …".
- **Disk names were dark on the dark theme** (no `t-tiny` rule). -> Added.
- **A rack event drew a meaningless sliver of window and called the race "After c3 fails".** -> "After the rack event:
  no race" and "no repair: every piece went at once".
- Sweep at the end of round 2: 5,600 setting renders, 384 experiment renders, 540 no-answer renders, 6 of 6 planted
  leaks caught, every page sentence clean, 204 screenshots at zero collisions.

## The critics' items (round 3: two critics and the showcase)

Duplicates across the three lists are answered once; each line names every item it covers.

### Musts

- **Short windows drew a physically false rebuild onto one spare** (critic 1). -> "Free disk", never "spare";
  `DISK_WRITE_GBPS = 2` and `ALONE_HOURS` (22 h) in model.js; the facts at every setting: "One disk writes about 2 Gb/s,
  so a 20 TB disk refilled alone takes about a day; a faster repair spreads the lost pieces over many disks, each rebuilt
  in parallel."; the race sentence adds "…, while the rest of the failed disk is rebuilt at once, spread over many disks"
  wherever `writeGbps > DISK_WRITE_GBPS` (1 h and 6 h); enum.cjs checks the flag and the clause at all 160 settings.
  (The one-object picture stays true: c3 itself does go to one free disk; it is the disk's other pieces that spread.)
- **The rack event contradicted itself** (critic 1, critic 2, showcase). -> Row one "No repair: the rack took every
  piece at 0" ("No repair"), no band text; row two "The 2 others, in the same event" with a × at 0 and "c1 and c2 lost
  at 0" ("all 13 lost at 0"); "Repair of" is gone everywhere. Asserted: no repair named under a rack event, and the loss
  of the others drawn at 0. *Partly rejected*: one × at 0 instead of n − 1, because n − 1 crosses at one instant sit on
  each other (dots on dots); the words name every piece.
- **The last value far from its dot; goal words far from the goal** (critic 1, critic 2, showcase). -> The last row
  places the value first (right of the dot, inside the bar's end in stage type, above the dot; no far fallback), then
  the ghost unit, then the goal's words beside the goal mark (lane above the bar), and whatever has no place goes into
  the row's words ("· goal: 10 nines"). Asserted at every setting, width and goal state: value within 8 px of its dot,
  goal words within 8 px of the mark or in the row's words.
- **The ghost caret had no words, and sat on other values** (critic 2, showcase should). -> A lane above the bar holds
  the caret and "before 9.7" as one unit (outer side), a bracket to the dot and its ratio ("49× likelier", "110× less
  likely") on the dot's side; a 30 px column round the caret is reserved before the value is placed; if the words find
  no place the caret is dropped and the row says "(before 1 in 5.6 billion)". Asserted: every caret has its words within
  4 px; no value label within 12 px of a caret; at 520 px and wider "before" is drawn for every ghost.
- **Marks before their event** (critic 2). -> Before the failure the race is "The repair race" and the row "Repair"; the
  name lands with the ×. Asserted at every frame.
- **Rack placement nearly invisible** (critic 2). -> Frames in `--g-stroke` (3:1), 4 px apart, captioned above ("a rack
  each", "one rack" struck critical, "free"). The caption is one per group rather than "rack" under every frame: under
  the frames run the read stubs, and one caption reads cleaner than nine.
- **E5 promised reads that never come** (critic 1 should, critic 2 must and should). -> `reads` split from `after`, hidden
  only by E3; a lost object always shows "nothing is left to rebuild from"; E1, E2, E4 and E5 play the real stubs and
  dots. The sweep and the no-answer sweep reject a reads box where the play has nothing to rebuild; the E3 planted leak
  plants reads without `reads` (6 of 6 caught).
- **"1 every 6 years" wrapped with "1" alone** (critic 2, showcase should). -> The keep rule joins a count with its
  period ("1 every 600 years", "N a year", "5.6 million years", "1 in 10 years"); a check runs it over every HTML sentence
  of all 160 settings and every ask, choice and reveal, and the shots assert no kept span breaks at any width.
- **The staged tag dropped on phones** (showcase). -> The tag is drawn first, always; the title falls back ("After the
  rack event" > "Rack event"; "After d3 fails" > "d3 fails"; "The repair race" > "Race"). Asserted: exactly one tag
  per staged view at all 12 widths.

### Shoulds

- **Describe's exactness sentence was false for copies** (critic 1). -> `exactWords` per setting. Copies: "For copies
  the steps are the model exactly: a loss needs every other copy." Codes: the critic's formula, with its sign corrected:
  the exact sum is slightly *less* than the steps (the (1 − p)^k survival factors outweigh the extra-failure terms), so
  it reads "…its exact sum also weighs the other pieces surviving the window and the rarer cases of more failures,
  0.12% less here." enum.cjs checks lead = first × tail for copies and the sign for codes at every setting.
- **The challenge's margin reasoning contradicted E5** (critic 1). -> Ask reworded as proposed; the goal unchanged.
- **"1 every 600 years" read as a trickle** (critic 1). -> "on average" in the readout, summary, notice, checklist and the
  billion axis title; E6's reveal: "That is an average: the billion objects share 70 disks, so a loss, when it comes,
  takes about 170,000 objects at once, about once in 12 million years; limiting which disks share objects trades how
  often for how many." Both numbers computed in model.js (`objectsPerLossOf`, `lossEventsYear`) and checked in enum.cjs
  by an independent product form.
- **Detection time unnamed** (critic 1). -> The radio group's name "Time to full redundancy: detect and rebuild"; the race
  row "Detection and rebuild of c3, from its failure at 0" ("Detect and rebuild c3"); the summary says "detected and
  rebuilt"; E2's reveal adds the detector sentence.
- **The window's power told, not drawn** (critic 1, critic 2, showcase). -> With a ghost the old walk is drawn: each
  changed step's old arrow a 1 px `--g-stroke` hairline under the new one with an open caret tip (solid, not dashed:
  dashed means hidden); "(was …)" on window rows and on the first failures ("0.18 a year (was 0.06 a year)", whatever
  the scheme); the last row's bracket carries the ratio. Asserted: every "(was …)" row draws its old arrow, and the
  window rows' old and new arrows differ by one amount.
- **"Stored as" cramped at 320 px** (critic 1, critic 2 nice). -> A container query lays it out 2 × 2 under a 340 px
  controls column, with 6 px padding; the shots assert at least 6 px from each label to its border at every width.
- **Describe's labels disagreed with the stage; duplicate compact headers** (critic 1, critic 2, showcase nice). ->
  One `stepWords` feeds the stage and Describe (middle form, shortest when compact: "Another fails within 24 h",
  "And a second", "One choice only", "Any 3 of 8"); unique headers and no "Any 2 of the 2" checked at every setting.
- **Staged crosses unnamed and piled up** (critic 2, showcase). -> Each × is named above it (numbered, with the numbers on
  the struck disks, where names cannot fit); where the crosses cannot stand their width + 4 px apart on the week, the
  race is drawn on its window (axis 0, window, 1.5 × window; the title says "zoomed to its window") instead of an inset,
  which would need its own reserved height. Asserted: one name or number per ×; crosses on one track at least their
  width + 4 px apart.
- **Data against parity by colour alone** (critic 2). -> Hairline brackets under the stored bar ("6 data", "3 parity";
  "3 full copies"), replacing the colour key, and a solid cap band on parity disks.
- **Two challenge goals had no mark** (critic 2). -> A goal tick at 1.5× on the stored bar, muted until met, final once
  met, with "at most 1.5×" where it fits. *Rejected*: the rebuild-rate gauge. A lane used only by the challenge would
  either change the stage's height by phase (breaking `widget-heights.ts`) or leave an empty lane at every other setting,
  the dead space two nice items asked to cut; the rate stays in the checklist and the facts.
- **E3's 20 TB to 200 TB conversion only told** (critic 2). -> Under the bus the read volume is drawn: one block a piece
  read, each one disk, then "120 TB for a 20 TB disk"; hidden with `reads` in E3, landing at the reveal.
- **Stage a loss stuck pressed** (critic 2). -> A second press returns to the typical repair at rest, `aria-pressed` false.
- **The phone play scrolled the disks away** (showcase). -> Block start to the disks' row (under any sticky header) when
  the stage is taller than the viewport; shoot.cjs asserts the free disk is in view while E1's answer plays at 390 × 844.
- **NINES gave the answer before the walk landed** (showcase). -> "…" during a play until the last row lands. Asserted.
- **The spare named like the failed disk** (showcase). -> The free disk's caption is "free" and its rebuilt name "→c3";
  disk names asserted unique.
- **The end check on the focus outline** (showcase). -> The race axis ends 10 px inside; the outline check now covers
  circles and paths, not only text.
- **The placeholder too short for its words** (showcase). -> Boxes are the text's height plus 8 px or more (the last row
  22 px, the reads box spans bus and lane); asserted: every placeholder's words inside with a 4 px inset.

### Nice

- **Failures a year rounded differently** (critic 1). -> `formatFew` (two significant figures): "about 1.5 of them".
- **Dashed focus outlines** (critic 1). -> *Not changed here*: the focus box is shared by every widget, and outlines
  only show at a reveal, when no placeholder exists, so the two never meet; the brief records the house exception.
- **Payload numbers 11 px** (critic 2). -> 13 px cap role at 600 on stages from 520 px; the row pitch rose to 34 px.
- **Dead band at the foot; the rack row's pitch** (critic 2, showcase). -> The rack row folds into the last row's words
  ("Lost in a year: 1 in 1,000, set by the rack event (assumed)") with its red bar, cutting the reserve from eight rows
  to seven; the last row sits at a fixed place under the steps, so unused rows read as gridded scale; the reserves at the
  foot are gone (the facts end 22 px above the stage's edge).

Sweep at the end of round 3: 5,600 setting renders, 384 experiment renders, 540 no-answer renders, 6 of 6 planted leaks,
every page sentence and every experiment sentence clean, 198 screenshots at zero collisions, the phone scroll check,
enum.cjs 7,094 checks.
