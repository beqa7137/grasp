import {
  RELIABILITY_ANSWER_PLAYS,
  RELIABILITY_EXPERIMENTS,
  RELIABILITY_SETTINGS,
  absorbedMoments,
  reliabilityAnswerHold,
  reliabilityPlayPlan,
  reliabilityRestMoment,
  reliabilityScenario,
  reliabilityStepMoments,
  reliabilityYear,
  renderExperiment,
  type ReliabilitySettings,
  type YearMoment,
} from '@grasp/engine';
import { sampleLine, type Edge } from './latency-draw';
import { buildStage, type Stage, type StageView } from './reliability-layout';
import { changedParts } from './reliability-widget.component';
import { singledOut } from './reliability-claims.testing';
import { NOTHING_HIDDEN, hiding, summary } from './reliability-words';

/** Every setting at several widths: many renders, longer than a unit test's default. */
const LONG_MS = 240_000;
const REST: StageView = { hid: NOTHING_HIDDEN, moment: null, into: 0, playing: false, ghost: null, challenge: null, focus: [], watch: '' };
const draw = (W: number, s: ReliabilitySettings, view: Partial<StageView> = {}): Stage => {
  const m = reliabilityScenario(s);
  const v = { ...REST, moment: reliabilityRestMoment(s), ...view };
  return buildStage(W, m, reliabilityYear(s), v, summary(m, v.hid));
};
const overlap = (a: Edge, b: Edge, by = 0.5) =>
  Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > by && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > by;
const share = (a: string, b: string) => !!a && !!b && a.split(' ').some((t) => b.split(' ').includes(t));
const GRID = /\b(gridline|axis|row-track|rule|split-track|moment)\b/;
const HIT = 44;
/**
 * The most marks a stage draws at any setting and width, a bound on the SVG's node count: three copies of every part with
 * both conditions on and "that hour" over an LB copy's outage, at 620 px.
 */
const PRIMS_MAX = 275;

/**
 * Every fault a drawing can have: a label with no place, text on text or off the stage, axis labels too close or not in
 * full, a line through text (a grid line only through ungrounded text), text on a mark, text at a focus outline's
 * stroke, the request's notes under 4 px from a bar, Play or a step button off the stage or on text, too many marks, and
 * a product parted across lines (a line with an unclosed group, or one ending or opening on "×").
 */
function faults(st: Stage): string[] {
  const { D } = st;
  const out = D.missing.map((t) => `no place for "${t}"`);
  const texts = D.texts;
  for (let i = 0; i < texts.length; i++) {
    const a = texts[i];
    if (a.x0 < 0 || a.x1 > st.W || a.y0 < 0 || a.y1 > st.H) out.push(`"${a.s}" off the stage`);
    for (let j = i + 1; j < texts.length; j++) if (overlap(a, texts[j])) out.push(`"${a.s}" on "${texts[j].s}"`);
  }
  for (const owner of ['r-top', 'r-bottom', 'weeks']) {
    const row = texts.filter((t) => t.owner === owner).sort((a, b) => a.x0 - b.x0);
    for (let i = 1; i < row.length; i++)
      if (row[i].x0 - row[i - 1].x1 < 6) out.push(`${owner} labels "${row[i - 1].s}" and "${row[i].s}" closer than 6 px`);
  }
  for (const t of texts.filter((x) => x.owner === 'r-top')) if (!/%$|nines$/.test(t.s)) out.push(`a tick label not in full: "${t.s}"`);
  const inside = (q: readonly number[], t: Edge) => q[0] > t.x0 + 0.5 && q[0] < t.x1 - 0.5 && q[1] > t.y0 + 0.5 && q[1] < t.y1 - 0.5;
  for (const l of D.links)
    for (const t of texts) if (!share(l.owner, t.owner) && l.points.some((q) => inside(q, t))) out.push(`line ${l.owner} through "${t.s}"`);
  const prims = D.prims();
  for (const p of prims)
    if (p.k === 'line' && GRID.test(p.cls))
      for (const t of texts.filter((x) => !x.ground))
        if (sampleLine(p.x1, p.y1, p.x2, p.y2, 2).some((q) => inside(q, t))) out.push(`grid ${p.id} through "${t.s}"`);
  for (const mk of D.marks)
    for (const t of texts) if (!share(t.owner, mk.owner) && overlap(mk, t, 0.5)) out.push(`text on mark ${mk.owner}: "${t.s}"`);
  const bars = D.marks.filter((mk) => mk.owner.startsWith('bar-'));
  for (const t of texts.filter((x) => ['capline', 'goal', 'ghost'].includes(x.owner)))
    for (const b of bars) {
      const gap = Math.max(b.x0 - t.x1, t.x0 - b.x1, b.y0 - t.y1, t.y0 - b.y1);
      if (gap < 4 - 0.01) out.push(`the note "${t.s}" ${gap.toFixed(1)} px from ${b.owner}`);
    }
  for (const f of st.focus)
    for (const t of texts) {
      const inner = t.x0 >= f.x + 3 && t.x1 <= f.x + f.width - 3 && t.y0 >= f.y + 3 && t.y1 <= f.y + f.height - 3;
      const clear = t.x1 <= f.x - 4 || t.x0 >= f.x + f.width + 4 || t.y1 <= f.y - 4 || t.y0 >= f.y + f.height + 4;
      if (!inner && !clear) out.push(`text at the ${f.region} outline's stroke: "${t.s}"`);
    }
  const buttons = [st.play, ...(st.steps ? [st.steps.prev, st.steps.next] : [])].map((b) => ({
    x0: b.x,
    x1: b.x + HIT,
    y0: b.y,
    y1: b.y + HIT,
  }));
  for (const b of buttons) {
    if (b.x0 < -0.5 || b.x1 > st.W + 0.5 || b.y0 < -0.5) out.push(`a button off the stage at ${b.x0}`);
    for (const t of texts) if (overlap(b, t)) out.push(`a button on "${t.s}"`);
  }
  for (let i = 1; i < buttons.length; i++) if (overlap(buttons[i - 1], buttons[i], 0)) out.push('two buttons on each other');
  if (prims.length > PRIMS_MAX) out.push(`${prims.length} marks, over ${PRIMS_MAX}`);
  for (const t of texts)
    if (t.s.split('(').length !== t.s.split(')').length || /(^| )×$|^× /.test(t.s)) out.push(`a product parted across lines at "${t.s}"`);
  out.push(...ghostFaults(st), ...hourFaults(st));
  return out;
}

/**
 * A marker and its words are one unit: both or neither, within 4 px of each other, and no other text between them. A
 * caret stacked over its words stands 2 px or more clear of them, centered on them or past their end, and no text lies
 * in the column it points along, from its tip to the request's bar and 4 px or more past the tip.
 */
function ghostFaults(st: Stage): string[] {
  const caret = st.D.prims(['top']).some((p) => p.id === 'ghost-caret');
  const words = st.D.texts.find((t) => t.owner === 'ghost');
  const g = st.meta['ghost'] as { caret: Edge; words: Edge; up: boolean; bar: number } | undefined;
  if (!caret && !words) return [];
  if (!caret || !words || !g) return [`a ghost ${caret ? 'caret without its words' : 'words without a caret'}`];
  const gap = Math.max(g.caret.x0 - g.words.x1, g.words.x0 - g.caret.x1, g.caret.y0 - g.words.y1, g.words.y0 - g.caret.y1);
  const out = gap > 4 ? [`the ghost's caret ${gap.toFixed(1)} px from "${words.s}"`] : [];
  const hull = {
    x0: Math.min(g.caret.x0, g.words.x0),
    x1: Math.max(g.caret.x1, g.words.x1),
    y0: Math.min(g.caret.y0, g.words.y0),
    y1: Math.max(g.caret.y1, g.words.y1),
  };
  for (const t of st.D.texts) if (t !== words && overlap(t, hull)) out.push(`"${t.s}" between the ghost's caret and its words`);
  const c = g.caret;
  const aim = g.up ? { ...c, y0: Math.min(g.bar, c.y0 - 4), y1: c.y0 } : { ...c, y0: c.y1, y1: Math.max(g.bar, c.y1 + 4) };
  for (const t of st.D.texts) if (t !== words && overlap(t, aim, 0)) out.push(`the ghost's caret points at "${t.s}"`);
  if (g.up) {
    if (g.words.y0 - c.y1 < 2 - 0.01) out.push(`the ghost's caret ${(g.words.y0 - c.y1).toFixed(1)} px over "${words.s}"`);
    const mid = (e: Edge) => (e.x0 + e.x1) / 2;
    const tip = mid(c);
    if (Math.abs(tip - mid(g.words)) > 2 && tip + 3.5 > g.words.x0 && tip - 3.5 < g.words.x1)
      out.push(`the ghost's caret over a glyph of "${words.s}", not centered on it`);
  }
  return out;
}

/**
 * "That hour" draws what its title names and nothing else: one copy down, the others up, no overlap inside its frame.
 * What would take the part down has its own dashed frame and "if" title: every copy down, the overlap column across
 * them all, inside every copy's outage and never in the critical tone. When its words add shared outages, the frame
 * draws one first: a joined mark through every row, wider than the overlap by chance and clear of it. Rows stand 14 px
 * apart.
 */
function hourFaults(st: Stage): string[] {
  const h = st.meta['hour'] as { title: string; ifTitle: string; body: string; down: string; rows: string[] } | undefined;
  if (!h) return [];
  const out: string[] = [];
  const top = st.D.prims(['marks', 'top']);
  const rects = (id: string) => top.filter((p) => p.id.startsWith(id)).flatMap((p) => (p.k === 'rect' ? [p] : []));
  const count = (id: string) => top.filter((p) => p.id.startsWith(id)).length;
  const n = h.rows.length;
  if (h.rows[0] !== h.down || count('hour-down') !== 1 || count('hour-up-') !== n - 1)
    out.push(`that hour draws ${count('hour-down')} down and ${count('hour-up-')} up for "${h.title}"`);
  if (!h.title.startsWith(`That hour: ${h.down} down, `) || !h.rows.slice(1).every((r) => h.title.includes(r)) || !h.title.endsWith(' up.'))
    out.push(`that hour's title "${h.title}" does not name its rows`);
  if (/\b(both|all \d) down\b/i.test(h.title) || !/^If (both|all \d) were down at once:$/.test(h.ifTitle))
    out.push(`that hour claims a state it does not draw: "${h.title}" "${h.ifTitle} ${h.body}"`);
  const back = st.D.prims(['back']).flatMap((p) => (p.k === 'rect' ? [p] : []));
  const frame = back.find((p) => p.id === 'hour-frame');
  const ifFrame = back.find((p) => p.id === 'hour-if-frame');
  if (!frame || !ifFrame || !/\bif\b/.test(ifFrame.cls) || ifFrame.y < frame.y + frame.h)
    out.push('that hour has no "if" frame of its own under it');
  const within = (a: { x: number; y: number; w: number; h: number }, f: { x: number; y: number; w: number; h: number }) =>
    a.x < f.x + f.w && f.x < a.x + a.w && a.y < f.y + f.h && f.y < a.y + a.h;
  if (frame)
    for (const p of top)
      if (p.k === 'rect' && p.id !== 'hour-down' && within(p, frame)) out.push(`${p.id} drawn inside the frame of the hour that happened`);
  const both = rects('hour-both')[0];
  const downs = rects('hour-if-down-');
  if (downs.length !== n) out.push(`the "if" frame draws ${downs.length} copies down of ${n}`);
  if (!both || !ifFrame || both.y > ifFrame.y + 2 || both.y + both.h < ifFrame.y + ifFrame.h - 2 || both.w < 3)
    out.push('the "if" frame draws no overlap column across its rows');
  else {
    if (/critical|fail/.test(both.cls)) out.push(`the hypothetical overlap drawn as ${both.cls}`);
    for (const d of downs) if (both.x < d.x - 0.01 || both.x + both.w > d.x + d.w + 0.01) out.push(`the overlap column outside ${d.id}`);
  }
  const shared = rects('hour-if-shared');
  const said = /\bshared outages\b/.test(h.body);
  if (shared.length !== (said ? 1 : 0)) out.push(`the "if" frame draws ${shared.length} shared outages for "${h.body}"`);
  else if (said && ifFrame && both) {
    const [j] = shared;
    const rows = downs.map((d) => [d.y, d.y + d.h]).flat();
    if (j.y > Math.min(...rows) + 0.01 || j.y + j.h < Math.max(...rows) - 0.01) out.push('the shared outage does not join every copy');
    if (!within(j, ifFrame) || j.x < ifFrame.x || j.x + j.w > ifFrame.x + ifFrame.w) out.push('the shared outage outside the "if" frame');
    if (j.w <= both.w) out.push(`the shared outage ${j.w} px wide, no wider than the overlap by chance`);
    if (downs.some((d) => d.x < j.x + j.w + 1)) out.push('the shared outage not first, clear of the overlap by chance');
  }
  const ys = st.D.texts
    .filter((t) => h.rows.includes(t.s) && t.owner === 'hour')
    .map((t) => t.y0)
    .sort((a, b) => a - b);
  if (ys.length !== 2 * n) out.push(`that hour names ${ys.length} rows of ${2 * n}`);
  for (let i = 1; i < ys.length; i++)
    if (ys[i] - ys[i - 1] < 14 - 0.01) out.push(`that hour's rows ${(ys[i] - ys[i - 1]).toFixed(1)} px apart`);
  return out;
}

/** The chain's end mark, the moment's words and the request's row agree: a moment that fails ends in "fails". */
function agrees(st: Stage, mo: YearMoment): string[] {
  const out: string[] = [];
  if (st.chain.outcome !== (mo.fails ? 'fails' : 'served')) out.push(`week ${mo.week + 1} ${mo.kind} ends ${st.chain.outcome}`);
  if (mo.fails !== (st.meta['requestWeeks'] as number[]).includes(mo.week)) out.push(`week ${mo.week + 1}: the request's row disagrees`);
  return out;
}

describe('the Reliability stage', () => {
  it(
    'draws every setting with no collision, at one height per width, and with what the model and the year say',
    () => {
      for (const W of [252, 322, 620]) {
        const heights = new Set<number>();
        for (const s of RELIABILITY_SETTINGS) {
          const st = draw(W, s);
          const key = `${W} ${JSON.stringify(s)}`;
          expect(faults(st), key).toEqual([]);
          heights.add(st.H);
          const m = reliabilityScenario(s);
          const y = reliabilityYear(s);
          // The request's row is exactly the union of the strips of the parts it needs.
          expect(st.meta['requestWeeks'], key).toEqual(y.fails.map((f) => f.week));
          // The bold, capped and named parts are exactly those printing the worst value.
          expect(
            st.D.prims(['top'])
              .filter((p) => p.id.startsWith('capend-'))
              .map((p) => p.id.slice(7)),
            key,
          ).toEqual([...m.weakest]);
          const ends = st.meta['ends'] as Record<string, number>;
          for (const p of m.parts.filter((x) => !x.optional)) expect(ends['request'], key).toBeLessThanOrEqual(ends[p.id] + 1e-6);
          // The bypass lands 6 px or more before the outcome's ring, and its lane is named.
          if (st.chain.bypassX !== null) {
            expect(st.chain.bypassX, key).toBeLessThanOrEqual(st.chain.outcomeX0 - 6);
            expect(
              st.D.texts.some((t) => t.owner.includes('bypass')),
              key,
            ).toBe(true);
          }
          // The ring stands round a drawn tick, at the moment's week.
          const ring = st.meta['ring'] as { week: number; kind: string } | undefined;
          const mo = reliabilityRestMoment(s);
          if (mo) expect(ring?.week, key).toBe(mo.week);
          if (mo) expect(agrees(st, mo), key).toEqual([]);
          // Every outlined paper length is named, beside it or inside it (on phones the key names it too).
          for (const p of m.parts.filter((x) => !x.optional && x.paperNines - x.nines > 0.05))
            if (W >= 520) expect(st.meta[`paper-${p.id}`], `${key} ${p.id}`).toBe(true);
        }
        expect([...heights], `${W}`).toHaveLength(1);
      }
    },
    LONG_MS,
  );

  it(
    'draws every step moment at rest with its end mark, its words and the request’s row agreeing',
    () => {
      for (const W of [252, 620])
        for (const s of RELIABILITY_SETTINGS.filter((_, i) => i % 3 === 0))
          for (const mo of reliabilityStepMoments(s)) {
            const st = draw(W, s, { moment: mo });
            const key = `${W} ${JSON.stringify(s)} week ${mo.week + 1}`;
            expect(faults(st), key).toEqual([]);
            expect(agrees(st, mo), key).toEqual([]);
          }
    },
    LONG_MS,
  );

  it(
    'draws the “if” frame as its words say with shared failures on, for every part a copy’s outage leaves up, at every setting and width',
    () => {
      for (const s of RELIABILITY_SETTINGS.filter((x) => x.shared)) {
        const moments = absorbedMoments(reliabilityYear(s), { ...reliabilityScenario(s).settings, failover: 1 });
        const firsts = moments.filter((mo, i) => moments.findIndex((o) => o.part === mo.part) === i);
        for (const W of [248, 322, 361, 620])
          for (const mo of firsts) {
            const st = draw(W, s, { moment: mo });
            const key = `${W} ${JSON.stringify(s)} week ${mo.week + 1}`;
            expect(st.meta['hour'], key).toBeDefined();
            expect(faults(st), key).toEqual([]);
          }
      }
    },
    LONG_MS,
  );

  it(
    'keeps one height per width through ghosts, the challenge and plays, at many widths',
    () => {
      const sample = RELIABILITY_SETTINGS.filter((_, i) => i % 13 === 0);
      for (const W of [248, 270, 300, 344, 400, 452, 500, 519, 520, 560, 640, 700]) {
        const H = draw(W, sample[0]).H;
        for (const s of sample) {
          const ghost = RELIABILITY_SETTINGS[(RELIABILITY_SETTINGS.indexOf(s) + 300) % RELIABILITY_SETTINGS.length];
          for (const view of [{ ghost }, { ghost, challenge: { met: false } }, { ghost, challenge: { met: true } }]) {
            const st = draw(W, s, view);
            expect(faults(st), `${W} ${JSON.stringify(s)} ${JSON.stringify(view)}`).toEqual([]);
            expect(st.H).toBe(H);
          }
          const plan = reliabilityPlayPlan(s);
          for (const h of plan.holds)
            for (const into of [0, 1]) {
              const st = draw(W, s, { playing: true, moment: h, into });
              expect(faults(st), `${W} ${JSON.stringify(s)} hold ${h.week}`).toEqual([]);
              expect(st.H).toBe(H);
            }
          expect(faults(draw(W, s, { playing: true, moment: null })), `${W} between holds`).toEqual([]);
        }
      }
    },
    LONG_MS,
  );

  it(
    'draws every experiment asking, playing and revealed at 12 widths, each focus region with a visible tag',
    () => {
      // The check that guards the asking axis catches the narrow axis that once printed only E2's answer among its choices.
      const parallel = renderExperiment(RELIABILITY_EXPERIMENTS[1]);
      expect(singledOut(['99.9%', '6 nines', '9 nines', '8.8 h', '32 s', '0.03 s'], parallel)).toBe('32 s');
      expect(singledOut(['8.8 h', '53 min', '32 s', '0.03 s'], parallel)).toBeNull();
      for (const e of RELIABILITY_EXPERIMENTS.map(renderExperiment)) {
        const changed = changedParts(e);
        const setup = { ...reliabilityScenario(e.setup).settings };
        const act = { ...setup, ...(e.act && 'set' in e.act ? e.act.set : {}) };
        const play = RELIABILITY_ANSWER_PLAYS[e.id];
        for (const W of [248, 252, 280, 300, 322, 344, 380, 412, 480, 520, 600, 700]) {
          const H = draw(W, setup).H;
          const views: [string, ReliabilitySettings, Partial<StageView>][] = e.goal
            ? [
                ['start', setup, { challenge: { met: false } }],
                ['met', { ...setup, lb: 2, app: 2, db: 2, optional: 1 }, { challenge: { met: true }, ghost: setup, focus: e.focus }],
              ]
            : [
                ['asking', setup, { hid: hiding(e.hide, 'asking', changed), watch: play.watch }],
                [
                  'playing',
                  act,
                  {
                    hid: hiding(e.hide, 'playing', changed),
                    watch: play.watch,
                    playing: true,
                    moment: reliabilityAnswerHold(act, changed, play.hold) as YearMoment,
                  },
                ],
                ['revealed', act, { moment: reliabilityAnswerHold(act, changed, play.hold), ghost: setup, focus: e.focus }],
              ];
          for (const [phase, s, view] of views) {
            const st = draw(W, s, view);
            const key = `${e.id} ${phase} ${W}`;
            expect(faults(st), key).toEqual([]);
            if (phase === 'asking') {
              const axis = st.D.texts.filter((t) => t.owner === 'r-top' || t.owner === 'r-bottom').map((t) => t.s);
              expect(singledOut(axis, e), key).toBeNull();
            }
            if (phase === 'revealed' && view.moment) expect(agrees(st, view.moment), key).toEqual([]);
            expect(st.H, key).toBe(H);
            if (view.focus?.length) {
              const regions = e.focus.includes('chain') && e.focus.includes('timeline') ? 1 : e.focus.length;
              expect(st.focus, key).toHaveLength(regions);
              for (const f of st.focus) expect(f.tag.y + 16, key).toBeLessThanOrEqual(st.H);
            }
          }
        }
      }
    },
    LONG_MS,
  );
});
