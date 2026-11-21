import {
  SHARD_K,
  SHARD_NAMES,
  SHARD_SETTINGS,
  SHARD_TURN,
  shardNum,
  shardPointAt,
  shardScenario,
  shardScenarios,
  type ShardScenario,
} from '@grasp/engine';
import { FALSE_CLAIMS } from './ring-claims.testing';
import type { Edge, Prim } from './latency-draw';
import { rel } from './ring-geometry';
import { REST_VIEW, buildStage, changedArcs, playMarks, reserves, type RingStage, type RingView } from './ring-layout';
import { EXPERIMENTS, experimentState, type ExpPhase } from './ring-views.testing';

const WIDTHS = [252, 270, 300, 322, 344, 360, 400, 460, 520, 580, 620, 700];
const SWEEP_MS = 300_000;
const ALL = shardScenarios();
const FRACS = [0.05, 0.3, 0.55, 0.8, 0.99];

const overlap = (a: Edge, b: Edge, by = 0) =>
  Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > by && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > by;
const share = (a: string, b: string) => !!a && !!b && a.split(' ').some((t) => b.split(' ').includes(t));
type Circle = Extract<Prim, { k: 'circle' }>;
const circles = (prims: readonly Prim[], re: RegExp) => prims.filter((p): p is Circle => p.k === 'circle' && re.test(p.cls));
const pos = (p: Circle) => [p.cx, p.cy] as const;

/** What a reader would see as broken, and what the words and marks would claim falsely. */
function faults(st: RingStage, sc: ShardScenario, view: RingView): string[] {
  const { D, H, meta } = st;
  const W = D.W;
  const out: string[] = D.missing.map((t) => `no room for "${t}"`);
  const texts = D.texts;
  const prims = D.prims();
  for (let i = 0; i < texts.length; i++) {
    const a = texts[i];
    if (a.x0 < -0.5 || a.x1 > W + 0.5 || a.y0 < 0 || a.y1 > H) out.push(`off-stage: "${a.s}"`);
    for (let j = i + 1; j < texts.length; j++) if (overlap(a, texts[j], 0.5)) out.push(`text on text: "${a.s}" / "${texts[j].s}"`);
  }
  const inside = (p: readonly number[], t: Edge) => p[0] > t.x0 + 0.5 && p[0] < t.x1 - 0.5 && p[1] > t.y0 + 0.5 && p[1] < t.y1 - 0.5;
  for (const l of D.links)
    for (const t of texts)
      if (!share(l.owner, t.owner) && !(t.ground && /axis|even|rule/.test(l.owner)) && l.points.some((p) => inside(p, t)))
        out.push(`line ${l.owner} through "${t.s}"`);
  for (const mk of D.marks)
    for (const t of texts) if (!share(t.owner, mk.owner) && overlap(mk, t, 0.5)) out.push(`text on mark ${mk.owner}: "${t.s}"`);
  // No text on a drawn dot, and no dot on a dot (a grid of 12 px cells keeps this linear).
  const dots = circles(prims, /\bdot\b/).filter((d) => !/\bfly\b/.test(d.cls));
  for (const t of texts) {
    if (/look/.test(t.owner)) continue;
    const d = dots.find((p) => p.cx + p.r > t.x0 && p.cx - p.r < t.x1 && p.cy + p.r > t.y0 && p.cy - p.r < t.y1);
    if (d) out.push(`text on a dot: "${t.s}" / ${d.id}`);
  }
  const grid = new Map<string, Circle[]>();
  for (const d of dots) {
    const [x, y] = pos(d);
    const gx = Math.floor(x / 12);
    const gy = Math.floor(y / 12);
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++)
        for (const e of grid.get(`${gx + dx},${gy + dy}`) ?? [])
          if (Math.hypot(x - e.cx, y - e.cy) < d.r + e.r - 0.01) out.push(`dot on dot: ${e.id} / ${d.id}`);
    const k = `${gx},${gy}`;
    grid.set(k, [...(grid.get(k) ?? []), d]);
    if (x - d.r < -0.5 || x + d.r > W + 0.5 || y - d.r < 0 || y + d.r > H) out.push(`dot off-stage: ${d.id}`);
  }
  // Point names in the strip keep 6 px apart.
  const names = texts.filter((t) => /\bxtick\b/.test(t.owner)).sort((a, b) => a.x0 - b.x0);
  for (const row of new Set(names.map((t) => Math.round(t.y0)))) {
    const inRow = names.filter((t) => Math.round(t.y0) === row);
    for (let i = 1; i < inRow.length; i++)
      if (inRow[i].x0 - inRow[i - 1].x1 < 5) out.push(`point names ${inRow[i - 1].s} and ${inRow[i].s} too close`);
  }
  // A name over another in the next row clears its glyph box, 1.3 em tall: over 3 px more than the edges drawn here.
  for (const a of names)
    for (const b of names)
      if (b.y0 > a.y0 && Math.min(a.x1, b.x1) > Math.max(a.x0, b.x0) && b.y0 - a.y1 < 3)
        out.push(`point names ${a.s} and ${b.s} touch across rows`);
  for (const t of texts) for (const g of FALSE_CLAIMS) if (g.test(t.s)) out.push(`false claim ${g}: "${t.s}"`);
  if (FALSE_CLAIMS.some((g) => g.test(st.summary))) out.push(`a false claim in the summary: "${st.summary}"`);

  const { frame, change, pile: P } = meta;
  const hid = view.hid;
  const live = !!frame && !frame.done;
  // Every key is drawn once on the ring and once in a pile or in flight; a pile's dots are its node's count.
  const ring = prims.filter((p) => p.k === 'circle' && /^k\d+$/.test(p.id));
  const piles = prims.filter((p) => p.k === 'circle' && /^p\d+$/.test(p.id));
  const flying = prims.filter((p) => p.k === 'circle' && /^f\d+$/.test(p.id));
  if (ring.length !== SHARD_K) out.push(`the ring draws ${ring.length} keys`);
  if (piles.length + flying.length !== SHARD_K) out.push(`the piles and flights draw ${piles.length + flying.length} keys`);
  if (!live)
    for (const m of sc.now.members) if (P.lists[m].length !== sc.now.counts[m]) out.push(`pile ${m} draws ${P.lists[m].length} keys`);
  // The hollow marks are exactly the landed moved keys, on the ring and the piles; none while hidden.
  const hollow = (list: readonly Prim[]) => list.filter((p) => /\bmoved\b/.test(p.cls)).length;
  const want = change && !hid.after ? (frame ? frame.landed : change.moved) : 0;
  if (hollow(ring) !== want || hollow(piles) !== want)
    out.push(`hollow keys: ring ${hollow(ring)}, piles ${hollow(piles)}, the model ${want}`);
  const tableHollow = prims.filter((p) => p.id.startsWith('col-dot-') && /\bmoved\b/.test(p.cls)).length;
  if (tableHollow !== meta.table.filter((t) => t.moved).length) out.push('the table hollows keys it does not count');
  if (hid.after && meta.table.some((t) => t.moved)) out.push('the table hollows a key while the answer plays');
  // Exactly the keys the clock says are flying are in flight, inside the pile area, clear of pile tops and the even line.
  const n = frame ? [...frame.stage.values()].filter((v) => v.st === 'fly').length : 0;
  if (flying.length !== n) out.push(`${flying.length} dots in flight for ${n} keys flying`);
  for (const f of meta.flights) {
    if (f.x < P.area.x0 - 1 || f.x > P.area.x1 + 1 || f.y < P.area.y0 || f.y > P.area.y1) out.push('a key flies outside the pile area');
    if (f.u < 0.15 || f.u > 0.85) continue;
    const col = SHARD_NAMES.find((m) => P.tops[m] !== undefined && f.x >= P.binX(m) && f.x < P.binX(m) + P.bw);
    if (col && f.y > P.tops[col] - 8) out.push(`a key in flight over ${col} ${(P.tops[col] - f.y).toFixed(1)} px over its top`);
    if (Math.abs(f.y - P.evenY) < 8) out.push('a key in flight on the even line');
  }
  // A pile's drawn level is its share on the scale within 1 px, the hot stack included.
  if (!live)
    for (const m of sc.now.members) {
      const shareOf = sc.settings.hot ? sc.traffic[m] / 10 : (100 * sc.now.counts[m]) / SHARD_K;
      const y = P.levelY(Math.min(200, shareOf * P.slotsPerPct));
      if (Math.abs(P.tops[m] - y) > 1.01) out.push(`pile ${m} drawn at ${P.tops[m].toFixed(1)} for its share at ${y.toFixed(1)}`);
    }
  if (P.evenY < P.pileTop) out.push('the even line leaves the pile area');
  // Every line in the pile area carries a label centered on it, and none runs within 12 px of the even label.
  const gutter = texts.filter((t) => /\bgutter\b/.test(t.owner));
  for (const ly of meta.lines)
    if (!gutter.some((b) => Math.abs((b.y0 + b.y1) / 2 - 1 - ly) <= 3.5)) out.push(`a line at ${ly} with no label`);
  for (const b of gutter)
    if (meta.lines.filter((ly) => Math.abs((b.y0 + b.y1) / 2 - 1 - ly) <= 3.5).length !== 1)
      out.push('a gutter label beside no line or two');
  const even = texts.find((t) => /\beven\b/.test(t.owner));
  for (const p of prims)
    if (p.k === 'line' && /gridline/.test(p.cls) && even && p.y1 > even.y0 - 12 && p.y1 < even.y1 + 12)
      out.push('a gridline within 12 px of the even label');
  // The headline is the model's count, the landed count mid-play, and never a number while hidden.
  if (change && !hid.after && !live && !meta.headline.startsWith(`${shardNum(change.moved)} `)) out.push(`the headline "${meta.headline}"`);
  if (change && !hid.after && live && !meta.headline.startsWith(`${shardNum(frame!.landed)} `))
    out.push(`the headline "${meta.headline}" mid-play`);
  if (hid.after && /\d/.test(meta.headline.split(' of ')[0])) out.push(`a count in the hidden headline "${meta.headline}"`);
  // The in and out rows add up to the headline on every frame.
  if (change && !hid.after) {
    const sum = (cells: Record<string, string>) => Object.values(cells).reduce((a, t) => a + Number(t.replace(/[^\d]/g, '') || 0), 0);
    const target = live ? frame!.landed : change.moved;
    if (sum(meta.inCells) !== target || sum(meta.outCells) !== target) out.push(`the in and out rows against ${target}`);
  }
  if (hid.after)
    for (const t of texts)
      if (t.owner.startsWith('cell-') && !/^(\?|down|left)$/.test(t.s)) out.push(`a table cell "${t.s}" while the answer plays`);
  // Dashed only for a hidden value; the landing ring never while the answer plays.
  if (prims.some((p) => p.id === 'hidden-box') !== (!!change && hid.after))
    out.push('a hidden box without a hidden count, or none with one');
  if (hid.after && prims.some((p) => /landing/.test(p.cls))) out.push('a landing ring while the answer plays');
  // The strip's caret and walk start at the followed key.
  if (meta.strip && meta.strip.walkX !== null && Math.abs(meta.strip.walkX - meta.strip.fx) > 1)
    out.push('the walk starts off the followed key');
  // Element counts are bounded by the stage, never by the points.
  if (prims.length > 760) out.push(`${prims.length} elements`);
  // Neighboring cells of a table row keep 6 px apart: the piles' table and the closer look's remainders.
  const rows = new Map<string, Edge[]>();
  for (const t of texts) {
    const row = /^cell-(\w+)-/.exec(t.owner)?.[1] ?? (/^m\d+$/.test(t.owner) ? t.owner : null);
    if (row) rows.set(row, [...(rows.get(row) ?? []), t]);
  }
  for (const [row, cells] of rows) {
    const sorted = [...cells].sort((a, b) => a.x0 - b.x0);
    for (let i = 1; i < sorted.length; i++)
      if (sorted[i].x0 - sorted[i - 1].x1 < 6) out.push(`cells of row ${row} ${(sorted[i].x0 - sorted[i - 1].x1).toFixed(1)} px apart`);
  }
  // The strip names every node it draws, and a gone node's point by its own letter; no node's name sits on a gone tick.
  if (sc.scheme === 'ring') {
    const ticks = prims.filter((p): p is Extract<Prim, { k: 'line' }> => p.k === 'line' && /^pt-\d+$/.test(p.id));
    const goneTicks = prims.filter((p): p is Extract<Prim, { k: 'line' }> => p.k === 'line' && p.id.startsWith('gone-tick-'));
    const named = new Set(texts.filter((t) => /\bxtick\b/.test(t.owner)).map((t) => t.s.split(':')[0]));
    const bands = prims.filter((p) => p.id.startsWith('lens-band-')).map((p) => p.id.slice(-1));
    for (const m of bands) if (!named.has(m)) out.push(`the strip draws ${m} and names it nowhere`);
    for (const g of goneTicks) if (!named.has(g.id.slice(-1))) out.push(`the gone point ${g.id.slice(-1)} has no name`);
    // A down or gone node keeps a struck tick at each of its points inside the window, magnified or whole.
    const win = meta.strip?.win;
    if (change && win)
      for (const m of change.left.filter((x) => !sc.now.members.includes(x))) {
        const inWindow = Array.from({ length: sc.now.points }, (_, j) => rel(shardPointAt(m, j) / SHARD_TURN, win.start)).filter(
          (a) => win.f >= 1 || a < win.f,
        ).length;
        const got = goneTicks.filter((g) => g.id.endsWith(`-${m}`)).length;
        if (got !== inWindow) out.push(`${got} gone ticks of ${m} for its ${inWindow} points in the window`);
      }
    for (const t of texts.filter((x) => /\barc\b/.test(x.owner)))
      for (const g of goneTicks)
        if (g.x1 > t.x0 - 3 && g.x1 < t.x1 + 3) out.push(`the name "${t.s}" sits on the gone tick of ${g.id.slice(-1)}`);
    // The walk ends on the point that owns the followed key, wrapping past 0 on the whole ring.
    const end = meta.strip?.walkEnd;
    if (end != null && !ticks.some((p) => Math.abs(p.x1 - end) < 1)) out.push(`the walk ends at ${end.toFixed(1)}, on no point`);
    // With more than one point a node the band is neutral, and only the arcs that changed owner take a color.
    const colored = prims.filter((p) => /^band-[A-F]$/.test(p.id));
    const changed = prims.filter((p) => p.id.startsWith('band-changed-'));
    const drawn = view.replace !== null && live ? null : frame && !frame.pointsIn && change ? change.before : sc.now;
    if (drawn && drawn.points > 1 && colored.length) out.push('a colored band with more than one point a node');
    if (drawn && drawn.points === 1 && !prims.some((p) => /^band-[A-F]$/.test(p.id))) out.push('one point a node and no colored band');
    const wantChanged =
      !!change && !hid.after && drawn === sc.now && sc.now.points > 1 && changedArcs(change.before, change.after).length > 0;
    if (changed.length && !wantChanged) out.push('changed arcs drawn with no change to show');
    if (!changed.length && wantChanged && !live) out.push('no changed arcs drawn for the change');
    // The of ring row follows the ring as drawn: the placement drawn, or a wait while a change of points plays.
    for (const t of texts.filter((x) => x.owner.startsWith('cell-ring-'))) {
      const m = t.owner.slice(-1);
      const tenths = drawn ? Math.round(drawn.ringShare[m] * 1000) : 0;
      const shown = t.s.includes('.') ? tenths / 10 : Math.round(tenths / 10);
      const ok = hid.after ? t.s === '?' : drawn ? Number(t.s.replace('%', '')) === shown : t.s === '…';
      if (!ok) out.push(`the of ring cell of ${m} reads "${t.s}" for the ring drawn`);
    }
  }
  return out;
}

const run = (W: number, sc: ShardScenario, view: RingView, label: string, heights: Map<number, Set<number>>, out: string[]) => {
  const st = buildStage(W, sc, view);
  (heights.get(W) ?? heights.set(W, new Set()).get(W)!).add(st.H);
  for (const f of faults(st, sc, view).slice(0, 4)) out.push(`${W} ${label}: ${f}`);
  return st;
};
/** The faults by kind, with the first case of each, so a broken rule reads as one line. */
const summarize = (out: string[]) => {
  const kinds = new Map<string, string>();
  for (const f of out) {
    const kind = f.replace(/^.*?: (?=[a-z])/, '').replace(/[\d.]+/g, '#');
    if (!kinds.has(kind))
      kinds.set(kind, `${f} (and ${out.filter((g) => g.replace(/^.*?: (?=[a-z])/, '').replace(/[\d.]+/g, '#') === kind).length - 1} more)`);
  }
  return [...kinds.values()];
};
const label = (s: object, from: readonly string[] | null, back = false) =>
  `${JSON.stringify(s)}${from ? ` ${back ? 'back' : 'from'} ${from.join('')}` : ''}`;

describe('the sharding stage', () => {
  it(
    'draws every scenario cleanly at 252, 322 and 620 px, with one height per width',
    () => {
      const out: string[] = [];
      const heights = new Map<number, Set<number>>();
      for (const W of [252, 322, 620])
        for (const { settings, from, back } of ALL)
          run(W, shardScenario(settings, from, back), REST_VIEW, label(settings, from, back), heights, out);
      expect(summarize(out)).toEqual([]);
      expect([...heights].map(([W, h]) => [W, [...h]])).toEqual([
        [252, [1057]],
        [322, [1063]],
        [620, [812]],
      ]);
    },
    SWEEP_MS,
  );

  it(
    'fits the ring and the piles in one phone screen over the piles, at every setting',
    () => {
      const out: string[] = [];
      for (const W of [252, 270, 288, 300, 322, 344, 360, 380, 400])
        for (const s of SHARD_SETTINGS) {
          const st = buildStage(W, shardScenario(s), REST_VIEW);
          const span = st.meta.pile.by + 26 - st.D.regions['ring'][0].y;
          if (span > (W < 300 ? 470 : 510))
            out.push(`${W} ${JSON.stringify(s)}: the ring top to the pile letters is ${span.toFixed(0)} px`);
        }
      expect(out).toEqual([]);
    },
    SWEEP_MS,
  );

  it(
    'plays every change cleanly at strides of every width, with the play keeping the rest height',
    () => {
      const out: string[] = [];
      const heights = new Map<number, Set<number>>();
      WIDTHS.forEach((W, k) => {
        for (let i = k % 7; i < ALL.length; i += 7) {
          const { settings, from, back } = ALL[i];
          const sc = shardScenario(settings, from, back);
          run(W, sc, REST_VIEW, label(settings, from, back), heights, out);
          if (sc.change)
            for (const frac of FRACS) run(W, sc, { ...REST_VIEW, frac }, `${label(settings, from, back)} at ${frac}`, heights, out);
        }
      });
      // A change of points plays once too.
      for (const W of [252, 620]) {
        const sc = shardScenario({ scheme: 0, points: 1, nodes: 4, hot: 0, split: 0, down: 0 });
        for (const frac of FRACS) run(W, sc, { ...REST_VIEW, frac, replace: 100 }, `replace at ${frac}`, heights, out);
      }
      expect(summarize(out)).toEqual([]);
      for (const [W, h] of heights) expect([W, h.size]).toEqual([W, 1]);
    },
    SWEEP_MS,
  );

  it('draws the keys in flight and the hand apart, every frame, exactly where the stage would draw them', () => {
    const sc = shardScenario({ scheme: 1, points: 100, nodes: 6, hot: 1, split: 1, down: 0 }, ['A', 'B', 'C']);
    for (const frac of FRACS) {
      const whole = buildStage(620, sc, { ...REST_VIEW, frac }).D.prims();
      const apart = buildStage(620, sc, { ...REST_VIEW, frac, flightsApart: true });
      const moving = playMarks(apart, frac);
      const pick = (list: readonly Prim[]) =>
        list
          .filter((p) => /^f\d+$|^sweep$/.test(p.id))
          .map((p) => JSON.stringify(p, Object.keys(p).sort()))
          .sort();
      expect(apart.D.prims().filter((p) => /^f\d+$|^sweep$/.test(p.id))).toEqual([]);
      expect(pick(moving)).toEqual(pick(whole));
    }
  });

  it(
    'asks, plays and reveals every experiment cleanly at 12 widths, a tag on every region a reveal points at',
    () => {
      const out: string[] = [];
      const heights = new Map<number, Set<number>>();
      for (const W of WIDTHS)
        for (const spec of EXPERIMENTS) {
          const phases: [ExpPhase, number?][] = spec.goal
            ? [['start'], ['met']]
            : [['asking'], ['playing', 0.05], ['playing', 0.3], ['playing', 0.6], ['playing', 0.99], ['revealed']];
          for (const [phase, frac] of phases) {
            const { sc, view } = experimentState(spec, phase, frac);
            const st = run(W, sc, view, `${spec.id} ${phase}${frac ?? ''}`, heights, out);
            if (st.focus.length !== view.focus.length)
              out.push(`${W} ${spec.id}: ${st.focus.length} outlines for ${view.focus.length} regions`);
          }
        }
      expect(summarize(out)).toEqual([]);
      for (const [W, h] of heights) expect([W, h.size]).toEqual([W, 1]);
    },
    SWEEP_MS,
  );

  it(
    'reserves the lines of the longest words any scenario says, from a few scenarios that stand for all',
    () => {
      for (let W = 248; W <= 720; W += 4) {
        const inner = W - 2 * (W < 420 ? 12 : 16);
        expect(reserves(inner, W < 324), `${W}`).toEqual(reserves(inner, W < 324, true));
      }
    },
    SWEEP_MS,
  );
});
