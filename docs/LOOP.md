# Improvement loop

The loop's memory between runs. Each run reads this first, picks one item, ships it through the full release sequence in
`CLAUDE.md` into `feature/improvements` (the loop's base branch; production and `main` only on the owner's request), and
updates this file in the same change: add a line to **Shipped**, remove or edit what it resolved, and add any follow-ups
it found. Keep entries short and factual, with numbers where they exist.

## Shipped

| #      | What                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | Commits                |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| 1 to 6 | Sign-in with Google and GitHub; 20 step-through visualizers; learner content polish; CI in about two minutes (sharded browser tests, cached dependencies); accessibility pass with axe in CI; light theme with a System, Light and Dark setting                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | up to `eeb5dde`        |
| 7      | Dark theme contrast fixed at the token level (3:1 lines, 4.5:1 text); one shared look per visualizer state; queued items dashed                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `5e5750a`, `4b29364`   |
| 8      | A coding problem for every pattern (5 new, 23 in all), tree inputs drawn in examples and traces; problem definitions kept out of first paint by a light catalog                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                              | `9d868ff`, `3832945`   |
| 9      | The code trace shows the call stack, on-the-stack and returned tree states, and grids drawn as tables; Python recovers from a fatal crash without a reload; trace frames 3.6 to 5x faster on large 2D values                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `c8a7570`, `eb623e9`   |
| 10     | Light catalogs keep engine content out of first paint: initial bundle 974 kB to 822 kB, the learn page about 0.3 to 0.55 s sooner on a throttled phone, every tab tap as fast as before; every engine barrel uses `export *`                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                 | `eb3865b`, `ffcb6ee`   |
| 11     | Playback controls stay put: the drawing holds its height, the page anchors what the learner is reading (controls, the Code panel below, side columns beside), array cells keep one width for the whole trace, toolbar titles stay clear; phone Code panel moves while stepping 0 (was 370), keyboard focus never fully hidden up to 300% zoom, forced layouts per step 4.0 to 1.9                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                            | `4bb2e65`, `7b92df0`   |
| 12     | Tree badges stay off the links: a leaf's badge sits below it, others above, else below, else beside; badge placement shared with the graph view. Badges on a link 3,403 of 4,559 in Subsets by Backtracking and 387 in measured code traces, now 0; audit covers a tree visualizer                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                           | `2ccfb88`, `b32fbae`   |
| 13     | CI and deploys spend minutes once per commit: on `main`, CI and the native builds reuse the branch's passing runs and the deploy skips a commit production already runs; native builds run only for native changes. A loop release went from about 50 Linux and 4 macOS minutes to about 25 Linux minutes (the Actions budget ran out on 2026-09-26)                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                         | `28788a3`              |
| 14     | Long pointer names stay off the links: a badge naming several pointers wraps onto two lines past 13 characters, a drawing keeps only the side room its badges use, and a badge may also sit below and beside its node or take the least bad spot. Long-name code traces: 950 badges on a link and 163 outside of 14,716, now 87; problem examples: 252 clashes, now 0                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                        | `5e2a644`, `0a5df62`   |
| 15     | A second coding problem for five patterns and a first real backtracking one, 29 in all: Jump Game and Subsets, which their visualizers now link to, Minimum Size Subarray Sum, Rotting Oranges, Coin Change and Redundant Connection, each right after its pattern's problems, except Jump Game, which sits before the bit manipulation problems as greedy does in the curriculum. Subsets accepts any order inside and between subsets (new `unordered-nested` check). Each has a brute-force check, a CPython reference and a performance case its slower approaches cannot finish: naive JavaScript takes 5.2 s to over 30 s, and in the browser times out on that one test (2 s limit) while the references pass in all three languages                                                                                                                                                  | `b758b14`              |
| 16     | A second coding problem for all eight one-problem patterns, 37 in all: Product of Array Except Self, Largest Rectangle in Histogram, Circular Array Loop, Non-overlapping Intervals, Parallel Courses, Path With Minimum Effort, Replace Words and Edit Distance. Each has brute-force, CPython, hidden wrong-approach and measured performance checks. The code list follows curriculum order, moving Subarrays Summing to K, Merge Intervals, heap and DP problems and Course Schedule; that also changes the Learn page's next-problem suggestion. The grid and graph-input move left all 87 original suites byte-identical over three seeds before new cases were added. LCS uses a 1,000-letter limit and Edit Distance supports 500; the Python runner raises its recursion limit and explains cached-recursion crashes. Performance results summarize long strings and grids by size. | (this change)          |
| 17     | Production requires Postgres; missing configuration serves liveness and 503. Idle disconnects recover with scrubbed warnings. Database connect and query waits are bounded at 4 and 3 seconds; a local 500-event push passed. Learn keeps its retry alert and focus stable, with 20 seconds for large progress pulls. Local browser tests use memory without a database, while Docker probes liveness.                                                                                                                                                                                                                                                                                                                                                                                                                                                                                       | working tree           |
| 18     | Atomic deletion and guest merge retire learner IDs, so delayed AI replies cannot restore erased data. Session families revoke access JWTs on logout and deletion across instances. Erased device IDs receive a coded 410 and start fresh without reuploading old progress; merged IDs reload shared storage without clearing data. The reviewer replayed a 1.2-million-token migration in 3.0 s with exact backfill and a 615 ms maximum writer wait. Two-instance races, restart checks and private-route revocation passed. A clean signed progress read changed from 5,796 to 5,668 req/s (2.2% lower), p95 37 to 38 ms; write runs varied.                                                                                                                                                                                                                                               | `19582e3`              |
| 19     | API error reporting retains static operations, safe categories/codes and generated request IDs; SQL, parameters, causes, learner IDs and provider payloads stay out of request, stream, cleanup and startup logs. Sentry rebuilds explicit reports and outbound envelopes from an allowlist. Real Postgres and SDK serialization privacy probes pass. Simplify reused a test helper and removed three unused SDK clients from correlation tests. Full verification: 1,346 tests; browser suite: 223 passed, 7 platform-specific skips; browser audit: 140 states clean in both themes on desktop and phone; After simplify, both full suites and all 140 audit states passed again, and all 24 baseline comparisons were pixel-identical.                                                                                                                                                    | `0801083` plus cleanup |

The iteration 18 browser replay found that Chromium cached a `410 learner_erased` response by URL and replayed it after a
fresh learner ID was stored. The follow-up sets `no-store` for learner-specific API responses and app requests,
and checks that a fresh event survives another reload.

## Production readiness backlog

The local audit of `4beccbd` used an isolated Postgres fixture with 25,000 learners and 3.18 million events. Its 200-client runs found no ordinary-route errors, but failure probes found the risks below. Work through the remaining iterations in order before a wider release.

| Iteration | Status                    | Work                                                                                                                 |
| --------- | ------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| 1         | Done in 17                | Require Postgres in production, refuse traffic without its URL, and recover after an idle connection drops.          |
| 2         | Done in 17                | Bound database connect and query waits, return 503 for dependent routes, and let learners retry timed-out calls.     |
| 3         | Done in 18                | Make account deletion atomic against in-flight interviews and revoke old access tokens across instances.             |
| 4         | API done in 19; client P0 | Keep learner text, IDs and tokens out of database error logs and Sentry envelopes.                                   |
| 5         | P0, P1                    | Reserve paid AI spend before calls and bind guest trials to a robust identity; avoid blocking a class behind one IP. |
| 6         | P1                        | Gate hand deploys on CI, rehearse additive migrations and restore, and roll back failed postflights.                 |
| 7         | P1, P2                    | Retain clock-skewed progress until accepted and split offline batches below the body limit.                          |
| 8         | P1                        | Sync active devices on reconnect and visibility; save interview scorecards and their progress events atomically.     |
| 9         | P1                        | Bound whole AI streams and scoring, and cancel upstream work when clients disconnect.                                |
| 10        | P1                        | Alert on grouped slow-database and AI failures without logging every success or private data.                        |
| 11        | P1                        | Add cursor-based progress sync and a bounded local checkpoint instead of replaying full history on every visit.      |
| 12        | P1, P2                    | Aggregate cohort metrics without a global event sort; paginate feedback and expire old refresh tokens.               |
| 13        | P2                        | Cache stable public reads without counter writes and measure pooled connections across many warm instances.          |
| 14        | P2                        | Version and compress Pyodide, preload routes after idle or likely use, and cache safe startup responses.             |
| 15        | P2, P3                    | Export all account data, mark private reads `no-store`, and prompt stale tabs to reload safely.                      |

## Open follow-ups

- This Codex loop targets `feature/improvements-codex` by owner instruction and keeps verified commits local until publishing is requested again. Its priority is production readiness for thousands of learners, followed by deeper, reviewed algorithms and system-design lessons and practice. Wider-release claims require measured workload evidence.
- The web/native Sentry path still passes arbitrary exception messages and console breadcrumbs through SDK defaults. Add a client transport allowlist before enabling its reporting for a wider release. The API now uses explicit sanitized reports only, so automatic unhandled-process Sentry capture is disabled.

Known issues and deferred work, most valuable first.

- The 20-second progress pull budget is temporary: the audit's 4,777-event response was about 850 kB and took about 9
  seconds on 3G. Iteration 11 should transfer only new events, then the client deadline can shrink.
- Admin metrics still load and sort every event. The audit's 3.18-million-event report took 14.45 seconds, beyond the
  current 3-second query limit; iteration 12 needs SQL aggregates before that report can serve a cohort of this size.
- A client query timeout ends the API wait but may leave a write running in Postgres. Progress event IDs make its retry
  idempotent; other write paths need an explicit outcome or idempotency plan before automatic retries are added.
- Session families now make access tokens revocable. Iteration 12 should prune expired refresh tokens and their families
  after the last possible access token and refresh reuse window.
- Before promoting iteration 18, enable Vercel Standard Deployment Protection and verify a past generated deployment URL
  rejects unauthenticated requests. Old URLs otherwise bypass access-token revocation, and a pre-18 rollback can erase
  without a tombstone.
- Remove migration `0007`'s refresh-token compatibility triggers and function in a later contract release after pre-18
  instances and rollback candidates are inaccessible.
- The signed progress read was 2.2% slower in the clean local comparison (p95 37 to 38 ms); write runs varied under
  autovacuum. Repeat both at audit-sized data and with pooled production-style connections before wider rollout.
- Deleting during an AI reply discards the result, but the provider call can keep running and stream buffered text. Add
  upstream cancellation on deletion alongside iteration 9's stream and disconnect work.
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
- At 320 px, in both themes, content scrolled under the toolbar shows faintly through it behind the title (the Predict mode
  switch reads through on an answered Subsets checkpoint); the same on `main`.
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
- Tree badges with long pointer names still cross a link where neighbouring badges crowd a lopsided tree: 87 of 14,716 in
  the long-name code traces (`current_node` and `previous_node` in random trees of 7 to 46 nodes); the problem examples
  draw 0. A badge naming several pointers wraps past 13 characters even where one line would fit (`treeRootNode, node`
  above a root). The side room comes from laying out every frame once per trace: 0.2 to 0.3 ms for the problem examples,
  20 to 37 ms for a 63-node tree over 448 frames. Layout per frame in real traces stays within about 10% of `main`;
  synthetic trees with every node badged `current_node, previous_node` are 4.7 to 5.4x slower (255 nodes: 68 ms), from the
  second round of placement.
- A cloud run of this loop cannot finish a release: its container could not reach the production URL (egress proxy), its
  Node is 22.22.2 (the Angular CLI needs 24, per `.nvmrc`) and its Chromium is 141 (pinned 153). Iteration 12 was
  finished and verified from a local session.
- CI minutes: Dependabot rebases re-run full CI and the native builds (macOS included) on every new sha, about 480 of 2,230
  Linux-equivalent minutes from 2026-09-20 to 09-26. `rebase-strategy: disabled` in `.github/dependabot.yml` (rebase with
  `@dependabot rebase` before merging) would stop that; it changes how the owner handles Dependabot, so it is their call.
- CI minutes: each of the four end-to-end shards builds the app and bills 3 minutes (12 of CI's 19). Two shards would bill
  about 8 for about 70 s more wall time; try it on a branch.
- A deploy by hand does not require a passing CI run of the commit, so `docs/DEPLOYMENT.md`'s "nothing reaches production
  without CI" holds only for `main`. A first step in `deploy.yml` that fails without one would close that.
- CI: the four end-to-end shards are uneven (118, 136, 175 and 185 s after iteration 11; CI 191 s wall, was 159 to 169 s).
  Playwright 1.63 splits by test count, not duration. Record per-test durations (`--reporter=json`, 336 s over 222 tests
  locally) and feed each shard a balanced `--test-list`.
- A worktree whose `node_modules` is a symlink to the main checkout builds the app and API against the main checkout's
  `libs/engine/dist` (`@grasp/engine` resolves through that checkout's workspace link), so new engine content is missing
  from the build and the browser tests. Iteration 15 gave its worktree a `node_modules` of links with its own `@grasp` ones.
- On a failed test of a problem compared in any order (Two Sum, Top K Frequent, Subsets), Expected and Output list their
  items in different orders, so a missing Subsets subset means scanning two differently ordered lists. Sorting both the
  same way for display would line the mismatch up.
- `graphs.ts` still holds the two tree problems, which can move to `problems/trees.ts` with the next tree problem.
- Parallel Courses keeps the longest prerequisite path at 37 so memoized recursive DFS works in browser JavaScript and
  Python; WebKit's Python can crash near 40 levels with `@cache` plus a generator. Its performance case times out naive
  DFS and per-course relation scans, but prepared semester rescans and Bellman-Ford-style relaxation rounds pass within
  2 s. Making those variants time out would need a graph too large for the app's memory budget.
- The Python prelude now allows 10,000 recursive frames, and its crash message explains `functools` cache stack limits.
  Coin Change still needs a dict memo or bottom-up code in Pyodide when cached recursion gets deep. House Robber's
  100,000-house performance case is too deep for a top-down recursive solution in browser JavaScript or Python; set a
  consistent policy for large DP problems if these alternatives should pass.
- Code traces can place scalar variables named `right`, `end` or `i` over unrelated arrays as index markers. Track actual
  index use before drawing these markers, including learner code.
- Small refactors: move `DEVICE_PLATFORM` into `platform.ts`; confirm the notifications plugin proxy is cleaned up on destroy.

## Content ideas

- More Design Lab missions (there are 5), each with three spaced revisits.
- More review cards for patterns with the fewest drill cards and clozes.
- Consider a secondary greedy tag for Non-overlapping Intervals if its extra greedy review cards are desirable.

## Rules for picking

- Prefer what a learner notices: correctness bugs, then accessibility and layout problems, then speed, then new content,
  then internal cleanups.
- One cohesive improvement per run. Measure before and after; never ship a change that makes something else slower or
  worse without saying so here.
