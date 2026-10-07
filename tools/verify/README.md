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
  - a closure chunk carries a module under `src/app/viz/` or the engine's `viz/`. Two are allowlisted until they leave
    first paint (`mastery-ring` and `code-text`); one that has left must leave the allowlist too;
  - `stats.json` is not from the build in `browser/` (after a development build, say).

  `first-paint-bytes.test.mjs` tests the same logic on fixture metafiles in `npm test`; it reads no build. REDESIGN.md 5.0
  names the test file as the gate; its R0 note says where the gate runs. Only `npm run build` runs `postbuild`, so a bare
  `npx ng build` skips the first-paint and leak gate; Angular's own `initial` budget in `apps/app/angular.json` (warning
  850 kB, error 855 kB) still applies there and is the backstop for the initial total. `first-paint-bytes.test.mjs` fails
  if that budget's error is raised above 855 kB.

- **Style ratchet.** `apps/app/scripts/style-tokens.test.mjs`, in `npm test`, scans every `.scss`, `.ts` and `.html`
  file under `apps/app/src` except specs, and counts, per file:
  - raw font sizes: `font-size`, the `font` shorthand and SVG `font-size` attributes;
  - raw radii: `border-radius`, its per-corner forms, Ionic's `--border-radius` and SVG `rx` and `ry` (a unitless
    attribute, static or bound, is read as px);
  - literal colors: hex, named colors, and `rgb()`, `hsl()` and the other color functions unless their channels are one
    bare token with at most a literal or token alpha (`rgba(var(--g-accent-rgb), 0.12)`), in color properties
    (`filter` and `backdrop-filter` included), SVG color attributes, custom properties, SCSS variables and `@include`
    arguments outside the theme, and in TypeScript any hex, color-function or color-name string (a compared string or a
    union-type member is not one);
  - `token-override`: outside the theme's rules, a raw length in a name the theme defines (a `--g-`/`--ion-` text, font
    or radius name counts as font-size or border-radius instead), at the definition, since it resizes the whole subtree;
  - `@media` width queries at any length except the redesign's viewport breakpoints (560, 1024 and 1280px, and 559.98,
    1023.98 and 1279.98px), and `@container` width queries except its container breakpoints (640 and 900px, and
    639.98 and 899.98px). A query on an SCSS variable it cannot resolve in the file counts, and so does a width query in a
    TypeScript string (`matchMedia`, `BreakpointObserver`; an interpolated width counts). Units are matched in any case.
    Only the width features' lengths count, at any depth of grouping with `and`, `or` and `not`, so a height joined with
    `and` (`(min-width: 900px) and (min-height: 424px)`) is free, and a width feature's `calc()` or `min()` counts whole.

  Where it reads: declarations in stylesheets, inline styles and `style` attributes, with SCSS interpolation (`#{$s}`)
  read like the bare variable; template `[style.x]` and `[attr.x]` bindings (camelCase too), `[style]` and `[ngStyle]`
  maps in either quote, `host` style bindings and a static `host: { style: '...' }` string, `@HostBinding`, `.style`
  assignments (dotted or bracketed) and `setProperty`, `Renderer2.setStyle` (camelCase names included), and string-valued
  style keys and fields in TypeScript (a CodeMirror theme's `fontSize`, a canvas `fillStyle`, `signal('13px')`). A
  binding's value is its string literals, a number with the binding's unit, or, when the expression is one name (`size`,
  `size()`, `this.size`), the literal that field holds in the component's own `.ts`. A value reached any other way
  (another file, a service, a computed string) is not followed. A mixin parameter used in a font size, a radius or a width
  query makes each `@include` of it (namespaced or not, positional or keyword, with `$variables` resolved) count that
  argument as one. A size is raw when it still holds a non-zero px, rem or pt once `chrome-font-size()` is removed; a
  `var()` fallback is read like any other value, so `var(--g-text-s, 13px)` counts. A `var(--g-…)` whose name no file
  declares counts too (the names `rgb-token` writes are declared). A custom property or SCSS variable defined with a raw
  size, directly or through one defined so before it, counts in each declaration that uses it, in its own file or another
  (unless the theme defines that name).

  Tokens are defined only in `_theme.scss` and in the root rules of `styles.scss` (`:root`, `html`, `.ion-palette-dark`,
  `[data-theme]`, also inside `@media`); the rest of `styles.scss` is global component styles, scored like a component
  file. Counts may only fall against `style-tokens.baseline.json`: a rise fails with each offending line, and a fall fails
  until `node scripts/style-tokens.mjs --update` (in `apps/app`) lowers the baseline, which it never raises. A file with
  no entry is held at 0, so new and migrated files stay clean. After moving or renaming files, delete the baseline and run
  `--update` to record it again: the diff shows every raise for review, and LOOP.md gives the reason.

- **Audit and pixel diff.** `audit.mjs` in both themes with `STABLE=1` and `PROFILES=desktop,w1024,pixel7,w320` (plus
  `ipad` when navigation changes), then `pixdiff.mjs` against the stored set of `main` (below). Read every differing
  screenshot. No state that is clean on `main` may become unclean (pixdiff exits 1 and names it); the known failures
  are listed in LOOP.md.
- **Timing.** `timing.mjs` against a build of `main`, with no regression in first paint or first tap.

## audit.mjs

Screenshots, axe violations, page errors and sideways overflow for every page state listed in `states/`, one file per
area: `learn.mjs` (Today, the Coding hub's segments, visualizers at a checkpoint and answered, the player's ⋯ panel, a held scrub guard and its tick
states, review and practice cards and the review summary, the
code workspace and an accepted submission, the study plan empty and set, the placement check's question and results,
dialogs), `design.mjs` (the Design hub's segments, Lab missions, case studies and their widgets, design lessons) and
`interview.mjs` (the Mock hub and interviews, the mock loop at setup, between rounds and at its debrief, and the Behavioral
hub). R5 renamed the hub states (`learn` is `today`, `visualize-list` is `coding-visualizers`, `code-list` is
`coding-problems`, `design-list` is `design-missions`, `design-list-cases` is `design-cases`, `interview-home` is `mock`,
`behavioral-list` is `behavioral-competencies`, `behavioral-mock` is `behavioral-drill`) and added `coding-skill-map` and
`design-topics`; compare a capture from before R5 under the old names. `lib.mjs` holds the browser helpers they share.

Sideways overflow is checked on the document and inside the page (`overflow.mjs`, shadow roots included), since Ionic
pages scroll inside `ion-content`: in-flow content spilling out of its box; text, fields, images, drawings or blocks clipped
by an `overflow: hidden` box (an ellipsis or visually hidden text is fine); a box that scrolls sideways although its styles
never set `overflow-x` (as `overflow-y: auto` alone does); and boxes that stick out of their `ion-content` or the viewport.
Each finding names the kind, the overflow in px and a selector path (`>>>` crosses into a shadow root). Each state also lists, as `fixed`, every fixed box outside Ionic's overlays laid over a visible `ion-content`
(`fixedOverlaps` in `overflow.mjs`), and the run ends with how many states have one; it does not affect `clean`. Scrollers whose
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
- After a state's setup, the audit waits until each `ion-router-outlet` shows one page, so axe never runs while a page
  transition still exposes the page being left (two banners and two mains).
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
it too; `markMotionOff` for a context a test opens itself) set `data-motion="off"` on `<html>` from an init script,
before any app script runs. It means test mode: every animation jumps to its end state and no transition runs, with no
trail markers (unlike Reduced, which shows them). Since R3 the app reads it: `core/motion.ts` (`bootMotion`, before
bootstrap) keeps it over any Motion setting and boots Ionic with `animated: false`, so page and overlay transitions do not
run at all, and the global rule in `styles.scss` stops CSS motion. The Motion setting never overwrites it. A Playwright
test of the Motion setting itself turns it off with `test.use({ motionOff: false })`; `timing.mjs` never sets it, since
it measures what learners get.

The URL form, `?motion=off`, works the same: `bootMotion` sets the attribute and strips the parameter with
`history.replaceState`, keeping the other parameters and the hash, so routes and URL assertions never see it. The tools
keep setting the attribute, which needs no URL change.

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
- **Refresh.** After its fast-forward, the iteration copies its own final capture (both themes, all four profiles, its
  last audit line reading "complete") to `/var/tmp/grasp-shots/<sha7>/`, named after the commit it was captured on.
  The check above, run against the landed head, shows the capture still holds when only docs (its LOOP.md entry)
  followed. Keep the two newest sets.
- **Recapture** from a build of `main` when the folder is gone, the check above fails, or pixdiff reports another
  browser version.
- **ipad** is not stored: an iteration that changes navigation captures a build of `main` on `ipad` when it needs the
  comparison.
- **Noise.** R0 captured one build twice in dark on all four profiles. Most differing images are anti-aliasing (under
  160 px, channel delta 1 or 2). Others differ for other reasons: `lesson-caching-flushed` (desktop, w1024 and w320: a
  timed readout), `code-two-sum-run` (desktop and w1024: the run time), `player-*-predict` and `-answered` at w320 (up to
  63 px, delta 27), and on pixel7 `pattern-minimum-spanning-tree` and `case-study-estimated` (the scroll end lands about
  20 px apart, so the whole image differs). Read those diffs, but expect them.

## timing.mjs

First paint of `/today` and the first tap on the Coding tab, the Design tab and Today's next-visualizer tile (the player, timed until its stage has drawn its first view, `ready`), on a Pixel 7 profile with Fast 3G and a
4x slower CPU, cold cache, builds interleaved, median of `RUNS`. Writes are blocked, so production is safe to time. Each tap's selector and headings also match a build from before R5 (`/today` redirects to Learn there, and the first tab
is Visualize), so `main` from before R5 can be timed against a later head.

```sh
TARGETS=base=http://localhost:4311,now=http://localhost:4310 RUNS=5 node tools/verify/timing.mjs
```
