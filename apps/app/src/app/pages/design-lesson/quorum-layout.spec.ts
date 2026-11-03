import {
  QUORUM_BASELINE,
  QUORUM_EXPERIMENTS,
  QUORUM_SIZES,
  REPLICA_STATES,
  quorumScenario,
  type QuorumScenario,
  type QuorumSize,
  type ReplicaState,
} from '@grasp/engine';
import { focusOutlines, sampleLine, type Edge, type Prim } from './quorum-draw';
import { WIDE_FROM, buildStage, type Stage } from './quorum-stage';

const WIDTHS = [248, 252, 288, 322, 360, 400, 460, 519, 520, 620, 700];
const HIT = 44;
type Setting = { n: QuorumSize; w: number; r: number; states: ReplicaState[]; stall: boolean; sloppy: boolean };
const UP = (n: number): ReplicaState[] => Array(n).fill('up');
const run = (s: Setting) => quorumScenario(s.n, s.w, s.r, s.states, s.stall, s.sloppy);
const label = (s: Setting) => `N${s.n} W${s.w} R${s.r} ${s.states.join('/')}${s.stall ? ' stall' : ''}${s.sloppy ? ' sloppy' : ''}`;
const REST = { hide: [] as string[], hint: null, reduced: false };

function stateLists(n: number): ReplicaState[][] {
  const out: ReplicaState[][] = [];
  const walk = (acc: ReplicaState[]) => {
    if (acc.length === n) return void out.push(acc);
    for (const s of REPLICA_STATES) walk([...acc, s]);
  };
  walk([]);
  return out;
}
function settingsOf(n: QuorumSize): Setting[] {
  const out: Setting[] = [];
  for (let w = 1; w <= n; w++)
    for (let r = 1; r <= n; r++)
      for (const states of stateLists(n))
        for (const stall of [false, true]) for (const sloppy of [false, true]) out.push({ n, w, r, states, stall, sloppy });
  return out;
}
const fromSettings = (s: Readonly<Record<string, number>>): Setting => {
  const n = s['n'] as QuorumSize;
  return {
    n,
    w: s['w'],
    r: s['r'],
    states: ['s1', 's2', 's3', 's4', 's5'].slice(0, n).map((k) => REPLICA_STATES[s[k] ?? 0]),
    stall: s['stall'] === 1,
    sloppy: s['sloppy'] === 1,
  };
};

const overlap = (a: Edge, b: Edge, by = 0) =>
  Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > by && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > by;
const share = (a: string, b: string) => !!a && !!b && a.split(' ').some((t) => b.split(' ').includes(t));
const edge = (x: number, y: number, w: number, h: number): Edge => ({ x0: x, x1: x + w, y0: y, y1: y + h });
const rest = (p: Prim) => !p.until;

/** The hit boxes on the stage: Play, each card, and each handle at every stop it can take. */
function hits(st: Stage, m: QuorumScenario) {
  const fixed = [
    { o: 'play', ...edge(st.play.x, st.play.y, HIT, HIT) },
    ...st.cards.map((c, i) => ({ o: `card${i}`, ...edge(c.x, c.y, c.w, c.h) })),
  ];
  const knob = (t: { positions: number[]; y: number }, k: number) => edge(t.positions[k - 1] - HIT / 2, t.y - HIT / 2, HIT, HIT);
  const handles = (['w', 'r'] as const).map((h) => ({
    o: `${h}handle`,
    now: knob(st.handles[h], m.settings[h]),
    every: st.handles[h].positions.map((_, k) => knob(st.handles[h], k + 1)),
  }));
  return { fixed, handles };
}

/**
 * What a reader would see as broken: text on text, text off the stage, a line or grid line through text, text on a
 * mark, dots on dots, a dot with no name, chips closer than 3 px, a glyph on a chip, hit boxes on each other or off the
 * stage, and any label, name or tag that found no place.
 */
function collisions(st: Stage, m: QuorumScenario): string[] {
  const { D, H } = st;
  const W = D.W;
  const out: string[] = [...D.missing.map((t) => `no room for "${t}"`)];
  const texts = D.texts;
  for (let i = 0; i < texts.length; i++) {
    const a = texts[i];
    if (a.x0 < -0.5 || a.x1 > W + 0.5 || a.y0 < 0 || a.y1 > H) out.push(`off-stage: "${a.s}"`);
    for (let j = i + 1; j < texts.length; j++) if (overlap(a, texts[j], 0.5)) out.push(`text on text: "${a.s}" / "${texts[j].s}"`);
  }
  const prims = D.prims().filter(rest);
  const inside = (p: readonly number[], t: Edge) => p[0] > t.x0 + 0.5 && p[0] < t.x1 - 0.5 && p[1] > t.y0 + 0.5 && p[1] < t.y1 - 0.5;
  const through = (points: readonly (readonly number[])[], what: string, skip: (t: (typeof texts)[number]) => boolean) => {
    const xs = points.map((p) => p[0]);
    const ys = points.map((p) => p[1]);
    const box = { x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
    for (const t of texts) if (!skip(t) && overlap(box, t, -1) && points.some((p) => inside(p, t))) out.push(`${what} through "${t.s}"`);
    return box;
  };
  const legends = prims.filter((p): p is Extract<Prim, { k: 'line' }> => p.k === 'line' && p.cls.includes('legend-line'));
  for (const l of [...D.links, ...legends.map((p) => ({ points: sampleLine(p.x1, p.y1, p.x2, p.y2, 2), owner: '' }))]) {
    const box = through(l.points, 'line', () => false);
    for (const mk of D.marks)
      if (
        !share(l.owner, mk.owner) &&
        overlap(box, mk, -1) &&
        l.points.some((p) => p[0] > mk.x0 + 1 && p[0] < mk.x1 - 1 && p[1] > mk.y0 + 1 && p[1] < mk.y1 - 1)
      )
        out.push(`line ${l.owner || 'key'} through mark ${mk.owner}`);
  }
  for (const p of prims)
    if (p.k === 'line' && /\b(gridline|lane|axis|rule)\b/.test(p.cls))
      through(sampleLine(p.x1, p.y1, p.x2, p.y2, 2), `grid ${p.cls}`, (t) => t.ground);
  for (const mk of D.marks)
    for (const t of texts) if (!share(t.owner, mk.owner) && overlap(mk, t, 0.5)) out.push(`text on mark ${mk.owner}: "${t.s}"`);
  const dots = prims.filter((p): p is Extract<Prim, { k: 'circle' }> => p.k === 'circle' && !!p.dot);
  for (let i = 0; i < dots.length; i++)
    for (let j = i + 1; j < dots.length; j++)
      if (Math.hypot(dots[i].cx - dots[j].cx, dots[i].cy - dots[j].cy) < dots[i].r + dots[j].r)
        out.push(`dot on dot: ${dots[i].dot} / ${dots[j].dot}`);
  const named = new Set(prims.flatMap((p) => (p.k === 'text' && p.names ? p.names.split(' ') : [])));
  for (const d of dots) if (!named.has(d.dot!)) out.push(`dot without a name: ${d.dot}`);
  const rects = prims.filter((p): p is Extract<Prim, { k: 'rect' }> => p.k === 'rect');
  const chips = rects.filter((p) => /^chip\b/.test(p.cls)).map((p) => edge(p.x, p.y, p.w, p.h));
  for (let i = 0; i < chips.length; i++)
    for (let j = i + 1; j < chips.length; j++) {
      const [a, b] = [chips[i], chips[j]];
      if (Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 1 && Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1) < 3)
        out.push(`chips under 3 px apart at y ${a.y0}`);
    }
  for (const g of rects.filter((p) => p.cls === 'pause'))
    if (chips.some((c) => overlap(edge(g.x, g.y, g.w, g.h), c))) out.push('a pause glyph on a chip');
  const { fixed, handles } = hits(st, m);
  const all = [...fixed, ...handles.map((h) => ({ o: h.o, ...h.now }))];
  for (const [i, a] of all.entries()) {
    if (a.x0 < -0.5 || a.x1 > W + 0.5 || a.y0 < -0.5 || a.y1 > H + 0.5) out.push(`hit box off-stage: ${a.o}`);
    for (const b of all.slice(i + 1)) if (overlap(a, b)) out.push(`hit on hit: ${a.o} / ${b.o}`);
  }
  for (const h of handles)
    for (const k of h.every) for (const o of all.filter((x) => x.o !== h.o)) if (overlap(k, o)) out.push(`${h.o} at a stop on ${o.o}`);
  return out;
}

/** Draws a setting at a width, focus tags included when a question points somewhere, and reports what broke. */
function check(s: Setting, W: number, view: { hide: readonly string[]; focus?: readonly string[] } = REST) {
  const m = run(s);
  const st = buildStage(W, m, { hide: view.hide, hint: null, reduced: false });
  if (view.focus?.length) focusOutlines(st.D, view.focus, st.H);
  return { st, m, out: collisions(st, m) };
}

/** The sweeps draw thousands of stages, longer than a unit test's default. */
const SWEEP_MS = 60_000;

const failures = (list: { what: string; out: string[] }[]) =>
  list.filter((f) => f.out.length).map((f) => `${f.what}: ${f.out.slice(0, 3).join('; ')}`);

describe('quorum layout', () => {
  it('takes its wide form at 520px', () => {
    const m = run({ n: 3, w: 2, r: 2, states: UP(3), stall: false, sloppy: false });
    expect(buildStage(WIDE_FROM - 1, m, REST).wide).toBe(false);
    expect(buildStage(WIDE_FROM, m, REST).wide).toBe(true);
  });

  it('keeps one height per width and N, whatever the settings or the question asking', () => {
    const heights: Record<string, number> = {};
    for (const W of WIDTHS)
      for (const n of QUORUM_SIZES) {
        const hs = new Set<number>();
        const rest = n === 3 ? [] : UP(n - 3);
        for (const s of [
          { w: 1, r: 1, states: UP(n), stall: false, sloppy: false },
          { w: n, r: n, states: UP(n), stall: false, sloppy: true },
          { w: n, r: 1, states: ['up', 'mid', ...UP(n - 2)], stall: false, sloppy: false },
          { w: 2, r: n, states: ['down', 'back', ...UP(n - 2)], stall: true, sloppy: true },
          { w: n, r: n, states: ['up', 'down', 'down', ...rest], stall: false, sloppy: true },
          { w: 1, r: n, states: ['up', 'mid', 'mid', ...rest], stall: false, sloppy: false },
          { w: n, r: 1, states: Array(n).fill('down'), stall: false, sloppy: true },
        ] as Omit<Setting, 'n'>[])
          hs.add(buildStage(W, run({ n, ...s }), REST).H);
        for (const e of QUORUM_EXPERIMENTS.filter((x) => !x.goal && x.setup['n'] === n))
          hs.add(buildStage(W, run(fromSettings(e.setup)), { hide: e.hide ?? [], hint: null, reduced: false }).H);
        expect([...hs], `${W}px N${n}`).toHaveLength(1);
        heights[`${W}/${n}`] = [...hs][0];
      }
    expect(heights['620/3']).toBeGreaterThan(800);
    expect(heights['620/5']).toBeGreaterThan(heights['620/3']);
  });

  it.each(WIDTHS)(
    'draws every N 3 setting at %ipx with nothing on anything',
    (W) => {
      const settings = settingsOf(3);
      const list = (W === 252 || W === 322 || W === 620 ? settings : settings.filter((_, i) => i % 5 === W % 5)).map((s) => ({
        what: `${W}px ${label(s)}`,
        out: check(s, W).out,
      }));
      expect(failures(list)).toEqual([]);
    },
    SWEEP_MS,
  );

  it.each(WIDTHS)(
    'draws a stride of the N 5 settings at %ipx with nothing on anything',
    (W) => {
      const list = settingsOf(5)
        .filter((_, i) => i % 41 === W % 41)
        .map((s) => ({ what: `${W}px ${label(s)}`, out: check(s, W).out }));
      expect(failures(list)).toEqual([]);
    },
    SWEEP_MS,
  );

  it.each(WIDTHS)(
    'draws the challenge, N 5 sloppy with each replica down and the stale race at %ipx',
    (W) => {
      const settings: Setting[] = [
        { n: 5, w: 4, r: 2, states: UP(5), stall: true, sloppy: false },
        ...[0, 1, 2, 3, 4].map((i): Setting => ({
          n: 5,
          w: 3,
          r: 3,
          states: UP(5).map((s, j) => (j === i ? 'down' : s)),
          stall: false,
          sloppy: true,
        })),
        { n: 5, w: 1, r: 4, states: ['back', 'down', 'back', 'up', 'up'], stall: false, sloppy: false },
        { n: 5, w: 3, r: 5, states: ['up', 'up', 'down', 'down', 'up'], stall: false, sloppy: true },
        { n: 3, w: 1, r: 1, states: UP(3), stall: false, sloppy: false },
      ];
      expect(failures(settings.map((s) => ({ what: `${W}px ${label(s)}`, out: check(s, W).out })))).toEqual([]);
    },
    SWEEP_MS,
  );

  it.each(WIDTHS)(
    'draws every experiment asking and revealed at %ipx, each region it points at with a tag',
    (W) => {
      const list = QUORUM_EXPERIMENTS.flatMap((e) => {
        const setup = e.goal ? { ...QUORUM_BASELINE, ...e.setup, n: 5, w: 4, r: 2 } : e.setup;
        return [
          { what: `${W}px ${e.id} asking`, out: check(fromSettings(setup), W, { hide: e.hide ?? [] }).out },
          { what: `${W}px ${e.id} revealed`, out: check(fromSettings(setup), W, { hide: [], focus: e.focus }).out },
        ];
      });
      expect(failures(list)).toEqual([]);
    },
    SWEEP_MS,
  );

  it('gives every card, handle and Play a 44px target, five cards on a 252px stage included', () => {
    for (const W of [252, 322, 620]) {
      const st = buildStage(W, run({ n: 5, w: 3, r: 3, states: UP(5), stall: false, sloppy: false }), REST);
      for (const c of st.cards) expect(Math.min(c.w, c.h), `${W}px card`).toBeGreaterThanOrEqual(HIT);
      for (const [a, b] of st.cards.slice(1).map((c, i) => [st.cards[i], c]))
        expect(b.x - (a.x + a.w), `${W}px gap`).toBeGreaterThanOrEqual(3);
    }
  });
});
