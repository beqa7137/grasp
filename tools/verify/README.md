# Browser verification tools

Scripts for checking a change end to end in a real browser, beside the Playwright suite in `e2e/`. They use the
Playwright and axe installs from `e2e`, so run `npm ci` and `npx playwright install --with-deps chromium` first. Output
goes to `OUT` (default `verify-out/`, ignored by git).

Serve a production build to test locally:

```sh
npm run build
PORT=4310 NODE_ENV=production WEB_DIST_DIR=$PWD/apps/app/dist/app/browser JWT_SECRET=local-only-secret-local-only-secret-12 LOG_LEVEL=warn node apps/api/dist/main.js
```

For a baseline, build `main` in a git worktree outside the repo and serve it on another port. Stop any server on 4310 before
`npm run e2e`: Playwright reuses a server already on its port, and one started here lacks the e2e's fake sign-in
providers, so every sign-in test times out.

## audit.mjs

Screenshots, serious and critical axe violations, page errors and sideways overflow for every page state listed in
`states/`, one file per area: `learn.mjs` (tabs, visualizers at a checkpoint and answered, review and practice cards, the
code workspace, dialogs), `design.mjs` (Design Lab, case studies and their widgets, design lessons) and `interview.mjs`
(interviews and behavioral). `lib.mjs` holds the browser helpers they share. Exits non-zero if any state has a problem.

```sh
BASE=http://localhost:4310 THEME=dark OUT=verify-out/now STABLE=1 node tools/verify/audit.mjs
BASE=https://grasp-rho-taupe.vercel.app THEME=light OUT=verify-out/prod READONLY=1 node tools/verify/audit.mjs
```

- `PROFILES` (default `desktop,pixel7`; also `w320`), and an optional state regex as the first argument.
- Each context starts with a fresh learner ID so server progress cannot leak between captured states.
- `STABLE=1` fixes the clock, `Math.random` and event UUIDs, so two builds can be compared pixel for pixel.
- `READONLY=1` blocks every API write; always use it against production.

## pixdiff.mjs

Compares same-named PNGs in two folders and prints the differing pixel count and the largest channel difference.

```sh
node tools/verify/pixdiff.mjs verify-out/base verify-out/now [name regex]
```

Anti-aliasing noise shows up as a few pixels with a channel difference of 1 or 2; two captures of the same build show the
same noise.

## timing.mjs

First paint of `/learn` and the first tap on Visualize, Design and a pattern card, on a Pixel 7 profile with Fast 3G and a
4x slower CPU, cold cache, builds interleaved, median of `RUNS`. Writes are blocked, so production is safe to time.

```sh
TARGETS=base=http://localhost:4311,now=http://localhost:4310 RUNS=5 node tools/verify/timing.mjs
```
