import {
  COPY_MTTR_H,
  RELIABILITY_ANSWER_PLAYS,
  FAILOVER_MIN,
  RELIABILITY_SETTINGS,
  RELIABILITY_WEEKS,
  reliabilityScenario,
  type ReliabilityScenario,
  type ReliabilitySettings,
  type ReliabilityYear,
  type YearMoment,
} from '@grasp/engine';
import { Draw, focusOutlines, pick, r1, tw, type Part } from './latency-draw';
import { drawChain, type ChainGeometry } from './reliability-band';
import { drawModel } from './reliability-scale';
import { LINE, wrapStage } from './reliability-text';
import {
  GHOST_LONGEST,
  HIDDEN_FACT,
  HIDDEN_WEAKEST,
  SAMPLE_HIDDEN,
  YEAR_LONGEST,
  allMomentWords,
  causesWords,
  copyName,
  allHourWords,
  hourWords,
  momentWords,
  sweepWords,
  tiedWords,
  weakestWords,
  yearWords,
  type Hidden,
} from './reliability-words';

/** What the stage shows besides the setting: what hides, the band's moment and beat, a play, the ghost and the goal. */
export interface StageView {
  hid: Hidden;
  /** The moment the band acts out and the ring marks; null between a play's holds. */
  moment: YearMoment | null;
  /**
   * How far into its hold the moment is: a failover stops the request for the first part of it. At rest it is 0, so a
   * failover shows the minutes the request fails, as its words and the request's row say.
   */
  into: number;
  /** A play runs: the playhead is the moment's line, and the caption and the year's sentence follow its clock. */
  playing: boolean;
  /** The setting before the learner's last change (or the challenge's start). */
  ghost: ReliabilitySettings | null;
  /** The open challenge, and whether its goal holds. */
  challenge: { met: boolean } | null;
  focus: readonly string[];
  /** The year's line while an answer plays and its count would give the answer: where to look. */
  watch: string;
}

const factsSets = (() => {
  let sets: { weakest: string; tied: string; causes: string }[] | null = null;
  return () =>
    (sets ??= [
      ...new Map(
        RELIABILITY_SETTINGS.map((s) => {
          const m = reliabilityScenario(s);
          const f = { weakest: weakestWords(m, true), tied: tiedWords(m), causes: causesWords(m) };
          return [`${f.weakest}|${f.tied}|${f.causes}`, f] as const;
        }),
      ).values(),
    ]);
})();
const reserves = new Map<number, { caption: number; year: number; facts: number; hour: number; hourW: number }>();

/** The lines each wrapped text reserves at a stage width: the most any setting needs, so the height is the width's alone. */
export function reserved(W: number) {
  const known = reserves.get(W);
  if (known) return known;
  const wide = W >= WIDE_FROM;
  const width = W - 2 * pad(W);
  const lines = (t: string) => (t ? wrapStage(t, 'cap', width).length : 0);
  const caption = Math.max(...allMomentWords().map(lines));
  const year = Math.max(...YEAR_LONGEST.map(lines), ...WATCH_LINES.map(lines));
  let facts = lines(HIDDEN_FACT);
  for (const f of factsSets())
    facts = Math.max(facts, lines(f.weakest) + lines(f.tied) + lines(f.causes), lines(HIDDEN_WEAKEST) + lines(f.causes));
  const hourW = W - 2 * pad(W) - hourLeft(wide);
  const hour = Math.max(
    ...allHourWords().map(
      (h) =>
        Math.max(h.n, wrapStage(h.title, 'smallB', hourW).length) +
        Math.max(h.n, wrapStage(h.ifTitle, 'smallB', hourW).length + wrapStage(h.body, 'small', hourW).length),
    ),
  );
  const r = { caption, year, facts: facts + lines(GHOST_LONGEST), hour: hour * HOUR_ROW + HOUR_GAP + 8, hourW };
  reserves.set(W, r);
  return r;
}
/** The year's lines while an answer plays, which the reserve must hold too. */
const WATCH_LINES = Object.values(RELIABILITY_ANSWER_PLAYS).map((p) => p.watch);
/** A row of "that hour": room for a copy's name in WebKit's taller line box. */
const HOUR_ROW = 14;
const HOUR_GAP = 6;
const hourLeft = (wide: boolean) => (wide ? 46 + 64 + 12 : 44 + 40 + 8);
/** From this stage width the chain draws its wide form: full names, the request's lead-in and the outcome's word. */
export const WIDE_FROM = 520;
const pad = (W: number) => (W >= WIDE_FROM ? 14 : 10);

/** The year's rows and the request's row: where the component's clip and playhead act during a play. */
export interface YearGeometry {
  tx0: number;
  tx1: number;
  rowsTop: number;
  bottom: number;
  tickW: number;
  /** The x of a week's column center. */
  wk: (week: number) => number;
}

export interface Stage {
  D: Draw;
  H: number;
  W: number;
  summary: string;
  chain: ChainGeometry;
  year: YearGeometry;
  /** Where the caption and the year's sentence go, which a play writes as its clock moves. */
  caption: { x: number; y: number; width: number };
  sentence: { x: number; y: number; width: number };
  play: { x: number; y: number };
  steps: { prev: { x: number; y: number }; next: { x: number; y: number } } | null;
  focus: ReturnType<typeof focusOutlines>;
  /** What the drawing claims, for the specs. */
  meta: Record<string, unknown>;
}

/** A tick per outage, as one path per row: its height the time to recover. */
const tickPath = (weeks: readonly number[], wk: (w: number) => number, tickW: number, y: number, h: number) =>
  weeks.map((w) => `M${r1(wk(w) - tickW / 2)} ${r1(y)}h${r1(tickW)}v${r1(h)}h${r1(-tickW)}z`).join('');

/**
 * The key's entries: exactly the marks the setting can draw. Copy down and part down always; the failover's short tick
 * and the copy in use while failover is on; the joined shared mark while shared failures are on; the hollow mark while
 * recommendations are optional.
 */
function keyEntries(wide: boolean, s: Pick<ReliabilitySettings, 'shared' | 'failover' | 'optional'>): [string, string][] {
  const h = `${COPY_MTTR_H} h`;
  const fo = `${FAILOVER_MIN} min`;
  const e: [string, string][] = [
    ['copy', `copy down, ${h}`],
    ['fail', `part down, ${h}: the request fails`],
  ];
  if (s.failover) e.push(['short', wide ? `failover, ${fo}: it fails too` : `failover, ${fo}`], ['inuse', wide ? 'copy in use' : 'in use']);
  if (s.shared) e.push(['shared', wide ? 'shared: every copy down' : 'shared']);
  if (s.optional) e.push(['optional', wide ? 'optional part down: served' : 'optional, served']);
  return e;
}
const KEY_CLS: Record<string, string> = {
  copy: 'key-copy',
  fail: 'key-fail',
  short: 'key-fail',
  inuse: 'inuse',
  optional: 'key-bypassed',
};
function keyRows(entries: readonly [string, string][], x0: number, x1: number, gapX: number) {
  const rows: [string, string, number][][] = [[]];
  let kx = x0;
  for (const [cls, words] of entries) {
    const w = 9 + tw(words, 'small');
    if (kx + w > x1 && rows[rows.length - 1].length) {
      rows.push([]);
      kx = x0;
    }
    rows[rows.length - 1].push([cls, words, kx]);
    kx += w + gapX;
  }
  return rows;
}

/**
 * The whole stage at a width (REDESIGN.md 5.2, R41 Reliability): the chain at one moment, the simulated year as a row
 * per copy, a strip per part and the request's row as their union, then the exact model's headline, the nines scale
 * with a bar per part and the request's, the weakest link's cap and the facts. Marks and lines are laid before any label,
 * and every label goes where `Draw.place` finds nothing under it.
 */
export function buildStage(W: number, m: ReliabilityScenario, y: ReliabilityYear, view: StageView, summary: string): Stage {
  const D = new Draw(W);
  const hid = view.hid;
  const s = m.settings;
  const wide = W >= WIDE_FROM;
  const P = pad(W);
  const R = reserved(W);
  const meta: Record<string, unknown> = {};
  const moment = hid.sample ? null : view.moment;

  // ---- Header: Play, the title; on wide stages a previous and a next moment.
  const play = { x: P - 4, y: 2 };
  D.mark({ x0: play.x, x1: play.x + 44, y0: 2, y1: 46 }, 'play');
  const steps = wide ? { prev: { x: W - P - 84, y: 2 }, next: { x: W - P - 40, y: 2 } } : null;
  if (steps) D.mark({ x0: steps.prev.x, x1: steps.next.x + 44, y0: 2, y1: 46 }, 'steps');
  const titleX = P + 46;
  const titleMax = wide ? W - P - 92 : W - P;
  const title =
    pick(
      ['A request through its chain, over one simulated year', 'One request, one simulated year', 'One simulated year'],
      (t) => titleX + tw(t, 'capB') <= titleMax,
    ) ?? 'One simulated year';
  D.text('title', titleX, 29, [[title, 'capB']], { owner: 'title' });

  // ---- The chain at one moment, and its words.
  const chainTop = 50;
  const neutral = view.playing && !view.moment;
  const chain = drawChain(D, m, { top: chainTop, P, wide, hidden: hid.sample, neutral, moment, into: view.into });
  let yy = chain.bottom + 10;
  const caption = { x: P, y: yy + 12, width: W - 2 * P };
  if (!view.playing)
    para(D, 'caption', caption, hid.sample ? SAMPLE_HIDDEN : moment ? momentText(m, moment) : sweepWords(RELIABILITY_WEEKS - 1), 'ink');
  yy += R.caption * LINE + 4;
  D.region('chain', { x: P - 6, y: chainTop - 2, w: W - 2 * P + 12, h: yy - chainTop });

  // ---- The year: its label and key, a row per copy, a strip per part, the request's row as their union.
  yy += 10;
  const tlTop = yy;
  const gut = wide ? 62 : 46;
  const tx0 = P + gut;
  const tx1 = W - P - 3;
  const ppw = (tx1 - tx0) / RELIABILITY_WEEKS;
  const wk = (w: number) => tx0 + (w + 0.5) * ppw;
  const tlLabel = pick(
    ['One simulated year · a tick marks an outage, not its length', 'One simulated year · ticks are not to scale'],
    (t) => tw(t, 'label') <= W - 2 * P - 8,
  );
  if (tlLabel) D.text('tl-label', P, yy + 11, [[tlLabel, 'label']], { owner: 'tl-label' });
  else {
    D.text('tl-label', P, yy + 11, [['A simulated year', 'label']], { owner: 'tl-label' });
    D.text('tl-scale', W - P - 4, yy + 11, [['ticks not to scale', 'small']], { anchor: 'end', owner: 'tl-label' });
  }
  yy += 18;
  const gapX = wide ? 16 : 12;
  const fullKey = keyRows(keyEntries(wide, { shared: 1, failover: 1, optional: 1 }), P + 2, W - P, gapX);
  keyRows(keyEntries(wide, s), P + 2, W - P, gapX).forEach((row, r) => {
    const ky = yy + 12 + r * 17;
    for (const [cls, words, kx] of row) {
      if (cls === 'shared') {
        D.add('marks', `key-${cls}-a`, { k: 'rect', cls: 'key-copy', x: r1(kx), y: r1(ky - 10), w: 3, h: 8, rx: 0.5 });
        D.add('marks', `key-${cls}-b`, { k: 'rect', cls: 'key-fail', x: r1(kx), y: r1(ky - 1), w: 3, h: 3, rx: 0.5 });
      } else {
        const short = cls === 'short';
        D.add('marks', `key-${cls}`, {
          k: 'rect',
          cls: KEY_CLS[cls],
          x: r1(kx + (cls === 'optional' ? 0.5 : 0)),
          y: r1(ky - (short ? 5 : 10)),
          w: cls === 'inuse' ? 2 : cls === 'optional' ? 2.5 : 3,
          h: short ? 6 : cls === 'optional' ? 8 : 11,
          rx: cls === 'inuse' ? 0 : 0.5,
        });
      }
      D.mark({ x0: kx, x1: kx + 3, y0: ky - 10, y1: ky + 2 }, `key-${cls}`);
      D.text(`key-${cls}-words`, kx + 9, ky, [[words, 'small']], { owner: `key-${cls}` });
    }
  });
  yy += fullKey.length * 17 + 10;
  const tickW = Math.max(1.5, Math.min(3, ppw * 0.42));
  const areaH = 24;
  const stripH = 8;
  const groupH = areaH + 2 + stripH + 9;
  const rowsTop = yy;
  const reqY = rowsTop + 4 * groupH;
  const reqH = 18;
  const requestTicks: { week: number; kind: string }[] = [];
  m.parts.forEach((p, i) => {
    const yp = y.parts[i];
    const gy = yy;
    D.text(`gut-${p.id}`, P, gy + areaH / 2 + 4, [[p.short, 'nameS', p.optional ? 'muted' : '']], { owner: `gut-${p.id}` });
    const rh = areaH / p.copies;
    const sy = gy + areaH + 2;
    if (!hid.sample) {
      const sharedWeeks = p.copies > 1 && s.shared ? yp.rows[0].filter((t) => t.shared).map((t) => t.week) : [];
      for (let k = 0; k < p.copies; k++) {
        const ry = gy + k * rh;
        D.add('grid', `track-${p.id}-${k}`, { k: 'line', cls: 'row-track', x1: r1(tx0), y1: r1(ry + rh), x2: r1(tx1), y2: r1(ry + rh) });
        const weeks = yp.rows[k].filter((t) => !(t.shared && sharedWeeks.includes(t.week))).map((t) => t.week);
        if (weeks.length)
          D.add('clip', `row-${p.id}-${k}`, { k: 'path', cls: 'tick-copy', d: tickPath(weeks, wk, tickW, ry + 1.5, rh - 2.5) });
        if (wide && p.copies === 2)
          D.text(`gut-${p.id}-${k}`, tx0 - 8, ry + rh / 2 + 4, [[String(k + 1), 'small']], { anchor: 'end', owner: `gut-${p.id}` });
      }
      // A shared outage is one joined mark through every copy's row and down to the strip: one cause.
      if (sharedWeeks.length)
        D.add('clip', `shared-${p.id}`, { k: 'path', cls: 'tick-copy', d: tickPath(sharedWeeks, wk, tickW, gy + 1.5, sy - gy - 1.5) });
      // The copy in use, while failover is on: requests go to the first copy while it is up, so only its outages cost one.
      if (p.copies > 1 && s.failover)
        D.add('marks', `inuse-${p.id}`, { k: 'rect', cls: 'inuse', x: r1(tx0 - 4), y: r1(gy + 1.5), w: 2, h: r1(rh - 2.5), rx: 0 });
      D.add('back', `strip-${p.id}`, { k: 'rect', cls: 'strip-band', x: r1(tx0), y: r1(sy), w: r1(tx1 - tx0), h: stripH, rx: 0 });
      if (wide) D.text(`gut-${p.id}-part`, P, sy + stripH / 2 + 4, [['part', 'small']], { owner: `gut-${p.id}` });
      const ev = yp.events;
      if (ev.length)
        D.add('clip', `strip-ticks-${p.id}`, {
          k: 'path',
          cls: p.optional ? 'tick-bypassed' : 'tick-fail',
          d: ev
            .map((e) => {
              const h = e.kind === 'failover' ? stripH / 2 : stripH;
              return tickPath([e.week], wk, tickW, sy + stripH - h, h);
            })
            .join(''),
        });
      if (!p.optional) requestTicks.push(...ev);
    }
    yy += groupH;
  });
  D.text('gut-request', P, reqY + reqH / 2 + 4, [[pick(['Request', 'Req.'], (t) => tw(t, 'smallB') <= gut - 4) ?? 'Req.', 'smallB']], {
    owner: 'gut-request',
  });
  if (hid.sample) {
    // One dashed box over every row: the whole year is hidden, not empty.
    D.add('marks', 'year-hidden', {
      k: 'rect',
      cls: 'hidden-box',
      x: r1(tx0 + 0.5),
      y: r1(rowsTop + 0.5),
      w: r1(tx1 - tx0 - 1),
      h: r1(reqY + reqH - rowsTop - 1),
      rx: 4,
    });
    const words =
      pick(['The year plays after your answer', 'plays after your answer'], (t) => tw(t, 'small') <= tx1 - tx0 - 16) ?? 'after your answer';
    D.text('year-hidden-words', (tx0 + tx1) / 2, (rowsTop + reqY + reqH) / 2 + 4, [[words, 'small']], {
      anchor: 'middle',
      owner: 'year-hidden',
    });
  } else {
    D.add('back', 'req-band', { k: 'rect', cls: 'req-band', x: r1(tx0), y: r1(reqY), w: r1(tx1 - tx0), h: reqH, rx: 0 });
    if (requestTicks.length)
      D.add('clip', 'request-ticks', {
        k: 'path',
        cls: 'tick-fail',
        d: requestTicks
          .sort((a, b) => a.week - b.week)
          .map((e) => {
            const h = e.kind === 'failover' ? 8 : reqH - 2;
            return tickPath([e.week], wk, tickW, reqY + reqH - 1 - h, h);
          })
          .join(''),
      });
  }
  meta['requestWeeks'] = requestTicks.map((e) => e.week);
  yy = reqY + reqH;
  D.add('grid', 'year-axis', { k: 'line', cls: 'axis', x1: r1(tx0), y1: r1(yy), x2: r1(tx1), y2: r1(yy) });
  // The moment: at rest a line through the rows and a ring round the whole tick it is about; in a hold the playhead is
  // the line.
  if (moment) {
    const mx = wk(moment.week);
    if (!view.playing) {
      D.add('grid', 'moment', { k: 'line', cls: 'moment', x1: r1(mx), y1: r1(rowsTop - 3), x2: r1(mx), y2: r1(yy + 3) });
      D.add('top', 'moment-head', { k: 'path', cls: 'moment-head', d: `M${r1(mx - 4)} ${r1(rowsTop - 8)}h8l-4 6z` });
    }
    const pi = m.parts.findIndex((p) => p.id === moment.part);
    const gy = rowsTop + pi * groupH;
    let ry0: number;
    let ry1: number;
    if (moment.fails) {
      ry0 = reqY + (moment.kind === 'failover' ? reqH - 9 : 1) - 3;
      ry1 = reqY + reqH + 2;
    } else if (moment.kind === 'bypassed') {
      ry0 = gy + areaH + 2 - 3;
      ry1 = gy + areaH + 2 + stripH + 3;
    } else {
      const rh = areaH / m.parts[pi].copies;
      ry0 = gy + moment.copy * rh + 1.5 - 3;
      ry1 = gy + (moment.copy + 1) * rh - 1 + 3;
    }
    D.add('top', 'ring', { k: 'rect', cls: 'ring', x: r1(mx - tickW / 2 - 3), y: r1(ry0), w: r1(tickW + 6), h: r1(ry1 - ry0), rx: 3 });
    meta['ring'] = { week: moment.week, kind: moment.kind, y0: ry0, y1: ry1 };
  }
  [0, 13, 26, 39, 52].forEach((w, i, all) => {
    const x = tx0 + (w / RELIABILITY_WEEKS) * (tx1 - tx0);
    D.add('grid', `week-${w}`, { k: 'line', cls: 'axis', x1: r1(x), y1: r1(yy), x2: r1(x), y2: r1(yy + 4) });
    const last = i === all.length - 1;
    const t = last
      ? (pick(['52 weeks', '52 wk'], (v) => tw(v, 'small') <= (13 / RELIABILITY_WEEKS) * (tx1 - tx0) - tw('39', 'small') / 2 - 6) ??
        '52 wk')
      : String(w);
    D.text(`week-${w}-label`, last ? tx1 + 3 : x, yy + 16, [[t, 'small']], {
      anchor: last ? 'end' : i === 0 ? 'start' : 'middle',
      owner: 'weeks',
      ground: true,
    });
  });
  yy += 22;
  const sentence = { x: P, y: yy + 12, width: W - 2 * P };
  if (!view.playing) para(D, 'year', sentence, hid.sample ? '' : hid.request ? view.watch : yearWords(y.fails));
  yy += R.year * LINE + 4;
  // "That hour": an absorbed outage zoomed in, at the year's foot, once no question waits on it. Under it, in a dashed
  // frame of its own, what would take the part down: every copy down, their overlap magnified, and the shared outage.
  const hourTop = yy;
  if (moment && moment.kind === 'absorbed' && !hid.waits && !view.playing) {
    const n = m.parts.find((p) => p.id === moment.part)!.copies;
    const wx0 = P + (wide ? 46 : 44);
    const wx1 = wx0 + (wide ? 64 : 40);
    const inner = wx1 - wx0 - 2;
    const order = [moment.copy, ...Array.from({ length: n }, (_, k) => k).filter((k) => k !== moment.copy)];
    const words = hourWords(moment.part, n, moment.copy, !!s.shared);
    const tx = P + hourLeft(wide);
    const block = (top: number, frameCls: string, row: (j: number, ry: number) => void, lines: Part[][], id: string) => {
      D.add('back', id, { k: 'rect', cls: frameCls, x: r1(wx0 - 0.5), y: r1(top + 1.5), w: r1(wx1 - wx0 + 1), h: n * HOUR_ROW - 3, rx: 2 });
      order.forEach((k, j) => {
        const ry = top + 3 + j * HOUR_ROW;
        D.text(`${id}-${k}`, P, ry + 7, [[copyName(moment.part, k), 'mono', j === 0 || id !== 'hour-frame' ? 'muted' : '']], {
          owner: 'hour',
        });
        row(j, ry);
      });
      lines.forEach((l, i) => D.text(`${id}-words${i ? `-${i}` : ''}`, tx, top + 10 + i * 14, l, { owner: 'hour' }));
      D.mark({ x0: wx0 - 1, x1: wx1 + 1, y0: top, y1: top + n * HOUR_ROW }, 'hour');
      return top + Math.max(n, lines.length) * HOUR_ROW;
    };
    const ifTop =
      block(
        yy,
        'hour-frame',
        (j, ry) =>
          j === 0
            ? D.add('marks', 'hour-down', { k: 'rect', cls: 'hour-down', x: r1(wx0 + 1), y: r1(ry), w: r1(inner), h: 6, rx: 0 })
            : D.add('marks', `hour-up-${order[j]}`, {
                k: 'line',
                cls: 'hour-up',
                x1: r1(wx0 + 1),
                y1: r1(ry + 3),
                x2: r1(wx1 - 1),
                y2: r1(ry + 3),
              }),
        wrapStage(words.title, 'smallB', R.hourW).map((l): Part[] => [[l, 'smallB']]),
        'hour-frame',
      ) + HOUR_GAP;
    // With shared failures the frame draws both causes its words add, in their order: first the shared outage, one joined
    // mark through every copy as the year draws it, wider than the overlap by chance beside it, since it dominates.
    const sharedW = s.shared ? r1(0.4 * inner) : 0;
    const c0 = wx0 + 1 + (s.shared ? sharedW + 2 : 0);
    const span = wx1 - 1 - c0;
    // Each copy down for 0.6 of its span, staggered so all of them overlap over its middle fifth: the overlap by chance.
    const seg = (j: number) => c0 + span * (n === 1 ? 0 : (0.4 * j) / (n - 1));
    block(
      ifTop,
      'hour-frame if',
      (j, ry) =>
        D.add('marks', `hour-if-down-${order[j]}`, {
          k: 'rect',
          cls: 'hour-down',
          x: r1(seg(j)),
          y: r1(ry),
          w: r1(0.6 * span),
          h: 6,
          rx: 0,
        }),
      [
        ...wrapStage(words.ifTitle, 'smallB', R.hourW).map((l): Part[] => [[l, 'smallB']]),
        ...wrapStage(words.body, 'small', R.hourW).map((l): Part[] => [[l, 'small']]),
      ],
      'hour-if-frame',
    );
    if (s.shared)
      D.add('marks', 'hour-if-shared', {
        k: 'rect',
        cls: 'hour-down',
        x: r1(wx0 + 1),
        y: r1(ifTop + 3),
        w: sharedW,
        h: (n - 1) * HOUR_ROW + 6,
        rx: 0,
      });
    D.add('top', 'hour-both', {
      k: 'rect',
      cls: 'hour-both',
      x: r1(c0 + 0.4 * span),
      y: r1(ifTop + 2.5),
      w: r1(0.2 * span),
      h: n * HOUR_ROW - 5,
      rx: 0,
    });
    meta['hour'] = { ...words, down: copyName(moment.part, moment.copy), rows: order.map((k) => copyName(moment.part, k)) };
  }
  yy = hourTop + R.hour;
  D.region('timeline', { x: P - 6, y: tlTop - 4, w: W - 2 * P + 12, h: yy - tlTop + 2 });
  const year: YearGeometry = { tx0, tx1, rowsTop, bottom: reqY + reqH, tickW, wk };

  // ---- The rule between the year and the model.
  yy += 8;
  D.add('grid', 'divider', { k: 'line', cls: 'rule', x1: 0, y1: r1(yy), x2: W, y2: r1(yy) });
  yy += 8;
  yy = drawModel(D, m, view, { top: yy, P, wide, gut, meta, R });
  if (view.focus.length) {
    // Regions that touch, or stand less than a tag's height apart, are one outline with one tag (E5's chain and year).
    const c = D.regions['chain']?.[0];
    const t = D.regions['timeline']?.[0];
    if (c && t && view.focus.includes('chain') && view.focus.includes('timeline')) {
      D.regions['timeline'] = [{ x: c.x, y: c.y, w: c.w, h: t.y + t.h - c.y }];
      delete D.regions['chain'];
    }
  }
  const H = Math.round(yy);
  const focus = view.focus.length ? focusOutlines(D, view.focus, H) : [];
  return { D, H, W, summary, chain, year, caption, sentence, play, steps, focus, meta };
}

const momentText = (m: ReliabilityScenario, mo: YearMoment) =>
  momentWords(mo, m.parts.find((p) => p.id === mo.part)!.copies, !!m.settings.shared);

/** A wrapped sentence in the caption role, its lines at the stage's leading. */
function para(D: Draw, id: string, at: { x: number; y: number; width: number }, text: string, cls = '') {
  wrapStage(text, 'cap', at.width).forEach((l, i) =>
    D.text(i ? `${id}-${i}` : id, at.x, at.y + i * LINE, [[l, 'cap', cls]], { owner: id }),
  );
}

/** The lines of a sentence the component writes during a play, as the stage would draw them. */
export function liveLines(id: string, at: { x: number; y: number; width: number }, text: string, cls = '') {
  return wrapStage(text, 'cap', at.width).map((l, i) => ({
    id: i ? `${id}-${i}` : id,
    x: at.x,
    y: r1(at.y + i * LINE),
    t: l,
    cls: `t-cap${cls ? ` ${cls}` : ''}`,
  }));
}
