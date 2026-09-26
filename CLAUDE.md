# CLAUDE.md

Grasp: a learning app for algorithm patterns and system design. Angular 22 (zoneless) with Ionic and Capacitor in
`apps/app`, a NestJS API in `apps/api` that also serves the web build, and the shared engine (tracers, curriculum,
spaced repetition, coding problems, Design Lab simulator) in `libs/engine`. Playwright tests live in `e2e`.

## Writing and code rules

- Never use em dashes (U+2014) anywhere: code, comments, commits, docs, learner content, chat. Use commas, colons,
  parentheses or en dashes instead. `libs/engine/src/content.spec.ts` rejects em dashes and non-breaking spaces in content.
- No comments by default. Comment only non-obvious reasons (workarounds, invariants, surprising rules), never what the
  code says. Log only where it helps diagnose a failure.
- One clear responsibility per file; past about 700 lines is a signal to split. Small, composable units.
- SOLID where it fits, especially single responsibility and depending on abstractions. Extract shared logic at the third
  real copy, not before.
- Implement the simplest thing that works, at the right depth: fix data at its source rather than patching the render
  site, and prefer structural layout fixes over per-content reservations.
- Match the surrounding code's idiom, naming and comment density.
- Debugging: consider several causes before settling on one, explain the problem plainly, and make the minimal change that
  fixes the root cause.
- For a non-trivial change, write a short plan with its trade-offs before coding.

## Commands

- `npm ci`, then `npx playwright install --with-deps chromium` for browser tests.
- `npm run verify`: lint, format check, typecheck, every unit and API test, and the production build. Must exit 0.
- `npm run e2e`: Playwright on desktop and a phone profile against the built app (run `npm run build` first).
- `npm run build:engine` after engine edits: the app resolves `@grasp/engine` from `libs/engine/dist`.
- Serve a production build: `PORT=4310 NODE_ENV=production WEB_DIST_DIR=$PWD/apps/app/dist/app/browser JWT_SECRET=<any 40
characters> LOG_LEVEL=warn node apps/api/dist/main.js`.
- Bundle stats: `cd apps/app && npx ng build --stats-json`. The initial bundle budget is 850 kB warning, 900 kB error.

## Releasing a change

Production is https://grasp-rho-taupe.vercel.app; `/api/health` reports the live `release` (a short commit sha). The
integration branch is `feature/improvements`: work lands there, and only the owner promotes it to `main` and production.

1. Work on a branch from `feature/improvements`. Commit with the owner's identity: Vercel blocks deployments whose head
   commit has any other author. Before the first commit run
   `git config user.name "Beka Goderdzishvili" && git config user.email beqa.goder@gmail.com`.
2. Run CI on the branch where `gh` is available: `gh workflow run ci.yml --ref <branch>` and
   `gh workflow run native.yml --ref <branch>`, then watch them (`gh run watch <id> --exit-status`). CI takes about two
   to three minutes. Pushing `feature/improvements` runs both as well.
3. Fast-forward `feature/improvements`: `git push origin <sha>:feature/improvements`, only when
   `git merge-base --is-ancestor origin/feature/improvements <sha>` holds. Never force-push it or `main`.
4. Do not deploy, test against production or push `main` unless the owner asks. When they do, deploy with
   `gh workflow run deploy.yml --ref <branch>`, verify production (see below), and fast-forward `main` the same way; if
   production is wrong, redeploy `main` and fix on the branch.

## Verifying

Every change is verified end to end, not only by tests:

- `npm run verify` and `npm run e2e` pass.
- `tools/verify/` holds the browser tools (see its README): screenshots plus axe plus page errors for every page state
  (`audit.mjs`), pixel diffs between two screenshot sets (`pixdiff.mjs`), and first-paint and first-tap timing on a
  throttled phone (`timing.mjs`). Compare against a build of `feature/improvements` for anything visual or performance
  related, in both themes, on desktop and a phone profile, and read the screenshots that differ.
- Against production, only when the owner asks for a release:
  `E2E_BASE_URL=https://grasp-rho-taupe.vercel.app npm run e2e -- --grep @smoke`, then
  `READONLY=1 BASE=https://grasp-rho-taupe.vercel.app THEME=dark node tools/verify/audit.mjs` (and `THEME=light`).
  `READONLY=1` blocks every API write, so production data stays clean. Never seed events into production.

## The improvement loop

`docs/LOOP.md` is the loop's memory: what has shipped, the open follow-ups, and the next candidates. Each run reads it
first, picks one improvement, takes it through build, verify, commit, a simplify review (reuse, simplification and
comments, efficiency, altitude), verify again, CI, and the fast-forward of `feature/improvements`, then records the
outcome and any new follow-ups in `docs/LOOP.md` in the same change set.
