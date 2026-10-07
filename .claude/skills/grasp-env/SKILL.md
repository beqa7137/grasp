---
name: grasp-env
description: Set up and recover the Grasp build container (Node, Postgres, Playwright browsers, ports, worktrees) and diagnose its known environmental failures. Use at the start of a session, after a container restart, before running tests or servers, or when a test fails with a WebKit internal error, a TLS handshake error or a blank page.
---

# Grasp build environment

The container is ephemeral and restarts without warning. Everything here makes a fresh or restarted container usable
and tells real failures from environmental ones.

## Setup

- Node: `export PATH=$HOME/node24/node-v24.21.0-linux-x64/bin:$PATH` (the version in `.nvmrc`). If that directory is
  missing, download that Node release into `$HOME/node24` first.
- Postgres: `.claude/skills/grasp-env/ensure-pg.sh` starts it on port 5433 (data in `/var/tmp/gpg`, created on first
  use). Databases: `grasp_test` (unit and API tests, `TEST_DATABASE_URL`) and `grasp_e2e` (e2e and audits,
  `DATABASE_URL`). Each parallel iteration gets its own pair, `grasp_test_<id>` and `grasp_e2e_<id>`:
  `psql -h localhost -p 5433 -U postgres -c "create database grasp_e2e_r4" -c "create database grasp_test_r4"`.
- Browsers: `PLAYWRIGHT_BROWSERS_PATH=/var/tmp/pw` and
  `CHROMIUM_PATH=/opt/pw-browsers/chromium_headless_shell-1194/chrome-linux/headless_shell`. Never run
  `playwright install`.
- App unit tests run through Angular: `npx ng test --include <path>` in `apps/app`, not plain vitest.
- Servers: blank `AI_GATEWAY_API_KEY`, `ANTHROPIC_API_KEY` and `VERCEL_OIDC_TOKEN` so nothing reaches the paid AI
  gateway.

## Ports

Taken: 4310 (default e2e API), 4311 (local audit server), 4410 (fake GitHub of the default e2e run). Every builder or
reviewer gets its own pair, the API on `E2E_PORT` and fake GitHub on `E2E_GITHUB_PORT`, and reviewers use the next port
up. Pick a free block per iteration, for example 4394/4494 for one and 4396/4496 for the next.

## Worktrees

Work on an iteration in a worktree under `/var/tmp` (for example `git worktree add -b r4 /var/tmp/r4 origin/main`), not
under `.claude/worktrees`: the API's static file server refuses paths containing `.claude`, so e2e there gets 404s
unless the build is served through a `/var/tmp` symlink. Run `npm ci` in a new worktree.

## Processes

Kill only processes you started, by PID. Never `pkill -f` or `killall`: they have killed the agent's own shell here.
A server left running by a stopped agent shows up in `pgrep -af "node apps/api/dist/main.js"`; check its working
directory (`ls -l /proc/<pid>/cwd`) before stopping it.

## After a container restart

1. `ensure-pg.sh`, then check each worktree: `git -C <worktree> status -s` and `git log --oneline origin/main..HEAD`.
2. Commit any uncommitted work as a WIP commit with the owner identity, so nothing is lost on the next restart.
3. Restart what was running: a stopped workflow with `resumeFromRunId` (completed agents replay from cache; pass a
   `resumeNote` naming the WIP commits so the builder continues instead of starting over), a stopped agent with
   SendMessage, a stopped test run from scratch. Timers (ScheduleWakeup) do not survive and must be scheduled again.

## Known environmental failures

Rerun once before treating any of these as real:

- **"WebKit encountered an internal error"** (console error or failed navigation): Playwright's WPENetworkProcess
  segfaults in libgobject and libsoup here; `dmesg | grep segfault` shows it. Worse under load.
- **Blank page or a page that never boots against production**: about 1 WebKit load in 8 fails its TLS handshake
  through the agent proxy ("Peer failed to perform TLS handshake"). Chromium is rarely affected.
- **Timeouts under load**: the container has 4 CPUs; two heavy runs at once (a full e2e suite, an audit, a build)
  make WebKit and long walks time out. Run one heavy job at a time.

A failure that repeats on rerun, or appears in Chromium on a quiet machine, is real: find its root cause.
