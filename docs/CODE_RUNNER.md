# Coding practice and the code runner

Learners solve problems in Python, JavaScript or TypeScript entirely on their device. Nothing they write is sent to the server except the pass count, which is recorded as a `code.submitted` event, and code they choose to share with the interviewer.

## Pieces

| Piece                                          | Where                                                                                              |
| ---------------------------------------------- | -------------------------------------------------------------------------------------------------- |
| Problem catalog (ids, titles, order)           | `libs/engine/src/coding/catalog.ts`                                                                |
| Problem definitions                            | `libs/engine/src/coding/problems/` (one file per curriculum track, indexed in `problems/index.ts`) |
| Suites, comparison, Python prelude and harness | `libs/engine/src/coding/suite.ts`                                                                  |
| Tree inputs                                    | `libs/engine/src/coding/tree.ts`                                                                   |
| Worker (runs code, traces JS/TS)               | `apps/app/src/app/code/runner.worker.ts`                                                           |
| JS/TS compile, run and trace                   | `apps/app/src/app/code/execute-js.ts`                                                              |
| Trace recording (steps and calls)              | `apps/app/src/app/code/trace-recorder.ts`                                                          |
| Statement-level instrumentation                | `apps/app/src/app/code/instrument.ts` (acorn + astring)                                            |
| Trace → visualizer frames                      | `apps/app/src/app/code/trace-frames.ts`, with `tree-frames.ts` for trees                           |
| Grids, call stack and notes of a trace         | `apps/app/src/app/code/grid-frames.ts`, `call-stack.ts`, `trace-notes.ts`                          |
| Time limits and worker lifecycle               | `apps/app/src/app/code/runner.service.ts`                                                          |
| Editor                                         | `apps/app/src/app/code/code-editor.component.ts` (CodeMirror 6)                                    |
| Workspace UI                                   | `apps/app/src/app/pages/code/`                                                                     |

A problem is split in two. The catalog holds what lists, links, route titles and progress need: the id, title, difficulty, patterns and visualizer, in the order the code list shows them. See [Adding content](../README.md#adding-content) for what a catalog may import. The definition (statement, parameters, cases, generators and reference `solve`) loads with the workspace page. `problems/index.ts` maps every catalog id to its definition, so a missing or misspelled id fails the type check.

## Test suites

`buildSuite(problem, { seed })` returns, in order:

- the examples
- hand-picked edge cases
- 20 seeded random cases
- one **performance case**: a large input sized so that the intended complexity finishes in milliseconds while a quadratic or exponential approach cannot finish within the time limit

Expected values always come from the problem's reference `solve`, so the tests and the reference can't drift apart. The engine tests prove each reference against a brute-force solution on every small case. They also run a CPython reference solution through the same Python prelude and harness the browser uses and check that its output matches. For the problems listed in `SLOWER` (`coding.spec.ts`), the engine tests also count the steps a named slower approach needs on the performance case, which proves without timing anything that it cannot finish within the limit.

Answers are compared exactly, as unordered lists where the problem allows any order (`compare: 'unordered'`), or as lists of lists where neither level's order matters (`compare: 'unordered-nested'`, for Subsets).

## Tree inputs

A `tree` parameter travels as LeetCode's level order: `[1,2,null,3]` is 1 with left child 2, whose left child is 3. Missing children are `null`, the children of a missing node are not listed, and trailing nulls are trimmed. It is flat JSON, so the argument copies, `postMessage`, the Python transport and test previews handle it unchanged, at any depth.

The entry function receives linked `TreeNode`s (`val`, `left`, `right`) built right before each call: by `entryArgs` for the reference `solve` and for JS/TS in the worker, and by the Python harness for Python.

Python submissions run after a small prelude that defines `TreeNode` and `Optional`. It has to come first: before Python 3.14, an annotation such as `Optional[TreeNode]` is evaluated when the function is defined. Trees are built from the class the prelude captured, so a learner's own `TreeNode` cannot change how inputs are built. The prelude runs as its own file, so the learner's line numbers and traceback trimming are unchanged.

Trees are inputs only: no problem returns one, and the `returns` type excludes it.

## Execution

- **JavaScript/TypeScript** runs in a fresh module Web Worker for every run.
  - TypeScript is stripped with sucrase, which keeps line numbers.
  - Syntax errors come from acorn, with line and column.
  - The code is loaded with `new Function`, with `fetch`, `postMessage`, `importScripts` and similar globals shadowed.
  - Each test receives a deep copy of its arguments.
- **Python** runs on Pyodide (CPython compiled to WebAssembly) in a worker that stays warm between runs, because the interpreter takes about 2 s to load.
  - Each run gets a fresh globals dictionary.
  - Tracebacks are trimmed to the learner's `solution.py` frames.
  - If learner code crashes the interpreter itself (it runs out of stack while freeing a very deep structure), the worker reports the crash on the running test and is replaced; the next run starts a fresh interpreter. Each run ends with a garbage collection, so the crash belongs to the run that caused it.
  - The runtime ships in the web build under `/pyodide/` (copied from the `pyodide` npm package by `scripts/copy-pyodide.mjs`).
  - Native builds don't bundle it; they fetch it from the API host on first use.
- **Time limits** are 2 s per test for JS/TS and 8 s for Python, plus a setup limit for code that loops at load time.
  - The main thread arms a timer for each test.
  - When a timer fires, the worker is terminated, which is the only reliable way to stop an infinite loop.
  - The Python worker is recreated on the next run.

## Security model

The page keeps a strict Content-Security-Policy: `script-src 'self'`, with no `eval`. The server gives the runner worker script (`/worker-*.js`) its own policy that adds `'unsafe-eval'` and `'wasm-unsafe-eval'`. A dedicated worker takes its CSP from its own response, so evaluating code is possible only inside the worker. The worker has no DOM access and runs code the learner typed into their own browser.

Pyodide files are sent with `Cross-Origin-Resource-Policy: cross-origin` and the normal CORS headers, so native apps (`capacitor://localhost`, `https://localhost`) can load them from the API origin.

## Tracing learner code

`instrument()` parses the JavaScript and, before every statement inside a function, inserts a call that reports the source line and a getter for each variable in scope, following block scoping. Getters for variables still in their temporal dead zone throw and are skipped, which keeps the rewrite simple. It also reports entering and leaving every function (leaving in a `finally`, so a return or a throw counts), and pausing at `yield` and `await`. From these reports the recorder keeps the call stack, so a generator or async function that paused is never left on top, and records each call once, with its caller.

The worker records up to 2,000 steps, each with a JSON-safe snapshot of the variables and the call it runs in. `toFrames()` turns those snapshots into the same `Frame` objects the built-in visualizers use:

- the first parameter (an array, a string, or a list of pairs such as edges) is drawn with index pointers; values longer than three characters, such as pairs, widen their cells and scroll sideways, which only the trace player opts in to (`wideCells`), since the visualizer pages have no sideways scroll
- `lo`/`hi`-style pairs become a window
- stacks, queues, sets and maps get their own views
- a grid (a `char[][]` parameter, under whatever name the learner gives it, or a 2D value whose name has a grid word, such as `grid`, `dpTable` or `visitedCells`, unless it ends in a list word such as `seenEdges`) is drawn as a table, with the cell a `(r, c)` pair points at and the cells the code changed
- a tree parameter is drawn as a tree, with the node each variable points at, the nodes on the call stack, the nodes waiting in a list, and the nodes whose call returned or that a loop visited
- the call stack is shown whenever the code calls a function, at most six calls deep
- every step's note names the call it enters or comes back to (from a callee, or a generator resuming), and what changed, down to the cells an assignment wrote

The editor highlights the executing line as the learner scrubs.

Tracing works for JS/TS only. Python can be run and submitted but not traced.

## Progress

A full submission records `code.submitted` with `{ problemId, language, passed, total }`. The reducer tracks attempts, best score and first solve. A failed attempt before the first solve boosts that pattern's template-recall (cloze) cards, so the missing piece comes back in review.

## Interview integration

In coding interviews the composer has a code drawer. Code that changed since the interviewer last saw it is attached to the next message. It is stored on the transcript and shown to both the interviewer and the scorer as a `[CANDIDATE CODE: <language>]` block.
