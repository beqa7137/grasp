/** A replay never shows a trip shorter than this, so even a 0.1 ms round trip can be followed. */
const TRIP_MIN_MS = 150;
const SLOWDOWN_MIN = 20;
/** The longest a replay runs: past it, the trips after the first few speed up. */
export const REPLAY_CAP_MS = 4_000;
const SLOW_TRIPS = 6;
/** How long Ada's rename plays, whatever the window it shows. */
export const RENAME_PLAY_MS = 3_000;

/**
 * A page load replayed on screen: every trip slowed by the same factor, `max(20, 150 / rtt)`, so N+1 and a join keep
 * their real ratio; a replay that would pass 4 s plays its first six trips at that factor and the rest faster.
 */
export function readReplay(trips: number, rttMs: number) {
  const slowdown = Math.max(SLOWDOWN_MIN, TRIP_MIN_MS / rttMs);
  const trip = rttMs * slowdown;
  const natural = trips * trip;
  const capped = natural > REPLAY_CAP_MS;
  const slow = capped ? Math.min(trips, SLOW_TRIPS) : trips;
  const rest = trips - slow;
  const restTrip = rest ? (REPLAY_CAP_MS - slow * trip) / rest : 0;
  return {
    slowdown,
    durationMs: capped ? REPLAY_CAP_MS : natural,
    caption: `shown ${Math.round(slowdown)}× slower${capped ? ', then faster' : ''}`,
    /** Where the replay is at `ms` on screen: the trip it is on (fractional) and how long that trip lasts on screen. */
    at(ms: number): { trip: number; tripMs: number } {
      if (ms <= slow * trip) return { trip: Math.min(trips, ms / trip), tripMs: trip };
      return { trip: Math.min(trips, slow + (ms - slow * trip) / restTrip), tripMs: restTrip };
    },
  };
}

/** How many times slower (above 1) or faster (below) a rename's copy rewrite plays than it runs. */
export const renameSlowdown = (staleMs: number) => RENAME_PLAY_MS / staleMs;
