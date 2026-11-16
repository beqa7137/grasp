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
/** From the read's send the curve starts again at this share of the scale: its milliseconds stay apart, the play short. */
const READ_SHARE = 0.5;

export type Run = 'write-read' | 'read';

/** Maps a mark's moment to the play's screen time. */
export type Timeline = (m: Moment) => number;

/**
 * The play's clock before particles. A write that is acked or refused shares one clock with its read, because the stale
 * race needs v8 in flight on the same clock as the read; the log curve restarts at the read's send, so the read's own
 * milliseconds keep their spacing after a slow write. A timed-out write plays its acks, a countdown, then restarts the
 * clock at the read's send: nothing is in flight after a timeout, so no ordering is lost. A `read` run starts at the
 * read's send, the write already done.
 */
function baseClock(m: QuorumScenario, run: Run): Timeline {
  const sent = m.read.sentAt;
  if (run === 'read') return ([chain, t]) => (chain === 'w' ? 0 : screenMs(t - sent));
  if (m.write.outcome !== 'timed-out') return ([, t]) => (t <= sent ? screenMs(t) : screenMs(sent) + READ_SHARE * screenMs(t - sent));
  const lastWrite = Math.max(1, ...m.write.sent.map((id) => m.all[id].writeOneWay), ...m.write.applied.map((id) => m.all[id].writeRtt));
  const readStart = screenMs(lastWrite) + COUNTDOWN_MS;
  return ([chain, t]) => (chain === 'w' ? (t >= WRITE_TIMEOUT_MS ? readStart : screenMs(t)) : readStart + screenMs(t - WRITE_TIMEOUT_MS));
}

export interface Trip {
  path: Pt[];
  tone: string;
  /** The node the request goes to or comes from. */
  node: number;
  /** The moment it arrives, in the model. */
  arrives: Moment;
  start: number;
  duration: number;
  breaks?: boolean;
}

/** A request a play sends: along a path, from one moment of the model to another. */
interface Leg {
  path: Pt[];
  tone: string;
  node: number;
  from: Moment;
  to: Moment;
  breaks?: boolean;
}

/**
 * The requests a play sends: the write to each node it was sent to and each ack back, then the read to each node it
 * asks and each answer back, then each repair. A node that stops mid-write takes the write and breaks there; a refused
 * write sends nothing.
 */
function legs(m: QuorumScenario, stage: Stage, run: Run): Leg[] {
  const out: Leg[] = [];
  const { write, read } = m;
  if (run === 'write-read')
    for (const id of write.sent) {
      const path = stage.paths.write.get(id);
      if (!path) continue;
      const x = m.all[id];
      out.push({ path, tone: 'write', node: id, from: ['w', 0], to: ['w', x.writeOneWay], breaks: x.state === 'mid' });
      if (write.applied.includes(id))
        out.push({ path: [...path].reverse(), tone: 'ack', node: id, from: ['w', x.landAt], to: ['w', x.writeRtt] });
    }
  if (stage.hid.read || !read.set.length) return out;
  const sent = read.sentAt;
  for (const a of read.answers) {
    const path = stage.paths.read.get(a.id);
    if (!path) continue;
    out.push({ path, tone: 'read', node: a.id, from: ['r', sent], to: ['r', a.readAt] });
    out.push({ path: [...path].reverse(), tone: 'answer', node: a.id, from: ['r', a.readAt], to: ['r', sent + a.rtt] });
  }
  for (const [id, path] of stage.paths.repair)
    out.push({ path, tone: 'repair', node: id, from: ['r', sent + (read.rthMs ?? 0)], to: ['r', m.repairedAt[id] ?? sent] });
  return out;
}

/**
 * The play's clock and its particles. No particle runs faster than `MIN_TRIP_MS`, and nothing that happens at or after
 * a request's arrival lands before its particle does: each arrival lifts the clock from there on, in arrival order, so
 * the map stays monotone and every ordering the model decides is kept on screen.
 */
export function schedule(m: QuorumScenario, stage: Stage, run: Run): { T: Timeline; trips: Trip[] } {
  const base = baseClock(m, run);
  const lifts: [at: number, screen: number][] = [];
  const T: Timeline = (mo) => {
    const b = base(mo);
    return lifts.reduce((v, [at, screen]) => (at <= b && screen > v ? screen : v), b);
  };
  const list = legs(m, stage, run).sort((a, b) => base(a.to) - base(b.to) || base(a.from) - base(b.from));
  const trips = list.map((l): Trip => {
    const start = T(l.from);
    const end = Math.max(start + MIN_TRIP_MS, T(l.to));
    lifts.push([base(l.to), end]);
    return { path: l.path, tone: l.tone, node: l.node, arrives: l.to, start, duration: end - start, breaks: l.breaks };
  });
  return { T, trips };
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
