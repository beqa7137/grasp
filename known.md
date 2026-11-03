# Consistency & Quorums widget (`quorum`): what is already decided

The first build of this widget (commit 8d3d9de, never pushed) and its design files were lost when the cloud container was
replaced during the owner's pause (2026-10-24 to 2026-11-02). This file records everything that survives in the lead's
context: the design decisions after two critics, the model, the experiments with their reviewed wording, and every
finding the code, browser and content reviews raised against the first build. Rebuild from it; do not relearn these.

Corrected 2026-11-03 after the rebuild's second critique round (design/r41-quorum, changes.md part D): two decisions
here were technically wrong, the read never asking the stand-ins and the locations as zones. The lines below carry the
corrections; every number is unchanged.

## Model (engine, new `libs/engine/src/sysdesign/lessons/widgets/quorum.ts`; retire `quorumRound` if nothing else uses it)

- Stateless scenario: one write of v8 (previous value v7, "Apollo" -> "Artemis"), then one read sent when the write is
  acknowledged. `quorumScenario(n, w, r, states[up|down|stops-mid-write|back], stall, sloppy)`.
- Geometry: three data centers (not zones: 40 ms is a cross-region round trip, and the challenge's LOCAL_QUORUM point
  needs data centers), writer in DC A near R1, reader in DC C near R3/RN. One-way delays N = 3: R1 1, R2 2,
  R3 20 ms (from the writer; the reader's distances run the other way). N = 5: 1, 1.5, 2, 20, 20.5. Round trip = 2x
  one-way. ALL pays a cross-data-center ack (40 ms at N 3). DC B 2 ms from both A and C is a known simplification.
- Arrival rule (the critic's correctness fix): what a replica holds is decided when the read request reaches it (one-way
  delay plus any stall), never at the W-th ack. Default N3 W2 R2: acked in 4 ms; R3 gets v8 at 20 ms; the read hears R3
  (v7) and R2 (v8), repairs R3 and returns v8 fresh in 6 ms (repair included); R2 is in both. W1 R1 is a real stale read:
  the read reaches R3 at 3 ms, 17 ms before v8 does.
- Stall: the middle replica (R2 at N 3, R3 at N 5) adds 100 ms (a GC pause). Only ALL waits for it at N 3 for reads;
  QUORUM writes go from 4 to 40 ms (they now need R3's cross-data-center ack); ONE stays 2 ms. Use the constant, never a
  hardcoded 100.
- Failures: a replica known to be down refuses the write up front (nothing written, Cassandra UnavailableException). A
  replica that "stops mid-write" makes the write time out at 2 s (write_request_timeout); replicas that applied it keep
  v8, so a later read can return a write the client saw time out. Call it "timed out", never "told failed": the outcome
  is unknown, which is why retries must be idempotent.
- Verdicts: fresh, stale, failed write, refused, timed out, `old` (a timed-out write whose read hears only replicas that
  missed it), read fails.
- Read repair blocks the read (the read's time includes the repair). Cassandra blocks the read on its repair so a later
  QUORUM read cannot go backwards (this is older than 4.0; do not attribute it to 4.0).
- Sloppy quorum: stand-ins H1, H2 beside the writer. Reads, like writes, go to the first N healthy nodes (Dynamo 4.6;
  DDIA), so a stand-in answers for a home replica still down; a `back` replica takes its place again, which is why E5's
  read misses v8. Writes survive min(n, n + 2 - w) down and reads min(n, n + 2 - r), so the handles agree with the
  stand-ins drawn.
- Read-set guarantee: staleReadSets = C(n - h, r) of C(n, r), h = replicas that acked. The strip counts the guarantee,
  separate from what the drawn read happened to see (`thisReadUnsure`).
- Availability: each replica down 1% of the time, independently ("high, so the differences show"); binomial "at least
  W of m up", m = N strict, N + 2 sloppy. `nines` unit that never prints 100% (e.g. 97.03%, 99.97%, 99.9999%).
- The reviewers verified all 104,704 settings of the first build against an independent recomputation: the model was
  right. Keep the same numbers. With R + W > N and a strict quorum, every completed read is fresh.

## Experiments (final reviewed wording; every number a slot from the model)

Answer positions 3, 1, 2, 1, 3 (never mostly second).

1. "Is R + W = N enough?" (optional retitle "One more replica per read"). N 5, W 2, R 3. Choices: "None: {r} + {w}
   covers all {n}" / "3 of 10, as a read of 2 would" / "1 of 10" (correct). Reveal: "It got v{new} only because v{new} reached
   R{lucky} at {land}, before the read did, and it repaired R{p} and R{q} before returning ({ms} in all). Had v{new}
   reached R{lucky} after the read, it would return v{old}." Hidden while asking: the strip count; the strip sentence must
   be neutral and true ("does every read of {r} meet the {w} that acked?"), never "can fit in N without sharing".
2. "One replica down at ALL" (ask: "...and R{d} has been down for a minute, so the cluster knows. What happens?"): choices "Writes are refused at once; reads still work" (correct) / "Writes time out after
   2 s; reads still work" / "Both keep working" (truth from refused vs timedOut). Reveal contrasts a mid-write death and
   quotes write 97.03% vs read 99.9999%. Hide availability, the write outcome and the verdict while asking.
3. "One replica stalls": asks QUORUM's new write time. Choices ascending: "4 ms, unchanged" / "40 ms, R3's round trip"
   (correct) / "104 ms, waiting for R2". Round trips stay visible (sorting them is the skill); hide the write headline,
   the W-th ack marker/label, the verdict and everything that names which replicas acked (the reader's "sent at", the
   fan's acked/later split, the strip's acked colours, the summary's names). Reveal: "...ONE stays {one}. Reads hedge such stalls with speculative
   retry, asking one more replica; a write already goes to all, so only W and replica placement help."
4. "The replica that missed a write": correct choice first: "The read writes v8 to it before returning: read repair".
   Reveal: "(Cassandra blocks the read on its repair, so a later QUORUM read cannot go backwards)" and "The hint the
   coordinator kept for R3 replays the write shortly after R3 returns (by default Cassandra writes hints only for a
   replica's first 3 hours down); read repair fixes keys that are read; Merkle-tree repair fixes the rest." While asking:
   no repair particle, no repair arc, read ends at its R-th answer.
5. "A sloppy quorum": "can a read still miss it?" Choices "No: R + W > N still holds" / "Yes: all 3 read sets can" /
   "Yes: 1 of the 3 read sets can" (correct). Outcome slot: miss === sets ? all : miss > 0 ? yes : no. While asking hide
   the verdict (pill "returns ? / after your answer", chips "?", no BOTH ring, no repair) everywhere incl. summary,
   notices, card names; hide the not-yet-run read too (region `read`). Reveal: "Yes, {miss} of the {sets}: R{a} and
   R{b} are back, so a read goes to the home replicas again, not to the stand-ins holding the write, and of the home
   replicas only R{h} has v{new}, ...". Write availability 99.97% -> 99.99999%.
6. Challenge "fast reads that stay fresh": with the stall; goals fresh, reads under 5 ms, writes under 50 ms (state the
   ask's bounds as the status line does), writes survive 1 down. Exactly one of 34 settings passes: N 5, W 4, R 2 (read
   3 ms, write 41 ms). Reveal names the cost (5 copies; writes succeed 99.90% vs QUORUM of 3's 99.97%) and ends: "In an
   interview, also name speculative retry (ask one more replica when one is slow), and say why LOCAL_QUORUM is not the
   answer here: a LOCAL_QUORUM read in the reader's data center need not overlap a LOCAL_QUORUM write in the writer's,
   and EACH_QUORUM writes would mean all {each} here, waiting for the paused R{s}." Use
   `{r} + {w} > {n}` order and an `ordinal` slot unit for "{w}th".

Lesson text fixes (libs/engine consistency lesson): line ~17 "a read waits for R answers (Cassandra asks only the R
nearest replicas; Dynamo asks all and takes the first R) and returns the newest version among them."; line ~21 "is
reported as failed (a timeout) but is not rolled back"; "common default" -> "usual choice" (Cassandra's default is ONE,
drivers LOCAL_ONE). Framework additions: ExperimentRun 'write-read' and 'read'; ExperimentBound below | atLeast via
boundMet/boundLimit (Caching, Load Balancing, Data Modeling unchanged); nines and ordinal slot units.

## Picture and layout (after two critics)

- One stage: Replicas (writer top over DC A, N cards, reader bottom over DC C; line lengths follow round trips; no
  heavy band), then the read-set strip right under the reader (14px cells desktop, 12px phone, R1..RN header, x on
  sets that can miss, headline "{x} of {y} can miss v8", one sentence on the limit: "R + W > N alone is not
  linearizable" because of racing reads and concurrent writes settled by last-write-wins), then a compact Latency section
  (log axis 1 to 200 ms, write acks and read answers, W-th and R-th ringed).
- W and R handles on the drawing with stops ONE, QUORUM, ALL; each shows "survives k down · writes succeed x%"; unnamed
  levels never read twice ("W 4", not "W 4, 4").
- Replica cards: a roving button group; each name says the state and the next action; four state pips (up, down, stops
  mid-write, back having missed the write); hover/focus hint names the next state; 44px targets incl. 5 cards on a 252px
  stage (8px sides, 3px gaps).
- BOTH ring on a replica in the write set and the read set; it is the motion climax; the verdict pill is the heaviest
  mark; the handles are quieter.
- Desktop stage height depends only on width and N: 846 at N 3, 880 at N 5 (620px). Phones as short as collisions allow.
- Counts read "2 live, 3 needed" and "2 reachable, 3 needed" (short "x of y needed"), never "x of W live".
- The `old` and neutral pills label the time as the read's: "write timed out · read 2 ms".
- "both acked and answered" (not "R2 is in both"); overlap sentence "every read of {r} shares a replica with the {w}
  that acked."; R + W order everywhere.

## Bugs the first build had (prevent them up front)

1. Giveaways while asking on every surface (pill, summary, notices, aria-labels, card names, chips, BOTH ring, repair
   particles, Describe, latency rows, handles' availability text, plays the learner starts). One `hiding()` map from a
   question's hidden regions to every surface; hiding holds through the answer's own play and releases at the reveal.
   The no-answer sweep must also look for false claims (stale/fresh, "meet any", "can fit in N without sharing", "both
   acked", "returns v") and run with motion on and off, asserting no repair particle while asking.
2. `fieldset.group { padding: 0; border: 0 }` beat `.n-control` padding: the N control overlapped the stage top below
   the wide layout. Use `fieldset.group.n-control`; add a 320px check.
3. Chips, line labels and latency dots tracked by `$index`: v8 inserted before v7 reused elements, so the climax chip
   popped in unanimated and v7 re-animated. Track by replica id everywhere order changes mid-play.
4. Latency labels sat on the grid line (looked struck through): stage-colored ground, grid under text; markers end at
   their ring; dots opaque; lanes 10px off the row, 20px gap; labels stay inside the plot with short fallbacks
   ("(+2 repair)", then "returned N ms"); mono width needs the measurement margin.
5. Look-here tags clipped at the stage border or missing: keep 3px off the border, 16px off corners; try frame edges,
   then just inside, then the gutter outside, then inside; a spec asserts every experiment's frames have a tag at every
   width.
6. Read-side marks (read line labels, chips, latency read row, strip count, this-read ring, repair arcs) must appear as
   the read reaches them, not at t = 0.
7. The unreachable x must avoid repair arcs (N5 W1 R4 back/down/back/up/up at 400px). A timed-out stand-in's reply is
   drawn as `applied`, not `fly`.
8. Plays pause by the widget host's visibility, not one stage's (Data Modeling's phone bug).

Deferred last time (optional): linking BOTH to its cell in each strip chip and outlining a chip's replicas on hover;
"Enter:" hints; Describe as per-replica sentences on phones; a clearer "missed" glyph; R1..RN heads on phones.
