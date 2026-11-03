import {
  QUORUM_SIZES,
  QUORUM_VERSIONS,
  WRITE_TIMEOUT_MS,
  formatDuration,
  formatMs,
  formatNines,
  formatOrdinal,
  quorumLevelName,
} from '@grasp/engine';
import { r1, sampleLine, type Moment } from './quorum-draw';
import type { Ctx, Stage, Track } from './quorum-stage';
import { tw } from './quorum-text';

const V8 = QUORUM_VERSIONS.new;
/** The room beside the writer for the stand-ins, and the gap before them. */
const STAND_W = 112;
const STAND_GAP = 14;

/** A W or R handle block: the track with its stops, the level names and the availability caption. */
export function handleBlock(
  c: Ctx,
  o: {
    id: string;
    x: number;
    y: number;
    w: number;
    k: number;
    letter: string;
    what: string;
    survives: number;
    succeed: number;
    verb: string;
    /** Room for the caption, where a mark beside the handle reaches under it. */
    capW?: number;
  },
): Track {
  const { D, m } = c;
  const n = m.settings.n;
  D.text(`${o.id}-name`, o.x, o.y + 14, [
    [o.letter, 'name', 'accent'],
    [o.what, 'small', 'muted', 6],
  ]);
  const tx0 = o.x + 22;
  const tx1 = o.x + o.w - 22;
  const ty = o.y + 38;
  const pos = (j: number) => r1(tx0 + ((j - 1) * (tx1 - tx0)) / (n - 1));
  D.add('marks', `${o.id}-rail`, { k: 'line', cls: 'rail', x1: tx0, y1: ty, x2: tx1, y2: ty });
  D.add('marks', `${o.id}-fill`, { k: 'line', cls: 'fill', x1: tx0, y1: ty, x2: pos(o.k), y2: ty });
  for (let j = 1; j <= n; j++) D.add('marks', `${o.id}-stop${j}`, { k: 'circle', cls: 'stop', cx: pos(j), cy: ty, r: 2.5 });
  for (let j = 1; j <= n; j++) {
    const name = quorumLevelName(j, n) ?? String(j);
    D.text(`${o.id}-level${j}`, pos(j), o.y + 62, [[name, j === o.k ? 'smallB' : 'small', j === o.k ? 'ink' : 'muted']], {
      anchor: 'middle',
      owner: o.id,
    });
  }
  const pct = formatNines(o.succeed);
  const forms = c.hid.avail
    ? [`survives ? down · ${o.verb} succeed ?`, `survives ? down · ${o.verb} ?`]
    : [
        `survives ${o.survives} down · ${o.verb} succeed ${pct}`,
        `survives ${o.survives} down · ${o.verb} ${pct}`,
        `survives ${o.survives} down · ${pct}`,
        `${o.survives} down · ${pct}`,
      ];
  const cap = forms.find((t) => tw(t, 'small') <= (o.capW ?? o.w)) ?? forms.at(-1)!;
  D.text(`${o.id}-cap`, o.x, o.y + 81, [[cap, 'small', 'muted']], { owner: o.id });
  D.region('handles', { x: o.x - 4, y: o.y - 2, w: o.w + 8, h: 90 });
  return { positions: Array.from({ length: n }, (_, j) => pos(j + 1)), y: ty };
}

/** The header's label and line key: beside the label when wide, its own row when narrow. Returns where the rest starts. */
export function drawHeader(c: Ctx, unitless: boolean): number {
  const { D, hid, W, wide, pad } = c;
  D.text('title', pad + 42, 29, [['One write, then one read', 'label']]);
  const keyItems: [string, string][] = [
    ['write', 'link write'],
    ['read', 'link read'],
    ...(hid.repair ? [] : [['repair', 'link repair'] as [string, string]]),
  ];
  const y = 48;
  if (wide) {
    let lx = W - pad;
    for (const [name, cls] of [...keyItems].reverse()) {
      D.text(`key-${name}`, lx, 29, [[name, 'small', 'muted']], { anchor: 'end' });
      lx -= tw(name, 'small') + 6;
      D.add('marks', `key-${name}-line`, { k: 'line', cls: `${cls} legend-line`, x1: lx - 16, y1: 25, x2: lx, y2: 25 });
      lx -= 30;
    }
    return y;
  }
  let lx = pad;
  const ky = y + 8;
  for (const [name, cls] of keyItems) {
    D.add('marks', `key-${name}-line`, { k: 'line', cls: `${cls} legend-line`, x1: lx, y1: ky - 4, x2: lx + 14, y2: ky - 4 });
    D.text(`key-${name}`, lx + 19, ky, [[name, 'small', 'muted']]);
    lx += 19 + tw(name, 'small') + 12;
  }
  const unitNote = 'times in ms';
  const keyEnd = pad + 19 * 3 + 12 * 2 + tw('write', 'small') + tw('read', 'small') + tw('repair', 'small');
  if (unitless && W - pad - tw(unitNote, 'small') >= keyEnd + 8)
    D.text('key-unit', W - pad, ky, [[unitNote, 'small', 'muted']], { anchor: 'end' });
  return y + 16;
}

export interface Writer {
  x: number;
  y: number;
  w: number;
  h: number;
  track: Track;
}

/** The writer box with the write's status, and the W handle beside it (wide) or above it (narrow). */
export function drawWriter(c: Ctx, top: number): Writer {
  const { D, m, hid, W, wide, pad } = c;
  const write = m.write;
  const atW = (t: number): Moment => ['w', t];
  // The status breaks only between its parts; wide, the box takes the longest one-line status where the handle keeps room.
  const most = QUORUM_SIZES.at(-1)!;
  const longest = Math.max(tw(`refused: ${most - 1} live, ${most} needed`, 'capB'), tw('outcome after your answer', 'capB'));
  const longestPart = Math.max(tw(`${most - 1} live, ${most} needed`, 'capB'), tw('after your answer', 'capB'));
  const oneLineW = longest + 24;
  const oneLiner = wide && W - pad - (pad + oneLineW + STAND_GAP + STAND_W + 24) >= 200;
  const w = oneLiner
    ? oneLineW
    : wide
      ? 156
      : Math.round(Math.min((W - 2 * pad) * 0.6, Math.max(124, (W - 2 * pad) * 0.5, longestPart + 24)));
  const h = oneLiner ? 84 : wide ? 92 : 88;
  const handle = {
    id: 'whandle',
    k: m.settings.w,
    letter: 'W',
    what: 'acks a write waits for',
    survives: m.survives.write,
    succeed: m.avail.write,
    verb: 'writes',
  };
  let y: number;
  let track: Track;
  if (wide) {
    y = top + 4;
    const hx = pad + w + STAND_GAP + STAND_W + 24;
    track = handleBlock(c, { ...handle, x: hx, y, w: W - pad - hx });
  } else {
    track = handleBlock(c, { ...handle, x: pad, y: top, w: W - 2 * pad });
    y = top + 92;
  }
  const x = pad;
  D.add('marks', 'writer', { k: 'rect', cls: 'box', x, y, w, h, rx: 10 });
  D.mark({ x0: x, x1: x + w, y0: y, y1: y + h }, 'writer');
  const label = tw('Writer · DC A', 'label') <= w - 20 ? 'Writer · DC A' : 'Writer';
  D.text('writer-label', x + 12, y + 20, [[label, 'label']], { owner: 'writer', cls: 'on-card' });
  D.text(
    'writer-value',
    x + 12,
    y + 43,
    [
      [`v${V8}`, wide ? 'name' : 'nameS', 'ink'],
      [QUORUM_VERSIONS.newValue, 'cap', 'muted', 6],
    ],
    { owner: 'writer', cls: 'on-card' },
  );
  let status: { parts: string[]; tone: string; at: Moment | undefined };
  if (hid.write) status = { parts: ['outcome', 'after your answer'], tone: 'muted', at: undefined };
  else if (write.outcome === 'acked')
    status = { parts: [hid.writeTime ? 'acked in ?' : `acked in ${formatMs(write.ms)}`], tone: 'good', at: atW(write.ms) };
  else if (write.outcome === 'refused')
    status = { parts: ['refused:', `${write.live} live, ${write.needed} needed`], tone: 'bad', at: atW(0) };
  else status = { parts: [`timed out at ${formatDuration(WRITE_TIMEOUT_MS)}`], tone: 'warn', at: atW(WRITE_TIMEOUT_MS) };
  const oneLine = status.parts.join(' ');
  const lines = tw(oneLine, 'capB') <= w - 22 ? [oneLine] : status.parts;
  lines.forEach((line, i) =>
    D.text(`writer-status${i}`, x + 12, y + 64 + i * 16, [[line, 'capB', status.tone]], { owner: 'writer', cls: 'on-card', at: status.at }),
  );
  if (write.outcome === 'timed-out' && !hid.write) {
    // While it waits out the timeout: a countdown ring and the ack it waits for.
    const lastAck = Math.max(0, ...write.applied.map((id) => m.all[id].writeRtt));
    const waiting = `waiting for a ${formatOrdinal(write.applied.length + 1)} ack`;
    const span = { at: atW(lastAck), until: atW(WRITE_TIMEOUT_MS) };
    D.add('marks', 'countdown', { k: 'circle', cls: 'countdown', cx: x + w - 18, cy: y + 18, r: 8, ...span });
    D.text('writer-waiting', x + 12, y + 64, [[waiting, 'cap', 'muted']], { owner: 'writer', cls: 'on-card', ...span });
  }
  D.region('writer', { x: x - 2, y: y - 2, w: w + 4, h: h + 4 });
  return { x, y, w, h, track };
}

/** How a write line is drawn: neutral while the write hides, one style while which replicas acked hides. */
export function lineClass(c: Ctx): (id: number) => string {
  const { hid, m } = c;
  const write = m.write;
  return (id) => {
    if (hid.write) return 'pending';
    if (write.outcome === 'refused') return 'unsent';
    if (hid.writeTime) return 'write';
    const solid = write.outcome === 'timed-out' ? write.applied : write.acked;
    return solid.includes(id) ? 'write' : 'write weak';
  };
}

/** The stand-ins H1 and H2 beside the writer, each with the write it holds and the replica it stands in for. */
export function drawStandIns(c: Ctx, wr: Writer, writeCls: (id: number) => string, both: readonly number[], paths: Stage['paths']): void {
  const { D, m, hid, W, wide, pad, sentAt } = c;
  const { write, read } = m;
  const sx = wr.x + wr.w + STAND_GAP;
  const sw = wide ? STAND_W : W - pad - sx;
  const sh = (wr.h - 8) / 2;
  for (let j = 0; j < 2; j++) {
    const s = m.standIns[j];
    const sy = wr.y + j * (sh + 8);
    const owner = `H${j + 1}`;
    D.add('marks', `stand${j}`, { k: 'rect', cls: s ? 'box dashed' : 'box idle', x: sx, y: sy, w: sw, h: sh, rx: 8 });
    if (s && !hid.read && read.set.includes(s.id))
      D.add('marks', `stand${j}-asked`, {
        k: 'rect',
        cls: both.includes(s.id) ? 'box both' : 'box asked',
        x: sx,
        y: sy,
        w: sw,
        h: sh,
        rx: 8,
        at: ['r', sentAt + s.readRtt],
      });
    D.mark({ x0: sx, x1: sx + sw, y0: sy, y1: sy + sh }, owner);
    D.add('links', `stand${j}-line`, {
      k: 'line',
      cls: `link ${s ? writeCls(s.id) : 'unsent'}`,
      x1: wr.x + wr.w,
      y1: sy + sh / 2,
      x2: sx,
      y2: sy + sh / 2,
      owner: `writer ${owner}`,
      write: s?.id,
    });
    D.link(sampleLine(wr.x + wr.w, sy + sh / 2, sx, sy + sh / 2), `writer ${owner}`);
    D.text(`stand${j}-name`, sx + 8, sy + sh / 2 + 5, [[owner, 'nameS', s ? 'ink' : 'muted']], { owner, cls: 'on-card' });
    if (!s) {
      const idle = 'standing by';
      if (sx + 34 + tw(idle, 'small') <= sx + sw - 6)
        D.text(`stand${j}-idle`, sx + 34, sy + sh / 2 + 4, [[idle, 'small', 'muted']], { owner, cls: 'on-card' });
      continue;
    }
    paths.write.set(s.id, [
      [wr.x + wr.w, sy + sh / 2],
      [sx, sy + sh / 2],
    ]);
    const has = write.applied.includes(s.id);
    const chipT = hid.write ? '?' : has ? `v${V8}` : '–';
    const chx = sx + 34;
    const timing = has && !hid.write ? { at: ['w', s.landAt] as Moment } : {};
    D.add('marks', `stand${j}-chip`, {
      k: 'rect',
      cls: `chip ${hid.write ? 'unknown' : has ? 'new' : 'old'}`,
      x: chx,
      y: sy + sh / 2 - 9,
      w: 26,
      h: 18,
      rx: 5,
      ...timing,
    });
    D.text(`stand${j}-value`, chx + 13, sy + sh / 2 + 4, [[chipT, 'mono', has && !hid.write ? 'chip-new-ink' : 'muted']], {
      anchor: 'middle',
      owner,
      cls: 'on-chip',
      ...timing,
    });
    const forT = `for R${(s.standsFor ?? 0) + 1}`;
    if (sx + 66 + tw(forT, 'small') <= sx + sw - 6)
      D.text(`stand${j}-for`, sx + 66, sy + sh / 2 + 4, [[forT, 'small', 'muted']], { owner, cls: 'on-card' });
  }
  D.region('standins', { x: sx - 2, y: wr.y - 2, w: sw + 4, h: wr.h + 4 });
}
