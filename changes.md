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
