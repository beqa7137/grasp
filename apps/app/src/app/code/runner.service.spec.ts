import { TestBed } from '@angular/core/testing';
import { TIME_LIMIT_MS, entryName, exampleCases, getCodingProblem } from '@grasp/engine';
import type { WorkerMessage, WorkerRequest } from './protocol';
import { RunnerService } from './runner.service';

/** Stands in for the runner worker: each posted run is answered with the messages the test scripts. */
class FakeWorker extends EventTarget {
  static spawned: FakeWorker[] = [];
  static script: (request: WorkerRequest) => WorkerMessage[] = () => [];
  terminated = false;

  constructor() {
    super();
    FakeWorker.spawned.push(this);
  }

  postMessage(request: WorkerRequest) {
    queueMicrotask(() => {
      for (const data of FakeWorker.script(request)) this.dispatchEvent(new MessageEvent('message', { data }));
    });
  }

  terminate() {
    this.terminated = true;
  }
}

describe('RunnerService', () => {
  const problem = getCodingProblem('two-sum')!;
  const cases = exampleCases(problem);
  const entry = entryName(problem, 'python');
  const runPython = (runner: RunnerService) => runner.run(problem, 'python', 'code', entry, cases);
  const loading: WorkerMessage = { kind: 'loading', message: 'Loading Python (first run only)…' };
  const missing = { message: `Define a function named ${entry}.` };
  const passing = (): WorkerMessage[] => [
    ...cases.flatMap((c, index): WorkerMessage[] => [
      { kind: 'test-start', index },
      { kind: 'test-result', index, ok: true, output: c.expected, ms: 1, logs: [] },
    ]),
    { kind: 'done' },
  ];

  beforeEach(() => {
    FakeWorker.spawned = [];
    vi.stubGlobal('Worker', FakeWorker);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it('keeps the Python worker warm between runs', async () => {
    FakeWorker.script = passing;
    const runner = TestBed.inject(RunnerService);
    await runPython(runner);
    await runPython(runner);
    expect(FakeWorker.spawned).toHaveLength(1);
  });

  it('keeps the Python worker after a compile error the interpreter survived', async () => {
    FakeWorker.script = () => [{ kind: 'compile-error', error: missing }, { kind: 'done' }];
    const runner = TestBed.inject(RunnerService);
    expect((await runPython(runner)).compileError).toEqual(missing);

    FakeWorker.script = passing;
    expect((await runPython(runner)).passed).toBe(cases.length);
    expect(FakeWorker.spawned).toHaveLength(1);
    expect(FakeWorker.spawned[0].terminated).toBe(false);
  });

  it('replaces a Python worker that crashed after a compile error, and keeps the compile error', async () => {
    FakeWorker.script = () => [
      { kind: 'compile-error', error: missing },
      { kind: 'crashed', error: { message: 'Python crashed (Maximum call stack size exceeded).' }, logs: [] },
    ];
    const runner = TestBed.inject(RunnerService);
    expect((await runPython(runner)).compileError).toEqual(missing);
    expect(FakeWorker.spawned[0].terminated).toBe(true);

    FakeWorker.script = () => [loading, ...passing()];
    const next = await runPython(runner);
    expect(FakeWorker.spawned).toHaveLength(2);
    expect(next.passed).toBe(cases.length);
  });

  it('replaces a Python worker whose interpreter crashed, and reports the crash on the test it was running', async () => {
    const crash = { message: 'Python crashed (Maximum call stack size exceeded).' };
    FakeWorker.script = () => [
      { kind: 'test-start', index: 0 },
      { kind: 'crashed', error: crash, logs: ['partial'] },
    ];
    const runner = TestBed.inject(RunnerService);
    const report = await runPython(runner);
    expect(report.tests.map((t) => t.status)).toEqual(['error', 'skipped', 'skipped']);
    expect(report.tests[0]).toMatchObject({ error: crash, logs: ['partial'] });
    expect(FakeWorker.spawned[0].terminated).toBe(true);

    FakeWorker.script = () => [loading, ...passing()];
    const shown = vi.spyOn(runner.loading, 'set');
    const next = await runPython(runner);
    expect(FakeWorker.spawned).toHaveLength(2);
    expect(next.passed).toBe(cases.length);
    expect(shown).toHaveBeenCalledWith('Restarting Python…');
  });

  it('reports a crash before any test as an error in the code, and one after every test not at all', async () => {
    const crash = { message: 'Python crashed.', location: { line: 8 } };
    FakeWorker.script = () => [{ kind: 'crashed', error: crash, logs: [] }];
    const runner = TestBed.inject(RunnerService);
    expect((await runPython(runner)).compileError).toEqual(crash);

    FakeWorker.script = () => [...passing().slice(0, -1), { kind: 'crashed', error: crash, logs: [] }];
    const after = await runPython(runner);
    expect(after.passed).toBe(cases.length);
    expect(after.compileError).toBeUndefined();
    expect(FakeWorker.spawned.every((w) => w.terminated)).toBe(true);
  });

  it('restarts Python after a test that timed out', async () => {
    vi.useFakeTimers();
    FakeWorker.script = () => [{ kind: 'test-start', index: 0 }];
    const runner = TestBed.inject(RunnerService);
    const timedOut = runPython(runner);
    await vi.advanceTimersByTimeAsync(TIME_LIMIT_MS.python);
    expect((await timedOut).tests[0].status).toBe('timeout');
    expect(FakeWorker.spawned[0].terminated).toBe(true);

    FakeWorker.script = () => [loading, ...passing()];
    const shown = vi.spyOn(runner.loading, 'set');
    expect((await runPython(runner)).passed).toBe(cases.length);
    expect(shown).toHaveBeenCalledWith('Restarting Python…');
  });

  it('restarts Python after a run that was cancelled midway', async () => {
    vi.useFakeTimers();
    FakeWorker.script = () => [{ kind: 'test-start', index: 0 }];
    const runner = TestBed.inject(RunnerService);
    void runPython(runner);
    await vi.advanceTimersByTimeAsync(0);
    runner.cancel();
    expect(FakeWorker.spawned[0].terminated).toBe(true);

    FakeWorker.script = () => [loading, ...passing()];
    const shown = vi.spyOn(runner.loading, 'set');
    expect((await runPython(runner)).passed).toBe(cases.length);
    expect(shown).toHaveBeenCalledWith('Restarting Python…');
  });

  it('stops a cancelled run, so its time limit cannot end the run that follows', async () => {
    vi.useFakeTimers();
    FakeWorker.script = () => [{ kind: 'test-start', index: 0 }];
    const runner = TestBed.inject(RunnerService);
    void runPython(runner);
    await vi.advanceTimersByTimeAsync(0);
    runner.cancel();

    FakeWorker.script = () => [loading];
    void runPython(runner);
    await vi.advanceTimersByTimeAsync(TIME_LIMIT_MS.python);
    expect(runner.loading()).toBe('Restarting Python…');
    expect(FakeWorker.spawned[1].terminated).toBe(false);
  });

  it('still restarts Python when a JavaScript run comes between the crash and the next Python run', async () => {
    const runner = TestBed.inject(RunnerService);
    FakeWorker.script = () => [
      { kind: 'test-start', index: 0 },
      { kind: 'crashed', error: { message: 'Python crashed.' }, logs: [] },
    ];
    await runPython(runner);

    FakeWorker.script = passing;
    expect((await runner.run(problem, 'javascript', 'code', entryName(problem, 'javascript'), cases)).passed).toBe(cases.length);

    FakeWorker.script = () => [loading, ...passing()];
    const shown = vi.spyOn(runner.loading, 'set');
    await runPython(runner);
    expect(FakeWorker.spawned).toHaveLength(3);
    expect(shown).toHaveBeenCalledWith('Restarting Python…');
  });
});
