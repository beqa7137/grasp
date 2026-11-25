import {
  CDN_HEAD_RANKS,
  CDN_OBJECTS,
  cdnColumns,
  cdnCumShare,
  cdnGroup,
  cdnKey,
  formatRank,
  formatShare,
  type CdnScenario,
} from '@grasp/engine';
import { r1 } from './stage-draw';
import { pickLast, tw } from './cdn-text';
import { AXIS_TITLES, fitsIn, legendRows, line, para, path, rect, text, type Ctx } from './cdn-draw';
import { placeTicks, type Tick } from './cdn-timeline';
import { kneeWords, later, legendItems, type Who } from './cdn-words';

const columns = new Map<string, { edge: number; shield: number }[]>();
/** The square's columns at a setting and a count, kept: the same setting is drawn again at every play moment. */
function columnsOf(sc: CdnScenario, n: number) {
  const s = sc.settings;
  const id = `${s.rps}/${s.pops}/${s.ttl}/${s.shield}/${s.variants}/${n}`;
  let cols = columns.get(id);
  if (!cols) {
    if (columns.size > 16) columns.delete(columns.keys().next().value!);
    columns.set(id, (cols = cdnColumns(sc, n)));
  }
  return cols;
}

/**
 * Every request, objects ordered by popularity, each as wide as its share of requests, by the model; a column's height is
 * where its requests are answered, so each band's area is exactly its share. The tail bracket, the lanes' ranks, the
 * half-hit rings with their ranks on the axis, and the key rows that name them.
 */
export function square(c: Ctx, y: number): number {
  const { g, r, sc, hid } = c;
  const s = sc.settings;
  const top = y;
  text(
    c,
    'square-label',
    g.x0,
    y + 11,
    [
      [
        pickLast(
          ['Every request, most popular objects first · the model', 'Every request, popular first · model', 'Every request · model'],
          fitsIn('label', g.iw),
        ),
        'label',
        'muted',
      ],
    ],
    { owner: 'square' },
  );
  y += 22;
  legendRows(legendItems(sc, hid), g.iw).forEach((row, k) => {
    for (const it of row) {
      rect(c, 'marks', `swatch-${it.who}`, `swatch-${it.who}`, g.x0 + it.dx, y + k * 18 + 3, 10, 10, 2);
      text(c, `legend-${it.who}`, g.x0 + it.dx + 14, y + k * 18 + 12, [[it.text, 'cap', 'ink']], { owner: 'legend' });
    }
  });
  y += r.legend * 18 + 4;
  const yAxisW = 32;
  const px0 = g.x0 + yAxisW;
  const px1 = g.x1;
  const pw = px1 - px0;
  const X = (share: number) => px0 + pw * share;
  const tail = formatShare(1 - cdnCumShare(CDN_HEAD_RANKS));
  const tailN = cdnGroup(CDN_OBJECTS - CDN_HEAD_RANKS);
  text(
    c,
    'tail',
    px1,
    y + 9,
    [
      [
        pickLast(
          [`the ${tailN} least popular: ${tail} of requests`, `${tailN} least popular: ${tail}`, `the tail: ${tail}`],
          fitsIn('small', g.iw - 4),
        ),
        'small',
        'muted',
      ],
    ],
    { anchor: 'end', owner: 'tail' },
  );
  path(c, 'grid', 'bracket', 'bracket', `M${r1(X(cdnCumShare(CDN_HEAD_RANKS)))},${r1(y + 18)} V${r1(y + 14)} H${r1(px1)} V${r1(y + 18)}`);
  y += 22;
  // The lanes' ranks, nudged apart to keep 6 px, each over its own triangle.
  const marks = sc.lanes.map((l) => {
    const t = `#${cdnGroup(l.rank)}`;
    return { rank: l.rank, x: X((cdnCumShare(l.rank - 1) + cdnCumShare(l.rank)) / 2), t, w: tw(t, 'mono'), x0: 0 };
  });
  let end = -Infinity;
  for (const m of marks) {
    m.x0 = Math.min(Math.max(g.x0, m.x - m.w / 2, end + 6), px1 - m.w);
    end = m.x0 + m.w;
  }
  for (let i = marks.length - 2; i >= 0; i--)
    if (marks[i].x0 + marks[i].w + 6 > marks[i + 1].x0) marks[i].x0 = marks[i + 1].x0 - 6 - marks[i].w;
  for (const m of marks) {
    text(c, `lanemark-${m.rank}`, m.x0, y + 9, [[m.t, 'mono', 'ink']], { owner: 'lanemark' });
    path(
      c,
      'grid',
      `lanemark-tri-${m.rank}`,
      'lane-mark',
      `M${r1(m.x - 3)},${r1(y + 12)} L${r1(m.x + 3)},${r1(y + 12)} L${r1(m.x)},${r1(y + 16)} Z`,
    );
  }
  y += 18;
  const ph = c.D.W < 420 ? 112 : 140;
  const py0 = y;
  const py1 = y + ph;
  const Y = (v: number) => py1 - ph * v;
  const rings: { kind: Who; x: number; y: number; text: string }[] = [];
  if (!hid.curveBands) {
    const n = Math.max(40, Math.round(pw));
    const cols = columnsOf(sc, n);
    const ptsE = cols.map((col, i): [number, number] => [X((i + 0.5) / n), Y(col.edge)]);
    const ptsS = cols.map((col, i): [number, number] => [X((i + 0.5) / n), Y(col.edge + col.shield)]);
    const run = (pts: [number, number][]) => pts.map(([x, yy]) => `${r1(x)},${r1(yy)}`).join(' L');
    path(c, 'marks', 'band-origin', 'band-origin', `M${r1(px0)},${r1(py0)} H${r1(px1)} V${r1(py1)} H${r1(px0)} Z`);
    if (s.shield) {
      const f = ptsS[0][1];
      const l = ptsS[ptsS.length - 1][1];
      path(
        c,
        'marks',
        'band-shield',
        'band-shield',
        `M${r1(px0)},${r1(py1)} L${r1(px0)},${r1(f)} L${run(ptsS)} L${r1(px1)},${r1(l)} V${r1(py1)} Z`,
      );
      // A stage-colored hairline parts the shield's band from the origin's: their colors alone are too close.
      path(c, 'marks', 'band-sep', 'band-sep', `M${r1(px0)},${r1(f)} L${run(ptsS)} L${r1(px1)},${r1(l)}`);
    }
    const f = ptsE[0][1];
    const l = ptsE[ptsE.length - 1][1];
    path(
      c,
      'marks',
      'band-edge',
      'band-edge',
      `M${r1(px0)},${r1(py1)} L${r1(px0)},${r1(f)} L${run(ptsE)} L${r1(px1)},${r1(l)} V${r1(py1)} Z`,
    );
    line(c, 'grid', 'half', 'gridline', px0, Y(0.5), px1, Y(0.5));
    const ring = (rank: number, v: number, kind: Who) => {
      if (!(rank >= 1 && rank <= CDN_OBJECTS)) return;
      const x = X(cdnCumShare(rank));
      line(c, 'top', `knee-line-${kind}`, `knee-line ${kind}`, x, Y(v) + 4, x, py1 + 4);
      c.D.add('top', `knee-${kind}`, { k: 'circle', cls: `knee ${kind}`, cx: r1(x), cy: r1(Y(v)), r: 4 });
      rings.push({ kind, x, y: Y(v), text: formatRank(rank) });
    };
    ring(sc.edgeKnee, 0.5, 'edge');
    if (s.shield && sc.shieldKnee > 0) {
      const q = cdnKey(s, Math.round(sc.shieldKnee));
      ring(sc.shieldKnee, q.edge + (1 - q.edge) * 0.5, 'shield');
    }
  } else {
    rect(c, 'marks', 'square-hidden', 'hidden-box', px0, py0, pw, ph, 3);
    text(
      c,
      'square-hidden-words',
      (px0 + px1) / 2,
      (py0 + py1) / 2 + 4,
      [
        [
          pickLast([`Which objects hit shows ${later(c.hid)}`, `shows ${later(c.hid)}`, later(c.hid)], fitsIn('small', pw - 12)),
          'small',
          'muted',
        ],
      ],
      { anchor: 'middle', owner: 'square-hidden' },
    );
  }
  c.meta.rings = rings.map(({ kind, x, y: ry }) => ({ kind, x: r1(x), y: r1(ry) }));
  line(c, 'grid', 'square-x', 'axis', px0, py1, px1, py1);
  line(c, 'grid', 'square-y', 'axis', px0, py0, px0, py1);
  for (const [v, t] of [
    [1, '100%'],
    [0.5, '50%'],
    [0, '0%'],
  ] as const)
    text(c, `yaxis-${v}`, px0 - 5, Y(v) + 4, [[t, 'small', 'muted']], { anchor: 'end', owner: 'yaxis' });
  // The axis row: each ring's rank centered on its hairline (nudged apart to keep 6 px while each still spans its
  // hairline), then the rank boundaries on their ticks, evenly dropped where they crowd.
  const labels = rings.map((rg) => {
    const w = tw(rg.text, 'smallB');
    return { ...rg, w, x0: Math.min(g.x1 - w, Math.max(g.x0, rg.x - w / 2)) };
  });
  if (labels.length === 2) {
    const [a, b] = labels[0].x <= labels[1].x ? labels : [labels[1], labels[0]];
    const ok = () =>
      a.x0 >= g.x0 &&
      b.x0 + b.w <= g.x1 &&
      a.x0 + a.w + 6 <= b.x0 &&
      a.x0 + 2 <= a.x &&
      a.x <= a.x0 + a.w - 3 &&
      b.x0 + 2 <= b.x &&
      b.x <= b.x0 + b.w - 3 &&
      a.x0 + a.w + 3 <= b.x &&
      a.x + 3 <= b.x0;
    const short = a.x0 + a.w + 6 - b.x0;
    if (short > 0) {
      a.x0 -= short / 2;
      b.x0 += short / 2;
      if (b.x0 + b.w > g.x1) {
        a.x0 -= b.x0 + b.w - g.x1;
        b.x0 = g.x1 - b.w;
      }
      if (a.x0 < g.x0) {
        b.x0 += g.x0 - a.x0;
        a.x0 = g.x0;
      }
    }
    if (!ok()) {
      a.x0 = a.x - a.w + 3;
      b.x0 = b.x - 2;
    }
    if (!ok()) labels.length = 0;
  }
  for (const l of labels)
    text(c, `ring-label-${l.kind}`, l.x0, py1 + 16, [[l.text, 'smallB', l.kind === 'shield' ? 'shield-ink' : 'ink']], { owner: 'xaxis' });
  c.meta.ringLabels = labels.map((l) => ({ kind: l.kind, x0: r1(l.x0), x1: r1(l.x0 + l.w), at: r1(l.x) }));
  const ticks: Tick[] = [10, 100, 1000, 10_000, 100_000].map((rank) => {
    const x = X(cdnCumShare(rank));
    line(c, 'grid', `rank-tick-${rank}`, 'tickmark', x, py1, x, py1 + 4);
    return { x, text: cdnGroup(rank), anchor: rank === CDN_OBJECTS ? 'end' : 'middle' };
  });
  const fixed: Tick[] = [
    ...labels.map((l): Tick => ({ x: l.x0, text: l.text, anchor: 'start', bold: true })),
    ...rings.map((rg): Tick => ({ x: rg.x, text: '', anchor: 'middle' })),
  ];
  for (const t of placeTicks(ticks, 'end', fixed))
    text(c, `rank-label-${t.text}`, t.x, py1 + 16, [[t.text, 'small', 'muted']], { anchor: t.anchor, owner: 'xaxis' });
  y = py1 + 20;
  text(c, 'xtitle', g.x0, y + 10, [[pickLast(AXIS_TITLES, fitsIn('small', g.iw)), 'small', 'muted']], { owner: 'xtitle' });
  y += 18;
  const k = kneeWords(sc, hid);
  const keyRow = (t: string, kind: Who) => {
    c.D.add('top', `knee-${kind}-key`, { k: 'circle', cls: `knee knee-key ${kind}`, cx: r1(g.x0 + 4), cy: r1(y + 6), r: 4 });
    para(c, `knee-${kind}-words`, g.x0 + 14, y + 10, t, g.iw - 14, { role: 'small', cls: 'ink', owner: `knee-${kind}` });
  };
  keyRow(k.edge, 'edge');
  y += r.knee * 14 + 2;
  if (k.shield) keyRow(k.shield, 'shield');
  y += r.kneeS * 14 + 4;
  c.D.region('square', { x: g.x0 - 8, y: top - 6, w: g.iw + 16, h: y - top + 6 });
  return y + 26;
}
