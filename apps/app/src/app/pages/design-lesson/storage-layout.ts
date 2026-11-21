import {
  STORAGE_PAGE_FILL,
  STORAGE_SPACE_AXIS,
  STORAGE_WRITE_AXIS,
  STORAGE_WRITE_MBPS,
  formatAmp,
  formatCount,
  formatRate,
  formatSpace,
  roundSignificant,
  storageScenario,
  type StorageScenario,
} from '@grasp/engine';
import { Draw, r1, type Anchor, type Edge } from './latency-draw';
import { TAG, type Focus } from './focus-layout';
import {
  TAG_ROOM,
  btreePanelHeight,
  clear,
  fitsIn,
  label,
  line,
  lsmPanelHeight,
  partsFit,
  pickLast,
  rect,
  small,
  text,
  type Ctx,
  type Hit,
  type StageMeta,
  type StageView,
} from './storage-draw';
import type { Engine } from './storage-motion';
import { lsmPanel } from './storage-stack';
import { NUM, partsWidth, tw, wrapKept, type Part } from './storage-text';
import { btreePanel } from './storage-tree';
import { ALL_PREMISES, ENGINE, isWrite, premise, summary } from './storage-words';

/** From this stage width the engines sit side by side; below it they stack, the B-tree first. */
export const TWO_FROM = 500;
const ENGINES: readonly Engine[] = ['btree', 'lsm'];
const READ_SCALE = 8;
const PIP = 12;

export interface Stage {
  D: Draw;
  H: number;
  hits: Hit[];
  focus: (Focus & { region: string })[];
  summary: string;
  meta: StageMeta;
}

const wasOf = (c: Ctx) => (c.view.ghost && !c.hid.ghost ? storageScenario(c.view.ghost) : null);

/** Written to disk, × the new data, on one fixed axis: a bar an engine, its figure and the product at the right. */
function writeGroup(c: Ctx, x: number, y: number, w: number): number {
  const { m, hid } = c;
  const rate = formatRate(STORAGE_WRITE_MBPS);
  const head = pickLast(
    [`Written to disk, × the new data · at ${rate} of new data`, `Disk writes for ${rate} of new data`, `For ${rate} of new data`],
    fitsIn('label', w - TAG_ROOM),
  );
  // Where even the shortest label leaves no tag's width at its end, the axis's last tick label leaves it instead.
  const roomTop = tw(head, 'label') <= w - TAG_ROOM;
  text(c, 'write-caption', x, y + 11, label(head), { owner: 'cost-label' });
  const px = w / STORAGE_WRITE_AXIS;
  c.meta.writePx = px;
  const was = wasOf(c);
  const hiddenOf = (e: Engine) => (e === 'btree' ? hid.btNumbers : hid.lsmNumbers);
  const moved = (e: Engine) => !!was && Math.abs(was[e].writeAmp - m[e].writeAmp) > 1e-9;
  // Both rows take one form, the longest that fits each; the first counts the B-tree's page writes, which waits while
  // either write cost hides. How each engine writes, at random or in sequence, is the lesson: every form keeps it, and
  // the rate is dropped before it is.
  const product = (e: Engine, level: number) => {
    const r = formatRate(m[e].diskWriteMBps);
    const forms =
      e === 'btree'
        ? [
            `${r} · ≈${formatCount(roundSignificant(m.btree.randomWritesPerSec))} random page writes/s`,
            `${r} of random page writes`,
            `${r}, random`,
            'random',
          ]
        : [`${r} of disk writes, all sequential`, `${r} of sequential writes`, `${r}, sequential`, 'sequential'];
    return ` · ${forms[level]}${moved(e) ? ` · was ${formatAmp(was![e].writeAmp)}` : ''}`;
  };
  const figure = (e: Engine, level: number): Part[] =>
    hiddenOf(e)
      ? [['?×', NUM, 'muted']]
      : [
          [formatAmp(m[e].writeAmp), NUM, 'amber-ink'],
          [product(e, level), 'small', 'muted'],
        ];
  const nameW = (e: Engine) => tw(ENGINE[e], 'small') + 10;
  const level =
    [0, 1, 2, 3].find(
      (lv) => (lv > 0 || !(hid.btNumbers || hid.lsmNumbers)) && ENGINES.every((e) => partsWidth(figure(e, lv)) <= w - nameW(e)),
    ) ?? 3;
  let cy = y + 20;
  for (const e of ENGINES) {
    text(c, `write-name-${e}`, x, cy + 11, small(ENGINE[e], 'ink'), { owner: `cost-${e}` });
    text(c, `write-${e}`, x + w, cy + 11, figure(e, level), { anchor: 'end', owner: `cost-${e}` });
    const by = cy + 17;
    if (hiddenOf(e)) rect(c, 'marks', `write-bar-${e}-hidden`, 'hidden-box', x + 0.5, by, w - 1, 10, 2);
    else {
      rect(c, 'marks', `write-track-${e}`, 'bar-track', x + 0.5, by, w - 1, 10, 2);
      rect(c, 'marks', `write-bar-${e}`, 'bar-fill', x, by, m[e].writeAmp * px, 10, 2);
      if (moved(e))
        line(c, 'marks', `ghost-${e}`, 'ghost-tick', x + was![e].writeAmp * px, by - 3, x + was![e].writeAmp * px, by + 13, 'ghost');
    }
    c.D.mark({ x0: x, x1: x + w, y0: by - 3, y1: by + 13 }, `cost-${e}`);
    cy += 36;
  }
  const ay = cy - 4;
  for (const v of roomTop ? [0, 50, 100, 150] : [0, 50, 100]) {
    const tx = x + v * px;
    line(c, 'grid', `write-tick-${v}`, 'tickmark', tx, ay, tx, ay + 4);
    text(c, `write-tick-label-${v}`, tx, ay + 15, small(v === 0 ? '0' : `${v}×`), {
      anchor: v === 0 ? 'start' : 'middle',
      owner: 'cost-axis',
    });
  }
  c.D.region('cost-write', { x: x - 6, y: y - 4, w: w + 12, h: 20 + 72 + 18 });
  return y + 20 + 72 + 14;
}

/** Disk reads for one lookup: a pip a read, up to 8, the count right after its pips. */
function readGroup(c: Ctx, x: number, y: number, w: number): number {
  const { m, hid } = c;
  text(
    c,
    'read-caption',
    x,
    y + 11,
    label(pickLast(['Disk reads for one lookup', 'Disk reads per lookup', 'Disk reads'], fitsIn('label', w - TAG_ROOM))),
    {
      owner: 'cost-label',
    },
  );
  const was = wasOf(c);
  const nameW = Math.max(tw(ENGINE.btree, 'small'), tw(ENGINE.lsm, 'small')) + 10;
  const box = READ_SCALE * PIP;
  let cy = y + 20;
  for (const e of ENGINES) {
    const reads = m[e].lookupReads;
    text(c, `read-name-${e}`, x, cy + 11, small(ENGINE[e], 'ink'), { owner: `read-${e}` });
    if (hid.readNumbers && e === 'lsm') {
      // The dashed box spans the row's whole scale, whatever the hidden count.
      rect(c, 'marks', `pips-${e}-hidden`, 'hidden-box', x + nameW, cy + 2, hid.pipBox ? box : reads * PIP, 10, 5);
      text(c, `reads-${e}`, x + nameW + box + 6, cy + 11, [['?', NUM, 'muted']], { owner: `read-${e}` });
    } else {
      for (let i = 0; i < reads; i++)
        c.D.add('marks', `pip-${e}-${i}`, { k: 'circle', cls: 'pip', cx: r1(x + nameW + 5 + i * PIP), cy: cy + 7, r: 4.5 });
      const before = was ? was[e].lookupReads : null;
      const parts: Part[] =
        before !== null && before !== reads
          ? [
              [String(reads), NUM, 'cur-ink'],
              [` · was ${before}`, 'small', 'muted'],
            ]
          : [[String(reads), NUM, 'cur-ink']];
      text(c, `reads-${e}`, x + nameW + reads * PIP + 4, cy + 11, parts, { owner: `read-${e}` });
    }
    c.D.mark({ x0: x + nameW, x1: x + nameW + box, y0: cy + 1, y1: cy + 13 }, `read-${e}`);
    cy += 24;
  }
  c.D.region('cost-read', { x: x - 6, y: y - 4, w: w + 12, h: 20 + 48 + 4 });
  return y + 20 + 48;
}

/** Disk used, × the live data, on a fixed 0 to 1.5× axis: solid to 1×, hatched beyond. */
function spaceGroup(c: Ctx, x: number, y: number, w: number): number {
  const { m } = c;
  text(c, 'space-caption', x, y + 11, label(pickLast(['Disk used, × the live data', 'Disk used, × the data'], fitsIn('label', w))), {
    owner: 'cost-label',
  });
  const px = w / STORAGE_SPACE_AXIS;
  c.meta.spacePx = px;
  const pct = Math.round(STORAGE_PAGE_FILL * 100);
  const why: Record<Engine, string[]> = {
    btree: [` · pages about ${pct}% full`, ` · pages ${pct}% full`, ''],
    lsm: [' · at most: old versions not yet merged away', ' · at most, old versions', ' · at most'],
  };
  let cy = y + 20;
  for (const e of ENGINES) {
    const amp = m[e].spaceAmp;
    const value = formatSpace(amp);
    const valueW = tw(value, NUM) + 8;
    const name = pickLast(
      why[e].map((t): Part[] => [
        [ENGINE[e], 'small', 'ink'],
        [t, 'small', 'muted'],
      ]),
      partsFit(w - valueW),
    );
    text(c, `space-name-${e}`, x, cy + 11, name, { owner: `space-${e}` });
    text(c, `space-${e}`, x + w, cy + 11, [[value, NUM, 'ink']], { anchor: 'end', owner: `space-${e}` });
    const by = cy + 17;
    rect(c, 'marks', `space-track-${e}`, 'bar-track', x + 0.5, by, w - 1, 10, 2);
    rect(c, 'marks', `space-live-${e}`, 'bar-live', x, by, px, 10, 2);
    rect(c, 'marks', `space-over-${e}`, 'bar-over', x + px, by, (amp - 1) * px, 10, 0);
    c.D.mark({ x0: x, x1: x + w, y0: by, y1: by + 10 }, `space-${e}`);
    cy += 36;
  }
  const ay = cy - 4;
  const tx = x + px;
  line(c, 'grid', 'space-tick', 'tickmark', tx, ay, tx, ay + 4);
  const right = '1× · the live data alone';
  const left = 'the live data alone · 1×';
  const [t, anchor]: [string, Anchor] =
    tx + tw(right, 'small') <= x + w ? [right, 'start'] : tw(left, 'small') <= tx - x ? [left, 'end'] : ['1×', 'middle'];
  const box = text(c, 'space-tick-label', tx, ay + 15, small(t), { anchor, owner: 'cost-axis' });
  c.meta.tick = { at: r1(tx), anchor, x0: box.x0, x1: box.x1 };
  c.D.region('cost-space', { x: x - 6, y: y - 4, w: w + 12, h: 20 + 72 + 18 });
  return y + 20 + 72 + 14;
}

/** The lines the workload takes at this width: the longest form that fits in three, else the shortest. */
const premiseLines = (forms: readonly string[], width: number) =>
  pickLast(
    forms.map((t) => wrapKept(t, 'cap', width)),
    (ls) => ls.length <= 3,
  );

/**
 * The Storage Engines stage at width `W`: the title and workload, the two engines (side by side from 500 px, stacked
 * below), and under a rule what each pays. Its height depends on `W` alone: the workload reserves its longest form's
 * lines, and every block is fixed.
 */
export function buildStage(W: number, m: StorageScenario, view: StageView): Stage {
  const D = new Draw(W);
  const meta: StageMeta = {
    btRows: [],
    runs: [],
    writePx: 0,
    spacePx: 0,
    freeEdge: null,
    tick: null,
    panels: { two: false, pw: 0, x1: 0, x2: 0 },
    keys: [],
  };
  const c: Ctx = { D, hits: [], m, view, hid: view.hid, meta };
  const s = m.settings;
  const PAD = W < 300 ? 12 : 16;
  const two = W >= TWO_FROM;
  const GAP = 24;
  const full = W - 2 * PAD;
  const pw = two ? Math.floor((full - GAP) / 2) : full;
  const x1 = PAD;
  const x2 = two ? PAD + pw + GAP : PAD;
  meta.panels = { two, pw, x1, x2 };
  text(c, 'stage-title', PAD, 26, [[isWrite(s) ? 'One write, through both engines' : 'One lookup, through both engines', 'capB', 'ink']], {
    owner: 'title',
  });
  const reserve = Math.max(...ALL_PREMISES.map((f) => premiseLines(f, full).length));
  premiseLines(premise(s), full).forEach((t, i) => text(c, `premise-${i}`, PAD, 46 + i * 18, [[t, 'cap', 'muted']], { owner: 'title' }));
  let y = 46 + (reserve - 1) * 18 + 16;
  const hB = btreePanelHeight();
  const hL = lsmPanelHeight();
  let bottom: number;
  if (two) {
    btreePanel(c, x1, y, pw, hL - hB);
    lsmPanel(c, x2, y, pw);
    line(c, 'grid', 'panel-rule', 'vrule', PAD + pw + GAP / 2, y, PAD + pw + GAP / 2, y + hL);
    bottom = y + hL;
  } else {
    btreePanel(c, x1, y, pw, 0);
    const ry = y + hB + 16;
    line(c, 'grid', 'panel-rule', 'rule', 0, ry, W, ry);
    lsmPanel(c, x2, ry + 12, pw);
    bottom = ry + 12 + hL;
  }
  y = bottom + 16;
  line(c, 'grid', 'cost-rule', 'rule', 0, y, W, y);
  y += 10;
  const titles: Part[][] = [
    [
      ['What each engine pays', 'capB', 'ink'],
      [' · from the rough model under the stage', 'small', 'muted'],
    ],
    [
      ['What each engine pays', 'capB', 'ink'],
      [' · a rough model', 'small', 'muted'],
    ],
    [['What each engine pays', 'capB', 'ink']],
  ];
  text(c, 'cost-title', PAD, y + 14, pickLast(titles, partsFit(full - TAG_ROOM)), { owner: 'title' });
  y += 28;
  y = writeGroup(c, PAD, y, full) + 16;
  if (two) y = Math.max(readGroup(c, x1, y, pw), spaceGroup(c, x2, y, pw));
  else y = spaceGroup(c, PAD, readGroup(c, PAD, y, full) + 12, full);
  const H = Math.round(y + 12);
  return { D, H, hits: c.hits, focus: focusOutlines(D, c.hits, view.focus, H), summary: summary(m, view.hid), meta };
}

const GUTTER = 8;

/**
 * Each region's outline with its "Look here" tag. An outline takes in every text its region holds with 8 px to spare
 * and keeps 6 px from texts and 8 px from controls outside it. A tag sits only on the outline's stroke, its top or its
 * foot, 12 or 16 px off the corners and then along the edge, never on a label; a region with no place for one is
 * counted in `D.missing`.
 */
export function focusOutlines(D: Draw, hits: readonly Hit[], ids: readonly string[], H: number): (Focus & { region: string })[] {
  const out: (Focus & { region: string })[] = [];
  for (const id of ids)
    (D.regions[id] ?? []).forEach((b, k) => {
      const within = (t: Edge) => {
        const cx = (t.x0 + t.x1) / 2;
        const cy = (t.y0 + t.y1) / 2;
        return cx >= b.x && cx <= b.x + b.w && cy >= b.y && cy <= b.y + b.h;
      };
      const inside = new Set<Edge>(D.texts.filter(within));
      const grow = (a: Edge, t: Edge, d: number): Edge => ({
        x0: Math.min(a.x0, t.x0 - d),
        y0: Math.min(a.y0, t.y0 - d),
        x1: Math.max(a.x1, t.x1 + d),
        y1: Math.max(a.y1, t.y1 + d),
      });
      let box: Edge = { x0: b.x, y0: b.y, x1: b.x + b.w, y1: b.y + b.h };
      let core: Edge = { x0: b.x + 4, y0: b.y + 4, x1: b.x + b.w - 4, y1: b.y + b.h - 4 };
      for (const t of inside) {
        box = grow(box, t, GUTTER);
        core = grow(core, t, 3);
      }
      const controls = hits.map((h) => ({ x0: h.x, x1: h.x + h.w, y0: h.y, y1: h.y + h.h, control: true })).filter((h) => !within(h));
      const others: (Edge & { control?: boolean })[] = [...D.texts.filter((t) => !inside.has(t)), ...controls];
      const clash = (t: Edge & { control?: boolean }) => {
        const g = t.control ? GUTTER : 6;
        return !(t.x1 <= box.x0 - g || t.x0 >= box.x1 + g || t.y1 <= box.y0 - g || t.y0 >= box.y1 + g);
      };
      for (let round = 0; round < 8; round++) {
        const bad = others.filter((t) => !inside.has(t) && clash(t));
        if (!bad.length) break;
        for (const t of bad) {
          const g = (t.control ? GUTTER : 6) + 0.5;
          if (t.y0 >= core.y1 && t.y0 - g >= core.y1) box.y1 = Math.min(box.y1, t.y0 - g);
          else if (t.y1 <= core.y0 && t.y1 + g <= core.y0) box.y0 = Math.max(box.y0, t.y1 + g);
          else if (t.x0 >= core.x1 && t.x0 - g >= core.x1) box.x1 = Math.min(box.x1, t.x0 - g);
          else if (t.x1 <= core.x0 && t.x1 + g <= core.x0) box.x0 = Math.max(box.x0, t.x1 + g);
          else if (!t.control) {
            inside.add(t);
            box = grow(box, t, GUTTER);
            core = grow(core, t, 3);
          }
        }
      }
      const x = Math.max(3, box.x0);
      const y = Math.max(3, box.y0);
      const w = Math.min(D.W - 3, box.x1) - x;
      const h = Math.min(H - 3, box.y1) - y;
      const across: number[] = [];
      for (let ax = x + w - TAG.width - 16; ax >= x + 16; ax -= 8) across.push(ax);
      const xs = [x + w - TAG.width - 12, x + w - TAG.width - 16, x + 16, ...across];
      const tag = [y - TAG.height / 2, y + h - TAG.height / 2]
        .flatMap((ty) => xs.map((tx) => [tx, ty] as const))
        .find(
          ([tx, ty]) =>
            tx >= 3 &&
            tx + TAG.width <= D.W - 3 &&
            ty >= 3 &&
            ty + TAG.height <= H - 3 &&
            clear(D, { x0: tx, x1: tx + TAG.width, y0: ty, y1: ty + TAG.height }, 6),
        );
      if (!tag) D.missing.push(`a tag for ${id}`);
      const [tx, ty] = tag ?? [xs[0], y - TAG.height / 2];
      D.mark({ x0: tx, x1: tx + TAG.width, y0: ty, y1: ty + TAG.height }, 'look');
      out.push({ id: k ? `${id}${k}` : id, region: id, x: r1(x), y: r1(y), width: r1(w), height: r1(h), tag: { x: r1(tx), y: r1(ty) } });
    });
  return out;
}
