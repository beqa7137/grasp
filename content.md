# Durability widget: every string

Generated from the built widget (`durability`) by a browser walk, and the experiments from the engine build.

## Experiments

### Half the storage

Ask: Three copies on separate disks store 3× and survive any 2 lost copies; with disks failing at 2% a year and 24 h repairs the model gives 9.7 nines. Switch to 6 + 3 erasure coding: 6 data pieces and 3 parity pieces, any 6 of which rebuild the object, stored at 1.5×, half as much. How likely is a loss in a year now?

- (answer) About 110× less likely: a loss now takes 4 failures inside one repair
- About as likely: 3 more pieces to fail cancel the extra parity
- About 3× likelier: 9 disks see 3× as many first failures as 3

Reveal: About 110× less likely: 11.8 nines against 9.7. Nine disks do see 3× as many first failures, 0.18 a year against 0.06 a year, and any 3 of the 8 others can finish the job, 56 ways. But a loss now needs 3 more failures inside one 24 h repair instead of 2, and each is a 1 in 18,000 chance: one more such factor outweighs 3× and 56. Half the storage buys two more nines; the price moves to the repair, which now reads 6 pieces instead of 1.

### A week to repair

Ask: Three copies at 2% a year, each lost copy rebuilt in 24 h: 9.7 nines. A busy cluster throttles its repairs, and each now takes a week, 168 h, 7× longer. How much likelier is a loss in a year?

- 7× likelier: the danger lasts 7× as long
- (answer) 49× likelier: both other copies must fail inside the longer window
- 340× likelier: all three copies spend 7× as long in the window

Reveal: 49× likelier: 8.1 nines against 9.7. A loss needs both other copies to fail before the repair ends, and each one’s chance of failing inside the window grows with the window, from 1 in 18,000 to 1 in 2,600. Two such chances multiply: 7 × 7 is 49. The window enters the loss once for every failure the scheme tolerates, which is why systems rebuild from many disks in parallel and put repairs ahead of other work. The window runs from the failure to full redundancy: a slow failure detector lengthens it just as a slow rebuild does.

### The repair bill

Ask: A 20 TB disk fails. Under three copies its rebuild reads 20 TB: each lost copy is copied from a surviving one. Switch to 10 + 4 erasure coding, which stores 1.4×: any 10 of its 14 pieces rebuild the object. How much does rebuilding the same 20 TB disk read now?

- 20 TB: one piece rebuilds one piece
- 28 TB: 1.4× the disk, like its storage
- (answer) 200 TB: 10 pieces for every lost one

Reveal: 200 TB: a lost piece is decoded, not copied, and decoding takes any 10 of the 13 pieces left. So a 10 + 4 rebuild reads 10× the lost data, and finishing it in 24 h takes 19 Gb/s of reads against 1.9 Gb/s for copies. That is the price of 1.4× storage: repair traffic, and slower reads of a missing piece. Locally repairable codes cut it: Azure’s code splits 12 data pieces into two groups of 6, each with a local parity, and rebuilds a lost data piece from the 6 of its group.

### A bad batch

Ask: 10 + 4 erasure coding at 2% a year with 24 h repairs: 14.7 nines. Then a bad batch of disks starts failing at 10% a year, 5× more, and the strained cluster takes a week, 168 h, to rebuild each one, 7× longer. How many nines are left?

- 13.2: a loss is 35× likelier, 5× the failures in a 7× longer window
- 11.7: about 1,200× likelier, as if two failures had to line up
- (answer) 7.9: the rate and the window count once for every failure a loss needs

Reveal: 7.9 nines: a loss is about 7.4 million times likelier. The failure rate enters 5 times, once for the first failure and once for each of the 4 more a loss needs, and the window enters 4 times, once for each of those: about 3,100 from the rate and 2,400 from the window. The more failures a scheme tolerates, the harder a worse failure rate and a slower repair hit it, though it still keeps the most nines: two copies at these settings keep 3.4. Measure failure rates and repair times in production, and re-run the numbers when they move.

### One rack

Ask: Three copies at 2% and 24 h: 9.7 nines, each copy in its own rack. Now put all three in one rack, and say a rack-wide event that destroys every disk in it (a fire, a power fault, a bad firmware push) strikes a rack once in 1,000 years. How many nines are left?

- (answer) 3.0: one event takes every copy at once
- 7.3: the event must still race a repair
- 9.7: three disks still have to fail

Reveal: 3.0 nines: a loss once in 1,000 years, about 5.6 million times likelier than at 9.7 nines. A rack event needs no repair window to lose the object: it takes all three copies at once, so no small chance multiplies it down. This is why correlated failures, not independent disks, set real losses. Place pieces so no rack or zone holds more than the scheme can lose: if only two copies shared a rack, an event would leave the third racing its repair, 7.3 nines; 6 + 3 across 3 zones, 3 pieces each, survives a zone, with no spare until it returns.

### Challenge: a billion objects

Ask: Your disks fail at 5% a year. Store a billion objects of 1 MB, 1 PB in all, and lose fewer than 1 in 10 years: a 10× margin on 1 a year for what the simple model rounds off. Correlated failures are met by placement, not by margin, so keep pieces in separate racks. Store at most 1.5×, and keep any one disk’s rebuild under 10 Gb/s of reads.


Reveal: 10 + 4 in separate racks, rebuilt in 72 h: 10.8 nines, 1 every 70 years among a billion, at 1.4× storage, 1.4 PB on 70 disks. That is an average: the billion objects share 70 disks, so a loss, when it comes, takes about 170,000 objects at once, about once in 12 million years; limiting which disks share objects trades how often for how many. A rebuild reads 200 TB, 6.2 Gb/s spread over 72 h. Three copies would store 3 PB; 6 + 3 needs 24 h repairs for the margin, and reading 120 TB that fast is 11 Gb/s; a week’s repairs lose it. The design: a wide erasure code, repairs throttled but bounded, pieces in separate racks, and nines quoted only as the model’s, since correlated failures, bugs and deletes are not in them.

## Desktop, Reduced motion

#### default

- Play a repair
- The object, and what is stored
- the object, 1 MB
- stored: 3 × 1 = 3×
- 3 full copies
- On 3 disks, each in its own rack
- a rack each
- free
- c3
- c1
- c2
- →c3
- the rebuild reads 1 copy: 20 TB for a 20 TB disk
- After c3 fails: the repair race
- Detection and rebuild of c3, from its failure at 0
- 0
- 24 h
- 48 h
- 72 h
- 96 h
- 120 h
- 144 h
- 168 h
- rebuilt in 24 h
- none failed
- The 2 others
- c3 is rebuilt on a free disk in 24 h, read from a surviving copy. A loss would need both other
- copies to fail before it ends. Each fails within 24 h with chance 1 in 18,000, so in a typical
- repair none does.
- The yearly chance of losing it, from the model
- Stored
- 3×
- Survives
- any 2
- Nines
- 9.7
- Nines, each step right is 10× less likely
- 0
- 3
- 6
- 9
- 12
- 15
- 18
- 21
- 24
- First failures: 3 copies × 2% a year
- 0.06 a year
- A given other copy fails before the 24 h repair ends
- × 1 in 18,000
- And a second given copy
- × 1 in 18,000
- One choice only: both other copies
- × 1
- 9.7 nines
- Lost in a year: 1 in 5.6 billion
- 1 million
- 1,000
- 1
- 0.001
- 0.000001
- Objects lost a year on average, among a billion
- A billion 1 MB objects, 1 PB, take 3 PB on 150 disks of 20 TB; at 2%, about 3 of them fail a
- year. Each rebuild reads 20 TB: 1.9 Gb/s to finish in 24 h. One disk writes about 2 Gb/s, so a
- 20 TB disk refilled alone takes about a day; a faster repair spreads the lost pieces over many
- disks, each rebuilt in parallel.
- [aria-label] 2 copies
- [aria-label] 3 copies
- [aria-label] 6 + 3 erasure coding
- [aria-label] 10 + 4 erasure coding
- [aria-label] 1% of disks fail a year
- [aria-label] 2% of disks fail a year
- [aria-label] 5% of disks fail a year
- [aria-label] 10% of disks fail a year
- [aria-label] Time to full redundancy: detect and rebuild
- [aria-label] 1 h
- [aria-label] 6 h
- [aria-label] 24 h
- [aria-label] 72 h
- [aria-label] 168 h, a week
- [aria-label] Each piece in its own rack
- [aria-label] Every piece in one rack
- [aria-label] Durability: one object's pieces on their disks, a repair racing further failures, and the model's yearly chance of a loss
- [aria-label] One object stored as 3 copies: 3 full copies, 3× its size, every copy on its own disk in its own rack. Disks fail independently at 2% a year, and a lost copy is detected and rebuilt in 24 h. It survives any 2 lost copies. The model gives 9.7 nines, a yearly loss chance of 1 in 5.6 billion: among a billion such objects, on average 1 every 6 years.
- [aria-label] Play a repair
- [aria-label] Stage a loss: play a loss, staged and named as staged
- Stored as
- 2 copies
- 3 copies
- 6 + 3
- 10 + 4
- Disks failing a year
- 1%
- 2%
- 5%
- 10%
- Repair time
- 1 h
- 6 h
- 24 h
- 72 h
- 168 h
- Placement
- A rack each
- One rack
- Stored as 3 copies, 3× · 9.7 nines, on average 1 every 6 years among a billion
- Stored as 3 copies at 2% a year with 24 h repairs: 9.7 nines, on average 1 every 6 years among a billion objects, at 3× storage.
- The model: disks fail independently at a constant rate, a lost piece is rebuilt in a fixed window, and the object is lost only when more pieces fail inside that window than the scheme tolerates. Real failures come together: a rack, a power event, a bad batch of disks or a software bug can take many pieces at once, which makes real losses far likelier than these nines. And durability is not backup: a delete or a bad overwrite reaches every piece.
- 1 Half the storage
- 1 Half the storage
- 2 A week to repair
- 2 A week to repair
- 3 The repair bill
- 3 The repair bill
- 4 A bad batch
- 4 A bad batch
- 5 One rack
- 5 One rack
- Challenge: a billion objects
- Challenge: a billion objects

#### 2 copies, 1% of disks fail a year, 1 h, Each piece in its own rack

- stored: 2 × 1 = 2×
- 2 full copies
- On 2 disks, each in its own rack
- →c2
- After c2 fails: the repair race
- Detection and rebuild of c2, from its failure at 0
- rebuilt in 1 h
- The other copy
- c2 is rebuilt on a free disk in 1 h, read from a surviving copy, while the rest of the failed disk
- is rebuilt at once, spread over many disks. A loss would need the other copy to fail before it
- ends. Each fails within 1 h with chance 1 in 880,000, so in a typical repair none does.
- 2×
- any 1
- 7.6
- First failures: 2 copies × 1% a year
- 0.02 a year
- A given other copy fails before the 1 h repair ends
- × 1 in 880,000 (was 1 in 37,000)
- One choice only: the other copy
- 7.6 nines
- before 6.3
- 24× less likely
- Lost in a year: 1 in 44 million
- A billion 1 MB objects, 1 PB, take 2 PB on 100 disks of 20 TB; at 1%, about 1 of them fail a
- year. Each rebuild reads 20 TB: 44 Gb/s to finish in 1 h. One disk writes about 2 Gb/s, so a
- disks, each rebuilt in parallel. Before this change: 6.3 nines.
- [aria-label] One object stored as 2 copies: 2 full copies, 2× its size, every copy on its own disk in its own rack. Disks fail independently at 1% a year, and a lost copy is detected and rebuilt in 1 h. It survives any 1 lost copy. The model gives 7.6 nines, a yearly loss chance of 1 in 44 million: among a billion such objects, on average 23 a year.
- Stored as 2 copies, 2× · 7.6 nines, on average 23 a year among a billion
- Stored as 2 copies at 1% a year with 1 h repairs: 7.6 nines, on average 23 a year among a billion objects, at 2× storage.

#### 2 copies: Play 1

- Repairing
- repair 1 h
- c2 fails, and it is being rebuilt on a free disk, read from a surviving copy, while the rest of the
- failed disk is rebuilt at once, spread over many disks. A loss would need the other copy to fail
- before it ends. Each fails within 1 h with chance 1 in 880,000, so in a typical repair none
- does.
- …
- [aria-label] Next moment, 2 of 3
- c2 fails, and it is being rebuilt on a free disk, read from a surviving copy, while the rest of the failed disk is rebuilt at once, spread over many disks. A loss would need the other copy to fail before it ends. Each fails within 1 h with chance 1 in 880,000, so in a typical repair none does.

#### 2 copies: Play 2

- [aria-label] Next moment, 3 of 3

#### 2 copies: Play 3

- c2 is rebuilt on a free disk in 1 h, read from a surviving copy, while the rest of the failed disk is rebuilt at once, spread over many disks. A loss would need the other copy to fail before it ends. Each fails within 1 h with chance 1 in 880,000, so in a typical repair none does.

#### 2 copies: Stage a loss 1

- Staging a loss
- STAGED, NOT SAMPLED
- After c2 fails: the race, zoomed to its window
- 1.5 h
- Staged, not sampled: c2 fails, and its repair starts.
- Staged, not sampled: c2 fails, and its repair starts.

#### 2 copies: Stage a loss 2

- nothing is left to rebuild from
- stopped: too few left
- lost
- Staged, not sampled: c2 fails, and before its 1 h repair ends c1 fails too. No copy is left: the
- object is lost. A first failure leads here about once in 880,000 times.
- Staged, not sampled: c2 fails, and before its 1 h repair ends c1 fails too. No copy is left: the object is lost. A first failure leads here about once in 880,000 times.

#### 6 + 3 erasure coding, 5% of disks fail a year, 72 h, Every piece in one rack

- stored: 9 × 1/6 = 1.5×
- 6 data pieces
- 3 parity pieces
- On 9 disks, all in one rack
- one rack
- d3
- d1
- d2
- d4
- d5
- d6
- p1
- p2
- p3
- →d3
- the rebuild reads 6 pieces: 120 TB for a 20 TB disk
- After d3 fails: the repair race
- Detection and rebuild of d3, from its failure at 0
- rebuilt in 72 h
- The 8 others
- d3 is rebuilt on a free disk in 72 h, read from 6 of the others. A loss would need 3 of the 8
- others to fail before it ends. Each fails within 72 h with chance 1 in 2,400, so in a typical
- repair none does. All 9 share one rack: a rack event would take them at once.
- 1.5×
- any 3
- 3.0
- First failures: 9 pieces × 5% a year
- 0.45 a year
- A given other piece fails before the 72 h repair ends
- × 1 in 2,400
- And a second given piece
- × 1 in 2,400
- And a third given piece
- × 1 in 2,400
- Any 3 of the 8 others will do
- × 56
- 3.0 nines
- before 8.8
- Lost in a year: 1 in 1,000, set by the rack event (assumed), 570,000× likelier
- A billion 1 MB objects, 1 PB, take 1.5 PB on 75 disks of 20 TB; at 5%, about 3.8 of them fail a
- year. Each rebuild reads 120 TB: 3.7 Gb/s to finish in 72 h. One disk writes about 2 Gb/s, so a
- disks, each rebuilt in parallel. Before this change: 8.8 nines.
- [aria-label] One object stored as 6 + 3 erasure coding: 9 pieces, 6 of data and 3 of parity, each a sixth of its size: 1.5× in all, every piece on its own disk, all in one rack. Disks fail independently at 5% a year, and a lost piece is detected and rebuilt in 72 h. It survives any 3 lost pieces. The model gives 3.0 nines, a yearly loss chance of 1 in 1,000: among a billion such objects, on average 1 million a year.
- Stored as 6 + 3, 1.5× · 3.0 nines, on average 1 million a year among a billion
- Stored as 6 + 3 erasure coding at 5% a year with 72 h repairs, all in one rack: 3.0 nines, on average 1 million a year among a billion objects, at 1.5× storage.
- The model: disks fail independently at a constant rate, a lost piece is rebuilt in a fixed window, and the object is lost only when more pieces fail inside that window than the scheme tolerates. Real failures come together: a rack, a power event, a bad batch of disks or a software bug can take many pieces at once, which makes real losses far likelier than these nines. And durability is not backup: a delete or a bad overwrite reaches every piece. Here every piece shares one rack, and a rack event, assumed once in 1,000 years, destroys them all.

#### 6 + 3 erasure coding: Play 1

- repair 72 h
- d3 fails, and it is being rebuilt on a free disk, read from 6 of the others. A loss would need 3
- of the 8 others to fail before it ends. Each fails within 72 h with chance 1 in 2,400, so in a
- typical repair none does. All 9 share one rack: a rack event would take them at once.
- d3 fails, and it is being rebuilt on a free disk, read from 6 of the others. A loss would need 3 of the 8 others to fail before it ends. Each fails within 72 h with chance 1 in 2,400, so in a typical repair none does. All 9 share one rack: a rack event would take them at once.

#### 6 + 3 erasure coding: Play 3

- d3 is rebuilt on a free disk in 72 h, read from 6 of the others. A loss would need 3 of the 8 others to fail before it ends. Each fails within 72 h with chance 1 in 2,400, so in a typical repair none does. All 9 share one rack: a rack event would take them at once.

#### 6 + 3 erasure coding: Stage a loss 1

- After the rack event
- No repair: the rack took every piece at 0
- all 8 lost at 0
- The 8 others, in the same event
- Staged, not sampled: a rack event destroys the one rack and every piece in it at once, before
- any repair can start, so nothing is left to rebuild from. A rack event is assumed here once in
- 1,000 years.
- Staged, not sampled: a rack event destroys the one rack and every piece in it at once, before any repair can start, so nothing is left to rebuild from. A rack event is assumed here once in 1,000 years.

#### 10 + 4 erasure coding, 10% of disks fail a year, 168 h, a week, Each piece in its own rack

- stored: 14 × 1/10 = 1.4×
- 10 data pieces
- 4 parity
- On 14 disks, all in one rack
- d7
- d8
- d9
- d10
- p4
- the rebuild reads 10 pieces: 200 TB for a 20 TB disk
- rebuilt in 168 h
- The 13 others
- d3 is rebuilt on a free disk in 168 h, read from 10 of the others. A loss would need 4 of the 13
- others to fail before it ends. Each fails within 168 h with chance 1 in 520, so in a typical repair
- none does. All 14 share one rack: a rack event would take them at once.
- 1.4×
- any 4
- First failures: 14 pieces × 10% a year
- 1.4 a year
- A given other piece fails before the 168 h repair ends
- × 1 in 520 (was 1 in 1,200)
- × 1 in 520 (was 1 in 1,200)
- × 1 in 520 (was 1 in 1,200)
- And a fourth given piece
- × 1 in 520 (was 1 in 1,200)
- Any 4 of the 13 others will do
- × 715
- Lost in a year: 1 in 1,000, set by the rack event (assumed)
- A billion 1 MB objects, 1 PB, take 1.4 PB on 70 disks of 20 TB; at 10%, about 7 of them fail a
- year. Each rebuild reads 200 TB: 2.6 Gb/s to finish in 168 h. One disk writes about 2 Gb/s, so
- a 20 TB disk refilled alone takes about a day; a faster repair spreads the lost pieces over
- many disks, each rebuilt in parallel. Before this change: 3.0 nines.
- [aria-label] One object stored as 10 + 4 erasure coding: 14 pieces, 10 of data and 4 of parity, each a tenth of its size: 1.4× in all, every piece on its own disk, all in one rack. Disks fail independently at 10% a year, and a lost piece is detected and rebuilt in 168 h. It survives any 4 lost pieces. The model gives 3.0 nines, a yearly loss chance of 1 in 1,000: among a billion such objects, on average 1 million a year.
- Stored as 10 + 4, 1.4× · 3.0 nines, on average 1 million a year among a billion
- Stored as 10 + 4 erasure coding at 10% a year with 168 h repairs, all in one rack: 3.0 nines, on average 1 million a year among a billion objects, at 1.4× storage.

#### 10 + 4 erasure coding: Play 1

- On 14 disks, each in its own rack
- repair 168 h
- d3 fails, and it is being rebuilt on a free disk, read from 10 of the others. A loss would need 4
- of the 13 others to fail before it ends. Each fails within 168 h with chance 1 in 520, so in a
- typical repair none does.
- [aria-label] One object stored as 10 + 4 erasure coding: 14 pieces, 10 of data and 4 of parity, each a tenth of its size: 1.4× in all, every piece on its own disk in its own rack. Disks fail independently at 10% a year, and a lost piece is detected and rebuilt in 168 h. It survives any 4 lost pieces. The model gives 7.9 nines, a yearly loss chance of 1 in 75 million: among a billion such objects, on average 13 a year.
- Stored as 10 + 4, 1.4× · 7.9 nines, on average 13 a year among a billion
- d3 fails, and it is being rebuilt on a free disk, read from 10 of the others. A loss would need 4 of the 13 others to fail before it ends. Each fails within 168 h with chance 1 in 520, so in a typical repair none does.

#### 10 + 4 erasure coding: Play 2

- × 1 in 520
- × 1 in 520

#### 10 + 4 erasure coding: Play 3

- none does.
- 7.9
- 7.9 nines
- before 3.0
- 75,000× less likely
- Lost in a year: 1 in 75 million
- d3 is rebuilt on a free disk in 168 h, read from 10 of the others. A loss would need 4 of the 13 others to fail before it ends. Each fails within 168 h with chance 1 in 520, so in a typical repair none does.

#### 10 + 4 erasure coding: Stage a loss 1

- Staged, not sampled: d3 fails, and its repair starts.
- Staged, not sampled: d3 fails, and its repair starts.

#### 10 + 4 erasure coding: Stage a loss 2

- Staged, not sampled: d3 fails, and its repair starts. Then d2, d6 and d10 fail too.
- Staged, not sampled: d3 fails, and its repair starts. Then d2, d6 and d10 fail too.

#### 10 + 4 erasure coding: Stage a loss 3

- Staged, not sampled: d3 fails, and before its 168 h repair ends d2, d6, d10 and p3 fail too.
- Only 9 pieces are left, and any rebuild needs 10: the object is lost. A first failure leads here
- about once in 100 million times.
- Staged, not sampled: d3 fails, and before its 168 h repair ends d2, d6, d10 and p3 fail too. Only 9 pieces are left, and any rebuild needs 10: the object is lost. A first failure leads here about once in 100 million times.

#### 3 copies, 2% of disks fail a year, 24 h, Every piece in one rack

- × 1 in 18,000 (was 1 in 2,600)
- × 1 in 18,000 (was 1 in 2,600)
- before 8.1
- 49× less likely
- disks, each rebuilt in parallel. Before this change: 8.1 nines.

#### 3 copies: Play 1

- On 3 disks, all in one rack
- repair 24 h
- c3 fails, and it is being rebuilt on a free disk, read from a surviving copy. A loss would need
- both other copies to fail before it ends. Each fails within 24 h with chance 1 in 18,000, so in a
- typical repair none does. All 3 share one rack: a rack event would take them at once.
- disks, each rebuilt in parallel. Before this change: 9.7 nines.
- [aria-label] One object stored as 3 copies: 3 full copies, 3× its size, every copy on its own disk, all in one rack. Disks fail independently at 2% a year, and a lost copy is detected and rebuilt in 24 h. It survives any 2 lost copies. The model gives 3.0 nines, a yearly loss chance of 1 in 1,000: among a billion such objects, on average 1 million a year.
- Stored as 3 copies, 3× · 3.0 nines, on average 1 million a year among a billion
- c3 fails, and it is being rebuilt on a free disk, read from a surviving copy. A loss would need both other copies to fail before it ends. Each fails within 24 h with chance 1 in 18,000, so in a typical repair none does. All 3 share one rack: a rack event would take them at once.

#### 3 copies: Play 3

- repair none does. All 3 share one rack: a rack event would take them at once.
- before 9.7
- Lost in a year: 1 in 1,000, set by the rack event (assumed), 5.6 million times likelier
- c3 is rebuilt on a free disk in 24 h, read from a surviving copy. A loss would need both other copies to fail before it ends. Each fails within 24 h with chance 1 in 18,000, so in a typical repair none does. All 3 share one rack: a rack event would take them at once.

#### 3 copies: Stage a loss 1

- c1 and c2 lost at 0
- The 2 others, in the same event
- Staged, not sampled: a rack event destroys the one rack and every copy in it at once, before
- Staged, not sampled: a rack event destroys the one rack and every copy in it at once, before any repair can start, so nothing is left to rebuild from. A rack event is assumed here once in 1,000 years.

#### half asking

- [aria-label] The model's steps to the yearly loss
- One object stored as 3 copies: 3 full copies, 3× its size, every copy on its own disk, all in one rack. Disks fail independently at 2% a year, and a lost copy is detected and rebuilt in 24 h. It survives any 2 lost copies. The model gives 3.0 nines, a yearly loss chance of 1 in 1,000: among a billion such objects, on average 1 million a year.
- c3 is rebuilt on a free disk in 24 h, read from a surviving copy. A loss would need both other copies to fail before it ends. Each fails within 24 h with chance 1 in 18,000, so in a typical repair none does. All 3 share one rack: a rack event would take them at once. A billion 1 MB objects, 1 PB, take 3 PB on 150 disks of 20 TB; at 2%, about 3 of them fail a year. Each rebuild reads 20 TB: 1.9 Gb/s to finish in 24 h. One disk writes about 2 Gb/s, so a 20 TB disk refilled alone takes about a day; a faster repair spreads the lost pieces over many disks, each rebuilt in parallel. For copies the steps are the model exactly: a loss needs every other copy.
- Step
- Factor
- Chance a year
- First failures: 3 × 2%
- 1.2
- Another fails within 24 h
- 1 in 300,000
- 5.5
- And a second
- 1 in 5.6 billion
- One choice only
- 1 in 5.6 billion
- Or a rack event (assumed)
- once in 1,000 years
- 0.1% a year
- Lost in a year
- the exact model
- 1 in 1,000

#### half revealed

- On 9 disks, each in its own rack
- d3 is rebuilt on a free disk in 24 h, read from 6 of the others. A loss would need 3 of the 8
- others to fail before it ends. Each fails within 24 h with chance 1 in 18,000, so in a typical
- 11.8
- First failures: 9 pieces × 2% a year
- 0.18 a year (was 0.06 a year)
- A given other piece fails before the 24 h repair ends
- 11.8 nines
- 110× less likely
- Lost in a year: 1 in 600 billion
- A billion 1 MB objects, 1 PB, take 1.5 PB on 75 disks of 20 TB; at 2%, about 1.5 of them fail a
- year. Each rebuild reads 120 TB: 11 Gb/s to finish in 24 h. One disk writes about 2 Gb/s, so a
- Look here
- Look here
- [aria-label] One object stored as 6 + 3 erasure coding: 9 pieces, 6 of data and 3 of parity, each a sixth of its size: 1.5× in all, every piece on its own disk in its own rack. Disks fail independently at 2% a year, and a lost piece is detected and rebuilt in 24 h. It survives any 3 lost pieces. The model gives 11.8 nines, a yearly loss chance of 1 in 600 billion: among a billion such objects, on average 1 every 600 years.
- [aria-label] Experiment: Half the storage
- [aria-label] Three copies on separate disks store 3× and survive any 2 lost copies; with disks failing at 2% a year and 24 h repairs the model gives 9.7 nines. Switch to 6 + 3 erasure coding: 6 data pieces and 3 parity pieces, any 6 of which rebuild the object, stored at 1.5×, half as much. How likely is a loss in a year now?
- [aria-label] correct answer
- [aria-label] your answer, wrong
- [aria-label] done
- Stored as 6 + 3, 1.5× · 11.8 nines, on average 1 every 600 years among a billion
- Stored as 6 + 3 erasure coding at 2% a year with 24 h repairs: 11.8 nines, on average 1 every 600 years among a billion objects, at 1.5× storage.
- Three copies on separate disks store 3× and survive any 2 lost copies; with disks failing at 2% a year and 24 h repairs the model gives 9.7 nines. Switch to 6 + 3 erasure coding: 6 data pieces and 3 parity pieces, any 6 of which rebuild the object, stored at 1.5×, half as much. How likely is a loss in a year now?
- About 110× less likely: a loss now takes 4 failures inside one repair
- About as likely: 3 more pieces to fail cancel the extra parity
- About 3× likelier: 9 disks see 3× as many first failures as 3
- About 110× less likely: 11.8 nines against 9.7. Nine disks do see 3× as many first failures, 0.18 a year against 0.06 a year, and any 3 of the 8 others can finish the job, 56 ways. But a loss now needs 3 more failures inside one 24 h repair instead of 2, and each is a 1 in 18,000 chance: one more such factor outweighs 3× and 56. Half the storage buys two more nines; the price moves to the repair, which now reads 6 pieces instead of 1.

#### window revealed

- c3 is rebuilt on a free disk in 168 h, read from a surviving copy. A loss would need both other
- copies to fail before it ends. Each fails within 168 h with chance 1 in 2,600, so in a typical
- 8.1
- A given other copy fails before the 168 h repair ends
- × 1 in 2,600 (was 1 in 18,000)
- × 1 in 2,600 (was 1 in 18,000)
- 8.1 nines
- 49× likelier
- Lost in a year: 1 in 110 million
- year. Each rebuild reads 20 TB: 0.3 Gb/s to finish in 168 h. One disk writes about 2 Gb/s, so a
- [aria-label] One object stored as 3 copies: 3 full copies, 3× its size, every copy on its own disk in its own rack. Disks fail independently at 2% a year, and a lost copy is detected and rebuilt in 168 h. It survives any 2 lost copies. The model gives 8.1 nines, a yearly loss chance of 1 in 110 million: among a billion such objects, on average 9 a year.
- [aria-label] Experiment: A week to repair
- [aria-label] Three copies at 2% a year, each lost copy rebuilt in 24 h: 9.7 nines. A busy cluster throttles its repairs, and each now takes a week, 168 h, 7× longer. How much likelier is a loss in a year?
- Stored as 3 copies, 3× · 8.1 nines, on average 9 a year among a billion
- Stored as 3 copies at 2% a year with 168 h repairs: 8.1 nines, on average 9 a year among a billion objects, at 3× storage.
- Three copies at 2% a year, each lost copy rebuilt in 24 h: 9.7 nines. A busy cluster throttles its repairs, and each now takes a week, 168 h, 7× longer. How much likelier is a loss in a year?
- 7× likelier: the danger lasts 7× as long
- 49× likelier: both other copies must fail inside the longer window
- 340× likelier: all three copies spend 7× as long in the window
- 49× likelier: 8.1 nines against 9.7. A loss needs both other copies to fail before the repair ends, and each one’s chance of failing inside the window grows with the window, from 1 in 18,000 to 1 in 2,600. Two such chances multiply: 7 × 7 is 49. The window enters the loss once for every failure the scheme tolerates, which is why systems rebuild from many disks in parallel and put repairs ahead of other work. The window runs from the failure to full redundancy: a slow failure detector lengthens it just as a slow rebuild does.

#### reads revealed

- d3 is rebuilt on a free disk in 24 h, read from 10 of the others. A loss would need 4 of the 13
- 14.7
- First failures: 14 pieces × 2% a year
- 0.28 a year (was 0.06 a year)
- 14.7 nines
- 100,000× less likely
- Lost in a year: 1 in 550 trillion
- A billion 1 MB objects, 1 PB, take 1.4 PB on 70 disks of 20 TB; at 2%, about 1.4 of them fail a
- year. Each rebuild reads 200 TB: 19 Gb/s to finish in 24 h. One disk writes about 2 Gb/s, so a
- [aria-label] One object stored as 10 + 4 erasure coding: 14 pieces, 10 of data and 4 of parity, each a tenth of its size: 1.4× in all, every piece on its own disk in its own rack. Disks fail independently at 2% a year, and a lost piece is detected and rebuilt in 24 h. It survives any 4 lost pieces. The model gives 14.7 nines, a yearly loss chance of 1 in 550 trillion: among a billion such objects, on average 1 every 550,000 years.
- [aria-label] Experiment: The repair bill
- [aria-label] A 20 TB disk fails. Under three copies its rebuild reads 20 TB: each lost copy is copied from a surviving one. Switch to 10 + 4 erasure coding, which stores 1.4×: any 10 of its 14 pieces rebuild the object. How much does rebuilding the same 20 TB disk read now?
- Stored as 10 + 4, 1.4× · 14.7 nines, on average 1 every 550,000 years among a billion
- Stored as 10 + 4 erasure coding at 2% a year with 24 h repairs: 14.7 nines, on average 1 every 550,000 years among a billion objects, at 1.4× storage.
- A 20 TB disk fails. Under three copies its rebuild reads 20 TB: each lost copy is copied from a surviving one. Switch to 10 + 4 erasure coding, which stores 1.4×: any 10 of its 14 pieces rebuild the object. How much does rebuilding the same 20 TB disk read now?
- 20 TB: one piece rebuilds one piece
- 28 TB: 1.4× the disk, like its storage
- 200 TB: 10 pieces for every lost one
- 200 TB: a lost piece is decoded, not copied, and decoding takes any 10 of the 13 pieces left. So a 10 + 4 rebuild reads 10× the lost data, and finishing it in 24 h takes 19 Gb/s of reads against 1.9 Gb/s for copies. That is the price of 1.4× storage: repair traffic, and slower reads of a missing piece. Locally repairable codes cut it: Azure’s code splits 12 data pieces into two groups of 6, each with a local parity, and rebuilds a lost data piece from the 6 of its group.

#### batch asking

- others to fail before it ends. The chance of that shows after your answer.
- The steps show after your answer
- [aria-label] Play a repair, after your answer
- [aria-label] Stage a loss, after your answer
- [aria-label] Experiment: A bad batch
- Play, Stage a loss and the settings wait for your answer.
- Describe waits for your answer.
- 13.2: a loss is 35× likelier, 5× the failures in a 7× longer window
- 11.7: about 1,200× likelier, as if two failures had to line up
- 7.9: the rate and the window count once for every failure a loss needs

#### batch revealed

- 1.4 a year (was 0.28 a year)
- × 1 in 520 (was 1 in 18,000)
- × 1 in 520 (was 1 in 18,000)
- × 1 in 520 (was 1 in 18,000)
- × 1 in 520 (was 1 in 18,000)
- before 14.7
- 7.4 million times likelier
- many disks, each rebuilt in parallel. Before this change: 14.7 nines.
- [aria-label] 10 + 4 erasure coding at 2% a year with 24 h repairs: 14.7 nines. Then a bad batch of disks starts failing at 10% a year, 5× more, and the strained cluster takes a week, 168 h, to rebuild each one, 7× longer. How many nines are left?
- Stored as 10 + 4 erasure coding at 10% a year with 168 h repairs: 7.9 nines, on average 13 a year among a billion objects, at 1.4× storage.
- 10 + 4 erasure coding at 2% a year with 24 h repairs: 14.7 nines. Then a bad batch of disks starts failing at 10% a year, 5× more, and the strained cluster takes a week, 168 h, to rebuild each one, 7× longer. How many nines are left?
- 7.9 nines: a loss is about 7.4 million times likelier. The failure rate enters 5 times, once for the first failure and once for each of the 4 more a loss needs, and the window enters 4 times, once for each of those: about 3,100 from the rate and 2,400 from the window. The more failures a scheme tolerates, the harder a worse failure rate and a slower repair hit it, though it still keeps the most nines: two copies at these settings keep 3.4. Measure failure rates and repair times in production, and re-run the numbers when they move.

#### rack revealed

- [aria-label] Experiment: One rack
- [aria-label] Three copies at 2% and 24 h: 9.7 nines, each copy in its own rack. Now put all three in one rack, and say a rack-wide event that destroys every disk in it (a fire, a power fault, a bad firmware push) strikes a rack once in 1,000 years. How many nines are left?
- Stored as 3 copies at 2% a year with 24 h repairs, all in one rack: 3.0 nines, on average 1 million a year among a billion objects, at 3× storage.
- Three copies at 2% and 24 h: 9.7 nines, each copy in its own rack. Now put all three in one rack, and say a rack-wide event that destroys every disk in it (a fire, a power fault, a bad firmware push) strikes a rack once in 1,000 years. How many nines are left?
- 3.0: one event takes every copy at once
- 7.3: the event must still race a repair
- 9.7: three disks still have to fail
- 3.0 nines: a loss once in 1,000 years, about 5.6 million times likelier than at 9.7 nines. A rack event needs no repair window to lose the object: it takes all three copies at once, so no small chance multiplies it down. This is why correlated failures, not independent disks, set real losses. Place pieces so no rack or zone holds more than the scheme can lose: if only two copies shared a rack, an event would leave the third racing its repair, 7.3 nines; 6 + 3 across 3 zones, 3 pieces each, survives a zone, with no spare until it returns.

#### billion asking

- copies to fail before it ends. Each fails within 24 h with chance 1 in 7,300, so in a typical
- 8.6
- First failures: 3 copies × 5% a year
- 0.15 a year
- × 1 in 7,300
- × 1 in 7,300
- 8.6 nines
- goal: 10 nines
- Lost in a year: 1 in 360 million
- A billion 1 MB objects, 1 PB, take 3 PB on 150 disks of 20 TB; at 5%, about 7.5 of them fail a
- [aria-label] One object stored as 3 copies: 3 full copies, 3× its size, every copy on its own disk in its own rack. Disks fail independently at 5% a year, and a lost copy is detected and rebuilt in 24 h. It survives any 2 lost copies. The model gives 8.6 nines, a yearly loss chance of 1 in 360 million: among a billion such objects, on average 3 a year.
- [aria-label] Experiment: Challenge: a billion objects
- Disks failing a year · the goal keeps 5%
- Stored as 3 copies, 3× · 8.6 nines, on average 3 a year among a billion
- Stored as 3 copies at 5% a year with 24 h repairs: 8.6 nines, on average 3 a year among a billion objects, at 3× storage.
- Describe waits until you meet the goal.
- Your disks fail at 5% a year. Store a billion objects of 1 MB, 1 PB in all, and lose fewer than 1 in 10 years: a 10× margin on 1 a year for what the simple model rounds off. Correlated failures are met by placement, not by margin, so keep pieces in separate racks. Store at most 1.5×, and keep any one disk’s rebuild under 10 Gb/s of reads.
- ·on average 3 a year among a billion, fewer than 1 in 10 years: not yet
- ·stored at 3×, at most 1.5×: not yet
- ✓a rebuild reads 1.9 Gb/s, under 10 Gb/s: met

#### billion met

- at most 1.5×
- d3 is rebuilt on a free disk in 72 h, read from 10 of the others. A loss would need 4 of the 13
- 10.8
- First failures: 14 pieces × 5% a year
- 0.7 a year (was 0.15 a year)
- 10.8 nines
- before 8.6
- 200× less likely
- Lost in a year: 1 in 70 billion · goal: 10 nines
- A billion 1 MB objects, 1 PB, take 1.4 PB on 70 disks of 20 TB; at 5%, about 3.5 of them fail a
- year. Each rebuild reads 200 TB: 6.2 Gb/s to finish in 72 h. One disk writes about 2 Gb/s, so a
- disks, each rebuilt in parallel. Before this change: 8.6 nines.
- [aria-label] One object stored as 10 + 4 erasure coding: 14 pieces, 10 of data and 4 of parity, each a tenth of its size: 1.4× in all, every piece on its own disk in its own rack. Disks fail independently at 5% a year, and a lost piece is detected and rebuilt in 72 h. It survives any 4 lost pieces. The model gives 10.8 nines, a yearly loss chance of 1 in 70 billion: among a billion such objects, on average 1 every 70 years.
- Stored as 10 + 4, 1.4× · 10.8 nines, on average 1 every 70 years among a billion
- Stored as 10 + 4 erasure coding at 5% a year with 72 h repairs: 10.8 nines, on average 1 every 70 years among a billion objects, at 1.4× storage.
- Goal met:
- ✓on average 1 every 70 years among a billion, fewer than 1 in 10 years: met
- ✓stored at 1.4×, at most 1.5×: met
- ✓a rebuild reads 6.2 Gb/s, under 10 Gb/s: met
- 10 + 4 in separate racks, rebuilt in 72 h: 10.8 nines, 1 every 70 years among a billion, at 1.4× storage, 1.4 PB on 70 disks. That is an average: the billion objects share 70 disks, so a loss, when it comes, takes about 170,000 objects at once, about once in 12 million years; limiting which disks share objects trades how often for how many. A rebuild reads 200 TB, 6.2 Gb/s spread over 72 h. Three copies would store 3 PB; 6 + 3 needs 24 h repairs for the margin, and reading 120 TB that fast is 11 Gb/s; a week’s repairs lose it. The design: a wide erasure code, repairs throttled but bounded, pieces in separate racks, and nines quoted only as the model’s, since correlated failures, bugs and deletes are not in them.

#### billion met, then moved

- others to fail before it ends. Each fails within 168 h with chance 1 in 1,000, so in a typical
- 9.4
- × 1 in 1,000
- × 1 in 1,000
- × 1 in 1,000
- × 1 in 1,000
- 9.4 nines
- Lost in a year: 1 in 2.4 billion (before 1 in 360 million)
- many disks, each rebuilt in parallel. Before this change: 8.6 nines.
- [aria-label] One object stored as 10 + 4 erasure coding: 14 pieces, 10 of data and 4 of parity, each a tenth of its size: 1.4× in all, every piece on its own disk in its own rack. Disks fail independently at 5% a year, and a lost piece is detected and rebuilt in 168 h. It survives any 4 lost pieces. The model gives 9.4 nines, a yearly loss chance of 1 in 2.4 billion: among a billion such objects, on average 1 every 2 years.
- Stored as 10 + 4, 1.4× · 9.4 nines, on average 1 every 2 years among a billion
- Stored as 10 + 4 erasure coding at 5% a year with 168 h repairs: 9.4 nines, on average 1 every 2 years among a billion objects, at 1.4× storage.
- You met it; now:
- ·on average 1 every 2 years among a billion, fewer than 1 in 10 years: not yet
- ✓a rebuild reads 2.6 Gb/s, under 10 Gb/s: met

## Desktop, with motion

#### 2 copies, 1% of disks fail a year, 1 h, Each piece in its own rack

- c2 is rebuilt on a free disk in 24 h, read from a surviving copy. A loss would need the other
- copy to fail before it ends. Each fails within 24 h with chance 1 in 37,000, so in a typical
- 6.3
- 0.02 a year (was 0.04 a year)
- × 1 in 37,000 (was 1 in 18,000)
- 6.3 nines
- Lost in a year: 1 in 1.8 million (before 1 in 460,000)
- disks, each rebuilt in parallel. Before this change: 5.7 nines.
- [aria-label] One object stored as 2 copies: 2 full copies, 2× its size, every copy on its own disk in its own rack. Disks fail independently at 1% a year, and a lost copy is detected and rebuilt in 24 h. It survives any 1 lost copy. The model gives 6.3 nines, a yearly loss chance of 1 in 1.8 million: among a billion such objects, on average 550 a year.
- Stored as 2 copies, 2× · 6.3 nines, on average 550 a year among a billion
- Stored as 2 copies at 1% a year with 24 h repairs: 6.3 nines, on average 550 a year among a billion objects, at 2× storage.

#### 2 copies: Play 1

- [aria-label] Stop

#### 6 + 3 erasure coding, 5% of disks fail a year, 72 h, Every piece in one rack

- 8.8
- × 1 in 2,400 (was 1 in 180,000)
- × 1 in 2,400 (was 1 in 180,000)
- × 1 in 2,400 (was 1 in 180,000)
- 8.8 nines
- before 14.3
- 370,000× likelier
- Lost in a year: 1 in 570 million
- disks, each rebuilt in parallel. Before this change: 14.3 nines.
- [aria-label] One object stored as 6 + 3 erasure coding: 9 pieces, 6 of data and 3 of parity, each a sixth of its size: 1.5× in all, every piece on its own disk in its own rack. Disks fail independently at 5% a year, and a lost piece is detected and rebuilt in 72 h. It survives any 3 lost pieces. The model gives 8.8 nines, a yearly loss chance of 1 in 570 million: among a billion such objects, on average 2 a year.
- Stored as 6 + 3, 1.5× · 8.8 nines, on average 2 a year among a billion
- Stored as 6 + 3 erasure coding at 5% a year with 72 h repairs: 8.8 nines, on average 2 a year among a billion objects, at 1.5× storage.

#### half playing

- of the 8 others to fail before it ends. The chance of that shows after your answer.
- ?
- after your answer
- [aria-label] One object stored as 6 + 3 erasure coding: 9 pieces, 6 of data and 3 of parity, each a sixth of its size: 1.5× in all, every piece on its own disk in its own rack. Disks fail independently at 2% a year, and a lost piece is detected and rebuilt in 24 h. It survives any 3 lost pieces. The model’s yearly loss shows after your answer.
- Stored as 6 + 3, 1.5× · ? nines
- About as likely: 3 more pieces to fail cancel the extra parityyour guess
- Watch the picture: the answer plays out on it.

#### window asking

- copies to fail before it ends. The chance of that shows after your answer.

#### window playing

- both other copies to fail before it ends. The chance of that shows after your answer.
- [aria-label] One object stored as 3 copies: 3 full copies, 3× its size, every copy on its own disk in its own rack. Disks fail independently at 2% a year, and a lost copy is detected and rebuilt in 168 h. It survives any 2 lost copies. The model’s yearly loss shows after your answer.
- Stored as 3 copies, 3× · ? nines
- 340× likelier: all three copies spend 7× as long in the windowyour guess

#### reads playing

- the rebuild’s reads show after your answer
- d3 fails, and it is being rebuilt on a free disk. A loss would need 4 of the 13 others to fail
- before it ends. The chance of that shows after your answer.
- year. The rebuild’s reads show after your answer. One disk writes about 2 Gb/s, so a 20 TB
- disk refilled alone takes about a day; a faster repair spreads the lost pieces over many disks,
- each rebuilt in parallel.
- [aria-label] One object stored as 10 + 4 erasure coding: 14 pieces, 10 of data and 4 of parity, each a tenth of its size: 1.4× in all, every piece on its own disk in its own rack. Disks fail independently at 2% a year, and a lost piece is detected and rebuilt in 24 h. It survives any 4 lost pieces. The model’s yearly loss shows after your answer.
- Stored as 10 + 4, 1.4× · ? nines
- 20 TB: one piece rebuilds one pieceyour guess

#### batch playing

- of the 13 others to fail before it ends. The chance of that shows after your answer.
- many disks, each rebuilt in parallel.
- [aria-label] One object stored as 10 + 4 erasure coding: 14 pieces, 10 of data and 4 of parity, each a tenth of its size: 1.4× in all, every piece on its own disk in its own rack. Disks fail independently at 10% a year, and a lost piece is detected and rebuilt in 168 h. It survives any 4 lost pieces. The model’s yearly loss shows after your answer.
- 13.2: a loss is 35× likelier, 5× the failures in a 7× longer windowyour guess

#### rack playing

- [aria-label] One object stored as 3 copies: 3 full copies, 3× its size, every copy on its own disk, all in one rack. Disks fail independently at 2% a year, and a lost copy is detected and rebuilt in 24 h. It survives any 2 lost copies. The model’s yearly loss shows after your answer.
- 7.3: the event must still race a repairyour guess

## 320 px, Reduced motion

#### default

- Repair
- Object and what is stored
- 3 disks, a rack each
- reads 1 copy: 20 TB for a 20 TB disk
- After c3 fails
- Detect and rebuild c3
- c3 is rebuilt on a free disk in 24 h,
- read from a surviving copy. A loss
- would need both other copies to fail
- before it ends. Each fails within 24 h
- with chance 1 in 18,000, so in a
- Yearly loss, from the model
- Nines · a step is 10× less likely
- Average lost a year
- A billion 1 MB objects, 1 PB, take
- 3 PB on 150 disks of 20 TB; at 2%,
- about 3 of them fail a year. Each
- rebuild reads 20 TB: 1.9 Gb/s to
- finish in 24 h. One disk writes about
- 2 Gb/s, so a 20 TB disk refilled
- alone takes about a day; a faster
- repair spreads the lost pieces over

#### 2 copies, 1% of disks fail a year, 1 h, Each piece in its own rack

- 2 disks, a rack each
- After c2 fails
- Detect and rebuild c2
- c2 is rebuilt on a free disk in 24 h,
- would need the other copy to fail
- with chance 1 in 37,000, so in a
- Lost in a year: 1 in 1.8 million
- 2 PB on 100 disks of 20 TB; at 1%,
- about 1 of them fail a year. Each
- Before this change: 5.7 nines.

#### 2 copies: Play 1

- c2 fails, and it is being rebuilt on a
- free disk, read from a surviving
- copy, while the rest of the failed
- disk is rebuilt at once, spread over
- many disks. A loss would need the
- other copy to fail before it ends.
- Each fails within 1 h with chance
- 1 in 880,000, so in a typical repair
- rebuild reads 20 TB: 44 Gb/s to
- finish in 1 h. One disk writes about
- Before this change: 6.3 nines.

#### 2 copies: Play 2

- Another fails within 1 h
- × 1 in 880,000

#### 2 copies: Play 3

- c2 is rebuilt on a free disk in 1 h,
- read from a surviving copy, while
- the rest of the failed disk is rebuilt at
- once, spread over many disks. A
- loss would need the other copy to
- fail before it ends. Each fails within
- 1 h with chance 1 in 880,000, so in a

#### 2 copies: Stage a loss 1

- Staging
- c2 fails
- Staged, not sampled: c2 fails, and
- its repair starts.

#### 2 copies: Stage a loss 2

- before its 1 h repair ends c1 fails too.
- No copy is left: the object is lost. A
- first failure leads here about once in
- 880,000 times.

#### 6 + 3 erasure coding, 5% of disks fail a year, 72 h, Every piece in one rack

- 6 data
- parity
- 9 disks, a rack each
- 120 TB read for a 20 TB disk
- After d3 fails
- Detect and rebuild d3
- d3 is rebuilt on a free disk in 72 h,
- read from 6 of the others. A loss
- would need 3 of the 8 others to fail
- before it ends. Each fails within 72 h
- with chance 1 in 2,400, so in a
- Another fails within 72 h
- 1.5 PB on 75 disks of 20 TB; at 5%,
- about 3.8 of them fail a year. Each
- rebuild reads 120 TB: 3.7 Gb/s to
- finish in 72 h. One disk writes about
- Before this change: 14.3 nines.

#### 6 + 3 erasure coding: Play 1

- 9 disks, one rack
- d3 fails, and it is being rebuilt on a
- free disk, read from 6 of the others.
- A loss would need 3 of the 8 others
- to fail before it ends. Each fails
- within 72 h with chance 1 in 2,400,
- so in a typical repair none does. All
- 9 share one rack: a rack event
- would take them at once.
- Before this change: 8.8 nines.

#### 6 + 3 erasure coding: Play 3

- typical repair none does. All 9 share
- one rack: a rack event would take
- them at once.
- Lost a year: 1 in 1,000 (rack event)

#### 6 + 3 erasure coding: Stage a loss 1

- No repair
- Staged, not sampled: a rack event
- destroys the one rack and every
- piece in it at once, before any repair
- can start, so nothing is left to
- rebuild from. A rack event is
- assumed here once in 1,000 years.

#### 10 + 4 erasure coding, 10% of disks fail a year, 168 h, a week, Each piece in its own rack

- 10 data
- 14 disks, one rack
- 200 TB read
- d3 is rebuilt on a free disk in 168 h,
- read from 10 of the others. A loss
- would need 4 of the 13 others to fail
- before it ends. Each fails within
- 168 h with chance 1 in 520, so in a
- typical repair none does. All 14
- share one rack: a rack event would
- take them at once.
- Another fails within 168 h
- 1.4 PB on 70 disks of 20 TB; at 10%,
- about 7 of them fail a year. Each
- rebuild reads 200 TB: 2.6 Gb/s to
- finish in 168 h. One disk writes
- about 2 Gb/s, so a 20 TB disk
- refilled alone takes about a day; a
- faster repair spreads the lost pieces
- over many disks, each rebuilt in
- parallel. Before this change:
- 3.0 nines.

#### 10 + 4 erasure coding: Play 1

- 14 disks, a rack each
- free disk, read from 10 of the others.
- A loss would need 4 of the 13 others
- within 168 h with chance 1 in 520, so
- in a typical repair none does.

#### 10 + 4 erasure coding: Stage a loss 1

- d3 fails
- Staged, not sampled: d3 fails, and

#### 10 + 4 erasure coding: Stage a loss 2

- its repair starts. Then d2, d6 and
- d10 fail too.

#### 10 + 4 erasure coding: Stage a loss 3

- before its 168 h repair ends d2, d6,
- d10 and p3 fail too. Only 9 pieces
- are left, and any rebuild needs 10:
- the object is lost. A first failure leads
- here about once in 100 million times.

#### 3 copies, 2% of disks fail a year, 24 h, Every piece in one rack

- Before this change: 8.1 nines.

#### 3 copies: Play 1

- 3 disks, one rack
- c3 fails, and it is being rebuilt on a
- copy. A loss would need both other
- copies to fail before it ends. Each
- fails within 24 h with chance
- 1 in 18,000, so in a typical repair
- none does. All 3 share one rack: a
- rack event would take them at once.
- Before this change: 9.7 nines.

#### 3 copies: Play 3

- typical repair none does. All 3 share

#### 3 copies: Stage a loss 1

- copy in it at once, before any repair

#### Describe

- First failures
- One more within 24 h
- Rack event

#### half revealed

- d3 is rebuilt on a free disk in 24 h,
- 1.5 PB on 75 disks of 20 TB; at 2%,
- about 1.5 of them fail a year. Each
- rebuild reads 120 TB: 11 Gb/s to

#### window revealed

- c3 is rebuilt on a free disk in 168 h,
- 168 h with chance 1 in 2,600, so in a
- × 1 in 2,600
- rebuild reads 20 TB: 0.3 Gb/s to
- 9.7 nines.

#### reads revealed

- 1.4 PB on 70 disks of 20 TB; at 2%,
- about 1.4 of them fail a year. Each
- rebuild reads 200 TB: 19 Gb/s to

#### batch revealed

- 14.7 nines.

#### billion met

- with chance 1 in 7,300, so in a
- 12.8
- 12.8 nines
- 16,000× less likely
- Lost a year: 1 in 5.7 trillion · goal: 10 nines
- 1.4 PB on 70 disks of 20 TB; at 5%,
- about 3.5 of them fail a year. Each
- Before this change: 8.6 nines.
- [aria-label] One object stored as 10 + 4 erasure coding: 14 pieces, 10 of data and 4 of parity, each a tenth of its size: 1.4× in all, every piece on its own disk in its own rack. Disks fail independently at 5% a year, and a lost piece is detected and rebuilt in 24 h. It survives any 4 lost pieces. The model gives 12.8 nines, a yearly loss chance of 1 in 5.7 trillion: among a billion such objects, on average 1 every 5,700 years.
- Stored as 10 + 4, 1.4× · 12.8 nines, on average 1 every 5,700 years among a billion
- Stored as 10 + 4 erasure coding at 5% a year with 24 h repairs: 12.8 nines, on average 1 every 5,700 years among a billion objects, at 1.4× storage.
- ✓on average 1 every 5,700 years among a billion, fewer than 1 in 10 years: met
- ·a rebuild reads 19 Gb/s, under 10 Gb/s: not yet

#### billion met, then moved

- 168 h with chance 1 in 1,000, so in a
- Lost in a year: 1 in 2.4 billion
- 8.6 nines.
