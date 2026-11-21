import {
  CAPACITY_APP_MAX,
  CAPACITY_AXIS_MAX,
  CAPACITY_CHALLENGE_SOLUTION,
  CAPACITY_EXPERIMENTS,
  CAPACITY_LB_MAX,
  CAPACITY_REPLICAS_MAX,
  CAPACITY_SIZES,
  CAPACITY_TRAFFIC,
  capacityActOf,
  capacityRun,
  capacityZoneLane,
  capacityZoneLoss,
  formatSlot,
  type CapacityRun,
  type CapacitySettings,
  type CapacityTierId,
} from '@grasp/engine';
import { CAPACITY_RESERVES } from './capacity-reserves';
import {
  ALL_HIDDEN,
  NAMES,
  NOTHING_HIDDEN,
  POOL_LABEL,
  SHED,
  TIERS,
  cacheParts,
  convParts,
  fleetText,
  fq,
  sinkParts,
  statusParts,
  workerParts,
  type Hid,
  type Role,
  type Words,
} from './capacity-words';
import type { Anchor } from './stage-draw';
import { fontMeasure } from './stage-text';

/** The stage's type roles, as `capacity-stage.scss` sets them: stage text keeps proportional digits, as measured. */
export const TEXT = fontMeasure<Role>({
  label: { font: 'w600', size: 11, track: 0.12, upper: true },
  cap: { font: 'w500', size: 13 },
  capB: { font: 'w600', size: 13 },
  small: { font: 'w500', size: 11 },
  smallB: { font: 'w700', size: 11 },
  head: { font: 'mono', size: 17 },
});
export const tw = TEXT.tw;

export const LINE = 17;
/** How far a header's lines under the first move down, so their text clears the steppers' 44 px targets by 2 px. */
export const FLEET_CLEAR = 3;
export const LANE_Y = 10;
export const LANE_H = 22;
export const STRIP_H = 18;
export const PAD_BOTTOM = 12;
export const DIVIDER_GAP = 10;
/** The stream's gap between two boxes. */
export const GAP = 24;
/** From this stage width the axis runs to `CAPACITY_AXIS_MAX` and the padding is at its widest. */
export const WIDE_FROM = 520;
const TRAFFIC_TOP = CAPACITY_TRAFFIC[CAPACITY_TRAFFIC.length - 1];
/** How far a block's header sits under its top: past its lane and zone strip, or at once with no instance up. */
export const laneSlot = (L: { kind: string }) => (L.kind === 'none' ? 0 : LANE_Y + LANE_H + STRIP_H);

/**
 * One axis in requests a second, shared by the traffic, the stream and every lane. From `WIDE_FROM` it runs to the
 * longest lane at any setting (the primary's write ceiling), so no lane is ever cut. On a narrower stage it ends at the
 * traffic's top, where every request, every shed and every bottleneck lies, at twice the scale: a lane whose limit lies
 * past it is cut at its end, and its limit is said in words.
 */
export interface Geometry {
  W: number;
  pad: number;
  xa: number;
  xb: number;
  /** The axis's end, in requests a second, and its ticks. */
  max: number;
  ticks: readonly number[];
  /** Pixels per request a second, for a width that may run past the axis's end. */
  k: number;
  /** A strand of the stream every this many requests a second: 1,000, or 2,000 where 1,000 is under 6 px. */
  strand: number;
  x: (v: number) => number;
  /** The left of a block's two steppers. */
  stepX: number;
}
export function geometry(W: number): Geometry {
  // The padding grows an eighth as fast as the stage, so the width inside it never shrinks as the stage widens.
  const pad = Math.min(16, Math.max(12, 12 + (W - WIDE_FROM + 32) / 8));
  const max = W >= WIDE_FROM ? CAPACITY_AXIS_MAX : TRAFFIC_TOP;
  const xa = pad + 12;
  const xb = W - pad - 12;
  const k = (xb - xa) / max;
  return {
    W,
    pad,
    xa,
    xb,
    max,
    ticks: [0, 1, 2, 3, 4].map((i) => (i * max) / 4),
    k,
    strand: 1000 * k >= 6 ? 1000 : 2000,
    x: (v) => xa + Math.min(Math.max(v, 0), max) * k,
    stepX: W - pad - 2 - 88,
  };
}
/** Whether a limit lies past the axis's end, so its lane is cut there. */
export const pastAxis = (g: Geometry, v: number) => v > g.max + 0.5;
/** A cut lane's break: two strokes from 7 px before the axis's end; no mark on the lane comes within 3 px of them. */
export const BREAK_CLEAR = 10;
/** The headroom meter a cut lane with no whole instance on the axis ends in, before its break. */
export const METER_W = 40;

export interface ZoneGroup {
  zone: string;
  x0: number;
  x1: number;
  lost: boolean;
  count: number;
  /** Where its letter is centered: on its part of the strip left of the words at the lane's end. */
  lx: number;
}
/** A lane's zone strip: its zones' groups, the instances zone A took, and whether every group is lettered. */
export interface ZoneStrip {
  /** The groups on the axis. */
  groups: ZoneGroup[];
  /** The marks of the instances zone A took, one each, or one for them all where each would be under 4 px. */
  lost: { id: string; x0: number; x1: number; count: number }[];
  /** Where the lost group ends, in requests a second: the limit before zone A's loss. */
  lostEnd: number;
  lettered: boolean;
  /** The groups wholly past the axis's end, named in words at the lane's end ("+2 A", "+2 A lost"), right-aligned at `x`. */
  past: { text: string; x: number; zones: string[] } | null;
}
/** The narrowest mark one lost instance gets; narrower, the lost group is one mark. */
export const LOST_MIN = 4;
/** How far a zone letter or the words at a lane's end may run past the axis's end, under its break. */
const STRIP_OVER = 3;
/**
 * Under a lane, its instances' zones: each zone's run of the instances up (zone A's last, so where its group starts is
 * the limit that survives zone A), then the instances zone A took, hatched from the survivors' limit to the limit before
 * the loss, which shares out the limit zone A took (a replica's limit grows when fewer share the reads, so its share is
 * not one replica's width before the loss). What lies on the axis is drawn, and a group wholly past it is named at the
 * lane's end, so every zone with instances is lettered or named; the groups on the axis are lettered all or none.
 */
export function zoneStrip(g: Geometry, r: CapacityRun, id: CapacityTierId, hid: Hid): ZoneStrip | null {
  if (id === 'primary') return null;
  const t = r[id];
  if (hid.zones || hid.lanes.has(id) || !t.n || ((id === 'lb' || id === 'app') && !t.up)) return null;
  const zl = capacityZoneLane(id, t.n, !!r.settings.zone);
  const each = t.up > 0 ? t.ceiling / t.up : 0;
  const all: (ZoneGroup & { v0: number })[] = [];
  zl.up.forEach((x, i) => {
    const last = all[all.length - 1];
    const b = g.x((i + 1) * each);
    if (last && last.zone === x.zone) Object.assign(last, { x1: b, count: last.count + 1 });
    else all.push({ zone: x.zone, x0: g.x(i * each), x1: b, lost: false, count: 1, lx: 0, v0: i * each });
  });
  const lost: ZoneStrip['lost'] = [];
  let lostEnd = 0;
  if (zl.lost.length) {
    const start = t.up > 0 ? t.ceiling : 0;
    lostEnd = capacityRun({ ...r.settings, zone: 0 })[id].ceiling;
    const share = (lostEnd - start) / zl.lost.length;
    if (share * g.k < LOST_MIN) lost.push({ id: `${id}-A`, x0: g.x(start), x1: g.x(lostEnd), count: zl.lost.length });
    else zl.lost.forEach((x, k) => lost.push({ id: x.id, x0: g.x(start + k * share), x1: g.x(start + (k + 1) * share), count: 1 }));
    all.push({ zone: 'A', x0: g.x(start), x1: g.x(lostEnd), lost: true, count: zl.lost.length, lx: 0, v0: start });
  }
  const groups: ZoneGroup[] = all.filter((gr) => gr.x1 - gr.x0 >= 1).map(({ v0: _, ...gr }) => gr);
  const beyond = all.filter((gr) => gr.x1 - gr.x0 < 1 && gr.v0 >= g.max - 0.5);
  const text = beyond.map((gr) => `+${gr.count} ${gr.zone}${gr.lost ? ' lost' : ''}`).join(', ');
  const past = beyond.length ? { text, x: g.xb + STRIP_OVER, zones: beyond.map((gr) => gr.zone) } : null;
  const right = past ? past.x - tw(text, 'small') - 3 : g.xb + STRIP_OVER;
  let prevEnd = -Infinity;
  let lettered = true;
  for (const gr of groups) {
    const w = tw(gr.zone, 'small');
    gr.lx = (gr.x0 + Math.min(gr.x1, right)) / 2;
    if (gr.lx < gr.x0 || gr.lx - w / 2 < prevEnd + 3 || gr.lx + w / 2 > right) lettered = false;
    prevEnd = gr.lx + w / 2;
  }
  return { groups, lost: lost.filter((x) => x.x1 - x.x0 >= 1), lostEnd, lettered, past };
}

export interface Label {
  x: number;
  text: string;
  place: 'row' | 'strip';
  anchor: Anchor;
}
/**
 * Where a lane's words go: in its row's empty track, right of the lane's end and its shed, its limit (the load balancers
 * and app servers; a database lane says its limit in its conversion); then the limit before the last change, beside its
 * ghost tick in the row, else in the strip under the lane, else in the block's status or conversion. Under the primary,
 * the label of the step from its machine's queries to its limit.
 */
export interface LaneInfo {
  id: CapacityTierId;
  kind: 'normal' | 'none' | 'lostAll' | 'hidden';
  limitLabel: Label | null;
  limitInStatus: boolean;
  ghost: { x: number; old: number; label: Label | null; tick: boolean } | null;
  wasInStatus: number | null;
  /** The lane's limit lies past the axis's end, so it ends in a break. */
  cut: boolean;
  /** No mark on the lane's row reaches this x: on a cut lane, 3 px before its break or its meter. */
  clear: number;
  /**
   * On a cut lane with no instance whole on the axis, one instance's whole width scaled into `METER_W` px before the
   * break, filled to how busy it is, with its 70% mark: the headroom the cut hides.
   */
  meter: { x0: number; w: number } | null;
  /** Where the lane's limit falls if zone A fails: a tick, or in words where the tick would sit in the break or past it. */
  zoneTick: number | null;
  zoneInStatus: number | null;
  shed: { x0: number; x1: number; xMark: number } | null;
  xfer: { x: number; anchor: Anchor; text: string; x0: number; x1: number } | null;
}

type Span = readonly [number, number];
const fits =
  (g: Geometry, busy: readonly Span[], ticks: readonly number[]) =>
  ([x0, x1]: Span) =>
    x0 >= g.xa && x1 <= g.xb && busy.every(([a, b]) => x1 + 4 <= a || x0 - 4 >= b) && ticks.every((tx) => tx < x0 - 3 || tx > x1 + 3);
const spanOf = (x: number, w: number, anchor: Anchor): Span =>
  anchor === 'end' ? [x - w, x] : anchor === 'middle' ? [x - w / 2, x + w / 2] : [x, x + w];

export function laneInfo(g: Geometry, r: CapacityRun, id: CapacityTierId, hid: Hid, ghostRun: CapacityRun | null): LaneInfo {
  const t = r[id];
  const L: LaneInfo = {
    id,
    kind: 'normal',
    limitLabel: null,
    limitInStatus: false,
    ghost: null,
    wasInStatus: null,
    cut: false,
    clear: g.xb + 1,
    meter: null,
    zoneTick: null,
    zoneInStatus: null,
    shed: null,
    xfer: null,
  };
  if (id === 'replicas' && !t.up) L.kind = 'none';
  else if ((id === 'primary' && r.primary.outage) || ((id === 'lb' || id === 'app') && !t.up)) L.kind = 'lostAll';
  else if (hid.lanes.has(id)) L.kind = 'hidden';
  if (L.kind !== 'normal') return L;
  const end = g.x(t.ceiling);
  L.cut = pastAxis(g, t.ceiling);
  if (L.cut) {
    const up = id === 'primary' ? 1 : t.up;
    if (pastAxis(g, t.ceiling / up)) L.meter = { x0: g.xb - BREAK_CLEAR - METER_W, w: METER_W };
    L.clear = (L.meter ? L.meter.x0 : g.xb - BREAK_CLEAR) - 3;
  }
  if (hid.zoneTicks && !hid.zones && !r.settings.zone) {
    const z = capacityZoneLoss(r);
    const left = id === 'primary' ? (z.primary.outage ? null : z.primary.ceiling) : z[id].up > 0 ? z[id].ceiling : null;
    if (left !== null && left < t.ceiling - 0.5) {
      if (g.x(left) < L.clear && !pastAxis(g, left)) L.zoneTick = g.x(left);
      else L.zoneInStatus = left;
    }
  }
  let occ = end;
  if (t.shed > SHED) {
    const x1 = g.x(t.ceiling + t.shed);
    const narrow = x1 - end < 16;
    L.shed = { x0: end, x1, xMark: narrow ? x1 + 8 : x1 - 8 };
    occ = narrow ? x1 + 14 : x1;
  }
  const old = ghostRun?.[id].ceiling ?? NaN;
  const ghost = !!ghostRun && !hid.ghost && Number.isFinite(old) && old > 0 && Math.abs(old - t.ceiling) >= 0.5;
  const gx = ghost ? g.x(old) : NaN;
  const zs = zoneStrip(g, r, id, hid);
  // One mark per meaning: where the old limit falls within 12 px of the lost group's end (at it, when the change is zone
  // A's loss), the group's end is the ghost, so no tick reads as a second old limit; its label goes after the group. A
  // limit past the axis gets no tick either.
  const lostGroup = ghost && !!zs?.lost.length && Math.abs(gx - g.x(zs.lostEnd)) < 12;
  const tick = ghost && !lostGroup && !pastAxis(g, old) && gx < L.clear;
  const row: Span[] = [[g.xa - 2, occ]];
  const fitsRow = fits(g, row, tick && gx > occ ? [gx] : []);
  const strip: Span[] = [];
  if (id === 'primary') {
    const xs = g.x(r.settings.size);
    const [lo, hi] = [Math.min(xs, xferEnd(g, L, t.ceiling)), Math.max(xs, xferEnd(g, L, t.ceiling))];
    strip.push([lo - 1, hi + 1]);
    const cost = formatSlot({ value: r.primary.cost, unit: 'num' });
    for (const text of [`÷ ${cost} queries a request`, `÷ ${cost} a request`, `÷ ${cost}`]) {
      const w = tw(text, 'small');
      if (hi + 6 + w <= g.xb) L.xfer = { x: hi + 6, anchor: 'start', text, x0: hi + 6, x1: hi + 6 + w };
      else if (lo - 6 - w >= g.xa) L.xfer = { x: lo - 6, anchor: 'end', text, x0: lo - 6 - w, x1: lo - 6 };
      if (L.xfer) break;
    }
    if (L.xfer) strip.push([L.xfer.x0, L.xfer.x1]);
  } else if (zs) strip.push([g.xa - 4, Math.max(end, zs.lost.length ? g.x(zs.lostEnd) : end) + 6]);
  const fitsStrip = fits(g, strip, []);
  if (id === 'lb' || id === 'app') {
    // At the lane's end, or under it in a strip with no zone letters: beside a ghost tick it would read as the old
    // limit's label, and beside a letter as that zone's limit.
    const text = `limit ${fq(t.ceiling)}`;
    const w = tw(text, 'small');
    const stripAt = Math.max(end + 2, ...strip.map((b) => b[1])) + 6;
    if (fitsRow([occ + 6, occ + 6 + w])) {
      L.limitLabel = { x: occ + 6, text, place: 'row', anchor: 'start' };
      row.push([occ + 6, occ + 6 + w]);
    } else if (!zs?.lettered && fitsStrip([stripAt, stripAt + w])) {
      L.limitLabel = { x: stripAt, text, place: 'strip', anchor: 'start' };
      strip.push([stripAt, stripAt + w]);
    } else L.limitInStatus = true;
  }
  if (ghost) {
    const text = `limit was ${fq(old)}`;
    const w = tw(text, 'small');
    const after = Math.max(...row.map((b) => b[1]));
    const rowCands: [number, Anchor][] = lostGroup
      ? []
      : tick && gx > occ
        ? [
            [gx + 5, 'start'],
            [gx - 5, 'end'],
          ]
        : [[after + 8, 'start']];
    const stripEnd = Math.max(g.xa, ...strip.map((b) => b[1]));
    const stripCands: [number, Anchor][] = lostGroup
      ? [[stripEnd + 4, 'start']]
      : tick
        ? [
            [gx, 'middle'],
            [stripEnd + 8, 'start'],
          ]
        : [[stripEnd + 8, 'start']];
    const inRow = rowCands.find(([x, a]) => fitsRow(spanOf(x, w, a)));
    const inStrip = inRow ? undefined : stripCands.find(([x, a]) => fitsStrip(spanOf(x, w, a)));
    const at = inRow ?? inStrip;
    const label: Label | null = at ? { x: at[0], anchor: at[1], text, place: inRow ? 'row' : 'strip' } : null;
    L.ghost = { x: gx, old, label, tick };
    if (!label) L.wasInStatus = old;
  }
  return L;
}

/** Where the primary's step from its machine's queries to its limit ends: at the limit, or before a cut lane's break. */
export const xferEnd = (g: Geometry, L: LaneInfo, ceiling: number) => (L.cut ? g.xb - BREAK_CLEAR : g.x(ceiling));

export interface Header {
  name: string;
  /** The name and the fleet on one line. */
  one: boolean;
  fleet: Words[];
  h: number;
}
/**
 * A block's header: the name in the label role and the fleet in the title weight, beside it when both fit, else under
 * it, wrapping to more lines rather than dropping a count, a promotion or a unit.
 */
export function headerLayout(g: Geometry, id: CapacityTierId, fleet: string): Header {
  const avail = g.stepX - g.xa - 6;
  const name = NAMES[id].find((n) => tw(n, 'label') <= avail) ?? NAMES[id][NAMES[id].length - 1];
  if (tw(name, 'label') + 10 + tw(fleet, 'capB') <= avail) return { name, one: true, fleet: [[[fleet, 'capB']]], h: 44 };
  // The fleet's first line sits beside the steppers; the lines under it run below their targets, at full width.
  let lines = TEXT.flow([[fleet, 'capB']], g.xb - g.xa, avail);
  // A count alone beside the steppers ("4", then "× 8,000 queries/s") reads as a stray number: start under them.
  if (
    lines.length > 1 &&
    /^\d+$/.test(
      lines[0]
        .map((p) => p[0])
        .join('')
        .trim(),
    )
  )
    lines = [[], ...TEXT.flow([[fleet, 'capB']], g.xb - g.xa)];
  return { name, one: false, fleet: lines, h: lines.length > 1 ? 44 + FLEET_CLEAR + LINE * (lines.length - 1) : 44 };
}
export const meterWidth = (g: Geometry) => Math.round(Math.min(110, (g.xb - g.xa) * 0.34));

export interface Block {
  L: LaneInfo;
  header: Header;
  status: Words[];
  conv: Words[];
}
export type Reserve = Record<'lb' | 'app' | 'db' | 'sink', number>;
/** Every block's words at one setting, laid into lines, and each box's content height (its last baseline from its top). */
export interface Plan {
  blocks: Record<CapacityTierId, Block>;
  poolBeside: boolean;
  pool: Words[];
  cache: Words[];
  sink: Words[];
  content: Reserve;
}

export function planStage(g: Geometry, r: CapacityRun, hid: Hid, ghostRun: CapacityRun | null): Plan {
  const lw = g.xb - g.xa;
  const block = (id: CapacityTierId): Block => {
    const L = laneInfo(g, r, id, hid, ghostRun);
    return {
      L,
      header: headerLayout(g, id, fleetText(r, id, hid)),
      status: TEXT.flow(statusParts(r, id, hid, L), lw),
      conv: id === 'primary' || id === 'replicas' ? TEXT.flow(convParts(r, id, hid, L), lw) : [],
    };
  };
  const blocks = { lb: block('lb'), app: block('app'), primary: block('primary'), replicas: block('replicas') };
  const poolBeside = g.xa + meterWidth(g) + 10 + tw(POOL_LABEL[0], 'label') <= g.xb;
  const pool = TEXT.flow(workerParts(r, hid), lw);
  const cache = TEXT.flow(cacheParts(r), lw);
  const sink = TEXT.flow(sinkParts(r, hid), lw);
  const blockEnd = (b: Block) => laneSlot(b.L) + b.header.h + 13 + (b.status.length - 1) * LINE + b.conv.length * LINE;
  return {
    blocks,
    poolBeside,
    pool,
    cache,
    sink,
    content: {
      lb: blockEnd(blocks.lb),
      app: blockEnd(blocks.app) + (poolBeside ? 0 : 15) + LINE + 6 + LINE + 2 + (pool.length - 1) * LINE,
      db: blockEnd(blocks.primary) + DIVIDER_GAP + blockEnd(blocks.replicas) + LINE + 6 + (cache.length - 1) * LINE,
      sink: (sink.length - 1) * 20,
    },
  };
}

/**
 * The settings whose words run longest: the extremes of every control and one step in from the top (whose ghost is the
 * top), and every experiment's setup, act and solution.
 */
export function reserveSettings(): CapacitySettings[] {
  const out: CapacitySettings[] = [];
  for (const traffic of [1000, 7000, 14_000, 20_000])
    for (const lb of [1, CAPACITY_LB_MAX - 1, CAPACITY_LB_MAX])
      for (const app of [1, 4, CAPACITY_APP_MAX - 1, CAPACITY_APP_MAX])
        for (const size of CAPACITY_SIZES)
          for (let replicas = 0; replicas <= CAPACITY_REPLICAS_MAX; replicas++)
            for (const cache of [0, 1])
              for (const zone of [0, 1]) for (const slow of [0, 1]) out.push({ traffic, lb, app, size, replicas, cache, zone, slow });
  for (const e of CAPACITY_EXPERIMENTS) out.push(capacityRun(e.setup).settings, capacityActOf(e));
  out.push({ ...capacityRun(CAPACITY_EXPERIMENTS[CAPACITY_EXPERIMENTS.length - 1].setup).settings, ...CAPACITY_CHALLENGE_SOLUTION });
  return out;
}

/** Every setting one stepper press or one toggle away. */
export function neighbors(s: CapacitySettings): CapacitySettings[] {
  const out: CapacitySettings[] = [];
  const add = (k: 'lb' | 'app' | 'replicas', v: number, lo: number, hi: number) => {
    if (v >= lo && v <= hi) out.push({ ...s, [k]: v });
  };
  add('lb', s.lb - 1, 1, CAPACITY_LB_MAX);
  add('lb', s.lb + 1, 1, CAPACITY_LB_MAX);
  add('app', s.app - 1, 1, CAPACITY_APP_MAX);
  add('app', s.app + 1, 1, CAPACITY_APP_MAX);
  add('replicas', s.replicas - 1, 0, CAPACITY_REPLICAS_MAX);
  add('replicas', s.replicas + 1, 0, CAPACITY_REPLICAS_MAX);
  out.push(
    { ...s, size: s.size === CAPACITY_SIZES[0] ? CAPACITY_SIZES[1] : CAPACITY_SIZES[0] },
    { ...s, cache: 1 - s.cache },
    { ...s, zone: 1 - s.zone },
    { ...s, slow: 1 - s.slow },
  );
  return out;
}

/**
 * What each box must hold at width `W`: the most any setting needs, at rest, with every lane hidden, and with a ghost of
 * each one-change neighbor, so the stage's height depends on its width alone. It walks thousands of settings, so the
 * stage reads `reserve`'s table instead, which the layout spec holds to this.
 */
export function planReserve(W: number): Reserve {
  const g = geometry(W);
  const n: Reserve = { lb: 0, app: 0, db: 0, sink: 0 };
  const take = (p: Plan) => {
    for (const k of ['lb', 'app', 'db', 'sink'] as const) n[k] = Math.max(n[k], p.content[k]);
  };
  for (const s of reserveSettings()) {
    const r = capacityRun(s);
    for (const hid of [NOTHING_HIDDEN, ALL_HIDDEN, { ...ALL_HIDDEN, replay: false }]) take(planStage(g, r, hid, null));
    // A ghost is the setting before one change: words move into a status only where a lane's labels find no room.
    const plain = TIERS.map((id) => laneInfo(g, r, id, NOTHING_HIDDEN, null));
    for (const before of neighbors(s)) {
      const was = capacityRun(before);
      const moved = TIERS.some((id, i) => {
        const L = laneInfo(g, r, id, NOTHING_HIDDEN, was);
        return L.wasInStatus !== null || L.limitInStatus !== plain[i].limitInStatus;
      });
      if (moved) take(planStage(g, r, NOTHING_HIDDEN, was));
    }
  }
  return n;
}

/** The narrowest stage the widget lays out for. */
export const MIN_WIDTH = 248;

/** Each box's reserved content height at width `W`, from the table of the widths where it changes. */
export function reserve(W: number): Reserve {
  let row = CAPACITY_RESERVES[0];
  for (const next of CAPACITY_RESERVES) {
    if (next[0] > W) break;
    row = next;
  }
  return { lb: row[1], app: row[2], db: row[3], sink: row[4] };
}
