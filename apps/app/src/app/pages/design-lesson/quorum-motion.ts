import { WRITE_TIMEOUT_MS, type QuorumScenario } from '@grasp/engine';
import type { Moment, Prim } from './quorum-draw';
import type { Pt, Stage } from './quorum-stage';

/** One model millisecond takes this long on screen, and each doubling of model time another as long. */
const SCALE_MS = 700;
/** No particle runs faster than this, however short its trip. */
export const MIN_TRIP_MS = 140;
/** A timed-out write's countdown on the writer before its read leaves. */
export const COUNTDOWN_MS = 900;
/** How long a mark takes to land, and a replaced one to leave. */
export const LAND_MS = 400;
export const LEAVE_MS = 250;

/** Screen time for model time: monotone, so every ordering the model decides is kept on screen. */
export const screenMs = (t: number) => SCALE_MS * Math.log2(1 + Math.max(0, t));

export type Run = 'write-read' | 'read';

/** Maps a mark's moment to the play's screen time. */
export type Timeline = (m: Moment) => number;

/**
 * The play's clock. A write that is acked or refused shares one clock with its read, because the stale race needs v8 in
 * flight on the same clock as the read. A timed-out write plays its acks, a countdown, then restarts the clock at the
 * read's send: nothing is in flight after a timeout, so no ordering is lost. A `read` run starts at the read's send,
 * the write already done.
 */
export function timeline(m: QuorumScenario, run: Run): Timeline {
  const sent = m.read.sentAt;
  if (run === 'read') return ([chain, t]) => (chain === 'w' ? 0 : screenMs(t - sent));
  if (m.write.outcome !== 'timed-out') return ([, t]) => screenMs(t);
  const lastWrite = Math.max(1, ...m.write.sent.map((id) => m.all[id].writeOneWay), ...m.write.applied.map((id) => m.all[id].writeRtt));
  const readStart = screenMs(lastWrite) + COUNTDOWN_MS;
  return ([chain, t]) => (chain === 'w' ? (t >= WRITE_TIMEOUT_MS ? readStart : screenMs(t)) : readStart + screenMs(t - WRITE_TIMEOUT_MS));
}

export interface Trip {
  path: Pt[];
  tone: string;
  start: number;
  duration: number;
  breaks?: boolean;
}

const trip = (path: Pt[], tone: string, start: number, end: number, breaks = false): Trip => ({
  path,
  tone,
  start,
  duration: Math.max(MIN_TRIP_MS, end - start),
  breaks,
});

/**
 * The requests a play sends, as particles on the stage's paths: the write to each live node and each ack back, then the
 * read to each node it asks and each answer back, then each repair. A node that stops mid-write takes the write and
 * breaks there.
 */
export function trips(m: QuorumScenario, stage: Stage, T: Timeline, run: Run): Trip[] {
  const out: Trip[] = [];
  const { write, read } = m;
  if (run === 'write-read')
    for (const [id, path] of stage.paths.write) {
      const x = m.all[id];
      const stops = x.state === 'mid';
      out.push(trip(path, 'write', T(['w', 0]), T(['w', x.writeOneWay]), stops));
      if (write.applied.includes(id)) out.push(trip([...path].reverse(), 'ack', T(['w', x.landAt]), T(['w', x.writeRtt])));
    }
  if (stage.hid.read || !read.set.length) return out;
  const sent = read.sentAt;
  for (const a of read.answers) {
    const path = stage.paths.read.get(a.id);
    if (!path) continue;
    out.push(trip(path, 'read', T(['r', sent]), T(['r', a.readAt])));
    out.push(trip([...path].reverse(), 'answer', T(['r', a.readAt]), T(['r', sent + a.rtt])));
  }
  for (const [id, path] of stage.paths.repair) {
    const x = m.all[id];
    const leaves = sent + (read.rthMs ?? 0);
    out.push(trip(path, 'repair', T(['r', leaves]), T(['r', leaves + x.readOneWay + x.pause])));
  }
  return out;
}

/** Every screen time a play changes what the stage shows, in order. */
export function changes(prims: readonly Prim[], T: Timeline): number[] {
  const times = new Set<number>();
  for (const p of prims) {
    if (p.at) times.add(T(p.at));
    if (p.until) {
      times.add(T(p.until));
      times.add(Math.max(0, T(p.until) - LEAVE_MS));
    }
  }
  return [...times].sort((a, b) => a - b);
}

/** How long a play runs: until its last mark has landed and its last particle arrived. */
export function playLength(prims: readonly Prim[], tripList: readonly Trip[], T: Timeline): number {
  const marks = prims.flatMap((p) => (p.at ? [T(p.at)] : []));
  const particles = tripList.map((t) => t.start + t.duration);
  return Math.max(0, ...marks, ...particles) + LAND_MS;
}

/** Whether a mark shows at screen time `tau` of a play, or at rest (`tau` null) where only the end state shows. */
export function shows(p: Prim, T: Timeline, tau: number | null): boolean {
  if (tau === null) return !p.until;
  return (!p.at || T(p.at) <= tau) && (!p.until || T(p.until) > tau);
}
