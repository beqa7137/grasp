import { unitRuns, type Part, type TextMeasure } from './stage-text';

export type Anchor = 'start' | 'middle' | 'end';

/** A run of a drawn text: its words and classes (role, ink, and `t-unit` for a unit that keeps its case). */
export interface Span {
  t: string;
  cls: string;
  dx?: number;
}
interface Base {
  id: string;
  cls: string;
  owner?: string;
}
export type Prim =
  | (Base & { k: 'line'; x1: number; y1: number; x2: number; y2: number })
  | (Base & { k: 'rect'; x: number; y: number; w: number; h: number; rx: number })
  | (Base & { k: 'circle'; cx: number; cy: number; r: number; slide?: boolean })
  | (Base & { k: 'path'; d: string })
  | (Base & { k: 'text'; x: number; y: number; anchor: Anchor; spans: readonly Span[]; ground?: boolean });

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
export type Shape = Prim extends infer P ? (P extends Prim ? Omit<P, 'id'> : never) : never;
export interface TextOptions<L extends string> {
  anchor?: Anchor;
  owner?: string;
  /** Drawn on a ground of its own (a halo or a chip), so grid lines and a playhead may run under it. */
  ground?: boolean;
  cls?: string;
  layer?: L;
}
export interface PlaceOptions<L extends string> extends TextOptions<L> {
  minX?: number;
  maxX?: number;
  minY?: number;
  maxY?: number;
  ignore?: string;
  margin?: number;
  /** A label the stage can do without: no place is not a fault. */
  optional?: boolean;
  ok?: (box: Edge) => boolean;
}

/**
 * A stage drawing as a list of marks in layers, bottom to top, with the boxes placement checks against: every text, mark
 * and line placed so far. A label goes where `free` finds no text, mark or line, so nothing is drawn on anything else.
 * A widget names its type roles (`measure`) and its layers; a `unitRole` is set in capitals but for a unit after a number.
 */
export class StageDraw<R extends string, L extends string> {
  private readonly layers: Record<string, Prim[]> = {};
  private readonly ids = new Map<string, number>();
  readonly texts: TextBox[] = [];
  readonly marks: Mark[] = [];
  readonly links: Link[] = [];
  readonly regions: Record<string, Region[]> = {};
  /** Texts no place could take, which the layout spec reports. */
  readonly missing: string[] = [];

  constructor(
    readonly W: number,
    private readonly measure: TextMeasure<R>,
    private readonly order: readonly L[],
    private readonly unitRole: R | null = null,
  ) {
    for (const l of order) this.layers[l] = [];
  }

  add(layer: L, id: string, shape: Shape): void {
    const seen = this.ids.get(id) ?? 0;
    this.ids.set(id, seen + 1);
    this.layers[layer].push({ ...shape, id: seen ? `${id}#${seen}` : id } as Prim);
  }

  /** The marks of `layers`, bottom to top: all of them by default. */
  prims(layers: readonly L[] = this.order): Prim[] {
    return this.order.filter((l) => layers.includes(l)).flatMap((l) => this.layers[l]);
  }

  textBox(x: number, y: number, w: number, role: R, anchor: Anchor = 'start'): Edge {
    const fs = this.measure.size(role);
    const x0 = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
    return { x0, x1: x0 + w, y0: y - 0.74 * fs, y1: y + 0.22 * fs };
  }

  text(id: string, x: number, y: number, parts: readonly Part<R>[], o: TextOptions<L> = {}): Edge {
    const anchor = o.anchor ?? 'start';
    const box = this.textBox(x, y, this.measure.partsWidth(parts), this.roleOf(parts), anchor);
    this.texts.push({ ...box, owner: o.owner ?? '', ground: !!o.ground, s: parts.map((p) => p[0]).join('') });
    this.add(o.layer ?? ('text' as L), id, {
      k: 'text',
      cls: o.cls ?? '',
      x: r1(x),
      y: r1(y),
      anchor,
      spans: this.spansOf(parts),
      owner: o.owner,
      ground: o.ground,
    });
    return box;
  }

  /** Puts a text at the first candidate where it covers nothing (and `ok` accepts); counts it missing when none is free. */
  place(
    id: string,
    cands: readonly (readonly [number, number, Anchor?])[],
    parts: readonly Part<R>[],
    o: PlaceOptions<L> = {},
  ): Edge | null {
    const w = this.measure.partsWidth(parts);
    const role = this.roleOf(parts);
    for (const [x, y, anchor = 'start'] of cands) {
      const box = this.textBox(x, y, w, role, anchor);
      if (box.y0 < (o.minY ?? 0) || box.y1 > (o.maxY ?? Infinity) || box.x0 < (o.minX ?? 2) || box.x1 > (o.maxX ?? this.W - 2)) continue;
      if (!this.free(box, o.ignore ?? '', o.margin ?? 2)) continue;
      if (o.ok && !o.ok(box)) continue;
      return this.text(id, x, y, parts, { ...o, anchor });
    }
    if (!o.optional) this.missing.push(parts.map((p) => p[0]).join(''));
    return null;
  }

  mark(box: Edge, owner = ''): void {
    this.marks.push({ ...box, owner });
  }

  /** A line labels keep off, as points; sorted by x, so `free` reads only those across a box. */
  link(points: readonly (readonly [number, number])[], owner = ''): void {
    this.links.push({ points: [...points].sort((a, b) => a[0] - b[0]), owner });
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
      const p = l.points;
      let lo = 0;
      let hi = p.length;
      while (lo < hi) {
        const mid = (lo + hi) >> 1;
        if (p[mid][0] <= b.x0) lo = mid + 1;
        else hi = mid;
      }
      for (let i = lo; i < p.length && p[i][0] < b.x1; i++) if (p[i][1] > b.y0 && p[i][1] < b.y1) return false;
    }
    return b.x0 >= 2 && b.x1 <= this.W - 2;
  }

  private roleOf(parts: readonly Part<R>[]): R {
    return parts.reduce((a, p) => (this.measure.size(p[1]) > this.measure.size(a) ? p[1] : a), parts[0][1]);
  }

  private spansOf(parts: readonly Part<R>[]): Span[] {
    return parts.flatMap(([t, role, cls = '', dx]) => {
      const base = `t-${role}${cls ? ` ${cls}` : ''}`;
      if (role !== this.unitRole) return [{ t, cls: base, dx }];
      return unitRuns(t).map(([run, unit], i) => ({ t: run, cls: unit ? `${base} t-unit` : base, dx: i ? undefined : dx }));
    });
  }
}

export const r1 = (v: number) => Math.round(v * 10) / 10;
/** The first of `forms` that fits, longest first; null when none does. */
export const pick = (forms: readonly string[], fits: (t: string) => boolean) => forms.find(fits) ?? null;

export const sampleLine = (x1: number, y1: number, x2: number, y2: number, step = 3): [number, number][] => {
  const n = Math.max(2, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / step));
  return Array.from({ length: n + 1 }, (_, i) => [x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n]);
};
