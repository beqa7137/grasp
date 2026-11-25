import {
  DURABILITY_BASELINE as B,
  DURABILITY_CHALLENGE_GOAL,
  DURABILITY_CHALLENGE_SOLUTION,
  DURABILITY_EXPERIMENTS,
  DURABILITY_SETTINGS as ALL,
  durabilityPlan,
  durabilityScenario,
  durabilityStagedFailures,
  goalMet,
  type DurabilityPlayKind,
  type DurabilitySettings,
  type ExperimentSpec,
} from '@grasp/engine';
import { FALSE_CLAIMS } from './durability-claims.testing';
import { layoutConsts, type Stage, type StageView } from './durability-draw';
import { buildStage } from './durability-layout';
import { NMAX, NMIN, ROW, ninesX } from './durability-walk';
import { REST } from './durability-views.testing';
import { hiding, type QuestionPhase } from './durability-words';
import { sampleLine, type Edge, type Prim } from './stage-draw';

const WIDTHS = [252, 270, 286, 300, 322, 344, 360, 412, 460, 520, 620, 700];
const KINDS: DurabilityPlayKind[] = ['repair', 'staged'];
const show = (s: DurabilitySettings) => `scheme${s.scheme} ${s.afr}% ${s.repair} h rack${s.rack}`;
const overlap = (a: Edge, b: Edge, by = 0) =>
  Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > by && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > by;
const share = (a: string, b: string) => !!a && !!b && a.split(' ').some((t) => b.split(' ').includes(t));
const LINES = /\b(read|step-arrow|from-tick|goal-line|playhead|axis|track|rule|ghost-step)\b/;
const GRID = /\b(axis|track|rule)\b/;
type Circle = Extract<Prim, { k: 'circle' }>;

/**
 * What a reader would see as broken: text on text or off the stage, two labels on a line under 6 px apart, axis labels
 * under 6 px apart, a line through text, text on a mark, a dot on a dot, a mark off the stage, text at a focus
 * outline's stroke, a tag off its outline's edge, controls on each other or under 44 px, and any label with no place.
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
        if (
          Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 2 &&
          gap < 6 &&
          gap > -0.5 &&
          !share(a.owner, b.owner) &&
          !(a.owner.startsWith('disk-') && b.owner.startsWith('disk-'))
        )
          out.push(`labels ${gap.toFixed(1)} px apart: "${a.s}" / "${b.s}"`);
      }
    }
  }
  for (const ticks of [st.meta.raceTicks, st.meta.nineTicks, st.meta.billionTicks]) {
    const sorted = [...ticks].sort((a, b) => a.x0 - b.x0);
    for (let i = 1; i < sorted.length; i++)
      if (sorted[i].x0 - sorted[i - 1].x1 < 6) out.push(`axis labels under 6 px apart at ${sorted[i].x0}`);
  }
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
  // A disk's outline holds only its own name; the one-rack outline holds whole texts, never one across its stroke.
  for (const p of prims)
    if (p.k === 'rect' && /^rack\b/.test(p.cls)) {
      const f = { x0: p.x, x1: p.x + p.w, y0: p.y, y1: p.y + p.h };
      const mine = p.id === 'rack-free' ? 'spare' : p.id.replace(/^rack-/, 'disk-');
      for (const t of texts) {
        if (!overlap(f, t, 0.5) || (p.id !== 'rack-all' && share(t.owner, mine))) continue;
        const whole = t.x0 >= f.x0 + 1 && t.x1 <= f.x1 - 1 && t.y0 >= f.y0 + 1 && t.y1 <= f.y1 - 1;
        if (p.id !== 'rack-all' || !whole) out.push(`"${t.s}" in the ${p.id} outline`);
      }
    }
  // An old arrow keeps to its own row's lane: 2 px clear of every text.
  for (const mk of D.marks.filter((k) => k.owner.startsWith('ghost-row')))
    for (const t of texts)
      if (overlap({ x0: mk.x0 - 2, x1: mk.x1 + 2, y0: mk.y0 - 2, y1: mk.y1 + 2 }, t)) out.push(`an old arrow at "${t.s}"`);
  const dots = prims.filter((p): p is Circle => p.k === 'circle' && /\b(dot-final|head-first|xground|ok-ring)\b/.test(p.cls));
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
      const inner = t.x0 >= f.x + 3 && t.x1 <= f.x + f.width - 3 && t.y0 >= f.y + 3 && t.y1 <= f.y + f.height - 3;
      const clear = t.x1 <= f.x - 4 || t.x0 >= f.x + f.width + 4 || t.y1 <= f.y - 4 || t.y0 >= f.y + f.height + 4;
      if (!inner && !clear) out.push(`text at the ${f.region} outline's stroke: "${t.s}"`);
    }
    const tag = { x0: f.tag.x, x1: f.tag.x + 60, y0: f.tag.y, y1: f.tag.y + 16 };
    if (tag.x0 < 3 || tag.x1 > W - 3 || tag.y0 < 3 || tag.y1 > H - 3) out.push(`the ${f.region} tag off the stage`);
    for (const g of st.focus)
      if (g !== f) {
        const edges = [
          { x0: g.x, x1: g.x + g.width, y0: g.y, y1: g.y },
          { x0: g.x, x1: g.x + g.width, y0: g.y + g.height, y1: g.y + g.height },
          { x0: g.x, x1: g.x, y0: g.y, y1: g.y + g.height },
          { x0: g.x + g.width, x1: g.x + g.width, y0: g.y, y1: g.y + g.height },
        ];
        if (edges.some((e) => e.x1 >= tag.x0 && e.x0 <= tag.x1 && e.y1 >= tag.y0 && e.y0 <= tag.y1))
          out.push(`the ${f.region} tag across the ${g.region} outline`);
      }
  }
  const hits = st.hits.map((h) => ({ o: h.kind, x0: h.x, x1: h.x + h.w, y0: h.y, y1: h.y + h.h }));
  for (let i = 0; i < hits.length; i++) {
    const a = hits[i];
    if (a.x0 < -4.5 || a.x1 > W + 0.5 || a.y0 < -0.5 || a.y1 > H + 0.5) out.push(`hit box off-stage: ${a.o}`);
    if (a.y1 - a.y0 < 43.5 || a.x1 - a.x0 < 43.5) out.push(`target under 44 px: ${a.o}`);
    for (let j = i + 1; j < hits.length; j++) if (overlap(a, hits[j])) out.push(`hit on hit: ${a.o} / ${hits[j].o}`);
  }
  return out;
}

const textOf = (st: Stage, id: string) =>
  st.D.prims()
    .filter((p): p is Extract<Prim, { k: 'text' }> => p.k === 'text' && p.id === id)
    .map((p) => p.spans.map((x) => x.t).join(''))[0];

/** What must hold beyond collisions: the brief's assertions, by rule, at every setting and moment. */
export function assertions(st: Stage, s: DurabilitySettings, view: StageView): string[] {
  const out: string[] = [];
  const m = durabilityScenario(s);
  const { D, meta } = st;
  const ps = meta.ps;
  const prims = D.prims();
  const ids = new Set(prims.map((p) => p.id));
  const words = [...D.texts.map((t) => t.s), st.summary, ...st.hits.map((h) => h.text)].join(' | ');
  for (const g of FALSE_CLAIMS) if (g.test(words)) out.push(`false claim ${g}: "${words.match(g)![0]}"`);
  if (new Set(meta.diskNames).size !== meta.diskNames.length) out.push(`disk names repeat: ${meta.diskNames.join(' ')}`);
  // The picture and the race's sentence agree on a loss and on the rebuild.
  if (ps.lost !== /the object is lost|nothing is left to rebuild from/.test(meta.raceText))
    out.push(`lost ${ps.lost} but "${meta.raceText}"`);
  if (ps.lost !== ids.has('obj-x')) out.push('the object is crossed only when lost');
  if (ps.lost && !meta.lostSaid) out.push('a lost object without "nothing is left to rebuild from"');
  if (ps.rebuilt !== /^\S+ is rebuilt on a free disk/.test(meta.raceText)) out.push(`rebuilt ${ps.rebuilt} but "${meta.raceText}"`);
  if (view.kind === 'staged' && (meta.stagedTags !== 1 || !meta.raceText.startsWith('Staged, not sampled')))
    out.push('a staged play not said to be staged');
  if (view.kind !== 'staged' && meta.stagedTags) out.push('a staged tag on a typical repair');
  // The reads drawn are the scheme's, or none once lost; a reads box only while the reads hide.
  if (meta.readStubs && meta.readStubs !== m.repairRead) out.push(`${meta.readStubs} read stubs for ${m.repairRead} reads`);
  if (meta.readBlocks && meta.readBlocks !== m.repairRead) out.push(`${meta.readBlocks} read blocks for ${m.repairRead} reads`);
  if (ps.lost && (meta.readStubs || meta.readsBox)) out.push('reads drawn for a lost object');
  if (meta.readsBox !== (view.hid.reads && !ps.lost)) out.push('a reads box out of place');
  // Hidden means hidden: no step, no last dot, no ghost.
  if (view.hid.steps && meta.stepMarks) out.push('step marks while the steps hide');
  if (view.hid.steps !== meta.stepsBox) out.push('the steps box out of place');
  if (view.hid.loss && (meta.finalLanded || ids.has('final-dot'))) out.push('the loss drawn while it hides');
  if (view.hid.loss && meta.ninesShown !== '?') out.push(`NINES reads "${meta.ninesShown}" while the loss hides`);
  if (view.hid.ghost && (meta.caret !== null || meta.wasRows.length || meta.ghostSteps.length))
    out.push('a ghost while a question is open');
  if (meta.playing && !ps.rows.final && meta.ninesShown !== '…' && !view.hid.loss) out.push('NINES before the last row lands');
  // The last dot sits at the model's nines; its value within 8 px.
  if (meta.final) {
    if (Math.abs(meta.final.x - ninesX(layoutConsts(st.D.W), m.nines)) > 0.01) out.push('the last dot off the model');
    const b = meta.final.box;
    if (b) {
      const d = Math.max(b.x0 - meta.final.x, meta.final.x - b.x1, b.y0 - meta.final.y, meta.final.y - b.y1);
      if (d > 14) out.push(`the last value ${d.toFixed(1)} px from its dot`);
    }
    if (!textOf(st, 'final-value')?.startsWith(`${(Math.round(m.nines * 10) / 10).toFixed(1)} nines`))
      out.push('the last value is not the model');
  }
  if (meta.caret !== null) {
    const w = meta.caretWords!;
    const d = Math.max(w.x0 - meta.caret, meta.caret - w.x1) - 7;
    if (d > 4) out.push(`the caret's words ${d.toFixed(1)} px from it`);
    for (const t of D.texts)
      if (
        t.owner.startsWith('val-') &&
        t.x1 > meta.caret - 12 &&
        t.x0 < meta.caret + 12 &&
        t.y1 > (meta.final?.y ?? 0) - 24 &&
        t.y0 < (meta.final?.y ?? 0) + 6
      )
        out.push(`"${t.s}" within 12 px of the caret`);
  }
  if (meta.goal) {
    const g = meta.goalWords;
    if (g && Math.max(g.x0 - meta.goal.gx, meta.goal.gx - g.x1) > 8) out.push('the goal words far from the goal');
    if (!g && !meta.finalWords.includes('goal:')) out.push('the goal said nowhere');
  }
  // Every row that says "(was …)" draws its old arrow; window rows' old and new arrows differ by one amount.
  for (const r of meta.wasRows)
    if (!meta.ghostSteps.some((g) => `row-${g.kind}${g.i ?? ''}` === r))
      out.push(`${r} says "was" with no old arrow (${JSON.stringify(meta.ghostSteps)})`);
  const wins = meta.ghostSteps.filter((g) => g.kind === 'window' && g.len > 8 && g.newLen > 8);
  for (const g of wins)
    if (Math.abs(g.len - g.newLen - (wins[0].len - wins[0].newLen)) > 0.6) out.push('window rows change by different amounts');
  // Every value on the scale.
  for (const st2 of m.steps) {
    const n = -Math.log10(st2.level);
    if (n < NMIN || n > NMAX) out.push(`a step at ${n} nines, off the scale`);
  }
  // The key names each kind with its count, under its own bracket.
  const counts = m.replicas ? [m.n] : [m.need, m.t];
  if (meta.keys.length === 1 && !m.replicas) {
    if (meta.keys[0].s !== `${m.need} data + ${m.t} parity`) out.push(`one key line "${meta.keys[0].s}"`);
  } else
    meta.keys.forEach((k, i) => {
      if (!k.s.startsWith(`${counts[i]} `)) out.push(`the key "${k.s}" without its count`);
      if (k.x0 < k.a - 0.5 || k.x0 > k.b) out.push(`the key "${k.s}" starts off its bracket`);
    });
  if (!meta.keys.length) out.push('no key');
  // Every factor that sets the loss is a row: the walk ends where the last row's dot is.
  // With one rack the two causes add: the sum lies within twice the larger, log10(2) nines on.
  const slack = 3 + (s.rack ? ninesX(layoutConsts(st.D.W), Math.log10(2)) - ninesX(layoutConsts(st.D.W), 0) : 0);
  if (meta.final && meta.walkEnd !== null && Math.abs(meta.walkEnd - meta.final.x) > slack)
    out.push(`the walk ends ${(meta.walkEnd - meta.final.x).toFixed(1)} px from the last dot`);
  if (s.rack && meta.final && meta.stepMarks && !meta.rowsShown.includes('row-rack')) out.push('one rack with no rack row');
  // The last row follows the last step drawn: no empty band of unused rows between them.
  const stepYs = prims.flatMap((p) => (p.k === 'line' && /^(step-arrow|from-tick)/.test(p.cls) ? [(p.y1 + p.y2) / 2] : []));
  if (meta.final && stepYs.length && !meta.playing && Math.abs(meta.final.y - Math.max(...stepYs) - (ROW + 21)) > 1)
    out.push(`the last row ${(meta.final.y - Math.max(...stepYs)).toFixed(0)} px under the last step`);
  if (prims.length > 240) out.push(`${prims.length} marks`);
  if (!view.hid.waits && prims.some((p) => p.cls.includes('bar-hidden'))) out.push('a dashed mark with no question open');
  return out;
}

export function draw(s: DurabilitySettings, W: number, view: Partial<StageView> = {}) {
  const v = { ...REST, ...view };
  const st = buildStage(W, durabilityScenario(s), v);
  return { st, out: [...collisions(st), ...assertions(st, s, v)] };
}
const failures = (list: { what: string; out: string[] }[]) =>
  list.filter((f) => f.out.length).map((f) => `${f.what}: ${f.out.slice(0, 3).join('; ')}`);

/** A question's view at a phase, as the widget builds it. */
export function questionView(
  e: ExperimentSpec,
  phase: QuestionPhase | 'start' | 'met',
  tau: number | null = null,
): { s: DurabilitySettings; view: StageView } {
  const setup = { ...B, ...e.setup } as DurabilitySettings;
  const act = { ...setup, ...(e.act && 'set' in e.act ? e.act.set : {}) } as DurabilitySettings;
  if (e.goal) {
    const s = phase === 'met' ? DURABILITY_CHALLENGE_SOLUTION : setup;
    const met = goalMet(DURABILITY_CHALLENGE_GOAL, durabilityScenario(s).metrics, s);
    return { s, view: { ...REST, challenge: true, met, ghost: phase === 'met' ? setup : null, focus: met ? e.focus : [] } };
  }
  const q = phase as QuestionPhase;
  const kind: DurabilityPlayKind = e.act && 'run' in e.act && e.act.run === 'staged' ? 'staged' : 'repair';
  return {
    s: q === 'asking' ? setup : act,
    view: {
      ...REST,
      hid: hiding(e.hide ?? [], q),
      kind: q === 'asking' ? 'repair' : kind,
      tau: q === 'playing' ? tau : null,
      live: q === 'playing',
      ghost: q === 'revealed' && e.act && 'set' in e.act ? setup : null,
      focus: q === 'revealed' ? e.focus : [],
    },
  };
}

/** Moments of a play to draw: before the failure, at it, inside the window, and at every event. */
export const momentsOf = (s: DurabilitySettings, kind: DurabilityPlayKind) => {
  const p = durabilityPlan(s, kind);
  return [0, p.fail + 0.01, p.winStart + p.win * 0.5, ...p.events.map((e) => e.at)];
};

describe('durability layout', { timeout: 240_000 }, () => {
  it('draws every setting at rest, both plays, at every width with nothing on anything', () => {
    const list = WIDTHS.flatMap((W) =>
      ALL.flatMap((s) => KINDS.map((kind) => ({ what: `${show(s)} ${kind} at ${W}`, out: draw(s, W, { kind }).out }))),
    );
    expect(failures(list)).toEqual([]);
  });

  it('draws every moment of both plays, live and stepped, at four widths', () => {
    const list = [252, 322, 412, 620].flatMap((W) =>
      ALL.filter((_, i) => i % 3 === 0).flatMap((s) =>
        KINDS.flatMap((kind) =>
          momentsOf(s, kind).flatMap((tau) => [
            { what: `${show(s)} ${kind} at ${tau.toFixed(2)} s, ${W}`, out: draw(s, W, { kind, tau, live: true }).out },
            { what: `${show(s)} ${kind} stepped at ${tau.toFixed(2)} s, ${W}`, out: draw(s, W, { kind, tau }).out },
          ]),
        ),
      ),
    );
    expect(failures(list)).toEqual([]);
  });

  it('draws the old walk beside the new one after every change from the default and from 10 + 4', () => {
    const list = [252, 344, 460, 620].flatMap((W) =>
      ALL.flatMap((s) =>
        [B, { ...B, scheme: 3 }].map((ghost) => ({ what: `${show(s)} after ${show(ghost)} at ${W}`, out: draw(s, W, { ghost }).out })),
      ),
    );
    expect(failures(list)).toEqual([]);
    const slow = draw({ ...B, repair: 168 }, 620, { ghost: B }).st;
    expect(slow.meta.wasRows).toEqual(['row-window1', 'row-window2']);
    expect(slow.meta.caret).not.toBeNull();
    // A phone's stage keeps both "(was …)" too, a word space clear of each row's words.
    expect(draw({ ...B, repair: 168 }, 360, { ghost: B }).st.meta.wasRows).toEqual(['row-window1', 'row-window2']);
  });

  it('keeps one height per width, whatever the setting, a play or a question in any phase', () => {
    for (const W of [...WIDTHS, 760]) {
      const hs = new Set<number>();
      for (const s of ALL) for (const kind of KINDS) hs.add(buildStage(W, durabilityScenario(s), { ...REST, kind }).H);
      for (const s of ALL.filter((_, i) => i % 7 === 0))
        for (const kind of KINDS)
          for (const tau of momentsOf(s, kind)) hs.add(buildStage(W, durabilityScenario(s), { ...REST, kind, tau, live: true }).H);
      for (const e of DURABILITY_EXPERIMENTS)
        for (const phase of e.goal ? (['start', 'met'] as const) : (['asking', 'playing', 'revealed'] as const)) {
          const { s, view } = questionView(e, phase, phase === 'playing' ? 1 : null);
          hs.add(buildStage(W, durabilityScenario(s), view).H);
        }
      expect([...hs], `width ${W}`).toHaveLength(1);
    }
  });

  it('asks, plays and reveals every experiment at every width, one placed tag an outline', () => {
    const list = WIDTHS.flatMap((W) =>
      DURABILITY_EXPERIMENTS.flatMap((e) => {
        const phases = e.goal ? (['start', 'met'] as const) : (['asking', 'playing', 'revealed'] as const);
        return phases.flatMap((phase) => {
          const taus =
            phase === 'playing'
              ? momentsOf({ ...B, ...e.setup, ...(e.act && 'set' in e.act ? e.act.set : {}) } as DurabilitySettings, 'repair')
              : [null];
          return taus.map((tau) => {
            const { s, view } = questionView(e, phase, tau);
            const r = draw(s, W, view);
            const tags = r.out.filter((o) => o.includes('a tag for'));
            const outlined = r.st.focus.flatMap((f) => f.region.split(' '));
            if (view.focus.some((id) => !outlined.includes(id))) tags.push('an outline missing');
            return { what: `${e.id} ${phase} ${tau ?? ''} at ${W}`, out: [...r.out, ...tags] };
          });
        });
      }),
    );
    expect(failures(list)).toEqual([]);
  });

  it('draws the challenge at every setting it allows, both plays and their moments, met or not, at every width', () => {
    const e = DURABILITY_EXPERIMENTS.find((x) => x.goal)!;
    const setup = { ...B, ...e.setup } as DurabilitySettings;
    const list = WIDTHS.flatMap((W) =>
      ALL.filter((s) => s.afr === setup.afr).flatMap((s) => {
        const met = goalMet(DURABILITY_CHALLENGE_GOAL, durabilityScenario(s).metrics, s);
        const base = { challenge: true, met, ghost: setup, focus: met ? e.focus : [] };
        return KINDS.flatMap((kind) =>
          [null, ...momentsOf(s, kind)].map((tau) => ({
            what: `challenge ${show(s)} ${kind} ${tau ?? 'rest'} at ${W}`,
            out: draw(s, W, { ...base, kind, tau, live: tau !== null }).out,
          })),
        );
      }),
    );
    expect(failures(list)).toEqual([]);
  });

  it('names a staged failure once, and zooms the race to its window where the crosses cannot stand apart on the week', () => {
    for (const W of WIDTHS)
      for (const s of ALL.filter((v) => !v.rack)) {
        const { st } = draw(s, W, { kind: 'staged' });
        const m = durabilityScenario(s);
        expect(st.meta.stagedShown, show(s)).toBe(durabilityStagedFailures(m).length);
        expect(
          st.meta.stagedNames.every((n) => n.ok),
          `${show(s)} at ${W}`,
        ).toBe(true);
        const xs = st.meta.stagedNames.map((n) => n.x).sort((a, b) => a - b);
        for (let i = 1; i < xs.length; i++) expect(xs[i] - xs[i - 1], `${show(s)} at ${W}`).toBeGreaterThanOrEqual(11);
      }
  });

  it('bounds its marks by the scheme, never by the clock', () => {
    const heavy = { scheme: 3, afr: 10, repair: 168, rack: 1 };
    for (const tau of momentsOf(heavy, 'staged'))
      expect(draw(heavy, 700, { kind: 'staged', tau, live: true }).st.D.prims().length).toBeLessThan(240);
  });
});
