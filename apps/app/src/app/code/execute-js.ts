import { parse } from 'acorn';
import { transform } from 'sucrase';
import { entryArgs, type Language, type ParamType } from '@grasp/engine';
import { TRACE_HOOK, instrument } from './instrument';
import type { RunnerError } from './protocol';
import { NodeIds, snapshot, type Snap, type TraceStep } from './snapshot';

const MAX_LOG_LINES = 100;
const MAX_LOG_CHARS = 2_000;

/** Globals shadowed inside user code so it cannot reach the network or talk to the page. */
const SHADOWED = ['fetch', 'XMLHttpRequest', 'WebSocket', 'EventSource', 'importScripts', 'postMessage', 'close', 'indexedDB', 'caches'];

export class CompileError extends Error {
  constructor(readonly error: RunnerError) {
    super(error.message);
  }
}

export interface LogSink {
  lines: string[];
}

function formatLogArg(value: unknown): string {
  if (typeof value === 'string') return value;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    return String(value);
  }
}

function fakeConsole(sink: LogSink) {
  const write = (...args: unknown[]) => {
    if (sink.lines.length >= MAX_LOG_LINES) return;
    const line = args.map(formatLogArg).join(' ');
    sink.lines.push(line.length > MAX_LOG_CHARS ? `${line.slice(0, MAX_LOG_CHARS)}…` : line);
  };
  return { log: write, info: write, warn: write, error: write, debug: write, table: write };
}

/** Line of the function body's first line inside `new Function` source, which differs between engines. */
let bodyLineOffset: number | null = null;
function lineOffset(): number {
  if (bodyLineOffset !== null) return bodyLineOffset;
  try {
    new Function('throw new Error("probe")')();
  } catch (e) {
    bodyLineOffset = (locate(e, 0)?.line ?? 3) - 1;
  }
  return bodyLineOffset ?? 2;
}

function locate(error: unknown, offset: number): { line: number; column?: number } | undefined {
  const stack = error instanceof Error ? (error.stack ?? '') : '';
  const match = /(?:<anonymous>|Function|eval):(\d+):(\d+)/.exec(stack);
  if (!match) return undefined;
  const line = Number(match[1]) - offset;
  return line > 0 ? { line, column: Number(match[2]) } : undefined;
}

export function describeError(error: unknown, offset = lineOffset()): RunnerError {
  if (error instanceof Error) return { message: `${error.name}: ${error.message}`, location: locate(error, offset) };
  return { message: `Uncaught ${formatLogArg(error)}` };
}

/** TypeScript is stripped with sucrase, which keeps line numbers so errors and traces point at the right line. */
export function toJavaScript(code: string, language: Exclude<Language, 'python'>): string {
  let js = code;
  if (language === 'typescript') {
    try {
      js = transform(code, { transforms: ['typescript'], disableESTransforms: true }).code;
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      const at = /\((\d+):(\d+)\)/.exec(message);
      throw new CompileError({
        message: `SyntaxError: ${message.replace(/\s*\(\d+:\d+\)$/, '')}`,
        location: at ? { line: Number(at[1]), column: Number(at[2]) } : undefined,
      });
    }
  }
  try {
    parse(js, { ecmaVersion: 'latest', sourceType: 'script' });
  } catch (e) {
    const loc = (e as { loc?: { line: number; column: number } }).loc;
    throw new CompileError({
      message: `SyntaxError: ${(e as Error).message.replace(/\s*\(\d+:\d+\)$/, '')}`,
      location: loc ? { line: loc.line, column: loc.column + 1 } : undefined,
    });
  }
  return js;
}

function load(js: string, entry: string, sink: LogSink, extra: Record<string, unknown> = {}): (...args: unknown[]) => unknown {
  const names = ['console', ...SHADOWED, ...Object.keys(extra)];
  const factory = new Function(...names, `${js}\n;return typeof ${entry} === "function" ? ${entry} : undefined;`);
  let fn: unknown;
  try {
    fn = factory(fakeConsole(sink), ...SHADOWED.map(() => undefined), ...Object.values(extra));
  } catch (e) {
    throw new CompileError(describeError(e));
  }
  if (typeof fn !== 'function') throw new CompileError({ message: `Define a function named ${entry}.` });
  return fn as (...args: unknown[]) => unknown;
}

/** JSON round trip so results cross the worker boundary and compare like the reference output. */
function plain(value: unknown): unknown {
  if (value === undefined) return undefined;
  return JSON.parse(JSON.stringify(value, (_k, v) => (v instanceof Set ? [...v] : v instanceof Map ? Object.fromEntries(v) : v)) ?? 'null');
}

export type TestOutcome =
  { ok: true; output: unknown; ms: number; logs: string[] } | { ok: false; error: RunnerError; ms: number; logs: string[] };

export function compileJs(code: string, language: Exclude<Language, 'python'>, entry: string, sink: LogSink) {
  return load(toJavaScript(code, language), entry, sink);
}

export function runJsTest(fn: (...args: unknown[]) => unknown, params: readonly ParamType[], args: unknown[], sink: LogSink): TestOutcome {
  sink.lines.length = 0;
  const input = entryArgs(params, args);
  const started = performance.now();
  try {
    const output = plain(fn(...input));
    return { ok: true, output, ms: performance.now() - started, logs: [...sink.lines] };
  } catch (e) {
    return { ok: false, error: describeError(e), ms: performance.now() - started, logs: [...sink.lines] };
  }
}

const TRACE_LIMIT = Symbol('trace-limit');

export interface TraceOutcome {
  steps: TraceStep[];
  returned?: Snap;
  error?: RunnerError;
  truncated: boolean;
  logs: string[];
}

export function traceJs(
  code: string,
  language: Exclude<Language, 'python'>,
  entry: string,
  params: readonly ParamType[],
  args: unknown[],
  maxSteps: number,
): TraceOutcome {
  const steps: TraceStep[] = [];
  const sink: LogSink = { lines: [] };
  const ids = new NodeIds();
  const hook = (line: number, getters: [string, () => unknown][]) => {
    if (steps.length >= maxSteps) throw TRACE_LIMIT;
    const vars: Record<string, Snap> = {};
    for (const [name, get] of getters) {
      try {
        const value = get();
        if (typeof value !== 'function') vars[name] = snapshot(value, ids);
      } catch {
        // Not yet initialized (temporal dead zone) or not in scope on this line.
      }
    }
    steps.push({ line, vars });
  };
  const js = toJavaScript(code, language);
  const fn = load(instrument(js), entry, sink, { [TRACE_HOOK]: hook });
  try {
    const returned = fn(...entryArgs(params, args));
    return { steps, returned: snapshot(returned, ids), truncated: false, logs: sink.lines };
  } catch (e) {
    if (e === TRACE_LIMIT) return { steps, truncated: true, logs: sink.lines };
    const error = describeError(e);
    return {
      steps,
      error: { message: error.message, location: steps.length ? { line: steps[steps.length - 1].line } : undefined },
      truncated: false,
      logs: sink.lines,
    };
  }
}
