import {
  RELIABILITY_CHALLENGE_BOUNDS,
  formatAvailability,
  formatDown,
  formatHours,
  hoursAYear,
  reliabilityScenario,
  type ReliabilityScenario,
} from '@grasp/engine';
import { Draw, TEXT, pick, r1, sampleLine, tw, type Edge, type Part } from './latency-draw';
import type { StageView } from './reliability-layout';
import { LINE, wrapStage } from './reliability-text';
import { HIDDEN_FACT, HIDDEN_WEAKEST, causesWords, ghostWords, leastSet, tiedWords, weakestWords } from './reliability-words';

const NMAX = 9.3;
/** The split under the facts and the names of its shares under it. */
const SPLIT_H = 30;
const SPLIT_WORDS: Record<string, string> = { 'split-shared': 'shared', 'split-failover': 'failover', 'split-chance': 'by chance' };
/** The lines under the request's row that take its notes when the row has no room beside a bar: two on a phone. */
const noteH = (wide: boolean) => (wide ? 16 : 29);

/** The model: the headline, the nines scale with a bar per part and the request's, the cap, the goal, the ghost and the facts. */
export function drawModel(
  D: Draw,
  m: ReliabilityScenario,
  view: StageView,
  o: { top: number; P: number; wide: boolean; gut: number; meta: Record<string, unknown>; R: { facts: number } },
): number {
  const { P, wide, gut, meta, R } = o;
  const noteLines = wide ? 1 : 2;
  const W = D.W;
  const hid = view.hid;
  let y = o.top;
  const modelTop = y;
  const mTitle =
    pick(['Availability, exact from the model', 'Availability, from the model'], (t) => tw(t, 'capB') <= W - 2 * P) ??
    'Availability, from the model';
  D.text('m-title', P, y + 16, [[mTitle, 'capB']], { owner: 'm-title' });
  y += 26;
  const cols: [string, string][] = [
    ['Available', hid.request ? '?' : formatAvailability(m.u)],
    ['Down a year', hid.request ? '?' : formatDown(m.downH)],
    ['Down in 30 days', hid.request ? '?' : formatDown(m.monthH)],
  ];
  if (wide) {
    const colW = (W - 2 * P) / 3;
    cols.forEach(([lab, val], i) => {
      D.text(`stat-${i}-name`, P + i * colW, y + 11, [[lab, 'label']], { owner: 'headline' });
      D.text(`stat-${i}`, P + i * colW, y + 33, [[val, 'head', hid.request ? 'muted' : '']], { owner: 'headline' });
    });
    y += 46;
  } else {
    cols.forEach(([lab, val], i) => {
      D.text(`stat-${i}-name`, P, y + 16 + i * 24, [[lab, 'label']], { owner: 'headline' });
      D.text(`stat-${i}`, W - P, y + 17 + i * 24, [[val, 'head', hid.request ? 'muted' : '']], { anchor: 'end', owner: 'headline' });
    });
    y += 3 * 24 + 6;
  }
  // The nines scale; its value column is headed "down a year", so longer bars and smaller values read as one.
  const rulerTop = y;
  const valW = Math.max(...['92 min', '0.03 s', '20.6 h', 'optional'].map((t) => tw(t, 'smallB'))) + 8;
  const rx0 = P + gut;
  const rx1 = W - P - valW;
  const ppn = (rx1 - rx0) / NMAX;
  const xn = (n: number) => rx0 + Math.min(NMAX, n) * ppn;
  const head = pick(['down a year', 'a year'], (t) => tw(t, 'label') <= valW + (wide ? 48 : 16)) ?? 'a year';
  const rLabel =
    pick(
      ['The nines scale · each step right is 10× less downtime', 'Nines · each step is 10× less downtime', 'Nines · a step is 10× less'],
      (t) => tw(t, 'label') + tw(head, 'label') + 14 <= W - 2 * P,
    ) ?? 'Nines';
  D.text('r-label', P, y + 11, [[rLabel, 'label']], { owner: 'r-label' });
  D.text('val-head', W - P, y + 11, [[head, 'label']], { anchor: 'end', owner: 'r-label' });
  y += 20;
  // On phones the paper's outline is named once, under the label: the bars have no room for "on paper" beside them.
  if (!wide) {
    if (m.parts.some((p) => !p.optional && !hid.parts.has(p.id) && p.paperNines - p.nines > 0.05)) {
      const ky = y + 8;
      const px = P + 17 + tw('the model', 'small') + 8;
      D.add('marks', 'pkey-solid', { k: 'rect', cls: 'key-solid', x: P, y: ky - 8, w: 12, h: 8, rx: 0 });
      D.add('marks', 'pkey-paper', { k: 'rect', cls: 'bar paper', x: r1(px), y: ky - 8, w: 12, h: 8, rx: 0 });
      D.mark({ x0: P, x1: P + 12, y0: ky - 8, y1: ky }, 'pkey-solid');
      D.mark({ x0: px, x1: px + 12, y0: ky - 8, y1: ky }, 'pkey-paper');
      D.text('pkey-model', P + 17, ky, [['the model', 'small']], { owner: 'pkey-solid' });
      D.text('pkey-words', px + 17, ky, [['on paper', 'small']], { owner: 'pkey-paper' });
    }
    y += 16;
  }
  const topForms = (k: number) => (k <= 4 ? formatAvailability(10 ** -k) : `${k} nines`);
  const fitsAll = (ks: readonly number[], f: (k: number) => string) =>
    ks.every((k, i) => i === 0 || xn(k) - xn(ks[i - 1]) >= (tw(f(k), 'small') + tw(f(ks[i - 1]), 'small')) / 2 + 7);
  const every = [1, 2, 3, 4, 5, 6, 7, 8, 9];
  // A row that cannot print every nine prints every other one, else its ends: each label in full, never a bare number.
  const ticksFor = (f: (k: number) => string) => [every, [1, 3, 5, 7, 9], [3, 9]].find((ks) => fitsAll(ks, f)) ?? [3, 9];
  const topKs = ticksFor(topForms);
  const topF = topForms;
  for (const k of topKs) D.text(`top-${k}`, xn(k), y + 9, [[topF(k), 'small']], { anchor: 'middle', owner: 'r-top', ground: true });
  y += 14;
  const rowH = 24;
  const barH = 12;
  const rowsY = y;
  for (const k of every)
    D.add('grid', `grid-${k}`, {
      k: 'line',
      cls: 'gridline',
      x1: r1(xn(k)),
      y1: r1(rowsY - 2),
      x2: r1(xn(k)),
      y2: r1(rowsY + 5 * rowH + noteH(wide) + 2),
    });
  D.add('grid', 'scale-axis', {
    k: 'line',
    cls: 'axis',
    x1: r1(rx0),
    y1: r1(rowsY - 2),
    x2: r1(rx0),
    y2: r1(rowsY + 5 * rowH + noteH(wide) + 2),
  });
  const bar = (id: string, cls: string, n0: number, n1: number, by: number) => {
    if (n1 - n0 <= 1e-9) return;
    D.add('marks', id, { k: 'rect', cls, x: r1(xn(n0)), y: r1(by), w: r1(Math.max(0.75, xn(n1) - xn(n0))), h: barH, rx: 0 });
  };
  // A hidden bar is a dashed box of the row's height, so its words sit 3 px or more inside the dashes.
  const hiddenBar = (id: string, ry: number) =>
    D.add('marks', `bar-hidden-${id}`, {
      k: 'rect',
      cls: 'hidden-box',
      x: r1(rx0 + 0.5),
      y: r1(ry + 3),
      w: r1(rx1 - rx0 - 1),
      h: rowH - 6,
      rx: 3,
    });
  const ends: Record<string, number> = {};
  m.parts.forEach((p, i) => {
    const ry = rowsY + i * rowH;
    const by = ry + (rowH - barH) / 2;
    const vy = ry + rowH / 2 + 4;
    D.text(`rgut-${p.id}`, P, vy, [[p.short, 'nameS', p.optional ? 'muted' : '']], { owner: `rgut-${p.id}` });
    if (hid.parts.has(p.id)) {
      hiddenBar(p.id, ry);
      D.text(`val-${p.id}`, W - P, vy, [['?', 'smallB', 'muted']], { anchor: 'end', owner: `val-${p.id}` });
      return;
    }
    for (let c = 0; c < p.copies; c++) {
      const [a, b] = [3 * c, 3 * (c + 1)];
      if (p.optional) bar(`bar-${p.id}-${c}`, 'bar optional', a, b, by);
      else {
        bar(`bar-${p.id}-${c}`, 'bar', a, Math.min(b, p.nines), by);
        bar(`paper-${p.id}-${c}`, 'bar paper', Math.max(a, p.nines), b, by);
      }
      if (c > 0) {
        D.add('marks', `notch-${p.id}-${c}`, { k: 'rect', cls: 'notch', x: r1(xn(a) - 0.75), y: r1(by - 0.5), w: 1.5, h: barH + 1, rx: 0 });
        D.mark({ x0: xn(a) - 1.5, x1: xn(a) + 1.5, y0: by, y1: by + barH }, `notch-${p.id}`);
      }
    }
    D.mark({ x0: rx0, x1: xn(p.paperNines), y0: by, y1: by + barH }, `bar-${p.id}`);
    ends[p.id] = xn(p.nines);
    const weak = !p.optional && m.weakest.includes(p.id) && !hid.weakest;
    const val = p.optional ? (pick(['optional', 'opt.'], (t) => tw(t, 'small') <= valW - 2) ?? 'opt.') : formatDown(p.downH);
    D.text(`val-${p.id}`, W - P, vy, [[val, p.optional ? 'small' : weak ? 'smallB' : 'small', weak ? 'bad' : p.optional ? '' : 'ink']], {
      anchor: 'end',
      owner: `val-${p.id}`,
    });
    // What the paper promised: beside the outlined length, else inside it after the solid end or a notch, else "paper".
    if (!p.optional && p.paperNines - p.nines > 0.05) {
      const ty = vy;
      let placed = null;
      for (const t of [`on paper ${formatDown(p.paperDownH)}`, `paper ${formatDown(p.paperDownH)}`]) {
        placed ??= D.place(`paper-${p.id}`, [[xn(p.paperNines) + 5, ty]], [[t, 'small']], {
          optional: true,
          owner: `paper-${p.id}`,
          maxX: rx1 - 2,
          ground: true,
        });
        for (const st of [p.nines, ...[3, 6].filter((k) => k > p.nines && k < p.paperNines)])
          placed ??= D.place(`paper-${p.id}`, [[xn(st) + 4, ty - 0.5]], [[t, 'small', 'ink']], {
            optional: true,
            owner: `paper-${p.id} bar-${p.id}`,
            maxX: xn(p.paperNines) - 3,
            ignore: `bar-${p.id}`,
            cls: 'on-chip',
            margin: 1,
            ground: true,
          });
      }
      meta[`paper-${p.id}`] = !!placed;
    }
  });
  const qy = rowsY + 4 * rowH;
  const qby = qy + (rowH - barH) / 2;
  const qv = qy + rowH / 2 + 4;
  D.text('rgut-request', P, qv, [[pick(['Request', 'Req.'], (t) => tw(t, 'smallB') <= gut - 4) ?? 'Req.', 'smallB']], {
    owner: 'rgut-request',
  });
  if (hid.request) {
    hiddenBar('request', qy);
    D.text('bar-request-words', (rx0 + rx1) / 2, qv, [['after your answer', 'small']], {
      anchor: 'middle',
      owner: 'bar-request',
      ground: true,
    });
    D.text('val-request', W - P, qv, [['?', 'smallB', 'muted']], { anchor: 'end', owner: 'val-request' });
  } else {
    bar('bar-request', 'bar request', 0, m.nines, qby);
    D.mark({ x0: rx0, x1: xn(m.nines), y0: qby, y1: qby + barH }, 'bar-request');
    const reqEnd = xn(m.nines);
    ends['request'] = reqEnd;
    D.text('val-request', W - P, qv, [[formatDown(m.downH), 'smallB', 'ink']], { anchor: 'end', owner: 'val-request' });
    // The weakest link caps the chain: a line from the worst part's end down through the request's row, and an end cap
    // on every part that prints the same value.
    const capP = m.parts.find((p) => p.id === m.capPart)!;
    const wi = m.parts.indexOf(capP);
    const wx = xn(capP.nines);
    const wy = rowsY + wi * rowH + (rowH - barH) / 2;
    if (!hid.weakest) {
      D.add('top', 'capline', { k: 'line', cls: 'capline', x1: r1(wx), y1: r1(wy - 2), x2: r1(wx), y2: r1(qby + barH + 2) });
      D.link(sampleLine(wx, wy - 2, wx, qby + barH + 2), 'capline');
      for (const id of m.weakest) {
        const k = m.parts.findIndex((p) => p.id === id);
        const cy = rowsY + k * rowH + (rowH - barH) / 2;
        D.add('top', `capend-${id}`, {
          k: 'rect',
          cls: 'capend',
          x: r1(xn(m.parts[k].nines) - 1.5),
          y: r1(cy - 2),
          w: 3,
          h: barH + 4,
          rx: 0,
        });
      }
    }
    // The request's notes, in its row beside a bar's end or on the lines reserved under it, 4 px or more from any bar.
    const bars = D.marks.filter((b) => b.owner.startsWith('bar-'));
    const clearOfBars = (t: Edge) => bars.every((b) => Math.max(b.x0 - t.x1, t.x0 - b.x1, b.y0 - t.y1, t.y0 - b.y1) >= 4);
    const overlaps = (a: Edge, b: Edge) => a.x0 < b.x1 && b.x0 < a.x1 && a.y0 < b.y1 && b.y0 < a.y1;
    // The ghost's caret needs its column clear of text, so the other notes keep off it where they can, or take the
    // last reserved line, below the ghost's.
    const ghost = view.ghost && !hid.ghost ? reliabilityScenario(view.ghost) : null;
    const ghostX = ghost && Math.abs(xn(ghost.nines) - reqEnd) >= 10 ? xn(ghost.nines) : null;
    const offGhost = (t: Edge) => ghostX === null || t.x1 <= ghostX - 6 || t.x0 >= ghostX + 6 || (noteLines > 1 && t.y0 > qy + rowH + 11);
    const note = (id: string, x: number, gap: number, parts: Part[], owner: string) => {
      const at = [
        [x + gap, qv],
        [x - gap, qv, 'end'],
        ...Array.from({ length: noteLines }, (_, l) => {
          const ly = qy + rowH + 11 + l * 13;
          return [
            [x + gap - 2, ly],
            [x - gap + 2, ly, 'end'],
          ] as const;
        }).flat(),
      ] as const;
      const opts = { optional: true, owner, ignore: owner, maxX: rx1 - 2, minX: rx0 + 2, ground: true };
      return (
        D.place(id, at, parts, { ...opts, ok: (t) => clearOfBars(t) && offGhost(t) }) ??
        D.place(id, at, parts, { ...opts, ok: clearOfBars })
      );
    };
    if (!hid.weakest)
      note(
        'cap-words',
        wx,
        6,
        [[pick(['capped by the weakest link', 'capped here'], (t) => wx + 6 + tw(t, 'small') <= rx1 - 2) ?? 'capped here', 'small', 'bad']],
        'capline',
      );
    // The challenge's goal: a mark at 3 nines on the request's row, never in the cap's critical tone.
    if (view.challenge) {
      const gx = xn(3);
      const met = view.challenge.met;
      D.add('top', 'goal-line', {
        k: 'line',
        cls: `goal-line${met ? ' met' : ''}`,
        x1: r1(gx),
        y1: r1(qy + 1),
        x2: r1(gx),
        y2: r1(qy + rowH - 1),
      });
      D.link(sampleLine(gx, qy + 1, gx, qy + rowH - 1), 'goal');
      let gp = null;
      for (const t of [`goal: under ${formatHours(RELIABILITY_CHALLENGE_BOUNDS.down)}`, 'goal'])
        gp ??= note('goal-words', gx, 5, [[t, 'small', met ? 'ok-ink' : 'ink']], 'goal');
      if (!gp) D.missing.push('goal');
    }
    // The setting before a change: an open caret and its words as one unit, never over a bar. In the row the caret
    // stands above the bar and its words beside it; on a line reserved under the row it points up from 2 px above its
    // words, centered on them or just past their end, never over a glyph. The column it points along, to the request's bar, holds no text, so it never reads as pointing at a
    // label. The facts' last line says it either way.
    if (ghost && ghostX !== null) {
      const g = ghost;
      const gx = ghostX;
      const word = view.challenge ? 'start' : 'before';
      const units = [
        {
          down: true,
          y1: qby - 1,
          words: [
            [gx + 6, qv],
            [gx - 6, qv, 'end'],
          ] as const,
        },
        ...Array.from({ length: noteLines }, (_, l) => {
          const ly = qy + rowH + 11 + l * 13;
          return {
            down: false,
            y1: ly - 0.74 * TEXT.size('small') - 2,
            words: [
              [gx, ly, 'middle'],
              [gx + 5, ly],
              [gx - 5, ly, 'end'],
            ] as const,
          };
        }),
      ];
      const unit = () => {
        for (const t of [`${word} ${formatDown(g.downH)}`, word])
          for (const u of units) {
            if (u.down && [3, 6].some((k) => Math.abs(gx - xn(k)) < 10)) continue;
            const box = { x0: gx - 4, x1: gx + 4, y0: u.y1 - 6, y1: u.y1 };
            if (!D.free(box, 'ghost', 0.5)) continue;
            const aim = u.down
              ? { ...box, y0: box.y1, y1: Math.max(qby + barH, box.y1 + 4) }
              : { ...box, y0: Math.min(qby + barH, box.y0 - 4), y1: box.y0 };
            for (const at of u.words) {
              const words = D.place('ghost-words', [at], [[t, 'small']], {
                optional: true,
                owner: 'ghost',
                ignore: 'ghost',
                maxX: rx1 - 2,
                minX: rx0 + 2,
                ground: true,
                ok: (b) => {
                  const hull = {
                    x0: Math.min(b.x0, box.x0),
                    x1: Math.max(b.x1, box.x1),
                    y0: Math.min(b.y0, box.y0),
                    y1: Math.max(b.y1, box.y1),
                  };
                  return clearOfBars(b) && !overlaps(b, box) && D.texts.every((x) => !overlaps(x, hull) && !overlaps(x, aim));
                },
              });
              if (!words) continue;
              const [tip, base] = u.down ? [box.y1 - 0.5, box.y0 + 0.5] : [box.y0 + 0.5, box.y1 - 0.5];
              D.add('top', 'ghost-caret', {
                k: 'path',
                cls: 'ghost-caret',
                d: `M${r1(gx - 3.5)} ${r1(base)}L${r1(gx)} ${r1(tip)}L${r1(gx + 3.5)} ${r1(base)}`,
              });
              D.mark(box, 'ghost');
              meta['ghost'] = { caret: box, words, up: !u.down, bar: qby + barH };
              return;
            }
          }
      };
      unit();
    }
  }
  meta['ends'] = ends;
  meta['xn'] = xn;
  y = rowsY + 5 * rowH + noteH(wide) + 2;
  D.add('grid', 'scale-base', { k: 'line', cls: 'axis', x1: r1(rx0), y1: r1(y), x2: r1(rx1), y2: r1(y) });
  const botF = (k: number) => formatDown(hoursAYear(10 ** -k));
  const botKs = ticksFor(botF);
  for (const k of botKs) D.text(`bottom-${k}`, xn(k), y + 14, [[botF(k), 'small']], { anchor: 'middle', owner: 'r-bottom', ground: true });
  const botName = pick(['down a year', 'a year'], (t) => tw(t, 'small') <= xn(botKs[0]) - tw(botF(botKs[0]), 'small') / 2 - P - 6);
  if (botName) D.text('bottom-name', P, y + 14, [[botName, 'small']], { owner: 'r-bottom-name' });
  y += 28;
  D.region('ruler', { x: P - 6, y: rulerTop - 2, w: W - 2 * P + 12, h: y - rulerTop });
  // The facts: the weakest link, then (once no question waits) the rule or what a set is down from, drawn as a split on
  // a linear scale, then the setting before the change; reserved lines collect at the stage's foot.
  y += 10;
  const factsTop = y;
  const facts: [string, string][] = [];
  if (hid.request) facts.push([HIDDEN_FACT, 'facts']);
  else {
    facts.push([hid.weakest ? HIDDEN_WEAKEST : weakestWords(m, true), 'facts']);
    if (!hid.weakest && tiedWords(m)) facts.push([tiedWords(m), 'tied']);
    if (!hid.rule) facts.push([causesWords(m), 'rule']);
  }
  let fy = y + 12;
  for (const [t, id] of facts) {
    const lines = wrapStage(t, 'cap', W - 2 * P);
    lines.forEach((l, i) => D.text(i ? `${id}-${i}` : id, P, fy + i * LINE, [[l, 'cap']], { owner: 'facts' }));
    fy += lines.length * LINE;
  }
  meta['facts'] = facts.map((f) => f[0]);
  const set = !hid.request && !hid.rule ? leastSet(m) : null;
  if (set && (m.settings.shared || m.settings.failover)) {
    const parts = (
      [
        ['split-shared', set.causes.shared, 8],
        ['split-failover', set.causes.failover, 4],
        ['split-chance', set.causes.overlap, 8],
      ] as const
    ).filter((x) => x[1] > 0);
    const sw = W - 2 * P;
    let sx = P;
    const sy = fy - 10;
    D.add('grid', 'split-track', { k: 'line', cls: 'split-track', x1: P, y1: r1(sy + 8.5), x2: r1(P + sw), y2: r1(sy + 8.5) });
    const widths: number[] = [];
    parts.forEach(([cls, u, h], k) => {
      const w = Math.max(3, (u / set.u) * sw - (k < parts.length - 1 ? 1 : 0));
      D.add('marks', cls, { k: 'rect', cls, x: r1(sx), y: r1(sy + 8 - h), w: r1(w), h, rx: 0 });
      widths.push(w);
      sx += w + 1;
    });
    D.mark({ x0: P, x1: P + sw, y0: sy, y1: sy + 8 }, 'split');
    // Each share named under the strip, its swatch the segment's own mark.
    let kx = P;
    for (const [cls, , h] of parts) {
      const word = SPLIT_WORDS[cls];
      D.add('marks', `${cls}-key`, { k: 'rect', cls, x: r1(kx), y: r1(sy + 21 - h), w: 10, h, rx: 0 });
      D.mark({ x0: kx, x1: kx + 10, y0: sy + 13, y1: sy + 21 }, `${cls}-key`);
      D.text(`${cls}-word`, kx + 14, sy + 21, [[word, 'small']], { owner: `${cls}-key` });
      kx += 14 + tw(word, 'small') + 12;
    }
    meta['split'] = { widths, total: sw, shares: parts.map((x) => x[1] / set.u) };
    fy += SPLIT_H;
  }
  if (!hid.request && view.ghost && !hid.ghost) {
    const lines = wrapStage(ghostWords(reliabilityScenario(view.ghost), !!view.challenge), 'cap', W - 2 * P);
    lines.forEach((l, i) => D.text(i ? `ghost-fact-${i}` : 'ghost-fact', P, fy + i * LINE, [[l, 'cap']], { owner: 'facts' }));
  }
  y = factsTop + R.facts * LINE + SPLIT_H + 10;
  D.region('model', { x: P - 6, y: modelTop, w: W - 2 * P + 12, h: y - modelTop - 4 });
  return y;
}
