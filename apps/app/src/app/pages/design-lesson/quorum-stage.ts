import { QUORUM_VERSIONS, REPLICA_STATES, WRITE_TIMEOUT_MS, formatMs, type QuorumScenario } from '@grasp/engine';
import { Draw, pauseGlyph, pillGlyph, quad, r1, sampleLine, xGlyph, type Moment, type Region } from './quorum-draw';
import { drawLatency, drawStrip } from './quorum-sets';
import { partsWidth, tw, type Part } from './quorum-text';
import { NEXT, STATE_SHORT, STATE_WORD, hiding, nameList, pillOf, summary, timeText, type Hid } from './quorum-words';
import { drawHeader, drawStandIns, drawWriter, handleBlock, lineClass } from './quorum-writer';

const { old: V7, new: V8 } = QUORUM_VERSIONS;
/** From this stage width the drawing takes its wide form: handles beside the writer and the reader, one row of answers. */
export const WIDE_FROM = 520;
/** A read short of answers waits out its timeout; a play shows the wait as this much model time. */
const READ_WAIT_SHOWN_MS = 50;
/** Later than any play ends: as a mark's `until`, it keeps the mark to plays. */
const PLAY_ONLY: Moment = ['r', Number.MAX_SAFE_INTEGER];

export type Pt = readonly [number, number];
export interface StageView {
  hide: readonly string[];
  /** The replica whose next state the hint names, with its pip ringed. */
  hint: number | null;
  reduced: boolean;
}
export interface Track {
  positions: number[];
  y: number;
}
export interface Stage {
  D: Draw;
  H: number;
  hid: Hid;
  wide: boolean;
  play: { x: number; y: number };
  cards: Region[];
  handles: { w: Track; r: Track };
  /** Where requests travel in a play: writer to each node, reader to each node, and each repair. */
  paths: { write: Map<number, Pt[]>; read: Map<number, Pt[]>; repair: Map<number, Pt[]> };
  summary: string;
}

/** What the stage draws on as it goes down: the drawing, the scenario, what hides, and the width's choices. */
export interface Ctx {
  D: Draw;
  m: QuorumScenario;
  hid: Hid;
  W: number;
  wide: boolean;
  pad: number;
  /** Whether the read leaves at all in this drawing: not while the question hides it. */
  sentAt: number;
}

const earlier = (a: Moment | null, b: Moment | null): Moment | null => (!a ? b : !b ? a : a[1] <= b[1] ? a : b);

/**
 * The Consistency & Quorums stage at width `W`: the write, the replicas, the read, the read-set guarantee and the times,
 * top to bottom, as drawing marks placed clear of each other. Every mark a play brings in carries the moment it
 * appears; at rest the stage shows the end state. What `view.hide` names is drawn as "?" everywhere (`hiding`).
 */
export function buildStage(W: number, m: QuorumScenario, view: StageView): Stage {
  const D = new Draw(W);
  const hid = hiding(view.hide);
  const wide = W >= WIDE_FROM;
  const pad = wide ? 16 : 8;
  const { n, r } = m.settings;
  const reps = m.replicas;
  const write = m.write;
  const read = m.read;
  const readDone = read.set.length > 0;
  const sentAt = read.sentAt;
  const c: Ctx = { D, m, hid, W, wide, pad, sentAt };
  // Five cards under about 300 px: chips drop the unit, which the key, the axis and Describe carry.
  const unitless = !wide && n === 5 && W < 300;
  const chipMs = (v: number) => (unitless ? formatMs(v).replace(' ms', '') : formatMs(v));
  const atW = (t: number): Moment => ['w', t];
  const atR = (t: number): Moment => ['r', t];

  // Header: Play, the label and the line key.
  const play = { x: pad - 6, y: 2 };
  let y = drawHeader(c, unitless);

  // Card columns.
  const gapMin = wide ? 12 : n === 5 ? 3 : 8;
  const cw = Math.min(wide ? 132 : 96, Math.floor((W - 2 * pad - (n - 1) * gapMin) / n));
  const gap = n > 1 ? (W - 2 * pad - n * cw) / (n - 1) : 0;
  const cx = (i: number) => r1(pad + i * (cw + gap) + cw / 2);
  const cardH = wide ? 80 : 72;
  // Narrow cards carry a short state word in the name row when there is room for one (not five on a phone).
  const cardWords = wide || cw >= 68;

  // Writer row, with the W handle beside it (wide) or above it (narrow), and the stand-ins beside it when sloppy.
  const writer = drawWriter(c, y);
  y = writer.y + writer.h;
  const writeCls = lineClass(c);
  const both = hid.verdict ? [] : m.both;
  const answerOf = (i: number) => read.answers.find((a) => a.id === i);
  const answerBack = (i: number) => atR(sentAt + m.all[i].readRtt);
  const paths: Stage['paths'] = { write: new Map(), read: new Map(), repair: new Map() };
  if (m.settings.sloppy) drawStandIns(c, writer, writeCls, both, paths);

  // The write fan.
  const fanH = wide ? 69 : 66;
  const chipH = 16;
  const wChipY = y + fanH;
  const cardY = wChipY + chipH + 4;
  const wApex: Pt = [Math.min(Math.max(cx(0), writer.x + 18), writer.x + writer.w - 18), writer.y + writer.h];
  const wthId = write.outcome === 'acked' ? write.acked[write.acked.length - 1] : null;
  reps.forEach((rep, i) => {
    const owner = `R${i + 1}`;
    if (rep.knownDown) return;
    const end: Pt = [cx(i), wChipY];
    D.add('links', `wline${i}`, {
      k: 'line',
      cls: `link ${writeCls(i)}`,
      x1: wApex[0],
      y1: wApex[1],
      x2: end[0],
      y2: end[1],
      owner: `writer ${owner}`,
      write: i,
    });
    D.link(sampleLine(wApex[0], wApex[1], end[0], end[1]), `writer ${owner}`);
    paths.write.set(i, [wApex, end]);
    let t: string;
    let chipCls = 'sent';
    let ink = 'ink';
    let at: Moment | undefined;
    if (hid.write) {
      t = '?';
      chipCls = 'unknown';
      ink = 'muted';
    } else if (write.outcome === 'refused') {
      t = wide ? 'not sent' : '–';
      chipCls = 'quiet';
      ink = 'muted';
      at = atW(0);
    } else if (rep.state === 'mid') {
      t = wide ? 'no ack' : '×';
      chipCls = 'quiet';
      ink = 'bad';
      at = atW(write.outcome === 'acked' ? write.ms : WRITE_TIMEOUT_MS);
    } else {
      t = chipMs(rep.writeRtt);
      at = atW(rep.writeRtt);
    }
    if (i === wthId && !hid.writeTime) chipCls += ' wth';
    const cwid = Math.max(26, tw(t, 'mono') + 10);
    D.add('marks', `wchip${i}`, { k: 'rect', cls: `chip ${chipCls}`, x: end[0] - cwid / 2, y: wChipY, w: cwid, h: chipH, rx: 8, at });
    D.mark({ x0: end[0] - cwid / 2, x1: end[0] + cwid / 2, y0: wChipY, y1: wChipY + chipH }, owner);
    D.text(`wchip${i}-t`, end[0], wChipY + 12, [[t, 'mono', ink]], { anchor: 'middle', owner, cls: 'on-chip', at });
  });

  // What each card shows at rest, after what the open question hides.
  const shown = reps.map((rep, i): number | '?' | null => {
    if (hid.write && rep.state !== 'down' && rep.state !== 'mid') return '?';
    if (hid.repair && read.repairs.includes(i) && !write.applied.includes(i)) return V7;
    return m.holds[i];
  });
  const quietRead = hid.verdict || hid.write;
  // The stale race: v8 reached the replica after the read did. Its lucky counterpart: a read set no ack covers that
  // heard v8 anyway.
  const race = reps.map((rep, i) => {
    const a = answerOf(i);
    return !quietRead && !!a && a.value === V7 && write.applied.includes(i) && rep.landAt > a.readAt;
  });
  const lucky = reps.map((_, i) => {
    const a = answerOf(i);
    return !quietRead && !hid.count && !!a && m.thisReadUnsure && a.value === V8;
  });
  const repairLand = (i: number) => atR(sentAt + (read.rthMs ?? 0) + m.all[i].readOneWay + m.all[i].pause);

  // Replica cards.
  const cards: Region[] = [];
  reps.forEach((rep, i) => {
    const owner = `R${i + 1}`;
    const x = r1(cx(i) - cw / 2);
    const st = rep.state;
    let cls = 'card';
    if (st === 'down') cls += ' down';
    if (st === 'mid') cls += ' mid';
    D.add('marks', `card${i}`, { k: 'rect', cls, x, y: cardY, w: cw, h: cardH, rx: 8 });
    if (both.includes(i)) {
      const climax = answerBack(i);
      if (gap >= 8)
        D.add('back', `both-ring${i}`, {
          k: 'rect',
          cls: 'both-ring',
          x: x - 4,
          y: cardY - 4,
          w: cw + 8,
          h: cardH + 8,
          rx: 12,
          at: climax,
        });
      D.add('marks', `both${i}`, { k: 'rect', cls: 'card-both', x, y: cardY, w: cw, h: cardH, rx: 8, at: climax });
      // The climax's second ring fades out as it lands; it exists only in a play.
      D.add('back', `both-echo${i}`, {
        k: 'rect',
        cls: 'both-echo',
        x: x - 2,
        y: cardY - 2,
        w: cw + 4,
        h: cardH + 4,
        rx: 10,
        at: climax,
        until: PLAY_ONLY,
      });
    }
    D.mark({ x0: x, x1: x + cw, y0: cardY, y1: cardY + cardH }, owner);
    const ix = wide ? 10 : 5;
    const nameY = cardY + (wide ? 22 : 18);
    const nameRole = wide ? 'name' : 'nameS';
    D.text(`card${i}-name`, x + ix, nameY, [[owner, nameRole, st === 'down' ? 'muted' : 'ink']], { owner, cls: 'on-card' });
    const repaired = read.repairs.includes(i) && !hid.repair;
    // The state word: repaired first (a repair lands before a raced v8 does), then the race and its lucky
    // counterpart, paused and the state.
    const base =
      rep.pause && st === 'up'
        ? { full: 'paused', short: 'paused', cls: 'warn' }
        : st === 'back' && hid.write
          ? { full: 'back', short: 'back', cls: 'muted' }
          : { full: STATE_WORD[st], short: STATE_SHORT[st], cls: 'muted' };
    let word = base;
    let wordAt: Moment | null = null;
    if (repaired) {
      word = { full: 'repaired', short: 'repaired', cls: 'good' };
      wordAt = repairLand(i);
    } else if (race[i]) {
      word = { full: `v${V8} at ${formatMs(rep.landAt)}`, short: `at ${formatMs(rep.landAt)}`, cls: 'warn' };
      wordAt = atW(rep.landAt);
    } else if (lucky[i]) {
      word = { full: `v${V8} at ${formatMs(rep.landAt)}`, short: `at ${formatMs(rep.landAt)}`, cls: 'good' };
      wordAt = answerBack(i);
    }
    const pipY = cardY + cardH - (wide ? 14 : 12);
    const pr = wide ? 3.5 : 2.5;
    const pg = wide ? 11 : 8;
    const nameRoom = cw - 2 * ix - tw(owner, nameRole) - 6;
    const chipY = cardY + (wide ? 32 : 26);
    const pauseInName = !cardWords && !!rep.pause;
    // Each word goes after the pips if it fits, else in the name row in place of the data center; `timing` says
    // whether it is the word a play ends on or the one it starts from.
    const placeWord = (wd: typeof word, timing: { at?: Moment; until?: Moment }, tag: string) => {
      const pipFits = wide && tw(wd.full, 'small') <= cw - (ix + 3 * pg + 2 * pr + 6) - 6;
      const slotFits = !pipFits && cardWords && !!wd.short && tw(wd.short, 'small') <= nameRoom;
      if (slotFits)
        D.text(`card${i}-slot${tag}`, x + cw - ix, nameY, [[wd.short!, 'small', wd.cls]], {
          anchor: 'end',
          owner,
          cls: 'on-card',
          ...timing,
        });
      else if (!pauseInName) {
        const dc = wide ? `DC ${rep.dc}` : rep.dc;
        if (tw(dc, 'small') <= nameRoom)
          D.text(`card${i}-dc${tag}`, x + cw - ix, nameY, [[dc, 'small', 'muted']], { anchor: 'end', owner, cls: 'on-card', ...timing });
      }
      if (pipFits)
        D.text(`card${i}-word${tag}`, x + ix + 3 * pg + 2 * pr + 6, pipY + 4, [[wd.full, 'small', wd.cls]], {
          owner,
          cls: 'on-card',
          ...timing,
        });
      return { pipFits, slotFits };
    };
    const placed = placeWord(word, wordAt ? { at: wordAt } : {}, '');
    if (wordAt) placeWord(base, { until: wordAt }, '-before');
    if (pauseInName) pauseGlyph(D, `card${i}-pause`, x + cw - ix - 8, nameY - 9);

    // The value the replica holds once the scenario has run, and in a play the v7 it held before.
    const value = shown[i];
    if (st === 'mid' && !hid.write) xGlyph(D, `card${i}-x`, x + ix + 8, chipY + 9, owner, 4);
    else if (value !== null) {
      const applied = write.applied.includes(i);
      const landsAt = value === V8 && !hid.write ? earlier(applied ? atW(rep.landAt) : null, repaired ? repairLand(i) : null) : null;
      const chip = (v: number | '?', parts: Part[], timing: { at?: Moment; until?: Moment }, tag: string) => {
        const chw = partsWidth(parts) + 12;
        const ccls = v === '?' ? 'unknown' : v === V8 ? 'new' : 'old';
        D.add('marks', `card${i}-chip${tag}`, { k: 'rect', cls: `chip ${ccls}`, x: x + ix, y: chipY, w: chw, h: 18, rx: 5, ...timing });
        D.text(`card${i}-value${tag}`, x + ix + 6, chipY + 13, parts, { owner, cls: 'on-chip', ...timing });
        return chw;
      };
      const named = (v: number | '?') => {
        const label = v === '?' ? '?' : `v${v}`;
        const name =
          wide && cw >= 100 && v === V8 ? QUORUM_VERSIONS.newValue : wide && cw >= 100 && v === V7 ? QUORUM_VERSIONS.oldValue : '';
        const ink = v === V8 ? 'chip-new-ink' : 'muted';
        return name
          ? ([
              [label, 'mono', ink],
              [name, 'small', 'muted', 5],
            ] as Part[])
          : ([[label, 'mono', ink]] as Part[]);
      };
      // A race with no room for its word says it in the chip: it held v7 when the read came, then v8 landed.
      const arrow = race[i] && !placed.slotFits && !placed.pipFits && tw(`v${V7}→v${V8}`, 'mono') + 12 <= cw - 2 * ix;
      // Without motion a repaired card shows what the repair replaced.
      const struck = view.reduced && repaired && tw(`v${V7}`, 'mono') + 4 + tw(`v${V8}`, 'mono') + 12 <= cw - 2 * ix - 14;
      const parts: Part[] = arrow
        ? [
            [`v${V7}→`, 'mono', 'warn'],
            [`v${V8}`, 'mono', 'chip-new-ink'],
          ]
        : struck
          ? [
              [`v${V7}`, 'mono', 'struck'],
              [`v${V8}`, 'mono', 'chip-new-ink', 4],
            ]
          : named(value);
      const chw = chip(value, parts, landsAt ? { at: landsAt } : {}, '');
      if (landsAt && rep.home && (st === 'up' || st === 'back')) chip(V7, named(V7), { until: landsAt }, '-before');
      if (repaired) {
        const gx = x + ix + chw + 9;
        if (gx + 6 <= x + cw - 3) {
          const at = repairLand(i);
          D.add('marks', `card${i}-repair-a`, { k: 'path', cls: 'repair-glyph', d: `M${gx + 4} ${chipY + 5}a4.5 4.5 0 1 0 1 5`, at });
          D.add('marks', `card${i}-repair-b`, { k: 'path', cls: 'repair-glyph', d: `M${gx + 5} ${chipY + 2}v3.5h-3.5`, at });
        }
      }
    }
    if (rep.pause && !pauseInName) pauseGlyph(D, `card${i}-pause`, x + cw - ix - 8, chipY + 4);
    // State pips: up, down, stops mid-write, back.
    REPLICA_STATES.forEach((s, j) =>
      D.add('marks', `card${i}-pip${j}`, { k: 'circle', cls: s === st ? 'pip on' : 'pip', cx: x + ix + pr + j * pg, cy: pipY, r: pr }),
    );
    if (view.hint === i) {
      const j = REPLICA_STATES.indexOf(NEXT[st]);
      D.add('marks', `card${i}-next`, { k: 'circle', cls: 'next-pip', cx: x + ix + pr + j * pg, cy: pipY, r: pr + 2.5 });
    }
    cards.push({ x, y: cardY, w: cw, h: cardH });
  });
  // Chips fill both edges of the card band, so its frame reaches up to the writer and takes the write fan.
  const cardsTop = writer.y + writer.h + 3;
  D.region('cards', { x: pad - 4, y: cardsTop, w: W - 2 * pad + 8, h: cardY + cardH + 4 + chipH + 4 - cardsTop });

  // Read chips under the cards, then the read fan (not drawn at all while the read itself waits for the answer).
  const rChipY = cardY + cardH + 4;
  const readerY = rChipY + chipH + fanH;
  const readerRows = (() => {
    if (wide) return 1;
    const answerW = tw('R5 v8', 'mono') + 14;
    const per = Math.max(1, Math.floor((W - 2 * pad - 24 + 6) / (answerW + 6)));
    return Math.ceil(n / per);
  })();
  const readerH = wide ? 62 : 20 + 12 + readerRows * 26;
  const shownAnswers = hid.read ? [] : read.answers;
  const chipList = [...shownAnswers].sort((a, b) => (b.value ?? 0) - (a.value ?? 0) || a.rtt - b.rtt);
  const answerText = (v: number | null) => (hid.verdict ? '?' : v === null ? '–' : `v${v}`);
  const answerW = (id: number, v: number | null) => tw(`${m.all[id].name} ${answerText(v)}`, 'mono') + 14;
  const sentT = hid.read
    ? 'read sent after your answer'
    : hid.writeTime
      ? 'sent when the write returns'
      : write.outcome === 'refused'
        ? 'sent at once'
        : `sent at ${timeText(sentAt)}`;
  const readerLabel = 'Reader · DC C';
  const rw = wide
    ? Math.min(
        Math.round(W * 0.56),
        Math.ceil(
          Math.max(
            tw(readerLabel, 'label') + 16 + tw('sent when the write returns', 'small'),
            chipList.reduce((s, a) => s + answerW(a.id, a.value) + 6, 0) - 6,
            230,
          ) + 24,
        ),
      )
    : W - 2 * pad;
  const rx = W - pad - rw;
  const rApex: Pt = [Math.min(Math.max(cx(n - 1), rx + 18), rx + rw - 18), readerY];
  const repairs = hid.repair ? [] : read.repairs;
  const repairOut = atR(sentAt + (read.rthMs ?? 0));
  const arcs: { id: number; start: Pt; c: Pt; end: Pt }[] = [];
  for (const id of repairs) {
    const start = rApex;
    const end: Pt = [cx(id) - 10, rChipY + chipH + 1];
    const mid = [(start[0] + end[0]) / 2, (start[1] + end[1]) / 2];
    const dx = end[0] - start[0];
    const dy = end[1] - start[1];
    const len = Math.hypot(dx, dy) || 1;
    let nx = -dy / len;
    let ny = dx / len;
    if (nx > 0) {
      nx = -nx;
      ny = -ny;
    }
    const bulge = Math.min(34, len * 0.3);
    const cpt: Pt = [mid[0] + nx * bulge, mid[1] + ny * bulge];
    const pts = Array.from({ length: 31 }, (_, k) => quad(start, cpt, end, k / 30));
    arcs.push({ id, start, c: cpt, end });
    paths.repair.set(id, pts);
    D.add('links', `repair${id}`, {
      k: 'path',
      cls: 'link repair',
      d: `M${r1(start[0])} ${r1(start[1])}Q${r1(cpt[0])} ${r1(cpt[1])} ${r1(end[0])} ${r1(end[1])}`,
      arrow: true,
      owner: `reader R${id + 1} repair${id + 1}`,
      at: repairOut,
    });
    D.link(pts, `reader R${id + 1} repair${id + 1}`);
  }
  const readDead: { i: number; s: Pt }[] = [];
  if (!hid.read)
    reps.forEach((rep, i) => {
      const owner = `R${i + 1}`;
      const s: Pt = [cx(i), rChipY + chipH];
      if (!rep.reachable) {
        const top = cardY + cardH;
        D.add('links', `rline${i}`, {
          k: 'path',
          cls: 'link dead',
          d: `M${s[0]} ${top}V${s[1]}L${rApex[0]} ${rApex[1]}`,
          owner: `reader ${owner} dead${i + 1}`,
          at: atR(sentAt),
        });
        D.link([...sampleLine(s[0], top, s[0], s[1]), ...sampleLine(s[0], s[1], rApex[0], rApex[1])], `reader ${owner} dead${i + 1}`);
        readDead.push({ i, s });
        return;
      }
      const inSet = read.set.includes(i);
      const answer = answerOf(i);
      D.add('links', `rline${i}`, {
        k: 'line',
        cls: `link read${inSet ? '' : ' weak'}`,
        x1: s[0],
        y1: s[1],
        x2: rApex[0],
        y2: rApex[1],
        owner: `reader ${owner}`,
        at: atR(sentAt),
      });
      D.link(sampleLine(s[0], s[1], rApex[0], rApex[1]), `reader ${owner}`);
      paths.read.set(i, [rApex, s]);
      const time = chipMs(rep.readRtt);
      let parts: Part[];
      if (inSet && answer) {
        const v = hid.verdict ? '?' : `v${answer.value}`;
        // An answer that differs from what the card holds at rest is the point of the drawing: warn ink.
        const differs = !hid.verdict && answer.value !== shown[i];
        const sep = tw(' ', 'mono') - 1;
        // Where value and time do not both fit, a read-set chip keeps the answer; the latency lane keeps the time.
        if (
          wide ||
          partsWidth([
            [v, 'mono'],
            [`· ${time}`, 'mono', '', sep],
          ]) +
            10 <=
            cw
        )
          parts = [
            [v, 'mono', differs ? 'warn' : 'ink'],
            [`· ${time}`, 'mono', 'ink', sep],
          ];
        else if (!hid.verdict) parts = [[v, 'mono', differs ? 'warn' : lucky[i] ? 'good' : 'ink']];
        else parts = [[time, 'mono', 'ink']];
      } else parts = [[time, 'mono', 'muted']];
      const at = inSet && answer ? atR(answer.readAt) : atR(sentAt);
      const cwid = Math.max(26, partsWidth(parts) + 10);
      D.add('marks', `rchip${i}`, {
        k: 'rect',
        cls: `chip ${inSet ? 'asked' : 'quiet'}`,
        x: s[0] - cwid / 2,
        y: rChipY,
        w: cwid,
        h: chipH,
        rx: 8,
        at,
      });
      D.mark({ x0: s[0] - cwid / 2, x1: s[0] + cwid / 2, y0: rChipY, y1: rChipY + chipH }, owner);
      D.text(`rchip${i}-t`, s[0], rChipY + 12, parts, { anchor: 'middle', owner, cls: 'on-chip', at });
    });
  // An unreachable replica's × sits where no repair arc or other line passes.
  for (const { i, s } of readDead) {
    for (const t of [0.5, 0.42, 0.58, 0.34, 0.66, 0.26, 0.74, 0.2]) {
      const p = [s[0] + (rApex[0] - s[0]) * t, s[1] + (rApex[1] - s[1]) * t];
      if (D.free({ x0: p[0] - 6, x1: p[0] + 6, y0: p[1] - 6, y1: p[1] + 6 }, `dead${i + 1}`, 2)) {
        xGlyph(D, `dead${i}-x`, r1(p[0]), r1(p[1]), `R${i + 1}`, 4, { at: atR(sentAt) });
        break;
      }
    }
  }
  for (const a of arcs) {
    const apex = quad(a.start, a.c, a.end, 0.5);
    const left = apex[0] < (a.start[0] + a.end[0]) / 2;
    const cand: [number, number, 'start' | 'middle' | 'end'][] = [
      [apex[0] - 6, apex[1] + 4, 'end'],
      [apex[0] + 6, apex[1] + 4, 'start'],
      [apex[0], apex[1] - 8, 'middle'],
    ];
    for (const [x, yy, anchor] of left ? cand : [cand[1], cand[0], cand[2]]) {
      if (D.free(D.textBox(x, yy, tw('repair', 'small'), 'small', anchor), '')) {
        D.text(`repair${a.id}-label`, x, yy, [['repair', 'small', 'good']], { anchor, owner: `repair${a.id + 1}`, at: repairOut });
        break;
      }
    }
  }

  // Reader box, and the R handle beside it (wide) or under the pill (narrow).
  D.add('marks', 'reader', { k: 'rect', cls: 'box', x: rx, y: readerY, w: rw, h: readerH, rx: 10 });
  D.mark({ x0: rx, x1: rx + rw, y0: readerY, y1: readerY + readerH }, 'reader');
  D.text('reader-label', rx + 12, readerY + 20, [[readerLabel, 'label']], { owner: 'reader', cls: 'on-card' });
  const sentFits = rx + 12 + tw(readerLabel, 'label') + 12 + tw(sentT, 'small') <= rx + rw - 12;
  const sentTiming = hid.read || hid.writeTime ? {} : { at: atR(sentAt) };
  if (sentFits)
    D.text('reader-sent', rx + rw - 12, readerY + 20, [[sentT, 'small', 'muted']], {
      anchor: 'end',
      owner: 'reader',
      cls: 'on-card',
      ...sentTiming,
    });
  const failAt = atR(sentAt + (read.outcome === 'timed-out' ? READ_WAIT_SHOWN_MS : 0));
  if (hid.read) {
    if (!sentFits) D.text('reader-sent', rx + 12, readerY + 44, [[sentT, 'small', 'muted']], { owner: 'reader', cls: 'on-card' });
  } else if (!readDone) {
    const t =
      read.outcome === 'timed-out'
        ? `timed out: ${read.reachable} answered, ${read.needed} needed`
        : `no answer: ${read.reachable} reachable, ${read.needed} needed`;
    D.text('reader-fail', rx + 12, readerY + 44, [[t, 'small', 'bad']], { owner: 'reader', cls: 'on-card', at: failAt });
  } else {
    let ccx = rx + 12;
    let ccy = readerY + 30;
    for (const a of chipList) {
      const wdt = answerW(a.id, a.value);
      if (ccx + wdt > rx + rw - 12) {
        ccx = rx + 12;
        ccy += 26;
      }
      const ccls = hid.verdict ? 'unknown' : a.value === V8 ? 'new' : 'old';
      const at = answerBack(a.id);
      D.add('marks', `answer${a.id}`, { k: 'rect', cls: `chip ${ccls}`, x: ccx, y: ccy, w: wdt, h: 20, rx: 6, answer: a.id, at });
      D.text(
        `answer${a.id}-t`,
        ccx + 7,
        ccy + 14,
        [
          [m.all[a.id].name, 'mono', 'muted'],
          [answerText(a.value), 'mono', a.value === V8 && !hid.verdict ? 'chip-new-ink' : 'muted', 5],
        ],
        { owner: 'reader', cls: 'on-chip', at },
      );
      ccx += wdt + 6;
    }
  }
  const rHandle = {
    id: 'rhandle',
    k: r,
    letter: 'R',
    what: 'answers a read waits for',
    survives: m.survives.read,
    succeed: m.avail.read,
    verb: 'reads',
  };
  y = readerY + readerH;
  // The verdict pill: the heaviest mark, landing last.
  const pill = pillOf(m, hid);
  const pillAt = hid.verdict ? {} : { at: readDone ? atR(sentAt + (read.ms ?? 0)) : failAt };
  let pillLines = [pill.text];
  if (tw(pill.text, 'pill') + 44 > W - 2 * pad) {
    const k = pill.text.lastIndexOf(' · ');
    pillLines = [pill.text.slice(0, k), pill.text.slice(k + 3)];
  }
  const pw = Math.max(...pillLines.map((l) => tw(l, 'pill'))) + 44;
  const ph = pillLines.length === 1 ? 32 : 48;
  const pillY = y + 10;
  const px = W - pad - pw;
  // Wide, a long pill reaches under the R handle's caption, which then takes a shorter form.
  let rTrack: Track | null = wide
    ? handleBlock(c, { ...rHandle, x: pad, y: readerY, w: rx - 24 - pad, capW: Math.min(rx - 24 - pad, px - 10 - pad) })
    : null;
  const handleBottom = readerY + 84;
  D.add('marks', 'pill', { k: 'rect', cls: `pill ${pill.tone}`, x: px, y: pillY, w: pw, h: ph, rx: 16, ...pillAt });
  D.mark({ x0: px, x1: px + pw, y0: pillY, y1: pillY + ph }, 'pill');
  D.add('text', 'pill-glyph', { k: 'path', cls: `glyph ${pill.tone}`, d: pillGlyph(pill.tone, px + 18, pillY + 16), ...pillAt });
  pillLines.forEach((line, i) =>
    D.text(`pill-t${i}`, px + 32, pillY + 21 + i * 16, [[line, 'pill', pill.tone === 'hidden' ? 'muted' : 'ink']], {
      owner: 'pill',
      cls: 'on-chip',
      ...pillAt,
    }),
  );
  let readerBottom = pillY + ph;
  let readerLeft = Math.min(rx, px);
  if (both.length && !hid.count) {
    const bothNames = both.map((id) => m.all[id].name);
    const t = `${nameList(bothNames)} both acked and answered`;
    const role = tw(t, 'cap') <= W - 2 * pad ? 'cap' : 'small';
    const text = tw(t, role) <= W - 2 * pad ? t : `${bothNames.join(', ')} acked and answered`;
    const at = both.map((id) => answerBack(id)).reduce((a, b) => (a[1] >= b[1] ? a : b));
    const box = D.text('both-caption', W - pad, pillY + ph + 18, [[text, role, 'good']], { anchor: 'end', at });
    readerBottom = box.y1;
    readerLeft = Math.min(readerLeft, box.x0);
  }
  D.region('reader', { x: readerLeft - 4, y: readerY - 3, w: W - pad - readerLeft + 7, h: readerBottom - readerY + 7 });
  y = Math.max(pillY + (wide ? 32 : 48) + 26, wide ? handleBottom : 0);
  if (!wide) {
    rTrack = handleBlock(c, { ...rHandle, x: pad, y: y + 4, w: W - 2 * pad });
    y += 4 + 84;
  }

  y = drawStrip(c, y);
  y = drawLatency(c, y);
  const H = Math.ceil(y + 4);
  return { D, H, hid, wide, play, cards, handles: { w: writer.track, r: rTrack! }, paths, summary: summary(m, hid) };
}
