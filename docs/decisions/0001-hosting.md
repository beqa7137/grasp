# 1. Host production on Vercel with Neon Postgres

- **Status:** accepted
- **Date:** 2026-09-23
- **Supersedes:** the Fly.io setup (`fly.toml`, `provision.yml`), removed in the same change

## Context

Grasp is a NestJS API plus a static Angular web app, with a 14 MB Python runtime served as static files and interview replies streamed as server-sent events. The first deployment target was one Docker image on Fly.io. Before it went live, two things changed:

- The API kept its rate-limit counters, AI spend totals, interview quotas and per-session interview locks in process memory. On any platform that runs more than one instance, each instance would enforce its own limits, so the spend ceiling could be exceeded several times over.
- The owner asked whether Vercel would be better on price, scalability and availability.

## Decision

1. **Move all state instances must agree on to Postgres** (`counters` and `leases` tables, `CoordinationStore`). This came first because it is a correctness fix on every platform. The e2e suite proves it with two API instances sharing one database.
2. **Serve production from Vercel.** Static files, including the Python runtime, come from Vercel's CDN. One Node function wraps the Nest app and serves pages (so they get helmet's strict CSP), `/config.json` and `/api/*`, with response streaming for the interview.
3. **Use Neon for Postgres**, in AWS US East 1 next to the function (`iad1`). The function connects through Neon's pooler, and migrations use the direct connection.
4. **Deploy only from CI.** Vercel's Git integration is off. `deploy.yml` builds with `vercel build`, runs migrations, then deploys the prebuilt output.
5. **Keep the Docker image as a supported second target.** CI keeps building and smoke-testing it.

## Why

- **Availability.** The CDN serves the app shell's assets and the Python runtime from the edge, independently of the function. Functions scale out automatically and are replaced by the platform when they fail, with no machines to size or restart. Every deployment is kept, so rollback is instant.
- **Scalability.** Once shared state lives in Postgres, more instances only add capacity. The limits hold regardless of instance count, and the platform adds instances on demand.
- **Price.** At pilot scale both Vercel and Neon cost nothing or close to it. Neon sleeps when idle, and nothing on Vercel keeps it awake. The Hobby plan is for non-commercial use, so a product run for other people moves to Pro. That is a plan change, with no change to the code or setup.
- **Operations.** Every step runs from GitHub Actions: project creation, environment loading, build, migration, deploy and post-deploy verification. The sandboxed environments this project is developed in cannot reach Vercel or Neon directly, and nothing needs them to.

## Consequences

- Every request writes its rate-limit counter to Postgres. That costs one round trip, measured at about 1 ms locally. The throttler fails open if the database is down, and the spend guard fails closed.
- Serverless instances come and go, so the pool is attached with `attachDatabasePool` and the connection goes through Neon's pooler.
- `vercel.json` repeats the asset caching and header policy that `asset-policy.ts` defines for the Docker server. `vercel-config.spec.ts` compiles `vercel.json` with Vercel's routing library and fails if the two drift apart.
- The function is built with `NODEJS_HELPERS=0` so that Vercel's request helpers don't shadow Express's own methods. The CI smoke test checks this setting.
- Interview scoring must finish within the function's 300-second limit.
- Migrations run before the new code takes traffic, so each one must stay compatible with the release still running.

## Alternatives considered

- **Fly.io, one Docker image.** Long-lived processes suit SSE and in-memory state, but the in-memory state was already a problem for more than one machine. It also meant sizing machines, keeping one warm, and running health checks and restarts ourselves. Kept as a fallback via the Docker image.
- **Two Vercel projects, one for the app and one for the API**, as Vercel's import screen suggested. Rejected because the web app and API would sit on different origins. That means CORS for the web app, a separate `config.json` origin, and two deploys to keep in step.
