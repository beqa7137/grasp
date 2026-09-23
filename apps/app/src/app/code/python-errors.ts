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
