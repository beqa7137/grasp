import { ParticlePool, PlayClock, watchVisibility, type Pt } from '../particles';

/** Where along a polyline, as a share of its length, each of `marks` (indices into it) falls. */
export function shares(path: readonly Pt[], marks: readonly number[]): number[] {
  const at = [0];
  for (let i = 1; i < path.length; i++) at.push(at[i - 1] + Math.hypot(path[i][0] - path[i - 1][0], path[i][1] - path[i - 1][1]));
  const total = at[at.length - 1] || 1;
  return marks.map((m) => at[m] / total);
}

/**
 * Plays one traced request (REDESIGN.md 4.6): a numbered dot from the pooled particles travels the path at even speed,
 * and `onArrive(n)` reports how many hops it has reached as it goes. It pauses offscreen and on a hidden page. Callers
 * play only while motion is allowed; otherwise they show every hop at once and nothing animates.
 */
export class TracePlayer {
  private readonly pool: ParticlePool;
  private clock: PlayClock | null = null;
  private visible = true;
  private readonly unwatch: () => void;

  constructor(layer: SVGGElement, watched: Element) {
    this.pool = new ParticlePool(layer);
    this.unwatch = watchVisibility(watched, (visible) => {
      this.visible = visible;
      if (visible) {
        this.pool.resume();
        this.clock?.resume();
      } else {
        this.pool.pause();
        this.clock?.pause();
      }
    });
  }

  /** `hops` are indices into `path` where each hop's node is reached; the dot takes `hopMs` per hop. */
  play(path: readonly Pt[], hops: readonly number[], hopMs: number, onArrive: (reached: number) => void): void {
    this.stop();
    const arrive = shares(path, hops);
    const duration = hopMs * Math.max(1, hops.length - 1);
    if (!this.pool.emit(path, 'trace', duration, { label: '1', radius: 8 })) {
      onArrive(hops.length);
      return;
    }
    let reached = 0;
    this.clock = new PlayClock(duration, (progress) => {
      const now = arrive.filter((a) => a <= progress + 1e-9).length;
      if (now !== reached) onArrive((reached = now));
    });
    if (!this.visible) this.clock.pause();
    this.clock.start();
  }

  stop(): void {
    this.clock?.stop();
    this.clock = null;
    this.pool.clear();
  }

  destroy(): void {
    this.stop();
    this.unwatch();
  }
}
