import {
  STORAGE_BASELINE as B,
  STORAGE_EXPERIMENTS,
  STORAGE_LEVEL_SCALE,
  STORAGE_SETTINGS as ALL,
  formatAmp,
  storageScenario,
  type ExperimentSpec,
  type StorageSettings,
} from '@grasp/engine';
import { FALSE_CLAIMS } from './storage-claims.testing';
import { sampleLine, type Edge, type Prim } from './latency-draw';
import type { StageView } from './storage-draw';
import { TWO_FROM, buildStage, type Stage } from './storage-layout';
import { momentOf, planOf, type Engine } from './storage-motion';
import { BLOCK_W } from './storage-stack';
import { tableWidth } from './storage-text';
import { NOTHING_HIDDEN, chargedOnly, describeTable, hiding, tableOf, type QuestionPhase } from './storage-words';

const WIDTHS = [248, 252, 280, 300, 322, 332, 333, 344, 400, 460, 499, 500, 583, 620, 700, 760, 866];
const REST: StageView = { hid: NOTHING_HIDDEN, play: null, ghost: null, told: null, focus: [] };
const ENGINES: Engine[] = ['btree', 'lsm'];

const show = (s: StorageSettings) => `${s.data}GB ${s.record}B ${s.page}KB r${s.ratio} bloom${s.bloom} ${s.op ? 'lookup' : 'write'}`;
const overlap = (a: Edge, b: Edge, by = 0) =>
  Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > by && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > by;
const share = (a: string, b: string) => !!a && !!b && a.split(' ').some((t) => b.split(' ').includes(t));
const LINES = /\b(fan|walk|trail|rule|vrule|tickmark|ghost-tick|free-edge|skip-slash)\b/;
const GRID = /\b(rule|vrule|tickmark)\b/;
type Rect = Extract<Prim, { k: 'rect' }>;
type Circle = Extract<Prim, { k: 'circle' }>;

/**
 * What a reader would see as broken: text on text or off the stage, two labels on a line under 6 px apart, x tick labels
 * under 6 px apart, a line through text, text on a mark, a dot on a dot, a mark off the stage, text at a focus outline's
 * stroke, an outline near a control, outlines near each other, a tag near a label on its row, a dot or ring on a run
 * bar, a lone "?" line, hit boxes under 44 px, on each other or off the stage, and any label or tag with no place.
 */
function collisions(st: Stage): string[] {
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
  const ticks = texts.filter((t) => t.owner === 'cost-axis' && /^(0|\d+×)$/.test(t.s)).sort((a, b) => a.x0 - b.x0);
  for (let i = 1; i < ticks.length; i++)
    if (ticks[i].x0 - ticks[i - 1].x1 < 6) out.push(`x ticks ${ticks[i - 1].s} and ${ticks[i].s} too close`);
  const inside = (p: readonly number[], t: Edge) => p[0] > t.x0 + 0.5 && p[0] < t.x1 - 0.5 && p[1] > t.y0 + 0.5 && p[1] < t.y1 - 0.5;
  const prims = D.prims();
  for (const p of prims)
    if (p.k === 'line' && LINES.test(p.cls)) {
      const pts = sampleLine(p.x1, p.y1, p.x2, p.y2, 2);
      for (const t of texts) {
        if ((GRID.test(p.cls) && t.ground) || share(p.owner ?? '', t.owner)) continue;
        if (pts.some((q) => inside(q, t))) out.push(`${p.cls} ${p.id} through "${t.s}"`);
      }
    }
  for (const mk of D.marks)
    for (const t of texts) if (!share(t.owner, mk.owner) && overlap(mk, t, 0.5)) out.push(`text on mark ${mk.owner}: "${t.s}"`);
  const dots = prims.filter((p): p is Circle => p.k === 'circle' && /\b(dot|ringm|skip|pip)\b/.test(p.cls));
  for (let i = 0; i < dots.length; i++)
    for (let j = i + 1; j < dots.length; j++)
      if (Math.hypot(dots[i].cx - dots[j].cx, dots[i].cy - dots[j].cy) < dots[i].r + dots[j].r - 0.01)
        out.push(`dot on dot: ${dots[i].id} / ${dots[j].id}`);
  for (const p of prims) {
    if (p.k === 'rect' && (p.x < -0.5 || p.x + p.w > W + 0.5 || p.y < 0 || p.y + p.h > H)) out.push(`mark off-stage: ${p.id}`);
    if (p.k === 'circle' && (p.cx - p.r < -0.5 || p.cx + p.r > W + 0.5 || p.cy - p.r < 0 || p.cy + p.r > H))
      out.push(`dot off-stage: ${p.id}`);
  }
  const bars = prims.filter((p): p is Rect => p.k === 'rect' && /^run-\d/.test(p.id));
  for (const c of prims.filter((p): p is Circle => p.k === 'circle' && /\b(dot|ringm|ring-pass|skip|found-ring)\b/.test(p.cls))) {
    const sw = c.cls.includes('found-ring') ? 1 : 0.75;
    for (const b of bars)
      if (c.cx + c.r + sw > b.x && c.cx - c.r - sw < b.x + b.w && c.cy + c.r + sw > b.y && c.cy - c.r - sw < b.y + b.h)
        out.push(`${c.id} crosses ${b.id}`);
  }
  for (const t of texts)
    if (/^\?×?$/.test(t.s.trim()) && !texts.some((u) => u !== t && Math.min(u.y1, t.y1) - Math.max(u.y0, t.y0) > 2))
      out.push(`a lone "${t.s}"`);
  const hits = st.hits.map((h) => ({ o: h.owner, x0: h.x, x1: h.x + h.w, y0: h.y, y1: h.y + h.h }));
  for (const f of st.focus) {
    for (const t of texts) {
      const inner = t.x0 >= f.x + 7.5 && t.x1 <= f.x + f.width - 7.5 && t.y0 >= f.y + 7.5 && t.y1 <= f.y + f.height - 7.5;
      const clear = t.x1 <= f.x - 4 || t.x0 >= f.x + f.width + 4 || t.y1 <= f.y - 4 || t.y0 >= f.y + f.height + 4;
      if (!inner && !clear) out.push(`text at the ${f.region} outline's stroke: "${t.s}"`);
    }
    for (const c of hits) {
      const gap = Math.max(f.x - c.x1, c.x0 - (f.x + f.width), f.y - c.y1, c.y0 - (f.y + f.height));
      if (gap < 7.5) out.push(`the ${f.region} outline ${gap.toFixed(1)} px from ${c.o}`);
    }
    const tag = { x0: f.tag.x, x1: f.tag.x + 60, y0: f.tag.y, y1: f.tag.y + 16 };
    if (Math.abs(tag.y0 + 8 - f.y) > 0.6 && Math.abs(tag.y0 + 8 - (f.y + f.height)) > 0.6)
      out.push(`the ${f.region} tag off its outline's edge`);
    for (const t of texts)
      if (Math.min(tag.y1, t.y1) - Math.max(tag.y0, t.y0) > 2 && Math.max(tag.x0 - t.x1, t.x0 - tag.x1) < 6)
        out.push(`the ${f.region} tag near "${t.s}"`);
  }
  for (let i = 0; i < st.focus.length; i++)
    for (let j = i + 1; j < st.focus.length; j++) {
      const [a, b] = [st.focus[i], st.focus[j]];
      const gap = Math.max(a.x - (b.x + b.width), b.x - (a.x + a.width), a.y - (b.y + b.height), b.y - (a.y + a.height));
      if (gap < 6) out.push(`focus outlines ${gap.toFixed(1)} px apart`);
    }
  for (let i = 0; i < hits.length; i++) {
    const a = hits[i];
    if (a.x0 < -0.5 || a.x1 > W + 0.5 || a.y0 < -0.5 || a.y1 > H + 0.5) out.push(`hit box off-stage: ${a.o}`);
    if (a.x1 - a.x0 < 43.5 || a.y1 - a.y0 < 43.5) out.push(`target under 44 px: ${a.o}`);
    for (let j = i + 1; j < hits.length; j++) if (overlap(a, hits[j])) out.push(`hit on hit: ${a.o} / ${hits[j].o}`);
  }
  return out;
}

/** What must hold on every drawing beyond collisions: the brief's assertions, by rule, at every setting. */
function assertions(st: Stage, s: StorageSettings, view: StageView): string[] {
  const out: string[] = [];
  const m = storageScenario(s);
  const { D, meta } = st;
  const prims = D.prims();
  const byId = (id: string) => prims.find((p) => p.id === id);
  const textPrims = prims.filter((p): p is Extract<Prim, { k: 'text' }> => p.k === 'text');
  const textOf = (id: string) =>
    textPrims
      .find((p) => p.id === id)
      ?.spans.map((x) => x.t)
      .join('');
  const words = [
    ...D.texts.map((t) => t.s),
    st.summary,
    ...st.hits.map((h) => ('label' in h ? `${h.label} ${'sub' in h ? h.sub : ''}` : '')),
  ].join(' | ');
  for (const g of FALSE_CLAIMS) if (g.test(words)) out.push(`false claim ${g}: "${words.match(g)![0]}"`);
  const hid = view.hid;
  for (const e of ENGINES) {
    const bar = byId(`write-bar-${e}`) as Rect | undefined;
    const hidden = e === 'btree' ? hid.btNumbers : hid.lsmNumbers;
    if (bar) {
      if (Math.abs(bar.w - m[e].writeAmp * meta.writePx) > 0.6) out.push(`the ${e} write bar is ${bar.w} px`);
      if (!textOf(`write-${e}`)?.startsWith(formatAmp(m[e].writeAmp))) out.push(`the ${e} write value reads "${textOf(`write-${e}`)}"`);
    } else if (!hidden) out.push(`no ${e} write bar`);
    const pips = prims.filter((p) => p.id.startsWith(`pip-${e}-`)).length;
    if (!(hid.readNumbers && e === 'lsm') && pips !== m[e].lookupReads) out.push(`${pips} pips for ${m[e].lookupReads} reads (${e})`);
    const over = byId(`space-over-${e}`) as Rect;
    if (Math.abs(over.w - (m[e].spaceAmp - 1) * meta.spacePx) > 0.6) out.push(`the ${e} space bar is off its number`);
  }
  if (meta.btRows.length !== m.btree.height) out.push(`${meta.btRows.length} tree rows for height ${m.btree.height}`);
  meta.btRows.forEach((r, k) => {
    if (r.drawn > r.n) out.push(`row ${k} draws ${r.drawn} of ${r.n} pages`);
    if (r.more !== r.n > r.drawn) out.push(`row ${k}'s dots disagree with its count`);
    if (!!byId(`more-${k}-0`) !== r.more) out.push(`row ${k}'s dots are not drawn as counted`);
  });
  const runs = prims.filter((p): p is Rect => p.k === 'rect' && /^run-\d+$/.test(p.id));
  if (runs.length !== m.lsm.levels + 1) out.push(`${runs.length} runs for ${m.lsm.levels} levels and the flushed run`);
  runs.forEach((r, j) => {
    const want =
      meta.runs[j].bmin +
      (meta.runs[j].bmax - meta.runs[j].bmin) *
        (Math.log(meta.runs[j].bytes / STORAGE_LEVEL_SCALE.lo) / Math.log(STORAGE_LEVEL_SCALE.hi / STORAGE_LEVEL_SCALE.lo));
    if (Math.abs(r.w - want) > 0.6) out.push(`run ${j} is ${r.w} px, not its log size ${want.toFixed(1)}`);
  });
  if (/L0/.test(textOf('stack-caption') ?? '')) out.push('the ratio caption covers L0');
  // A bar says only what its run holds: a lookup never fills it, it reads one block of it.
  for (const r of runs) if (r.cls !== 'run') out.push(`run bar ${r.id} drawn as "${r.cls}"`);
  for (const b of prims.filter((p): p is Rect => p.k === 'rect' && p.id.startsWith('block-'))) {
    const bar = byId(b.id.replace('block-', 'run-')) as Rect;
    if (b.w !== BLOCK_W || b.x < bar.x || b.x + b.w > bar.x + bar.w) out.push(`read block ${b.id} is not one block on its bar`);
    if (!/read|found/.test(textOf(`chip-${b.id.replace('block-', '')}`) ?? 'read')) out.push(`read block ${b.id} with no read chip`);
  }
  // A level chip claims the model's average only where the drawn level can take `ratio` merges; else it is the model's.
  for (let j = 1; j <= m.lsm.levels; j++) {
    const chip = textOf(`chip-${j}`);
    if (s.op !== 0 || !chip || chip === '?×') continue;
    if (chargedOnly(m, j) !== chip.includes('model'))
      out.push(`L${j} chip "${chip}" for a level of ${m.lsm.levelBytes[j - 1] / 2 ** 20} MB`);
  }
  // The record's outline and the sentence that names it come together.
  const stairSaid = textPrims
    .filter((p) => p.id.startsWith('stair-text'))
    .map((p) => p.spans.map((x) => x.t).join(''))
    .join(' ');
  if (byId('stair-mine') && !/outlined/i.test(stairSaid)) out.push('the record outlined with no word for it');
  // How each engine writes, at random or in sequence, is on the stage whatever the width.
  if (!(textOf('write-btree') ?? 'random').includes('random') && !hid.btNumbers) out.push(`"${textOf('write-btree')}" without "random"`);
  if (!(textOf('write-lsm') ?? 'sequential').includes('sequential') && !hid.lsmNumbers)
    out.push(`"${textOf('write-lsm')}" without "sequential"`);
  // A false-positive rate is a filter's: with several filters asked, the stage says so.
  const filterSaid = textPrims
    .filter((p) => p.id.startsWith('filter-text'))
    .map((p) => p.spans.map((x) => x.t).join(''))
    .join(' ');
  if (/1 (lookup )?in 100/.test(filterSaid) && !new RegExp(`a filter|per filter|${m.lsm.skipped} in 100`).test(filterSaid))
    out.push(`a false-positive rate not per filter: "${filterSaid}"`);
  if (meta.freeEdge) {
    const k = (meta.freeEdge.x - meta.freeEdge.x0) / meta.freeEdge.recPx;
    if (Math.abs(k - Math.round(k)) * meta.freeEdge.recPx > 0.15) out.push(`the free rule falls inside a record (${k.toFixed(2)})`);
  }
  if (meta.tick) {
    const t = meta.tick;
    const d = t.anchor === 'start' ? t.x0 - t.at : t.anchor === 'end' ? t.at - t.x1 : Math.abs((t.x0 + t.x1) / 2 - t.at);
    if (Math.abs(d) > 6) out.push(`the tick's value ${d.toFixed(1)} px from its tick`);
  }
  // No panel text names the other operation, but the play's step and the leaf's chip, which tell the read before a write.
  for (const p of textPrims) {
    if (!/^(bt|lsm)-/.test(p.owner ?? '') || p.id === 'bt-leaf-action') continue;
    const said = p.spans.map((x) => x.t).join('');
    if (s.op === 0 ? /\bread\b/i.test(said) : /\bwrit/i.test(said)) out.push(`"${said}" following a ${s.op ? 'lookup' : 'write'}`);
  }
  if (!hid.locked && prims.some((p) => /\b(hidden-box|hidden)\b/.test(p.cls))) out.push('a dashed mark with no question open');
  for (const g of prims.filter((p) => p.id.startsWith('ghost-'))) {
    const e = g.id.replace('ghost-', '');
    if (!/was /.test(textOf(`write-${e}`) ?? '')) out.push(`a ghost tick on ${e} with no "was"`);
  }
  if (prims.length > 420) out.push(`${prims.length} marks`);
  return out;
}

function draw(s: StorageSettings, W: number, view: Partial<StageView> = {}) {
  const v = { ...REST, ...view };
  const st = buildStage(W, storageScenario(s), v);
  return { st, out: [...collisions(st), ...assertions(st, s, v)] };
}
const failures = (list: { what: string; out: string[] }[]) =>
  list.filter((f) => f.out.length).map((f) => `${f.what}: ${f.out.slice(0, 3).join('; ')}`);

/** A question's view at a phase, as the widget builds it. */
function questionView(e: ExperimentSpec, phase: QuestionPhase | 'start' | 'met', frac = 0.6): { s: StorageSettings; view: StageView } {
  const setup = { ...B, ...e.setup } as StorageSettings;
  const act = { ...setup, ...(e.act && 'set' in e.act ? e.act.set : {}) } as StorageSettings;
  if (e.goal) return { s: phase === 'met' ? { ...setup, data: 100, ratio: 5, bloom: 0 } : setup, view: REST };
  const engine: Engine = e.act && 'run' in e.act && e.act.run === 'lsm' ? 'lsm' : 'btree';
  const q = phase as QuestionPhase;
  return {
    s: q === 'asking' ? setup : act,
    view: {
      ...REST,
      hid: hiding(e.hide ?? [], q),
      play: q === 'playing' ? { engine, frac } : null,
      ghost: q === 'revealed' && e.act && 'set' in e.act ? setup : null,
      focus: q === 'revealed' ? e.focus : [],
    },
  };
}

describe('storage layout', { timeout: 60_000 }, () => {
  it('sets the engines side by side from a 500 px stage', () => {
    expect(buildStage(TWO_FROM - 1, storageScenario(B), REST).meta.panels.two).toBe(false);
    expect(buildStage(TWO_FROM, storageScenario(B), REST).meta.panels.two).toBe(true);
  });

  it('keeps one height per width, whatever the setting, a play or a question in any phase', { timeout: 120_000 }, () => {
    const heights: Record<number, number[]> = {};
    for (const W of [...WIDTHS, 700, 800]) {
      const hs = new Set<number>();
      for (const s of ALL) hs.add(buildStage(W, storageScenario(s), REST).H);
      for (const s of ALL.filter((_, i) => i % 9 === 0))
        for (const engine of ENGINES) hs.add(buildStage(W, storageScenario(s), { ...REST, play: { engine, frac: 0.5 } }).H);
      for (const e of STORAGE_EXPERIMENTS)
        for (const phase of e.goal ? (['start', 'met'] as const) : (['asking', 'playing', 'revealed'] as const)) {
          const q = questionView(e, phase);
          hs.add(buildStage(W, storageScenario(q.s), q.view).H);
        }
      heights[W] = [...hs];
    }
    for (const [W, hs] of Object.entries(heights)) expect(hs, `${W}px`).toHaveLength(1);
    // A step function of width: three workload lines to about 333 px, two to about 584, one above; the engines side
    // by side from 500 px. The steps land within 3 px of the mockup's, whose canvas rounds a hair narrower.
    const H = (W: number) => buildStage(W, storageScenario(B), REST).H;
    const steps: [number, number][] = [];
    for (let W = 248; W <= 800; W++) if (!steps.length || steps[steps.length - 1][1] !== H(W)) steps.push([W, H(W)]);
    expect(
      steps.map(([, h]) => h),
      JSON.stringify(steps),
    ).toEqual([1452, 1434, 908, 890]);
    for (const [[W], want] of steps.slice(1).map((st, i) => [st, [333, 500, 584][i]] as const))
      expect(Math.abs(W - want)).toBeLessThanOrEqual(3);
  });

  it('draws every setting at rest with nothing on anything, at every width', { timeout: 240_000 }, () => {
    const list: { what: string; out: string[] }[] = [];
    for (const W of WIDTHS)
      for (const [i, s] of ALL.entries())
        if ([252, 322, 344, 620].includes(W) || i % 5 === W % 5) list.push({ what: `${W}px ${show(s)}`, out: draw(s, W).out });
    expect(failures(list)).toEqual([]);
  });

  it('draws both plays at every moment of their clocks, with nothing for an event before its moment', { timeout: 240_000 }, () => {
    const list: { what: string; out: string[] }[] = [];
    for (const W of [252, 344, 620])
      for (const [i, s] of ALL.entries()) {
        if (i % 3) continue;
        for (const engine of ENGINES)
          for (const frac of [0, 0.15, 0.3, 0.45, 0.55, 0.8, 0.99, 1]) {
            const { st, out } = draw(s, W, { play: { engine, frac } });
            list.push({ what: `${W}px ${show(s)} ${engine} ${frac}`, out });
            // A mark drawn for a step names it in its id; none shows before the clock reaches that step.
            const P = planOf(engine, storageScenario(s));
            const ids = new Set(st.D.prims().map((p) => p.id));
            if (
              engine === 'btree' &&
              s.op === 0 &&
              frac < P['page'] &&
              st.D.prims().some(
                (p) => (p.id.startsWith('pg-') && p.cls.includes('written')) || (p.id === 'page-strip' && p.cls.includes('rewritten')),
              )
            )
              list.push({ what: `${show(s)} ${frac}`, out: ['the page written back before its moment'] });
            if (engine === 'lsm' && frac < P['ledger'] && ids.has('lsm-total'))
              list.push({ what: `${show(s)} ${frac}`, out: ['the ledger before its moment'] });
            if (engine === 'btree' && frac < P['ledger'] && ids.has('bt-total'))
              list.push({ what: `${show(s)} ${frac}`, out: ['the ledger before its moment'] });
          }
      }
    expect(failures(list)).toEqual([]);
  });

  it('draws the record outline only with the sentence that names it, at every moment of the write, at every width', () => {
    const out: string[] = [];
    for (const W of WIDTHS)
      for (const s of [B, { ...B, ratio: 4 }, { ...B, ratio: 20, data: 1000 }]) {
        const m = storageScenario(s);
        for (let f = 0; f <= 1; f += 0.005) {
          const prims = buildStage(W, m, { ...REST, play: { engine: 'lsm', frac: momentOf('lsm', m, f) } }).D.prims();
          const said = prims
            .filter((p): p is Extract<Prim, { k: 'text' }> => p.k === 'text' && p.id.startsWith('stair-text'))
            .map((p) => p.spans.map((x) => x.t).join(''))
            .join(' ');
          if (prims.some((p) => p.id === 'stair-mine') && !/outlined/i.test(said)) out.push(`${W}px r${s.ratio} at ${f.toFixed(3)}`);
        }
      }
    expect(out).toEqual([]);
  });

  it("glosses a level chip that says 'model' in the step line as the record reaches it, at every width", () => {
    const out: string[] = [];
    for (const W of WIDTHS)
      for (const s of ALL.filter((x) => x.op === 0 && x.page === 4)) {
        const m = storageScenario(s);
        for (let j = 1; j <= m.lsm.levels; j++) {
          if (!chargedOnly(m, j)) continue;
          const st = buildStage(W, m, { ...REST, play: { engine: 'lsm', frac: planOf('lsm', m)[`run${j}`] } });
          const step = st.D.texts.find((t) => t.s.includes(`L${j}`) && /merged/.test(t.s))?.s ?? '';
          if (!/model/.test(step)) out.push(`${W}px ${show(s)} L${j}: "${step}"`);
        }
      }
    expect(out).toEqual([]);
  });

  it('gives Describe the widest table form that fits its box unbroken, compact wrapping only between whole runs', () => {
    const heavy = ALL.reduce((a, s) => {
      const w = (x: StorageSettings) => {
        const t = describeTable(storageScenario(x), 1e4);
        return tableWidth(t.head, t.rows);
      };
      return w(s) > w(a) ? s : a;
    });
    // A compact head wraps at its spaces, and a row's name between the runs g-code-text keeps whole ("LSM, / ratio 10").
    const longest = (t: string, by: RegExp) => t.split(by).reduce((a, b) => (b.length > a.length ? b : a));
    const out: string[] = [];
    for (const W of [...WIDTHS, 1000])
      for (const s of [B, heavy, { ...B, op: 1, bloom: 0 }]) {
        const box = W + 2;
        const t = describeTable(storageScenario(s), box);
        const wide = tableWidth(t.head, t.rows);
        if (!t.compact && wide > box) out.push(`${W}px ${show(s)}: a full table ${wide} px in ${box}`);
        if (t.compact) {
          const short = tableOf(storageScenario(s), 'short');
          if (tableWidth(short.head, short.rows) <= box) out.push(`${W}px ${show(s)}: compact although a full table fits`);
          const wrapped = tableWidth(
            t.head.map((h) => longest(h, / /)),
            t.rows.map((r) => [longest(r[0], /, /), ...r.slice(1)]),
            true,
          );
          // Narrower than 280 px the compact table scrolls sideways inside its box, as every Describe table may.
          if (W >= 280 && wrapped > box) out.push(`${W}px ${show(s)}: a compact table ${wrapped} px in ${box}`);
        }
      }
    expect(out).toEqual([]);
    expect(describeTable(storageScenario(B), 622).head).toContain('Lookup');
    expect(describeTable(storageScenario(B), 760).head).toContain('Lookup, filters on');
  });

  it('says the setting before a change in words beside every ghost tick', { timeout: 120_000 }, () => {
    const list: { what: string; out: string[] }[] = [];
    for (const W of [252, 344, 620])
      for (const [i, s] of ALL.entries())
        if (i % 4 === 0) list.push({ what: `${W}px ${show(s)} ghost`, out: draw(s, W, { ghost: { ...B, op: s.op } }).out });
    expect(failures(list)).toEqual([]);
    const ghosted = buildStage(620, storageScenario({ ...B, page: 16 }), { ...REST, ghost: B });
    expect(ghosted.D.prims().some((p) => p.id === 'ghost-btree')).toBe(true);
    expect(ghosted.D.prims().some((p) => p.id === 'ghost-lsm')).toBe(false);
  });

  it('draws every experiment asking, playing and revealed, with a tag on every outline, at every width', { timeout: 120_000 }, () => {
    const list: { what: string; out: string[] }[] = [];
    for (const W of WIDTHS)
      STORAGE_EXPERIMENTS.forEach((e, i) => {
        const phases: [QuestionPhase | 'start' | 'met', number?][] = e.goal
          ? [['start'], ['met']]
          : [['asking'], ['playing', 0.1], ['playing', 0.5], ['playing', 0.9], ['playing', 1], ['revealed']];
        for (const [phase, frac] of phases) {
          const q = questionView(e, phase, frac);
          const { st, out } = draw(q.s, W, q.view);
          if (phase === 'revealed' && st.focus.length !== e.focus.length)
            out.push(`${st.focus.length} outlines for ${e.focus.length} regions`);
          list.push({ what: `${W}px E${i + 1} ${phase} ${frac ?? ''}`, out });
        }
      });
    expect(failures(list)).toEqual([]);
  });

  it('fails two outlines that touch: E1 pointed at the tree and the leaf page under it', { timeout: 60_000 }, () => {
    const e = STORAGE_EXPERIMENTS[0];
    for (const W of WIDTHS) {
      const q = questionView(e, 'revealed');
      const { out } = draw(q.s, W, { ...q.view, focus: ['bt-tree', 'bt-transform'] });
      expect(
        out.some((o) => o.startsWith('focus outlines')),
        `${W}px`,
      ).toBe(true);
    }
  });

  it('bounds its marks by the stage, never by the data', { timeout: 60_000 }, () => {
    let most = 0;
    for (const s of ALL) most = Math.max(most, buildStage(620, storageScenario(s), REST).D.prims().length);
    expect(most).toBeLessThan(420);
  });
});
