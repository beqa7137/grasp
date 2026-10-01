# Deployment

Production runs on **Vercel** with **Neon** Postgres: the web app from Vercel's CDN, everything else from one Vercel Function that wraps the NestJS API. The same code also ships as a **Docker image** for any container host. CI builds and smoke-tests both on every change, so either path stays deployable. [decisions/0001-hosting.md](decisions/0001-hosting.md) records why.

## Vercel

### How requests are served

| Path                                                    | Served by                                       | Notes                                                                                                   |
| ------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| Fingerprinted assets (`main-*.js`, `chunk-*`, `media/`) | CDN                                             | Cached for a year (`immutable`)                                                                         |
| `worker-*.js`                                           | CDN                                             | Its own CSP that allows `eval` for the code runner; see [CODE_RUNNER.md](CODE_RUNNER.md)                |
| `theme-boot.js`                                         | CDN                                             | Blocks the first paint: cached a day, then a week while it revalidates; an old copy mispaints a frame   |
| `/pyodide/*` (about 14 MB)                              | CDN                                             | `Cross-Origin-Resource-Policy: cross-origin` so native apps can load it; too large for a function reply |
| Pages (`/`, `/learn`, any deep link)                    | Function, `apps/app/dist/app/server/index.html` | Helmet's strict CSP and security headers, `no-cache`                                                    |
| `/config.json`                                          | Function                                        | Generated from the environment                                                                          |
| `/api/*`                                                | Function                                        | The NestJS API, including streamed interview replies (server-sent events)                               |

`vercel.json` holds the CDN rules. Its values mirror `apps/api/src/web/asset-policy.ts`, which the Docker server uses, and `vercel-config.spec.ts` compiles `vercel.json` with Vercel's routing library to keep the two in agreement. The theme script's rule repeats its `Cache-Control` value as `CDN-Cache-Control`: without that header, Vercel's CDN strips `stale-while-revalidate` before the response reaches the browser. The build (`npm run build:vercel`) moves `index.html` out of the CDN output so pages get the API's security headers, and removes the development `config.json` so `/config.json` comes from the function.

The function entry is `api/index.js`. It builds the Nest app once per instance and reuses it across requests (fluid compute). It is built with `NODEJS_HELPERS=0`, so Express keeps its own `req`/`res` instead of Vercel's helpers, and it declares response streaming for the interview. It runs in `iad1` (US East, next to the database) with a 300-second limit, which covers the slowest AI scoring call.

### Shared state and scaling

Vercel runs as many function instances as traffic needs. State they must agree on lives in Postgres: the AI spend ceiling and its daily totals, per-learner interview quotas and rate-limit counters (`counters`), session families used to revoke access tokens, erased learner tombstones, and per-session interview locks (`leases`, which expire after 15 minutes if an instance dies mid-call). Every request writes its rate-limit counter; signed-in requests check the session family in that same database statement. The Postgres pool is attached with `attachDatabasePool`, so a suspended instance closes its idle connections instead of leaking them. Without `DATABASE_URL`, the in-memory fallback keeps this state per process; that mode is only for local development.

The pool bounds connection waits to 4 seconds and query waits to 3 seconds. An idle disconnect is logged with its error code and pool counts, then the next request opens a connection. During an outage, routes that need the database return 503 while `/api/health` stays live and `/api/health/ready` reports the failure. The app allows 8 seconds for ordinary API calls and 20 seconds for a progress history pull. Admin metrics still share the 3-second query limit and can return 503 on a large cohort until reporting is rewritten with SQL aggregates. A client query timeout limits the API wait; it does not guarantee cancellation of work already running in Postgres.

### Database: Neon

Create the project in **AWS US East 1**, next to the function. Neon gives two connection strings: a pooled one (host contains `-pooler`) and a direct one.

- `DATABASE_URL` should be the **pooled** string: serverless instances come and go, and the pooler absorbs their connections.
- `DATABASE_URL_UNPOOLED` (optional) is the **direct** string; migrations use it when set.

The free tier allows 100 compute-hours a month at the smallest size and sleeps after 5 idle minutes. Nothing on Vercel pings the database while nobody uses the app, so it only runs while people do, which fits a pilot comfortably. Watch the usage page in the Neon console as the cohort grows.

### First deploy

Everything runs from GitHub Actions; no local Vercel or Neon tooling is needed.

1. **Vercel token.** Create one in Vercel account settings → Tokens, scoped to your account or team, and add it as the repository secret `VERCEL_TOKEN`. For a team, add the repository variable `VERCEL_SCOPE` (team slug). The project name defaults to `grasp`; override it with the variable `VERCEL_PROJECT`.
2. **Database.** Add the secrets `DATABASE_URL` (pooled) and, optionally, `DATABASE_URL_UNPOOLED` (direct).
3. **App secrets.** `JWT_SECRET` and `ADMIN_TOKEN` (`openssl rand -hex 32` each; keep a copy of the admin token for `npm run pilot:report`). Optional secrets: `AI_GATEWAY_API_KEY` (not needed on Vercel, see [AI interviewer provider](#ai-interviewer-provider)), `ANTHROPIC_API_KEY`, `SENTRY_DSN`, `SENTRY_WEB_DSN`, and for sign-in `GOOGLE_WEB_CLIENT_ID`, `GOOGLE_IOS_CLIENT_ID`, `OAUTH_GITHUB_ID` and `OAUTH_GITHUB_SECRET` (set the two GitHub ones together; [ACCOUNTS.md](ACCOUNTS.md#configuration) says how to create the Google and GitHub clients, and that the Google consent screen must be published). `GOOGLE_WEB_CLIENT_SECRET` is not needed. Optional variables: `AI_DAILY_BUDGET_USD` (recommended for any paid interviewer), `INTERVIEW_AI_PROVIDER` and `INTERVIEW_AI_MODEL`.
4. Run **Set up Vercel** (Actions tab). It creates the project if needed and loads the production environment: secrets as Vercel "sensitive" variables, which cannot be read back, and settings as plain ones. The public Google and GitHub client ids count as settings; `OAUTH_GITHUB_SECRET` is sensitive. It is safe to re-run after adding or rotating a secret.
5. Add the repository variable `VERCEL_DEPLOY_ENABLED=true` and run **Deploy**. Its summary shows the deployment; add the production domain as the variable `PUBLIC_URL` (for example `https://grasp-yourname.vercel.app`) so later deploys verify it.

### Continuous deployment

Vercel's own Git deployments are off (`git.deploymentEnabled: false` in `vercel.json`), so nothing reaches production without CI. `.github/workflows/deploy.yml` runs after CI passes on a push to `main`, or by hand. A push to `main` deploys nothing when production already reports that commit as its release after a passing hand deploy from its branch. Otherwise:

1. Link the project and pull its production settings.
2. `vercel build --prod`: the same build CI smoke-tests (`vercel` job in `ci.yml`, which builds with a placeholder project link, then runs the built function as Vercel does (outside the repo, unable to `require()` ES modules) against Postgres and checks pages, CSP, config, JSON bodies and streaming).
3. Migrate the database with `DATABASE_URL_UNPOOLED` (or `DATABASE_URL`).
4. `vercel deploy --prebuilt --prod`, tagged with the commit's short SHA as `RELEASE`.
5. If `PUBLIC_URL` is set, wait until `/api/health` reports the new release, then check readiness, a deep link, `/config.json` and the Python runtime.
6. Run the `@smoke` browser tests against `PUBLIC_URL` on desktop, Android and iPhone profiles. They only read: every API call that could write data is blocked, so the pilot metrics stay clean. If a check fails, the function's recent 5xx logs are attached to the run.

Migrations run before the new code takes traffic, so each one must work with the release still running: add tables and columns first, remove them in a later release. The iteration 18 migrations use a 5-second lock wait limit, so a contended schema change fails and can be retried instead of waiting without a bound. Migration `0007` adds refresh-token compatibility triggers for old API instances; drop those triggers and their function in a later contract release, after old instances and rollback candidates are retired.

Drain API instances from releases before iteration 18 when promoting this change. Those instances cannot check revoked access tokens and their deletion handler does not write a tombstone. The migration backfills existing refresh-token families and covers refresh tokens created by old instances during the transition, but it cannot change an old instance's request guard. Old Vercel deployment URLs remain reachable after the production alias moves and still accept revoked tokens. Enable [Standard Deployment Protection](https://vercel.com/docs/deployment-protection) with Vercel Authentication, which covers generated deployment URLs while leaving the production domain public, and verify an old URL rejects an unauthenticated request before promotion.

### Rollback

Vercel keeps every deployment. **Instant Rollback** in the dashboard, or `vercel rollback` with the CLI, points production back at the previous deployment in seconds, with no rebuild. Migrations only move forward, which is why they must stay backward-compatible (above).

Rolling back to a release before iteration 18 also restores its old access-token behavior. Previously revoked JWTs can work again until their 15-minute expiry. The old deletion handler writes no erasure tombstone, so a later guest write can recreate data under that deleted learner ID. The old API also returns 500 for a guest write to a learner erased by the new release because it does not recognize the erasure trigger's error. If that rollback is necessary, rotate `JWT_SECRET` to invalidate outstanding access tokens, keep old deployment URLs protected, and expect clients to refresh or sign in again. Do not use the old deletion path for account erasure.

### Plans

The Hobby plan is free but for personal, non-commercial projects. A product run for other people belongs on Pro. Nothing in this setup depends on the plan: the function stays within Hobby's 300-second limit, and usage at pilot scale is small either way.

## Docker image

`Dockerfile` builds one image that serves the API under `/api` and the web app at `/`, for any container host.

- **Multi-stage build.** It builds the engine, API and web app, then installs only the API's production dependencies into a `node:24-slim` runtime. It runs as the unprivileged `node` user.
- **Web app.** It serves the web app from `/srv/web` with the same asset policy as the Vercel CDN (`asset-policy.ts`). Deep links fall back to `index.html`.
- **Runtime config.** It generates `/config.json` from the environment, so the same image works in every environment.
- **Behind a proxy.** Set `TRUST_PROXY` to the number of proxy hops in front of the container, usually `1` behind a host or load balancer that terminates TLS. The server takes the client IP and the request's scheme from those hops. Without it, per-IP rate limits count the proxy's address, and every web GitHub sign-in fails with `invalid_request`: the API accepts only `https://<host>/auth/callback` as the web callback, but sees `http`.
- **Migrations.** `node apps/api/dist/migrate.js` applies them; run it as a release step before new containers take traffic.
- **Health.** `GET /api/health` is liveness; a configured app reports storage, interviewer mode and release. `GET /api/health/ready` is readiness: it checks the database and returns 503 when it is unreachable. Without `DATABASE_URL`, production serves only liveness and 503 responses. The Docker health check uses liveness, so it does not wake a sleeping database or replace a healthy process during a database outage. Probe readiness separately when checking storage.
- **Shutdown.** SIGTERM closes the HTTP server and the Postgres pool.

CI builds this image and smoke-tests it against Postgres: migrations, readiness, deep-link fallback, runtime config and a real API call.

## Both platforms

- **Hardening.** Helmet sets the security headers, including a CSP with no inline scripts. `Cross-Origin-Opener-Policy` is `same-origin-allow-popups` rather than `same-origin`, so the web sign-in popup can report back to the page that opened it. The popup's landing page, `/auth/callback`, gets `unsafe-none`: it arrives there from Google or GitHub, whose pages send no such header, and a COOP on the landing page would cut the popup off from the app window waiting for its result. The server rejects JSON bodies over 256 kB and URL-encoded bodies (only the GitHub token endpoint takes them) over 16 kB, and rate-limits each caller (`RATE_LIMIT_PER_MINUTE` per signed-in user or client IP, health checks exempt). It trusts `TRUST_PROXY` hops for the client IP and the request's scheme, which web GitHub sign-in depends on.
- **Logs.** Structured JSON logs, one access line per request with a server-generated request id returned in `X-Request-Id`. Incoming request ids are ignored. Access lines contain route templates, not path parameters or query strings. Failure diagnostics retain a static operation, error category and recognized code, without SQL, bound parameters, exception messages or learner identifiers.
- **Config validation.** Environment variables are checked at startup, and every invalid one is reported. On Vercel, a function that cannot start answers 503 and retries on the next request.

## Native apps against a deployed API

Native builds read `config.json` from the bundled web assets. `cap:sync` writes that file from environment variables:

```bash
cd apps/app
GRASP_RELEASE=1 GRASP_API_URL=https://<your-domain>/api GRASP_VERSION=1.0.0 GRASP_GOOGLE_IOS_CLIENT_ID=<id>.apps.googleusercontent.com npm run cap:sync
```

`GRASP_RELEASE=1` turns off cleartext HTTP and requires an `https` API URL. `GRASP_GOOGLE_IOS_CLIENT_ID`, the same value as the server's `GOOGLE_IOS_CLIENT_ID`, is all the iOS app needs for Google sign-in: `cap:sync` writes it to `config.json` and derives the URL scheme that GoogleSignIn requires for the Xcode build (see [MOBILE.md](MOBILE.md#sign-in-google-and-github)). Without it, the iOS app does not offer Google. `GRASP_SENTRY_DSN` enables error reporting in the app. JavaScript errors use the same filtered reporting path on web, iOS and Android. Native crash uploads are temporarily disabled pending a separately verified native privacy filter. The API's default `CORS_ORIGINS` already allows the Capacitor origins on iOS and Android, and native apps download the Python runtime from the same domain.

## Environment reference

Every variable is validated at startup. See `apps/api/.env.example` for the full list with comments.

| Variable                                    | Production value                                                                             |
| ------------------------------------------- | -------------------------------------------------------------------------------------------- |
| `NODE_ENV`                                  | `production` (set by Vercel and by the image)                                                |
| `DATABASE_URL`                              | secret; Neon's pooled string on Vercel                                                       |
| `DATABASE_URL_UNPOOLED`                     | optional secret, used only for migrations                                                    |
| `JWT_SECRET`                                | secret, required in production                                                               |
| `TRUST_PROXY`                               | `1` (set by `api/index.js` on Vercel); the image needs its proxy hops for web GitHub sign-in |
| `CORS_ORIGINS`                              | Capacitor origins; the web app is same-origin and needs no entry                             |
| `RATE_LIMIT_PER_MINUTE`                     | `300` per user or IP                                                                         |
| `LOG_FORMAT` / `LOG_LEVEL`                  | `json` / `log`                                                                               |
| `INTERVIEW_AI_PROVIDER`                     | unset: the gateway; `anthropic` only to run Claude direct                                    |
| `INTERVIEW_AI_MODEL`                        | unset: `openai/gpt-6-luna`                                                                   |
| `AI_GATEWAY_API_KEY`                        | secret; unset on Vercel, which authenticates with the deployment's OIDC token                |
| `ANTHROPIC_API_KEY`                         | secret; used only with `INTERVIEW_AI_PROVIDER=anthropic`                                     |
| `GOOGLE_WEB_CLIENT_ID`                      | the Google web client id; unset turns Google sign-in off                                     |
| `GOOGLE_IOS_CLIENT_ID`                      | optional; the Google iOS client id                                                           |
| `OAUTH_GITHUB_ID` / `OAUTH_GITHUB_SECRET`   | the GitHub OAuth app, set together (the secret is sensitive); unset turns GitHub sign-in off |
| `OAUTH_GITHUB_URL` / `OAUTH_GITHUB_API_URL` | unset in production (GitHub Enterprise only)                                                 |
| `AI_DAILY_BUDGET_USD`                       | recommended for any public deployment                                                        |
| `SENTRY_DSN` / `SENTRY_WEB_DSN`             | optional; the web app receives its DSN through `/config.json`                                |
| `RELEASE`                                   | the deploy's short SHA; on Vercel it falls back to `VERCEL_GIT_COMMIT_SHA`                   |
| `WEB_DIST_DIR`, `PORT`                      | set by the image; on Vercel `WEB_DIST_DIR` is set by `api/index.js`                          |
| `NODEJS_HELPERS`                            | `0` at Vercel build time (set by the workflows and by **Set up Vercel**)                     |

## AI interviewer provider

Production runs the AI interviewer on OpenAI's GPT-6 Luna through the [Vercel AI Gateway](https://vercel.com/docs/ai-gateway), with no fallback model; [AI_INTERVIEWER.md](AI_INTERVIEWER.md#which-interviewer-runs) has the selection rules. At release the owner sets:

- **Nothing for authentication on Vercel.** The function authenticates with the deployment's OIDC token, which Vercel sends with every request (`x-vercel-oidc-token`) and the gateway accepts as its bearer token. The Vercel team must be able to pay for AI Gateway usage: the model comparison was refused with `customer_verification_required` until the team had a card on file. Elsewhere (the Docker image, local runs), add the secret `AI_GATEWAY_API_KEY`. A token pulled with `vercel env pull` for local development lasts about 12 hours; `@vercel/oidc` refreshes it through the linked project when the Vercel CLI is signed in, otherwise pull it again.
- **`AI_DAILY_BUDGET_USD`**, as before. Holds use GPT-6 Luna's dearest catalog rates (input $0.22, cache write $0.275 and output $0.825 per million tokens), so an early reply holds about half a cent and scoring (16,000 output tokens) about two cents.
- **Optionally `INTERVIEW_AI_PROVIDER=anthropic`** to stay on Claude direct with `ANTHROPIC_API_KEY`; the app's disclosure (`AI_PROVIDER` in `apps/app/src/app/core/ai-disclosure.ts`) names the gateway and must change with it. Without that setting `ANTHROPIC_API_KEY` is never used (the log says so as an error), so it can be removed.

The **Interviewer eval** workflow now needs the repository secret `AI_GATEWAY_API_KEY`.

After the deploy, the function log says `Interviewer: openai/gpt-6-luna through the Vercel AI Gateway (oidc).` and `/api/health` reports `interviewer: "ai"`. A warning that the catalog is unreachable means the instance bounds spend with the built-in prices; an error that names the model means it serves scripted practice. **Load the production environment** in **Set up Vercel** also loads `AI_GATEWAY_API_KEY`, `INTERVIEW_AI_PROVIDER` and `INTERVIEW_AI_MODEL` when they are set as repository secrets or variables.

## AI interview access

Paid AI requires an active Grasp account and explicit AI mode selection. Configure a usable Google or GitHub sign-in provider before inviting new AI learners. A server without a usable sign-in provider still offers guest scripted practice; existing active accounts can still choose AI. New and legacy-unmarked sessions default to scripted practice, and sign-in never upgrades an existing session automatically.

This release stores session mode in existing JSONB, without DDL. Retire older paid API instances and protect generated deployment URLs before relying on the account boundary. Old code ignores mode and can still dispatch guest paid calls. Older cached clients omit mode and start scripted sessions until updated. Disable paid provider configuration before rolling back to older code. Detailed access, quota and admission semantics are in [AI_INTERVIEWER.md](AI_INTERVIEWER.md#practice-modes-and-paid-access).

## AI spend reservations

`AI_DAILY_BUDGET_USD` caps shared liability for paid attempts admitted on each UTC day, across API instances using the same database and configured ceiling. Before contacting the model, the API atomically reserves an upper bound for that attempt. Complete, verified usage replaces the hold with actual cost, rounded up to a microdollar. The ledger keeps opaque reservation IDs and amounts without learner IDs, transcripts or provider responses. Account deletion does not erase incurred spend. Offline practice does not reserve paid budget.

The upper bound prices the request's input at its UTF-8 byte length plus 8,192 tokens for prompts the provider adds (a token always spans at least one byte, and Anthropic describes [token counting as an estimate](https://platform.claude.com/docs/en/build-with-claude/token-counting)), capped at the model's context limit, plus the requested output limit. Replies explicitly use 5-minute caching; scoring is uncached. Both request `standard_only` service. Workspace inference geography is preserved, with the possible US premium reserved before the response confirms the actual geography. Fast mode, server tools, unknown model versions, custom Anthropic headers and alternate API endpoints are unsupported. SDK diagnostic logging is disabled. Verify [model pricing](https://platform.claude.com/docs/en/about-claude/pricing), [model limits](https://platform.claude.com/docs/en/about-claude/models/overview) and [geography pricing](https://platform.claude.com/docs/en/manage-claude/data-residency) before changing this policy.

Through the gateway, the bound prices the same input count at the model's dearest catalog rate for input or cache write across tiers and regions, plus the output limit at its dearest output rate, and settles at the cost the gateway reports billing (`provider_metadata.gateway.cost`), or at the catalog rates when it reports none. A stream cut off after it started keeps its whole hold, since chat completions report usage only at the end.

Claude per-attempt ceilings at a full context window, verified September 2026 (a real hold is far smaller: an early Sonnet reply in a coding interview holds about $0.06 and its scoring about $0.21, growing with the transcript):

| Model                       | Reply (2,048 output tokens) | Score (16,000 output tokens) |
| --------------------------- | --------------------------: | ---------------------------: |
| `claude-sonnet-5`           |                   $2.772528 |                    $2.376000 |
| `claude-opus-5-5`           |                   $5.545056 |                    $4.752000 |
| `claude-haiku-4-5-20251001` |                   $0.260240 |                    $0.280000 |

The Haiku alias resolves to that exact snapshot. Holds are still larger than a reply's actual cost, since every output token is reserved. A reply whose stream is cut off after it started settles at the input the stream reported plus every allowed output token; one that fails before any usage is reported keeps its whole hold. Leave headroom for concurrent attempts and retries. The next attempt is refused whenever its whole reservation does not fit, even if some budget remains. An unset ceiling still records reservations and requires available storage.

Each retry gets its own reservation; automatic SDK retries are disabled. A definite failed HTTP response releases that attempt's hold, following [Anthropic's billing policy](https://support.claude.com/en/articles/8977456-how-do-i-pay-for-my-claude-api-usage). A disconnected, timed-out, interrupted or malformed successful response can still have incurred charges, so it retains its full hold. Missing or unfamiliar billing metadata and failed settlements also retain the hold. Streams are never retried after connection. Valid final usage settles before scorecard validation, so a later scoring retry or session-save failure cannot erase the charge. Database admission errors prevent provider dispatch.

Reservations and their settlements belong to the day admission began, even if completion crosses midnight. Unresolved holds reduce only that day's allowance and remain in the ledger until its history expires, 90 days after the day ends. This is an admission control limit based on published token rates, not an invoice total or an account-wide provider cap. Taxes, contract-specific rates, unrelated API clients and price changes are outside it. Replies and scoring have whole-call deadlines (`INTERVIEW_REPLY_DEADLINE_MS`, `INTERVIEW_SCORE_DEADLINE_MS`), capped at 280 s so a call ends inside Vercel's 300 s function limit and never leaves its session lease held; cancellation on account deletion remains a follow-up.

Migration `0010` adds the ledger and its short atomic Postgres functions. Admission and settlement each use one database round trip; the functions bound lock waits to 1.5 seconds, while the pool bounds the client's query wait to 3 seconds. A client timeout does not cancel the SQL statement: an ambiguous admission can leave an unused hold, but cannot authorize provider dispatch. Existing daily spend is imported conservatively, then refreshed monotonically during rollout. The new version never writes charges to the old spend counter, avoiding double counting.

Before enabling paid traffic on this release, drain or disable every older paid API instance, let its provider calls finish, and protect all older deployment URLs. Older code cannot see reservations or new ledger charges, so the shared ceiling does not hold while it can still admit requests. Migration is additive and compatible with old writes, but cannot make old admission logic atomic. A rollback to older code also loses this protection: disable its paid provider configuration until returning to a compatible release. Do not delete unknown holds merely to restore headroom without independently confirming that no billable request occurred.

## Privacy notes for error reporting

Sentry is loaded only when a DSN is set, as two projects: `grasp-api` (`SENTRY_DSN`) and `grasp-app` (`SENTRY_WEB_DSN`, used by the web app and the native apps).

The API reports explicit unexpected request and interview failures. Before any event reaches the SDK, it retains only the error category, a recognized error code, server-generated request correlation, release, environment, timestamp and static application stack locations. A second allowlist at the transport boundary drops all other envelope data, including attachments and SDK enrichment. Raw exception messages, SQL, parameters, causes, request data, user data and breadcrumbs are excluded. Automatic SDK integrations are disabled, so unhandled process failures are not automatically sent to Sentry. Startup failures use safe local diagnostics. Database outages and mapped provider failures (the 502s and 503s) are not reported one by one; they reach Sentry as the failure signals below.

The app reports errors handled by Angular and application bootstrap failures using fixed categories, release, environment, timestamp and verified static JavaScript file locations. The production build generates `error-assets.json` from emitted scripts; only exact asset URL matches contribute stack frames. Missing or invalid manifests omit frames, including during local `ng serve` and deployment overlap. The manifest request is bounded to three seconds and 64 KiB, runs only with a configured DSN, and does not block application startup.

The client rebuilds reports at capture and again immediately before transport, excluding raw messages, causes, learner data, URLs, breadcrumbs, attachments and SDK enrichment. Reporting requests omit cookies and referrers, and events explicitly disable IP inference. Automatic SDK integrations are disabled; an explicit deduplication integration suppresses consecutive equivalent errors. Application-owned error logs contain only a fixed operation and category. Third-party console logging is outside this guarantee and remains a tracked follow-up.

Native crash uploads are disabled: the app initializes the Angular SDK directly, since JavaScript filters do not protect native SDK envelopes. Restoring crash reporting requires native filters and tests for crash/relaunch, offline replay and previously cached envelopes. This is still a production-readiness gap, not a completed native reporting implementation.

## Failure signals and alerts

The API groups the failures an operator must hear about into fixed signals and sends each group to Sentry (`grasp-api`) at most once per instance every five minutes. Successes are never recorded. A signal event holds only the signal name, an error category, an allowlisted error code (such as `57014` or `53300`), release, environment and `failures`. It never holds messages, SQL, prompts, learner text, ids, tokens or emails. Its fingerprint is `failure-signal` plus the signal, so each signal is one Sentry issue titled `Failure signal <name>` with a `signal` tag.

| Signal             | Recorded when                                                                             |
| ------------------ | ----------------------------------------------------------------------------------------- |
| `db.timeout`       | A request, transaction or readiness check fails on a database timeout and returns 503.    |
| `db.unavailable`   | The same, on an unreachable or overloaded database (a connection error or `53300`).       |
| `rate-limit.store` | The Postgres rate limit counter fails, so the request gets a 503.                         |
| `ai.spend-store`   | The AI spend ledger cannot reserve (AI turns are refused) or settle (the hold is kept).   |
| `ai.rejected`      | The provider refuses the request or the key (400, 401, 403, 404): configuration is wrong. |
| `ai.busy`          | The provider rate limits or is overloaded after retries.                                  |
| `ai.unavailable`   | The provider errors (5xx) or drops the connection after retries.                          |
| `ai.timeout`       | A provider call or its credential exceeds its per-try timeout.                            |
| `ai.deadline`      | A whole reply or scoring call exceeds its deadline.                                       |
| `ai.failed`        | Any other unexpected failure on the AI path.                                              |

Vercel instances share no memory, so the grouping is per instance and needs no shared store: the first failure of a signal on an instance reports at once, and later ones in its five-minute window are held and counted into that instance's next report of the signal. Delivery is held open with `waitUntil`, so an instance frozen after its response does not drop it.

How to read an event:

- `failures` is a lower bound of the failures since the instance's previous report, this one included: held failures are lost when the instance is recycled before it fails again.
- The category, code and timestamp describe only the failure that sent the event, not the held ones.
- Sentry's event count for a signal counts instance windows, not failures. One instance sends at most one event per signal every five minutes, so it can send at most 3 in 10 minutes and 4 in 15 (one at the start of each window). One instance failing for more than five minutes sends at least 2 events. More events mean more instances or a longer outage.

Create these issue alert rules in the `grasp-api` project (Alerts, Create Alert, Issues; the free plan has them), filtered to the `production` environment, each sending to the owner's email:

1. **Any new failure signal.** When a new issue is created, or an issue changes state from resolved to unresolved; if the event's tag `signal` is set. Action interval 30 minutes. Resolve the issue once fixed so a recurrence alerts again.
2. **Database or rate limiter failing.** When the issue is seen more than 1 time in 10 minutes; if the tag `signal` is in `db.timeout,db.unavailable,rate-limit.store`. Action interval 30 minutes.
3. **AI provider degraded.** When the issue is seen more than 1 time in 15 minutes; if the tag `signal` is in `ai.timeout,ai.busy,ai.unavailable,ai.deadline,ai.failed`. Action interval 1 hour.
4. **AI configuration or spend ledger broken.** When the issue is seen more than 1 time in 1 hour; if the tag `signal` is in `ai.rejected,ai.spend-store`. Action interval 1 hour.

Rules 2 to 4 fire on one instance that keeps failing for more than five minutes, so they work on a quiet deployment with a single instance; rule 1 catches the first failure. If the tag filter offers no "is in" operator, add one "The event's tags match `signal` equals ..." filter per signal and set the filters to match any.

Unexpected errors (a 500, or a non-HTTP failure on the interview stream) are still reported one by one, as above, with their stack locations. Database outages, the provider failures mapped to 502 (`ai.rejected`, `ai.failed`) and every 503 reach Sentry only through these groups.
