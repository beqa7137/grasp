# Grasp redesign spec: loop-first navigation and the Workbench visual language

Approved by the owner as proposed on 2026-10-02. The loop builds it as iterations R0 to R48 (section 5); `docs/LOOP.md` tracks progress.

**What was approved.** The navigation is rebuilt around the rounds of a real interview loop. It uses the winning "Loop-first" proposal, with ideas taken from "Today + three roadmaps" and "Library first". Every interactive picture moves onto one shared kit. That kit uses the winning "Workbench" proposal, with ideas taken from "Hands On" and "Stage and Timeline". Section 5 delivers the work as **49 loop iterations (R0 to R48)**. Each one lands on `main` on its own. Each is verified by audit screenshots, timing, a first-paint byte budget and three-device e2e, plus a tablet subset where navigation or layout changes.

**What changed in this revision.** Every point of the completeness critique is resolved below. The index at the end maps each critique item (A1 to H6) to the section that resolves it. The largest changes:

- The Target no longer duplicates the study plan. Seniority and round weights are new. Date, minutes and starting point stay in `plan.set` (2.1).
- Readiness now has full arithmetic, named skill lists for each level and Ready rules that can actually be reached. A simulation test proves that a 23-day plan can reach "Loop-ready" (2.2, 2.3).
- Route mechanics now match how Ionic really behaves (2.5):
  - hub segments render in a nested outlet;
  - a custom back rule handles links between sections;
  - filter URLs replace history entries instead of pushing them;
  - routes are declared in an explicit order.
- The player layout is computed from real viewport heights. The checkpoint dock is inline and non-modal. The palette's failing contrast pairs are fixed (3.6 to 3.8).
- The budget measures the first-paint closure (main plus tabs plus Today), not only Angular's "initial" chunks (5.0).
- Oversized iterations are split and dependencies are corrected. Every widget and screen has a named iteration. Content review is a gate wherever an editorial call ships.

**Corrections to the inputs, checked in the repo at 7702e75:**

- **Missions:** `SCENARIO_CATALOG` has **9** missions, not 6. Iteration 96 added mail-attachments, ledger-month-end and reconnect-storm.
- **Bundle:** Angular's initial bundle is **848.95 kB**, against the 860 kB warning (LOOP.md, iteration 96). Tabs and the default page are lazy `loadComponent` chunks (`app.routes.ts:11-13`), so this figure does not include them.
- **Profiles:** `tools/verify/lib.mjs` has desktop (1280×1000), pixel7 and w320 (320×700). e2e has desktop (1280×720), Pixel 7 and iPhone 17. Neither has a 1024px or tablet profile. R0 adds them.
- **Theme file:** the tokens live in `apps/app/src/_theme.scss`. There is no `src/theme/` folder.
- **Lint:** the repo lints with oxlint, and stylelint is not installed. 94 component files keep inline `styles:` in `.ts` files.

---

## 1. The problems

**Navigation is organized by medium, not by subject or by what a learner is trying to do.** The five tabs (Learn, Visualize, Design Lab, Review, Interview) appear at every width, including the 1280px desktop. The consequences:

- **The largest library is orphaned.** The 164 problems at `/code` have no inbound link.
  - They are reachable only through the workspace back arrow (`workspace.page.html:3`, `defaultHref="/code"`).
  - There, no tab is lit.
  - The 164 flat 84px cards come to about 20 phone screens (`dark-pixel7-code-list.png`).
- **Behavioral is buried.** Its 13 competencies and 91 questions sit behind the last card on Interview. On a phone, the competency list starts under two static panels (`dark-pixel7-behavioral-list.png`).
- **System design is split across tabs.** The 34 lessons sit about 3,300px down Learn, while missions and cases live in Design Lab. The two link to each other in only one direction.
- **The home page has no clear next step.**
  - Learn offers six equal "Today's loop" tiles, chosen by unrelated heuristics.
  - It ignores the study plan.
  - A `.plan` class collision drops the Study plan tile 28px (`dark-desktop-learn.png`, `learn.page.scss:113`).
- **Nothing can be searched or filtered.** The app's only `type="search"` input is inside a widget demo.
- **Names conflict across the app.**
  - "Practice" means four different things.
  - The same problem has three titles: "Ship Within D Days", "Capacity To Ship Packages Within D Days", and "Ship Packages Within D Days" (`lessons/foundations-core.ts:330`).

**The interactive features look like documents with pictures in them:**

- **Checkpoints push the picture away.** Opening one inserts "YOUR CALL" above the visual.
  - On a phone, the graph being asked about is not on screen at all (`dark-pixel7-player-kruskal-mst-predict.png`).
  - On desktop, the array jumps from y 453 to 660 to 790 across checkpoints.
- **Nothing moves.** Only array pointer tags animate, and every frame lasts `1100 / speed` ms.
- **Code is clipped.** The code panel cuts off at `dist[so` and `dp[`.
- **Lesson widgets have no pictures.**
  - 25 of the 33 model widgets are sliders feeding number tiles (`dark-desktop-lesson-load-balancing-slow.png`).
  - The 8 SVG widgets (latency, queue, ring, limiter, stream, lease, overload, replica) still teach through "Things to try" prose.
  - None of the 27 cases draws its architecture.
- **The Design Lab is a static calculator.**
  - It computes one steady state with identical 132×70 boxes.
  - A healthy DB wears the amber "hot" color.
  - On a phone, the canvas opens with the DB off screen (`dark-desktop-sandbox.png`, `dark-pixel7-sandbox.png`).
  - Free Build never colors a KPI (`free-build.ts`, `maxErrorRate = 1`).
- **Colors carry no consistent meaning.** Amber alone stands for `lo`, frontier, DP dependencies, call stack, medium difficulty and the DB kind.
- **Practice screens bury their own controls.**
  - On Rehearse, opening "Peek at your story" pushes the timer and the grade buttons below the fold (`dark-pixel7-behavioral-rehearse.png`).
  - On Review, "Not quite" and Continue sit at the bottom edge, behind the tab bar (`dark-pixel7-review-answered.png`).
  - The interview composer stacks two mode rows and two pinned paragraphs above four fully open STAR boxes (`dark-pixel7-interview-behavioral-answer.png`).

---

## 2. New information architecture

### 2.1 The model and the Target

Every piece of content belongs to a **round** of a real loop: Coding, System design or Behavioral. Object-oriented design will be added when its engine ships, and stays hidden until then. Every round has the same four parts:

| Round         | Skill map               | Library                                | Drill           | Mock              |
| ------------- | ----------------------- | -------------------------------------- | --------------- | ----------------- |
| Coding        | 23 patterns in 4 tracks | 164 problems, 23 visualizers           | pattern drill   | coding rounds     |
| System design | 34 topics in 6 shelves  | 9 missions, 27 cases, the Lab          | topic drill     | design rounds     |
| Behavioral    | 13 competencies         | 91 questions, your stories, STAR drill | story rehearsal | behavioral rounds |

**The Target ("Your loop")** is what the learner is preparing for. Each field is owned by exactly one event:

| Field              | Values                                               | Owned by                                                                               | Notes                                                                                                                              |
| ------------------ | ---------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Level              | Early career, Mid-level, Senior (`SENIORITY_LEVELS`) | `target.set` (new)                                                                     | the one home for seniority                                                                                                         |
| Round counts       | Coding 0–3, System design 0–3, Behavioral 0–3        | `target.set`                                                                           | 0 means the round is not in the loop. Counts are readiness weights                                                                 |
| Company            | Amazon or none                                       | `target.set` (optional field: the server accepts it from R4, clients send it from R48) |                                                                                                                                    |
| Interview date     | YYYY-MM-DD                                           | `plan.set` (unchanged)                                                                 |                                                                                                                                    |
| Minutes a day      | 15, 30, 45, 60, 90, 120                              | `plan.set`                                                                             |                                                                                                                                    |
| Starting point     | New, Rusty, Confident                                | `plan.set` `level` (unchanged)                                                         | Renamed in the UI from "Where you are starting". It drives `LEVEL_FACTOR` and the skipping of strong patterns. It is not seniority |
| Rounds in the plan | any subset of the three                              | `plan.set` `rounds`                                                                    | always written from the counts that are 1 or more                                                                                  |

- **Why two events.** `plan.set` is a `z.strictObject` (`progress.schema.ts:144`). Adding fields to it would make the release still running reject it. Splitting by field keeps every existing `plan.set` valid and never stores the same value twice.
- **Writes.**
  - Saving "Your loop" writes `target.set`. When a date is set, it also writes `plan.set` in the same batch.
  - Editing the date, minutes or starting point anywhere (the Target line, the plan page, Settings) writes `plan.set`.
  - The plan is a pure function of `plan.set` plus progress, so it regenerates.
  - Clearing the date writes `plan.set: null` and keeps the Target.
- **Older apps.** An older native build may edit the plan. If a `plan.set` is later than the latest `target.set` and its rounds differ, the reducer gives each added round the level's default count, and each removed round a count of 0.
- **Schema.** `target.set` is a `z.strictObject` with:
  - `level`;
  - `rounds` (`{ coding, design, behavioral }`, integers 0 to 3, at least one above 0);
  - an optional `company`.

  Every field it will carry in this plan is declared in R4, so no second staged migration is needed.

- **Streaks.** The new reducer exempts `target.set` from `bumpStreak`, alongside `settings.changed` and `plan.set` (`progress.ts:153`). Older native builds would still count it as a study day, so the server filters it:
  - `GET /progress/events` omits event types newer than v1 unless the client sends `?v=2`.
  - New clients send `?v=2`; older builds never see `target.set`.
  - A spec asserts that a pull without `v` never returns one.
- **The level is asked once.** The plan form keeps only date, minutes and starting point. The competency "See it done" control (`competency.page.ts:213`) and the mock loop (`mock-loop.page.ts:364`) preselect the Target's level. Either can still change the level for that view without writing the Target.
- **No Target yet.** Readiness and Up next use the Mid-level profile and say so: "Assuming a Mid-level loop · Set your loop".
- **Pilot users with a plan but no Target.** These learners have a `plan.set` and no `target.set`.
  - They get a derived Target: Mid-level, with default counts for the plan's rounds.
  - Today shows "Mid-level loop (assumed)".
  - Under it, one inline row reads "Your level? Early career · Mid-level · Senior". One tap writes `target.set`.
- **Mock loop shape.** `mock.completed` allows one round per track (`progress.schema.ts`, `max(INTERVIEW_TRACKS.length)`).
  - Round counts are weights for readiness and the plan only.
  - The full mock loop stays one round of each round in the Target. A Senior loop with Coding ×2 runs one coding round, and the Full loop card says "One round of each".
  - Multi-round loops need a staged `mock.completed` change: the server first accepts up to 6 rounds with an `index`, and clients send them later. This is listed as a follow-up and is not part of this plan.

### 2.2 Level profiles

Profiles live in `libs/engine/src/readiness/levels.ts`. Both readiness and `plan/study-plan.ts` import them, so the plan schedules exactly what readiness counts. All lists below go through content review in R4.

**Early career** (default counts: Coding 2, Behavioral 1; no System design round):

- **Required patterns (14):** Arrays & Hashing, Two Pointers, Sliding Window, Binary Search, Prefix Sums, Monotonic Stack, Fast & Slow Pointers, Linked List Reversal, Intervals, Heap / Top-K, Breadth-First Search, DFS & Backtracking, Tree Traversal, 1-D Dynamic Programming.
- **Stretch (9):** Topological Sort, Union-Find, Shortest Paths (Dijkstra), Minimum Spanning Tree, Trie, 2-D DP & Knapsack, Greedy, Bit Manipulation, Bitmask DP.
- **Competencies:** all 13, equal weight.

**Mid-level** (default counts: Coding 2, System design 1, Behavioral 1):

- **Required patterns (21):** all except Minimum Spanning Tree and Bitmask DP, which are Stretch.
- **Core topics (17)**, marked by the new `SdTopic.level: 'core'`:
  - Estimation, Latency & Queueing, Capacity & Scaling, Load Balancing, Reliability;
  - Data Modeling, Replication, Sharding & Partitioning, Consistency & Quorums, Unique IDs;
  - Caching, CDNs & Edge, Real-Time Delivery;
  - Queues & Async Work, Backpressure & Load Shedding;
  - API Design, Rate Limiting & Abuse.

  The other 17 topics are `'advanced'` and Stretch at Mid-level.

- **Required cases (4):** URL Shortener, Rate Limiter, News Feed, Chat App. All are `level: 'core'` in `CASE_CATALOG`.
- **Competencies:** all 13, equal weight.

**Senior** (default counts: Coding 2, System design 2, Behavioral 1):

- **Required patterns (21):** as Mid-level.
- **Topics:** all 34.
- **Required cases (9):** every `level: 'core'` case in `CASE_CATALOG` (URL Shortener, Rate Limiter, Typeahead, News Feed, Chat App, Proximity Service, Distributed Cache, Leaderboard, Hotel Booking). No new case flag is invented.
- **Competencies:** all 13. Five weigh double: Leadership & Mentoring, Influence Without Authority, Ambiguity, Prioritization & Trade-offs, Technical Depth.

**The level bar** defines "at level difficulty":

- Early career accepts any difficulty.
- Mid-level and Senior need medium or harder.

The bar is always reachable. In the catalog data, every pattern has at least 4 member problems and at least one at medium or harder; Bitmask DP has 1 medium and 4 hard, and Minimum Spanning Tree has 2 and 2. A spec asserts that every pattern keeps at least 2 members and at least 1 at medium or harder. Hard is never required, because 5 patterns have no hard problem: Arrays & Hashing, Prefix Sums, Fast & Slow Pointers, Intervals and 1-D Dynamic Programming.

### 2.3 Readiness and Up next

**Skill states** live in `libs/engine/src/readiness/status.ts`. Today, the skill maps, the plan, Progress and search read only these functions.

The **recall check** uses current retrievability. It does not use the strength in `itemStrength` (`progress.ts:405-431`), which is discounted over 21 days and cannot be reached in a 3-week plan. An item passes when it has a card and its current retrievability is at or above the learner's retention target (`settings.retention`).

| Skill      | Learning                                                                             | Practiced                                                                                | Ready                                                                                                                                                                                                 |
| ---------- | ------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pattern    | introduced (`introduced[id]`), a problem attempted, or a visualizer run              | one full solve of a member problem                                                       | two full solves of distinct member problems, one at or above the level bar; at least 4 of its review items graded, every graded one passing the recall check                                          |
| Topic      | introduced (lesson quick check or a review)                                          | lesson quick check answered and 2 items graded, or covered by a finished mission or case | covered by a finished mission or case; at least 4 items graded, all passing the recall check                                                                                                          |
| Case       | not tracked: case stage progress is device-only, so an unfinished case counts as New | finished (`case.completed`)                                                              | finished with at least 70% best choices and 70% close estimates (`CaseOutcome`)                                                                                                                       |
| Competency | a story tagged with it, or an interview asked it                                     | a rehearsable story tagged with it (`isRehearsable`), told at least once                 | a tagged story at rehearsal step 1 or more (its latest telling was "Told it well" and it has been told at least twice), or an interview round on it (`behavioral[id].verdict`) at Lean hire or better |

- **New** means none of the above.
- **Flagged** comes from `weakPatterns` without `resolvedAt`, or from `behavioral[id].weakSince`. It overlays any state and caps the skill at Practiced until resolved.
- **Library states** are not readiness skills:
  - Problem: Unsolved, Attempted (best x of y), Solved.
  - Mission: Not started, Saved design (this device), Passed, Revisit due.
  - Case progress in a list: Not started, Stage k of n (this device), Finished.

**Readiness arithmetic** (`libs/engine/src/readiness/readiness.ts`):

- **State weights:** New 0, Learning 0.25, Practiced 0.6, Ready 1.
- **Round score** = 100 × Σ weight / number of required skills, rounded.
  - Coding counts the required patterns.
  - System design counts the required topics plus the required cases.
  - Behavioral counts the competencies with their weights; a double weight counts twice in both sums.
- **Loop readiness** = Σ (round count × round score) / Σ round counts.
- **Bands:** Building 0 to 39, Getting there 40 to 74, Loop-ready 75 to 100.
  - The number is coverage, never a hire prediction.
  - Mock verdicts appear beside it as dated evidence and are never mixed in.
- **Example:**
  - 21 required patterns, with 3 Ready, 6 Practiced, 5 Learning and 7 New: (3 + 3.6 + 1.25) / 21 = 37.
  - With System design at 22 and Behavioral at 27, and counts of 2, 1 and 1: (2 × 37 + 22 + 27) / 4 = 31, "Building".
- **Reachability spec.** `readiness.spec.ts` simulates a Mid-level learner on the default 23-day, 45-minute plan. The learner completes every slice and grades every due review Good.
  - On the interview day, coding must be Loop-ready and loop readiness must be at least 60.
  - A learner who only reviews never passes Practiced on a pattern, because they have no solves.
  - R4 tunes the Ready rules and weights until the simulation passes, and records the final values in LOOP.md.

**Where the inputs come from** (see also 2.11):

- Readiness reads only the synced event log and the story bank.
- Case drafts, STAR drafts, code drafts, the mock loop's progress and saved Lab designs never leave the device (`local-drafts.ts`). They feed Continue and Up next rule 4, labelled "on this device", and never feed readiness.
- The story bank syncs only when the learner is signed in. A signed-out learner's behavioral readiness is therefore per device, and the Progress page says so in one line.

**Up next** lives in `libs/engine/src/readiness/next.ts`; it is pure and unit tested.

- The **weakest round** is the round with the largest `count × (100 − score)`.
- The first rule that yields a candidate wins.
- If a rule finds nothing in the weakest round, it tries the next weakest round before falling through to the next rule.

| #   | When                                                                                                                                                                  | Card                                                                                                                        |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- |
| 1   | The plan's status is `interview-day` or `eve`, or the Target date is today or tomorrow                                                                                | "Interview tomorrow: review only" (opens Review), or "Rest. Nothing new today." This is the only rule that points at Review |
| 2   | A plan exists with an undone slice today that is not hidden                                                                                                           | that slice, labelled "From your plan · 2 of 5 today"                                                                        |
| 3   | An unresolved flag in the round                                                                                                                                       | the first unsolved member problem of the flagged pattern at the level bar, or "Write a story for Conflict & Disagreement"   |
| 4   | Unfinished work on this device in the round                                                                                                                           | "Continue URL Shortener: you stopped at stage 3 of 9"                                                                       |
| 5   | Online, and either a round scores 60 or more with no mock round of it in 14 days (`interviews.byTrack`), or loop readiness is 70 or more with no mock loop in 14 days | "Coding mock round, 45 min", or "Full mock loop"                                                                            |
| 6   | Otherwise                                                                                                                                                             | the round's required skill in the lowest state, with the action that moves it up one state                                  |

Rule 6 actions by state:

- **New:** the pattern lesson, topic lesson or competency guide.
- **Learning:**
  - pattern: the easiest unsolved member problem at or above the level bar, primary-pattern problems first;
  - topic: the first unfinished mission that lists it, else a required case that covers it;
  - competency: "Write a story for X".
- **Practiced:**
  - pattern: a second solve at the bar if one is missing, else "Drill: Binary Search" when the recall check fails;
  - topic: its drill;
  - competency: rehearse its story.
- **Everything Ready:** the first Stretch skill, then "Full mock loop".

Every card carries `reason`, `minutes`, `fromState` and `toState`. Example reason: "Your loop has two Coding rounds, and Binary Search is Learning. One medium solve makes it Practiced."

**"Not today"** hides the card's item until the device's next calendar day.

- The rules re-run without it, and the next candidate takes its place.
- A hidden plan slice stays unchecked in the plan's own list; only Up next skips it.
- The hidden ids are a per-device preference (2.11), stored with `@capacitor/preferences` like the other device state, and reset when the day changes.

**Minutes** come from `libs/engine/src/plan/minutes.ts`. `study-plan.ts` imports it instead of its private `UNIT_MINUTES` (`study-plan.ts:22`).

- **Existing values stay:** pattern 40, retry 20, story 20, case stage 4, rehearsal 3 (from `REHEARSAL_MINUTES`), and mock rounds from `LOOP_ROUND_MINUTES`.
- **New values:** problem easy 15, medium 25, hard 40; topic lesson 15; mission 20; visualizer 6; question draft 15. They are estimates and go through R4's content review.

### 2.4 Site map

```
/today                          Today (default route, replaces /learn)        badge: due in Review
  /today/review                 Review session (was /drill)
  /today/drill?topics=a,b       Drill of weak spots (new)
  /today/plan                   Study plan (was /plan)
  /today/progress               Progress (new)
  /today/settings               Settings, "Your loop" first (was /settings)
  /today/search?q=              Search results (new; desktop also has the palette)
/coding                         Coding hub, segment: Skill map
  /coding/problems              segment: Problems (was /code)
  /coding/visualizers           segment: Visualizers (was /visualize)
  /coding/problems/:id          Workspace (was /code/:id)                       focus route
  /coding/visualizers/:id       Player (was /visualize/:id)                     focus route
  /coding/patterns/:id          Pattern hub, segment: Lesson (was /learn/pattern/:id)
  /coding/patterns/:id/problems   segment: Problems
  /coding/patterns/:id/drill      segment: Drill (was /drill?pattern=)
  /coding/placement             Coding placement (was /diagnostic)
/design                         Design hub, segment: Topics
  /design/missions              segment: Missions
  /design/cases                 segment: Cases
  /design/topics/:id            Topic lesson (was /learn/design/:id)
  /design/topics/:id/drill      Topic drill (new; practiceSet already accepts sd- topics)
  /design/missions/:id          Mission in the Lab (was /design/:id)            focus route
  /design/lab                   Free build (was /design/free-build)             focus route
  /design/cases/:id             Case study (was /design/case/:id)
  /design/cases/:id/build       Case reference build (was /design/free-build?case=:id)   focus route
/behavioral                     Behavioral hub, segment: Competencies   (own tab)
  /behavioral/questions         segment: Questions (new)
  /behavioral/stories           segment: Stories (was its own page)
  /behavioral/guide             STAR and "Before the loop" (moved off the hub top)
  /behavioral/drill             STAR drill: timed answers with checks, no verdict (was /behavioral/mock)
  /behavioral/question/:id, /behavioral/stories/:id, /behavioral/rehearse   unchanged
  /behavioral/:id               Competency (declared last)
/mock                           Mock hub: Full loop, Single rounds, History (was /interview)
  /mock/loop                    Mock loop
  /mock/:id                     Interview session (declared last)
```

- **One tab per first segment.** Every route's first URL segment is a tab id: today, coding, design, behavioral or mock. Ionic keys its stacks by this segment, so exactly one tab is lit everywhere.
- **Mock rounds are one thing.**
  - Every single round, in Scripted or AI mode, is an API interview session that records `interview.scored` with a verdict. Mock-loop rounds already do this (LOOP.md iteration 84).
  - The client-only page that scored "N of M checks pass" (`behavioral-mock.page.ts`) is not a mock. It becomes the **STAR drill** under Behavioral and never claims a verdict.

### 2.5 Route mechanics

**Declaration order** inside the tabs' `children`, enforced by `routes.spec.ts`:

1. Within each tab, routes are declared in this order:
   1. literal detail routes;
   2. parameterized detail routes;
   3. the hub route with its segment children;
   4. that tab's inline legacy routes;
   5. its last-resort parameter route (`behavioral/:id`, `mock/:id`).
2. `coding/problems/:id` and `coding/visualizers/:id` come before the `coding` hub, so `/coding/problems` falls through to the hub's `problems` segment.
3. Some inline legacy routes share a prefix with new ones:
   - `design/case/:id`, then `design/free-build`, then the legacy mission matcher, all before the `design` hub. The matcher is a `UrlMatcher` that accepts only ids in `SCENARIO_CATALOG`, a light catalog already in first paint.
   - `behavioral/mock` comes before `behavioral/:id`.
4. Legacy prefixes that collide with nothing (`learn`, `visualize`, `drill`, `diagnostic`, `interview`, `code`, `plan`, `settings`) are `loadChildren` entries pointing at `legacy-routes.ts`. They come after all new routes and before `**`.

**Reserved ids** (checked in `routes.spec.ts`):

- No competency id is `questions`, `stories`, `guide`, `drill`, `question`, `rehearse` or `mock`.
- No scenario id is `topics`, `missions`, `cases`, `lab`, `case` or `free-build`.
- Mock session ids are generated and are never `loop`.

**Hub segments do not push pages.**

- A hub (Coding, Design, Behavioral, and the pattern hub) is one Ionic page. Its segments are child routes rendered in a plain Angular `<router-outlet>` inside that page.
- Segment links navigate with `replaceUrl: true`. Switching segments therefore neither animates nor builds a back chain, and back leaves the hub.
- The sub-nav is a row of links with `aria-current="page"`, not ARIA tabs.
- **Spike in R5:** confirm that `IonTabs.select()` restores the hub with its last segment URL. If Ionic restores the hub root instead, the tabs page records the last URL per tab from router events and selects with that URL.
- R5 note: Ionic restores a tab at its top view's URL, which for a hub is the hub's own URL, so the fallback shipped: `tabs.page.ts` records the last URL per tab (not counting views a cross-section link opened, so a tab returns to where the learner left it) and handles the tab buttons itself.

**Back across sections.** `ion-back-button` uses `defaultHref` only when its stack is empty. So `defaultHref` alone cannot return Today → case → Today when the Design stack already has history. Instead:

- **`crossLink` directive.** Every link whose target tab differs from the current tab passes `state: { from: currentUrl }`.
- **`app-back` component** (`ui/back.component.ts`, replacing every `ion-back-button`):
  - If the view was entered with a `from` in another tab, it calls `NavController.navigateBack(from)`. That switches to the source tab with its stack intact.
  - Otherwise it pops its own stack.
  - With an empty stack (after a reload), it goes to its hub.
- **Android hardware back** uses the same rule, through `Platform.backButton.subscribeWithPriority`.
- **iOS swipe-back** follows the outlet stack, which would disagree with the button. It is turned off (`IonRouterOutlet.swipeGesture = false`) only while a view entered from another tab is shown, and turned back on when that view is left.
- **e2e:** Today → case → back returns to Today on all three devices. When Design is then selected, the Design stack's previous page is still there.

**Filters never push history.**

- Query-only history entries are not Ionic stack views, so back, iOS swipe and Android back would leave the page anyway.
- Every filter, sort and search change writes the URL with `replaceUrl: true`. Typing writes after a 150ms debounce.
- The URL is the only filter state:
  - A bare `/coding/problems` always shows the unfiltered list.
  - Links to filtered lists work.
  - The list page stays alive in its stack, so returning from the workspace restores its filters and scroll position.
- A filter is undone with its chip or "Clear all".

**Legacy routes** live in `apps/app/src/app/legacy-routes.ts` and stay permanently.

R5 note: one file cannot hold both groups, since the static import that puts the inline group in main would pull the `loadChildren` group in too. The inline group is `legacy-routes.ts`; the lazy one is `legacy-prefixes.ts`.

- Reminders already scheduled on devices open `/drill` (`reminder.service.ts:77`).
- Redirects that depend on the query use `redirectTo` functions that return a `UrlTree` with the query kept.
- The `loadChildren` legacy group is not preloaded, because `SerialPreloadingStrategy` skips `loadChildren` routes:
  - online, it loads on demand (about 1 kB);
  - the native apps load it from the bundle;
  - only an offline web visit to an old URL, before any network access, fails. That is acceptable.

**Preloading order.** `SerialPreloadingStrategy` preloads routes in array order, and that order decides offline coverage.

- The route array lists the five hub roots first; then the pattern hub, player, workspace, topic lesson, case study and Lab pages; then the rest.
- The strategy waits for a `firstIdle` promise before starting. `firstIdle` resolves when Today's idle `@defer` blocks have resolved, or 5 seconds after first paint.
- That way Today's own chunks are never queued behind about 40 route preloads on a throttled phone.

R5 note: the declaration order above puts each tab's details before its hub, so the array cannot also list the hubs first. Routes carry a `data.preload` rank instead (hubs and their default segments 0; pattern, player, workspace, topic lesson, case study and Lab 1; the rest after), and `SerialPreloadingStrategy` loads by rank, then in declaration order. Today has no `@defer` blocks yet, so `firstIdle` is the first idle period (`requestIdleCallback`, 5 s timeout).

### 2.6 Navigation by form factor

**Breakpoints** are 560, 1024 and 1280 (viewport).

- Component layouts use **container queries** on the page content container, because the rail changes the available width at the same viewport.
- Container sizes: `narrow` below 640px, `medium` 640 to 899px, `wide` 900px and up.
- The previous one-off viewport breakpoints are retired: 1100 for the player, 720 for the behavioral strip, and the sandbox's 1040. The style ratchet (5.0) rejects new ones.

**Phone and tablet (under 1024px): five bottom tabs**

| Tab        | Icon                  | Badge                                                                           |
| ---------- | --------------------- | ------------------------------------------------------------------------------- |
| Today      | `today-outline`       | items due in Review: cards + stories + mission revisits, read as "Today, 8 due" |
| Coding     | `code-slash-outline`  | none                                                                            |
| Design     | `git-network-outline` | none                                                                            |
| Behavioral | `people-outline`      | none                                                                            |
| Mock       | `chatbubbles-outline` | none                                                                            |

- **Badge.** It equals the total on Today's Review row, and the Review session can do every item it counts (4.9).
  - Today, `tabs.page.ts` adds mission revisits that `/drill` cannot do. So the badge reads 3 while Learn says "0 due" (`dark-pixel7-design-list-cases.png`).
  - The story count arrives from a dynamic import of `story-bank.service.ts` after first paint, so the badge first renders as cards plus revisits.
  - R5 note: until R35's Review session can do stories and mission revisits, the badge, Today's Review tile and the session's header all show the cards due in this sitting (`session.dueIncluded`, `ProgressService.reviewDue`).
- **Labels.** At 320px, each tab is 64px wide. Below 360px, labels drop to 11px. A Playwright check asserts that no label's `scrollWidth` exceeds its `clientWidth`.
  R5 note: the labels were already 11px at every width (`styles.scss`, capped with `chrome-font-size`), so nothing changes below 360px; the Playwright check holds at 320px.
- **Focus routes hide the tab bar** under 1024px. Focus routes are the player, workspace, mission, Lab and case build.
  - Their transport or run dock sits on the bottom safe area instead, and `app-back` returns the learner.
  - This is what gives the player the height it needs (3.7).
- **Header.** Each hub toolbar has a Search button. Today also has the Settings gear and a ⋯ menu (Send feedback, Study plan, Progress). The sync status shrinks to its icon, which shows its states (2.11).
- **Feedback.** The fixed right-edge Feedback tab covers cards in `dark-pixel7-learn.png`, the step counter in the player, and the choices in `dark-pixel7-case-study-decided.png`. It moves into Settings and the Today ⋯ menu. R1 first moves it into Settings and a Learn header menu.

**Desktop (1024px and up): left rail**

- **Build.**
  - The rail is 232px, built in plain HTML and CSS in `tabs.page.ts`. There is no `ion-menu` or `ion-split-pane` in first paint.
  - `ion-tab-bar` is `display: none`, so there is exactly one `Main` nav landmark.
  - A "Skip to content" link comes first.
- **Contents:**
  ```
  grasp.
  [ Search            Ctrl K ]
  Today                      8
  Coding
     Skill map · Problems 14/164 · Visualizers
  Design
  Behavioral
  Mock
  ─────────────
  Study plan     23 days left
  Progress
  Settings
  Send feedback
  ```
- **Section items** (Today, Coding, Design, Behavioral, Mock) call `IonTabs.select(tab)`, so each section's stack is restored. Selecting the active section returns to its root.
- **Sub-items** show only under the active section, so the rail never scrolls on a 768px-tall laptop. They pop that section's stack to the hub and set the segment.
- **Utility items** (Study plan, Progress, Settings) live in the Today stack. Opening one:
  1. selects Today if needed;
  2. pops any utility page that is on top;
  3. pushes the new page without animation.

  So the Today stack never holds two utility pages.

- **Current item.**
  - Exactly one rail link has `aria-current="page"`: the one whose URL is the current page.
  - When the page is inside a section but is none of its items (a case study, for example), the section item has `aria-current="true"`.
- **Counts** come from light catalogs already in first paint plus progress state:
  - "Problems 14/164" comes from `CODING_CATALOG`;
  - "23 days left" comes from the plan date with `calendarDaysBetween`.

  The rail shows no readiness numbers, because those need stories, which are not in first paint.

- **Focus routes** collapse the rail to a 64px icon rail, with a toggle remembered per device. At 1024px the content container is then 960px, which is `wide`. So the player and Lab keep their two-column layouts at every desktop width.
- R10 note: as built, the problem count comes from `PROBLEM_PATTERNS` (the catalog left first paint in R9), Progress waits for R14's route, a section is `aria-current="true"` on any page inside it but its own, and the rail is its own chunk, loaded from 1024px only; the R10 note in 5.2 has the rest.

**Tablet.**

- R0 adds two verify profiles to `tools/verify/lib.mjs`:
  - `w1024`: 1024×768, fine pointer;
  - `ipad`: iPad Mini portrait, 768×1024, touch, WebKit.
- R0 also adds an e2e `tablet` project (iPad Mini, WebKit) that runs the specs tagged `@nav`, `@player` and `@lab`.
- At 1024px with the rail expanded, the content container is 792px (`medium`). Today's aside and the Load Balancing breakout use container queries and stack at that width.

### 2.7 Today (`/today`)

Today is the only daily surface. On a phone it is one column. From top to bottom:

1. **Target line.** "Mid-level loop · Oct 25 · 23 days left · 45 min a day", with an Edit link. Below it, one meta line: "4-day streak · 320 XP".
   - **No Target yet:** a "What is your loop?" card (4.1), with level chips, date preset chips and "Build my plan".
     - Saving writes `target.set`, and also `plan.set` when a date is chosen.
     - If Coding is in the loop and no placement exists, the same card then offers "Skip what you know: 5-minute coding placement".
     - This card replaces the placement banner.
2. **Up next.**
   - **With a plan:** the plan's checklist for today (`days[0]`), through a shared `app-plan-today` component that `/today/plan` also uses. It is headed "1 of 5 done · about 25 min left". The first unchecked row that is not hidden expands into the Up next card.
   - **Without a plan:** one Up next card, with an "Other rounds" disclosure listing one item per other round.
   - **Loading.** Every lazy import in the route files (pages, the route titles and the legacy prefixes; only the tabs are exempt) goes through `lazy('…', () => import(…))`, which adds a `modulepreload` link for each chunk the module imports statically outside main and the tabs, so a cold load fetches the module and its shared chunks in one round trip instead of discovering them after the module's chunk arrives. `scripts/route-chunks.mjs` (postbuild) writes each module's chunks into index.html (29 modules, 58 chunks; 5.6 kB raw, about 1 kB gzipped, which no gate counts), reads `stats.json` through the first-paint gate's freshness check, and fails the build on a bare or misnamed import in `app.routes.ts`, `legacy-routes.ts` or `legacy-prefixes.ts`; `core/route-chunks.ts` reads the block. Dynamic imports of the engine's modules (a subpath export) were tried first: esbuild gives each one a facade chunk that imports the shared chunk, so they still took two round trips. Topic states moved to `readiness/topic-status.ts`, on `readiness/skill-status.ts` (what every skill state shares), so the Topics load neither the problem catalog nor the behavioral and interview content that `status.ts` reads. On `timing.mjs`'s phone (7 runs, HTTP/2, against e539b00) the Design tap is 1.23 s against 0.90 s (Learn's cards needed no chunk outside first paint; an overview-only Topics measured 1.19 s, so the rest is the shared chunks' bytes), the Coding tap 1.21 s against 1.59 s, the player tap 3.81 s against 4.51 s. First paint grows 2.12 kB (the level fields and the `lazy` wrappers).

- **Topics:**
  - First, a shelf overview: 6 tiles, each reading like "Ready 1 of 5", all on the first screen at every profile. Then the six shelves.
  - Each topic row shows its state, a Core or Advanced chip, and "Used in 1 mission · 3 cases".
  - Each shelf ends with its **home missions** and "Cases that use this shelf (n)".

  | Shelf                 | Topics (core, then advanced)                                                                                                                                                    | Home missions (the topics of this shelf each mission uses)     |
  | --------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- |
  | Foundations (5)       | Estimation, Latency & Queueing, Capacity & Scaling, Load Balancing, Reliability                                                                                                 | Your First Scale-Up (5 of 5), Leaderboard on a Budget (2 of 5) |
  | Data (9)              | Data Modeling, Replication, Sharding & Partitioning, Consistency & Quorums, Unique IDs; Storage Engines, Durability & Erasure Coding, Backups & Disaster Recovery, Multi-Region | The Write Wall (5 of 9), Attachments Everywhere (2 of 9)       |
  | Reads at scale (4)    | Caching, CDNs & Edge; Search & Indexing, Geospatial Indexing                                                                                                                    | The Feed Goes Viral (4 of 4)                                   |
  | Async & delivery (5)  | Queues & Async Work, Backpressure & Load Shedding, Real-Time Delivery; Stream Processing, Batch Processing                                                                      | Flash Sale at Noon (3 of 5), Reconnect Storm (2 of 5)          |
  | Coordination (5)      | Consensus & Leaders, Distributed Locks & Leases, Distributed Transactions, Time & Clocks, Service Discovery (all advanced)                                                      | Month-End Ledger (3 of 5)                                      |
  | Edge & operations (6) | API Design, Rate Limiting & Abuse; API Gateways & Service Meshes, Security & Auth, Multi-Tenancy, Observability & SLOs                                                          | Bot Storm (4 of 6)                                             |
  - **R4 moved two topics** (R11 pins the table above in `shelves.spec.ts`): Real-Time Delivery to the async shelf, renamed "Async & delivery", and Multi-Region to Data.
  - **Home-shelf rule.** It is implemented as `shelfMissions()` in the engine and pinned by a spec.
    - A mission's home is the shelf with the most topics whose `scenarioIds` list it.
    - A tie goes to the shelf with fewer home missions so far, then to the shelf whose topics it covers the larger share of (so The Feed Goes Viral, 4 topics on Data and on Reads, stays home on Reads). Missions are processed in `SCENARIO_CATALOG` order.
    - Example: The Feed Goes Viral uses 4 topics on Data and 4 on Reads at scale. Neither shelf has a home mission yet, so the larger share (4 of 4 against 4 of 9) takes it to Reads at scale.
    - The coverage count is always shown, so a thin link is visible rather than hidden.
  - **Also practised in.** Under each shelf, a quiet line lists other missions that touch it: "Also in: Your First Scale-Up (Service Discovery), Flash Sale at Noon (Distributed Transactions, Distributed Locks & Leases)", with full topic names (R11).
  - **Coordination `scenarioIds`** (R11 content review): Consensus & Leaders moved from Your First Scale-Up to Month-End Ledger, Distributed Locks & Leases gained Month-End Ledger, and Service Discovery gained Reconnect Storm, so Month-End Ledger is Coordination's home at 3 of 5. Time & Clocks stays on The Write Wall.
  - **New fields:** `SdTopic.shelf` and `SdTopic.level: 'core' | 'advanced'` (`level` is a field; the shelf is the lookup `sdTopicShelf`, see the R11 note).

- **Missions:** the 9 missions in a 2-column grid, with passed, best cost and revisit due, plus a Lab card. Topology thumbnails arrive in R39.
- **Cases:** 4.5.
- **Behavioral.**
  - **Competencies:** 13 rows with state, "7 questions · 1 story", Flagged, and "Senior focus" at Senior.
  - **Questions:** all 91 (4.8).
  - **Stories:** the story bank, as a hub segment.
  - **Guide:** STAR moves to `/behavioral/guide`, linked in one line.
  - **STAR drill:** linked from the Questions segment header ("Timed drill: 3 questions, checks at the end").
- **Mock.**
  - **Full loop card first:** "One round of each: Coding 45 · System design 45 · Behavioral 20 min", with the level from the Target.
  - **Single round cards:** one per round in the Target.
    - Each shows readiness and the last verdict, and opens a start sheet.
    - The competency is picked inside that sheet. This removes the second list of 13 "Start →" launchers (`interview-home.page.ts:87-101`).
    - Behavioral + Scripted starts an API session like every other round. This replaces the silent redirect to `/behavioral/mock` in `start()` (`interview-home.page.ts:461-468`).
  - **History:** grouped by round.
  - **Offline:** "Mock rounds need a connection. Your last 5 scorecards are below.", using `g-empty-state`.

### 2.9 Search and filters

**Index.** A new lazy module, `libs/engine/src/search/`:

- **Generated data.**
  - `search/index.data.ts` is generated by `npm run gen:search`, a node script over the built engine, and committed.
  - A spec regenerates it in memory and fails if the committed file is stale.
  - It holds only titles, aliases, ids, kinds and short blurbs, drawn from:
    - patterns and their one-liners;
    - problems (title, difficulty, pattern ids);
    - visualizers;
    - topics with their `oneLiner`;
    - the 9 missions;
    - cases with their `summary` from `case-briefs.ts` (9.7 kB of source, already separate from the 1.1 MB `sysdesign/cases/` modules);
    - the 13 competencies;
    - the 91 question prompts, extracted from `behavioral/competencies/*.ts` so the 72 kB of guides never load;
    - the 8 mock problems.
- **Mock problems offline.**
  - The mock problem index (id, track, title, `catalogId`, pattern ids) moves from `apps/api/src/interview/problems.ts` into `libs/engine/src/interview/mock-problems.ts`. The API imports it and keeps the prompts and rubrics.
  - Search can then list "Rate Limiter · Mock round" offline. Choosing it opens the Mock hub with that round's start sheet, which needs the network and says so.
  - An API spec asserts that every API problem id is in the engine index.
- **Size:** about 28 kB of data plus a 3 kB scorer, budgeted at 40 kB minified and enforced by the chunk test. Stories are searched on the device and never indexed.
- **Scoring:** token-prefix matching with no dependency. Exact title 100, title prefix 60, alias 50, word prefix 40, tag 25, blurb word 10.
- **Aliases** (`search/keywords.ts`):
  - old mock titles, such as "Ship Within D Days" ("Course Schedule Order" stays its own title);
  - "Koko" → Minimum Eating Speed;
  - pattern cue words: "sorted", "k-th", "contiguous", "prerequisites".

  A spec asserts that every alias target id exists.

- **No hits:** suggest the closest title or alias within edit distance 2 ("Did you mean Rate Limiter?").
- **Ranking spec:** about 40 query → top-result pairs.

**Entry points:**

- **Desktop:** Ctrl/Cmd+K anywhere (ignored inside the code editor), or the rail field, opens a 640px palette.
  - The palette is a native `<dialog>` opened with `showModal()`, so it is modal and `aria-modal` is implicit.
  - Inside it: an input with `role="combobox"` and `aria-activedescendant`.
  - Results are grouped by round, then kind, at most 8 per group, with "See all 23 problems →".
  - Esc closes it, and focus returns to the launcher.
- **Phone:** no overlay, which avoids iOS keyboard and modal trouble. Each hub has an inline search field that filters that hub in place. It offers "Search everything", which opens `/today/search?q=` (4.10).
- **"/" key:** works only when single-key shortcuts are on (`ShortcutsService.characterKeys`).

**Filters.**

- **URL state** uses `replaceUrl` (2.5). There is no per-device filter memory.
- **Phone layout.** At container `narrow`, filters sit behind a "Filters (2)" button. It opens a modal sheet, which is correct here because the sheet is a form. The sheet has a sticky "Show 31 results" button and returns focus to the trigger.
- **Counts.** Each facet count excludes its own selection. The result count is announced in a polite live region.
- **Spoilers.** Pattern tags on problems would spoil the recognition step, so:
  - they are hidden in the Mixed view and in search results;
  - they show inside a pattern hub, in the By-pattern view (where the pattern is the group header), after a solve, or when the per-device "Show pattern tags" toggle is on.

### 2.10 Naming: one term per concept

| Concept                              | Term                                                                   | Retired                                                         |
| ------------------------------------ | ---------------------------------------------------------------------- | --------------------------------------------------------------- |
| Spaced queue                         | **Review** (`/today/review`, `albums-outline`)                         | the "Practice" title; `flash` used for three things             |
| Unscheduled quiz                     | **Drill** ("Drill: Binary Search", "Drill 7 cards", `barbell-outline`) | "Practice 7 items", "Practice · not scheduled"                  |
| Timed behavioral answers with checks | **STAR drill**                                                         | "Mock behavioral interview" (`/behavioral/mock`)                |
| Lesson quiz                          | **Quick check** (`help-circle-outline`)                                | the "Practice" chip (question-card `REASON_LABELS`)             |
| Wrong-answer link                    | "Read the Arrays & Hashing lesson →"                                   | "Review Arrays & Hashing →" (`algorithm-items.ts:11`)           |
| The day's list                       | **Today**                                                              | "Today's loop"                                                  |
| Three-round rehearsal                | **Mock loop** (the only "loop")                                        |                                                                 |
| One rehearsal                        | **Mock round**, mode "Scripted" or "AI", always with a verdict         | "Scripted practice", "Behavioral practice"                      |
| Step-through player                  | **Visualizer**; "Watch" in a pattern hub                               | the Visualize tab                                               |
| System design sandbox                | **Lab**; missions; "Build it in the Lab"                               | the Design Lab tab                                              |
| Card-strength metric                 | **Review strength**                                                    | "overall mastery"                                               |
| Coverage metric                      | **Loop readiness**                                                     |                                                                 |
| Plan pace input                      | **Starting point** (New, Rusty, Confident)                             | "Where you are starting", and any use of "level" for this input |

**Renames, made at the source:**

- `SD_TOPICS`: "Caching & CDNs" becomes "Caching", and "Replication & Databases" becomes "Replication".
- The visualizer "Tree DFS: Preorder, Inorder, Postorder" becomes "Tree Traversal: preorder, inorder, postorder".
- The lesson text "Ship Packages Within D Days" (`lessons/foundations-core.ts:330`) becomes "Capacity To Ship Packages Within D Days" and links the problem.
- Mock problems gain a nullable `catalogId` and render their titles from the catalogs. Catalog titles are the source and are not renamed:

| Mock title today                                                             | Shown as                                                                 | `catalogId`                                                                                                                         |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| Days Until Warmer                                                            | Days Until Warmer (already the catalog title, `coding/catalog.ts:87-88`) | `daily-temperatures`                                                                                                                |
| Ship Within D Days                                                           | Capacity To Ship Packages Within D Days                                  | `ship-within-days`                                                                                                                  |
| Longest Repeating Run With K Changes                                         | Longest Repeating Character Replacement                                  | `character-replacement`                                                                                                             |
| Course Schedule Order                                                        | Course Schedule Order (unchanged)                                        | `null`. It returns an order (`problems.ts:36-40`), while catalog `course-schedule` returns a boolean (`problems/graphs.ts:164-167`) |
| Design a URL Shortener / News Feed / Distributed Rate Limiter / Chat Service | URL Shortener / News Feed / Rate Limiter / Chat App                      | the matching case ids                                                                                                               |

- A spec checks that every non-null `catalogId` exists and that the titles match. A null `catalogId` needs a `noCatalogReason` string.
- Old titles become search aliases.
- A catalog "Course Schedule II" problem is a content follow-up.

**Near-twin cases.** Payment System and Payment Ledger, and Ticket Booking and Hotel Booking, each get a one-clause differentiator in their brief. Each pair links to each other under Related. Both go through content review in R11.

### 2.11 Where data lives, and per-device preferences

| Data                                                                                                      | Stored                                                   | Synced                                          | Used by                                           |
| --------------------------------------------------------------------------------------------------------- | -------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------- |
| Event log: reviews, predictions, solves, missions, cases, interviews, `plan.set`, `target.set`, placement | device and server                                        | yes, for every learner (anonymous ids sync too) | readiness, states, Up next, badge                 |
| Story bank: stories and their rehearsal ladder                                                            | device; also the account when signed in                  | only when signed in                             | competency states, Review                         |
| Code, STAR and case drafts; mock loop progress; saved Lab designs                                         | device (`local-drafts.ts`, Preferences)                  | never                                           | Continue, Up next rule 4, "Drafted (this device)" |
| Device preferences (listed below)                                                                         | device (Preferences, through one `core/device-prefs.ts`) | never                                           | UI only                                           |

**Device preferences:**

- existing: theme, shortcuts;
- new: Motion (System / Reduced / Full), Checkpoints (On the picture / As a list), Show pattern tags, Debugger view, rail collapsed, library view (By pattern / Mixed), Not today ids, "Where things moved" seen, first-run card dismissed until, coach marks seen.

These are per device on purpose. Motion and list mode depend on the screen and the pointer, so they need no schema change and no synced event. The Motion preference is also mirrored to `localStorage` (like `FIRST_PAINT_KEY` in `theme.service.ts`), so `main.ts` can read it before bootstrap (3.5).

**Sync status icon** (in the header): synced, syncing, offline or failed. Tapping it opens a small popover, for example:

- "Offline. Your work is saved on this device and syncs when you are back."
- "Sync failed · Retry".

### 2.12 Every current route and its new place

| Current route                                                                                    | New place                                                                                                                                                                                          | Tab lit         | Notes                                                         |
| ------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------- |
| `''`, `/learn`                                                                                   | `/today`                                                                                                                                                                                           | Today           | Learn retired                                                 |
| `/learn/pattern/:id`                                                                             | `/coding/patterns/:id`                                                                                                                                                                             | Coding          |                                                               |
| `/learn/design/:id`                                                                              | `/design/topics/:id`                                                                                                                                                                               | Design          |                                                               |
| `/visualize`                                                                                     | `/coding/visualizers`                                                                                                                                                                              | Coding          |                                                               |
| `/visualize/:id?input=`                                                                          | `/coding/visualizers/:id?input=`                                                                                                                                                                   | Coding          | query kept                                                    |
| `/design`                                                                                        | `/design` (Topics)                                                                                                                                                                                 | Design          | missions move to `/design/missions`, cases to `/design/cases` |
| `/design/case/:id`                                                                               | `/design/cases/:id`                                                                                                                                                                                | Design          | inline legacy route                                           |
| `/design/free-build`                                                                             | `/design/lab`                                                                                                                                                                                      | Design          | inline                                                        |
| `/design/free-build?case=X`                                                                      | `/design/cases/X/build`                                                                                                                                                                            | Design          | inline, function redirect                                     |
| `/design/:scenarioId?revisit=n`                                                                  | `/design/missions/:scenarioId?revisit=n`                                                                                                                                                           | Design          | inline `UrlMatcher`, only for ids in `SCENARIO_CATALOG`       |
| `/drill`                                                                                         | `/today/review`                                                                                                                                                                                    | Today           |                                                               |
| `/drill?pattern=p`                                                                               | `/coding/patterns/p/drill`, or `/design/topics/p/drill` for `sd-` ids                                                                                                                              | Coding / Design |                                                               |
| `/diagnostic`                                                                                    | `/coding/placement`                                                                                                                                                                                | Coding          |                                                               |
| `/interview`                                                                                     | `/mock`                                                                                                                                                                                            | Mock            |                                                               |
| `/interview/loop`                                                                                | `/mock/loop`                                                                                                                                                                                       | Mock            |                                                               |
| `/interview/:id`                                                                                 | `/mock/:id`                                                                                                                                                                                        | Mock            |                                                               |
| `/behavioral`                                                                                    | `/behavioral`                                                                                                                                                                                      | Behavioral      | now a tab                                                     |
| `/behavioral/:id`, `/behavioral/question/:id`, `/behavioral/stories/:id`, `/behavioral/rehearse` | unchanged                                                                                                                                                                                          | Behavioral      | rehearse is also reachable from the Review session            |
| `/behavioral/stories`                                                                            | same URL, now a hub segment                                                                                                                                                                        | Behavioral      |                                                               |
| `/behavioral/mock?question=`                                                                     | `/behavioral/drill?question=`                                                                                                                                                                      | Behavioral      | inline, before `behavioral/:id`                               |
| `/code`                                                                                          | `/coding/problems`                                                                                                                                                                                 | Coding          |                                                               |
| `/code/:id`                                                                                      | `/coding/problems/:id`                                                                                                                                                                             | Coding          |                                                               |
| `/plan`                                                                                          | `/today/plan`                                                                                                                                                                                      | Today           |                                                               |
| `/settings`                                                                                      | `/today/settings`                                                                                                                                                                                  | Today           |                                                               |
| `**`                                                                                             | `/today`                                                                                                                                                                                           | Today           |                                                               |
| (new)                                                                                            | `/today/progress`, `/today/drill`, `/today/search`, `/coding/patterns/:id/problems`, `/design/missions`, `/design/cases`, `/design/topics/:id/drill`, `/behavioral/questions`, `/behavioral/guide` |                 |                                                               |

**Links are fixed at their source, not only redirected:**

- the engine's `review/algorithm-items.ts` (`patternLink` and the visualizer link);
- `reminder.service.ts`;
- `plan.page.ts` `link()`;
- every `routerLink` and `defaultHref`;
- `route-titles.ts`;
- `pilot-notice.component.ts` (`routerLink="/settings"`);
- `tools/verify/states/*.mjs`, `timing.mjs` and the e2e specs.

A grep gate in `routes.spec.ts` fails on any old prefix outside `legacy-routes.ts`. A new `e2e/legacy-links.spec.ts` opens every old URL shape on all three devices and asserts the final URL, the h1 and the lit tab.

### 2.13 First run and notices

At most one modal ever shows, and notices never stack:

1. **Pilot notice.** The existing modal (`backdropDismiss=false`), on first launch only. In R1 its copy changes from "Use the Feedback tab on the right edge" (`pilot-notice.component.ts:21`) to "Send feedback any time from Settings".
2. **"What is your loop?"** An inline card at the top of Today, never a modal. "Not now" hides it for 7 days (a device preference).
3. **Placement offer.** It appears only inside that card, after the Target is saved, and only if Coding is in the loop.
4. **"Where things moved".** An inline, dismissible note on Today, shown once:
   - only to learners with events from before R5;
   - never in the same session as the pilot notice.

### 2.14 Journey acceptance (learner-facing checks)

These are scripted e2e journeys from a cold start, on Pixel 7 and desktop. Each becomes a pass/fail check in the iteration named in the last column.

| Journey                          | Today                                                                 | Target                                                                                                                                                                                             | Checked in                 |
| -------------------------------- | --------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------- |
| "Interview in 3 weeks"           | Learn tile, then a form, then a Today list stranded on a tabless page | First-run card: level chip, "3 weeks" chip, "Build my plan". A dated checklist on Today in 3 taps. Defaults (all editable under "Details"): rounds by level, 45 min, starting point New            | R9                         |
| "Amazon loop in 3 weeks"         | no company field                                                      | the same 3 taps plus the Amazon chip, so 4 taps; principle chips appear on behavioral rows                                                                                                         | R48                        |
| "All graph problems"             | open 7 pattern pages, or scroll ~20 screens                           | Coding → Problems → Track: Graphs & trees, in ≤ 3 taps. Shows "51 problems" as 57 rows under 7 pattern headers (6 problems sit under two graph patterns)                                           | R8                         |
| "Find the rate limiter case"     | 4 unlinked places                                                     | Search "rate" (≤ 4 keystrokes): the Rate Limiting & Abuse topic, Bot Storm, the Rate Limiter case and the Rate Limiter mock round in one list. Or browse Design → Cases → Rate Limiter in ≤ 3 taps | R11 (browse), R15 (search) |
| "Continue where I left off"      | not shown anywhere                                                    | Continue in the first screen at 1280×720, and within 1.5 screens on Pixel 7                                                                                                                        | R14                        |
| "Practice weak areas"            | signals scattered over 4 places                                       | Weak spots → "Drill these": 1 tap                                                                                                                                                                  | R14                        |
| "Browse system design"           | ~3,300px down Learn                                                   | Design tab: the 6-tile shelf overview, with counts, on the first screen at every profile                                                                                                           | R11                        |
| "Questions about conflict"       | 5 scrolls deep                                                        | Behavioral → Questions → Conflict chip (3 taps), or search "disagree"                                                                                                                              | R12                        |
| "Overall progress"               | 4 stats that ignore solves, cases and stories                         | readiness card → Progress: 1 tap                                                                                                                                                                   | R14                        |
| "Back from a cross-section link" | lands in the other tab's old stack                                    | Today → case → back returns to Today on all three devices, Android back included                                                                                                                   | R5                         |

---

## 3. Visual and interaction language

### 3.1 Principles

1. **One stage, fixed slot.**
   - The visual has a reserved height, computed from the viewport (3.7), and never moves.
   - Questions, verdicts and narration live in docks beside or under it.
   - A step never scrolls the page.
2. **Every step is a visible change.**
   - The renderer derives events from frame diffs and animates them in order: cause, then change, then consequence.
   - A step with no visible change gets a short dwell and the caption "no visible change".
3. **Predict on the picture, then watch it pay off.**
   - The learner taps the cell, taps the node, types the value, or drags where the gesture is the concept.
   - The guess stays as a dashed ghost while the real step animates against it.
   - A list of choices is always available.
4. **Every adjustable number lives on the drawing.** Where a quantity has a place in the picture, its control goes there, not in a stack of range inputs. Examples: lanes, a slow server, a read time, the Lab's traffic.
5. **Systems are drawn, run and measured over time.** Edit on a board, press Run, and watch traffic, heat and sparklines against goals.
6. **Data never wears chrome colors.**
   - Accent purple is for controls and focus only.
   - Diagrams use three state hues, one heat ramp and neutral ink.
   - State never relies on color alone.
   - Text never drops below 4.5:1 contrast.
7. **Native and lazy.**
   - SVG, CSS and the Web Animations API only: no d3, GSAP, elkjs or dagre.
   - Kit code loads only from lazy routes and never reaches the first-paint closure.

### 3.2 Chrome kit and tokens (`apps/app/src/app/ui/`)

**Tokens**, in `apps/app/src/_theme.scss` and `styles.scss`:

| Group        | Values                                                                                                                                                                                                                                                              |
| ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Spacing      | `--g-space-1..8` = 4, 8, 12, 16, 20, 24, 32, 48                                                                                                                                                                                                                     |
| Radius       | xs 6, sm 10, md 14, lg 20, pill                                                                                                                                                                                                                                     |
| Type roles   | 9 roles: display-xl, display-l, title-l, title-m, title-s, body-l, body, body-s, label. `label` is the one uppercase eyebrow style and replaces the 11 current uppercase-label styles                                                                               |
| Widths       | reading 760, content 1080, workbench full-bleed to 1440. Retires 640 (settings), 780 (interview session) and the one-offs                                                                                                                                           |
| Breakpoints  | viewport 560, 1024, 1280; container `narrow` < 640, `medium` 640–899, `wide` ≥ 900                                                                                                                                                                                  |
| Status tones | `--g-{success,warn,danger,info,predict}-{ink,line,soft,fill}`. Text uses `ink` (≥ 4.5:1 on its surface). `line` is ≥ 3:1. `soft` is a 12 to 18% wash. `fill` is only for small marks (dots, badges). Light predict olive and light warn brown are never large fills |

**Enforcement without stylelint.** stylelint is not installed (the repo uses oxlint), so enforcement is a node test:

- `apps/app/scripts/style-tokens.test.mjs` runs through the existing `node --test scripts/*.test.mjs`.
- It scans `.scss` files and the inline `styles:` template literals in `.ts` components (94 files).
- It flags raw px/rem values in `font-size`, `border-radius` and `@media` widths.
- It allows `var(--g-…)`, the existing `chrome-font-size()` helper, `inherit`, `0` and `50%`.
- It compares counts per file against a committed baseline that may only go down. Today there are 43 font sizes and 77 padding values.
- Migrated files must reach 0.
- R6 note: those counts were never measured that way; by R0's rules the ratchet held 610 raw values in 107 files. R6
  added spacing (1,031 values) and the tokens, mixins and roles 5.2's R6 note lists; it now holds 1,600 in 111 files
  (font-size 479, spacing 1,025, border-radius 90, media 6).

**Theme fixes:**

- **Light: raised vs sunken.**
  - Raised controls become white, with a border and a light shadow.
  - Wells and readouts become sunken (#eef0f5).
  - Today, a secondary `.g-btn` on `#f0f2f6` reads as disabled (`light-desktop-behavioral-competency.png`).
- **Dark: depth.**
  - Surfaces step further apart (#0b0d12 / #141824 / #1c2130), with a 1px inner top highlight and a real overlay shadow. Today `--g-shadow` is `none`.
  - **No panel inside a panel.** Inner groups use dividers or a sunken well. `templates.spec.ts` rejects a `.panel` nested in a `.panel` in migrated templates.
- **Calmer accent fills.**
  - The candidate chat bubble becomes accent-soft with an accent line.
  - Disabled primaries use a neutral disabled token, instead of `opacity: 0.4` over lavender.
  - Selected chips use the `g-segmented` selected style. Today they are lavender-filled, as on the competency chips in `dark-pixel7-behavioral-story.png`.
- **Fonts.**
  - Space Grotesk only at 1.25rem and above.
  - Card titles and smaller h2/h3 use Inter 600 with normal tracking. This fixes the cramped debrief prompts.
  - JetBrains Mono is for code and complexity only.
- **Text fields.** `g-textarea` removes native resize grips (`resize: none`) and grows with its content: `field-sizing: content`, plus a small autosize directive where WebKit lacks that property.

**Components:**

- **`g-page-header`:** eyebrow, title, lede, meta and actions.
  - It uses `ion-header collapse="condense"`, so ion-title and h1 stop duplicating ("URL Shortener" appears twice in `dark-desktop-case-study.png`).
  - Headers on visual pages are opaque.
- **`g-section`:** its icon tone follows meaning (danger for Pitfalls, success for Strengths).
- **`g-disclosure`:** a rotating chevron, not the native triangle.
- **`g-article`:** article styles shared by `pattern.page.ts` and `design-lesson.page.ts`, which today duplicate their article CSS.
- **`g-entry-row`:** one row for every library list.
  - leading: status glyph plus kind glyph;
  - title: Inter 600, 15px;
  - meta: kind · shelf · level pips with screen-reader text · ~minutes from `plan/minutes.ts` · status text ("best 2/5", "Stage 2 of 9");
  - height: 48px on phone (single line), 52px on desktop.
- **`g-chip`:** a fixed order of pattern, then difficulty, then complexity.
- **`g-segmented`:** the single "selected option" style everywhere. It replaces 7 looks, including widget radios rendered as `g-btn [class.primary]`, which look like the page's main call to action.
- **`g-stat`** (Inter tabular-nums), **`g-empty-state`** (icon, tone, title, body, one action), and **`g-filter-bar`** with **`g-filter-sheet`**.
- **`g-slider`, `g-check` and `g-textarea`:** skins for the 78 native inputs. Two inputs show why:
  - on the dark ring widget, the "100 virtual nodes" checkbox renders as a light-blue system box;
  - "Spot the problems" uses gray system checkboxes (`dark-pixel7-behavioral-examples-checked.png`).
- **`app-back`** (2.5).
- **One icon map** (`ui/icons.ts`): outline icons, filled icons only for state, one glyph per concept.

### 3.3 Visualization kit (`apps/app/src/app/viz/kit/`, pure logic in `libs/engine/src/viz/`)

**Contract for every primitive:**

- **Inputs:** `view`, `events`, `focus`, `pickMode`, `static` (for thumbnails) and `scale`.
- **Output:** `picked(Locator)`.
- **Rendering:** 1 viewBox unit = 1 CSS px. `g-stage` measures its width with a ResizeObserver, so 12px labels are 12px everywhere. This fixes ticks rendering at about 16px under `widget.scss`'s 520px cap.

| Primitive                                                   | Replaces                                                                                  | Key rules                                                                                                                                                                                                                                                                                                                                                 |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `g-stage`                                                   | `.scene`, widget wrappers                                                                 | Sunken well with a 24px dot grid. Height from the layout formula (3.7), fixed for the run. Layers for data, annotations (ghosts, callouts) and hit targets. `role="group"`, `aria-roledescription="visualization"`. "Describe" opens a data table of the frame                                                                                            |
| `g-transport`                                               | player controls, the `code/trace-player.component.ts` transport                           | 3.7                                                                                                                                                                                                                                                                                                                                                       |
| `g-checkpoint`                                              | `.predict`, question-card choices, `widget-check`, case-stage decision and estimate cards | 3.8                                                                                                                                                                                                                                                                                                                                                       |
| `g-code`                                                    | `code-panel`                                                                              | Soft wrap with a hanging indent. Gutter: line number, checkpoint diamonds, execution count "×3". Active line bar plus an underline on `Frame.span`. Inline lens at line end ("0 + 7 < ∞ ✓"). Scrolls only when the active line leaves the middle third, and then instantly                                                                                |
| `g-watch`                                                   | `.vars dl` tiles                                                                          | Rows of name / value / was. Changed rows get a 2px left bar, a 400ms flash and the old value struck through (ports `trace-player.component.ts:205` `changed`). Pinned derived watches (`nums[mid]`, `hi - lo + 1`). Values already drawn on the stage collapse under "On the stage"                                                                       |
| `g-why`                                                     | none                                                                                      | Tap any value for its history ("dist[2]: ∞ at step 1, 9 at step 6 via line 9, 7 at step 11"), with seek buttons. Computed from events                                                                                                                                                                                                                     |
| `g-array`                                                   | `array-view`                                                                              | Keyed cells (`ids`) that FLIP on swap or shift. Cells 28 to 56px. Below 28px, the row scrolls with edge fades and a "2 more" cue. Eliminated cells are hatched. The window is a neutral bracket, not purple                                                                                                                                               |
| `g-pointer`                                                 | `.ptr` tags                                                                               | Neutral pins labelled `lo`, `hi`, `prev`: pointers are labels, not colors (deletes `POINTER_COLORS`). Only the pin on the current cell takes the current hue                                                                                                                                                                                              |
| `g-graph`                                                   | `graph-view`                                                                              | Hand-tuned layouts for default inputs; `layered.ts` (BFS layers plus barycenter) for random inputs instead of `circleLayout`. Node radius clamp(14, w/24, 22)px with 14px labels. Weight pills offset away from crossings. One distance pill at each node's top-right. A relax particle travels along edges. Rejected edges get a red × and a "cycle" tag |
| `g-tree`                                                    | `tree-view`                                                                               | Laid out once from the whole trace, so future nodes are faint ghosts from frame 1 and nothing jumps. Edge labels "take 1" and "skip 1". Leaves become result chips                                                                                                                                                                                        |
| `g-table`                                                   | `table-view`                                                                              | Formula chip on the active cell ("max(↑2, ←1) = 2"). Dependency arrows: diagonal +1 for a match, up/left for max, the winner solid. The value lands in the cell. Binary headers for bitmask rows. A traceback polyline                                                                                                                                    |
| `g-heap`, `g-hashmap`, `g-list`, `g-linked-list`            | chip rows, `list-view`                                                                    | Heap: a tree over its array, with swaps arcing in both. Hashmap: bucket rows with lookup probes. Lists are keyed by value, so a dequeue removes the front chip. Linked list: arrows swing about their source, then a final re-layout puts nodes in reading order                                                                                          |
| `g-timeline`, `g-sequence`                                  | lease, stream, retry SVGs                                                                 | Timeline: lanes over a time axis, numbered events, watermark, spans. Sequence: swimlanes with travelling messages, lost messages breaking with ×, timeout brackets                                                                                                                                                                                        |
| `g-chart-frame`, `g-sparkline`, `g-histogram`               | queue, overload, latency SVGs                                                             | Axes, ticks, units, fixed scales across settings, threshold lines, a log option, a data table toggle                                                                                                                                                                                                                                                      |
| `g-sys-node`, `g-sys-edge`, `g-sys-diagram`, `g-sys-canvas` | sandbox rects, `edge-path.ts`                                                             | 4.6                                                                                                                                                                                                                                                                                                                                                       |
| `g-handle`                                                  | range inputs that have a place on the picture                                             | `role="slider"` on the drawing, snapping to valid values, `aria-valuetext` in words                                                                                                                                                                                                                                                                       |
| `g-thumb`                                                   | text-only gallery cards                                                                   | Static final frame, `aria-hidden`                                                                                                                                                                                                                                                                                                                         |

**Budget rules:**

- **Lazy only.** Kit modules are imported only by lazy route components. `tabs.page.ts` and the Today page never import the kit; `mastery-ring` moves to `ui/`.
- **Leak guard.** The first-paint closure test (5.0) fails if any `viz/kit/` or `libs/engine/src/viz/` module is in the closure of main, the tabs chunk or the Today chunk, not only in Angular's initial chunks.
- **Size targets.** Core plus structures ≤ 45 kB minified; system design ≤ 30 kB; charts ≤ 10 kB.
- **Styles.** Split per sub-component to respect the 12 kB `anyComponentStyle` budget, and never placed in global `styles.scss`.

### 3.4 Engine contract (additive, so tracers migrate one at a time)

```ts
// libs/engine/src/algorithms/types.ts
interface ArrayView {
  /* existing */ ids?: string[];
}
interface StackView {
  /* existing */ ids?: string[];
}
interface Frame {
  /* existing; note stays as the long explanation */
  caption?: string; // at most 80 characters: the one-line narration (two lines at 320px)
  span?: [number, number]; // columns of the evaluated expression on `line`
  lens?: string; // "0 + 7 < ∞ → true"
  chapter?: string; // "Row 3 of 7", "Settle node 4"
  events?: VizEvent[]; // semantic extras; the rest comes from diffFrames
}
type Locator = { view: 'array' | 'table' | 'grid'; at: number | [number, number] } | { view: 'graph' | 'tree'; id: string };
type VizEvent =
  | { kind: 'compare'; a: Locator; b: Locator; text: string } // "16 < 23"
  | { kind: 'move'; pointer: string; from: number; to: number }
  | { kind: 'write'; at: Locator; from?: Scalar; to: Scalar }
  | { kind: 'swap'; a: Locator; b: Locator }
  | { kind: 'push' | 'pop'; list: 'stack' | 'queue' | 'set' | 'output'; key: string }
  | { kind: 'relax'; edge: [string, string]; improved: boolean }
  | { kind: 'link'; from: string; to: string | null; was?: string | null }
  | { kind: 'union'; child: string; root: string }
  | { kind: 'settle' | 'discard' | 'reject'; at: Locator[]; why?: string };
interface Prediction {
  /* existing choices and answer stay required */
  pick?: { on: 'cell' | 'node' | 'edge' | 'value'; answer: Locator | number; accept?: Locator[] };
  act?: { kind: 'move-pointer' | 'link' | 'union'; answer: unknown }; // drag only where the gesture is the concept
  skill?: string;
  tier?: 1 | 2 | 3;
  focus?: Locator[];
}
```

**Narration.**

- Tracer `note`s run 100 to 130 characters. Example: "Closest unsettled node is … because every edge weight is non-negative" (`dijkstra.ts:132`).
- The new `caption` is the line shown on the stage and during checkpoints. `note` stays, and opens under "Why?" and in Describe.
- R17 and R18 write captions, chapters, spans and lenses for all 23 tracers. A spec checks that:
  - every frame of every tracer's default input has a caption of at most 80 characters;
  - every tracer has at least 2 chapters.
- Until then, the stage shows the first sentence of `note`, truncated, with "Why?".

**Engine modules:**

- `viz/diff.ts` (`diffFrames`);
- `viz/keys.ts`;
- `viz/describe.ts` (screen-reader text and the Describe table);
- `viz/pace.ts`;
- `viz/checkpoints.ts` (`pickCheckpoints`);
- `viz/layout/tidy-tree.ts` and `viz/layout/layered.ts`;
- `viz/route.ts` (orthogonal router).

**Fields added elsewhere:**

- `AlgorithmDef.presets: { label, input }[]`.
- `review/algorithm-items.ts` adds `after: frames[i + 1]`.
- `PatternLesson.anchors`, `WorkedExample.stepFrames`, and `SdLesson.widget.experiments`. `tryThis` stays as the fallback until each lesson migrates; R45 removes the last one.
- `WidgetCheckpoint.act` (set-number with a tolerance).
- `balanceRun(..., { samples })`, returning `series` and `histogram`.
- `SimResult.queues`, and `simulateTimeline` in `sysdesign/timeline.ts`.
- New fields on `CASE_LABS[id]`:
  - `roles`: a per-node label and glyph override. A `worker` can then draw as "Matching engine" and a `queue` as "Sequencer", while simulating exactly as before.
  - `workload`: the workload controls the case uses (`traffic`, `reads`, `bots`).
  - `goals`: taken from the case's estimate stage.
- `CASE_DIAGRAM_STEPS`, and `retryRun` step events.
- `CodingProblemDefinition.graph?: { param: string; form: 'edges' | 'weighted-edges' | 'adjacency' | 'matrix'; nodes?: string; directed: boolean }`. It is authored for every problem whose primary pattern is in the Graphs & trees track and that takes a graph parameter (R40).

### 3.5 Motion grammar

| Token                              | Value                                                             | Used for                                                                                |
| ---------------------------------- | ----------------------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `--g-motion-quick`                 | 120ms                                                             | press, hover, dimming, compare outline                                                  |
| `--g-motion-step`                  | 240ms                                                             | pointer slide, keyed move, state recolor                                                |
| `--g-motion-sheet`                 | 280ms                                                             | docks and bottom sheets                                                                 |
| `--g-motion-layout`                | 360ms                                                             | list reorder, lane split, heap swap, arrow swing                                        |
| `--g-motion-land`                  | 400ms                                                             | value landing (the old value slides up and fades, the new value settles, a fading ring) |
| `--g-motion-travel`                | 520ms                                                             | a particle along an edge, a message across lanes                                        |
| `--g-ease-standard`                | cubic-bezier(0.2, 0, 0, 1)                                        | moves                                                                                   |
| `--g-ease-enter` / `--g-ease-exit` | cubic-bezier(0.05, 0.7, 0.1, 1) / cubic-bezier(0.3, 0, 0.8, 0.15) | appear / leave                                                                          |

**One step:**

- **Cause (0 to 120ms).** The operands get a considering outline. The comparator label ("16 < 23") floats between them while the code span lights.
- **Change (120 to 360ms).** Moves, travel and swings.
- **Consequence (360 to 640ms).** Values land, settle or discard, and changed watch rows flash.

A step never has more than 640ms of motion.

**Pacing.**

- At 1×, dwell = 600ms + 200ms per event (counting at most 4) + 180ms if a value was written.
- Speeds are 0.5, 1, 2, 4 and **Instant** (no motion, dwell only).
- Motion is never shorter than 140ms, even at 4×.
- Scrubbing snaps. Jumps of more than one step crossfade in 160ms.

**Never animated:**

- stage size and viewBox;
- page scroll;
- legends;
- theme switches;
- algorithm values in the watch or lens: they swap and flash, and never count up;
- the element under the learner's finger: it tracks 1:1 and eases only after release;
- offscreen stages: they pause via IntersectionObserver and `visibilitychange`.

There are no idle loops, except Lab particles while a Run plays and a lesson widget's request dots while its stage is in view (R27a, at most 60 live, paused offscreen).

**Interrupts.**

- A new step calls `finish()` on running animations and never queues them, so holding → never builds a backlog.
- At most 60 animations run at once, and particles are pooled.

**Reduced motion.**

- **Switch.** It follows the OS `prefers-reduced-motion` setting, or Settings › Appearance › Motion (System / Reduced / Full).
  - The setting is a device preference, applied as `data-motion` on `<html>`.
  - `MotionService` reads it itself, because the global rule at `styles.scss:337` does not stop WAAPI animations.
- **Page transitions.** Ionic reads `animated` at bootstrap: `provideIonicAngular({ mode: 'ios', navAnimation: iosTransitionAnimation })` in `app.config.ts`.
  - `main.ts` reads the mirrored preference from `localStorage` before bootstrap, and passes `animated: false` when motion is reduced.
  - The Settings row says "Page transitions follow this after the app restarts".
- **Moves** become instant, with a trail marker: a dashed outline at the old position plus a small arrow, kept for one frame.
- **Writes** show the old value struck through beside the new one.
- **Particles** become static rps labels.
- **Mini-players** never autoplay.

**Implementation.**

- **FLIP.** Boxes are recorded around the signal update in `afterRenderEffect`. `Element.animate` runs on `transform` and `opacity` only, with `transform-box` set for SVG groups.
- **Particles.** Pooled dots with WAAPI keyframes sampled with `getPointAtLength`. Not `stroke-dashoffset`, which repaints on the main thread every frame, and not `offset-path`, which has gaps in WebKit.
- **Test mode.** `audit.mjs`, `pixdiff.mjs` and Playwright set `?motion=off` and `data-motion`, so screenshots are deterministic. R0 note: R0's tools set only `data-motion="off"` (from an init script, before any app script); R3's boot code adds the `?motion=off` reader, which strips the parameter, and the tools may then use the URL form (LOOP.md's R0 follow-up).

### 3.6 Diagram color and type

New `--g-viz-*` tokens are added. In R3 the existing `--g-state-*` tokens are re-pointed to them, so legacy views stay coherent until each is rebuilt.

- Text pairs meet 4.5:1 and graphical marks meet 3:1 on the stage.
- `theme-contrast.spec.ts` computes every listed pair, so the table cannot drift from the tokens.

| Role (only this meaning)                               | Dark (stage #0e1118)                                  | Light (stage #f7f8fb)                               | Mandatory second encoding               |
| ------------------------------------------------------ | ----------------------------------------------------- | --------------------------------------------------- | --------------------------------------- |
| current: being processed now                           | fill #1f9fd0, ink #0b0d12 (6.4:1)                     | fill #0b74ad, ink #fff (5.1:1)                      | solid fill                              |
| considering: compared, frontier, read from, call stack | line #c08420, 18% soft fill                           | line #c77700 (3.3:1), 14% soft fill                 | dashed outline                          |
| final: settled, chosen, answer                         | line #22ad74, 18% soft fill                           | line #12925f (3.7:1), ink #0a6b45 (6.2:1)           | solid outline, check on terminal states |
| discarded                                              | ink `--g-muted` #8b93a8 (6.1:1), marks at 40% opacity | ink #687082 (4.7:1), marks at 40% opacity           | 45° hatch                               |
| critical: overloaded, rejected, wrong                  | #e5485f (4.9:1)                                       | #d42a49 (4.7:1)                                     | × glyph                                 |
| the learner's guess                                    | neutral text ink, dashed 4 3                          | same                                                | "you" tag                               |
| heat 50–70 / 70–85 / 85–100%                           | #9a6418 (3.8:1) / #c98a2e / #f0b25a                   | #c97a22 (3.1:1) / #9c5a0c (5.1:1) / #7a4508 (7.4:1) | meter length and % label                |

**Fixes against the previous draft:**

- Light discarded `#a3aab8` was 2.2:1, and dark discarded at 45% ink was 3.9:1. Both now use a solid muted ink and fade only the marks.
- The light heat ramp started at `#e8a04f` (2.1:1). It now starts at 3.1:1 and darkens with load.

**Rules:**

- **Dimming.** During a checkpoint, everything outside `focus` fades its fills and strokes to 40% opacity. Its text switches to the discarded ink; text never gets an opacity. The current element and the focus set never dim, so white-on-current text stays at 5.1:1.
- **Purple in diagrams** appears only as UI: the focus ring, selection handles and pick hover. The binary-search window and Dijkstra badges stop using it.
- **Predict lime** survives only on the Predict mode switch.
- **The learner's guess is neutral and dashed.**
  - A fourth hue failed the validator in both themes: magenta vs cyan at ΔE 4.1 (deutan), and lime vs green at ΔE 9.7.
  - The light theme's final vs considering pair has a protan WARN at ΔE 6.8. That is why dashed vs solid is required, not decorative.
- **Lab kinds lose their hues** (`--g-kind-*`, and the DB on `--g-warn`). Kind is shown by a glyph; color means state only.
- **Identity colors** (components, shards, chart series) use neutral hulls with labels ("C1") where possible.
- **Legends are always on**, including on review cards: `question-card.component.ts` drops `[legend]="false"`.

**Type inside diagrams** (true px):

| Use                                | Face                            | Desktop / phone |
| ---------------------------------- | ------------------------------- | --------------- |
| values in cells and nodes          | JetBrains Mono 600, tabular     | 15 / 14px       |
| pins, edge weights, distance pills | JetBrains Mono 600              | 12 / 12px       |
| indices and axis ticks             | Inter 500, tabular, `--g-muted` | 11 / 11px       |
| captions, legends, callouts        | Inter 500                       | 13 / 13px       |
| narration caption                  | Inter 400                       | 15 / 15px       |

- Values are the largest text on the stage.
- Number labels sit on a 3px surface halo (`paint-order: stroke`).
- No Space Grotesk inside a stage.

### 3.7 Layout and controls: one transport everywhere

`g-transport` is shared by the player, the pattern specimen, review cards, the workspace trace, lesson replays and Lab Run.

**Player layout, computed.** The visual never moves and the page never scrolls.

_Phone and tablet_ (container below `wide`; a focus route, so no tab bar):

| Part                                                                                                                              | Height                                           |
| --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| Header (opaque; title, ⓘ for the intro, ⋯ for Presets, Describe and speed)                                                        | 48px + safe-area top                             |
| Stage S                                                                                                                           | clamp(200px, 100dvh − 392px − safe areas, 420px) |
| Caption (`Frame.caption`, at most 2 lines)                                                                                        | 48px                                             |
| Region R: a code peek (3 lines around the active line) and changed-variable chips; replaced by the checkpoint during a checkpoint | 240px                                            |
| Transport dock                                                                                                                    | 56px + safe-area bottom                          |

- **Resulting stage heights:**
  - iPhone 17 in Safari (402×681): 289px;
  - Pixel 7 (412×839): 420px;
  - w320 (320×700): 308px;
  - native iPhone 17 (402×874, with 59px and 34px safe areas): 389px;
  - iPad Mini portrait (768×1024): 420px.
- **Region R** fits a prompt plus 4 list choices: a 2-line prompt (44px) + 4 × 44px + gaps = 238px. Longer choices scroll inside R, never the page.
- **Short viewports.** Below 592px of height (landscape phones), the layout switches to two columns when the width is at least 640px: the stage on the left; caption, region and dock on the right.
- **Fallback.** If neither layout fits (rare), the page scrolls with the stage sticky. This is the documented fallback.

_Desktop_ (container `wide`; every desktop width reaches it, because focus routes collapse the rail):

| Part                                                                                                                                                             | Size                                    |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- |
| Header bar                                                                                                                                                       | 56px                                    |
| Left column (58%): stage S, then the caption (one line, 32px)                                                                                                    | S = clamp(280px, 100dvh − 200px, 560px) |
| Right column (42%): checkpoint dock (auto height, up to half the column, holds the list fallback), then the code pane (scrolls internally), then a compact watch | same height as the left column          |
| Transport bar                                                                                                                                                    | 64px                                    |

- **Resulting stage heights:**
  - 1280×720 (e2e desktop): 520px;
  - a 768px laptop with browser chrome (about 650px of viewport): 450px;
  - 1280×1000 (audit desktop): 560px.
- The checkpoint dock sits beside the stage, so the 4-choice list (about 300px) never pushes the picture.

**Transport:**

- **Buttons:** Restart, Step back, Play (52px on desktop, 48px on phone), Step forward, Next checkpoint (diamond), Jump to result.
- **Speed:** a segmented control (0.5 · 1 · 2 · 4 · Instant) on desktop. On phone it sits inside ⋯ as a labelled list. This replaces the blind cycling "1×" button.
- **Scrubber:**
  - a 44px hit area;
  - chapter bands from `Frame.chapter` when the tracer has them, with the counter reading "Step 14 of 86 · Row 3 of 7";
  - checkpoint ticks as 8px diamonds: hollow for pending, final for right first time, critical for missed, gray hollow for skipped. They are 3px wide with a halo, which fixes the olive-on-gray light-theme ticks.
- **Scrub guard.** Today, `seek()` silently drops `pending`. Instead:
  - Dragging onto an unanswered tick holds there for 24px of drag, with a selection haptic and the chip "Answer it, or skip?".
  - Dragging on marks the checkpoint skipped.
- **Execution strip** (in the Debugger view): one row per code line (at most 8), with a dot at each step where the line ran, aligned to the scrubber. Clicking a dot seeks there.
- **Keys:**

  | Key           | Action                     |
  | ------------- | -------------------------- |
  | ← / →         | step                       |
  | Shift + ← / → | previous / next checkpoint |
  | Space         | play                       |
  | Home / End    | start / end                |
  | 1 to 4        | answer                     |
  | Enter         | continue                   |
  - D (describe) and ? (keys) work only while the stage has focus (WCAG 2.1.4).
  - Key hints show only under `(hover: hover) and (pointer: fine)`.

- **Phone dock:** back, play, forward, "14/86", and ⋯ for restart, speed, next checkpoint, Describe and Presets.
- **No swipe-to-step.** A horizontal swipe on the stage would fight rows of cells under 28px that scroll sideways (Bitmask DP at 320px), and the `lo`/`hi` drags.
- **Play during a checkpoint** stays enabled. Pressing it focuses the question and announces "Answer or skip to continue". Today it dims to a lavender disc.

### 3.8 Predictions and checkpoints

**Answer modes:**

| Mode                                             | Examples                                                                                           | Input                                                | Ships in |
| ------------------------------------------------ | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------- | -------- |
| pick cell                                        | binary search: where mid lands; BFS grid: the next frontier cell                                   | tap; roving radiogroup                               | R20      |
| pick cell (tables)                               | LCS: which cell this one reads; Bitmask DP                                                         | tap                                                  | R24      |
| pick node / edge                                 | Dijkstra: the next settled node; Kruskal: the next edge, then ✓ or ✕                               | tap                                                  | R23      |
| value                                            | an LCS cell value; `dist[v]` after a relax                                                         | number chips plus free entry (`inputmode="numeric"`) | R20      |
| drag act (only where the gesture is the concept) | drag `curr.next`'s arrowhead onto `prev`; drag one union-find root onto another; drag `lo` or `hi` | drag; or Enter, arrows, Enter                        | R33      |
| choice                                           | "why" questions with no picture answer                                                             | the existing `g-choice` list                         | R2       |

**Flow.** The page never moves.

1. **Ask.**
   - Autoplay pauses on the frame before the decision, and everything outside `focus` dims (3.6).
   - The prompt appears in the checkpoint dock: beside the stage on desktop, in region R on phone.
   - The dock is **inline and non-modal**: a `role="region"` with an `aria-live="polite"` prompt, never an `ion-modal`. The stage therefore stays tappable for picks.
   - The caption stays as one line on desktop and two lines on phone.
   - While dragging, a live preview shows the consequence before commit (dragging `lo` past index 4 hatches cells 0 to 4).
2. **Commit.**
   - Single picks and drags commit on release. Multi-picks and typed values commit on "Lock it in".
   - The guess draws as a neutral dashed "you" ghost.
3. **Payoff.**
   - The real transition plays at 0.75× under the ghost.
   - Explanation text is wired to the picture: hovering "mid + 1" outlines cell 5.
   - **Right:** the real element slides into the ghost.
   - **Wrong:** the ghost turns critical-dashed, with × and a connector: "you: lo → 4 · actual: lo → 5".
   - The verdict is one line, with "Why?" expanding `explain`.
4. **Continue** (Enter or →).
   - The ghost clears and the tick recolors.
   - `returnAfterContinue()`, `reveal()` and `checkpointStart` in `player.page.ts` are deleted.

**Budget.**

- `pickCheckpoints`:
  - takes the first checkpoint of each `skill`, then escalates by `tier`;
  - keeps checkpoints at least 10% of the run apart;
  - caps a run at 5 checkpoints.

  LCS drops from 15 identical "which rule" asks in 86 frames to 4: the first match (tap the source cell), the first mismatch (tap the winning neighbor), a mid-table value, and the next traceback cell.

- **Trivial asks are rewritten in place, never deleted.**
  - Dijkstra "Update?" when dist is ∞ becomes "What is dist[v] after this relax?".
  - "node 2 points to node 2", and Two Sum `{3 → 0}` vs `{0 → 3}`, become pick asks on the same frames.
  - Every frame that asked still asks. The review draw (`algorithm-items.ts:90` picks a random predict frame of a random input) keeps its variety, and the 23 predict review item ids are unchanged.
  - A spec asserts that each tracer's count of predict frames on its default input is unchanged.
- The run ends with "4 of 5 predicted", with links to the missed checkpoints.

**Targets.**

- Pick targets must be at least 44px on coarse pointers and 24px on fine pointers. Below that, the list opens by default (for example, 14 cells at 320px).
- "Answer from a list" sits under every prompt.
- The device preference "Checkpoints: on the picture / as a list" remembers the choice.

**Review and practice.**

- Review cards use a compact stage (200 to 280px) with the `after` frame. Answering plays the real transition, then a one-line verdict directly under the stage.
- The legend stays on, and the code shows 5 wrapped lines around the active line.
- On phone, Continue sits in a sticky bottom bar above the tab bar (Review is not a focus route).
- The placement check stays in list mode, for speed.

---

## 4. Before and after: the most important screens

### 4.1 Today (`/today`, replaces Learn)

**Before** (`dark-desktop-learn.png`, `dark-pixel7-learn.png`):

- the hero "Build intuition, not a problem count." and 4 stat tiles, where "0% overall mastery" averages only review cards;
- a placement banner, with the Feedback tab overlapping its right edge on phones;
- six equal tiles with corner blobs: Visualize = Binary Search, Code = Two Sum, Design Lab = Your First Scale-Up. The Study plan tile sits 28px low;
- then the pattern map, then 34 topic cards about 3,300px down.

No in-progress work appears, and the plan's list is ignored.

**After, phone at 320 to 412px**, with a Target and a plan:

```
[🔍]          grasp.          [⟳] [⚙] [⋯]
Mid-level loop · Oct 25 · 23 days left   Edit
4-day streak · 320 XP
TODAY  1 of 5 done · ~25 min left
┌ UP NEXT ─────────────────────────┐
│ Solve Minimum Eating Speed        │
│ Coding · medium · about 25 min    │
│ From your plan. Binary Search is  │
│ Learning; this solve makes it     │
│ Practiced.                        │
│ [        Start        ] Not today │
└───────────────────────────────────┘
( ) URL Shortener case · 35 min
( ) A story for Ownership · 20 min
Review · 6 cards · 1 story · 1 revisit ›
LOOP READINESS 31 · Building    (◔)
  Coding 37 ×2 ▮▮▮▮▯▯▯▯▯▯
  System design 22 ▮▮▯▯▯▯▯▯▯▯
  Behavioral 27 ▮▮▮▯▯▯▯▯▯▯
CONTINUE
  URL Shortener · Stage 2 of 9 · on this device ›
  Trapping Rain Water · best 2 of 5 ›
WEAK SPOTS  [Drill these · 14 cards]
  Binary Search · Missed 3 of 4 predictions
```

**First run (no Target):**

```
┌ WHAT IS YOUR LOOP? ───────────────┐
│ Level  [Early career] [Mid-level] [Senior]
│ When   [1 week] [2 weeks] [3 weeks] [1 month]
│        [2 months] [Pick a date] [No date yet]
│ Rounds: Coding ×2 · System design · Behavioral
│ 45 min a day · starting fresh · Details ▾
│ [      Build my plan      ]   Not now
└───────────────────────────────────┘
```

- "Details" opens the round steppers (prefilled by level), minutes and starting point.
- "Build my plan" stays disabled until a level and a date chip are picked.
- "No date yet" saves the Target only.

- **Implementation.** `pages/today/today.page.ts`, with `@defer` blocks:
  - the plan checklist and Up next: `on immediate`, with a fixed-height skeleton;
  - readiness, Continue and Weak spots: `on idle`.
- **First paint.**
  - Static engine imports are limited to catalogs already in first paint.
  - Learn's `ALGORITHM_CATALOG`, `codeSpans`, `CodeTextComponent` and 57 mastery-ring cards leave first paint.
  - `first-paint.spec.ts` gains no names.
- **Accessibility.**
  - The h1 is the target line.
  - The Up next button's accessible description is the reason line.
  - The meters are `role="meter"` with values.

### 4.2 Problem library (`/coding/problems`, was `/code`)

**Before** (`dark-desktop-code-list.png`, `dark-pixel7-code-list.png`):

- no inbound link, and no tab lit;
- 164 flat 84px cards in catalog order, each showing the pattern chip, which spoils recognition;
- "0 / 164 solved" in 13px mono;
- no search, filter, sort or group headers. Graph problems are cards #73 to #121.

**Counting rule, used everywhere:**

- A problem belongs to every pattern in its `patternIds` (`problemsForPattern`).
- A pattern's count is its number of member problems. Binary Search has 9.
- A count over several patterns, or over a track, counts distinct problems. Graphs & trees has 51.
- These all use membership:
  - readiness;
  - the skill map ("2 of 9 solved");
  - the pattern hub ("Problems (9)", "Solved 2 of 9");
  - the By-pattern group headers;
  - the Pattern facet.
- The Track facet and the result line count distinct problems.

**After:**

- **Header:**
  - `g-page-header` "Problems", with "23 of 164 solved · Easy 6/15 · Medium 15/122 · Hard 2/27";
  - a search field and the filter bar: Status (Unsolved, Attempted, Solved), Difficulty, Track, Pattern, and an "At my level" preset (the level bar of 2.2);
  - removable active-filter chips, and "Showing 51 of 164" in a live region.
- **Two views.** The choice is a device preference.
  - **By pattern** (default): 23 collapsible groups in roadmap order ("Breadth-First Search · 2 of 10 solved").
    - A problem with two patterns appears under both (187 rows in all), marked "also in Prefix Sums", with one shared status.
    - Only the current pattern starts open, so the collapsed library is about 1.5 phone screens.
  - **Mixed:** a flat list of the 164 problems, with patterns hidden, ordered by difficulty. It adds "Pick one at random" for real recognition practice.
- **Rows:** `g-entry-row`, 48px, one line: status glyph, title, difficulty pips, and "best 3/5" when attempted.
- **Phone:** the filters open as a sheet. The URL holds the state (2.5).
- **Workspace** (R16):
  - **Pattern chip.** The chip (`workspace.page.html:13-16`) stays hidden until one of these is true:
    - the problem is solved;
    - "Show pattern" is tapped;
    - the workspace was opened from a pattern hub.
  - **Hint ladder.** Built from existing content, with no new authoring:
    1. "Which pattern?" reveals the pattern.
    2. The pattern's cue words that match this statement.
    3. The pattern's Template.
    4. "Watch it" opens the pattern's visualizer.

    Each rung is one tap and is recorded on the device only.

  - **Signature.** The function signature wraps with a hanging indent instead of scrolling sideways on phone.
  - **Language.**
    - On the first workspace visit, an inline row asks "Which language will you interview in? Python · JavaScript · TypeScript". The answer is stored as today, under `LANGUAGE_KEY`.
    - In Python, the Trace button stays, and its note reads "Trace steps through JavaScript or TypeScript code. Switch to JavaScript (your Python draft stays saved)".
    - This note replaces a `title` tooltip that touch devices never show. It also replaces the old draft's wrong claim that Trace runs "the JavaScript version": `workspace.page.ts:213` traces the learner's own code.
    - R1 ships this note.
  - **After Accepted:** +50 XP is shown, plus "Next unsolved in Binary Search" and "Back to Binary Search".
  - **On phone:** a Problem / Code / Results segmented control, which jumps to Results on Run.

### 4.3 Pattern hub (`/coding/patterns/binary-search`)

**Before** (`dark-desktop-pattern-binary-search.png`, `dark-desktop-lesson-binary-search.png`):

- above the lesson, a row of "Visualize:", "Practice 7 items" and up to ten "Code: X" buttons, which jump to three different tabs;
- eight identical text panels;
- a static Template;
- worked examples that reveal bullets, with a link to another tab only after the last one;
- Quick check last;
- it ends at "0/7 review items in rotation", with no next step.

**After:**

- **Header:** "Foundations · pattern 4 of 23", the h1, the state glyph, "Solved 2 of 9", and Prev/Next within the track.
- **Segments:** Lesson · Problems (9) · Drill, as child routes in the hub's own outlet (2.5). A **Watch** button pushes the player onto the Coding stack, so back returns here.
- **Lesson segment:**
  1. **Specimen,** under the one-liner. A stage (280px on desktop, 220px on phone) runs binary search on `[3, 8, 15, 21, 30, 42, 57]` with target 30.
     - It plays to one checkpoint: "Where does mid land? Tap it".
     - It does not autoplay under reduced motion.
  2. **Why it works.**
     - Phrases anchored to frames (`PatternLesson.anchors`) seek the specimen. At container `wide`, the specimen is sticky on the right.
     - "A million sorted items need at most **20** comparisons" is a `g-handle` that recomputes ⌈log2 n⌉.
  3. **Cues,** then one recognition quick check, moved up from the end.
  4. **Template.** Tapping a line lights the specimen frames it executed and the cells it touched.
  5. **Worked examples,** as inline steppers.
     - `stepFrames` maps each bullet to a frame of the example's existing `visualize` input.
     - "Open in full player" is a secondary action.
  6. **Pitfalls,** then follow-ups and the remaining quick checks.
- **Problems segment:** a table with status, title, difficulty, best score, and a Mock marker for problems with a mock `catalogId`. Primary-pattern problems come first. It replaces the "Code:" button row (`pattern.page.ts:64-76`).
- **Footer:** "Next: Prefix Sums →", the next pattern in roadmap order.

### 4.4 Algorithm player (`/coding/visualizers/dijkstra`), its checkpoint and the review card

**Before:**

- **Desktop** (`dark-desktop-player-dijkstra.png`, `dark-desktop-player-dijkstra-predict.png`):
  - an intro block above a 1.45fr stage, set against a 1fr column holding:
    - Code: 360px, unwrapped, line 1 half hidden, cut at `dist[so`;
    - Variables tiles;
    - an Input form of raw text;
  - a circle layout with crossing chords; the "15" weight sits on the 1–3/5–2 crossing;
  - 11px purple distance badges that alternate above and below nodes;
  - "PRIORITY QUEUE (DIST@NODE) 0@0", plus a duplicate DIST row;
  - narration below the fold.
- **Phone** (`dark-pixel7-player-kruskal-mst-predict.png`):
  - about 650px of intro before the player;
  - the keyboard hint shown on touch;
  - the Feedback tab beside "10 / 40";
  - four answer buttons, and no graph anywhere on screen.
- **Review** (`dark-pixel7-review-answered.png`): a frozen picture or none, and "Not quite" plus Continue at the bottom edge, behind the tab bar.

**After, desktop** (container `wide`, full width to 1440px, rail collapsed to 64px):

```
‹ Dijkstra's Shortest Paths  [Shortest Paths] hard  O((V+E) log V)  Predict ●  Presets ▾  ⓘ  Debugger ▢
┌──────────── STAGE 58% (clamp 280–560px) ─────────┬──────────── 42% ─────────────────────┐
│   (5)──14──(0)───7───(1)        PQ  node 1 · 7 ◂  │ ┌ CHECKPOINT DOCK ─────────────────┐ │
│    │ 9      ⟍9       10         node 2 · 9        │ │ Which node does pop() settle     │ │
│   (4)──6──(3)──11──(2)          node 5 · 14       │ │ next? Tap it.   Answer from a list│ │
│  dist pills top-right; relax dot travels 0→2      │ └───────────────────────────────────┘ │
│                                                   │ ◆  4  while (pq.size) {        ×3     │
│                                                   │ ▶  8    if (dist[u] + w < dist[v])   │
│                                                   │         ‾‾‾‾‾‾‾‾‾‾‾‾‾  0 + 9 < ∞ ✓   │
│ L8 · Relax 0→2: 0 + 9 = 9 beats ∞   [dist[2] ∞→9] │ WATCH  u 0 · settled 1  was 0 ▌       │
├───────────────────────────────────────────────────┴──────────────────────────────────────┤
│ ⟲ ◀ ▶ ▶ ◆▶ ▶▶|  0.5 1 2 4 ⚡   ▕═◆══|Settle 1|══◆═◇══▏ Step 6 of 27 · Settle 1 of 6           │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Default view:**
  - the stage and caption;
  - the checkpoint dock (in the right column, above the code);
  - the code, with lens and span;
  - a compact watch (changed and pinned rows only).

  The intro sits behind ⓘ.

- **"Debugger" toggle** (a device preference) adds the execution strip, the full watch, the call stack for recursive tracers, and gutter execution counts.
- **Graph:**
  - the planar preset layout for the default input has zero crossings across its 9 edges;
  - the min-heap is a sorted bar list labelled by node;
  - a pop travels to its node, and a relax particle writes ∞ → 9;
  - a stale pop strikes through with "stale: dist[2] is already 7";
  - the shortest-path tree turns final green;
  - the DIST row is deleted.
- **Input:** a Presets popover with "Shorter path found late", "Unreachable node", Random and Edit.
- **End of run:** the stage shows the result, plus "Write Network Delay Time →" and "Next visualizer: Union-Find".
- **Other tracers:**
  - Kruskal: a sorted edge strip linked to the graph, a union-find forest, and neutral component hulls that merge. Rejected edges go to a pile marked "same component", with × on the edge.
  - LCS: formula chip and arrows, chapters per row, and a final "Trace back" chapter.
  - Subsets: a ghost tree with leaf chips.
  - Linked list: swinging arrows, then reading order.
  - Bitmask: binary masks with dp[mask] → dp[to] arcs, and a scroll cue instead of cut cells.

**After, phone** (Pixel 7, iPhone 17 and 320px; numbers in 3.7):

- an opaque 48px header with ⓘ and ⋯; no tab bar on this focus route;
- the stage first (289 to 420px, depending on the device), then a 2-line caption;
- region R:
  - normally, a 3-line code peek around the active line (tap it for a full code sheet) and changed-variable chips;
  - during a checkpoint, the prompt plus either "Tap a node" with "Answer from a list", or the list itself;
- the 56px transport dock on the bottom safe area.

**Review card:**

- a compact stage with the legend on;
- answering plays `frame → after`, then a one-line verdict directly under the stage;
- on phone, Continue sits in a sticky bottom bar.

### 4.5 Design hub and the case study page (`/design`, `/design/cases/:id`)

**Before:**

- **Design Lab list** (`dark-desktop-design-list.png`, `dark-desktop-design-list-cases.png`): one column of missions, then Free Build, then 27 cases with identical doc icons and inert topic chips. "Stage 2 of 9" appears only there.
- **Case page** (`dark-desktop-case-study.png`):
  - "1 Clarify what matters", with no total;
  - "Put it together" is bullets, with the Lab link shown only after every bullet is revealed (`case-stage.component.ts:212-216`);
  - 22 of 27 cases draw nothing.
- **Decision cards** (`dark-pixel7-case-study-decided.png`): four full-width choice cards, verdicts as red and green boxes, and the Feedback tab over the third card.
- **Case builds:**
  - `CASE_LABS` chains generic kinds. Stock Exchange's "Matching" is a `worker` and its "Sequencer" a `queue`; Message Queue's "Brokers" are an `app`.
  - Every build shows Reads and Bots sliders, whether or not the case has them.
- **Retries widget** (`dark-desktop-case-payment-ledger-retries.png`): 3 mode buttons, 4 example buttons, 12 fate radios, a text log and three tiles.

**After:**

- **Design hub.**
  - Header "System design", with "6 of 17 core topics Practiced · 2 of 9 missions · 3 of 27 cases".
  - **Topics:** the shelf overview, then the six shelves of 2.8.
  - **Missions:** a 2-column grid; thumbnails come in R39.
  - **Cases:** filters for Level (Core 9 / Advanced 18), Shelf/Topic and Status, plus search. Rows have a stage progress bar.
  - **Topic chips.** Inside case rows they stay plain text. The row is one link, and nested links break keyboard and screen-reader use. Filtering by a topic adds the header line "Read the Rate Limiting & Abuse lesson →".
- **Case page:**
  - **Header:** the title, "Stage 2 of 9 · Estimate" with an expandable stage outline, and "Topics this case uses" as links.
  - **Actions:** "Build it in the Lab", always visible; and "Mock this case" when a mock maps to the case through `catalogId`.
  - **Decision cards** become `g-checkpoint` choice mode:
    - compact rows with the verdict glyph and one line of reasoning;
    - the explanation under "Why?";
    - Continue in place.
  - **Estimate cards** become `g-checkpoint` value mode:
    - a number field with unit chips;
    - then the answer drawn on a log number line, with the tolerance band, and the learner's guess as the dashed "you" mark.
  - **"Put it together"** gets a read-only `g-sys-diagram`, built from `CASE_LABS[id]` with its `roles`. So "Log segments" draws as an append-only log, not a database cylinder.
    - `CASE_DIAGRAM_STEPS` maps each model-answer bullet to node ids. Revealing a point draws its components in, and tapping a node highlights its bullet.
    - "Follow one request" plays a numbered particle along the path, adding per-hop latency.
    - Clean style only.
- **Case builds:**
  - They show only the workload controls the case declares (`CASE_LABS[id].workload`).
  - Goals come from the case's own numbers (`CASE_LABS[id].goals`).
  - A case without authored goals shows "No goals for this build yet", instead of a dock that is always green.
- **Retries widget** becomes a `g-sequence` run (R34):
  - **Lanes:**
    - Caller: timeout brackets, then "got a response" or "gave up";
    - Network;
    - Ledger: a book of entry cards and, in keyed modes, a Keys table.
  - **Controls:** a fate chip on each attempt arrow cycles Answered / Response lost / Never arrives, replacing the 12 radios. The examples become a Presets menu.
  - **Predict first, on the frozen run:** "How many capture entries does the ledger post?"
  - **Payoff:**
    - one chapter per attempt;
    - the learner's count as a ghost on the book;
    - the duplicate card tagged "reversal owed".
  - **Comparison:** switching key mode replays the run against the previous run's book, shown as a ghost.
- **Hot-account widget** becomes lock lanes:
  - lanes split by dragging the row edge;
  - a throughput gauge takes a set-number prediction (400 ±10%);
  - a goal challenge, "stop the pile with 4 balance rows or fewer", leads the learner to discover batching.
- **The other 9 case widgets** are redesigned in R46 and R47 (5.2).

### 4.6 Design Lab canvas and Run (`/design/missions/:id`, `/design/lab`, case builds)

**Before** (`dark-desktop-sandbox.png`, `dark-pixel7-sandbox.png`, `dark-pixel7-sandbox-inspector.png`):

- **Layout:** 5 KPI cards and 10 text chips above a 900×480 board that is about 70% empty, with three nodes in a row.
- **Nodes:** identical 132×70 rects whose kind stripe reuses status colors (DB amber = "hot").
- **Edges:**
  - cubic curves with no arrowheads;
  - colored by the target's status, so Users → App is red;
  - widths on a log scale.
- **Feedback:**
  - an instant steady state, with p99 and errors shown twice;
  - Free Build never colors a KPI;
  - model assumptions ("M/D/1", "ideal fluid model") are in muted fine print.
- **Phone:**
  - the canvas opens on Users and half of App;
  - the inspector is below the canvas;
  - Cost is hidden.

**After, desktop:**

```
‹ Your First Scale-Up             [ Edit | Run ]    ↶ ↷   Reset
┌ TOOLS ─┬──────────────────── CANVAS (fit to content) ───────────┬ INSPECTOR (floating) ┐
│ Edge   │  👤 Users 3.0k rps ◂▸ ──3.0k──▶ ▦ App ×1 150% ! ──1.1k──▶ ⛁ DB 44%  │ App servers ×1 │
│ ◍ ⏚ ⑂  │                  └ "Overloaded: add instances" callout   │ 150% ████████▌ !     │
│ Compute│                                                           │ instances − 1 +      │
│ ▦ ⚙    │                                                           │ Kill an instance     │
│ Data   │                                                           │                      │
│ ⛁ ⚡ ▤ │                                                           │                      │
│ Async ≡│                                                           │                      │
├────────┴────────────────────────── RUN DOCK ────────────────────────┴──────────────────────┤
│ p99 1,864 ms ✕ ≤150  │ errors 33% ✕ ≤0.1%  │ served 2.0k/3.0k  │ cost $1.3k ✓ ≤$4.0k   Model ⓘ │
│ Workload ▾ · Steady · Ramp 2× · Spike 3× · Kill   ⟲ ◀ ▶ ▶   ▕══⚡════✕═══✓══▏ 0:24 / 1:00  │
└──────────────────────────────────────────────────────────────────────────────────────────┘
```

- **Nodes** (`g-sys-node`, 148×64):
  - Glyphs come from one SVG sprite: person, globe, gate, fan-out, stacked cards for app ×N, a lightning box with a hit-rate ring, cylinder, cylinder with sync arrows, queue lanes filled to the backlog, gear, bucket.
  - Case builds add role glyphs: append-only log, matching engine, sequencer.
  - A neutral tint, with a heat-ramp body and meter, and "62% · 16 ms".
  - Overloaded: critical outline plus "!". Down: hatched with ×.
  - Sharded DBs show a shard heat strip.
- **Edges:**
  - `route.ts` elbows with arrowheads, falling back to curves when no clear lane exists;
  - width `1.5 + 4.5·sqrt(rps / maxRps)`, so 3k vs 200k reads about 3× wider instead of 1.4×;
  - neutral color, with only the dropped share drawn as a critical tail ("−1.0k rps dropped");
  - replication edges dashed with a "repl" tag; async edges into a queue tagged "async";
  - rps pills on the three busiest edges, and on hover or select.
- **Workload controls:**
  - Traffic is a `g-handle` on the Users node (principle 4).
  - Read share and bot traffic sit in the Workload popover in the run dock, and appear only when the mission or case uses them (`readRatio`, `botRps`).
- **Goals:**
  - Missions keep their goals and `evaluate()`.
  - Free Build gets "Your goals" in the run dock: defaults of p99 ≤ 200 ms, errors ≤ 1% and no budget, editable and stored with the saved design. KPIs color against them.
  - Case builds use `CASE_LABS[id].goals`.
- **Model chip.** "Model ⓘ" opens a short, plain explanation at body size and full contrast, replacing the fine print: "Each server is a queue with fixed service time (M/D/1). Run uses a fluid model, one sample a second."
- **Editing** (R26):
  - drag a tool to a spot, or click to insert it after the selected node (auto-wired when `canConnect` allows);
  - drop a tool onto an edge to splice it in ("Insert Cache between App and DB");
  - during a link drag, valid targets glow and invalid ones dim, showing the `canConnect` reason;
  - undo/redo (50 named steps), Delete, and Reset with a confirmation and an undo toast;
  - delta chips for 6s after each edit ("p99 1,864 → 92 ms ▼");
  - insight cards become callouts pinned to their node.
- **Trace a request.** Tapping Users sends one numbered particle down the busiest path, with per-hop latency.
- **Run** (R28, `simulateTimeline` in the engine):
  - **Model:** it calls the existing `simulate()` once per simulated second and integrates the backlog from the new `SimResult.queues`. It is labelled "Fluid model, one sample a second".
  - **Where it runs:** in a new `sysdesign/sim.worker.ts` whenever a run takes more than 30ms on the throttled phone.
    - Angular compiles every `*.worker.ts` with `tsconfig.worker.json`.
    - The learner-code `runner.worker` stays separate.
    - The Load Balancing sweeps (4.7) use the same worker.
  - **Playback:** 60 simulated seconds play in 6s. Canvas heat, particles and queue fill follow the playhead.
  - **Run dock:** KPI cards gain sparklines with goal lines and shaded failing spans, plus event markers (⚡ spike, ✕ kill, ✓ recovered).
  - **Call it:** before Run, the learner may drag a guess mark onto the p99 sparkline.
  - **Run report:**
    - each goal with its failing window ("p99 above 150 ms from 0:12 to 0:31 · view");
    - the bottleneck, with "Show on canvas";
    - a "Since last run" table.
  - **Pass/fail stays on `evaluate()`**, so no mission changes difficulty.
- **Phone** (R22):
  - an opaque header, with Undo and Reset in ⋯;
  - a goal strip of 3 chips, failing first, with Cost kept;
  - the canvas fits all nodes on open (`initialView` fits the bounds), and the board-edge rect is removed;
  - "+" opens a grouped palette sheet (Edge, Compute, Data, Async);
  - **the inspector is an inline bottom panel**, never an `ion-modal`:
    - 45% or 90% of the height, `role="region"`, with focus moved to its heading;
    - it pans the selected node into view, so the canvas stays interactive above it;
  - the run dock is 56px, on the bottom safe area (a focus route, so no tab bar);
  - the help line becomes a one-time coach mark.

### 4.7 System design lesson widget: Load Balancing (`/design/topics/sd-load-balancing`)

**Before** (`dark-desktop-lesson-load-balancing-slow.png`):

- 4 policy buttons, 3 server buttons, 4 slowdown buttons and a load slider feed four tiles (3.5 s, 64.7 s, 10.0%, 1,380);
- four "Things to try" paragraphs of 60 to 80 number-dense words, to reproduce by hand;
- no servers are drawn, although `balanceRun` simulates 20,000 requests;
- the page is a 728px column, and `widget.scss` caps the SVG at 520px.

**After:**

- **Layout:**
  - at container `wide`, the widget breaks out of `.page.narrow`, with the visual on the left and controls plus experiments on the right;
  - at `medium` (including 1024px with the rail expanded), they stack.
- **Fleet:**
  - an LB glyph feeds 4, 10 or 20 server lanes, each a queue of request blocks (drawn linearly up to 50, then "+N");
  - the slow server is marked with a snail glyph and "5×";
  - lanes grow from `balanceRun`'s sampled `series`, on a 12s replay transport;
  - at 0.1×, the first 40 dispatches animate the policy itself: rotation for round-robin, a scan sweep for least connections, two candidate lanes flashing for two choices.
- **Readouts in place:**
  - the queue label reads "1,380";
  - a share bar shows "sent 10% · can serve 2%";
  - a latency histogram on a fixed log axis, with p50 and p99 markers and a ghost of the previous run.
- **p99 vs load chart:**
  - all four policies across 50 to 95% load, on a log axis;
  - a scrub line bound to the load handle;
  - computed in `sim.worker.ts` and memoized by settings, so the round-robin cliff is visible before any input.
- **Controls:**
  - one `g-segmented` for the policy;
  - handles on the picture: drag the slow server's head (1×, 2×, 5×, 10×), drag the rack edge (4, 10, 20), and an inlet handle for load.
- **Experiments** replace `tryThis`.
  - Each experiment card:
    1. sets the widget up with one tap;
    2. asks a one-line prediction ("Round-robin, one server 5× slower: p99 goes up about 2×, 10× or 1,000×?");
    3. plays 2s of traffic;
    4. pulses the focus region;
    5. then shows the exact numbers.
  - A challenge card: "get p99 under 100 ms" (least connections, 96 ms; 81 ms once R27b broke its ties in turn).
  - `lessons.spec.ts` recomputes every number quoted in a reveal from `balanceRun(setup)`, so the prose cannot drift from the model.
  - Predictions go through content review.
- **Same iteration, Replication widget:**
  - one `g-timeline`, with the write at t=0, a draggable "replica applies" marker, a draggable "read" marker, and a read-your-writes band;
  - labels attach to markers with collision nudging. This fixes "writread" (`dark-desktop-lesson-replication-pinned.png`) and the left clipping on phone.
- **Same iteration, a bug fix:** unnumbered stream events. (The cache hit-rate slider that stuck at its target during refill went with the Caching widget in R27a, 4.7b.)

**As built (R27b).** Load Balancing: a stage whose height depends only on its width. Clients feed an inlet whose load handle snaps to 50 to 95%; an LB diamond names the policy (wide stages only); a rack of 4, 10 or 20 lanes, the slow server S1 always first and tallest, its box growing left with its slowdown (the handle on its left edge, 1×, 2×, 5×, 10×, a snail from 5×), the rack's bottom edge a handle for the fleet size. Each lane's queue is blocks (at most 50 and at least 3px each, then "+N"); S1's lane always shows its count ("1,379" at the end of the round-robin 5× run, the number its reveal quotes). Readouts: p99 and the mean, "S1 is sent 10% of requests" against "it can keep up with 3.1%" (its share of capacity over the load, so least connections reads green at 2.8%), the latency histogram (24 log bins, 1 ms to 1,000 s, p50 and p99 in the legend, the previous settings as a dashed ghost) and p99 against load for every policy (log axis, the policy shown in the current tone and the rest muted with their own dash patterns; the chart's scrub handle is the load). A time handle replays the run's 61 samples over 12 s; request dots flow in the policy's own pick order while the stage is in view; "Watch it choose" steps 12 mid-run dispatches, showing what the policy looked at (round-robin's turn, least connections' scan, the random pair), on its own with motion and one per press without (this replaces the "0.1×" replay). The policy is a native radio group drawn as `g-segmented` (the component would split a first-paint chunk). Least connections now breaks ties in turn rather than to the first server, so an even fleet gets even shares (its p99 with a 5× server is 81 ms, not 96). Six experiments; the challenge keeps the 5× server (`goal.keep`). At container wide the page takes the content width and holds every other part to the reading column, so the widget sits beside its controls and experiments without spilling; narrower, they stack. There is no rail yet, so 1024px is wide today.

Replication: one `g-timeline` of the 3 s after your write, lanes You, Primary and Replica: (1) the write, (2) the replica applying it (the lag handle), (3) your read (the read handle), (4) what it returns, on the replica or, inside the read-your-writes pin, on the primary (the pin's end is a handle). Span labels live in a legend under the axis with its lines reserved by width; event labels go over or under their event, whichever no message crosses, and are nudged apart, and lane labels step right of any message, which removes "writread" and the phone's left clipping. While an experiment waits for your guess the verdict reads "?" and (4) is hidden; a play draws the 3 s in real time.

**R27b fix round 1.** Load Balancing, rebuilt for engagement and a throttled phone: the fleet and the charts are two stages; narrow, the policy and the actions sit right under the fleet (the stage scrolls into view on a policy change and on "Watch it choose"), wide, the controls and the dock take the right column. Lanes, queue blocks, each server's busy fill, the server names and the request dots are painted on one canvas (`fleet-canvas.ts`, at most 2× density, colours read only when the root's theme classes change) between a background SVG and the labels, so no dot covers a number; a block stands for 1, 2, 5, 10, 20, 50... requests so the run's longest queue fits ("▯ = 50 requests" by the fleet handle, with "↕ servers"); lanes stop at 260px on a wide stage; the dot stream is denser (one every 70 ms) and dots to a slow S1 take its tone; S1 is neutral at 1× and the rack header says "S1 is 5× slower". The time handle sits a whole hit box under the fleet handle's lowest stop (a layout spec checks every pair of handle hit boxes at every fleet size). The histogram and "p99 so far" fill in with the replay from `balanceRun`'s `answered` samples; the charts follow the run a task later so a phone draws fleet and charts in separate frames; the p99 chart names its lines at their ends (RR, Random, LC, 2 choices) and marks the current point; bins keep 2px; the first bin reads "under 1.78 ms". Captions: round-robin's turn, least connections' tie broken in turn. The worker's failure stays said and hides the cards. Replication: lane labels in a left gutter, the now-line behind labels, event labels placed under, over or slid a little (never on a message, no leaders), markers close in time side by side with their arrows and handles following them, an opaque disc under each marker, larger type from 600px; while a question is open the replica's spans, its applying the write, the replication arrow and the read stream are hidden; a stream of your reads every 250 ms lands on the lane that serves each, stale or fresh, with "4 of 13 stale"; outlines grow to take in a label they would cut; the challenge's status stays true after the learner moves on; the toggle reads "Pin to the primary (read your own writes)". Both widgets and Caching share `ExperimentSession` (answering re-applies the card's setup, so a reveal always describes the picture). Latency: a log y axis (5 ms to 10 s, all of the curve), 340px stage, current p50 and p99 points, one control (the slider; the chart shows a cursor). Overload: a linear y axis fixed at 30,000 with the peak marked (a cap and "above the chart" past it). Queues: full height and the peak marked. Lazy placeholders hold each widget's measured height at its width (`widget-heights.ts`). A lesson no longer opens scrolled to its quick check: the first question takes focus only after an answer.

**R27b fix round 2.** The fleet is painted in a worker on an `OffscreenCanvas` (`fleet.worker.ts`, `fleet-scene.ts`; the same scene paints on the page where a browser has none), links included, and animates its dots on the worker's own frames; a replay moves it straight from the play's clock and touches the page only when the sample changes. p99 against load is a table (`LB_SWEEPS`, checked against `balanceSweep`): a sweep is 40 runs, 0.4 s of a core on every fleet change. The charts are their own component and follow a change one frame each (`FrameQueue`); a learner's change applies a task after its input event, so checking and drawing never share a task. Layout: wide, the fleet with its charts right under it on the left, the controls and the dock on the right; narrow, fleet, controls, the experiment's question, then the charts; a card's question scrolls into view, the stage once answered. Smaller fleets spread over the rack (4 servers at about 34px a lane). Mid-replay the readout says "p99 so far" and "mean so far" (`answered[].meanMs`); a tail past the run reads "p99, run and drain". Table cells never wrap (P2C heads two random choices). Replication's handles fade while a play has not reached them.

**R27b fix round 3.** WebKit paints the Load Balancing fleet on the page rather than in a worker (a worker-held canvas there crashed the page or left the simulation's answers undelivered under load); a run's samples keep p99 so far with a running percentile instead of sorting at every sample; the experiment cards' runs are requested when a card is tapped; and `SimClient` replaces a worker that stops answering once, then fails visibly (a stall, an error the worker answers with, an unreadable answer, a worker error): the readout says "unavailable" and the notice says why.

### 4.7b System design lesson widget: Caching (`/design/topics/sd-caching`, R27a)

**Before:** two range inputs (hit rate 50 to 99.9%, origin 10 to 200 ms), Flush, three number tiles and three "Things to try" paragraphs; a 4.8 s linear refill timer that ignored what the origin can serve; during refill the slider was disabled at its target while the tile showed the live rate; the origin's capacity was an app constant.

**After**, on one `g-stage` whose height depends only on its width:

- **Flow:** Clients (10,000/s) → Cache → Origin. The cache is a hits | misses bar on a nines scale (one step per nine, room past 99.9% so its misses show), with the hit-rate `g-handle` on the split, snapping to 50, 80, 90, 95, 98, 99, 99.5 and 99.9%. The origin is a load meter on a log scale (10 to 10,000/s) with a capacity `g-handle` snapping to 1,000, 2,000, 4,000 and 10,000/s; over capacity its fill turns critical with one ×, pulsing while a flush plays, and its text reads "10,000/s" over "5× the 2,000/s / it can answer" ("over the 2,000/s / it can answer" under 1.5×). With motion, request dots flow whenever the stage is in view (1 dot = 1,000 requests, paused offscreen and on a hidden page, at most 60 at once): hits bounce off the cache; misses ride above the bar, clear of its labels, and wait at the origin (drawn 8× longer so you can see it), so a slow origin visibly lags; misses over capacity break with ×. The rates are written on the drawing either way, so Reduced motion loses no number.
- **Readouts in place:** a 10×10 waffle of 100 requests in whole cells ("95 hits", "5 misses answered", "0 timing out now", each with its own mark; "1 in 200 misses" when fewer than 1 in 100 do; two legend lines reserved) with the 99th request ringed, so p99 visibly is a miss once more than 1 in 100 miss; mean and p99 beside it, "a miss" or "a hit" under p99, "timing out" over capacity.
- **Chart:** always reserved; before a flush it says "Flush the cache to see the miss storm". After one, `g-chart-frame` draws origin load (fixed 0 to 10,000/s) and the hit rate (dashed, 0 to 100%) over 20 simulated seconds from the engine's `cacheRefill`, long enough for every setting but the lowest hit rates on the smallest origins to warm again, with the capacity threshold, the over-capacity span shaded and named in the legend with the requests lost so far ("over capacity until 5.7 s, 21,000 timed out", the total once warm; "over capacity throughout, N timed out so far" when the origin never gets back under capacity within the chart, and then no "warm again" and the picture rests on the last sample), the moment the cache is warm again marked, their times as ticks in their tones, a legend under the plot (so no label crosses a line), and a playhead `g-handle` on a track under the time ticks that the flow and waffle follow. With motion the flush plays at 3× (6.7 s) and ends warm ("· warm again" beside the hit rate); without, the whole chart shows with the playhead at the peak. Any setting changed with no play running returns the picture to the warm steady state; Table shows the samples with the playhead's row marked.
- **During refill** the hit-rate handle stays live: it draws as a dashed target with a target tick, the bar shows the live rate, and dragging changes the target (the run recomputes).
- **Wide** (stage ≥ 520px): one row for the flow, then the waffle and readouts beside the chart. **Narrow:** clients above the bar, the origin meter under it, then waffle and readouts, then the chart. Under the stage: the origin latency (`g-slider`, 10, 50, 100, 200 ms), Flush the cache and Replay.
- **Experiments** replace `tryThis`: six cards (one more nine; is p99 a miss; a slow origin behind a good cache; the miss storm; a bigger origin; the challenge "a mean under 3 ms"). A card sets the widget up; the question shows in a dock under the stage, held as "your guess" while 2 s of traffic (or the flush) plays, with the stage scrolled into view on a phone and the settings it is about locked; an interrupted play (Replay, the playhead) reveals at once, and Replay or Flush during a flush always plays again from the empty cache. The focus outline takes in its captions, and its "Look here" tag goes to the first corner place that covers no text. Then the choices are marked, the reveal is read out politely, and its regions get a focus outline ("Look here", pulsed with motion). Every number in a prompt, choice or reveal is a slot `caching-experiments.ts` fills from `cacheSteady` and `cacheRefill`.

### 4.8 Behavioral hub, Questions and the Mock start (`/behavioral`, `/behavioral/questions`, `/mock`)

**Before:**

- **Hub** (`dark-pixel7-behavioral-list.png`, `dark-desktop-behavioral-list.png`):
  - reached only from the last Interview card, with no tab lit;
  - the STAR and "Before the loop" panels, the Mock card and the Story bank card all come before the 13 competency rows;
  - those rows show only "N answers drafted".
- **Competency page** (`dark-desktop-behavioral-competency.png`): the 7 questions come last.
- **Interview tab** (`dark-desktop-interview-home.png`):
  - lists the 13 competencies again, as "Start →";
  - Behavioral plus Scripted silently jumps to `/behavioral/mock`, a client-only page that scores "N of M checks" and records nothing.

**After:**

- **Behavioral tab:**
  - header: "5 of 13 competencies have a story · 12 of 91 questions drafted on this device · 3 stories due";
  - a Rehearse card when stories are due;
  - 13 rows, each with a state glyph, "7 questions · 1 story", Flagged and "Senior focus";
  - "How to answer (STAR)" as one line linking `/behavioral/guide`.
- **Questions:**
  - all 91 prompts, grouped by competency and each clamped to 2 lines;
  - search, competency chips, and status (Not drafted / Drafted on this device / Has a story);
  - deep links such as `?competency=conflict&q=disagree`;
  - the header links the **STAR drill** (`/behavioral/drill`): "Timed drill: 3 questions, checks at the end, no verdict".
- **Competency page:**
  - a sticky jump nav, "Questions (7) · Guide · Examples", with Questions first;
  - "See it done" preselects the Target's level;
  - a new "At your level" line states what interviewers look for at that level, drawn from the existing level examples (`examplesFor`);
  - "What a strong answer shows" and "What sinks it" get success and danger tones.
- **Mock:**
  - the Full loop card first: "One round of each: Coding 45 · System design 45 · Behavioral 20 min", with the level from the Target;
  - then one Single round card per round in the Target, showing readiness and the last verdict;
  - each card opens a start sheet: a bottom sheet on phone, a dialog on desktop. It is modal, since it is a form. The sheet holds:
    - the mode: Scripted or AI;
    - "Surprise me", or a list with catalog titles;
    - for behavioral, the competency, built from the Questions list;
    - for AI, the allowance ("AI rounds left this hour: 2 of 3").
  - Every choice starts an API session with a verdict. The scorecard names what produced the verdict: "Scripted: rubric checks" or "AI interviewer".
  - History is grouped by round.
  - Pattern chips are hidden in the start list.

### 4.9 Review session and Study plan (`/today/review`, `/today/plan`)

**Before:**

- Review (`dark-pixel7-review-question.png`, `dark-pixel7-review-answered.png`) does cards only, although the badge also counts stories and mission revisits.
- It shows a mono "Continue again in 10m", a yellow warning-style "Practice · not scheduled" banner, and no XP or streak feedback.
- The plan page has no countdown, day strip or per-round view.
- "Clear plan" erases in one tap (`plan.page.ts` `clear()`).

**After, Review session:**

- **One queue**, in this order: due cards, then due stories, then mission revisits.
  - A story item is an inline rehearse card: the prompt, a timer ring, and "Told it well" / "Needs work".
  - A revisit item is a card: "Revisit Flash Sale at Noon (variant 2) · about 20 min". It opens the mission in the Lab, and returns to the session when the mission passes or is left.
- **Copy:**
  - Grade buttons show "Back in 10 min" and "Back in 3 days", in Inter, under each grade.
  - Drill pages show a neutral info line, "Drill: does not change your review schedule", instead of the yellow warning banner.
- **Summary:** "18 reviewed · 3 to see again today · +64 XP · day 5 of your streak", then the next-due forecast, then the missed items with "Drill these again". The drill summary uses the same component.

**After, Study plan:**

- **Header:** "23 days to Oct 25", with "On track" or "Tight" from `PlanStatus`, and an Edit link (date, minutes, starting point).
- **Day strip:** the next 14 days as dots (done, partial, planned, review only, taper day, interview), scrollable to the interview. Tapping a day shows its list.
- **Per-round bars:** planned minutes per round for the remaining days, shown against the Target's weights.
- **Clear plan:** asks "Clear your plan? Your progress stays.", then offers Undo for 8 seconds. Undo writes the previous `plan.set` again.

### 4.10 Other screens (each assigned to an iteration in 5.2)

- **Interview session** (`dark-pixel7-interview-behavioral-answer.png`):
  - The two mode rows and the two pinned paragraphs become one header chip ("AI interviewer ▾"), with the disclosure inside its menu.
  - The composer is one bottom bar: an auto-growing text field (up to 6 lines) and a 44px send button, on the same row at every width. The send button no longer wraps.
  - Behavioral answers offer "Structure it: S · T · A · R", which opens the four parts one at a time, instead of four open boxes.
  - Coding and design rounds get a phase rail (Clarify, Approach, Build, Test or Deep dive) and a clock.
- **Scorecards:**
  - a verdict scale (No hire to Strong hire);
  - one column of dimension bars;
  - a Keep / Fix pair;
  - one primary next action.

  The loop debrief adds a heat grid of rounds by dimension, with no orphan cell.

- **Mock loop** (`mock-loop.page.ts:95-205`):
  - Setup becomes one card: rounds and times from the Target, the mode, and "Start loop". The long copy moves behind "How the loop works".
  - Running becomes a vertical stepper (round, status, verdict chip, Resume), with the break timer between rounds.
- **Rehearse** (`dark-pixel7-behavioral-rehearse.png`):
  - On phone, the timer ring and the two grade buttons sit in a sticky bottom bar, so peeking never hides them.
  - The peek collapses when the timer starts.
  - Neither grade is styled primary until the timer stops. Then the one that fits the time is suggested ("2:10, inside 1:30 to 3:00").
  - Empty states split into "Write your first story" and "All rehearsed · next due Friday". The empty state never shows a success check.
- **Story editor** (`dark-pixel7-behavioral-story.png`):
  - The 13-chip cloud becomes a competency picker, grouped with "No story yet" first, with Senior focus marked and a "pick up to three" counter.
  - The STAR fields get the proportion bar and the spoken-time gauge.
  - Native resize grips go.
- **STAR practice and the STAR drill:**
  - a STAR proportion bar;
  - a spoken-time gauge;
  - a sticky check strip at container `narrow`;
  - warnings only after a field has been touched.
- **"Spot the problems"** (`dark-pixel7-behavioral-examples-checked.png`):
  - `g-check` skins instead of gray system boxes;
  - verdicts as the shared checkpoint glyphs (found, missed, flagged but fine), with one line each;
  - the summary as a `g-stat` ("Found 1 of 2 · 1 flagged that is fine").
- **Settings**, in this order:
  - "Your loop";
  - Appearance (theme, Motion);
  - Checkpoints;
  - Account, with a real action: "Sign in to sync stories across devices", or "Signed in as … · Sign out";
  - Send feedback;
  - data export and delete.
- **Placement:**
  - questions use `g-checkpoint` list mode;
  - results render as the Coding skill map, with each pattern's placement state and one "Start here" marker. This replaces the two chip clouds.
- **Search results** (`/today/search`):
  - the same grouped list as the palette, with kind chips and "See all" per group;
  - stories, searched on the device, appear as their own group.
- **Progress** (`/today/progress`):
  - per-round square grids (23, 34, 13), with the readiness arithmetic ("21 required patterns: 3 Ready, 6 Practiced, 5 Learning, 7 New = 37");
  - problems by difficulty;
  - missions x/9, cases x/27, answers x/91, and stories;
  - Weakest 5, with a Drill button;
  - review strength, retention, the existing `g-forecast`, streak and XP;
  - mock history;
  - Unfinished.

  On phone, the grids wrap at 12 squares per row, and each section is a `g-disclosure` with the first one open.

- **Feedback dialog** (`dark-pixel7-feedback-dialog.png`) and **pilot welcome** (`dark-pixel7-pilot-welcome.png`): they migrate to `g-page-header` type and the new tokens. The copy fix ships in R1.
- **Sign-in, AI allowance, offline and sync-failed states:**
  - the sync icon and its popover (2.11);
  - "Mock rounds need a connection" on the Mock hub;
  - the AI allowance line in the start sheet.

---

## 5. Phased plan

### 5.0 Rules for every iteration

Every iteration follows CLAUDE.md:

- `npm run verify` passes.
- Three-device e2e passes on the exact head. When the iteration touches navigation, the player or the Lab, the `tablet` subset (`@nav`, `@player`, `@lab`) passes too.
- `audit.mjs` runs in both themes at desktop, w1024, pixel7 and w320 (plus ipad when navigation changes), with axe at 0 violations.
- `pixdiff.mjs` runs against a build of `main`, and every differing screenshot is read.
- `timing.mjs` measures first paint and first tap on the throttled phone, with no regression against `main`.
- **First-paint closure.** `apps/app/scripts/first-paint-bytes.test.mjs`:
  - reads `ng build --stats-json`;
  - computes main plus the tabs chunk plus the default page's chunk, plus their static imports;
  - fails above the committed baseline + 2 kB. An intended increase updates the baseline in the same commit and is stated in LOOP.md.
  - checks the same closure for kit leaks.

  Angular's own initial budget stays as a backstop, never above 855 kB.

  R0 note: the gate runs as `apps/app/scripts/first-paint-bytes.mjs` in the app's `postbuild`, on the stats every production build writes, and fails more than 2 kB below the baseline too; its total includes the global stylesheet; `first-paint-bytes.test.mjs` tests its logic on fixtures (`tools/verify/README.md`).

- **Content review**, when the iteration's "Content review" line is not "none". An independent Claude content-review agent checks the listed editorial calls before landing. Its findings are fixed or recorded in LOOP.md.
- A `docs/LOOP.md` entry, then a fast-forward to `main`.

### 5.1 Order and dependencies

Iterations are ordered by impact, alternating between organization and visuals. **Ships alone** means the iteration needs no other iteration in this plan.

| #    | Iteration                                                                   | Depends on             | Ships alone                    |
| ---- | --------------------------------------------------------------------------- | ---------------------- | ------------------------------ |
| R0   | Measurement baseline                                                        | none                   | yes                            |
| R1   | First-screen fixes                                                          | none                   | yes                            |
| R2   | Player stage and checkpoint dock                                            | none                   | yes                            |
| R3   | Transport and diagram palette                                               | R2                     | yes after R2                   |
| R4   | Engine release A                                                            | none                   | yes (invisible)                |
| R5   | Routes, redirects and five tabs                                             | R4                     | no                             |
| R6   | Tokens and theme                                                            | none                   | yes                            |
| R7   | Chrome components                                                           | R6                     | yes after R6                   |
| R8   | Coding hub and Problem library                                              | R5, R7                 | no                             |
| R9   | Today I: Target and Up next                                                 | R4, R5, R7             | no                             |
| R10  | Desktop rail                                                                | R5, R6                 | no                             |
| R11  | Design hub I: shelves, missions, cases                                      | R4, R5, R7             | no                             |
| R12  | Behavioral hub and Questions                                                | R4, R5, R7             | no                             |
| R13  | Mock hub and rounds                                                         | R4, R5, R7, R12        | no                             |
| R14  | Today II: readiness, Progress, Continue, Weak spots, plan page              | R9                     | no                             |
| R49  | Company tags I: interview source lists on problem and case pages            | R8, R11                | no                             |
| R15  | Search and naming sweep                                                     | R8, R10, R11, R12, R13 | no                             |
| R16  | Pattern hub and workspace                                                   | R8                     | no                             |
| R17  | Tracer annotations A: arrays, pointers, lists, stacks, heaps                | none                   | yes (invisible until rendered) |
| R18  | Tracer annotations B: graphs, trees, grids, tables                          | none                   | yes (invisible until rendered) |
| R19  | Motion layer: arrays and lists                                              | R3, R17                | no                             |
| R20  | Checkpoint engine and array picks                                           | R19                    | no                             |
| R21  | System diagram kit and Lab canvas (desktop)                                 | R3, R7                 | no                             |
| R22  | Lab on phone                                                                | R21                    | no                             |
| R23  | Graph renderers and node and edge picks                                     | R18, R20               | no                             |
| R24  | Trees, tables, heaps, hashmaps                                              | R18, R20               | no                             |
| R25  | Debugger code pane                                                          | R3, R17, R18           | no                             |
| R26  | Lab editing                                                                 | R21                    | no                             |
| R27a | Caching widget, kit and experiments                                         | R3, R7                 | no                             |
| R27b | Charts and timelines kit II; Lesson widgets I (Load Balancing, Replication) | R27a                   | no                             |
| R28  | Lab Run                                                                     | R21, R22, R27b         | no                             |
| R29  | Case page and diagrams I (9 core cases)                                     | R11, R21               | no                             |
| R30  | Design hub II: topic links, drills, mission links                           | R11                    | no                             |
| R31  | Pattern specimen A (5 array patterns)                                       | R16, R20               | no                             |
| R32  | Pattern specimen B (18 patterns)                                            | R31, R23, R24          | no                             |
| R33  | Drag acts                                                                   | R23, R24               | no                             |
| R34  | Case widgets I: retries, hot account                                        | R27b, R29              | no                             |
| R35  | Review session                                                              | R14, R20               | no                             |
| R36  | Interview session, scorecards and mock loop                                 | R7, R13                | no                             |
| R37  | Behavioral practice surfaces                                                | R7, R12                | no                             |
| R38  | Case diagrams II (18 advanced cases)                                        | R29                    | no                             |
| R39  | Thumbnails: missions, cases, visualizers                                    | R8, R11, R21, R23, R24 | no                             |
| R40  | Workspace trace on the kit                                                  | R16, R23, R24          | no                             |
| R41  | Lesson widgets II                                                           | R27a                   | no                             |
| R42  | Lesson widgets III                                                          | R27a                   | no                             |
| R43  | Lesson widgets IV                                                           | R27a                   | no                             |
| R44  | Lesson widgets V                                                            | R27a                   | no                             |
| R45  | Lesson widgets VI                                                           | R27a                   | no                             |
| R46  | Case widgets II                                                             | R27a, R29              | no                             |
| R47  | Case widgets III                                                            | R27a, R29              | no                             |
| R48  | Amazon target                                                               | R14, R12               | no                             |

**Dependency notes that fix the previous draft:**

- Journey 8 is accepted in R14, which ships `/today/progress` together with the readiness card.
- Pick checkpoints ship per renderer: arrays in R20, graphs in R23, tables and trees in R24. Drags come last (R33). No ask needs a hit target that does not exist yet.
- The motion layer (R19) animates only arrays, lists, stacks and grids. Trees get motion in R24, after their pre-layout, so Subsets nodes never slide every frame.
- Every iteration that uses `g-segmented` or sheets (R21, R27, R29 and later) depends on R7.
- `g-sequence` is built in R27b, before the retries widget (R34). R27b note: it is `g-timeline`'s messages (swimlanes over a time axis, travelling messages, × for a rejected one); R34 adds timeout brackets there rather than a second component.
- R27 was pulled forward by the owner on 2026-10-13, ahead of R8 to R26, and takes the Caching widget (`cache`) from R42. It is split: R27a ships the Caching widget with the kit pieces and experiments framework it needs; R27b adds the rest of the kit with Load Balancing and Replication. R41 to R47 depend on R27a, and on R27b for any kit piece only R27b builds (`g-histogram`, `g-timeline`, `g-sequence`, `sim.worker.ts`).
- R49 was placed after R14 and before R15 by the owner on 2026-10-17: it ships the sourced "Reported in interviews" lists first; the Company facet, row chips and company search wait for a later iteration, once coverage is worth filtering by.
- R19 is not a dependency of R27a: its widgets need no FLIP, pacing or trails, only "may script animate now?", which R3's `motionAllowed()` in `core/motion.ts` answers (data-motion, the test mode and the OS setting). Plays are bounded and particles pooled (`viz/kit/particles.ts`), so 3.5's budget holds without R19's `MotionService`.

### 5.2 Iterations

**R0 Measurement baseline** (tooling only).

- **Scope:**
  - verify states for `/plan` (empty, with plan), `/interview/loop` (setup, running, debrief), placement questions and results, the drill summary, and code Accepted;
  - the `w1024` and `ipad` verify profiles, and the e2e `tablet` project with the `@nav`, `@player` and `@lab` tags;
  - `?motion=off` plus `data-motion` support in `audit.mjs`, `pixdiff.mjs` and Playwright (R0 note: R0 ships `data-motion="off"` only; `?motion=off` and its reader land in R3, see 3.5);
  - `first-paint-bytes.test.mjs` with its committed baseline and the kit-leak check;
  - `style-tokens.test.mjs` with its committed baseline;
  - a stored screenshot set of `main`.
- **Accept:**
  - the new states render clean in both themes on all profiles;
  - the byte test fails when a fixture adds 3 kB to the tabs chunk;
  - the leak check fails when a fixture imports a viz module from `tabs.page.ts`.
- **Content review:** none.

**R1 First-screen fixes.**

- **Scope:**
  - rename the `.plan` section class;
  - hide the 0% mastery ring stroke;
  - show stats as 2×2 on phone;
  - the Mock tile copy includes Behavioral;
  - remove the `has-viz` icon;
  - Drill gets a back button (`drill.page.html:1-5` has none);
  - "Read the X lesson →" for the wrong-answer link;
  - the Quick check chip label;
  - Feedback moves off the right edge into Settings and a Learn header ⋯ menu;
  - the pilot notice copy becomes "Send feedback any time from Settings";
  - the workspace Python Trace note (4.2);
  - "Clear plan" gets a confirmation and Undo.
- **Accept:**
  - in `dark-desktop-learn`, the Study plan tile's top equals Review's (was y 491 vs 463);
  - no fixed element overlaps content in any pixel7 or w320 state;
  - a copy spec finds no "right edge" text;
  - e2e: Clear plan then Undo restores the plan.
- **Content review:** none.
- **R1 note:** Settings already had Send feedback, so R1 removed the tab and added the Learn ⋯ menu (Send feedback, Study plan). The copy spec is scoped to app templates (`templates.spec.ts`), since lesson content legitimately says "right edge" (B-trees, grids, the SMTP widget); README.md and docs/PILOT.md were rewritten by hand. "No fixed element overlaps content" is checked by the audit's `fixed` list on every state and an e2e on phone.

**R2 Player stage and checkpoint dock.**

- **Scope:**
  - the player layout of 3.7: the phone and desktop formulas, region R, and the desktop checkpoint dock beside the stage;
  - the player route hides the tab bar under 1024px (a `data: { focus: true }` flag read by `tabs.page.ts`);
  - the intro behind ⓘ;
  - an opaque header;
  - the inline, non-modal checkpoint dock with list choices;
  - narration kept during checkpoints (the first sentence of `note` until captions land);
  - play stays enabled;
  - keyboard hints on fine pointers only;
  - the review card's sticky Continue bar on phone;
  - delete `returnAfterContinue`, `reveal` and `checkpointStart`.
- **Accept:**
  - e2e asserts that the visual's bounding box y changes by 0 between frame, ask, answered and continue, on all three devices and the tablet;
  - in every `player-*-predict` state at pixel7, w320, iPhone 17 and 1280×720, 100% of the stage and the whole prompt are in view with no page scroll (today 0% of the graph in `dark-pixel7-player-kruskal-mst-predict.png`);
  - the review answered state shows Continue without scrolling on pixel7.
- **Measure:** `timing.mjs` first tap on `/visualize/:id`.
- **Content review:** none.
- **R2 note:** the player is a size container (`container: player / size`) with three layouts and a fallback, all in
  `player.page.scss`; each query joins its height to a sanctioned 640 or 900px width with `and` (the style ratchet
  checks only width lengths), and the player's raw `@media` count falls from 2 to 0. The formulas run on the
  container's content box, after a 12px top padding, with no row gaps: phone and tablet S = clamp(200px, 100cqh − 48px −
  240px − dock, 420px), where the dock is 80px plus the bottom safe area (a buttons row over the timeline: R2 keeps the
  range and its checkpoint ticks on phone until R3's phone dock with ⋯ replaces them, so S is 24px under 3.7's numbers);
  desktop S = clamp(280px, 100cqh − 144px, 560px) with a 64px dock. Measured stages: Pixel 7 407px, w320 268px, iPhone 17
  (WebKit, 44px iOS toolbar) 249px, iPad Mini 418px, 1280×720 459px (the tab bar still shows at 1024px and up until R10's
  rail), 1280×1000 558px, 1024×768 507px. The caption row is `auto`: outside a checkpoint it shows the whole `note` and a
  longer note takes its room from region R (`minmax(0, 1fr)`), never from the stage; beside a checkpoint it is the note's
  first sentence in at most two lines, so R keeps 240px. Landscape (container 640 to 899px wide and under 544px tall, or
  900px and wider and under 424px tall, where the desktop stage would fall under 280px): the stage on the left; so a
  1366×640 laptop window gets the desktop layout. The fallback (narrower than 640px and under 544px) lets the layout itself scroll; its stage and Continue
  are not sticky, because at 400% zoom they would cover the verdict or narration that focus moves to, and focus that
  follows a tap scrolls into view there. `ion-content`
  does not scroll on this page. The header is opaque, its title an inline `h1` that ellipsizes ("Kruskal's Minimum
  Spann…" at 320px), and ⓘ opens the intro (pattern, difficulty, complexity, summary and "Now write it yourself") as a
  popover dialog named after the visualizer; the write-it link also shows in the caption on the last frame. Play during a
  checkpoint focuses the question and announces "Answer the question to continue." (no skip exists until R3). The prompt
  is not an `aria-live` region: focus moves to it, which is the announcement, and the narration is not live for the render
  after Continue moves focus to it, so nothing is read twice. Drawings fit the stage structurally: a graph or tree SVG is
  at most the stage's height less its legend (less a first row of the lists when the run has any), the same on every
  frame, and height never takes it below 0.6 of its own scale; the lists give way and the stage scrolls for them. In a
  table's run, and where a graph or tree sits under an array, the stage is a column of fixed height: the drawing takes what
  the views above it, its legend (on as many lines as it wraps to) and a 66px first row of the lists leave, down to its
  floor (a table's square cells 1.6 times their text and as wide as their column labels, its row headers' column as wide
  as their longest label), and an array above it keeps room for the run's most pointer rows, so the drawing keeps one size
  on every frame; outside the stage (`@container stage`) review cards, lessons and the workspace are unchanged. A
  checkpoint takes focus from anywhere in the player or its heading (which a tab switch under 1024px gives focus only
  when the hidden tab button had it), and from a control it hides, but never from a field the learner is typing text
  into (the Timeline slider, the Predict mode switch and a read-only field are not such fields). Region R then scrolls
  back to its top, or, beside such a field, only as far toward the dock as keeps the field in view; a checkpoint that
  does not get focus is announced ("Checkpoint: " and its question). The Predict mode switch and
  the score sit in region R under the checkpoint (phone) or under the dock (desktop); R3 kept them there (its note), and
  4.4's header switch moves them in R16 or R25. The review card's rating
  bar is sticky above the tab bar under 1024px only when the window is at least 480px tall.

**R3 Transport and diagram palette.**

- **Scope:**
  - `g-transport`: speeds including Instant, next checkpoint, jump to result, the scrub guard, tick states, chapter bands when present, and the phone dock with ⋯;
  - `--g-viz-*` and motion tokens with the corrected values of 3.6, `--g-state-*` re-pointed, and the dimming rule;
  - the Motion device preference, with the bootstrap mirror and Ionic `animated`.
- **Accept:**
  - `theme-contrast.spec.ts` checks every `--g-viz-*` pair: text 4.5:1, marks 3:1, and ticks 3:1 against the track;
  - Reduced motion turns off page transitions after a restart in e2e;
  - the scrub guard holds on an unanswered tick on all three devices.
- **Content review:** none.
- **R3 note:** `g-transport` (`viz/kit/transport.component.*`, pure guard logic in `viz/kit/scrub.ts`) replaces the
  player's controls. The desktop layout gets one bar (Restart, Step back, Play, Step forward, Next checkpoint, Jump to
  result, the Timeline, the count and Speed as chip radios; the key hint only from 1280px); every other layout gets 3.7's
  56px phone dock (back, play, forward, "N / M", ⋯), so the stage gets the R2 timeline row's 24px back (Pixel 7 420px,
  w320 294px). ⋯ opens an inline, non-modal group ("Playback") above the dock, over region R and never over the stage
  or the caption: the Timeline with its ticks and bands, Speed, Restart, Next checkpoint and Jump to result, the Timeline
  and Speed under visible labels; Describe (R19) and Presets (R25) join it later. It is laid out to fit R on a 320px phone
  (Speed one row, the actions one row of icon over label) and capped at R's measured height; while it is open in a
  container under 920px tall, where a last frame's caption can leave R short, the caption keeps to its first two lines,
  the result leaves the view but stays in the caption's live region, and the code link waits until it closes, so R keeps
  room for the whole panel (a tablet held upright keeps the whole caption), and only a window too short for that scrolls
  inside it, keeping the labelled Timeline. While a drag holds, the chip takes the Timeline label's row and the label
  gives way, so the panel needs no clearance row and fits a 360px-tall phone held sideways. The count and the Timeline exist once in every layout. The Timeline stays a native range for the
  keyboard, assistive tech and Playwright's `fill`, under a transparent layer that takes every pointer, so a drag is
  guarded alike in Chromium and WebKit and with touch: it holds on the first unanswered tick it crosses, with the chip
  "Answer it, or skip?" over the held tick and a selection haptic (`selectionStart`, `selectionChanged`, `selectionEnd`, since iOS ticks only
  inside a selection), until 24px more of drag from where the hold began skip it, so close ticks (LCS at 320px) skip at
  most one per 24px; letting go while held opens that checkpoint; a tap is a drag of no length, and its trailing click
  is suppressed, since it would land on the checkpoint that replaced ⋯ under the finger. Every other seek (keys,
  Next checkpoint, Jump to result, `fill`) closes an open checkpoint and leaves it unanswered. Skip in the checkpoint dock
  and a skipping drag record no event; a skipped tick asks again when stepped onto with Predict mode on. Ticks: pending
  hollow, right filled, skipped a thin grey outline, missed a critical ×, so no two differ by hue alone, and the Timeline's
  `aria-valuetext` adds ", checkpoint" and the outcome. Ticks drawn under 16px apart (a turned 8px diamond and its halo)
  merge into one mark in the state that most needs the learner (pending, missed, skipped, right), drawn on the tick
  with that state, so none is drawn half-covered and a tap on a pending mark opens its checkpoint. Instant steps at 4×'s pace with the stage's motion tokens at 0s
  (the plan's alternative, 1×'s dwell, would have put the fastest-looking speed in the middle); R19's `pace` replaces both.
  The counter stays "N / M" (the phone form), since chapters have no data until R17/R18: `Frame.chapter` is added and
  drawn as bands under the track, but not yet named in the count. The ticks need a quiet track, `--g-viz-track` (#2a3040
  / #d3d7e0), on which every tick colour and the thumb reach 3:1. Palette: the `--g-viz-*` roles of 3.6 (stage, current
  and its ink and soft fill, considering, final and its ink, discarded ink, critical, track, dim), on `:root` and the dark
  palette, with `--g-state-*` re-pointed to them; dark's final ink is `--g-found` (#3ddc97), since #22ad74 on the path
  fill over a surface is 4.36:1, and light's is `--g-found-ink` (#02583f), since #0a6b45 on the final wash inside
  binary search's window is 4.22:1. Heat, guess and the longer motion tokens wait for their first renderer (R19, R20, R21).
  `visited` keeps its purple wash until R19/R23 move the window and badges off purple too. Every legacy view's current
  and final use takes the state tokens (graph edges, rings, the legend's marked swatch, the array's halo, the table's
  active header, now text on `--g-viz-current-soft`); `POINTER_COLORS` stays until R19's `g-pointer` deletes it. The
  dimming rule is built on `Prediction.focus` (with `Locator`, 3.4): while a checkpoint with a focus is open, the five
  views fade the fills and strokes of the rest to `--g-viz-dim` (a layer of the stage's colour under an HTML cell's
  text, `fill-opacity` and `stroke-opacity` in SVG) and switch its text to the discarded ink, never the current element;
  no tracer authors a focus until R20, so no screen changes now. Motion: `core/motion.ts` applies the preference as
  `data-motion` before bootstrap (from a `localStorage` mirror) and passes Ionic `animated`; Settings › Appearance ›
  Motion stores it through `core/device-prefs.ts` (2.11), as the theme now does; `MotionPreferenceService.init` runs in
  the app initializer beside `ThemeService.init`, so the module sits in the main chunk, and like the theme it restores
  `data-motion` and the boot mirror from the stored choice on every start. Shortcuts keep their own `Preferences` calls:
  moved too, the module splits into a 300-byte first-paint chunk of its own again, the request that cost a first head
  0.25 to 0.47s of `/learn`'s first paint on the throttled phone (`timing.mjs`); R20, which adds the next preference,
  moves them. Reduced and test mode turn
  transitions off entirely (`transition: none`): the old 0.001ms duration made every property of every element transition
  for a frame, since `transition-property` defaults to all. They also turn smooth scrolling off (`scroll-behavior: auto`),
  as Instant does on the stage; the array and the code panel declare `scroll-behavior: smooth` in CSS and scroll
  without a `behavior`, so the cascade decides in one place. A case study's scrolls name their behavior from
  `motionScroll()` (`core/motion.ts`, the same rule as the CSS) instead, since a smooth `scroll-behavior` on
  `ion-content`'s scroller would lag Ionic's own frame-by-frame scrolls there (the status-bar tap).

**R4 Engine release A** (invisible).

- **Scope:**
  - `target.set` in the API schema (strict, with optional `company`) and the reducer, with the streak exemption;
  - `GET /progress/events?v=2` filtering;
  - `levels.ts`, with the named lists of 2.2;
  - `status.ts`, `readiness.ts`, `next.ts`, `weakSpots` and `practiceMix`;
  - `plan/minutes.ts`, imported by `study-plan.ts`;
  - `SdTopic.shelf` and `level`;
  - `shelfMissions()`;
  - `CodingRecord.lastAt` and `interviews.byTrack` (derived and replay-safe);
  - `interview/mock-problems.ts` moved into the engine, with `catalogId` and `noCatalogReason`;
  - specs for every status rule, the reachability simulation, plan and readiness sharing profiles, the level bar, the catalog ids, and the pull filter.
- **Accept:**
  - replaying the existing e2e seed events yields identical state, apart from the new derived fields;
  - the release still running accepts every event the new client sends before R9 (there are no new ones);
  - a pull without `v=2` never returns `target.set`;
  - the simulation passes, with the tuned values recorded.
- **Content review:** the level profiles and required lists, the core topics, the shelves, the minutes estimates, and the Ready thresholds.

**R5 Routes, redirects and five tabs.**

- **Scope:**
  - the route tree of 2.4, with the declaration order of 2.5;
  - hubs as pages with nested segment outlets, hosting today's pages:
    - Today = Learn without its pattern map and topic cards;
    - Coding hosts that pattern map as its Skill map, plus the code list and the visualize list;
    - Design hosts Learn's 34 topic cards as Topics, and the current design list split into Missions and Cases;
    - Behavioral hosts its list and the story bank;
    - Mock hosts interview-home;
  - `legacy-routes.ts`, with its inline and `loadChildren` groups;
  - `/behavioral/mock` renamed `/behavioral/drill`;
  - five bottom tabs at every width (the rail comes in R10);
  - badge unification;
  - `crossLink`, `app-back`, Android back and the iOS swipe rule;
  - focus routes hide the tab bar under 1024px;
  - links fixed at the source;
  - the route-order, reserved-id and grep specs;
  - `legacy-links.spec.ts`;
  - renamed verify states;
  - the preload order and `firstIdle`;
  - the "Where things moved" note;
  - the Ionic tab-restore spike for hub segments.
- **Accept:**
  - every old URL resolves with the right URL, h1 and lit tab on three devices;
  - no route except redirects lacks a lit tab;
  - switching hub segments adds no Ionic view (back leaves the hub);
  - the journey "Back from a cross-section link" passes;
  - tab labels do not overflow at 320px;
  - there is one Main landmark at every width;
  - journeys 2 and 7 pass their tap counts using the hosted pages.
- **Measure:** the first-paint closure stays within baseline + 2 kB. The new route table and the inline legacy routes are in main; the `loadChildren` group is not.
- **Content review:** none.

**R6 Tokens and theme.**

- **Scope:**
  - spacing, type, radius, width, breakpoint and container tokens;
  - the status tone split;
  - the `label` role, replacing the 11 uppercase styles;
  - the light raised/sunken split;
  - dark surface steps and the no-nested-panel rule;
  - Space Grotesk limits;
  - the style ratchet switched from report to enforce for migrated files.
- **Accept:**
  - `theme-contrast.spec.ts` covers every status tone pair;
  - a pixdiff review of all states in both themes, with every differing screenshot read;
  - light secondary buttons are not darker than the surface.
- **Content review:** none.
- **R6 note:** what the scope's items became.
  - **Ratchet.** It has enforced since R0 (there is no report mode, LOOP.md's R0 decisions), so "report to enforce" is
    the tokens and mixins that let counts fall. R6 adds spacing to what it counts (`tools/verify/README.md`): padding,
    margin, gap and Ionic's `--padding-*`, `--inner-padding-*` and `--margin-*`, negative lengths included, `em` exempt.
  - **Size tokens** in `styles.scss`: `--g-space-1..8`, `--g-radius-xs/sm/md/lg/pill` (`--g-radius` became `-md`;
    `-sm` moved from 9 to 10px), the nine `--g-text-*` roles (display-xl `clamp(1.625rem, 5vw, 2.25rem)`, display-l
    1.5rem, title-l 1.25rem, title-m 1.0625rem, title-s 0.9375rem, body-l 1rem, body 0.875rem, body-s 0.8125rem, label
    0.6875rem: the most used value of each role, so migrations move little) and `--g-width-reading/content/workbench`.
    A token replaced a raw value only where it was identical; off-scale values wait for their components' migrations.
    640 (Settings) and 780 (interview session) stay until R7 and R36 rebuild those pages.
  - **Breakpoints** are mixins (`src/_breakpoints.scss`: `phone`, `tabs`, `desktop`, `wide`, `container-narrow`,
    `container-medium`, `container-wide`), since a media query cannot read a custom property. `phone` keeps the app's
    `max-width: 560px`. The nine plain queries at sanctioned widths use them, compiling to identical CSS; the six raw
    queries the ratchet counts stay with the iterations that rebuild their pages (sandbox 720 and 1040: R21/R22; star
    editor 720: R37; workspace 900: R16; bucketing 400: R46).
  - **Status tones** are a semantic layer in `_theme.scss` over today's primitives, so the split changed no colour:
    success is `found`, info is `active`, ink is the existing `-ink` (light info ink #015a8a, darker than active, which
    reaches only 4.46:1 on its own wash over the sunken well), line and fill are the base hue, soft is a 12% wash.
    `styles.scss`'s answer choices, answer marks and error toast use them; the other components move as their files
    migrate. `theme-contrast.spec.ts` checks every tone's four roles exist and nothing else, ink at 4.5:1 on all four
    surfaces and on its own wash, text on every wash, line and fill at 3:1, line on its own wash, and text on each fill.
    Light warn and predict fills never paint a background (a source test in `style-tokens.test.mjs`).
  - **Label role** is `.eyebrow`, through `@mixin label` in `src/_type.scss` (Inter 600, `--g-text-label`, 0.12em,
    uppercase; each rule keeps its own line-height, so the player's list labels stay `line-height: 1`). The 11 component
    rules include it and keep their colours; `_type.scss` is the only file allowed `text-transform: uppercase`.
  - **Light raised and sunken.** `--g-raised` is #ffffff and `--g-sunken` #eef0f5. Of the 61 `--g-raised` uses, 25 stay
    raised (controls, chips, toast, tooltip and diagram cells and nodes, each with a border) and 36 move to sunken
    (wells, readouts, inset groups, plain-text code, tracks, bars, charts, timelines and maps, with the strokes that cut
    gaps in their marks). The 8 component backgrounds on `--g-bg` stay: the transport, the drill's rating bar and the
    interview footer are page level, the review card's diagram and code wells hold colours checked on the page, and the
    player's input fields are controls. Every raised control a learner presses takes `--g-shadow-raised`: `.g-btn` (not
    `.ghost`), `.g-choice` (not a `li`), link and button chips, the chip radios, the Lab's palette buttons, shard keys
    and insights, the feedback rating dots and the scrub guard's hold chip. Raised fields (the Lab's, case's and
    estimate inputs, the availability select, the plan's date and the study time) keep a border and no shadow until R7's
    skins settle the text fields' surface. An answer choice's number key is sunken, in the question card as in the
    player. The raised border stays `--g-line-strong` (1.6:1 on the surface): WCAG 1.4.11 asks no boundary of a control
    its text label identifies, and the border and shadow mark the edge.
  - **Dark steps:** surface #141824, raised #1c2130, sunken #0f121a (between the page and the card); `--g-shadow` and
    `--g-shadow-raised` are a 1px inner top highlight, `--g-shadow-overlay` adds a real drop shadow. Faint lightens to
    #828a9e (4.5:1 on raised), the syntax comment to #a0a8bc (4.5:1 on the code selection) and the search window to a
    14% wash (muted text 4.64:1 on it).
  - **No panel inside a panel.** `templates.spec.ts` follows component selectors across templates (`class`,
    `[class.panel]`, `[ngClass]` and a host `class`) and pins the three cases it finds, each until its page's iteration:
    the quick check in the pattern page (R16) and in the design topic page (R30), and the STAR editor in the behavioral
    answer (R37). The third never renders: the walk does not evaluate `@if`, and the answer sets `[coached]="false"`,
    which hides the editor's checks panel, so R37 only removes the entry.
  - **Space Grotesk**, as a rule a reviewer can check (`e2e/tests/type.spec.ts`, the visualizer's intro popover and
    Mock's Recent list included, and the loop debrief in `mock-loop.spec.ts`): h1 and `.display` at 20px or more keep
    it, and so do h2 and h3 at 20px or more outside a card (`.panel`, `.card`, `.card-link`); every h2 to h4 inside a
    card, and every heading or title under 20px, is Inter 600 with normal tracking (`@mixin title`), except a label
    (`.eyebrow`) and a monospaced identifier or readout (`.mono`: the Lab's connection rps, the reconcile widget's order
    id), which keeps code type until the JetBrains Mono rule above is applied. One global rule in `styles.scss` gives it
    to every h2 to h4 in a card; a component includes the mixin only for a heading or title under 20px outside one.
    Ionic runs in iOS mode on every platform, so `ion-title` is 17px everywhere and takes Inter. Stage text follows 3.6
    (the grid's start and goal tags in JetBrains Mono 600).

**R7 Chrome components.**

- **Scope:**
  - in `ui/`: page header with condense, section, disclosure, `g-article` (shared by the pattern and design-lesson pages), entry row, chip, segmented, stat, empty state, filter bar and sheet, slider, check and textarea skins, and the icon map;
  - migrate Settings (with the Account action), the feedback dialog, the pilot welcome and the drill summary.
- **Accept:**
  - migrated files have 0 style-ratchet violations and no nested panels;
  - no duplicated ion-title/h1 on migrated pages;
  - no native resize grip or system checkbox remains on migrated pages.
- **Content review:** none.
- **R7 note:** what the scope became.
  - **Header.** `g-page-header` puts the h1 in the large title of Ionic's condense header; Ionic hides the toolbar title
    (`aria-hidden`, opacity 0) until the large one scrolls under it. Ionic gives the banner role to whichever header
    shows the title, which puts a banner inside `ion-content`'s main landmark (axe `landmark-banner-is-top-level`), so
    the component keeps the role on the page's own header. A long title wraps in the large title and ellipsizes only in
    the toolbar once scrolled.
  - **Icons.** ionicons is one module, so every glyph the app imports anywhere ships with first paint (a new glyph costs
    0.25 to 1.2 kB there). `ui/icons.ts` is named re-exports of glyphs the app already used, plus `close` and
    `checkmark`; Settings' sections take no icons.
  - **Built, not adopted.** `g-article`, `g-disclosure`, `g-filter-bar` and `g-filter-sheet`, `g-slider` and `g-check`
    have no migrated user: adopting `g-article` in the pattern and design-lesson pages would retoken their off-scale
    text (R16, R30). `g-sheet` is a native modal `dialog` (top layer, inert page) with its own focus, Escape and focus
    return; `open` follows any close of the dialog, and Android's back button closes it before the page beneath. Tones
    share one `Tone` type and the `tone-ink` mixin (`src/_tone.scss`).
  - **Settings** follows 4.10's order with what exists (Study, Reminders, Appearance, Keyboard, Account, Pilot, Your
    data): "Your loop" and Checkpoints come with R9 and R20. Its width is `--g-width-reading`.
  - **Text fields** are sunken wells with a stroke border (`.g-textarea`); `mastery-ring` moved to `ui/`, emptying the
    first-paint allowlist.

**R8 Coding hub and Problem library.**

- **Scope:**
  - the Skill map with states, and placement results shown as a skill map;
  - Problems with filters, both views, the membership counting rule, the spoiler rule and URL state;
  - Visualizers in track order.
- **Accept:**
  - journey 2 in ≤ 3 taps, with "51 problems";
  - the collapsed library fits in 1.6 Pixel 7 screens;
  - the filter count is announced;
  - back from the workspace returns to the filtered list with its scroll position;
  - no pattern names on Mixed-view rows by default;
  - a bare `/coding/problems` is always unfiltered.
- **Content review:** none.
- **R8 note** (decisions where the code differed from this plan):
  - **Level bar.** R4's engine holds every level to medium (`levels.spec.ts`), not 2.2's "any difficulty for Early career", so "At my level" selects Medium and Hard at every level; Stretch marks follow the engine's lists (Mid-level: Minimum Spanning Tree, Bit Manipulation, Bitmask DP).
  - **Status facet.** 2.3's exclusive library states: Unsolved (never attempted), Attempted, Solved, so the counts add up to 164.
  - **Track chips** stay outside the filter sheet at every width, so journey 2 is three taps on a phone (Coding, Problems, Graphs & trees). Status, Difficulty and Pattern sit behind "Filters" at container narrow and beside the list from medium (`g-filter-bar` gained `inline`). The result line reads "51 problems of 164", on its own line above the list; beside the list the filters keep to the screen and scroll on their own.
  - **Collapsed library.** With every group closed it is 1,310px on a Pixel 7 (1.56 screens of 839px); group headers are 40px. Only the current pattern starts open (the primary pattern of the latest problem worked on, else the placement's Start here, else Arrays & Hashing); any filter opens every matching group.
  - **View switch.** Two toggle chips in `g-segmented`'s selected style (3.2 gives selected chips that style), not `g-segmented`: it shares a first-paint chunk with `ai-disclosure.ts`, and a lazy importer splits it.
  - **Back from the workspace.** Ionic keeps the hub's page, but Angular destroys a segment in the hub's plain outlet whenever the hub's route is left, so 2.5's "the list page stays alive" does not hold. The hub keeps each segment's scroll by URL (`pages/hub/segment-memory.ts`, every hub), and a segment can hand over more (the library's opened groups); WebKit moves the scroll while the page resizes, so the position is held until the page is still.
  - **Coding tap.** The Skill map's first build loaded 74 kB in 11 chunks after the hub (readiness pulled in the behavioral content). Pattern states moved to `readiness/pattern-status.ts`, `PATTERN_TRACKS` to the curriculum catalog, `startHerePattern` beside the placement in `srs/diagnostic.ts`, and the Senior case list no longer imports the case catalog: 7 kB in 5 chunks, and the Coding hub loads with its Skill map in one round trip. Over the local server's HTTP/1.1 that parallel load delayed the player tap through the six-connection limit; production serves HTTP/2, so `timing.mjs` now times over HTTP/2 (`tools/verify/h2proxy.mjs`), where the Coding tap is 0.17 s faster than `main` and the player tap unchanged.
  - **Icons.** A page drawing only kit glyphs reached `ionicons/icons` without ionicons' runtime, which split their shared first-paint chunk (30 files, Today 0.25 s later); `ui/icons.ts` now registers the map by concept name, so both always load together.
  - **Skill states** are `g-skill-state` shapes with a key and a line on what moves a pattern on; placement results use the same map with their own marks (Spotted, a ring with a check, so it never reads as Ready; To learn) and one Start here, which moves past a pattern once it is Practiced. Structures for the Visualizers chips are `algorithms/structures.ts`, outside the first-paint catalog.
  - **Spoilers in counts.** In the Mixed view without pattern tags, Track and Pattern counts would name a searched problem's pattern, so they are not shown and no Track or Pattern chip is dimmed; a filter that would leave nothing is otherwise dimmed (`aria-disabled`) unless it is on.

**R9 Today I: Target and Up next.**

- **Scope:**
  - the target line and the first-run card (clients start sending `target.set` and `?v=2`);
  - the pull version kept with the cursor: `EVENTS_KEY` stores the `v` the cursor was read with, and a device whose app now reads a higher version drops its cursor once (one full pull), so `target.set` events it pulled past under v1 arrive (R4 review finding C1);
  - the derived Target for pilot users, and the inline level row;
  - Up next with the six rules, and "Not today";
  - the shared `app-plan-today`;
  - the Review row, with a matching badge;
  - Learn retired (its map and topic cards already live in their hubs since R5);
  - the first-run sequencing of 2.13.
- **Accept:**
  - journey 1 in 3 taps;
  - the Up next primary button never changes target after it renders (e2e watches it for 3s);
  - the badge equals the Review row total;
  - at most one modal on a fresh install;
  - `first-paint.spec.ts` gains no names.
- **Measure:** first paint and first tap do not regress, and the first-paint closure shrinks as the map and tiles leave.
- **Content review:** the Up next reason copy.
- **R9 note** (decisions where the code differed from this plan):
  - **Loading.** Up next and the loop card are dynamic imports rendered with `NgComponentOutlet`, not `@defer` (which would also pull Angular's defer runtime, about 6.5 kB, into first paint): `first-paint.spec.ts` follows static imports, and a `@defer` dependency is a static import in the source. Both load at `FIRST_IDLE` and only while Today is shown: a navigation away (`NavigationStart`) before then leaves them for the learner's return, so a tab tapped right after first paint loads its own page first. Preloads still start at the first idle period: holding them until Up next had loaded (2.5's wording) left the Coding hub unfetched at a tap right after first paint, 1.95 s against 1.59 s. A chunk that fails to load says so with Reload, and the first-run card keeps "Not now". First paint takes no new engine names, so level labels, the target line's minutes and its date step are spelled in `pages/today/loop-line.ts`; lazy code reads the engine's, since a module shared with a lazy chunk splits into a first-paint chunk of its own. Up next's closure is 82 kB: `rehearsalQuestion` left `rehearsal.ts` (only it reads the 44 kB of competency questions) and `problemsAtBar` left `levels.ts` for `readiness/bar.ts`. The Design hub's Topics draw their mastery rings after the cards: the ring left first paint with Learn, and its own chunk held the hub a round trip.
  - **Held, not live.** Up next renders once progress, stories and this device's case drafts have loaded, then holds: it reads `TodayService.day` (the calendar day, not the clock, which ticks every minute and on every record) and rebuilds only when Today is entered, the day changes, or the learner acts on Today (save, "Not today", the level row, a coverage fix). A sync that lands later shows on the next visit. A signed-in device holds the first-run card until its first pull of the launch, so it never overwrites another device's Target.
  - **Review row and badge** count the same thing: cards due in this sitting (2.6's R5 note, until R35), `ProgressService.reviewDue`. New cards are offered on the row ("10 new · about 5 min") but are not due, so they are in neither total. Caught up reads "All caught up · 4 due tomorrow". A due mission revisit keeps its own row and is not counted.
  - **Rule 4** reads case studies started on this device (`case-drafts`); STAR drafts, saved Lab designs and the mock loop join with R14's Continue. A plan slice's reason names its part and what it does: "From your plan · 1 of 3 today, part 1 of 2. Read the lesson, then solve Longest Consecutive Sequence. Arrays & Hashing is New; the solve makes it Practiced." A round counted more than once reads "Your loop has two Coding rounds, and …" ("A Mid-level loop usually has two Coding rounds" before a loop is chosen). "Not today" leaves a plan slice in the checklist, muted and marked "Not today", and out of the time left.
  - **The loop card.** Level and When are toggle chips (`g-chip`, `aria-pressed`): `g-segmented` shares a first-paint chunk and a lazy importer would split it. Presets are 7, 14, 21, 30 and 60 days; "Pick a date" opens a date field; "No date yet" saves the Target only, and in an edit with a dated plan says first that saving clears the daily plan. Details holds round steppers (0 to 3, at least one round), minutes and the starting point (New by default, journey 1's). Edit on the target line opens the same card filled in; "Your loop" in Settings stays R14's. Saving writes only what changed, once however often it is tapped. The placement offer shows under Up next once a loop with Coding is saved, and stays until it is taken or set aside; saving moves focus to the target line. The target line keeps each of its parts on one line.
  - **Coverage.** With the Target plan on (`buildStudyPlan(..., { target: currentTarget(state).target })`, on Today and the plan page, so pilot plans get it too), a plan whose time cannot place every required unit says so under Up next: "At 45 min a day, this plan covers about a quarter of your loop by Oct 15. All of it needs about 2 h 55 min a day, more than the 2 h a plan allows.", with "Use 2 h a day, the most" (or the smallest offered time that fits) and, second, "Move the date to Dec 8" (`coverage.daysToFit`, new in the engine: the fewest days at the chosen time that place everything). When no daily time fits it reads "All of it needs a later date."; from the day before the interview there is no coverage line.
  - **Pull version.** The app pulls with `?v=2`; `EVENTS_KEY` keeps `v` with the cursor, and a cursor without it is dropped once on read (and on disk at once), so one full pull brings the `target.set` events a v1 pull skipped. A pull without a cursor waits 60 s rather than 20: 20,000 reviews are 2.9 MB of JSON and 50,000 are 7.3 MB (0.3 MB gzipped), and the API itself does not compress.
  - **Menu** stays Ionic's popover (a `g-sheet` is not in first paint), with a neutral hover wash; Progress joins it in R14.

**R10 Desktop rail.**

- **Scope:**
  - the rail of 2.6, with section, sub- and utility items;
  - the `aria-current` rules, counts and the Skip link;
  - focus-route collapse, with its device preference;
  - the rail search field, as a disabled placeholder until R15.
- **Accept** (on w1024, desktop and ipad):
  - one Main landmark, and at most one `aria-current="page"`;
  - the rail never scrolls at 768px tall;
  - utility items never stack two utility pages;
  - selecting the active section returns to its root;
  - container widths at 1024px with the rail expanded are `medium`.
- **Content review:** none.
- **R10 note** (as built, and decisions where the code differed from this plan):
  - **Build.** `tabs/rail.component.ts` is plain HTML and CSS beside `ion-tabs`; from 1024px `ion-tabs` starts at the rail's edge (232px, 64px collapsed), so every page and every container query in it sees the width the rail leaves, and the tab bar's `nav` is `display: none`, leaving one `Main` navigation at every width. Items and the current-item rules are pure functions in `tabs/rail.ts`, the counts in `tabs/rail-counts.ts`, the utility navigation in `tabs/utility-nav.ts`. The tab buttons and the section items share the tabs page's `selectTab`.
  - **Items.** Sub-items are the hub segments that are routes today (a spec pins them to the hub routes' children): Coding (Skill map, Problems, Visualizers), Design (Topics, Missions, Cases), Behavioral (Competencies, Stories). Questions and Guide still redirect (R12) and Mock has no segments (R13). There is no Progress item: `/today/progress` is R14's, which adds one line to `RAIL_UTILITIES`. Send feedback opens the feedback dialog.
  - **Current item.** At most one item is `aria-current="page"`: a sub-item wins over its section on the hub's root (both link to `/coding`). A section is `"true"` on any other page inside it, including a sub-item's page, so the current section is always named; a utility page marks itself only. Hub pages keep their own segment row, whose chip is the page in its own "Coding sections" navigation; the count is per navigation, as ARIA scopes `aria-current` to a set. Today's item is named "Today, 8 due" through `aria-label`, as its tab is.
  - **Counts.** "Problems 14/164" cannot come from `CODING_CATALOG`, which left first paint in R9: it counts `PROBLEM_PATTERNS`' keys (the engine pins them to the catalog's ids), already in first paint through progress, now exported from the engine. The countdown beside Study plan is the target line's, from the engine's new `daysLeftLabel` ("23 days left", "interview tomorrow", "interview today"), and nothing once the date has passed; the learner's calendar day is `ProgressService.day`, which Today, the plan page and the rail share. A count that does not fit beside its label takes a second line, so the label is never cut.
  - **Sections.** A section item does what its tab button does, and both return the active section to its root: above the hub Ionic pops to it, and on a hub segment (which Ionic already counts as the root, so its own select did nothing) the hub's first segment replaces the URL, as the segment links do. Another section opens at its last URL. A sub-item replaces the URL on its hub and above the hub pops the stack to it (`navigateBack`; Ionic keys a hub's view by the hub's URL).
  - **Utilities** open in one navigation, with no other page shown on the way and one history entry: the new page goes onto the Today stack's views under its lowest utility page, so the stack never holds two, even when the first led on to another page (Study plan to Review). Ionic has no way to push onto a tab that is not shown (a tab switch makes an unknown view the tab's root), so `utility-nav.ts` takes the Today stack out of the outlet's private stack controller while the navigation runs and puts the kept views back under the new page; the dropped ones it destroys, except a shown one, which stays last so `replaceUrl` (which drops whichever view Ionic holds last) removes it with its history entry. A spec checks the controller's shape in Ionic's source; without it the page is pushed plainly. Openings run one after another, since one cancelling another's navigation would have the first put back the views it took out.
  - **Focus routes** collapse the rail to its icons unless the learner expanded it there; the toggle ("Expand menu", "Collapse menu") shows only on focus routes, so elsewhere 1024px is always `medium`. Collapsed, labels and counts are visually hidden and each icon has a native title. The preference ("rail collapsed", `grasp.rail.collapsed`) is read through Preferences with a localStorage mirror for the first render, as the library's are; `device-prefs.ts` stays in main alone.
  - **Search** is a disabled field with its "Ctrl K" hint until R15. The Skip link comes first (fixed, so the collapsed rail never clips it) and gives focus to the page's heading, or to its main content on a page without one (an interview session).
  - **First paint.** Built into the tabs chunk, the rail cost phones 13 kB (3.3 kB gzipped) and Today's first paint about 0.15 s on `timing.mjs`'s phone, even unbuilt there. So it is its own chunk, which the tabs page imports from 1024px only and renders with `NgComponentOutlet`; the tabs already start at its edge, so nothing shifts when it arrives a round trip later. It takes the tabs page as a `RailHost` input (a type-only import) rather than an injected token, and the tabs page computes its counts, so the lazy chunk shares no module with first paint's files and splits none. The rail registers its own glyphs, all already in first paint for other pages, and keeps its one new glyph (Send feedback's chat box) as local SVG data, since every glyph imported from `ionicons/icons` ships in first paint. Without the chunk (a first visit that goes offline) the tab bar stays, and a later load restores the rail.
  - **Elsewhere.** `bringStageIntoView` read the tab bar's top, which is 0 once the bar is not displayed, so every lesson widget play scrolled at desktop width; it now uses the viewport's bottom then. `pathOf` joined `tabOf` in `cross-link.directive.ts`.

**R11 Design hub I: shelves, missions, cases.**

- **Scope:**
  - the shelf overview and the six shelves, with home missions, coverage labels and "Also in";
  - the Missions grid and the Lab card;
  - the Cases library with filters;
  - the SD renames;
  - the near-twin differentiators.
- **Accept:**
  - journeys 3 (browse) and 6;
  - the `shelfMissions()` spec pins the table of 2.8;
  - every topic row links its missions and cases.
- **Content review:** the shelf assignments; the near-twin clauses; the Coordination `scenarioIds` (recorded as a follow-up if they need changing).
- **R11 note** (as built, and decisions where the code differed from this plan):
  - **Shelves.** The engine's shelves since R4 are the source, and 2.8's table now matches them (Async & delivery, Multi-Region on Data, Reads at scale 4 topics, Data 9). `shelves.spec.ts` pins the whole table: each shelf's core and advanced topics, home missions with "n of m", Also in, and each shelf's case count (Foundations 21, Data 24, Reads 14, Async 16, Coordination 8, Edge 7). `SdTopic.level` is now a field, as 2.8 asked (`SD_SHELVES` lists each shelf's topics core first, and `sdTopicLevel` is gone); the shelf stays a lookup (`sdTopicShelf`), since `SD_TOPICS` is in first paint and the shelves are not. `shelfStretchAt()` moved from `readiness/levels.ts` to `sysdesign/shelves.ts`, so `levels.ts` no longer imports the shelves. New in the engine: `topicUses()` (a topic's missions from `scenarioIds`, its cases from `CASE_CATALOG`), `shelfCases()`, and `sysdesign/case-library.ts` (the Cases query in the URL, filtering, and counts per option with the other facets' selection, as `coding/library.ts`).
  - **Topics** (`pages/design/shelves.component.ts`, replacing Learn's cards): h1 "System design" with "6 of 17 core topics Practiced · 2 of 9 missions passed · 3 of 27 cases finished" (each part kept on one line); six tiles ("Ready 1 of 5" and a bar) that scroll to their shelf and focus its heading (2 columns at narrow, 3 at medium, 6 at wide, all on the first screen at w320); the skill-state key; then, a frame later so a slow phone paints the first screen without building 34 rows first, each shelf with its Stretch line from `shelfStretchAt()` (Coordination: "Stretch at Early career and Mid-level"), topic rows (`g-entry-row` with `g-skill-state` and a Core or Advanced chip, linking the lesson) each followed by "Used in 2 missions · 15 cases", two links outside the row so links never nest; then Home missions (each "uses 5 of 5 topics", Passed once passed), "Also in" with full topic names (the catalog has no short names), and "Cases that use this shelf (21) →". 9 topics have no case, so their line names missions only. Links in these lines keep their look with a target at least 24px tall. The mastery ring left the hub: states replace it.
  - **Links between segments** replace the URL, as segment links do: "2 missions" opens `/design/missions?topic=sd-capacity` (the grid keeps the missions that use it, with "Show all missions"), "15 cases" `/design/cases?topic=sd-estimation`, the shelf line `?shelf=`. The link goes with the segment it was in, so the hub moves focus to the new segment's h1 whenever a segment switch leaves focus nowhere.
  - **Missions** (`pages/design/missions.component.ts`): "0 of 9 passed" (and revisits due), a 2-column grid from container medium whose cards keep their own height, each card a link with its title as an h2, its facts line, Passed with best cost and revisits, the revisit link under it, and the Lab card last ("The Lab: Free Build").
  - **Cases** (`pages/design/case-library.page.ts`): "3 of 27 finished", Level chips always shown (Core 9, Advanced 18), search, and a Filters sheet at every width (27 rows need no side panel) with Status (Not started, In progress from this device's drafts, Finished), Shelf and Topic (topics with cases, under their shelves); active chips with Remove and Clear all; one topic adds "Read the Rate Limiting & Abuse lesson →". Rows are one link with the title as an h2: brief, level and topic names as plain text, and a stage bar with "Stage 2 of 9" or "Finished"; a finished case keeps Review and Start over. The summary and the Status facet read one state per case, so a finished case started over counts as In progress in both; "No cases match" waits until the drafts have loaded once.
  - **Renames** at the source: "Caching & CDNs" is "Caching", "Replication & Databases" is "Replication".
  - **Near twins.** Each brief summary opens with its clause (Payment System "Moving money in and out through external processors:", Payment Ledger "The internal book of record every payment posts to:", Ticket Booking "A single on-sale rush for numbered seats, each sold once:", Hotel Booking "Steady sales of interchangeable rooms, counted per night over date ranges:"), and `CaseBrief.related` pairs them; the case page shows "Related: Payment Ledger" under the brief until R29's header.
  - **Content review** changed data: the Coordination `scenarioIds` (2.8), and case topic tags: URL Shortener gains Unique IDs, Chat App Real-Time Delivery, Payment System Distributed Transactions and API Design, Ticket Booking Distributed Locks & Leases, Collaborative Editor Time & Clocks, Code Deployment System Service Discovery. A learner who passed Your First Scale-Up no longer has Consensus & Leaders introduced by it (`replay-baseline.spec.ts` names the exception); the Mid-level Target plan needs no gap mission after News Feed now (URL Shortener covers Unique IDs), and a New learner's whole loop needs 155 minutes a day rather than 150.
  - **Loading.** Topic states moved to `readiness/topic-status.ts`, on `readiness/skill-status.ts` (what every skill state shares), so the Topics load neither the problem catalog nor the behavioral and interview content that `status.ts` reads. The Design hub's closure outside first paint is 34 kB in 12 chunks (the hub and Topics chunks 16.6 kB; the rest is the chrome kit's row, chip and skill state, levels, the shelves, the case catalog and the topic states, shared with other pages). Learn's cards needed nothing outside first paint, so the Design tap now waits one more round trip for those shared chunks, as the Coding tap always has: on `timing.mjs`'s phone 1.87 s against 0.86 s, Coding unchanged (1.56 s). The first build also made the Coding tap 0.43 s slower: the shelves' own chunk split from `levels.ts` and the Skill map waited a third round trip for it; with the level on `SdTopic` and `shelfStretchAt` beside the shelves, `levels.ts` imports no shelves and the Skill map is two round trips again. First paint grows 0.47 kB (the 34 level fields).
  - **Not done here:** from 1024px the hubs still show their segment row beside the rail's sub-items (R10 follow-up); dropping it changes all three hubs and their segment e2e, so it is a follow-up.

**R12 Behavioral hub and Questions.**

- **Scope:**
  - competency rows with states;
  - the Questions library, with statuses and deep links;
  - `/behavioral/guide`;
  - the STAR drill link;
  - the competency jump nav, Target-level preselection, and the "At your level" line.
- **Accept:**
  - journey 7;
  - the competency page's Questions are in the first screen on pixel7.
- **Content review:** the "At your level" lines.
- **R12 note** (as built, and decisions where the code differed from this plan):
  - **Competencies** (`pages/behavioral/behavioral-list.page.ts`): h1 "Behavioral interviews" with "5 of 13 competencies have a story · 12 of 91 questions drafted on this device · 3 stories due" ("has" for one; the last part only while stories are due; each part on one line; shown once the drafts and stories have loaded), "How to answer (STAR) →" as one line, a Rehearse row while stories are due ("Rehearse 3 stories", to `/behavioral/rehearse`; "Tell it aloud" for one), the skill-state key with its rule ("Learning once a story is tagged with it or a mock round asks about it, Practiced once one of its stories is rehearsed, and Ready once a story is told well twice in a row or a mock round scores it Lean hire or better"), then 13 `g-entry-row`s: `g-skill-state` from `competencyStatus`, "7 questions · 2 drafted · 1 story" ("2 drafted" only when there are drafts, so the old "2 answers drafted" is not lost), Flagged, and "Senior focus" for the five double-weight competencies when the Target is Senior. The lead, the STAR and "Before the loop" panels, the STAR drill and story bank cards and the "Flagged in interviews" list left the hub: STAR to the guide, the drill to the Questions header, the bank is the Stories segment, and a flag is the row's chip.
  - **Questions** (`/behavioral/questions`, a hub segment between Competencies and Stories, so the rail's Behavioral sub-items are Competencies, Questions and Stories): "12 of 91 drafted on this device" (drafts of current questions only), "STAR drill: 3 questions with follow-ups, checks at the end, no verdict →" (4.8 says "Timed drill", but the drill has no timer), search (150 ms), Competency chips (13, always shown and wrapping, so journey 7's Conflict chip is never past an edge) and Status chips inline (one facet of three needs no sheet; counts and the result line wait until the drafts and the stories have loaded, so a deep link never flashes "No questions match"), a result line in a live region with Clear all, then the prompts grouped under their competency (an h2 linking its page), each row one link with the prompt clamped to two lines, its draft glyph and "Covered by a story". The URL is the only filter state, replaced (`?competency=conflict&q=disagree&status=drafted`); search matches every word anywhere in the prompt, so "disagree" finds "disagreed" and "disagreement" (5 questions, 4 of them Conflict). Engine: `behavioral/question-library.ts` (parse, params, counts per option without the facet's own selection, as the other libraries).
  - **Statuses overlap.** Stories are tagged with competencies, not questions, so a question is "Covered by a story" when a story covers its competency. Not drafted and Drafted on this device split the 91; Covered by a story cuts across both, so the counts need not add to 91, and several statuses widen the list.
  - **One coverage rule.** A story counts for its first three tags only (`storyCovers`, `COUNTED_TAGS` in `behavioral/stories.ts`), in the competency states, the hub's counts, the Questions status and the story bank's "n of 13 competencies have a story" alike: before R12 the bank counted every tag while the states counted three, so a fourth tag read "1 story" beside New.
  - **Guide** (`/behavioral/guide`, a literal route before the hub, not a segment): `g-page-header` "How to answer (STAR)" with the former hub lead, "Answer with STAR", "Before the loop", and links to the Stories, the Questions and the STAR drill.
  - **Competency page:** h1, the one-liner, the "At your level" line, then a sticky jump row ("Questions (7)", "Guide", "Examples"; buttons that scroll to the part and focus its heading, as the Design hub's shelf tiles do, since the page scrolls inside `ion-content`; the row sticks at the scroller's padding under the toolbar, and each jump measures it, since it wraps to two lines at 320px, so the heading lands 12px under it), Questions first, then "Guide" (the button's own name) with the why, "What a strong answer shows" and "What sinks it" as `g-section`s in success and danger tones, then "See it done" and "Spot the problems", then the AI interview entry. The Questions heading and first row are on the first screen at every profile (e2e on desktop, Pixel 7 and iPhone). "See it done" starts at the Target's level (`linkedSignal` on the level as a string, so a sync or any other record never resets a level the learner picked), and a level picked there changes only the view.
  - **At your level.** `StrongExample.lookFor`: one authored sentence per competency and level (39), drawn from that level's worked example, shown as "At your level (Senior): …", or "(Mid-level, assumed)" with no Target. It follows the Target, not the "See it done" picker.
  - **Loading.** `competencyStatus` moved to `readiness/competency-status.ts`, so the hub's rows load no problem catalog; `QUESTIONS_PER_COMPETENCY` (pinned to the content by `behavioral.spec.ts`) lets the hub count 91 without the 44 kB of competency content, which only Questions and the competency page load. The hub loads with its Competencies segment in one round trip, as Coding and Design do. The hub's closure outside first paint grew from 12.3 kB in 3 chunks to 27.3 kB in 11 (the row, chip and skill-state kit, levels, the skill and competency states, `rubrics.js` for its verdict order), all fetched beside the page by `modulepreload`; on `timing.mjs`'s phone (which now times the Behavioral tab) the tap is 1.26 s against 1.26 s on `main`. Questions load 63 kB in 8 chunks, the guide 17 kB. First paint fell 0.63 kB (961.75 kB; the retired `libraryOutline` glyph and the hub's own icons), within the gate, so the baseline stands.
  - **Shared.** The three libraries (problems, cases, questions) share their URL state (`core/library-state.ts`: the query from the router's parameters, the debounced search, toggles, Clear all, all replacing the URL), the result and empty lines, and the search field's styles (`src/_search.scss`); the engine's parsers read a key given more than once (`?q=a&q=b`) through `url-params.ts` instead of throwing. `g-entry-row` puts a meta separator at the end of the part before it, so a wrapped meta line starts with a part, not a dot.

**R13 Mock hub and rounds.**

- **Scope:**
  - the hub order;
  - the start sheet, with the competency picker and the AI allowance;
  - scripted behavioral as an API session;
  - catalog titles through `catalogId`;
  - the level from the Target;
  - History by round;
  - the offline state.
- **Accept:**
  - a scripted behavioral single round records `interview.scored` with a verdict and keeps the Mock tab lit;
  - the title spec passes;
  - no route from Mock reaches the old client-only scoring.
- **Content review:** none.
- **R13 note** (as built, and decisions where the code differed from this plan):
  - **Scripted behavioral already was an API session.** The API's scripted interviewer has scored behavioral sessions (STAR checks and follow-up lengths through `behavioralScorecard`) since the mock loop used it (LOOP.md 84); only the Mock hub's Behavioral + Scripted start, and the behavioral scorecard's scripted "Try another question" and its "scripted follow-ups instead" fallback, still opened the client-only drill. All of them now post `/interview/sessions` with `mode: 'offline'`, so every single round records `interview.scored` with a verdict and stays under `/mock`. The question page's AI entry falls back the same way. `/behavioral/drill` stays Behavioral's STAR drill; no link from Mock reaches it.
  - **Hub** (`pages/interview/interview-home.page.ts`, rewritten): `g-page-header` "Mock interviews" with "Mid-level loop (assumed) · 4 rounds scored"; the Full loop card first ("One round of each: Coding 45 · System design 45 · Behavioral 20 min", "Back to back at the Senior bar, then one debrief across them.", Continue while a loop is open); "Single rounds", one card per round in the Target, each with "Readiness 37 · Building" (`loopReadiness`, the round's score and band; band words until R14's content review) and the last verdict from `interviews.byTrack` ("Last round: Lean hire, Oct 10"), "Start a round" (opens the sheet) and "Prepare in Coding →", a cross link to the round's hub; then History grouped by round, newest first, each row the catalog title, Scripted or AI interviewer, the date and the verdict or In progress. The track buttons, the 13 competency launchers, the pattern chips and the "Guides, story bank and rehearsal" card are gone.
  - **Start sheet** (`mock-start-sheet.component.ts`, `g-sheet`): Interviewer (`g-segmented`: Scripted or AI interviewer) with its note (scripted: "Scripted follow-ups, scored by rubric checks. No AI and no sign-in."; AI: "AI rounds left this hour: 2 of 3" and the disclosure; a guest signs in inside the sheet; a server without AI says scripted rounds always are); Question or Competency as radios, "Surprise me" first, catalog titles, no pattern chips; for Behavioral the 13 competencies with "One of its 7 questions, picked at random, scored at the Senior bar from your loop."; Start round. A refused start stays in the sheet with its message (dropped once Scripted is chosen; with no AI round left the sheet adds "Scripted rounds are always available."); a sign-in, allowance or AI-unavailable refusal reloads access; a session that started but did not open reopens the sheet with "Open it from History." A hub reload asked for during a load runs after it, and a load that outlives its learner writes nothing. The sheet closes itself synchronously before navigating (`SheetComponent.close()`): Ionic stops change detection on the page it leaves, so a close left to the next render kept the modal open and the session page inert.
  - **AI allowance.** No per-hour round limit existed (`INTERVIEW_MESSAGES_PER_HOUR` counts model calls in both modes). New: `AI_ROUNDS_PER_HOUR` (default 3), a fixed hourly window per learner in the coordination store, taken when a session starts in AI mode or first switches to it (the stored session's `aiRound` flag, so switching back and forth costs one), refused with 429 `ai_rounds_used` before any paid work; `GET /interview/problems` adds `aiRounds: { limit, used }` for a learner who can use AI. The round is taken before the session is saved (taken after, a refused take would have to undo an AI session a concurrent request could already use; a failed save then costs one round). A failed read of the allowance leaves `aiRounds` out rather than failing the catalog, which scripted starts need. No migration: sessions are JSON and the windows table exists. An older client never reads `aiRounds` and shows the 429's message; a release from before R13 (on a rollback) keeps `"aiRound": true` in the session JSON it saves and ignores it, which is harmless. An AI mock loop that meets the limit offers "Switch the remaining rounds to scripted practice", and its setup warns when fewer AI rounds are left than the loop has.
  - **Catalog titles.** `MOCK_PROBLEMS` titles are now the catalog titles (Capacity To Ship Packages Within D Days, Longest Repeating Character Replacement, URL Shortener, News Feed, Rate Limiter, Chat App; Days Until Warmer and Course Schedule Order unchanged), and the title spec in `mock-problems.spec.ts` holds each non-null `catalogId`'s title to its catalog's. The API renders a session's title from the index by id, so History shows catalog titles for sessions stored with the old ones (the stored problem is untouched: scoring compares it).
  - **Level from the Target.** The sheet sends the Target's level for a behavioral round; the mock loop preselects it (`linkedSignal` on the level as a string, so a record never resets a level picked there) and takes its rounds from the Target rather than `plan.set` ("These are the rounds in your loop. Change your loop on Today.").
  - **Offline.** A failed read with no response (`ApiError` status 0) shows `g-empty-state` "Mock rounds need a connection" with "Your last 5 scorecards are below." and Try again; the hub keeps the last 5 scored sessions' summaries on the device (`grasp.interview.history.<learner>`, erased with the drafts), shown by round and not linked. Cards and readiness still render from the synced log; the sheet says it needs a connection and starts nothing. Any other failure keeps the error with Try again.
  - **Loading.** The hub's closure outside first paint is 32.3 kB in 10 chunks (30.5 kB in 6 before). Readiness reads every skill state with the problem and case catalogs and the story bank (40 kB), so `mock-readiness.ts` loads after the hub shows, behind "Readiness …" on its own line; the start sheet is created through `ViewContainerRef` at the same moment, or on the first tap, whose button shows a spinner until the sheet arrives. If either chunk fails to load (offline, or a deploy replaced it), the hub says "Couldn't load all of this page." with Reload, readiness reads "Readiness unavailable", and the next tap tries the sheet again. Built in, they made the Mock tap 0.36 s slower on `timing.mjs`'s phone; now 1.41 s against 1.38 s. Angular's `@defer` was tried and put 7.4 kB of its runtime into first paint.
  - **Naming:** the session's chip and mode button say "Scripted"; scorecards name their source (`scoredBy`): "Scorecard · Scripted: rubric checks", "Scorecard · AI interviewer", or "AI interviewer, scored by rubric checks" when an AI session's scoring fell back to the heuristic (the loop debrief's cards too); "scored by rubric checks" replaces "practice estimate" in the session and the loop.

**R14 Today II: readiness, Progress, Continue, Weak spots, plan page.**

- **Scope:**
  - the readiness card;
  - `/today/progress`, with the phone layout of 4.10;
  - Continue, with device labels;
  - Weak spots and `/today/drill`;
  - the Study plan page of 4.9;
  - "Your loop" first in Settings;
  - "overall mastery" renamed "Review strength".
- **Accept:**
  - journeys 4, 5 and 8;
  - Progress totals equal `status.ts` for seeded states;
  - the readiness arithmetic shown equals the ring.
- **Content review:** the band words and the Progress copy.
- **R14 note** (as built, and decisions where the code differed from this plan):
  - **Loading.** Readiness, Continue and Weak spots are one lazy chunk (`pages/today/today-aside.component.ts`) that Today loads in the same `FIRST_IDLE` effect as Up next (R9's follow-up: no timer of its own), not three `@defer` blocks; a failed load says "Couldn't load your progress." with Reload. From a `wide` container (a desktop with the rail) Today is two columns, the aside on the right (`today` container on a new `.frame`), so Continue is on the first screen at 1280×720; in one column the aside follows the Review rows with Continue first, so it starts within 1.5 Pixel 7 screens even under the placement offer and the coverage line. The aside follows the log and the calendar day, not the minute clock; readiness waits for the story bank and Continue for this device's drafts, read again on every visit to Today. First paint grows 1.61 kB (the aside slot, the Progress menu entry, the utility line, the route guard, `dayLabel`); the Progress glyph (ionicons' stats-chart-outline as one path of local SVG data) is in the rail's chunk, not first paint.
  - **Readiness card** (`readiness-card.component.ts`): a ring (`role="meter"`, "31, Building", its number Inter 700, as Space Grotesk is for display sizes only), the band word, one meter per round on shared columns (so equal scores draw equal bars), "Assuming a Mid-level loop" whenever the Target is not the learner's own, and "See your progress" (journey 8). The band words are the engine's `READINESS_BAND_NAMES`, in `readiness/bands.ts` with the bands, so the Mock hub's cards (whose local map was in `interview-home.page.ts`, not `mock-readiness.ts`) name them through `mock-readiness.ts` without loading the skill states.
  - **Continue** (`device-work.service.ts`, shared with Up next's rule 4, R9's follow-up): the mock loop ("1 of 3 rounds started", "3 rounds, not started"), case studies ("stage 3 of 9, on this device"), code drafts and STAR answers still missing a Situation, Task, Action or Result (a saved answer stays saved, so a complete one is not work), then problems tried and not solved from the synced log ("best 2 of 5 tests"); Today shows 3, Progress all. A case continued from here opens at its stage (`?resume=1` on the case page). Drafts are read again on each visit to Today and after an erase; Up next reads them before choosing its card on a new visit. Rule 4 now also offers code and unfinished STAR drafts. Saved Lab designs are not read: the Lab saves a board as soon as a mission opens, so a stored board cannot tell work from a visit.
  - **Weak spots** read the engine's `weakSpots` (R4), which takes a limit now (Today 3, Progress 5): rows "Flagged in a mock round, Oct 10", "Missed 2 of 3 predictions", "4 of 6 review cards fading", each opening its own drill, and "Drill these · 14 cards" ("Drill this" for one) to `/today/drill?topics=heap,binary-search` (journey 5). That route alone drills (route data, so a `topics` query elsewhere does nothing), redirects to Review without topics, drills each topic once, and says "Nothing to drill" with Back to Today when none is known. It is the Review page in drill mode on `practiceMix`: title "Drill", h1 "Weak spots" with the topic names, a plain line "Drill answers don't schedule reviews." (a drill does introduce its topics), and a summary with "You missed these. Drill them again:" and Back to Today.
  - **Progress** (`pages/progress/progress.page.ts`): `g-page-header` with "Coverage of what your loop asks for, not a prediction of the result.", then seven `g-disclosure`s (the first open on a phone, all open wider): Loop readiness (ring, band, "Each skill scores 0 when New, 25 when Learning, 60 when Practiced and 100 when Ready, and a round's score is their average.", then "(2 × Coding 37 + System design 22 + Behavioral 27) / 4 = 31", one grid per round with "21 required patterns: 3 Ready, … = 37", a key, and the signed-out stories line), Problems by difficulty, Library, Weak spots, Review (Review strength, "How much of the whole card library you hold firmly today; cards not yet learned count as 0", retention, `g-forecast`, streak with "Longest: 9 days", XP), Mock rounds (last verdict per round, the latest loop) and Unfinished. The grids are 23 patterns, 34 topics plus the level's required cases as their own row (4.10's "34" leaves out the cases Design's score counts), and 13 competencies; Stretch squares are dashed and not counted. The engine's `skillGrids` and `loopArithmetic`/`roundArithmetic` (`readiness/skill-grids.ts`, `readiness/explain.ts`) build them from the same states and rounded round scores as `loopReadiness`, so the shown result is the ring by construction; specs check both against `status.ts` for seeded learners.
  - **Study plan** (4.9): h1 "23 days to Oct 25" with an On track, Tight, All covered or Review only chip and Edit; the date line ends "Starting point: Rusty"; a Tight Target plan shows the coverage line with Today's two fixes (R9's follow-up); a day strip from today to the interview day (plan days end on the eve, so the interview is appended), one radio group with one Tab stop, the chosen day's list under it (today's is the full checklist), the choice held while the page rebuilds its plan each minute; the eve is a "Light day"; "By round" bars of the minutes still planned per round with a tick at the round's share of the loop ("64% of the plan · 50% of your loop · 40 items left", "your only round", "not in your loop"). The form asks only date, time and "Starting point" (2.10; "New to this" is "New"), and says "Rounds come from your loop (Coding ×2, System design, Behavioral). Change them in Your loop on Today or in Settings." "Coming up" and "Still to learn" are gone into the strip and By round.
  - **Settings** opens with "Your loop": the loop line, "Rounds: Coding ×2, System design, Behavioral · Starting point: Rusty", and "Edit your loop", Today's loop card in place with focus moved to its first chip (`TodayService.close` now names the page that showed the card, so Today never takes focus for a Settings save).
  - **Naming.** "overall mastery" left with Learn in R9; its formula is Progress's "Review strength", the mastery ring reads "Review strength 40%", and the visualizers' blurb no longer promises a mastery score.
  - **Fixed on the way:** date-only strings (`YYYY-MM-DD`) were formatted with Angular's `formatDate(..., 'UTC')`, which reads them as local midnight, so east of UTC the target line and "Move the date to" showed the day before. Every date-only label now goes through `dayLabel` (`today.service.ts`, in main, on `Intl` in UTC without `@angular/common`, which would split a first-paint chunk), and an e2e in `Asia/Tbilisi` reads the exact date on Today, the plan page and Settings.

**R49 Company tags I: interview source lists** (owner decision 2026-10-17, after R14 and before R15).

- **Scope:**
  - a lazy engine module, `libs/engine/src/companies/`: the reports, the source policy and pure selectors;
  - a "Reported in interviews" list on the problem page and the case page, only when a shown report exists;
  - the monthly refresh as an offline audit script, with the process in `docs/COMPANY_TAGS.md`;
  - not yet: the Company facet, row chips and company search (a later iteration).
- **Accept:**
  - every report names a catalog problem or case, a known company, an https source on an allowed publisher (a spec fails on any denied host), a dated report with its basis and a checked day;
  - a report over 24 months old, or 100 days past its check, is never shown (specs and e2e with a fixed clock);
  - the reports chunk is outside the first-paint closure and loads with its page in one round trip;
  - the audit never fetches a `manual` or denied publisher (a test with a fake fetch).
- **Content review:** every report: the source opens, it names the same problem, the date basis is right, the note is in our own words, the publisher is allowed.
- **As built:**
  - **Data** (`companies/reports.data.ts`): 32 reports from the 36-row pilot after each source was re-read once as a single page on 2026-10-17 (no stored copies): 17 of 164 problems and 7 of 27 cases; Google 2 (1 problem, 1 case), Meta 11 (8, 3), Amazon 7 (5 problems in 6 reports, 1 case), Microsoft 7 (4, 3), Apple 3 (2, 1), Uber 2 (1 case). Dropped: the Microsoft intern Validate BST and Apple Game Leaderboard rows, already past 24 months; Gas Station (Microsoft), whose 24 months end on 2026-10-20, three days after the check; and the Apple Web Crawler row, whose page asks for a peer-to-peer crawling network, a variant. Meta's LCA and Ticket Booking rows moved from the publication date to the onsite month the post gives (interview, Aug 2025), and the four GeeksforGeeks rows whose page shows only "Last Updated" carry that date as `updated` (fix round). `LAST_REFRESH` records the refresh day, and no row may claim a later check. Rows store only the URL, publisher, title, dates, company, our id and a note in our own words.
  - **Policy** (`companies/source-policy.ts`): three `manual` publishers (GeeksforGeeks, the Roundz Newsletter on Substack, Taro) with the terms that decided it, no `automated` one yet, and `DENIED_HOSTS` (LeetCode, Glassdoor on any domain, Blind, 1point3acres, Reddit, Aced/Exponent, Hello Interview, interviewing.io, PracHub, GitHub); `sourceRefusal` checks https, refuses user info, a port and any URL the parser would rewrite (a backslash, upper case), then the denylist (a trailing dot stripped; Glassdoor as any host label, so IDN top-level domains too) and the publisher's own hosts.
  - **Selectors** (`companies/reports.ts`): `visibleReports(kind, id, today)` by company then newest; `reportVisible` with `shownUntil` (24 months after the last day a partial date covers) and `recheckBy` (`checked` plus 100 days); decided with `ProgressService.day`, so expiry needs no release.
  - **UI** (`companies/interview-reports.component.ts`): a closed `g-disclosure` "Reported in interviews: Google, Meta, Amazon", at the end of the problem statement and under the case brief; each line the company, "Interview Aug 2025", "Published May 2025" or "Updated Sep 2025", our note, and the publisher linking out (`target="_blank"`, `rel="noopener noreferrer"`, named with the write-up's title); the footer says how dates are chosen, that Grasp is not affiliated with these companies or publishers, and that a report says nothing about how often a question is asked. With no shown report the host is hidden, so untagged pages are unchanged. Its 16 kB chunk (4 kB gzipped) is shared by the two pages and preloaded with them; first paint is unchanged.
  - **Refresh** (`tools/company-tags/audit.mjs`, tested by `audit.test.mjs` in the engine's `npm test`): lists refusals, rows past or within 45 days of expiry or recheck, and items losing their last row; HEAD-checks links only on `automated` publishers after robots.txt read as RFC 9309 does (User-agent groups, `*` and `$`, the longest rule winning and allow a tie, a 5xx or network error disallowing all); writes `company-tags-audit-YYYY-MM-DD.md` to the system's temporary directory, outside the repository, with a checklist of manual pages. A manual page that refuses an agent is left to a person, never retried another way. It proposes on a `company-tags/YYYY-MM` branch and never pushes `main`; `docs/COMPANY_TAGS.md` keeps a log of out-of-the-ordinary source access.

**R15 Search and naming sweep.**

- **Scope:**
  - the generated index and its staleness spec;
  - the scorer, aliases, cue words and the edit-distance suggestion;
  - the desktop palette (`<dialog>`), the rail field, hub fields and `/today/search`;
  - the full naming table and the icon map;
  - the visualizer and lesson renames.
- **Accept:**
  - journey 3 by search in ≤ 4 keystrokes;
  - the ranking spec passes;
  - "/" respects `characterKeys`;
  - Esc closes the palette and focus returns;
  - the search chunk is outside the first-paint closure and under 40 kB.
- **Content review:** the aliases and cue words.
- **R15 note** (as built, and decisions where the code differed from this plan):
  - **Index.** `libs/engine/src/search/`: `index.data.ts` is generated (`npm run gen:search`, `scripts/gen-search.mjs` over the built engine, formatted with the repository's Prettier config) and holds only what first paint does not already load: the 164 problem titles with their difficulty, and the 27 case summaries from `case-briefs.ts`. Patterns (tagged with their track, so "graph" finds the graph patterns), visualizers, topics, missions, cases, competencies, the 8 mock rounds (`interview/mock-problems.ts`, there since R4) and 11 of the app's own pages (Review, Study plan, Progress, Settings, Mock loop, Placement check, Lab, Stories, the STAR guide, STAR drill, Rehearse stories) are read from the light catalogs first paint holds (`rows.ts`), so nothing is stored twice. The 91 prompts are a second generated file, `behavioral/question-prompts.data.ts` (`QUESTION_PROMPTS`), which the Questions library now reads instead of the competency guides (R12's follow-up). `index.spec.ts` regenerates both in memory and fails when either is stale; it also checks unique ids, every tag and every alias target.
  - **Scorer** (`score.ts`): words of any script (`\p{L}`, `\p{N}`), folded for case, accents and apostrophes; a hyphenated word read both apart and joined ("k-th" is kth, "Union-Find" and "union find" are one title); a title or alias compared without spaces. Exact title 100, title prefix 60, alias prefix 50, every word starting a title or alias word 40, with the tags' names 25, with the blurb and the kind's own name ("mock", "case") 10; ties by kind order, then the shorter title. A query is also read without leading and trailing filler (design, a, an, the, system, service), so "design a URL shortener", "chat system" and "notification service" find their cases. In question prompts a typed word under 5 letters matches whole words only ("trie" is not "tried"). Problems are tagged with their patterns, so "heap" finds heap problems, but a result never shows them (2.9's spoiler rule). `didYouMean`: the closest title or alias (a product name gives its case's title), within 2 edits of the whole phrase or 1 of its start, a swap of neighbours counting as one ("dijsktra"), never a question prompt and never ending in its own punctuation. Rounds use `ROUND_NAMES`, with "Around the app" for pages outside a round.
  - **Aliases** (`keywords.ts`): the old mock titles on the mock rounds and the cases ("Design a …"), Course Schedule II and Daily Temperatures on their rounds; common problem names (Koko Eating Bananas, Daily Temperatures, Subarray Sum Equals K, 01 Matrix, House Robber III, Two Sum II, Three Sum, Four Sum II, Kth Largest Element in an Array, LCS, LIS); textbook names (Load Balancer, Cache, Rate Limiter and Throttling, Consistent Hashing, CAP Theorem, Raft, Paxos and Leader Election, Pub/Sub and Kafka, Authentication and OAuth, Two-Phase Commit and Saga, WebSockets, Disjoint Set and DSU, Priority Queue and Median, Prefix Tree, Hash Map and Hash Table, Floyd, Kruskal and Prim, Memoization, BFS, DP, MST, Tree DFS); renamed titles (Caching & CDNs, Replication & Databases, the visualizers' old titles); the app's words (Design Lab and Free build, Drill and Flashcards, Story bank). Product names (TinyURL, Twitter, WhatsApp, Uber, Yelp, Dropbox, Google Docs, YouTube, Ticketmaster, Kafka) are a separate list, searched but never shown or suggested. Cue words: sorted, k-th and top k, contiguous and subarray, prerequisites, dependencies and cycle, next greater, next smaller and previous greater, overlapping, cycle, permutations and combinations, prefix, connected components, shortest path, unweighted, level order and fewest steps, weighted, subsequence, xor; and disagree, mistake, mentor, deadline, unclear and vague, persuade, convince and pushback, criticism.
  - **Ranking spec** (`ranking.spec.ts`): 58 query to first-result pairs, journey 3 ("rate": one System design round holding Topics, Cases, Mock rounds and Missions, with the Rate Limiting & Abuse topic, Bot Storm through its topic tag, the Rate Limiter case and the Rate Limiter mock round), the suggestions, the cap and count for See all, the spoiler rule, stories and links.
  - **Keys** (`search/search-keys.ts`, in the tabs): Ctrl K, or Cmd K on Apple devices (where Ctrl K deletes to the end of the line in a field), K by its key or by its place on a non-Latin layout, anywhere but the code editor (`.cm-editor`) or a dialog; "/" only with `characterKeys` on and as a page key. `isKeyForPage` now counts a native `<dialog>` as an overlay, and any open modal dialog makes the page behind it inert even when focus falls to the body. From 1024px the keys open the palette; under 1024px they open `/today/search`, so phones never get an overlay. What is typed while either opens is held (`holdKeys`) and becomes the query, never a page key; Esc cancels.
  - **Palette** (`search/search-palette.component.ts`, its own chunk, prefetched at the first idle period on a desktop, so no first-paint cost, and fetched at once on a Ctrl or Meta keydown or the rail field's hover; "Opening search…" shows while it arrives, and without it the search page opens with what was typed): a native `<dialog>` (`tabindex="-1"`) opened with `showModal()`, 640px, an input with `role="combobox"` and `aria-activedescendant` over a `listbox` of `group`s named "System design: Topics", each option a link (`role="option"`, so a modified click opens a new tab), at most 8 a kind and "See all 23 problems →" to `/today/search?q=&kind=`; arrows wrap (left to an input method while it composes), Enter opens, the search chord, Esc or a backdrop click closes and focus returns to the launcher; an opened result moves focus to its page's heading, from the rail's launcher too, and back to the launcher when the result is the page already shown; reopening keeps the query, selected, with the top hit active; a polite status counts results; no hits says "Nothing matches “…”" with the suggestion as a button.
  - **Rail field:** the disabled field is a launcher button ("Search", "Ctrl K" or "⌘ K" from the platform, with the matching `aria-keyshortcuts`; an icon with its title when collapsed).
  - **Search page** (`/today/search`, `pages/search/search.page.ts`, one round trip through `lazy()`): the field writes `?q=` (`LibraryState`, replaced), chips per kind found in the order the groups show, with counts (`?kind=`), a chosen kind that finds nothing staying a pressed chip with 0 and "None of the 8 results are problems" offering "Show all 8 results"; rounds as h2 regions and kinds as h3 over `g-entry-row` links (cross links, so back returns), 8 a kind with "See all", the learner's stories searched on the device as their own group, the suggestion in an empty state. Opened empty or by a shortcut, its field takes focus with the caret after the text.
  - **Back after typing:** `LibraryState.write` keeps the cross link's `from` on every replaced URL, so the search page's and the libraries' back button still returns where the learner came from after a search is typed.
  - **Entry points:** a Search link in the Coding, Design and Behavioral hub headers and Mock's, and at the start of Today's (so the wordmark stays centred at 320px), under 1024px only (the rail has the field above): one global class (`g-header-search`) rather than a component, whose chunk measured 0.1 s on the Coding tap; "Search everything for “rate” →" under the Problems, Cases and Questions fields (`search/search-everything.component.ts`). The hub roots get the header link, not a fourth inline field.
  - **Mock round links:** `/mock?round=rate-limiter` opens the start sheet on that round with the question picked (the sheet's new `pick` input), then drops the parameter so back and reload do not reopen it; the pick ends when the sheet closes, and the round list comes with the sheet's code, so the Mock tap loads nothing more for it (R13's follow-up).
  - **Naming and icons:** the icon map gains `reviewIcon` (albums), `drillIcon` (barbell), `quickCheckIcon` (help-circle) and `searchIcon`; flash leaves the app (it drew Review, Drill and Quick check). Drill: the pattern and topic drills are titled "Drill", "Drill · not scheduled", "Drill answers don't change your review schedule", "Drill 6 cards", "Drill all 6 cards", and the card's practice chip reads "Drill" (R1's follow-up). Mock rounds: "Scripted" in the loop setup and its line, "Switch the remaining rounds to the scripted interviewer", "Scripted rounds are still available", the debrief's "Coverage estimate from scripted rounds" and "2 of your 3 rounds were scripted", "the scripted interviewer" in the API's refusals, "scripted mock rounds" in Settings and sign-in (R13's follow-up); `/behavioral/question/:id` is titled "STAR practice". Lab: learner text says "Lab" (the 27 case builds' "Open the build in the Lab", "Load-test it in the Lab", "Finish a Lab mission", the reminders' "A Lab revisit"). The pattern page's "Visualize: …" buttons read "Watch Binary Search →".
  - **Renames:** the visualizers are "Tree Traversal: preorder, inorder, postorder" and "Subarray Sum Equals K with Prefix Sums" (their old titles are aliases); the lesson says "as in Capacity To Ship Packages Within D Days" and links the problem (a variation's new `problemId`, checked by `lessons.spec.ts`). `SD_TOPICS` already read "Caching" and "Replication" (R27a, R27b), and the mock titles were the catalog's since R13.
  - **Budgets:** the search chunk (index, scorer, rows and keywords, and the prompts) is checked after every build by `apps/app/scripts/search-chunk.mjs`, run from `first-paint-bytes.mjs` (both excluded from `native.yml`'s paths): outside first paint, under 40 kB; the light catalogs it shares are not counted. First paint rose 5.10 kB to 967,479 B (baseline raised): the key layer, key holding, loading line and palette loader in the tabs (2.2 kB), the shortcut module, shared by the tabs and the palette (1.0 kB), Review's and Drill's glyphs net of flash (0.8 kB), Today's Search link and the header link's global style (0.6 kB), the modal check in `page-keys.ts` (0.2 kB) and the route (0.2 kB). The search chunks are 33.6 kB; Angular's initial total is 837.2 kB.

**R16 Pattern hub and workspace.**

- **Scope:**
  - pattern hub segments, the problems table and Prev/Next;
  - workspace: "Next unsolved", "Show pattern", the hint ladder, the signature wrap, the first-visit language row, and the phone Problem / Code / Results control;
  - the player end card and "Next visualizer".
- **Accept:**
  - switching pattern segments adds no Ionic view;
  - the signature never scrolls sideways at 320px;
  - the hint ladder works offline.
- **Content review:** none.

**R17 Tracer annotations A** (engine content; the stage shows it as each renderer lands).

- **Scope:**
  - `caption`, `chapter`, `span` and `lens` for the array, pointer, list, stack and heap tracers: Two Sum Hash, Two Pointers, Sliding Window, Binary Search, Prefix Sums, Monotonic Stack, Fast & Slow, Linked List Reversal, Intervals, Heap, Bit Manipulation;
  - `presets`;
  - trivial asks rewritten in place.
- **Accept:**
  - every frame of every default input has a caption of at most 80 characters;
  - every tracer has at least 2 chapters;
  - spans fall within their line;
  - predict-frame counts are unchanged.
- **Content review:** every caption and every rewritten ask.

**R18 Tracer annotations B.**

- **Scope:** the same as R17, for BFS, DFS & Backtracking (Subsets), Topological Sort, Union-Find, Dijkstra, Kruskal, Tree Traversal, Trie, 1-D DP, 2-D DP (LCS), Greedy and Bitmask DP.
- **Accept:** as R17.
- **Content review:** as R17.

**R19 Motion layer: arrays and lists.**

- **Scope:**
  - `diffFrames`, `keys`, `describeFrame` with the Describe table, and `pace`;
  - `MotionService`, with FLIP for arrays, lists, stacks, queues and grids;
  - value landing and comparator labels;
  - `g-watch` and `g-why`;
  - ghost and payoff for list answers;
  - reduced-motion trails.
- **Accept:**
  - an engine spec checks that every adjacent frame pair across all 23 tracers yields events or is marked no visible change;
  - a dequeue animates the front chip;
  - holding → at 4× leaves no element mid-animation;
  - reduced-motion audit states show trails;
  - Describe lists the frame's values.
- **Content review:** none.

**R20 Checkpoint engine and array picks.**

- **Scope:**
  - `pickCheckpoints` (cap 5);
  - pick cell on arrays and grids;
  - value entry;
  - the list fallback preference and target thresholds;
  - the end summary;
  - the review card's `after` payoff.
- **Accept:**
  - pick and value asks pass by mouse, touch and keyboard alone on three devices, for Binary Search, Two Sum Hash, Sliding Window and BFS (grid);
  - review item ids and counts are unchanged;
  - lists open by default when targets are under 44px on coarse pointers.
- **Content review:** none.

**R21 System diagram kit and Lab canvas (desktop).**

- **Scope:**
  - the glyph sprite, with role glyphs;
  - nodes, routed edges and sqrt widths;
  - pooled particles;
  - fit-to-content;
  - the floating inspector and pinned callouts;
  - trace a request;
  - the Traffic handle, and the Workload popover with only the declared controls;
  - the Model chip;
  - Free Build goals (display only until R28 adds the report).
- **Accept:**
  - all nodes in view on open for all 9 missions and 27 case builds, at desktop and w1024;
  - Free Build KPIs color against its goals;
  - routing falls back to curves when no clear lane exists;
  - a pixdiff review of every case build.
- **Content review:** the case build `roles` and `workload` declarations.

**R22 Lab on phone.**

- **Scope:**
  - the goal strip, with Cost;
  - fit on open, without the board-edge rect;
  - the palette sheet;
  - the inline inspector panel;
  - the run dock on the safe area;
  - the coach mark.
- **Accept:**
  - all nodes in view on open for all missions and case builds at pixel7, w320 and iPhone 17;
  - the canvas stays tappable with the inspector open;
  - Cost is visible on phone.
- **Content review:** none.

**R23 Graph renderers and node and edge picks.**

- **Scope:**
  - preset layouts for Dijkstra, Kruskal, topological sort and cycle;
  - `layered.ts`;
  - weight and distance pills;
  - the PQ bar list and relax particles;
  - Kruskal's hulls, forest and rejected pile;
  - pick node and pick edge.
- **Accept:**
  - zero crossings for default inputs, and no more crossings than `circleLayout` for random inputs;
  - no label collisions (placement spec);
  - 14px labels at desktop width;
  - node and edge picks pass by mouse, touch and keyboard.
- **Content review:** none.

**R24 Trees, tables, heaps, hashmaps.**

- **Scope:**
  - pre-laid trees for subsets, traversal and trie, with tree motion;
  - the linked-list re-layout;
  - `g-heap` and `g-hashmap`;
  - the DP formula, arrows and traceback;
  - binary masks;
  - table cell picks.
- **Accept:**
  - the Subsets root's x is constant across all frames;
  - the reversal end state has no crossing arrows;
  - Bitmask cells are at least 28px, with a scroll cue at 320px;
  - LCS asks 4 times.
- **Content review:** none.

**R25 Debugger code pane.**

- **Scope:**
  - `g-code`, with wrap, span, lens and gutter;
  - the Debugger view (execution strip, full watch, call stack);
  - the phone code peek and the full code sheet;
  - the Presets popover;
  - D and ? scoped to the stage.
- **Accept:**
  - no code line is clipped in the `player-lcs`, `player-dijkstra` and `player-linked-list-reversal` states;
  - line 1 is visible at the start;
  - the peek shows the active line on pixel7 and w320.
- **Content review:** none.

**R26 Lab editing.**

- **Scope:** palette drag, smart insert, splice on an edge, the valid-target glow, undo/redo, Delete, the Reset confirmation, and delta chips.
- **Accept:**
  - "insert a cache between App and DB" takes 1 drag (it was 5 steps);
  - an invalid link cannot be dropped and shows its reason, with no toast;
  - undo restores the exact `Design`;
  - a keyboard-only mission clear still passes.
- **Content review:** none.

**R27a Caching widget, kit and experiments.**

- **Scope:**
  - a cut-down `g-stage` (well, dot grid, a ResizeObserver width so one viewBox unit is one CSS px, `role="group"` with `aria-roledescription`), `g-handle`, `g-chart-frame` (fixed scales, ticks, units, threshold line, shaded spans, a playhead, a data table toggle, end labels nudged apart) and `g-sparkline`;
  - `viz/kit/particles.ts`: pooled request dots (at most 60 running), a bounded play clock, and pausing offscreen and on a hidden page;
  - the experiments framework: `ExperimentSpec` templates whose every number is a slot the widget's model fills, `renderExperiment` (the answer is the choice equal to the model's value), the experiment dock and a `held` mode on `widget-check`;
  - `cacheRefill` in the engine, with the widget's traffic, cache latency, snaps and the origin's capacity moved there from the app;
  - the Caching widget (4.7b) in its own chunk, which removes the hit-rate slider bug by construction.
- **Accept:**
  - the reveal spec renders every experiment's prompt, choices and reveal from the model and fails on a digit outside a slot (`p99` and `100 requests` allowed);
  - e2e drags and keys the handles, sets up every experiment in one tap, answers and reads the reveal and the focused regions, flushes and scrubs, and counts zero `Element.animate` calls under Reduced motion;
  - the stage keeps its height through a flush and an experiment, and fits 320px;
  - first paint within 2 kB of the baseline, no kit module in it, and no slower Design or lesson tap on `timing.mjs`.
- **Content review:** the experiment predictions and reveals, and the refill model's wording.
- **R27a note.** The widget's only first-paint change is main's export table (lazy chunks import a few more of its bindings); every glyph comes from the existing set, and `scripts/ionicons-glyphs.test.mjs` fails on a new one, since ionicons ships every imported glyph in a first-paint chunk. `@defer` was not used for the widget's chunk: it pulls Angular's defer runtime into the core chunk, 6.5 kB more on every first paint. `app-lazy-widget` imports the component and creates it instead. The origin latency is a `g-slider`, not a `g-segmented`: a lazy chunk sharing `g-segmented` with the tabs chunk split a first-paint chunk in two (30 files instead of 29), and R3 measured one more first-paint request at 0.25 to 0.47 s on `timing.mjs`'s phone. The capacity snaps are 1,000, 2,000, 4,000 and 10,000/s, so the bigger-origin experiment doubles capacity on a snap.

**R27b Charts and timelines kit II; Lesson widgets I.**

- **Scope:**
  - `g-chart-frame` on the queue, overload, lease and latency charts, with fixed scales, which fixes `overload-widget.component.ts:155` (it rescales to each run's peak);
  - `g-histogram`, `g-timeline` and `g-sequence`;
  - `sim.worker.ts` (app side: Angular compiles `apps/app/src/**/*.worker.ts`), and `balanceRun(..., { samples })` with `series` and `histogram`;
  - Load Balancing (4.7), with a size container on the lesson page for the `wide` breakout;
  - the Replication timeline;
  - the stream numbering fix.
- **Accept:**
  - the reveal spec recomputes every quoted number;
  - "writread" is gone at all profiles;
  - the widget breaks out at container `wide` and stacks at `medium`.
- **Content review:** experiment predictions and reveals.
- **R27b note.** Built as 4.7's "As built". `sim.worker.ts` (in `app/sim/`) runs `balanceRun` with samples, `balanceSweep` and renders the Load Balancing experiments, so the main thread never loads the simulation (its random number generator shares a first-paint chunk); a failed worker says so and still ends the play. The queue, overload, lease and latency charts moved to the kit with fixed scales (overload on a log axis, 10 to 1,000,000, since its queue runs from 0 to 165,200 across settings) and, with Load Balancing and Replication, load in their own chunks through `app-lazy-widget`; lazy widgets format numbers themselves instead of `DecimalPipe`, and the queueing models moved to their own engine module, because either import split a first-paint chunk. Stream events are numbered. The kit's charts are 16 kB with styles, over 3.3's 10 kB.

**R28 Lab Run.**

- **Scope:**
  - `SimResult.queues` and `simulateTimeline` (in `sim.worker.ts` when a run takes over 30ms);
  - the run dock, sparklines and event markers;
  - the run report with goal windows;
  - Call it;
  - case-build goals.
- **Accept:**
  - all mission pass/fail results are unchanged;
  - the run computes on the throttled phone with no main-thread long task over 50ms;
  - reduced motion steps through samples without tweens.
- **Content review:** the case-build goals.

**R29 Case page and diagrams I (9 core cases).**

- **Scope:**
  - the header, with the stage outline and topic links;
  - the Lab link, always visible;
  - decision and estimate cards on `g-checkpoint`;
  - corrected `CASE_LABS` roles for the 9 core cases;
  - "Put it together" diagrams, with `CASE_DIAGRAM_STEPS` and Follow one request;
  - "Mock this case";
  - the case widget layout: predict first, pinned visual, controls after.
- **Accept:**
  - every core case shows a diagram;
  - the answer reveal stays in view (no focus jump above the fold);
  - decision and estimate cards pass by keyboard alone.
- **Content review:** the topologies, diagram steps and estimate tolerance bands.

**R30 Design hub II.**

- **Scope:**
  - the topic "Use it" strip: its missions and cases, and Prev/Next within the shelf;
  - the topic drill;
  - mission briefs list their topics and "Next mission";
  - SD review items link their lessons.
- **Accept:**
  - a spec over the catalogs confirms that every topic links its missions and cases, and every mission brief links its topics;
  - the topic drill opens from the topic page and from Weak spots.
- **Content review:** none.

**R31 Pattern specimen A.**

- **Scope:** the specimen, anchors, the template-to-trace link, inline worked-example steppers, the recognition check moved up, and the log2 handle. For Arrays & Hashing, Two Pointers, Sliding Window, Binary Search and Prefix Sums.
- **Accept:**
  - specs check that anchors exist in `why`, and that `stepFrames` fall within the trace length;
  - the specimen asks within 3 seconds of page view (without reduced motion).
- **Content review:** the anchors and step mappings.

**R32 Pattern specimen B.**

- **Scope:** the same as R31, for the other 18 patterns, using the graph and tree renderers.
- **Accept:** as R31.
- **Content review:** as R31.

**R33 Drag acts.**

- **Scope:**
  - move-pointer, link and union drags, with live preview;
  - keyboard paths (Enter, arrows, Enter);
  - `touch-action: none` on handles only;
  - iOS swipe-back off during a drag.
- **Accept:**
  - each act passes by mouse, touch and keyboard alone on three devices;
  - a drag never scrolls the page.
- **Content review:** none.

**R34 Case widgets I: retries, hot account.**

- **Scope:** both widgets as described in 4.5.
- **Accept:**
  - the predict-first flow works on both widgets;
  - the lock-lane drag and the 400 ±10% value check work by keyboard.
- **Content review:** the predictions and the batching challenge.

**R35 Review session.**

- **Scope:** the Review session of 4.9.
- **Accept:**
  - the badge total equals the number of items the session can do;
  - a story and a revisit complete inside the session on three devices;
  - the summary shows XP and streak.
- **Content review:** none.

**R36 Interview session, scorecards and mock loop.**

- **Scope:** the interview session, scorecards and mock loop of 4.10.
- **Accept:**
  - the send button never wraps at 320px;
  - one primary action per scorecard;
  - no orphan grid cell;
  - the loop setup fits one phone screen.
- **Content review:** none.

**R37 Behavioral practice surfaces.**

- **Scope:** Rehearse, the story editor, STAR practice and the STAR drill, and "Spot the problems", as described in 4.10.
- **Accept:**
  - phone users see the checks while typing;
  - the rehearse timer and grades stay visible with the peek open;
  - the empty rehearse state never shows a success check.
- **Content review:** none.

**R38 Case diagrams II.**

- **Scope:** roles, diagrams and steps for the 18 advanced cases.
- **Accept:**
  - every case shows a diagram;
  - Stock Exchange draws a matching engine and a sequencer, and Message Queue draws its brokers as logs.
- **Content review:** the topologies and steps.

**R39 Thumbnails.**

- **Scope:** `g-thumb` for the 23 visualizers, and static `g-sys-diagram` thumbnails for missions and cases, rendered after first paint.
- **Accept:**
  - the gallery and lists paint no slower (timing);
  - thumbnails are `aria-hidden`.
- **Content review:** none.

**R40 Workspace trace on the kit.**

- **Scope:**
  - the workspace uses `g-transport`, `g-watch`, and the array, grid, tree and graph renderers;
  - `CodingProblemDefinition.graph`, authored for the graph-parameter problems in the Graphs & trees track;
  - a new `code/graph-frames.ts`, beside `grid-frames.ts` and `tree-frames.ts`. It builds a graph view from that parameter, and colors nodes from arrays with names like `visited`, `seen`, `dist`, `indegree` or `parent`;
  - examples drawn with the same primitives.
- **Accept:**
  - a spec asserts that every such problem has the annotation;
  - Network Delay Time and Course Schedule trace as graphs in JavaScript.
- **Content review:** none.

**R41 to R45 Lesson widgets II to VI.** Every remaining widget gets a drawn mechanism, experiments with a reveal spec, and kit controls. The 8 SVG widgets lose "Things to try" too.

| #   | Widgets (lesson: widget kind)                                                                                                                                                                                                                                                               |
| --- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| R41 | Latency & Queueing: `queue-latency`; Capacity & Scaling: `pipeline`; Reliability: `availability`, as a reliability block diagram; Sharding: `hash-ring`, with the 100-virtual-node band fixed; Storage Engines: `storage-engine`, as B-tree and LSM levels; Consistency & Quorums: `quorum` |
| R42 | Data Modeling: `feed-model`; Unique IDs: `id-layout`; Durability: `durability`; Backups & Recovery: `recovery`; CDNs & Edge: `cdn` (Caching's `cache` moved to R27a)                                                                                                                        |
| R43 | Search & Indexing: `inverted-index`; Geospatial: `geohash`, reusing the `cells-widget` renderer; Real-Time Delivery: `delivery`; Multi-Region: `multi-region`, as an RTT strip; Queues: `queue-backlog`; Stream Processing: `stream-windows`, with a watermark                              |
| R44 | Batch: `batch-job`; Backpressure: `overload`; Consensus: `partition`, as votes; Locks & Leases: `lease`; Transactions: `transactions`, as a 2PC vs saga swimlane; Time & Clocks: `clocks`; Service Discovery: `discovery`, as a timeline                                                    |
| R45 | API Design: `pagination`; Gateways: `gateway`; Rate Limiting: `rate-limiter`, as a token bucket over time; Security: `password-hash`; Multi-Tenancy: `tenancy`; Observability: `error-budget`; plus the Estimation drill restyled on the kit                                                |

- **Accept, for each widget:**
  - a drawn mechanism;
  - experiments with a reveal spec.

  **Accept, at the end of R45:** no `tryThis` is left, and no tile-only widget remains.

- **Content review:** the experiment predictions and reveals in each iteration.

**R46 Case widgets II.**

- **Scope:**
  - reconcile: 25 buttons become a two-ledger diff with mismatch cards;
  - rollout: 8 sliders become a staged rollout timeline with handles;
  - propagation: a `g-sequence` of config pushes;
  - bucketing: users as a 100-cell grid, instead of sub-pixel marks;
  - artifact-distribution: a log-scale `g-chart-frame`, instead of 1px bars on a linear scale.

**R47 Case widgets III.**

- **Scope:**
  - cells: the 8-entry legend becomes labels on the cells;
  - quadtree: a drawn subdivision with a query box handle;
  - smtp-retry: a `g-sequence` with numbered ticks, so no tick is lost;
  - mail-storage: a storage-tier diagram.

**R46 and R47 share these gates:**

- **Accept:**
  - predict first, pinned visual, controls after;
  - a reveal spec for every quoted number.
- **Content review:** the predictions.

**R48 Amazon target.**

- **Scope:**
  - the Company chip in "Your loop". The client starts sending `company`, which the server has accepted since R4;
  - the Amazon Leadership Principle mapping;
  - principle chips on behavioral rows, and a Leadership Principle filter;
  - principles with no competency, listed as "Not covered yet".
- **Accept:**
  - the Amazon journey in 4 taps;
  - totals are unchanged by the company.
- **Content review:** the whole principle mapping, before it ships.

---

## 6. Risks and what will not change

| Risk                                                                                                                                       | Mitigation                                                                                                                                                                                                                                                         |
| ------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Angular's initial budget does not see the lazy tabs and Today chunks                                                                       | The first-paint closure test (5.0) is the deciding metric. Angular's budget stays as a backstop                                                                                                                                                                    |
| First-paint headroom: the route table and inline legacy routes land in main                                                                | Legacy prefixes that collide with nothing are `loadChildren`. Today drops the map, tiles and `ALGORITHM_CATALOG`. Plan, readiness, Up next, Continue, Weak spots, search, story counts and all kit code are deferred or lazy. `first-paint.spec.ts` gains no names |
| Route migration touches about 90 routerLinks, every defaultHref, reminders, verify states and e2e specs (58 visits to /learn, 31 to /code) | A permanent `legacy-routes.ts`, `legacy-links.spec.ts`, the route-order and reserved-id specs, the grep gate, and e2e updated area by area                                                                                                                         |
| Ionic back, swipe and tab restore behave differently from the web router                                                                   | `app-back` with the cross-section rule; Android back through the same handler; swipe-back off only on cross-section views; nested outlets for segments; the R5 tab-restore spike; three-device plus tablet e2e of every back path                                  |
| Turning off iOS swipe-back on cross-section views surprises iOS users                                                                      | Limited to views entered from another tab. The back button is always visible. Revisited if e2e or pilot feedback shows confusion                                                                                                                                   |
| Hiding the tab bar on focus routes hides navigation on phones                                                                              | Only on the player, workspace, mission, Lab and case build. `app-back` is always visible. The gain is the stage height that the predict states need                                                                                                                |
| A readiness number can discourage, or read as a hire probability                                                                           | Coverage states and band words; the arithmetic shown; mock verdicts kept separate; Flagged caps a skill; the reachability simulation proves a normal plan can reach Loop-ready                                                                                     |
| Readiness and Continue differ between devices                                                                                              | Readiness reads only synced data. Device-only rows say "on this device". Signed-out behavioral readiness is labelled as per device                                                                                                                                 |
| Level profiles, shelves, core topics, captions, experiments and the Amazon mapping are editorial calls                                     | Content review gates in R4, R11, R17, R18, R27, R29, R31, R32, R34, R38 and R41 to R48. Round counts are editable. Every Up next card shows its reason                                                                                                             |
| Older native builds receive new events                                                                                                     | The pull filter (`?v=2`) keeps `target.set` from them. Every schema change stays add-first                                                                                                                                                                         |
| Hiding pattern tags may frustrate deliberate pattern browsing                                                                              | Never hidden inside a pattern hub or the By-pattern view. "Show pattern" is one tap. The toggle is a device preference                                                                                                                                             |
| Removing the Visualize and Design Lab tabs lowers their visibility for pilot users                                                         | The Watch button and specimen on every pattern page, Up next suggestions, the "Where things moved" note, and "Lab" kept as a name                                                                                                                                  |
| Animation makes screenshots and e2e flaky; WAAPI ignores the global reduced-motion CSS                                                     | `data-motion="off"` in all tooling (`?motion=off` from R3), `finish()` before every assertion, and `MotionService` reading `data-motion` itself                                                                                                                    |
| SVG transforms and particles on WebKit and low-end Android                                                                                 | Transform and opacity only, `getPointAtLength` keyframes, a 60-animation cap, pooled particles, pausing offscreen. Measured with `timing.mjs` on the throttled phone                                                                                               |
| Drag acts conflict with iOS swipe-back and page scroll                                                                                     | Drag acts only for link, union and pointer; `touch-action: none` on handles only; swipe-back off during a drag; no swipe-to-step; keyboard and list paths in the same iteration                                                                                    |
| The Lab Run is a fluid approximation of steady states                                                                                      | Labelled in the Model chip. Pass/fail stays on `evaluate()`                                                                                                                                                                                                        |
| Tracer annotation mistakes would teach wrong causality                                                                                     | `diffFrames` as the fallback; per-tracer specs that semantic events match frame diffs; content review of every caption and ask                                                                                                                                     |
| Two visual languages coexist mid-migration                                                                                                 | `--g-state-*` re-pointed in R3, so legacy views match the new palette. Each screen migrates whole                                                                                                                                                                  |
| 49 iterations is a long tail                                                                                                               | Ordered by impact: navigation, Today, the player stage and the Lab canvas land in the first 22. Every iteration ships value alone, or with its listed dependencies                                                                                                 |
| Large pixel diffs and review load                                                                                                          | Every iteration reads all differing screenshots in both themes. R0 adds the missing states and profiles first                                                                                                                                                      |
| Screen-reader verbosity during autoplay                                                                                                    | Announce only manual steps, checkpoints, chapter changes and the result. A VoiceOver check on the iOS build                                                                                                                                                        |

**What will not change:**

- **Content.** The 23 patterns and 4 tracks, 164 problems, the 23 tracers' outputs, 34 topic lessons, 27 cases, 9 missions, 13 competencies and 91 questions all stay. The exceptions:
  - the listed renames;
  - the near-twin brief clauses;
  - captions, and asks rewritten on the same frames with the same item ids;
  - case `roles` and goals;
  - widget experiments.
- **Stored state.** Progress ids, review item ids and SRS scheduling are unchanged. Predictions keep `choices` and `answer`, so stored review cards stay valid.
- **Mission rules.** Pass/fail via `evaluate()` and the budgets are unchanged.
- **Events.** Changes are additive only:
  - `target.set` is new, with `company` declared from the start, and staged schema-first;
  - `plan.set` and `mock.completed` are unchanged;
  - multi-round mock loops are a follow-up.
- **Data and offline behavior.**
  - No migration drops data.
  - The local-first, offline behavior is kept.
  - Device-only data stays on the device.
- **Platform.**
  - Angular 22 zoneless, Ionic and Capacitor.
  - No new runtime or dev dependencies; the style ratchet and the search generator are node scripts.
  - Both themes.
  - The 860/900 kB budget.
  - axe at 0 violations.
- **Release process.** Each iteration lands on `main` by fast-forward.
- **Code panels.** The visualizer code stays JavaScript in this plan. Python tracing in the workspace is a separate decision.
- **OOD.** The object-oriented design round stays hidden until its engine ships, with no "coming soon" stub.

---

## Appendix: critique resolution index

| Item                                                                  | Resolution                                                                                                                                                                                                                            |
| --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A1 Up next rule 6 never fires                                         | The mock rule moved to 5, and "Otherwise" is last (2.3)                                                                                                                                                                               |
| A2 Plan level is not seniority; duplicated fields; mismatched mockups | A field ownership table. "Starting point" stays in `plan.set`. Date edits regenerate the plan. "23 days left" is used consistently everywhere (2.1, 2.6, 4.1)                                                                         |
| A3 Journey 1 cannot be ≤ 4 taps                                       | The first-run card writes `plan.set` too, and offers date preset chips: 3 taps (2.7, 2.14, 4.1)                                                                                                                                       |
| A4 Round counts vs `mock.completed`                                   | Counts are weights only. The full loop stays one round of each. Multi-round loops are a follow-up (2.1)                                                                                                                               |
| A5 `target.set` bumps streaks on old apps                             | The reducer exemption plus the `?v=2` pull filter (2.1, R4)                                                                                                                                                                           |
| A6 New settings have nowhere to live                                  | Device preferences, with no schema change (2.11)                                                                                                                                                                                      |
| A7 Rename table errors                                                | The Days Until Warmer row is corrected, Course Schedule Order gets `catalogId: null`, and the lesson text is renamed (2.10)                                                                                                           |
| A8 Mocks absent from an offline index                                 | The mock problem index moves into the engine (2.9)                                                                                                                                                                                    |
| A9 Search chunk size                                                  | A generated light index with a staleness spec and a 40 kB budget (2.9)                                                                                                                                                                |
| A10 `UNIT_MINUTES` private and incomplete                             | A shared `plan/minutes.ts` with the new kinds (2.3)                                                                                                                                                                                   |
| A11 Shelf majority ambiguous                                          | A home-shelf rule with a tie-break, and visible coverage counts (2.8)                                                                                                                                                                 |
| A12 Problem counts mix definitions                                    | One membership counting rule everywhere; distinct counts for sets (4.2, 4.3, 2.14)                                                                                                                                                    |
| A13 Route ordering breaks a legacy redirect                           | An explicit declaration order; `behavioral/mock` before `behavioral/:id`; reserved ids include `mock`; the `design/:id` reference is removed (2.5)                                                                                    |
| A14 R9 review pool contradiction                                      | Trivial asks are rewritten in place, so item ids and frame counts are unchanged (3.8)                                                                                                                                                 |
| A15 Python Trace note wrong and unassigned                            | Corrected copy, shipped in R1 (4.2)                                                                                                                                                                                                   |
| A16 Pilot notice copy                                                 | Changed in R1 (2.13)                                                                                                                                                                                                                  |
| A17 Breakpoints conflict; 1024 to 1099 gap                            | Three breakpoints plus container queries. Focus routes hide the tab bar. The player is two-column at every desktop width (2.6, 3.7)                                                                                                   |
| B1 Readiness arithmetic                                               | Weights, round and loop formulas, bands, Learning and Practiced definitions, and the behavior with no Target and for pilot users (2.1, 2.3)                                                                                           |
| B2 Level difficulty                                                   | The level bar: any difficulty for Early career, medium or harder otherwise; hard is never required (2.2)                                                                                                                              |
| B3 Strength gate unreachable                                          | A recall check on current retrievability, plus the reachability simulation (2.3)                                                                                                                                                      |
| B4 Unnamed skills                                                     | Named lists per level; core cases taken from `CASE_CATALOG` (2.2)                                                                                                                                                                     |
| B5 "Not today"                                                        | What replaces the hidden item, how plan slices behave, Preferences storage, and the full list of device prefs (2.3, 2.11)                                                                                                             |
| B6 Filter persistence vs URL                                          | The URL is the only filter state, written with `replaceUrl` (2.5, 2.9)                                                                                                                                                                |
| B7 Graph problems trace                                               | `CodingProblemDefinition.graph` and `graph-frames.ts` (3.4, R40)                                                                                                                                                                      |
| B8 Narration and annotations unscheduled                              | The `caption` field, written in R17 and R18 with specs (3.4)                                                                                                                                                                          |
| B9 R26 to R29 "the rest"                                              | Named widgets per iteration, in R41 to R45 (5.2)                                                                                                                                                                                      |
| C System design gaps                                                  | Case roles and workload controls (4.5, R21, R29, R38); the 9 case widgets (R46, R47); the ring band (R41); experiments for all widgets (R41 to R45); Free Build and case goals (4.6, R21, R28); the Model chip (4.6)                  |
| C Behavioral and Mock gaps                                            | Mock rounds are always API sessions, and the STAR drill is renamed (2.4, 4.8). Rehearse grading and its sticky bar; mock loop setup and running (4.10, R36, R37)                                                                      |
| C Review, plan, workspace, other screens                              | A unified review session and copy, the plan day strip, and a safe Clear (4.9, R35, R14, R1). The hint ladder, signature wrap and language choice (4.2, R16). The composer, Account action and placement results (4.10)                |
| C Design system gaps                                                  | The status tone split, the `label` role, no nested panels, `g-article`, and `g-textarea` (3.2)                                                                                                                                        |
| C Benchmarks                                                          | An "At your level" line from existing content (R12). Bad/Good/Great for cases is a LOOP.md follow-up, because it needs new authored content                                                                                           |
| D Uncovered screens                                                   | Each is listed in 4.5 and 4.10 with an iteration. First-run stacking is in 2.13                                                                                                                                                       |
| E1 Contrast failures                                                  | Corrected tokens, the dimming rule, and the contrast spec (3.6)                                                                                                                                                                       |
| E2 Sheet cannot avoid the stage                                       | A computed phone layout with region R and no tab bar (3.7)                                                                                                                                                                            |
| E3 Sheet must be non-modal                                            | An inline dock, and an inline Lab inspector (3.8, 4.6)                                                                                                                                                                                |
| E4 Desktop dock too small; overflow at 720                            | The dock sits beside the stage, and the stage height is clamped from the viewport height (3.7)                                                                                                                                        |
| E5 Swipe-to-step conflicts                                            | Removed (3.7)                                                                                                                                                                                                                         |
| E6 Palette dialog; Ionic transitions                                  | A `<dialog>` with `showModal` and Esc; Ionic `animated` set from the mirrored preference (2.9, 3.5)                                                                                                                                   |
| F1 Budget measures the wrong thing                                    | The first-paint closure test and the leak check (5.0)                                                                                                                                                                                 |
| F2 `nextBest` static and deferred                                     | Deferred only (2.7, 4.1)                                                                                                                                                                                                              |
| F3 Route table in main                                                | `loadChildren` for legacy prefixes that collide with nothing (2.5)                                                                                                                                                                    |
| F4 Serial preloading                                                  | The route order and `firstIdle` (2.5)                                                                                                                                                                                                 |
| F5 Worker                                                             | A new `sim.worker.ts` (4.6)                                                                                                                                                                                                           |
| F6 Stylelint absent                                                   | A node ratchet test over `.scss` and inline styles that allows `chrome-font-size()` (3.2)                                                                                                                                             |
| G1 Wrong dependencies                                                 | A corrected table and notes (5.1)                                                                                                                                                                                                     |
| G2 R2 acceptance depends on unassigned work                           | The intro and the review Continue bar are in R2; Describe is in R19; swipe-to-step is removed (5.2)                                                                                                                                   |
| G3 Iterations too big                                                 | Old R4 (routes) split into R5 and R10; old R5 (chrome) into R6 and R7; old R7 (Today) into R9 and R14; old R10 (Design hub) into R11 and R30; old R17 (Lab canvas) into R21, R22 and R39; old R20 (cases) into R29, R34 and R38 (5.1) |
| G4 Content review only in two iterations                              | A content review line in every iteration (5.0, 5.2)                                                                                                                                                                                   |
| H1 `defaultHref` only works for empty stacks                          | `crossLink`, `app-back`, Android back, and the swipe rule (2.5)                                                                                                                                                                       |
| H2 Rail lower items and `aria-current`                                | The utility item behavior and the current-item rules (2.6)                                                                                                                                                                            |
| H3 Sub-nav builds back chains                                         | Nested segment outlets with `replaceUrl` (2.5)                                                                                                                                                                                        |
| H4 Back undoes a filter only on web                                   | The claim is removed; filters replace the URL (2.5)                                                                                                                                                                                   |
| H5 Readiness differs by device                                        | The data location table and labels (2.3, 2.11)                                                                                                                                                                                        |
| H6 No tablet profile; aside and breakout at 1024                      | `w1024`, `ipad` and the e2e `tablet` project; container queries (2.6)                                                                                                                                                                 |
