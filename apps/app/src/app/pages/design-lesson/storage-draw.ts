import type { StorageScenario, StorageSettings } from '@grasp/engine';
import { Draw, r1, type Anchor, type Edge, type Layer } from './latency-draw';
import { planOf, shownAt, type Engine, type KeyLeg, type Plan, type StoragePlay } from './storage-motion';
import { partsWidth, tw, type Part, type Role } from './storage-text';
import { ALSO, ENGINE, stepForms, type Hid } from './storage-words';

/**
 * The block heights an engine's panel is built from: the same at every width from 224 px, so the stage's height depends
 * on its width alone. `tagRow` is kept empty under the stack in every phase (a reveal's tag sits on the stack outline's
 * foot there); `toggleGap` keeps 8 px between the Bloom toggle and an outline round the stack.
 */
export const PANEL = { head: 44, knob: 62, toggle: 50, toggleGap: 16, tree: 168, lsmTop: 50, rows: 152, tagRow: 14, transform: 114 };
export const lsmPanelHeight = () =>
  PANEL.head + 6 + PANEL.knob + PANEL.toggle + PANEL.toggleGap + PANEL.lsmTop + 16 + PANEL.rows + 10 + PANEL.tagRow + PANEL.transform;
export const btreePanelHeight = () => PANEL.head + 6 + PANEL.knob + 10 + PANEL.tree + 14 + PANEL.transform;
/** A "Look here" tag's width and its margins: a row keeping this much free at its right end always has room for one. */
export const TAG_ROOM = 96;

/** A control the layout places over the stage: a Play disc, a segment of a radio group, or the Bloom toggle. */
export type Hit =
  | { kind: 'play'; x: number; y: number; w: number; h: number; owner: string; engine: Engine }
  | {
      kind: 'seg';
      x: number;
      y: number;
      w: number;
      h: number;
      owner: string;
      group: 'page' | 'ratio';
      value: number;
      label: string;
      checked: boolean;
      legend: string;
    }
  | { kind: 'toggle'; x: number; y: number; w: number; h: number; owner: string; checked: boolean; label: string; sub: string };

export interface StageView {
  hid: Hid;
  play: StoragePlay | null;
  /** The setting before the learner's last change, said in words beside the write and read figures. */
  ghost: StorageSettings | null;
  /** Under Reduced motion, the engine whose Play last wrote its story under the stage. */
  told: Engine | null;
  focus: readonly string[];
}

/** What the layout spec checks the drawing against, beyond the marks themselves. */
export interface StageMeta {
  btRows: { n: number; drawn: number; more: boolean }[];
  runs: { bytes: number; w: number; bmin: number; bmax: number }[];
  /** Each write bar's px per × of the axis, for the rule that a bar is as long as its number. */
  writePx: number;
  spacePx: number;
  freeEdge: { x: number; x0: number; recPx: number } | null;
  tick: { at: number; anchor: Anchor; x0: number; x1: number } | null;
  panels: { two: boolean; pw: number; x1: number; x2: number };
  /** The key's way through the play's engine, which the component moves along every frame. */
  keys: KeyLeg[];
}

export interface Ctx {
  D: Draw;
  hits: Hit[];
  m: StorageScenario;
  view: StageView;
  hid: Hid;
  meta: StageMeta;
}

export const write = (m: StorageScenario) => m.settings.op === 0;
/** The first of `forms` that fits, longest first, or the last. */
export const pickLast = <T>(forms: readonly T[], fits: (f: T) => boolean): T => forms.find(fits) ?? forms[forms.length - 1];

export function rect(c: Ctx, layer: Layer, id: string, cls: string, x: number, y: number, w: number, h: number, rx = 0, owner?: string) {
  c.D.add(layer, id, { k: 'rect', cls, x: r1(x), y: r1(y), w: r1(Math.max(0, w)), h: r1(Math.max(0, h)), rx, owner });
}
export function line(c: Ctx, layer: Layer, id: string, cls: string, x1: number, y1: number, x2: number, y2: number, owner?: string) {
  c.D.add(layer, id, { k: 'line', cls, x1: r1(x1), y1: r1(y1), x2: r1(x2), y2: r1(y2), owner });
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
  o: { anchor?: Anchor; owner?: string; cls?: string } = {},
) {
  return c.D.text(id, x, y, parts, o);
}
export const label = (t: string): Part[] => [[t, 'label', '']];
export const small = (t: string, cls = 'muted'): Part[] => [[t, 'small', cls]];
export const fitsIn = (role: Role, width: number) => (t: string) => tw(t, role) <= width;
export const partsFit = (width: number) => (f: readonly Part[]) => partsWidth(f) <= width;

export function hit(c: Ctx, h: Hit) {
  c.hits.push(h);
  c.D.mark({ x0: h.x, x1: h.x + h.w, y0: h.y, y1: h.y + h.h }, h.owner);
}

/** Whether a mark at a play's step `k` shows in `engine`'s panel. */
export function stepper(c: Ctx, engine: Engine): { P: Plan; on: (k: string) => boolean } {
  const P = planOf(engine, c.m);
  return { P, on: (k) => shownAt(c.view.play, engine, P[k]) };
}

/** An engine's head: Play, its name with where it runs, and under it what it does, or the running play's step. */
export function panelHead(c: Ctx, x: number, y: number, pw: number, engine: Engine, does: string) {
  hit(c, { kind: 'play', x, y, w: 44, h: 44, owner: `play-${engine}`, engine });
  const forms: Part[][] = [
    ...ALSO[engine].map((a): Part[] => [
      [ENGINE[engine], 'capB', 'ink'],
      [` · ${a}`, 'small', 'muted'],
    ]),
    [[ENGINE[engine], 'capB', 'ink']],
  ];
  text(c, `title-${engine}`, x + 52, y + 19, pickLast(forms, partsFit(pw - 52)), { owner: `title-${engine}` });
  const play = c.view.play;
  const playing = play?.engine === engine;
  const told = !playing && c.view.told === engine;
  const fits = fitsIn('small', pw - 52);
  const step = playing
    ? pickLast(stepForms(engine, c.m, play.frac, c.hid), fits)
    : told
      ? pickLast(['written below the picture', 'story below'], fits)
      : does;
  text(c, `step-${engine}`, x + 52, y + 35, small(step, playing || told ? 'ink' : 'muted'), { owner: `title-${engine}` });
}

/** A radio group drawn as segments under its legend, each a hit box the component puts a native radio in. */
export function segments(
  c: Ctx,
  x: number,
  y: number,
  pw: number,
  group: 'page' | 'ratio',
  values: readonly number[],
  current: number,
  labelOf: (v: number) => string,
  legend: string,
) {
  text(c, `legend-${group}`, x, y + 11, label(legend), { owner: `legend-${group}` });
  const sw = (pw - 4 * (values.length - 1)) / values.length;
  values.forEach((v, i) =>
    hit(c, {
      kind: 'seg',
      x: x + i * (sw + 4),
      y: y + 18,
      w: sw,
      h: 44,
      owner: `${group}-${v}`,
      group,
      value: v,
      label: labelOf(v),
      checked: v === current,
      legend,
    }),
  );
}

/** Whether `box` keeps 1 px clear of every text, mark and line above and below and `mx` beside, and of the sides. */
export const clear = (D: Draw, box: Edge, mx: number) => D.free({ ...box, x0: box.x0 - (mx - 1), x1: box.x1 + (mx - 1) }, '', 1);
