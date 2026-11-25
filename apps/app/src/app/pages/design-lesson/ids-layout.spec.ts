import { ID_BASELINE as B, ID_EXPERIMENTS, idMint, renderExperiment, type IdSettings, type SdExperiment } from '@grasp/engine';
import { FALSE_CLAIMS } from './ids-claims.testing';
import type { StageView } from './ids-draw';
import { buildStage, type Stage } from './ids-layout';
import { NOTHING_HIDDEN, hiding, type QuestionPhase } from './ids-words';
import { sampleLine, type Edge, type Prim } from './latency-draw';

export const WIDTHS = [260, 288, 300, 320, 343, 358, 380, 398, 420, 480, 560, 620, 700, 760, 866];
const REST: StageView = { hid: NOTHING_HIDDEN, t: null, inspect: null, ghost: null, focus: [], pair: null, challenge: false };
const SHOWN = ID_EXPERIMENTS.map(renderExperiment);

const overlap = (a: Edge, b: Edge, by = 0) =>
  Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > by && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > by;
const share = (a: string, b: string) => !!a && !!b && a.split(' ').some((t) => b.split(' ').includes(t));
type Circle = Extract<Prim, { k: 'circle' }>;

/** Every layout reached by the steppers' ends and middles, both ticks and both epochs. */
const LAYOUTS: IdSettings[] = [];
for (const gen of [0, 1, 5, 10, 11, 12, 16])
  for (const seq of [0, 1, 4, 10, 12, 16])
    for (const tick of [1, 10]) for (const epoch of [0, 1]) LAYOUTS.push({ ...B, gen, seq, tick, epoch });
/** Every mint setting at the default layout and at E2's. */
const MINTS: IdSettings[] = [];
for (const [gen, seq] of [
  [10, 12],
  [12, 10],
  [1, 0],
])
  for (const load of [0, 1])
    for (const fault of [0, 1, 2, 3])
      for (const guard of [0, 1]) for (const tick of [1, 10]) MINTS.push({ ...B, gen, seq, load, fault, guard, tick });
const RANDOMS: IdSettings[] = [];
for (const bits of [64, 122]) for (let count = 3; count <= 15; count++) RANDOMS.push({ ...B, bits, count });

/**
 * What a reader would see as broken: text on text or off the stage, two labels on a line under 6 px apart, a line
 * through text, text on a mark it does not own, a dot on a dot, a mark off the stage, text at a focus outline's stroke,
 * a tag near a label, hit boxes under 44 px, on each other or off the stage, and any label with no place.
 */
export function collisions(st: Stage): string[] {
  const { D, H } = st;
  const W = D.W;
  const out: string[] = D.missing.map((t) => `no room for "${t}"`);
  const texts = D.texts;
  for (let i = 0; i < texts.length; i++) {
    const a = texts[i];
    if (a.x0 < -0.5 || a.x1 > W + 0.5 || a.y0 < 0 || a.y1 > H) out.push(`off-stage: "${a.s}"`);
    for (let j = i + 1; j < texts.length; j++) {
      const b = texts[j];
      if (overlap(a, b, 0.5)) out.push(`text on text: "${a.s}" / "${b.s}"`);
      else {
        const gap = Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1);
        if (Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 2 && gap < 6 && gap > -0.5)
          out.push(`labels ${gap.toFixed(1)} px apart: "${a.s}" / "${b.s}"`);
      }
    }
  }
  const inside = (p: readonly number[], t: Edge) => p[0] > t.x0 + 0.5 && p[0] < t.x1 - 0.5 && p[1] > t.y0 + 0.5 && p[1] < t.y1 - 0.5;
  for (const l of D.links)
    for (const t of texts) if (!share(l.owner, t.owner) && l.points.some((p) => inside(p, t))) out.push(`${l.owner} line through "${t.s}"`);
  const prims = D.prims();
  for (const p of prims)
    if (p.k === 'line' && /\b(rule|axis|lane-line|ruler-axis|wait-line|order-line|step-tick)\b/.test(p.cls))
      for (const t of texts)
        if (!share(p.owner ?? '', t.owner) && sampleLine(p.x1, p.y1, p.x2, p.y2, 2).some((q) => inside(q, t)))
          out.push(`${p.cls} through "${t.s}"`);
  for (const mk of D.marks)
    for (const t of texts) if (!share(t.owner, mk.owner) && overlap(mk, t, 0.5)) out.push(`text on mark ${mk.owner}: "${t.s}"`);
  const dots = prims.filter((p): p is Circle => p.k === 'circle' && /\b(dot|rdot)\b/.test(p.cls));
  for (let i = 0; i < dots.length; i++)
    for (let j = i + 1; j < dots.length; j++)
      if (Math.hypot(dots[i].cx - dots[j].cx, dots[i].cy - dots[j].cy) < dots[i].r + dots[j].r - 0.01)
        out.push(`dot on dot: ${dots[i].id} / ${dots[j].id}`);
  for (const p of prims) {
    if (p.k === 'rect' && (p.x < -0.5 || p.x + p.w > W + 0.5 || p.y < 0 || p.y + p.h > H)) out.push(`mark off-stage: ${p.id}`);
    if (p.k === 'circle' && (p.cx - p.r < -0.5 || p.cx + p.r > W + 0.5 || p.cy - p.r < 0 || p.cy + p.r > H))
      out.push(`dot off-stage: ${p.id}`);
  }
  for (const f of st.focus) {
    for (const t of texts) {
      const inner = t.x0 >= f.x + 2 && t.x1 <= f.x + f.width - 2 && t.y0 >= f.y + 2 && t.y1 <= f.y + f.height - 2;
      const clear = t.x1 <= f.x - 3 || t.x0 >= f.x + f.width + 3 || t.y1 <= f.y - 3 || t.y0 >= f.y + f.height + 3;
      if (!inner && !clear) out.push(`text at the ${f.region} outline's stroke: "${t.s}"`);
    }
    const tag = { x0: f.tag.x, x1: f.tag.x + 60, y0: f.tag.y, y1: f.tag.y + 16 };
    if (tag.x0 < 0 || tag.x1 > W || tag.y0 < 0 || tag.y1 > H) out.push(`the ${f.region} tag is clipped`);
    for (const t of texts) if (overlap(tag, t)) out.push(`the ${f.region} tag on "${t.s}"`);
  }
  const hits = st.hits.map((h) => ({ o: h.owner, x0: h.x, x1: h.x + h.w, y0: h.y, y1: h.y + h.h }));
  for (let i = 0; i < hits.length; i++) {
    const a = hits[i];
    if (a.x0 < -0.5 || a.x1 > W + 0.5 || a.y0 < -0.5 || a.y1 > H + 0.5) out.push(`hit box off-stage: ${a.o}`);
    if (a.x1 - a.x0 < 43.5 || a.y1 - a.y0 < 43.5) out.push(`target under 44 px: ${a.o}`);
    for (let j = i + 1; j < hits.length; j++) if (overlap(a, hits[j])) out.push(`hit on hit: ${a.o} / ${hits[j].o}`);
    for (const t of texts) if (overlap(a, t) && !share(a.o, t.owner)) out.push(`${a.o} over "${t.s}"`);
  }
  return out;
}

const words = (st: Stage) => [...st.D.texts.map((t) => t.s), st.summary].join(' | ');
function claims(st: Stage): string[] {
  const w = words(st);
  return FALSE_CLAIMS.filter((g) => g.test(w)).map((g) => `false claim ${g}: "${w.match(g)![0]}"`);
}

const show = (s: IdSettings) => JSON.stringify(s);
/** One line per distinct fault, with the first setting that shows it, so a sweep's report names every kind. */
const distinct = (bad: readonly string[]) => [
  ...new Map(bad.map((b) => [b.replace(/^.*?: /, '').replace(/\d+(\.\d+)? px/, 'N px'), b])).values(),
];
const build = (W: number, s: IdSettings, view: StageView = REST) => buildStage(W, idMint(s), view);

/** An experiment's views: asking at its setup, its answer at five moments of the play at its act, and its reveal. */
function phases(e: SdExperiment): [string, IdSettings, StageView][] {
  const setup = { ...B, ...e.setup } as IdSettings;
  const act = { ...setup, ...(e.act && 'set' in e.act ? e.act.set : {}) } as IdSettings;
  const view = (phase: QuestionPhase, t: number | null): StageView => ({
    ...REST,
    hid: hiding(e.hide, phase),
    t,
    focus: phase === 'revealed' ? e.focus : [],
    ghost: e.id === 'one-bit' && phase !== 'asking' ? setup : null,
    challenge: !!e.goal,
  });
  return [
    ['asking', setup, view('asking', null)],
    ...[0, 1000, 3950, 5600, 7999].map((t): [string, IdSettings, StageView] => [`playing at ${t} µs`, act, view('playing', t)]),
    ['revealed', act, view('revealed', null)],
  ];
}

describe('the Unique IDs stage', { timeout: 300_000 }, () => {
  it('keeps one height at each width over every setting, question, play moment and reveal', () => {
    const bad: string[] = [];
    for (const W of WIDTHS) {
      const H = build(W, B).H;
      for (const s of [...LAYOUTS, ...MINTS, ...RANDOMS]) if (build(W, s).H !== H) bad.push(`${W}px ${show(s)}: ${build(W, s).H} not ${H}`);
      for (const e of SHOWN)
        for (const [p, s, v] of phases(e)) if (build(W, s, v).H !== H) bad.push(`${W}px ${e.id} ${p}: ${build(W, s, v).H} not ${H}`);
    }
    expect(bad.slice(0, 20)).toEqual([]);
  });

  it('draws every setting with nothing on anything else and no false claim, at every width', () => {
    const bad: string[] = [];
    for (const W of WIDTHS)
      for (const s of [...LAYOUTS, ...MINTS, ...RANDOMS]) {
        const st = build(W, s);
        for (const f of [...collisions(st), ...claims(st)]) bad.push(`${W}px ${show(s)}: ${f}`);
      }
    expect(distinct(bad).slice(0, 40)).toEqual([]);
  });

  it('draws every experiment asking, playing and revealed with nothing on anything else, and a visible tag on every focus', () => {
    const bad: string[] = [];
    for (const W of WIDTHS)
      for (const e of SHOWN)
        for (const [p, s, v] of phases(e)) {
          const st = build(W, s, v);
          for (const f of [...collisions(st), ...claims(st)]) bad.push(`${W}px ${e.id} ${p}: ${f}`);
          if (p === 'revealed')
            for (const region of e.focus)
              if (!st.focus.some((f) => f.region === region)) bad.push(`${W}px ${e.id}: no outline for ${region}`);
        }
    expect(distinct(bad).slice(0, 40)).toEqual([]);
  });

  it('bounds its element count by the stage, never by the ids a burst makes', () => {
    for (const W of [320, 866]) {
      const burst = build(W, { ...B, seq: 0, load: 1 }).D.prims().length;
      const calm = build(W, B).D.prims().length;
      expect(burst).toBeLessThan(calm + 120);
      expect(build(W, { ...B, gen: 12, seq: 16, load: 1 }).D.prims().length).toBeLessThan(700);
    }
  });

  it('draws nothing for an id before its moment', () => {
    const m = idMint(B);
    for (const t of [0, 1500, 2900, 6000]) {
      const st = buildStage(620, m, { ...REST, t });
      const drawn = st.D.prims()
        .filter((p) => p.id.startsWith('dot-g'))
        .map((p) => p.id.slice(4));
      const due = m.ids.filter((x) => x.issued <= t).map((x) => x.key);
      expect(drawn.sort()).toEqual(due.sort());
      expect(st.made.every((x) => x.issued <= t)).toBe(true);
    }
  });
});
