# Grasp — Product & Architecture Plan

> Working name. Goal: the most intuitive way to go from "I kind of know Big-O" to passing
> FAANG-level coding and system design loops, on web, iOS and Android from one codebase.

## 1. Why this can win

Existing prep products are either **problem banks** (LeetCode, NeetCode), **static
explainers** (videos, books, blog diagrams), or **mock-interview marketplaces**. None of them
make you _see_ an algorithm think, _break_ a distributed system with your own hands, and then
_defend_ your reasoning to an interviewer — in one loop that remembers what you're weak at.

Grasp is built around four signature experiences that feed a single mastery model:

| Experience                                 | What makes it different                                                                                                                                                                                                                                                                                              |
| ------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Step-through visualizer**                | Scrub forward _and backward_ through real execution. Code line, variables, data structure and narration stay in sync. Edit the input and the whole trace regenerates instantly (runs on-device).                                                                                                                     |
| **Predict-the-next-step**                  | At every decision point the player pauses and asks _you_ what happens next (which pointer moves? pop or push?). This is active recall inside the visualization — the thing that actually builds intuition. Accuracy feeds mastery.                                                                                   |
| **System design sandbox**                  | Drag real components (CDN, LB, app tier, cache, primary/replicas, queue, workers) onto a canvas, dial traffic from 100 to 1M RPS and watch utilization, p50/p99, error rate and cost react live. Pull the chaos lever to kill a node. Scenario goals ("p99 < 150 ms at 40k RPS under $4k/mo") turn it into a puzzle. |
| **Pattern-first curriculum + FSRS review** | ~20 patterns instead of 3,000 problems. Small auto-graded items (recognition, predict-the-step, template recall, complexity, system design cases) are scheduled with FSRS. Each review is a fresh variant, and the rest of the app feeds the schedule. See [SPACED_REPETITION.md](SPACED_REPETITION.md).             |
| **AI interviewer**                         | Claude plays a calibrated FAANG interviewer (coding or system design): asks clarifying-question-worthy prompts, gives graded hints instead of answers, pushes on trade-offs, and produces a rubric scorecard aligned with how real loops are scored.                                                                 |

The loop: **Learn pattern → Watch & predict → Review → Apply in interview → Scorecard
identifies weak patterns → they come back in the review queue. Missions come back as changed revisits at 3/10/30 days.**

## 2. Curriculum map

### Algorithms (pattern-first)

1. Arrays & hashing · 2. Two pointers · 3. Sliding window · 4. Binary search (incl. on answer)
2. Prefix sums · 6. Monotonic stack/queue · 7. Linked list fast/slow · 8. Intervals
3. Heap / top-K · 10. BFS (grid & graph) · 11. DFS / backtracking · 12. Topological sort
4. Union-find · 14. Shortest paths (Dijkstra) · 15. Trees (DFS orders, BST) · 16. Tries
5. 1-D DP · 18. 2-D / knapsack DP · 19. Greedy · 20. Bit manipulation

Each pattern ships: cue signals, a reusable template, 1–3 visualizers, 6–12 recognition cards,
a curated problem ladder (easy → hard, linking out, no copied statements).

### System design

Fundamentals (latency numbers, back-of-envelope estimation, CAP/PACELC, consistency models) →
building blocks (LB, caching strategies, replication, sharding, queues, CDNs, rate limiting,
consistent hashing) → case studies built _in the sandbox_ (URL shortener, news feed, chat,
ticketing flash sale, ride matching, distributed rate limiter, video streaming, search
autocomplete).

## 3. Architecture

```
grasp/
├─ libs/engine        @grasp/engine — pure TypeScript, zero deps, ESM
│   ├─ algorithms/    tracers → Frame[] (line, vars, array/stack/grid view, narration, predict)
│   ├─ sysdesign/     component catalog, queueing simulator, scenarios & goal evaluation
│   ├─ review/        117 review items that generate a fresh variant per review
│   ├─ srs/           FSRS scheduler, event upcasting, progress reducer, session builder
│   └─ curriculum/    patterns, drill cards, template clozes, complexity facts, SD topics
├─ apps/api           NestJS 12 (ESM) — curriculum, progress sync, AI interviewer (SSE)
└─ apps/app           Angular 22 (zoneless, signals) + Ionic 9 + Capacitor 8 (web, iOS, Android)
```

**Key decision — one engine, two runtimes.** Tracing, simulation and SRS all live in
`@grasp/engine`. The app runs them on-device (instant scrubbing, works offline on a plane);
the API runs the _same code_ to validate and derive server state. No drift between client
and server logic.

**Local-first progress, event-sourced.** Every learning action (review, prediction
answered) is an immutable event with a client-generated id. The app applies events locally
(Capacitor Preferences) and flushes them to `POST /api/progress/events` when online. The
server stores events idempotently and derives state by replaying them through the same
reducer. Conflict-free across devices by construction, and gives us a learning-analytics
event stream for free.

**AI interviewer.** `POST /api/interview/sessions/:id/messages` streams Server-Sent Events
from the Claude API (default `claude-sonnet-5`, configurable via `ANTHROPIC_MODEL`). System
prompts encode interviewer behaviour and rubrics per track. Without an API key the module
falls back to a deterministic offline interviewer so the app is fully usable in dev. Caching,
cost tracking, failure handling and evaluation are described in
[AI_INTERVIEWER.md](AI_INTERVIEWER.md).

**Persistence.** `ProgressStore` / `InterviewStore` are abstract providers. `DATABASE_URL`
set → Drizzle ORM + Postgres; unset → in-memory stores for zero-setup local dev and tests.
(Drizzle over Prisma: pure TypeScript, no engine binaries, first-class ESM — which NestJS 12
now is.)

### Data model (Drizzle, `apps/api/src/persistence/schema.ts`)

- `learners` (id, created_at) — anonymous device id today, linked to an auth identity later
- `learning_events` (id [learner:client-id, PK], learner_id, type, payload jsonb, occurred_at, received_at)
- `interview_sessions` (id, learner_id, track, problem_id, status, session jsonb, timestamps)

### API surface (v0)

| Method | Path                                              | Purpose                                     |
| ------ | ------------------------------------------------- | ------------------------------------------- |
| GET    | `/api/health`                                     | liveness + which integrations are active    |
| GET    | `/api/curriculum/patterns`                        | pattern catalog                             |
| GET    | `/api/curriculum/algorithms`                      | visualizer metadata                         |
| POST   | `/api/curriculum/algorithms/:id/trace`            | server-side trace (sharing, validation)     |
| GET    | `/api/curriculum/drills`                          | recognition cards                           |
| GET    | `/api/curriculum/review-items`                    | review item catalog                         |
| GET    | `/api/curriculum/review-items/:id/question?seed=` | a (reproducible) question variant           |
| GET    | `/api/curriculum/scenarios`                       | sandbox components + scenarios              |
| POST   | `/api/progress/events`                            | idempotent batch ingest                     |
| GET    | `/api/progress`                                   | derived card states + mastery per pattern   |
| GET    | `/api/interview/problems`                         | interview problem catalog + mode            |
| GET    | `/api/interview/sessions`                         | recent sessions                             |
| POST   | `/api/interview/sessions`                         | start a session                             |
| POST   | `/api/interview/sessions/:id/messages`            | send answer, stream interviewer reply (SSE) |
| POST   | `/api/interview/sessions/:id/score`               | rubric scorecard                            |

## 4. Roadmap

**M0 — Vertical slice (this repo).** Engine with 5 visualizers, sandbox with 3 scenarios,
20 patterns, 117 FSRS review items, mission revisits, AI interviewer (8 problems), local-first sync,
Ionic tabs app.

**M1 — Accounts & polish (2–3 wks).** Auth (Clerk/Auth0 or Nest + passkeys), learner linking,
onboarding diagnostic that seeds the review queue, per-learner FSRS parameter optimization, haptics & gestures on mobile, dark/light polish.

**M2 — Content depth (4–6 wks).** Visualizers for all 20 patterns (heap, union-find, DP table
fill, trie, Dijkstra, topo sort, backtracking tree). Content authoring as data (JSON/MDX)
validated by the engine in CI.

**M3 — Code runner (3–4 wks).** In-browser TS/Python execution (WebWorker + Pyodide) with
hidden tests; _auto-trace the user's own code_ into the visualizer by instrumenting it.

**M4 — System design depth (4 wks).** Consistent hashing & sharding nodes, geo-regions,
cache stampede and hot-key simulation, back-pressure, rate limiters; AI interviewer can _read
the sandbox graph_ and interrogate your design; estimation calculator.

**M5 — Growth.** Streaks, weekly plan generated from weak patterns, company-specific loops,
shareable "design replays", paid tier gated on AI interview minutes.

## 5. Quality bar

- Engine: 100% deterministic, unit-tested; every tracer asserts its final answer against a
  reference implementation.
- Performance: trace ≤ 5 ms for default inputs; sandbox re-simulates on every drag frame.
- Accessibility: every animation has a reduced-motion path; the player is fully keyboard
  driven (←/→ step, space play).
- Offline: all learning except the AI interviewer works with no network.
