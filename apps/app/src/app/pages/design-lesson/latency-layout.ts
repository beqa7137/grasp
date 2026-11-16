import {
  LATENCY_LOADS,
  LATENCY_SETTINGS,
  LATENCY_UNSTABLE_WINDOW_MS,
  LATENCY_WINDOW_MS,
  formatDuration,
  formatQps,
  waitingSteps,
  type LatencySample,
  type LatencyScenario,
  type LatencySettings,
  type PlayPlan,
} from '@grasp/engine';
import { drawBand, drawReceipt, type Band } from './latency-band';
import { drawModel, type ModelMeta } from './latency-chart';
import { Draw, TEXT, columnPoints, cubic, focusOutlines, pick, r1, sampleLine, tw, xGlyph, type Part, type Prim } from './latency-draw';
import type { Focus } from './focus-layout';
import { LONGEST_QUEUE, NOTHING_HIDDEN, critical, loadParts, momentForms, serversLabel, summary, type Hid } from './latency-words';

/** From this stage width the drawing takes its wide form: the key beside the title, the rates in the load row. */
export const WIDE_FROM = 520;
/** The waiting row's scale: the smallest of these that holds the window (and the model's drift). */
export const SCALES = [2, 5, 10, 20, 50, 100, 200, 500, 1000] as const;

export interface StageView {
  hid: Hid;
  /** A play's moment, in ms of the sample's window; null at rest, where the band shows the window's rest moment. */
  tau: number | null;
  plan: PlayPlan | null;
  /** The setting before the learner's last change, drawn as a ghost; never while a question asks. */
  ghost: LatencySettings | null;
  /** The waiting scale may not go below this: an experiment keeps its setup's. */
  qFloor: number;
  focus: readonly string[];
}

/** The timeline's axis, for a play's playhead and clip. */
export interface Timeline {
  x0: number;
  x1: number;
  top: number;
  bottom: number;
  window: number;
  Q: number;
  yw: number;
  wh: number;
  X: (t: number) => number;
  Yq: (n: number) => number;
}

export interface StageMeta extends ModelMeta {
  rate: number | null;
  scale: number;
  band: { idle: number[]; lines: number[] };
}

export interface Stage {
  D: Draw;
  H: number;
  wide: boolean;
  play: { x: number; y: number };
  load: { positions: number[]; y: number };
  band: Band;
  timeline: Timeline;
  focus: (Focus & { region: string })[];
  summary: string;
  meta: StageMeta;
}

/** The waiting row's scale for a sample: the smallest that holds its fullest moment and, past capacity, the drift's end. */
export function scaleOf(smp: LatencySample, m: LatencyScenario, drift: boolean): number {
  const most = Math.max(0, ...waitingSteps(smp).map((p) => p[1]));
  const end = !m.stable && drift && !critical(m) ? (m.growthPerS * smp.window) / 1000 : 0;
  return SCALES.find((q) => q >= Math.max(1, most, end)) ?? SCALES[SCALES.length - 1];
}

/**
 * Every servers' label any setting can print, for the widest the label row reserves. The label reads only the load and
 * the servers that are up, so each comes from those alone, not the full model.
 */
let serversLabels: string[] | null = null;
function allServersLabels(): string[] {
  if (!serversLabels) {
    const out = new Set(['Servers · each ?%', '3 up · each ?%', '1 up · ?%']);
    for (const settings of LATENCY_SETTINGS.filter((x) => !x.queue && !x.service)) {
      const up = settings.servers - settings.down;
      const rho = ((settings.load / 100) * settings.servers) / up;
      out.add(serversLabel({ settings, up, rho, stable: rho < 1 } as LatencyScenario, NOTHING_HIDDEN));
    }
    serversLabels = [...out];
  }
  return serversLabels;
}

/**
 * The Latency & Queueing stage at width `W`: a sample of random arrivals (the load, the band of queue and servers at one
 * moment, the window's timeline) over the exact model (the numbers, where the time goes, the curve and 100 requests).
 * At rest the band shows the sample's rest moment; in a play (`view.tau`) the band is left to `bandAt` and the timeline
 * is drawn whole, for the component to reveal up to the play's clock.
 */
export function buildStage(W: number, m: LatencyScenario, smp: LatencySample | null, view: StageView): Stage {
  const D = new Draw(W);
  const hid = view.hid;
  const wide = W >= WIDE_FROM;
  const pad = wide ? 16 : 10;
  const s = m.settings;
  const playing = view.tau !== null;
  const shownSample = hid.sample ? null : smp;

  // Header: Play, the sample's title and the key, beside the title when wide and on its own row when narrow.
  const play = { x: pad - 8, y: 2 };
  D.mark({ x0: pad - 6, x1: pad + 34, y0: 4, y1: 44 }, 'play');
  const key: [string, string][] = [
    ['waiting', 'wait'],
    ['in service', 'serve'],
  ];
  const keyW = key.reduce((a, [n]) => a + 24 + tw(n, 'small'), 0) - 12;
  const keyAt = (x: number, ky: number) => {
    let lx = x;
    for (const [name, cls] of key) {
      D.add('marks', `key-${cls}`, { k: 'circle', cls: `key-dot ${cls}`, cx: lx + 4, cy: ky - 4, r: 4 });
      D.mark({ x0: lx, x1: lx + 8, y0: ky - 8, y1: ky }, 'key');
      D.text(`key-${cls}-name`, lx + 12, ky, [[name, 'small', 'muted']], { owner: 'key' });
      lx += 12 + tw(name, 'small') + 12;
    }
  };
  const headRoom = (wide ? W - pad - keyW - 16 : W - pad) - (pad + 40);
  const title = pick(['A sample of random arrivals', 'Random arrivals'], (t) => tw(t, 'capB') <= headRoom) ?? 'Random arrivals';
  D.text('sample-title', pad + 40, 29, [[title, 'capB', 'ink']], { owner: 'head' });
  let y: number;
  if (wide) {
    keyAt(W - pad - keyW, 29);
    y = 50;
  } else {
    keyAt(pad, 62);
    y = 70;
  }

  // Load: the fleet's load with every server up, its handle, and the arrival rate and the work it means.
  const lp = loadParts(m);
  const loadTop = y;
  const loadLine: Part[] = [
    ['Load', 'label'],
    [lp.busy, 'capB', 'ink', 10],
  ];
  if (wide) {
    const r = pick(lp.rates, (t) => TEXT.partsWidth([...loadLine, [` · ${t}`, 'cap']]) <= W - 2 * pad);
    if (r) loadLine.push([` · ${r}`, 'cap', 'muted']);
  }
  D.text('load-row', pad, loadTop + 12, loadLine, { owner: 'load' });
  const tx0 = Math.max(pad + 8, 23);
  const tx1 = Math.min(W - pad - 8, W - 23);
  const ty = loadTop + 34;
  const lpos = (l: number) => tx0 + ((l - LATENCY_LOADS[0]) * (tx1 - tx0)) / (LATENCY_LOADS[LATENCY_LOADS.length - 1] - LATENCY_LOADS[0]);
  D.add('marks', 'load-rail', { k: 'line', cls: 'rail', x1: tx0, y1: ty, x2: tx1, y2: ty });
  D.add('marks', 'load-fill', { k: 'line', cls: 'fill', x1: tx0, y1: ty, x2: r1(lpos(s.load)), y2: ty });
  for (const l of LATENCY_LOADS) D.add('marks', `load-stop-${l}`, { k: 'circle', cls: 'stop', cx: r1(lpos(l)), cy: ty, r: 2 });
  D.mark({ x0: tx0 - 4, x1: tx1 + 4, y0: ty - 14, y1: ty + 14 }, 'load');
  if (wide) {
    D.text('load-min', tx0, ty + 28, [[`${LATENCY_LOADS[0]}%`, 'small', 'muted']], { owner: 'load' });
    D.text('load-max', tx1, ty + 28, [[`${LATENCY_LOADS[LATENCY_LOADS.length - 1]}%`, 'small', 'muted']], { owner: 'load', anchor: 'end' });
    y = ty + 36;
  } else {
    D.text(
      'load-rate',
      pad,
      ty + 30,
      [[pick(lp.rates, (t) => tw(t, 'cap') <= W - 2 * pad) ?? lp.rates[lp.rates.length - 1], 'cap', 'muted']],
      { owner: 'load' },
    );
    y = ty + 38;
  }
  D.region('load', { x: pad - 8, y: loadTop - 4, w: W - 2 * pad + 16, h: y - loadTop + 2 });
  y += 8;

  // The band: the queue (one, or one per server behind a random router) and the servers, at the moment drawn.
  const sw = wide ? 96 : 70;
  const exitW = wide ? 18 : 10;
  const xs = W - pad - exitW - sw;
  const sText = serversLabel(m, hid);
  const serversMax = Math.max(...allServersLabels().map((t) => tw(t, 'label')));
  const oneRow = Math.max(...LONGEST_QUEUE.map((t) => tw(t, 'label'))) + serversMax + 16 <= W - 2 * pad;
  const qRoom = oneRow ? W - 2 * pad - serversMax - 16 : W - 2 * pad;
  const over = !m.stable && !hid.utilization;
  const sY = oneRow ? y + 12 : y + 28;
  D.text('servers-label', W - pad, sY, [[sText, 'label', over ? 'bad' : '']], { owner: 'slabel', anchor: 'end' });
  if (over) xGlyph(D, 'servers-over', W - pad - tw(sText, 'label') - 10, sY - 4, 'slabel', 3.5);
  const bt = (oneRow ? y + 16 : y + 32) + 10;
  const BH = 4 * 30 + 3 * 6;
  const ymid = bt + BH / 2;
  const c = s.servers;
  const up = m.up;
  // Fewer servers are drawn larger, so one server fills the band as four do.
  const bh = c === 1 ? 64 : c === 2 ? 44 : 30;
  const gapS = c === 1 ? 0 : c === 2 ? 16 : 6;
  const ring = c === 1 ? (wide ? 18 : 14) : c === 2 ? 12 : 9;
  const dotR = c === 1 ? 8 : c === 2 ? 6 : 5;
  const split = s.queue === 1 && up > 1;
  const xf = xs - 24;
  const rw = tw('random', 'small');
  const xr = pad + rw + 14;
  const boxes = Array.from({ length: c }, (_, i) => {
    const by = ymid + (i - (c - 1) / 2) * (bh + gapS) - bh / 2;
    return { y: by, ry: by + bh / 2, rx: xs + sw - ring - 7 };
  });
  const band: Band = {
    W,
    pad,
    c,
    up,
    split,
    hidden: hid.sample,
    xs,
    sw,
    exitW,
    boxes,
    bh,
    ring,
    serveR: Math.round(ring * 0.45 * 2) / 2,
    dotR,
    pitch: 2 * dotR + 3,
    xf,
    ymid,
    xr,
    xl0: xr + 40,
    labelY: y + 12,
    qRoom,
    bottom: bt + BH,
  };
  const laneCls = (down: boolean) => `lane${down ? ' down' : ''}${hid.sample ? ' hidden' : ''}`;
  if (!split) {
    D.add('links', 'lane', { k: 'line', cls: laneCls(false), x1: pad, y1: ymid, x2: xf, y2: ymid });
    D.link(sampleLine(pad, ymid, xf, ymid), 'lane');
    boxes.forEach((b, i) => {
      D.add('links', `fork-${i}`, {
        k: 'path',
        cls: laneCls(i >= up),
        d: `M${xf} ${ymid}C${xf + 14} ${ymid} ${xs - 12} ${b.ry} ${xs} ${b.ry}`,
      });
      D.link(cubic([xf, ymid], [xf + 14, ymid], [xs - 12, b.ry], [xs, b.ry]), 'lane');
    });
  } else {
    // A router hands each request to one server at random; its name sits over the inlet, which no lane crosses.
    const xl0 = band.xl0;
    D.add('links', 'lane', { k: 'line', cls: laneCls(false), x1: pad, y1: ymid, x2: xr - 8, y2: ymid });
    D.link(sampleLine(pad, ymid, xr - 8, ymid), 'lane');
    D.text('router-name', pad, ymid - 6, [['random', 'small', 'muted']], { owner: 'router' });
    boxes.forEach((b, i) => {
      D.add('links', `fork-${i}`, {
        k: 'path',
        cls: laneCls(i >= up),
        d: `M${xr + 8} ${ymid}C${xr + 26} ${ymid} ${xl0 - 18} ${b.ry} ${xl0} ${b.ry}L${xs} ${b.ry}`,
      });
      D.link(cubic([xr + 8, ymid], [xr + 26, ymid], [xl0 - 18, b.ry], [xl0, b.ry]), 'lane');
      D.link(sampleLine(xl0, b.ry, xs, b.ry), 'lane');
    });
    D.add('marks', 'router', { k: 'path', cls: 'router', d: `M${xr} ${ymid - 8}L${xr + 8} ${ymid}L${xr} ${ymid + 8}L${xr - 8} ${ymid}Z` });
    D.mark({ x0: xr - 8, x1: xr + 8, y0: ymid - 8, y1: ymid + 8 }, 'router');
  }
  // While the sample waits for the answer, the band is drawn hidden the way the model bar is: dashed lanes and ring
  // tracks and a chip in the lane, never an idle server with nobody waiting (that would be the "None" answer).
  if (hid.sample) {
    const x0c = pad;
    const x1c = (split ? xs - 30 : xf) - 2;
    const t = pick(
      ['Requests arrive after your answer', 'Arrivals after your answer', 'After your answer'],
      (f) => tw(f, 'small') + 16 <= x1c - x0c,
    );
    if (t) {
      const cw = tw(t, 'small') + 16;
      const cx = (x0c + x1c) / 2;
      D.add('marks', 'hidden-chip', { k: 'rect', cls: 'chip hidden-chip', x: r1(cx - cw / 2), y: ymid - 10, w: cw, h: 20, rx: 10 });
      D.mark({ x0: cx - cw / 2, x1: cx + cw / 2, y0: ymid - 10, y1: ymid + 10 }, 'lane');
      D.text('hidden-chip-words', cx, ymid + 4, [[t, 'small', 'muted']], { owner: 'lane', anchor: 'middle', cls: 'on-chip', ground: true });
    } else D.missing.push('the hidden sample chip');
  }
  boxes.forEach((b, i) => {
    const down = i >= up;
    const name = `S${i + 1}`;
    D.add('marks', `srv-${i}`, {
      k: 'rect',
      cls: `srv${down ? ' down' : ''}${over && !down ? ' over' : ''}`,
      x: xs,
      y: b.y,
      w: sw,
      h: bh,
      rx: 8,
    });
    D.mark({ x0: xs, x1: xs + sw, y0: b.y, y1: b.y + bh }, name);
    D.text(`srv-${i}-name`, xs + 9, b.ry + 5, [[name, 'nameS', down ? 'muted' : 'ink']], { owner: name, cls: 'on-box' });
    if (down) {
      if (xs + 9 + tw(name, 'nameS') + 6 + tw('down', 'small') <= b.rx - 9)
        D.text(`srv-${i}-down`, xs + 9 + tw(name, 'nameS') + 6, b.ry + 4, [['down', 'small', 'muted']], { owner: name, cls: 'on-box' });
      xGlyph(D, `srv-${i}-x`, b.rx, b.ry, name, 3.5);
      return;
    }
    D.add('marks', `ring-${i}`, { k: 'circle', cls: `ring-track${hid.sample ? ' hidden' : ''}`, cx: b.rx, cy: b.ry, r: ring });
    D.mark({ x0: b.rx - ring - 1, x1: b.rx + ring + 1, y0: b.ry - ring - 1, y1: b.ry + ring + 1 }, `${name}-ring`);
    D.add('links', `exit-${i}`, {
      k: 'line',
      cls: `lane exit${hid.sample ? ' hidden' : ''}`,
      x1: xs + sw,
      y1: b.ry,
      x2: xs + sw + exitW - 2,
      y2: b.ry,
    });
  });
  const rest = shownSample?.rest ?? null;
  let bandMeta = { idle: [] as number[], lines: [] as number[] };
  if (!playing) {
    const tScene = rest && rest.kind !== 'none' ? rest.t : (shownSample?.window ?? 0);
    bandMeta = drawBand(D, band, m, shownSample, hid, tScene, null);
    if (shownSample && !hid.numbers && !split) drawReceipt(D, band, shownSample, tScene);
  }
  D.region('scene', { x: pad - 8, y: loadTop - 4, w: W - 2 * pad + 16, h: band.bottom + 6 - loadTop + 4 });
  D.region('band', { x: pad - 8, y, w: W - 2 * pad + 16, h: band.bottom + 6 - y });

  // The timeline: the window, its arrivals, the queue's length and each server's busy time. Space, not a rule, parts it
  // from the band: the one rule on the stage parts the sample from the model.
  const tl = drawTimeline(D, {
    W,
    pad,
    wide,
    m,
    win: smp?.window ?? (m.stable ? LATENCY_WINDOW_MS : LATENCY_UNSTABLE_WINDOW_MS),
    smp: shownSample,
    hid,
    playing,
    plan: view.plan,
    qFloor: view.qFloor,
    top: band.bottom + 18,
  });
  y = tl.bottom + 28;

  // The model: exact numbers for this setting, never the sample's.
  const model = drawModel(D, { W, pad, wide, m, hid, ghost: view.ghost }, y);
  y = model.y;
  const focus = view.focus.length ? focusOutlines(D, view.focus, y) : [];
  return {
    D,
    H: y,
    wide,
    play,
    load: { positions: LATENCY_LOADS.map((l) => r1(lpos(l))), y: ty },
    band,
    timeline: tl,
    focus,
    summary: summary(m, hid),
    meta: { ...model.meta, rate: playing ? (view.plan?.rate ?? null) : null, scale: tl.Q, band: bandMeta },
  };
}

interface TimelineCtx {
  W: number;
  pad: number;
  wide: boolean;
  m: LatencyScenario;
  /** The window's length: the sample's own, which the axis keeps while the sample waits. */
  win: number;
  smp: LatencySample | null;
  hid: Hid;
  playing: boolean;
  plan: PlayPlan | null;
  qFloor: number;
  top: number;
}

/** The window as a timeline, whole: a play reveals it up to its clock (`timeline-clip` marks). */
function drawTimeline(D: Draw, t: TimelineCtx): Timeline {
  const { W, pad, wide, m, smp, hid, win } = t;
  const winWord = formatDuration(win);
  let y = t.top;
  const top = y;
  const tlForms = hid.stability
    ? ['The sample after the failure', 'After the failure']
    : !m.stable
      ? [`The first ${winWord}, starting empty`, `First ${winWord}, from empty`, `${winWord} from empty`]
      : [`The last ${winWord} of this sample`, `The last ${winWord}`];
  // The label row's right side: the play's speed from its own clock, or at rest the moment the band shows.
  let right: string[] = [];
  let ringMark = false;
  if (t.playing && smp && !hid.stability && t.plan)
    right = t.plan.rate === 1 ? ['playing in real time', 'real time'] : [`playing ${t.plan.rate}× slower`, `${t.plan.rate}× slower`];
  else if (!t.playing && smp && smp.rest.kind !== 'none') {
    ringMark = true;
    right = momentForms(smp);
  }
  let label = tlForms[tlForms.length - 1];
  let rightText: string | null = null;
  const extra = ringMark ? 12 : 0;
  outer: for (const l of tlForms)
    for (const r of right.length ? right : [null]) {
      if (tw(l, 'label') + (r ? tw(r, 'small') + 16 + extra : 0) <= W - 2 * pad) {
        label = l;
        rightText = r;
        break outer;
      }
    }
  if (right.length && !rightText) D.missing.push(right[right.length - 1]);
  D.text('timeline-label', pad, y + 14, [[label, 'label']], { owner: 'tl' });
  if (rightText) {
    const note = D.text(t.playing ? 'rate-note' : 'moment-note', W - pad, y + 14, [[rightText, 'small', 'muted']], {
      owner: 'tl',
      anchor: 'end',
    });
    if (ringMark) {
      D.add('top', 'moment-key', { k: 'circle', cls: 'peak', cx: r1(note.x0 - 8), cy: y + 10, r: 3.5 });
      D.mark({ x0: note.x0 - 12, x1: note.x0 - 4, y0: y + 6, y1: y + 14 }, 'tl');
    }
  }
  const g = wide ? 64 : 54;
  const x0 = pad + g;
  const x1 = W - pad - 4;
  const X = (tt: number) => x0 + (Math.max(0, Math.min(win, tt)) / win) * (x1 - x0);
  const ya = y + 26;
  D.text('tl-arrivals', pad, ya + 9, [['arrivals', 'small', 'muted']], { owner: 'tl-names' });
  const yw = ya + 18;
  const WH = 34;
  const drifting = !!smp && !m.stable && !critical(m) && !hid.stability;
  D.text('tl-waiting', pad, drifting ? yw + 17 : yw + WH / 2 + 6, [['waiting', 'small', 'muted']], { owner: 'tl-names' });
  const ys = yw + WH + 10;
  const SH = 44;
  const c = m.settings.servers;
  const rh = (SH - (c - 1) * 4) / c;
  const rowY = (i: number) => ys + i * (rh + 4);
  for (let i = 0; i < c; i++)
    D.text(`tl-s${i}`, pad, rowY(i) + rh / 2 + 4, [[`S${i + 1}`, 'mono', i >= m.up ? 'muted' : 'ink']], { owner: 'tl-names' });
  const yax = ys + SH + 8;
  D.add('grid', 'tl-arr-track', { k: 'line', cls: 'row-track', x1: x0, y1: ya + 10, x2: x1, y2: ya + 10 });
  D.add('grid', 'tl-wait-track', { k: 'line', cls: 'row-track', x1: x0, y1: yw + WH, x2: x1, y2: yw + WH });
  D.add('grid', 'tl-axis', { k: 'line', cls: 'axis', x1: x0, y1: yax, x2: x1, y2: yax });
  const tstep = (win > 4000 ? 1000 : win >= 1000 ? 500 : 100) * (x1 - x0 < 260 ? 2 : 1);
  for (let tt = 0; tt <= win; tt += tstep) {
    D.add('grid', `tl-tick-${tt}`, { k: 'line', cls: 'axis', x1: r1(X(tt)), y1: yax, x2: r1(X(tt)), y2: yax + 4 });
    const word = win >= 1000 ? (tt === win ? `${tt / 1000} s` : String(tt / 1000)) : tt === win ? `${tt} ms` : String(tt);
    D.text(`tl-tick-${tt}-label`, X(tt), yax + 15, [[word, 'small', 'muted']], {
      owner: 'tl-axis',
      anchor: tt === 0 ? 'start' : tt === win ? 'end' : 'middle',
    });
  }
  for (let i = 0; i < c; i++) {
    if (i >= m.up) D.add('marks', `tl-down-${i}`, { k: 'rect', cls: 'busy-down', x: x0, y: r1(rowY(i)), w: r1(x1 - x0), h: r1(rh), rx: 0 });
    else D.add('grid', `tl-row-${i}`, { k: 'line', cls: 'row-track', x1: x0, y1: r1(rowY(i) + rh), x2: x1, y2: r1(rowY(i) + rh) });
  }
  D.mark({ x0, x1, y0: ya, y1: ya + 10 }, 'tl-arr');
  D.mark({ x0, x1, y0: ys, y1: ys + SH }, 'tl-busy');
  let Q: number = SCALES[0];
  const Yq = (n: number) => yw + WH - (Math.min(n, Q) / Q) * WH;
  if (smp) {
    // A path per kind of mark, so the timeline stays a handful of elements however many requests its window holds.
    // Arrivals that overlap go in different paths, so a faint tick still adds to its neighbors and a burst reads darker.
    const layers: { end: number; d: string }[] = [];
    for (const r of smp.reqs) {
      if (r.arrive < 0 || r.arrive > win) continue;
      const x = r1(X(r.arrive) - 0.75);
      let layer = layers.find((l) => l.end <= x + 1e-6);
      if (!layer) layers.push((layer = { end: 0, d: '' }));
      layer.d += `M${x} ${ya}h1.5v10h-1.5Z`;
      layer.end = x + 1.5;
    }
    layers.forEach((l, i) => D.add('clip', `ticks-${i}`, { k: 'path', cls: `tick-arr${win >= 1000 ? ' dense' : ''}`, d: l.d }));
    // Busy time: a block per busy period, so white is only ever idle time, with a notch of stage color on its top edge
    // where each next request starts, under the start of the request after it.
    const blocks = Array.from({ length: c }, () => [] as { x: number; w: number; after: boolean }[]);
    const lastLeave: (number | null)[] = Array.from({ length: c }, () => null);
    for (const r of smp.reqs) {
      const a = Math.max(0, r.start);
      const bEnd = Math.min(r.leave, win);
      const after = r.start > 0 && r.start === lastLeave[r.server];
      lastLeave[r.server] = r.leave;
      if (bEnd <= a) continue;
      const xa = X(a);
      blocks[r.server].push({ x: r1(xa), w: Math.max(xa + 0.6, X(bEnd)) - xa, after });
    }
    let notches = '';
    blocks.forEach((row, i) => {
      const rowTop = r1(rowY(i));
      const h = r1(rh);
      let d = '';
      let run: [number, number] | null = null;
      const close = () => {
        if (run) d += `M${run[0]} ${rowTop}h${r1(run[1] - run[0])}v${h}h${-r1(run[1] - run[0])}Z`;
      };
      row.forEach((b, k) => {
        if (run && b.after) {
          run[1] = Math.max(run[1], b.x + b.w);
          const x = r1(b.x - 0.5);
          const w = r1(Math.min(1, (row[k + 1]?.x ?? Infinity) - x));
          if (w > 0) notches += `M${x} ${rowTop}h${w}v${Math.min(3, rh / 2)}h${-w}Z`;
        } else {
          close();
          run = [b.x, b.x + b.w];
        }
      });
      close();
      if (d) D.add('clip', `busy-${i}`, { k: 'path', cls: 'busy', d });
    });
    if (notches) D.add('clip', 'notches', { k: 'path', cls: 'notch', d: notches });
    // The waiting row's scale is an axis, fixed for the whole window (and in an experiment never below its setup's), so
    // nothing drawn changes as a play goes on; a faint line marks it.
    const drift = drifting && !m.stable ? (m.growthPerS * win) / 1000 : 0;
    Q = Math.max(scaleOf(smp, m, !hid.stability), t.qFloor);
    D.add('grid', 'tl-scale-line', { k: 'line', cls: 'qgrid', x1: x0, y1: yw, x2: x1, y2: yw });
    D.text('tl-scale', x0 - 6, yw + 4, [[String(Q), 'small', 'muted']], { owner: 'tl-scale', anchor: 'end' });
    const steps = waitingSteps(smp);
    const edge: [number, number][] = [[x0, yw + WH]];
    let prev = 0;
    for (const [tt, n] of steps) {
      edge.push([X(tt), Yq(prev)], [X(tt), Yq(n)]);
      prev = n;
    }
    edge.push([X(win), Yq(prev)]);
    const d = edge.map(([ex, ey], i) => `${i ? 'L' : 'M'}${r1(ex)} ${r1(ey)}`).join('');
    D.add('clip', 'area', { k: 'path', cls: 'area-wait', d: `${d}L${r1(X(win))} ${yw + WH}Z` });
    D.add('clip', 'area-edge', { k: 'path', cls: 'area-edge', d });
    D.link(columnPoints(edge), 'area');
    // The moment the band shows, at rest: a dotted line through the timeline and a ring on the area there.
    if (ringMark) {
      const px = X(smp.rest.t);
      const py = Yq(smp.rest.total);
      D.add('top', 'moment', { k: 'line', cls: 'moment', x1: r1(px), y1: ya - 4, x2: r1(px), y2: yax });
      D.link(sampleLine(px, ya - 4, px, yax), 'moment');
      D.add('top', 'peak', { k: 'circle', cls: 'peak', cx: r1(px), cy: r1(py), r: 3.5 });
      D.mark({ x0: px - 4, x1: px + 4, y0: py - 4, y1: py + 4 }, 'peak');
    }
    // With no steady state, the model's drift from empty as a dashed line beside the sample's wander.
    if (drift > 0) drawDrift(D, { x0, x1, yw, X, Yq, pad, win, growth: m.stable ? 0 : m.growthPerS });
  } else {
    const later =
      pick(['The sample plays after your answer', 'Plays after your answer'], (f) => tw(f, 'cap') <= x1 - x0 - 8) ?? 'After your answer';
    D.text('tl-wait-later', x0 + 6, yw + WH / 2 + 4, [[later, 'cap', 'muted']], { owner: 'tl-wait' });
  }
  D.region('timeline', { x: pad - 8, y: top - 2, w: W - 2 * pad + 16, h: yax + 20 - top + 2 });
  return { x0, x1, top: ya - 4, bottom: yax, window: win, Q, yw, wh: WH, X, Yq };
}

function drawDrift(
  D: Draw,
  o: { x0: number; x1: number; yw: number; X: (t: number) => number; Yq: (n: number) => number; pad: number; win: number; growth: number },
) {
  const end = (o.growth * o.win) / 1000;
  D.add('links', 'drift', { k: 'line', cls: 'drift', x1: o.x0, y1: o.Yq(0), x2: r1(o.X(o.win)), y2: r1(o.Yq(end)) });
  D.link(sampleLine(o.x0, o.Yq(0), o.X(o.win), o.Yq(end), 2), 'drift');
  const g = formatQps(o.growth).replace('/s', '');
  const forms = [`the model: +${g} a second`, `model: +${g}/s`, `+${g}/s`];
  for (const t of forms)
    for (let xx = o.x0 + 4; xx + 18 + tw(t, 'small') <= o.x1; xx += 6) {
      const swatch = { x0: xx, x1: xx + 14, y0: o.yw + 5, y1: o.yw + 9 };
      if (!D.free(swatch, '', 1) || !D.free(D.textBox(xx + 18, o.yw + 11, tw(t, 'small'), 'small'), '', 1)) continue;
      D.add('top', 'drift-swatch', { k: 'line', cls: 'drift', x1: xx, y1: o.yw + 7, x2: xx + 14, y2: o.yw + 7 });
      D.mark(swatch, 'drift-key');
      D.text('drift-key', xx + 18, o.yw + 11, [[t, 'small', 'ink']], { owner: 'drift-key', ground: true });
      return;
    }
  // No room in the row: the key goes in the gutter under the row's name, in its shortest form.
  D.add('top', 'drift-swatch', { k: 'line', cls: 'drift', x1: o.pad, y1: o.yw + 27, x2: o.pad + 12, y2: o.yw + 27 });
  D.mark({ x0: o.pad, x1: o.pad + 12, y0: o.yw + 25, y1: o.yw + 29 }, 'drift-key');
  D.text('drift-key', o.pad + 15, o.yw + 31, [[forms[forms.length - 1], 'small', 'ink']], { owner: 'drift-key' });
}

/** The band at a moment of a play, as its own marks, drawn over the stage the play keeps. */
export function bandAt(st: Stage, m: LatencyScenario, smp: LatencySample, hid: Hid, t: number, rate: number): Prim[] {
  const D = new Draw(st.D.W);
  drawBand(D, st.band, m, smp, hid, t, { rate });
  return D.prims();
}
