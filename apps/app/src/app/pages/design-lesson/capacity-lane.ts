import { capacityZoneLane, type CapacityRun, type CapacityTierId } from '@grasp/engine';
import { LANE_H, TEXT, pastAxis, tw, xferEnd, zoneStrip, type Geometry, type LaneInfo, type ZoneGroup } from './capacity-plan';
import { SHED, type Hid, type Role } from './capacity-words';
import { StageDraw, r1, type Prim } from './stage-draw';

export type Layer = 'band' | 'boxes' | 'lanes' | 'marks' | 'text' | 'top';
const LAYERS: readonly Layer[] = ['band', 'boxes', 'lanes', 'marks', 'text', 'top'];
/** The Capacity & Scaling stage's drawing: its roles and layers on the shared `StageDraw`. */
export class Draw extends StageDraw<Role, Layer> {
  constructor(W: number) {
    super(W, TEXT, LAYERS);
  }
}

/** A critical ×, on a ground of the stage's color or its box's. */
export function xGlyph(D: Draw, id: string, cx: number, cy: number, owner: string, s = 4, onBox = false, layer: Layer = 'marks'): void {
  D.add(layer, `${id}-ground`, { k: 'circle', cls: onBox ? 'xground on-box' : 'xground', cx: r1(cx), cy: r1(cy), r: s + 3 });
  D.add(layer, id, {
    k: 'path',
    cls: 'xmark',
    owner,
    d: `M${r1(cx - s)} ${r1(cy - s)}l${2 * s} ${2 * s}M${r1(cx + s)} ${r1(cy - s)}l${-2 * s} ${2 * s}`,
  });
  D.mark({ x0: cx - s - 2, x1: cx + s + 2, y0: cy - s - 2, y1: cy + s + 2 }, owner);
}

/** A lane as drawn, for the layout spec and a play's motion. */
export interface LaneMeta {
  kind: LaneInfo['kind'];
  y: number;
  h: number;
  /** The lane's end: its limit on the axis, or the axis's end where the lane is cut. */
  x1: number;
  cut: boolean;
  /** One per instance up that starts on the axis, in drawn order: its stable id, left edge and drawn width. */
  segs: { id: string; x0: number; w: number }[];
  /** One instance's whole width, which a cut segment's drawn width falls short of. */
  each: number;
  /** How far each instance's load reaches from its left edge, in px, and the writes' part of it; a cut segment clips both. */
  fill: number;
  writes: number;
  util: number;
  zones: ZoneGroup[];
  /** The zones named at the lane's end, past the axis. */
  pastZones: string[];
  /** A cut lane's headroom meter: its left edge, width, and how far its load and its writes' part reach in it. */
  meter: { x0: number; w: number; fill: number; writes: number } | null;
  /** No mark on the lane's row reaches this x. */
  clear: number;
}

/**
 * A lane's loads, drawn apart from the stage's other marks so a play can ease them by transform: each instance's load
 * (its fill, the tooth of the stream above it and the hidden split) is a group drawn from the instance's left edge, so a
 * change in load is one scale of that group from its left; its writes' hatch is a second group, since its share moves
 * by its own amount. Nothing an instance draws leaves its own segment.
 */
export interface LaneGroup {
  id: CapacityTierId;
  loads: { inst: string; fills: Prim[]; writes: Prim[] }[];
}

/** Heat by load (REDESIGN.md 3.6): current under 50%, then the three heat steps, critical when full and shedding. */
export const heatOf = (u: number, shed: boolean) => (shed ? 'full' : u < 0.5 ? 'lo' : u < 0.7 ? 'h1' : u < 0.85 ? 'h2' : 'h3');

/**
 * A row of instance segments on the axis: each as wide as its share of the limit, filled to how busy it is, with a 70%
 * notch; then its shed, its limit and its ghost in the row's empty track. `boxTop` is where the stream pours in.
 */
export function drawLane(
  D: Draw,
  g: Geometry,
  id: CapacityTierId,
  y: number,
  boxTop: number,
  L: LaneInfo,
  r: CapacityRun,
  hid: Hid,
): { meta: LaneMeta; group: LaneGroup } {
  const t = r[id];
  const owner = `lane-${id}`;
  const h = LANE_H;
  const meta: LaneMeta = {
    kind: L.kind,
    y,
    h,
    x1: g.xa,
    cut: false,
    segs: [],
    each: 0,
    fill: 0,
    writes: 0,
    util: t.util,
    zones: [],
    pastZones: [],
    meter: null,
    clear: L.clear,
  };
  const group: LaneGroup = { id, loads: [] };
  if (L.kind === 'hidden') {
    D.add('lanes', `lane-hidden-${id}`, { k: 'rect', cls: 'lane-hidden', x: g.xa, y, w: g.xb - g.xa, h, rx: 3 });
    D.mark({ x0: g.xa, x1: g.xb, y0: y, y1: y + h }, owner);
    D.text(`lane-${id}-hidden`, (g.xa + g.xb) / 2, y + h / 2 + 4, [['after your answer', 'small']], {
      anchor: 'middle',
      owner,
      cls: 'on-box',
    });
    return { meta, group };
  }
  // No instance up: the block's words follow its divider at once (`laneSlot`), so the lane has no row to draw.
  if (L.kind === 'none') return { meta: { ...meta, h: 0 }, group };
  if (L.kind === 'lostAll') {
    const w = Math.min(90, g.xb - g.xa);
    D.add('lanes', `lostall-${id}`, { k: 'rect', cls: 'seg lost', x: g.xa, y, w, h, rx: 2 });
    xGlyph(D, `lostx-${id}`, g.xa + w / 2, y + h / 2, owner, 4, true);
    D.mark({ x0: g.xa, x1: g.xa + w, y0: y, y1: y + h }, owner);
    return { meta, group };
  }
  // The axis's gridlines run through the lane's row, behind its instances, and break around a word in its track.
  const words: [number, number][] = [];
  if (L.limitLabel?.place === 'row') words.push([L.limitLabel.x, L.limitLabel.x + tw(L.limitLabel.text, 'small')]);
  const gl = L.ghost?.label;
  if (gl?.place === 'row') {
    const w = tw(gl.text, 'small');
    words.push(gl.anchor === 'end' ? [gl.x - w, gl.x] : [gl.x, gl.x + w]);
  }
  for (const v of g.ticks.slice(1, -1)) {
    const gx = r1(g.x(v));
    const cut = words.some(([a, b]) => gx > a - 3 && gx < b + 3);
    D.add('lanes', `grid-${id}-${v}`, {
      k: 'path',
      cls: 'gridline',
      owner: 'grid',
      d: cut ? `M${gx} ${y - 3}V${y + 5}M${gx} ${y + h - 3}V${y + h + 3}` : `M${gx} ${y - 3}V${y + h + 3}`,
    });
    D.link(
      cut
        ? [
            [gx, y - 3],
            [gx, y + 5],
            [gx, y + h - 3],
            [gx, y + h + 3],
          ]
        : [
            [gx, y - 3],
            [gx, y + h / 2],
            [gx, y + h + 3],
          ],
      'grid',
    );
  }
  const ids = id === 'primary' ? ['primary'] : capacityZoneLane(id, r[id].n, !!r.settings.zone).up.map((x) => x.id);
  const count = ids.length;
  const each = t.ceiling / count;
  const u = Math.min(1, t.util);
  const writesU = id === 'primary' ? r.primary.writesUtil : id === 'replicas' ? r.replicas.replayUtil : 0;
  const heat = heatOf(t.util, t.shed > SHED);
  const full = each * g.k - (count > 1 ? 1 : 0);
  meta.each = full;
  meta.fill = full * u;
  // Whether a load is painted is the lane's call, not each segment's: their widths differ by rounding alone.
  const paint = meta.fill > 0.2;
  let notches = '';
  ids.forEach((inst, i) => {
    const x0 = g.x(i * each);
    if (pastAxis(g, i * each)) return;
    const w = pastAxis(g, (i + 1) * each) ? g.xb - x0 : g.x((i + 1) * each) - (count > 1 ? 1 : 0) - x0;
    if (w < 0.5) return;
    const fillW = Math.min(w, meta.fill);
    meta.segs.push({ id: inst, x0, w });
    D.add('lanes', `seg-${inst}`, { k: 'rect', cls: 'seg', x: r1(x0), y, w: r1(w), h, rx: w > 6 ? 2 : 0 });
    if (paint) {
      const load: LaneGroup['loads'][number] = { inst, fills: [], writes: [] };
      group.loads.push(load);
      const [fx, fw] = [r1(x0), r1(fillW)];
      load.fills.push({ k: 'rect', id: `fill-${inst}`, cls: `fill ${heat}`, x: fx, y, w: fw, h, rx: 0 });
      // The stream pours into the lane as a comb: one tooth on each instance's load.
      load.fills.push({ k: 'rect', id: `tooth-${inst}`, cls: 'band stub', x: fx, y: boxTop + 0.5, w: fw, h: y - boxTop - 0.5, rx: 0 });
      if (id === 'replicas' && hid.replay)
        // What a replica does beyond its reads waits for the answer: a neutral pattern, not a solid fill that would
        // claim it replays nothing.
        load.fills.push({ k: 'rect', id: `split-${inst}`, cls: 'split-hidden', x: fx, y, w: fw, h, rx: 0 });
      else if (writesU > 1e-9 && u > 0) {
        meta.writes = meta.fill * Math.min(1, writesU / u);
        const ww = Math.min(w, meta.writes);
        if (ww > 0.2) load.writes.push({ k: 'rect', id: `writes-${inst}`, cls: 'writes-hatch', x: fx, y, w: r1(ww), h, rx: 0 });
      }
    }
    if (full >= 6 && 0.7 * full < w - 1 && x0 + 0.7 * full < L.clear) {
      const tx = r1(x0 + 0.7 * full);
      notches += `M${tx} ${y}v5M${tx} ${y + h - 5}v5`;
    }
  });
  if (L.meter) {
    // The cut hides the instance's headroom, so it ends in a meter of its whole width, on the box's ground, dimmed past
    // where the axis ends so its lit part reads as the lane does.
    const { x0, w } = L.meter;
    const my = y + 6;
    const mh = h - 12;
    const writes = writesU > 1e-9 && !(id === 'replicas' && hid.replay) ? w * Math.min(u, writesU) : 0;
    const axis = (w * g.max) / each;
    meta.meter = { x0, w, fill: w * u, writes };
    D.add('marks', `meter-ground-${id}`, { k: 'rect', cls: 'meter-ground', x: x0 - 3, y: y + 3, w: w + 6, h: h - 6, rx: 2 });
    D.add('marks', `meter-${id}`, { k: 'rect', cls: 'seg', x: x0, y: my, w, h: mh, rx: 1 });
    if (meta.meter.fill > 0.2)
      D.add('marks', `meter-fill-${id}`, { k: 'rect', cls: `fill ${heat} meter-fill`, x: x0, y: my, w: r1(meta.meter.fill), h: mh, rx: 0 });
    if (writes > 0.2)
      D.add('marks', `meter-writes-${id}`, { k: 'rect', cls: 'writes-hatch meter-fill', x: x0, y: my, w: r1(writes), h: mh, rx: 0 });
    D.add('marks', `meter-past-${id}`, { k: 'rect', cls: 'meter-past', x: r1(x0 + axis), y: my, w: r1(w - axis), h: mh, rx: 0 });
    const tx = r1(x0 + 0.7 * w);
    D.add('marks', `meter-notch-${id}`, { k: 'path', cls: 'target', d: `M${tx} ${my - 2}V${my + mh + 2}` });
    D.mark({ x0: x0 - 3, x1: x0 + w + 3, y0: y + 3, y1: y + h - 3 }, owner);
  }
  if (notches) {
    D.add('marks', `notch-under-${id}`, { k: 'path', cls: 'target-under', d: notches });
    D.add('marks', `notch-${id}`, { k: 'path', cls: 'target', d: notches });
  }
  const end = g.x(t.ceiling);
  meta.x1 = end;
  meta.cut = L.cut;
  // A cut lane ends in a break, two strokes across it, rather than a limit's cap.
  if (meta.cut) {
    const d = `M${r1(end - 7)} ${y + h + 3}l5 ${-h - 6}M${r1(end - 2)} ${y + h + 3}l5 ${-h - 6}`;
    D.add('marks', `break-under-${id}`, { k: 'path', cls: 'break-under', d });
    D.add('marks', `break-${id}`, { k: 'path', cls: 'lane-break', d });
  } else D.add('marks', `cap-${id}`, { k: 'line', cls: 'lane-cap', x1: r1(end), y1: y - 2, x2: r1(end), y2: y + h + 2 });
  D.mark({ x0: g.xa, x1: meta.cut ? end + 3 : end, y0: y, y1: y + h }, owner);
  if (L.shed) {
    D.add('lanes', `shed-${id}`, {
      k: 'rect',
      cls: 'shed-block',
      x: r1(L.shed.x0),
      y: y + 1,
      w: r1(L.shed.x1 - L.shed.x0),
      h: h - 2,
      rx: 0,
    });
    D.mark({ x0: L.shed.x0, x1: L.shed.x1, y0: y, y1: y + h }, owner);
    xGlyph(D, `shedx-${id}`, L.shed.xMark, y + h / 2, owner, 4, true);
  }
  if (L.limitLabel)
    D.text(`limit-${id}`, L.limitLabel.x, L.limitLabel.place === 'strip' ? y + h + 15 : y + h / 2 + 4, [[L.limitLabel.text, 'small']], {
      owner,
      cls: 'on-box',
    });
  // Where this tier's limit falls if zone A fails: a dashed critical tick, at rest and in the challenge.
  if (L.zoneTick !== null) {
    const zx = r1(L.zoneTick);
    D.add('marks', `zonetick-${id}`, { k: 'line', cls: 'zone-tick', owner: 'zone', x1: zx, y1: y - 4, x2: zx, y2: y + h + 3 });
    D.link(
      [
        [zx, y - 4],
        [zx, y + h / 2],
        [zx, y + h + 3],
      ],
      'zone',
    );
  }
  if (L.ghost) {
    const x = r1(L.ghost.x);
    if (L.ghost.tick) {
      D.add('top', `ghost-under-${id}`, { k: 'line', cls: 'ghost-under', x1: x, y1: y - 4, x2: x, y2: y + h + 2 });
      D.add('top', `ghost-${id}`, { k: 'line', cls: 'ghost-tick', owner: `ghost-${id}`, x1: x, y1: y - 4, x2: x, y2: y + h + 2 });
      D.link(
        [
          [x, y - 4],
          [x, y + h / 2],
          [x, y + h + 2],
        ],
        `ghost-${id}`,
      );
    }
    if (L.ghost.label)
      D.text(
        `ghost-label-${id}`,
        L.ghost.label.x,
        L.ghost.label.place === 'strip' ? y + h + 15 : y + h / 2 + 4,
        [[L.ghost.label.text, 'small']],
        {
          owner: `ghost-${id}`,
          anchor: L.ghost.label.anchor,
          cls: 'on-box',
        },
      );
  }
  return { meta, group };
}

/**
 * Under a lane: its instances' zones (`zoneStrip`: each zone's group underlined and lettered, the lost group hatched
 * after the survivors), or under the primary, the step from its machine's queries to its limit in requests.
 */
export function drawStrip(
  D: Draw,
  g: Geometry,
  id: CapacityTierId,
  y: number,
  L: LaneInfo,
  r: CapacityRun,
  hid: Hid,
  meta: LaneMeta,
): void {
  const s = r.settings;
  if (id === 'primary') {
    if (L.kind !== 'normal') return;
    const xs = g.x(s.size);
    const xe = xferEnd(g, L, r.primary.ceiling);
    const ay = y + 6;
    const tip = xe + (xe > xs ? -1 : 1);
    const back = xe > xs ? -6 : 6;
    D.add('marks', 'xfer-tail', { k: 'line', cls: 'xfer-tail', x1: r1(xs), y1: y + 2, x2: r1(xs), y2: y + 10 });
    D.add('marks', 'xfer', { k: 'line', cls: 'xfer', owner: 'xfer', x1: r1(xs), y1: ay, x2: r1(tip + back / 2), y2: ay });
    D.add('marks', 'xfer-head', { k: 'path', cls: 'xfer-head', owner: 'xfer', d: `M${r1(tip)} ${ay}l${back} -3v6z` });
    D.mark({ x0: Math.min(xs, xe) - 1, x1: Math.max(xs, xe) + 1, y0: y + 2, y1: y + 10 }, 'xfer');
    if (L.xfer) D.text('xfer-label', L.xfer.x, y + 11, [[L.xfer.text, 'small']], { owner: 'xfer', cls: 'on-box', anchor: L.xfer.anchor });
    return;
  }
  const zs = zoneStrip(g, r, id, hid);
  if (!zs) return;
  for (const x of zs.lost)
    D.add('lanes', `lost-${x.id}`, {
      k: 'rect',
      cls: 'seg lost',
      x: r1(x.x0),
      y: y + 1,
      w: r1(Math.max(0, x.x1 - x.x0 - (x.count > 1 || x.x1 >= g.xb - 0.5 ? 0 : 1))),
      h: 5,
      rx: 0,
    });
  for (const gr of zs.groups) {
    const key = gr.lost ? `${gr.zone}-lost` : gr.zone;
    if (!gr.lost)
      D.add('lanes', `zoneline-${id}-${key}`, {
        k: 'line',
        cls: 'zone-line',
        owner: `zone-${id}`,
        x1: r1(gr.x0 + 1),
        y1: y + 2.5,
        x2: r1(gr.x1 - 2),
        y2: y + 2.5,
      });
    D.mark({ x0: gr.x0, x1: gr.x1, y0: y + 1, y1: y + 6 }, `zone-${id}`);
    if (zs.lettered)
      D.text(`zone-${id}-${key}`, gr.lx, y + 15, [[gr.zone, 'small']], {
        anchor: 'middle',
        owner: `zone-${id}`,
        cls: 'on-box',
      });
  }
  if (zs.past)
    D.text(`zone-past-${id}`, zs.past.x, y + 15, [[zs.past.text, 'small']], { anchor: 'end', owner: `zone-${id}`, cls: 'on-box' });
  meta.zones = zs.groups;
  meta.pastZones = zs.past?.zones ?? [];
}
