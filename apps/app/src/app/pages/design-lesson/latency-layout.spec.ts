import {
  LATENCY_BASELINE,
  LATENCY_EXPERIMENTS,
  LATENCY_LOADS,
  LATENCY_SETTINGS as ALL,
  latencySample,
  latencyScenario,
  playPlan,
  type ExperimentSpec,
  type LatencySettings,
} from '@grasp/engine';
import { BAD_GRAMMAR, FALSE_CLAIMS } from './latency-claims.testing';
import { TEXT, sampleLine, yAt, type Edge, type Prim } from './latency-draw';
import { WIDE_FROM, bandAt, buildStage, scaleOf, type Stage, type StageView } from './latency-layout';
import { NOTHING_HIDDEN, hiding, loadValueText, sameConfig, type Hid, type QuestionPhase } from './latency-words';

const WIDTHS = [248, 252, 288, 322, 344, 360, 400, 460, 519, 520, 620, 700];
const HIT = 44;
const SWEEP_MS = 120_000;

const label = (s: LatencySettings) =>
  `${s.servers} ${s.queue ? 'each' : 'shared'} ${s.service ? 'steady' : 'random'}${s.down ? ' down' : ''} ${s.load}%`;
const REST: StageView = { hid: NOTHING_HIDDEN, tau: null, plan: null, ghost: null, qFloor: 0, focus: [] };

const overlap = (a: Edge, b: Edge, by = 0) =>
  Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > by && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > by;
const share = (a: string, b: string) => !!a && !!b && a.split(' ').some((t) => b.split(' ').includes(t));
const GRID = /\b(gridline|axis|rule|row-track|mtick|qgrid)\b/;

/**
 * What a reader would see as broken: text on text or off the stage, a line through text (a grid line only through
 * ungrounded text, but the marginal's rule through none), text on a mark, a dot on a dot, x tick labels under 6 px apart,
 * text against a focus outline's stroke, a wrapped line that starts with a unit, a marginal word under its rule, hit
 * boxes on each other or off the stage at any handle stop, and any label or tag that found no place.
 */
function collisions(st: Stage): string[] {
  const { D, H } = st;
  const W = D.W;
  const out: string[] = D.missing.map((t) => `no room for "${t}"`);
  const texts = D.texts;
  for (let i = 0; i < texts.length; i++) {
    const a = texts[i];
    if (a.x0 < -0.5 || a.x1 > W + 0.5 || a.y0 < 0 || a.y1 > H) out.push(`off-stage: "${a.s}"`);
    for (let j = i + 1; j < texts.length; j++) if (overlap(a, texts[j], 0.5)) out.push(`text on text: "${a.s}" / "${texts[j].s}"`);
  }
  const inside = (p: readonly number[], t: Edge) => p[0] > t.x0 + 0.5 && p[0] < t.x1 - 0.5 && p[1] > t.y0 + 0.5 && p[1] < t.y1 - 0.5;
  for (const l of D.links)
    for (const t of texts) if (!share(l.owner, t.owner) && l.points.some((p) => inside(p, t))) out.push(`line ${l.owner} through "${t.s}"`);
  const prims = D.prims();
  for (const p of prims)
    if (p.k === 'line' && GRID.test(p.cls))
      for (const t of texts)
        if ((!t.ground || p.id === 'marginal-axis') && sampleLine(p.x1, p.y1, p.x2, p.y2, 2).some((q) => inside(q, t)))
          out.push(`grid ${p.id} through "${t.s}"`);
  for (const t of texts) if (/^(ms|s)\b/.test(t.s)) out.push(`a line starts with a unit: "${t.s}"`);
  const plot = st.meta.plot;
  // The column's words stay over its rule, but for the count under 1 ms, which is the column's own row under it.
  for (const t of texts)
    if (t.owner.startsWith('marg') && t.owner !== 'marg-note' && t.y1 > plot.py1) out.push(`the marginal's "${t.s}" under its rule`);
  for (const mk of D.marks)
    for (const t of texts) if (!share(t.owner, mk.owner) && overlap(mk, t, 0.5)) out.push(`text on mark ${mk.owner}: "${t.s}"`);
  const dots = prims.filter((p): p is Extract<Prim, { k: 'circle' }> => p.k === 'circle' && /\b(dot|ghost-dot)\b/.test(p.cls));
  for (let i = 0; i < dots.length; i++)
    for (let j = i + 1; j < dots.length; j++)
      if (Math.hypot(dots[i].cx - dots[j].cx, dots[i].cy - dots[j].cy) < dots[i].r + dots[j].r - 0.01)
        out.push(`dot on dot: ${dots[i].id} / ${dots[j].id}`);
  // A ring's stroke reaches past its radius: it must clear every dot but the one it rings.
  for (const ring of prims.filter((p): p is Extract<Prim, { k: 'circle' }> => p.k === 'circle' && /\b(ring99|peak)\b/.test(p.cls)))
    for (const d of dots) {
      const gap = Math.hypot(ring.cx - d.cx, ring.cy - d.cy);
      if (gap > 0.5 && gap < ring.r + 0.875 + d.r) out.push(`ring ${ring.id} on dot ${d.id}`);
    }
  // The corner the axes share: every y label 6 px or more from every x label.
  for (const a of texts.filter((t) => t.owner === 'yaxis'))
    for (const b of texts.filter((t) => t.owner === 'xaxis')) {
      const gap = Math.hypot(Math.max(0, b.x0 - a.x1, a.x0 - b.x1), Math.max(0, b.y0 - a.y1, a.y0 - b.y1));
      if (gap < 6 - 0.01) out.push(`axis labels ${a.s} and ${b.s} ${gap.toFixed(1)} px apart`);
    }
  const ticks = texts.filter((t) => t.owner === 'xaxis' || t.owner === 'marg-note').sort((a, b) => a.x0 - b.x0);
  for (let i = 1; i < ticks.length; i++)
    if (ticks[i].x0 - ticks[i - 1].x1 < 6) out.push(`x ticks ${ticks[i - 1].s} and ${ticks[i].s} closer than 6 px`);
  for (const f of st.focus)
    for (const t of texts) {
      const inner = t.x0 >= f.x + 3 && t.x1 <= f.x + f.width - 3 && t.y0 >= f.y + 3 && t.y1 <= f.y + f.height - 3;
      const clear = t.x1 <= f.x - 4 || t.x0 >= f.x + f.width + 4 || t.y1 <= f.y - 4 || t.y0 >= f.y + f.height + 4;
      if (!inner && !clear) out.push(`text at the ${f.region} outline's stroke: "${t.s}"`);
    }
  const play = { x0: st.play.x, x1: st.play.x + HIT, y0: st.play.y, y1: st.play.y + HIT };
  if (play.x0 < -0.5 || play.y0 < -0.5) out.push('Play off the stage');
  for (const x of st.load.positions) {
    const h = { x0: x - HIT / 2, x1: x + HIT / 2, y0: st.load.y - HIT / 2, y1: st.load.y + HIT / 2 };
    if (h.x0 < -0.5 || h.x1 > W + 0.5) out.push(`the load handle off the stage at ${x}`);
    if (overlap(h, play)) out.push(`the load handle on Play at ${x}`);
  }
  return out;
}

/** What must hold on every drawing beyond collisions: the brief's assertions (5). */
function assertions(st: Stage, s: LatencySettings, valuetext: string): string[] {
  const out: string[] = [];
  const m = latencyScenario(s);
  const words = [...st.D.texts.map((t) => t.s), st.summary, valuetext].join(' | ');
  for (const g of [...FALSE_CLAIMS, ...BAD_GRAMMAR]) if (g.test(words)) out.push(`false claim ${g}: ${words.match(g)![0]}`);
  // With no steady state there is no p99: only the curves' and the legend's names say it.
  if (!m.stable)
    for (const t of st.D.texts)
      if (/p99/.test(t.s) && !['head', 'c99', 'ghost', 'chart-title'].includes(t.owner)) out.push(`a p99 with no steady state: "${t.s}"`);
  for (const f of st.meta.facts) {
    const x = f.match(/^([\d.,]+) in the system at once on average: ([\d,]+)\/s × ([\d.]+) ms/);
    if (x) {
      const [L, rate, mean] = [x[1], x[2], x[3]].map((v) => Number(v.replace(/,/g, '')));
      if (Math.abs(L - (rate * mean) / 1000) > 0.0051) out.push(`Little's law does not multiply out: ${f}`);
    }
  }
  const both = words.match(/p50 and p99 ([\d.]+ m?s)/);
  if (both && m.stable && Math.abs(m.p99 - m.p50) > 0.01 * m.p50 && !words.includes(`p50 and p99 ${both[1]}`)) out.push(`"${both[0]}"`);
  const chevron = st.D.prims().find((p) => p.id === 'chevron');
  if (chevron && st.meta.chevronY !== st.meta.plot.py0) out.push('the chevron is not at the top of the plot');
  const mg = st.meta.marginal;
  if (mg) {
    const n = { A: 0, B: 0, C: 0 };
    for (const row of mg.rows) n[row.zone] += row.n;
    const want = mg.equal ? { A: 50, B: 0, C: 50 } : { A: 50, B: 49, C: 1 };
    if (n.A !== want.A || n.B !== want.B || n.C !== want.C) out.push(`marginal zones ${n.A}/${n.B}/${n.C}`);
    const tick = (id: string) => (st.D.prims().find((p) => p.id === id) as Extract<Prim, { k: 'line' }>).y1;
    const [t50, t99] = [tick('tick-p50'), tick('tick-p99')];
    for (const d of st.D.prims().filter((p): p is Extract<Prim, { k: 'circle' }> => p.k === 'circle' && p.cls.includes('req'))) {
      const zone = d.cls.match(/zone-([ABC])/)![1];
      const under50 = d.cy - d.r >= t50 + 0.75 + 0.9;
      const over99 = d.cy + d.r <= t99 - 0.75 - 0.9;
      const between = d.cy + d.r <= t50 - 0.75 - 0.9 && d.cy - d.r >= t99 + 0.75 + 0.9;
      if ((zone === 'A' && !under50) || (zone === 'B' && !between) || (zone === 'C' && !over99))
        out.push(`marginal dot ${d.id} (${zone}) against the ticks`);
    }
  }
  // The requests under 1 ms are counted in the column's own row under its rule: inside the column, off the rule.
  const under = mg && m.stable ? m.dots.filter((t) => t < 1).length : 0;
  const count = st.D.texts.find((t) => t.owner === 'marg-note');
  const plot = st.meta.plot;
  if (under && !count?.s.startsWith(`${under} `)) out.push(`the count of ${under} under 1 ms reads "${count?.s}"`);
  if (count && (count.x0 < plot.mx0 - 0.5 || count.x1 > plot.mx1 + 0.5)) out.push(`"${count.s}" leaves the column`);
  if (count && count.y0 < plot.py1 + 2) out.push(`"${count.s}" on or over the column's rule`);
  const name = st.D.texts.find((t) => t.owner === 'ghost' && t.s.startsWith('p99'));
  if (name) {
    const xm = (name.x0 + name.x1) / 2;
    const cy = (name.y0 + name.y1) / 2;
    const d = (pts: readonly [number, number][]) => {
      const yy = pts.length ? yAt(pts, xm) : null;
      return yy === null ? Infinity : Math.abs(yy - cy);
    };
    const c = st.meta.curves;
    if (!(d(c.ghost) < d(c.p50) && d(c.ghost) < d(c.p99))) out.push(`the ghost's name "${name.s}" sits nearer another curve`);
  }
  return out;
}

function draw(s: LatencySettings, W: number, view: Partial<StageView> = {}) {
  const m = latencyScenario(s);
  const st = buildStage(W, m, latencySample(s), { ...REST, ...view });
  return { st, out: [...collisions(st), ...assertions(st, s, loadValueText(m))] };
}

const failures = (list: { what: string; out: string[] }[]) =>
  list.filter((f) => f.out.length).map((f) => `${f.what}: ${f.out.slice(0, 3).join('; ')}`);

/** The view of a question's phase, as the widget builds it: what hides, the act's ghost and the setup's waiting scale. */
function questionView(e: ExperimentSpec, phase: QuestionPhase): { s: LatencySettings; view: StageView } {
  const setup = latencyScenario({ ...LATENCY_BASELINE, ...e.setup });
  const target = latencyScenario({ ...setup.settings, ...(e.act && 'set' in e.act ? e.act.set : {}) });
  const s = phase === 'asking' ? setup.settings : target.settings;
  const moved = !sameConfig(setup.settings, target.settings) || Math.abs(setup.rho - target.rho) > 1e-9;
  const hid: Hid = hiding(e.hide ?? [], phase, setup.rho, !sameConfig(setup.settings, target.settings));
  const plan = phase === 'playing' ? playPlan(latencySample(s), true) : null;
  const sampled = !(e.hide ?? []).includes('sample');
  return {
    s,
    view: {
      ...REST,
      hid,
      plan,
      tau: plan ? plan.from : null,
      ghost: phase !== 'asking' && moved ? setup.settings : null,
      qFloor: phase !== 'asking' && sampled ? scaleOf(latencySample(setup.settings), setup, true) : 0,
      focus: phase === 'revealed' ? e.focus : [],
    },
  };
}

describe('latency layout', () => {
  it('takes its wide form at 520px', () => {
    expect(buildStage(WIDE_FROM - 1, latencyScenario({}), latencySample({}), REST).wide).toBe(false);
    expect(buildStage(WIDE_FROM, latencyScenario({}), latencySample({}), REST).wide).toBe(true);
  });

  it(
    'keeps one height per width, whatever the setting, a play, a ghost or a question in any phase',
    () => {
      const heights: Record<number, number> = {};
      for (const W of [...WIDTHS, 286, 287, 374, 375, 457, 458, 531, 532, 585, 586]) {
        const hs = new Set<number>();
        for (const s of ALL.filter((_, i) => i % 7 === W % 7)) hs.add(draw(s, W).st.H);
        for (const s of ALL.filter((_, i) => i % 29 === 0)) {
          const plan = playPlan(latencySample(s), false);
          hs.add(draw(s, W, { plan, tau: plan.from }).st.H);
        }
        for (const e of LATENCY_EXPERIMENTS)
          for (const phase of ['asking', 'playing', 'revealed'] as const) {
            const q = questionView(e, phase);
            hs.add(draw(q.s, W, q.view).st.H);
          }
        expect([...hs], `${W}px`).toHaveLength(1);
        heights[W] = [...hs][0];
      }
      // A step function of width alone: the brief's (2), within the few pixels its canvas measurement differs by.
      const steps = [
        [248, 985],
        [288, 967],
        [376, 949],
        [461, 933],
        [534, 915],
        [590, 899],
      ];
      for (const [i, [from, H]] of steps.entries()) {
        expect(draw(ALL[0], from).st.H, `${from}px`).toBe(H);
        if (i) expect(draw(ALL[0], from - 1).st.H, `${from - 1}px`).toBe(steps[i - 1][1]);
      }
      expect(draw(ALL[0], 1400).st.H).toBe(899);
      expect(Object.keys(heights).length).toBeGreaterThan(0);
    },
    SWEEP_MS,
  );

  it.each(WIDTHS)(
    'draws every setting at %ipx with nothing on anything, every claim true',
    (W) => {
      const list = (W === 252 || W === 322 || W === 620 ? ALL : ALL.filter((_, i) => i % 4 === W % 4)).map((s) => ({
        what: `${W}px ${label(s)}`,
        out: draw(s, W).out,
      }));
      expect(failures(list)).toEqual([]);
    },
    SWEEP_MS,
  );

  it.each([252, 322, 620])(
    'draws ghosts of both kinds at %ipx: a curve for a change that keeps the utilization, the old cursor for one that moves it',
    (W) => {
      const list: { what: string; out: string[] }[] = [];
      let named = 0;
      for (const s of ALL.filter((_, i) => i % 2 === W % 2)) {
        const i = LATENCY_LOADS.indexOf(s.load as (typeof LATENCY_LOADS)[number]);
        const ghosts: LatencySettings[] = [{ ...s, service: 1 - s.service }];
        if (i > 0) ghosts.push({ ...s, load: LATENCY_LOADS[i - 1] });
        if (s.servers > 1) ghosts.push({ ...s, queue: 1 - s.queue });
        for (const ghost of ghosts) {
          const { st, out } = draw(s, W, { ghost });
          if (st.meta.ghostName) named++;
          list.push({ what: `${W}px ${label(s)} ghost ${label(ghost)}`, out });
        }
      }
      expect(failures(list)).toEqual([]);
      expect(named).toBeGreaterThan(0);
    },
    SWEEP_MS,
  );

  it.each([252, 322, 620])(
    'draws the band at moments of every free play at %ipx: one waiting scale, the speed note its clock, nothing before it arrives',
    (W) => {
      const out: string[] = [];
      for (const s of ALL.filter((_, i) => i % 3 === W % 3)) {
        const smp = latencySample(s);
        const plan = playPlan(smp, false);
        const st = draw(s, W, { plan, tau: plan.from }).st;
        const rest = draw(s, W).st;
        if (st.meta.scale !== rest.meta.scale) out.push(`${label(s)}: the scale ${rest.meta.scale} at rest, ${st.meta.scale} playing`);
        const note = st.D.texts.find((t) => t.owner === 'tl' && /slower|real time/.test(t.s));
        const said = note ? (/real time/.test(note.s) ? 1 : Number(note.s.match(/(\d+)×/)![1])) : null;
        if (said !== plan.rate) out.push(`${label(s)}: the speed note says ${note?.s} for a clock at ${plan.rate}×`);
        for (const f of [0.05, 0.3, 0.6, 0.95]) {
          const t = plan.from + f * (plan.to - plan.from);
          const prims = bandAt(st, latencyScenario(s), smp, NOTHING_HIDDEN, t, plan.rate);
          const ids = prims.flatMap((p) => (p.k === 'circle' && p.id.startsWith('req-') ? [Number(p.id.slice(4))] : []));
          for (const id of ids)
            if (smp.reqs.find((r) => r.id === id)!.arrive > t) out.push(`${label(s)} at ${t}: request ${id} before it arrives`);
          const dots = prims.filter((p): p is Extract<Prim, { k: 'circle' }> => p.k === 'circle');
          for (let i = 0; i < dots.length; i++)
            for (let j = i + 1; j < dots.length; j++)
              if (Math.hypot(dots[i].cx - dots[j].cx, dots[i].cy - dots[j].cy) < dots[i].r + dots[j].r - 0.01)
                out.push(`${label(s)} at ${t}: dot on dot`);
          const chip = prims.find((p): p is Extract<Prim, { k: 'rect' }> => p.k === 'rect' && p.cls === 'chip');
          if (chip && chip.x < st.band.pad - 1) out.push(`${label(s)} at ${t}: the "+N" chip leaves the lane`);
          const labelText = prims.find((p): p is Extract<Prim, { k: 'text' }> => p.k === 'text' && p.id === 'queue-label');
          const w = labelText ? TEXT.partsWidth(labelText.spans.map((sp) => [sp.t, 'label'] as const)) : 0;
          if (w > st.band.qRoom + 2) out.push(`${label(s)} at ${t}: the queue label overflows its room`);
        }
      }
      expect(out).toEqual([]);
    },
    SWEEP_MS,
  );

  it.each(WIDTHS)(
    'draws every experiment asking, playing and revealed at %ipx, each region it points at with a tag',
    (W) => {
      const list: { what: string; out: string[] }[] = [];
      for (const e of LATENCY_EXPERIMENTS) {
        const phases: QuestionPhase[] = e.goal ? ['revealed'] : ['asking', 'playing', 'revealed'];
        const scales: number[] = [];
        for (const phase of phases) {
          const q = e.goal
            ? {
                s: latencyScenario({ ...LATENCY_BASELINE, ...e.setup, servers: 4, queue: 0, load: 60 }).settings,
                view: { ...REST, focus: e.focus },
              }
            : questionView(e, phase);
          const { st, out } = draw(q.s, W, q.view);
          if (phase === 'revealed' && st.focus.length < e.focus.length) out.push('a region without its outline');
          if (e.id === 'pool' && phase === 'asking') {
            const b = st.meta.band;
            if (!(b.idle.length >= 1 && Math.max(...b.lines) >= 5))
              out.push(`E3 asks without an idle server beside a line of 5 (idle ${b.idle}, lines ${b.lines})`);
          }
          if (phase !== 'asking' && !e.goal) scales.push(st.meta.scale);
          list.push({ what: `${W}px ${e.id} ${phase}`, out });
        }
        if (new Set(scales).size > 1)
          list.push({ what: `${W}px ${e.id}`, out: [`the waiting scale changes from the play to the reveal: ${scales}`] });
      }
      expect(failures(list)).toEqual([]);
    },
    SWEEP_MS,
  );

  it(
    'draws the timeline in a few marks, and keeps labels off lines by points its width bounds, however long the window',
    () => {
      const out: string[] = [];
      for (const W of [248, 620])
        for (const s of ALL) {
          const st = buildStage(W, latencyScenario(s), latencySample(s), REST);
          const marks = st.D.prims(['clip']).length;
          const points = st.D.links.reduce((n, l) => n + l.points.length, 0);
          if (marks > 48) out.push(`${W}px ${label(s)}: ${marks} timeline marks`);
          if (st.D.prims().length > 600) out.push(`${W}px ${label(s)}: ${st.D.prims().length} marks in all`);
          if (points > 6 * W) out.push(`${W}px ${label(s)}: ${points} line points`);
          // Still a tick per arrival, none on another in its path, and a block per busy period of each server.
          const smp = latencySample(s);
          const paths = (id: RegExp) => st.D.prims(['clip']).flatMap((p) => (p.k === 'path' && id.test(p.id) ? [p.d] : []));
          const ticks = paths(/^ticks-/).map((d) => [...d.matchAll(/M([\d.]+) /g)].map((x) => Number(x[1])));
          if (ticks.flat().length !== smp.reqs.filter((r) => r.arrive >= 0 && r.arrive <= smp.window).length)
            out.push(`${W}px ${label(s)}: ${ticks.flat().length} ticks`);
          if (ticks.some((xs) => xs.some((x, i) => i > 0 && x < xs[i - 1] + 1.5 - 1e-6)))
            out.push(`${W}px ${label(s)}: ticks overlap in a path`);
          for (let i = 0; i < s.servers; i++) {
            const mine = smp.reqs.filter((r) => r.server === i && Math.min(r.leave, smp.window) > Math.max(0, r.start));
            const periods = mine.filter((r, k) => k === 0 || r.start !== mine[k - 1].leave).length;
            const blocks =
              paths(new RegExp(`^busy-${i}$`))
                .join('')
                .split('M').length - 1;
            if (blocks !== periods) out.push(`${W}px ${label(s)}: S${i + 1} ${blocks} blocks for ${periods} busy periods`);
          }
        }
      expect(out).toEqual([]);
    },
    SWEEP_MS,
  );

  it('keeps Play and the load handle 44px targets apart at every stop, on every width', () => {
    for (const W of WIDTHS) {
      const st = draw(ALL[0], W).st;
      expect(st.load.positions).toHaveLength(LATENCY_LOADS.length);
      for (let i = 1; i < st.load.positions.length; i++) expect(st.load.positions[i]).toBeGreaterThan(st.load.positions[i - 1]);
    }
  });
});
