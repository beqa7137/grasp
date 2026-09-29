export interface LeaseRun {
  /** When the holder's lease runs out, in seconds from when it took the lock. */
  expiresAtSec: number;
  /** Whether the lease ran out while the holder was paused or down. */
  lost: boolean;
  /** Seconds no one holds the lock after the holder crashes: others wait for the lease to run out. */
  failoverSec: number | null;
  /** When the paused holder wakes and writes, still believing it holds the lock; null if it crashed. */
  wakesAtSec: number | null;
  /** What the store does with that write: nothing to decide, accepted though another client now holds the lock, or rejected by its fencing token. */
  staleWrite: 'none' | 'accepted' | 'rejected';
  /** Renewals each holder sends a minute. */
  renewalsPerMinute: number;
}

/**
 * A client takes a lease of `ttlSec` and renews it every `renewSec`. At `stopAtSec` it either freezes for `pauseSec` (a
 * garbage collection pause, a stalled VM) or crashes. A second client waiting for the lock takes it as soon as the lease
 * runs out. A frozen holder wakes still believing it holds the lock and writes; with fencing, the store has seen the newer
 * holder's larger token and rejects the stale one.
 */
export function leaseRun(options: {
  ttlSec: number;
  renewSec: number;
  stopAtSec: number;
  pauseSec: number;
  crash: boolean;
  fencing: boolean;
}): LeaseRun {
  const { ttlSec, renewSec, stopAtSec, pauseSec, crash, fencing } = options;
  const lastRenew = Math.floor(stopAtSec / renewSec) * renewSec;
  const expiresAtSec = lastRenew + ttlSec;
  const renewalsPerMinute = 60 / renewSec;
  if (crash) {
    return { expiresAtSec, lost: true, failoverSec: expiresAtSec - stopAtSec, wakesAtSec: null, staleWrite: 'none', renewalsPerMinute };
  }
  const wakesAtSec = stopAtSec + pauseSec;
  const lost = wakesAtSec > expiresAtSec;
  return {
    expiresAtSec,
    lost,
    failoverSec: null,
    wakesAtSec,
    staleWrite: !lost ? 'none' : fencing ? 'rejected' : 'accepted',
    renewalsPerMinute,
  };
}
