import { NodeIds, snapshot, type Snap, type TraceCall, type TraceStep } from './snapshot';

interface LiveFrame {
  readonly name: string;
  readonly params: string[];
  below: LiveFrame | null;
  onStack: boolean;
  done: boolean;
  /** Paused in `yield*`: it pauses and resumes with the generator it delegates to. */
  delegating?: boolean;
  /** Index in `calls`, set once a step has shown this call. */
  id?: number;
}

export const TRACE_LIMIT = Symbol('trace-limit');

export class TraceRecorder {
  readonly steps: TraceStep[] = [];
  readonly calls: TraceCall[] = [];
  private readonly ids = new NodeIds();
  private top: LiveFrame | null = null;
  /**
   * Load-time code, such as a TypeScript enum, is not traced. Code that runs after the entry function returns, such as
   * an async continuation, is not part of the trace.
   */
  private recording = false;

  constructor(private readonly maxSteps: number) {}

  readonly enter = (name: string, params: string[]): LiveFrame => {
    const frame: LiveFrame = { name, params, below: this.top, onStack: true, done: false };
    this.top = frame;
    return frame;
  };

  readonly exit = (frame: LiveFrame) => {
    frame.done = true;
    if (!frame.onStack) return;
    this.unwindTo(frame);
    this.pop();
  };

  /**
   * A generator about to yield, or an async function about to await, leaves the stack until its next step, together with
   * the generators delegating to it. A generator starting `yield*` stays on the stack while its delegate runs.
   */
  readonly pause = <T>(frame: LiveFrame, value: T, delegating = false): T => {
    if (delegating) frame.delegating = true;
    else if (frame.onStack) {
      this.unwindTo(frame);
      do this.pop();
      while (this.top?.delegating);
    }
    return value;
  };

  readonly resume = <T>(frame: LiveFrame, value: T): T => {
    if (this.recording && frame !== this.top) this.resync(frame);
    frame.delegating = false;
    return value;
  };

  readonly step = (frame: LiveFrame, line: number, getters: [string, () => unknown][]) => {
    if (!this.recording) return;
    if (this.steps.length >= this.maxSteps) throw TRACE_LIMIT;
    if (frame !== this.top) this.resync(frame);
    frame.delegating = false;
    const vars: Record<string, Snap> = {};
    for (const [name, get] of getters) {
      try {
        const value = get();
        if (typeof value !== 'function') vars[name] = snapshot(value, this.ids);
      } catch {
        // Not yet initialized (temporal dead zone) or not in scope on this line.
      }
    }
    this.steps.push({ line, vars, call: this.record(frame) });
  };

  snapshot(value: unknown): Snap {
    return snapshot(value, this.ids);
  }

  begin() {
    this.recording = true;
  }

  close() {
    this.recording = false;
  }

  private pop() {
    this.top!.onStack = false;
    this.top = this.top!.below;
  }

  private unwindTo(frame: LiveFrame) {
    while (this.top !== frame) this.pop();
  }

  /**
   * Pops paused calls above the running frame, or pushes a resumed generator back with the `yield*` chain that paused
   * with it. A frame resumed under a different caller becomes a new call.
   */
  private resync(frame: LiveFrame) {
    if (frame.onStack) {
      this.unwindTo(frame);
      return;
    }
    const resumed = [frame];
    for (let f = frame.below; f?.delegating && !f.onStack && !f.done; f = f.below) resumed.unshift(f);
    for (const f of resumed) {
      if (f.id !== undefined && this.calls[f.id].caller !== (this.top?.id ?? null)) f.id = undefined;
      f.below = this.top;
      f.onStack = true;
      this.top = f;
    }
  }

  private record(frame: LiveFrame): number {
    if (frame.id === undefined) {
      const caller = frame.below ? this.record(frame.below) : null;
      const depth = caller === null ? 1 : this.calls[caller].depth + 1;
      frame.id = this.calls.push({ name: frame.name, params: frame.params, caller, depth }) - 1;
    }
    return frame.id;
  }
}
