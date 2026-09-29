export type ShedPolicy = 'none' | 'bounded' | 'deadline';

export interface OverloadRun {
  /** Requests answered before their client gave up. */
  onTime: number;
  /** Requests answered after their client gave up: work the server did for no one. */
  late: number;
  /** Requests turned away at once because the queue was full. */
  rejected: number;
  /** Requests dropped unanswered because their client had already given up. */
  expired: number;
  /** Every request sent, first tries and retries. */
  sent: number;
  /** The share of users whose request was answered in time, on the first try or a retry. */
  goodputPct: number;
  /** The longest any answered request waited in the queue, in seconds. */
  maxWaitSec: number;
  /** Seconds after the burst until the queue is empty and no retries are pending; null if not within the run. */
  recoverSec: number | null;
  /** Requests waiting at the end of each second. */
  queue: number[];
}

interface Cohort {
  at: number;
  n: number;
  attempt: number;
  gaveUp: boolean;
}

/**
 * A service answering `capacity` requests a second, sent `base` a second plus a burst of `burst` a second for its first
 * `burstSec` seconds, simulated one second at a time. A client gives up once its request has waited `timeoutSec` and, up
 * to `retries` times, sends it again the next second; a request turned away is retried the same way. The service queues
 * everything (`none`), turns away what does not fit in `queueCap` (`bounded`), or queues everything but drops, unanswered,
 * requests whose client has already given up (`deadline`).
 */
export function overload(
  policy: ShedPolicy,
  options: {
    capacity: number;
    base: number;
    burst: number;
    burstSec: number;
    timeoutSec: number;
    queueCap: number;
    retries: number;
    horizonSec?: number;
  },
): OverloadRun {
  const { capacity, base, burst, burstSec, timeoutSec, queueCap, retries, horizonSec = 60 } = options;
  const queued: Cohort[] = [];
  let pending: Cohort[] = [];
  const run: OverloadRun = {
    onTime: 0,
    late: 0,
    rejected: 0,
    expired: 0,
    sent: 0,
    goodputPct: 0,
    maxWaitSec: 0,
    recoverSec: null,
    queue: [],
  };
  let users = 0;
  const retry = (c: Cohort, t: number, n: number) => {
    if (c.attempt < retries && n > 0) pending.push({ at: t + 1, n, attempt: c.attempt + 1, gaveUp: false });
  };
  for (let t = 0; t < horizonSec; t++) {
    const fresh = base + (t < burstSec ? burst : 0);
    users += fresh;
    const arriving = [{ at: t, n: fresh, attempt: 0, gaveUp: false }, ...pending.filter((c) => c.at === t)];
    pending = pending.filter((c) => c.at !== t);
    for (const c of arriving) {
      run.sent += c.n;
      // Arrivals spread over the second while the service works, so this second's answers make room as they come in.
      const room = policy === 'bounded' ? Math.max(0, queueCap + capacity - queued.reduce((sum, q) => sum + q.n, 0)) : c.n;
      const accepted = Math.min(c.n, room);
      if (accepted > 0) queued.push({ ...c, n: accepted });
      run.rejected += c.n - accepted;
      retry(c, t, c.n - accepted);
    }
    let budget = capacity;
    while (budget > 0 && queued.length) {
      const c = queued[0];
      if (policy === 'deadline' && c.gaveUp) {
        run.expired += c.n;
        queued.shift();
        continue;
      }
      const served = Math.min(budget, c.n);
      budget -= served;
      c.n -= served;
      if (c.gaveUp) run.late += served;
      else run.onTime += served;
      run.maxWaitSec = Math.max(run.maxWaitSec, t - c.at);
      if (c.n === 0) queued.shift();
    }
    for (const c of queued) {
      if (!c.gaveUp && t - c.at + 1 > timeoutSec) {
        c.gaveUp = true;
        retry(c, t, c.n);
      }
    }
    const waiting = queued.reduce((sum, c) => sum + c.n, 0);
    run.queue.push(waiting);
    if (run.recoverSec === null && t + 1 >= burstSec && waiting === 0 && pending.length === 0) run.recoverSec = t + 1 - burstSec;
  }
  run.goodputPct = (run.onTime / users) * 100;
  return run;
}
