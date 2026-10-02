# Browser verification tools

Scripts for checking a change end to end in a real browser, beside the Playwright suite in `e2e/`. They use the
Playwright and axe installs from `e2e`, so run `npm ci` and `npx playwright install --with-deps chromium webkit` first
(WebKit is for the `ipad` profile). Output goes to `OUT` (default `verify-out/`, ignored by git).

Serve a production build to test locally:

```sh
npm run build
PORT=4310 NODE_ENV=production WEB_DIST_DIR=$PWD/apps/app/dist/app/browser JWT_SECRET=local-only-secret-local-only-secret-12 LOG_LEVEL=warn TRUST_PROXY=1 node apps/api/dist/main.js
```

`TRUST_PROXY=1` lets each audit context's own client address through, so a long run stays under the per-IP rate limit.
For a baseline, build `main` in a git worktree outside the repo and serve it on another port. Stop any server on 4310 before
`npm run e2e`: Playwright reuses a server already on its port, and one started here lacks the e2e's fake sign-in
providers, so every sign-in test times out.

## The gates of every redesign iteration

`docs/REDESIGN.md` 5.0 lists them. This is how each one runs.

- **verify and e2e.** `npm run verify`, and `npm run e2e` on desktop, phone and iPhone on the exact head. When the
  iteration touches navigation, the player or the Lab, the tablet subset runs too:
  `E2E_TABLET=1 npm run e2e -- --project=tablet` (an iPad Mini in WebKit, running the tests tagged `@nav`, `@player` and
  `@lab`). The project exists only with `E2E_TABLET` set, and never against a deployment, so a plain `npm run e2e` and CI
  stay on three devices.
- **First paint.** Every production build writes `apps/app/dist/app/stats.json`, and the app's `postbuild` runs
  `apps/app/scripts/first-paint-bytes.mjs` on it, so `npm run build`, verify, CI and the deploys all check it. It prints
  one line (`First paint 987.80 kB: JS 930.13 kB in 30 files + global CSS 57.67 kB (baseline …`) and fails the build
  when:
  - the closure (main, the tabs chunk and the chunk of the page the empty path redirects to, every chunk they import
    statically, and the global stylesheet) is more than 2 kB above or below `first-paint-bytes.baseline.json`. An
    intended change runs `node scripts/first-paint-bytes.mjs --update` in `apps/app`, commits the new baseline and states
    the old and new bytes in LOOP.md. A shrink lowers the baseline the same way, so the freed room never becomes silent
    headroom;
  - Angular's initial total (main's static closure plus the global stylesheet) passes 855 kB;
  - a closure chunk carries a module under `src/app/viz/` or the engine's `viz/`. Two are allowlisted until they leave
    first paint (`mastery-ring` and `code-text`); one that has left must leave the allowlist too;
  - `stats.json` is not from the build in `browser/` (after a development build, say).

  `first-paint-bytes.test.mjs` tests the same logic on fixture metafiles in `npm test`; it reads no build. REDESIGN.md 5.0
  names the test file as the gate; its R0 note says where the gate runs.

- **Style ratchet.** `apps/app/scripts/style-tokens.test.mjs`, in `npm test`, scans every `.scss`, `.ts` and `.html`
  file under `apps/app/src` except specs, and counts, per file:
  - raw font sizes: `font-size` and the `font` shorthand;
  - raw radii: `border-radius`, its per-corner forms and Ionic's `--border-radius`;
  - literal colors: hex, `rgb()`, `hsl()` and the other color functions with no token inside, and named colors, in color
    properties, SVG color attributes and custom properties other than `--g-` and `--ion-` ones;
  - `@media` width queries at any length except the redesign's breakpoints: 560, 1024 and 1280px, and 559.98, 1023.98
    and 1279.98px.

  A size is raw when it still holds a non-zero px or rem once `var(--g-…)` and `chrome-font-size()` are removed. A
  local custom property defined with a raw size counts in the declaration that uses it. `--g-` and `--ion-` definitions
  are the tokens and never count. Counts may only fall against `style-tokens.baseline.json`: a rise fails with each
  offending line, and a fall fails until `node scripts/style-tokens.mjs --update` (in `apps/app`) lowers the baseline,
  which it never raises. A file with no entry is held at 0, so new and migrated files stay clean. After moving or
  renaming files, delete the baseline and run `--update` to record it again: the diff shows every raise for review, and
  LOOP.md gives the reason.

- **Audit and pixel diff.** `audit.mjs` in both themes with `STABLE=1` and `PROFILES=desktop,w1024,pixel7,w320` (plus
  `ipad` when navigation changes), then `pixdiff.mjs` against the stored set of `main` (below). Read every differing
  screenshot. No state that is clean on `main` may become unclean (pixdiff exits 1 and names it); the known failures
  are listed in LOOP.md.
- **Timing.** `timing.mjs` against a build of `main`, with no regression in first paint or first tap.

## audit.mjs

Screenshots, axe violations, page errors and sideways overflow for every page state listed in `states/`, one file per
area: `learn.mjs` (tabs, visualizers at a checkpoint and answered, review and practice cards and the review summary, the
code workspace and an accepted submission, the study plan empty and set, the placement check's question and results,
dialogs), `design.mjs` (Design Lab, case studies and their widgets, design lessons) and `interview.mjs` (interviews, the
mock loop at setup, between rounds and at its debrief, and behavioral). `lib.mjs` holds the browser helpers they share.

Sideways overflow is checked on the document and inside the page (`overflow.mjs`, shadow roots included), since Ionic
pages scroll inside `ion-content`: in-flow content spilling out of its box; text, fields, images, drawings or blocks clipped
by an `overflow: hidden` box (an ellipsis or visually hidden text is fine); a box that scrolls sideways although its styles
never set `overflow-x` (as `overflow-y: auto` alone does); and boxes that stick out of their `ion-content` or the viewport.
Each finding names the kind, the overflow in px and a selector path (`>>>` crosses into a shadow root). Scrollers whose
styles set `overflow-x` never fail; ones a keyboard cannot reach or a screen reader cannot name are listed as `scrollers`.
Its tests run a fixture page in CI: `node --test tools/verify/overflow.test.mjs`, in Chromium, or in WebKit with
`BROWSER=webkit`.

```sh
BASE=http://localhost:4310 THEME=dark OUT=verify-out/now STABLE=1 PROFILES=desktop,w1024,pixel7,w320 node tools/verify/audit.mjs
BASE=https://grasp-rho-taupe.vercel.app THEME=light OUT=verify-out/prod READONLY=1 node tools/verify/audit.mjs
```

- `PROFILES` (default `desktop,pixel7`): `desktop` 1280×1000, `w1024` 1024×768 (fine pointer), `pixel7`, `w320`
  320×700 (Pixel 7 at 320px) and `ipad` (iPad Mini portrait, 768×1024, touch, WebKit). An optional state regex is the
  first argument.
- A state is clean with no axe violation of any impact (5.0: axe at 0 violations), no page error and no sideways
  overflow. Every violation is recorded with its impact in `audit-<THEME>.json` and on the console line. The exit code is
  1 when any state of the run is not clean.
- Each context starts with a fresh learner ID so server progress cannot leak between captured states, and with
  `prefers-reduced-motion: reduce` and the motion test mode (below).
- `STABLE=1` fixes the clock, `Math.random` and event UUIDs, so two builds can be compared pixel for pixel.
- `READONLY=1` blocks every API write; always use it against production.
- Results merge into `OUT` by profile and state, so a rerun of a few states (a WebKit crash, say) keeps the rest of the
  record. `OUT/capture-<THEME>.json` records the build (the `main` and `styles` files the server's page loads), `STABLE`,
  `MASK_CSS` and the browser versions; a run into an `OUT` captured from another build, other settings or another
  browser version stops at once. The last line says whether `OUT` now holds every state on every profile it has, or
  names what is missing.

A full capture is 176 states, so a set of both themes on the four default profiles is 1,408 screenshots. On this
4-core machine under a second builder's load, Chromium takes about 9 s a state; run the two themes as two processes.

## Motion test mode

The audit (`lib.mjs`) and Playwright (`e2e/tests/fixtures.ts`, on the context, so pages a test opens and popups get
it too) set `data-motion="off"` on `<html>` from an init script, before any app script runs. It means test mode: every
animation jumps to its end state, with no trail markers (unlike Reduced, which shows them). Nothing reads it yet: R3's
Motion preference and R19's `MotionService` do. A Playwright test of the Motion setting itself turns it off with
`test.use({ motionOff: false })`; `timing.mjs` never sets it, since it measures what learners get.

The URL form, `?motion=off`, is R3's to add: its boot code keeps a `data-motion="off"` already present, treats
`?motion=off` the same, and strips the parameter with `history.replaceState` so routes and URL assertions never see it.
Until then the tools set only the attribute, which every consumer the spec names reads.

## pixdiff.mjs

Compares same-named PNGs in two folders and prints the differing pixel count and the largest channel difference. Then,
per theme, it prints both folders' builds and browser versions from `capture-<THEME>.json`, and lists the states clean
in the first folder that are not clean in the second, and the reverse, from `audit-<THEME>.json`.

```sh
node tools/verify/pixdiff.mjs /var/tmp/grasp-shots/<sha7> verify-out/now [name regex]
```

It exits 1 when `STABLE` or `MASK_CSS` differ (the captures are not comparable) or when a state clean in the first
folder is not clean in the second. It warns when a browser version differs (recapture the base before reading diffs)
or a folder has no manifest. Anti-aliasing noise shows up as a few pixels with a channel difference of 1 or 2; two
captures of the same build show the same noise.

## The stored screenshot set of main

`/var/tmp/grasp-shots/<sha7>/` on the loop's machine holds a `STABLE=1` capture of `main` in both themes on `desktop`,
`w1024`, `pixel7` and `w320`, with `audit-*.json` and `capture-*.json`. `<sha7>` is the commit the build came from.
Images never go into git, and CI does not make the set: its Chromium and fonts differ, so every image would differ.

- **Is it current?** A later commit that changes none of
  `apps libs package-lock.json tools/verify/lib.mjs tools/verify/states` leaves the capture valid (a docs commit, say):
  `git diff --quiet <sha7> origin/main -- apps libs package-lock.json tools/verify/lib.mjs tools/verify/states`. A build
  of `origin/main` also loads the `main` and `styles` files the manifest names.
- **Compare.** An iteration captures its head with `STABLE=1` on the same profiles and runs `pixdiff.mjs` with the newest
  set first.
- **Refresh.** After its fast-forward, the iteration copies its own final capture (taken on the exact head that landed,
  both themes, all four profiles, its last audit line reading "complete") to `/var/tmp/grasp-shots/<sha7 of that head>/`.
  Keep the two newest sets.
- **Recapture** from a build of `main` when the folder is gone, the check above fails, or pixdiff reports another
  browser version.
- **ipad** is not stored: an iteration that changes navigation captures a build of `main` on `ipad` when it needs the
  comparison.
- **Noise.** Two captures of one build differ only in the states listed in LOOP.md's R0 entry; ignore those diffs
  unless they grow.

## timing.mjs

First paint of `/learn` and the first tap on Visualize, Design and a pattern card, on a Pixel 7 profile with Fast 3G and a
4x slower CPU, cold cache, builds interleaved, median of `RUNS`. Writes are blocked, so production is safe to time.

```sh
TARGETS=base=http://localhost:4311,now=http://localhost:4310 RUNS=5 node tools/verify/timing.mjs
```
