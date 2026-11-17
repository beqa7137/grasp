# Sharding widget (`hash-ring`): design brief

Redesign R41, the batch's sixth widget (REDESIGN.md 5.2: the R41 to R45 entry, its "Forms" bullet, and the Data
Modeling, Consistency & Quorums and Latency & Queueing notes; LOOP.md rows 122 to 124 are the house references). Lesson:
`/design/topics/sd-sharding`. Files beside this brief, on the orphan branch `design/r41-sharding`:

| File                   | What it is                                                                                                                                                                                                                                                                                                                                                                                                       |
| ---------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `model.js`             | The exact model (200 fixed keys, a consistent-hash ring or hash mod N, a change of the node set key by key, a hot key and its split), every sentence the widget says, and the six experiments as slot templates; ported to `libs/engine/src/sysdesign/lessons/widgets/sharding.ts`, `sharding-experiments.ts` and the app's `ring-words.ts`                                                                      |
| `enum.cjs`             | Prints every experiment number, proves the challenge has exactly one passing setting of 32, and checks the model against a second hash in BigInt arithmetic, a second ring that finds owners by brute force, a brute-force reassignment of every key for all 12,768 changes of the node set, the ring's two laws, and every sentence of all 456 scenarios (98,818 checks)                                        |
| `mockup.html`          | The mockup with the app's tokens and fonts: `?state=default\|one\|ten\|mod\|joined\|onejoined\|modjoined\|left\|down\|onedown\|moddown\|hot\|hotsix\|split\|hotdown\|six\|tallest\|playing\|modplaying\|describe\|reduced\|ask&exp=1..5\|reveal&exp=1..5\|challenge&theme=light\|dark`; `ask` also takes `&phase=playing` (the answer's play, hiding held, `&frac=` its moment) and `challenge` takes `&start=1` |
| `shoot.cjs`            | Screenshots every state at 1280, 390 and 320 px in both themes with the page's collision report and layout assertions, then sweeps every scenario at 12 widths (at rest and at moments of its play), every experiment asking, playing and revealed, the no-answer sweep with five planted leaks, every page sentence, and the stage heights                                                                      |
| `one.cjs`, `sheet.cjs` | One state, or several side by side, for a close look                                                                                                                                                                                                                                                                                                                                                             |
| `changes.md`           | What the design's own screenshot rounds and self-critique found, and what changed for each                                                                                                                                                                                                                                                                                                                       |

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
| A ring moves about K / N, all to the joining node          | core   | The ring, the magnified strip with the new points claiming stretches, keys flying to one pile; E2                                                  |
| One point a node: uneven shares                            | core   | Points per node 1, 10, 100; the ring's few long arcs against the piles and the even line; E3                                                       |
| A lost node: one successor, or spread over all             | core   | Busiest node down; the lost node's keys flying to one pile or to all; E4 and the challenge                                                         |
| A hot key, and splitting it                                | core   | The hot key as one block as tall as its traffic on its node's pile; ten blocks when split; E5 and the challenge                                    |
| Rebalancing cost                                           | high   | The moved count against the ideal in the verdict; "every move is data copied over the network" in E1's reveal; the challenge's bound on keys moved |
| Replica placement (the next distinct nodes clockwise)      | medium | Lesson text (7): a third picture on the ring would cover the two the learner must read, the arcs and the keys                                      |
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

**The model** (all in `model.js`, ported 1:1; `hash32`, the point names `A#0` to `A#99` and the tie rule are the
engine's own, so every count agrees with the old widget's):

- Keys: `user:0` to `user:199`, K = 200, each at `hash32(key)` on a ring of 2^32 positions.
- Ring: each node takes `points` points at `hash32(node#v)`; a key belongs to the first point at or clockwise of its
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
- The followed key is `user:56` (hash 2,659,197,755, 61.91% of the way round; mod 4 = 3, mod 5 = 0): it moves in E1,
  moves to E in E2, and is one of C's keys in E4 (`enum.cjs` checks each).

**Checks** (`node enum.cjs`, 98,818 pass). The hash against a second implementation in BigInt arithmetic for every key,
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
moved). Every reveal's word claims ("four keys in five", "about 40", "more than half", 4.7×, "two thirds", the ring's
order C, B, A, D with one point), the experiments' numbers, the answer positions (3, 2, 1, 3, 1), the challenge's one
solution of 32, that no printed share sits on the wrong side of its bound, and the lesson's own numbers (166, 158, 46,
57).

**Honesty rule.** Nothing is sampled: the keys are a fixed set and every count the learner reads (moved, held, in, out,
fullest, a share of traffic or of the ring) is exact for that set, a slot computed by the model. The ideal (K / N) is
always called an even share or the ideal, never a count. Exactly the keys that move are drawn moving, each from the pile
it left to the pile it joins, and nothing is drawn moving that stays (asserted on every render: the hollow marks are
exactly the moved keys, the dots in flight exactly the keys the clock says are flying, and every key is drawn once on
the ring and once in a pile or in flight). The model's simplifications are written under the stage, always: "The model:
200 keys of equal size, each hashed once. Every key gets the same traffic unless the hot key is on, and a move is
counted, not timed."

**Engine work.** `widgets/sharding.ts`: `SHARD_KEYS`, `shardPlace(scheme, points, members)` (memoized),
`shardDiff(before, after)`, `shardTraffic`, `shardScenario(settings, from)` and `SHARD_SETTINGS`; settings are numbers,
as `ExperimentSettings` requires: `scheme` (0 ring, 1 hash mod N), `points`, `nodes`, `hot`, `split`, `down`. `hash32`,
`hashRing`, `ringOwner`, `moduloOwner`, `place` and `movedKeys` stay in `widgets.ts` untouched (only the old widget and
`widgets.spec.ts` call them; the new functions reuse `hash32` and are pinned to give the same owners).
`sharding-experiments.ts` holds the six specs. Framework: `ExperimentRun` gains `'move'` (a change of the node set plays
its keys moving); a spec's `hide` entry is a region with the phase that hides it (here only `after`, while playing);
`TEMPLATE_DIGITS_ALLOWED` gains "hash mod N", "K / N", "N / (N + 1)" and "N + 1". `sharding.spec.ts` pins the hash
against the BigInt one, the brute-force ring, the two laws over every change, the mod N law, the traffic arithmetic and
the lesson's numbers; `sharding-experiments.spec.ts` pins every quoted number, the answers and the challenge's
enumeration.

## 2. The picture

One `g-stage` whose height depends only on its width, read top to bottom as where a key's hash falls, what each node
holds, what the last change moved, and a closer look at why. Rules part the last two blocks from what is above them.

**Header.** The play disc (36 px in a 44 px box, "Replay the last change"; disabled with "none yet" in its name until a
node has joined or left; a pause glyph and "Stop the replay" during a free play), the title "Where 200 keys live", and
the key: a filled dot "a key, in its node's colour" and a hollow dot "moved in the last change" ("a key", "moved last"
on phones, on their own row).

**The ring** ("THE RING OF HASHES, CLOCKWISE FROM 0"; under hash mod N "KEYS BY HASH · NODE = HASH MOD 5"). A band on a
circle, a tick and "0" at its top, a small arrow inside it for the direction a key walks. Every key is a dot at the
angle of its hash, just outside the band, pushed outward to the first lane where it touches no other dot, so the 200
never overlap and none sits on the band (the positions depend only on the stage's width, never on the setting). A dot
takes its owner's colour; a key that moved in the last change is hollow. The band is each node's stretches in its
colour, drawn as one path a node, so it is at most six elements at any number of points. With one point a node the ring
is three to six long arcs, each point named in a chip inside the band at the end of its arc (where two points are close
the later chip steps along the band, away from its neighbour, and its tick leans back to its own point; a node that left
or failed keeps a struck chip at its old point). With 100 points the band is a fine weave of all the colours: it is
drawn exactly, as a texture that says the points lie everywhere, and the stretch the closer look magnifies is bracketed
outside the dots. Under hash mod N there is no band, only a neutral track: the dots are a confetti of every colour,
because a remainder has nothing to do with where a hash falls. The ring's middle says what is placed ("5 nodes", "100
points each"; "3 nodes up" with one down; "hash mod 5"). The followed key carries a caret and its name outside the ring.
During a play a hand sweeps the ring once: a moved key leaves its pile as the hand passes its hash.

**The piles** ("WHAT EACH NODE HOLDS", and under it "A pile's height is its share of all traffic"). A column a node, A
to F at fixed places, each a pile of its keys as dots (7 to 9 dots across by width) on a base line in the node's colour,
with its letter under it. A pile's height is the node's load on one scale for every setting: gridlines at 25%, 50% and
(with even traffic) 75% of all traffic, and an ink line at the even share ("even" over "25%"; the gridline's own label
gives way to it when they are close). With even traffic 200 keys are 100%, so a key is half a percent; the fair line
sits at K / N keys. A key that arrived in the last change is hollow and lies on top of the keys that stayed, so every
pile reads "these stayed, these came". **The hot key** is one more mark on its node's pile: a solid block in the
critical tone as tall as its traffic (30%, as much as 86 ordinary keys), with "hot" on it; the scale then counts the 200
keys as 70%. Split, it is ten thin blocks of 3% on the piles its salted keys hash to. So the conversion the lesson asks
of the learner, from keys to load, is drawn: equal piles of keys, and one block no pile can share out. The scale ends at
184 key-heights, which holds every pile of keys at every setting (169 at most) and the hot key on every experiment's
piles; on a fuller pile (two or three nodes left with the hot key) the block is cut at the scale's end under a triangle
and "+12%", the traffic the cut leaves out, and a hot key with no room at all is "hot +30%" over its pile (the row under
the pile gives the node's whole share; 26 px over the scale are kept for these words). A node that is down keeps its
column: a grey base, a critical × and "down"; a node that left keeps it for that change with "left".

Under the piles, a table in the piles' columns, a row a fact: keys; traffic; of ring (the ring only); and, once there is
a last change, in and out ("+46", "−16"). Rows with nothing to say are left out and their room is kept at the table's
foot. On phones the percentages lose their sign to the row's head ("traffic %", "of ring %") so "43.3" fits a 29 px
column. The busiest node's traffic is in the critical ink while the hot key is on.

**The last change** ("LAST CHANGE · E JOINED"; "C WENT DOWN", "C CAME BACK", "E AND F JOINED", "D LEFT"; "NONE YET").
The headline is the model's count, "46 of 200 keys moved" (17 px mono, the count in ink). Before any node joins or
leaves it reads "No node has joined or left" over "Change the nodes, or take the busiest node down, and watch which keys
move."; it never says that no key moved, because a new placement or new points place the keys afresh. Under it, where
they went against what had to move, in sentences computed for the change: "All 46 moved to E: 16 from A, 6 from B, 10
from C and 14 from D." and "An even share for E is 40 (200 / 5)."; under hash mod N "Only 47 of them moved to E; the
other 119 changed places among A, B, C and D, because hash mod 5 places every key again."; a failure with one point
"Only C's 114 keys moved, all to B, the next point clockwise." and "B went from 31 keys to 145."; with 100 points "Only
A's 57 keys moved: 22 to B, 14 to C and 21 to D."; under hash mod N "C held 49 keys, but 161 moved: hash mod 3 places
every key again, so 112 changed places among nodes that stayed."; and "The hot key moved with them, from A to C." when
it did. Then the standing line: "C is the fullest shard with 114 keys; an even share is 50." or, with the hot key, "A is
the busiest shard with 50% of the traffic; an even share is 25%. The hot key alone carries 30%, on A." The block
reserves the most lines any scenario needs at this width, all at its foot.

**A closer look** (the rule, on one key and its neighbours). The rule line follows `user:56`: on the ring "user:56
hashes to 61.91% of the way round. The next point clockwise, at 62.12%, is one of E's, so E holds it. It was on C.";
under hash mod N "user:56 hashes to 2,659,197,755, and 2,659,197,755 mod 5 = 0: the first node, A, holds it. It was on
D." (phones: "user:56: 61.91% round, next point E's (was C's)", "user:56: hash mod 5 = 0, so A (was D)").

- On the ring, with 10 or 100 points a node, the strip is the stretch of ring around the followed key laid flat and
  magnified so that a point's arc is about 20 px wide, and never more than 28% of the ring, so it draws at most 60 keys:
  28% with 10 points and 5.8% with 100 on a wide stage, 22% and 2.2% on a 320 px phone ("A CLOSER LOOK · 5.8% OF THE
  RING AROUND user:56, MAGNIFIED 17×"; the magnification is the strip's own scale over the ring's, computed). The band
  is the arcs in their owners' colours; a tick stands where each arc ends, named with its node where names keep 6 px
  apart; the keys in the window are dots over their hashes, stacked where they would touch, hollow if they moved; the
  followed key has its caret and name, and an arrow walks from it clockwise to the point that owns it (to the strip's
  edge when that point is past it). When E joins, its points stand in the strip as new ticks, the stretch before each
  has turned E's colour, and the keys over those stretches are hollow: the rule at 100 points, readable.
- With one point a node the strip is the whole ring, cut at 0 and laid flat ("THE WHOLE RING, LAID FLAT FROM 0"): three
  to six arcs, each node's named under its longer part with what it holds ("C: 114 keys", "C: 114", "C" as the arc
  narrows), which is the count by owner that arc lengths on a circle only suggest; the followed key alone is drawn over
  it, with its walk to its point.
- Under hash mod N the strip is a table of the 11 keys nearest the followed key by hash (5 on a 320 px phone), the
  followed key's column shaded: `user:`, `hash mod 4`, `node`; after a change `hash mod 4`, `was on`, `hash mod 5`,
  `now on`, the node as a dot in its colour and its letter, hollow where the key moved. Neighbours on the ring have
  unrelated remainders, and a new modulus changes nearly every one: the mechanism of E1 on eleven keys.

**Controls** (outside the stage, as Consistency & Quorums and Latency & Queueing): Placement, a native radio group drawn
as `g-segmented` (Consistent hashing, hash mod N) in `fieldset.group.placement-control`; Points per node, the same (1,
10, 100), disabled under hash mod N with the reason in its legend ("POINTS PER NODE · hash mod N has no ring"); Nodes,
the same (3, 4, 5, 6, each with its letters, "A–C", read out as "A to C"); Conditions, three native checkboxes drawn as
toggles: "A hot key · 30% of the traffic", "Split the hot key · into 10 salted keys" (disabled with "needs the hot
key"), and, full width, "Busiest node down · A would fail: its keys must move" ("C is down: its keys moved" while it
is); the polite notice. A checked control keeps its weight, so nothing re-wraps. Describe sits under the stage, after
the simplifications line.

**Layout.** At container wide the stage takes the left column (620 px at 1280) and the controls, the open question and
the cards the 340 px right column. Narrower, one column: the controls as the stage's first rows, the stage, the open
question, the simplifications line, Describe, the cards. Below wide the notice is read out only. Inside the stage, from
600 px the ring (284 px) sits beside the piles, their feet level; narrower they stack: ring, piles, last change, closer
look. On a phone the ring and the piles, where an answer plays, are 530 px together at 320 px and 630 px at 390 px, so
choosing an answer scrolls the ring's title to the top of the view and both are in it.

**Heights** depend only on the stage's width: every wrapped text reserves the most lines any of the 456 scenarios needs
at that width, the piles always reserve six columns and the whole scale, the table five rows, the strip its tallest
stack. Measured in the mockup over every scenario and every experiment phase at 12 widths (one value a width at each):

| Stage width (px) | 252   | 270   | 300   | 322   | 344 to 360 | 400   | 460 to 520 | 580   | 620 | 700 |
| ---------------- | ----- | ----- | ----- | ----- | ---------- | ----- | ---------- | ----- | --- | --- |
| Stage height     | 1,082 | 1,100 | 1,131 | 1,128 | 1,130      | 1,111 | 1,072      | 1,044 | 733 | 726 |

Below 324 px the ring grows with the stage (it takes the whole width up to 300 px), so the height is a smooth function
of width there and a step function above. So 252 px (a 320 px phone) is 1,082, 322 (390) is 1,128 and 620 (1280) is 733.
`widget-heights.ts` gets the built widget's measured whole heights at rest per host width.

**Motion** (3.5's grammar; WAAPI on transform and opacity; pooled particles, at most 60 live).

- **One clock.** A change of the node set plays on one monotone clock of 2.4 s plus 12 ms a moved key (3 s for E2's 46,
  4.4 s for E1's 166). At 0 the node's column appears, empty (or its base turns grey with the ×); at 12% its points land
  on the ring and in the strip and the arcs that changed owner take their new colour; from 26% to 82% a hand sweeps the
  ring once from 0, and as it passes a moved key's hash that key's dot on the ring takes its new colour and its dot in
  the pile lifts off, flies an arc over the piles for 12% of the clock (295 ms at the least) and lands on top of its new
  pile; the dots above a key that left slide down (FLIP, 240 ms). So exactly the keys that move are the ones in flight,
  each from where it was to where it is going, hash mod N's storm between every pair of piles and the ring's thin stream
  into one (51 keys in flight at the most, over every change: `enum.cjs`). Nothing is drawn for a key before its moment.
  A free play counts in the headline as keys land ("17 of 200 keys moved so far", "Counting each key as it lands.") and
  the table's rows follow the piles.
- **The climax** is the last landing: the pile, or piles, that gained keys get the 400 ms landing ring (stroke only,
  around the whole pile), the arrivals turn hollow together, the headline settles on the count and the story appears.
- **An answer's play** applies the act and plays the change with the numbers hidden (3); E3's act places the points
  afresh, so nothing travels: the band redraws as four arcs (520 ms) and the piles re-form under hidden rows.
- **Stop.** During a free play Replay is Stop; Stop, or any change of a setting, ends the play and draws the new rest
  state at once. The controls stay live during a free play; only an answer's play locks them.
- **Plays pause** by the widget host's visibility (IntersectionObserver on the host, plus `visibilitychange`).
- **Reduced motion:** nothing moves. A change draws its end state at once, which holds every mark and number (the hollow
  keys on the ring, in the strip and on the piles, the in and out rows, the headline and its story), and the story is
  written under the stage and read out: "E joined, and 46 of the 200 keys moved. All 46 moved to E: 16 from A, 6 from B,
  10 from C and 14 from D. An even share for E is 40 (200 / 5)."

## 3. The experiments

Every number is a slot from the model (`enum.cjs` prints them all); answer positions 3, 2, 1, 3, 1. A card sets the
widget up with complete settings, as a new start: whatever the learner changed before leaves no last change; answering
plays its act; the dock holds "your guess" ("Watch the picture: the answer plays out on it.") through the play; the
reveal is read out politely and its regions get a focus outline with the house "Look here" tag.

**E1 "A fifth node, by hash mod N".** Setup hash mod N, 4 nodes; act `set: { nodes: 5 }`, `run: 'move'`. Ask: "The 200
keys sit on 4 nodes, each key on node number hash mod 4. A fifth node, E, joins, so every key is placed by hash mod 5. E
needs 40 keys for an even share. How many keys change node?" Choices (ascending): "About 40: the keys E needs, no more"
/ "About 100: half of them" / **"About 160: four keys in five"**. Reveal: "It moves 166 of the 200 keys, 83%. A key
stays only where its hash leaves the same remainder for 4 and for 5, which is 4 of every 20 hashes, so about 80% move.
Only 47 of them went to E; the other 119 changed places among A, B, C and D, and every move is data copied over the
network. Going from N to N + 1 nodes moves about N / (N + 1) of the data: the more nodes, the worse." Focus: the piles,
the last change.

**E2 "The same node, on a ring".** Setup the ring, 100 points, 4 nodes; act `set: { nodes: 5 }`, `run: 'move'`. Ask:
"The same 200 keys and 4 nodes, now on a consistent-hash ring with 100 points a node: a key belongs to the next point
clockwise of its hash. E joins with 100 points of its own. Which keys move?" Choices: "About 40 to E, and about as many
again among A, B, C and D to even them out" / **"About 40, every one of them to E"** / "Most of them again: a new node
changes where every hash lands". Reveal: "Only 46 keys move, every one of them to E: 16 from A, 6 from B, 10 from C and
14 from D. Each of E's points takes the stretch of ring just before it from the point that owned it, and no other arc
changes, so no key moves between the old nodes. An even share for E is 40 (K / N); it got 46 because 100 points land
close to evenly, not exactly. hash mod N moved 166 for the same change." Focus: the piles, the closer look.

**E3 "One point a node".** Setup the ring, 100 points, 4 nodes; act `set: { points: 1 }`. Ask: "With 100 points a node
the 4 shards hold 43 to 57 keys; an even share is 50. Give each node a single point on the ring instead. How many keys
does the fullest shard hold?" Choices (descending): **"114: more than half of all the keys"** / "75: half as much again
as an even share" / "57: no change, the hash is still uniform". Reveal: "C holds 114 keys, while D holds 11. One point a
node cuts the ring into 4 arcs of random length: C's arc is 54.6% of the ring, so it gets about that share of the keys.
The hash is uniform, but 4 random cuts are not even. With 100 points a node each shard owns 100 short arcs scattered
round the ring, their lengths average out, and the fullest holds 57." Focus: the ring, the piles.

**E4 "The fullest node fails".** Setup the ring, 1 point, 4 nodes; act `set: { down: 1 }`, `run: 'move'`. Ask: "One
point a node. C holds 114 of the 200 keys, and it fails. Where do its keys go?" Choices: "They spread over A, B and D,
about 38 each" / "To its two neighbours on the ring, B and D, about half each" / **"All 114 to B, the next point
clockwise"**. The ring is the question's premise and stays: a learner who has the rule can read the answer off it, and
one who has not cannot. Reveal: "All 114 go to B: with C's point gone, the next point clockwise of every one of its keys
is B's. B goes from 31 keys to 145, 4.7× its load, so it is the likeliest to fail next, and then 145 keys land on the
node after it: a cascade. With 100 points a node C's arcs lie all round the ring, each with a different successor, and
its 43 keys would spread: 18 to A, 12 to B and 13 to D." Focus: the ring, the piles.

**E5 "A hot key".** Setup the ring, 100 points, 4 nodes, the hot key; act `set: { nodes: 6 }`, `run: 'move'`. Ask: "One
key takes 30% of all the traffic, so its shard, A, carries 50% where an even share of 4 nodes is 25%. Add 2 nodes, so an
even share is 16.7%. What does the hot key's shard carry now?" Choices (descending): **"43.3%: hardly less, the hot key
alone is 30%"** / "33.3%: two thirds of it, as its keys thin out" / "16.7%: an even share of 6 nodes". Reveal: "It still
carries 43.3%. Hashing spreads keys, not traffic: one key lives on one shard, so A carries its 30% however many nodes
there are, and only the other keys' 70% thins out. More nodes never take it below 30%. Split the key instead: with a
suffix from 0 to 9 it becomes 10 keys of 3% each, which land on 6 shards here, and the busiest shard carries 21.3%. The
price is that a read of it gathers all 10." Focus: the piles, the last change.

**E6 Challenge "lose the busiest node and stay even".** Setup hash mod N, 4 nodes, the hot key, the busiest node down (C
down: A carries 59.8% and 161 keys moved). Ask: "A hot key takes 30% of the traffic, and the busiest node has failed.
Choose the placement, the points, the nodes and whether to split the hot key so that no shard left carries 30% of the
traffic or more, the failure moves fewer than 50 keys, and the cluster has fewer than 6 nodes." Goal `all`: `busiest`
below 30, `moved` below 50, `nodes` below 6; keep `hot` 1 and `down` 1. Of the 32 settings that keep them, exactly one
passes: the ring, 100 points, 5 nodes, the hot key split (E down, its 46 keys spread over the 4 left, the busiest at
29%; 10 points give 31.6%, 4 nodes 36.3%, 6 nodes pass the first two bounds and fail the third, and hash mod N never
moves fewer than 137). The status is the house checklist (no line over it until met), under "Goal met:" while the goal
holds and "You met it; now:" once the learner moves off it, each line with its state in words: "the busiest shard left
carries 29% of the traffic, needs under 30%: met" / "the failure moved 46 keys, needs fewer than 50: met" / "the cluster
has 5 nodes, needs fewer than 6: met"; at the start "... carries 59.8% of the traffic, needs under 30%: not yet".
Reveal: "A ring of 5 nodes with 100 points each and the hot key split passes: when E fails only its 46 keys move, spread
over the 4 left, and the busiest carries 29%. Unsplit, the hot key's shard alone carries 45.4%; with 10 points a node
the shards are less even and the busiest carries 31.6%; hash mod N would have moved 166 keys. Many points for even
shards and a spread failure, a split for the key no hash can spread, and spare capacity for the node you lose." No
hides; Describe waits until the goal is met ("Describe waits until you meet the goal.").

**One `hiding()` map** (prevention 1) from a question's regions to every surface; each region is named in the spec's own
`hide` list with the phase that hides it, so nothing is inferred from the act:

| Region  | When                    | On the stage                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                             | Elsewhere                                                                                                                                 |
| ------- | ----------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------- |
| `after` | playing (E1 to E5)      | the headline's count is "?" in a dashed box; the story reads "Which keys moved, and where, shows at the reveal."; every table cell of every node up is "?", and so is each arc's count under the whole ring ("C: ? keys"); no key is hollow, on the ring, in the strip or on a pile; the standing line reads "The fullest shard shows at the reveal." ("busiest" with the hot key); the rule line stops at the hash ("...; its node shows at the reveal."), and the remainder table keeps the setup's modulus and nodes; no landing ring | the summary ("... The answer is playing; its counts show at the reveal."), the notice ("The answer is playing on the picture."), Describe |
| ghost   | asking (every question) | no last change: no hollow key, no in or out row, "LAST CHANGE · NONE YET", whatever the learner changed before the card                                                                                                                                                                                                                                                                                                                                                                                                                  | the summary and notice say the setup only                                                                                                 |

The picture of the answer's own play (keys flying, piles growing) is the play; its numbers wait for the reveal. While
any question asks or plays, Replay and the Placement, Points, Nodes and Conditions fieldsets are disabled, the notice
says "Replay and the settings wait for your answer.", and Describe waits ("Describe waits for your answer."). Cards
carry titles only. Nothing on the setup's stage states an answer: E1 and E2 show four piles and no change; E3 shows the
100-point ring; E4's one-point ring is its premise; E5 shows the hot key's 50%.

## 4. Accessibility

- The stage is `role="group"`, `aria-roledescription="visualization"`, named "Sharding: 200 keys placed on nodes by
  their hash"; its SVG has a summary that obeys `hiding()`: "A consistent-hash ring with 100 points a node puts the 200
  keys on 5 nodes: A holds 41, B holds 37, C holds 33, D holds 43 and E holds 46. E joined: 46 of the 200 keys moved."
  (hash mod N: "Placing by hash mod 5 puts ..."; a node down: "... on the 3 nodes left with C down: ..."; the hot key
  adds the standing line).
- Replay is a button ("Replay the last change"; "Replay the last change: none yet", disabled; "Stop the replay" during a
  free play; "Replay the last change, after your answer", disabled, while a question waits). Placement, Points and Nodes
  are native radio groups (one Tab stop each, arrows), the conditions native checkboxes whose second lines are their
  descriptions; the dock is `app-widget-check`, whose checklist lines carry ": met" / ": not yet" in words (the ✓ and ·
  are `aria-hidden`). No mark on the stage is tappable, so there is no tap hint to clear (prevention 11).
- Notices (polite, `aria-atomic`): after a change of the node set, its story ("E joined, and 46 of the 200 keys moved.
  All 46 moved to E: ..."); after any other change, the setting's summary; while a question asks "Replay and the
  settings wait for your answer."; while its answer plays "The answer is playing on the picture."; at a reveal the story
  or summary of the new setting; when the challenge opens, its setting's summary. It is never blank.
- Colour is never alone: a node is a colour and a letter (under its pile, in a chip at its point, under its ticks in the
  strip, beside its dot in the remainder table, in every sentence); moved is hollow and counted in the in and out rows;
  the hot key is a block with "hot" on it and its share in words; down is a grey base, a × and "down"; the even share is
  a line named "even". The six node colours are the app's `--g-kind-lb`, `--g-kind-cache`, `--g-kind-replica`,
  `--g-kind-worker`, `--g-pointer-alt` and `--g-kind-blob` (3:1 or better on the stage in both themes; the builder adds
  them to `theme-contrast.spec.ts` as the widget's series); the hot key is `--g-viz-critical`.
- 44 px targets: Replay, the segments and the toggles.
- **Describe** (a `g-data-table` in a `minmax(0, 1fr)` grid, scrolling inside its own box): the story or summary, the
  standing line and the rule line as sentences, then a row a node: Node, Points, Of the ring, Keys, Traffic, Moved in,
  Moved out ("none" where a node has none, "no change yet" before any; a node down reads "C, down"). Under a 560 px
  stage it is `compact`: Node, Keys, Traffic, In, Out, so five columns fit 320 px without scrolling sideways; at 412,
  1280 and 1440 px the full form fits.

## 5. The prevention list

1. **Giveaways while asking, on every surface.** The one `hiding()` map (3) feeds the stage, the summary, the notice and
   Describe; Replay and every control wait, so no play the learner starts can show an answer; the answer's play keeps
   the hiding until the reveal; a card's setup starts afresh with no last change. The mockup's `noAnswer()` (run by
   `shoot.cjs`) renders every question asking, entered from six earlier node sets, and its answer's play at five
   moments, at 12 widths (660 renders), against each question's answer words (E1: "166 of", "166 keys", "83%", "+47",
   "47 of them", "other 119", "places every key again", "so far"; E2: "46 of", "All 46", "+46", the four sources, "moved
   to E", "E holds it"; E3: "114 keys", "C is the fullest", "54.6%"; E4: "145 keys", "to 145", "+114", "all to B", "B
   holds it", "B is the fullest"; E5: "43.3%", "21.3%"), the false claims (2) and structure: Replay disabled; while
   asking no hollow key, no flight, no sweep hand, no in or out row, and "none yet" as the last change; while playing no
   hollow key, every table cell "?", "down" or empty, a headline that opens on no digit, the hot key's word still on its
   block, and no landing ring. It finds none, and it catches five planted leaks (E1, E3 and E5 played with nothing
   hidden; E2 asked with the ghost of the learner's last change; E4 played with the hiding set for the wrong phase). The
   built component's sweep does the same with motion off and on, sampling the play frame by frame.
2. **False claims anywhere.** No hidden value has a default: hidden reads "?" or "shows at the reveal", never 0 and
   never a stale number. The false-claim rules (NaN, undefined, Infinity, null, "1 keys", "1 nodes", "1 shards", "1
   points", "0 of N keys moved", a number of four digits without its separator) run over every stage of the settings
   sweep and over every page sentence of all 456 scenarios; none. Every sentence is computed for its scenario and held
   to it by rule in `enum.cjs` (1, "Checks"): "All N moved to E" only when every moved key went to a joiner, "every one
   from C" only with one source, "Only C's keys moved" only when exactly its keys did, "the next point clockwise" only
   with one point a node, "A and D are the fullest shards" only on a tie, "one of E's" against "E's" by the points.
   Nothing animated stands for a number: the flights are exactly the model's moved keys (asserted on every render) and
   the count is the model's. The layout assertions on every render: every key drawn once on the ring and once in a pile
   or in flight; a pile's dots are its node's count; the hollow marks are exactly the keys that moved, on the ring and
   on the piles; the headline is the model's count; the in and out rows each add up to it; every pile and block inside
   the pile area; the even line on the scale.
3. **`$index` tracking.** Ring dots, pile dots, strip dots and flights carry the key's index (`k56`, `p56`, `l56`,
   `f56`); a pile's order changes as keys leave and land, so the template tracks by key; columns track by node letter,
   band paths by node.
4. **Labels on lines; markers; rings.** Every stage text has a stage-coloured halo and is placed by a `Draw` that checks
   texts, marks and lines; the ring and its dots are marks (an annulus in 48 sectors, so the ring's corners and middle
   stay free for the followed key's name and the middle's words); the checker also tests every text against every drawn
   dot. The even line's label and the gridlines' labels sit in the gutter left of the piles, where no flight goes; a
   gridline's label gives way to the even label within 17 px. Point names in the strip keep 6 px apart or are left out
   (the tick stays). Flights stay inside the pile area (asserted), which holds no label but "hot" on its block and a
   cut's words over it. The landing ring is stroke only, around a whole pile. The checker flags text on text, a line
   through text (the even line, gridlines, rules, ticks, the bracket, the walk, the sweep hand, the band, bases), text
   on a mark, text on a dot, text under a control, dots on dots, anything off the stage, point names closer than 6 px, a
   text against a focus outline's stroke, and any label or tag with no place: zero over every screenshot and every sweep
   render.
5. **Look-here tags.** House candidates on the outline's edge first (16 px off its corners), then just inside, then two
   inner rows, outside last; the sweep asserts one placed tag for every focus region of every reveal and of the met
   challenge at 12 widths.
6. **Marks before their event.** One monotone clock per play (2); a key's ring dot changes colour and its pile dot lifts
   off only when the hand reaches its hash, it lands a flight later, and it turns hollow only at the climax; the
   joiner's points appear before any arc changes colour; the count in a free play is the number landed.
7. **Visibility and reduced motion.** Plays pause on the widget host's visibility and the page's; Reduced motion draws
   the end state, which holds every number and mark, and writes the story under the stage.
8. **CSS specificity.** Every `fieldset.group` carries zero padding; a control's class only adds to it
   (`fieldset.group.placement-control`); the 320 px shots show the controls above the stage with no overlap.
9. **Words.** The summary, notice, story and standing line are full sentences; no sentence opens on a numeral (checked
   over every sentence: "The 200 keys sit ...", "E joined, and 46 of the 200 keys moved."); plurals by count ("1 point a
   node", "1 shard", "The one key moved"); hashes carry thousands separators ("2,659,197,755"); nothing is spliced from
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
14. **Learner text in HTML** (the notice, the reduced-motion caption, the simplifications line, Describe's sentences,
    the dock's question, choices, checks and reveal) renders through `g-code-text`, so no line parts a number from its
    unit ("46 keys", "hash mod 5", "200 / 5"); every live region holding it is `aria-atomic` (templates.spec enforces
    it). Stage text is laid by `stage-text.ts`'s `wrap` with the same glue as the mockup's (a number with its unit, "of"
    with its number, "hash mod 5", an equation, and what stands in brackets never part).
15. **Element counts** are bounded by the stage, never by the points: the band is one path a node (6 at most, at 600
    points); the strip draws only the arcs in its window, about one every 20 px (at most 39 ticks at 700 px, and at most
    60 keys); the keys are a fixed 200 dots on the ring and 200 on the piles, plus at most 11 hot marks each; flights
    are pooled, at most 60 live (51 at the busiest moment of the heaviest change). The heaviest stage is 690 SVG
    elements (hash mod N, 6 nodes, the hot key split, at 620 px), a number that does not grow with the points. A change
    recomputes one memoized placement (a binary search a key: microseconds) and one diff of 200 owners, so keydown to
    the second frame stays far under 150 ms on a Pixel 7 at 4× CPU, and a play animates transforms and opacity only.
16. **Specs and e2e** read the widget's state only after zoneless Angular has drawn it (web-first assertions, or wait
    for the setting's summary first); the widget's e2e runs on the desktop, Android and WebKit iPhone projects, and on
    the phone projects asserts the ring and the piles are in view during each answer's play and at its reveal.
17. **Marks mean one thing.** Dashed is only the box round a hidden "?" (asserted: no other dashed stroke on any render;
    the focus outline is solid). Hollow is only "moved in the last change". An absent node draws nothing; a node down or
    gone draws a solid grey base. The landing ring and the focus outline are strokes round a whole mark.
18. **On the scale.** Every value an ask or reveal compares is on the drawn scale: the piles' scale holds every pile of
    keys at every setting and every experiment's piles with the hot key (E4's 145, E5's 57 keys under the hot key, the
    challenge's 85 under it); the even share is a line on it. The one mark that can pass the scale, the hot key's block
    on a pile of more than 91 keys, is cut under a triangle with the traffic the cut leaves out written over it, and the
    row under it gives the whole share. There is no ghost of an old value: a pile shows what stayed and what came, and
    what left is the out row's count under the pile it left.
19. **Units and conversions.** The table's shortest percentages move their sign to the row's head ("traffic %"), never
    drop it; the even label keeps its "%". The one conversion the learner must make, from keys to load, is drawn: the
    hot key is a block of its own traffic on the same scale as the keys, and the rule's arithmetic is written out
    ("2,659,197,755 mod 5 = 0").
20. **Layout.** The verdict's and the table's reserved lines collect at their foot (the standing line follows the story
    directly; absent table rows are closed up); a checked segment or toggle keeps its weight; on a phone, choosing an
    answer brings the ring and the piles into view before the play (2, Layout).

## 6. What a learner can say in an interview afterwards

- "With hash mod N a key stays only if its hash gives the same remainder before and after. From four nodes to five that
  is 4 of every 20 hashes, so about 80% of the data moves, between every pair of nodes, although the new node needs only
  a fifth. From N to N + 1 it is N / (N + 1): it gets worse as the cluster grows."
- "Consistent hashing puts nodes and keys on a ring; a key belongs to the next point clockwise. A new node takes only
  the stretches just before its points, so about K / N keys move, all of them to it, and nothing moves between the old
  nodes. A node that leaves hands on exactly its own keys."
- "With one point a node the ring is a few arcs of random length: one node can own half the keys. And when a node dies,
  all of its keys land on the next node clockwise, which may then die too: a cascade."
- "So each node gets many points, 100 or more. Its arcs average out to near an even share, a new node takes a little
  from everyone, and a lost node's keys spread over all the survivors instead of one."
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
  others."
- **Hot keys and resharding** agrees with the widget (a suffix from 0 to 9, 10 keys, read all 10 back) and gains the
  rebalancing cost the widget counts: after "or give it dedicated shards." add "Moving a key means copying its data
  across the network while it serves traffic, so every rebalance is throttled and can take hours: the fewer keys a
  change moves, the sooner the cluster is even again."
- **Secondary indexes and copies**: "each key is also copied to the next few nodes on the ring" becomes "each key is
  also copied to the next few distinct machines clockwise on the ring (with virtual nodes the next points can belong to
  the same machine, so they are skipped)".
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
  marks, the chips' step along the band where two points are close, the piles' metrics by column width (9 dots at 6 px
  from 60 px, 8 at 5.6 from 48, 7 at 4.8 from 40, 7 at 4.4 from 34, else 7 at 3.7), the scale of 184 key-heights with 26
  px over it for a cut's label, the pile order (the keys that stayed by hash, then the arrivals as they landed), the
  table's closed-up rows, the verdict's reserve (the most lines over all 456 scenarios at the width, as two constants a
  width band, held by the words spec), the strip's window (the whole ring with one point a node, else
  `min(0.28, floor(strip / 20) / (5 × points))`, starting 42% of a window before the followed key) and its stacking, the
  remainder table's odd count of columns.
- `ring-layout.ts` (a pure `buildStage(width, scenario, view)` returning marks, as `latency-layout.ts` does),
  `ring-words.ts` (`hiding()`, the change label and story, the standing line, the rule's forms, summary, notices,
  Describe, goal checks), `ring-motion.ts` (the clock, the sweep, the flights' pool, the FLIP of a pile, the climax, the
  phone anchor), the component and its spec, `ring-layout.spec.ts` over every scenario at 252, 322 and 620 px and
  strides of them at nine more widths with play frames, every experiment asking, playing and revealed, and the
  assertions in 5.
- `content.md` (every string of the built widget, both checklist states included) is generated by a browser walk of the
  built widget, as for the other widgets, and goes to content review with the experiments.
