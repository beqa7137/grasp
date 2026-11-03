import { TAG, type Focus } from './focus-layout';
import { partsWidth, roleSize, type Part, type Role } from './quorum-text';

/** When a mark appears in a play: on the write's clock or the read's, in model ms from the write's send. */
export type Moment = readonly [chain: 'w' | 'r', ms: number];

interface Base {
  id: string;
  cls: string;
  /** Appears at this moment of a play; always shown at rest. */
  at?: Moment;
  /** Shown only in a play, until this moment: what a mark showed before the play changed it. */
  until?: Moment;
  owner?: string;
}
export type Prim =
  | (Base & { k: 'line'; x1: number; y1: number; x2: number; y2: number; write?: number })
  | (Base & { k: 'rect'; x: number; y: number; w: number; h: number; rx: number; answer?: number })
  | (Base & { k: 'circle'; cx: number; cy: number; r: number; dot?: string })
  | (Base & { k: 'path'; d: string; arrow?: boolean })
  | (Base & { k: 'text'; x: number; y: number; anchor: Anchor; parts: readonly Part[]; ground?: boolean; names?: string });

export type Anchor = 'start' | 'middle' | 'end';
export type Layer = 'back' | 'grid' | 'links' | 'marks' | 'text' | 'top';
const LAYERS: readonly Layer[] = ['back', 'grid', 'links', 'marks', 'text', 'top'];

export interface Edge {
  x0: number;
  x1: number;
  y0: number;
  y1: number;
}
export interface TextBox extends Edge {
  owner: string;
  ground: boolean;
  s: string;
}
export interface Mark extends Edge {
  owner: string;
}
export interface Link {
  points: readonly (readonly [number, number])[];
  owner: string;
}
export interface Region {
  x: number;
  y: number;
  w: number;
  h: number;
}

type Shape = Prim extends infer P ? (P extends Prim ? Omit<P, 'id'> : never) : never;
type Timing = Pick<Base, 'at' | 'until'>;

/**
 * The stage drawing as a list of marks in layers, with the boxes placement checks against: every text, mark and line
 * placed so far. A label goes where `free` finds no text, mark or line, so nothing is drawn on anything else.
 */
export class Draw {
  private readonly layers: Record<Layer, Prim[]> = { back: [], grid: [], links: [], marks: [], text: [], top: [] };
  private readonly ids = new Map<string, number>();
  readonly texts: TextBox[] = [];
  readonly marks: Mark[] = [];
  readonly links: Link[] = [];
  readonly regions: Record<string, Region[]> = {};
  /** Texts no place could take, which the layout spec reports. */
  readonly missing: string[] = [];

  constructor(readonly W: number) {}

  add(layer: Layer, id: string, shape: Shape): void {
    const seen = this.ids.get(id) ?? 0;
    this.ids.set(id, seen + 1);
    this.layers[layer].push({ ...shape, id: seen ? `${id}#${seen}` : id } as Prim);
  }

  prims(): Prim[] {
    return LAYERS.flatMap((l) => this.layers[l]);
  }

  textBox(x: number, y: number, w: number, role: Role, anchor: Anchor = 'start'): Edge {
    const fs = roleSize(role);
    const x0 = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
    return { x0, x1: x0 + w, y0: y - 0.74 * fs, y1: y + 0.22 * fs };
  }

  text(
    id: string,
    x: number,
    y: number,
    parts: readonly Part[],
    o: Timing & { anchor?: Anchor; owner?: string; ground?: boolean; names?: string; cls?: string; layer?: Layer } = {},
  ): Edge {
    const anchor = o.anchor ?? 'start';
    const role = parts.reduce((a, p) => (roleSize(p[1]) > roleSize(a) ? p[1] : a), parts[0][1]);
    const box = this.textBox(x, y, partsWidth(parts), role, anchor);
    // A text shown only before a play's moment shares its place with what replaces it, so it is not checked against it.
    if (!o.until) this.texts.push({ ...box, owner: o.owner ?? '', ground: !!o.ground, s: parts.map((p) => p[0]).join('') });
    this.add(o.layer ?? 'text', id, {
      k: 'text',
      cls: o.cls ?? '',
      x,
      y,
      anchor,
      parts,
      owner: o.owner,
      ground: o.ground,
      names: o.names,
      at: o.at,
      until: o.until,
    });
    return box;
  }

  mark(box: Edge, owner = ''): void {
    this.marks.push({ ...box, owner });
  }

  link(points: readonly (readonly [number, number])[], owner = ''): void {
    this.links.push({ points, owner });
  }

  region(id: string, box: Region): void {
    (this.regions[id] ??= []).push(box);
  }

  /** Whether `box`, grown by `margin`, keeps clear of every text, mark and line but those `ignore` owns, and of the sides. */
  free(box: Edge, ignore = '', margin = 2): boolean {
    const b = { x0: box.x0 - margin, x1: box.x1 + margin, y0: box.y0 - margin, y1: box.y1 + margin };
    const hit = (o: Edge) => !(o.x1 <= b.x0 || o.x0 >= b.x1 || o.y1 <= b.y0 || o.y0 >= b.y1);
    const mine = (owner: string) => !!ignore && !!owner && owner.split(' ').some((t) => ignore.split(' ').includes(t));
    if (this.texts.some((t) => hit(t) && !mine(t.owner))) return false;
    if (this.marks.some((m) => hit(m) && !mine(m.owner))) return false;
    for (const l of this.links) {
      if (mine(l.owner)) continue;
      if (l.points.some(([x, y]) => x > b.x0 && x < b.x1 && y > b.y0 && y < b.y1)) return false;
    }
    return b.x0 >= 2 && b.x1 <= this.W - 2;
  }
}

export const r1 = (v: number) => Math.round(v * 10) / 10;

export const sampleLine = (x1: number, y1: number, x2: number, y2: number, step = 3): [number, number][] => {
  const n = Math.max(2, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / step));
  return Array.from({ length: n + 1 }, (_, i) => [x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n]);
};

export const quad = (p0: readonly number[], c: readonly number[], p1: readonly number[], t: number): [number, number] => [
  (1 - t) ** 2 * p0[0] + 2 * (1 - t) * t * c[0] + t ** 2 * p1[0],
  (1 - t) ** 2 * p0[1] + 2 * (1 - t) * t * c[1] + t ** 2 * p1[1],
];

/** A critical ×, on a stage-coloured ground. */
export function xGlyph(D: Draw, id: string, cx: number, cy: number, owner: string, s = 4, timing: Timing = {}): void {
  D.add('marks', `${id}-ground`, { k: 'circle', cls: 'xground', cx, cy, r: s + 3, ...timing });
  D.add('marks', id, {
    k: 'path',
    cls: 'xmark',
    d: `M${cx - s} ${cy - s}l${2 * s} ${2 * s}M${cx + s} ${cy - s}l${-2 * s} ${2 * s}`,
    ...timing,
  });
  D.mark({ x0: cx - s - 2, x1: cx + s + 2, y0: cy - s - 2, y1: cy + s + 2 }, owner);
}

/** The pause glyph of a stalled replica. */
export function pauseGlyph(D: Draw, id: string, x: number, y: number): void {
  D.add('marks', `${id}-a`, { k: 'rect', cls: 'pause', x, y, w: 3, h: 10, rx: 1 });
  D.add('marks', `${id}-b`, { k: 'rect', cls: 'pause', x: x + 5, y, w: 3, h: 10, rx: 1 });
}

export type Tone = 'final' | 'critical' | 'warn' | 'neutral' | 'hidden';

/** The verdict pill's glyph: a check, a ×, a clock, a question mark or a dash. */
export function pillGlyph(tone: Tone, x: number, y: number): string {
  if (tone === 'final') return `M${x - 5} ${y}l3.5 3.5l6.5 -7`;
  if (tone === 'critical') return `M${x - 4} ${y - 4}l8 8M${x + 4} ${y - 4}l-8 8`;
  if (tone === 'warn') return `M${x - 5.5} ${y}a5.5 5.5 0 1 0 11 0a5.5 5.5 0 1 0 -11 0M${x} ${y - 3}v3l2 1.5`;
  if (tone === 'hidden') return `M${x - 3} ${y - 3}a3 3 0 1 1 3 3v1.5M${x} ${y + 4.5}v0.1`;
  return `M${x - 4} ${y}h8`;
}

/**
 * Each region's outline, kept 3 px inside the stage, with its "Look here" tag on the first free place: the frame's
 * edges 16 px off its corners, then just inside them, then the gutter outside, then beside the frame. A region with no
 * free place for a tag is counted in `D.missing`.
 */
export function focusOutlines(D: Draw, ids: readonly string[], H: number): (Focus & { region: string })[] {
  const { width: tagW, height: tagH } = TAG;
  const out: (Focus & { region: string })[] = [];
  for (const id of ids)
    (D.regions[id] ?? []).forEach((b, k) => {
      const x = Math.max(3, b.x);
      const y0 = Math.max(3, b.y);
      const w = Math.min(D.W - 3, b.x + b.w) - x;
      const h = Math.min(H - 3, b.y + b.h) - y0;
      const across: number[] = [];
      for (let ax = x + w - tagW - 16; ax >= x + 16; ax -= 8) across.push(ax);
      const xs = [x + w - tagW - 16, x + 16, ...across];
      const ys = [y0 - tagH / 2, y0 + h - tagH / 2, y0 + 4, y0 + h - tagH - 4, y0 - tagH - 2, y0 + h + 2];
      const cands = ys.flatMap((ty) => xs.map((tx) => [tx, ty] as const));
      for (const ty of [y0 + 4, y0 + h / 2 - tagH / 2]) cands.push([x + w + 4, ty], [x - tagW - 4, ty]);
      const tag = cands.find(([tx, ty]) => {
        if (tx < 3 || tx + tagW > D.W - 3 || ty < 3 || ty + tagH > H - 3) return false;
        return D.free({ x0: tx, x1: tx + tagW, y0: ty, y1: ty + tagH }, '', 1);
      });
      if (!tag) D.missing.push(`a tag for ${id}`);
      const [tx, ty] = tag ?? cands[0];
      D.mark({ x0: tx, x1: tx + tagW, y0: ty, y1: ty + tagH }, 'look');
      out.push({ id: k ? `${id}${k}` : id, region: id, x, y: y0, width: w, height: h, tag: { x: tx, y: ty } });
    });
  return out;
}
