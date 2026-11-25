import type { IdMint, IdSettings, MintedId } from '@grasp/engine';
import { TEXT, r1, type Anchor, type Edge, type Layer, type Part, type Role } from './latency-draw';
import { StageDraw } from './stage-draw';
import type { TextMeasure } from './stage-text';
import type { Hid } from './ids-words';

export { r1 };
export type { Anchor, Edge, Part, Role };

/** A control the layout places over the stage: a nav or Play button, or a slot a control group's panel fills. */
export type Hit =
  | { kind: 'nav'; x: number; y: number; w: number; h: number; owner: string; dir: 'older' | 'newer'; short: boolean }
  | { kind: 'play'; x: number; y: number; w: number; h: number; owner: string }
  | { kind: 'slot'; x: number; y: number; w: number; h: number; owner: string; group: SlotGroup };
export type SlotGroup = 'layout' | 'mint' | 'random';

export interface StageView {
  hid: Hid;
  /** The play's clock in µs while the mint plays, else null: every id is drawn. */
  t: number | null;
  /** The id band A shows, by key; null shows the default. */
  inspect: string | null;
  /** The setting before the learner's last layout change, drawn as the ruler's ghost and said beside it. */
  ghost: IdSettings | null;
  focus: readonly string[];
  /** E3's two ids, ringed at its reveal. */
  pair: readonly string[] | null;
  /** The challenge is open: its goals are drawn. */
  challenge: boolean;
}

export interface Ctx {
  D: Draw;
  hits: Hit[];
  m: IdMint;
  s: IdSettings;
  view: StageView;
  hid: Hid;
  W: number;
  PAD: number;
  /** Ids made by the play's clock, in made order, and the inspected one. */
  made: MintedId[];
  shown: MintedId | null;
}

export const FIELD_CLASS = { sign: 'f-sign', time: 'f-time', gen: 'f-gen', seq: 'f-seq' } as const;

export function rect(
  c: Ctx,
  layer: Parameters<Draw['add']>[0],
  id: string,
  cls: string,
  x: number,
  y: number,
  w: number,
  h: number,
  rx = 0,
) {
  c.D.add(layer, id, { k: 'rect', cls, x: r1(x), y: r1(y), w: r1(Math.max(0, w)), h: r1(Math.max(0, h)), rx });
}
export function line(c: Ctx, layer: Parameters<Draw['add']>[0], id: string, cls: string, x1: number, y1: number, x2: number, y2: number) {
  c.D.add(layer, id, { k: 'line', cls, x1: r1(x1), y1: r1(y1), x2: r1(x2), y2: r1(y2) });
}
export const text = (c: Ctx, id: string, x: number, y: number, parts: readonly Part[], o: { anchor?: Anchor; owner?: string } = {}) =>
  c.D.text(id, x, y, parts, o);
export const small = (t: string, cls = 'muted'): Part[] => [[t, 'small', cls]];
export const label = (t: string): Part[] => [[t, 'label', '']];

export function hit(c: Ctx, h: Hit) {
  c.hits.push(h);
  c.D.mark({ x0: h.x, x1: h.x + h.w, y0: h.y, y1: h.y + h.h }, h.owner);
}

/**
 * A dashed box the exact size of what it hides, opaque and drawn over every mark below it, with its words centred: the
 * one dashed mark on the stage, so dashed always means "hidden until you answer".
 */
export function hiddenBox(c: Ctx, id: string, x: number, y: number, w: number, h: number, forms: readonly string[]) {
  rect(c, 'top', id, 'hidden-box', x, y, w, h, 4);
  c.D.mark({ x0: x, x1: x + w, y0: y, y1: y + h }, id);
  const said = forms.find((t) => widthOf(small(t)) <= w - 12);
  if (said && h >= 16) c.D.text(`${id}-said`, x + w / 2, y + h / 2 + 4, small(said), { anchor: 'middle', owner: id, layer: 'top' });
}

/** Lines of `segments`, each kept whole, joined by two spaces, broken only between segments. */
export function chainLines(segments: readonly string[], role: Role, width: number): string[] {
  const out: string[] = [];
  let cur = '';
  for (const s of segments) {
    const next = cur ? `${cur}  ${s}` : s;
    if (cur && widthOf([[next, role]]) > width) {
      out.push(cur);
      cur = s;
    } else cur = next;
  }
  if (cur) out.push(cur);
  return out;
}

/**
 * The Latency stage's roles, measured with the glyphs its advance table lacks stood in for: a superscript digit by a
 * hyphen (about as wide; the fallback would be an M), the minus and the approximately-equal sign by the plus.
 */
const asTable = (t: string) => t.replace(/[⁰¹²³⁴⁵⁶⁷⁸⁹⁻]/g, '-').replace(/[−≈]/g, '+');
export const IDS_TEXT: TextMeasure<Role> = {
  tw: (t, role) => TEXT.tw(asTable(t), role),
  size: (role) => TEXT.size(role),
  partsWidth: (parts) => parts.reduce((w, [t, role, , dx = 0]) => w + TEXT.tw(asTable(t), role) + dx, 0),
  wrap: (t, role, width, lines, keep) => TEXT.wrap(t, role, width, lines, keep),
  flow: (parts, width, first) => TEXT.flow(parts, width, first),
};
export const widthOf = (parts: readonly Part[]) => IDS_TEXT.partsWidth(parts);
export const fits = (role: Role, width: number) => (t: string) => IDS_TEXT.tw(t, role) <= width;

const LAYERS: readonly Layer[] = ['back', 'grid', 'links', 'clip', 'marks', 'dots', 'text', 'top'];
/** The Unique IDs stage's drawing: the Latency stage's roles and layers, measured by `IDS_TEXT`. */
export class Draw extends StageDraw<Role, Layer> {
  constructor(W: number) {
    super(W, IDS_TEXT, LAYERS, 'label');
  }
}
