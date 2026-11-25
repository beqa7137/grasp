import { formatMeanMs, formatPathMs } from '@grasp/engine';
import { r1 } from './stage-draw';
import { LH, pickLast, tw, wrap } from './cdn-text';
import { colsFor, edgeArt, edgeArtMax, fitsIn, line, para, rect, text, userGap, type Box, type Ctx } from './cdn-draw';
import { later, tierWords, type TierRow, type Who } from './cdn-words';

/** The path strip's scale, in ms, and its rows. */
export const PATH_MS_MAX = 200;
const PATH_ROWS = [
  ['edge', 'edge hit'],
  ['shield', 'shield hit'],
  ['origin', 'origin fetch'],
] as const;

/**
 * Where the requests go, by the model: the users, every location as its own cell (stacked in columns where they are
 * many), the fan-in of every location's misses, the shield and the origin, then each path's latency on one ms scale
 * and the mean as their mix. Widths in the art are shares of all requests on one fixed band, so they always add up.
 */
export function tiers(c: Ctx, y: number): number {
  const { g, r, sc, hid } = c;
  const s = sc.settings;
  const top = y;
  text(
    c,
    'tiers-label',
    g.x0,
    y + 11,
    [[pickLast(['Where the requests go · the model', 'Where requests go · model', 'The model'], fitsIn('label', g.iw)), 'label', 'muted']],
    {
      owner: 'tiers',
    },
  );
  y += 26;
  const artX0 = g.x0;
  const artX1 = g.x0 + g.artW;
  const cx = (artX0 + artX1) / 2;
  const cols = colsFor(g, s.pops);
  const k = s.pops / cols;
  const slot = g.artW / cols;
  const band = Math.min(g.artW * 0.72, 150, (slot - 3) * cols);
  const bw = band / cols;
  const t = tierWords(sc, hid, c.view.ghost, g.narrow);
  const label = (row: TierRow, owner: string, ink: string, yy: number) => {
    let b = yy + 12;
    if (row.fig) {
      const head = wrap(`${row.fig} ${row.head}`, 'capB', g.labelW - Math.max(0, tw(row.fig, 'num') - tw(row.fig, 'capB')));
      head.forEach((l, i) => {
        if (i === 0 && l.startsWith(row.fig!))
          text(
            c,
            `fig-${owner}`,
            g.labelX,
            b,
            [
              [row.fig!, 'num', hid.tierNumbers && owner !== 'users' ? 'muted' : ink],
              [l.slice(row.fig!.length), 'capB', 'ink'],
            ],
            { owner },
          );
        else text(c, `fig-${owner}-${i}`, g.labelX, b, [[l, 'capB', 'ink']], { owner });
        b += LH.capB;
      });
    }
    return para(c, `body-${owner}`, g.labelX, b, row.body, g.labelW, { owner });
  };

  // Users, as far above the locations as the nearest location is from them.
  label(t.users, 'users', 'ink', y);
  const ey = y + Math.max(r.users * 17 + 10, 54);
  const uy = ey - 4 - userGap(s.pops);
  const nUsers = Math.max(2, Math.floor(g.artW / 9));
  const ux = (i: number) => artX0 + 4 + ((g.artW - 8) * i) / (nUsers - 1);
  const colX = (j: number) => artX0 + slot * (j + 0.5);
  for (let i = 0; i < nUsers; i++) {
    const j = Math.min(cols - 1, Math.max(0, Math.floor((ux(i) - artX0) / slot)));
    line(c, 'links', `anycast-${i}`, 'anycast', ux(i), uy + 3, colX(j), ey - 1);
    circle(c, i, ux(i), uy);
  }
  c.meta.userGap = r1(ey - 1 - (uy + 3));

  // Edge locations: one cell each, the green part of every cell its hits.
  const artH = edgeArt(k);
  const rowH = artH / k;
  const h = sc.edgeShare;
  for (let j = 0; j < cols; j++) {
    const x = colX(j) - bw / 2;
    rect(c, 'marks', `pop-${j}`, 'pop', x - 2, ey, bw + 4, artH, 2);
    if (!hid.tierFlows) {
      rect(c, 'marks', `fill-edge-${j}`, 'fill-edge', x, ey + 2, bw * h, artH - 4);
      rect(c, 'marks', `fill-travel-${j}`, 'fill-travel', x + bw * h, ey + 2, bw * (1 - h), artH - 4);
    }
  }
  for (let i = 1; i < k; i++) line(c, 'marks', `cell-sep-${i}`, 'cell-sep', artX0, ey + i * rowH, artX1, ey + i * rowH);
  const cellBox: Box = { x: colX(0) - bw / 2 - 2, y: ey, w: bw + 4, h: rowH };
  rect(c, 'marks', 'watched', 'pop watched', cellBox.x, cellBox.y, cellBox.w, cellBox.h, 2);
  c.D.mark({ x0: artX0, x1: artX1, y0: uy - 3, y1: ey + artH }, 'art');
  c.meta.cells = cols * k;
  c.meta.cols = cols;
  c.meta.cell = { w: r1(bw + 4), h: r1(rowH) };
  c.meta.band = band;
  label(t.edge, 'edge', 'edge-ink', ey - 2);
  y = ey + Math.max(edgeArtMax(g), r.edge * 17 + 2) + 8;

  // The fan-in to the shield row, then the origin.
  const shieldRowH = Math.max(44 + 6 + r.shield * 17, 64);
  const sy = y + 34;
  const shH = 20;
  const oy = y + shieldRowH + 26;
  const originH = 24;
  const missW = band * (1 - h);
  const originW = band * sc.originShare;
  const shieldW = band * sc.shieldShare;
  const bx0 = cx - missW / 2;
  const ya = ey + artH;
  let shieldBox: Box | null = null;
  let originBox: Box | null = null;
  if (!hid.tierFlows) {
    for (let j = 0; j < cols; j++) {
      const sx0 = colX(j) - bw / 2 + bw * h;
      const sx1 = colX(j) + bw / 2;
      const tx0 = bx0 + j * (bw * (1 - h));
      const tx1 = tx0 + bw * (1 - h);
      const yb = s.shield ? sy : sy + shH / 2;
      const m = (ya + yb) / 2;
      c.D.add('links', `stream-${j}`, {
        k: 'path',
        cls: 'fill-travel stream',
        d: `M${r1(sx0)},${r1(ya)} C${r1(sx0)},${r1(m)} ${r1(tx0)},${r1(m)} ${r1(tx0)},${r1(yb)} L${r1(tx1)},${r1(yb)} C${r1(tx1)},${r1(m)} ${r1(sx1)},${r1(m)} ${r1(sx1)},${r1(ya)} Z`,
      });
      if (j === 0)
        c.meta.route = {
          stream: { a: [(sx0 + sx1) / 2, ya], c1: [(sx0 + sx1) / 2, m], c2: [(tx0 + tx1) / 2, m], b: [(tx0 + tx1) / 2, yb] },
          shieldY: sy + shH / 2,
          originX: (s.shield ? bx0 + shieldW : bx0) + originW / 2,
          originY: oy + originH / 2,
          shield: !!s.shield,
        };
    }
    if (s.shield) {
      shieldBox = { x: bx0 - 2, y: sy, w: Math.max(missW + 4, 8), h: shH };
      rect(c, 'marks', 'shield-box', 'tier', shieldBox.x, sy, shieldBox.w, shH, 3);
      rect(c, 'marks', 'fill-shield', 'fill-shield', bx0, sy + 2, shieldW, shH - 4);
      rect(c, 'marks', 'shield-travel', 'fill-travel', bx0 + shieldW, sy + 2, originW, shH - 4);
      rect(c, 'links', 'trunk', 'fill-travel', bx0 + shieldW, sy + shH, originW, oy - sy - shH);
    } else rect(c, 'links', 'trunk', 'fill-travel', bx0, sy + shH / 2, missW, oy - sy - shH / 2);
    const ox0 = s.shield ? bx0 + shieldW : bx0;
    originBox = { x: ox0 - 2, y: oy, w: Math.max(originW + 4, 8), h: originH };
    rect(c, 'marks', 'origin-box', 'tier', originBox.x, oy, originBox.w, originH, 3);
    rect(c, 'marks', 'fill-origin', 'fill-origin', ox0, oy + 2, originW, originH - 4);
  } else {
    c.meta.route = null;
    rect(c, 'marks', 'flows-hidden', 'hidden-box', artX0 + 2, ya + 6, g.artW - 4, oy + originH - (ya + 6), 4);
    text(
      c,
      'flows-hidden-words',
      cx,
      (ya + sy) / 2 + 4,
      [[pickLast([`shows ${later(hid)}`, later(hid), 'after answering'], fitsIn('small', g.artW - 16)), 'small', 'muted']],
      { anchor: 'middle', owner: 'flows' },
    );
    if (s.shield) rect(c, 'marks', 'shield-box', 'tier', cx - 14, sy, 28, shH, 3);
    rect(c, 'marks', 'origin-box', 'tier', cx - 20, oy, 40, originH, 3);
  }
  c.hits.push({ kind: 'shield', x: g.labelX, y: y + 2, w: Math.min(g.labelW, 168), h: 44 });
  c.D.mark({ x0: g.labelX, x1: g.labelX + Math.min(g.labelW, 168), y0: y + 2, y1: y + 46 }, 'shield-switch');
  label(t.shield, 'shield', 'shield-ink', y + 2 + 44 + 4);
  label(t.origin, 'origin', 'origin-ink', oy - 2);
  y = oy + Math.max(originH, r.origin * 17 + 2) + 14;

  // Each path's latency on one ms scale, the mean a tick between them.
  const nameW = Math.max(...PATH_ROWS.map(([, n]) => tw(n, 'small'))) + 8;
  const valW = tw('194.7 ms', 'small') + 8;
  const bx = g.x0 + nameW;
  const bx1 = g.x1 - valW;
  const S = (v: number) => bx + ((bx1 - bx) * v) / PATH_MS_MAX;
  // A path that cannot happen says why in its row, and the mean tick leaves that row's words alone.
  const none = !s.shield ? 'no shield' : s.pops === 1 ? 'never hits' : null;
  const rows = {} as Record<Who, Box>;
  PATH_ROWS.forEach(([key, name], i) => {
    const ry = y + i * 16;
    rows[key] = { x: g.x0 - 4, y: ry, w: g.iw + 8, h: 14 };
    const on = key !== 'shield' || !none;
    text(c, `path-name-${key}`, g.x0, ry + 10, [[name, 'small', on ? 'ink' : 'muted']], { owner: 'paths' });
    if (on) {
      rect(c, 'marks', `path-${key}`, `path-bar ${key}`, bx, ry + 4, S(sc.paths[key]) - bx, 7, 1);
      text(c, `path-ms-${key}`, g.x1, ry + 10, [[formatPathMs(sc.paths[key]), 'small', 'ink']], { anchor: 'end', owner: 'paths' });
    } else text(c, `path-none`, bx, ry + 10, [[none!, 'small', 'muted']], { owner: 'paths' });
  });
  if (originBox) c.meta.lit = { cell: cellBox, shield: shieldBox, origin: originBox, rows };
  const my = y + 3 * 16 + 11;
  if (!hid.mean) {
    const mx = S(sc.meanMs);
    if (none) {
      line(c, 'marks', 'mean-tick', 'mean-tick', mx, y + 1, mx, y + 16 - 1);
      line(c, 'marks', 'mean-tick-2', 'mean-tick', mx, y + 2 * 16 + 1, mx, y + 3 * 16 - 1);
    } else line(c, 'marks', 'mean-tick', 'mean-tick', mx, y + 1, mx, y + 3 * 16 - 1);
    const mt = `mean ${formatMeanMs(sc.meanMs)}`;
    const w = tw(mt, 'smallB');
    text(c, 'mean-label', Math.min(bx1 - w, Math.max(bx, mx - w / 2)), my, [[mt, 'smallB', 'ink']], { owner: 'paths' });
  } else text(c, 'mean-label', bx, my, [[`mean: ${later(hid)}`, 'small', 'muted']], { owner: 'paths' });
  y += 3 * 16 + 18;
  para(c, 'mean', g.x0, y + 12, t.mean, g.iw, { owner: 'mean', cls: 'ink' });
  y += r.mean * 17 + 6;
  c.D.region('tiers', { x: g.x0 - 8, y: top - 6, w: g.iw + 16, h: y - top + 6 });
  return y + 34;
}

function circle(c: Ctx, i: number, x: number, y: number) {
  c.D.add('dots', `user-${i}`, { k: 'circle', cls: 'user', cx: r1(x), cy: r1(y), r: 2.5 });
}
