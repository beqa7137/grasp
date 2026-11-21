import {
  CAPACITY_APP_MAX,
  CAPACITY_APP_RPS,
  CAPACITY_CHALLENGE_SOLUTION,
  CAPACITY_EXPERIMENTS,
  CAPACITY_REPLICAS_MAX,
  CAPACITY_TRAFFIC,
  capacityActOf,
  capacityAllSettings,
  capacityRun,
  capacityZoneLane,
  capacityZoneLoss,
  formatQps,
  type CapacityRun,
  type CapacitySettings,
} from '@grasp/engine';
import { FALSE_CLAIMS } from './capacity-claims.testing';
import { REST_VIEW, buildStage, type Stage, type StageView } from './capacity-layout';
import { rampClock, restRing } from './capacity-motion';
import { BREAK_CLEAR, GAP, LINE, LOST_MIN, PAD_BOTTOM, TEXT, geometry, neighbors, pastAxis, planReserve, reserve } from './capacity-plan';
import {
  NOTHING_HIDDEN,
  SHED,
  TIERS,
  actChange,
  convParts,
  hiding,
  poolBinds,
  statusParts,
  type Phase,
  type Words,
} from './capacity-words';
import { TAG } from './focus-layout';
import { sampleLine, type Edge } from './stage-draw';

const WIDTHS = [248, 252, 270, 300, 322, 344, 360, 400, 460, 520, 560, 620, 700];
const HIT = 44;
const LONG_MS = 600_000;
const REST: StageView = { ...REST_VIEW, hid: NOTHING_HIDDEN };
const HEAVIEST: CapacitySettings = {
  traffic: 20_000,
  lb: 6,
  app: CAPACITY_APP_MAX,
  size: 4000,
  replicas: CAPACITY_REPLICAS_MAX,
  cache: 0,
  zone: 1,
  slow: 1,
};

const overlap = (a: Edge, b: Edge, by = 0) =>
  Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > by && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > by;
const share = (a: string, b: string) => !!a && !!b && a.split(' ').some((t) => b.split(' ').includes(t));
const label = (s: CapacitySettings) => JSON.stringify(s);
const exp = (id: string) => CAPACITY_EXPERIMENTS.find((e) => e.id === id)!;
const setupOf = (id: string) => capacityRun(exp(id).setup).settings;
const actOf = (id: string) => capacityActOf(exp(id));
/** A number of 1,000 or more on the stage stands with its unit; the axis's ticks are the unit's own row. */
const BARE = /\d{1,3}(?:,\d{3})+(?!\/s|,|\d| queries| requests| a second| workers)/;

/**
 * What a reader would see as broken: text on text or off the stage, a line through text, text on a mark, text in the
 * stream's path (where particles fall), axis labels under 6 px apart, text against a focus outline's stroke, focus
 * outlines under 8 px apart, a ring on a lane, hit boxes on each other or off the stage, and any label or tag with no place.
 */
function collisions(st: Stage): string[] {
  const { D, H } = st;
  const W = D.W;
  const out: string[] = D.missing.map((t) => `no room for "${t}"`);
  const texts = D.texts;
  for (let i = 0; i < texts.length; i++) {
    const a = texts[i];
    if (a.x0 < -0.5 || a.x1 > W + 0.5 || a.y0 < 0 || a.y1 > H) out.push(`off-stage: "${a.s}"`);
    for (let j = i + 1; j < texts.length; j++) if (overlap(a, texts[j], 0.5)) out.push(`text on text: "${a.s}" / "${texts[j].s}"`);
  }
  const inside = (p: readonly number[], t: Edge) => p[0] > t.x0 + 0.5 && p[0] < t.x1 - 0.5 && p[1] > t.y0 + 0.5 && p[1] < t.y1 - 0.5;
  // Each line's points are sampled once, and only a text its bounds reach is searched.
  const through = (points: readonly (readonly number[])[], owner: string, name: string) => {
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const box = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    for (const t of texts)
      if (overlap(box, t, -1) && !share(owner, t.owner) && points.some((p) => inside(p, t))) out.push(`${name} through "${t.s}"`);
  };
  for (const l of D.links) through(l.points, l.owner, `line ${l.owner}`);
  for (const p of D.prims())
    if (p.k === 'line' && /\b(lane-cap|zone-tick|ghost-tick|xfer|divider)\b/.test(p.cls))
      through(sampleLine(p.x1, p.y1, p.x2, p.y2, 2), p.owner ?? '', p.id);
  for (const mk of D.marks)
    if (mk.owner !== 'stream')
      for (const t of texts) if (!share(t.owner, mk.owner) && overlap(mk, t, 0.5)) out.push(`text on mark ${mk.owner}: "${t.s}"`);
  for (const gp of st.gaps)
    for (const t of texts)
      if (overlap({ x0: gp.x0, x1: Math.max(gp.x1, gp.x0) + 4, y0: gp.y0, y1: gp.y1 }, t, 0.5))
        out.push(`text in the stream's path: "${t.s}"`);
  const ticks = texts.filter((t) => t.owner === 'axis').sort((a, b) => a.x0 - b.x0);
  for (let i = 1; i < ticks.length; i++)
    if (ticks[i].x0 - ticks[i - 1].x1 < 6) out.push(`axis labels ${ticks[i - 1].s} and ${ticks[i].s} closer than 6 px`);
  for (const f of st.focus) {
    for (const t of texts) {
      const inner = t.x0 >= f.x + 3 && t.x1 <= f.x + f.width - 3 && t.y0 >= f.y + 3 && t.y1 <= f.y + f.height - 3;
      const clear = t.x1 <= f.x - 4 || t.x0 >= f.x + f.width + 4 || t.y1 <= f.y - 4 || t.y0 >= f.y + f.height + 4;
      if (!inner && !clear) out.push(`text at the ${f.region} outline's stroke: "${t.s}"`);
    }
    for (const o of st.focus)
      if (o !== f) {
        const gap = Math.max(o.x - (f.x + f.width), f.x - (o.x + o.width), o.y - (f.y + f.height), f.y - (o.y + o.height));
        const nested = o.x >= f.x && o.x + o.width <= f.x + f.width && o.y >= f.y && o.y + o.height <= f.y + f.height;
        if (gap < 8 && !nested && f.id < o.id) out.push(`focus outlines ${f.id} and ${o.id} ${gap.toFixed(1)} px apart`);
      }
  }
  for (const f of st.focus) {
    const t = { x0: f.tag.x, x1: f.tag.x + TAG.width, y0: f.tag.y, y1: f.tag.y + TAG.height };
    for (const b of st.boxes) {
      const clear = t.x1 <= st.g.pad || t.x0 >= W - st.g.pad || t.y1 <= b.top || t.y0 >= b.bottom;
      const within = t.x0 >= st.g.pad + 2 && t.x1 <= W - st.g.pad - 2 && t.y0 >= b.top + 2 && t.y1 <= b.bottom - 2;
      if (!clear && !within) out.push(`the ${f.region} tag on the ${b.id} box's border`);
    }
  }
  const ring = D.prims().find((p) => p.id === 'ring');
  if (ring?.k === 'circle')
    for (const id of TIERS) {
      const l = st.lanes[id];
      if (l.y < ring.cy + ring.r + 1 && l.y + l.h > ring.cy - ring.r - 1) out.push(`the ring on the ${id} lane`);
    }
  const play = { x0: st.play.x, x1: st.play.x + HIT, y0: st.play.y, y1: st.play.y + HIT };
  const hits = [play, ...st.steps.map((b) => ({ x0: b.x, x1: b.x + HIT, y0: b.y, y1: b.y + HIT }))];
  for (const h of hits) if (h.x0 < -0.5 || h.x1 > W + 0.5 || h.y0 < -0.5 || h.y1 > H + 0.5) out.push('a hit box off the stage');
  // No word lies on a stepper's 44 px target, and none under it comes within 2 px.
  for (const b of st.steps)
    for (const t of texts)
      if (overlap({ x0: b.x, x1: b.x + HIT, y0: b.y, y1: b.y + HIT + 2 }, t)) out.push(`"${t.s}" on or just under ${b.label}`);
  for (let i = 0; i < hits.length; i++)
    for (let j = i + 1; j < hits.length; j++) if (overlap(hits[i], hits[j])) out.push(`hit boxes ${i} and ${j} overlap`);
  for (const x of st.traffic.positions) {
    const h = { x0: x - HIT / 2, x1: x + HIT / 2, y0: st.traffic.y - HIT / 2, y1: st.traffic.y + HIT / 2 };
    if (h.x0 < -0.5 || h.x1 > W + 0.5) out.push(`the traffic handle off the stage at ${x}`);
    if (hits.some((o) => overlap(h, o))) out.push(`the traffic handle on another control at ${x}`);
    for (const t of ticks) if (overlap(h, t)) out.push(`the traffic handle on the tick "${t.s}"`);
  }
  return out;
}

/** A block's own words, its lines joined: what its status and conversion say, however they wrap. */
const ownWords = (st: Stage, id: string) =>
  st.D.texts
    .filter((t) => t.owner === id)
    .map((t) => t.s)
    .join(' ')
    .replace(/\s+/g, ' ');
const xsOf = (d: string) => [...d.matchAll(/M(-?[\d.]+) /g)].map((m) => +m[1]);

/**
 * A lane cut at the axis's end: no mark on it comes within 3 px of its break, and where no instance lies whole on the
 * axis, a meter of one instance's whole width shows its headroom, filled as busy as the lane is, with its 70% mark.
 */
function cutLane(st: Stage, r: CapacityRun, id: (typeof TIERS)[number]): string[] {
  const l = st.lanes[id];
  if (!l.cut) return [];
  const out: string[] = [];
  const { g } = st;
  const prims = st.D.prims();
  const find = (pid: string) => prims.find((p) => p.id === pid);
  const frame = find(`meter-${id}`);
  const whole = l.segs.some((sg) => sg.x0 + sg.w < g.xb - 0.5);
  const u = Math.min(1, r[id].util);
  if (!whole) {
    const fill = find(`meter-fill-${id}`);
    const notch = find(`meter-notch-${id}`);
    if (frame?.k !== 'rect') out.push(`the cut ${id} lane shows no headroom: no instance is whole and no meter`);
    else {
      const busy = fill?.k === 'rect' ? fill.w / frame.w : 0;
      if (Math.abs(busy - u) > 0.005) out.push(`the ${id} meter reads ${(busy * 100).toFixed(1)}% busy, the lane ${(u * 100).toFixed(1)}%`);
      if (notch?.k !== 'path' || Math.abs(xsOf(notch.d)[0] - (frame.x + 0.7 * frame.w)) > 0.5) out.push(`the ${id} meter has no 70% mark`);
      if (frame.x + frame.w > g.xb - BREAK_CLEAR + 0.5) out.push(`the ${id} meter runs into the break`);
      // The meter's lit part is the lane's visible part at the meter's scale, so its load reads as the lane's does.
      const each = r[id].ceiling / (id === 'primary' ? 1 : r[id].up);
      const axis = (frame.w * g.max) / each;
      const past = find(`meter-past-${id}`);
      if (past?.k !== 'rect' || Math.abs(past.x - (frame.x + axis)) > 0.5 || Math.abs(past.x + past.w - (frame.x + frame.w)) > 0.5)
        out.push(`the ${id} meter is not dimmed from where the axis ends, ${(frame.x + axis).toFixed(1)}`);
      const first = l.segs[0];
      const laneFill = first ? Math.min(first.w, l.fill) / first.w : 0;
      if (first && Math.abs(Math.min(busy * frame.w, axis) - laneFill * axis) > 0.5)
        out.push(
          `the ${id} meter's lit part reads ${((Math.min(busy * frame.w, axis) / axis) * 100).toFixed(1)}%, its lane ${(laneFill * 100).toFixed(1)}%`,
        );
      if (!st.D.texts.some((t) => t.owner === 'legend' && t.s === 'whole machine, dim past the cut'))
        out.push(`the ${id} meter has no legend entry`);
    }
  }
  const clear = (frame?.k === 'rect' ? frame.x : g.xb - BREAK_CLEAR) - 3 + 0.5;
  const xs: [string, number][] = [];
  for (const pid of [`zonetick-${id}`, `ghost-${id}`]) {
    const p = find(pid);
    if (p?.k === 'line') xs.push([pid, p.x1]);
  }
  const notches = find(`notch-${id}`);
  if (notches?.k === 'path') for (const x of xsOf(notches.d)) xs.push([`notch-${id}`, x]);
  const head = id === 'primary' ? find('xfer-head') : undefined;
  if (head?.k === 'path') xs.push(['xfer-head', xsOf(head.d)[0]]);
  for (const [pid, x] of xs)
    if (x > (pid === 'xfer-head' ? g.xb - BREAK_CLEAR + 0.5 : clear)) out.push(`${pid} at ${x.toFixed(1)} crowds the ${id} lane's break`);
  return out;
}

/** The parts of `parts` between characters `a` and `b` of their joined text. */
function sliceParts(parts: Words, a: number, b: number): Words {
  const out: Words = [];
  let at = 0;
  for (const [text, role] of parts) {
    const [s, e] = [Math.max(a, at), Math.min(b, at + text.length)];
    if (e > s) out.push([text.slice(s - at, e - at), role]);
    at += text.length;
  }
  return out;
}

/** A "·"-separated clause of a block's status or conversion that fits a line is laid on one line, never split. */
function splitClauses(st: Stage, r: CapacityRun): string[] {
  const out: string[] = [];
  const lw = st.g.xb - st.g.xa;
  for (const id of TIERS) {
    const b = st.plan.blocks[id];
    const sources: [Words, Words[]][] = [[statusParts(r, id, st.hid, b.L), b.status]];
    if (id === 'primary' || id === 'replicas') sources.push([convParts(r, id, st.hid, b.L), b.conv]);
    for (const [parts, lines] of sources) {
      const texts = lines.map((ln) => ln.map((p) => p[0]).join(''));
      let at = 0;
      for (const c of parts
        .map((p) => p[0])
        .join('')
        .split(' · ')) {
        // A clause fits a line when the flow, measuring as it does, lays it alone on one.
        if (c && TEXT.flow(sliceParts(parts, at, at + c.length), lw).length === 1 && !texts.some((t) => t.includes(c)))
          out.push(`the ${id} block splits "${c}" across lines: "${texts.join(' | ')}"`);
        at += c.length + 3;
      }
    }
  }
  return out;
}

/** What must hold on every drawing beyond collisions: the brief's assertions (5, prevention 2). */
function assertions(st: Stage, r: CapacityRun): string[] {
  const out: string[] = [];
  const { g } = st;
  const words = st.D.texts.filter((t) => t.owner !== 'axis');
  for (const t of [...words.map((w) => w.s), st.summary]) for (const c of FALSE_CLAIMS) if (c.test(t)) out.push(`false claim ${c}: "${t}"`);
  for (const t of words) if (BARE.test(t.s)) out.push(`a number without its unit: "${t.s}"`);
  for (const t of words) if (t.s.startsWith('·')) out.push(`a line opens on a separator: "${t.s}"`);
  out.push(...splitClauses(st, r));
  const zr = capacityZoneLoss(r);
  for (const id of TIERS) {
    const l = st.lanes[id];
    const t = r[id];
    if (l.kind === 'hidden') {
      if (st.D.prims().some((p) => p.id.startsWith(`seg-${id}`) || p.id === `cap-${id}` || p.id === `shed-${id}`))
        out.push(`a mark on the hidden ${id} lane`);
      continue;
    }
    if (st.D.prims().some((p) => p.cls.includes('lane-hidden') && p.id === `lane-hidden-${id}`))
      out.push(`dashes for the ${id} lane, which is not hidden`);
    if (l.kind !== 'normal') continue;
    if (Math.abs(l.x1 - g.x(t.ceiling)) > 0.5) out.push(`the ${id} lane ends at ${l.x1}, its limit at ${g.x(t.ceiling)}`);
    // A lane past the axis's end is cut there with a break, and only a lane on it has a limit's cap.
    const cut = pastAxis(g, t.ceiling);
    const has = (pid: string) => st.D.prims().some((p) => p.id === pid);
    if (l.cut !== cut || has(`break-${id}`) !== cut || has(`cap-${id}`) === cut)
      out.push(`the ${id} lane, limit ${t.ceiling.toFixed(0)} on an axis to ${g.max}, is ${l.cut ? '' : 'not '}cut`);
    const up = id === 'primary' ? 1 : t.up;
    const onAxis = Array.from({ length: up }, (_, i) => g.x((i * t.ceiling) / up)).filter((x) => x < g.xb - 0.5).length;
    if (l.segs.length !== onAxis) out.push(`the ${id} lane draws ${l.segs.length} instances, ${onAxis} up on the axis`);
    for (const sg of l.segs) if (sg.x0 + sg.w > g.xb + 0.5) out.push(`seg-${sg.id} runs past the axis's end`);
    out.push(...cutLane(st, r, id));
    if (Math.abs(l.each - ((t.ceiling / up) * g.k - (up > 1 ? 1 : 0))) > 0.5) out.push(`the ${id} lane's instances are ${l.each} px wide`);
    const want = l.each * Math.min(1, t.util);
    if (Math.abs(l.fill - want) > 0.5) out.push(`the ${id} fill reaches ${l.fill.toFixed(1)} px, its load ${want.toFixed(1)} px`);
    // What is painted, not only the meta: each instance's marks start at its own left edge and stay in its segment.
    const loads = st.groups.find((gr) => gr.id === id)?.loads ?? [];
    if (want > 0.2 && loads.length !== l.segs.length) out.push(`the ${id} lane paints ${loads.length} loads, ${l.segs.length} up`);
    for (const ld of loads) {
      const seg = l.segs.find((x) => x.id === ld.inst);
      if (!seg) out.push(`a load for ${ld.inst}, which has no segment`);
      else
        for (const p of [...ld.fills, ...ld.writes])
          if (p.k === 'rect' && (p.x < seg.x0 - 0.5 || p.x + p.w > seg.x0 + seg.w + 0.5))
            out.push(
              `${p.id} paints ${p.x.toFixed(1)} to ${(p.x + p.w).toFixed(1)}, outside its segment ${seg.x0.toFixed(1)} to ${(seg.x0 + seg.w).toFixed(1)}`,
            );
          else if (p.k === 'rect' && p.id.startsWith('fill-') && Math.abs(p.w - Math.min(want, seg.w)) > 0.5)
            out.push(`${p.id} paints ${p.w.toFixed(1)} px, its load ${want.toFixed(1)} px`);
          else if (p.k === 'rect' && p.id.startsWith('writes-') && Math.abs(p.w - Math.min(l.writes, seg.w)) > 0.5)
            out.push(`${p.id} paints ${p.w.toFixed(1)} px, its writes ${l.writes.toFixed(1)} px`);
    }
    const n = id === 'primary' ? 0 : r[id].n;
    if (id !== 'primary' && !st.hid.zones && n) {
      const lost = capacityZoneLane(id, n, !!r.settings.zone).lost.length;
      const marks = st.D.prims()
        .filter((p) => p.k === 'rect' && p.id.startsWith(`lost-${id}-`))
        .map((p) => (p.k === 'rect' ? { id: p.id, x0: p.x, x1: p.x + p.w } : null)!)
        .sort((p, q) => p.x0 - q.x0);
      // The lost group runs from the survivors' limit to the limit before the loss, as far as the axis goes: one mark
      // for each instance zone A took, or one for them all where each would be under LOST_MIN px.
      if (r.settings.zone && lost) {
        const old = capacityRun({ ...r.settings, zone: 0 })[id].ceiling;
        const [x0, x1] = [g.x(t.ceiling), g.x(old)];
        const merged = (x1 - x0) / lost < LOST_MIN;
        if (x1 - x0 < 1) {
          if (marks.length) out.push(`the ${id} lost group draws ${marks.length} past the axis`);
        } else if (!marks.length) out.push(`the ${id} lost group draws none`);
        else {
          if (Math.abs(marks[0].x0 - x0) > 0.6 || Math.abs(marks[marks.length - 1].x1 - x1) > 1.6)
            out.push(
              `the ${id} lost group spans ${marks[0].x0.toFixed(1)} to ${marks[marks.length - 1].x1.toFixed(1)}, not ${x0.toFixed(1)} to ${x1.toFixed(1)}`,
            );
          if (!pastAxis(g, old) && marks.length !== (merged ? 1 : lost))
            out.push(`the ${id} lost group draws ${marks.length}, zone A held ${lost}`);
          if (marks.length > 1)
            for (const m of marks.slice(0, -1)) if (m.x1 - m.x0 < LOST_MIN - 1.01) out.push(`${m.id} is under ${LOST_MIN} px`);
          for (const m of marks) if (m.x1 > g.xb + 0.5) out.push(`${m.id} runs past the axis's end`);
          // One mark per meaning: a ghost tick beside the lost group's end would read as a second old limit.
          const tick = st.D.prims().find((p) => p.id === `ghost-${id}`);
          if (tick?.k === 'line' && Math.abs(tick.x1 - x1) < 11.9)
            out.push(`the ${id} ghost tick ${Math.abs(tick.x1 - x1).toFixed(1)} px from the lost group's end`);
        }
      }
      const a = l.zones.find((z) => z.zone === 'A' && !z.lost);
      // A replica's limit moves with how many share the reads, so only the load balancers' and app servers' group starts
      // at what survives; the replicas' survivor limit is their zone tick.
      if (id !== 'replicas' && !r.settings.zone && a && zr[id].up > 0 && Math.abs(a.x0 - g.x(zr[id].ceiling)) > 0.5)
        out.push(`zone A's ${id} group starts at ${a.x0}, not at what survives it`);
      // The lost group's hatch never lies under a surviving group's line, and the zones are lettered all or none.
      const prims = st.D.prims();
      for (const lostRect of prims.filter((p) => p.id.startsWith(`lost-${id}-`)))
        for (const line of prims.filter((p) => p.id.startsWith(`zoneline-${id}-`)))
          if (lostRect.k === 'rect' && line.k === 'line' && lostRect.x < line.x2 - 0.5 && lostRect.x + lostRect.w > line.x1 + 0.5)
            out.push(`${lostRect.id} lies under the surviving ${line.id}`);
      const strip = st.D.texts.filter((x) => x.owner === `zone-${id}`);
      const letters = strip.filter((x) => /^[ABC]$/.test(x.s));
      if (letters.length && letters.length !== l.zones.length)
        out.push(`the ${id} strip letters ${letters.length} of its ${l.zones.length} zones`);
      // Every zone with instances on the lane is lettered on its strip or named at the lane's end, past the axis, unless
      // a group on the axis is too narrow to letter, when none is lettered.
      const zl = capacityZoneLane(id, n, !!r.settings.zone);
      const have = new Set([...zl.up, ...zl.lost].map((x) => x.zone));
      const named = new Set([...letters.map((x) => x.s), ...strip.flatMap((x) => [...x.s.matchAll(/\+\d+ ([ABC])/g)].map((m) => m[1]))]);
      const unnamed = [...have].filter((z) => !named.has(z));
      if (unnamed.length && l.zones.every((z) => z.x1 - z.x0 >= 16))
        out.push(`the ${id} lane's zone ${unnamed.join(', ')} is neither lettered nor named at its end`);
    }
    // Where the lane's limit falls if zone A fails: a tick on the lane, clear of a cut lane's break, or said in words.
    if (st.hid.zoneTicks && !st.hid.zones && !r.settings.zone) {
      const left = id === 'primary' ? (zr.primary.outage ? null : zr.primary.ceiling) : zr[id].up > 0 ? zr[id].ceiling : null;
      if (left !== null && left < t.ceiling - 0.5) {
        const tick = st.D.prims().find((p) => p.id === `zonetick-${id}`);
        const block = ownWords(st, id);
        const said = [`if zone A fails, limit ${formatQps(left)}`, `if zone A fails, back to ${formatQps(left)}`].some((w) =>
          block.includes(w),
        );
        if (tick?.k === 'line' && Math.abs(tick.x1 - g.x(left)) > 0.5)
          out.push(`the ${id} zone tick sits at ${tick.x1}, its limit at ${g.x(left)}`);
        if (!tick && !said) out.push(`the ${id} lane's limit if zone A fails, ${formatQps(left)}, is neither a tick nor words`);
      }
    }
    const shed = st.plan.blocks[id].L.shed;
    const gap = st.gaps.find((x) => x.nextId === (id === 'primary' || id === 'replicas' ? 'db' : id))!;
    if (shed && (id === 'lb' || id === 'app') && Math.abs(shed.x1 - gap.x1) > 0.5)
      out.push(`the ${id} shed block ends at ${shed.x1}, the stream above at ${gap.x1}`);
    if (!shed && t.shed > SHED) out.push(`the ${id} lane sheds ${t.shed} with no shed block`);
  }
  if (r.primary.outage && words.some((w) => /primary takes every read/.test(w.s))) out.push('a lost primary takes reads');
  // One divider, then the replicas' words: no lane row and no strip where no replica is up.
  const divider = st.D.prims().find((p) => p.id === 'divider');
  const repWords = words.filter((w) => w.owner === 'replicas').map((w) => w.y0);
  if (st.lanes.replicas.kind === 'none' && divider?.k === 'line' && Math.min(...repWords) - divider.y1 > LINE + 2)
    out.push(`an empty band of ${(Math.min(...repWords) - divider.y1).toFixed(0)} px under the divider`);
  if (st.pool.critical !== (poolBinds(r) && !st.pool.hidden)) out.push(`the pool is ${st.pool.critical ? '' : 'not '}critical`);
  if (st.pool.critical && Math.round((r.app.inFlight / 100) * 100) !== 100) out.push('a critical pool with room in it');
  for (const id of ['lb', 'app'] as const) {
    for (const fleet of words.filter((w) => w.owner === id && /×/.test(w.s)).map((w) => w.s))
      if (r[id].up && !st.hid.lanes.has(id) && !fleet.includes(`× ${formatQps(r[id].each)}`))
        out.push(`the ${id} fleet's figure is not the model's ${formatQps(r[id].each)}: "${fleet}"`);
  }
  if (Math.abs(st.sink - (r.served > 0 ? g.x(r.served) - g.xa : 0)) > 0.5) out.push(`the served bar is ${st.sink} px`);
  for (const gh of st.ghosts) if (!gh.labelled) out.push(`the ${gh.id} ghost has no label`);
  for (const [box, ys] of Object.entries(st.rows)) {
    const sorted = [...ys].sort((a, b) => a - b);
    for (let i = 1; i < sorted.length; i++) if (sorted[i] - sorted[i - 1] > 2 * LINE + 2) out.push(`a hole in the ${box} box's words`);
  }
  const res = reserve(g.W);
  for (const k of ['lb', 'app', 'db', 'sink'] as const)
    if (st.plan.content[k] > res[k] + 0.01) out.push(`the ${k} box needs ${st.plan.content[k]}, reserves ${res[k]}`);
  for (const b of st.boxes) {
    const inside = words.filter((t) => t.y0 > b.top && t.y0 < b.bottom);
    for (const t of inside) if (t.y1 > b.bottom - PAD_BOTTOM + 4) out.push(`"${t.s}" past the ${b.id} box's foot`);
    // A bordered box is never taller than its words: the slack a width reserves is stream, under the box.
    const foot = Math.max(...inside.map((t) => t.y1));
    if (b.bottom - foot > PAD_BOTTOM) out.push(`the ${b.id} box runs ${(b.bottom - foot).toFixed(0)} px past its words`);
  }
  for (const gp of st.gaps) if (gp.y1 - gp.y0 < GAP - 0.01) out.push(`the stream above ${gp.nextId} is ${gp.y1 - gp.y0} px tall`);
  return out;
}

/** The views a setting is drawn in: at rest, with a ghost of a neighbor, mid-ramp, and Reduced motion's ring. */
function views(s: CapacitySettings, k: number): [string, CapacityRun, StageView][] {
  const r = capacityRun(s);
  const n = neighbors(s);
  const out: [string, CapacityRun, StageView][] = [
    ['rest', r, REST],
    ['ghost', r, { ...REST, ghost: n[k % n.length] }],
    ['reduced', r, { ...REST, playMarks: true, ring: restRing(s) }],
  ];
  const c = rampClock(s);
  const mid = c.ramp.runs[Math.min(c.ringAt, c.ramp.runs.length - 1)];
  out.push(['ramp', mid, { ...REST, playMarks: true, ring: c.ring, locked: true }]);
  return out;
}

/** Each question asking, its answer playing (every ramp stop for a ramp) and revealed, as the widget draws them. */
function questionViews(): [string, CapacityRun, StageView, CapacitySettings | null][] {
  const out: [string, CapacityRun, StageView, CapacitySettings | null][] = [];
  for (const e of CAPACITY_EXPERIMENTS) {
    const [from, to] = [capacityRun(setupOf(e.id)), capacityRun(actOf(e.id))];
    if (e.goal) {
      for (const s of [from.settings, { ...from.settings, ...CAPACITY_CHALLENGE_SOLUTION }])
        out.push([`${e.id} challenge`, capacityRun(s), { ...REST, hid: hiding([], 'challenge'), focus: e.focus }, null]);
      continue;
    }
    const change = actChange(from, to);
    const at = (phase: Phase) => hiding(e.hide ?? [], phase, change);
    out.push([`${e.id} asking`, from, { ...REST, hid: at('asking'), locked: true }, null]);
    const play = e.act && 'run' in e.act && e.act.run === 'ramp' ? rampClock(to.settings, from.settings.traffic).ramp.runs : [to];
    for (const run of play)
      out.push([`${e.id} playing ${run.offered}`, run, { ...REST, hid: at('playing'), locked: true, playMarks: true }, null]);
    out.push([`${e.id} revealed`, to, { ...REST, hid: at('revealed'), ghost: from.settings, focus: e.focus }, from.settings]);
  }
  return out;
}

describe('capacity layout', () => {
  it('draws the default setting at every width with nothing on anything, every number from the model', () => {
    // On any stage one app server at full speed is wide enough for its 70% notch and its zone letter to read.
    for (let W = 248; W <= 1000; W++) expect(CAPACITY_APP_RPS * geometry(W).k, `${W}`).toBeGreaterThanOrEqual(14);
    for (const W of WIDTHS) {
      const st = buildStage(W, capacityRun(setupOf('tenfold')), REST);
      expect(collisions(st), `${W}`).toEqual([]);
      expect(assertions(st, capacityRun(setupOf('tenfold'))), `${W}`).toEqual([]);
    }
  });

  // Two halves of the widths, so each stays well inside its time limit on a loaded machine.
  for (const half of [WIDTHS.slice(0, 7), WIDTHS.slice(7)])
    it(
      `lays out a stride of every setting at ${half.join(', ')} px, at rest, with a ghost, mid-ramp and under Reduced motion, at one height per width`,
      () => {
        const all = capacityAllSettings();
        const faults = new Map<string, string>();
        for (const W of half) {
          const H = buildStage(W, capacityRun(all[0]), REST).H;
          for (let i = W % 89; i < all.length; i += 89)
            for (const [kind, r, view] of views(all[i], i)) {
              const st = buildStage(W, r, view);
              const found = [...collisions(st), ...assertions(st, r)];
              if (st.H !== H) found.push(`height ${st.H}, not ${H}`);
              // One example of each kind of fault, so a rare one is not hidden behind a common one.
              for (const f of found) {
                const sort = f.replace(/[\d,.]+/g, '#');
                if (!faults.has(sort)) faults.set(sort, `${W} ${kind} ${label(r.settings)}: ${f}`);
              }
            }
        }
        expect([...faults.values()]).toEqual([]);
      },
      LONG_MS,
    );

  it(
    'draws every question asking, playing and revealed at 13 widths: a tag for each focus, a labelled ghost for each limit its act moved',
    () => {
      const faults: string[] = [];
      for (const W of WIDTHS)
        for (const [name, r, view, setup] of questionViews()) {
          const st = buildStage(W, r, view);
          const found = [...collisions(st), ...assertions(st, r)];
          for (const f of view.focus) if (!st.focus.some((x) => x.region === f)) found.push(`no outline for ${f}`);
          if (setup) {
            const was = capacityRun(setup);
            for (const id of TIERS)
              if (
                st.lanes[id].kind === 'normal' &&
                Math.abs(was[id].ceiling - r[id].ceiling) >= 0.5 &&
                was[id].ceiling > 0 &&
                !st.ghosts.some((gh) => gh.id === id && gh.labelled)
              )
                found.push(`no labelled ghost for ${id}`);
          }
          if (!view.hid.ghost && !setup && st.ghosts.length) found.push('a ghost');
          for (const f of found) if (faults.length < 30) faults.push(`${W} ${name}: ${f}`);
        }
      expect(faults).toEqual([]);
    },
    LONG_MS,
  );

  it('keeps the heaviest setting under 500 elements and its stage height one value per width', () => {
    for (const W of WIDTHS) {
      const st = buildStage(W, capacityRun(HEAVIEST), { ...REST, playMarks: true, ring: 'app', ghost: { ...HEAVIEST, zone: 0 } });
      const n =
        st.D.prims().length + st.groups.reduce((a, g) => a + g.loads.reduce((b, l) => b + l.fills.length + l.writes.length + 2, 0), 0) + 60;
      expect(n, `${W}`).toBeLessThan(500);
    }
    for (const t of CAPACITY_TRAFFIC)
      expect(buildStage(322, capacityRun({ ...HEAVIEST, traffic: t }), REST).H).toBe(buildStage(322, capacityRun(HEAVIEST), REST).H);
  });

  it(
    'reserves from the table what the plan measures, and never more height for a wider stage',
    () => {
      for (const W of [248, 252, 300, 322, 346, 347, 390, 460, 560, 620, 760, 900]) {
        const [have, need] = [reserve(W), planReserve(W)];
        for (const k of ['lb', 'app', 'db', 'sink'] as const) expect(have[k], `${W} ${k}`).toBeGreaterThanOrEqual(need[k]);
      }
      // The stage's height, one value per width, never grows as the stage widens, at any width.
      for (const set of [setupOf('tenfold'), HEAVIEST, { ...setupOf('zone'), zone: 1 }]) {
        let last = buildStage(248, capacityRun(set), REST).H;
        for (let W = 249; W <= 1000; W++) {
          const H = buildStage(W, capacityRun(set), REST).H;
          expect(H, `${W}`).toBeLessThanOrEqual(last);
          last = H;
        }
      }
    },
    LONG_MS,
  );

  it('catches a planted fault for every layout rule', () => {
    const r = capacityRun(setupOf('tenfold'));
    const caught = (edit: (st: Stage) => void, run: CapacityRun = r, view: StageView = REST) => {
      const st = buildStage(322, run, view);
      edit(st);
      return [...collisions(st), ...assertions(st, run)].join(' | ');
    };
    expect(caught((st) => st.lanes.app.segs.pop())).toContain('the app lane draws 3 instances, 4 up');
    expect(caught((st) => (st.lanes.lb.fill *= 0.8))).toContain('the lb fill reaches');
    // The meter's dimmed part moved off the axis's end, its legend entry dropped, and its lane's fill cut short.
    const replicas = capacityRun({ ...setupOf('tenfold'), replicas: 0, cache: 1, size: 8000 });
    expect(
      caught((st) => {
        const past = st.D.prims().find((p) => p.id === 'meter-past-primary');
        if (past?.k === 'rect') past.x += 4;
      }, replicas),
    ).toContain('the primary meter is not dimmed from where the axis ends');
    expect(
      caught((st) => {
        for (const t of st.D.texts) if (t.owner === 'legend') t.s = t.s.replace('whole machine', 'machine');
      }, replicas),
    ).toContain('the primary meter has no legend entry');
    expect(caught((st) => (st.lanes.primary.fill *= 0.5), replicas)).toContain("the primary meter's lit part reads");
    // A status's last clause broken before its last word, as a wrap that does not prefer the "·" breaks may.
    expect(
      caught((st) => {
        const parts = st.plan.blocks.app.status.flat();
        const full = parts.map((p) => p[0]).join('');
        const cut = full.lastIndexOf(' ');
        st.plan.blocks.app.status = [sliceParts(parts, 0, cut), sliceParts(parts, cut + 1, full.length)];
      }),
    ).toMatch(/the app block splits ".*" across lines/);
    // Today's fault, a rect as wide as its segment set back by its spare part, spills into the instance before it.
    expect(
      caught((st) => {
        const seg = st.lanes.lb.segs[1];
        const fill = st.groups.find((g) => g.id === 'lb')!.loads[1].fills[0];
        if (fill.k === 'rect') Object.assign(fill, { x: seg.x0 + st.lanes.lb.fill - seg.w, w: seg.w });
      }),
    ).toMatch(/fill-lb-\w+ paints .* outside its segment/);
    expect(
      caught((st) => {
        const fill = st.groups.find((g) => g.id === 'app')!.loads[0].fills[0];
        if (fill.k === 'rect') fill.w += 4;
      }),
    ).toMatch(/fill-app-\w+ paints .* px, its load/);
    const cpu = capacityRun({ ...setupOf('tenfold'), traffic: 8000 });
    expect(caught((st) => (st.pool.critical = true), cpu)).toContain('the pool is critical');
    const lost = capacityRun({ ...setupOf('tenfold'), zone: 1 });
    expect(
      caught((st) => st.D.text('planted', 30, 800, [['None: the primary takes every read.', 'cap']], { owner: 'replicas' }), lost),
    ).toContain('a lost primary takes reads');
    const slow = capacityRun(actOf('slow'));
    expect(caught((st) => st.D.text('planted', 30, 800, [['6 × 1,500/s', 'capB']], { owner: 'app' }), slow)).toContain(
      "the app fleet's figure is not the model's 200/s",
    );
    expect(caught((st) => st.D.text('planted', 30, 800, [['2 × 8,000', 'capB']], { owner: 'replicas' }))).toContain(
      'a number without its unit',
    );
    expect(
      caught((st) => st.D.add('lanes', 'lane-hidden-replicas', { k: 'rect', cls: 'lane-hidden', x: 0, y: 0, w: 1, h: 1, rx: 0 })),
    ).toContain('dashes for the replicas lane');
    expect(
      caught(
        (st) => st.D.add('top', 'ring', { k: 'circle', cls: 'landing', cx: st.lanes.app.x1, cy: st.lanes.app.y + 11, r: 9 }),
        capacityRun(actOf('tenfold')),
        {
          ...REST,
          playMarks: true,
        },
      ),
    ).toContain('the ring on the app lane');
    expect(caught((st) => st.ghosts.push({ id: 'lb', labelled: false, old: 1 }))).toContain('the lb ghost has no label');
    expect(caught((st) => st.D.text('planted', 30, st.gaps[0].y0 + 12, [['limit 10,000/s', 'small']], { owner: 'lb' }))).toContain(
      "text in the stream's path",
    );
    expect(caught((st) => st.D.missing.push('a tag for app'))).toContain('no room for "a tag for app"');
    expect(
      caught((st) => {
        const b = st.steps.find((x) => x.tier === 'primary')!;
        st.D.text('planted', b.x - 60, b.y + HIT + 10, [['the largest machine, in zone A', 'capB']], { owner: 'primary' });
      }),
    ).toContain('on or just under A smaller database machine');
    expect(caught((st) => st.D.text('planted', 30, 800, [['· 2,000/s shed, 25%', 'capB']], { owner: 'sink' }))).toContain(
      'a line opens on a separator',
    );
    expect(
      caught((st) => {
        for (const t of st.D.texts) if (t.owner === 'replicas') Object.assign(t, { y0: t.y0 + 40, y1: t.y1 + 40 });
      }),
    ).toContain('an empty band of');
    expect(
      caught(
        (st) => {
          const f = st.focus[0];
          const box = st.boxes.find((b) => b.id === 'app')!;
          f.tag = { x: f.tag.x, y: box.top - TAG.height / 2 };
        },
        r,
        { ...REST, focus: ['app'] },
      ),
    ).toContain("the app tag on the app box's border");
    const zone = capacityRun({ ...setupOf('tenfold'), replicas: 6, cache: 1, zone: 1 });
    expect(
      caught((st) => {
        const line = st.D.prims().find((p) => p.id.startsWith('zoneline-replicas-'));
        if (line?.k === 'line') st.D.add('lanes', 'lost-replicas-A9', { k: 'rect', cls: 'seg lost', x: line.x1, y: 0, w: 20, h: 5, rx: 0 });
      }, zone),
    ).toContain('lost-replicas-A9 lies under the surviving');
    expect(caught((st) => (st.boxes[2].bottom += 40))).toMatch(/the db box runs \d+ px past its words/);
    expect(caught((st) => (st.gaps[1].y1 = st.gaps[1].y0 + 10))).toContain('the stream above app is 10 px tall');
    const replicated = capacityRun({ ...setupOf('tenfold'), replicas: 2 });
    expect(
      caught((st) => st.D.add('marks', 'cap-primary', { k: 'line', cls: 'lane-cap', x1: st.g.xb, y1: 0, x2: st.g.xb, y2: 1 }), replicated),
    ).toContain('the primary lane, limit 40000 on an axis to 20000, is cut');
    // A cut lane's headroom: its meter, as busy as the lane, and no mark in its break's slot.
    const rename = (st: Stage, from: string) =>
      Object.assign(
        st.D.prims().find((p) => p.id === from)!,
        { id: `planted-${from}` },
      );
    expect(caught((st) => rename(st, 'meter-primary'), replicated)).toContain('the cut primary lane shows no headroom');
    expect(caught((st) => rename(st, 'meter-fill-primary'), replicated)).toMatch(/the primary meter reads 0\.0% busy, the lane 2\.5%/);
    expect(
      caught((st) => {
        const head = st.D.prims().find((p) => p.id === 'xfer-head');
        if (head?.k === 'path') head.d = `M${st.g.xb - 2} 0l-6 -3v6z`;
      }, replicated),
    ).toMatch(/xfer-head at [\d.]+ crowds the primary lane's break/);
    // The challenge met on a phone: zone A's two load balancers lie past the axis, named at the lane's end, and the
    // limit losing zone A leaves sits at the axis's end, so it is said in words.
    const challenge = CAPACITY_EXPERIMENTS.find((e) => e.goal)!;
    const met = capacityRun({ ...capacityRun(challenge.setup).settings, ...CAPACITY_CHALLENGE_SOLUTION });
    expect(caught(() => undefined, met)).toBe('');
    expect(
      caught((st) => {
        const i = st.D.texts.findIndex((x) => x.owner === 'zone-lb' && x.s === '+2 A');
        st.D.texts.splice(i, 1);
      }, met),
    ).toContain("the lb lane's zone A is neither lettered nor named at its end");
    expect(
      caught((st) => {
        for (const t of st.D.texts) if (t.owner === 'lb') t.s = t.s.replace('if zone A fails,', '');
      }, met),
    ).toContain("the lb lane's limit if zone A fails, 20,000/s, is neither a tick nor words");
    const lostAt = (st: Stage) => st.D.prims().filter((p) => p.id.startsWith('lost-replicas-'));
    const zoneWide = (edit: (st: Stage) => void) => {
      const st = buildStage(700, zone, REST);
      edit(st);
      return assertions(st, zone).join(' | ');
    };
    expect(
      zoneWide((st) => {
        const m = lostAt(st)[0];
        if (m?.k === 'rect') m.w = st.g.xb + 20 - m.x;
      }),
    ).toMatch(/lost-replicas-\w+ runs past the axis's end/);
    expect(
      zoneWide((st) => {
        const m = lostAt(st).at(-1);
        if (m?.k === 'rect')
          st.D.add('top', 'ghost-replicas', { k: 'line', cls: 'ghost-tick', x1: m.x + m.w - 6, y1: 0, x2: m.x + m.w - 6, y2: 1 });
      }),
    ).toMatch(/the replicas ghost tick [\d.]+ px from the lost group's end/);
    expect(
      caught((st) => {
        const i = st.D.texts.findIndex((x) => x.owner === 'zone-lb');
        st.D.texts.splice(i, 1);
      }),
    ).toMatch(/the lb strip letters \d of its \d zones/);
  });
});
