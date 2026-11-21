import {
  CAPACITY_APP_MAX,
  CAPACITY_AXIS_MAX,
  CAPACITY_LB_MAX,
  CAPACITY_REPLICAS_MAX,
  CAPACITY_SIZES,
  CAPACITY_TRAFFIC,
  CAPACITY_WORKERS,
  capacityRun,
  type CapacityRun,
  type CapacitySettings,
  type CapacityTierId,
} from '@grasp/engine';
import { Draw, drawLane, drawStrip, heatOf, xGlyph, type LaneGroup, type LaneMeta } from './capacity-lane';
import {
  DIVIDER_GAP,
  GAP,
  LANE_H,
  LANE_Y,
  FLEET_CLEAR,
  LINE,
  PAD_BOTTOM,
  geometry,
  laneSlot,
  meterWidth,
  planStage,
  reserve,
  tw,
  type Geometry,
  type Header,
  type Plan,
} from './capacity-plan';
import { POOL_LABEL, SHED, TITLES, fn, poolBinds, poolHidden, summary, type Hid, type Words } from './capacity-words';
import { TAG, type Focus } from './focus-layout';
import { r1, sampleLine } from './stage-draw';

export interface StageView {
  hid: Hid;
  /** The setting before the last change, whose limits show as ghosts; never while a question asks. */
  ghost: CapacitySettings | null;
  /** Play, the handle and every stepper wait: a question asks or its answer plays. */
  locked: boolean;
  /** A play's stream marks: the × each red part of the stream lands on. */
  playMarks: boolean;
  /** The tier a play's climax ring points at, in the gap above it. */
  ring: CapacityTierId | null;
  focus: readonly string[];
}
export const REST_VIEW = { ghost: null, locked: false, playMarks: false, ring: null, focus: [] } as const;

export type GapId = 'lb' | 'app' | 'db' | 'sink';
/** The stream between two boxes: what flows on, and at its right what the next tier sheds. */
export interface Gap {
  nextId: GapId;
  y0: number;
  y1: number;
  x0: number;
  /** Where the stream ends, and where the part the next tier passes ends. */
  x1: number;
  xPass: number;
  flow: number;
  shedNext: number;
  /** The landing point of the red part's particles; null where nothing is shed. */
  xMark: number | null;
}
export interface Step {
  id: string;
  tier: CapacityTierId;
  dir: -1 | 1;
  x: number;
  y: number;
  label: string;
  disabled: boolean;
}
export interface Stage {
  D: Draw;
  H: number;
  g: Geometry;
  play: { x: number; y: number };
  traffic: { positions: number[]; y: number };
  steps: Step[];
  groups: LaneGroup[];
  focus: (Focus & { region: string })[];
  summary: string;
  lanes: Record<CapacityTierId, LaneMeta>;
  gaps: Gap[];
  boxes: { id: 'lb' | 'app' | 'db'; top: number; bottom: number }[];
  ghosts: { id: CapacityTierId; labelled: boolean; old: number }[];
  /** The baselines of each box's lines of words, for the spec's check that they stack with no hole. */
  rows: Record<string, number[]>;
  /** The traffic and what is served at the setting drawn, in requests a second. */
  offered: number;
  served: number;
  /** The served bar's width, the pool's filled cells out of 100, and whether it is drawn critical. */
  sink: number;
  pool: { filled: number; critical: boolean; hidden: boolean };
  plan: Plan;
  hid: Hid;
}

type LegendItem = readonly [kind: string, text: string, swatch: number];
const LEGEND: readonly LegendItem[] = [
  ['band', 'requests', 14],
  ['busy', 'busy: under 50 · 70 · 85% · shedding', 30],
  ['track', 'spare, 70% mark', 20],
  ['writes', 'writes', 14],
  ['lost', 'lost', 14],
  ['shed', 'shed', 14],
  ['zone', 'if zone A fails', 8],
];
/** Where lanes can be cut, a cut lane's meter: one whole machine, dimmed past the axis's end. */
const METER_KEY: LegendItem = ['meter', 'whole machine, dim past the cut', 22];
const legendOf = (g: Geometry): readonly LegendItem[] => (g.max < CAPACITY_AXIS_MAX ? [...LEGEND, METER_KEY] : LEGEND);
const itemWidth = (it: LegendItem) => it[2] + 4 + tw(it[1], 'small');

/** Splits the legend, in order, into the fewest rows that fit, then the most even of those. */
export function legendRows(items: readonly LegendItem[], maxW: number): [number, number][] {
  const n = items.length;
  const rowW = (a: number, b: number) => items.slice(a, b).reduce((s, it, i) => s + itemWidth(it) + (i ? 12 : 0), 0);
  for (let k = 1; k <= n; k++) {
    let best: { rows: [number, number][]; max: number } | null = null;
    const cuts = (start: number, left: number, acc: [number, number][]) => {
      if (left === 1) {
        const rows: [number, number][] = [...acc, [start, n]];
        const max = Math.max(...rows.map(([a, b]) => rowW(a, b)));
        if (max <= maxW && (!best || max < best.max)) best = { rows, max };
        return;
      }
      for (let c = start + 1; c <= n - left + 1; c++) cuts(c, left - 1, [...acc, [start, c]]);
    };
    cuts(0, k, []);
    if (best) return (best as { rows: [number, number][] }).rows;
  }
  return items.map((_, i) => [i, i + 1]);
}

function legendSwatch(D: Draw, kind: string, x: number, y: number) {
  const id = `key-${kind}`;
  const rect = (suffix: string, cls: string, rx: number, ry: number, w: number, h: number) =>
    D.add('marks', `${id}${suffix}`, { k: 'rect', cls, x: rx, y: ry, w, h, rx: 0 });
  if (kind === 'band') {
    rect('', 'band', x, y - 8, 14, 9);
    D.add('marks', `${id}-a`, { k: 'circle', cls: 'dot req', cx: x + 4, cy: y - 3.5, r: 2 });
    D.add('marks', `${id}-b`, { k: 'circle', cls: 'dot req', cx: x + 10, cy: y - 3.5, r: 2 });
  } else if (kind === 'busy') ['lo', 'h1', 'h2', 'h3', 'full'].forEach((h, i) => rect(`-${h}`, `fill ${h}`, x + i * 6, y - 8, 6, 9));
  else if (kind === 'track') {
    rect('', 'swatch-track', x + 0.5, y - 7.5, 19, 8);
    D.add('marks', `${id}-under`, { k: 'line', cls: 'target-under', x1: x + 14, y1: y - 8, x2: x + 14, y2: y + 1 });
    D.add('marks', `${id}-mark`, { k: 'line', cls: 'target', x1: x + 14, y1: y - 8, x2: x + 14, y2: y + 1 });
  } else if (kind === 'writes') rect('', 'writes-key', x, y - 8, 14, 9);
  else if (kind === 'lost') rect('', 'seg lost', x + 0.5, y - 7.5, 13, 8);
  else if (kind === 'zone') D.add('marks', id, { k: 'line', cls: 'zone-tick', x1: x + 4, y1: y - 10, x2: x + 4, y2: y + 2 });
  else if (kind === 'meter') {
    rect('', 'seg', x + 0.5, y - 7.5, 21, 8);
    rect('-fill', 'fill h1', x + 0.5, y - 7.5, 8, 8);
    rect('-past', 'meter-past', x + 12, y - 7.5, 9.5, 8);
  } else xGlyph(D, id, x + 7, y - 3.5, 'legend', 3.5);
  D.mark({ x0: x, x1: x + (kind === 'meter' ? 22 : 14), y0: y - 9, y1: y + 1 }, 'legend');
}

/** Draws the legend in balanced rows from `(x0, y)`; returns its last row's baseline. */
function drawLegend(D: Draw, items: readonly LegendItem[], x0: number, y: number, maxW: number): number {
  const rows = legendRows(items, maxW);
  rows.forEach(([a, b], ri) => {
    let x = x0;
    for (const it of items.slice(a, b)) {
      legendSwatch(D, it[0], x, y + ri * 18);
      D.text(`legend-${it[0]}`, x + it[2] + 4, y + ri * 18, [[it[1], 'small']], { owner: 'legend' });
      x += itemWidth(it) + 12;
    }
  });
  return y + (rows.length - 1) * 18;
}

function drawHeader(D: Draw, g: Geometry, top: number, hd: Header, id: CapacityTierId) {
  if (hd.one) {
    D.text(`name-${id}`, g.xa, top + 27, [[hd.name, 'label']], { owner: id, cls: 'on-box' });
    D.text(`fleet-${id}`, g.xa + tw(hd.name, 'label') + 10, top + 27, hd.fleet[0], { owner: id, cls: 'on-box' });
  } else {
    D.text(`name-${id}`, g.xa, top + 19, [[hd.name, 'label']], { owner: id, cls: 'on-box' });
    // Lines under the first clear the steppers' 44 px targets by 2 px.
    hd.fleet.forEach((ln, i) => {
      if (ln.length)
        D.text(i ? `fleet-${id}-${i}` : `fleet-${id}`, g.xa, top + 36 + i * LINE + (i ? FLEET_CLEAR : 0), ln, { owner: id, cls: 'on-box' });
    });
  }
  for (const i of [0, 1]) D.mark({ x0: g.stepX + i * 44 + 6, x1: g.stepX + i * 44 + 38, y0: top + 6, y1: top + 38 }, `step-${id}`);
}

/**
 * The Capacity & Scaling stage at width `W`, read top to bottom as the requests travel: the traffic, then each tier's
 * box with the stream in the gaps between them, then what is served. Every horizontal position is on one axis in
 * requests a second. Each box starts where the boxes above it reserve the most any setting needs at this width, and its
 * border hugs its own words: the slack is stream, in the gap under it.
 */
export function buildStage(W: number, r: CapacityRun, view: StageView): Stage {
  const g = geometry(W);
  const D = new Draw(W);
  const hid = view.hid;
  const res = reserve(W);
  const s = r.settings;
  const lw = g.xb - g.xa;
  const ghostRun = view.ghost ? capacityRun(view.ghost) : null;
  const P = planStage(g, r, hid, ghostRun);
  const rows: Record<string, number[]> = {};
  const lanes = {} as Record<CapacityTierId, LaneMeta>;
  const groups: LaneGroup[] = [];
  const ghosts: Stage['ghosts'] = [];
  const steps: Step[] = [];
  const lines = (id: string, x: number, y: number, list: readonly Words[], owner: string, row: string | null, cls = 'on-box') =>
    list.forEach((ln, i) => {
      D.text(`${id}-${i}`, x, y + i * LINE, ln, { owner, cls });
      if (row) (rows[row] ??= []).push(y + i * LINE);
    });

  // Header: Play, the title and the legend, beside the title when all of it fits, else in rows under it.
  const play = { x: g.pad - 4, y: 4 };
  D.mark({ x0: g.pad, x1: g.pad + 36, y0: 8, y1: 44 }, 'play');
  const titleX = g.pad + 46;
  const title = TITLES.find((t) => titleX + tw(t, 'capB') <= W - g.pad) ?? TITLES[TITLES.length - 1];
  D.text('title', titleX, 31, [[title, 'capB']], { owner: 'title' });
  const legend = legendOf(g);
  const oneRow = legend.reduce((a, it, i) => a + itemWidth(it) + (i ? 12 : 0), 0);
  let headerBottom = 46;
  if (titleX + tw(title, 'capB') + 20 + oneRow <= W - g.pad) drawLegend(D, legend, W - g.pad - oneRow, 31, oneRow);
  else headerBottom = drawLegend(D, legend, g.pad, 66, W - 2 * g.pad) + 8;

  // Traffic: the handle sets the offered rate on the shared axis; the stream starts at its width.
  const yL = headerBottom + 20;
  D.text('traffic-label', g.xa, yL, [['Traffic', 'label']], { owner: 'traffic' });
  const valueX = g.xa + tw('Traffic', 'label') + 8;
  const units = [' requests a second', ' requests/s', '/s'];
  const unit = units.find((u) => valueX + tw(fn(s.traffic) + u, 'capB') <= W - g.pad) ?? units[units.length - 1];
  D.text('traffic-value', valueX, yL, [[fn(s.traffic) + unit, 'capB']], { owner: 'traffic' });
  const yT = yL + 30;
  const tMax = CAPACITY_TRAFFIC[CAPACITY_TRAFFIC.length - 1];
  D.add('marks', 'rail', { k: 'line', cls: 'rail', x1: g.x(0), y1: yT, x2: r1(g.x(tMax)), y2: yT });
  D.add('marks', 'rail-fill', { k: 'rect', cls: 'rail-fill', x: g.x(0), y: yT - 2, w: r1(g.x(s.traffic) - g.x(0)), h: 4, rx: 2 });
  for (const t of CAPACITY_TRAFFIC)
    if (t !== s.traffic) D.add('marks', `stop-${t}`, { k: 'circle', cls: 'stop', cx: r1(g.x(t)), cy: yT, r: 1.5 });
  D.mark({ x0: g.x(0) - 2, x1: g.x(tMax) + 2, y0: yT - 3, y1: yT + 3 }, 'handle');
  const yTick = yT + 33;
  for (const v of g.ticks) D.text(`xtick-${v}`, g.x(v), yTick, [[fn(v), 'small']], { anchor: v ? 'middle' : 'start', owner: 'axis' });
  D.region('traffic', { x: g.pad, y: yL - 16, w: W - 2 * g.pad, h: yTick + 6 - (yL - 16) });

  // The boxes, top to bottom, with the stream in the gaps between them. Each block's lane sits at its top, where the
  // stream pours in; its zones, name, steppers and words follow, packed top-down, the slack at the box's foot.
  const boxes: Stage['boxes'] = [];
  const gaps: Gap[] = [];
  const gap = (nextId: GapId, y0: number, y1: number, flow: number, shed: number) => {
    const shedNext = shed > SHED ? shed : 0;
    gaps.push({ nextId, y0, y1, x0: g.xa, x1: g.x(flow), xPass: g.x(flow - shedNext), flow, shedNext, xMark: null });
  };
  const block = (id: CapacityTierId, top: number, stepLabels: readonly [string, string], ends: readonly [boolean, boolean]) => {
    const b = P.blocks[id];
    const laneY = top + LANE_Y;
    const drawn = drawLane(D, g, id, laneY, top, b.L, r, hid);
    lanes[id] = drawn.meta;
    groups.push(drawn.group);
    if (b.L.ghost) ghosts.push({ id, labelled: !!b.L.ghost.label || b.L.wasInStatus !== null, old: b.L.ghost.old });
    drawStrip(D, g, id, laneY + LANE_H, b.L, r, hid, drawn.meta);
    const hTop = top + laneSlot(b.L);
    drawHeader(D, g, hTop, b.header, id);
    ([-1, 1] as const).forEach((dir, i) =>
      steps.push({
        id: `${id}-${dir < 0 ? 'less' : 'more'}`,
        tier: id,
        dir,
        x: g.stepX + i * 44,
        y: hTop,
        label: stepLabels[i],
        disabled: view.locked || ends[i],
      }),
    );
    const base = hTop + b.header.h + 13;
    lines(`status-${id}`, g.xa, base, b.status, id, id);
    let last = base + (b.status.length - 1) * LINE;
    if (b.conv.length) {
      lines(`conv-${id}`, g.xa, last + LINE, b.conv, id, id);
      last += b.conv.length * LINE;
    }
    return last;
  };
  const top0 = yTick + 10;

  const lbTop = top0 + GAP;
  gap('lb', top0, lbTop, r.offered, r.lb.shed);
  block('lb', lbTop, ['Fewer load balancers', 'More load balancers'], [s.lb <= 1, s.lb >= CAPACITY_LB_MAX]);
  const lbBottom = lbTop + P.content.lb + PAD_BOTTOM;
  boxes.push({ id: 'lb', top: lbTop, bottom: lbBottom });

  // App servers, with one server's worker pool: 100 workers in ten blocks of ten, named beside it (or above it where
  // that does not fit); Little's law under it.
  const appTop = lbTop + res.lb + PAD_BOTTOM + GAP;
  gap('app', lbBottom, appTop, r.lb.passed, r.app.shed);
  let yy = block('app', appTop, ['Fewer app servers', 'More app servers'], [s.app <= 1, s.app >= CAPACITY_APP_MAX]);
  const mw = meterWidth(g);
  yy += LINE + 6;
  if (!P.poolBeside) {
    D.text('pool-label', g.xa, yy, [[POOL_LABEL[1], 'label']], { owner: 'workers', cls: 'on-box' });
    rows['app'].push(yy);
    yy += 15;
  }
  const wTop = yy - 9;
  const hideW = poolHidden(hid);
  const filled = r.app.up && !hideW ? Math.round((r.app.inFlight / CAPACITY_WORKERS) * 100) : 0;
  const cellW = (mw - 9 * 2) / 10;
  const critical = poolBinds(r) && !hideW;
  const meterHeat = critical ? 'full' : heatOf(r.app.inFlight / CAPACITY_WORKERS, false);
  for (let b = 0; b < 10; b++) {
    const bx = r1(g.xa + b * (cellW + 2));
    D.add('lanes', `cell-${b}`, { k: 'rect', cls: hideW ? 'lane-hidden' : 'meter-cell', x: bx, y: wTop, w: r1(cellW), h: 10, rx: 0 });
    const f = Math.max(0, Math.min(10, filled - b * 10)) / 10;
    if (f > 0) D.add('marks', `pool-fill-${b}`, { k: 'rect', cls: `fill ${meterHeat}`, x: bx, y: wTop, w: r1(cellW * f), h: 10, rx: 0 });
  }
  D.mark({ x0: g.xa, x1: g.xa + mw, y0: wTop, y1: wTop + 10 }, 'workers');
  if (P.poolBeside) {
    D.text('pool-label', g.xa + mw + 10, yy, [[POOL_LABEL[0], 'label']], { owner: 'workers', cls: 'on-box' });
    rows['app'].push(yy);
  }
  yy += LINE + 2;
  lines('workers', g.xa, yy, P.pool, 'workers', 'app');
  const poolTop = wTop - 6 - (P.poolBeside ? 0 : 15);
  D.region('workers', { x: g.xa - 6, y: poolTop, w: lw + 12, h: yy + (P.pool.length - 1) * LINE + 6 - poolTop });
  const appBottom = appTop + P.content.app + PAD_BOTTOM;
  boxes.push({ id: 'app', top: appTop, bottom: appBottom });

  // The database: the primary (machine size) and the replicas, one admission, then the cache line.
  const dbTop = appTop + res.app + PAD_BOTTOM + GAP;
  gap('db', appBottom, dbTop, r.app.passed, r.primary.shed + r.replicas.shed);
  const sizes = CAPACITY_SIZES;
  yy = block(
    'primary',
    dbTop,
    ['A smaller database machine', 'A bigger database machine'],
    [s.size <= sizes[0], s.size >= sizes[sizes.length - 1]],
  );
  D.region('primary', { x: g.pad + 6, y: dbTop + 4, w: W - 2 * g.pad - 12, h: yy + 8 - dbTop - 4 });
  const repTop = yy + DIVIDER_GAP;
  D.add('lanes', 'divider', { k: 'line', cls: 'divider', x1: g.xa, y1: repTop, x2: g.xb, y2: repTop });
  D.link(sampleLine(g.xa, repTop, g.xb, repTop, 4), 'divider');
  yy = block('replicas', repTop, ['Fewer read replicas', 'More read replicas'], [s.replicas <= 0, s.replicas >= CAPACITY_REPLICAS_MAX]);
  D.region('replicas', { x: g.pad + 6, y: repTop + 3, w: W - 2 * g.pad - 12, h: yy + 6 - repTop - 3 });
  yy += LINE + 6;
  lines('cache', g.xa, yy, P.cache, 'cache', 'replicas');
  const dbBottom = dbTop + P.content.db + PAD_BOTTOM;
  boxes.push({ id: 'db', top: dbTop, bottom: dbBottom });

  // Served: the stream that leaves the database, and the totals.
  const sinkTop = dbTop + res.db + PAD_BOTTOM + GAP;
  gap('sink', dbBottom, sinkTop, r.served, 0);
  const sink = r.served > 0 ? g.x(r.served) - g.xa : 0;
  D.add('lanes', 'sink-track', { k: 'rect', cls: 'sink-track', x: g.xa, y: sinkTop, w: lw, h: 6, rx: 3 });
  if (sink > 0) D.add('lanes', 'sink-bar', { k: 'rect', cls: 'sink', x: g.xa, y: sinkTop, w: r1(sink), h: 6, rx: 3 });
  D.mark({ x0: g.xa, x1: g.xb, y0: sinkTop, y1: sinkTop + 6 }, 'sink');
  const ys = sinkTop + 6 + 22;
  P.sink.forEach((ln, i) => D.text(`sink-${i}`, g.xa, ys + i * 20, ln, { owner: 'sink' }));
  const sinkEnd = ys + res.sink;
  D.region('sink', { x: g.xa - 8, y: sinkTop - 8, w: lw + 16, h: sinkEnd + 10 - sinkTop + 8 });
  const H = Math.round(sinkEnd + 22);

  // Boxes behind their text; the bottleneck's box in the critical tone, never while a lane hides.
  for (const b of boxes) {
    const bottleneck =
      !hid.any && r.shed > SHED && (b.id === r.bottleneck || (b.id === 'db' && r.bottleneck !== 'lb' && r.bottleneck !== 'app'));
    D.add('boxes', `box-${b.id}`, {
      k: 'rect',
      cls: bottleneck ? 'tier-box bottleneck' : 'tier-box',
      x: g.pad,
      y: b.top,
      w: W - 2 * g.pad,
      h: b.bottom - b.top,
      rx: 10,
    });
    D.region(b.id, { x: g.pad - 4, y: b.top - 4, w: W - 2 * g.pad + 8, h: b.bottom - b.top + 8 });
  }

  // The stream: in each gap, what flows on (current) and, at its right, what the next tier will shed (critical, ending
  // on the box's edge with an underline). A × sits there only as the landing point of a play's particles.
  for (const gp of gaps) {
    const h = gp.y1 - gp.y0;
    if (gp.flow > 0) {
      D.add('band', `band-${gp.nextId}`, { k: 'rect', cls: 'band', x: g.xa, y: gp.y0, w: r1(gp.xPass - g.xa), h, rx: 0 });
      D.add('band', `band-edge-${gp.nextId}`, { k: 'line', cls: 'band-edge', x1: r1(gp.xPass), y1: gp.y0, x2: r1(gp.xPass), y2: gp.y1 });
    }
    let strands = '';
    for (let v = g.strand; v < gp.flow - 1e-9; v += g.strand) strands += `M${r1(g.x(v))} ${gp.y0}V${gp.y1}`;
    if (strands) D.add('band', `strand-${gp.nextId}`, { k: 'path', cls: 'strand', d: strands });
    if (gp.shedNext) {
      D.add('band', `band-shed-${gp.nextId}`, {
        k: 'rect',
        cls: 'band-shed',
        x: r1(gp.xPass),
        y: gp.y0,
        w: r1(gp.x1 - gp.xPass),
        h,
        rx: 0,
      });
      D.add('band', `band-shed-edge-${gp.nextId}`, {
        k: 'rect',
        cls: 'band-shed-edge',
        x: r1(gp.xPass),
        y: gp.y1 - 2,
        w: r1(gp.x1 - gp.xPass),
        h: 2,
        rx: 0,
      });
      gp.xMark = Math.max((gp.xPass + gp.x1) / 2, gp.xPass + 4);
      if (view.playMarks) xGlyph(D, `gapx-${gp.nextId}`, gp.xMark, gp.y1 - 11, `gap-${gp.nextId}`, 3.5);
    }
  }
  // The climax: a ring around the gap's × above the tier that first sheds (a stream mark, never a lane), or, with
  // nothing shed, in the gap above the busiest lane's end.
  if (view.ring) {
    const gp = gaps.find((x) => x.nextId === (view.ring === 'primary' || view.ring === 'replicas' ? 'db' : view.ring))!;
    const cx = gp.xMark ?? lanes[view.ring].x1;
    D.add('top', 'ring', { k: 'circle', cls: 'landing', cx: r1(cx), cy: r1(gp.y1 - 11), r: 9 });
  }
  for (const gp of gaps) D.mark({ x0: g.xa, x1: Math.max(gp.x1, g.xa) + 4, y0: gp.y0, y1: gp.y1 }, 'stream');

  const traffic = { positions: CAPACITY_TRAFFIC.map((t) => r1(g.x(t))), y: yT };
  const st: Stage = {
    D,
    H,
    g,
    play,
    traffic,
    steps,
    groups,
    focus: [],
    summary: summary(r, hid),
    lanes,
    gaps,
    boxes,
    ghosts,
    rows,
    offered: r.offered,
    served: r.served,
    sink,
    pool: { filled, critical, hidden: hideW },
    plan: P,
    hid,
  };
  st.focus = focusOutlines(st, view.focus, g.x(s.traffic));
  return st;
}

const HIT = 44;
/** Whether a tag lies across a box's border: neither inside it with 2 px to spare nor outside it. */
function crosses(t: { x0: number; x1: number; y0: number; y1: number }, b: Stage['boxes'][number], pad: number, W: number): boolean {
  const [x0, x1] = [pad, W - pad];
  const outside = t.x1 <= x0 || t.x0 >= x1 || t.y1 <= b.top || t.y0 >= b.bottom;
  const inside = t.x0 >= x0 + 2 && t.x1 <= x1 - 2 && t.y0 >= b.top + 2 && t.y1 <= b.bottom - 2;
  return !outside && !inside;
}
/**
 * Each region's outline, 4 px outside a box's border (or inside the database's box for one of its blocks), with its
 * "Look here" tag on the first free place: on the outline's edge 16 px off its corners, then just inside, two inner
 * rows, at the outline's own right edge and the stage's, outside last. The stream, every control and every box's border
 * are obstacles; a region with no free place for its tag is counted in `D.missing`.
 */
function focusOutlines(st: Stage, ids: readonly string[], handleX: number): (Focus & { region: string })[] {
  const { D, H } = st;
  const { width: tagW, height: tagH } = TAG;
  const hits = [
    { x: st.play.x, y: st.play.y },
    { x: handleX - HIT / 2, y: st.traffic.y - HIT / 2 },
    ...st.steps.map((b) => ({ x: b.x, y: b.y })),
  ];
  const out: (Focus & { region: string })[] = [];
  for (const id of ids)
    for (const b of D.regions[id] ?? []) {
      const x = Math.max(3, b.x);
      const y = Math.max(3, b.y);
      const w = Math.min(D.W - 3, b.x + b.w) - x;
      const h = Math.min(H - 3, b.y + b.h) - y;
      const across: number[] = [];
      for (let ax = x + w - tagW - 16; ax >= x + 16; ax -= 8) across.push(ax);
      const xs = [x + w - tagW - 16, x + 16, ...across, x + w - tagW, D.W - 3 - tagW];
      const inner: number[] = [];
      for (let iy = y + 64; iy <= y + h - tagH - 6; iy += 10) inner.push(iy);
      const ys = [
        y - tagH / 2,
        y + h - tagH / 2,
        y + 6,
        y + h - tagH - 6,
        y + 24,
        y + h - tagH - 24,
        y + 44,
        ...inner,
        y - tagH - 2,
        y - tagH - 5,
        y + h + 2,
      ];
      const tag = ys
        .flatMap((ty) => xs.map((tx) => [tx, ty] as const))
        .find(
          ([tx, ty]) =>
            tx >= 3 &&
            tx + tagW <= D.W - 3 &&
            ty >= 3 &&
            ty + tagH <= H - 3 &&
            D.free({ x0: tx, x1: tx + tagW, y0: ty, y1: ty + tagH }, '', 1) &&
            !st.boxes.some((bx) => crosses({ x0: tx, x1: tx + tagW, y0: ty, y1: ty + tagH }, bx, st.g.pad, D.W)) &&
            !hits.some((hh) => !(hh.x + HIT <= tx || hh.x >= tx + tagW || hh.y + HIT <= ty || hh.y >= ty + tagH)),
        );
      if (!tag) D.missing.push(`a tag for ${id}`);
      const [tx, ty] = tag ?? [xs[0], ys[0]];
      D.mark({ x0: tx, x1: tx + tagW, y0: ty, y1: ty + tagH }, 'look');
      out.push({ id, region: id, x: r1(x), y: r1(y), width: r1(w), height: r1(h), tag: { x: r1(tx), y: r1(ty) } });
    }
  return out;
}
