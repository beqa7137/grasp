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

Vercel runs as many function instances as traffic needs. State they must agree on lives in Postgres: the AI spend ceiling and its daily totals, per-learner interview quotas and rate-limit counters (`counters`), and per-session interview locks (`leases`, which expire after 15 minutes if an instance dies mid-call). Every request writes its rate-limit counter, which costs one database round trip. The Postgres pool is attached with `attachDatabasePool`, so a suspended instance closes its idle connections instead of leaking them. Without `DATABASE_URL`, the in-memory fallback keeps this state per process; that mode is only for local development.

### Database: Neon

Create the project in **AWS US East 1**, next to the function. Neon gives two connection strings: a pooled one (host contains `-pooler`) and a direct one.

- `DATABASE_URL` should be the **pooled** string: serverless instances come and go, and the pooler absorbs their connections.
- `DATABASE_URL_UNPOOLED` (optional) is the **direct** string; migrations use it when set.

The free tier allows 100 compute-hours a month at the smallest size and sleeps after 5 idle minutes. Nothing on Vercel pings the database while nobody uses the app, so it only runs while people do, which fits a pilot comfortably. Watch the usage page in the Neon console as the cohort grows.

### First deploy

Everything runs from GitHub Actions; no local Vercel or Neon tooling is needed.

1. **Vercel token.** Create one in Vercel account settings → Tokens, scoped to your account or team, and add it as the repository secret `VERCEL_TOKEN`. For a team, add the repository variable `VERCEL_SCOPE` (team slug). The project name defaults to `grasp`; override it with the variable `VERCEL_PROJECT`.
2. **Database.** Add the secrets `DATABASE_URL` (pooled) and, optionally, `DATABASE_URL_UNPOOLED` (direct).
3. **App secrets.** `JWT_SECRET` and `ADMIN_TOKEN` (`openssl rand -hex 32` each; keep a copy of the admin token for `npm run pilot:report`). Optional secrets: `ANTHROPIC_API_KEY`, `SENTRY_DSN`, `SENTRY_WEB_DSN`, and for sign-in `GOOGLE_WEB_CLIENT_ID`, `GOOGLE_IOS_CLIENT_ID`, `OAUTH_GITHUB_ID` and `OAUTH_GITHUB_SECRET` (set the two GitHub ones together; [ACCOUNTS.md](ACCOUNTS.md#configuration) says how to create the Google and GitHub clients, and that the Google consent screen must be published). `GOOGLE_WEB_CLIENT_SECRET` is not needed. Optional variable: `AI_DAILY_BUDGET_USD` (recommended once `ANTHROPIC_API_KEY` is set).
4. Run **Set up Vercel** (Actions tab). It creates the project if needed and loads the production environment: secrets as Vercel "sensitive" variables, which cannot be read back, and settings as plain ones. The public Google and GitHub client ids count as settings; `OAUTH_GITHUB_SECRET` is sensitive. It is safe to re-run after adding or rotating a secret.
5. Add the repository variable `VERCEL_DEPLOY_ENABLED=true` and run **Deploy**. Its summary shows the deployment; add the production domain as the variable `PUBLIC_URL` (for example `https://grasp-yourname.vercel.app`) so later deploys verify it.

### Continuous deployment

Vercel's own Git deployments are off (`git.deploymentEnabled: false` in `vercel.json`), so nothing reaches production without CI. `.github/workflows/deploy.yml` runs after CI passes on a push to `main`, or by hand:

1. Link the project and pull its production settings.
2. `vercel build --prod`: the same build CI smoke-tests (`vercel` job in `ci.yml`, which builds with a placeholder project link, then runs the built function as Vercel does (outside the repo, unable to `require()` ES modules) against Postgres and checks pages, CSP, config, JSON bodies and streaming).
3. Migrate the database with `DATABASE_URL_UNPOOLED` (or `DATABASE_URL`).
4. `vercel deploy --prebuilt --prod`, tagged with the commit's short SHA as `RELEASE`.
5. If `PUBLIC_URL` is set, wait until `/api/health` reports the new release, then check readiness, a deep link, `/config.json` and the Python runtime.
6. Run the `@smoke` browser tests against `PUBLIC_URL` on desktop and phone viewports. They only read: every API call that could write data is blocked, so the pilot metrics stay clean. If a check fails, the function's recent 5xx logs are attached to the run.

Migrations run before the new code takes traffic, so each one must work with the release still running: add tables and columns first, remove them in a later release.

### Rollback

Vercel keeps every deployment. **Instant Rollback** in the dashboard, or `vercel rollback` with the CLI, points production back at the previous deployment in seconds, with no rebuild. Migrations only move forward, which is why they must stay backward-compatible (above).

### Plans

The Hobby plan is free but for personal, non-commercial projects. A product run for other people belongs on Pro. Nothing in this setup depends on the plan: the function stays within Hobby's 300-second limit, and usage at pilot scale is small either way.

## Docker image

`Dockerfile` builds one image that serves the API under `/api` and the web app at `/`, for any container host.

- **Multi-stage build.** It builds the engine, API and web app, then installs only the API's production dependencies into a `node:24-slim` runtime. It runs as the unprivileged `node` user.
- **Web app.** It serves the web app from `/srv/web` with the same asset policy as the Vercel CDN (`asset-policy.ts`). Deep links fall back to `index.html`.
- **Runtime config.** It generates `/config.json` from the environment, so the same image works in every environment.
- **Behind a proxy.** Set `TRUST_PROXY` to the number of proxy hops in front of the container, usually `1` behind a host or load balancer that terminates TLS. The server takes the client IP and the request's scheme from those hops. Without it, per-IP rate limits count the proxy's address, and every web GitHub sign-in fails with `invalid_request`: the API accepts only `https://<host>/auth/callback` as the web callback, but sees `http`.
- **Migrations.** `node apps/api/dist/migrate.js` applies them; run it as a release step before new containers take traffic.
- **Health.** `GET /api/health` is liveness: storage, interviewer mode and release. `GET /api/health/ready` is readiness: it checks the database and returns 503 when it is unreachable. Point a platform's routing check at liveness, so a database outage returns the API's own 503s and a scale-to-zero database can sleep between visits.
- **Shutdown.** SIGTERM closes the HTTP server and the Postgres pool.

CI builds this image on every push and smoke-tests it against Postgres: migrations, readiness, deep-link fallback, runtime config and a real API call.

## Both platforms

- **Hardening.** Helmet sets the security headers, including a CSP with no inline scripts. `Cross-Origin-Opener-Policy` is `same-origin-allow-popups` rather than `same-origin`, so the web sign-in popup can report back to the page that opened it. The popup's landing page, `/auth/callback`, gets `unsafe-none`: it arrives there from Google or GitHub, whose pages send no such header, and a COOP on the landing page would cut the popup off from the app window waiting for its result. The server rejects JSON bodies over 256 kB and URL-encoded bodies (only the GitHub token endpoint takes them) over 16 kB, and rate-limits each caller (`RATE_LIMIT_PER_MINUTE` per signed-in user or client IP, health checks exempt). It trusts `TRUST_PROXY` hops for the client IP and the request's scheme, which web GitHub sign-in depends on.
- **Logs.** Structured JSON logs, one access line per request with a request id. An incoming well-formed `X-Request-Id` is reused and echoed back.
- **Config validation.** Environment variables are checked at startup, and every invalid one is reported. On Vercel, a function that cannot start answers 503 and retries on the next request.

## Native apps against a deployed API

Native builds read `config.json` from the bundled web assets. `cap:sync` writes that file from environment variables:

```bash
cd apps/app
GRASP_RELEASE=1 GRASP_API_URL=https://<your-domain>/api GRASP_VERSION=1.0.0 GRASP_GOOGLE_IOS_CLIENT_ID=<id>.apps.googleusercontent.com npm run cap:sync
```

`GRASP_RELEASE=1` turns off cleartext HTTP and requires an `https` API URL. `GRASP_GOOGLE_IOS_CLIENT_ID`, the same value as the server's `GOOGLE_IOS_CLIENT_ID`, is all the iOS app needs for Google sign-in: `cap:sync` writes it to `config.json` and derives the URL scheme that GoogleSignIn requires for the Xcode build (see [MOBILE.md](MOBILE.md#sign-in-google-and-github)). Without it, the iOS app does not offer Google. `GRASP_SENTRY_DSN` enables error reporting in the app. The app uses Sentry's Capacitor SDK, so native crashes on iOS and Android are reported too, next to JavaScript errors. The API's default `CORS_ORIGINS` already allows the Capacitor origins on iOS and Android, and native apps download the Python runtime from the same domain.

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
| `ANTHROPIC_API_KEY`                         | secret; unset runs the offline interviewer                                                   |
| `GOOGLE_WEB_CLIENT_ID`                      | the Google web client id; unset turns Google sign-in off                                     |
| `GOOGLE_IOS_CLIENT_ID`                      | optional; the Google iOS client id                                                           |
| `OAUTH_GITHUB_ID` / `OAUTH_GITHUB_SECRET`   | the GitHub OAuth app, set together (the secret is sensitive); unset turns GitHub sign-in off |
| `OAUTH_GITHUB_URL` / `OAUTH_GITHUB_API_URL` | unset in production (GitHub Enterprise only)                                                 |
| `AI_DAILY_BUDGET_USD`                       | recommended for any public deployment                                                        |
| `SENTRY_DSN` / `SENTRY_WEB_DSN`             | optional; the web app receives its DSN through `/config.json`                                |
| `RELEASE`                                   | the deploy's short SHA; on Vercel it falls back to `VERCEL_GIT_COMMIT_SHA`                   |
| `WEB_DIST_DIR`, `PORT`                      | set by the image; on Vercel `WEB_DIST_DIR` is set by `api/index.js`                          |
| `NODEJS_HELPERS`                            | `0` at Vercel build time (set by the workflows and by **Set up Vercel**)                     |

## Privacy notes for error reporting

Sentry is loaded only when a DSN is set, as two projects: `grasp-api` (`SENTRY_DSN`) and `grasp-app` (`SENTRY_WEB_DSN`, used by the web app and the native apps). Both turn off collection of user info, cookies, request and response bodies, query strings and stack-frame variables; the app strips query strings from the request and from navigation and fetch breadcrumbs. The API also turns off database query data and AI prompt inputs and outputs, and strips the `x-learner-id` header. Interview transcripts and learner answers never reach Sentry. 503s from a busy AI provider are expected and aren't reported.
