import {
  RECOVERY_DELAY_H,
  RECOVERY_LAG_S,
  recoveryBeforeX,
  recoveryScenario,
  type RecoveryPlanId,
  type RecoveryPlanRun,
} from '@grasp/engine';
import {
  BOX,
  RING_R,
  ROW_GAP,
  at,
  circle,
  fitTicks,
  hiddenBox,
  labelRow,
  line,
  path,
  pickFits,
  rect,
  rowHeight,
  text,
  xMark,
  type Ctx,
  type Tick,
} from './recovery-draw';
import { PLAN, pointOf } from './recovery-motion';
import { tw, type Part } from './recovery-text';
import { HIDDEN_OUTCOME, disasterName, lossWords, marksHidden, noteForms, rpoHidden, rtoSpan, span } from './recovery-words';
import { r1 } from './stage-draw';

const GAP = 14;
const ROWS: readonly (RecoveryPlanId | 'primary')[] = ['primary', 'full', 'pitr', 'standby', 'delayed'];
const TICKS: readonly (readonly [number, string])[] = [
  [86_400, '24 h'],
  [6 * 3600, '6 h'],
  [3600, '1 h'],
  [600, '10 min'],
  [60, '1 min'],
  [10, '10 s'],
  [1, '1 s'],
];

/**
 * A row's value line: the name left in ink, the longest value form that fits right; a ghost's "was" in muted ink.
 * Returns whether the form it printed says "was", which is what a ghost's mark may stand beside.
 */
export function nameValue(
  c: Ctx,
  x0: number,
  x1: number,
  y: number,
  name: string,
  values: readonly string[],
  cls: string,
  owner: string,
  id: string,
): boolean {
  text(c, `${id}-name`, x0, y, [[name, 'capB', 'ink']], { owner });
  if (!values.length) return false;
  for (const v of values) {
    if (tw(name, 'capB') + 10 + tw(v, 'capB') > x1 - x0) continue;
    const [now, was] = v.split(' · was ');
    const parts: Part[] =
      was === undefined
        ? [[now, 'capB', cls]]
        : [
            [now, 'capB', cls],
            [` · was ${was}`, 'capB', 'muted'],
          ];
    text(c, `${id}-value`, x1, y, parts, { anchor: 'end', owner });
    return was !== undefined;
  }
  c.D.missing.push(`${name} / ${values[0]}`);
  return false;
}

const SAID = { rpoS: (s: number) => (s === 0 ? 'nothing' : span(s)), rtoMin: rtoSpan } as const;
/**
 * The value before the learner's last change, in words, when it moved as said: a change the rounding hides is no
 * change on the stage.
 */
export function ghostOf(c: Ctx, key: RecoveryPlanId, field: 'rpoS' | 'rtoMin'): { was: number; said: string } | null {
  if (!c.view.ghost || c.hid.ghost) return null;
  const was = recoveryScenario(c.view.ghost).plans[key];
  const now = c.m.plans[key];
  if (!was.recovers || !now.recovers || SAID[field](was[field]) === SAID[field](now[field])) return null;
  return { was: was[field], said: SAID[field](was[field]) };
}

/**
 * The archived log: a tick a segment where they stand 2.5 px apart, from the newest back; `crowdX` is where they would
 * crowd, and from there back to the base backup the log is one solid band in the ticks' own ink.
 */
function comb(c: Ctx, from: number, to: number, every: number, bx: (s: number) => number, trackY: number, th: number) {
  let d = '';
  let crowdX = from;
  for (let age = every; age <= 86_400; age += every) {
    const x = bx(age);
    if (x < from + 3) break;
    if (x > to + 0.01) continue;
    if (x - bx(age + every) < 2.5) {
      crowdX = x;
      break;
    }
    d += `M${r1(x)} ${trackY + 1}v${th - 2}`;
    c.meta.combXs.push(r1(x));
  }
  return { d, crowdX };
}

/** A recovery point: a stroke-only ring round its moment, and the lost hatch from the ring's outer edge to the disaster. */
function ringAndLoss(c: Ctx, key: RecoveryPlanId, x: number, xNow: number, trackY: number, th: number, owner: string, p: RecoveryPlanRun) {
  const cy = trackY + th / 2;
  if (p.rpoS > 0) {
    rect(c, 'marks', `lost-${key}`, 'lost', x + RING_R + 1, trackY, xNow - x - RING_R - 1, th);
    c.meta.lost[key] = [r1(x + RING_R + 1), r1(xNow)];
  }
  circle(c, 'dots', `ring-${key}`, 'ring', x, cy, RING_R, owner);
  c.D.mark({ x0: x - RING_R - 1, x1: x + RING_R + 1, y0: cy - RING_R - 1, y1: cy + RING_R + 1 }, owner);
  c.meta.rings[key] = r1(x);
}

/** Block A: what each plan loses, on a log scale of the day before the disaster. Returns the y under its rows. */
export function recoveryA(c: Ctx, y0: number, nameOf: (key: RecoveryPlanId | 'primary') => string): number {
  const { m, hid, W, PAD, frac, struck } = c;
  const s = m.settings;
  const P = m.plans;
  const drop = m.drop;
  // The axis starts a ring's radius in, so a ring at 24 h stays over the track.
  const ax0 = PAD + RING_R + 1;
  const xNow = W - PAD - 6;
  const zeroX = xNow - 10;
  const bx = (sec: number) => recoveryBeforeX(sec, ax0, xNow, GAP);
  Object.assign(c.meta, { ax0, xNow, zeroX });
  let y = labelRow(
    c,
    y0,
    'What each plan loses · RPO',
    ['Time before the disaster, log scale', 'Before the disaster, log scale', 'Log scale'],
    'a-head',
  );
  const tickY = y + 10;
  const goal = c.view.challenge ? 60 : null;
  const nameW = Math.max(tw(disasterName(true), 'label'), tw(disasterName(false), 'label'));
  if (struck) text(c, 'strike-label', W - PAD, tickY, [[disasterName(drop), 'label', 'lost-ink']], { anchor: 'end', owner: 'strike' });
  // Ticks keep 10 px from the widest disaster name, so the same ticks show before and after it strikes.
  const ticks = fitTicks(
    TICKS.map(([sec, t]): Tick =>
      sec === goal ? { x: bx(sec), t: `${t} goal`, at: sec, goal: true, role: 'smallB' } : { x: bx(sec), t, at: sec },
    ),
    ax0,
    W - PAD - nameW - 10,
    [86_400, 3600, 60, ...(goal ? [goal] : [])],
  );
  for (const t of ticks) {
    const anchor = t.at === 86_400 ? 'start' : 'middle';
    const box = text(c, `tick-a-${t.at}`, t.x, tickY, [[t.t, t.goal ? 'smallB' : 'small', t.goal ? 'accent-ink' : 'muted']], {
      anchor,
      owner: 'axis-a',
    });
    c.meta.ticks.a.push({ x: r1(t.x), x0: box.x0, x1: box.x1, t: t.t });
  }
  y = tickY + 16;
  const rowsTop = y;
  c.meta.aTop = rowsTop;
  // The history: a cursor sweeps the day to the disaster, and each mark shows as it reaches its moment.
  const sweeping = frac !== null && frac < PLAN.historyEnd;
  const cursor = sweeping ? ax0 + (frac / PLAN.historyEnd) * (xNow - GAP - ax0) : Infinity;
  const shown = (x: number) => x <= cursor;
  const clip = (x: number) => Math.min(x, cursor);
  for (const key of ROWS) {
    const r0 = y;
    const trackY = y + 17;
    const th = 12;
    const cy = trackY + th / 2;
    const owner = `a-${key}`;
    const rings: number[] = [];
    line(c, 'grid', `track-a-${key}`, 'track', ax0, trackY + th + 0.5, xNow, trackY + th + 0.5);
    const name = nameOf(key);
    if (key === 'primary') {
      nameValue(c, PAD, zeroX, y + 11, name, struck ? [drop ? 'table dropped' : 'disks lost'] : [], 'lost-ink', owner, owner);
      const end = clip(xNow);
      rect(c, 'marks', 'primary-band', 'primary-band', ax0, trackY, end - ax0, th);
      c.D.mark({ x0: ax0, x1: end, y0: trackY, y1: trackY + th }, owner);
      if (struck) {
        if (drop) rect(c, 'marks', 'primary-drop', 'drop-tick', xNow - 2, trackY - 3, 4, th + 6);
        else xMark(c, 'primary-x', xNow, cy, owner);
      }
    } else {
      const p = P[key];
      const wordsHidden = rpoHidden(hid, key);
      const marksOff = marksHidden(hid, key);
      // While a hidden region's answer plays, its mechanism is drawn and its outcome (ring, hatch, ×) held.
      const held = wordsHidden && c.view.answering && hid.outcomesHeld;
      const pointOn = at(c, pointOf(key)) && !held;
      let values: string[] = [];
      let cls = 'ink';
      if (!at(c, pointOf(key))) values = [];
      else if (wordsHidden) {
        values = ['loses ?', '?'];
        cls = 'muted';
      } else {
        const v = lossWords(p);
        const g = ghostOf(c, key, 'rpoS');
        values = g === null ? [v] : [`${v} · was ${g.said}`, `${v.replace('loses ', '')} · was ${g.said}`, v];
        cls = !p.recovers || p.rpoS > 0 ? 'lost-ink' : 'final-ink';
      }
      nameValue(c, PAD, zeroX, y + 11, name, values, cls, owner, owner);
      const ring = (x: number) => {
        rings.push(x);
        ringAndLoss(c, key, x, xNow, trackY, th, owner, p);
      };
      if (key === 'full') {
        const kept = bx(s.base * 3600);
        rect(c, 'marks', 'copy-full', 'copy', ax0, trackY + 2, clip(kept) - ax0, th - 4);
        // At most 24 boxes, drawn above the band: they narrow to keep 1 px between them.
        const xs = m.fullsH.map((h) => bx(h * 3600));
        xs.forEach((x, i) => {
          if (!shown(x)) return;
          const next = i + 1 < xs.length ? Math.abs(xs[i + 1] - x) : 8;
          const w = Math.max(1.5, Math.min(BOX.w, next - 1));
          rect(c, 'marks', `full-${m.fullsH[i]}h`, 'full-box', x - w / 2, cy - BOX.h / 2, w, BOX.h);
          c.meta.boxes.push({ x0: x - w / 2, x1: x + w / 2, y0: cy - BOX.h / 2, y1: cy + BOX.h / 2 });
          c.meta.fulls++;
        });
        c.D.mark({ x0: ax0, x1: kept + BOX.w, y0: trackY, y1: trackY + th }, owner);
        if (pointOn) ring(kept);
      } else if (key === 'pitr') {
        const base = bx(s.base * 3600);
        rect(c, 'marks', 'copy-pitr', 'copy', ax0, trackY + 2, clip(base) - ax0, th - 4);
        const logEnd = drop ? (struck ? xNow - 1 : xNow - GAP) : bx(s.archive);
        const e = clip(logEnd);
        if (e > base) {
          const k = comb(c, base, e, s.archive, bx, trackY, th);
          const lx = base + BOX.w / 2 + 1;
          rect(c, 'marks', 'log-pitr', 'log-band', lx, trackY + 3, Math.max(0, e - lx), th - 6);
          if (k.crowdX > lx) rect(c, 'marks', 'comb-solid', 'comb-solid', lx, trackY + 1, Math.min(k.crowdX, e) - lx, th - 2);
          if (k.d) path(c, 'marks', 'comb', 'comb', k.d);
        }
        if (shown(base)) {
          rect(c, 'marks', 'base-box', 'full-box', base - BOX.w / 2, cy - BOX.h / 2, BOX.w, BOX.h);
          c.meta.boxes.push({ x0: base - BOX.w / 2, x1: base + BOX.w / 2, y0: cy - BOX.h / 2, y1: cy + BOX.h / 2 });
        }
        c.D.mark({ x0: ax0, x1: e, y0: trackY, y1: trackY + th }, owner);
        if (drop && struck) rect(c, 'marks', 'pitr-drop', 'drop-tick', xNow - 2, trackY - 3, 4, th + 6);
        if (pointOn) ring(drop ? zeroX : bx(s.archive));
      } else if (key === 'standby') {
        const lagS = s.sync ? 0 : RECOVERY_LAG_S;
        const heldTo = lagS ? bx(lagS) : xNow - GAP;
        if (marksOff) {
          rect(c, 'marks', 'copy-standby', 'copy', ax0, trackY + 2, heldTo - ax0, th - 4);
          hiddenBox(c, heldTo + 3, xNow - 2, trackY - 1, th + 2, owner, 'standby');
        } else {
          const appliedTo = drop || !lagS ? xNow - 1 : bx(lagS);
          const end = clip(drop && !struck ? heldTo : appliedTo);
          rect(c, 'marks', 'copy-standby', 'copy', ax0, trackY + 2, end - ax0, th - 4);
          c.D.mark({ x0: ax0, x1: end, y0: trackY, y1: trackY + th }, owner);
          if (drop && struck && !held) xMark(c, 'standby-x', xNow, cy, owner);
          if (!drop && pointOn) ring(lagS ? appliedTo : zeroX);
        }
      } else {
        const applied = bx(RECOVERY_DELAY_H * 3600);
        const received = drop ? xNow - 1 : bx(RECOVERY_LAG_S);
        if (marksOff) {
          rect(c, 'marks', 'copy-delayed', 'copy', ax0, trackY + 2, applied - ax0, th - 4);
          rect(c, 'marks', 'log-delayed', 'log-band', applied, trackY + 3, bx(RECOVERY_LAG_S) - applied, th - 6);
          hiddenBox(c, bx(RECOVERY_LAG_S) + 3, xNow - 2, trackY - 1, th + 2, owner, 'delayed');
        } else {
          rect(c, 'marks', 'copy-delayed', 'copy', ax0, trackY + 2, clip(applied) - ax0, th - 4);
          const recvEnd = clip(drop && !struck ? bx(RECOVERY_LAG_S) : received);
          if (recvEnd > applied) rect(c, 'marks', 'log-delayed', 'log-band', applied, trackY + 3, recvEnd - applied, th - 6);
          c.D.mark({ x0: ax0, x1: Math.max(recvEnd, clip(applied)), y0: trackY, y1: trackY + th }, owner);
          if (drop && struck) rect(c, 'marks', 'delayed-drop', 'drop-tick', xNow - 2, trackY - 3, 4, th + 6);
          if (pointOn) ring(drop ? zeroX : received);
        }
      }
    }
    // Grid ticks only across the track, never through a label, and with a gap round a ring.
    for (const t of ticks)
      if (!rings.some((rx) => Math.abs(rx - t.x) < RING_R + 2))
        line(c, 'grid', `grid-a-${key}-${t.at}`, t.goal ? 'goal-line' : 'grid', t.x, trackY - 2, t.x, trackY + th + 2);
    if (sweeping) line(c, 'top', `cursor-${key}`, 'cursor', cursor, trackY - 2, cursor, trackY + th + 2);
    const hiddenNote = key !== 'primary' && (marksHidden(hid, key) || rpoHidden(hid, key)) && (key === 'standby' || key === 'delayed');
    const forms = hiddenNote ? [HIDDEN_OUTCOME, 'shows after your answer'] : noteForms(key, m, hid, struck);
    const note = pickFits(forms, 'small', zeroX - PAD);
    if (note) text(c, `${owner}-note`, PAD, y + 42, [[note, 'small', 'muted']], { owner });
    else c.D.missing.push(forms[0]);
    const bottom = y + rowHeight(1);
    c.D.region(owner, { x: PAD - 2, y: r0, w: W - 2 * PAD + 4, h: bottom - r0 });
    y = bottom + ROW_GAP;
  }
  // The disaster: one line down the rows, at the moment it strikes.
  if (struck) line(c, 'marks', 'strike', 'strike-line', xNow, tickY + 6, xNow, y - ROW_GAP);
  c.D.region('a-all', { x: PAD - 2, y: rowsTop, w: W - 2 * PAD + 4, h: y - ROW_GAP - rowsTop });
  return y;
}
