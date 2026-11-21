import {
  SHARD_HOT_PCT,
  SHARD_K,
  SHARD_NAMES,
  SHARD_SALTS,
  shardNum,
  shardPctCol,
  shardPctOf,
  shardTakeoff,
  type ShardDiff,
  type ShardFrame,
  type ShardMove,
  type ShardPlacement,
  type ShardScenario,
} from '@grasp/engine';
import { r1, sampleLine, tw, type Draw, type Role } from './latency-draw';
import { pileMetrics } from './ring-geometry';
import type { Flight, FlightPath, RingView } from './ring-layout';

/** The hot key drawn at the size of its traffic: as many ordinary keys as carry its 30%. */
export const HOT_SLOTS = (SHARD_HOT_PCT / (100 - SHARD_HOT_PCT)) * SHARD_K;
/** The piles' scale: all the keys, so every pile of keys fits it (197 at most); a hot stack past it is cut. */
export const MAX_SLOTS = 200;

export interface PilesInput {
  sc: ShardScenario;
  view: RingView;
  c: ShardDiff | null;
  play: ShardDiff | null;
  frame: ShardFrame | null;
  live: boolean;
  movedSet: ReadonlyMap<number, ShardMove>;
  showMoved: boolean;
  two: boolean;
  pad: number;
  inner: number;
  ringW: number;
  ringY: number;
  ringH: number;
  placed: ShardPlacement;
  at: readonly number[];
  /** A change of points is playing. */
  replay: boolean;
}

const nodeCls = (m: string) => `n${m}`;

/** Where a key in flight is at `u` of its flight: it lifts straight off its pile, crosses at the apex, and drops. */
export function flightAt(f: FlightPath, u: number): [number, number] {
  const ease = (t: number) => 1 - (1 - t) * (1 - t);
  if (u < 0.15) return [f.x0, f.y0 + (f.apex - f.y0) * ease(u / 0.15)];
  if (u > 0.85) return [f.x1, f.apex + (f.y1 - f.apex) * (1 - ease(1 - (Math.min(u, 1) - 0.85) / 0.15))];
  const t = (u - 0.15) / 0.7;
  return [f.x0 + (f.x1 - f.x0) * (t * t * (3 - 2 * t)), f.apex - Math.min(6, f.apex - f.top - 2) * Math.sin(Math.PI * t)];
}

/** A small critical ×, on a stage-colored ground, beside a down node's letter. */
function xGlyphSmall(D: Draw, id: string, cx: number, cy: number, owner: string) {
  const s = 3;
  D.add('marks', `${id}-ground`, { k: 'circle', cls: 'xground', cx, cy, r: s + 3 });
  D.add('marks', id, { k: 'path', cls: 'xmark', d: `M${cx - s} ${cy - s}l${2 * s} ${2 * s}M${cx + s} ${cy - s}l${-2 * s} ${2 * s}` });
  D.mark({ x0: cx - s - 2, x1: cx + s + 2, y0: cy - s - 2, y1: cy + s + 2 }, owner);
}

const LABEL = (t: string) => t.toUpperCase();

/**
 * What each node holds: a pile of its keys a column, its height the node's share of all traffic on one scale (the hot
 * key a block as tall as its traffic), the keys in flight during a play, and the table of facts under the piles.
 */
export function drawPiles(D: Draw, o: PilesInput) {
  const { sc, view, c, play, frame, live, movedSet, showMoved, two, pad, inner, ringW, ringY, ringH, placed, at } = o;
  const s = sc.settings;
  const hid = view.hid;
  const ringMode = sc.scheme === 'ring';
  const binsX = two ? pad + ringW + 20 : pad;
  const binsW = two ? inner - ringW - 20 : inner;
  const gw0 = tw('even', 'small') + 4 + tw('33.3%', 'small') + 8;
  const bw0 = (binsW - gw0) / 6;
  const narrowPct = tw('43.3%', bw0 >= 40 ? 'mono' : 'small') + 6 > bw0;
  const gw = Math.max(gw0, ...['traffic %', 'of ring %'].map((t) => tw(t, 'small') + 8));
  const bw = (binsW - gw) / 6;
  const pile = pileMetrics(two, bw);
  const rows = Math.ceil(MAX_SLOTS / pile.c);
  const PH = rows * pile.p + 26;
  const binsH = 36 + PH + 18 + 16 * 5 + 6;
  const binsY = two ? ringY + Math.max(0, ringH - binsH) : ringY + ringH + 14;
  const pileTop = binsY + 36;
  const by = pileTop + PH;
  const binX = (m: string) => binsX + gw + SHARD_NAMES.indexOf(m as (typeof SHARD_NAMES)[number]) * bw;
  const pileX = (m: string) => binX(m) + (bw - pile.c * pile.p) / 2;
  const slotXY = (m: string, j: number): [number, number] => [
    pileX(m) + ((j % pile.c) + 0.5) * pile.p,
    by - 2 - (Math.floor(j / pile.c) + 0.5) * pile.p,
  ];
  const levelY = (slots: number) => by - 2 - (slots / pile.c) * pile.p;
  D.text('bins-title', binsX, binsY + 11, [[LABEL('What each node holds'), 'label']], { owner: 'bins-title' });
  const drawn = SHARD_NAMES.filter((m) => sc.names.includes(m) || (c && c.left.includes(m)));
  const up = (m: string) => sc.now.members.includes(m);
  const lists: Record<string, number[]> = {};
  const arrived: Record<string, Set<number>> = {};
  for (const m of drawn) {
    lists[m] = [];
    arrived[m] = new Set();
  }
  const order = Array.from({ length: SHARD_K }, (_, i) => i).sort((a, b) => at[a] - at[b]);
  const flying: { key: number; u: number; from: string; to: string; t0: number }[] = [];
  if (play) {
    for (const i of order) {
      const st = frame?.stage.get(i);
      const mv = movedSet.get(i);
      if (!mv) lists[sc.now.owners[i]].push(i);
      else if (st && st.st === 'src') lists[mv.from]?.push(i);
    }
    for (const i of order) {
      const st = frame?.stage.get(i);
      const mv = movedSet.get(i);
      if (!mv) continue;
      if (!st || st.st === 'dst') {
        lists[mv.to].push(i);
        arrived[mv.to].add(i);
      } else if (st.st === 'fly') flying.push({ key: i, u: st.u, from: mv.from, to: mv.to, t0: shardTakeoff(i) });
    }
  } else for (const i of order) lists[sc.now.owners[i]].push(i);
  // The hot key's pieces on each pile, and those that arrived in the last change.
  const hp = live ? play!.before : sc.now;
  const hotAt: Record<string, number> = {};
  const hotIn: Record<string, number> = {};
  for (const m of drawn) hotAt[m] = hotIn[m] = 0;
  if (s.hot) {
    const was = c && !live ? c.before : null;
    if (s.split)
      hp.salts.forEach((owner, j) => {
        if (!(owner in hotAt)) return;
        hotAt[owner]++;
        if (was && was.salts[j] !== owner) hotIn[owner]++;
      });
    else if (hp.hot in hotAt) {
      hotAt[hp.hot] = SHARD_SALTS;
      if (was && was.hot !== hp.hot) hotIn[hp.hot] = SHARD_SALTS;
    }
  }
  const members = drawn.filter(up);
  const evenSlots = (SHARD_K + (s.hot ? HOT_SLOTS : 0)) / members.length;
  const evenY = levelY(evenSlots);
  const evenX0 = binsX + gw - 2;
  const evenX1 = binX(drawn[drawn.length - 1]) + bw;
  const slotsPerPct = (SHARD_K + (s.hot ? HOT_SLOTS : 0)) / 100;
  const gridX1 = binsX + binsW;
  const lines: number[] = [];
  for (const t of [25, 50, 75, 100]) {
    const slots = t * slotsPerPct;
    if (slots > MAX_SLOTS + 0.01) continue;
    const ty = levelY(slots);
    if (Math.abs(ty - evenY) < 19) continue;
    D.add('grid', `grid-${t}`, { k: 'line', cls: 'gridline', x1: r1(evenX0), y1: r1(ty), x2: r1(gridX1), y2: r1(ty) });
    D.link(sampleLine(evenX0, ty, gridX1, ty, 2), 'axis');
    D.text(`grid-label-${t}`, binsX + gw - 6, ty + 4, [[`${t}%`, 'small']], { anchor: 'end', owner: 'axis gutter', ground: true });
    lines.push(ty);
  }
  D.add('grid', 'even-line', { k: 'line', cls: 'evenline', x1: r1(evenX0), y1: r1(evenY), x2: r1(evenX1), y2: r1(evenY) });
  D.link(sampleLine(evenX0, evenY, evenX1, evenY, 2), 'even');
  D.text(
    'even',
    binsX + gw - 6,
    evenY + 4,
    [
      ['even ', 'small'],
      [shardPctOf(100 / members.length), 'small', 'ink'],
    ],
    { anchor: 'end', owner: 'even gutter', ground: true },
  );
  lines.push(evenY);
  D.text('axis-title', binsX, binsY + 27, [["A pile's height is its share of all traffic", 'small']], { owner: 'axis-title' });
  const tops: Record<string, number> = {};
  for (const m of drawn) {
    const isUp = up(m);
    D.add('marks', `base-${m}`, {
      k: 'line',
      cls: `base ${isUp ? nodeCls(m) : 'gone'}`,
      x1: r1(pileX(m)),
      y1: by + 1.5,
      x2: r1(pileX(m) + pile.c * pile.p),
      y2: by + 1.5,
    });
    const isDown = !isUp && m === sc.downNode;
    D.text(`bin-name-${m}`, binX(m) + bw / 2 - (isDown ? 5 : 0), by + 18, [[m, 'nameS', isUp ? '' : 'muted']], {
      anchor: 'middle',
      owner: `bin${m}`,
    });
    if (isDown) xGlyphSmall(D, `bin-x-${m}`, binX(m) + bw / 2 + 7, by + 13.5, `bin${m}`);
    lists[m].forEach((key, j) => {
      const [x, yy] = slotXY(m, j);
      const moved = showMoved && arrived[m].has(key);
      D.add('dots', `p${key}`, {
        k: 'circle',
        cls: `dot key pile ${nodeCls(m)}${moved ? ' moved' : ''}`,
        cx: r1(x),
        cy: r1(yy),
        r: moved ? pile.r - 0.5 : pile.r,
        slide: true,
      });
    });
    const n = lists[m].length;
    tops[m] = levelY(n);
    if (n) D.mark({ x0: pileX(m), x1: pileX(m) + pile.c * pile.p, y0: levelY(Math.ceil(n / pile.c) * pile.c), y1: by }, 'pile');
    if (hotAt[m]) drawHot(m, n);
    if (view.landing.includes(m) && !live)
      D.add('top', `landing-${m}`, {
        k: 'rect',
        cls: 'landing',
        x: r1(pileX(m) - 3),
        y: r1(tops[m] - 3),
        w: r1(pile.c * pile.p + 6),
        h: r1(by + 4 - tops[m] + 3),
        rx: 4,
      });
  }
  function drawHot(m: string, n: number) {
    const each = HOT_SLOTS / SHARD_SALTS;
    const total = s.split ? hotAt[m] * each : HOT_SLOTS;
    const x0 = pileX(m);
    const xR = x0 + pile.c * pile.p;
    const full = Math.floor(n / pile.c);
    const rem = n % pile.c;
    const notchEnd = rem ? (full + 1) * pile.c : n;
    const ya = (sl: number) => (sl <= notchEnd && rem ? by - 2 - full * pile.p - ((sl - n) / (pile.c - rem)) * pile.p : levelY(sl));
    const segPath = (a: number, b: number) => {
      if (rem && a < notchEnd) {
        const xn = x0 + rem * pile.p;
        if (b <= notchEnd) return `M${r1(xn)} ${r1(ya(a))}H${r1(xR)}V${r1(ya(b))}H${r1(xn)}Z`;
        return `M${r1(xn)} ${r1(ya(a))}H${r1(xR)}V${r1(levelY(b))}H${r1(x0)}V${r1(levelY(notchEnd))}H${r1(xn)}Z`;
      }
      return `M${r1(x0)} ${r1(levelY(a))}H${r1(xR)}V${r1(levelY(b))}H${r1(x0)}Z`;
    };
    const top = Math.min(n + total, MAX_SLOTS);
    const stayed = s.split ? (hotAt[m] - hotIn[m]) * each : hotIn[m] ? 0 : total;
    const segs: [number, number, boolean][] = [
      [n, Math.min(n + stayed, top), false],
      [n + stayed, top, showMoved && hotIn[m] > 0],
    ];
    const cut = top < n + total;
    segs.forEach(([a, b, moved], k) => {
      if (b - a < 0.01) return;
      D.add('marks', `hot-${m}-${k}`, { k: 'path', cls: `hot-block${moved ? ' moved' : ''}${cut ? ' cut' : ''}`, d: segPath(a, b) });
    });
    if (top > n) D.mark({ x0, x1: xR, y0: levelY(top), y1: levelY(n) }, 'hot');
    for (let q = 1; q < (s.split ? hotAt[m] : 1); q++) {
      const sl = n + q * each;
      if (sl < top)
        D.add('marks', `hot-seam-${m}-${q}`, {
          k: 'line',
          cls: 'hot-seam',
          x1: r1(x0 + 0.5),
          y1: r1(levelY(sl)),
          x2: r1(xR - 0.5),
          y2: r1(levelY(sl)),
        });
    }
    tops[m] = levelY(top);
    const xm = x0 + (pile.c * pile.p) / 2;
    if (cut) {
      const leftOut = (SHARD_HOT_PCT * (n + total - top)) / HOT_SLOTS;
      D.add('marks', `cut-${m}`, { k: 'path', cls: 'cut-mark', d: `M${r1(xm - 4)} ${r1(levelY(top) - 2)}l4 -5l4 5z` });
      const movedCut = showMoved && hotIn[m] > 0 && n + stayed >= top;
      D.text(`hot-word-${m}`, xm, levelY(top) - 10, [[`hot +${shardPctOf(leftOut)}`, 'small', `bad${movedCut ? ' hot-moved' : ''}`]], {
        anchor: 'middle',
        owner: 'hot',
      });
    } else if (!s.split && pile.c * pile.p >= 24 && levelY(Math.max(n, notchEnd)) - levelY(top) >= 14) {
      const moved = showMoved && hotIn[m] > 0;
      D.text(`hot-word-${m}`, xm, (levelY(Math.max(n, notchEnd)) + levelY(top)) / 2 + 4, [['hot', 'small', moved ? 'bad' : 'on-fill']], {
        anchor: 'middle',
        owner: 'hot',
        cls: 'on-block',
        ground: true,
      });
    }
  }
  // Keys in flight: exactly the keys that are moving, each from its old pile to its new one.
  const flights: Flight[] = [];
  const colIdx = (m: string) => SHARD_NAMES.indexOf(m as (typeof SHARD_NAMES)[number]);
  for (const st of flying) {
    const [x0, y0] = slotXY(st.from, (lists[st.from] ?? []).length);
    const [x1, y1] = slotXY(st.to, lists[st.to].length);
    const lo = Math.min(colIdx(st.from), colIdx(st.to));
    const hi = Math.max(colIdx(st.from), colIdx(st.to));
    const highest = Math.min(evenY, ...drawn.filter((m) => colIdx(m) >= lo && colIdx(m) <= hi).map((m) => tops[m]));
    const head = highest - (pileTop + 4);
    const apex = Math.max(pileTop + 4, highest - Math.max(48, 0.35 * Math.abs(x1 - x0), 0.4 * head));
    const path = { x0, y0, x1, y1, apex, top: pileTop };
    const [x, yy] = flightAt(path, st.u);
    if (!view.flightsApart)
      D.add('dots', `f${st.key}`, { k: 'circle', cls: `dot key fly ${nodeCls(st.to)}`, cx: r1(x), cy: r1(yy), r: pile.r });
    flights.push({ key: st.key, x, y: yy, u: st.u, from: st.from, to: st.to, path, t0: st.t0, r: pile.r });
  }
  // The table under the piles: a row a fact, the rows with nothing to say left out and their room kept at the foot.
  const cellRole = bw >= 40 ? 'mono' : 'small';
  const counts = Object.fromEntries(drawn.map((m) => [m, lists[m].length]));
  const landedFrom = (m: string) =>
    (c?.moves ?? []).filter((mv) => mv.from === m && (!live || frame!.stage.get(mv.key)!.st === 'dst')).length;
  const inNow = (m: string) => (live ? arrived[m].size : c!.into[m]);
  const outNow = (m: string) => (live ? landedFrom(m) : c!.out[m]);
  const heads = ['keys', narrowPct ? 'traffic %' : 'traffic', ...(ringMode ? [narrowPct ? 'of ring %' : 'of ring'] : []), 'in', 'out'];
  type Row = [head: string, cell: (m: string) => string, id: string];
  const traffic = (m: string) =>
    live ? (s.hot ? Math.floor((7 * counts[m] + 60 * hotAt[m] + 1) / 2) : 5 * counts[m]) : (sc.traffic[m] ?? 0);
  // A share in tenths of a percent, in the form every share of the table fits its column in with 6 px to spare: one
  // decimal in the cells' face, one decimal small, or whole percents small (Describe keeps the decimal).
  const ringTenths = (m: string) => Math.round(placed.ringShare[m] * 1000);
  const shares = [...members.map(traffic), ...(ringMode ? members.filter((m) => m in placed.ringShare).map(ringTenths) : [])];
  const forms: [Role, boolean][] = [
    [cellRole, true],
    ['small', true],
    ['small', false],
  ];
  const pctText = (tenths: number, dec: boolean) => {
    const t = dec ? shardPctCol(tenths) : `${Math.round(tenths / 10)}%`;
    return narrowPct ? t.replace('%', '') : t;
  };
  const [pctRole, pctDec] =
    forms.find(([role, dec]) => Math.max(...shares.map((t) => tw(pctText(t, dec), role))) + 6 <= bw) ?? forms[forms.length - 1];
  const pctCell = (tenths: number) => pctText(tenths, pctDec);
  // The moved counts keep their sign while the widest fits with 6 px to spare; the row's head says the direction.
  const widestMoved = c ? Math.max(0, ...drawn.flatMap((m) => [c.into[m], c.out[m]]).map((n) => tw(`+${shardNum(n)}`, cellRole))) : 0;
  const signed = widestMoved + 6 <= bw;
  const plus = signed ? '+' : '';
  const minus = signed ? '−' : '';
  const tableRows: Row[] = [
    ['keys', (m) => (up(m) ? shardNum(counts[m]) : m === sc.downNode ? 'down' : 'left'), 'keys'],
    [heads[1], (m) => (up(m) ? pctCell(traffic(m)) : ''), 'traffic'],
    ...(ringMode
      ? ([
          [
            heads[2],
            // While a change of points plays, the ring is drawn half old and half new, so no one share is true yet.
            (m: string) => (up(m) && m in placed.ringShare ? (live && o.replay ? '…' : pctCell(ringTenths(m))) : ''),
            'ring',
          ],
        ] as Row[])
      : []),
    ...(c
      ? ([
          ['in', (m: string) => (inNow(m) ? `${plus}${shardNum(inNow(m))}` : up(m) || c.left.includes(m) ? '0' : ''), 'in'],
          ['out', (m: string) => (outNow(m) ? `${minus}${shardNum(outNow(m))}` : up(m) ? '0' : ''), 'out'],
        ] as Row[])
      : []),
  ];
  // Critical ink marks the busiest shard only while something is wrong: the hot key unsplit, or the challenge's bound unmet.
  const alarm = s.hot && !hid.after && (!s.split || (view.phase === 'challenge' && !view.met));
  const inCells: Record<string, string> = {};
  const outCells: Record<string, string> = {};
  tableRows.forEach(([head, cell, id], k) => {
    const ty = by + 18 + 16 * (k + 1);
    D.text(`row-${id}`, binsX + gw - 6, ty, [[head, 'small']], { anchor: 'end', owner: `row-${id}` });
    for (const m of drawn) {
      const raw = cell(m);
      const down = raw === 'down';
      const left = raw === 'left';
      const txt = down ? (bw >= 34 ? 'down' : '') : left ? 'left' : hid.after && raw !== '' ? '?' : raw;
      if (!txt) continue;
      if (id === 'in') inCells[m] = txt;
      if (id === 'out') outCells[m] = txt;
      const busy = id === 'traffic' && alarm && m === sc.busiest;
      const role = id === 'traffic' || id === 'ring' ? pctRole : cellRole;
      D.text(`cell-${id}-${m}`, binX(m) + bw / 2, ty, [[txt, role, down || busy ? 'bad' : left ? 'muted' : '']], {
        anchor: 'middle',
        owner: `cell-${id}-${m}`,
      });
    }
  });
  D.region('bins', { x: binsX - 4, y: binsY - 4, w: binsW + 8, h: binsH + 4 });
  return {
    pile,
    by,
    pileTop,
    bw,
    binX,
    levelY,
    slotsPerPct,
    evenY,
    lists,
    tops,
    area: { x0: binsX + gw, x1: binsX + binsW, y0: pileTop, y1: by },
    flights,
    lines,
    inCells,
    outCells,
    binsY,
    binsH,
  };
}
