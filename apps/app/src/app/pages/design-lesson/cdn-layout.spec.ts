import { CDN_EXPERIMENTS, CDN_SETTINGS, cdnScenario, renderExperiment, type CdnSettings } from '@grasp/engine';
import type { Edge, Prim } from './stage-draw';
import { geometry, neighbours, reserve, tierLines, type StageView } from './cdn-draw';
import { linesOf } from './cdn-text';
import { buildStage } from './cdn-layout';
import { ALL_HIDDEN, NOTHING_HIDDEN, hiding, tierWords, type Hid } from './cdn-words';

const WIDTHS = [248, 254, 288, 310, 324, 346, 360, 420, 480, 560, 620, 700, 760];
const view = (hid: Hid = NOTHING_HIDDEN, o: Partial<StageView> = {}): StageView => ({ hid, ghost: null, told: false, focus: [], ...o });
const overlap = (a: Edge, b: Edge, by = 0.5) => a.x0 < b.x1 - by && b.x0 < a.x1 - by && a.y0 < b.y1 - by && b.y0 < a.y1 - by;
const ofKind = (prims: readonly Prim[], k: Prim['k']) => prims.filter((p) => p.k === k);

/** What is wrong with one drawn stage: text on text, text off the stage, cells, axis labels and the ring's hairlines. */
function faults(W: number, s: CdnSettings, v: StageView): string[] {
  const st = buildStage(W, cdnScenario(s), v);
  const out: string[] = [...st.D.missing.map((m) => `missing: ${m}`), ...st.D.orphans.map((o) => `one word alone: ${o}`)];
  const texts = st.D.texts;
  texts.forEach((a, i) => {
    if (a.x0 < 1 || a.x1 > W - 1) out.push(`off the stage: ${a.s}`);
    for (const b of texts.slice(i + 1)) if (overlap(a, b)) out.push(`text on text: "${a.s}" / "${b.s}"`);
  });
  for (const owner of ['taxis', 'xaxis']) {
    const row = texts.filter((t) => t.owner === owner);
    row.forEach((a, i) =>
      row.slice(i + 1).forEach((b) => a.x1 + 6 > b.x0 && b.x1 + 6 > a.x0 && out.push(`axis labels within 6 px: ${a.s} / ${b.s}`)),
    );
  }
  for (const r of st.meta.rings)
    for (const t of texts.filter((x) => x.owner === 'xaxis'))
      if (t.x0 <= r.x && r.x <= t.x1 && !st.meta.ringLabels.some((l) => l.kind === r.kind && Math.abs(l.x0 - t.x0) < 0.2))
        out.push(`the ${r.kind} ring's hairline under "${t.s}"`);
  if (st.meta.cells !== s.pops) out.push(`${st.meta.cells} cells for ${s.pops} locations`);
  const watched = ofKind(st.D.prims(), 'rect').filter((p) => p.id === 'watched');
  if (watched.length !== 1) out.push(`${watched.length} outlined cells`);
  if (Math.abs(st.meta.userGap - 44 / Math.sqrt(s.pops)) > 0.1) out.push(`users ${st.meta.userGap} px above the locations`);
  const g = geometry(W);
  for (const t of texts.filter((x) => ['users', 'edge', 'shield', 'origin'].includes(x.owner)))
    if (t.x0 < g.labelX - 0.5) out.push(`a tier label in the art: ${t.s}`);
  if (st.D.prims().length > 900) out.push(`${st.D.prims().length} marks`);
  // No vertical hairline or thin bar crosses the stage's words.
  for (const p of st.D.prims()) {
    const box =
      p.k === 'line' && Math.abs(p.x1 - p.x2) < 0.01
        ? { x0: p.x1 - 0.5, x1: p.x1 + 0.5, y0: Math.min(p.y1, p.y2), y1: Math.max(p.y1, p.y2) }
        : p.k === 'rect' && p.w < 3 && p.h > p.w
          ? { x0: p.x, x1: p.x + p.w, y0: p.y, y1: p.y + p.h }
          : null;
    const t = box && texts.find((x) => overlap(box, x, 0.2));
    if (t) out.push(`${p.id} across "${t.s}"`);
  }
  // The playhead, at every point of a play, crosses no word either.
  for (let f = 0; f <= 1.0001; f += 0.05) {
    const x = g.x0 + f * g.iw;
    for (const h of st.meta.timeline.heads) {
      const t = texts.find((w) => overlap({ x0: x - 0.75, x1: x + 0.75, y0: h.y0, y1: h.y1 }, w, 0.2));
      if (t) out.push(`the playhead at ${f.toFixed(2)} across "${t.s}"`);
    }
  }
  // Every mark drawn is named by the key.
  const key = texts
    .filter((t) => t.owner === 'key')
    .map((t) => t.s)
    .join(' ');
  if (st.D.prims(['clip']).some((p) => p.id.startsWith('other')) && !key.includes('gray')) out.push(`gray ticks with no key: "${key}"`);
  st.meta.sample.lanes.forEach((_, i) => {
    const ticks = st.D.prims(['clip']).filter((p) => p.k === 'line' && (p.id.startsWith(`req-${i}-`) || p.id.startsWith(`other-${i}-`)));
    const n = Math.max(ticks.filter((p) => p.id.startsWith('req')).length, ticks.filter((p) => p.id.startsWith('other')).length);
    if (n > g.iw / 4) out.push(`lane ${i}: ${n} ticks in ${g.iw} px`);
    if (!st.meta.sample.lanes[i].reqs.length && !texts.some((x) => x.owner === `lane-${i}` && x.s.startsWith('not asked for')))
      out.push(`lane ${i} empty and unexplained`);
  });
  return out;
}

const SHOWN = CDN_EXPERIMENTS.map(renderExperiment);

describe('CDN stage layout', { timeout: 300_000 }, () => {
  it('keeps one height per width over every setting and hidden form, and draws nothing on anything else', () => {
    const bad: string[] = [];
    for (const W of WIDTHS) {
      const heights = new Set<number>();
      for (const s of CDN_SETTINGS) {
        for (const v of [view(), view(ALL_HIDDEN), view(hiding(['curve'], 'asking'))]) {
          heights.add(buildStage(W, cdnScenario(s), v).H);
          if (v.hid === NOTHING_HIDDEN || s.rps === 10_000) for (const f of faults(W, s, v)) bad.push(`${W}px ${JSON.stringify(s)}: ${f}`);
        }
      }
      if (heights.size !== 1) bad.push(`${W}px: heights ${[...heights].join(', ')}`);
    }
    expect(bad.slice(0, 12)).toEqual([]);
  });

  it('reserves the lines every ghost one control away needs, and draws a ghost and a told story within them', () => {
    const bad: string[] = [];
    for (const W of WIDTHS) {
      const g = geometry(W);
      const r = reserve(W);
      for (const s of CDN_SETTINGS)
        for (const n of neighbours(s)) {
          const t = tierWords(cdnScenario(s), NOTHING_HIDDEN, cdnScenario(n), g.narrow);
          if (tierLines(t.origin, g.labelW) > r.origin) bad.push(`${W}px ${JSON.stringify(s)} after ${JSON.stringify(n)}: origin`);
          if (linesOf(t.mean, 'cap', g.iw) > r.mean) bad.push(`${W}px ${JSON.stringify(s)} after ${JSON.stringify(n)}: mean`);
        }
    }
    expect(bad.slice(0, 12)).toEqual([]);
    for (const W of [254, 420, 560, 760]) {
      const H = buildStage(W, cdnScenario(CDN_SETTINGS[0]), view()).H;
      for (const s of CDN_SETTINGS.filter((x) => x.variants === 1)) {
        const ghost = cdnScenario({ ...s, rps: s.rps === 100_000 ? 10_000 : 100_000 });
        const v = view(NOTHING_HIDDEN, { ghost, told: true });
        expect(buildStage(W, cdnScenario(s), v).H, `${W}px ${JSON.stringify(s)}`).toBe(H);
        for (const f of faults(W, s, v)) bad.push(`${W}px ${JSON.stringify(s)} with a ghost: ${f}`);
      }
    }
    expect(bad.slice(0, 12)).toEqual([]);
  });

  it('draws every location as its own cell and the users nearer as locations multiply', () => {
    for (const W of [254, 620])
      for (const pops of [1, 5, 20, 100]) {
        const st = buildStage(W, cdnScenario({ rps: 10_000, pops, ttl: 60, shield: 0, variants: 1 }), view());
        expect(st.meta.cells).toBe(pops);
        expect(st.meta.cols * (pops / st.meta.cols)).toBe(pops);
      }
    const near = buildStage(620, cdnScenario({ rps: 10_000, pops: 100, ttl: 60, shield: 0, variants: 1 }), view()).meta.userGap;
    const far = buildStage(620, cdnScenario({ rps: 10_000, pops: 1, ttl: 60, shield: 0, variants: 1 }), view()).meta.userGap;
    expect(far).toBeGreaterThan(near * 9);
  });

  it("puts each reveal's look-here tag on its outline, inside the stage and off every text, at every width", () => {
    const bad: string[] = [];
    for (const e of SHOWN.filter((x) => x.focus.length))
      for (const W of WIDTHS) {
        const s = { ...e.setup, ...(e.act && 'set' in e.act ? e.act.set : {}) } as CdnSettings;
        const st = buildStage(W, cdnScenario(s), view(NOTHING_HIDDEN, { focus: e.focus }));
        if (st.focus.length !== e.focus.length) bad.push(`${e.id} ${W}px: ${st.focus.length} outlines`);
        for (const f of st.focus) {
          const tag = { x0: f.tag.x, x1: f.tag.x + 60, y0: f.tag.y, y1: f.tag.y + 16 };
          if (tag.x0 < 3 || tag.x1 > W - 3 || tag.y0 < 3 || tag.y1 > st.H - 3) bad.push(`${e.id} ${W}px: ${f.id} tag off the stage`);
          for (const t of st.D.texts) if (overlap(tag, t)) bad.push(`${e.id} ${W}px: ${f.id} tag on "${t.s}"`);
          for (const o of st.focus)
            if (o !== f && tag.y1 + 6 > o.y && tag.y0 < o.y + o.height && o.y > f.y) bad.push(`${e.id} ${W}px: ${f.id} tag near ${o.id}`);
        }
      }
    expect(bad).toEqual([]);
  });

  it('marks only "hidden until you answer" as dashed: the flows and the square while an answer plays', () => {
    const s = { rps: 10_000, pops: 20, ttl: 60, shield: 1, variants: 1 };
    const rest = buildStage(620, cdnScenario(s), view()).D.prims();
    expect(rest.filter((p) => p.cls.includes('hidden-box'))).toEqual([]);
    const hidden = buildStage(620, cdnScenario(s), view(hiding(['outcome'], 'playing'))).D.prims();
    expect(hidden.filter((p) => p.cls.includes('hidden-box')).map((p) => p.id)).toEqual(['flows-hidden', 'square-hidden']);
    for (const id of ['fill-edge-0', 'stream-0', 'trunk', 'fill-shield', 'fill-origin', 'band-edge', 'knee-edge', 'mean-tick'])
      expect(
        hidden.some((p) => p.id === id),
        id,
      ).toBe(false);
  });
});
