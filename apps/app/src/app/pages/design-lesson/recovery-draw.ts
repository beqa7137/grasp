import { RECOVERY_SETTINGS, recoveryScenario, type RecoveryPlanId, type RecoveryScenario, type RecoverySettings } from '@grasp/engine';
import { TAG, type Focus } from './focus-layout';
import { r1, type Anchor, type Edge } from './stage-draw';
import { caps, tw, type Draw, type Layer, type Part, type Role } from './recovery-text';
import { NAMES, lossWords, rtoSpan, type Hid } from './recovery-words';

/** A control the layout places over the stage: the Play disc, or a segment of one of its radio groups. */
export type Hit =
  | { kind: 'play'; x: number; y: number; w: number; h: number; owner: string }
  | {
      kind: 'seg';
      x: number;
      y: number;
      w: number;
      h: number;
      owner: string;
      group: StageGroup;
      value: number;
      label: string;
      checked: boolean;
      legend: string;
    };
export type StageGroup = 'base' | 'archive' | 'sync' | 'restore' | 'replay';

export interface StageView {
  hid: Hid;
  /** The play's clock at its last drawn moment, or null at rest. */
  play: { frac: number } | null;
  /** Whether a question's answer is playing: its hidden regions' outcome marks wait for the reveal. */
  answering: boolean;
  /** The setting before the learner's last change, said in words beside the values it moved. */
  ghost: RecoverySettings | null;
  /** Under Reduced motion, Play wrote its story under the stage. */
  told: boolean;
  /** The challenge is open: its goals are marked on the axes. */
  challenge: boolean;
  focus: readonly string[];
}

/** One drawn step of a bar, for the rule that a bar is as long as its minutes. */
export interface BarStep {
  kind: string;
  min: number;
  x: number;
  w: number;
  exact: number;
  floor: boolean;
}

/** What the layout spec checks the drawing against, beyond the marks themselves. */
export interface StageMeta {
  PAD: number;
  ax0: number;
  xNow: number;
  zeroX: number;
  rings: Partial<Record<string, number>>;
  /** Each lost band's start and end. */
  lost: Partial<Record<string, [number, number]>>;
  bars: Partial<Record<string, { end: number; steps: BarStep[] }>>;
  fulls: number;
  /** Every backup box drawn: the full backups and the base backup. */
  boxes: Edge[];
  combXs: number[];
  rowsB: { top: number; bottom: number }[];
  hiddenBoxes: { id: string; x0: number; x1: number }[];
  ticks: Record<'a' | 'b' | 'i', { x: number; x0: number; x1: number; t: string }[]>;
  bHeadY: number;
  bEndY: number;
  aTop: number;
  slack: number;
}

export interface Ctx {
  D: Draw;
  m: RecoveryScenario;
  view: StageView;
  hid: Hid;
  W: number;
  PAD: number;
  frac: number | null;
  struck: boolean;
  hits: Hit[];
  meta: StageMeta;
}

export const RING_R = 7;
export const BOX = { w: 3, h: 7 };
export const ROW_GAP = 28;
export const rowHeight = (lines: number) => 45 + 14 * (lines - 1);
/** From this width the stage's controls under a block stand in one row; under it, stacked. */
export const ONE_ROW_FROM = 520;

export const at = (c: Ctx, t: number) => c.frac === null || c.frac >= t - 1e-9;

export function rect(c: Ctx, layer: Layer, id: string, cls: string, x: number, y: number, w: number, h: number, rx = 0, owner?: string) {
  c.D.add(layer, id, { k: 'rect', cls, x: r1(x), y: r1(y), w: r1(Math.max(0, w)), h: r1(Math.max(0, h)), rx, owner });
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
export function text(c: Ctx, id: string, x: number, y: number, parts: readonly Part[], o: { anchor?: Anchor; owner?: string } = {}) {
  return c.D.text(id, x, y, parts, { ...o, owner: o.owner ?? id });
}
export const label = (t: string, cls = 'muted'): Part[] => [[caps(t), 'label', cls]];
export const pickFits = (forms: readonly string[], role: Role, w: number) => forms.find((f) => tw(f, role) <= w) ?? null;

export function hit(c: Ctx, h: Hit) {
  c.hits.push(h);
  c.D.mark({ x0: h.x, x1: h.x + h.w, y0: h.y, y1: h.y + h.h }, h.owner);
}

/** A critical ×, centred on a point. */
export function xMark(c: Ctx, id: string, cx: number, cy: number, owner: string) {
  path(c, 'marks', id, 'xmark', `M${r1(cx - 5)} ${r1(cy - 5)}l10 10M${r1(cx + 5)} ${r1(cy - 5)}l-10 10`, owner);
  c.D.mark({ x0: cx - 6, x1: cx + 6, y0: cy - 6, y1: cy + 6 }, owner);
}

/** A dashed box: the one mark that means "hidden until you answer". */
export function hiddenBox(c: Ctx, x0: number, x1: number, y: number, h: number, owner: string, id: string) {
  rect(c, 'marks', `hidden-${id}`, 'hidden-box', x0, y, x1 - x0, h, 3);
  c.D.mark({ x0, x1, y0: y, y1: y + h }, owner);
  c.meta.hiddenBoxes.push({ id, x0: r1(x0), x1: r1(x1) });
}

/**
 * A head left and a subtitle right on one line when every variant of both fits, else the subtitle on a line of its
 * own. The choice depends on the width alone, so the stage's height does too.
 */
export function labelRow(
  c: Ctx,
  y: number,
  head: string,
  subs: readonly string[],
  owner: string,
  variants: { heads: readonly string[]; subs: readonly (readonly string[])[]; now?: readonly string[] | null } = {
    heads: [head],
    subs: [subs],
  },
): number {
  const x0 = c.PAD;
  const x1 = c.W - c.PAD;
  const fits = (h: string, t: string) => tw(caps(h), 'label') + 16 + tw(caps(t), 'label') <= x1 - x0;
  text(c, owner, x0, y + 9, label(head, 'ink'), { owner });
  if (!subs.length && !variants.now) return y + 14;
  const oneLine = variants.heads.every((h) => variants.subs.every((ss) => ss.some((t) => fits(h, t))));
  const forms = variants.now ?? subs;
  const cls = variants.now ? 'ink' : 'muted';
  if (oneLine) {
    const sub = forms.find((t) => fits(head, t));
    if (sub) text(c, `${owner}-sub`, x1, y + 9, label(sub, cls), { anchor: 'end', owner });
    return y + 14;
  }
  const s2 = forms.find((t) => tw(caps(t), 'label') <= x1 - x0);
  if (s2) text(c, `${owner}-sub`, x0, y + 25, label(s2, cls), { owner });
  return y + 30;
}

export interface Tick {
  x: number;
  t: string;
  at: number;
  goal?: boolean;
  /** The width the tick reserves, when its label is wider than drawn (the disaster's name, before it strikes). */
  w?: number;
  role?: Role;
}
/** The ticks that keep 6 px apart and inside `x0`..`x1`, the must-keep ones first. */
export function fitTicks(all: readonly Tick[], x0: number, x1: number, keep: readonly number[]): Tick[] {
  const anchorOf = (t: Tick): Anchor => (t.x <= x0 + 0.5 ? 'start' : t.x >= x1 - 0.5 ? 'end' : 'middle');
  const box = (t: Tick): [number, number] => {
    const w = t.w ?? tw(t.t, t.role ?? 'small');
    const a = anchorOf(t);
    return a === 'start' ? [t.x, t.x + w] : a === 'end' ? [t.x - w, t.x] : [t.x - w / 2, t.x + w / 2];
  };
  const chosen: Tick[] = [];
  const order = [...all.filter((t) => keep.includes(t.at)), ...all.filter((t) => !keep.includes(t.at))];
  for (const t of order) {
    const [a, b] = box(t);
    if (a < x0 - 0.5 || b > x1 + 0.5) continue;
    if (
      chosen.some((o) => {
        const [oa, ob] = box(o);
        return a < ob + 6 && b > oa - 6;
      })
    )
      continue;
    chosen.push(t);
  }
  return chosen.sort((p, q) => p.x - q.x);
}
export const tickAnchor = (t: Tick, x0: number, x1: number): Anchor => (t.x <= x0 + 0.5 ? 'start' : t.x >= x1 - 0.5 ? 'end' : 'middle');

export interface ControlGroup {
  group: StageGroup;
  legend: string;
  items: readonly (readonly [number, string])[];
  short?: readonly string[];
  cur: number;
}
/** The on-stage controls under a block: one row from a 520 px stage, segments sized by their count; else stacked. */
export function controlsRow(c: Ctx, y: number, groups: readonly ControlGroup[]): number {
  const x0 = c.PAD;
  const avail = c.W - 2 * c.PAD;
  const oneRow = avail >= ONE_ROW_FROM;
  const n = groups.reduce((a, g) => a + g.items.length, 0);
  const gap = 12;
  let x = x0;
  let rowY = y;
  for (const g of groups) {
    const w = oneRow ? ((avail - gap * (groups.length - 1)) * g.items.length) / n : avail;
    if (!oneRow) x = x0;
    text(c, `legend-${g.group}`, x, rowY + 9, label(g.legend), { owner: `ctl-${g.group}` });
    const sw = (w - 4 * (g.items.length - 1)) / g.items.length;
    const short = !!g.short && g.items.some(([, l]) => tw(l, 'cap') + 10 > sw);
    g.items.forEach(([v, l], i) =>
      hit(c, {
        kind: 'seg',
        x: x + i * (sw + 4),
        y: rowY + 16,
        w: sw,
        h: 44,
        owner: `ctl-${g.group}`,
        group: g.group,
        value: v,
        label: short && g.short ? g.short[i] : l,
        checked: v === g.cur,
        legend: g.legend,
      }),
    );
    if (oneRow) x += w + gap;
    else rowY += 60 + 12;
  }
  return oneRow ? rowY + 60 : rowY - 12;
}

/**
 * Each region's outline with its "Look here" tag. The outline takes in the texts its region holds with 8 px to spare
 * and runs 15 px under them, so the tag has room at its foot. The tag sits on the outline's foot or top, from its left
 * end toward the middle, never in the column where the values right-align, and keeps 6 px from every text and mark; a
 * region with no free place for it is counted in `D.missing`.
 */
export function focusOutlines(D: Draw, ids: readonly string[], H: number): (Focus & { region: string })[] {
  const GUTTER = 8;
  const out: (Focus & { region: string })[] = [];
  for (const id of ids)
    (D.regions[id] ?? []).forEach((b, k) => {
      const within = (t: Edge) => {
        const cx = (t.x0 + t.x1) / 2;
        const cy = (t.y0 + t.y1) / 2;
        return cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h;
      };
      let box: Edge = { x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h };
      for (const t of D.texts.filter(within))
        box = {
          x0: Math.min(box.x0, t.x0 - GUTTER),
          y0: Math.min(box.y0, t.y0 - GUTTER),
          x1: Math.max(box.x1, t.x1 + GUTTER),
          y1: Math.max(box.y1, t.y1 + GUTTER),
        };
      box.y1 += 7;
      const x = Math.max(3, box.x0);
      const y = Math.max(3, box.y0);
      const w = Math.min(D.W - 3, box.x1) - x;
      const h = Math.min(H - 3, box.y1) - y;
      const xs: number[] = [];
      for (let ax = x + 16; ax <= x + w / 2 - TAG.width / 2; ax += 8) xs.push(ax);
      const tag = [y + h - TAG.height / 2, y - TAG.height / 2]
        .flatMap((ty) => xs.map((tx) => [tx, ty] as const))
        .find(
          ([tx, ty]) =>
            tx >= 3 &&
            tx + TAG.width <= D.W - 3 &&
            ty >= 3 &&
            ty + TAG.height <= H - 3 &&
            D.free({ x0: tx - 4.5, x1: tx + TAG.width + 4.5, y0: ty - 4.5, y1: ty + TAG.height + 4.5 }, '', 2),
        );
      if (!tag) D.missing.push(`a tag for ${id}`);
      const [tx, ty] = tag ?? [x + 16, y + h - TAG.height / 2];
      D.mark({ x0: tx, x1: tx + TAG.width, y0: ty, y1: ty + TAG.height }, 'look');
      out.push({ id: k ? `${id}${k}` : id, region: id, x: r1(x), y: r1(y), width: r1(w), height: r1(h), tag: { x: r1(tx), y: r1(ty) } });
    });
  return out;
}

const cache = new Map<string, number>();
/** The most of something any setting needs at this width: computed once a width, so no setting moves the stage. */
export function reserved(key: string, W: number, f: (m: RecoveryScenario) => number): number {
  const k = `${key}|${W}`;
  let v = cache.get(k);
  if (v === undefined) cache.set(k, (v = Math.max(...RECOVERY_SETTINGS.map((s) => f(recoveryScenario(s))))));
  return v;
}

const names = new Map<string, number>();
/**
 * A row's name form, chosen once a width: the longest that leaves room for its shortest value in both blocks at every
 * setting, so a row reads as the same plan in A and B.
 */
export function nameFor(key: RecoveryPlanId | 'primary', c: Ctx, availA: number, availB: number): string {
  const k = `${key}|${c.W}`;
  let pick = names.get(k);
  if (pick === undefined) {
    const n = Math.max(...RECOVERY_SETTINGS.map((s) => NAMES[key](s).length));
    pick = n - 1;
    for (let i = 0; i < n; i++) {
      const ok = RECOVERY_SETTINGS.every((s) => {
        const forms = NAMES[key](s);
        const nm = tw(forms[Math.min(i, forms.length - 1)], 'capB');
        if (key === 'primary') return nm + 10 + Math.max(tw('table dropped', 'capB'), tw('disks lost', 'capB')) <= availA;
        const p = recoveryScenario(s).plans[key];
        if (nm + 10 + tw(lossWords(p), 'capB') > availA) return false;
        return nm + 10 + Math.max(tw('recovering', 'capB'), tw(p.recovers ? rtoSpan(p.rtoMin) : 'never', 'capB')) <= availB;
      });
      if (ok) {
        pick = i;
        break;
      }
    }
    names.set(k, pick);
  }
  const forms = NAMES[key](c.m.settings);
  return forms[Math.min(pick, forms.length - 1)];
}
