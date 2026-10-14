import { Injectable } from '@angular/core';
import type { SimRequest, SimResult } from './sim-protocol';

/** Results kept per request, so going back to a recent setting answers at once. */
const KEEP = 160;
/**
 * A request unanswered this long means the worker stopped answering (a run takes well under a second even on a slow
 * phone): it is replaced once and its requests sent again; a second stall fails them, and the widget says so.
 */
export const STALL_MS = 6_000;

/** A request a newer one of the same kind replaced before it was sent: its answer would be out of date. */
export class SimSuperseded extends Error {
  constructor() {
    super('A newer request of the same kind replaced this one');
  }
}

interface Job {
  request: SimRequest;
  key: string;
  resolve: (result: unknown) => void;
  reject: (error: Error) => void;
}

/**
 * Runs the lesson widgets' simulations off the main thread (REDESIGN.md 3.3, `sim.worker.ts`), and remembers each answer
 * by its request. Each kind of request runs one at a time and keeps at most one waiting, the newest: dragging through
 * 4, 10 and 20 servers runs the first and the last, not every step. The simulation never loads on the main thread: a page
 * chunk that imported it would split a first-paint chunk (its random number generator is shared with one). A worker that
 * stalls is replaced once; one that fails, throws, sends an answer the page cannot read, or stalls again rejects its
 * requests, and the widget says so: no failure leaves a readout silently blank.
 */
@Injectable({ providedIn: 'root' })
export class SimClient {
  private worker: Worker | null = null;
  private failed = false;
  private restarted = false;
  private stall: ReturnType<typeof setTimeout> | null = null;
  private next = 0;
  private readonly sent = new Map<number, Job>();
  private readonly busy = new Set<SimRequest['kind']>();
  private readonly waiting = new Map<SimRequest['kind'], Job>();
  private readonly memo = new Map<string, Promise<unknown>>();

  run<R extends SimRequest>(request: R): Promise<SimResult<R>> {
    const key = JSON.stringify(request);
    let result = this.memo.get(key);
    if (!result) {
      result = new Promise((resolve, reject) => this.enqueue({ request, key, resolve, reject }));
      this.memo.set(key, result);
      if (this.memo.size > KEEP) this.memo.delete(this.memo.keys().next().value!);
    }
    return result as Promise<SimResult<R>>;
  }

  private enqueue(job: Job) {
    if (this.failed || typeof Worker === 'undefined') {
      this.memo.delete(job.key);
      return job.reject(new Error('The simulation worker is not available'));
    }
    const kind = job.request.kind;
    if (!this.busy.has(kind)) return this.send(job);
    const replaced = this.waiting.get(kind);
    if (replaced) {
      this.memo.delete(replaced.key);
      replaced.reject(new SimSuperseded());
    }
    this.waiting.set(kind, job);
  }

  private send(job: Job) {
    const id = this.next++;
    this.sent.set(id, job);
    this.busy.add(job.request.kind);
    this.start().postMessage({ id, request: job.request });
    if (!this.stall) this.watch();
  }

  /** Watches for a stall while any request is out: the clock starts again at each answer. */
  private watch() {
    if (this.stall) clearTimeout(this.stall);
    this.stall = this.sent.size ? setTimeout(() => this.stalled(), STALL_MS) : null;
  }

  private stalled() {
    this.stall = null;
    if (this.restarted) return this.fail('The simulation worker stopped answering');
    console.warn(`The simulation worker answered nothing for ${STALL_MS / 1_000} s; starting a new one`);
    this.restarted = true;
    const pending = [...this.sent.values()];
    this.sent.clear();
    this.busy.clear();
    this.worker?.terminate();
    this.worker = null;
    for (const job of pending) this.send(job);
  }

  private fail(reason: string) {
    console.error(reason);
    this.failed = true;
    if (this.stall) clearTimeout(this.stall);
    this.worker?.terminate();
    for (const job of [...this.sent.values(), ...this.waiting.values()]) {
      this.memo.delete(job.key);
      job.reject(new Error(reason));
    }
    this.sent.clear();
    this.waiting.clear();
    this.busy.clear();
  }

  private start(): Worker {
    if (this.worker) return this.worker;
    const worker = new Worker(new URL('./sim.worker', import.meta.url), { type: 'module' });
    worker.addEventListener('message', ({ data }: MessageEvent<{ id: number; result?: unknown; error?: string }>) => {
      if (worker !== this.worker) return;
      const job = this.sent.get(data.id);
      if (!job) return;
      if (data.error !== undefined) return this.fail(`The simulation failed: ${data.error}`);
      this.sent.delete(data.id);
      this.busy.delete(job.request.kind);
      job.resolve(data.result);
      const queued = this.waiting.get(job.request.kind);
      this.waiting.delete(job.request.kind);
      if (queued) this.send(queued);
      else this.watch();
    });
    worker.addEventListener('messageerror', () => worker === this.worker && this.fail('An answer from the simulation could not be read'));
    worker.addEventListener('error', () => worker === this.worker && this.fail('The simulation worker failed'));
    this.worker = worker;
    return worker;
  }
}
