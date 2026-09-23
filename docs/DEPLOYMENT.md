# Deployment

Grasp ships as one Docker image that serves the API under `/api` and the web app at `/`. The reference setup is a single Fly.io machine plus managed Postgres. Any container host works: the image doesn't depend on Fly.

## What the image does

- **Multi-stage build.** It builds the engine, API and web app, then installs only the API's production dependencies into a `node:24-slim` runtime. It runs as the unprivileged `node` user.
- **Web app.** It serves the web app from `/srv/web`. Fingerprinted assets are cached for a year, while `index.html` and other files revalidate. Deep links fall back to `index.html`.
- **Runtime config.** It generates `/config.json` from the environment, so the same image works in every environment.
- **Migrations.** `node apps/api/dist/migrate.js` applies migrations. On Fly this runs as the release command before new machines take traffic.
- **Health.** `GET /api/health` is liveness: it reports storage, interviewer mode and release. `GET /api/health/ready` is readiness: it checks the database and returns 503 when the database is unreachable. The Docker `HEALTHCHECK` uses liveness; Fly's check uses readiness.
- **Hardening.** Helmet sets the security headers, including a CSP with no inline scripts. The server rejects JSON bodies over 256 kB and rate-limits each client IP (`RATE_LIMIT_PER_MINUTE`, health checks exempt). It trusts `TRUST_PROXY` hops for the client IP.
- **Logs.** Structured JSON logs, one access line per request with a request id. An incoming well-formed `X-Request-Id` is reused and echoed back.
- **Shutdown.** SIGTERM closes the HTTP server and the Postgres pool.
- **Config validation.** Environment variables are checked at startup, and every invalid one is reported before the process exits.

CI builds this image on every push and smoke-tests it against Postgres: migrations, readiness, deep-link fallback, runtime config and a real API call.

## First deploy on Fly.io

Prerequisites: `flyctl` installed and `fly auth login` done.

```bash
# 1. Create the app from the checked-in fly.toml (edit `app` first; names are global)
fly launch --copy-config --no-deploy

# 2. Postgres: Fly Managed Postgres, or any provider (Neon, Supabase, RDS...)
fly mpg create                       # then attach it, or copy its connection string
fly secrets set DATABASE_URL="postgresql://..."

# 3. Optional integrations
fly secrets set ANTHROPIC_API_KEY="sk-ant-..." AI_DAILY_BUDGET_USD=5
fly secrets set SENTRY_DSN="https://...@o0.ingest.sentry.io/1" SENTRY_WEB_DSN="https://...@o0.ingest.sentry.io/2"

# 4. Deploy (builds remotely, runs migrations, then rolls out)
fly deploy --build-arg RELEASE=$(git rev-parse --short HEAD)

# 5. Check it
curl https://<app>.fly.dev/api/health
fly logs
```

`fly.toml` keeps exactly one machine running, with auto-stop off. The AI spend ceiling, per-learner quotas and per-session interview locks live in process memory, so running more machines would multiply the spend ceiling and weaken those locks. Keep one machine until that state moves into Postgres. One `shared-cpu-1x`/512 MB machine is plenty for a pilot.

## Continuous deployment

`.github/workflows/deploy.yml` deploys `main` after CI passes on a push. It can also be run by hand from the Actions tab. It stays inactive until you:

1. Create a deploy token: `fly tokens create deploy -x 999999h`
2. Add it as the repository secret `FLY_API_TOKEN`
3. Add the repository variables `FLY_DEPLOY_ENABLED=true` and `PUBLIC_URL=https://<app>.fly.dev`
4. Optionally add protection rules to the `production` environment, such as required reviewers

After deploying, the workflow polls `/api/health` until the new release's short SHA appears.

## Rollback

```bash
fly releases                       # find the last good version and its image
fly deploy --image <registry.fly.io/app@sha256:...>
```

Migrations only move forward. A release that changes the schema should be backward-compatible with the previous release: add columns, don't rename or drop them in the same release.

## Native apps against a deployed API

Native builds read `config.json` from the bundled web assets. `cap:sync` writes that file from environment variables:

```bash
cd apps/app
GRASP_RELEASE=1 GRASP_API_URL=https://<app>.fly.dev/api GRASP_VERSION=1.0.0 npm run cap:sync
```

`GRASP_RELEASE=1` turns off cleartext HTTP and requires an `https` API URL. `GRASP_SENTRY_DSN` enables error reporting in the app. The API's default `CORS_ORIGINS` in `fly.toml` already allows the Capacitor origins on iOS and Android.

## Environment reference

Every variable is validated at startup. See `apps/api/.env.example` for the full list with comments.

| Variable                          | Production value                                                 |
| --------------------------------- | ---------------------------------------------------------------- |
| `NODE_ENV`                        | `production` (set in `fly.toml`)                                 |
| `DATABASE_URL`                    | secret                                                           |
| `TRUST_PROXY`                     | `1` behind Fly's proxy                                           |
| `CORS_ORIGINS`                    | Capacitor origins; the web app is same-origin and needs no entry |
| `RATE_LIMIT_PER_MINUTE`           | `300` per IP                                                     |
| `LOG_FORMAT` / `LOG_LEVEL`        | `json` / `log`                                                   |
| `ANTHROPIC_API_KEY`               | secret; unset runs the offline interviewer                       |
| `AI_DAILY_BUDGET_USD`             | recommended for any public deployment                            |
| `SENTRY_DSN` / `SENTRY_WEB_DSN`   | optional; the web app receives its DSN through `/config.json`    |
| `RELEASE`, `WEB_DIST_DIR`, `PORT` | set by the image                                                 |

## Privacy notes for error reporting

Sentry is loaded only when a DSN is set. Both the API and the web app turn off collection of user info, cookies, request and response bodies, query strings and stack-frame variables. The API also turns off database query data and AI prompt inputs and outputs, and strips the `x-learner-id` header. Interview transcripts and learner answers never reach Sentry. 503s from a busy AI provider are expected and aren't reported.
