import { Injectable, inject, signal } from '@angular/core';
import { TIME_LIMIT_MS, outputsMatch, type CodingProblem, type Language, type TestCase } from '@grasp/engine';
import { RuntimeConfigService } from '../core/runtime-config.service';
import type { TraceOutcome } from './execute-js';
import type { RunnerError, WorkerMessage, WorkerRequest } from './protocol';

export type TestStatus = 'passed' | 'failed' | 'error' | 'timeout' | 'skipped';

export interface TestReport {
  index: number;
  kind: TestCase['kind'];
  args: unknown[];
  expected: unknown;
  status: TestStatus;
  output?: unknown;
  error?: RunnerError;
  ms?: number;
  logs: string[];
}

export interface RunReport {
  compileError?: RunnerError;
  tests: TestReport[];
  passed: number;
  total: number;
}

export type TraceReport = ({ ok: true } & TraceOutcome) | { ok: false; error: RunnerError };

/** Time allowed to load and define the code before the first test starts (Python includes the interpreter). */
const SETUP_LIMIT_MS: Record<Language, number> = { javascript: 3_000, typescript: 3_000, python: 60_000 };
const TRACE_LIMIT_MS = 4_000;
export const MAX_TRACE_STEPS = 2_000;

/** Code pasted from web pages often carries non-breaking spaces, which Python rejects. */
const normalize = (code: string) => code.replace(/\u00a0/g, ' ');

/**
 * Runs learner code in a Web Worker. A worker that exceeds its time limit is terminated, which is the
 * only reliable way to stop an infinite loop. The Python worker is kept warm between runs because
 * loading the interpreter takes a few seconds.
 */
@Injectable({ providedIn: 'root' })
export class RunnerService {
  private readonly runtime = inject(RuntimeConfigService);
  private python: Worker | null = null;
  private active: Worker | null = null;

  /** Progress text while the Python interpreter loads. */
  readonly loading = signal<string | null>(null);

  run(
    problem: CodingProblem,
    language: Language,
    code: string,
    entry: string,
    cases: TestCase[],
    onUpdate?: (report: RunReport) => void,
  ): Promise<RunReport> {
    this.cancel();
    const worker = language === 'python' ? (this.python ??= this.spawn()) : this.spawn();
    this.active = worker;
    const report: RunReport = {
      tests: cases.map((c, index) => ({ index, kind: c.kind, args: c.args, expected: c.expected, status: 'skipped', logs: [] })),
      passed: 0,
      total: cases.length,
    };

    return new Promise((resolve) => {
      let timer: ReturnType<typeof setTimeout> | undefined;
      const listeners = new AbortController();
      const arm = (ms: number, onTimeout: () => void) => {
        clearTimeout(timer);
        timer = setTimeout(onTimeout, ms);
      };
      const finish = (keepWorker: boolean) => {
        clearTimeout(timer);
        listeners.abort();
        this.loading.set(null);
        if (!keepWorker) this.discard(worker);
        if (this.active === worker) this.active = null;
        report.passed = report.tests.filter((t) => t.status === 'passed').length;
        resolve(report);
      };
      const timeout = (message: string, index?: number) => {
        if (index !== undefined) report.tests[index] = { ...report.tests[index], status: 'timeout', error: { message } };
        else report.compileError = { message };
        finish(false);
      };

      arm(SETUP_LIMIT_MS[language], () => timeout('Setup took too long. Is there an infinite loop outside your function?'));
      const onMessage = ({ data }: MessageEvent<WorkerMessage>) => {
        switch (data.kind) {
          case 'loading':
            this.loading.set(data.message);
            break;
          case 'compile-error':
            report.compileError = data.error;
            finish(language === 'python');
            break;
          case 'test-start':
            this.loading.set(null);
            arm(TIME_LIMIT_MS[language], () =>
              timeout(
                `Time limit exceeded (${TIME_LIMIT_MS[language] / 1000} s). Look for an infinite loop or a slower-than-needed approach.`,
                data.index,
              ),
            );
            break;
          case 'test-result': {
            const test = report.tests[data.index];
            report.tests[data.index] = data.ok
              ? {
                  ...test,
                  status: outputsMatch(test.expected, data.output, problem.compare) ? 'passed' : 'failed',
                  output: data.output,
                  ms: data.ms,
                  logs: data.logs,
                }
              : { ...test, status: 'error', error: data.error, ms: data.ms, logs: data.logs };
            report.passed = report.tests.filter((t) => t.status === 'passed').length;
            onUpdate?.({ ...report, tests: [...report.tests] });
            break;
          }
          case 'done':
            finish(language === 'python');
            break;
        }
      };
      const onError = (e: ErrorEvent) => {
        e.preventDefault();
        report.compileError = { message: e.message || 'The code runner crashed.' };
        finish(false);
      };
      worker.addEventListener('message', onMessage, { signal: listeners.signal });
      worker.addEventListener('error', onError, { signal: listeners.signal });
      const request: WorkerRequest & { pyodideUrl?: string } = {
        kind: 'run',
        language,
        code: normalize(code),
        entry,
        tests: cases.map((c) => c.args),
        pyodideUrl: this.runtime.pyodideUrl(),
      };
      worker.postMessage(request);
    });
  }

  trace(language: Exclude<Language, 'python'>, code: string, entry: string, args: unknown[]): Promise<TraceReport> {
    this.cancel();
    const worker = this.spawn();
    this.active = worker;
    return new Promise((resolve) => {
      const finish = (result: TraceReport) => {
        clearTimeout(timer);
        this.discard(worker);
        if (this.active === worker) this.active = null;
        resolve(result);
      };
      const timer = setTimeout(
        () => finish({ ok: false, error: { message: 'Tracing took too long. Look for an infinite loop.' } }),
        TRACE_LIMIT_MS,
      );
      worker.addEventListener('message', ({ data }: MessageEvent<WorkerMessage>) => {
        if (data.kind === 'trace-result') finish({ ok: true, ...data });
        else if (data.kind === 'compile-error') finish({ ok: false, error: data.error });
      });
      worker.postMessage({
        kind: 'trace',
        language,
        code: normalize(code),
        entry,
        args,
        maxSteps: MAX_TRACE_STEPS,
      } satisfies WorkerRequest);
    });
  }

  /** Stops whatever is running. A warm Python worker survives only if it is idle. */
  cancel() {
    if (this.active) this.discard(this.active);
    this.active = null;
    this.loading.set(null);
  }

  private spawn(): Worker {
    return new Worker(new URL('./runner.worker', import.meta.url), { type: 'module' });
  }

  private discard(worker: Worker) {
    worker.terminate();
    if (worker === this.python) this.python = null;
  }
}
