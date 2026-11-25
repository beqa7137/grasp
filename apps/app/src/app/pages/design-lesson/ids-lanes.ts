import {
  ID_FAULT,
  ID_STEP_AT_US,
  ID_WINDOW_US,
  formatIdMs,
  formatInt,
  idGroups,
  ownTicks,
  type IdGroup,
  type MintedId,
} from '@grasp/engine';
import { sampleLine } from './latency-draw';
import { IDS_TEXT, hit, label, line, r1, rect, small, text, type Ctx, type Part } from './ids-draw';

export const LANE_H = 74;
const GAUGE_H = 32;
/** A lane's wait bars and same-lane repeat links stack this far apart when their spans overlap, at most this deep. */
const STACK = 5;
const DEPTH = 3;
export const CAPTION =
  'None talks to another. The clock starts at 12:00:00.000 UTC on 24 November 2026, and the axis is true time; a lane with a faulty clock shows its own ticks. A number over dots is their sequence; a dot with none is sequence 0.';

export const gutterOf = (W: number) => (W >= 480 ? 150 : 58);
export const dotR = (W: number) => (W < 360 ? 3.5 : 4.5);

/** The plot's x for a moment of true time, in µs. */
export const padOf = (W: number) => (W < 300 ? 12 : 16);
export const laneX = (W: number) => {
  const x0 = padOf(W) + gutterOf(W);
  const w = W - padOf(W) - x0;
  return { x0, w, X: (us: number) => x0 + (Math.min(us, ID_WINDOW_US) / ID_WINDOW_US) * w };
};

/** Whether an id has been made by the play's clock. */
export const madeBy = (c: Ctx, x: MintedId) => c.view.t === null || x.issued <= c.view.t;

function gutter(c: Ctx, g: number, ly: number) {
  const { W, PAD, s, m } = c;
  const lane = m.lanes[g];
  const gw = gutterOf(W) - 8;
  const wide = gutterOf(W) > 100;
  const name: Part[] = [
    [`G${g}`, 'capB', 'ink'],
    [wide ? `  number ${lane.number}` : ` #${lane.number}`, 'small', lane.number !== g ? 'bad' : 'muted'],
  ];
  text(c, `lane-name-${g}`, PAD, ly + 30, name, { owner: `gutter-${g}` });
  const notes: string[][] = [];
  if (s.fault === ID_FAULT.skew && g === 2) notes.push(["G2's clock 2 ms ahead", 'clock +2 ms', '+2 ms']);
  if (s.fault === ID_FAULT.stepBack && g === 1) notes.push(['clock steps back 2 ms at 5.5', 'steps back 2 ms', '−2 ms']);
  if (s.fault === ID_FAULT.shared && g === 2) notes.push(["given G1's number, 1", 'given number 1', 'number 1']);
  const after = lane.ids.filter((x) => x.issued >= ID_WINDOW_US).length;
  if (after && c.view.t === null)
    notes.push([`+${formatInt(after)} after 8 ms`, `+${formatInt(after)} later`, `+${formatInt(after)}`]);
  notes.forEach((forms, i) => {
    const t = forms.find((f) => IDS_TEXT.tw(f, 'small') <= gw) ?? forms.at(-1)!;
    text(c, `lane-note-${g}-${i}`, PAD, ly + 46 + i * 15, small(t, i === 0 && notes.length > (after ? 1 : 0) ? 'warn' : 'muted'), {
      owner: `gutter-${g}`,
    });
  });
}

/**
 * Band C, "Three generators, no coordination": each generator's lane over 8 ms of true time, shaded by its own clock's
 * ticks, each id a dot at the moment it was made (a burst's tick one gauge), with its sequence numbers, a burst's
 * bracket and wait, and a repeat ringed with a hairline to its first copy. Only ids made by the play's clock are drawn.
 */
export function lanesBand(c: Ctx, y0: number): number {
  const { D, W, PAD, s, m, hid, view } = c;
  const full = W - 2 * PAD;
  line(c, 'grid', 'c-rule', 'rule', 0, y0, W, y0);
  text(c, 'c-title', PAD, y0 + 30, label(W >= 400 ? 'Three generators, no coordination' : 'Three generators'), { owner: 'c-head' });
  hit(c, { kind: 'play', x: W - PAD - 44, y: y0 + 6, w: 44, h: 44, owner: 'play' });
  let y = y0 + 54;
  const cap = IDS_TEXT.wrap(CAPTION, 'small', full);
  cap.forEach((t, i) => text(c, `c-cap-${i}`, PAD, y + 11 + i * 14, small(t), { owner: 'c-cap' }));
  y += cap.length * 14 + 8;
  const { x0, w, X } = laneX(W);
  const r = dotR(W);
  const groups = idGroups(m);
  const byKey = new Map(m.ids.map((x) => [x.key, x]));
  for (let g = 0; g < 3; g++) {
    const ly = y + g * LANE_H;
    const lane = m.lanes[g];
    const ln = ly + 50;
    D.region(`laneG${g}`, { x: PAD - 2, y: ly + 2, w: full + 4, h: LANE_H - 4 });
    gutter(c, g, ly);
    const tickUs = s.tick * 1000;
    // A faulty clock's own tick is named where it differs from true time, once the play reaches it, and never while the
    // order is asked about: the tick an id carries would give its place away.
    const differs = (b: { tick: number; from: number; to: number }) =>
      Math.floor(b.from / tickUs) !== b.tick || Math.floor((b.to - 1e-6) / tickUs) !== b.tick;
    for (const b of laneTicks(c, g)) {
      if (b.tick % 2 === 0)
        rect(c, 'back', `band-${g}-${b.tick}-${b.from}`, 'tick-band', X(b.from), ly + 4, X(b.to) - X(b.from), LANE_H - 8);
      const name = String(b.tick);
      if (!hid.order && differs(b) && (view.t === null || b.from <= view.t) && X(b.to) - X(b.from) >= IDS_TEXT.tw(name, 'mono') + 6)
        text(c, `own-${g}-${b.tick}-${b.from}`, (X(b.from) + X(b.to)) / 2, ly + 14, [[name, 'mono', 'muted halo']], {
          anchor: 'middle',
          owner: `own-${g}`,
        });
    }
    if (s.fault === ID_FAULT.stepBack && g === 1 && (view.t === null || view.t >= ID_STEP_AT_US)) {
      const sx = X(ID_STEP_AT_US);
      line(c, 'marks', 'step-tick', 'step-tick', sx, ln - 7, sx, ln + 7);
      D.link(
        [
          [sx, ln - 7],
          [sx, ln + 7],
        ],
        'step',
      );
    }
    if (!lane.runs) {
      const why =
        lane.why === 'overflow'
          ? ["refuses: the clock is past the timestamp's end", 'refuses: no time left', 'refuses']
          : [
              `cannot run: ${formatInt(m.layout.genBits)} generator ${m.layout.genBits === 1 ? 'bit gives' : 'bits give'} only ${formatInt(m.layout.generators)} ${m.layout.generators === 1 ? 'number' : 'numbers'}`,
              'no number for it',
              'no number',
            ];
      const t = why.find((f) => IDS_TEXT.tw(f, 'small') <= w - 8) ?? why.at(-1)!;
      text(c, `lane-why-${g}`, x0 + 4, ln - 4, small(t, 'bad'), { owner: `lane-${g}` });
      continue;
    }
    line(c, 'grid', `lane-line-${g}`, 'lane-line', x0, ln, x0 + w, ln);
    D.link(
      [
        [x0, ln],
        [x0 + w, ln],
      ],
      `lane-${g}`,
    );
    const mine = groups.filter((gr) => gr.lane === g && gr.first.issued < ID_WINDOW_US && madeBy(c, gr.first));
    for (const gr of mine) (gr.single ? dots : gauge)(c, gr, ln, X, r);
    // A burst arrives at one moment, so its waits are told once, by its last request.
    if (g === 0 && s.load === 1) burstNotes(c, mine, ly, ln, X);
    else waits(c, waitedIn(c, mine), ln, X);
  }
  if (!hid.repeats) {
    const depth = stacker();
    for (const x of m.repeats) {
      const twin = byKey.get(x.repeatOf!)!;
      if (x.issued >= ID_WINDOW_US || !madeBy(c, x)) continue;
      const ya = y + twin.lane * LANE_H + 50;
      const yb = y + x.lane * LANE_H + 50;
      const xa = X(twin.issued);
      const xb = X(x.issued);
      const pts: [number, number][] = [];
      let d: string;
      if (twin.lane === x.lane) {
        const ry = ya + 12 + depth(x.lane, xa, xb) * STACK;
        d = `M${r1(xa)} ${ya + r}V${ry}H${r1(xb)}V${yb + r}`;
        pts.push(...sampleLine(xa, ya + r, xa, ry, 2), ...sampleLine(xa, ry, xb, ry, 2), ...sampleLine(xb, ry, xb, yb + r, 2));
      } else {
        // Across lanes the link leaves the upper dot downward, crosses into the lower lane where nothing is written, runs
        // under the lower dot's lane and rises into it, clear of the labels over its dots.
        const [up, down] = ya < yb ? [[xa, ya], [xb, yb]] : [[xb, yb], [xa, ya]];
        const y1 = up[1] + 12;
        const ry = down[1] + 12 + depth(x.lane, xa, xb) * STACK;
        const lanes = `lane-${twin.lane} lane-${x.lane} repeat-${x.key}`;
        const at = [0, -6, 6, -12, 12, -18, 18, -24, 24, -32, 32, -40, 40]
          .map((dx) => up[0] + dx)
          .find((dx) => dx >= x0 && dx <= x0 + w && D.free({ x0: dx - 0.5, x1: dx + 0.5, y0: y1, y1: ry }, lanes, 1)) ?? up[0];
        d = `M${r1(up[0])} ${up[1] + r}V${y1}H${r1(at)}V${ry}H${r1(down[0])}V${down[1] + r}`;
        pts.push(
          ...sampleLine(up[0], up[1] + r, up[0], y1, 2),
          ...sampleLine(up[0], y1, at, y1, 2),
          ...sampleLine(at, y1, at, ry, 2),
          ...sampleLine(at, ry, down[0], ry, 2),
          ...sampleLine(down[0], ry, down[0], down[1] + r, 2),
        );
      }
      D.add('links', `repeat-link-${x.key}`, { k: 'path', cls: 'repeat-link', d });
      D.link(pts, `repeat-${x.key}`);
      D.add('dots', `twin-${x.key}`, { k: 'circle', cls: 'twin-ring', cx: r1(xa), cy: ya, r: r + 2.5 });
      D.add('dots', `repeat-ring-${x.key}`, { k: 'circle', cls: 'repeat-ring', cx: r1(xb), cy: yb, r: r + 3 });
    }
  }
  const ay = y + 3 * LANE_H + 4;
  line(c, 'grid', 'lanes-axis', 'axis', x0, ay, x0 + w, ay);
  for (let ms = 0; ms <= 8; ms++) {
    line(c, 'grid', `lanes-axis-tick-${ms}`, 'tickmark', X(ms * 1000), ay, X(ms * 1000), ay + 4);
    if (ms % 2 === 0)
      text(c, `lanes-axis-label-${ms}`, X(ms * 1000), ay + 17, small(ms === 8 ? '8 ms' : String(ms)), {
        anchor: ms === 8 ? 'end' : 'middle',
        owner: 'lanes-axis',
      });
  }
  return ay + 26;
}

/** A lane's ticks by its own clock as the play has reached them: until a step back happens, the clock runs on. */
function laneTicks(c: Ctx, g: number) {
  const { s, view } = c;
  const bands = ownTicks(s, g);
  if (s.fault !== ID_FAULT.stepBack || g !== 1 || view.t === null || view.t >= ID_STEP_AT_US) return bands;
  const on = ownTicks({ ...s, fault: ID_FAULT.none }, g)
    .filter((b) => b.to > ID_STEP_AT_US)
    .map((b) => ({ ...b, from: Math.max(b.from, ID_STEP_AT_US) }));
  return [...bands.filter((b) => b.from < ID_STEP_AT_US), ...on];
}

/** The depth of a span in its lane: the first level whose spans it does not overlap, so no two share a segment. */
function stacker(deepest = DEPTH) {
  const ends = new Map<number, number[]>();
  return (lane: number, a: number, b: number) => {
    const levels = ends.get(lane) ?? [];
    ends.set(lane, levels);
    const [lo, hi] = a < b ? [a, b] : [b, a];
    let k = levels.findIndex((end) => end <= lo - 3);
    if (k < 0) k = Math.min(levels.length, deepest - 1);
    levels[k] = Math.max(levels[k] ?? -Infinity, hi);
    return k;
  };
}

/** The ids of a lane's dots that waited and are drawn, the marks `waits` draws. */
export const waitedIn = (c: Ctx, groups: readonly IdGroup[]) =>
  groups.filter((gr) => gr.single).flatMap((gr) => gr.ids.filter((x) => x.wait > 0 && x.issued < ID_WINDOW_US && madeBy(c, x)));

/** Each waited id's request: a tick where it arrived, a bar to the dot where it was served, and why it waited. */
function waits(c: Ctx, ids: readonly MintedId[], ln: number, X: (us: number) => number) {
  const depth = stacker(2);
  const sorted = [...ids].sort((a, b) => a.arrival - b.arrival);
  for (const x of sorted) {
    const xa = X(x.arrival);
    const xb = X(x.issued);
    const wy = ln + 8 + depth(0, xa, xb) * STACK;
    line(c, 'marks', `arrive-${x.key}`, 'arrive-tick', xa, wy - 3, xa, wy + 3);
    line(c, 'marks', `wait-${x.key}`, 'wait-line', xa, wy, xb, wy);
    c.D.link(sampleLine(xa, wy, xb, wy, 2), `wait-${x.key}`);
    c.D.mark({ x0: xa - 1, x1: xa + 1, y0: wy - 3, y1: wy + 3 }, `wait-${x.key}`);
  }
  for (const x of sorted) {
    const xa = X(x.arrival);
    const xb = X(x.issued);
    const why = x.why === 'clock' ? 'clock behind' : x.why === 'full' ? 'sequence full' : 'in line';
    c.D.place(
      `wait-why-${x.key}`,
      [
        [(xa + xb) / 2, ln + 21, 'middle'],
        [xb, ln + 21, 'end'],
        [xa, ln + 21, 'start'],
      ],
      small(why, 'warn'),
      { owner: `wait-${x.key}`, optional: true },
    );
  }
}

function dots(c: Ctx, gr: IdGroup, ln: number, X: (us: number) => number, r: number) {
  const { D, view, hid, shown } = c;
  const ids = gr.ids.filter((x) => madeBy(c, x) && x.issued < ID_WINDOW_US);
  const xs = ids.map((x) => X(x.issued));
  ids.forEach((x, i) => {
    const repeat = !hid.repeats && !!x.repeatOf;
    const cls = `dot${repeat ? ' repeat' : ''}${shown?.key === x.key ? ' inspected' : ''}`;
    D.add('dots', `dot-${x.key}`, { k: 'circle', cls, cx: r1(xs[i]), cy: ln, r });
    D.mark({ x0: xs[i] - r, x1: xs[i] + r, y0: ln - r, y1: ln + r }, `dot-${x.key}`);
    if (shown?.key === x.key) D.add('dots', 'inspect-ring', { k: 'circle', cls: 'inspect-ring', cx: r1(xs[i]), cy: ln, r: r + 3.5 });
    if (view.pair?.includes(x.key))
      D.add('dots', `pair-ring-lane-${x.key}`, { k: 'circle', cls: 'pair-ring', cx: r1(xs[i]), cy: ln, r: r + 6 });
  });
  if (ids.every((x) => x.seq === 0)) return;
  const labels = ids.map((x) => formatInt(x.seq));
  const wd = labels.map((t) => IDS_TEXT.tw(t, 'mono'));
  const apart = xs.every((x, i) => i === 0 || x - wd[i] / 2 - (xs[i - 1] + wd[i - 1] / 2) >= 6);
  if (apart)
    labels.forEach((t, i) =>
      text(c, `seq-${ids[i].key}`, xs[i], ln - 10, [[t, 'mono', 'muted']], { anchor: 'middle', owner: `seq-${gr.key}` }),
    );
  else
    text(c, `seq-${gr.key}`, (xs[0] + xs[xs.length - 1]) / 2, ln - 10, [[`${labels[0]} to ${labels.at(-1)}`, 'mono', 'muted']], {
      anchor: 'middle',
      owner: `seq-${gr.key}`,
    });
}

const gaugeW = (c: Ctx) => (c.W < 360 ? 5 : 7);
function gauge(c: Ctx, gr: IdGroup, ln: number, X: (us: number) => number) {
  const x = X(gr.first.issued);
  const gw = gaugeW(c);
  const fill = (gr.count / c.m.layout.perTick) * GAUGE_H;
  rect(c, 'marks', `gauge-track-${gr.key}`, 'gauge-track', x, ln - GAUGE_H, gw, GAUGE_H, 1);
  rect(c, 'marks', `gauge-${gr.key}`, 'gauge-fill', x, ln - fill, gw, fill, 1);
  c.D.mark({ x0: x, x1: x + gw, y0: ln - GAUGE_H, y1: ln }, `gauge-${gr.key}`);
}

/** A burst's bracket over its full ticks, the last tick's count, and the last request's wait, once the play reaches it. */
function burstNotes(c: Ctx, mine: readonly IdGroup[], ly: number, ln: number, X: (us: number) => number) {
  const gauges = mine.filter((g) => !g.single);
  if (!gauges.length) return;
  const per = c.m.layout.perTick;
  const fullG = gauges.filter((g) => g.count === per);
  const gw = gaugeW(c);
  const ignore = gauges.map((g) => `gauge-${g.key}`).join(' ');
  if (fullG.length) {
    const a = X(fullG[0].first.issued);
    const b = X(fullG.at(-1)!.first.issued) + gw;
    const top = ln - GAUGE_H - 2.5;
    c.D.add('marks', 'burst-bracket', { k: 'path', cls: 'burst-bracket', d: `M${r1(a)} ${top + 2.5}v-2.5h${r1(b - a)}v2.5` });
    c.D.mark({ x0: a, x1: b, y0: top, y1: top + 2.5 }, 'burst-bracket');
    const forms = [
      `${fullG.length} full ${fullG.length === 1 ? 'tick' : 'ticks'} of ${formatInt(per)}`,
      `${fullG.length} × ${formatInt(per)}`,
    ];
    // The label keeps 4 px over the bracket, in the form that fits its span, else the shorter one centred over it.
    const said = forms.find((f) => IDS_TEXT.tw(f, 'small') <= b - a + 8) ?? forms[1];
    c.D.place('burst-full', [[(a + b) / 2, top - 6.5, 'middle']], small(said, 'ink'), { owner: 'burst', margin: 3, optional: true, ignore });
  }
  const last = gauges.at(-1)!;
  if (last.count < per) {
    const lx = X(last.first.issued) + gw / 2;
    c.D.place(
      'burst-last',
      [
        [lx, ly + 9, 'middle'],
        [lx + 4, ly + 9, 'start'],
        [lx - 4, ly + 9, 'end'],
        [lx + 6, ln - GAUGE_H + 8, 'start'],
        [lx - 6, ln - GAUGE_H + 8, 'end'],
      ],
      [[formatInt(last.count), 'mono', 'ink']],
      { owner: 'burst', margin: 6, ignore, optional: true },
    );
  }
  const lb = c.m.lastBurst;
  if (lb && lb.wait > 0 && lb.issued < ID_WINDOW_US && madeBy(c, lb)) {
    const xa = X(lb.arrival);
    const xb = X(lb.issued);
    line(c, 'marks', 'wait-line', 'wait-line', xa, ln + 8, xb, ln + 8);
    c.D.link(
      [
        [xa, ln + 8],
        [xb, ln + 8],
      ],
      'wait',
    );
    c.D.place(
      'wait-words',
      [
        [xb, ln + 20, 'end'],
        [xa, ln + 20, 'start'],
      ],
      small(`last waits ${formatIdMs(lb.wait)}`, 'warn'),
      { owner: 'burst' },
    );
  }
}
