/** The Replication widget's timeline: 3 s after the user's write, in 100 ms steps. */
export const REPLICA_SPAN_MS = 3_000;
export const REPLICA_STEP_MS = 100;
export const REPLICA_TIMES: readonly number[] = Array.from(
  { length: REPLICA_SPAN_MS / REPLICA_STEP_MS + 1 },
  (_, i) => i * REPLICA_STEP_MS,
);
/** How long read-your-writes sends the user's reads to the primary after their write. */
export const REPLICA_PIN_SNAPS = [500, 1_000, 1_500, 2_000, 2_500, 3_000] as const;

export interface ReplicaRead {
  stale: boolean;
  /** Where the read went: the replica, or the primary under read-your-writes. */
  servedBy: 'replica' | 'primary';
}

/**
 * A user writes, then reads `readAfterMs` later. A replica has applied the write only once `lagMs` has passed; with
 * read-your-writes, the user's reads go to the primary for `pinMs` after their own write, the pin's last moment included.
 */
export function replicaRead(lagMs: number, readAfterMs: number, readYourWrites: boolean, pinMs: number): ReplicaRead {
  if (readYourWrites && readAfterMs <= pinMs) return { stale: false, servedBy: 'primary' };
  return { stale: readAfterMs < lagMs, servedBy: 'replica' };
}

export interface ReplicaSettings {
  lagMs: number;
  readMs: number;
  readYourWrites: boolean;
  pinMs: number;
}

export interface ReplicaOutcome extends ReplicaRead {
  /** The span of read times, after the write, at which the user's read would be stale; empty when `staleMs` is 0. */
  staleFrom: number;
  staleTo: number;
  staleMs: number;
}

/** The read the widget draws, and every read time at which the same user would see the old value. */
export function replicaOutcome(s: ReplicaSettings): ReplicaOutcome {
  const staleFrom = s.readYourWrites ? Math.min(s.pinMs, s.lagMs) : 0;
  return { ...replicaRead(s.lagMs, s.readMs, s.readYourWrites, s.pinMs), staleFrom, staleTo: s.lagMs, staleMs: s.lagMs - staleFrom };
}

/** How often the widget's stream of your reads samples the timeline. */
export const REPLICA_READ_EVERY_MS = 250;

/** Your reads every `REPLICA_READ_EVERY_MS` across the timeline, each stale or fresh: the widget's stream of reads. */
export function replicaReads(s: Omit<ReplicaSettings, 'readMs'>): { at: number; stale: boolean; servedBy: ReplicaRead['servedBy'] }[] {
  return Array.from({ length: REPLICA_SPAN_MS / REPLICA_READ_EVERY_MS + 1 }, (_, i) => {
    const at = i * REPLICA_READ_EVERY_MS;
    return { at, ...replicaRead(s.lagMs, at, s.readYourWrites, s.pinMs) };
  });
}
