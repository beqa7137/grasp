import { birthdayChance, formatChance, formatPow10, pairsChain } from '@grasp/engine';
import { IDS_TEXT, chainLines, hiddenBox, label, line, r1, rect, small, text, type Ctx, type Part } from './ids-draw';

const PLOT_H = 150;
const Y_MIN = -24;
const X_FROM = 3;
const X_TO = 15;
export const PAGES = 12;
export const INSERTS = 24;

/** One seeded draw of 24 random inserts over 12 pages: an illustration, said so wherever it is read. */
export const RANDOM_PAGES: ReadonlySet<number> = (() => {
  let seed = 7;
  const rand = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  return new Set(Array.from({ length: INSERTS }, () => Math.floor(rand() * PAGES)));
})();
export const randomCaption = () =>
  `${INSERTS} inserts touch ${RANDOM_PAGES.size} of ${PAGES} pages, each read from disk once the index outgrows memory`;

const pairsReserve = (width: number) => {
  let most = 1;
  for (const bits of [64, 122])
    for (let count = X_FROM; count <= X_TO; count++) most = Math.max(most, chainLines(pairsChain({ bits, count }), 'small', width).length);
  return most;
};

export const twoColumns = (full: number) => full >= 560;

/**
 * Band E, "Random ids beside them": the chance of any repeat against ids made on log axes for 64 and 122 random bits,
 * the marker at the chosen count with the square law drawn beside it, the pairs chain that explains the number, and
 * where 24 new ids land in an index.
 */
export function randomBand(c: Ctx, y0: number): number {
  const { W, PAD } = c;
  const full = W - 2 * PAD;
  line(c, 'grid', 'e-rule', 'rule', 0, y0, W, y0);
  text(c, 'e-title', PAD, y0 + 28, label('Random ids beside them'), { owner: 'e-head' });
  const two = twoColumns(full);
  const cw = two ? Math.round(full * 0.58) : full;
  const top = y0 + 44;
  const chartEnd = chart(c, PAD, top, cw);
  const ix = two ? PAD + cw + 24 : PAD;
  const iw = two ? full - cw - 24 : full;
  const indexEnd = indexStrip(c, ix, two ? top : chartEnd + 12, iw);
  return Math.max(chartEnd, indexEnd) + 10;
}

function chart(c: Ctx, x0: number, top: number, w: number): number {
  const { D, s, hid } = c;
  text(c, 'chart-title', x0, top + 11, small('Chance of any repeat, by the birthday bound'), { owner: 'chart-title' });
  const px0 = x0 + 40;
  const pw = w - 56;
  // The curves' names in a legend row, each beside a swatch of its curve, so no name has to find room on the plot.
  let lx = x0;
  for (const bits of [64, 122]) {
    const name = bits === 64 ? '64 bits' : '122 bits, UUIDv4';
    line(c, 'marks', `legend-swatch-${bits}`, `curve swatch${bits === s.bits ? ' on' : ''}`, lx, top + 25, lx + 14, top + 25);
    const box = text(c, `curve-name-${bits}`, lx + 19, top + 29, small(name, bits === s.bits ? 'acc-ink' : 'muted'), {
      owner: 'chart-legend',
    });
    lx = box.x1 + 14;
  }
  const py0 = top + 44;
  const X = (exp: number) => px0 + ((exp - X_FROM) / (X_TO - X_FROM)) * pw;
  const Y = (lg: number) => py0 + (-lg / -Y_MIN) * PLOT_H;
  const pairsRes = pairsReserve(w);
  const plotEnd = py0 + PLOT_H + 38;
  const end = plotEnd + pairsRes * 14 + 4;
  D.region('chart', { x: x0 - 2, y: top - 2, w: w + 4, h: end - top + 4 });
  if (hid.chance) {
    hiddenBox(c, 'chance-hidden', x0, py0 - 8, w, PLOT_H + 46, [
      'The chance is hidden until you answer',
      'Hidden until you answer',
      'Hidden',
    ]);
    hiddenBox(c, 'pairs-hidden', x0, plotEnd + 2, w, pairsRes * 14, ['Its arithmetic is hidden too', 'Hidden']);
    return end;
  }
  for (const lg of [0, -6, -12, -18, -24]) {
    line(c, 'grid', `chart-grid-${lg}`, 'grid-line', px0, Y(lg), px0 + pw, Y(lg));
    D.link(
      [
        [px0, Y(lg)],
        [px0 + pw, Y(lg)],
      ],
      'grid',
    );
    text(c, `chart-y-${lg}`, px0 - 6, Y(lg) + 4, small(lg === 0 ? '1' : formatPow10(lg)), { anchor: 'end', owner: 'chart-y' });
  }
  for (let e = X_FROM; e <= X_TO; e += 3)
    text(c, `chart-x-${e}`, X(e), py0 + PLOT_H + 16, small(formatPow10(e)), { anchor: 'middle', owner: 'chart-x' });
  text(c, 'chart-x-name', px0 + pw / 2, py0 + PLOT_H + 30, small('ids made'), { anchor: 'middle', owner: 'chart-x' });
  const lgOf = (bits: number, exp: number) => Math.log10(Math.max(birthdayChance(bits, 10 ** exp), 1e-300));
  for (const bits of [64, 122]) {
    const pts: [number, number][] = [];
    for (let x = px0; x <= px0 + pw + 0.01; x += 2) {
      const lg = lgOf(bits, X_FROM + ((x - px0) / pw) * (X_TO - X_FROM));
      if (lg >= Y_MIN) pts.push([r1(x), r1(Y(Math.min(0, lg)))]);
    }
    if (!pts.length) continue;
    D.add('links', `curve-${bits}`, {
      k: 'path',
      cls: `curve${bits === s.bits ? ' on' : ''}`,
      d: `M${pts.map((p) => p.join(' ')).join('L')}`,
    });
    D.link(pts, `curve-${bits}`);
  }
  const p = birthdayChance(s.bits, 10 ** s.count);
  const lg = Math.log10(Math.max(p, 1e-300));
  const mx = X(s.count);
  const on = lg >= Y_MIN;
  const my = on ? Y(Math.min(0, lg)) : Y(Y_MIN);
  line(c, 'links', 'marker-line', 'marker-line', mx, py0 + PLOT_H, mx, my);
  D.link(
    [
      [mx, py0 + PLOT_H],
      [mx, my],
    ],
    'marker',
  );
  if (on) D.add('dots', 'chance-marker', { k: 'circle', cls: 'chance-marker slide', cx: r1(mx), cy: r1(my), r: 5 });
  else D.add('dots', 'chance-chevron', { k: 'path', cls: 'chance-chevron', d: `M${r1(mx - 5)} ${r1(my - 6)}l5 6l5 -6` });
  D.mark({ x0: mx - 6, x1: mx + 6, y0: my - 6, y1: my + 6 }, 'marker');
  // The square law: a thousand times the ids, a million times the chance, while it is small.
  const tri = (a: number, b: number) => {
    const la = lgOf(s.bits, a);
    const lb = lgOf(s.bits, b);
    if (Math.min(a, b) < X_FROM || Math.max(a, b) > X_TO || la < Y_MIN || lb > -2) return false;
    const xa = X(a);
    const xb = X(b) - (b === s.count ? 4 : 0);
    D.add('marks', 'square-law', { k: 'path', cls: 'square-law', d: `M${r1(xa)} ${r1(Y(la))}H${r1(xb)}V${r1(Y(lb))}` });
    D.link(
      [
        [xa, Y(la)],
        [xb, Y(la)],
        [xb, Y(lb)],
      ],
      'square',
    );
    D.place(
      'square-base',
      [
        [(xa + xb) / 2, Y(la) + 13, 'middle'],
        [(xa + xb) / 2, Y(la) - 5, 'middle'],
      ],
      small('× 1,000 ids', 'ink'),
      {
        owner: 'square',
        optional: true,
        margin: 6,
      },
    );
    D.place(
      'square-up',
      [
        [xb + 5, (Y(la) + Y(lb)) / 2 + 4, 'start'],
        [xb - 5, (Y(la) + Y(lb)) / 2 + 4, 'end'],
      ],
      small(`× ${formatPow10(6)}`, 'ink'),
      {
        owner: 'square',
        optional: true,
        margin: 6,
      },
    );
    return true;
  };
  if (!tri(s.count - 3, s.count)) tri(s.count, s.count + 3);
  const figure: Part[] = small(on ? formatChance(p) : `${formatChance(p)}, below the chart`, 'acc-ink');
  const fc: [number, number, 'start' | 'end' | 'middle'][] = [];
  for (const dy of [-8, 16, -20, 28, 4]) fc.push([mx + 9, my + dy, 'start'], [mx - 9, my + dy, 'end']);
  D.place('chance-figure', fc, figure, {
    owner: 'figure',
    minX: x0,
    maxX: x0 + w,
    minY: py0 - 6,
    maxY: py0 + PLOT_H + 2,
    margin: 6,
    optional: true,
  });
  chainLines(pairsChain(s), 'small', w).forEach((t, i) =>
    text(c, `pairs-${i}`, x0, plotEnd + 12 + i * 14, small(t, 'ink'), { owner: 'pairs' }),
  );
  return end;
}

function indexStrip(c: Ctx, x0: number, top: number, w: number): number {
  const { D } = c;
  text(c, 'index-title', x0, top + 11, small('Where 24 new ids land in the index'), { owner: 'index' });
  const pw = (w - (PAGES - 1) * 3) / PAGES;
  const strip = (id: string, y: number, name: string, filled: (k: number) => boolean, caption: string) => {
    text(c, `${id}-name`, x0, y + 11, [[name, 'smallB', 'ink']], { owner: 'index' });
    for (let k = 0; k < PAGES; k++)
      rect(c, 'marks', `${id}-page-${k}`, `page${filled(k) ? ' touched' : ''}`, x0 + k * (pw + 3), y + 18, pw, 16, 2);
    D.mark({ x0, x1: x0 + w, y0: y + 18, y1: y + 34 }, 'pages');
    const lines = IDS_TEXT.wrap(caption, 'small', w);
    lines.forEach((t, i) => text(c, `${id}-cap-${i}`, x0, y + 47 + i * 14, small(t), { owner: 'index' }));
    return y + 38 + Math.max(2, lines.length) * 14;
  };
  let y = strip(
    'ordered',
    top + 20,
    'Time-ordered ids: the last page',
    (k) => k === PAGES - 1,
    `all ${INSERTS} in 1 page, which stays in memory`,
  );
  y = strip('random', y + 6, 'Random ids: any page', (k) => RANDOM_PAGES.has(k), randomCaption());
  return y;
}
