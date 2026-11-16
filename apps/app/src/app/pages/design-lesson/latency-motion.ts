import { LATENCY_PLAY_SLOW, sampleAt, type LatencySample, type PlayPlan } from '@grasp/engine';
import { laneHead, type Band } from './latency-band';
import type { Pt } from '../../viz/kit/particles';

/** No ring sweep, slide or particle runs shorter than this on screen: below it a ring is drawn full and dots step. */
export const MIN_MOTION_MS = 120;
/** A line moving up one place slides at most this long, and never longer than the time to the band's next change. */
export const SLIDE_MS = 240;
/** An arrival travels the inlet this long on screen before it joins the line or its server. */
export const INLET_MS = 300;
/** A departure leaves along the exit stub this long on screen, fading. */
export const EXIT_MS = 240;

/** A play's length on screen. */
export const playLength = (plan: PlayPlan) => (plan.to - plan.from) * plan.rate;
/** The window time a play shows `screen` ms after it starts: one monotone clock. */
export const windowAt = (plan: PlayPlan, screen: number) => Math.min(plan.to, plan.from + screen / plan.rate);

export interface Trip {
  id: number;
  path: Pt[];
  tone: 'arrive' | 'leave';
  start: number;
  duration: number;
}

/**
 * Where a request that waits at its arrival joins the line: behind those already waiting in its lane. Null where the
 * line has passed its room, so the request joins the "+N" count, which no particle lands on.
 */
function joinAt(b: Band, smp: LatencySample, id: number, server: number, arrive: number): Pt | null {
  const lane = b.split ? server : -1;
  const ahead = sampleAt(smp, arrive).waiting.filter((r) => r.id !== id && (!b.split || r.server === server) && r.arrive <= arrive).length;
  const head = laneHead(b, lane);
  const tail = b.split ? b.xl0 + 6 : b.pad + 8;
  const room = Math.max(1, Math.floor((head.x - tail) / b.pitch) + 1);
  return ahead + 1 <= room ? [head.x - ahead * b.pitch, head.y] : null;
}

/**
 * The particles a play sends, on its one clock: each arrival travels the inlet for `INLET_MS` and lands as the clock
 * reaches its arrival, at the line's end or at its server's edge; each departure leaves along the exit stub as it
 * finishes, from just outside the ring, so the ring's center is the only request in service. Only plays as slow as a
 * free one travel: faster, a request appears in the line at its moment. Nothing travels that would run under
 * `MIN_MOTION_MS`.
 */
export function trips(smp: LatencySample, b: Band, plan: PlayPlan): Trip[] {
  const out: Trip[] = [];
  if (plan.rate < LATENCY_PLAY_SLOW) return out;
  const screen = (t: number) => (t - plan.from) * plan.rate;
  for (const r of smp.reqs) {
    if (r.arrive > plan.from && r.arrive <= plan.to) {
      const land = screen(r.arrive);
      const start = Math.max(0, land - INLET_MS);
      if (land - start >= MIN_MOTION_MS) {
        const box = b.boxes[r.server];
        // One that starts at once stops at its server's edge, where its ring takes it: crossing the box would run over
        // the server's name.
        const to = r.start > r.arrive + 1e-9 ? joinAt(b, smp, r.id, r.server, r.arrive) : ([b.xs, box.ry] as Pt);
        if (to) {
          const path: Pt[] = b.split
            ? [[b.pad, b.ymid], [b.xr, b.ymid], [b.xl0, box.ry], to]
            : to[1] === b.ymid
              ? [[b.pad, b.ymid], to]
              : [[b.pad, b.ymid], [b.xf, b.ymid], to];
          out.push({ id: r.id, path, tone: 'arrive', start, duration: land - start });
        }
      }
    }
    if (r.leave > plan.from && r.leave <= plan.to && (r.leave - r.start) * plan.rate >= MIN_MOTION_MS) {
      const box = b.boxes[r.server];
      const x1 = b.xs + b.sw + b.exitW + 6;
      out.push({
        id: r.id,
        path: [
          [box.rx + b.ring + b.dotR + 3, box.ry],
          [x1, box.ry],
        ],
        tone: 'leave',
        start: screen(r.leave),
        duration: EXIT_MS,
      });
    }
  }
  return out.sort((a, c) => a.start - c.start);
}

/**
 * How long the band's dots slide at window time `t`: up to the next change of the band on screen, at most `SLIDE_MS`,
 * and not at all under `MIN_MOTION_MS`.
 */
export function slideAt(smp: LatencySample, plan: PlayPlan, t: number): number {
  let next = Infinity;
  for (const r of smp.reqs) for (const x of [r.arrive, r.start, r.leave]) if (x > t + 1e-9 && x < next) next = x;
  const gap = (Math.min(next, plan.to) - t) * plan.rate;
  return gap < MIN_MOTION_MS ? 0 : Math.min(SLIDE_MS, gap);
}
