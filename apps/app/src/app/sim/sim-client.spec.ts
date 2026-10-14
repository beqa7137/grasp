import { STALL_MS, SimClient, SimSuperseded } from './sim-client';
import type { SimRequest } from './sim-protocol';

/** A worker that answers only when the test says so. */
class FakeWorker {
  static all: FakeWorker[] = [];
  readonly posted: { id: number; request: SimRequest }[] = [];
  private listeners: Record<string, ((e: { data: unknown }) => void)[]> = {};
  constructor() {
    FakeWorker.all.push(this);
  }
  addEventListener(type: string, listener: (e: { data: unknown }) => void) {
    (this.listeners[type] ??= []).push(listener);
  }
  postMessage(message: { id: number; request: SimRequest }) {
    this.posted.push(message);
  }
  terminate() {}
  answer(i: number, result: unknown) {
    for (const l of this.listeners['message'] ?? []) l({ data: { id: this.posted[i].id, result } });
  }
  fail(type = 'error') {
    for (const l of this.listeners[type] ?? []) l({ data: null });
  }
  answerError(i: number, error: string) {
    for (const l of this.listeners['message'] ?? []) l({ data: { id: this.posted[i].id, error } });
  }
}

const balance = (servers: number): SimRequest => ({
  kind: 'balance',
  policy: 'round-robin',
  settings: { servers, load: 0.7, slowdown: 1 },
  samples: 61,
});

describe('SimClient', () => {
  beforeEach(() => {
    FakeWorker.all = [];
    vi.stubGlobal('Worker', FakeWorker);
  });
  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('runs one request of a kind at a time and keeps only the newest waiting, so a quick drag skips its middle steps', async () => {
    const sim = new SimClient();
    const first = sim.run(balance(4));
    const middle = sim.run(balance(10));
    const last = sim.run(balance(20));
    await expect(middle).rejects.toBeInstanceOf(SimSuperseded);
    const [worker] = FakeWorker.all;
    expect(worker.posted.map((p) => (p.request as { settings: { servers: number } }).settings.servers)).toEqual([4]);
    worker.answer(0, 'four');
    await expect(first).resolves.toBe('four');
    expect(worker.posted).toHaveLength(2);
    worker.answer(1, 'twenty');
    await expect(last).resolves.toBe('twenty');
    // A superseded request is not remembered: asking again posts it.
    void sim.run(balance(10));
    expect(worker.posted).toHaveLength(3);
  });

  it('queues each kind on its own, in one worker, and remembers answers', async () => {
    const sim = new SimClient();
    const run = sim.run(balance(10));
    const cards = sim.run({ kind: 'lb-experiments' });
    expect(FakeWorker.all).toHaveLength(1);
    expect(FakeWorker.all[0].posted.map((p) => p.request.kind)).toEqual(['balance', 'lb-experiments']);
    FakeWorker.all[0].answer(1, 'cards');
    await expect(cards).resolves.toBe('cards');
    FakeWorker.all[0].answer(0, 'run');
    await expect(run).resolves.toBe('run');
    expect(sim.run(balance(10))).toBe(run);
  });

  it('rejects everything when a worker fails, and says so rather than leaving a readout blank', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const sim = new SimClient();
    const run = sim.run(balance(10));
    FakeWorker.all[0].fail();
    await expect(run).rejects.toThrow(/failed/);
    await expect(sim.run(balance(4))).rejects.toThrow(/not available/);
  });

  it('fails a request the worker could not run, or an answer the page could not read', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const thrown = new SimClient();
    const run = thrown.run(balance(10));
    FakeWorker.all[0].answerError(0, 'RangeError: out of memory');
    await expect(run).rejects.toThrow(/out of memory/);
    const unreadable = new SimClient();
    const other = unreadable.run(balance(10));
    FakeWorker.all[1].fail('messageerror');
    await expect(other).rejects.toThrow(/could not be read/);
  });

  it('replaces a worker that stops answering once, sending its requests again, and fails on a second stall', async () => {
    vi.useFakeTimers();
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const sim = new SimClient();
    const run = sim.run(balance(10));
    vi.advanceTimersByTime(STALL_MS);
    expect(FakeWorker.all).toHaveLength(2);
    expect(FakeWorker.all[1].posted.map((p) => p.request)).toEqual([balance(10)]);
    FakeWorker.all[1].answer(0, 'ten');
    await expect(run).resolves.toBe('ten');
    const stuck = sim.run(balance(20));
    vi.advanceTimersByTime(STALL_MS);
    await expect(stuck).rejects.toThrow(/stopped answering/);
    vi.useRealTimers();
  });
});
