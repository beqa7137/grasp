# Grasp

Interactive prep for algorithm and system design interviews. Web, iOS and Android from one codebase.

- **Step-through visualizers.** Twenty algorithms, one for every pattern, from two pointers to Dijkstra. Scrub forward and back through real execution, with code, variables and narration kept in sync. Structures are drawn as they are: arrays with pointers, grids, DP tables that show which cells each one reads, graphs with distances and in-degrees, and trees (heaps, tries, union-find forests, binary search trees and recursion trees). Edit the input and the trace regenerates on-device.
- **Predict mode.** At each decision point the player stops and asks what happens next. Your answers count toward mastery.
- **Design Lab.** Wire up CDN, rate limiter, LB, app tier, cache, sharded primaries and replicas, queue and workers. A queueing simulator shows utilization, p50/p99, errors, cost and backlog live. It models bot traffic that bypasses caches, and shard keys that create hot shards. You can kill instances to test failure. Pinch or Ctrl/⌘-scroll to zoom and drag to pan, so it works on a phone. Five missions, from a first scale-up to a bot storm and a sustained write wall, each with goals to hit and three revisits under changed conditions.
- **Coding practice.** Thirty-seven problems, at least two for each of the 20 patterns, solved in Python, JavaScript or TypeScript right in the browser. Each one runs against hidden tests plus a large performance input designed to catch common slow approaches. **Trace** steps through _your own_ JavaScript/TypeScript line by line in the visualizer, with arrays, pointers, stacks, grids and trees drawn live. A failed first attempt brings that pattern's template cards forward in review. See [docs/CODE_RUNNER.md](docs/CODE_RUNNER.md).
- **Spaced review (FSRS).** 140 small, auto-graded items in 5 kinds: pattern recognition, predict-the-next-step, template recall, complexity, and system design cases. Every review shows a fresh variant. Missed visualizer predictions, weak patterns from interview scorecards and completed Design Lab missions all feed the schedule. Target recall, session length and new cards per day are learner settings that sync across devices, and the mobile app sends a daily reminder only on days with something due. See [docs/SPACED_REPETITION.md](docs/SPACED_REPETITION.md).
- **AI interviewer.** Claude runs coding or system design interviews: it streams replies, hints on request, reads the code you write in the built-in editor, and scores you with a rubric scorecard. Prompt caching, per-session cost tracking, a daily spend ceiling and graceful failure handling are built in. See [docs/AI_INTERVIEWER.md](docs/AI_INTERVIEWER.md). Scripted practice is available to guests. AI requires an active account and an explicit mode choice; signing in preserves a guest interview without upgrading it automatically.

See [docs/PLAN.md](docs/PLAN.md) for the product vision, architecture and roadmap.

## Stack

| Layer  | Tech                                                                                                               |
| ------ | ------------------------------------------------------------------------------------------------------------------ |
| App    | Angular 22 (standalone, zoneless, signals) + Ionic 9 + Capacitor 8                                                 |
| API    | NestJS 12 (ESM) + Drizzle ORM + Postgres; in-memory fallback                                                       |
| Shared | `@grasp/engine`: pure TS tracers, simulator, FSRS scheduler, review items, curriculum. The app and API both run it |
| AI     | Claude API via `@anthropic-ai/sdk` (streaming + structured outputs)                                                |

```
apps/app      Angular + Ionic client (web, iOS, Android)
apps/api      NestJS API
libs/engine   Shared learning engine (no dependencies)
e2e           Browser end-to-end tests (Playwright)
docs/PLAN.md  Product & architecture plan
```

## Quick start

Requires **Node ≥ 24.15** (Angular 22 requirement).

```bash
npm install
npm run build:engine

# terminal 1: API on :3000 (in-memory storage, offline interviewer)
npm run dev:api

# terminal 2: app on :4200 (proxies /api → :3000)
npm run dev:app
```

Open http://localhost:4200.

### Turn on the real stuff

```bash
cp apps/api/.env.example apps/api/.env
# set ANTHROPIC_API_KEY=...  → AI interviewer (default model claude-sonnet-5)
# set AI_DAILY_BUDGET_USD=5  → optional daily Claude spend ceiling
# set GOOGLE_WEB_CLIENT_ID=... → sign in with Google (see docs/ACCOUNTS.md)
# set OAUTH_GITHUB_ID=... and OAUTH_GITHUB_SECRET=... → sign in with GitHub
# set DATABASE_URL=...       → Postgres persistence

npm run db:up        # Postgres 17 via docker compose
npm run db:migrate   # apply Drizzle migrations
```

### Mobile

The iOS and Android projects are committed under `apps/app/ios` and `apps/app/android`. Building needs Xcode 26+ or Android Studio with JDK 21.

```bash
cd apps/app
npm run cap:sync       # build web assets + sync to native
npm run cap:ios        # opens Xcode (or cap:android → Android Studio)
```

Native dev builds call the API at `http://localhost:3000/api`, or `10.0.2.2` on the Android emulator, and allow cleartext HTTP. To point a build at another API, set `GRASP_API_URL` when syncing. Store builds need https: `GRASP_RELEASE=1 GRASP_API_URL=https://<host>/api npm run cap:sync`. See [docs/MOBILE.md](docs/MOBILE.md) for Google sign-in on iOS (`GRASP_GOOGLE_IOS_CLIENT_ID`), reminders, native CI and the release checklist.

## Accounts

Optional sign-in with Google or GitHub, with no passwords. Signing in folds the device's anonymous progress into the account, syncs every device, and protects the progress from anonymous access. Sessions use short-lived JWTs and rotating refresh tokens with reuse detection. Rate limits count per user once signed in. See [docs/ACCOUNTS.md](docs/ACCOUNTS.md).

## Pilot

[docs/PILOT.md](docs/PILOT.md) is the protocol for a ten-person pilot: success criteria, cohort, timeline, surveys, operations and data handling. The product side:

- **In-app feedback.** A Feedback tab on every screen sends a note, an optional usefulness rating, and the screen and version it came from.
- **First-run pilot notice.** Explains what is stored and where transcripts go.
- **Settings.** Learners can export or delete all their data (`GET /api/me/export`, `DELETE /api/me`).
- **Cohort metrics for the operator.** `GET /api/admin/metrics` behind `ADMIN_TOKEN` reports activation, D1/D7 retention, recall, interview completion and AI cost. `npm run pilot:report` turns it into a weekly Markdown report checked against the targets.

## Deployment

Production runs on Vercel with Neon Postgres: the web app from Vercel's CDN, the API and page shell from one Vercel Function. The same code also ships as a Docker image for any container host. [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) covers the Vercel and Neon setup, release-time migrations, continuous deployment from GitHub Actions, rollback, Sentry and the environment reference.

## Development workflow

| Command                           | What it does                                                     |
| --------------------------------- | ---------------------------------------------------------------- |
| `npm run lint`                    | oxlint across all packages, zero warnings allowed                |
| `npm run format` / `format:check` | Prettier (shared config at the repo root)                        |
| `npm run typecheck`               | `tsc` for engine and API; `ngc` for the app, including templates |
| `npm test`                        | Engine, API and app unit tests                                   |
| `npm run build`                   | Production builds of all three packages                          |
| `npm run verify`                  | All of the above, one after another (CI runs them in parallel)   |
| `npm run e2e`                     | Browser tests of every learner flow, after `npm run build`       |
| `npm run eval:interviewer`        | Live eval of the AI interviewer (needs `ANTHROPIC_API_KEY`)      |
| `npm run pilot:report`            | Markdown pilot report from `/api/admin/metrics` (`ADMIN_TOKEN`)  |

CI (`.github/workflows/ci.yml`) runs every `verify` step on every push to `main` and every pull request, in parallel jobs: lint, formatting and typecheck in one; the tests in another, with Postgres so the API e2e suite runs against both in-memory and Postgres storage; and the build in each of four shards of the browser tests, which run on desktop and phone viewports. It also audits production dependencies, and builds the Docker image and the Vercel output and smoke-tests both against Postgres. `node_modules` and Chromium come from the Actions cache. `deploy.yml` ships `main` to Vercel once enabled and then runs the `@smoke` browser tests against the live site. Dependabot proposes grouped dependency updates weekly.

### Tests

- **Engine:** every coding problem's reference solution is cross-checked against a brute-force solution on its full suite and run against a CPython reference through the same Python harness the browser uses. Every tracer is checked against a reference implementation on 300 random inputs. Each scenario must fail with its starter design and pass with a reference solution. Every revisit variant is proven solvable. FSRS scheduling, event upcasting, signals and session building are covered, and a 90-day simulated learner checks that retention lands near the 90% target. Every review item is validated across 40 seeds.
- **API:** contract tests drive a real Anthropic SDK client over a scripted `fetch`. They cover the exact request shape, cache-stable prefixes, cost accounting, every error mapping, retries, aborts, the structured-output schema, and scorecard repair and fallback. E2e tests build the app through the same `configureApp` as production. They cover health and readiness, security headers, request ids, CORS, body limits, per-IP rate limiting, web-app serving and runtime config, curriculum, idempotent event sync, validation, learner isolation, and full offline and AI interviews over SSE, including 503/409 paths and the spend ceiling. Environment validation has its own unit tests. Set `TEST_DATABASE_URL` to run the same suite against Postgres too (migrations are applied and tables truncated first):

  ```bash
  npm run db:up
  TEST_DATABASE_URL=postgresql://grasp:grasp@localhost:5432/grasp npm test -w @grasp/api
  ```

- **App:** Vitest via `ng test`. It covers components, the JS/TS runner (compilation, error lines, sandboxed globals), the code instrumenter and trace-to-frame conversion, and Python traceback cleanup. The in-browser runner (Pyodide under the production CSP, time limits, infinite-loop recovery) was checked end to end with Playwright against the built app.
- **Browser (`e2e/`):** Playwright drives the built app, served by the built API as in production, on a desktop and a phone viewport. It walks every learner flow: the pilot welcome, a pattern page, predicting in a visualizer, a full review session, practice, JavaScript and Python solutions (including one too slow for the performance test) and tracing, an interview to its scorecard, solving the first Design Lab mission, study settings, export and delete, feedback, and signing in: GitHub end to end against a local fake GitHub (`e2e/support/fake-github.ts`), keeping the progress made before, with a slow token exchange, after pressing Cancel and against a crafted callback URL, and the Google popup under the site's real security headers, including closing it. Each flow checks that its events reach the API, and any page error or console error fails the test. Tests tagged `@smoke` also run against a deployment, read-only: every API call that could write data is blocked.

  ```bash
  npm run build
  npx -w @grasp/e2e playwright install chromium
  DATABASE_URL=postgresql://grasp:grasp@localhost:5432/grasp npm run e2e   # or without DATABASE_URL, in memory
  E2E_BASE_URL=https://grasp-rho-taupe.vercel.app npm run e2e             # @smoke only, against a deployment
  ```

## How progress sync works

Every learning action is an immutable event with a client-generated id: `review.graded`, `practice.answered`, `predict.answered`, `scenario.completed` or `interview.scored`. Legacy `drill.reviewed` events are upcast on read. The app applies events locally (Capacitor Preferences) and pushes them to `POST /api/progress/events`. It pulls other devices' events from `GET /api/progress/events`. State is always `replay(events)` using the same reducer on both sides, so it works offline and devices merge without conflicts.

## Adding content

Most content lives in two places: a light catalog (ids, titles, order, and what lists, route titles and progress read) and its full definitions, joined by id. A catalog imports no content, so the app's first paint stays light; `libs/engine/src/first-paint.spec.ts` pins the modules that first paint loads. Engine barrels re-export only with `export *`, because a named re-export makes every page that imports one of those names load the whole barrel. `apps/app/src/app/first-paint.spec.ts` lists every engine name the app imports before its first paint, so a new one fails until you confirm its module is light and add it. A catalog id without a definition fails the type check.

- **A visualizer:** add a summary (id, title, pattern, difficulty, and the one-line summary and complexity the Visualize list shows) to `libs/engine/src/algorithms/catalog.ts`, whose order is the Visualize list's, an `AlgorithmDefinition` (code, input fields and tracer) in its own file, and a line in `index.ts`'s `DEFINITIONS`. Its pattern lists it from the catalog's `patternId`. Add its reference implementation to `algorithms.spec.ts`. Frames can carry any mix of views: `array`, `grid`, `table`, `graph` (positions from `layout.ts`), `tree`, plus stack/queue/set/output lists. The app renders each with its component in `apps/app/src/app/viz/`.
- **A Design Lab mission:** add a summary (title, tagline, workload, goals, and one variant per revisit) to `libs/engine/src/sysdesign/scenario-catalog.ts`, a definition (brief, starter design, hints and takeaway) to `scenarios.ts`, and a reference solution to `sysdesign.spec.ts`. The test proves the mission can be solved. A new component kind goes in `catalog.ts` (capacity, latency, cost, allowed connections) with its routing in `simulate.ts`; link the mission to an SD topic in `curriculum/sd-topics.ts` so its review items unlock.
- **Patterns:** add the summary (name, track, order, one-liner) to `curriculum/catalog.ts` and the cues, template, complexity and pitfalls to `curriculum/patterns.ts`. A new pattern also needs a `CLOZE_COUNTS` entry, drill cards and a visualizer.
- **Review items:** add card and fact entries and the pattern's cloze count (in `CLOZE_COUNTS`) to `curriculum/catalog.ts`, and their text to `curriculum/drills.ts`, `curriculum/complexity.ts` or `curriculum/clozes.ts`. For a generated system design case, add its id and topic to `review/summaries.ts` and its builder to `review/design-items.ts`. The review tests validate every item across many seeds.
- **Mission revisits:** add a variant (twist, workload and goals) to the mission in `scenario-catalog.ts`, and a reference solution for it to `sysdesign.spec.ts`.
- **Interview problems:** add them to `apps/api/src/interview/problems.ts` (opening, private reference notes, hint ladder).
- **Coding problems:** add a summary (id, title, difficulty, patterns, visualizer) to `libs/engine/src/coding/catalog.ts`, whose order is the code list's, and a `CodingProblemDefinition` to `coding/problems/`, in the file for its track. Map the id to the definition in `problems/index.ts`. Give it a reference `solve`, edge cases and random/performance generators. Then add a brute-force check and a Python reference to the tests; they prove the suite is correct in both languages.
