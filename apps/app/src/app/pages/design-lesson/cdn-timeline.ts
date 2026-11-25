import { CDN_WINDOW_TTLS, formatTimelineClock } from '@grasp/engine';
import { r1, type Anchor } from './stage-draw';
import { linesOf, tw, wrap } from './cdn-text';
import { emptyNote, keyOf, line, para, rect, text, timelineLabels, type Ctx } from './cdn-draw';
import { keyForms, laneWords, windowWords } from './cdn-words';

/** Height of one lane's tracks under its words: the edge track, the shield track and the origin's dots below it. */
export const LANE_TRACKS = 38;
/** The closest a lane's ticks may sit, in px: a lane or shield track with more requests than its width allows is a band. */
export const TICK_GAP = 4;

export interface Tick {
  x: number;
  text: string;
  anchor: Anchor;
  bold?: boolean;
}
const tickBox = (t: Tick) => {
  const w = tw(t.text, t.bold ? 'smallB' : 'small');
  const x0 = t.anchor === 'middle' ? t.x - w / 2 : t.anchor === 'end' ? t.x - w : t.x;
  return { x0, x1: x0 + w };
};
const apart = (a: Tick, b: Tick) => {
  const p = tickBox(a);
  const q = tickBox(b);
  return p.x1 + 6 <= q.x0 || q.x1 + 6 <= p.x0;
};

/**
 * Axis labels, evenly spaced: all of them when every pair keeps 6 px; otherwise every other one, counted from `from`,
 * plus the label at the other end where it keeps 6 px. A label within 6 px of one in `fixed` (already placed) drops.
 */
export function placeTicks(ticks: readonly Tick[], from: 'start' | 'end', fixed: readonly Tick[] = []): Tick[] {
  const fits = (set: readonly Tick[]) => set.every((a, i) => set.every((b, j) => j <= i || apart(a, b)));
  let kept = [...ticks];
  if (!fits(kept)) {
    const n = ticks.length - 1;
    kept = ticks.filter((_, i) => (from === 'start' ? i : n - i) % 2 === 0);
    const other = from === 'start' ? ticks[n] : ticks[0];
    if (!kept.includes(other) && kept.every((k) => apart(k, other))) kept.push(other);
  }
  return kept.filter((t) => fixed.every((f) => apart(t, f)));
}

/**
 * The outlined location over five TTLs, one random sample: three objects' requests, their copies, and with a shield
 * what the shield held. Its marks sit in the `clip` layer, which a play reveals up to its clock; the step line is drawn
 * apart (`stepPrims`), since it changes as the clock runs.
 */
export function timeline(c: Ctx, y: number): number {
  const { g, r, sc, hid } = c;
  const s = sc.settings;
  const top = y;
  const sample = c.meta.sample;
  const W = CDN_WINDOW_TTLS * s.ttl;
  const forms = timelineLabels(windowWords(s));
  const one = forms.find((f) => tw(f, 'label') <= g.iw - 56);
  const labelLines = one ? [one] : wrap(forms.find((f) => linesOf(f, 'label', g.iw - 56) <= 2) ?? forms[2], 'label', g.iw - 56);
  labelLines.forEach((l, i) =>
    text(c, `timeline-label-${i}`, g.x0, y + (labelLines.length === 1 ? 26 : 19 + i * 15), [[l, 'label', 'muted']], { owner: 'timeline' }),
  );
  c.hits.push({ kind: 'play', x: g.x1 - 44, y, w: 44, h: 44 });
  c.D.mark({ x0: g.x1 - 44, x1: g.x1, y0: y, y1: y + 44 }, 'play');
  y += 48;
  c.meta.timeline.step = { x: g.x0, y: y + 12, w: g.iw };
  y += r.step * 17 + 6;
  const xOf = (t: number) => g.x0 + (g.iw * Math.max(0, Math.min(W, t))) / W;
  const heads: { y0: number; y1: number }[] = [];
  for (let i = 0; i < 3; i++) {
    const w = laneWords(sc, i, hid);
    let b = y + 12;
    let last = b;
    const hitsCls = hid.laneHits ? 'muted' : 'ink';
    if (tw(`${w.who} ${w.asked} · ${w.hits}`, 'cap') <= g.iw) {
      text(
        c,
        `lane-words-${i}`,
        g.x0,
        b,
        [
          [w.who, 'capB', 'ink'],
          [` ${w.asked} · `, 'cap', 'muted'],
          [w.hits, 'capB', hitsCls],
        ],
        { owner: `lane-${i}` },
      );
      b += 17;
    } else {
      wrap(`${w.who} ${w.asked}`, 'cap', g.iw).forEach((l, k) => {
        if (k === 0)
          text(
            c,
            `lane-words-${i}`,
            g.x0,
            b,
            [
              [w.who, 'capB', 'ink'],
              [l.slice(w.who.length), 'cap', 'muted'],
            ],
            { owner: `lane-${i}` },
          );
        else text(c, `lane-words-${i}-${k}`, g.x0, b, [[l, 'cap', 'muted']], { owner: `lane-${i}` });
        b += 17;
      });
      wrap(w.hits, 'smallB', g.iw).forEach((l, k) => {
        last = b - 2;
        text(c, `lane-hits-${i}-${k}`, g.x0, last, [[l, 'smallB', hitsCls]], { owner: `lane-${i}` });
        b += 14;
      });
    }
    const L = sample.lanes[i];
    if (!L.reqs.length) {
      const note = emptyNote(w, windowWords(s), g.iw);
      text(c, `lane-empty-${i}`, g.x1, note.beside ? last : b - 2, [[note.text, 'small', 'muted']], { anchor: 'end', owner: `lane-${i}` });
    }
    y += r.lane[i] * 17 + 2;
    const ty = y;
    heads.push({ y0: ty - 1, y1: ty + 35 });
    const dense = c.meta.dense[i];
    line(c, 'grid', `track-${i}`, 'track', g.x0, ty + 13, g.x1, ty + 13);
    const shY = ty + 24;
    const originY = ty + 31;
    if (s.shield) line(c, 'grid', `shield-track-${i}`, 'track', g.x0, shY, g.x1, shY);
    if (hid.laneMarks) {
      if (dense.lane) rect(c, 'clip', `arrivals-${i}`, 'dense-other', g.x0, ty + 4, g.iw, 9);
      else for (const q of L.reqs) line(c, 'clip', `req-${i}-${q.at.toFixed(3)}`, 'tick-req', xOf(q.at), ty + 4, xOf(q.at), ty + 13);
    } else {
      for (const cp of L.copies) {
        const x0 = xOf(cp.from);
        const x1 = xOf(cp.to);
        if (x1 - x0 < 0.5) continue;
        rect(c, 'clip', `copy-${i}-${cp.from.toFixed(3)}`, 'copy', x0, ty + 3, x1 - x0, 10, 1.5);
        if (dense.lane) rect(c, 'clip', `dense-${i}-${cp.from.toFixed(3)}`, 'dense', x0 + 1, ty + 4, Math.max(0, x1 - x0 - 2), 8);
      }
      for (const e of c.meta.events) {
        if (e.lane !== i) continue;
        const x = xOf(e.at);
        const id = `req-${i}-${e.at.toFixed(3)}`;
        if (e.hit) {
          if (!dense.lane) line(c, 'clip', id, 'tick-hit', x, ty + 4, x, ty + 13);
        } else if (e.where === 'shield') {
          // A miss the shield answered stops at the shield track, in a square there.
          line(c, 'clip', id, 'tick-miss', x, ty + 1, x, shY);
          rect(c, 'clip', `${id}-end`, 'dot ans-shield', x - 3, shY - 3, 6, 6);
        } else {
          // A miss the origin answered runs past the shield track to a dot below it.
          line(c, 'clip', id, 'tick-miss', x, ty + 1, x, originY);
          c.D.add('clip', `${id}-end`, { k: 'circle', cls: 'dot ans-origin', cx: r1(x), cy: r1(originY), r: 2.5 });
        }
      }
      if (L.shield) {
        for (const cp of L.shield.copies) {
          const x0 = xOf(cp.from);
          const x1 = xOf(cp.to);
          if (x1 - x0 < 0.5) continue;
          rect(c, 'clip', `scopy-${i}-${cp.from.toFixed(3)}`, 'copy shield', x0, shY - 5, x1 - x0, 5, 1);
        }
        if (dense.shield) rect(c, 'clip', `others-${i}`, 'dense-other', g.x0, shY, g.iw, 4);
        else
          for (const a of L.shield.arrivals)
            if (!a.own) line(c, 'clip', `other-${i}-${a.at.toFixed(3)}`, 'tick-other', xOf(a.at), shY, xOf(a.at), shY + 4);
      }
    }
    c.D.mark({ x0: g.x0, x1: g.x1, y0: ty, y1: ty + 34 }, `lane-${i}`);
    y = ty + LANE_TRACKS;
  }
  // The axis: a mark at every TTL across the window.
  line(c, 'grid', 'time-axis', 'axis', g.x0, y, g.x1, y);
  const ticks: Tick[] = [];
  for (let k = 0; k <= CDN_WINDOW_TTLS; k++) {
    const x = xOf(k * s.ttl);
    line(c, 'grid', `time-tick-${k}`, 'tickmark', x, y, x, y + 4);
    ticks.push({ x, text: formatTimelineClock(k * s.ttl), anchor: k === 0 ? 'start' : k === CDN_WINDOW_TTLS ? 'end' : 'middle' });
  }
  for (const t of placeTicks(ticks, 'start'))
    text(c, `time-label-${t.text}`, t.x, y + 16, [[t.text, 'small', 'muted']], { anchor: t.anchor, owner: 'taxis' });
  c.meta.timeline = { ...c.meta.timeline, x0: g.x0, iw: g.iw, window: W, heads, axisY: r1(y) };
  y += 24;
  para(c, 'key', g.x0, y + 10, keyOf(keyForms(s, hid), g.iw), g.iw, { role: 'small', owner: 'key' });
  y += r.key * 14 + 4;
  c.D.region('timeline', { x: g.x0 - 8, y: top - 6, w: g.iw + 16, h: y - top + 6 });
  return y + 34;
}
