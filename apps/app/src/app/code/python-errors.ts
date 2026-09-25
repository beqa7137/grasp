import type { RunnerError } from './protocol';

/** Keeps only the traceback frames from the learner's file, plus the exception itself. */
export function pythonError(error: unknown): RunnerError {
  const lines = (error instanceof Error ? error.message : String(error)).trimEnd().split('\n');
  const first = lines.findIndex((l) => l.includes('File "solution.py"'));
  const kept: string[] = first === -1 ? [] : ['Traceback (most recent call last):'];
  let skipping = false;
  for (const line of first === -1 ? [] : lines.slice(first)) {
    if (/^ {2}File "/.test(line)) skipping = !line.includes('File "solution.py"');
    else if (!line.startsWith('    ')) skipping = false;
    if (!skipping) kept.push(line);
  }
  if (first === -1) kept.push(lines[lines.length - 1]);
  const at = [...lines.join('\n').matchAll(/File "solution\.py", line (\d+)/g)].pop();
  return { message: kept.join('\n'), location: at ? { line: Number(at[1]) } : undefined };
}

const DUMP_START = 'Stack (most recent call first):';

/** Pyodide marks the error that killed its interpreter; every later call fails too, so the worker has to be replaced. */
export function isFatal(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) return false;
  return (
    (error as { pyodide_fatal_error?: unknown }).pyodide_fatal_error === true ||
    /already fatally failed/.test(String((error as Error).message))
  );
}

/**
 * Explains a crash of the interpreter itself. Pyodide prints the Python stack of the crash to the output, which is dropped
 * from the learner's log after its innermost line in their file is kept.
 */
export function pythonCrash(error: unknown, logs: string[]): { error: RunnerError; logs: string[] } {
  const dump = logs.findIndex((line) => line.trim() === DUMP_START);
  const stack = dump === -1 ? [] : logs.slice(dump);
  const at = stack.map((line) => /File "solution\.py", line (\d+)/.exec(line)).find(Boolean);
  const cause = error instanceof Error ? error.message : String(error);
  return {
    error: {
      message: `Python crashed (${cause}). Very deep recursion or a very long chain of linked objects can do this. Python restarts on your next run.`,
      location: at ? { line: Number(at[1]) } : undefined,
    },
    logs: dump === -1 ? logs : logs.slice(0, dump),
  };
}
