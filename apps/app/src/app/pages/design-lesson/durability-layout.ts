import {
  DURABILITY_CHALLENGE_BOUNDS,
  DURABILITY_CHALLENGE_STORED,
  DURABILITY_SCHEMES,
  DURABILITY_SETTINGS,
  durabilityFailedIndex,
  durabilityPlan,
  durabilityPlayState,
  durabilitySources,
  durabilityStagedAt,
  durabilityStagedFailures,
  durabilityScenario,
  formatOverhead,
  formatRepairHours,
  listOf,
  type DurabilityScenario,
} from '@grasp/engine';
import { TAG } from './focus-layout';
import { focusOutlines } from './latency-draw';
import { r1, sampleLine } from './stage-draw';
import {
  line,
  layoutConsts,
  markRect,
  one,
  path,
  pickLast,
  rect,
  xGlyph,
  checkGlyph,
  type Ctx,
  type Hit,
  type Stage,
  type StageMeta,
  type StageView,
} from './durability-draw';
import { Draw, tw, wrapStage, type Part } from './durability-text';
import { drawModel } from './durability-walk';
import {
  NOTHING_HIDDEN,
  failedName,
  factsSentence,
  momentsOf,
  pieceWord,
  playLabel,
  raceSentence,
  readWords,
  stageLabel,
  summary,
  type Hid,
} from './durability-words';

const NONE_HIDDEN = NOTHING_HIDDEN;
const HIDING_STEPS_READS: Hid = { ...NOTHING_HIDDEN, steps: true, reads: true };
const reserves = new Map<number, { race: number; facts: number }>();

/**
 * The lines the race's sentence and the facts reserve at a width: the most any setting, play moment and hiding needs,
 * so the stage's height depends on its width alone.
 */
export function reserved(W: number): { race: number; facts: number } {
  const hit = reserves.get(W);
  if (hit) return hit;
  const { IW } = layoutConsts(W);
  let lines = 0;
  let facts = 0;
  for (const s of DURABILITY_SETTINGS) {
    const m = durabilityScenario(s);
    for (const kind of ['repair', 'staged'] as const) {
      const plan = durabilityPlan(s, kind);
      for (const tau of [0, plan.fail + 0.01, plan.winStart + plan.win * 0.95, ...plan.events.map((e) => e.at), null]) {
        const ps = durabilityPlayState(s, kind, tau);
        for (const hid of [NONE_HIDDEN, HIDING_STEPS_READS])
          lines = Math.max(lines, wrapStage(raceSentence(m, ps, kind, hid), 'cap', IW).length);
      }
    }
    for (const [hid, ghost] of [
      [NONE_HIDDEN, m],
      [HIDING_STEPS_READS, null],
    ] as const)
      facts = Math.max(facts, wrapStage(factsSentence(m, hid, ghost), 'cap', IW).length);
  }
  const out = { race: lines, facts };
  reserves.set(W, out);
  return out;
}

const storedLabel = (m: DurabilityScenario) =>
  m.replicas ? `stored: ${m.n} × 1 = ${formatOverhead(m.overhead)}` : `stored: ${m.n} × 1/${m.need} = ${formatOverhead(m.overhead)}`;
/** The object's bar: the widest that fits every scheme's stored bar and its words at this width, so a scheme change moves only the bar. */
function unitWidth(c: Ctx): number {
  const fits = DURABILITY_SCHEMES.map((_, scheme) => {
    const mm = durabilityScenario({ ...c.m.settings, scheme });
    return (c.IW - 10 - tw(storedLabel(mm), 'small')) / Math.max(1.5, mm.overhead);
  });
  return Math.min(c.wide ? 150 : 120, Math.floor(Math.min(...fits)));
}

/** Whether piece `i` is down at this moment. */
const downAt = (c: Ctx, i: number, stillRebuilding: boolean) =>
  (c.ps.failed && i === durabilityFailedIndex(c.m) && stillRebuilding) || c.ps.stagedDown.includes(i) || c.ps.rackDown;

function header(c: Ctx, hits: Hit[]) {
  const { D, X0, X1, view, playing } = c;
  const state = { locked: view.hid.waits, running: playing, step: view.step, kind: view.kind, moments: momentsOf(c.m, view.kind) };
  const stageForms = stageLabel(state).forms;
  const playForms = playLabel(state).forms;
  const pillW = (t: string) => tw(t, 'cap') + 26;
  const fi = X0 + 46 + tw(playForms[0], 'capB') + 12 > X1 - pillW(stageForms[0]) ? 1 : 0;
  const pw = pillW(stageForms[fi]);
  hits.push({ kind: 'play', x: X0 - 4, y: 8, w: 44, h: 44, text: playForms[fi] });
  hits.push({ kind: 'stage', x: X1 - pw, y: 8, w: pw, h: 44, text: stageForms[fi] });
  D.mark({ x0: X0 - 4, x1: X0 + 40, y0: 8, y1: 52 }, 'play');
  D.mark({ x0: X1 - pw, x1: X1, y0: 8, y1: 52 }, 'stage');
  D.text('play-label', X0 + 46, 35, one(playForms[fi], 'capB'), { owner: 'play' });
}

/** A: the object and what is stored, the cost drawn as a transform, bracketed by kind so kind never rests on colour. */
function objectRow(c: Ctx): number {
  const { D, m, ps, X0, wide } = c;
  let y = 80;
  D.text('obj-title', X0, y, one(wide ? 'The object, and what is stored' : 'Object and what is stored', 'label'));
  const U = unitWidth(c);
  const yObj = y + 10;
  markRect(c, 'marks', 'obj', 'obj', X0, yObj, U, 12, 2, 'obj');
  D.text('obj-words', X0 + U + 8, yObj + 10, one('the object, 1 MB', 'small'));
  if (ps.lost) xGlyph(c, 'obj-x', X0 + U / 2, yObj + 6, 'obj', 4.5);
  const ySt = yObj + 20;
  const segW = U / m.need;
  m.pieces.forEach((p, i) => {
    const down = downAt(c, i, !ps.rebuilt);
    rect(c, 'marks', `seg-${p.id}`, down ? 'seg-down' : `seg-${p.kind}`, X0 + i * segW + 0.6, ySt, segW - 1.2, 12, 0, 'stored');
  });
  D.mark({ x0: X0, x1: X0 + m.n * segW, y0: ySt, y1: ySt + 12 }, 'stored');
  let storedEnd = X0 + m.n * segW;
  const met = m.overhead < DURABILITY_CHALLENGE_BOUNDS.overhead;
  const gx = X0 + DURABILITY_CHALLENGE_STORED * U;
  if (c.view.challenge) {
    line(c, 'links', 'goal-oh', `goal-line${met ? ' met' : ''}`, gx, ySt - 4, gx, ySt + 16, 'goal-oh');
    storedEnd = Math.max(storedEnd, gx);
  }
  D.text('stored-words', storedEnd + 8, ySt + 10, one(storedLabel(m), 'small'));
  const spans: [number, number][] = (
    m.replicas
      ? [[0, m.n]]
      : [
          [0, m.need],
          [m.need, m.n],
        ]
  ).map(([a, b]) => [X0 + a * segW + 1.5, X0 + b * segW - 1.5]);
  const yBr = ySt + 16;
  spans.forEach(([x0, x1], k) => path(c, 'marks', `bracket-${k}`, 'bracket', `M${r1(x0)} ${r1(yBr)}v3H${r1(x1)}v-3`));
  // Each kind keeps its count: "pieces" goes from both labels before a count would, then the key becomes one line.
  const levels = m.replicas
    ? [[`${m.n} full copies`], [`${m.n} copies`]]
    : [
        [`${m.need} data pieces`, `${m.t} parity pieces`],
        [`${m.need} data`, `${m.t} parity`],
      ];
  const startOf = (t: string, [x0, x1]: [number, number]) => Math.max(x0, (x0 + x1) / 2 - tw(t, 'small') / 2);
  const fits = (lv: string[]) =>
    lv.every((t, k) => {
      const end = startOf(t, spans[k]) + tw(t, 'small');
      return end <= c.X1 && (k === lv.length - 1 || end + 8 <= startOf(lv[k + 1], spans[k + 1]));
    });
  const level = levels.find(fits);
  c.meta.keys = [];
  if (level)
    level.forEach((t, k) => {
      const box = D.text(`key-${k}`, startOf(t, spans[k]), yBr + 14, one(t, 'small'), { owner: `key-${k}` });
      c.meta.keys.push({ s: t, x0: box.x0, a: spans[k][0], b: spans[k][1] });
    });
  else {
    const t = `${m.need} data + ${m.t} parity`;
    const box = D.text('key-0', X0, yBr + 14, one(t, 'small'), { owner: 'key-0' });
    c.meta.keys.push({ s: t, x0: box.x0, a: X0, b: c.X1 });
  }
  if (c.view.challenge) {
    const keyBoxes = D.texts.filter((t) => t.owner.startsWith('key-'));
    const goal = `goal: at most ${formatOverhead(DURABILITY_CHALLENGE_STORED)}`;
    D.place(
      'goal-oh-words',
      [
        [gx + 5, yBr + 14],
        [gx - 5, yBr + 14, 'end'],
        [gx + 5, yBr + 28],
        [gx - 5, yBr + 28, 'end'],
      ],
      one(goal, 'small', met ? 'ok-ink' : ''),
      // Clear of the key by more than a word space, so it never reads on from a kind's label.
      { owner: 'goal-oh', ok: (b) => keyBoxes.every((k) => b.x0 >= k.x1 + 10 || b.x1 <= k.x0 - 10 || b.y0 >= k.y1 + 2) },
    );
  }
  return ySt + 30;
}

/** B: the pieces on their disks, the free disk, and the rebuild's reads. */
function disksRow(c: Ctx, y: number): number {
  const { D, m, ps, view, hid, X0, IW, wide } = c;
  const s = m.settings;
  const yB = y + 36;
  const secB = s.rack
    ? wide
      ? `On ${m.n} disks, all in one rack`
      : `${m.n} disks, one rack`
    : wide
      ? `On ${m.n} disks, each in its own rack`
      : `${m.n} disks, a rack each`;
  D.text('disks-title', X0, yB, one(secB, 'label'));
  const gapFree = 12;
  const slot = Math.min(wide ? 52 : 44, Math.floor((IW - gapFree) / (m.n + 1)));
  const diskW = slot - (s.rack ? 4 : 10);
  const labels = slot >= 24;
  const yLeg = yB + 20;
  const yName = yB + 36;
  const yDisk = yName + 6;
  const diskH = wide ? 44 : 36;
  const frameTop = yLeg + 4;
  const frameBot = yDisk + diskH + 4;
  const diskX = (i: number) => X0 + (i < m.n ? i * slot : m.n * slot + gapFree) + (slot - diskW) / 2;
  const failed = durabilityFailedIndex(m);
  const srcs = ps.stagedDown.length
    ? m.pieces
        .map((_, i) => i)
        .filter((i) => i !== failed && !ps.stagedDown.includes(i))
        .slice(0, m.repairRead)
    : durabilitySources(m);
  if (s.rack) rect(c, 'back', 'rack-all', `rack${ps.rackDown ? ' struck' : ''}`, X0 + 1, frameTop, m.n * slot - 2, frameBot - frameTop, 6);
  for (let i = 0; i <= m.n; i++)
    if (!s.rack || i === m.n)
      rect(c, 'back', `rack-${i === m.n ? 'free' : m.pieces[i].id}`, 'rack', diskX(i) - 3, frameTop, diskW + 6, frameBot - frameTop, 5);
  const rackBox = D.text('rack-words', X0 + 7, yLeg, one(s.rack ? 'one rack' : 'a rack each', 'tiny', ps.rackDown ? 'lost-ink' : 'muted'), {
    owner: 'rack',
  });
  const freeBox = D.text('free-words', diskX(m.n) + diskW / 2, yLeg, one('free', 'tiny', 'muted'), { owner: 'rack', anchor: 'middle' });
  const staged = view.kind === 'staged';
  const stagedList = staged && !s.rack ? durabilityStagedFailures(m) : [];
  const names: string[] = [];
  m.pieces.forEach((p, i) => {
    const down = downAt(c, i, true);
    const x = diskX(i);
    const own = `disk-${p.id}`;
    markRect(c, 'marks', own, `disk ${down ? 'down' : p.kind}`, x, yDisk, diskW, diskH, 3, own);
    if (p.kind === 'parity') rect(c, 'marks', `${own}-cap`, 'cap-parity', x + 1, yDisk + 1, diskW - 2, 3.5);
    if (down) xGlyph(c, `${own}-x`, x + diskW / 2, yDisk + diskH / 2, own, Math.min(4, diskW / 2 - 1.5), 'on-box');
  });
  // A name stands over its disk only where it fits the slot; struck disks too narrow to name are said in one line instead,
  // in the rack lane above the outlines, so no word stands over a disk it does not name.
  const order = m.pieces.map((_, i) => i).sort((a, b) => Number(b === failed) - Number(a === failed));
  const unnamed = order.filter((i) => downAt(c, i, true));
  const legendOnly = unnamed.some((i) => tw(m.pieces[i].id, 'tiny') > slot - 2);
  for (const i of order) {
    const p = m.pieces[i];
    const down = downAt(c, i, true);
    if (legendOnly || (!labels && !down)) continue;
    const x = diskX(i);
    const own = `disk-${p.id}`;
    const placed = D.place(
      `${own}-name`,
      [
        [x + diskW / 2, yName, 'middle'],
        [x + diskW / 2 - 3, yName, 'middle'],
        [x + diskW / 2 + 3, yName, 'middle'],
      ],
      one(p.id, 'tiny', down ? 'muted' : ''),
      { owner: own, optional: !down || ps.rackDown || (!labels && i !== failed), margin: 2.5 },
    );
    if (placed) names.push(p.id);
  }
  if (legendOnly) {
    const ids = unnamed.map((i) => m.pieces[i].id);
    const first = unnamed.includes(failed) ? `${m.pieces[failed].id} failed` : '';
    const rest = ids.filter((id) => id !== m.pieces[failed].id);
    const forms = ps.rackDown
      ? ['every disk lost with the rack', 'all lost']
      : [
          [first, rest.length ? `${listOf(rest)} ${rest.length === 1 ? 'fails' : 'fail'} too` : ''].filter(Boolean).join('; '),
          [first, rest.length ? `${rest.length} more ${rest.length === 1 ? 'fails' : 'fail'}` : ''].filter(Boolean).join('; '),
          first || 'struck',
        ];
    const legendEnd = freeBox.x0 - 8;
    const legend = pickLast(forms, (f) => tw(f, 'tiny') <= legendEnd - rackBox.x1 - 8);
    D.text('disk-legend', legendEnd, yLeg, one(legend, 'tiny', 'muted'), { owner: 'disklegend', anchor: 'end' });
    names.push(...ids);
  }
  const xs = diskX(m.n);
  markRect(c, 'marks', 'disk-free', `disk ${ps.rebuilt ? 'rebuilt' : 'spare'}`, xs, yDisk, diskW, diskH, 3, 'spare');
  const rebuilding = ps.failed && !ps.rackDown && !ps.lost && !ps.rebuilt;
  c.meta.live.disk = rebuilding ? { x: xs + 1.5, y: yDisk + 1.5, w: diskW - 3, h: diskH - 3 } : null;
  if (rebuilding && !view.live && ps.progress > 0) {
    const fh = (diskH - 3) * ps.progress;
    rect(c, 'marks', 'disk-fill', 'fill-rebuild', xs + 1.5, yDisk + diskH - 1.5 - fh, diskW - 3, fh);
  }
  if (ps.rebuilt) {
    const placed = D.place(
      'disk-free-name',
      [
        [xs + diskW / 2, yName, 'middle'],
        [xs + diskW - 1, yName, 'end'],
      ],
      one(`→${failedName(m)}`, 'tiny', 'ok-ink'),
      { owner: 'spare', margin: 1 },
    );
    if (placed) names.push(`→${failedName(m)}`);
  }
  c.meta.diskNames = names;
  const yBus = yDisk + diskH + 16;
  const yReadText = yBus + 20;
  const showReads = ps.failed && !ps.rackDown && !ps.lost;
  if (ps.lost) {
    D.text('reads-lost', X0, yReadText, one('nothing is left to rebuild from', 'small', 'lost-ink'), { owner: 'reads' });
    c.meta.lostSaid = true;
  } else if (hid.reads) {
    const by = frameBot + 3;
    const bh = yReadText + 7 - by;
    rect(c, 'marks', 'reads-hidden', 'bar-hidden', X0, by, IW, bh, 3);
    const long = 'the rebuild’s reads show after your answer';
    D.text(
      'reads-hidden-words',
      X0 + 8,
      by + bh / 2 + 4,
      one(tw(long, 'small') <= IW - 16 ? long : 'its reads show after your answer', 'small'),
      {
        owner: 'reads',
      },
    );
    c.meta.readsBox = true;
  } else if (showReads) {
    const xsC = xs + diskW / 2;
    const left = Math.min(...srcs.map((i) => diskX(i) + diskW / 2));
    const riserTop = yDisk + diskH + 6;
    for (const i of srcs) {
      const cx = diskX(i) + diskW / 2;
      line(c, 'links', `read-${m.pieces[i].id}`, 'read', cx, yDisk + diskH + 1, cx, yBus, 'reads');
    }
    c.meta.readStubs = srcs.length;
    path(c, 'links', 'read-bus', 'read', `M${r1(left)} ${r1(yBus)}H${r1(xsC)}V${r1(riserTop)}`, 'reads');
    D.link([...sampleLine(left, yBus, xsC, yBus), ...sampleLine(xsC, yBus, xsC, riserTop)], 'reads');
    path(c, 'marks', 'read-head', 'read-head', `M${r1(xsC - 3.5)} ${r1(yDisk + diskH + 7)}l3.5 -5 3.5 5z`);
    if (rebuilding)
      c.meta.live.reads = srcs.map((i) => {
        const cx = diskX(i) + diskW / 2;
        return {
          id: m.pieces[i].id,
          points: [
            [cx, yDisk + diskH + 1],
            [cx, yBus],
            [xsC, yBus],
            [xsC, riserTop],
          ] as const,
        };
      });
    const bw = wide ? 12 : 9;
    for (let k = 0; k < m.repairRead; k++)
      markRect(c, 'marks', `read-block-${k}`, 'read-block', X0 + k * (bw + 2), yReadText - 9, bw, 10, 1.5, 'reads');
    c.meta.readBlocks = m.repairRead;
    const bx = X0 + m.repairRead * (bw + 2) + 6;
    const forms = readWords(m);
    forms.find((f, k) => D.place(`reads-words`, [[bx, yReadText]], one(f, 'small'), { owner: 'reads', optional: k < forms.length - 1 }));
  } else {
    D.text('reads-none', X0, yReadText, one('no repair is running', 'small'), { owner: 'reads' });
  }
  D.region('pieces', { x: X0 - 6, y: yB - 22, w: IW + 12, h: yReadText + 10 - (yB - 22) });
  c.meta.piecesTop = yB - 22;
  // The race's staged crosses are numbered on the struck disks when their names cannot stand on the track.
  c.diskX = diskX;
  c.diskGeo = { yDisk, diskH, diskW };
  c.stagedList = stagedList;
  return yReadText;
}

/** C: the repair race on a fixed week (or zoomed to its window), the rebuild filling it, the others' failures. */
function race(c: Ctx, yReadText: number): number {
  const { D, m, ps, view, hid, X0, X1, IW, LH, playing } = c;
  const s = m.settings;
  const yC = yReadText + 34;
  const fname = failedName(m);
  const XR = X1 - 10;
  const IWR = XR - X0;
  const stagedList = c.stagedList!;
  const nameW = Math.max(0, ...stagedList.map((i) => tw(m.pieces[i].id, 'tiny')));
  const need = Math.max(16, nameW + 6);
  const zoom = stagedList.length > 0 && (IWR * s.repair) / 168 / (m.t + 1.6) < need;
  const span = zoom ? s.repair * 1.5 : 168;
  const tx = (h: number) => X0 + (h / span) * IWR;
  c.meta.zoom = zoom;
  let tagX = X1;
  if (view.kind === 'staged') {
    const tag = 'STAGED, NOT SAMPLED';
    const tw0 = tw(tag, 'smallB') + 12;
    tagX = X1 - tw0;
    markRect(c, 'marks', 'staged-tag', 'staged-tag', tagX, yC - 11, tw0, 15, 7.5, 'stagedtag');
    D.text('staged-tag-words', tagX + 6, yC + 0.5, one(tag, 'smallB', 'lost-ink'), { owner: 'stagedtag', cls: 'on-tag' });
    c.meta.stagedTags = 1;
  }
  const titleForms = !ps.failed
    ? ['The repair race', 'Repair race', 'Race']
    : ps.rackDown
      ? ['After the rack event', 'Rack event']
      : zoom
        ? [
            `After ${fname} fails: the race, zoomed to its window`,
            `After ${fname} fails: zoomed in`,
            `After ${fname} fails`,
            `${fname} fails`,
          ]
        : [`After ${fname} fails: the repair race`, `After ${fname} fails`, `${fname} fails`];
  // Beside the staged tag on the narrowest stage even the shortest title can leave no room: the rows name the race.
  const title = titleForms.find((f) => X0 + tw(f, 'label') <= tagX - 8);
  if (title) D.text('race-title', X0, yC, one(title, 'label'), { owner: 'racetitle' });
  const yRep = yC + 22;
  const bandY = yRep + 8;
  const repForms = !ps.failed
    ? ['Repair']
    : ps.rackDown
      ? [`No repair: the rack took every ${pieceWord(m, 1)} at 0`, 'No repair']
      : [`Detection and rebuild of ${fname}, from its failure at 0`, `Detect and rebuild ${fname}`];
  const repLabel = pickLast(repForms, (f) => tw(f, 'small') <= IW - 130);
  D.text('rep-label', X0, yRep, one(repLabel, 'small', ps.rackDown ? 'lost-ink' : ''), { owner: 'replabel' });
  const yOth = bandY + 32;
  const lineY = yOth + 12;
  const others = m.n - 1;
  const othForms = ps.rackDown
    ? m.n === 2
      ? ['The other copy, in the same event', 'The other copy']
      : [`The ${others} others, in the same event`, `The ${others} others`]
    : m.n === 2
      ? ['The other copy']
      : [`The ${others} others`, `${others} others`];
  const yAx = lineY + 16;
  const grid = zoom ? [0, s.repair / 2, s.repair, span] : [0, 24, 48, 72, 96, 120, 144, 168];
  for (const h of grid) line(c, 'grid', `race-grid-${h}`, 'gridline', tx(h), yRep + 4, tx(h), yAx, undefined, false);
  line(c, 'grid', 'race-axis', 'axis', X0, yAx, XR, yAx, undefined, false);
  const axisLabels = zoom ? [0, s.repair, span] : c.wide ? [0, 24, 48, 72, 96, 120, 144, 168] : [0, 24, 72, 168];
  c.meta.raceTicks = [];
  for (const h of axisLabels) {
    const anchor = h === 0 ? 'start' : h === span ? 'end' : 'middle';
    const box = D.text(`race-tick-${h}`, tx(h), yAx + 14, one(h === 0 ? '0' : formatRepairHours(h), 'small'), { anchor, ground: true });
    c.meta.raceTicks.push(box);
  }
  line(c, 'grid', 'race-track', 'track', X0, lineY, XR, lineY, undefined, false);
  c.meta.live.band = null;
  c.meta.live.playhead = null;
  if (ps.failed && !ps.rackDown) {
    const wx = tx(s.repair);
    rect(c, 'marks', 'band', `band${ps.lost ? ' lost' : ''}`, X0, bandY, Math.max(2, wx - X0), 10, 2, 'band');
    c.D.mark({ x0: X0, x1: Math.max(X0 + 2, wx), y0: bandY, y1: bandY + 10 }, 'band');
    const live = view.live && !ps.lost && !ps.rebuilt;
    if (live) {
      c.meta.live.band = { x: X0, y: bandY, w: wx - X0, h: 10 };
      c.meta.live.playhead = { y0: bandY - 3, y1: bandY + 13, y2: lineY - 5, y3: lineY + 5 };
    } else if (ps.progress > 0)
      rect(c, 'marks', 'band-fill', 'band-fill', X0, bandY, Math.max(1.5, (wx - X0) * ps.progress), 10, 2, 'band');
    const lead: Part[] = ps.rebuilt
      ? one(`rebuilt in ${formatRepairHours(s.repair)}`, 'small', 'ok-ink')
      : ps.lost
        ? one('stopped: too few left', 'small', 'lost-ink')
        : one(`repair ${formatRepairHours(s.repair)}`, 'small');
    const endX = ps.rebuilt ? wx + 10 : wx + 4;
    if (ps.rebuilt) checkGlyph(c, 'band-check', wx + 1, bandY + 5, 'band', 5.5);
    D.place(
      'band-words',
      [
        [endX + 4, bandY + 9],
        [X1, yRep, 'end'],
        [X0 + tw(repLabel, 'small') + 10, yRep],
      ],
      lead,
      { owner: 'band', ok: (b) => b.y0 > bandY - 2 || b.x0 >= X0 + tw(repLabel, 'small') + 6 },
    );
    if (view.kind === 'staged') {
      const shown = stagedList.map((piece, j) => ({ piece, j })).filter(({ piece }) => ps.stagedDown.includes(piece));
      const xsOf = shown.map(({ j }) => tx(s.repair * durabilityStagedAt(j, m.t)));
      shown.forEach(({ piece }, k) => xGlyph(c, `staged-x-${m.pieces[piece].id}`, xsOf[k], lineY, `st-${m.pieces[piece].id}`, 3.5));
      const named = shown.map(({ piece }, k) => {
        const own = `st-${m.pieces[piece].id}`;
        return D.place(`staged-name-${m.pieces[piece].id}`, [[xsOf[k], lineY - 10, 'middle']], one(m.pieces[piece].id, 'tiny'), {
          owner: own,
          ignore: own,
          optional: true,
        });
      });
      c.meta.stagedNames = shown.map((_, k) => ({ x: xsOf[k], ok: !!named[k] }));
      if (named.some((b) => !b))
        shown.forEach(({ piece, j }, k) => {
          if (named[k]) return;
          const own = `st-${m.pieces[piece].id}`;
          const box = D.place(`staged-num-${m.pieces[piece].id}`, [[xsOf[k], lineY - 10, 'middle']], one(String(j + 1), 'tiny'), {
            owner: own,
            ignore: own,
          });
          c.meta.stagedNames[k].ok = !!box;
          const g = c.diskGeo!;
          D.text(`disk-num-${m.pieces[piece].id}`, c.diskX!(piece) + g.diskW / 2, g.yDisk + g.diskH - 5, one(String(j + 1), 'tiny'), {
            owner: `disk-${m.pieces[piece].id}`,
            anchor: 'middle',
            cls: 'on-box',
          });
        });
      c.meta.stagedShown = shown.length;
      if (ps.lost) {
        const lx = tx(s.repair * durabilityStagedAt(stagedList.length - 1, m.t));
        D.place(
          'lost-words',
          [
            [lx + 9, lineY + 4],
            [lx + 9, lineY - 5],
            [lx - 9, lineY - 5, 'end'],
          ],
          one('lost', 'smallB', 'lost-ink'),
          { owner: 'lost', optional: true, ground: true },
        );
      }
    } else if (ps.rebuilt) {
      D.place(
        'none-failed',
        [
          [XR, lineY - 5, 'end'],
          [X1, yOth, 'end'],
        ],
        one('none failed', 'small'),
        { owner: 'others', optional: true },
      );
    }
    if (playing && !view.live && ps.progress > 0 && ps.progress < 1 && !ps.lost) {
      const hx = X0 + (wx - X0) * ps.progress;
      line(c, 'top', 'playhead-band', 'playhead', hx, bandY - 3, hx, bandY + 13, undefined, false);
      line(c, 'top', 'playhead-track', 'playhead', hx, lineY - 5, hx, lineY + 5, undefined, false);
    }
  } else if (ps.rackDown) {
    xGlyph(c, 'rack-x', X0 + 1, lineY, 'rackx', 3.5);
    const ids = m.pieces.map((p) => p.id).filter((id) => id !== fname);
    const forms = [`${ids.length <= 3 ? listOf(ids) : `all ${ids.length}`} lost at 0`, 'lost at 0'];
    forms.find((f, k) =>
      D.place('rack-lost', [[X0 + 11, lineY + 4]], one(f, 'small', 'lost-ink'), {
        owner: 'rackx',
        optional: k < forms.length - 1,
        ground: true,
      }),
    );
  }
  const othFit = othForms.filter((f) => tw(f, 'small') <= IW / 2);
  const othList = othFit.length ? othFit : othForms.slice(-1);
  // Each form 6 px clear of a staged name; on the narrowest stage the named crosses alone can fill the track's row.
  const crowded = c.stagedList!.length > 0;
  const tries = othList.map((f) => [f, 6] as const);
  tries.find(([f, margin], k) =>
    D.place(
      'others-words',
      [
        [X0, yOth],
        [XR, yOth, 'end'],
        [X1, yOth, 'end'],
      ],
      one(f, 'small'),
      { owner: 'othlabel', optional: crowded || k < tries.length - 1, margin },
    ),
  );
  const raceText = raceSentence(m, ps, view.kind, hid);
  const yRaceText = yAx + 36;
  wrapStage(raceText, 'cap', IW).forEach((l, i) => D.text(`race-text-${i}`, X0, yRaceText + i * LH, one(l, 'cap'), { owner: 'racetext' }));
  c.meta.raceText = raceText;
  D.region('race', { x: X0 - 6, y: yC - 22, w: IW + 12, h: yAx + 22 - (yC - 22) });
  const yRule = yRaceText + (reserved(c.W).race - 1) * LH + 22;
  line(c, 'grid', 'rule', 'rule', 0, yRule, c.W, yRule, undefined, false);
  return yRule;
}

/**
 * Regions closer than a tag's height share one outline and one tag, named by all their ids, so no tag sits across
 * another outline's stroke.
 */
function mergeAdjacent(D: Draw, ids: readonly string[]): string[] {
  const groups: string[][] = [];
  const box = (g: string[]) => {
    const bs = g.map((id) => D.regions[id][0]);
    const x0 = Math.min(...bs.map((b) => b.x));
    const y0 = Math.min(...bs.map((b) => b.y));
    return { x: x0, y: y0, w: Math.max(...bs.map((b) => b.x + b.w)) - x0, h: Math.max(...bs.map((b) => b.y + b.h)) - y0 };
  };
  for (const id of ids.filter((i) => D.regions[i]?.length === 1)) {
    const r = D.regions[id][0];
    const near = groups.find((g) => {
      const b = box(g);
      return r.x < b.x + b.w && b.x < r.x + r.w && Math.max(r.y - (b.y + b.h), b.y - (r.y + r.h)) < TAG.height + 8;
    });
    if (near) near.push(id);
    else groups.push([id]);
  }
  return groups.map((g) => {
    const id = g.join(' ');
    if (g.length > 1) D.region(id, box(g));
    return id;
  });
}

/**
 * The Durability stage at width `W`: the object and what is stored, its pieces on their disks with the rebuild's reads,
 * the repair race, and the model's yearly chance as a walk along one nines scale, with the facts at its foot. Its height
 * depends on the width alone: every wrapped text reserves the longest any setting and play moment needs.
 */
export function buildStage(width: number, m: DurabilityScenario, view: StageView): Stage {
  const W = Math.max(248, width);
  const D = new Draw(W);
  const L = layoutConsts(W);
  const ps = durabilityPlayState(m.settings, view.kind, view.tau);
  const meta: StageMeta = {
    ps,
    playing: view.tau !== null && !ps.done,
    readsBox: false,
    readStubs: 0,
    readBlocks: 0,
    lostSaid: false,
    piecesTop: 0,
    zoom: false,
    stagedShown: 0,
    stagedTags: 0,
    stagedNames: [],
    raceText: '',
    diskNames: [],
    keys: [],
    live: { band: null, disk: null, playhead: null, reads: [] },
    raceTicks: [],
    nineTicks: [],
    billionTicks: [],
    ghostSteps: [],
    wasRows: [],
    final: null,
    caret: null,
    caretWords: null,
    goal: null,
    goalWords: null,
    rowsShown: [],
    stepsBox: false,
    finalBox: false,
    stepMarks: 0,
    walkEnd: null,
    ninesShown: '',
    finalWords: '',
    finalLanded: false,
  };
  const c: Ctx = { D, W, m, view, hid: view.hid, ps, playing: meta.playing, ...L, meta };
  const hits: Hit[] = [];
  header(c, hits);
  const yA = objectRow(c);
  const yRead = disksRow(c, yA);
  const yRule = race(c, yRead);
  const yF = drawModel(c, yRule);
  const H = Math.round(yF + (reserved(W).facts - 1) * L.LH + 22);
  const focus = view.focus.length ? focusOutlines(D, mergeAdjacent(D, view.focus), H) : [];
  return { D, H, hits, focus, summary: summary(m, view.hid), meta };
}
