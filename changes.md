# CDNs & Edge widget: critique and changes

## Round 0 (the designer's own, from reading every screenshot at 1280, 390 and 320 in both themes and the sweeps)

| Critique item | What changed |
| ------------- | ------------ |
| The old shield rule (`hit` at the locations' combined miss rate) disagreed with the simulation: one location and a shield gave 5.4% shield hits where the simulation finds none (both copies come from the same miss and expire together), and 0.2 to 0.4 points optimism elsewhere | The shield's rule counts only the other locations' misses, (P − 1) / P of the combined rate. enum.cjs's simulation now agrees within 0.16 points at all 11 settings simulated; the model gains the identity (1 − h_e)(1 − h_s) = 1 / (1 + rT), checked at all 96 shield settings, which E3's reveal now teaches ("with a shield the origin's load no longer depends on the number of locations"). The lesson's "about 890" becomes "about 910" (brief 7) |
| The old latency put the edge 10 ms from users at any number of locations, so 1 location looked best on every count and the trade a CDN buys was invisible | Users reach the nearest of n locations in 10 ms × √(20 / n), stated in the note; unchanged at 20, so the lesson's 47 ms and 30 ms stand. The challenge now needs all three levers (100 locations for latency, the longest fresh TTL, the shield for load), and exactly one setting passes |
| A stacked bar of three shares says nothing about which objects hit | The square: every request, objects by popularity, each as wide as its share; the bands' areas are the shares exactly (column means, enum.cjs check 4), with the tail bracket and the half-hit rings |
| Nothing showed a TTL at work | The timeline: one location, three objects by rank, five TTLs of one random sample, copies as bars from their miss, hits inside, misses after, the shield's copies under each lane |
| First render: the canvas measured text before the mono face loaded, so a lane label ran off the stage | The mockup awaits every face before the first measure (brief, prevention 13) |
| Collapsed columns drew 5 boxes for 20 locations with nothing said | The edge row says "drawn as 5 columns of 4" whenever columns are fewer than locations; a column's width is its locations' share, so the widths still add up |
| The shield and origin boxes were wider than their fills, so the red fill sat at one end of an empty box | Both boxes hug their band (8 px minimum), the fill is the whole inner width |
| Rank and time labels crowded at 320 (10,000 on 100,000, 4 min against 5 min) | Rank labels end at their ticks; `placeTicks` keeps the first and last and drops any middle label within 6 px of a kept one |
| While E1 asked, the 1st object's dense lane drew only its five misses as plain ticks: it read as "asked for five times" | A dense lane's arrivals are one grey hatch across the window while marks hide |
| "requests arrive …; most find their copy there" is false at settings where the edge hits under half, and it hinted E2's direction while the answer played | The step says only how to read a tick ("a short tick found its copy there") |
| Tier bodies and the title opened on numerals ("69.2% of requests, …", "10,000 requests a second through …") | "In 10 ms, for 69.2% of requests. Each of 20 locations takes 500/s and keeps its own copies."; "A CDN of 20 locations serving 10,000 requests a second"; `pageWords()` holds every sentence of all 192 settings to the rule |
| With one location and the shield on, the shield row read "0/s answered by the shield" | "With 1 location the shield never hits: its copy expires with the edge's. It adds 30 ms to every miss." |
| The no-answer sweep flagged the setup's own unchanged values (E3's edge rank, a lane named "#2,500" against E5's "about 2,500") | Answer tokens are the new value's forms that differ from the setup's, rates with their unit ("2,520/s", "2,500/s") |
| The ghost flag's planted leak went uncaught: no swept view carried a ghost | Every swept question is entered with a ghost from another setting; all eight planted leaks are caught |
| The FALSE_CLAIMS rule for "1 times" fired on "4.1 times" | The rule requires the 1 to stand alone |
| A choice's text, spliced into flex items by the number-keeping spans, broke into columns | Choice text is one span; "your guess" wraps under it on a phone |
| Focus outlines were dashed (copied from an earlier mockup), against prevention 17 | Solid; dashed is only the hidden box |

## Open for the critics

- The phone stage is long (1,797 px at a 320 phone, 1,595 at 390): three blocks, and a narrow label column that wraps
  the tiers' words to many lines. A critic may prefer the tiers' labels under the art on phones, or a shorter edge
  body there.
- The timeline's window is five TTLs, so a 1-hour TTL plays five hours in 6 s and a 5-second TTL 25 seconds: the axis
  says which, but the playback speed differs by 720×. Worth a critic's view on whether the step line should say "shown
  N× faster".
- Stale-while-revalidate and purges stay text (brief 1); an interviewer may weigh them higher.
