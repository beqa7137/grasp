import {
  LATENCY_SERVICE,
  LATENCY_SERVICE_MS,
  formatDuration,
  formatMs,
  formatPct,
  latencyCurve,
  latencyScenario,
  type LatencyScenario,
  type LatencySettings,
  type LatencySteady,
} from '@grasp/engine';
import { Draw, TEXT, dot, pick, r1, sampleLine, samplePath, tw, xGlyph, yAt, type Edge } from './latency-draw';
import { LONGEST_FACTS, factLines, fwait, ghostName, headlineForms, sameConfig, type Hid } from './latency-words';

type Pt = [number, number];

export interface ModelMeta {
  facts: string[];
  curves: { p50: Pt[]; p99: Pt[]; ghost: Pt[] };
  marginal: { y50: number; y99: number; r: number; equal: boolean; rows: { zone: 'A' | 'B' | 'C'; cy: number; n: number }[] } | null;
  chevronY: number | null;
  ghostName: boolean;
  cursor: { x: number; y50: number; y99: number } | null;
  /** The plot, and the 100 requests' column beside it (`mx0` to `mx1`). */
  plot: { px0: number; px1: number; py0: number; py1: number; mx0: number; mx1: number };
}

interface ModelCtx {
  W: number;
  pad: number;
  wide: boolean;
  m: LatencyScenario;
  hid: Hid;
  ghost: LatencySettings | null;
}

/** The lines the fact block reserves at a width: the most any of the widest pairs wraps to. */
export const factRows = (width: number) =>
  Math.max(...LONGEST_FACTS.map((pair) => pair.reduce((k, f) => k + TEXT.wrap(f, 'cap', width).length, 0)));

/**
 * The model's half of the stage: the headline, where the time goes, two facts, the chart of p50 and p99 against
 * utilization with the cursor, a ghost of the setting before a change, 100 requests at the model's quantiles, and the
 * fan-out line. Every number here is the exact model's.
 */
export function drawModel(D: Draw, c: ModelCtx, top: number): { y: number; meta: ModelMeta } {
  const { W, pad, wide, m, hid } = c;
  let y = top;
  D.add('grid', 'model-rule', { k: 'line', cls: 'rule', x1: pad, y1: y, x2: W - pad, y2: y });
  const title =
    pick(['Response time, exact from the model', 'Response time, from the model'], (t) => tw(t, 'capB') <= W - 2 * pad) ?? 'The model';
  D.text('model-title', pad, y + 24, [[title, 'capB', 'ink']], { owner: 'model' });
  y += 36;
  const headTop = y;
  // The headline's swatches are the chart's legend; with no steady state they sit at the end of its first line.
  let swatches = !hid.numbers ? m.stable : true;
  if (!m.stable && !hid.numbers) {
    xGlyph(D, 'head-x', pad + 5, y + 14, 'head', 4);
    D.text('head-no-steady', pad + 16, y + 19, [['No steady state', 'capB', 'bad']], { owner: 'head' });
    const lw = 2 * (14 + 6 + tw('p99', 'label')) + 12;
    if (pad + 16 + tw('No steady state', 'capB') + 16 + lw <= W - pad) {
      let lx = W - pad - lw;
      for (const k of ['p99', 'p50']) {
        D.add('marks', `legend-${k}`, { k: 'line', cls: `legend-line ${k}`, x1: lx, y1: y + 15, x2: lx + 14, y2: y + 15 });
        D.mark({ x0: lx, x1: lx + 14, y0: y + 13, y1: y + 17 }, 'head');
        D.text(`legend-${k}-name`, lx + 20, y + 19, [[k, 'label']], { owner: 'head' });
        lx += 14 + 6 + tw(k, 'label') + 12;
      }
      swatches = true;
    }
    const forms = headlineForms(m);
    D.text(
      'head-grows',
      pad + 16,
      y + 37,
      [[pick(forms, (t) => tw(t, 'cap') <= W - 2 * pad - 16) ?? forms[forms.length - 1], 'cap', 'muted']],
      { owner: 'head' },
    );
  } else {
    const colW = wide ? 132 : Math.floor((W - 2 * pad) / 3);
    const stats: [string, string | null, string][] = [
      ['p99', 'p99', hid.numbers || !m.stable ? '?' : formatDuration(m.p99)],
      ['p50', 'p50', hid.numbers || !m.stable ? '?' : formatDuration(m.p50)],
      ['mean', null, hid.numbers || !m.stable ? '?' : formatDuration(m.mean)],
    ];
    stats.forEach(([name, line, value], i) => {
      const sx = pad + i * colW;
      let lx = sx;
      if (line) {
        D.add('marks', `legend-${line}`, { k: 'line', cls: `legend-line ${line}`, x1: sx, y1: y + 6, x2: sx + 14, y2: y + 6 });
        D.mark({ x0: sx, x1: sx + 14, y0: y + 4, y1: y + 8 }, 'head');
        lx = sx + 20;
      }
      D.text(`stat-${name}-name`, lx, y + 10, [[name, 'label']], { owner: 'head' });
      D.text(`stat-${name}`, sx, y + 34, [[value, 'head', 'ink']], { owner: 'head', cls: 'stat' });
    });
  }
  y += 46;
  // Where the time goes on average, in a request's own order: the waiting, then the work.
  const barTop = y;
  let bx0 = pad;
  if (wide) {
    D.text('bar-label', pad, y + 12, [['On average', 'label']], { owner: 'bar' });
    bx0 = pad + 92;
  } else {
    D.text('bar-label', pad, y + 10, [['On average', 'label']], { owner: 'bar' });
    y += 14;
  }
  const bx1 = W - pad;
  const by = y + 3;
  const barLabels = (lefts: string[], right: string, leftCls: string, rightCls: string) => {
    const rw = tw(right, 'small');
    const l = pick(lefts, (t) => tw(t, 'small') + 16 + rw <= bx1 - bx0) ?? lefts[lefts.length - 1];
    D.text('bar-wait-words', bx0, by + 28, [[l, 'small', leftCls]], { owner: 'bar' });
    D.text('bar-work-words', bx1, by + 28, [[right, 'small', rightCls]], { owner: 'bar', anchor: 'end' });
  };
  const work = `${formatMs(LATENCY_SERVICE_MS)} of work`;
  if (hid.numbers) {
    D.add('marks', 'bar-hidden', { k: 'rect', cls: 'bar-hidden', x: bx0, y: by, w: bx1 - bx0, h: 12, rx: 3 });
    D.text('bar-later', bx0, by + 28, [[`work and waiting ${hid.later}`, 'small', 'muted']], { owner: 'bar' });
  } else if (!m.stable) {
    const ws = bx1 - Math.max(3, (bx1 - bx0) * 0.03);
    D.add('marks', 'bar-wait', { k: 'rect', cls: 'bar-wait', x: bx0, y: by, w: r1(ws - 1 - bx0), h: 12, rx: 2 });
    D.add('marks', 'bar-work', { k: 'rect', cls: 'bar-work', x: r1(ws), y: by, w: r1(bx1 - ws), h: 12, rx: 2 });
    barLabels(['waiting grows without bound', 'waiting: no bound'], work, 'wait-ink', 'cur-ink');
  } else {
    const ww = ((bx1 - bx0) * m.meanWait) / m.mean;
    if (ww >= 1) D.add('marks', 'bar-wait', { k: 'rect', cls: 'bar-wait', x: bx0, y: by, w: r1(ww - 1), h: 12, rx: 2 });
    const from = ww >= 1 ? ww : 0;
    D.add('marks', 'bar-work', { k: 'rect', cls: 'bar-work', x: r1(bx0 + from), y: by, w: r1(bx1 - bx0 - from), h: 12, rx: 2 });
    barLabels([`${fwait(m.meanWait)} waiting`], work, 'wait-ink', 'cur-ink');
  }
  D.mark({ x0: bx0, x1: bx1, y0: by, y1: by + 12 }, 'bar');
  y = by + 36;
  D.region('split', { x: pad - 8, y: barTop - 4, w: W - 2 * pad + 16, h: y - barTop + 2 });
  // Two facts: who waits at all, and Little's law. The second follows the first's own lines; the block reserves the most
  // lines any setting needs at this width, after both.
  const facts = factLines(m, hid);
  facts
    .flatMap((f) => TEXT.wrap(f, 'cap', W - 2 * pad))
    .forEach((t, i) => D.text(`fact-${i}`, pad, y + 14 + i * 18, [[t, 'cap', 'muted']], { owner: 'facts' }));
  y += factRows(W - 2 * pad) * 18 + 8;
  D.region('numbers', { x: pad - 8, y: headTop - 6, w: W - 2 * pad + 16, h: y - headTop + 2 });
  const chart = drawChart(D, c, y, swatches);
  return { y: chart.y, meta: { ...chart.meta, facts } };
}

/** The chart: p50 and p99 against utilization (log time), the cursor, the ghost, and the 100 requests at this load. */
function drawChart(D: Draw, c: ModelCtx, top: number, swatches: boolean): { y: number; meta: Omit<ModelMeta, 'facts'> } {
  const { W, pad, wide, m, hid } = c;
  const s = m.settings;
  let y = top;
  const MW = wide ? 88 : 66;
  const right100 = '100 requests';
  // One row when the whole title fits; otherwise "log scale" keeps the first row and the axis's name the second.
  const title = 'p50 and p99 against utilization · log scale';
  if (tw(title, 'label') + tw(right100, 'label') + 16 <= W - 2 * pad) {
    D.text('chart-title', pad, y + 12, [[title, 'label']], { owner: 'chart-title' });
    D.text('chart-right', W - pad, y + 12, [[right100, 'label']], { owner: 'chart-title', anchor: 'end' });
    y += 26;
  } else {
    D.text('chart-title', pad, y + 12, [['p50 and p99 · log scale', 'label']], { owner: 'chart-title' });
    const sub = pick(['against utilization', 'by utilization'], (t) => tw(t, 'label') + tw(right100, 'label') + 16 <= W - 2 * pad);
    if (sub) D.text('chart-sub', pad, y + 28, [[sub, 'label']], { owner: 'chart-title' });
    D.text('chart-right', W - pad, y + 28, [[right100, 'label']], { owner: 'chart-title', anchor: 'end' });
    y += 42;
  }
  const PH = wide ? 176 : 164;
  const px0 = pad + 42;
  const px1 = W - pad - MW - 14;
  const py0 = y + 4;
  const py1 = py0 + PH;
  const Xc = (rho: number) => px0 + rho * (px1 - px0);
  const Yt = (t: number) => py1 - (Math.log10(Math.max(1, Math.min(10_000, t))) / 4) * PH;
  // The corner the axes share: a y label keeps 6 px above the x labels' row, so the lowest sits up off its line.
  const xRow = py1 + 16;
  const yMost = D.textBox(0, xRow, 0, 'small').y0 - 6 - D.textBox(0, 0, 0, 'small').y1;
  for (const [t, name] of [
    [1, '1 ms'],
    [10, '10 ms'],
    [100, '100 ms'],
    [1000, '1 s'],
    [10_000, '10 s'],
  ] as const) {
    D.add('grid', `grid-${t}`, { k: 'line', cls: t === 1 ? 'axis' : 'gridline', x1: px0, y1: r1(Yt(t)), x2: px1, y2: r1(Yt(t)) });
    D.text(`grid-${t}-label`, px0 - 6, Math.min(Yt(t) + 4, yMost), [[name, 'small', 'muted']], { owner: 'yaxis', anchor: 'end' });
  }
  // Each utilization is said under its own tick: an end label anchored inside the plot would sit under the cursor at a
  // load it does not name.
  let ticksEnd = px1;
  for (const p of px1 - px0 >= 200 ? [0, 25, 50, 75, 100] : [0, 50, 100]) {
    D.add('grid', `xtick-${p}`, { k: 'line', cls: 'axis', x1: r1(Xc(p / 100)), y1: py1, x2: r1(Xc(p / 100)), y2: py1 + 4 });
    ticksEnd = D.text(`xtick-${p}-label`, Xc(p / 100), xRow, [[`${p}%`, 'small', 'muted']], {
      owner: 'xaxis',
      anchor: 'middle',
      cls: 'xtick',
    }).x1;
  }
  D.add('grid', 'plot-right', { k: 'line', cls: 'gridline', x1: px1, y1: py0, x2: px1, y2: py1 });
  const pathOf = (pts: readonly { rho: number; p50: number; p99: number }[], k: 'p50' | 'p99', limit: number | null): Pt[] => {
    const out: Pt[] = [];
    for (const p of pts) {
      if (limit !== null && p.rho > limit + 1e-9) break;
      out.push([Xc(p.rho), Yt(p[k])]);
      if (p[k] >= 10_000) break;
    }
    return out;
  };
  const drawCurve = (pts: Pt[], id: string, cls: string, owner: string) => {
    if (pts.length < 2) return;
    D.add('links', id, { k: 'path', cls: `curve ${cls}`, d: `M${pts.map(([a, b]) => `${r1(a)} ${r1(b)}`).join('L')}` });
    D.link(samplePath(pts, 2), owner);
  };
  // A ghost keeps the setting before a change. A change that keeps the utilization (the queue, the work, the server
  // count) leaves the old p99 curve, named for what differed; one that moves it (the load, a server down) would make an
  // old curve lie, so it leaves the old cursor as hollow dots with an arrow to where it went. None while a question asks.
  const gm = c.ghost && !hid.ghost ? latencyScenario(c.ghost) : null;
  const ghostKind = !gm
    ? null
    : Math.abs(gm.rho - m.rho) > 1e-9
      ? gm.stable
        ? 'point'
        : null
      : !sameConfig(gm.settings, s)
        ? 'curve'
        : null;
  // With no legend (no steady state on a narrow stage) the curves' own names come first, and the ghost only where it
  // crosses neither.
  const namesFirst = !swatches;
  let ghostPts: Pt[] = [];
  if (ghostKind === 'curve') {
    ghostPts = pathOf(latencyCurve(gm!.settings), 'p99', null);
    if (!namesFirst) drawCurve(ghostPts, 'curve-ghost', 'ghost', 'ghost');
  }
  let p50pts: Pt[] = [];
  let p99pts: Pt[] = [];
  if (!hid.curves) {
    const cur = latencyCurve(s);
    p50pts = pathOf(cur, 'p50', hid.ahead);
    p99pts = pathOf(cur, 'p99', hid.ahead);
    drawCurve(p50pts, 'curve-p50', 'p50', 'c50');
    drawCurve(p99pts, 'curve-p99', 'p99', 'c99');
  }
  if (hid.ahead !== null && !hid.curves) {
    const cx = Xc(hid.ahead);
    D.add('links', 'cut', { k: 'line', cls: 'cut', x1: r1(cx), y1: py0, x2: r1(cx), y2: py1 });
    D.link(sampleLine(cx, py0, cx, py1), 'cut');
    const cands: [number, number, 'start' | 'end'][] = [];
    for (const yy of [py0 + 14, py0 + 30, py0 + 46, (py0 + py1) / 2]) cands.push([cx + 8, yy, 'start'], [cx - 8, yy, 'end']);
    const forms = [`The rest ${hid.later}`, hid.later, '?'];
    forms.some((t, i) =>
      D.place('cut-words', cands, [[t, i === forms.length - 1 ? 'smallB' : 'small', 'muted']], {
        owner: 'cut',
        ground: true,
        minX: px0 + 2,
        maxX: px1 - 2,
        optional: i < forms.length - 1,
      }),
    );
  }
  const MX0 = px1 + 14;
  const MX1 = W - pad;
  // With no steady state the cursor leaves the plot at its top right, where the curves leave as the waits grow.
  let chevron: { x: number; y: number } | null = null;
  if (!m.stable && !hid.numbers && !hid.utilization) {
    chevron = { x: px1 + 1, y: py0 + 1 };
    D.add('marks', 'chevron', {
      k: 'path',
      cls: 'chevron',
      d: `M${px1 - 7} ${py0 + 9}L${px1 + 1} ${py0 + 1}M${px1 - 4} ${py0 + 1}L${px1 + 1} ${py0 + 1}L${px1 + 1} ${py0 + 6}`,
    });
    D.mark({ x0: px1 - 8, x1: px1 + 3, y0: py0 - 1, y1: py0 + 10 }, 'over');
  }
  // The cursor: the utilization of the servers that are up, with the model's p50 and p99 there. Where they sit within a
  // dot of each other one marker carries both (the p50 dot in a p99 ring); one label only when they print the same.
  let cursor: { x: number; y50: number; y99: number } | null = null;
  if (m.stable && hid.cursorLine) {
    const cx = Xc(m.rho);
    D.add('links', 'cursor', { k: 'line', cls: 'cursor', x1: r1(cx), y1: py0, x2: r1(cx), y2: py1 });
    D.link(sampleLine(cx, py0, cx, py1), 'cursor');
    if (hid.cursorDots) {
      const y50 = Yt(m.p50);
      const y99 = Yt(m.p99);
      const same = formatDuration(m.p50) === formatDuration(m.p99);
      cursor = { x: cx, y50, y99 };
      if (Math.abs(y99 - y50) < 9) {
        const ym = (y50 + y99) / 2;
        dot(D, 'cur-p50', cx, ym, 3.5, 'p50', 'cur-p50 cur-p99');
        D.add('dots', 'cur-ring', { k: 'circle', cls: 'ring99', cx: r1(cx), cy: r1(ym), r: 6.5 });
        D.mark({ x0: cx - 8, x1: cx + 8, y0: ym - 8, y1: ym + 8 }, 'cur-p50 cur-p99');
      } else {
        dot(D, 'cur-p99', cx, y99, 4, 'p99', 'cur-p99');
        dot(D, 'cur-p50', cx, y50, 4, 'p50', 'cur-p50');
      }
      // Leaders run from the dots to the marginal's ticks, placed before any label so labels avoid them.
      for (const [yy, cls] of same
        ? ([[y50, 'p50']] as const)
        : ([
            [y50, 'p50'],
            [y99, 'p99'],
          ] as const)) {
        D.add('links', `leader-${cls}`, { k: 'line', cls: 'leader', x1: r1(cx + 5), y1: r1(yy), x2: MX0 - 3, y2: r1(yy) });
        D.link(sampleLine(cx + 5, yy, MX0 - 3, yy), `lead-${cls}`);
      }
    }
  }
  // The point ghost: hollow dots at the old utilization and an arrow to the new cursor or the chevron, drawn before any
  // value label; left out where it would sit on the new dots.
  let ghostDots: { gx: number; g99: number; g50: number; close: boolean } | null = null;
  if (ghostKind === 'point' && gm?.stable) {
    const gx = Xc(gm.rho);
    const g99 = Yt(gm.p99);
    const g50 = Yt(gm.p50);
    const close = Math.abs(g99 - g50) < 9;
    const pts: [number, string][] = close
      ? [[(g99 + g50) / 2, 'both']]
      : [
          [g99, 'p99'],
          [g50, 'p50'],
        ];
    const onCursor = !!cursor && pts.some(([yy]) => [cursor!.y50, cursor!.y99].some((cy) => Math.hypot(gx - cursor!.x, yy - cy) < 12));
    if (!onCursor) {
      ghostDots = { gx, g99: close ? pts[0][0] : g99, g50: close ? pts[0][0] : g50, close };
      for (const [yy, k] of pts) {
        D.add('dots', `ghost-dot-${k}`, {
          k: 'circle',
          cls: `ghost-dot ${k}`,
          cx: r1(gx),
          cy: r1(yy),
          r: k === 'both' ? 4.5 : 3.5,
          owner: 'ghost',
        });
        D.mark({ x0: gx - 5.5, x1: gx + 5.5, y0: yy - 5.5, y1: yy + 5.5 }, 'ghost');
      }
      const target = cursor ? [cursor.x, cursor.y99] : chevron ? [chevron.x - 9, chevron.y + 9] : null;
      if (target) {
        const [tx, tyy] = target;
        const fy = ghostDots.g99;
        const len = Math.hypot(tx - gx, tyy - fy);
        if (len > 20) {
          const ux = (tx - gx) / len;
          const uy = (tyy - fy) / len;
          const [ax0, ay0, ax1, ay1] = [gx + ux * 7, fy + uy * 7, tx - ux * 8, tyy - uy * 8];
          const hx = ax1 - ux * 5;
          const hy = ay1 - uy * 5;
          D.add('links', 'ghost-arrow', {
            k: 'line',
            cls: 'ghost-arrow',
            x1: r1(ax0),
            y1: r1(ay0),
            x2: r1(ax1),
            y2: r1(ay1),
            owner: 'ghost',
          });
          D.add('links', 'ghost-head', {
            k: 'path',
            cls: 'ghost-head',
            d: `M${r1(hx - uy * 3.5)} ${r1(hy + ux * 3.5)}L${r1(ax1)} ${r1(ay1)}L${r1(hx + uy * 3.5)} ${r1(hy - ux * 3.5)}`,
            owner: 'ghost',
          });
          D.link(sampleLine(ax0, ay0, ax1, ay1, 2), 'ghost');
        }
      }
    }
  }
  if (cursor && m.stable) {
    const { x: cx, y50, y99 } = cursor;
    const close = Math.abs(y99 - y50) < 9;
    const same = formatDuration(m.p50) === formatDuration(m.p99);
    const values = (yy: number, ups: readonly number[]) => {
      const out: [number, number, 'start' | 'end'][] = [];
      for (const dx of [10, 22, 40, 60, 84]) for (const dy of ups) out.push([cx - dx, yy + dy, 'end'], [cx + dx, yy + dy, 'start']);
      return out;
    };
    const o = { ground: true, minX: pad, maxX: MX0 - 4, minY: py0, maxY: py1 - 2, margin: 1 };
    const around = [-7, 15, -17, 25, -29, 37];
    if (same) {
      const forms = [`p50 and p99 ${formatDuration(m.p50)}`, `both ${formatDuration(m.p50)}`];
      forms.some((t, i) =>
        D.place('cur-value', values(y50, around), [[t, 'smallB', 'ink']], {
          ...o,
          owner: 'cur-p50 cur-p99',
          optional: i < forms.length - 1,
        }),
      );
    } else {
      D.place('cur-p99-value', values(y99, close ? [-9, -19, -31] : around), [[formatDuration(m.p99), 'smallB', 'crit-ink']], {
        ...o,
        owner: 'cur-p99',
      });
      D.place('cur-p50-value', values(y50, close ? [17, 27, 39] : around), [[formatDuration(m.p50), 'smallB', 'cur-ink']], {
        ...o,
        owner: 'cur-p50',
      });
    }
  }
  // Line names along their curves from the left, p99 over its line and p50 under it, where each covers nothing.
  const along = (pts: Pt[], dy: number, from = 0, to = 0.7) => {
    const out: [number, number, 'start'][] = [];
    const step = Math.max(1, Math.floor(pts.length / 24));
    for (let i = Math.ceil((pts.length * from) / step) * step; i < pts.length * to; i += step)
      out.push([pts[i][0] + 3, pts[i][1] + dy, 'start']);
    return out;
  };
  // Further along the curve and further off it, where a ghost hugs the curve's start: tried last, so they move no name
  // that found a place before.
  const further = (pts: Pt[], dys: readonly number[]) =>
    dys.flatMap((dy) => [...along(pts, dy, 0.7, 0.95), ...along(pts, dy - 12 * Math.sign(dy), 0, 0.95)]);
  const lineO = { ground: true, minY: py0, maxY: py1 - 1, minX: px0 + 2, maxX: px1 - 2, optional: swatches };
  const names: (Edge | null)[] = [];
  if (p99pts.length)
    names.push(
      D.place(
        'name-p99',
        [...along(p99pts, -7), ...along(p99pts, -13), ...along(p99pts, -19), ...further(p99pts, [-7, -13, -19])],
        [['p99', 'smallB', 'crit-ink']],
        { ...lineO, owner: 'c99' },
      ),
    );
  if (p50pts.length)
    names.push(
      D.place(
        'name-p50',
        [...along(p50pts, 15), ...along(p50pts, 21), ...along(p50pts, 27), ...further(p50pts, [15, 21, 27])],
        [['p50', 'smallB', 'cur-ink']],
        { ...lineO, owner: 'c50' },
      ),
    );
  if (namesFirst && ghostPts.length) {
    const crosses = samplePath(ghostPts, 2).some(([gx, gy]) =>
      names.some((n) => !!n && gx > n.x0 - 1 && gx < n.x1 + 1 && gy > n.y0 - 1 && gy < n.y1 + 1),
    );
    if (crosses) ghostPts = [];
    else drawCurve(ghostPts, 'curve-ghost', 'ghost', 'ghost');
  }
  // The curve ghost's name: only where the ghost is 10 px or more from both current curves, the nearest curve to the
  // name is the ghost, and it keeps 24 px from another name; dropped rather than ambiguous.
  let named = false;
  if (ghostKind === 'curve' && ghostPts.length) {
    const others = [p50pts, p99pts].filter((p) => p.length);
    const near = (box: Edge) => {
      const cy = (box.y0 + box.y1) / 2;
      for (let x = box.x0; x <= box.x1; x += 2)
        for (const p of others) {
          const yy = yAt(p, x);
          if (yy !== null && yy > box.y0 - 10 && yy < box.y1 + 10) return false;
        }
      const xm = (box.x0 + box.x1) / 2;
      const gy = yAt(ghostPts, xm);
      if (gy === null) return false;
      for (const p of others) {
        const yy = yAt(p, xm);
        if (yy !== null && Math.abs(yy - cy) <= Math.abs(gy - cy)) return false;
      }
      return names.every((n) => !n || Math.hypot((n.x0 + n.x1) / 2 - xm, (n.y0 + n.y1) / 2 - cy) >= 24);
    };
    const cands: [number, number, 'end' | 'middle'][] = [];
    for (const dy of [-8, 16, -18, 26])
      for (let k = 23; k >= 6; k--) {
        const p = ghostPts[Math.floor((k / 24) * (ghostPts.length - 1))];
        cands.push([p[0], p[1] + dy, 'end'], [p[0], p[1] + dy, 'middle']);
      }
    named = [ghostName(gm!.settings, s), 'p99 before'].some(
      (t) =>
        !!D.place('ghost-name', cands, [[t, 'small', 'muted']], {
          owner: 'ghost',
          ground: true,
          minY: py0,
          maxY: py1 - 1,
          minX: px0 + 2,
          maxX: px1 - 2,
          optional: true,
          ok: near,
        }),
    );
  }
  // The point ghost's words: the old p99, and the old p50 where there is room.
  if (ghostDots && gm?.stable) {
    const { gx } = ghostDots;
    const cands = (yy: number) => {
      const out: [number, number, 'start' | 'end'][] = [];
      for (const dx of [8, 18, 30]) for (const dy of [-8, 15, -18, 25]) out.push([gx - dx, yy + dy, 'end'], [gx + dx, yy + dy, 'start']);
      return out;
    };
    const o = { owner: 'ghost', ground: true, minX: pad, maxX: MX0 - 4, minY: py0, maxY: py1 - 2, margin: 1, optional: true };
    const words =
      ghostDots.close && formatDuration(gm.p50) === formatDuration(gm.p99)
        ? [`before: ${formatDuration(gm.p99)}`]
        : [`before: ${formatDuration(gm.p99)}`, formatDuration(gm.p99)];
    words.some((t) => D.place('ghost-p99', cands(ghostDots!.g99), [[t, 'small', 'muted']], o));
    if (!ghostDots.close) D.place('ghost-p50', cands(ghostDots.g50), [[formatDuration(gm.p50), 'small', 'muted']], o);
  }
  D.add('grid', 'marginal-axis', { k: 'line', cls: 'axis', x1: MX0, y1: py1, x2: MX1, y2: py1 });
  // The column's words stay off its rule: placement sees the rule as a mark.
  D.mark({ x0: MX0, x1: MX1, y0: py1 - 0.5, y1: py1 + 0.5 }, 'marg-axis');
  const marginal = m.stable && !hid.numbers ? drawMarginal(D, m, { MX0, MX1, py0, py1, wide, Yt, cursor, ticksEnd }) : null;
  if (!m.stable && !hid.numbers) {
    // Past 100% there are no 100 requests to draw: the marginal says why, under the chevron.
    const over = hid.utilization ? [] : TEXT.wrap(`${formatPct(m.rho * 100)} of capacity`, 'smallB', MX1 - MX0);
    over.forEach((t, i) => D.text(`over-${i}`, MX0, py0 + 12 + i * 14, [[t, 'smallB', 'bad']], { owner: 'over' }));
    TEXT.wrap('no steady state', 'small', MX1 - MX0).forEach((t, i) =>
      D.text(`no-steady-${i}`, MX0, py0 + 12 + (over.length + i) * 14, [[t, 'small', 'bad']], { owner: 'over' }),
    );
  } else if (hid.numbers)
    TEXT.wrap(hid.later, 'small', MX1 - MX0).forEach((t, i) =>
      D.text(`marginal-later-${i}`, MX0, (py0 + py1) / 2 + i * 14, [[t, 'small', 'muted']], { owner: 'marg' }),
    );
  // The chart's region takes in the fan-out line under it at wide stages.
  D.region('chart', { x: pad - 8, y: top - 4, w: W - 2 * pad + 16, h: py1 + (wide ? 40 : 24) - top + 4 });
  D.region('marginal', { x: MX0 - 6, y: top - 4, w: MX1 - MX0 + 12, h: py1 + 24 - top + 4 });
  y = py1 + 26;
  // Fan-out, at wide stages: one model line on what the p99 tick means for a page that calls many of these; with no
  // steady state there is no p99 to read, and the row stays.
  if (wide) {
    if (!hid.numbers && m.stable) {
      const share = formatPct((1 - 0.99 ** 50) * 100);
      const t = pick(
        [
          `Fan-out: a page that calls 50 of these meets at least one slower than p99 on ${share} of loads.`,
          `A page calling 50 of these meets one past p99 on ${share} of loads.`,
        ],
        (f) => tw(f, 'small') <= W - 2 * pad,
      );
      if (t) D.text('fanout', pad, y + 10, [[t, 'small', 'muted']], { owner: 'fanout' });
      else D.missing.push('fan-out');
    }
    y += 24;
  }
  return {
    y,
    meta: {
      curves: { p50: p50pts, p99: p99pts, ghost: ghostPts },
      marginal,
      chevronY: chevron ? py0 : null,
      ghostName: named,
      cursor,
      plot: { px0, px1, py0, py1, mx0: MX0, mx1: MX1 },
    },
  };
}

/**
 * The 100 requests at the model's quantiles. Rows are anchored at the ticks: the 50 under p50 sit wholly under its tick,
 * the 49 between sit between the ticks, and the 100th sits wholly over the p99 tick; each tick keeps a 1 px gap of stage
 * color to the dots beside it. The dot size is the largest whose fullest row fits the column.
 */
function drawMarginal(
  D: Draw,
  m: LatencySteady,
  g: {
    MX0: number;
    MX1: number;
    py0: number;
    py1: number;
    wide: boolean;
    Yt: (t: number) => number;
    cursor: { x: number; y99: number } | null;
    /** Where the x axis's last label ends, under the plot's corner. */
    ticksEnd: number;
  },
): NonNullable<ModelMeta['marginal']> {
  const { MX0, MX1, py0, py1, Yt } = g;
  const y50 = Yt(m.p50);
  const y99t = Yt(m.p99);
  const equal = Math.abs(m.p99 - m.p50) < 1e-6;
  const steady = m.settings.service === LATENCY_SERVICE.steady;
  const atom = (i: number) => steady && Math.abs(m.dots[i] - LATENCY_SERVICE_MS) < 1e-6;
  const T = 1.75;
  type Row = { zone: 'A' | 'B' | 'C'; cy: number; list: number[] };
  const layout = (r: number) => {
    const p = 2 * r + 1;
    const y99 = equal ? y50 : Math.min(y99t, y50 - (2 * T + p));
    const rows = new Map<string, Row>();
    const put = (zone: Row['zone'], k: number, cy: number, i: number) => {
      const key = `${zone}${k}`;
      if (!rows.has(key)) rows.set(key, { zone, cy, list: [] });
      rows.get(key)!.list.push(i);
    };
    const kA = Math.max(0, Math.floor((py1 - 0.5 - 2 * r - (y50 + T)) / p));
    const kC = Math.max(0, Math.floor((y99 - T - 2 * r - (py0 + 0.5)) / p));
    const HB = y50 - y99 - 2 * T;
    const nB = Math.max(1, Math.floor(HB / p));
    const hB = HB / nB;
    m.dots.forEach((t, i) => {
      const yy = Yt(t);
      if (i < 50) {
        const k = Math.min(kA, Math.max(0, Math.floor((yy - y50 - T) / p)));
        put('A', k, y50 + T + r + k * p, i);
      } else if (i < 99 && !equal) {
        const k = Math.min(nB - 1, Math.max(0, Math.floor((y50 - T - yy) / hB)));
        put('B', k, y50 - T - hB * (k + 0.5), i);
      } else {
        const k = Math.min(kC, Math.max(0, Math.floor((y99 - T - yy) / p)));
        put('C', k, y99 - T - r - k * p, i);
      }
    });
    const capN = Math.floor((MX1 - MX0 + 1) / p);
    const worst = Math.max(0, ...[...rows.values()].filter((l) => !l.list.some(atom)).map((l) => l.list.length));
    return { r, p, y99, rows, capN, fits: worst <= capN };
  };
  const options = (g.wide ? [2.5, 2, 1.75, 1.5] : [2, 1.75, 1.5, 1.25]).map(layout);
  const L = options.find((o) => o.fits) ?? options[options.length - 1];
  const { r, p, rows, capN, y99 } = L;
  D.add('grid', 'tick-p50', { k: 'line', cls: 'mtick p50', x1: MX0 - 3, y1: r1(y50), x2: MX1, y2: r1(y50) });
  D.add('grid', 'tick-p99', { k: 'line', cls: `mtick p99${equal ? ' over50' : ''}`, x1: MX0 - 3, y1: r1(y99), x2: MX1, y2: r1(y99) });
  // Where the marginal opened a row between close ticks, the p99 leader steps to its tick at the column's edge.
  if (g.cursor && !equal && Math.abs(y99 - g.cursor.y99) > 0.5)
    D.add('links', 'leader-step', { k: 'line', cls: 'leader', x1: MX0 - 3, y1: r1(g.cursor.y99), x2: MX0 - 3, y2: r1(y99) });
  const atoms = m.dots.filter((_, i) => atom(i)).length;
  let atomRowCy: number | null = null;
  const overflow: [number, number][] = [];
  const out: NonNullable<ModelMeta['marginal']> = { y50, y99, r, equal, rows: [] };
  for (const row of rows.values()) {
    // In a row holding steady work's no-wait requests the others are drawn first: any left out are no-wait ones, which
    // the count in words covers.
    const list = [...row.list.filter((i) => !atom(i)), ...row.list.filter(atom)];
    const shown = Math.min(list.length, capN);
    list
      .slice(0, shown)
      .forEach((i, k) => dot(D, `q${i}`, MX0 + r + k * p, row.cy, r, `req zone-${row.zone}${atom(i) ? ' nowait' : ''}`, 'marg'));
    out.rows.push({ zone: row.zone, cy: row.cy, n: list.length });
    if (list.some(atom)) atomRowCy = Math.max(atomRowCy ?? -Infinity, row.cy);
    else if (list.length > shown) overflow.push([row.cy, list.length - shown]);
  }
  // Steady work's requests that never wait all take exactly 10 ms: their count, always in words, under their row.
  if (atoms && atomRowCy !== null) {
    const forms = [`${atoms} at exactly ${formatMs(LATENCY_SERVICE_MS)}`, `${atoms} at ${formatMs(LATENCY_SERVICE_MS)}`];
    forms.some((t, i) =>
      D.place(
        'nowait-count',
        [
          [MX1, atomRowCy! + r + 13, 'end'],
          [MX1, atomRowCy! + r + 24, 'end'],
        ],
        [[t, 'smallB', 'cur-ink']],
        { owner: 'marg-more', ground: true, minX: MX0 - 10, maxY: py1 - 1, optional: i < forms.length - 1 },
      ),
    );
  }
  for (const [cy, hidden] of overflow)
    D.place(
      `more-${Math.round(cy)}`,
      [
        [MX0, cy + 13],
        [MX0, cy + 24],
        [MX0, cy - 8],
        [MX1, cy + 13, 'end'],
        [MX1, cy - 8, 'end'],
      ],
      [[`+${hidden}`, 'smallB', 'ink']],
      { owner: 'marg-more', ground: true, maxY: py1 - 1 },
    );
  // The requests under 1 ms sit at the axis's floor, the column's rule: their count is the column's own row under that
  // rule, which nothing else of the chart takes, so it fits at every setting and never reads as a mark of the plot.
  const under = m.dots.filter((t) => t < 1).length;
  if (under) {
    const room = MX1 - Math.max(MX0, g.ticksEnd + 6);
    const forms = [`${under} under 1 ms`, `${under} < 1 ms`];
    const t = pick(forms, (f) => tw(f, 'small') <= room) ?? forms[forms.length - 1];
    D.text('under-1ms', MX1, py1 + 16, [[t, 'small', 'muted']], { owner: 'marg-note', anchor: 'end' });
  }
  return out;
}
