import {
  SHARD_FOLLOW,
  SHARD_K,
  SHARD_KEY_NAMES,
  SHARD_POINTS,
  SHARD_TURN,
  shardNum,
  shardPointAt,
  shardPointFor,
  shardPositions,
  shardTakeoff,
  type ShardDiff,
  type ShardFrame,
  type ShardMove,
  type ShardPlacement,
  type ShardScenario,
} from '@grasp/engine';
import { pick, r1, tw, type Draw } from './latency-draw';
import { lensLanes, positionsOf, rel, stripStack } from './ring-geometry';
import type { Hid } from './ring-words';

export interface LensInput {
  W: number;
  pad: number;
  inner: number;
  two: boolean;
  lY: number;
  ruleLines: readonly string[];
  sc: ShardScenario;
  c: ShardDiff | null;
  hid: Hid;
  frame: ShardFrame | null;
  live: boolean;
  replay: boolean;
  lensPlaced: ShardPlacement;
  win: { f: number; start: number };
  /** The ring's band radius, which the magnification is against. */
  rb: number;
  stripW: number;
  hotIds: readonly number[];
  showMoved: boolean;
  landedKey: (key: number) => boolean;
  ownerNow: (key: number) => string;
  movedSet: ReadonlyMap<number, ShardMove>;
  LABEL: (t: string) => string;
}
export interface Lens {
  h: number;
  table: { key: number; pending: boolean; moved: boolean }[];
  strip: { fx: number; caretX: number | null; walkX: number | null; walkEnd: number | null; win: { f: number; start: number } } | null;
}

const nodeCls = (m: string) => `n${m}`;
/** The strip's point names take two rows, the second a line of the 11 px mono (its glyph box is 1.3 em) under the first. */
const NAME_ROW = 14;
const pct1 = (x: number) => `${x >= 0.1 ? Math.round(x * 100) : (x * 100).toFixed(1)}%`;

/**
 * A closer look: the rule on the followed key, then on the ring the stretch around it laid flat and magnified (the
 * whole ring with one point a node), or under hash mod N the keys nearest it by hash with their remainders.
 */
export function drawLens(D: Draw, o: LensInput): Lens {
  const { W, pad, inner, two, lY, sc, win, stripW } = o;
  const ringMode = sc.scheme === 'ring';
  const lr = two ? 3 : 2.5;
  const keysHAll = Math.max(...SHARD_POINTS.filter((p) => p > 1).map((p) => lensLanes(stripW, lr, p) * (2 * lr + 1)));
  const sx0 = pad + 4;
  const at = positionsOf();
  const follow = SHARD_KEY_NAMES[SHARD_FOLLOW];
  const gwM = Math.max(56, tw('hash mod 6', 'small') + 10);
  // As many keys as keep their ids 6 px apart, an odd count so the followed key is in the middle.
  const idPitch = Math.max(26, tw(String(SHARD_K - 1), 'small') + 6 + 8);
  const nMod = Math.min(11, Math.max(5, Math.floor((stripW - gwM) / idPitch))) | 1;
  const mag = Math.round(stripW / win.f / (2 * Math.PI * o.rb));
  const fits = (t: string) => tw(o.LABEL(t), 'label') <= inner;
  const lensTitle = ringMode
    ? win.f >= 1
      ? pick(['A closer look · the whole ring, laid flat from 0', 'The whole ring, laid flat'], fits)
      : pick(
          [
            `A closer look · ${pct1(win.f)} of the ring around ${follow}, magnified ${mag}×`,
            `${pct1(win.f)} of the ring around ${follow}, ${mag}×`,
            `${pct1(win.f)} of the ring, ${mag}×`,
          ],
          fits,
        )
    : pick([`A closer look · the ${nMod} keys nearest ${follow} by hash`, `The ${nMod} keys nearest ${follow}`], fits);
  const title = o.LABEL(lensTitle ?? 'A closer look');
  D.text('lens-title', pad, lY + 11, [[title, 'label']], { owner: 'lens-title' });
  if (ringMode && tw(title, 'label') + 16 + tw('clockwise →', 'small') <= inner)
    D.text('cw2', W - pad, lY + 11, [['clockwise →', 'small']], { anchor: 'end', owner: 'cw2' });
  o.ruleLines.forEach((l, k) => D.text(k === 0 ? 'rule' : `rule-${k}`, pad, lY + 32 + 18 * k, [[l, 'cap']], { owner: 'rule' }));
  const stripTop = lY + 32 + 18 * o.ruleLines.length - 6;
  const keysH = keysHAll + 10;
  const bandY = stripTop + 18 + keysH + 6;
  const h = bandY + 8 + 22 + NAME_ROW - lY;
  const out: Lens = { h, table: [], strip: null };
  if (ringMode) out.strip = drawStrip(D, o, { sx0, bandY, lr, at, follow });
  else out.table = drawTable(D, o, { sx0, stripTop, gwM, nMod, follow });
  return out;
}

function drawStrip(
  D: Draw,
  o: LensInput,
  g: { sx0: number; bandY: number; lr: number; at: readonly number[]; follow: string },
): Lens['strip'] {
  const { c, hid, frame, win, stripW, lensPlaced } = o;
  const { sx0, bandY, lr, at } = g;
  const X = (a: number) => sx0 + (rel(a, win.start) / win.f) * stripW;
  const whole = win.f >= 1;
  const inWin = (a: number) => whole || rel(a, win.start) < win.f;
  const ring = lensPlaced.ring!;
  const pts = ring.map((p) => ({ ...p, rp: rel(p.at / SHARD_TURN, win.start) })).sort((a, b) => a.rp - b.rp);
  let prevX = sx0;
  const segs: { x0: number; x1: number; node: string; point: boolean }[] = [];
  for (const p of pts.filter((q) => q.rp < win.f || whole)) {
    const x = sx0 + (p.rp / win.f) * stripW;
    segs.push({ x0: prevX, x1: x, node: p.node, point: true });
    prevX = x;
  }
  const after = pts.find((p) => p.rp >= win.f && !whole) ?? pts[0];
  segs.push({ x0: prevX, x1: sx0 + stripW, node: after.node, point: false });
  const byNode: Record<string, string[]> = {};
  for (const sg of segs) if (sg.x1 - sg.x0 > 0.01) (byNode[sg.node] ??= []).push(`M${r1(sg.x0)} ${bandY}H${r1(sg.x1)}`);
  for (const m of Object.keys(byNode).sort())
    D.add('marks', `lens-band-${m}`, { k: 'path', cls: `band lens ${nodeCls(m)}`, d: byNode[m].join('') });
  D.mark({ x0: sx0, x1: sx0 + stripW, y0: bandY - 4, y1: bandY + 4 }, 'lens-band');
  const fresh = c && (!frame || frame.pointsIn) ? c.joined : [];
  const rowY = (r: number) => bandY + 20 + r * NAME_ROW;
  const taken: [number, number][][] = [[], []];
  const free = (r: number, x0: number, x1: number) => taken[r].every(([a, b]) => x1 + 6 <= a || x0 >= b + 6);
  const ticks: { x: number; node: string; gone: boolean }[] = [];
  let tick = 0;
  for (const sg of segs) {
    if (!sg.point) continue;
    const isNew = fresh.includes(sg.node);
    D.add('marks', `pt-${tick++}`, {
      k: 'line',
      cls: `pt-tick${isNew ? ' new' : ''}`,
      x1: r1(sg.x1),
      y1: bandY - 7,
      x2: r1(sg.x1),
      y2: bandY + 8,
    });
    D.link(
      [
        [sg.x1, bandY - 7],
        [sg.x1, bandY + 8],
      ],
      'pt',
    );
    ticks.push({ x: sg.x1, node: sg.node, gone: false });
  }
  const gone = drawGone(D, o, { X, inWin, bandY });
  // Magnified, each point is named under its tick, in a second row where the first is taken; each node's first point,
  // and each gone node's, is named before the rest, so every node in the window keeps a name.
  if (!whole) {
    ticks.push(...gone.map((q) => ({ x: q.x, node: q.m, gone: true })));
    const nodes = [...Object.keys(byNode), ...new Set(gone.map((q) => q.m))];
    const firsts = new Set(nodes.map((m) => ticks.findIndex((t) => t.node === m)));
    const order = ticks.map((_, i) => i).sort((a, b) => Number(firsts.has(b)) - Number(firsts.has(a)) || a - b);
    for (const i of order) {
      const { x, node, gone: was } = ticks[i];
      const wl = tw(node, 'mono');
      // A node's first point may sit a few px off its tick rather than go unnamed.
      const spots = (firsts.has(i) ? [0, -3, 3, -6, 6] : [0]).flatMap((dx) => {
        const lx = Math.min(Math.max(x + dx, sx0 + wl / 2), sx0 + stripW - wl / 2);
        return [0, 1].map((r) => [lx, r] as const);
      });
      const spot = spots.find(([lx, r]) => free(r, lx - wl / 2, lx + wl / 2));
      if (!spot) continue;
      const [lx, r] = spot;
      taken[r].push([lx - wl / 2, lx + wl / 2]);
      D.text(`pt-name-${i}`, lx, rowY(r), [[node, 'mono', was ? 'muted' : '']], {
        anchor: 'middle',
        owner: `pt xtick${was ? ' gone' : ''}`,
      });
    }
    // The stretch past the last point in the window belongs to a point beyond it: named at the strip's end, unless named.
    const tail = segs[segs.length - 1];
    if (!ticks.some((t) => t.node === tail.node)) {
      const wl = tw(tail.node, 'mono');
      const lx = Math.max(tail.x0 + wl / 2 + 2, sx0 + stripW - wl / 2);
      const r = [0, 1].find((k) => free(k, lx - wl / 2, lx + wl / 2));
      if (r !== undefined) D.text('pt-name-tail', lx, rowY(r), [[tail.node, 'mono']], { anchor: 'middle', owner: 'pt xtick' });
    }
  }
  if (whole) drawWholeNames(D, o, { segs, gone, sx0, bandY, rowY });
  // The row of point names is occupied as a whole, so no tag is placed among the names.
  D.mark({ x0: sx0, x1: sx0 + stripW, y0: bandY + 10, y1: bandY + 23 + NAME_ROW }, 'pt');
  const ids = [...Array.from({ length: SHARD_K }, (_, i) => i), ...o.hotIds].filter((i) => (whole ? i === SHARD_FOLLOW : inWin(at[i])));
  const stack = stripStack(
    ids.map((i) => [i, X(at[i]) - sx0] as const),
    lr,
    SHARD_FOLLOW,
  );
  const laneY = (lane: number) => bandY - 13.5 - lr - lane * (2 * lr + 1);
  for (const i of ids) {
    const x = X(at[i]);
    const yy = laneY(stack.lane.get(i)!);
    const hot = i >= SHARD_K;
    const moved = !hot && o.showMoved && o.landedKey(i);
    D.add('dots', `l${i}`, {
      k: 'circle',
      cls: hot ? 'dot hot' : `dot key lens ${nodeCls(o.ownerNow(i))}${moved ? ' moved' : ''}`,
      cx: r1(x),
      cy: r1(yy),
      r: moved ? lr - 0.5 : lr,
    });
    D.mark({ x0: x - lr, x1: x + lr, y0: yy - lr, y1: yy + lr }, 'lens-keys');
  }
  const fx = X(at[SHARD_FOLLOW]);
  const fy = laneY(0);
  D.add('dots', 'follow-ring', { k: 'circle', cls: 'follow-ring', cx: r1(fx), cy: r1(fy), r: r1(lr + 1.6) });
  const topLane = Math.max(0, ...ids.filter((i) => Math.abs(X(at[i]) - fx) < 2 * lr + 1).map((i) => stack.lane.get(i)!));
  const cyTop = laneY(topLane) - lr - 2.5;
  D.add('marks', 'lens-caret', { k: 'path', cls: 'caret', d: `M${r1(fx)} ${r1(cyTop)}l-4 -7h8z` });
  D.mark({ x0: fx - 5, x1: fx + 5, y0: cyTop - 8, y1: cyTop + 1 }, 'follow2');
  const wn = tw(g.follow, 'mono');
  const nx = Math.min(Math.max(fx, sx0 + wn / 2), sx0 + stripW - wn / 2);
  const under = ids.filter((i) => Math.abs(X(at[i]) - nx) < wn / 2 + lr + 1).map((i) => stack.lane.get(i)!);
  const dotsTop = laneY(Math.max(0, ...under)) - lr;
  D.text('lens-follow', nx, Math.min(cyTop - 11, dotsTop - 5), [[g.follow, 'mono']], { anchor: 'middle', owner: 'follow2' });
  let walkX: number | null = null;
  let walkEnd: number | null = null;
  if (!hid.after) {
    const owner = shardPointFor(ring, shardPositions().keys[SHARD_FOLLOW]);
    const orp = rel(owner.at / SHARD_TURN, win.start);
    const inside = whole ? owner.at >= shardPositions().keys[SHARD_FOLLOW] : orp < win.f && orp >= rel(at[SHARD_FOLLOW], win.start);
    // The whole ring laid flat wraps: a walk past the right end goes on from 0 at the left to the owner's point.
    const wraps = whole && !inside;
    const ownerX = X(owner.at / SHARD_TURN);
    const ex = inside || wraps ? ownerX : sx0 + stripW;
    const wy = bandY - 8;
    const head = `M${r1(ex - 4.5)} ${wy - 2.5}l3 2.5l-3 2.5`;
    if (wraps) {
      walkX = fx;
      D.add('top', 'walk', {
        k: 'path',
        cls: 'walk',
        d: `M${r1(fx)} ${r1(fy + lr + 2)}V${wy}H${r1(sx0 + stripW)}M${r1(sx0)} ${wy}H${r1(ex - 1.5)}${head}`,
      });
      walkEnd = ex;
    } else if (ex - fx > 6) {
      walkX = fx;
      D.add('top', 'walk', { k: 'path', cls: 'walk', d: `M${r1(fx)} ${r1(fy + lr + 2)}V${wy}H${r1(ex - 1.5)}${head}` });
      if (inside) walkEnd = ex;
    }
  }
  return { fx, caretX: fx, walkX, walkEnd, win };
}

/** A node that is down or gone keeps a struck grey tick at each of its points in the window, in either strip. */
function drawGone(D: Draw, o: LensInput, g: { X: (a: number) => number; inWin: (a: number) => boolean; bandY: number }) {
  const { c, lensPlaced } = o;
  const { X, inWin, bandY } = g;
  const out: { m: string; x: number }[] = [];
  for (const m of c?.left ?? []) {
    if (lensPlaced.members.includes(m)) continue;
    for (let j = 0; j < lensPlaced.points; j++) {
      const a = shardPointAt(m, j) / SHARD_TURN;
      if (!inWin(a)) continue;
      const x = X(a);
      D.add('marks', `gone-tick-${j}-${m}`, { k: 'line', cls: 'pt-tick gone-tick', x1: r1(x), y1: bandY - 7, x2: r1(x), y2: bandY + 8 });
      D.add('marks', `gone-x-${j}-${m}`, {
        k: 'path',
        cls: 'xmark thin',
        d: `M${r1(x - 3)} ${bandY - 3}l6 6M${r1(x + 3)} ${bandY - 3}l-6 6`,
      });
      out.push({ m, x });
    }
  }
  return out;
}

/**
 * The whole ring laid flat: a down or gone node's struck tick has its letter in grey, and each node's letter (with its count where every one fits) sits at the middle of its longest stretch, cut at the gone ticks.
 * Names keep 6 px apart; one pushed off its place is tied back to it by a short leader. None is ever dropped.
 */
function drawWholeNames(
  D: Draw,
  o: LensInput,
  g: {
    segs: { x0: number; x1: number; node: string }[];
    gone: readonly { m: string; x: number }[];
    sx0: number;
    bandY: number;
    rowY: (r: number) => number;
  },
) {
  const { hid, lensPlaced, stripW } = o;
  const { segs, gone, sx0, bandY } = g;
  const parts: { node: string; x0: number; x1: number }[] = [];
  for (const sg of segs) {
    const cuts = [sg.x0, ...gone.map((q) => q.x).filter((x) => x > sg.x0 && x < sg.x1), sg.x1].sort((a, b) => a - b);
    for (let i = 1; i < cuts.length; i++) parts.push({ node: sg.node, x0: cuts[i - 1], x1: cuts[i] });
  }
  const longest: Record<string, { x0: number; x1: number }> = {};
  for (const p of parts) if (!longest[p.node] || p.x1 - p.x0 > longest[p.node].x1 - longest[p.node].x0) longest[p.node] = p;
  const formOf = (m: string, k: number) => {
    const n = hid.after ? '?' : shardNum(lensPlaced.counts[m]);
    return [`${m}: ${n} ${lensPlaced.counts[m] === 1 && !hid.after ? 'key' : 'keys'}`, `${m}: ${n}`, m][k];
  };
  type Name = { id: string; text: string; want: number; room: number; muted: boolean; x: number; w: number };
  const layout = (k: number): Name[] | null => {
    const names: Name[] = [
      ...Object.entries(longest).map(([m, p]) => ({
        id: `arc-${m}`,
        text: formOf(m, k),
        want: (p.x0 + p.x1) / 2,
        room: p.x1 - p.x0,
        muted: false,
      })),
      ...gone.map((q) => ({ id: `gone-name-${q.m}`, text: q.m, want: q.x, room: Infinity, muted: true })),
    ]
      .map((n) => ({ ...n, w: tw(n.text, 'mono'), x: n.want }))
      .sort((a, b) => a.want - b.want);
    if (k < 2 && names.some((n) => n.w > n.room - 6)) return null;
    let right = -Infinity;
    for (const n of names) {
      n.x = Math.max(n.want, sx0 + n.w / 2, right + 6 + n.w / 2);
      right = n.x + n.w / 2;
    }
    let left = Infinity;
    for (const n of [...names].reverse()) {
      n.x = Math.min(n.x, sx0 + stripW - n.w / 2, left - 6 - n.w / 2);
      left = n.x - n.w / 2;
    }
    if (names.some((n, i) => i > 0 && n.x - n.w / 2 < names[i - 1].x + names[i - 1].w / 2 + 6 - 0.01) || left < sx0 - 0.01) return null;
    if (k < 2 && names.some((n) => Math.abs(n.x - n.want) > 0.5)) return null;
    return names;
  };
  const row = layout(0) ?? layout(1) ?? layout(2) ?? [];
  const y = g.rowY(0);
  for (const n of row) {
    D.text(n.id, n.x, y, [[n.text, 'mono', n.muted ? 'muted' : '']], { anchor: 'middle', owner: `pt xtick ${n.muted ? 'gone' : 'arc'}` });
    if (Math.abs(n.x - n.want) > 3) {
      D.add('links', `leader-${n.id}`, { k: 'line', cls: 'leader', x1: r1(n.want), y1: bandY + 5, x2: r1(n.x), y2: y - 10 });
      D.link(
        [
          [n.want, bandY + 5],
          [n.x, y - 10],
        ],
        'pt xtick',
      );
    }
  }
}

function drawTable(D: Draw, o: LensInput, g: { sx0: number; stripTop: number; gwM: number; nMod: number; follow: string }): Lens['table'] {
  const { sc, c, hid, frame, live, stripW } = o;
  const { sx0, stripTop, gwM, nMod } = g;
  const keyAt = shardPositions().keys;
  const byHash = Array.from({ length: SHARD_K }, (_, i) => i).sort((a, b) => keyAt[a] - keyAt[b]);
  const idx = byHash.indexOf(SHARD_FOLLOW);
  const half = (nMod - 1) / 2;
  const shown = Array.from({ length: nMod }, (_, k) => byHash[(idx - half + k + SHARD_K) % SHARD_K]);
  const nNow = sc.now.members.length;
  const pre = live && !frame!.pointsIn;
  const before = c && !hid.after && !pre ? c.before : null;
  const passed = (i: number) => !live || frame!.frac >= shardTakeoff(i);
  const landedHere = (i: number) => !live || !o.movedSet.has(i) || frame!.stage.get(i)!.st === 'dst';
  const modNow = hid.after || pre ? (c ? c.before.members.length : nNow) : nNow;
  const ownerOf = (i: number) => (hid.after || pre ? (c ? c.before.owners[i] : sc.now.owners[i]) : sc.now.owners[i]);
  const tight = (stripW - gwM) / nMod < 24;
  const modHead = (n: number) => (tight ? `mod ${n}` : `hash mod ${n}`);
  const idRole = tight ? 'small' : 'mono';
  type Row = [head: string, cell: (i: number) => string, role: 'small' | 'mono' | 'nameS', cls: string];
  const rows: Row[] = [
    ['user:', (i) => String(i), idRole, ''],
    ...(before
      ? ([
          [modHead(before.members.length), (i: number) => String(keyAt[i] % before.members.length), idRole, 'muted'],
          [tight ? 'was' : 'was on', (i: number) => before.owners[i], idRole, 'muted'],
        ] as Row[])
      : []),
    [modHead(modNow), (i) => (before && !passed(i) ? '…' : String(keyAt[i] % modNow)), idRole, ''],
    [before ? (tight ? 'now' : 'now on') : 'node', (i) => (before && !passed(i) ? '…' : ownerOf(i)), 'nameS', ''],
  ];
  const gwT = tight ? Math.max(...['mod 6', 'user:', 'node'].map((t) => tw(t, 'small'))) + 8 : gwM;
  const cw = (stripW - gwT) / nMod;
  const nodeRole = cw >= 30 ? 'nameS' : 'mono';
  const table: Lens['table'] = [];
  rows.forEach(([head, cell, role, cls], k) => {
    const ty = stripTop + 14 + 17 * k;
    D.text(`m${k}-head`, sx0 + gwT - 8, ty, [[head, 'small']], { anchor: 'end', owner: `m${k}` });
    shown.forEach((i, j) => {
      const x = sx0 + gwT + (j + 0.5) * cw;
      const last = k === rows.length - 1;
      const v = cell(i);
      const pending = v === '…';
      const moved = last && !!before && !pending && before.owners[i] !== sc.now.owners[i] && landedHere(i);
      if (last && !pending) {
        D.add('marks', `col-dot-${i}`, {
          k: 'circle',
          cls: `key ${nodeCls(v)}${moved ? ' moved' : ''}`,
          cx: r1(x - 7),
          cy: ty - 4,
          r: moved ? 2.5 : 3,
        });
        D.text(`col-${i}`, x + 3, ty, [[v, nodeRole, cls]], { anchor: 'middle', owner: `m${k}` });
      } else
        D.text(
          `m${k}-${i}`,
          x,
          ty,
          [[v, last && pending ? 'mono' : role, i === SHARD_FOLLOW && k === 0 ? 'ink' : pending ? 'muted' : cls]],
          {
            anchor: 'middle',
            owner: `m${k}`,
          },
        );
      if (last) table.push({ key: i, pending, moved });
    });
  });
  const fj = shown.indexOf(SHARD_FOLLOW);
  const fx = sx0 + gwT + (fj + 0.5) * cw;
  D.add('back', 'follow-col', {
    k: 'rect',
    cls: 'follow-col',
    x: r1(fx - cw / 2 + 1),
    y: stripTop + 1,
    w: r1(cw - 2),
    h: 17 * rows.length + 4,
    rx: 6,
  });
  return table;
}
