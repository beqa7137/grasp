import { CAPACITY_TRAFFIC, capacityRamp, capacityRun, type CapacityRamp, type CapacitySettings, type CapacityTierId } from '@grasp/engine';
import type { Pt } from '../../viz/kit/particles';
import type { Gap, Stage } from './capacity-layout';
import { busiestOf, type ActChange } from './capacity-words';

/** A ramp steps one traffic stop each `--g-motion-layout`. */
export const STOP_MS = 360;
/** The stream's widths and the loads ease this long after a stop or a change. */
export const EASE_MS = 240;
/** The climax ring lands this long, then the clock dwells on it. */
export const RING_MS = 400;
export const DWELL_MS = 600;
/** Where nothing steps, the stream's particles run this long. */
export const FLOW_MS = 2400;
/** After an answer's act the stream takes this long to flow at its new widths. */
export const REFLOW_MS = 360;
/** A lane an answer's play hides cross-fades to its hidden form this long. */
export const CROSSFADE_MS = 160;
/** At the reveal the loads grow from the setup's level, and the numbers land. */
export const GROW_MS = 520;
export const LAND_MS = 400;
/** No particle's transit is shorter than this. */
export const MIN_TRANSIT_MS = 240;
const FALL_PX_PER_S = 60;
export const PARTICLE_R = 2.5;
/**
 * The most particles live at once. With the bands, loads and values a stop eases (at most `EASE_BUDGET`), a play stays
 * within the 60 animations REDESIGN.md 3.5 allows; where the stream would hold more, every gap thins alike.
 */
export const PARTICLE_BUDGET = 36;

/** A play of the stream on one monotone clock: the stage it shows at each moment, and whether the climax ring is up. */
export interface PlayClock {
  /** The runs the clock steps through; one for a play that only flows. */
  ramp: CapacityRamp;
  /** The stop the ring lands at, and the tier it points at; null when the play has no climax. */
  ringAt: number;
  ring: CapacityTierId | null;
  length: number;
}

/** Reduced motion's ring, and a ramp's with nothing shed: the first tier to shed on the way up, or the busiest. */
export function restRing(s: CapacitySettings): CapacityTierId | null {
  return capacityRamp(s, CAPACITY_TRAFFIC[0], s.traffic).full ?? busiestOf(capacityRun(s))[0]?.id ?? null;
}

/**
 * Play's clock: the traffic steps through its stops from `from` to the setting, one each `STOP_MS`. The climax is the
 * first stop where a tier sheds, where the ring lands and the clock dwells before it climbs on; with nothing shed the
 * ring lands at the last stop, above the busiest lane's end. With one stop there is nothing to step, so the stream flows
 * for `FLOW_MS` and the ring lands for its last second.
 */
export function rampClock(s: CapacitySettings, from: number = CAPACITY_TRAFFIC[0]): PlayClock {
  const ramp = capacityRamp(s, Math.min(from, s.traffic), s.traffic);
  const last = ramp.stops.length - 1;
  const ringAt = ramp.climax >= 0 ? ramp.climax : last;
  const ring = ramp.full ?? busiestOf(ramp.runs[last])[0]?.id ?? null;
  return { ramp, ringAt, ring, length: last === 0 ? FLOW_MS : ramp.stops.length * STOP_MS + RING_MS + DWELL_MS };
}

/**
 * An answer's clock when its act changes no traffic: the stream flows at the act's setting for `FLOW_MS`, and where the
 * act makes a tier shed that shed nothing before, the ring lands on its × for the last second.
 */
export function flowClock(setup: CapacitySettings, act: CapacitySettings): PlayClock {
  const [a, b] = [capacityRun(setup), capacityRun(act)];
  const ramp = capacityRamp(act, act.traffic, act.traffic);
  return { ramp, ringAt: 0, ring: b.shed > 1e-9 && a.shed <= 1e-9 ? b.bottleneck : null, length: FLOW_MS };
}

/** Where a clock stands `ms` after it starts: the stop shown, and whether the ring is up. Monotone in `ms`. */
export function clockAt(c: PlayClock, ms: number): { index: number; ring: boolean } {
  const last = c.ramp.stops.length - 1;
  if (last === 0) return { index: 0, ring: !!c.ring && ms >= c.length - RING_MS - DWELL_MS };
  const pause = RING_MS + DWELL_MS;
  const climaxStart = c.ringAt * STOP_MS;
  const index =
    ms < climaxStart + STOP_MS + pause ? Math.min(c.ringAt, Math.floor(ms / STOP_MS)) : Math.min(last, Math.floor((ms - pause) / STOP_MS));
  return { index, ring: !!c.ring && index === c.ringAt };
}

/** The box a play is brought to on a tall stage: the topmost whose lanes its act changes. */
export function playAnchor(change: ActChange): 'lb' | 'app' | 'db' {
  return change.lanes.includes('lb') ? 'lb' : change.lanes.includes('app') || change.lanes.includes('workers') ? 'app' : 'db';
}

/** Seeded, so a play always sends the same dots. */
export function mulberry32(seed: number): () => number {
  let a = seed;
  return () => {
    a |= 0;
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One particle of the stream: it falls through a gap, and one in the part the next tier sheds breaks on the box's edge. */
export interface Drop {
  gap: Gap['nextId'];
  path: [Pt, Pt];
  doomed: boolean;
  duration: number;
}

/** How long a particle takes through a gap, at 60 px a second. */
export const transitMs = (gp: Gap) => Math.max(MIN_TRANSIT_MS, ((gp.y1 - gp.y0 - 2 * PARTICLE_R) / FALL_PX_PER_S) * 1000);
/** The dots a gap holds at once: one per 1,500 requests a second per 24 px of stream. */
export const dotsIn = (gp: Gap) => (gp.flow / 1500) * ((gp.y1 - gp.y0) / 24);

/**
 * The stream's particles: each gap spawns at its top, at a random place across the stream's width, at the rate that
 * keeps `dotsIn` of them in flight, so their count follows the model's rates. No number is ever read from them.
 */
export class Stream {
  private readonly owed = new Map<string, number>();
  constructor(private readonly random: () => number = mulberry32(7)) {}

  /** The particles to send for the next `dt` ms of the play. */
  step(gaps: readonly Gap[], dt: number): Drop[] {
    const total = gaps.reduce((a, gp) => a + dotsIn(gp), 0);
    const thin = total > PARTICLE_BUDGET ? PARTICLE_BUDGET / total : 1;
    const out: Drop[] = [];
    for (const gp of gaps) {
      const duration = transitMs(gp);
      let owed = (this.owed.get(gp.nextId) ?? this.random()) + ((dotsIn(gp) * thin) / duration) * dt;
      for (; owed >= 1; owed--) {
        const room = Math.max(0, gp.x1 - gp.x0 - 2 * PARTICLE_R);
        const x = gp.x0 + Math.min(PARTICLE_R, (gp.x1 - gp.x0) / 2) + this.random() * room;
        out.push({
          gap: gp.nextId,
          path: [
            [x, gp.y0 + PARTICLE_R],
            [x, gp.y1 - PARTICLE_R],
          ],
          doomed: gp.shedNext > 0 && x > gp.xPass,
          duration,
        });
      }
      this.owed.set(gp.nextId, owed);
    }
    return out;
  }
}

/** One eased change: the element it moves and the transform it starts from, ending at rest. */
export interface Ease {
  selector: string;
  frames: Keyframe[];
  ms: number;
}
const from = (selector: string, transform: string, ms: number): Ease => ({ selector, frames: [{ transform }, { transform: 'none' }], ms });
const byId = (id: string) => `[data-id="${id}"]`;

/**
 * What eases between two drawings of the stage, by transform and opacity only: each band of the stream and its red part
 * from their old widths, each instance's load from its old reach (where the lane's instances kept their places, or at a
 * reveal), the served bar and the rail, and the two values that swap, which flash.
 * Nothing eases toward a mark that is not drawn, so a shed appears at the stop where its limit is passed.
 */
export function eases(a: Stage, b: Stage, ms: number = EASE_MS, grow = false): Ease[] {
  const out: Ease[] = [];
  const scale = (id: string, was: number, now: number, shift = 0) => {
    if (now > 0.5 && (Math.abs(was - now) > 0.25 || Math.abs(shift) > 0.25))
      out.push(from(byId(id), `${shift ? `translateX(${shift}px) ` : ''}scaleX(${Math.max(0.001, was / now)})`, ms));
  };
  for (const gb of b.gaps) {
    const ga = a.gaps.find((x) => x.nextId === gb.nextId);
    if (!ga) continue;
    scale(`band-${gb.nextId}`, ga.xPass - ga.x0, gb.xPass - gb.x0);
    if (Math.abs(ga.xPass - gb.xPass) > 0.25 && gb.flow > 0)
      out.push(from(byId(`band-edge-${gb.nextId}`), `translateX(${ga.xPass - gb.xPass}px)`, ms));
    if (gb.shedNext) {
      const was = ga.shedNext ? ga.x1 - ga.xPass : 0;
      for (const id of [`band-shed-${gb.nextId}`, `band-shed-edge-${gb.nextId}`]) scale(id, was, gb.x1 - gb.xPass, ga.xPass - gb.xPass);
    }
  }
  scale('sink-bar', a.sink, b.sink);
  scale('rail-fill', a.g.x(a.offered) - a.g.xa, b.g.x(b.offered) - b.g.xa);
  const flash = (id: string) => out.push({ selector: byId(id), frames: [{ opacity: 0.35 }, { opacity: 1 }], ms });
  if (a.offered !== b.offered) flash('traffic-value');
  if (a.served !== b.served) flash('sink-0');
  const loads: { ease: Ease; marks: number }[] = [];
  for (const id of ['lb', 'app', 'primary', 'replicas'] as const) {
    const [la, lb] = [a.lanes[id], b.lanes[id]];
    // A lane a play hides fades to its hidden form.
    if (lb.kind === 'hidden' && la.kind !== 'hidden')
      out.push({
        selector: `${byId(`lane-hidden-${id}`)}, ${byId(`lane-${id}-hidden`)}`,
        frames: [{ opacity: 0 }, { opacity: 1 }],
        ms: CROSSFADE_MS,
      });
    if (lb.kind !== 'normal') continue;
    if (la.meter && lb.meter) {
      scale(`meter-fill-${id}`, la.meter.fill, lb.meter.fill);
      scale(`meter-writes-${id}`, la.meter.writes, lb.meter.writes);
    }
    const same = la.kind === 'normal' && la.segs.length === lb.segs.length && Math.abs(la.each - lb.each) < 0.01;
    if (!same && !grow) continue;
    // Where the instances moved, a reveal grows each one's load from the setup's level, its share of the new segment.
    const share = (px: number) => (la.kind === 'normal' && la.each > 0 ? (px / la.each) * lb.each : 0);
    const reach = (was: number, now: number, cls: string) => {
      if (now > 0.5 && Math.abs(was - now) > 0.25)
        loads.push({
          ease: from(`.${cls}[data-lane="${id}"]`, `scaleX(${Math.max(0.001, was / now)})`, ms),
          marks: cls === 'lane-fill' ? lb.segs.length : lb.writes > 0.2 ? lb.segs.length : 0,
        });
    };
    reach(same ? la.fill : share(la.fill), lb.fill, 'lane-fill');
    reach(same ? la.writes : share(la.writes), lb.writes, 'lane-writes');
    const [sa, sb] = [a.plan.blocks[id].L.shed, b.plan.blocks[id].L.shed];
    if (sb && sa && Math.abs(sa.x0 - sb.x0) < 0.25) scale(`shed-${id}`, sa.x1 - sa.x0, sb.x1 - sb.x0);
  }
  // Each instance's load is its own mark: the lanes with the fewest instances ease within the budget, and the rest land.
  let left = EASE_BUDGET - easedMarks(out, b);
  for (const l of loads.sort((x, y) => x.marks - y.marks))
    if (l.marks <= left) {
      out.push(l.ease);
      left -= l.marks;
    }
  return out;
}

/** How many marks one change eases at most: with `PARTICLE_BUDGET`, REDESIGN.md 3.5's 60 animations. */
export const EASE_BUDGET = 24;

/** How many elements a list of eases animates on stage `b`: a load's selector matches one group per instance. */
export function easedMarks(es: readonly Ease[], b: Stage): number {
  return es.reduce((n, e) => {
    const m = /^\.(lane-fill|lane-writes)\[data-lane="(\w+)"\]$/.exec(e.selector);
    if (!m) return n + e.selector.split(',').length;
    const loads = b.groups.find((g) => g.id === m[2])?.loads ?? [];
    return n + (m[1] === 'lane-fill' ? loads.length : loads.filter((l) => l.writes.length).length);
  }, 0);
}

/** The texts a reveal lands: every status, conversion, fleet and total the question held back. */
export const LANDING =
  '[data-id^="status-"], [data-id^="conv-"], [data-id^="workers-"], [data-id^="sink-"], [data-id^="limit-"], [data-id="xfer-label"]';
