import {
  CDN_POPS,
  CDN_RPS,
  CDN_SETTINGS,
  CDN_SHOWN_EXPECTED,
  CDN_TTLS,
  CDN_WINDOW_TTLS,
  CDN_VARIANTS,
  cdnScenario,
  type CdnEvent,
  type CdnSample,
  type CdnScenario,
  type CdnSettings,
} from '@grasp/engine';
import { r1, type Anchor } from './stage-draw';
import { CdnDraw, LH, linesOf, pickLast, tw, wrap, type Layer, type Part, type Role } from './cdn-text';
import {
  ALL_HIDDEN,
  NOTHING_HIDDEN,
  emptyLaneForms,
  keyForms,
  kneeWords,
  laneWords,
  legendItems,
  stepForms,
  subOf,
  tierWords,
  titleOf,
  windowWords,
  type Hid,
  type LaneWords,
  type TierRow,
  type Who,
} from './cdn-words';

/** A control the layout places over the stage: the timeline's Play, or the origin shield's switch. */
export type Hit = { kind: 'play' | 'shield'; x: number; y: number; w: number; h: number };

export interface StageView {
  hid: Hid;
  /** The setting before the learner's last change, said in words beside the origin and the mean. */
  ghost: CdnScenario | null;
  /** Under Reduced motion, whether Play has written its story under the stage. */
  told: boolean;
  focus: readonly string[];
}

/** Where the particle rides: column 0's stream (its centre line, a cubic), then the shield box, the trunk, the origin. */
export interface Route {
  stream: { a: [number, number]; c1: [number, number]; c2: [number, number]; b: [number, number] };
  shieldY: number;
  originX: number;
  originY: number;
  shield: boolean;
}

export type Box = { x: number; y: number; w: number; h: number };
/** What a play lights for the request it tells: the outlined cell, the shield and origin boxes, and each path's row. */
export interface LitBoxes {
  cell: Box;
  shield: Box | null;
  origin: Box;
  rows: Record<Who, Box>;
}

/** What the component and the specs read beyond the marks themselves. */
export interface StageMeta {
  cells: number;
  cols: number;
  cell: { w: number; h: number };
  userGap: number;
  band: number;
  route: Route | null;
  /** Null while the flows are hidden: lighting a path would say where a request was answered. */
  lit: LitBoxes | null;
  /** Each lane, and each lane's shield track, drawn as a band where its ticks would sit closer than 4 px. */
  dense: { lane: boolean; shield: boolean }[];
  /** The timeline's clock on the stage: x of a time, the playhead's lane segments, the axis, and the step line's box. */
  timeline: {
    x0: number;
    iw: number;
    window: number; /** The playhead's segment over each lane: its tracks only, never the words above them. */
    heads: { y0: number; y1: number }[];
    axisY: number;
    step: { x: number; y: number; w: number };
  };
  sample: CdnSample;
  events: CdnEvent[];
  rings: { kind: Who; x: number; y: number }[];
  ringLabels: { kind: Who; x0: number; x1: number; at: number }[];
  /** The step line's role and class: ink while a play runs. */
  narrow: boolean;
}

export interface Geometry {
  pad: number;
  x0: number;
  x1: number;
  iw: number;
  wide: boolean;
  labelW: number;
  artW: number;
  labelX: number;
  /** A stage under 420 px: every tier body takes its short form. */
  narrow: boolean;
}

export function geometry(W: number): Geometry {
  const pad = W < 360 ? 12 : 16;
  const x0 = pad;
  const x1 = W - pad;
  const iw = x1 - x0;
  const wide = iw >= 480;
  const labelW = wide ? 232 : Math.max(120, Math.round(iw * 0.56));
  const artW = iw - labelW - (wide ? 20 : 10);
  return { pad, x0, x1, iw, wide, labelW, artW, labelX: x1 - labelW, narrow: W < 420 };
}

/** Columns for `pops` locations: the most that divide them evenly, up to 20, each slot at least 8 px. */
export function colsFor(g: Geometry, pops: number): number {
  const most = Math.min(20, Math.max(1, Math.floor(g.artW / 8)));
  return [100, 50, 25, 20, 10, 5, 4, 2, 1].find((d) => pops % d === 0 && d <= most) ?? 1;
}
/** The edge grid's art height: 18 px for one row of cells, else at least 40 px (rows of at least 4 px). */
export const edgeArt = (rows: number) => (rows === 1 ? 18 : Math.max(40, 4 * rows));
export const edgeArtMax = (g: Geometry) => Math.max(...CDN_POPS.map((p) => edgeArt(p / colsFor(g, p))));
/** Users stand as far above the locations as the nearest location is from them: 44 px at one location, × √(1 / n). */
export const userGap = (pops: number) => 44 / Math.sqrt(pops);

export const timelineLabels = (window: string) => [
  `The outlined location, ${window} · one sample`,
  `Outlined location, ${window} · sample`,
  'Outlined location · sample',
];
export const AXIS_TITLES = [
  'Objects by popularity, each as wide as its share of requests',
  'Objects by popularity, each as wide as its requests',
  'Objects by popularity',
];

export function tierLines(t: TierRow, width: number): number {
  let n = 0;
  if (t.fig) n += wrap(`${t.fig} ${t.head}`, 'capB', width - Math.max(0, tw(t.fig, 'num') - tw(t.fig, 'capB'))).length;
  return n + linesOf(t.body, 'cap', width);
}
export function laneLines(w: LaneWords, width: number): number {
  if (tw(`${w.who} ${w.asked} · ${w.hits}`, 'cap') <= width) return 1;
  return linesOf(`${w.who} ${w.asked}`, 'cap', width) + linesOf(w.hits, 'smallB', width);
}
/** Whether a lane's sample can hold no request in its window, so its label band keeps room for the note that says so. */
export const laneMayBeEmpty = (sc: CdnScenario, i: number) => sc.lanes[i].perPop * CDN_WINDOW_TTLS * sc.settings.ttl < CDN_SHOWN_EXPECTED;
/**
 * An empty lane's note, in its label band and never on its tracks, where the playhead runs: beside the band's last line
 * when a form fits there, else on a line of its own under it.
 */
export function emptyNote(w: LaneWords, window: string, width: number): { text: string; beside: boolean } {
  const one = `${w.who} ${w.asked} · ${w.hits}`;
  const hits = wrap(w.hits, 'smallB', width);
  const last = tw(one, 'cap') <= width ? tw(one, 'cap') : tw(hits[hits.length - 1], 'smallB');
  const forms = emptyLaneForms(window);
  const beside = forms.find((f) => last + 12 + tw(f, 'small') <= width);
  return beside ? { text: beside, beside: true } : { text: pickLast(forms, (f) => tw(f, 'small') <= width), beside: false };
}
export function legendRows(items: readonly { who: Who; text: string }[], width: number) {
  const rows: { who: Who; text: string; dx: number }[][] = [[]];
  let x = 0;
  for (const it of items) {
    const w = 14 + tw(it.text, 'cap');
    if (x > 0 && x + w > width) {
      rows.push([]);
      x = 0;
    }
    rows[rows.length - 1].push({ ...it, dx: x });
    x += w + 16;
  }
  return rows;
}
export const keyOf = (forms: readonly string[], width: number) => pickLast(forms, (f) => linesOf(f, 'small', width) <= 2);

export interface Reserve {
  title: number;
  sub: number;
  users: number;
  edge: number;
  shield: number;
  origin: number;
  mean: number;
  lane: number[];
  step: number;
  legend: number;
  knee: number;
  kneeS: number;
  key: number;
}
const reserves = new Map<number, Reserve>();

const OPTIONS: Readonly<Record<keyof CdnSettings, readonly number[]>> = {
  rps: CDN_RPS,
  pops: CDN_POPS,
  ttl: CDN_TTLS,
  shield: [0, 1],
  variants: CDN_VARIANTS,
};
/** Every setting one control away from `s`. */
export const neighbours = (s: CdnSettings): CdnSettings[] =>
  (Object.keys(OPTIONS) as (keyof CdnSettings)[]).flatMap((k) => OPTIONS[k].filter((v) => v !== s[k]).map((v) => ({ ...s, [k]: v })));

/**
 * The lines each text block reserves at stage width `W`: its longest form over all 192 settings and every hidden
 * form, so the stage's height depends on its width alone.
 */
export function reserve(W: number): Reserve {
  const known = reserves.get(W);
  if (known) return known;
  const g = geometry(W);
  const r: Reserve = {
    title: 1,
    sub: 1,
    users: 1,
    edge: 1,
    shield: 1,
    origin: 1,
    mean: 1,
    lane: [1, 1, 1],
    step: 1,
    legend: 1,
    knee: 1,
    kneeS: 1,
    key: 1,
  };
  const max = (k: Exclude<keyof Reserve, 'lane'>, n: number) => (r[k] = Math.max(r[k], n));
  for (const s of CDN_SETTINGS) {
    const sc = cdnScenario(s);
    max('title', linesOf(titleOf(s), 'title', g.iw));
    max('sub', linesOf(subOf(s), 'cap', g.iw));
    // A ghost is said beside the origin and the mean: every setting one control away is one set() can leave.
    for (const ghost of neighbours(s)) {
      const t = tierWords(sc, NOTHING_HIDDEN, cdnScenario(ghost), g.narrow);
      max('origin', tierLines(t.origin, g.labelW));
      max('mean', linesOf(t.mean, 'cap', g.iw));
    }
    for (const hid of [NOTHING_HIDDEN, ALL_HIDDEN, { ...ALL_HIDDEN, playing: true }]) {
      const t = tierWords(sc, hid, null, g.narrow);
      max('users', tierLines(t.users, g.labelW));
      max('edge', tierLines(t.edge, g.labelW));
      max('shield', tierLines(t.shield, g.labelW));
      max('origin', tierLines(t.origin, g.labelW));
      max('mean', linesOf(t.mean, 'cap', g.iw));
      for (let i = 0; i < 3; i++) {
        const w = laneWords(sc, i, hid);
        const note = laneMayBeEmpty(sc, i) && !emptyNote(w, windowWords(s), g.iw).beside ? 1 : 0;
        r.lane[i] = Math.max(r.lane[i], laneLines(w, g.iw) + note);
      }
      max('legend', legendRows(legendItems(sc, hid), g.iw).length);
      const k = kneeWords(sc, hid);
      max('knee', linesOf(k.edge, 'small', g.iw - 14));
      if (k.shield) max('kneeS', linesOf(k.shield, 'small', g.iw - 14));
    }
    for (const f of stepForms(sc)) max('step', linesOf(f, 'cap', g.iw));
    for (const hid of [NOTHING_HIDDEN, { ...NOTHING_HIDDEN, laneMarks: true }])
      max('key', linesOf(keyOf(keyForms(s, hid), g.iw), 'small', g.iw));
  }
  reserves.set(W, r);
  return r;
}

export interface Ctx {
  D: CdnDraw;
  hits: Hit[];
  sc: CdnScenario;
  view: StageView;
  hid: Hid;
  meta: StageMeta;
  g: Geometry;
  r: Reserve;
}

export function rect(c: Ctx, layer: Layer, id: string, cls: string, x: number, y: number, w: number, h: number, rx = 0) {
  c.D.add(layer, id, { k: 'rect', cls, x: r1(x), y: r1(y), w: r1(Math.max(0, w)), h: r1(Math.max(0, h)), rx });
}
export function line(c: Ctx, layer: Layer, id: string, cls: string, x1: number, y1: number, x2: number, y2: number, owner?: string) {
  c.D.add(layer, id, { k: 'line', cls, x1: r1(x1), y1: r1(y1), x2: r1(x2), y2: r1(y2), owner });
}
export function path(c: Ctx, layer: Layer, id: string, cls: string, d: string, owner?: string) {
  c.D.add(layer, id, { k: 'path', cls, d, owner });
}
export function circle(c: Ctx, layer: Layer, id: string, cls: string, cx: number, cy: number, r: number, owner?: string) {
  c.D.add(layer, id, { k: 'circle', cls, cx: r1(cx), cy: r1(cy), r, owner });
}
export function text(
  c: Ctx,
  id: string,
  x: number,
  y: number,
  parts: readonly Part[],
  o: { anchor?: Anchor; owner?: string; layer?: Layer } = {},
) {
  return c.D.text(id, x, y, parts, o);
}
/** Wrapped lines of one role from baseline `y`; returns the baseline after the last. A lone word on a line is noted. */
export function para(
  c: Ctx,
  id: string,
  x: number,
  y: number,
  t: string,
  width: number,
  o: { role?: Role; cls?: string; owner?: string } = {},
) {
  const role = o.role ?? 'cap';
  const lines = wrap(t, role, width);
  if (lines.length > 1) for (const l of lines) if (!l.includes(' ')) c.D.orphans.push(`${l} (in "${t.slice(0, 40)}")`);
  lines.forEach((l, i) => {
    text(c, `${id}-${i}`, x, y, [[l, role, o.cls ?? 'muted']], { owner: o.owner ?? id });
    y += LH[role];
  });
  return y;
}
export const fitsIn = (role: Role, width: number) => (t: string) => tw(t, role) <= width;
