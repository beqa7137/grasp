import {
  RECOVERY_ARCHIVE_EVERY_S,
  RECOVERY_BASELINE as B,
  RECOVERY_BASE_EVERY_H,
  RECOVERY_DISASTERS,
  RECOVERY_EXPERIMENTS,
  RECOVERY_PLANS,
  RECOVERY_REPLAY_SPEEDS,
  RECOVERY_RESTORE_GB_PER_MIN,
  RECOVERY_SETTINGS as ALL,
  RECOVERY_SIZES_GB,
  RECOVERY_SYNC,
  recoveryAfterX,
  recoveryBeforeX,
  recoveryScenario,
  renderExperiment,
  type RecoverySettings,
} from '@grasp/engine';
import { TAG } from './focus-layout';
import { RING_R, type StageView } from './recovery-draw';
import { buildStage, padOf, type Stage } from './recovery-layout';
import { NOTHING_HIDDEN, hiding, lossWords, rtoSpan, type QuestionPhase } from './recovery-words';
import type { Edge, Prim } from './stage-draw';

const show = (s: RecoverySettings) =>
  `${s.disaster ? 'drop' : 'disk'} ${s.size}GB r${s.restore} b${s.base}h a${s.archive}s x${s.replay} ${s.sync ? 'sync' : 'async'}`;
const rest = (over: Partial<StageView> = {}): StageView => ({
  hid: NOTHING_HIDDEN,
  play: null,
  answering: false,
  ghost: null,
  told: false,
  challenge: false,
  focus: [],
  ...over,
});
/** Each control's values: a learner's ghost is the setting one change ago, so it differs from the current in one. */
const VALUES: Record<keyof RecoverySettings, readonly number[]> = {
  disaster: RECOVERY_DISASTERS,
  size: RECOVERY_SIZES_GB,
  restore: RECOVERY_RESTORE_GB_PER_MIN,
  base: RECOVERY_BASE_EVERY_H,
  archive: RECOVERY_ARCHIVE_EVERY_S,
  replay: RECOVERY_REPLAY_SPEEDS,
  sync: RECOVERY_SYNC,
};
const oneChangeAgo = (s: RecoverySettings) =>
  (Object.keys(VALUES) as (keyof RecoverySettings)[]).flatMap((k) => VALUES[k].filter((v) => v !== s[k]).map((v) => ({ ...s, [k]: v })));
const WIDTHS = [248, 252, 288, 322, 344, 380, 410, 460, 520, 560, 620, 700, 760];
const FRACS = [0.05, 0.12, 0.22, 0.26, 0.32, 0.4, 0.46, 0.6, 0.8, 0.95, 0.99];
const overlap = (a: Edge, b: Edge, m = 0) =>
  Math.min(a.x1, b.x1) - Math.max(a.x0, b.x0) > m && Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > m;
const byId = (st: Stage) => new Map(st.D.prims().map((p) => [p.id, p]));
const boxOf = (p: Prim): Edge | null =>
  p.k === 'rect'
    ? { x0: p.x, x1: p.x + p.w, y0: p.y, y1: p.y + p.h }
    : p.k === 'circle'
      ? { x0: p.cx - p.r, x1: p.cx + p.r, y0: p.cy - p.r, y1: p.cy + p.r }
      : p.k === 'line'
        ? { x0: Math.min(p.x1, p.x2), x1: Math.max(p.x1, p.x2), y0: Math.min(p.y1, p.y2), y1: Math.max(p.y1, p.y2) }
        : null;

/** What must hold on every render: the collisions a reader would see and the rules that keep the picture honest. */
function faults(st: Stage, s: RecoverySettings, view: StageView): string[] {
  const out: string[] = [];
  const { D, H, meta } = st;
  const W = D.W;
  const m = recoveryScenario(s);
  const P = m.plans;
  const prims = D.prims();
  const ids = byId(st);
  const texts = D.texts;
  const textOf = (id: string) => {
    const p = ids.get(id);
    return p && p.k === 'text' ? p.spans.map((x) => x.t).join('') : null;
  };
  for (const t of D.missing) out.push(`no room for "${t}"`);
  for (let i = 0; i < texts.length; i++) {
    const a = texts[i];
    if (a.x0 < 1 || a.x1 > W - 1 || a.y0 < 0 || a.y1 > H) out.push(`off the stage: "${a.s}"`);
    for (let j = i + 1; j < texts.length; j++) {
      const b = texts[j];
      if (overlap(a, b)) out.push(`text on text: "${a.s}" / "${b.s}"`);
      else if (Math.min(a.y1, b.y1) - Math.max(a.y0, b.y0) > 2 && Math.max(a.x0, b.x0) - Math.min(a.x1, b.x1) < 6)
        out.push(`labels closer than 6 px: "${a.s}" / "${b.s}"`);
    }
  }
  // Lines run across tracks only, never through a text; no mark sits under a text.
  const padded = texts.map((t) => ({ ...t, y0: t.y0 - 1, y1: t.y1 + 1 }));
  for (const p of prims) {
    if (p.k === 'text' || p.k === 'path') continue;
    const b = boxOf(p)!;
    if (b.x0 < -0.5 || b.x1 > W + 0.5 || b.y0 < -0.5 || b.y1 > H + 0.5) out.push(`a ${p.cls} off the stage`);
    for (const t of texts) if (overlap(b, t, 0.5)) out.push(`a ${p.cls} (${p.id}) under "${t.s}"`);
    // A vertical mark stops a pixel short of a text's box, which holds its ascenders and descenders.
    if (p.k === 'line' && p.x1 === p.x2) {
      const wide = { ...b, x0: b.x0 - 0.5, x1: b.x1 + 0.5 };
      for (const t of padded) if (overlap(wide, t)) out.push(`a ${p.cls} (${p.id}) touches "${t.s}"`);
    }
  }
  for (let i = 0; i < st.hits.length; i++) {
    const a = st.hits[i];
    const box = { x0: a.x, x1: a.x + a.w, y0: a.y, y1: a.y + a.h };
    if (a.w < 43.5 || a.h < 43.5) out.push(`a target under 44 px: ${a.owner}`);
    if (box.x0 < -0.5 || box.x1 > W + 0.5 || box.y1 > H + 0.5) out.push(`a control off the stage: ${a.owner}`);
    for (let j = i + 1; j < st.hits.length; j++) {
      const b = st.hits[j];
      if (overlap(box, { x0: b.x, x1: b.x + b.w, y0: b.y, y1: b.y + b.h })) out.push(`a control on a control: ${a.owner}`);
    }
    for (const t of texts) if (overlap(box, t, 0.5)) out.push(`a control on "${t.s}"`);
  }
  for (const axis of ['a', 'b', 'i'] as const) {
    const ts = [...meta.ticks[axis]].sort((p, q) => p.x0 - q.x0);
    for (let i = 1; i < ts.length; i++) if (ts[i].x0 - ts[i - 1].x1 < 6) out.push(`ticks ${ts[i - 1].t} and ${ts[i].t} under 6 px apart`);
  }
  const atRest = !view.play;
  for (const k of RECOVERY_PLANS) {
    const p = P[k];
    const ring = meta.rings[k];
    if (atRest && !view.hid.standbyMarks && !view.hid.delayedMarks) {
      if (p.recovers && ring === undefined) out.push(`no recovery point for ${k}`);
      if (!p.recovers && ring !== undefined) out.push(`${k} cannot recover but draws a recovery point`);
      if (ring !== undefined) {
        const want = p.rpoS === 0 ? meta.zeroX : recoveryBeforeX(p.rpoS, meta.ax0, meta.xNow, 14);
        if (Math.abs(ring - want) > 0.11) out.push(`${k}'s ring at ${ring}, not its loss's ${want.toFixed(1)}`);
        const lost = meta.lost[k];
        if (p.rpoS > 0 && !lost) out.push(`${k} loses ${p.rpoS} s with no lost band`);
        if (p.rpoS === 0 && lost) out.push(`${k} loses nothing over a lost band`);
        if (lost && Math.abs(lost[1] - meta.xNow) > 0.2) out.push(`${k}'s lost band does not end at the disaster`);
        if (lost && Math.abs(lost[0] - (ring + RING_R + 1)) > 0.2) out.push(`${k}'s lost band does not start at its ring`);
      }
      const v = textOf(`a-${k}-value`) ?? '';
      if (!view.hid.ghost && !v.startsWith(lossWords(p)) && !v.includes(' · was ')) out.push(`${k}'s loss reads "${v}"`);
    }
    if (atRest && !view.hid.pitrRtoMarks && !view.hid.standbyMarks && !view.hid.delayedMarks) {
      const bar = meta.bars[k];
      if (p.recovers) {
        const want = recoveryAfterX(p.rtoMin, meta.PAD, W - meta.PAD);
        if (!bar || Math.abs(bar.end - want) > 0.11) out.push(`${k}'s bar ends at ${bar?.end}, not ${want.toFixed(1)}`);
        const per = (W - 2 * meta.PAD) / (24 * 60);
        for (const stp of bar?.steps ?? [])
          if (!stp.floor && Math.abs(stp.w - per * stp.min) > 0.11) out.push(`a ${stp.kind} step drawn off its minutes`);
        if (!(textOf(`b-${k}-value`) ?? '').includes(rtoSpan(p.rtoMin))) out.push(`${k}'s time reads "${textOf(`b-${k}-value`)}"`);
      } else if (bar || !ids.has(`never-${k}`)) out.push(`${k} never serves but its row says otherwise`);
      if (/never/.test(textOf(`b-${k}-value`) ?? '') && bar) out.push(`${k} says never over a bar`);
    }
  }
  // Every backup box shows: no filled mark covers it, and a ring clears it by 2 px.
  const fillers = prims.filter((p) => /^(lost|drop-tick|comb-solid|serve|hidden-box)$/.test(p.cls));
  for (const b of meta.boxes) {
    for (const f of fillers) if (overlap(b, boxOf(f)!, 0.3)) out.push(`a ${f.cls} covers a backup box`);
    for (const c of prims.filter((p): p is Extract<Prim, { k: 'circle' }> => p.k === 'circle' && p.cls === 'ring')) {
      const far = Math.max(...[b.x0, b.x1].flatMap((x) => [b.y0, b.y1].map((y) => Math.hypot(x - c.cx, y - c.cy))));
      const near = Math.hypot(Math.max(b.x0 - c.cx, 0, c.cx - b.x1), Math.max(b.y0 - c.cy, 0, c.cy - b.y1));
      if (!(far <= c.r - 3 + 0.05 || near >= c.r + 1)) out.push('a ring crosses a backup box');
    }
  }
  for (const c of prims.filter((p): p is Extract<Prim, { k: 'circle' }> => p.k === 'circle' && p.cls === 'ring'))
    for (const g of prims.filter((p): p is Extract<Prim, { k: 'line' }> => p.k === 'line' && /grid|goal-line/.test(p.cls)))
      if (Math.abs(g.x1 - c.cx) < RING_R + 1 && g.y1 < c.cy && g.y2 > c.cy) out.push('a grid line through a ring');
  const xs = [...meta.combXs].sort((a, b) => a - b);
  for (let i = 1; i < xs.length; i++) if (xs[i] - xs[i - 1] < 2.4) out.push('archive ticks closer than 2.5 px');
  for (const h of meta.hiddenBoxes)
    if ((h.id === 'standby' || h.id === 'delayed') && h.x1 > meta.xNow - 1 + 0.05) out.push('a hidden box crosses the disaster');
  const gaps = meta.rowsB.slice(1).map((r, i) => Math.round(r.top - meta.rowsB[i].bottom));
  if (new Set(gaps).size > 1) out.push(`block B's rows are spaced ${gaps.join(', ')} px`);
  const open = view.hid.locked;
  if (!open && prims.some((p) => p.cls === 'hidden-box')) out.push('a dashed mark with no question open');
  for (const p of prims) {
    if (p.cls !== 'ghost-tick' || p.k !== 'line') continue;
    if (!/ · was /.test(textOf(p.id.replace('ghost-', 'b-') + '-value') ?? '')) out.push(`${p.id} without its "was"`);
    const end = meta.bars[p.id.replace('ghost-', '')]?.end;
    if (Math.abs(p.x1 - meta.PAD) < 4 || (end !== undefined && Math.abs(p.x1 - end) < 4))
      out.push(`${p.id} on the disaster or its bar's end`);
  }
  for (const t of texts) {
    const [now, was] = t.s.split(' · was ');
    if (was !== undefined && (now === was || now.endsWith(` ${was}`))) out.push(`a ghost that says no change: "${t.s}"`);
  }
  if (m.drop)
    for (const t of texts)
      for (const part of t.s.split(/(?<=[.?!])\s+|;\s+/))
        if (/serve again|serves again|promot|back in/i.test(part) && !/table/i.test(part))
          out.push(`a drop word without the table: "${part}"`);
  if (atRest && meta.fulls !== m.fullsH.length) out.push(`${meta.fulls} full backups drawn for ${m.fullsH.length}`);
  if (prims.length > 400) out.push(`${prims.length} marks`);
  const words = texts.map((t) => t.s).join(' | ');
  for (const g of [/NaN|undefined|Infinity|null/, /(^|[^\d.,])0 (s|min|h|GB)\b/, /\?\?/, /\u2014|\u00a0/, /back in never|loses cannot/])
    if (g.test(words)) out.push(`false claim ${g}: "${words.match(g)![0]}"`);
  return out;
}

const heights = new Map<number, number>();
function check(W: number, s: RecoverySettings, view: StageView, what: string, out: string[]) {
  const st = buildStage(W, recoveryScenario(s), view);
  const h = heights.get(W);
  if (h === undefined) heights.set(W, st.H);
  else if (h !== st.H) out.push(`${W}px ${show(s)} ${what}: height ${st.H}, not ${h}`);
  for (const f of faults(st, s, view)) out.push(`${W}px ${show(s)} ${what}: ${f}`);
}

describe('the Backups & Recovery stage', { timeout: 600_000 }, () => {
  it('lays out every setting at rest and after a change at four widths, with one height a width', () => {
    const out: string[] = [];
    for (const W of [252, 344, 620, 760])
      for (const s of ALL) {
        check(W, s, rest(), 'rest', out);
        check(W, s, rest({ ghost: { ...B, disaster: s.disaster } }), 'ghost', out);
      }
    expect(out.slice(0, 20)).toEqual([]);
  });

  it('lays out every setting with every ghost one change can leave, at the narrow widths where "was" runs short of room', () => {
    const out: string[] = [];
    for (const W of [248, 288, 322])
      for (const s of ALL) for (const ghost of oneChangeAgo(s)) check(W, s, rest({ ghost }), `ghost ${show(ghost)}`, out);
    expect(out.slice(0, 20)).toEqual([]);
  });

  it('lays out a sample of settings through the play at many widths', () => {
    const out: string[] = [];
    for (const W of WIDTHS)
      ALL.forEach((s, i) => {
        if (i % 37) return;
        check(W, s, rest(), 'rest', out);
        for (const frac of FRACS) check(W, s, rest({ play: { frac } }), `play ${frac}`, out);
      });
    expect(out.slice(0, 20)).toEqual([]);
  });

  it('lays out every experiment asking, playing and revealed, each reveal with a tag for every outline, at many widths', () => {
    const out: string[] = [];
    for (const W of WIDTHS)
      for (const spec of RECOVERY_EXPERIMENTS) {
        const e = renderExperiment(spec);
        const act = { ...B, ...e.setup, ...(e.act && 'set' in e.act ? e.act.set : {}) } as RecoverySettings;
        if (e.goal) {
          for (const s of [
            { ...B, ...e.setup },
            { ...B, restore: 50, base: 6, replay: 20 },
          ] as RecoverySettings[])
            check(W, s, rest({ challenge: true, focus: e.focus }), 'challenge', out);
          continue;
        }
        const phases: [QuestionPhase, number | null, RecoverySettings][] = [
          ['asking', null, { ...B, ...e.setup } as RecoverySettings],
          ...[0.1, 0.3, 0.5, 0.7, 0.98].map((f): [QuestionPhase, number, RecoverySettings] => ['playing', f, act]),
          ['revealed', null, act],
        ];
        for (const [phase, frac, s] of phases) {
          const view = rest({
            hid: hiding(e.hide, phase),
            play: frac === null ? null : { frac },
            answering: phase === 'playing',
            focus: phase === 'revealed' ? e.focus : [],
          });
          const st = buildStage(W, recoveryScenario(s), view);
          for (const f of faults(st, s, view)) out.push(`${W}px ${e.id} ${phase} ${frac ?? ''}: ${f}`);
          if (heights.has(W) && heights.get(W) !== st.H) out.push(`${W}px ${e.id} ${phase}: height ${st.H}`);
          if (phase === 'revealed') {
            if (!st.focus.length) out.push(`${W}px ${e.id}: a reveal with no outline`);
            for (const f of st.focus) {
              if (f.tag.x < 3 || f.tag.x + TAG.width > W - 3 || f.tag.y < 3 || f.tag.y + TAG.height > st.H - 3)
                out.push(`${W}px ${e.id}: ${f.id}'s tag clipped`);
              // A tag keeps 6 px from every text.
              const tag = { x0: f.tag.x - 6, x1: f.tag.x + TAG.width + 6, y0: f.tag.y - 6, y1: f.tag.y + TAG.height + 6 };
              for (const t of st.D.texts) if (overlap(tag, t)) out.push(`${W}px ${e.id}: ${f.id}'s tag by "${t.s}"`);
            }
          }
        }
      }
    expect(out.slice(0, 20)).toEqual([]);
  });

  it('keeps its padding, its scales and its heights a function of the width alone', () => {
    expect(padOf(320)).toBe(12);
    expect(padOf(620)).toBe(16);
    for (const W of [252, 620]) {
      const a = buildStage(W, recoveryScenario(B), rest());
      const b = buildStage(W, recoveryScenario({ ...B, disaster: 1, size: 10000, base: 1 }), rest({ play: { frac: 0.5 } }));
      expect(a.H).toBe(b.H);
    }
  });
});
