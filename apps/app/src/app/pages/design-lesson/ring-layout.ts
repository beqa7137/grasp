import {
  SHARD_FOLLOW,
  SHARD_HOT_PCT,
  SHARD_K,
  SHARD_KEY_NAMES,
  SHARD_NAMES,
  SHARD_PLAY,
  SHARD_SALTS,
  SHARD_TURN,
  shardDiff,
  shardFrame,
  shardNum,
  shardPlace,
  shardPointAt,
  shardPointFor,
  shardScenario,
  shardScenarios,
  shardTakeoff,
  type ShardDiff,
  type ShardFrame,
  type ShardPlacement,
  type ShardScenario,
} from '@grasp/engine';
import type { Focus } from './focus-layout';
import { Draw, focusOutlines, pick, r1, sampleLine, tw, type Part, type Prim } from './latency-draw';
import { HOT_ID, TAU, lensWindow, polar, positionsOf, ringSwarm, saltId, wrap } from './ring-geometry';
import { drawLens, type Lens } from './ring-lens';
import { drawPiles, flightAt } from './ring-piles';
import {
  VERDICT,
  changeLabel as changeLabelText,
  changeStory,
  ruleHashOnly,
  rule,
  standing,
  stageSummary,
  type Hid,
  type QuestionPhase,
} from './ring-words';

export { HOT_SLOTS, MAX_SLOTS } from './ring-piles';

export const NARROW_BELOW = 324;
/** The ring's width over the piles: with them it fits a phone's screen. */
const ONE_COLUMN_RING = 270;

export interface RingView {
  hid: Hid;
  phase: QuestionPhase | 'challenge';
  /** A play's clock from 0 to 1, or null at rest. */
  frac: number | null;
  /** A change of points playing once: the points before it. */
  replace: number | null;
  /** The challenge's goal holds. */
  met: boolean;
  focus: readonly string[];
  /** An open question's setup, for the summary while its answer plays. */
  setup: ShardScenario | null;
  /** The piles that gained keys, ringed for a moment as a play lands. */
  landing: readonly string[];
  /** The keys in flight and the sweeping hand are drawn apart, on the play's every frame (`playMarks`). */
  flightsApart?: boolean;
}
export const REST_VIEW: RingView = {
  hid: { after: false, ghost: false, any: false },
  phase: 'rest',
  frac: null,
  replace: null,
  met: false,
  focus: [],
  setup: null,
  landing: [],
};

/** What a change of points does to every key: placed afresh, each key whose owner differs flies once. */
export const replayOf = (sc: ShardScenario, points: number): ShardDiff | null =>
  sc.scheme === 'ring' && points !== sc.settings.points ? shardDiff(shardPlace('ring', points, sc.now.members), sc.now) : null;

export interface FlightPath {
  x0: number;
  y0: number;
  x1: number;
  y1: number;
  apex: number;
  /** The pile area's top, which the flight keeps under. */
  top: number;
}
export interface Flight {
  key: number;
  x: number;
  y: number;
  u: number;
  from: string;
  to: string;
  path: FlightPath;
  /** Its lift-off on the play's clock, and the dot's radius. */
  t0: number;
  r: number;
}
export interface PileMeta {
  c: number;
  p: number;
  r: number;
  by: number;
  pileTop: number;
  bw: number;
  binX: (m: string) => number;
  levelY: (slots: number) => number;
  slotsPerPct: number;
  evenY: number;
  lists: Record<string, number[]>;
  tops: Record<string, number>;
  area: { x0: number; x1: number; y0: number; y1: number };
}
export interface RingStage {
  D: Draw;
  H: number;
  summary: string;
  focus: (Focus & { region: string })[];
  /** Replay's place. */
  play: { x: number; y: number };
  meta: {
    change: ShardDiff | null;
    play: ShardDiff | null;
    frame: ShardFrame | null;
    pile: PileMeta;
    flights: Flight[];
    lines: number[];
    table: { key: number; pending: boolean; moved: boolean }[];
    strip: Lens['strip'];
    /** The sweeping hand's center and its inner and outer radius. */
    hand: { cx: number; cy: number; r0: number; r1: number };
    /** The headline's count, as drawn. */
    headline: string;
    inCells: Record<string, string>;
    outCells: Record<string, string>;
  };
}

const nodeCls = (m: string) => `n${m}`;
const NEUTRAL = 'neutral';
const CHANGED = 'changed-';

/** A placement's arcs as shares of the turn, each ending at its owner's point; the one across 0 ends past 1. */
function ringArcs(p: ShardPlacement): [number, number, string][] {
  const ring = p.ring!;
  return ring.map((pt, i) => {
    const a0 = ring[(i - 1 + ring.length) % ring.length].at / SHARD_TURN;
    const a1 = pt.at / SHARD_TURN;
    return [a0, a1 <= a0 ? a1 + 1 : a1, pt.node];
  });
}

/** The stretches of the ring whose owner differs between two placements, with the owner after. */
export function changedArcs(before: ShardPlacement, after: ShardPlacement): [number, number, string][] {
  const cuts = [...new Set([...before.ring!, ...after.ring!].map((p) => p.at))].sort((a, b) => a - b);
  const out: [number, number, string][] = [];
  cuts.forEach((at, i) => {
    const next = i + 1 < cuts.length ? cuts[i + 1] : cuts[0] + SHARD_TURN;
    const mid = ((at + next) / 2) % SHARD_TURN;
    const was = shardPointFor(before.ring!, mid).node;
    const now = shardPointFor(after.ring!, mid).node;
    if (was === now) return;
    const last = out[out.length - 1];
    if (last && last[2] === now && Math.abs(last[1] - at / SHARD_TURN) < 1e-12) last[1] = next / SHARD_TURN;
    else out.push([at / SHARD_TURN, next / SHARD_TURN, now]);
  });
  return out;
}

/**
 * The marks a play moves on its every frame, drawn apart from the stage it rebuilds a few times a second: each key in
 * flight where its own clock has it, and the sweeping hand.
 */
export function playMarks(st: RingStage, frac: number): Prim[] {
  const out: Prim[] = [];
  const { sweep0, sweep1, flight } = SHARD_PLAY;
  if (frac >= sweep0 && frac <= sweep1) {
    const { cx, cy, r0, r1: rOut } = st.meta.hand;
    const a = (frac - sweep0) / (sweep1 - sweep0);
    const [ix, iy] = polar(cx, cy, r0, a);
    const [hx, hy] = polar(cx, cy, rOut, a);
    out.push({ id: 'sweep', k: 'line', cls: 'sweep', x1: r1(ix), y1: r1(iy), x2: r1(hx), y2: r1(hy) });
  }
  for (const f of st.meta.flights) {
    const [x, y] = flightAt(f.path, Math.max(0, (frac - f.t0) / flight));
    out.push({ id: `f${f.key}`, k: 'circle', cls: `dot key fly ${nodeCls(f.to)}`, cx: r1(x), cy: r1(y), r: f.r });
  }
  return out;
}
const LABEL = (t: string) => t.toUpperCase().replace(/USER:(\d+|HOT)/g, (m) => m.toLowerCase());

/** The most lines the last change block and the rule line take at a width, over every scenario and phase. */
export interface Reserves {
  verdict: number;
  rule: number;
}
const restWords = (sc: ShardScenario, narrow: boolean) => ({
  story: sc.change ? changeStory(sc, { hot: !narrow, short: narrow }) : [VERDICT.free],
  standing: standing(sc, { hotLine: !narrow }),
});
const ruleText = (sc: ShardScenario, hashOnly: boolean, width: number) => {
  if (hashOnly) return ruleHashOnly(sc.scheme === 'ring');
  const long = rule(sc, false);
  return wrap(long, 'cap', width).length <= 2 ? long : rule(sc, true);
};
/** The scenarios that take the most lines at some width (ring-layout.spec holds the list to a scan of all 456). */
export const RESERVE_SCENARIOS: readonly string[] = [
  '0103000ABCD',
  '013000-',
  '013000ABCDEF',
  '013000BC+',
  '013001-',
  '013101-',
  '014101-',
  '015101-',
  '11003000AB',
  '11003000BC+',
  '11003001-',
  '11003100BC+',
  '11003110ABCDEF',
  '11004101-',
  '11005000ABC',
  '11006000ABC',
  '11006100ABC',
  '11006110ABC',
];
const scenarioId = (s: ShardScenario['settings'], from: readonly string[] | null, back = false) =>
  `${s.scheme}${s.points}${s.nodes}${s.hot}${s.split}${s.down}${from ? from.join('') : '-'}${back ? '+' : ''}`;
export const reserveScenarios = (all = false) =>
  shardScenarios().filter(({ settings, from, back }) => all || RESERVE_SCENARIOS.includes(scenarioId(settings, from, back)));
export const reserveId = scenarioId;
const reserveCache = new Map<string, Reserves>();
export function reserves(width: number, narrow: boolean, all = false): Reserves {
  const id = `${width}|${narrow}|${all}`;
  const hit = reserveCache.get(id);
  if (hit) return hit;
  const lines = (t: string) => wrap(t, 'cap', width).length;
  const fixed = Math.max(
    lines(VERDICT.playing(56)),
    lines(VERDICT.replacePlaying),
    lines(VERDICT.replaceHidden),
    lines(VERDICT.hiddenStory),
  );
  let verdict = fixed + lines(VERDICT.hiddenStanding(true));
  let ruleLines = Math.max(lines(ruleHashOnly(true)), lines(ruleHashOnly(false)));
  for (const { settings, from, back } of reserveScenarios(all)) {
    const sc = shardScenario(settings, from, back);
    const w = restWords(sc, narrow);
    const st = w.story.reduce((a, l) => a + lines(l), 0);
    const stand = lines(w.standing);
    verdict = Math.max(
      verdict,
      Math.max(st, lines(VERDICT.playing(56)), sc.change ? 0 : lines(VERDICT.replacePlaying)) + stand,
      lines(VERDICT.ask) + stand,
    );
    ruleLines = Math.max(ruleLines, lines(ruleText(sc, false, width)));
  }
  const out = { verdict, rule: ruleLines };
  reserveCache.set(id, out);
  return out;
}

/**
 * The Sharding stage at a width, for a scenario and a view: header, the ring of hashes, what each node holds, the last
 * change and a closer look. Its height depends only on its width; a play's frame draws each key where the clock has it.
 */
export function buildStage(W: number, sc: ShardScenario, view: RingView): RingStage {
  const D = new Draw(W);
  const hid = view.hid;
  const s = sc.settings;
  const c = hid.ghost ? null : sc.change;
  // A change of points is no change of the node set, but it plays once: each key whose owner differs flies.
  const replay = !c && view.replace !== null && view.frac !== null ? replayOf(sc, view.replace) : null;
  const play = c ?? replay;
  const frame = play && view.frac !== null ? shardFrame(play.moves, view.frac) : null;
  const live = !!frame && !frame.done;
  const pad = W < 420 ? 12 : 16;
  const inner = W - 2 * pad;
  const two = W >= 600;
  const ringMode = sc.scheme === 'ring';
  const narrow = W < NARROW_BELOW;
  const at = positionsOf();
  // The placement the ring and the strip draw: the one before the change until its points move.
  const placed: ShardPlacement = frame && !frame.pointsIn && !replay && c ? c.before : sc.now;
  const ownerNow = (key: number) => {
    const st = frame?.stage.get(key);
    return st && st.st === 'src' ? st.from : sc.now.owners[key];
  };
  const showMoved = !!c && !hid.after;
  const movedSet = new Map((play?.moves ?? []).map((m) => [m.key, m]));
  const landedKey = (key: number) => movedSet.has(key) && (!frame || frame.stage.get(key)!.st === 'dst');

  // ----- Header: Replay, the title, the key.
  const title = D.text('title', pad + 44, 29, [[`Where ${shardNum(SHARD_K)} keys live`, 'capB']], { owner: 'title' });
  const kr = two ? 2.2 : 2;
  const tenth = `${SHARD_HOT_PCT / SHARD_SALTS}%`;
  const legend: [string, string][] = [
    ["a key, in its node's color", 'a key'],
    ['moved in the last change', 'moved last'],
    [s.split ? `a tenth of the hot key, ${tenth}` : 'the hot key', s.split ? `a tenth, ${tenth}` : 'hot key'],
  ];
  const widestHot = [`a tenth of the hot key, ${tenth}`, `a tenth, ${tenth}`];
  const itemW = (t: string) => 2 * kr + 6 + tw(t, 'small');
  const legendW = (k: number) => itemW(legend[0][k]) + 14 + itemW(legend[1][k]) + 14 + 8 + 6 + tw(widestHot[k], 'small') - 2 * kr;
  let y = 46;
  const sameRow = title.x1 + 20 + legendW(0) <= W - pad;
  const lk = sameRow || legendW(0) <= inner ? 0 : 1;
  const ly = sameRow ? 29 : y + 12;
  let lx = sameRow ? W - pad - legendW(lk) : pad;
  const keyDot = (x: number, moved: boolean, id: string) => {
    D.add('marks', id, { k: 'circle', cls: `legend-key${moved ? ' moved' : ''}`, cx: r1(x + kr), cy: ly - 4, r: moved ? kr - 0.5 : kr });
    D.mark({ x0: x - 2, x1: x + 2 * kr + 2, y0: ly - 4 - kr - 2, y1: ly - 4 + kr + 2 }, 'legend');
  };
  keyDot(lx, false, 'legend-key');
  lx += 2 * kr + 6;
  lx = D.text('legend-0', lx, ly, [[legend[0][lk], 'small']], { owner: 'legend' }).x1 + 14;
  keyDot(lx, true, 'legend-moved');
  lx = D.text('legend-1', lx + 2 * kr + 6, ly, [[legend[1][lk], 'small']], { owner: 'legend' }).x1 + 14;
  if (s.hot) {
    D.add('marks', 'legend-hot', { k: 'rect', cls: 'hot-block', x: r1(lx), y: ly - 7, w: 8, h: 6, rx: 1 });
    D.mark({ x0: lx - 1, x1: lx + 9, y0: ly - 8, y1: ly }, 'legend');
    D.text('hot-legend', lx + 14, ly, [[legend[2][lk], 'small']], { owner: 'legend' });
  }
  if (!sameRow) y += 22;
  y += 6;

  // ----- The ring: every key at its hash, and who owns each stretch.
  const ringW = two ? 284 : Math.min(inner, ONE_COLUMN_RING);
  const ringX = two ? pad : pad + (inner - ringW) / 2;
  const ringY = y;
  const rMax = ringW / 2 - 10;
  const dr = ringW >= 280 ? 1.8 : two ? 1.7 : 1.5;
  const sw = ringSwarm(rMax, dr);
  const cx = ringX + ringW / 2;
  const cy = ringY + 18 + 14 + 6 + rMax;
  const ringH = 18 + 14 + 6 + 2 * rMax + 8;
  const ringTitle = ringMode
    ? pick(
        ['The ring · a key belongs to the next point clockwise', 'The ring of hashes, clockwise from 0', 'The ring of hashes'],
        (t) => tw(LABEL(t), 'label') <= (two ? ringW + 2 : inner),
      )
    : pick(
        [`Keys by hash · node = hash mod ${placed.members.length}`, 'Keys by hash'],
        (t) => tw(LABEL(t), 'label') <= (two ? ringW : inner),
      );
  D.text('ring-title', two ? ringX : pad, ringY + 11, [[LABEL(ringTitle ?? 'The ring'), 'label']], { owner: 'ring-title' });
  if (ringMode) {
    const paths: Record<string, string[]> = {};
    const arc = (key: string, a0: number, a1: number, lo: number, hi: number) => {
      for (const off of [-1, 0]) {
        const b0 = Math.max(a0 + off, lo);
        const b1 = Math.min(a1 + off, hi);
        if (b1 - b0 < 1e-6) continue;
        const [x0, y0] = polar(cx, cy, sw.rb, b0);
        const [x1, y1] = polar(cx, cy, sw.rb, b1);
        (paths[key] ??= []).push(
          `M${x0.toFixed(2)} ${y0.toFixed(2)}A${sw.rb} ${sw.rb} 0 ${b1 - b0 > 0.5 ? 1 : 0} 1 ${x1.toFixed(2)} ${y1.toFixed(2)}`,
        );
      }
    };
    // One point a node draws each node's arcs in its color; with more points the arcs are too many to read, so the
    // band is neutral and only the arcs that changed owner in the last change take their new owner's color.
    const arcs = (p: ShardPlacement, lo: number, hi: number) =>
      ringArcs(p).forEach(([a0, a1, node]) => arc(p.points === 1 ? node : NEUTRAL, a0, a1, lo, hi));
    const hand = live ? (frame.sweep ?? (frame.frac < SHARD_PLAY.sweep0 ? 0 : 1)) : 1;
    if (replay && live) {
      arcs(replay.after, 0, hand);
      arcs(replay.before, hand, 1);
    } else arcs(placed, 0, 1);
    if (c && showMoved && placed === sc.now && sc.now.points > 1)
      for (const [a0, a1, node] of changedArcs(c.before, c.after)) arc(`${CHANGED}${node}`, a0, a1, 0, hand);
    // One path a kind, so the band is at most a dozen elements however many points there are.
    if (paths[NEUTRAL]) D.add('marks', 'band-neutral', { k: 'path', cls: 'band neutral', d: paths[NEUTRAL].join('') });
    for (const m of SHARD_NAMES) if (paths[m]) D.add('marks', `band-${m}`, { k: 'path', cls: `band ${nodeCls(m)}`, d: paths[m].join('') });
    for (const m of SHARD_NAMES)
      if (paths[`${CHANGED}${m}`])
        D.add('marks', `band-changed-${m}`, { k: 'path', cls: `band changed ${nodeCls(m)}`, d: paths[`${CHANGED}${m}`].join('') });
  } else D.add('marks', 'track', { k: 'circle', cls: 'track', cx, cy, r: sw.rb });
  const zr = sw.outer + 2;
  D.add('marks', 'zero', { k: 'line', cls: 'zero', x1: cx, y1: r1(cy - sw.rb - (ringMode ? 4 : 1)), x2: cx, y2: r1(cy - zr - 5) });
  D.link(sampleLine(cx, cy - sw.rb - 4, cx, cy - zr - 5, 2), 'zero');
  D.text('zero-label', cx, cy - zr - 8, [['0', 'mono', 'muted']], { anchor: 'middle', owner: 'zero' });
  if (ringMode) {
    const ar = sw.rb - 11;
    const [ax0, ay0] = polar(cx, cy, ar, 0.985);
    const [ax1, ay1] = polar(cx, cy, ar, 0.07);
    const [hx, hy] = polar(cx, cy, ar - 4, 0.058);
    const [hx2, hy2] = polar(cx, cy, ar + 4.5, 0.052);
    D.add('marks', 'arrow', {
      k: 'path',
      cls: 'arrow',
      d: `M${r1(ax0)} ${r1(ay0)}A${ar} ${ar} 0 0 1 ${r1(ax1)} ${r1(ay1)}M${r1(hx)} ${r1(hy)}L${r1(ax1)} ${r1(ay1)}L${r1(hx2)} ${r1(hy2)}`,
    });
    D.mark({ x0: ax0 - 2, x1: ax1 + 3, y0: ay0 - 3, y1: ay1 + 3 }, 'cw');
  }
  const ringDots: [number, number, number][] = [];
  for (let i = 0; i < SHARD_K; i++) {
    const p = sw.pos[i];
    const [x, yy] = polar(cx, cy, p.rad, p.a);
    const moved = showMoved && landedKey(i);
    ringDots.push([x, yy, dr]);
    D.add('dots', `k${i}`, {
      k: 'circle',
      cls: `dot key ${nodeCls(ownerNow(i))}${moved ? ' moved' : ''}`,
      cx: r1(x),
      cy: r1(yy),
      r: moved ? dr - 0.5 : dr,
    });
  }
  const hotIds = s.hot ? (s.split ? Array.from({ length: SHARD_SALTS }, (_, j) => saltId(j)) : [HOT_ID]) : [];
  for (const i of hotIds) {
    const p = sw.pos[i];
    const [x, yy] = polar(cx, cy, p.rad, p.a);
    ringDots.push([x, yy, dr]);
    D.add('dots', `h${i}`, { k: 'circle', cls: 'dot hot', cx: r1(x), cy: r1(yy), r: dr });
  }
  // The band and its dots as marks: an annulus in 48 sectors, so the ring's corners and its middle stay free.
  for (let k = 0; k < 48; k++) {
    const pts = [k / 48, (k + 1) / 48].flatMap((a) => [polar(cx, cy, sw.rb - 5, a), polar(cx, cy, sw.outer + 1, a)]);
    D.mark(
      {
        x0: Math.min(...pts.map((p) => p[0])),
        x1: Math.max(...pts.map((p) => p[0])),
        y0: Math.min(...pts.map((p) => p[1])),
        y1: Math.max(...pts.map((p) => p[1])),
      },
      'ring-disc',
    );
  }
  // One point a node: each point named where it sits; a node that left or failed keeps a grey chip there.
  if (ringMode && s.points === 1) {
    const chips: [number, number, number][] = [];
    const gone = c ? c.left : [];
    const names = [...placed.members, ...gone.filter((m) => !placed.members.includes(m))];
    for (const m of names.sort((a, b) => shardPointAt(a, 0) - shardPointAt(b, 0))) {
      const a = shardPointAt(m, 0) / SHARD_TURN;
      const rad = sw.rb - 18;
      let p = polar(cx, cy, rad, a);
      const near = chips.find((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 30);
      if (near) {
        const dir = Math.sign(a - near[2]) || 1;
        for (let k = 1; k <= 60 && chips.some((q) => Math.hypot(q[0] - p[0], q[1] - p[1]) < 30); k++)
          p = polar(cx, cy, rad, a + (dir * k * 1.5) / (TAU * rad));
      }
      chips.push([p[0], p[1], a]);
      const out = gone.includes(m);
      const [tx, ty] = polar(cx, cy, sw.rb - 4, a);
      const dd = Math.hypot(tx - p[0], ty - p[1]);
      const [ux, uy] = [p[0] + ((tx - p[0]) * 8) / dd, p[1] + ((ty - p[1]) * 8) / dd];
      D.add('links', `chip-tick-${m}`, { k: 'line', cls: 'pt-tick', x1: r1(tx), y1: r1(ty), x2: r1(ux), y2: r1(uy) });
      const hw = out ? 13 : 8;
      D.add('marks', `chip-${m}`, {
        k: 'rect',
        cls: `chip-pt ${out ? 'gone' : nodeCls(m)}`,
        x: r1(p[0] - hw),
        y: r1(p[1] - 8),
        w: 2 * hw,
        h: 16,
        rx: 8,
      });
      D.text(`chip-name-${m}`, out ? p[0] - 4 : p[0], p[1] + 4, [[m, 'mono', out ? 'muted' : '']], {
        anchor: 'middle',
        owner: `chip${m} ring-disc`,
        cls: 'on-chip',
      });
      if (out)
        D.add('marks', `chip-x-${m}`, {
          k: 'path',
          cls: 'xmark thin',
          d: `M${r1(p[0] + 2.5)} ${r1(p[1] - 3)}l6 6M${r1(p[0] + 8.5)} ${r1(p[1] - 3)}l-6 6`,
        });
      D.mark({ x0: p[0] - hw, x1: p[0] + hw, y0: p[1] - 8, y1: p[1] + 8 }, `chip${m}`);
    }
  }
  {
    const n = placed.members.length;
    const l1 = `${n} nodes${sc.downNode && placed.members.length < sc.names.length ? ' up' : ''}`;
    const l2 = ringMode ? `${shardNum(s.points)} ${s.points === 1 ? 'point' : 'points'} each` : `hash mod ${n}`;
    D.place('centre-1', [[cx, cy - 1, 'middle']], [[l1, 'capB']], { owner: 'centre', optional: true });
    D.place('centre-2', [[cx, cy + 14, 'middle']], [[l2, 'small']], { owner: 'centre', optional: true });
  }
  // The stretch the strip magnifies, bracketed outside the dots; the followed key under a caret.
  const stripW = inner - 8;
  const lensPlaced = replay && live && frame.frac < shardTakeoff(SHARD_FOLLOW) ? replay.before : sc.now;
  const win = lensWindow(ringMode ? lensPlaced.points : s.points, stripW);
  const fa = at[SHARD_FOLLOW];
  const fp = sw.pos[SHARD_FOLLOW];
  if (ringMode && win.f < 1) {
    const br = sw.outer + 4;
    const a0 = win.start;
    const a1 = win.start + win.f;
    const [bx0, by0] = polar(cx, cy, br, a0);
    const [bx1, by1] = polar(cx, cy, br, a1);
    const [cx0, cy0] = polar(cx, cy, br - 4, a0);
    const [cx1, cy1] = polar(cx, cy, br - 4, a1);
    const bpts: [number, number][] = [];
    for (let t = 0; t <= 1.0001; t += 0.02) bpts.push(polar(cx, cy, br, a0 + win.f * t));
    D.link(bpts, 'bracket');
    D.add('marks', 'bracket', {
      k: 'path',
      cls: 'bracket',
      d: `M${r1(cx0)} ${r1(cy0)}L${r1(bx0)} ${r1(by0)}A${br} ${br} 0 ${win.f > 0.5 ? 1 : 0} 1 ${r1(bx1)} ${r1(by1)}L${r1(cx1)} ${r1(cy1)}`,
    });
  }
  {
    const far = ringMode && win.f < 1 ? sw.outer + 4 + 6 : fp.rad + dr + 3;
    const [px, py] = polar(cx, cy, far, fa);
    const [qx, qy] = polar(cx, cy, far + 7, fa - 0.012);
    const [rx, ry] = polar(cx, cy, far + 7, fa + 0.012);
    D.add('marks', 'caret', { k: 'path', cls: 'caret', d: `M${r1(px)} ${r1(py)}L${r1(qx)} ${r1(qy)}L${r1(rx)} ${r1(ry)}Z` });
    D.mark(
      { x0: Math.min(px, qx, rx) - 1, x1: Math.max(px, qx, rx) + 1, y0: Math.min(py, qy, ry) - 1, y1: Math.max(py, qy, ry) + 1 },
      'follow',
    );
    const [lx0, ly0] = polar(cx, cy, far + 12, fa);
    const near: [number, number, 'start' | 'middle' | 'end'][] = [];
    for (const d of [12, 16, 20, 26])
      for (const da of [0, -0.015, 0.015, -0.03, 0.03]) {
        const [nx, ny] = polar(cx, cy, far + d, fa + da);
        near.push([nx, ny + 4, nx < cx - 8 ? 'end' : nx > cx + 8 ? 'start' : 'middle']);
      }
    const x0 = two ? ringX + 2 : pad;
    const name = SHARD_KEY_NAMES[SHARD_FOLLOW];
    const cands: [number, number, ('start' | 'middle' | 'end')?][] = [
      ...near,
      ...[0, -8, 8, -16, 16, -24, 24, -32, -40, -48].map((dy) => [x0, py + 4 + dy, 'start'] as [number, number, 'start']),
      [lx0 - 2, ly0 + 9, 'end'],
      [lx0 + 4, ly0 + 12, 'end'],
      [ringX + 2, ly0 + 12, 'start'],
      [ringX + 2, cy + rMax + 4, 'start'],
      [lx0, ly0 + 14, 'middle'],
    ];
    const minX = (two ? ringX : pad) - 2;
    const maxX = two ? ringX + ringW : W - pad;
    const clearOfDots = (b: { x0: number; x1: number; y0: number; y1: number }) =>
      !ringDots.some(([dx, dy, rr]) => dx + rr + 2 > b.x0 && dx - rr - 2 < b.x1 && dy + rr + 2 > b.y0 && dy - rr - 2 < b.y1);
    D.place('follow-name', cands, [[name, 'mono']], { owner: 'follow ring-disc', ignore: 'follow ring-disc', minX, maxX, ok: clearOfDots });
  }
  if (frame && frame.sweep !== null && !view.flightsApart) {
    const [hx, hy] = polar(cx, cy, sw.outer + 2, frame.sweep);
    const [ix, iy] = polar(cx, cy, sw.rb - 6, frame.sweep);
    D.add('top', 'sweep', { k: 'line', cls: 'sweep', x1: r1(ix), y1: r1(iy), x2: r1(hx), y2: r1(hy) });
  }
  D.region('ring', { x: (two ? ringX : pad) - 4, y: ringY - 4, w: (two ? ringW : inner) + 8, h: ringH + 4 });

  const piles = drawPiles(D, {
    sc,
    view,
    c,
    play,
    frame,
    live,
    movedSet,
    showMoved,
    two,
    pad,
    inner,
    ringW,
    ringY,
    ringH,
    placed,
    at,
    replay: !!replay,
  });
  const { pile, by, pileTop, bw, binX, levelY, slotsPerPct, evenY, lists, tops, area, flights, lines, inCells, outCells } = piles;
  y = Math.max(ringY + (two ? ringH : 0), piles.binsY + piles.binsH) + 12;

  // ----- The last change, in the model's exact counts; the stage's spare height collects once, at its foot.
  D.add('grid', 'rule-1', { k: 'line', cls: 'rule', x1: pad, y1: y, x2: W - pad, y2: y });
  const vY = y + 12;
  const res = reserves(inner, narrow);
  D.text('verdict-label', pad, vY + 11, [[LABEL(c ? `Last change · ${changeLabelText(c)}` : 'Last change · none yet'), 'label']], {
    owner: 'verdict',
  });
  const total = ` of ${shardNum(SHARD_K)} keys moved`;
  let headline: Part[];
  if (!c) headline = [['No node has joined or left', 'head', 'muted']];
  else if (hid.after)
    headline = [
      ['?', 'head'],
      [total, 'head', 'muted', 6],
    ];
  else if (live)
    headline = [
      [shardNum(frame.landed), 'head'],
      [`${total} so far`, 'head', 'muted'],
    ];
  else
    headline = [
      [shardNum(c.moved), 'head'],
      [total, 'head', 'muted'],
    ];
  const short: Part[] =
    live && !hid.after
      ? [
          [shardNum(frame.landed), 'head'],
          [' moved so far', 'head', 'muted'],
        ]
      : !c
        ? [['No node joined or left', 'head', 'muted']]
        : headline;
  const chosen = TEXTW(headline) <= inner ? headline : short;
  const hb = D.text('moved-count', pad + (c && hid.after ? 4 : 0), vY + 37, chosen, { owner: 'verdict' });
  if (c && hid.after)
    D.add('marks', 'hidden-box', {
      k: 'rect',
      cls: 'hidden-box',
      x: r1(pad + 0.5),
      y: r1(hb.y0 - 3),
      w: tw('?', 'head') + 7,
      h: 22,
      rx: 4,
    });
  const w = verdictWords(sc, view, c, frame, narrow);
  const storyLines = w.story.flatMap((l) => wrap(l, 'cap', inner));
  storyLines.forEach((l, k) => D.text(k === 0 ? 'story' : `story-${k}`, pad, vY + 58 + 18 * k, [[l, 'cap']], { owner: 'verdict' }));
  const reserveStory = w.reserve ? w.reserve.story(inner) : 0;
  const storyRoom = Math.max(storyLines.length, reserveStory);
  const standingLines = w.standing ? wrap(w.standing, 'cap', inner) : [];
  const sY = vY + 58 + 18 * storyRoom + 6;
  standingLines.forEach((l, k) => D.text(k === 0 ? 'standing' : `standing-${k}`, pad, sY + 18 * k, [[l, 'cap']], { owner: 'verdict' }));
  const used = storyRoom + Math.max(standingLines.length, w.reserve ? w.reserve.standing(inner) : 0);
  const vH = 58 + 18 * used - 2 - (standingLines.length || w.reserve ? 0 : 6);
  D.region('verdict', { x: pad - 4, y: vY - 4, w: inner + 8, h: vH + 8 });
  y = vY + vH + 12;

  // ----- A closer look: the followed key's rule, and the stretch of ring around it, magnified.
  D.add('grid', 'rule-2', { k: 'line', cls: 'rule', x1: pad, y1: y, x2: W - pad, y2: y });
  const lY = y + 12;
  const ruleLines = wrap(ruleText(sc, hid.after || live || !!replay, inner), 'cap', inner);
  const lens = drawLens(D, {
    W,
    pad,
    inner,
    two,
    lY,
    ruleLines,
    sc,
    c,
    hid,
    frame,
    live,
    replay: !!replay,
    lensPlaced,
    win,
    rb: sw.rb,
    stripW,
    hotIds,
    showMoved,
    landedKey,
    ownerNow,
    movedSet,
    LABEL,
  });
  D.region('lens', { x: pad - 4, y: lY - 4, w: inner + 8, h: lens.h + 6 });
  const H = Math.round(vY + (58 + 18 * res.verdict - 2) + 12 + 12 + (lens.h - 18 * ruleLines.length + 18 * res.rule) + 10);
  const focus = view.focus.length ? focusOutlines(D, view.focus, H) : [];
  return {
    D,
    H,
    summary: stageSummary(sc, hid, view.setup),
    focus,
    play: { x: pad - 4, y: 2 },
    meta: {
      change: c,
      play,
      frame,
      pile: { ...pile, by, pileTop, bw, binX, levelY, slotsPerPct, evenY, lists, tops, area },
      flights,
      hand: { cx, cy, r0: sw.rb - 6, r1: sw.outer + 2 },
      lines,
      table: lens.table,
      strip: lens.strip,
      headline: chosen.map((p) => p[0]).join(''),
      inCells,
      outCells,
    },
  };
}

const TEXTW = (parts: readonly Part[]) => parts.reduce((s, [t, role, , dx = 0]) => s + tw(t, role) + dx, 0);

/** What the last change block says, by phase; a free play reserves its story's lines from the start. */
interface VerdictWords {
  story: string[];
  standing: string;
  /** A free play reserves the lines its end will take, so nothing under the block moves at the climax. */
  reserve?: { story: (w: number) => number; standing: (w: number) => number };
}
function verdictWords(sc: ShardScenario, view: RingView, c: ShardDiff | null, frame: ShardFrame | null, narrow: boolean): VerdictWords {
  const live = !!frame && !frame.done;
  const hid = view.hid;
  const hiddenStanding = VERDICT.hiddenStanding(!!sc.settings.hot);
  const end = () => restWords(sc, narrow);
  const reserveOf = () => {
    const e = end();
    return {
      story: (w: number) => e.story.reduce((a, l) => a + wrap(l, 'cap', w).length, 0),
      standing: (w: number) => wrap(e.standing, 'cap', w).length,
    };
  };
  if (!c) {
    if (view.phase === 'asking') return { story: [VERDICT.ask], standing: standing(sc, { hotLine: !narrow }) };
    if (hid.after) return { story: [VERDICT.replaceHidden], standing: hiddenStanding };
    if (live) return { story: [VERDICT.replacePlaying], standing: '', reserve: reserveOf() };
    return end();
  }
  if (hid.after) return { story: [VERDICT.hiddenStory], standing: hiddenStanding };
  if (live) return { story: [VERDICT.playing(frame.flying)], standing: '', reserve: reserveOf() };
  return end();
}
