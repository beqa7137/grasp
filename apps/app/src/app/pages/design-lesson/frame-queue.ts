/**
 * Runs jobs one per frame, each after the frame that drew the one before: a change that touches several parts of a
 * widget reaches the screen in small pieces, so no single frame on a slow phone is long. A newer job under the same key
 * replaces a waiting one.
 */
export class FrameQueue {
  private readonly jobs = new Map<string, () => void>();
  private waiting = false;
  private stopped = false;

  run(key: string, job: () => void) {
    this.jobs.set(key, job);
    if (!this.waiting) this.next();
  }

  stop() {
    this.stopped = true;
    this.jobs.clear();
  }

  private next() {
    if (this.stopped) return;
    this.waiting = true;
    // The frame callback comes before that frame draws; the timeout runs once it has.
    requestAnimationFrame(() =>
      setTimeout(() => {
        const [key, job] = this.jobs.entries().next().value ?? [];
        if (key !== undefined) this.jobs.delete(key);
        job?.();
        if (this.jobs.size) this.next();
        else this.waiting = false;
      }),
    );
  }
}
