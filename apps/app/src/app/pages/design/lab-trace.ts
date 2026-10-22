import { signal } from '@angular/core';
import { traceRequest, type Design, type SimResult, type TraceHop } from '@grasp/engine';
import { motionAllowed } from '../../core/motion';
import { TracePlayer } from '../../viz/kit/sys/trace-player';
import { tracePath, type LabDiagram } from './lab-diagram';

/** How long the traced dot takes per hop: `--g-motion-travel` (REDESIGN.md 3.5). */
const HOP_MS = 520;

export const msText = (ms: number) => `${ms < 10 ? Math.round(ms * 10) / 10 : Math.round(ms)} ms`;

/**
 * Trace a request (REDESIGN.md 4.6): the busiest path's hops with the simulator's times, revealed as the numbered dot
 * reaches each one, or all at once when motion is reduced. Any change to the board or its workload clears it, so its
 * numbers are always the board's.
 */
export class LabTrace {
  /** The traced hops; a lone client means no traffic leaves it. */
  readonly hops = signal<TraceHop[] | null>(null);
  /** How many hops the dot has reached. */
  readonly reached = signal(0);
  private errorRate = 0;
  private player: TracePlayer | null = null;
  private layer: SVGGElement | null = null;

  start(design: Design, result: SimResult, diagram: LabDiagram, layer: SVGGElement | undefined, canvas: Element | undefined): void {
    const hops = traceRequest(design, result);
    this.errorRate = result.metrics.errorRate;
    this.hops.set(hops);
    const path = tracePath(hops, diagram.edges);
    if (!path || !layer || !canvas || !motionAllowed()) {
      this.player?.stop();
      this.reached.set(hops.length);
      return;
    }
    this.reached.set(1);
    if (this.layer !== layer) this.destroy();
    this.layer = layer;
    this.player ??= new TracePlayer(layer, canvas);
    this.player.play(path.points, path.at, HOP_MS, (n) => this.reached.set(n));
  }

  /** What the trace says once the dot has arrived, or why there is nothing to trace. */
  summary(nameOf: (id: string) => string): string | null {
    const hops = this.hops();
    if (!hops) return null;
    if (!hops.length) return 'There is no traffic source to trace.';
    if (hops.length === 1) return 'No traffic leaves the client.';
    if (this.reached() < hops.length) return null;
    const total = hops.reduce((sum, h) => sum + h.networkMs + h.nodeMs, 0);
    const path = `Request 1: ${hops.map((h) => nameOf(h.id)).join(' → ')}, ${msText(total)} on the busiest path.`;
    const refused = Math.round(this.errorRate * 100);
    if (this.errorRate >= 0.5) return `${path} Most requests never get this far: ${refused}% are refused.`;
    return refused >= 1 ? `${path} ${refused}% of requests are refused.` : path;
  }

  clear(): void {
    this.player?.stop();
    this.hops.set(null);
    this.reached.set(0);
  }

  destroy(): void {
    this.player?.destroy();
    this.player = null;
  }
}
