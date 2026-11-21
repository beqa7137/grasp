# Sharding widget (`hash-ring`): design brief

Redesign R41, the batch's sixth widget (REDESIGN.md 5.2: the R41 to R45 entry, its "Forms" bullet, and the Data
Modeling, Consistency & Quorums and Latency & Queueing notes; LOOP.md rows 122 to 124 are the house references). Lesson:
`/design/topics/sd-sharding`. Files beside this brief, on the orphan branch `design/r41-sharding`:

| File                   | What it is                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `model.js`             | The exact model (200 fixed keys, a consistent-hash ring or hash mod N, a change of the node set key by key, a hot key and its split), every sentence the widget says, and the six experiments as slot templates; ported to `libs/engine/src/sysdesign/lessons/widgets/sharding.ts`, `sharding-experiments.ts` and the app's `ring-words.ts`                                                                      |
| `enum.cjs`             | Prints every experiment number, proves the challenge has exactly one passing setting of 32, and checks the model against a second hash in BigInt arithmetic, a second ring that finds owners by brute force, a brute-force reassignment of every key for all 12,768 changes of the node set, the ring's two laws, every sentence of all 456 scenarios, the point names' salt bounds and the followed key's rule (100,256 checks) |
| `mockup.html`          | The mockup with the app's tokens and fonts: `?state=default\|one\|ten\|mod\|joined\|onejoined\|modjoined\|left\|down\|onedown\|moddown\|hot\|hotsix\|split\|hotdown\|six\|tallest\|playing\|modplaying\|replaying\|describe\|reduced\|ask&exp=1..5\|reveal&exp=1..5\|challenge&theme=light\|dark`; `ask` also takes `&phase=playing` (the answer's play, hiding held, `&frac=` its moment), the free plays take `&frac=`, and `challenge` takes `&start=1` |
| `shoot.cjs`            | Screenshots every state at 1280, 390 and 320 px in both themes with the page's collision report, layout assertions and page checks, then sweeps every scenario at 12 widths (at rest and at moments of its play), every experiment asking, playing and revealed, the no-answer sweep with six planted leaks, the nowrap units of every learner sentence, every page sentence, and the stage heights |
| `one.cjs`, `sheet.cjs` | One state, or several side by side, for a close look                                                                                                                                                                                                                                                                                                                                                             |
| `changes.md`           | What the design's own rounds found (parts A to C), and each item of the two critics' and the showcase's critique with what changed (part D)                                                                                                                                                                                                                                                                       |

## 1. The verdict, and the mechanism

**Today's widget against the bar.** One SVG ring, two scheme buttons, Add and Remove, a checkbox and a row of tiles. The
200 keys are dots drawn on the band they belong to, so the dots cover the band; at 100 virtual nodes the band is 500
separate arcs at 0.75 opacity, one or two pixels each, which blend to mud (the "100-virtual-node band" REDESIGN.md asks
to fix). When a node joins, the keys that move change colour in place and get an outline: nothing travels, so the
learner sees that some dots changed, not that data was copied from one machine to another, nor from where to where. The
only number is "Last change moved 46 of 200". Nothing says why a key is on its node (no rule is drawn for either
scheme), a failure can only be the newest node, nothing shows what one point a node does to a failure, and the hot key,
the one thing the lesson says no hash fixes, is not there at all. The three `tryThis` paragraphs carry every insight as
numbers to reproduce by hand. It shows outcomes, not the mechanism: short of the bar, and redrawn.

**What the learner must see.** A key's hash decides its node. Under hash mod N the node is a remainder, so changing N
changes almost every remainder and almost every key travels, between every pair of nodes. On a ring a key belongs to the
next point clockwise, so a joining node takes only the stretches just before its points, and every key that moves goes
to it; a leaving node hands on only its own keys. With one point a node the stretches are a few random lengths: shares
are wildly uneven and a lost node's whole load lands on one successor. With many points the stretches average out and a
lost node's keys spread over everyone left. And one key that carries a third of the traffic sits on one node whatever
the placement: only splitting the key spreads it.

**What the widget draws, what experiments test, and what stays text** (as a senior interviewer would weigh them):

| Idea                                                       | Weight | Where                                                                                                                                              |
| ---------------------------------------------------------- | ------ | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| A key's hash decides its node                              | core   | The rule line (one key's arithmetic) and the closer look (its neighbours by hash)                                                                  |
| hash mod N moves about N / (N + 1) of the keys             | core   | Placement "hash mod N"; keys flying between every pair of piles; the remainder table before and after; E1                                          |
| A ring moves about K / (N + 1), all to the joining node    | core   | The ring, the magnified strip with the new points claiming stretches, keys flying to one pile; E2                                                  |
| One point a node: uneven shares                            | core   | Points per node 1, 10, 100; the ring's few long arcs against the piles and the even line; E3                                                       |
| A lost node: one successor, or spread over all             | core   | Busiest node down; the lost node's keys flying to one pile or to all; E4 and the challenge                                                         |
| A hot key, and splitting it                                | core   | The hot key as one block as tall as its traffic on its node's pile; ten blocks when split; E5 and the challenge                                    |
| Rebalancing cost                                           | high   | The moved count against the ideal in the verdict; "every move is data copied over the network" in E1's reveal; the challenge's bound on keys moved |
| Replica placement (the next distinct nodes clockwise)      | medium | E4's reveal (the successor already holds copies, so it takes over at once) and the model line; lesson text (7). No third layer of marks on the ring |
| A skewed shard key (`country`)                             | medium | Lesson text and its worked example: the hot key is the same failure at its extreme, and is drawn                                                   |
| Hash against range partitioning, the range scan            | medium | Lesson text and its third worked example: range placement is another scheme with another picture (key order, not hash order)                       |
| The shard key and which queries stay on one shard, indexes | medium | Lesson text and follow-ups: a property of the queries, not of placement                                                                            |

**Settings.** Placement: a consistent-hash ring or hash mod N. Points per node: 1, 10 or 100 (the ring only). Nodes: 3,
4, 5 or 6, the first letters of A to F. Conditions: a hot key (30% of all traffic); split the hot key (10 salted keys,
needs the hot key); the busiest node down. 96 settings (hash mod N has no points, so its three stops are one). A change
of Nodes, or of the node down, is a change of the node set, and the keys that change owner are the last change; with a
node down the last change is always the failure itself, so the picture and the challenge's numbers are a function of the
settings. A change of placement or points places the keys afresh: it is a new start with no last change. There are 456
scenarios (a setting with each last change that can lead to it).

**The model** (all in `model.js`, ported 1:1; `hash32` and the tie rule are the engine's own). The old ring widget
and its `hashRing`, `ringOwner`, `moduloOwner`, `place` and `movedKeys` go with this change (nothing else calls them), so
the point names are free, and they carry a salt chosen by a search with hard bounds: `A#0/10175` to `A#99/10175`.
With the engine's bare names the instance contradicted the idea the Points control teaches (the 10-point ring was luckier
than chance and the 100-point ring unluckier, so 10 points looked as even as 100). With the salt, at every node count
the fullest shard and the largest ring share fall from 1 to 10 to 100 points (4 nodes: 107 / 62 / 53 keys, 55.1 / 32.7
/ 26.8% of the ring), as the theory says:

- Keys: `user:0` to `user:199`, K = 200, each at `hash32(key)` on a ring of 2^32 positions.
- Ring: each node takes `points` points at `hash32(node#v/10175)`; a key belongs to the first point at or clockwise of its
  hash, wrapping at 2^32 (binary search). A node's share of the ring is the summed length of the stretches that end at
  its points.
- hash mod N: a key belongs to `members[hash32(key) mod N]`, N the number of nodes up, in letter order.
- A change: `diff(before, after)` lists every key whose owner differs, with its old and new node; `into` and `out` count
  them by node; `toJoined`, `fromLeft` and `between` (keys that changed places among nodes that stayed) split them;
  `leftHeld` is what the nodes that left held; the ideal for a join is K × joined / N, named as the ideal wherever it is
  read.
- The hot key is `user:hot`, one more key beside the 200, so the 200 keys' counts never change with it. It carries 30%
  of all traffic; the 200 share the other 70% equally (0.35% each). Split, it is `user:hot#0` to `user:hot#9`, 3% each,
  hashed like any key. A node's traffic is computed in tenths of a percent in whole numbers
  (`floor((7 × keys + 60 × tenths of the hot key + 1) / 2)`, or `5 × keys` with even traffic), so a half never rounds
  two ways.
- The busiest node is the one with the most traffic with every node up (the first by letter on a tie); "down" removes
  it.
- The followed key is `user:119` (hash 3,688,624,336, 85.88% of the way round; mod 4 = 0, mod 5 = 1), chosen by rule
  (`enum.cjs`, section 6): it moves in E1, moves to E in E2 and is one of A's keys in E4, and its neighbours by hash
  look random under every modulus 3 to 6: in the 11-, 9- and 5-key windows no run of equal remainders is longer than 2
  (3 in the 11-key window), no window has more than ceil(expected + 1) adjacent equal remainders, and the 9-key window
  holds 4 keys that stay and 5 that move from 4 nodes to 5.

**Checks** (`node enum.cjs`, 100,256 pass). The hash against a second implementation in BigInt arithmetic for every key,
salt and point name (811 strings), all at distinct positions. Every placement (4 schemes × 57 node sets of two or more)
against a second ring that finds the owner as the point at the smallest clockwise distance, and BigInt remainders for
hash mod N; counts sum to 200 and ring shares to 1. Every change of the node set (12,768: every ordered pair of node
sets for every scheme) against a brute-force reassignment of every key, and the ring's two laws on each: a join moves
keys only to the joiners, a leave moves exactly the leavers' keys, and no key ever moves between nodes that stay. hash
mod N from N to N + 1 moves within 8 points of N / (N + 1), the keys that stay are exactly those whose hash leaves the
same remainder for both, and N of every N (N + 1) hashes do. Traffic sums to 100% and matches the fractions. With a node
down the change is the failure of the busiest node. The play's clock over every change: at most 51 keys in flight at
once (the pool holds 60) and no flight under 295 ms. Every sentence of every scenario (6,927: summary, story, standing
line, both rule lines, change label, Describe's rows, goal checks) against the false-claim rules and "no sentence opens
on a numeral", and the words against the picture by rule ("All N moved to" only when all did; "Only X's keys moved" only
when so; "the next point clockwise" only with one point a node; a tie named as one; the hot key's move said only when it
moved; the twins sentence exactly when hash mod N moved no key between nodes that stayed, which happens only on a
doubling or a halving, with the remainder law checked key by key; a failure always says the dead node sends nothing).
Every reveal's word claims ("four keys in five", "about 40" within 15%, "more than half", 2.5×, "two thirds", the
ring's order A, C, B, D with one point, the longest of 4 random arcs averaging about half the ring as H(4) / 4 and the
shortest 1 / 16, a share's spread over an even share of sqrt((n - 1) / (n p + 1)): 27% with 10 points and 8.6% with
100), E4's counterfactual against the stage's own story at 100 points, the experiments' numbers, the answer positions
(3, 2, 1, 3, 1), the challenge's one solution of 32, that no printed share sits on the wrong side of its bound, and the
salt's bounds (section 10: at every node count the fullest shard falls by 4 keys or more from 1 to 10 to 100 points and
the largest ring share falls; E2's joiner within 15% of its even share with every old node giving some; E3's fullest
over half; the hot key on one node on every ring; the challenge's 10-point near miss failing with piles 37 keys apart
against 6). `sharding.spec.ts` pins the same bounds.

**Honesty rule.** Nothing is sampled: the keys are a fixed set and every count the learner reads (moved, held, in, out,
fullest, a share of traffic or of the ring) is exact for that set, a slot computed by the model. The ideal is always
called an even share or the ideal, never a count, and written with its own numbers ("40 (200 / 5)"). Exactly the keys that move are drawn moving, each from the pile
it left to the pile it joins, and nothing is drawn moving that stays (asserted on every render: the hollow marks are
exactly the moved keys, the dots in flight exactly the keys the clock says are flying, and every key is drawn once on
the ring and once in a pile or in flight). The model's simplifications are written under the stage, always: "The model:
200 keys of equal size, each hashed once. Every key gets the same traffic unless the hot key is on, and a move is
counted, not timed. A failed node's keys are drawn moving to their new owners; in a real cluster those owners already
hold copies or reload them." (A dead machine sends nothing: the picture is of ownership moving, and the line says so.)

**Engine work.** The old `ring-widget.component.ts` and `hashRing`, `ringOwner`, `moduloOwner`, `place` and
`movedKeys` with their tests are deleted (`hash32` stays). `widgets/sharding.ts`: `SHARD_POINT_SALT`, `SHARD_KEYS`, `shardPlace(scheme, points, members)` (memoized),
`shardDiff(before, after)`, `shardTraffic`, `shardScenario(settings, from)` and `SHARD_SETTINGS`; settings are numbers,
as `ExperimentSettings` requires: `scheme` (0 ring, 1 hash mod N), `points`, `nodes`, `hot`, `split`, `down`. `hash32`
stays in `widgets.ts`.
`sharding-experiments.ts` holds the six specs. Framework: `ExperimentRun` gains `'move'` (a change of the node set plays
its keys moving); a spec's `hide` entry is a region with the phase that hides it (here only `after`, while playing);
`TEMPLATE_DIGITS_ALLOWED` gains "hash mod N", "N / (N + 1)" and "N + 1" (no "K / N": an even share is always written
with its own numbers, "40 (200 / 5)"). `sharding.spec.ts` pins the hash
against the BigInt one, the brute-force ring, the two laws over every change, the mod N law, the twins law, the traffic arithmetic and
the salt's bounds; `sharding-experiments.spec.ts` pins every quoted number, the answers and the challenge's
enumeration.

## 2. The picture

One `g-stage` whose height depends only on its width, read top to bottom as where a key's hash falls, what each node
holds, what the last change moved, and a closer look at why. Rules part the last two blocks from what is above them.
Each block holds only the lines it uses; the stage's spare height, laid for the longest words any setting can say,
collects once at its foot.

**Header.** The play disc (36 px in a 44 px box, "Replay the last change"; disabled with "none yet" in its name until a
node has joined or left; a pause glyph and "Stop the replay" during a free play), the title "Where 200 keys live", and
the key, in the neutral ink (a key's colour is its node's, so the key's dots are not any node's): a filled dot "a key,
in its node's colour", a hollow dot "moved in the last change" and, while the hot key is on, a red block "the hot key"
("a tenth of the hot key, 3%" when split). Phones: "a key", "moved last", "hot key" ("a tenth, 3%") on the legend's own
row. The row is laid for its widest entries at every setting, so the hot entry never moves the stage.

**The ring** ("THE RING OF HASHES, CLOCKWISE FROM 0"; under hash mod N "KEYS BY HASH · NODE = HASH MOD 5"). A band on a
circle, a tick and "0" at its top (6 px plus the title's descent under the title), a small arrow inside it for the
direction a key walks. Every key is a dot at the angle of its hash, just outside the band, pushed outward to the first
lane where it touches no other dot, so the 200 never overlap and none sits on the band (the positions depend only on the
stage's width, never on the setting). A dot takes its owner's colour; a key that moved in the last change is hollow.
The band is each node's stretches in its colour, drawn as one path a node, so it is at most six elements at any number
of points. With one point a node the ring is three to six long arcs, each point named in a chip inside the band at the
end of its arc (where two points are close the later chip steps along the band, away from its neighbour, and its tick
leans back to its own point; a node that left or failed keeps a grey chip at its old point, its letter beside the
piles' critical ×, from the first moment of the play). With 100 points the band is a fine weave of all the colours:
drawn exactly, as a texture that says the points (the virtual nodes) lie everywhere, and the stretch the closer look
magnifies is bracketed outside the dots. Under hash mod N there is no band, only a neutral track (the zero tick meets
its outer edge): the dots are a confetti of every colour, because a remainder has nothing to do with where a hash falls.
The ring's middle says what is placed ("5 nodes", "100 points each"; "3 nodes up" with one down; "hash mod 5"). The
followed key carries a caret outside the bracket, 6 px clear of it, and its name beside the caret (placed against the
real dots). During a play a hand sweeps the ring once: a moved key's dot takes its new colour and leaves its pile as the
hand passes its hash.

**Node colours.** The widget's own series of six, validated with the dataviz validator over all pairs (dots of every
owner sit side by side on the ring): light A `#364288`, B `#9b2fb1`, C `#948312`, D `#16753b`, E `#822d06`, F
`#3092c0`; dark A `#2064ef`, B `#9a498c`, C `#b07d0a`, D `#2dad72`, E `#a83f16`, F `#1794c3`. Every colour is 3:1 or
better on the stage, every pair is 15 or more apart in OKLab ×100 to normal vision, the worst pair under simulated
protanopia or deuteranopia is 7.5 (light) and 8.9 (dark), F is a real hue (cerulean) far from the grey of "down" and
"left", E is a rust far from the hot key's critical red, and none sits near the focus outline's purple. Light A and E
sit a little darker than the validator's lightness band (0.41 and 0.42 against 0.43): lightening them costs the A to B
and E to D separations under CVD, so the contrast was kept. The light worst CVD pair is in the 6 to 8 band, legal only
with secondary encoding, which the widget has everywhere: letters under piles, on chips, under ticks, in the table and
in every sentence. `theme-contrast.spec.ts` gains the six in both themes with the pairwise checks (normal ΔE 15, CVD ΔE
7.5 light and 8.5 dark, ΔE 12 from the critical red and the focus purple).

**The piles** ("WHAT EACH NODE HOLDS", and under it "A pile's height is its share of all traffic"). A column a node, A
to F at fixed places, each a pile of its keys as dots on a base line in the node's colour, with its letter under it.
Beside the ring (two columns) a pile is six dots across at the largest pitch the column allows (about 5.5 px at 1280); stacked
it is 7 to 9 across by width. A pile's height is the node's load on one scale for every setting, which ends at 200
key-heights (the whole 100% of even traffic, and the tallest pile any setting draws, 197 keys): gridlines at 25%, 50%,
75% and 100%, and an ink line at the even share with its label on one line level with it in the gutter ("even 20%").
A gridline within 19 px of the even line gives way to it, line and label, so every line in the pile area carries its
own label and the even label can never be read as another line's. A pile is a unit chart: its level is its full rows
plus the partial row's fraction, and that level is its share on the scale (asserted within 1 px on every render). A key
that arrived in the last change is hollow and lies on top of the keys that stayed, so every pile reads "these stayed,
these came". **The hot key** is one more mark on its node's pile: a block in the critical tone as tall as its traffic
(30%, as much as 86 ordinary keys), with "hot" on it; the scale then counts the 200 keys as 70%. The block sits on the
pile's level, filling the partial row's gap first and notched round its dots, so its top is the node's whole load.
Split, it is ten tenths of 3%, one contiguous stack per node with a stage-coloured seam between tenths. A hot block or
tenth that moved in the last change is drawn as the block form of hollow: an outline in the critical tone over a 15%
tint, still with "hot" on it. On a full pile the stack is cut at the scale's end under a triangle and "hot +29%", the
traffic the cut leaves out (26 px over the scale are kept for these words). The piles' dots wear a thin stage-coloured
ring, so a line crossing a pile reads as under it. A node that is down keeps its column: a grey base, its letter
beside a critical × under the base (where nothing else is drawn) and "down" in its keys cell; a node that left keeps
it for that change with "left".

Under the piles, a table in the piles' columns, a row a fact: keys; traffic; of ring (the ring only); and, once there is
a last change, in and out ("+39", "−13", "0" for none). Shares always carry one decimal ("20.0", "24.1"), so the
decimals align; where "43.3%" would not keep 6 px from its neighbour the percentages lose their sign to the row's head
("traffic %", "of ring %"). The busiest node's traffic is in the critical ink only while something is wrong: the hot
key unsplit, or the challenge's bound not yet met; otherwise it is ink.

**The last change** ("LAST CHANGE · E JOINED"; "C WENT DOWN", "C CAME BACK", "E AND F JOINED", "D LEFT"; "NONE YET").
The headline is the model's count, "39 of 200 keys moved" (17 px mono, the count in ink). Before any node joins or
leaves it reads "No node has joined or left" over "Change the nodes, or take the busiest node down, and watch which keys
move."; while a question asks, every control waits, so the second line reads "The answer's change shows here."; while
E3's answer plays, "What each node holds with the new points shows at the reveal." It never says that no key moved,
because a new placement or new points place the keys afresh. Under it, where they went against what had to move, in
sentences computed for the change: "All 39 moved to E: 13 from A, 10 from B, 5 from C and 11 from D." and "An even share
for E is 40 (200 / 5)."; under hash mod N "Only 47 of them moved to E; the other 119 changed places among A, B, C and
D, because hash mod 5 places every key again."; a failure with one point "Only A's 107 keys moved, all to C, the next
point clockwise.", "C went from 73 keys to 180." and "The new owner serves them from its copies: a dead node sends
nothing."; with 100 points "Only A's 53 keys moved: 25 to B, 12 to C and 16 to D." and "The new owners serve them from
their copies: a dead node sends nothing."; under hash mod N "B held 55 keys, but 152 moved: hash mod 3 places every key
again, so 97 changed places among nodes that stayed." and "B's own keys come from their copies: a dead node sends
nothing."; when hash mod N moved no key between nodes that stayed (only a doubling or a halving, `enum.cjs` checks)
"Doubling is hash mod N's one cheap change: a key's remainder for 6 is its remainder for 3 or that plus 3, so it stays
or moves to its node's new twin." (halving: "... so each node that left hands its keys to one twin."); and "The hot key
moved with them, from A to B." when it did. Then the standing line: "A is the fullest shard with 107 keys; an even
share is 50." or, with the hot key, "A is the busiest shard with 48.6% of the traffic; an even share is 25%. The hot key
alone carries 30%, on A." Under 324 px the two hot-key sentences ("The hot key moved with them ..." and "The hot key
alone carries 30%, on A.") are drawn instead of written: the block says "hot" on its pile and is hollow when it moved;
the notice, the summary and Describe keep both sentences. There too a doubling's story drops the per-node list the in
row already shows and its twins sentence takes its short form ("each key stays or moves 3 nodes on, to its node's
twin."). The block holds the lines it uses; a free play reserves its story's lines from the start, so nothing under the
block moves at the climax (a hidden play reserves nothing it would not show).

**A closer look** (the rule, on one key and its neighbours). The rule line follows `user:119` in full sentences at
every width: on the ring "user:119 hashes to 85.88% of the way round. The next point clockwise, at 85.98%, is one of
E's, so E holds it. It was on D." and, where that takes more than two lines, "user:119 hashes to 85.88% of the way
round; the next point clockwise is one of E's, so E holds it (it was on D)."; under hash mod N "user:119 hashes to
3,688,624,336, and 3,688,624,336 mod 5 = 1: the second node, B, holds it. It was on A." or "user:119's hash mod 5 is 1,
so the second node, B, holds it (it was on A)." While a play runs, and while an answer's play hides its node, it reads
only "user:119 hashes to 85.88% of the way round." (nothing about a node the picture may already show).

- On the ring, with 10 or 100 points a node, the strip is the stretch of ring around the followed key laid flat and
  magnified so that a point's arc is about 20 px wide, and never more than 28% of the ring, so it draws at most 60 keys
  ("A CLOSER LOOK · 5.8% OF THE RING AROUND user:119, MAGNIFIED 17×"). The band is the arcs in their owners' colours; a
  tick stands where each arc ends, named with its node where names keep 6 px apart (the names' row is occupied as a
  whole, so no tag lands among them); the keys in the window are dots over their hashes, hollow if they moved. The
  followed key takes the first lane, directly under its caret, with an ink ring; keys that would touch it stack above.
  Its walk runs from the dot down to a line between the dots and the band (3 px or more under the lowest lane) and
  clockwise to the point that owns it (to the strip's edge when that point is past it). When E joins, its points stand
  in the strip as new ticks, the stretch before each has turned E's colour, and the keys over those stretches are
  hollow: the rule at 100 points, readable.
- With one point a node the strip is the whole ring, cut at 0 and laid flat ("THE WHOLE RING, LAID FLAT FROM 0"): three
  to six arcs, each node's named under its longer part with what it holds, in one form for the whole row, the longest
  every labelled arc fits ("A: 107 keys", "A: 107", or the letters); a node down or gone keeps a grey tick struck with
  the critical × at its point; the followed key alone is drawn over it, with its walk to its point.
- Under hash mod N the strip is a table of the 9 or 11 keys nearest the followed key by hash (9 at every phone width:
  the ids lose "user:" to the row's head, and narrow columns take short heads, "mod 4", "was", "now", and the small
  face), the followed key's column shaded: `user:`, `hash mod 4`, `node`; after a change `hash mod 4`, `was on`, `hash
  mod 5`, `now on`, the node as a dot in its colour and its letter, hollow where the key moved. The table runs on the
  play's clock: the new modulus's rows come with the new points (12%); a column's new remainder and node appear ("…"
  until then) when the hand passes that key's hash, the moment its ring dot recolours; its hollow mark when the key
  lands. With `user:119` the neighbours read C D C D A B C D A under hash mod 4 and four of the nine stay: the mechanism
  of E1, and E1's reveal points at it.

**Controls** (outside the stage, as Consistency & Quorums and Latency & Queueing): Placement, a native radio group drawn
as `g-segmented` (Consistent hashing, hash mod N) in `fieldset.group.placement-control`; Points per node, the same (1,
10, 100), its legend "POINTS PER NODE (virtual nodes)", the term the interviewer will use, disabled under hash mod N
with the reason ("· hash mod N has no ring"); Nodes, the same (3, 4, 5, 6, each with its letters, "A–C", read out as "A
to C"); Conditions, three native checkboxes drawn as toggles: "A hot key · 30% of the traffic", "Split the hot key ·
into 10 salted keys" ("Split the key" under 360 px, its accessible name unchanged; disabled with "needs the hot key"),
and, full width, "Busiest node down · A would fail: its keys must move" ("C is down: its keys moved" while it is). The
toggle's caption goes through `hiding()`: while a question asks or plays it names no node ("The busiest node would fail"; "The busiest node is down"). The polite notice. A checked control keeps its weight, so nothing re-wraps. Describe sits under
the stage, after the simplifications line. While the challenge is open on a narrow layout, a compact copy of its
checklist sits under the controls ("1 of 3 met: busiest shard not yet · keys moved not yet · nodes met", aria-hidden:
the dock stays the source), so a learner sees each try's result without scrolling 1,100 px.

**Layout.** At container wide the stage takes the left column (620 px at 1280) and the controls, the open question and
the cards the 340 px right column. Narrower, one column: the controls as the stage's first rows, the stage, the open
question, the simplifications line, Describe, the cards. Below wide the notice is read out only. Inside the stage, from
600 px the ring (284 px) sits beside the piles, their feet level; narrower they stack: ring, piles, last change, closer
look. On a phone, choosing an answer scrolls so the piles' letters sit at the bottom of the view and as much of the ring
as fits stays above (the ring's lower half at least, at 320 × 568 and 360 × 640); the e2e asserts that on the Pixel and
iPhone projects and at those two viewports.

**Heights** depend only on the stage's width: the stage is laid for the most lines the last change block and the rule
line can take over every scenario and phase at that width, the piles always reserve six columns and the whole scale,
the table five rows, the strip its tallest stack; the spare sits at the foot. Measured in the mockup over every
scenario and every experiment phase at 12 widths (one value a width at each):

| Stage width (px) | 252   | 270   | 300   | 322   | 344   | 360   | 400   | 460   | 520 to 580 | 620 | 700 |
| ---------------- | ----- | ----- | ----- | ----- | ----- | ----- | ----- | ----- | ---------- | --- | --- |
| Stage height     | 1,065 | 1,065 | 1,095 | 1,138 | 1,187 | 1,169 | 1,134 | 1,116 | 1,096      | 798 | 805 |

So 252 px (a 320 px phone) is 1,065, 322 (390) is 1,138 and 620 (1280) is 798. At 322 px the median scenario's last
change and rule take 5 and 3 lines against reserves of 8 and 3. `widget-heights.ts` gets the built widget's measured
whole heights at rest per host width.

**Motion** (3.5's grammar; WAAPI on transform and opacity; pooled particles, at most 60 live).

- **One clock.** A change of the node set plays on one monotone clock of 2.4 s plus 12 ms a moved key (2.9 s for E2's
  39, 4.4 s for E1's 166). At 0 the joining node's column appears, empty, or the leaving node's base turns grey and its
  chip turns grey with the ×; at 12% the new points land on the ring and in the strip, the arcs that changed owner take
  their new colour, and the remainder table gains its new modulus's rows; from 26% to 82% a hand sweeps the ring once
  from 0, and as it passes a moved key's hash that key's dot on the ring takes its new colour, its table column fills,
  and its dot in the pile lifts off. A flight lasts 12% of the clock (295 ms at the least): it lifts straight off its
  pile in its first 15%, crosses at an apex at least 48 px (and 0.35 of its horizontal run, and 40% of the free
  headroom) over the highest pile between and the even line, and drops onto its new pile in its last 15%; in between it
  keeps 8 px clear of every pile top and of the even line (asserted). The dots above a key that left slide down (FLIP,
  240 ms). A key turns hollow when it lands, and counts in the in and out rows then; its dot leaves the source pile at
  lift-off. So exactly the keys that move are the ones in flight, each from where it was to where it is going, hash mod
  N's storm arcing high between every pair of piles and the ring's thin stream into one (51 keys in flight at the most:
  `enum.cjs`). Nothing is drawn for a key before its moment. A free play counts in the headline as keys land ("17 of 200
  keys moved so far", "Counting each key as it lands; 5 keys are in flight.") and the table's rows follow the piles.
- **The climax** is the last landing: the pile, or piles, that gained keys get the 400 ms landing ring (stroke only,
  around the whole pile), the headline settles on the count and the story appears in the lines reserved for it.
- **A change of points** (E3's act, and Points per node in free play) plays the same way once: the hand sweeps, the band
  recolours arc by arc behind it, each key whose owner differs between the old and new points recolours on the ring and
  flies to its new pile, and the closer look switches to the new points when the hand passes the followed key. It is
  still a new start: no last change, no hollow marks, "NONE YET".
- **An answer's play** applies the act and plays it with the numbers hidden (3).
- **Stop.** During a free play Replay is Stop; Stop, or any change of a setting, ends the play and draws the new rest
  state at once. The controls stay live during a free play; only an answer's play locks them.
- **Plays pause** by the widget host's visibility (IntersectionObserver on the host, plus `visibilitychange`).
- **Reduced motion:** nothing moves. A change draws its end state at once, which holds every mark and number (the hollow
  keys on the ring, in the strip and on the piles, the in and out rows, the headline and its story). The notice, the one
  live region, reads the story: "E joined, and 39 of the 200 keys moved. All 39 moved to E: 13 from A, 10 from B, 5
  from C and 11 from D. An even share for E is 40 (200 / 5)." No caption repeats it.

## 3. The experiments

Every number is a slot from the model (`enum.cjs` prints them all); answer positions 3, 2, 1, 3, 1. A card sets the
widget up with complete settings, as a new start: whatever the learner changed before leaves no last change; answering
plays its act; the dock holds "your guess" ("Watch the picture: the answer plays out on it.") through the play; the
reveal is read out politely and its regions get a focus outline with the house "Look here" tag.

**E1 "A fifth node, by hash mod N".** Setup hash mod N, 4 nodes; act `set: { nodes: 5 }`, `run: 'move'`. Ask: "The 200 keys sit on 4 nodes, each key on node number hash mod 4. A fifth node, E, joins, so every key is placed by hash mod 5. E needs 40 keys for an even share. How many keys change node?" Choices (ascending): "About 40: the keys E needs, no more" / "About 100: half of them" / **"About 160: four keys in five"**. Reveal: "It moves 166 of the 200 keys, 83%. A key stays only where its hash leaves the same remainder for 4 and for 5, which is 4 of every 20 hashes, so about 80% move. The table under the stage shows it key by key: a key stays only where its two remainders pick the same node. Only 47 of them went to E; the other 119 changed places among A, B, C and D, and every move is data copied over the network. Going from N to N + 1 nodes moves about N / (N + 1) of the data: the more nodes, the worse." Focus: the piles, the closer look (the table shows the reason key by key; the count stays in the verdict, unoutlined).

**E2 "The same node, on a ring".** Setup the ring, 100 points, 4 nodes; act `set: { nodes: 5 }`, `run: 'move'`. Ask: "The 200 keys sit on 4 nodes, now on a consistent-hash ring with 100 points a node: a key belongs to the next point clockwise of its hash. E joins with 100 points of its own. Which keys move?" Choices: "About 40 to E, and about as many again among A, B, C and D to even them out" / **"About 40, every one of them to E"** / "Most of them: a new node changes where every hash lands". Reveal: "Only 39 keys move, every one of them to E: 13 from A, 10 from B, 5 from C and 11 from D. Each of E's points takes the stretch of ring just before it from the point that owned it, and no other arc changes, so no key moves between the old nodes. An even share for E is 40 (200 / 5); E's 100 points took 17.1% of the ring (the ‘of ring' row), so it got 39. hash mod N moved 166 for the same change." The even share is the stage's own sentence, with its own numbers; the reason E got 39 and not 40 is a row the learner can read. Focus: the piles, the closer look.

**E3 "One point a node".** Setup the ring, 100 points, 4 nodes; act `set: { points: 1 }` (it plays: the hand recolours the band and the keys whose owner differs fly). Ask: "With 100 points a node the 4 shards hold 47 to 53 keys; an even share is 50. Give each node a single point on the ring instead. How many keys does the fullest shard hold?" Choices (descending): **"107: more than half of all the keys"** / "75: half as much again as an even share" / "53: no change, the hash is still uniform". Reveal: "A holds 107 keys, while B holds 3. One point a node cuts the ring into 4 arcs of random length: A's arc is 55.1% of the ring, so it gets about that share of the keys. The hash is uniform, but 4 random cuts are not even. This is typical, not bad luck: the longest of 4 random arcs averages about half the ring and the shortest about a sixteenth. With 100 points a node, its virtual nodes, each shard owns 100 short arcs scattered round the ring, their lengths average out, and the fullest holds 53. A share's spread shrinks with the square root of the points: about a quarter of an even share either way with 10 points, under a tenth with 100." Focus: the ring, the piles.

**E4 "The fullest node fails".** Setup the ring, 1 point, 4 nodes; act `set: { down: 1 }`, `run: 'move'`. Ask: "One point a node. A holds 107 of the 200 keys, and it fails. Where do its keys go?" Choices: "They spread over B, C and D, about 36 each" / "To its two neighbours on the ring, C and D, about half each" / **"All 107 to C, the next point clockwise"**. The ring is the question's premise and stays: a learner who has the rule can read the answer off it, and one who has not cannot. Reveal: "All 107 go to C: with A's point gone, the next point clockwise of every one of its keys is C's. C can take over at once because each key is also kept on the next distinct nodes clockwise, so C already holds copies; what it cannot take is the load: it goes from 73 keys to 180, 2.5× its load, so it is the likeliest to fail next, and then 180 keys land on the node after it: a cascade. With 100 points a node the busiest node is A; its arcs lie all round the ring, followed by points of B, C and D, so its 53 keys spread: 25 to B, 12 to C and 16 to D. Set Points per node to 100 to see it." The counterfactual is the stage one click away (Points per node 100 keeps the busiest node down, which is then A): every number in it is that stage's own (`enum.cjs` checks the reveal against the stage's story). Focus: the ring, the piles.

**E5 "A hot key".** Setup the ring, 100 points, 4 nodes, the hot key; act `set: { nodes: 6 }`, `run: 'move'`. Ask: "One key takes 30% of all the traffic, so its shard, A, carries 48.6% where an even share of 4 nodes is 25%. Add 2 nodes, so an even share is 16.7%. What does the hot key's shard carry now?" Choices (descending): **"42.3%: hardly less, the hot key alone is 30%"** / "32.4%: two thirds of it, as its keys thin out" / "16.7%: an even share of 6 nodes". Reveal: "It still carries 42.3%. Hashing spreads keys, not traffic: one key lives on one shard, so its shard carries that 30% however many nodes there are, and only the other keys' 70% thins out. More nodes never take it below 30%. Split the key instead: with a suffix from 0 to 9 it becomes 10 keys of 3% each, which land on 6 shards here, and the busiest shard carries 19.2%. The price is that a read of it gathers all 10." Focus: the piles, the last change.

**E6 Challenge "lose the busiest node and stay even".** Setup hash mod N, 4 nodes, the hot key, the busiest node down (C down: A carries 59.8% and 161 keys moved). Ask: "A hot key takes 30% of the traffic, and the busiest node has failed. Choose the placement, the points, the nodes and whether to split the hot key so that no shard left carries 30% of the traffic or more, the failure moves fewer than 50 keys, and the cluster has fewer than 6 nodes." Goal `all`: `busiest` below 30, `moved` below 50, `nodes` below 6; keep `hot` 1 and `down` 1. Of the 32 settings that keep them, exactly one passes: the ring, 100 points, 5 nodes, the hot key split (E down, its 39 keys spread over the 4 left, the busiest at 27.6%). Its near misses: 10 points give 36.4% with piles 37 keys apart (52, 61, 25 and 62) against the solution's 6 (53, 50, 50 and 47), 4 nodes 41.3%, unsplit 48.2%, 6 nodes pass the first two bounds and fail the third, and hash mod N never moves fewer than 137. The status is the house checklist (no line over it until met), under "Goal met:" while the goal holds and "You met it; now:" once the learner moves off it, each line with its state in words: "the busiest shard left carries 27.6% of the traffic, needs under 30%: met" / "the failure moved 39 keys, needs fewer than 50: met" / "the cluster has 5 nodes, needs fewer than 6: met"; at the start "... carries 59.8% of the traffic, needs under 30%: not yet". On a narrow layout its compact copy sits under the controls (2). Reveal: "A ring of 5 nodes with 100 points each and the hot key split passes: when E fails only its 39 keys move, spread over the 4 left, and the busiest carries 27.6%. Unsplit, the hot key's shard carries 48.2%; with 10 points a node the shards are less even and the busiest carries 36.4%; hash mod N would have moved 166 keys. Many points for even shards and a spread failure, a split for the key no hash can spread, and spare capacity for the node you lose." No hides; Describe waits until the goal is met ("Describe waits until you meet the goal.").

**One `hiding()` map** (prevention 1) from a question's regions to every surface; each region is named in the spec's own
`hide` list with the phase that hides it, so nothing is inferred from the act:

| Region  | When                    | On the stage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Elsewhere                                                                                                                                 |
| ------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `after` | playing (E1 to E5)      | the headline's count is "?" in a dashed box inside the text column; the story reads "Which keys moved, and where, shows at the reveal." (E3, a change of points: "What each node holds with the new points shows at the reveal."); every table cell of every node up is "?", and so is each arc's count under the whole ring ("A: ? keys"); no key is hollow, on the ring, in the strip, in the table or on a pile; the standing line reads "The fullest shard shows at the reveal." ("busiest" with the hot key); the rule line gives only the hash ("user:119 hashes to 85.88% of the way round."), and the remainder table keeps the setup's modulus and nodes; no landing ring | the summary ("... The answer is playing; its counts show at the reveal."), the notice ("The answer is playing on the picture."), Describe, the Busiest node down toggle's caption ("The busiest node would fail", no letter) |
| ghost   | asking (every question) | no last change: no hollow key, no in or out row, "LAST CHANGE · NONE YET" over "The answer's change shows here.", whatever the learner changed before the card                                                                                                                                                                                                                                                                                                                                                                                                                  | the summary and notice say the setup only                                                                                                 |

The picture of the answer's own play (keys flying, piles growing) is the play; its numbers wait for the reveal. While
any question asks or plays, Replay and the Placement, Points, Nodes and Conditions fieldsets are disabled, the notice
says "Replay and the settings wait for your answer.", and Describe waits ("Describe waits for your answer."). Cards
carry titles only. Nothing on the setup's stage states an answer: E1 and E2 show four piles and no change; E3 shows the
100-point ring (its standing line names A as the fullest with 53 keys, the premise the question quotes); E4's
one-point ring is its premise; E5 shows the hot key's 48.6%.

## 4. Accessibility

- The stage is `role="group"`, `aria-roledescription="visualization"`, named "Sharding: 200 keys placed on nodes by
  their hash"; its SVG has a summary that obeys `hiding()`: "A consistent-hash ring with 100 points a node puts the 200
  keys on 5 nodes: A holds 40, B holds 40, C holds 45, D holds 36 and E holds 39. E joined: 39 of the 200 keys moved."
  (hash mod N: "Placing by hash mod 5 puts ..."; a node down: "... on the 3 nodes left with C down: ..."; the hot key
  adds the standing line).
- Replay is a button ("Replay the last change"; "Replay the last change: none yet", disabled; "Stop the replay" during a
  free play; "Replay the last change, after your answer", disabled, while a question waits). Placement, Points and Nodes
  are native radio groups (one Tab stop each, arrows), the conditions native checkboxes whose second lines are their
  descriptions; the dock is `app-widget-check`, whose checklist lines carry ": met" / ": not yet" in words (the ✓ and ·
  are `aria-hidden`). No mark on the stage is tappable, so there is no tap hint to clear (prevention 11).
- Notices (polite, `aria-atomic`, the widget's one live region): after a change of the node set, its story ("E joined,
  and 39 of the 200 keys moved. All 39 moved to E: ..."); after any other change, the setting's summary; while a question asks "Replay and the
  settings wait for your answer."; while its answer plays "The answer is playing on the picture."; at a reveal the story
  or summary of the new setting; when the challenge opens, its setting's summary. It is never blank.
- Colour is never alone: a node is a colour and a letter (under its pile, in a chip at its point, under its ticks in the
  strip, beside its dot in the remainder table, in every sentence); moved is hollow and counted in the in and out rows;
  the hot key is a block with "hot" on it (a cut one "hot +29%"), a legend entry ("the hot key", "a tenth of the hot
  key, 3%") and its share in words, and a moved block is the block form of hollow; down is a grey base, a × beside the
  letter and "down"; the even share is a line named "even 25%". The six node colours are the widget's own validated
  series (2, "Node colours"), added to `theme-contrast.spec.ts` with their pairwise checks; the hot key is
  `--g-viz-critical`, used for the busiest shard's share only while something is wrong.
- 44 px targets: Replay, the segments and the toggles.
- **Describe** (a `g-data-table` in a `minmax(0, 1fr)` grid, scrolling inside its own box): the story or summary, the
  standing line and the rule line as sentences, then a row a node: Node, Points (virtual nodes), Of the ring, Keys,
  Traffic, Moved in, Moved out (shares with one decimal, "20.0%"; "0" where a node moved none, as on the stage; "no
  change yet" before any, "none yet" compact; a node down reads "C, down"). Under a 560 px
  stage it is `compact`: Node, Keys, Traffic, In, Out, so five columns fit 320 px without scrolling sideways; at 412,
  1280 and 1440 px the full form fits.

## 5. The prevention list

1. **Giveaways while asking, on every surface.** The one `hiding()` map (3) feeds the stage, the summary, the notice and
   Describe; Replay and every control wait, so no play the learner starts can show an answer; the answer's play keeps
   the hiding until the reveal; a card's setup starts afresh with no last change. The mockup's `noAnswer()` (run by
   `shoot.cjs`) renders every question asking, entered from six earlier node sets, and its answer's play at five
   moments, at 12 widths (660 renders), against each question's answer words (E1: "166 of", "166 keys", "83%", "+47",
   "47 of them", "other 119", "places every key again", "so far"; E2: "39 of", "All 39", "+39", the four sources, "moved
   to E", "E holds it"; E3: "107 keys", " 107 ", "55.1%"; E4: "180 keys", "to 180", "+107", "all to C", "C holds it",
   "C is the fullest"; E5: "42.3%", "19.2%"), the false claims (2) and structure: Replay disabled; the Busiest node down
   caption names no node; the free line "Change the nodes, ... and watch which keys move." never stands while the
   controls wait; while asking no hollow key, no flight, no sweep hand, no in or out row, and "none yet" as the last
   change; while playing no hollow key, every table cell "?", "down" or empty, a headline that opens on no digit, the
   hot key's word still on its block, and no landing ring. It finds none, and it catches six planted leaks (E1, E3 and
   E5 played with nothing hidden; E2 asked with the ghost of the learner's last change; E4 played with the hiding set
   for the wrong phase; E1 played with the toggle's caption taken from the after-act setting). The built component's
   sweep does the same with motion off and on, sampling the play frame by frame.
2. **False claims anywhere.** No hidden value has a default: hidden reads "?" or "shows at the reveal", never 0 and
   never a stale number. The false-claim rules (NaN, undefined, Infinity, null, "1 keys", "1 nodes", "1 shards", "1
   points", "0 of N keys moved", a number of four digits without its separator) run over every stage of the settings
   sweep and over every page sentence of all 456 scenarios; none. Every sentence is computed for its scenario and held
   to it by rule in `enum.cjs` (1, "Checks"): "All N moved to E" only when every moved key went to a joiner, "every one
   from C" only with one source, "Only C's keys moved" only when exactly its keys did, "the next point clockwise" only
   with one point a node, "A and D are the fullest shards" only on a tie, "one of E's" against "E's" by the points.
   Nothing animated stands for a number: the flights are exactly the model's moved keys (asserted on every render) and
   the count is the model's. The layout assertions on every render and every play frame: every key drawn once on the
   ring and once in a pile or in flight; a pile's dots are its node's count; a pile's drawn level (with the hot stack)
   is its share on the scale within 1 px; the hollow marks are exactly the landed moved keys, on the ring, on the piles
   and in the remainder table, and the hot key's hollow block exactly its move; the headline is the model's count (the
   landed count mid-play); the in and out rows each add up to it on every frame; every pile and block inside the pile
   area; the even line on the scale; in flight a key keeps 8 px clear of every pile top under it and of the even line
   but at lift-off and landing; no table column shows its new node before the hand reaches it; the strip's caret and
   walk start at the followed key. The page checks: no toggle's text within 4 px of its border, every choice button one
   label child, and every learner sentence's formulas, fractions, equations and short brackets inside one nowrap unit.
   Colour words against the picture: critical ink on the busiest share only while the hot key is unsplit or the
   challenge's bound is unmet.
3. **`$index` tracking.** Ring dots, pile dots, strip dots and flights carry the key's index (`k119`, `p119`, `l119`,
   `f119`); a pile's order changes as keys leave and land, so the template tracks by key; columns track by node letter,
   band paths by node.
4. **Labels on lines; markers; rings.** Every stage text has a stage-coloured halo and is placed by a `Draw` that checks
   texts, marks and lines; the ring and its dots are marks (an annulus in 48 sectors, so the ring's corners and middle
   stay free for the followed key's name and the middle's words); the checker also tests every text against every drawn
   dot. The even line's label ("even 25%", one line, level with its line) and the gridlines' labels sit in the gutter
   left of the piles, where no flight goes; a gridline within 19 px of the even line gives way to it, line and label,
   and the assertions fail any line in the pile area without a label centred on it, any gutter label beside no line or
   two, and any gridline within 12 px of the even label. Text boxes run to the font's full descent (a comma's tail
   counts), the ring's title keeps 6 px from its "0", the walk may not run through a strip dot, and the bracket is a line
   the followed key's name must clear. Point names in the strip keep 6 px apart or are left out
   (the tick stays). Flights stay inside the pile area (asserted), which holds no label but "hot" on its block and a
   cut's words over it. The landing ring is stroke only, around a whole pile. The checker flags text on text, a line
   through text (the even line, gridlines, rules, ticks, the bracket, the walk, the sweep hand, the band, bases), text
   on a mark, text on a dot, text under a control, dots on dots, anything off the stage, point names closer than 6 px, a
   text against a focus outline's stroke, and any label or tag with no place: zero over every screenshot and every sweep
   render.
5. **Look-here tags.** House candidates on the outline's edge first (16 px off its corners), then just inside, then two
   inner rows, outside last; the sweep asserts one placed tag for every focus region of every reveal and of the met
   challenge at 12 widths.
6. **Marks before their event.** One monotone clock per play (2), for every per-key surface: a key's ring dot changes
   colour, its remainder-table column fills and its pile dot lifts off only when the hand reaches its hash; it lands a
   flight later and turns hollow then (hollow on landing, everywhere: ring, strip, table, pile); a leaving node's base
   and chip turn grey at 0; the joiner's points appear before any arc changes colour; the count, and the in and out
   rows, in a free play are the number landed.
7. **Visibility and reduced motion.** Plays pause on the widget host's visibility and the page's; Reduced motion draws
   the end state, which holds every number and mark; the notice reads the story; no second live region repeats it.
8. **CSS specificity.** Every `fieldset.group` carries zero padding; a control's class only adds to it
   (`fieldset.group.placement-control`); the 320 px shots show the controls above the stage with no overlap.
9. **Words.** The summary, notice, story and standing line are full sentences; no sentence opens on a numeral (checked
   over every sentence: "The 200 keys sit ...", "E joined, and 39 of the 200 keys moved."); plurals by count ("1 point a
   node", "1 shard", "The one key moved", "1 key is in flight"); hashes carry thousands separators ("3,688,624,336");
   the rule line is a full sentence at every width; "the new owner" against "the new owners" by count; nothing is
   spliced from
   chips. The challenge's status is the checklist with its states in words, "Goal met:" only while the goal holds. The
   notice is never blank (4).
10. **Describe's width.** `minmax(0, 1fr)`, the table in its own scrolling box, compact under a 560 px stage, so it fits
    at 320 and 412 px and at 1280 and 1440 px; e2e checks no sideways page scroll at all four.
11. **Touch hints.** The stage has no tap targets but Replay, so it has no hints to clear.
12. **Placeholder heights.** The stage height is a function of width alone (2); `widget-heights.ts` gets the built
    widget's whole height at rest per host width from a measuring spec at 320, 360, 375, 390, 412 and 430 px and every
    50 px from 300 to 1,300, which fails on any drift over 3 px.
13. **Text measurement.** The mockup measures with canvas from the fonts the app ships; the build measures through
    `stage-text.ts` (`fontMeasure` with this widget's roles: label 11 px caps with a key's name kept in its own case,
    title and caption 13 px, small 11 px, mono 11 and 13 px, the 17 px mono headline). Stage text never uses tabular
    digits, so measurement matches rendering; the HTML tables and the dock keep `tabular-nums`.
14. **Learner text in HTML** (the notice, the simplifications line, Describe's sentences, the dock's question,
    choices, checks and reveal) renders through `g-code-text`, so no line parts a number from its unit ("39 keys",
    "hash mod 5"), a fraction ("200 / 5"), a named formula ("N / (N + 1)") or a short bracket ("(200 / 5)"), and a
    choice's text is one inline child of its button (so a glued "6 nodes" never becomes its own flex item); every live region holding it is `aria-atomic` (templates.spec enforces
    it). Stage text is laid by `stage-text.ts`'s `wrap` with the same glue as the mockup's (a number with its unit, "of"
    with its number, "hash mod 5", an equation, and what stands in brackets never part).
15. **Element counts** are bounded by the stage, never by the points: the band is one path a node (6 at most, at 600
    points); the strip draws only the arcs in its window, about one every 20 px (at most 39 ticks at 700 px, and at most
    60 keys); the keys are a fixed 200 dots on the ring and 200 on the piles, plus at most 11 hot marks each; flights
    are pooled, at most 60 live (51 at the busiest moment of the heaviest change). The heaviest stage is 697 SVG
    elements (hash mod N, 6 nodes, the hot key split, at 620 px), a number that does not grow with the points. A change
    recomputes one memoized placement (a binary search a key: microseconds) and one diff of 200 owners, so keydown to
    the second frame stays far under 150 ms on a Pixel 7 at 4× CPU, and a play animates transforms and opacity only.
16. **Specs and e2e** read the widget's state only after zoneless Angular has drawn it (web-first assertions, or wait
    for the setting's summary first); the widget's e2e runs on the desktop, Android and WebKit iPhone projects, and on
    the phone projects, and at 320 × 568 and 360 × 640 viewports, asserts the piles and at least the ring's lower half
    are in view during each answer's play and at its reveal.
17. **Marks mean one thing.** Dashed is only the box round a hidden "?" (asserted: no other dashed stroke on any render;
    the focus outline is solid). Hollow is only "moved in the last change". An absent node draws nothing; a node down or
    gone draws a solid grey base and a grey chip with the critical ×. The landing ring and the focus outline are
    strokes round a whole mark. Hollow for a block is an outline in its tone over a 15% tint.
18. **On the scale.** Every value an ask or reveal compares is on the drawn scale: the piles' scale holds every pile of
    keys at every setting (197 at most; E4's 180) and every experiment's piles with the hot key (E5's 53 keys under the
    hot key, the challenge's 85 under it); the even share is a line on it, and a pile's level is its share within 1 px.
    The one mark that can pass the scale, the hot key's stack on a pile of more than 114 keys, is cut under a triangle
    with "hot +x%", the traffic the cut leaves out, and the row under it gives the whole share. There is no ghost of an old value: a pile shows what stayed and what came, and
    what left is the out row's count under the pile it left.
19. **Units and conversions.** The table's shortest percentages move their sign to the row's head ("traffic %"), never
    drop it; the even label keeps its "%". The one conversion the learner must make, from keys to load, is drawn: the
    hot key is a block of its own traffic on the same scale as the keys, and the rule's arithmetic is written out
    ("3,688,624,336 mod 5 = 1"). Shares in a column carry one decimal, so decimals align.
20. **Layout.** Blocks are packed and the stage's spare height collects once at its foot (the standing line follows the
    story directly; absent table rows are closed up; a focus outline wraps only the lines a region uses); a checked
    segment or toggle keeps its weight, and under 360 px "Split the hot key" reads "Split the key"; on a phone, choosing
    an answer brings the piles and the ring into view before the play (2, Layout); the challenge's compact checklist
    sits under the controls on narrow layouts.

## 6. What a learner can say in an interview afterwards

- "With hash mod N a key stays only if its hash gives the same remainder before and after. From four nodes to five that
  is 4 of every 20 hashes, so about 80% of the data moves, between every pair of nodes, although the new node needs only
  a fifth. From N to N + 1 it is N / (N + 1): it gets worse as the cluster grows."
- "Consistent hashing puts nodes and keys on a ring; a key belongs to the next point clockwise. A new node takes only
  the stretches just before its points, so about a fifth of the keys move when a fifth node joins (K / (N + 1)), all of
  them to it, and nothing moves between the old nodes. A node that leaves hands on exactly its own keys."
- "hash mod N has one cheap change, doubling: a key's remainder for 2N is its remainder for N or that plus N, so each
  key stays or moves to its node's twin. That is why clusters on hash mod N grow by doubling, and why many systems hash
  to a fixed number of slots instead and move whole slots."
- "With one point a node the ring is a few arcs of random length: one node can own half the keys. And when a node dies,
  all of its keys land on the next node clockwise, which may then die too: a cascade. The next node can take over at
  once because it already holds copies (replicas go on the next distinct nodes clockwise); what it cannot take is the
  load."
- "So each node gets many points, its virtual nodes, 100 or more. A share's spread shrinks with the square root of the
  points: about a quarter of an even share with 10, under a tenth with 100. A new node takes a little from everyone, and
  a lost node's keys spread over all the survivors instead of one."
- "You add a node to a four-node cluster: about a fifth of the data moves, all of it to the new node, taken a little
  from each of the four; virtual nodes keep the shares even, and I'd throttle the copy because every moved key is data
  crossing the network while we serve traffic."
- "Hashing spreads keys, not traffic. A key that takes 30% of the traffic puts 30% on one shard however many nodes I
  add. I split it: a salt from 0 to 9 makes ten keys of 3% each on different shards, at the price of reading all ten
  back, or I give it a shard of its own."
- "I size for the failure: with the busiest node gone, the shards left must still be under their limit, which takes
  spare capacity, many points so the load spreads, and the hot key split."

## 7. Lesson text fixes (`libs/engine/src/sysdesign/lessons/sharding.ts`)

- `widget.tryThis` goes (the experiments replace it); `widget.experiments` takes `SHARDING_EXPERIMENTS`.
- **Why it matters** states no answer's number and stays as it is (the reveal spec's "why quotes no answer" check holds
  it).
- **Consistent hashing and virtual nodes** quotes E1's answer and its reason (4 to 5 nodes, 4 of every 20, 80%). Replace
  the body with: "With `hash mod N`, a key stays in place only when its hash gives the same remainder before and after:
  going from 9 to 10 nodes that is 9 of every 90 values, so 90% of the data moves. Consistent hashing puts nodes and
  keys on a ring and gives each key to the next point clockwise, so a new node takes only the stretches just before its
  points. With one point a machine those stretches are a few random lengths, so shares are uneven and a lost machine's
  whole load lands on its neighbour; many virtual nodes each even out the load and spread a lost machine over all the
  others. Many systems get the same result with a fixed number of slots: hash mod 16,384 never changes, a small table
  maps each slot to a machine, and adding a machine moves whole slots to it, much as a new node's points take whole
  stretches of the ring." The pitfall keeps its wording ("with one shard per machine").
- **Hot keys and resharding** agrees with the widget (a suffix from 0 to 9, 10 keys, read all 10 back) and gains the
  rebalancing cost the widget counts: after "or give it dedicated shards." add "Moving a key means copying its data
  across the network while it serves traffic, so every rebalance is throttled and can take hours: the fewer keys a
  change moves, the sooner the cluster is even again, which is why a cluster on hash mod N grows by doubling."
- **Secondary indexes and copies**: "each key is also copied to the next few nodes on the ring" becomes "each key is
  also copied to the next few distinct machines clockwise on the ring (with virtual nodes the next points can belong to
  the same machine, so they are skipped)".
- **Hash, range and directory** (the first concept) gains the evidence the closer look's table shows: after "turns a
  range scan into a query on every shard" add "(neighbours by hash are unrelated keys, so a range of ids lands on every
  shard)".
- **A new follow-up**, the interview question the widget answers: "You add a node to a four-node cluster: how much data
  moves, where does it go, and how do you keep the shards even?" with "With consistent hashing about a fifth of the keys
  move, all of them to the new node, from the stretches its points take; with `hash mod N` about four fifths move,
  between every pair of nodes. Give every node 100 or more virtual nodes so the newcomer takes a little from each and
  shares stay near even, throttle the copy, and split or isolate hot keys, which no placement can spread."
- The second worked example (one tenant with 30% of the writes) uses the widget's hot key share and agrees with it
  (30% + 4.4% on 16 shards; the widget's 4 nodes give 30% + 20%); the other examples, the pitfalls and the follow-ups
  agree with the model and stay.

## Notes for the builder

- The mockup's geometry is the spec: the ring's swarm (dots sorted by hash, each in the first lane that keeps 0.9 px
  from its lane's dots; the band's radius the largest that keeps every lane inside the ring's box), the annulus of
  marks, the chips' step along the band where two points are within 30 px, the piles' metrics (beside the ring six dots
  a row at `min(6, (column - 4) / 6)` px; stacked 9 dots at 6 px from 60 px columns, 8 at 5.6 from 48, 7 at 4.8 from 40,
  7 at 4.4 from 34, else 7 at 3.7), the scale of 200 key-heights with 26 px over it for a cut's label, a pile's level
  (full rows plus the partial row's fraction) and the hot stack's notch, the pile order (the keys that stayed by hash,
  then the arrivals as they landed), the flight's lift, carry and drop with its apex rule, the table's closed-up rows,
  the reserves (the most lines of the last change block and of the rule line over every scenario and phase at the
  width, held by the words spec), the strip's window (the whole ring with one point a node, else `min(0.28, floor(strip
  / 20) / (5 × points))`, starting 42% of a window before the followed key), its stacking with the followed key first,
  and the remainder table's 9 or 11 columns.
- `ring-layout.ts` (a pure `buildStage(width, scenario, view)` returning marks, as `latency-layout.ts` does),
  `ring-words.ts` (`hiding()`, the change label and story, the standing line, the rule's forms, summary, notices,
  Describe, goal checks), `ring-motion.ts` (the clock, the sweep, the flights' pool, the FLIP of a pile, the climax, the
  phone anchor), the component and its spec, `ring-layout.spec.ts` over every scenario at 252, 322 and 620 px and
  strides of them at nine more widths with play frames, every experiment asking, playing and revealed, and the
  assertions in 5.
- `content.md` (every string of the built widget, both checklist states included) is generated by a browser walk of the
  built widget, as for the other widgets, and goes to content review with the experiments.
