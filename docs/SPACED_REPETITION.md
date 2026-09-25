# Spaced repetition in Grasp

The goal isn't to memorize answers. It's to keep **cue → pattern → move** instincts sharp until interview day. Everything below serves that goal.

## 1. Scheduler: FSRS

`libs/engine/src/srs/scheduler.ts` wraps [`ts-fsrs`](https://github.com/open-spaced-repetition/ts-fsrs). FSRS is the scheduler Anki uses by default, and it needs fewer reviews than SM-2 to reach the same retention.

| Setting          | Value                             | Why                                                                                                                                            |
| ---------------- | --------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| Target retention | 0.90 (learner can pick 0.80–0.95) | Standard default. Each review is scheduled for when recall probability falls to about 90%. See _Study settings_ below.                         |
| Max interval     | 365 days                          | Interview prep runs on a months-long horizon.                                                                                                  |
| Learning step    | 10 min                            | A correct first answer graduates at once. A miss comes back later in the same sitting.                                                         |
| Relearning step  | 10 min                            | A lapse gets one quick re-check before FSRS takes over again.                                                                                  |
| Fuzz             | on, seeded by `itemId:reps`       | Spreads out reviews so items don't bunch on the same day. The seed avoids clocks and float math, so replay gives the same schedule everywhere. |

**Ratings.** A question is auto-graded by correctness, and the learner can adjust the grade:

| Outcome                | Rating |
| ---------------------- | ------ |
| Wrong                  | Again  |
| Right, "I guessed" (G) | Hard   |
| Right (Enter)          | Good   |
| Right, "Easy" (E)      | Easy   |

Easy is never inferred from answer speed. Multiple-choice answers can be fast because the learner eliminated options, and an unearned Easy inflates intervals. Each button shows the interval it will produce, e.g. "Got it 2d".

### Study settings

Settings → Study offers three knobs: daily session length (5–45 min), new cards per day (0–30), and target recall (80, 85, 90 or 95%). They are stored as `settings.changed` events rather than device preferences, so they sync, and replay stays deterministic: each review is scheduled with the target that was in effect when it was graded, and changing the target never rewrites past schedules. Values outside the offered options are rejected by the API and ignored by the reducer.

The screen shows what a target costs, computed from FSRS's interval modifier (`relativeWorkload()`): for mature cards, 95% means about 2.5× the reviews of 90%, and 85% about half. Changing settings is not study, so it does not extend the streak.

## 2. Review items: small, varied, auto-gradable

140 items in 5 kinds (`libs/engine/src/review/`). Each generates a fresh variant from a seed on every review, so learners recall the idea rather than the card.

Scheduling, sessions and mastery read only each item's id, kind, topic, order and, for predict items, `algorithmId` from the light `review/catalog.ts`, which is what the app loads before its first paint; `libs/engine/src/first-paint.spec.ts` keeps it free of question builders and content.

| Kind                  | Count | Variation per review                                                                                                                                                                                                             |
| --------------------- | ----- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Recognize the pattern | 49    | Choices reshuffled, so answer positions can't be memorized                                                                                                                                                                       |
| Predict the next step | 20    | New random input. A decision point from the real trace, rendered with the visualizer's views                                                                                                                                     |
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

| Kind                    | Unlocks when                                                                                                                    |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| Recognition             | Always                                                                                                                          |
| Complexity and template | The pattern has been engaged with (any review, visualizer prediction, interview flag, or a right answer in the placement check) |
| Predict checkpoints     | The learner has used that algorithm's visualizer                                                                                |
| System design           | The Design Lab mission linked to that topic is complete                                                                         |

## 3. Signals from the rest of the app

Signals move due dates. They never edit FSRS memory state. The next real review measures actual recall, and FSRS accounts for the shorter elapsed time.

| Signal                            | Effect                                                                                                                                                                                                                                            |
| --------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Wrong prediction in a visualizer  | That algorithm's checkpoint is due within 24 h. If never seen, it's boosted to the front of new items.                                                                                                                                            |
| Interview scorecard weak patterns | Every known item of those patterns is due now. Unseen ones are boosted. The API writes this event itself, with a deterministic id, so the client's copy dedupes.                                                                                  |
| Design Lab mission completed      | Revisits are scheduled at 3 → 10 → 30 days. Each revisit is a changed variant (more traffic, a new SLO, no single point of failure…) rebuilt from the starter design. Every variant is tested: the starter fails and a reference solution passes. |

Boosted new items bypass the daily new-item cap, with a cap of their own.

### Placement check

Learn invites every learner who hasn't taken the placement check yet, and Settings → Study offers it any time. It asks one recognition question per pattern, 20 in all, in curriculum order. Each question offers **I haven't learned this** so nobody has to guess, and no answers are shown along the way. The raw answers are stored as one `diagnostic.completed` event and the reducer derives a placement per pattern from them, so the rule can change later and every stored check is reinterpreted on replay.

| Placement               | Effect                                                                                                                                            |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| Weak (wrong or skipped) | The pattern's new cards come first, within the normal daily cap. A learner who is new to everything keeps the curriculum order.                   |
| Strong (answered right) | The pattern counts as engaged with, which unlocks its template and complexity cards. Its recognition cards move to the end of the new-card order. |

One right answer is enough because a wrong placement is cheap: a lucky guess (one in four) only moves that pattern's first cards later. The check never creates cards or edits memory state, and it doesn't count toward the new-card cap. A retake replaces the placement, while patterns already engaged with stay unlocked. Answer times feed the per-kind time estimate, as review answers do.

## 4. Sessions: short, interleaved, time-boxed

`buildSession()` in `libs/engine/src/srs/session.ts` builds each sitting in five steps:

1. **Due items, most at risk first.** Sorted by lowest current retrievability. Learning items due within 20 minutes are pulled in.
2. **New items.** Boosted items first, then patterns the placement check found weak, then curriculum order, alternating between deepening a known pattern and recognizing a new one. Recognition cards of patterns it found strong come last. The cap is the learner's new-cards-per-day setting (default 10) per local day. Boosted items are exempt.
3. **Time budget.** The learner's daily session setting (default 10 minutes), estimated from the learner's own moving-average answer time per item kind. First exposures count ×1.5.
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
- `code.submitted`
- `settings.changed`
- `diagnostic.completed`

Legacy v1 `drill.reviewed` events (SM-2 grades) are upcast on read, so old logs still replay.

Derived metrics:

- **Mastery per topic:** the mean over the topic's items of `R(now) × min(1, stability / 21 days)`. That's recall probability discounted until memory is durable. It rises slowly on purpose.
- **True retention:** the pass rate of mature reviews over the last 30 days. It should sit near the 90% target. It's shown once there are at least 10 samples.
- **Forecast:** reviews due on each of the next 7 local days.

### Reminders

On iOS and Android, Settings → Reminders schedules one local notification per day at a chosen time, for the next 7 days. `planReminders()` builds the session the learner would get at each of those times (due reviews, relearning, new cards within the daily cap, due mission revisits) and skips days with nothing to do, so a caught-up learner is not nagged. The text says how much is waiting ("12 reviews due + 3 new · About 6 min"). Reminders are replanned whenever progress changes and when the app comes back to the foreground, so studying early drops today's reminder. Tapping one opens the review. Reminder preferences are per device and not synced.

## 6. Verified by simulation

`session.spec.ts` runs a 90-day simulated learner whose real recall follows FSRS's own forgetting curve. The test asserts two things:

- Observed retention lands between 84% and 96%.
- Daily load stays bounded (under 80 reviews/day after the first month).

## 7. Next steps

- **Per-learner parameter optimization.** The event log already contains the review history FSRS's optimizer needs (e.g. `@open-spaced-repetition/binding`). Run it server-side weekly and ship personalized `w` parameters.
- **Load balancing:** smooth the forecast by nudging fuzz toward lighter days.
