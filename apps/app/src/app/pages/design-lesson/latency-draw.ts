import { TAG, type Focus } from './focus-layout';
import { fontMeasure, unitRuns, type Part as StagePart } from './stage-text';

/** The stage's type roles, as `latency-widget.component.scss` sets them; the label keeps a unit's case after a number. */
export type Role = 'label' | 'cap' | 'capB' | 'small' | 'smallB' | 'mono' | 'nameS' | 'head';
export const TEXT = fontMeasure<Role>({
  label: { font: 'w600', size: 11, track: 0.12, upper: true, units: true },
  cap: { font: 'w500', size: 13 },
  capB: { font: 'w600', size: 13 },
  small: { font: 'w500', size: 11 },
  smallB: { font: 'w700', size: 11 },
  mono: { font: 'mono', size: 11 },
  nameS: { font: 'mono', size: 13 },
  head: { font: 'mono', size: 17 },
});
export const tw = TEXT.tw;
export type Part = StagePart<Role>;

export type Anchor = 'start' | 'middle' | 'end';
/** Layers bottom to top; `clip` holds the timeline's marks, which a play reveals up to its clock. */
export type Layer = 'back' | 'grid' | 'links' | 'clip' | 'marks' | 'dots' | 'text' | 'top';
const LAYERS: readonly Layer[] = ['back', 'grid', 'links', 'clip', 'marks', 'dots', 'text', 'top'];

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
type Shape = Prim extends infer P ? (P extends Prim ? Omit<P, 'id'> : never) : never;
export interface TextOptions {
  anchor?: Anchor;
  owner?: string;
  /** Drawn on a ground of its own (a halo or a chip), so grid lines and the playhead may run under it. */
  ground?: boolean;
  cls?: string;
  layer?: Layer;
}
export interface PlaceOptions extends TextOptions {
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

const roleOf = (parts: readonly Part[]) => parts.reduce((a, p) => (TEXT.size(p[1]) > TEXT.size(a) ? p[1] : a), parts[0][1]);

const spansOf = (parts: readonly Part[]): Span[] =>
  parts.flatMap(([t, role, cls = '', dx]) => {
    const base = `t-${role}${cls ? ` ${cls}` : ''}`;
    if (role !== 'label') return [{ t, cls: base, dx }];
    return unitRuns(t).map(([run, unit], i) => ({ t: run, cls: unit ? `${base} t-unit` : base, dx: i ? undefined : dx }));
  });

/**
 * The stage drawing as a list of marks in layers, with the boxes placement checks against: every text, mark and line
 * placed so far. A label goes where `free` finds no text, mark or line, so nothing is drawn on anything else.
 */
export class Draw {
  private readonly layers: Record<Layer, Prim[]> = { back: [], grid: [], links: [], clip: [], marks: [], dots: [], text: [], top: [] };
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

  /** The marks of `layers`, bottom to top: all of them by default. */
  prims(layers: readonly Layer[] = LAYERS): Prim[] {
    return LAYERS.filter((l) => layers.includes(l)).flatMap((l) => this.layers[l]);
  }

  textBox(x: number, y: number, w: number, role: Role, anchor: Anchor = 'start'): Edge {
    const fs = TEXT.size(role);
    const x0 = anchor === 'middle' ? x - w / 2 : anchor === 'end' ? x - w : x;
    return { x0, x1: x0 + w, y0: y - 0.74 * fs, y1: y + 0.22 * fs };
  }

  text(id: string, x: number, y: number, parts: readonly Part[], o: TextOptions = {}): Edge {
    const anchor = o.anchor ?? 'start';
    const box = this.textBox(x, y, TEXT.partsWidth(parts), roleOf(parts), anchor);
    this.texts.push({ ...box, owner: o.owner ?? '', ground: !!o.ground, s: parts.map((p) => p[0]).join('') });
    this.add(o.layer ?? 'text', id, {
      k: 'text',
      cls: o.cls ?? '',
      x: r1(x),
      y: r1(y),
      anchor,
      spans: spansOf(parts),
      owner: o.owner,
      ground: o.ground,
    });
    return box;
  }

  /** Puts a text at the first candidate where it covers nothing (and `ok` accepts); counts it missing when none is free. */
  place(id: string, cands: readonly (readonly [number, number, Anchor?])[], parts: readonly Part[], o: PlaceOptions = {}): Edge | null {
    const w = TEXT.partsWidth(parts);
    const role = roleOf(parts);
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
}

export const r1 = (v: number) => Math.round(v * 10) / 10;
/** The first of `forms` that fits, longest first; null when none does. */
export const pick = (forms: readonly string[], fits: (t: string) => boolean) => forms.find(fits) ?? null;

export const sampleLine = (x1: number, y1: number, x2: number, y2: number, step = 3): [number, number][] => {
  const n = Math.max(2, Math.ceil(Math.hypot(x2 - x1, y2 - y1) / step));
  return Array.from({ length: n + 1 }, (_, i) => [x1 + ((x2 - x1) * i) / n, y1 + ((y2 - y1) * i) / n]);
};

export const samplePath = (pts: readonly (readonly [number, number])[], step = 3): [number, number][] =>
  pts.slice(1).flatMap((p, i) => sampleLine(pts[i][0], pts[i][1], p[0], p[1], step));

export const cubic = (
  p0: readonly number[],
  p1: readonly number[],
  p2: readonly number[],
  p3: readonly number[],
  n = 24,
): [number, number][] =>
  Array.from({ length: n + 1 }, (_, i) => {
    const t = i / n;
    const u = 1 - t;
    return [
      u * u * u * p0[0] + 3 * u * u * t * p1[0] + 3 * u * t * t * p2[0] + t * t * t * p3[0],
      u * u * u * p0[1] + 3 * u * u * t * p1[1] + 3 * u * t * t * p2[1] + t * t * t * p3[1],
    ];
  });

/**
 * A polyline's points for placement checks, bounded by its width rather than its vertices: in each pixel column, the y
 * range it covers there, every `step` px.
 */
export function columnPoints(pts: readonly (readonly [number, number])[], step = 2): [number, number][] {
  const ranges = new Map<number, [number, number]>();
  const put = (c: number, y: number) => {
    const r = ranges.get(c);
    if (!r) ranges.set(c, [y, y]);
    else if (y < r[0]) r[0] = y;
    else if (y > r[1]) r[1] = y;
  };
  for (let i = 1; i < pts.length; i++) {
    const [xa, ya] = pts[i - 1];
    const [xb, yb] = pts[i];
    const lo = Math.min(xa, xb);
    const hi = Math.max(xa, xb);
    const at = (x: number) => (hi === lo ? yb : ya + ((yb - ya) * (x - xa)) / (xb - xa));
    if (hi === lo) put(Math.floor(lo), ya);
    for (let c = Math.floor(lo); c <= Math.floor(hi); c++) {
      put(c, at(Math.max(lo, c)));
      put(c, at(Math.min(hi, c + 1)));
    }
  }
  const xs = pts.map((p) => p[0]);
  const [x0, x1] = [Math.min(...xs), Math.max(...xs)];
  const out: [number, number][] = [];
  for (const [c, [y0, y1]] of ranges) {
    const x = Math.min(x1, Math.max(x0, c + 0.5));
    for (let y = y0; y < y1; y += step) out.push([x, y]);
    out.push([x, y1]);
  }
  return out;
}

/** The y of a polyline at x (linear between its points), or null outside it. */
export function yAt(pts: readonly (readonly [number, number])[], x: number): number | null {
  for (let i = 1; i < pts.length; i++) {
    const [xa, ya] = pts[i - 1];
    const [xb, yb] = pts[i];
    if (x >= xa && x <= xb) return xb === xa ? ya : ya + ((yb - ya) * (x - xa)) / (xb - xa);
  }
  return null;
}

/** A critical ×, on a stage-colored ground. */
export function xGlyph(D: Draw, id: string, cx: number, cy: number, owner: string, s = 4): void {
  D.add('marks', `${id}-ground`, { k: 'circle', cls: 'xground', cx, cy, r: s + 3 });
  D.add('marks', id, {
    k: 'path',
    cls: 'xmark',
    owner,
    d: `M${cx - s} ${cy - s}l${2 * s} ${2 * s}M${cx + s} ${cy - s}l${-2 * s} ${2 * s}`,
  });
  D.mark({ x0: cx - s - 2, x1: cx + s + 2, y0: cy - s - 2, y1: cy + s + 2 }, owner);
}

/** A dot, with its box known to placement. */
export function dot(D: Draw, id: string, cx: number, cy: number, r: number, cls: string, owner: string, slide = false): void {
  D.add('dots', id, { k: 'circle', cls: `dot ${cls}`, cx: r1(cx), cy: r1(cy), r, owner, slide });
  D.mark({ x0: cx - r, x1: cx + r, y0: cy - r, y1: cy + r }, owner);
}

/**
 * Each region's outline with its "Look here" tag. The outline takes in the texts its region holds with 6 px to spare
 * (3 at least); a text outside that would come within 4 px of the stroke moves that side in or, when it cannot, is taken
 * in too. The tag goes on the outline's edge first, 16 px off its corners, then just inside, then two inner rows, outside
 * last; a region with no free place for it is counted in `D.missing`.
 */
export function focusOutlines(D: Draw, ids: readonly string[], H: number): (Focus & { region: string })[] {
  const { width: tagW, height: tagH } = TAG;
  const out: (Focus & { region: string })[] = [];
  for (const id of ids)
    (D.regions[id] ?? []).forEach((b, k) => {
      const inside = new Set(
        D.texts.filter((t) => {
          const cx = (t.x0 + t.x1) / 2;
          const cy = (t.y0 + t.y1) / 2;
          return cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h;
        }),
      );
      const grow = (a: Edge, t: Edge, d: number): Edge => ({
        x0: Math.min(a.x0, t.x0 - d),
        y0: Math.min(a.y0, t.y0 - d),
        x1: Math.max(a.x1, t.x1 + d),
        y1: Math.max(a.y1, t.y1 + d),
      });
      let box: Edge = { x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h };
      let core: Edge = { x0: b.x + 4, y0: b.y + 4, x1: b.x + b.w - 4, y1: b.y + b.h - 4 };
      for (const t of inside) {
        box = grow(box, t, 6);
        core = grow(core, t, 3);
      }
      const clash = (t: Edge) => !(t.x1 <= box.x0 - 4 || t.x0 >= box.x1 + 4 || t.y1 <= box.y0 - 4 || t.y0 >= box.y1 + 4);
      for (let round = 0; round < 8; round++) {
        const bad = D.texts.filter((t) => !inside.has(t) && clash(t));
        if (!bad.length) break;
        for (const t of bad) {
          if (t.y0 - 4.5 >= core.y1) box.y1 = Math.min(box.y1, t.y0 - 4.5);
          else if (t.y1 + 4.5 <= core.y0) box.y0 = Math.max(box.y0, t.y1 + 4.5);
          else if (t.x0 - 4.5 >= core.x1) box.x1 = Math.min(box.x1, t.x0 - 4.5);
          else if (t.x1 + 4.5 <= core.x0) box.x0 = Math.max(box.x0, t.x1 + 4.5);
          else {
            inside.add(t);
            box = grow(box, t, 6);
            core = grow(core, t, 3);
          }
        }
      }
      const x = Math.max(3, box.x0);
      const y = Math.max(3, box.y0);
      const w = Math.min(D.W - 3, box.x1) - x;
      const h = Math.min(H - 3, box.y1) - y;
      const across: number[] = [];
      for (let ax = x + w - tagW - 16; ax >= x + 16; ax -= 8) across.push(ax);
      const xs = [x + w - tagW - 16, x + 16, ...across];
      const ys = [y - tagH / 2, y + h - tagH / 2, y + 4, y + h - tagH - 4, y + 24, y + 44, y - tagH - 2, y + h + 2];
      const tag = ys
        .flatMap((ty) => xs.map((tx) => [tx, ty] as const))
        .find(
          ([tx, ty]) =>
            tx >= 3 &&
            tx + tagW <= D.W - 3 &&
            ty >= 3 &&
            ty + tagH <= H - 3 &&
            D.free({ x0: tx, x1: tx + tagW, y0: ty, y1: ty + tagH }, '', 1),
        );
      if (!tag) D.missing.push(`a tag for ${id}`);
      const [tx, ty] = tag ?? [xs[0], ys[0]];
      D.mark({ x0: tx, x1: tx + tagW, y0: ty, y1: ty + tagH }, 'look');
      out.push({ id: k ? `${id}${k}` : id, region: id, x: r1(x), y: r1(y), width: r1(w), height: r1(h), tag: { x: r1(tx), y: r1(ty) } });
    });
  return out;
}
