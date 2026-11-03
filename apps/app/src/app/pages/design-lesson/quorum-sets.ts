import {
  CROSS_DC_ONE_WAY_MS,
  QUORUM_ONE_WAY_MS,
  QUORUM_STALL_MS,
  QUORUM_VERSIONS,
  STAND_IN_ONE_WAY_MS,
  WRITE_TIMEOUT_MS,
  choose,
  formatDuration,
  formatMs,
  formatOrdinal,
  stalledIndex,
  type QuorumScenario,
  type QuorumSize,
} from '@grasp/engine';
import { r1, xGlyph, type Draw, type Edge, type Moment } from './quorum-draw';
import type { Ctx } from './quorum-stage';
import { tw, wrap } from './quorum-text';
import { nameList } from './quorum-words';

const V8 = QUORUM_VERSIONS.new;
const LINE = 18;

/** When the client hears back about the write, which is when the read leaves. */
export function writeBack(m: QuorumScenario): Moment {
  return ['w', m.write.outcome === 'refused' ? 0 : m.write.outcome === 'acked' ? m.write.ms : WRITE_TIMEOUT_MS];
}

/** The overlap sentence: why every read meets the write, or why one can miss it. */
function overlapSentence(c: Ctx): string {
  const { m, hid } = c;
  const { n, w, r } = m.settings;
  const write = m.write;
  const viaStandIns = !hid.read && m.readStandIns.length > 0;
  const standInNames = nameList(m.readStandIns.map((id) => m.all[id].name));
  if (hid.write) return `Which reads can miss v${V8} depends on how the write ends: after your answer.`;
  if (hid.count) return `Does every read of ${r} meet the ${w} that acked?`;
  if (write.outcome === 'refused')
    return viaStandIns
      ? `Nothing was written, and ${standInNames} ${m.readStandIns.length > 1 ? 'hold' : 'holds'} no copy of the key.`
      : 'Nothing was written, so there is nothing to miss.';
  if (write.outcome === 'timed-out') {
    if (!m.h) return `The write timed out and applied nowhere: every read returns v${QUORUM_VERSIONS.old}.`;
    const who = m.h > 2 ? `${m.h} replicas` : nameList(m.ackedHomes.map((i) => `R${i + 1}`));
    return m.staleReadSets === 0
      ? `The write timed out, yet every read of ${r} meets a replica that applied it.`
      : `The write timed out, but ${who} applied it: a read of ${r} that misses ${m.h > 1 ? 'them' : 'it'} returns v${QUORUM_VERSIONS.old}.`;
  }
  if (viaStandIns)
    return `This read asked ${standInNames} for the down ${nameList(m.readStandIns.map((id) => `R${(m.all[id].standsFor ?? 0) + 1}`))}; the sets count home replicas only.`;
  if (m.settings.sloppy && m.h < w && m.staleReadSets > 0)
    return m.h === 0
      ? `Only stand-ins acked, and the read goes to the home replicas: every read of ${r} can miss v${V8}.`
      : `The read goes to the home replicas, not the stand-ins holding the write: only ${m.h} home replica${m.h === 1 ? '' : 's'} acked, so a read of ${r} can miss ${m.h === 1 ? 'it' : 'them'}.`;
  if (m.staleReadSets === 0) return `Every read of ${r} shares a replica with the ${m.h} that acked.`;
  return `${r} + ${w} is not above ${n}: a read of ${r} can miss ${m.h === 1 ? 'the replica' : `all ${m.h}`} that acked.`;
}

/** The longest forms the overlap sentence takes, so each width reserves the most lines any of them needs. */
const OVERLAP_LONGEST = [
  'Does every read of 5 meet the 5 that acked?',
  'Which reads can miss v8 depends on how the write ends: after your answer.',
  'The write timed out, but 3 replicas applied it: a read of 2 that misses them returns v7.',
  'The read goes to the home replicas, not the stand-ins holding the write: only 1 home replica acked, so a read of 5 can miss it.',
  'Only stand-ins acked, and the read goes to the home replicas: every read of 5 can miss v8.',
  'This read asked H1 and H2 for the down R1 and R2; the sets count home replicas only.',
  'Nothing was written, and H1 and H2 hold no copy of the key.',
  'Every read of 5 shares a replica with the 5 that acked.',
];
const LIMIT =
  'R + W > N alone is not linearizable: reads racing a write can disagree, and concurrent writes settled by last-write-wins can drop one.';

/** The read-set strip: the guarantee over home read sets, apart from what this read happened to see. */
export function drawStrip(c: Ctx, top: number): number {
  const { D, m, hid, W, wide, pad, sentAt } = c;
  const { n, r } = m.settings;
  const write = m.write;
  const sent: Moment = ['r', sentAt];
  const back = writeBack(m);
  let y = top + 14;
  D.add('grid', 'strip-rule', { k: 'line', cls: 'rule', x1: pad, y1: y, x2: W - pad, y2: y });
  const stripTop = y;
  D.text('strip-label', pad, y + 26, [[`Read sets of ${r} ${r === 1 ? 'replica' : 'replicas'}`, 'label']]);
  const refused = write.outcome === 'refused' && !hid.count;
  const head = hid.count
    ? [`? of ${m.readSets}`, ` can miss v${V8}`]
    : refused
      ? ['none', ' written to miss']
      : [`${m.staleReadSets} of ${m.readSets}`, ` can miss v${V8}`];
  const headTone = hid.count || write.outcome !== 'acked' ? 'muted' : m.staleReadSets > 0 ? 'bad' : 'good';
  const cell = wide ? 14 : 12;
  const cgap = 2;
  const setGap = wide ? 8 : 5;
  const headCol = wide ? 28 : 20;
  const gx0 = pad + headCol;
  const gridW = m.sets.length * (cell + setGap) - setGap;
  const gridWMost = choose(n, Math.floor(n / 2)) * (cell + setGap) - setGap;
  const sideX = pad + Math.max(headCol + gridWMost, 236) + 28;
  const side = wide && W - pad - sideX >= 220;
  // The headline sits in the label's row unless its longest form cannot, so every state at a width draws it alike.
  const longestHead = Math.max(tw('none', 'head') + tw(' written to miss', 'cap'), tw('10 of 10', 'head') + tw(' can miss v8', 'cap'));
  const headStacked = !side && pad + tw('Read sets of 5 replicas', 'label') + 16 + longestHead > W - pad;
  const headParts = [
    [head[0], 'head', headTone],
    [head[1], 'cap', 'muted'],
  ] as const;
  const headAt = hid.count ? {} : { at: sent };
  if (side) D.text('strip-head', sideX, y + 27, headParts, headAt);
  else if (headStacked) D.text('strip-head', pad, y + 50, headParts, headAt);
  else D.text('strip-head', W - pad, y + 27, headParts, { anchor: 'end', ...headAt });
  y += headStacked ? 64 : 42;
  const gridTop = y;
  for (let i = 0; i < n; i++) {
    const acked = !hid.ackers && m.ackedHomes.includes(i);
    const yy = gridTop + i * (cell + cgap) + cell - 2;
    D.text(`strip-r${i}`, pad, yy, [[`R${i + 1}`, 'mono', acked ? 'good' : 'muted']], acked ? { at: back } : {});
    if (acked) D.text(`strip-r${i}-before`, pad, yy, [[`R${i + 1}`, 'mono', 'muted']], { until: back });
  }
  m.sets.forEach((s, k) => {
    const x = gx0 + k * (cell + setGap);
    for (let i = 0; i < n; i++) {
      const member = s.members.includes(i);
      const acked = member && !hid.ackers && m.ackedHomes.includes(i);
      const box = { k: 'rect', x: x + 0.5, y: gridTop + i * (cell + cgap) + 0.5, w: cell - 1, h: cell - 1, rx: 2 } as const;
      D.add('marks', `set${k}-${i}`, {
        ...box,
        cls: member ? (acked ? 'cell acked' : 'cell member') : 'cell',
        ...(acked ? { at: back } : {}),
      });
      if (acked) D.add('marks', `set${k}-${i}-before`, { ...box, cls: 'cell member', until: back });
    }
    if (s.canMiss && !hid.count && !refused)
      xGlyph(D, `set${k}-x`, x + cell / 2, gridTop + n * (cell + cgap) + 7, `set${k}`, 3.5, { at: sent });
    if (s.isThis && !hid.read)
      D.add('marks', `set${k}-this`, {
        k: 'rect',
        cls: 'this-ring',
        x: x - 3,
        y: gridTop - 3,
        w: cell + 6,
        h: n * (cell + cgap) - cgap + 6,
        rx: 4,
        at: ['r', sentAt + (m.read.rthMs ?? 0)],
      });
  });
  const gridBottom = gridTop + n * (cell + cgap) - cgap;
  D.mark({ x0: gx0 - 3, x1: gx0 + gridW + 3, y0: gridTop - 3, y1: gridBottom + 14 }, 'strip-grid');
  // The legend under the grid; five rows sit two pixels lower, as the first build measured.
  let ly = gridBottom + 30 + (n === 5 ? 2 : 0);
  const full: [string, string][] = [
    ['acked', 'acked v8'],
    ['member', 'in the read set'],
    ['x', 'can miss'],
    ['ring', 'this read'],
  ];
  const legend = full
    .map(([k, t]): [string, string] => [k, k === 'acked' && write.outcome === 'timed-out' ? 'has v8' : t])
    .filter(([k]) => !((k === 'acked' && hid.ackers) || (k === 'x' && hid.count) || (k === 'ring' && hid.read)));
  const legendW = wide ? 236 : W - 2 * pad;
  let legendRows = 1;
  for (let x0 = pad, i = 0; i < full.length; i++) {
    const iw = 12 + 5 + tw(full[i][1], 'small');
    if (x0 + iw > pad + legendW) {
      legendRows++;
      x0 = pad;
    }
    x0 += iw + 14;
  }
  const legendTop = ly;
  let lx = pad;
  for (const [k, t] of legend) {
    const iw = 12 + 5 + tw(t, 'small');
    if (lx + iw > pad + legendW) {
      lx = pad;
      ly += 16;
    }
    if (k === 'acked' || k === 'member')
      D.add('marks', `legend-${k}`, { k: 'rect', cls: `cell ${k}`, x: lx + 0.5, y: ly - 9.5, w: 10, h: 10, rx: 2 });
    if (k === 'x') D.add('marks', 'legend-x', { k: 'path', cls: 'xmark', d: `M${lx + 2} ${ly - 8}l7 7M${lx + 9} ${ly - 8}l-7 7` });
    if (k === 'ring') D.add('marks', 'legend-ring', { k: 'rect', cls: 'this-ring', x: lx + 0.5, y: ly - 10.5, w: 10, h: 12, rx: 3 });
    D.text(`legend-${k}-t`, lx + 17, ly, [[t, 'small', 'muted']]);
    lx += iw + 14;
  }
  // The sentence about overlap, and the one about its limit.
  ly = legendTop + (legendRows - 1) * 16;
  const sentW = side ? W - pad - sideX : W - 2 * pad;
  const l1 = wrap(overlapSentence(c), 'cap', sentW);
  const l2 = wrap(LIMIT, 'cap', sentW);
  const sx0 = side ? sideX : pad;
  // Beside the grid the headline is the column's first line and the sentences start 6 px under it.
  const sentTop = side ? stripTop + 27 + 6 + 14 : ly + 26;
  const overlapAt = hid.count || hid.write ? {} : { at: sent };
  l1.forEach((line, i) => D.text(`overlap${i}`, sx0, sentTop + i * LINE, [[line, 'cap', 'ink']], overlapAt));
  const limitTop = sentTop + l1.length * LINE + 4;
  l2.forEach((line, i) => D.text(`limit${i}`, sx0, limitTop + i * LINE, [[line, 'cap', 'muted']]));
  // The most lines any overlap sentence takes at this width, so the height depends only on width and N.
  const reserve = Math.max(...OVERLAP_LONGEST.map((t) => wrap(t, 'cap', sentW).length));
  const sentReserve = sentTop + (reserve * LINE + 4) + l2.length * LINE - 10;
  y = (side ? Math.max(ly, sentReserve) : sentReserve) + 8;
  D.region('strip', { x: Math.max(3, pad - 8), y: stripTop + 4, w: W - 2 * Math.max(3, pad - 8), h: y - stripTop - 4 });
  return y;
}

/** Every round trip a lane can show at this N, for reserving room for the tallest stack of dots. */
function possibleRtts(n: QuorumSize) {
  const ow = QUORUM_ONE_WAY_MS[n];
  const s = stalledIndex(n);
  const write = [...ow.map((d) => 2 * d), 2 * ow[s] + QUORUM_STALL_MS, ...STAND_IN_ONE_WAY_MS.map((d) => 2 * d)];
  const back = [...ow].reverse();
  const read = [...back.map((d) => 2 * d), 2 * back[s] + QUORUM_STALL_MS, ...STAND_IN_ONE_WAY_MS.map((d) => 2 * (CROSS_DC_ONE_WAY_MS + d))];
  return { write, read };
}

const DOT_R = 4.5;
const STACK_GAP = 2 * DOT_R + 2;
const STACK_STEP = 10;
interface Dot {
  t: number;
  x: number;
  order: number;
  name: string;
  cls: string;
  owner: string;
  at: Moment;
  k: number;
  y: number;
  base: Dot | null;
}

/** Dots closer than a dot and a gap stack upwards in time order: the earliest sits on the lane. */
function stackDots<T extends { t: number; x: number; order: number }>(items: T[]): (T & { k: number; base: T })[] {
  const sorted = [...items].sort((a, b) => a.t - b.t || a.order - b.order) as (T & { k: number; base: T })[];
  let prev: (T & { k: number; base: T }) | null = null;
  for (const d of sorted) {
    d.k = prev && d.x - prev.x < STACK_GAP ? prev.k + 1 : 0;
    d.base = d.k && prev ? prev.base : d;
    prev = d;
  }
  return sorted;
}
const tallestStack = (values: readonly number[], X: (t: number) => number) =>
  Math.max(1, ...stackDots(values.map((t, order) => ({ t, x: X(t), order }))).map((d) => d.k + 1));

const ground = (D: Draw, id: string, box: Edge, at: Moment | undefined, padX = 2, padY = 1, rx = 2) =>
  D.add('grid', `${id}-ground`, {
    k: 'rect',
    cls: 'ground',
    x: box.x0 - padX,
    y: box.y0 - padY,
    w: box.x1 - box.x0 + 2 * padX,
    h: box.y1 - box.y0 + 2 * padY,
    rx,
    at,
  });

const latest = (ms: readonly Moment[]): Moment => ms.reduce((a, b) => (a[1] >= b[1] ? a : b));

/** Latency on a log scale, 1 to 200 ms, each request timed from its own start: write acks and read answers. */
export function drawLatency(c: Ctx, top: number): number {
  const { D, m, hid, W, wide, pad, sentAt } = c;
  const { n, r } = m.settings;
  const write = m.write;
  const read = m.read;
  let y = top + 10;
  D.add('grid', 'lat-rule', { k: 'line', cls: 'rule', x1: pad, y1: y, x2: W - pad, y2: y });
  const latTop = y;
  D.text('lat-title', pad, y + 26, [
    ['Latency', 'label'],
    ['from each request · log scale', 'small', 'muted', 8],
  ]);
  const px0 = pad + (wide ? 104 : 0) + 8;
  const px1 = W - pad - (wide ? 18 : 12);
  const span = Math.log10(200);
  const X = (t: number) => r1(px0 + (Math.log10(Math.min(200, Math.max(1, t))) / span) * (px1 - px0));
  // Room above each lane for the tallest stack of dots this width and N can draw, so heights stay put.
  const tallR = tallestStack(possibleRtts(n).read, X);
  // Phone lanes carry their names above them, with room for a ring label between name and dots.
  const L1 = wide ? y + 60 : y + 74;
  const L2 = L1 + Math.max(wide ? 44 : 66, 34 + (tallR - 1) * STACK_STEP);
  const axisY = L2 + (wide ? 24 : 30);
  const ticks = [1, 2, 5, 10, 20, 50, 100, 200];
  for (const t of ticks)
    D.add('grid', `lat-grid${t}`, { k: 'line', cls: 'gridline', x1: X(t), y1: L1 - (wide ? 18 : 22), x2: X(t), y2: axisY });
  for (const [i, L] of [L1, L2].entries()) D.add('grid', `lat-lane${i}`, { k: 'line', cls: 'lane', x1: px0, y1: L, x2: px1, y2: L });
  D.add('grid', 'lat-axis', { k: 'line', cls: 'axis', x1: px0, y1: axisY, x2: px1, y2: axisY });
  const unitLabel = '200 ms';
  const unitLeft = X(200) + 4 - tw(unitLabel, 'small');
  let lastTick = -Infinity;
  ticks.forEach((t, i) => {
    const last = i === ticks.length - 1;
    const label = last ? unitLabel : String(t);
    const x = last ? X(t) + 4 : X(t);
    const w0 = tw(label, 'small');
    const left = last ? x - w0 : x - w0 / 2;
    if (!last && (left < lastTick + 6 || left + w0 > unitLeft - 6)) return;
    D.add('grid', `lat-tick${t}`, { k: 'line', cls: 'axis', x1: X(t), y1: axisY, x2: X(t), y2: axisY + 4 });
    D.text(`lat-tick${t}-t`, x, axisY + 17, [[label, 'small', 'muted']], { anchor: last ? 'end' : 'middle' });
    lastTick = left + w0;
  });
  if (wide) {
    D.text('lat-write', pad, L1 + 4, [['Write acks', 'cap', 'ink']]);
    D.text('lat-read', pad, L2 + 4, [['Read answers', 'cap', 'ink']]);
  } else
    for (const [t, L, id] of [
      ['Write acks', L1, 'lat-write'],
      ['Read answers', L2, 'lat-read'],
    ] as const) {
      D.add('grid', `${id}-ground`, { k: 'rect', cls: 'ground', x: pad - 2, y: L - 40, w: tw(t, 'small') + 6, h: 14, rx: 3 });
      D.text(id, pad, L - 30, [[t, 'small', 'ink']], { ground: true });
    }

  // A stack's names join under its lowest dot; a name that finds no room is reported by the layout spec.
  const placeName = (x: number, L: number, names: string[], owner: string, ringed: boolean, at: Moment) => {
    const t = names.join(', ');
    const yy = L + (ringed ? 19 : 17);
    const w0 = tw(t, 'small');
    for (const dx of [0, w0 / 2 - 4, -w0 / 2 + 4]) {
      const box = D.textBox(x + dx, yy, w0, 'small', 'middle');
      if (box.x0 < pad - 2 || box.x1 > W - pad + 2 || !D.free(box, owner, 1)) continue;
      const id = `name-${owner.replace(/ /g, '-')}`;
      ground(D, id, box, at);
      D.text(id, x + dx, yy, [[t, 'small', 'muted']], { anchor: 'middle', owner, ground: true, names: names.join(' '), at });
      return;
    }
    D.missing.push(t);
  };
  // A ring's label goes beside the ring (and its repair bar, which ends at xEnd), level or raised, then above it.
  const placeLabel = (
    id: string,
    x: number,
    L: number,
    texts: string[],
    ringR: number,
    owner: string,
    at: Moment,
    tone = 'ink',
    xEnd = x + ringR,
  ) => {
    const xl = x - ringR;
    const xr = Math.max(x + ringR, xEnd);
    for (const t of texts) {
      const w0 = tw(t, 'smallB');
      const cands: [number, number, 'start' | 'middle' | 'end'][] = [
        [xr + 6, L + 4, 'start'],
        [xl - 6, L + 4, 'end'],
        [xr + 6, L - 1, 'start'],
        [xl - 6, L - 1, 'end'],
        [(xl + xr) / 2, L - ringR - 7, 'middle'],
        [xl, L - ringR - 7, 'start'],
        [xr, L - ringR - 7, 'end'],
        [xr + 16, L + 4, 'start'],
        [xl - 16, L + 4, 'end'],
        [xr + 6, L - 12, 'start'],
        [xl - 6, L - 12, 'end'],
      ];
      for (const [cx0, cy0, anchor] of cands) {
        const box = D.textBox(cx0, cy0, w0, 'smallB', anchor);
        if (box.x0 < px0 - (wide ? 0 : 4) || box.x1 > W - pad) continue;
        if (!D.free(box, '', 2)) continue;
        ground(D, id, box, at, 3, 2, 3);
        D.text(id, cx0, cy0, [[t, 'smallB', tone]], { anchor, owner: `${owner}-label`, ground: true, at });
        return;
      }
    }
    D.missing.push(texts[0]);
  };
  const laneNote = (id: string, L: number, t: string, tone = 'muted', at?: Moment) => {
    D.add('grid', `${id}-ground`, { k: 'rect', cls: 'ground', x: px0, y: L - 8, w: tw(t, 'small') + 8, h: 14, rx: 0, at });
    D.text(id, px0 + 4, L + 4, [[t, 'small', tone]], { ground: true, at });
  };
  // Draws a lane's dots, stacked where they would touch, and returns where each one landed.
  const drawLane = (L: number, items: Omit<Dot, 'x' | 'order' | 'k' | 'y' | 'base'>[]): Dot[] => {
    const placed = stackDots(items.map((d, order) => ({ ...d, x: X(d.t), order, k: 0, y: 0, base: null }))) as Dot[];
    for (const d of placed) {
      d.y = L - d.k * STACK_STEP;
      D.add('marks', `dot-${d.owner}`, { k: 'circle', cls: `dot ${d.cls}`, cx: d.x, cy: d.y, r: DOT_R, dot: d.name, at: d.at });
      D.mark({ x0: d.x - 5, x1: d.x + 5, y0: d.y - 5, y1: d.y + 5 }, d.owner);
    }
    return placed;
  };
  // Names go under each stack; stacks whose names would touch share one label, in order, under their middle.
  const nameStacks = (placed: Dot[], L: number, ringedName: string | null) => {
    const groups: { xs: number[]; members: Dot[]; ringed: boolean }[] = [];
    const width = (ms: Dot[]) => tw(ms.map((d) => d.name).join(', '), 'small');
    for (const base of placed.filter((d) => d.k === 0)) {
      const members = placed.filter((d) => d.base === base);
      const last = groups.at(-1);
      if (last && base.x - last.xs.at(-1)! < (width(last.members) + width(members)) / 2 + 4) {
        last.xs.push(base.x);
        last.members.push(...members);
        last.ringed ||= base.name === ringedName;
      } else groups.push({ xs: [base.x], members, ringed: base.name === ringedName });
    }
    for (const g of groups) {
      const x = (Math.min(...g.xs) + Math.max(...g.xs)) / 2;
      const names = g.members.map((d) => d.name);
      placeName(x, L, names, g.members.map((d) => d.owner).join(' '), g.ringed, latest(g.members.map((d) => d.at)));
    }
  };
  const ring = (id: string, d: Dot, at: Moment) => {
    D.add('marks', id, { k: 'circle', cls: 'ring', cx: d.x, cy: d.y, r: 8, at });
    D.mark({ x0: d.x - 9, x1: d.x + 9, y0: d.y - 9, y1: d.y + 9 }, d.owner);
  };

  // Write acks.
  if (hid.write) laneNote('lat-wnote', L1, 'acks after your answer');
  else if (write.outcome === 'refused') laneNote('lat-wnote', L1, 'none: the write was refused', 'muted', ['w', 0]);
  else {
    const acks = write.ackOrder.map((id) => {
      const x = m.all[id];
      return { t: x.writeRtt, name: x.name, cls: x.home ? 'write' : 'standin', owner: `lat-${x.name}`, at: ['w', x.writeRtt] as Moment };
    });
    const placed = drawLane(L1, acks);
    let ringedName: string | null = null;
    if (write.outcome === 'timed-out') {
      const at: Moment = ['w', WRITE_TIMEOUT_MS];
      D.add('marks', 'lat-chevron', { k: 'path', cls: 'chevron', d: `M${px1 - 2} ${L1 - 6}l6 6l-6 6`, at });
      D.mark({ x0: px1 - 4, x1: px1 + 6, y0: L1 - 7, y1: L1 + 7 }, 'timeout');
      const t = `timed out at ${formatDuration(WRITE_TIMEOUT_MS)}`;
      const box = D.textBox(px1 - 8, L1 + 4, tw(t, 'smallB'), 'smallB', 'end');
      if (D.free(box, 'timeout')) {
        ground(D, 'lat-timeout', box, at, 3, 2, 3);
        D.text('lat-timeout', px1 - 8, L1 + 4, [[t, 'smallB', 'warn']], { anchor: 'end', owner: 'timeout', ground: true, at });
      } else placeLabel('lat-timeout', px1 + 2, L1, [t, 'timed out'], 6, 'timeout', at, 'warn');
    } else if (!hid.writeTime) {
      const wth = m.all[write.acked[write.acked.length - 1]].name;
      const d = placed.find((p) => p.name === wth)!;
      ringedName = d.k === 0 ? d.name : null;
      const at: Moment = ['w', write.ms];
      ring('lat-wring', d, at);
      placeLabel('lat-wlabel', d.x, d.y, [`acked ${formatMs(write.ms)}`, formatMs(write.ms)], 8, d.owner, at);
    }
    nameStacks(placed, L1, ringedName);
  }

  // Read answers.
  const readDone = read.set.length > 0;
  if (hid.read) laneNote('lat-rnote', L2, 'the read runs after your answer');
  else if (!readDone)
    laneNote(
      'lat-rnote',
      L2,
      read.outcome === 'timed-out'
        ? `timed out: ${read.reachable} answered, ${read.needed} needed`
        : `none: ${read.reachable} reachable, ${read.needed} needed`,
      'bad',
      ['r', sentAt],
    );
  else {
    const answers = read.answers.map((a) => {
      const x = m.all[a.id];
      return {
        t: a.rtt,
        name: x.name,
        cls: x.home ? 'read' : 'read standin',
        owner: `latr-${x.name}`,
        at: ['r', sentAt + a.rtt] as Moment,
      };
    });
    const placed = drawLane(L2, answers);
    let ringedName: string | null = null;
    if (!hid.verdict) {
      const rth = read.answers.filter((a) => a.rtt === read.rthMs).at(-1)!;
      const d = placed.find((p) => p.name === m.all[rth.id].name)!;
      ringedName = d.k === 0 ? d.name : null;
      ring('lat-rring', d, ['r', sentAt + (read.rthMs ?? 0)]);
      const returned: Moment = ['r', sentAt + (read.ms ?? 0)];
      const repairs = hid.repair ? [] : read.repairs;
      if (repairs.length) {
        const xe = Math.max(d.x + 9, X(read.ms!));
        D.add('marks', 'lat-repair-bar', { k: 'line', cls: 'repair-bar', x1: d.x + 8, y1: d.y, x2: xe, y2: d.y, at: returned });
        D.add('marks', 'lat-repair-tick', { k: 'line', cls: 'end-tick', x1: xe, y1: d.y - 6, x2: xe, y2: d.y + 6, at: returned });
        D.mark({ x0: d.x + 8, x1: xe + 2, y0: d.y - 6, y1: d.y + 6 }, 'returned');
        const repairMs = formatMs(read.repairMs).replace(' ms', '');
        placeLabel(
          'lat-rlabel',
          d.x,
          d.y,
          [
            `returned ${formatMs(read.ms!)} (+${repairMs} repair)`,
            `returned ${formatMs(read.ms!)}`,
            `+${formatMs(read.repairMs)} repair`,
            formatMs(read.ms!),
          ],
          8,
          'returned',
          returned,
          'good',
          xe + 2,
        );
      } else if (hid.repair)
        placeLabel('lat-rlabel', d.x, d.y, [`${formatOrdinal(r)} answer ${formatMs(read.rthMs!)}`, formatMs(read.rthMs!)], 8, d.owner, [
          'r',
          sentAt + (read.rthMs ?? 0),
        ]);
      else placeLabel('lat-rlabel', d.x, d.y, [`returned ${formatMs(read.ms!)}`, formatMs(read.ms!)], 8, d.owner, returned);
    }
    nameStacks(placed, L2, ringedName);
  }
  y = axisY + 24;
  D.region('latency', { x: Math.max(3, pad - 8), y: latTop + 4, w: W - 2 * Math.max(3, pad - 8), h: y - latTop - 4 });
  return y;
}
