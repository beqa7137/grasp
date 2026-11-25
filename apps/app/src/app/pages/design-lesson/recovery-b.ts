import {
  RECOVERY_DISASTER,
  RECOVERY_INSET_MIN,
  RECOVERY_PLANS,
  recoveryAfterX,
  recoveryInsetX,
  type RecoveryPlanId,
  type RecoveryPlanRun,
} from '@grasp/engine';
import { ghostOf, nameValue } from './recovery-a';
import {
  ROW_GAP,
  at,
  circle,
  fitTicks,
  hiddenBox,
  label,
  labelRow,
  line,
  path,
  rect,
  reserved,
  rowHeight,
  text,
  tickAnchor,
  type BarStep,
  type Ctx,
  type Tick,
} from './recovery-draw';
import { PLAN, passedMin, recoverFrac, recoverMinAt, recovering } from './recovery-motion';
import { tw, wrapKept } from './recovery-text';
import {
  SHORT_NAMES,
  anyTimeHidden,
  backIn,
  disasterName,
  hiddenTime,
  ledger,
  marksHidden,
  rtoHidden,
  rtoSpan,
  serveWords,
} from './recovery-words';
import { r1 } from './stage-draw';

const TICKS_B: readonly (readonly [number, string])[] = [
  [60, '1 h'],
  [3 * 60, '3 h'],
  [6 * 60, '6 h'],
  [12 * 60, '12 h'],
  [18 * 60, '18 h'],
  [24 * 60, '24 h'],
];
const TICKS_I: readonly (readonly [number, string])[] = [
  [0, '0'],
  [15, '15 min'],
  [30, '30 min'],
  [45, '45 min'],
  [60, '1 h'],
  [75, '75 min'],
  [90, '90 min'],
];
/** A step this short or shorter is drawn this wide, from its own start; its minutes are in the ledger. */
const FLOOR = 1.5;

/**
 * A bar's steps on a linear axis `X`, grown to `head`: each step drawn at its own minutes on the one scale, a step under
 * 1.5 px drawn 1.5 px from its start (the next keeps its own length). Steps past `maxMin` take no floor. Returns the
 * bar's drawn end and its steps.
 */
function drawBar(
  c: Ctx,
  p: RecoveryPlanRun,
  X: (min: number) => number,
  head: number,
  trackY: number,
  th: number,
  id: string,
  maxMin: number,
) {
  let t0 = 0;
  let x = X(0);
  const steps: BarStep[] = [];
  for (const st of p.steps) {
    const xa = X(t0);
    const exact = X(t0 + st.min) - xa;
    const w = exact < FLOOR && t0 < maxMin ? FLOOR : exact;
    const end = Math.min(xa + w, head);
    if (end > xa) rect(c, 'marks', `${id}-${st.kind}`, `seg seg-${st.kind}`, xa, trackY, end - xa, th);
    steps.push({ kind: st.kind, min: st.min, x: r1(xa), w: r1(w), exact, floor: w > exact });
    x = Math.max(x, xa + w);
    t0 += st.min;
  }
  return { end: x, steps };
}

/** A serve dot centres on its bar's end when the bar is at least the dot's diameter long, else sits just right of it. */
function serveDot(c: Ctx, p: RecoveryPlanRun, X: (min: number) => number, x0: number, cy: number, r: number, id: string, owner: string) {
  const end = Math.max(X(p.rtoMin), x0 + FLOOR);
  const cx = end - x0 >= 2 * r ? end : end + r + 0.5;
  circle(c, 'dots', id, 'serve', cx, cy, r, owner);
  c.D.mark({ x0: cx - r, x1: cx + r, y0: cy - r, y1: cy + r }, owner);
}

/**
 * Block B: the time until each plan serves again (after a drop, until the table is back) on a linear axis from the
 * disaster, then the inset of its first 90 minutes. Returns the y above its controls.
 */
export function recoveryB(c: Ctx, y0: number, nameOf: (key: RecoveryPlanId) => string): number {
  const { m, hid, W, PAD, frac, struck } = c;
  const P = m.plans;
  const drop = m.drop;
  const x0 = PAD;
  const x1 = W - PAD;
  const ax = (min: number) => recoveryAfterX(min, x0, x1);
  const passed = passedMin(m, frac);
  const running = recovering(frac);
  const clockMin = running ? recoverMinAt(m, frac) : null;
  const clock = clockMin !== null && Math.round(clockMin) >= 1 && !anyTimeHidden(hid) ? rtoSpan(Math.round(clockMin)) : null;
  const after = drop ? 'after the drop' : 'after the disaster';
  c.meta.bHeadY = y0;
  const headOf = (forms: readonly string[]) => forms.find((f) => tw(label(f)[0][0], 'label') <= x1 - x0) ?? forms[forms.length - 1];
  const heads = [
    headOf(['Time until the table is back · RTO', 'Until the table is back · RTO']),
    headOf(['Time until it serves again · RTO', 'Until it serves again · RTO']),
  ];
  let y = labelRow(
    c,
    y0,
    drop ? heads[0] : heads[1],
    drop ? ['Time after the drop', 'After the drop'] : ['Time after the disaster', 'After the disaster'],
    'b-head',
    {
      heads,
      subs: [
        ['Time after the drop', 'After the drop'],
        ['Time after the disaster', 'After the disaster'],
      ],
      // While the recovery runs, the block's own head counts its clock, so a phone sees it beside the bars.
      now: clock ? [`now ${clock} ${after}`, `now ${clock}`] : null,
    },
  );
  const tickY = y + 10;
  const originW = Math.max(tw(disasterName(true), 'label'), tw(disasterName(false), 'label'));
  if (struck) text(c, 'origin-label', x0, tickY, [[disasterName(drop), 'label', 'lost-ink']], { owner: 'axis-b strike' });
  const ticks = fitTicks(
    [{ x: ax(0), t: disasterName(drop), at: 0, w: originW }, ...TICKS_B.map(([min, t]): Tick => ({ x: ax(min), t, at: min }))],
    x0,
    x1,
    [0, 6 * 60, 12 * 60, 24 * 60],
  ).filter((t) => t.at > 0);
  for (const t of ticks) {
    const box = text(c, `tick-b-${t.at}`, t.x, tickY, [[t.t, 'small', 'muted']], { anchor: tickAnchor(t, x0, x1), owner: 'axis-b' });
    c.meta.ticks.b.push({ x: r1(t.x), x0: box.x0, x1: box.x1, t: t.t });
  }
  y = tickY + 16;
  const rowsTop = y;
  const ledgerW = x1 - x0;
  const headAt = frac === null ? Infinity : frac < PLAN.recoverStart ? x0 - 1 : x0 + recoverFrac(frac) * (ax(m.lastRtoMin) - x0);
  const started = at(c, PLAN.recoverStart);
  let slack = 0;
  for (const key of RECOVERY_PLANS) {
    const r0 = y;
    const trackY = y + 17;
    const th = 12;
    const owner = `b-${key}`;
    const p = P[key];
    const timeHidden = rtoHidden(hid, key);
    const marksOff = marksHidden(hid, key) || (key === 'pitr' && hid.pitrRtoMarks);
    const held = timeHidden && c.view.answering && hid.outcomesHeld;
    for (const t of ticks) line(c, 'grid', `grid-b-${key}-${t.at}`, 'grid', t.x, trackY - 2, t.x, trackY + th + 2);
    // A row's vertical marks reach 2 px past its track, as its grid lines do, and stop short of its name and its ledger.
    if (struck) line(c, 'marks', `origin-${key}`, 'strike-line', x0 - 1, trackY - 2, x0 - 1, trackY + th + 2);
    if (running) line(c, 'top', `playhead-${key}`, 'playhead', headAt, trackY - 2, headAt, trackY + th + 2);
    line(c, 'grid', `track-b-${key}`, 'track', x0, trackY + th + 0.5, x1, trackY + th + 0.5);
    const done = frac === null || (p.recovers ? passed >= p.rtoMin : started);
    let values: string[] = [];
    let cls = 'ink';
    const g = ghostOf(c, key, 'rtoMin');
    if (!started) values = [];
    else if (timeHidden) {
      values = [`${backIn(drop)} ?`, '?'];
      cls = 'muted';
    } else if (!done) {
      values = ['recovering'];
      cls = 'muted';
    } else {
      const v = serveWords(p, drop);
      values = !p.recovers
        ? [v]
        : g === null
          ? [v, rtoSpan(p.rtoMin)]
          : [`${v} · was ${g.said}`, `${rtoSpan(p.rtoMin)} · was ${g.said}`, v, rtoSpan(p.rtoMin)];
      cls = p.recovers ? 'final-ink' : 'lost-ink';
    }
    const saysWas = nameValue(c, x0, x1, y + 11, nameOf(key), values, cls, owner, owner);
    if (marksOff) hiddenBox(c, x0, hid.boxFull ? x1 : ax(p.rtoMin), trackY - 1, th + 2, owner, `b-${key}`);
    else if (!p.recovers) {
      // An empty set is a solid hairline, never a dashed box.
      if (done && !held) line(c, 'marks', `never-${key}`, 'never', x0, trackY + th / 2, x1, trackY + th / 2);
    } else {
      const bar = drawBar(c, p, ax, headAt, trackY, th, `bar-${key}`, Infinity);
      c.meta.bars[key] = { end: r1(ax(p.rtoMin)), steps: bar.steps };
      c.D.mark({ x0, x1: Math.min(bar.end, headAt), y0: trackY, y1: trackY + th }, owner);
      if (done && !held) {
        serveDot(c, p, ax, x0, trackY + th / 2, 4, `serve-${key}`, owner);
        // A tick at the disaster or at the bar's end would read as part of either, so there the "was" words say it alone.
        const wasX = g === null ? NaN : ax(g.was);
        if (saysWas && Math.abs(wasX - x0) >= 4 && Math.abs(wasX - ax(p.rtoMin)) >= 4)
          line(c, 'marks', `ghost-${key}`, 'ghost-tick', wasX, trackY - 2, wasX, trackY + th + 2);
      }
    }
    const said = timeHidden ? hiddenTime(drop) : ledger(key, m, passed);
    const lines = said ? wrapKept(said, 'small', ledgerW) : [];
    // Each row takes only its own lines; the slack up to the most any setting needs collects at the block's foot.
    const most = reserved(`ledger-${key}`, W, (mm) =>
      Math.max(
        wrapKept(ledger(key, mm), 'small', ledgerW).length,
        wrapKept(hiddenTime(mm.settings.disaster === RECOVERY_DISASTER.drop), 'small', ledgerW).length,
      ),
    );
    lines.forEach((l, i) => text(c, `${owner}-ledger`, x0, y + 42 + i * 14, [[l, 'small', 'muted']], { owner }));
    const used = Math.max(1, lines.length);
    slack += most - used;
    const bottom = y + rowHeight(used);
    c.D.region(owner, { x: x0 - 2, y: r0, w: x1 - x0 + 4, h: bottom - r0 });
    c.meta.rowsB.push({ top: r0, bottom });
    y = bottom + ROW_GAP;
  }
  c.D.region('b-all', { x: x0 - 2, y: rowsTop, w: x1 - x0 + 4, h: y - ROW_GAP - rowsTop });
  y = inset(c, y + 4, clockMin, passed, started);
  // The slack of the block's ledgers, reserved in one place at its foot, above its controls.
  c.meta.slack = slack;
  return y + slack * 14;
}

/**
 * The inset: the first 90 minutes of block B, zoomed and linear, so the 1 min promotion, the delayed replica's minutes
 * and the challenge's 1 h goal read at their lengths. It redraws only that part of each bar, on its own scale.
 */
function inset(c: Ctx, y0: number, clockMin: number | null, passed: number, started: boolean): number {
  const { m, hid, W, PAD, frac, struck } = c;
  const P = m.plans;
  let y = labelRow(c, y0, 'First 90 min, zoomed', [], 'i-head');
  const nameColW = Math.max(...Object.values(SHORT_NAMES).map((n) => tw(n, 'small'))) + 10;
  const ix0 = PAD + nameColW;
  const ix1 = W - PAD - 10;
  const X = (min: number) => recoveryInsetX(min, ix0, ix1);
  const goal = c.view.challenge ? 60 : null;
  const tickY = y + 10;
  const ticks = fitTicks(
    TICKS_I.map(([min, t]): Tick =>
      min === goal ? { x: X(min), t: `${t} goal`, at: min, goal: true, role: 'smallB' } : { x: X(min), t, at: min },
    ),
    ix0,
    ix1,
    [0, 60, 90],
  );
  for (const t of ticks) {
    const box = text(c, `tick-i-${t.at}`, t.x, tickY, [[t.t, t.goal ? 'smallB' : 'small', t.goal ? 'accent-ink' : 'muted']], {
      anchor: tickAnchor(t, ix0, ix1),
      owner: 'axis-i',
    });
    c.meta.ticks.i.push({ x: r1(t.x), x0: box.x0, x1: box.x1, t: t.t });
  }
  y = tickY + 10;
  // The inset's rows sit close, so its grid lines run unbroken through all four tracks: a broken line would read as
  // dashed, which means hidden.
  for (const t of ticks) if (t.at > 0) line(c, 'grid', `grid-i-${t.at}`, t.goal ? 'goal-line' : 'grid', t.x, y + 3, t.x, y + 4 * 20 - 7);
  const head = clockMin === null ? null : Math.min(clockMin, RECOVERY_INSET_MIN);
  const iHead = frac === null ? Infinity : frac < PLAN.recoverStart ? ix0 - 1 : X(head ?? RECOVERY_INSET_MIN);
  for (const key of RECOVERY_PLANS) {
    const owner = `i-${key}`;
    const p = P[key];
    const timeHidden = rtoHidden(hid, key);
    const marksOff = marksHidden(hid, key) || (key === 'pitr' && hid.pitrRtoMarks);
    const held = timeHidden && c.view.answering && hid.outcomesHeld;
    const trackY = y + 5;
    const th = 6;
    text(c, `${owner}-name`, PAD, y + 11, [[SHORT_NAMES[key], 'small', 'muted']], { owner });
    if (struck) line(c, 'marks', `origin-i-${key}`, 'strike-line', ix0 - 1, trackY - 2, ix0 - 1, trackY + th + 2);
    if (head !== null && head < RECOVERY_INSET_MIN)
      line(c, 'top', `playhead-i-${key}`, 'playhead', X(head), trackY - 2, X(head), trackY + th + 2);
    line(c, 'grid', `track-i-${key}`, 'track', ix0, trackY + th + 0.5, ix1, trackY + th + 0.5);
    const done = frac === null || (p.recovers ? passed >= p.rtoMin : started);
    if (marksOff) hiddenBox(c, ix0, ix1, trackY - 1, th + 2, owner, `i-${key}`);
    else if (!p.recovers) {
      if (done && !held) line(c, 'marks', `never-i-${key}`, 'never', ix0, trackY + th / 2, ix1, trackY + th / 2);
    } else {
      const bar = drawBar(c, p, X, iHead, trackY, th, `ibar-${key}`, RECOVERY_INSET_MIN);
      c.D.mark({ x0: ix0, x1: Math.min(bar.end, iHead, ix1), y0: trackY, y1: trackY + th }, owner);
      if (p.rtoMin > RECOVERY_INSET_MIN && iHead >= ix1 - 0.01)
        path(c, 'marks', `more-${key}`, 'more', `M${r1(ix1 + 3)} ${trackY}l3 ${th / 2}l-3 ${th / 2}`);
      if (done && !held && p.rtoMin <= RECOVERY_INSET_MIN) serveDot(c, p, X, ix0, trackY + th / 2, 3, `iserve-${key}`, owner);
    }
    c.D.region(owner, { x: PAD - 2, y, w: W - 2 * PAD + 4, h: 16 });
    y += 20;
  }
  return y;
}
