import { CACHE_QPS } from '@grasp/engine';
import type { ParticlePool, Pt } from '../../viz/kit/particles';

/** Requests a second one dot stands for, which the stage's legend states. */
export const REQUESTS_PER_DOT = 1_000;
/** A miss waits at the origin this many times the origin's latency, so a slow origin visibly lags the hits. */
export const WAIT_SCALE = 8;
const DOT_EVERY_MS = 1000 / (CACHE_QPS / REQUESTS_PER_DOT);
/** Dots travel at this many px per ms, but never cross a link faster than 3.5's travel time. */
const SPEED = 0.4;
const MIN_TRAVEL_MS = 520;

export interface TrafficState {
  /** Shares of all requests, 0 to 1. */
  hit: number;
  timedOut: number;
  originMs: number;
}

const length = (path: readonly Pt[]) => path.slice(1).reduce((sum, p, i) => sum + Math.hypot(p[0] - path[i][0], p[1] - path[i][1]), 0);
const travelMs = (path: readonly Pt[]) => Math.max(MIN_TRAVEL_MS, length(path) / SPEED);

/**
 * The request dots on a stage: one every 100 ms of flow, each a hit (to the cache and back), a miss (on to the origin,
 * where it waits `WAIT_SCALE` × the origin's latency in a small pile) or a miss that times out there and breaks, in
 * the proportions of the state as it leaves. Deterministic: the fates come from carried
 * fractions, never chance.
 */
export class CacheTraffic {
  private sent = 0;
  private hitDue = 0;
  private lostDue = 0;

  constructor(
    private readonly pool: ParticlePool,
    private readonly paths: { hit: readonly Pt[]; miss: readonly Pt[] },
  ) {}

  /** Sends every dot due by `elapsedMs` of flow. */
  sendUntil(elapsedMs: number, state: TrafficState): void {
    while (this.sent * DOT_EVERY_MS <= elapsedMs) {
      this.sent++;
      // Dues carry the fraction a dot could not show to the next one, so a change of state takes effect at once.
      this.hitDue += state.hit;
      if (this.hitDue >= 1) {
        this.hitDue -= 1;
        this.pool.emit(this.paths.hit, 'hit', travelMs(this.paths.hit));
        continue;
      }
      this.lostDue += state.hit < 1 ? state.timedOut / (1 - state.hit) : 0;
      const lost = this.lostDue >= 1;
      if (lost) this.lostDue -= 1;
      const end = this.paths.miss[this.paths.miss.length - 1];
      const path = [...this.paths.miss.slice(0, -1), [end[0], end[1] + ((this.sent % 5) - 2) * 3] as Pt];
      const travel = travelMs(path);
      const wait = state.originMs * WAIT_SCALE;
      this.pool.emit(path, lost ? 'lost' : 'miss', travel + wait, { breaks: lost, holdShare: wait / (travel + wait) });
    }
  }
}
