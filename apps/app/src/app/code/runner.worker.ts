/// <reference lib="webworker" />
import { PYTHON_PRELUDE, pythonHarness } from '@grasp/engine';
import type { PyodideAPI } from 'pyodide';
import { CompileError, compileJs, runJsTest, traceJs, type LogSink } from './execute-js';
import type { WorkerMessage, WorkerRequest } from './protocol';
import { isFatal, pythonCrash, pythonError } from './python-errors';

const post = (message: WorkerMessage) => postMessage(message);

let pyodide: Promise<PyodideAPI> | null = null;

function loadPython(indexURL: string): Promise<PyodideAPI> {
  pyodide ??= (async () => {
    post({ kind: 'loading', message: 'Loading Python (first run only)…' });
    const { loadPyodide } = (await import(/* @vite-ignore */ `${indexURL}pyodide.mjs`)) as typeof import('pyodide');
    return loadPyodide({ indexURL });
  })();
  return pyodide;
}

/** Runs the tests; a compile error ends the run early, and an error that killed the interpreter is thrown on. */
function runSolution(py: PyodideAPI, request: Extract<WorkerRequest, { kind: 'run' }>, logs: string[]) {
  const namespace = py.globals['get']('dict')();
  try {
    try {
      py.runPython(PYTHON_PRELUDE, { globals: namespace, filename: 'prelude.py' });
      py.runPython(request.code, { globals: namespace, filename: 'solution.py' });
      if (!namespace.has(request.entry)) {
        post({ kind: 'compile-error', error: { message: `Define a function named ${request.entry}.` } });
        return;
      }
      py.runPython(pythonHarness(request.entry, request.params), { globals: namespace, filename: 'harness.py' });
    } catch (e) {
      if (isFatal(e)) throw e;
      post({ kind: 'compile-error', error: pythonError(e) });
      return;
    }
    const call = namespace.get('__grasp_call');
    try {
      for (const [index, args] of request.tests.entries()) {
        post({ kind: 'test-start', index });
        logs.length = 0;
        const started = performance.now();
        try {
          const output = JSON.parse(call(JSON.stringify(args)) as string);
          post({ kind: 'test-result', index, ok: true, output, ms: performance.now() - started, logs: [...logs] });
        } catch (e) {
          if (isFatal(e)) throw e;
          post({ kind: 'test-result', index, ok: false, error: pythonError(e), ms: performance.now() - started, logs: [...logs] });
        }
      }
    } finally {
      call.destroy();
    }
  } finally {
    namespace.destroy();
  }
}

async function runPython(request: Extract<WorkerRequest, { kind: 'run' }>, indexURL: string) {
  const py = await loadPython(indexURL);
  const logs: string[] = [];
  py.setStdout({ batched: (s) => logs.length < 100 && logs.push(s) });
  py.setStderr({ batched: (s) => logs.length < 100 && logs.push(s) });
  try {
    runSolution(py, request, logs);
    // Frees what the run built now, so a structure too deep to free crashes this run instead of a later one.
    py.runPython('import gc; gc.collect()');
  } catch (e) {
    if (!isFatal(e)) throw e;
    post({ kind: 'crashed', ...pythonCrash(e, logs) });
  }
}

function runJavaScript(request: Extract<WorkerRequest, { kind: 'run' }>) {
  if (request.language === 'python') return;
  const sink: LogSink = { lines: [] };
  let fn;
  try {
    fn = compileJs(request.code, request.language, request.entry, sink);
  } catch (e) {
    post({ kind: 'compile-error', error: e instanceof CompileError ? e.error : { message: String(e) } });
    return;
  }
  for (const [index, args] of request.tests.entries()) {
    post({ kind: 'test-start', index });
    post({ kind: 'test-result', index, ...runJsTest(fn, request.params, args, sink) });
  }
}

addEventListener('message', async ({ data }: MessageEvent<WorkerRequest & { pyodideUrl?: string }>) => {
  try {
    if (data.kind === 'trace') {
      try {
        post({ kind: 'trace-result', ...traceJs(data.code, data.language, data.entry, data.params, data.args, data.maxSteps) });
      } catch (e) {
        post({ kind: 'compile-error', error: e instanceof CompileError ? e.error : { message: String(e) } });
      }
      return;
    }
    if (data.language === 'python') await runPython(data, data.pyodideUrl!);
    else runJavaScript(data);
    post({ kind: 'done' });
  } catch (e) {
    post({ kind: 'compile-error', error: { message: e instanceof Error ? e.message : String(e) } });
  }
});
