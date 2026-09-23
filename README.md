# Grasp

Interactive prep for algorithm and system design interviews. Web, iOS and Android from one codebase.

- **Step-through visualizers.** Scrub forward and back through real execution, with code, variables, data structures and narration kept in sync. Edit the input and the trace regenerates on-device.
- **Predict mode.** At each decision point the player stops and asks what happens next. Your answers count toward mastery.
- **Design Lab.** Wire up CDN, LB, app tier, cache, primary and replicas, queue and workers. A queueing simulator shows utilization, p50/p99, errors, cost and backlog live. You can kill instances to test failure, and each mission has goals to hit.
- **Spaced review (FSRS).** 117 small, auto-graded items in 5 kinds: pattern recognition, predict-the-next-step, template recall, complexity, and system design cases. Every review shows a fresh variant. Missed visualizer predictions, weak patterns from interview scorecards and completed Design Lab missions all feed the schedule. See [docs/SPACED_REPETITION.md](docs/SPACED_REPETITION.md).
- **AI interviewer.** Claude runs coding or system design interviews: it streams replies, hints on request and scores you with a rubric scorecard. Prompt caching, per-session cost tracking, a daily spend ceiling and graceful failure handling are built in. See [docs/AI_INTERVIEWER.md](docs/AI_INTERVIEWER.md). If no API key is set, a scripted offline interviewer takes its place.

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
docs/PLAN.md  Product & architecture plan
```

## Quick start

Requires **Node ≥ 24.15** (Angular 22 requirement).

```bash
npm install
npm run build:engine

# terminal 1 — API on :3000 (in-memory storage, offline interviewer)
npm run dev:api

# terminal 2 — app on :4200 (proxies /api → :3000)
npm run dev:app
```

Open http://localhost:4200.

### Turn on the real stuff

```bash
cp apps/api/.env.example apps/api/.env
# set ANTHROPIC_API_KEY=...  → AI interviewer (default model claude-sonnet-5)
# set AI_DAILY_BUDGET_USD=5  → optional daily Claude spend ceiling
# set DATABASE_URL=...       → Postgres persistence

npm run db:up        # Postgres 17 via docker compose
npm run db:migrate   # apply Drizzle migrations
```

### Mobile

```bash
cd apps/app
npx cap add ios        # or android (first time only)
npm run cap:sync       # build web assets + sync to native
npm run cap:ios        # opens Xcode (or cap:android → Android Studio)
```

Native dev builds call the API at `http://localhost:3000/api`, or `10.0.2.2` on the Android emulator, and allow cleartext HTTP. To point a build at another API, set `GRASP_API_URL` when syncing. Store builds need https: `GRASP_RELEASE=1 GRASP_API_URL=https://<host>/api npm run cap:sync`.

## Deployment

A single Docker image serves the API and the web app. [docs/DEPLOYMENT.md](docs/DEPLOYMENT.md) covers the Fly.io setup (`fly.toml`, release-time migrations, health checks), continuous deployment from GitHub Actions, rollback, Sentry and the environment reference.

## Development workflow

| Command                           | What it does                                                     |
| --------------------------------- | ---------------------------------------------------------------- |
| `npm run lint`                    | oxlint across all packages, zero warnings allowed                |
| `npm run format` / `format:check` | Prettier (shared config at the repo root)                        |
| `npm run typecheck`               | `tsc` for engine and API; `ngc` for the app, including templates |
| `npm test`                        | Engine, API and app unit tests                                   |
| `npm run build`                   | Production builds of all three packages                          |
| `npm run verify`                  | All of the above, in the same order CI runs them                 |
| `npm run eval:interviewer`        | Live eval of the AI interviewer (needs `ANTHROPIC_API_KEY`)      |

CI (`.github/workflows/ci.yml`) runs `verify` on every push to `main` and every pull request, with a Postgres service so the API e2e suite runs against both in-memory and Postgres storage. It also audits production dependencies, then builds the Docker image and smoke-tests it against Postgres. `deploy.yml` ships `main` to Fly.io once enabled. Dependabot proposes grouped dependency updates weekly.

### Tests

- **Engine:** every tracer is checked against a reference implementation on 300 random inputs. Each scenario must fail with its starter design and pass with a reference solution. Every revisit variant is proven solvable. FSRS scheduling, event upcasting, signals and session building are covered, and a 90-day simulated learner checks that retention lands near the 90% target. Every review item is validated across 40 seeds.
- **API:** contract tests drive a real Anthropic SDK client over a scripted `fetch`. They cover the exact request shape, cache-stable prefixes, cost accounting, every error mapping, retries, aborts, the structured-output schema, and scorecard repair and fallback. E2e tests build the app through the same `configureApp` as production. They cover health and readiness, security headers, request ids, CORS, body limits, per-IP rate limiting, web-app serving and runtime config, curriculum, idempotent event sync, validation, learner isolation, and full offline and AI interviews over SSE, including 503/409 paths and the spend ceiling. Environment validation has its own unit tests. Set `TEST_DATABASE_URL` to run the same suite against Postgres too (migrations are applied and tables truncated first):

  ```bash
  npm run db:up
  TEST_DATABASE_URL=postgresql://grasp:grasp@localhost:5432/grasp npm test -w @grasp/api
  ```

- **App:** component tests run with Vitest via `ng test`.

## How progress sync works

Every learning action is an immutable event with a client-generated id: `review.graded`, `practice.answered`, `predict.answered`, `scenario.completed` or `interview.scored`. Legacy `drill.reviewed` events are upcast on read. The app applies events locally (Capacitor Preferences) and pushes them to `POST /api/progress/events`. It pulls other devices' events from `GET /api/progress/events`. State is always `replay(events)` using the same reducer on both sides, so it works offline and devices merge without conflicts.

## Adding content

- **A visualizer:** add an `AlgorithmDef` in `libs/engine/src/algorithms/`, register it in `index.ts`, add its reference implementation to `algorithms.spec.ts`, and link it from its pattern's `algorithmIds`.
- **A Design Lab mission:** add a `Scenario` to `libs/engine/src/sysdesign/scenarios.ts` and a reference solution to `sysdesign.spec.ts`. The test proves the mission can be solved.
- **Review items:** add recognition cards to `curriculum/drills.ts`, template clozes to `curriculum/clozes.ts`, complexity facts to `curriculum/complexity.ts`, and generated system design cases to `review/design-items.ts`. The review tests validate every item across many seeds.
- **Mission revisits:** add `variants` to a scenario and a reference solution per variant in `sysdesign.spec.ts`.
- **Interview problems:** add them to `apps/api/src/interview/problems.ts` (opening, private reference notes, hint ladder).
