/** A point on the stage, in viewBox units (CSS px). */
export type Pt = readonly [number, number];

const SVG = 'http://www.w3.org/2000/svg';

/** The REDESIGN.md 3.5 ceiling on animations running at once. */
export const MAX_LIVE = 60;

/**
 * Keyframes that move a dot along `path` at an even speed, then hold it at the end for `holdShare` of the time: each
 * corner's offset is its share of the length. The dot fades as it ends unless it breaks there.
 */
export function travelKeyframes(path: readonly Pt[], fadeOut: boolean, holdShare = 0): Keyframe[] {
  const legs = path.slice(1).map((p, i) => Math.hypot(p[0] - path[i][0], p[1] - path[i][1]));
  const total = legs.reduce((a, b) => a + b, 0) || 1;
  const travel = 1 - holdShare;
  let run = 0;
  const at = (p: Pt) => `translate(${p[0]}px, ${p[1]}px)`;
  const frames: Keyframe[] = path.map((p, i) => {
    if (i) run += legs[i - 1];
    return { offset: (run / total) * travel, transform: at(p), opacity: 1 };
  });
  if (holdShare > 0) frames.push({ offset: 1, transform: at(path[path.length - 1]), opacity: 1 });
  if (fadeOut) frames[frames.length - 1]['opacity'] = 0;
  return frames;
}

/**
 * Pooled request dots for a stage (REDESIGN.md 3.5): at most `MAX_LIVE` move at once (an emit past that is dropped, never
 * queued), elements are reused, and every dot pauses with `pause()`. Callers emit only while motion is allowed, so under
 * Reduced or the test mode no animation is ever made. A dot that `breaks` ends as a × where it stops.
 */
export class ParticlePool {
  private readonly free: SVGGElement[] = [];
  private readonly live = new Map<Animation, SVGGElement>();
  private paused = false;

  constructor(readonly layer: SVGGElement) {}

  emit(path: readonly Pt[], tone: string, durationMs: number, options: { breaks?: boolean; holdShare?: number } = {}): boolean {
    if (this.live.size >= MAX_LIVE || path.length < 2) return false;
    const breaks = !!options.breaks;
    const dot = this.free.pop() ?? this.make();
    dot.setAttribute('class', `particle ${tone}`);
    dot.removeAttribute('visibility');
    const frames = travelKeyframes(path, !breaks, options.holdShare);
    const animation = dot.animate(frames, { duration: durationMs, easing: 'linear', fill: 'forwards' });
    this.live.set(animation, dot);
    if (this.paused) animation.pause();
    animation.onfinish = () => {
      if (breaks) dot.setAttribute('class', `particle ${tone} broken`);
      setTimeout(() => this.release(animation), breaks ? 360 : 0);
    };
    return true;
  }

  pause(): void {
    this.paused = true;
    for (const a of this.live.keys()) a.pause();
  }

  resume(): void {
    this.paused = false;
    for (const a of this.live.keys()) if (a.playState === 'paused') a.play();
  }

  clear(): void {
    for (const a of this.live.keys()) this.release(a);
  }

  private release(animation: Animation): void {
    const dot = this.live.get(animation);
    if (!dot) return;
    this.live.delete(animation);
    animation.cancel();
    dot.setAttribute('visibility', 'hidden');
    this.free.push(dot);
  }

  private make(): SVGGElement {
    const g = document.createElementNS(SVG, 'g');
    const circle = document.createElementNS(SVG, 'circle');
    circle.setAttribute('r', '3.5');
    const cross = document.createElementNS(SVG, 'path');
    cross.setAttribute('d', 'M-4 -4L4 4M4 -4L-4 4');
    g.append(circle, cross);
    this.layer.append(g);
    return g;
  }
}

/**
 * Calls `onChange(false)` while `el` is offscreen or the page is hidden, and `onChange(true)` when both end, so a stage's
 * play and its particles pause there (REDESIGN.md 3.5). Returns the disposer.
 */
export function watchVisibility(el: Element, onChange: (visible: boolean) => void): () => void {
  let onscreen = true;
  const report = () => onChange(onscreen && document.visibilityState !== 'hidden');
  const io =
    typeof IntersectionObserver === 'undefined'
      ? null
      : new IntersectionObserver(([entry]) => {
          onscreen = entry.isIntersecting;
          report();
        });
  io?.observe(el);
  document.addEventListener('visibilitychange', report);
  return () => {
    io?.disconnect();
    document.removeEventListener('visibilitychange', report);
  };
}

/**
 * Whether script may animate, now and whenever Settings › Motion or the device setting changes: `allowed` decides
 * (`core/motion.ts`), and this asks it again on each change. Returns the disposer.
 */
export function watchMotion(allowed: () => boolean, onChange: (allowed: boolean) => void): () => void {
  const report = () => onChange(allowed());
  const media = window.matchMedia?.('(prefers-reduced-motion: reduce)');
  media?.addEventListener?.('change', report);
  const attribute = new MutationObserver(report);
  attribute.observe(document.documentElement, { attributes: true, attributeFilter: ['data-motion'] });
  report();
  return () => {
    media?.removeEventListener?.('change', report);
    attribute.disconnect();
  };
}

/**
 * A play driven by animation frames: `onFrame(progress, elapsedMs)` each frame until `durationMs`, then `onEnd`. An
 * endless clock (`Infinity`) reports progress 0 and runs until stopped. It pauses without losing its place, and a clock
 * paused before it starts waits for `resume()`.
 */
export class PlayClock {
  private raf = 0;
  private elapsed = 0;
  private last = 0;
  private running = false;
  private paused = false;

  constructor(
    private readonly durationMs: number,
    private readonly onFrame: (progress: number, elapsedMs: number) => void,
    private readonly onEnd: () => void = () => undefined,
  ) {}

  start(): void {
    this.stop();
    this.elapsed = 0;
    this.running = true;
    this.onFrame(0, 0);
    if (!this.paused) this.schedule();
  }

  pause(): void {
    this.paused = true;
    cancelAnimationFrame(this.raf);
  }

  resume(): void {
    if (!this.paused) return;
    this.paused = false;
    if (this.running) this.schedule();
  }

  stop(): void {
    this.running = false;
    cancelAnimationFrame(this.raf);
  }

  private schedule(): void {
    this.last = performance.now();
    const tick = (now: number) => {
      this.elapsed += Math.max(0, now - this.last);
      this.last = now;
      const progress = Math.min(1, this.elapsed / this.durationMs);
      this.onFrame(progress, this.elapsed);
      if (progress < 1) this.raf = requestAnimationFrame(tick);
      else {
        this.running = false;
        this.onEnd();
      }
    };
    this.raf = requestAnimationFrame(tick);
  }
}
