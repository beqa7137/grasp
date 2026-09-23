# Spaced repetition in Grasp

The goal isn't to memorize answers. It's to keep **cue → pattern → move** instincts sharp until interview day. Everything below serves that goal.

## 1. Scheduler: FSRS

`libs/engine/src/srs/scheduler.ts` wraps [`ts-fsrs`](https://github.com/open-spaced-repetition/ts-fsrs). FSRS is the scheduler Anki uses by default, and it needs fewer reviews than SM-2 to reach the same retention.

| Setting          | Value                       | Why                                                                                                                                            |
| ---------------- | --------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Target retention | 0.90                        | Standard default. Each review is scheduled for when recall probability falls to about 90%.                                                     |
| Max interval     | 365 days                    | Interview prep runs on a months-long horizon.                                                                                                  |
| Learning step    | 10 min                      | A correct first answer graduates at once. A miss comes back later in the same sitting.                                                         |
| Relearning step  | 10 min                      | A lapse gets one quick re-check before FSRS takes over again.                                                                                  |
| Fuzz             | on, seeded by `itemId:reps` | Spreads out reviews so items don't bunch on the same day. The seed avoids clocks and float math, so replay gives the same schedule everywhere. |

**Ratings.** A question is auto-graded by correctness, and the learner can adjust the grade:

| Outcome                | Rating |
| ---------------------- | ------ |
| Wrong                  | Again  |
| Right, "I guessed" (G) | Hard   |
| Right (Enter)          | Good   |
| Right, "Easy" (E)      | Easy   |

Easy is never inferred from answer speed. Multiple-choice answers can be fast because the learner eliminated options, and an unearned Easy inflates intervals. Each button shows the interval it will produce, e.g. "Got it 2d".

## 2. Review items: small, varied, auto-gradable

131 items in 5 kinds (`libs/engine/src/review/`). Each generates a fresh variant from a seed on every review, so learners recall the idea rather than the card.

| Kind                  | Count | Variation per review                                                                                                                                                                                                             |
| --------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recognize the pattern | 49    | Choices reshuffled, so answer positions can't be memorized                                                                                                                                                                       |
| Predict the next step | 11    | New random input. A decision point from the real trace, rendered with the visualizer's views                                                                                                                                     |
| Recall the template   | 30    | Cloze on a key template line, with plausible, subtly wrong alternatives                                                                                                                                                          |
| Complexity            | 17    | Choices reshuffled                                                                                                                                                                                                               |
| System design         | 24    | Generated numbers (queueing, cache math, QPS, storage, availability, backlog drain, token buckets, shard counts) and simulator-generated cases ("which component saturates first?", "which one is the single point of failure?") |

Tests enforce the following:

- Every item generates valid questions for 40 seeds.
- Generation is deterministic.
- Answer positions vary.
- The correct option is rarely the conspicuously longest one.

**Kept out of the scheduler on purpose:** full problems, full missions and mock interviews. They take too long per review and turn into memorized solutions. They feed the scheduler as signals instead (section 3).

### Unlocking

An item enters rotation only after its idea has been met somewhere else:

| Kind                    | Unlocks when                                                                             |
| ----------------------- | ---------------------------------------------------------------------------------------- |
| Recognition             | Always                                                                                   |
| Complexity and template | The pattern has been engaged with (any review, visualizer prediction, or interview flag) |
| Predict checkpoints     | The learner has used that algorithm's visualizer                                         |
| System design           | The Design Lab mission linked to that topic is complete                                  |

## 3. Signals from the rest of the app

Signals move due dates. They never edit FSRS memory state. The next real review measures actual recall, and FSRS accounts for the shorter elapsed time.

| Signal                            | Effect                                                                                                                                                                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wrong prediction in a visualizer  | That algorithm's checkpoint is due within 24 h. If never seen, it's boosted to the front of new items.                                                                                                                                            |
| Interview scorecard weak patterns | Every known item of those patterns is due now. Unseen ones are boosted. The API writes this event itself, with a deterministic id, so the client's copy dedupes.                                                                                  |
| Design Lab mission completed      | Revisits are scheduled at 3 → 10 → 30 days. Each revisit is a changed variant (more traffic, a new SLO, no single point of failure…) rebuilt from the starter design. Every variant is tested: the starter fails and a reference solution passes. |

Boosted new items bypass the daily new-item cap, with a cap of their own.

## 4. Sessions: short, interleaved, time-boxed

`buildSession()` in `libs/engine/src/srs/session.ts` builds each sitting in five steps:

1. **Due items, most at risk first.** Sorted by lowest current retrievability. Learning items due within 20 minutes are pulled in.
2. **New items.** Boosted items first, then curriculum order, alternating between deepening a known pattern and recognizing a new one. The cap is 10 per local day.
3. **Time budget.** About 10 minutes, estimated from the learner's own moving-average answer time per item kind. First exposures count ×1.5.
4. **Interleaving.** Neighbouring items differ in topic and, where possible, kind. It feels harder but transfers better, and interviews never say which pattern is coming.
5. **Misses come back in the same sitting,** at most twice per item. After that the item waits for the next session instead of looping.

**Practice mode** (`/drill?pattern=…`) is for cramming one topic before an interview. It includes locked items and never touches the schedule; its answers are logged as `practice.answered`.

## 5. Progress model

Everything is an immutable event, applied by one pure reducer on the device and on the server:

- `review.graded`
- `practice.answered`
- `predict.answered`
- `scenario.completed`
- `interview.scored`

Legacy v1 `drill.reviewed` events (SM-2 grades) are upcast on read, so old logs still replay.

Derived metrics:

- **Mastery per topic:** the mean over the topic's items of `R(now) × min(1, stability / 21 days)`. That's recall probability discounted until memory is durable. It rises slowly on purpose.
- **True retention:** the pass rate of mature reviews over the last 30 days. It should sit near the 90% target. It's shown once there are at least 10 samples.
- **Forecast:** reviews due on each of the next 7 local days.

## 6. Verified by simulation

`session.spec.ts` runs a 90-day simulated learner whose real recall follows FSRS's own forgetting curve. The test asserts two things:

- Observed retention lands between 84% and 96%.
- Daily load stays bounded (under 80 reviews/day after the first month).

## 7. Next steps

- **Per-learner parameter optimization.** The event log already contains the review history FSRS's optimizer needs (e.g. `@open-spaced-repetition/binding`). Run it server-side weekly and ship personalized `w` parameters.
- **User-set retention target and daily budget.** Both are already plain options.
- **Notifications for due reviews and mission revisits** (Capacitor Local Notifications), using the forecast.
- **Load balancing:** smooth the forecast by nudging fuzz toward lighter days.
