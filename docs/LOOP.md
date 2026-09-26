# Improvement loop

The loop's memory between runs. Each run reads this first, picks one item, ships it through the full release sequence in
`CLAUDE.md`, and updates this file in the same change: add a line to **Shipped**, remove or edit what it resolved, and add
any follow-ups it found. Keep entries short and factual, with numbers where they exist.

## In progress

- Tree badges: merged into `feature/improvements`, not `main`, at the owner's request (2026-09-26). Production
  deploy and verification are skipped while this environment cannot reach grasp-rho-taupe.vercel.app. Release `bc54b3d`
  is still the one live in production.

## Shipped

| #      | What                                                                                                                                                                                                                                                                                                                                                                              | Commits              |
| ------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------- |
| 1 to 6 | Sign-in with Google and GitHub; 20 step-through visualizers; learner content polish; CI in about two minutes (sharded browser tests, cached dependencies); accessibility pass with axe in CI; light theme with a System, Light and Dark setting                                                                                                                                   | up to `eeb5dde`      |
| 7      | Dark theme contrast fixed at the token level (3:1 lines, 4.5:1 text); one shared look per visualizer state; queued items dashed                                                                                                                                                                                                                                                   | `5e5750a`, `4b29364` |
| 8      | A coding problem for every pattern (5 new, 23 in all), tree inputs drawn in examples and traces; problem definitions kept out of first paint by a light catalog                                                                                                                                                                                                                   | `9d868ff`, `3832945` |
| 9      | The code trace shows the call stack, on-the-stack and returned tree states, and grids drawn as tables; Python recovers from a fatal crash without a reload; trace frames 3.6 to 5x faster on large 2D values                                                                                                                                                                      | `c8a7570`, `eb623e9` |
| 10     | Light catalogs keep engine content out of first paint: initial bundle 974 kB to 822 kB, the learn page about 0.3 to 0.55 s sooner on a throttled phone, every tab tap as fast as before; every engine barrel uses `export *`                                                                                                                                                      | `eb3865b`, `ffcb6ee` |
| 11     | Playback controls stay put: the drawing holds its height, the page anchors what the learner is reading (controls, the Code panel below, side columns beside), array cells keep one width for the whole trace, toolbar titles stay clear; phone Code panel moves while stepping 0 (was 370), keyboard focus never fully hidden up to 300% zoom, forced layouts per step 4.0 to 1.9 | `4bb2e65`, `7b92df0` |
| 12     | Tree badges stay off the links: a leaf's badge sits below it, others above, else below, else beside; badge placement shared with the graph view. Badges on a link 3,403 of 4,559 in Subsets by Backtracking and 387 in measured code traces, now 0; audit covers a tree visualizer                                                                                                | `2ccfb88`, `b32fbae` |

## Open follow-ups

Known issues and deferred work, most valuable first.

- Visualizer at 320 px: some verdicts (about 40 of 144 checkpoints) are taller than the space above the playback controls,
  so the reveal keeps the controls on screen and the verdict's end sits under them until the learner scrolls. The first
  question can also open under the tab bar at 320 px.
- Binary Search with a long custom input such as -100 scrolls sideways inside the array on phones (by design since
  iteration 11, cells keep one width for the whole trace); a wrapped or compact layout would avoid the scroll.
- Scrolled arrays cannot be reached by keyboard in Safari, which skips scrollable regions in the tab order.
- Desktop at 1280x720: the sticky stage can jump when a checkpoint makes it taller than the side column.
- Resizing a desktop visualizer across the 960 px breakpoint and back, with the drawing's top within a few px of the
  toolbar: the page can come back 88 to 156 px off (dijkstra at 1366x660, 4 of 48 placements), or the next step can shift
  the drawing 45 to 111 px (grid-bfs, 2 of 48). Narrowing jumps about 800 px in Chrome before and after iteration 11.
  `HoldHeightDirective` switches native anchoring off while the drawing's top is above the view, so the widening is not
  anchored.
- `HoldHeightDirective` picks its rule by whether the drawing's top is on screen, not the controls; within 0 to 5 px of the
  toolbar a step's own compensation can cross that line, and the Code panel then moves (tree-traversal on Pixel 7).
- With predict mode on, a keyboard checkpoint round trip leaves the Code panel 8 px off on phones (union-find 72 px).
- At 400% zoom, `reveal()` never scrolls up, so a focused narration can end above the view (2 of 144 checkpoints). After a
  keyboard Continue at 200% and above, the focused narration wins over keeping Step forward on screen.
- Two-column page end: the sticky stage grows upward, so Step forward can move as the drawing grows (trie at 1366x660, up
  to 215 px).
- The Code panel's lit-line scroll uses `offsetTop` against `ion-content`, not the panel; it works only while panels overflow
  by 75 px or less.
- Arrow keys on the focused, scrollable Array region both step the player and scroll the region.
- The checkpoint's "Your call" icon shifts the panel 5 px when it loads.
- The interview title is truncated at 320 px.
- At 320 px in the light theme, content scrolled under the toolbar shows faintly through it behind the title (the Predict
  mode switch reads through on an answered Subsets checkpoint); the same on `main`.
- Preloading: `PreloadAllModules` fetches every lazy chunk right after first paint and competes with the first tap. An
  idle-time or tabs-first preloading strategy would let a quick first tap win the network.
- The pattern page's first tap is 44 to 133 ms slower than before iteration 10, because the full pattern content now loads
  on tap (about 3 kB brotli). Faster from page load overall.
- Trace: a generator resumed by a different call becomes a new call in the call stack, and a paused generator's node reads
  "returned" while it is off the stack.
- Native: the splash screen stays dark in the light theme; status bar icons on a light launch need a check on a device.
- Dependabot's `@sentry/angular` update fails CI.
- The tree view's side spot (a badge above and beside its node) is covered by a unit test and the code-trace measure, but
  no audit state shows it; a traced skewed tree (such as `[1,2,null,3]`) in `tools/verify` would.
- Local verification in the cloud container: its Node is 22.22.2, which the Angular CLI refuses (`.nvmrc` says 24), and
  its Chromium is 141 while the pinned 153 cannot be downloaded. Runs used Node 24 from nodejs.org and pointed
  `PLAYWRIGHT_BROWSERS_PATH` at a folder that links the preinstalled Chromium under the expected names.
- CI: the four end-to-end shards are uneven (118, 136, 175 and 185 s after iteration 11; CI 191 s wall, was 159 to 169 s).
  Playwright 1.63 splits by test count, not duration. Record per-test durations (`--reporter=json`, 336 s over 222 tests
  locally) and feed each shard a balanced `--test-list`.
- Small refactors: move `DEVICE_PLATFORM` into `platform.ts`; confirm the notifications plugin proxy is cleaned up on destroy.

## Content ideas

- A second coding problem for patterns that have only one (sliding window, prefix sums, monotonic stack, intervals, BFS,
  topological sort, union-find, Dijkstra, trie, 1-D and 2-D DP, greedy, fast and slow pointers).
- More Design Lab missions (there are 5), each with three spaced revisits.
- More review cards for patterns with the fewest drill cards and clozes.

## Rules for picking

- Prefer what a learner notices: correctness bugs, then accessibility and layout problems, then speed, then new content,
  then internal cleanups.
- One cohesive improvement per run. Measure before and after; never ship a change that makes something else slower or
  worse without saying so here.
