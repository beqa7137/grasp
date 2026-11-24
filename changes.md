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

## The critics' items

(To be added after the critique: item -> what changed.)
