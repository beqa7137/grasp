# Coding practice and the code runner

Learners solve problems in Python, JavaScript or TypeScript entirely on their device. Nothing they write is sent to the server except the pass count, which is recorded as a `code.submitted` event, and code they choose to share with the interviewer.

## Pieces

| Piece                                     | Where                                                           |
| ----------------------------------------- | --------------------------------------------------------------- |
| Problem bank, suites, comparison, harness | `libs/engine/src/coding/`                                       |
| Worker (runs code, traces JS/TS)          | `apps/app/src/app/code/runner.worker.ts`                        |
| JS/TS compile, run and trace              | `apps/app/src/app/code/execute-js.ts`                           |
| Statement-level instrumentation           | `apps/app/src/app/code/instrument.ts` (acorn + astring)         |
| Trace → visualizer frames                 | `apps/app/src/app/code/trace-frames.ts`                         |
| Time limits and worker lifecycle          | `apps/app/src/app/code/runner.service.ts`                       |
| Editor                                    | `apps/app/src/app/code/code-editor.component.ts` (CodeMirror 6) |
| Workspace UI                              | `apps/app/src/app/pages/code/`                                  |

## Test suites

`buildSuite(problem, { seed })` returns, in order:

- the examples
- hand-picked edge cases
- 20 seeded random cases
- one **performance case**: a large input sized so that the intended complexity finishes in milliseconds while a quadratic or exponential approach cannot finish within the time limit

Expected values always come from the problem's reference `solve`, so the tests and the reference can't drift apart. The engine tests prove each reference against a brute-force solution on every small case. They also run a CPython reference solution through the same Python harness the browser uses and check that its output matches.

Answers are compared exactly, or as unordered lists where the problem allows any order (`compare: 'unordered'`).

## Execution

- **JavaScript/TypeScript** runs in a fresh module Web Worker for every run.
  - TypeScript is stripped with sucrase, which keeps line numbers.
  - Syntax errors come from acorn, with line and column.
  - The code is loaded with `new Function`, with `fetch`, `postMessage`, `importScripts` and similar globals shadowed.
  - Each test receives a deep copy of its arguments.
- **Python** runs on Pyodide (CPython compiled to WebAssembly) in a worker that stays warm between runs, because the interpreter takes about 2 s to load.
  - Each run gets a fresh globals dictionary.
  - Tracebacks are trimmed to the learner's `solution.py` frames.
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

`instrument()` parses the JavaScript and, before every statement inside a function, inserts a call that reports the source line and a getter for each variable in scope, following block scoping. Getters for variables still in their temporal dead zone throw and are skipped, which keeps the rewrite simple.

The worker records up to 2,000 steps, each with a JSON-safe snapshot of the variables. `toFrames()` turns those snapshots into the same `Frame` objects the built-in visualizers use:

- the first parameter (array or string) is drawn with index pointers
- `lo`/`hi`-style pairs become a window
- stacks, queues, sets and maps get their own views
- 0/1 grids are drawn with the current cell
- every step's note lists what changed

The editor highlights the executing line as the learner scrubs.

Tracing works for JS/TS only. Python can be run and submitted but not traced.

## Progress

A full submission records `code.submitted` with `{ problemId, language, passed, total }`. The reducer tracks attempts, best score and first solve. A failed attempt before the first solve boosts that pattern's template-recall (cloze) cards, so the missing piece comes back in review.

## Interview integration

In coding interviews the composer has a code drawer. Code that changed since the interviewer last saw it is attached to the next message. It is stored on the transcript and shown to both the interviewer and the scorer as a `[CANDIDATE CODE: <language>]` block.
