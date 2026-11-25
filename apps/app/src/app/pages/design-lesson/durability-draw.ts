import type { DurabilityPlayKind, DurabilityPlayState, DurabilityScenario, DurabilitySettings } from '@grasp/engine';
import type { Focus } from './focus-layout';
import { r1, sampleLine, type Edge } from './stage-draw';
import type { Draw, Layer, Part } from './durability-text';
import type { WalkMeta } from './durability-walk';
import type { Hid } from './durability-words';

export interface StageView {
  hid: Hid;
  kind: DurabilityPlayKind;
  /** The play's clock at its last moment, in seconds; null at rest, which draws the play's end. */
  tau: number | null;
  /** A play runs with motion: the continuous marks (the window's fill, the free disk's, the playhead, the read dots) are
   * the component's, moved every frame, and the layout leaves them out. */
  live: boolean;
  /** Under Reduced motion, the moment Play last stepped to, 0 to 2. */
  step: number | null;
  ghost: DurabilitySettings | null;
  challenge: boolean;
  met: boolean;
  focus: readonly string[];
}

/** The continuous marks of a running play, which the component moves by transform. */
export interface LiveGeometry {
  band: { x: number; y: number; w: number; h: number } | null;
  disk: { x: number; y: number; w: number; h: number } | null;
  playhead: { y0: number; y1: number; y2: number; y3: number } | null;
  /** Each read dot's way: down its stub, along the bus, up the riser. */
  reads: { id: string; points: readonly (readonly [number, number])[] }[];
}

export interface StageMeta extends WalkMeta {
  ps: DurabilityPlayState;
  playing: boolean;
  readsBox: boolean;
  readStubs: number;
  readBlocks: number;
  lostSaid: boolean;
  piecesTop: number;
  zoom: boolean;
  stagedShown: number;
  stagedTags: number;
  stagedNames: { x: number; ok: boolean }[];
  raceText: string;
  diskNames: string[];
  /** The stored bar's key: each label and the span of the bracket it names. */
  keys: { s: string; x0: number; a: number; b: number }[];
  raceTicks: Edge[];
  live: LiveGeometry;
}

/** A control the layout places over the stage: the Play disc and the Stage a loss pill. */
export interface Hit {
  kind: 'play' | 'stage';
  x: number;
  y: number;
  w: number;
  h: number;
  text: string;
}

export interface Stage {
  D: Draw;
  H: number;
  hits: Hit[];
  focus: (Focus & { region: string })[];
  summary: string;
  meta: StageMeta;
}

export interface Ctx {
  D: Draw;
  W: number;
  m: DurabilityScenario;
  view: StageView;
  hid: Hid;
  ps: DurabilityPlayState;
  playing: boolean;
  wide: boolean;
  X0: number;
  X1: number;
  IW: number;
  LH: number;
  meta: StageMeta;
  /** Set by the disks' row for the race, which numbers struck disks where staged names cannot stand on the track. */
  diskX?: (i: number) => number;
  diskGeo?: { yDisk: number; diskH: number; diskW: number };
  stagedList?: number[];
}

export const pickLast = (forms: readonly string[], fits: (f: string) => boolean) => forms.find(fits) ?? forms[forms.length - 1];
export const rect = (c: Ctx, layer: Layer, id: string, cls: string, x: number, y: number, w: number, h: number, rx = 0, owner?: string) =>
  c.D.add(layer, id, { k: 'rect', cls, x: r1(x), y: r1(y), w: r1(Math.max(0, w)), h: r1(Math.max(0, h)), rx, owner });
export const markRect = (
  c: Ctx,
  layer: Layer,
  id: string,
  cls: string,
  x: number,
  y: number,
  w: number,
  h: number,
  rx: number,
  owner: string,
) => {
  rect(c, layer, id, cls, x, y, w, h, rx, owner);
  c.D.mark({ x0: x, x1: x + w, y0: y, y1: y + h }, owner);
};
export function line(
  c: Ctx,
  layer: Layer,
  id: string,
  cls: string,
  x1: number,
  y1: number,
  x2: number,
  y2: number,
  owner?: string,
  solid = true,
) {
  c.D.add(layer, id, { k: 'line', cls, x1: r1(x1), y1: r1(y1), x2: r1(x2), y2: r1(y2), owner });
  if (solid) c.D.link(sampleLine(x1, y1, x2, y2), owner ?? cls);
}
export const path = (c: Ctx, layer: Layer, id: string, cls: string, d: string, owner?: string) =>
  c.D.add(layer, id, { k: 'path', cls, d, owner });
export const one = (t: string, role: Part[1], cls = ''): Part[] => [[t, role, cls]];

/** A critical ×, on a stage-colored ground. */
export function xGlyph(c: Ctx, id: string, cx: number, cy: number, owner: string, s = 4, ground = '') {
  c.D.add('dots', `${id}-ground`, { k: 'circle', cls: `xground ${ground}`.trim(), cx: r1(cx), cy: r1(cy), r: s + 2.5 });
  path(c, 'dots', id, 'xmark', `M${r1(cx - s)} ${r1(cy - s)}l${2 * s} ${2 * s}M${r1(cx + s)} ${r1(cy - s)}l${-2 * s} ${2 * s}`, owner);
  c.D.mark({ x0: cx - s - 2, x1: cx + s + 2, y0: cy - s - 2, y1: cy + s + 2 }, owner);
}
export function checkGlyph(c: Ctx, id: string, cx: number, cy: number, owner: string, r = 6) {
  c.D.add('dots', `${id}-ring`, { k: 'circle', cls: 'ok-ring', cx: r1(cx), cy: r1(cy), r });
  path(c, 'dots', id, 'ok-mark', `M${r1(cx - 3)} ${r1(cy + 0.2)}l2.2 2.3 4-4.4`);
  c.D.mark({ x0: cx - r - 1, x1: cx + r + 1, y0: cy - r - 1, y1: cy + r + 1 }, owner);
}

export function layoutConsts(W: number) {
  const wide = W >= 520;
  const pad = wide ? 20 : 12;
  return { wide, pad, X0: pad, X1: W - pad, IW: W - 2 * pad, LH: 17 };
}
