import { TestBed } from '@angular/core/testing';
import { getCodingProblem, type TestCase } from '@grasp/engine';
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
  const cases: TestCase[] = problem.examples.map((e) => ({ args: e.args, expected: [0, 1], kind: 'example' }));
  const passing = (): WorkerMessage[] => [
    ...cases.flatMap((_, index): WorkerMessage[] => [
      { kind: 'test-start', index },
      { kind: 'test-result', index, ok: true, output: [0, 1], ms: 1, logs: [] },
    ]),
    { kind: 'done' },
  ];

  beforeEach(() => {
    FakeWorker.spawned = [];
    vi.stubGlobal('Worker', FakeWorker);
  });
  afterEach(() => vi.unstubAllGlobals());

  it('keeps the Python worker warm between runs', async () => {
    FakeWorker.script = passing;
    const runner = TestBed.inject(RunnerService);
    await runner.run(problem, 'python', 'code', 'two_sum', cases);
    await runner.run(problem, 'python', 'code', 'two_sum', cases);
    expect(FakeWorker.spawned).toHaveLength(1);
  });

  it('replaces a Python worker whose interpreter crashed, and reports the crash on the test it was running', async () => {
    const crash = { message: 'Python crashed (Maximum call stack size exceeded).' };
    FakeWorker.script = () => [
      { kind: 'test-start', index: 0 },
      { kind: 'crashed', error: crash, logs: ['partial'] },
    ];
    const runner = TestBed.inject(RunnerService);
    const report = await runner.run(problem, 'python', 'code', 'two_sum', cases);
    expect(report.tests.map((t) => t.status)).toEqual(['error', 'skipped', 'skipped']);
    expect(report.tests[0]).toMatchObject({ error: crash, logs: ['partial'] });
    expect(FakeWorker.spawned[0].terminated).toBe(true);

    FakeWorker.script = () => [{ kind: 'loading', message: 'Loading Python (first run only)…' }, ...passing()];
    const shown = vi.spyOn(runner.loading, 'set');
    const next = await runner.run(problem, 'python', 'code', 'two_sum', cases);
    expect(FakeWorker.spawned).toHaveLength(2);
    expect(next.passed).toBe(cases.length);
    expect(shown).toHaveBeenCalledWith('Restarting Python…');
  });

  it('reports a crash before any test as an error in the code, and one after every test not at all', async () => {
    const crash = { message: 'Python crashed.', location: { line: 8 } };
    FakeWorker.script = () => [{ kind: 'crashed', error: crash, logs: [] }];
    const runner = TestBed.inject(RunnerService);
    expect((await runner.run(problem, 'python', 'code', 'two_sum', cases)).compileError).toEqual(crash);

    FakeWorker.script = () => [...passing().slice(0, -1), { kind: 'crashed', error: crash, logs: [] }];
    const after = await runner.run(problem, 'python', 'code', 'two_sum', cases);
    expect(after.passed).toBe(cases.length);
    expect(after.compileError).toBeUndefined();
    expect(FakeWorker.spawned.every((w) => w.terminated)).toBe(true);
  });
});
