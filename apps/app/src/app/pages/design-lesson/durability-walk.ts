import {
  DURABILITY_CHALLENGE_BOUNDS,
  DURABILITY_RACK_EVENT,
  DURABILITY_OBJECTS,
  durabilityScenario,
  formatNinesCount,
  formatOverhead,
  formatPerYear,
  oneIn,
  type DurabilityStep,
} from '@grasp/engine';
import { r1, sampleLine, type Edge } from './stage-draw';
import { tw, wrapStage, type Part } from './durability-text';
import { line, one, path, pickLast, rect, type Ctx } from './durability-draw';
import { factsSentence, ratioWords, stepValue, stepWords } from './durability-words';

/** The nines scale: from -0.6 (14 pieces at 10% fail 1.4 times a year) to 25. */
export const NMIN = -0.6;
export const NMAX = 25;
/**
 * The most step rows any setting draws (10 + 4 in one rack: six steps and the rack event). The walk ends under the rows
 * it draws, and the facts sit under this many at a fixed place, so the stage's height never counts a scheme's steps.
 */
export const STEP_ROWS = 7;
/** The rows the hidden steps' box takes, whatever the scheme, so the walk's length does not tell how many steps a loss needs. */
const HIDDEN_ROWS = 2;
export const ROW = 37;
/** The challenge's goal on the last row, in nines: fewer than 0.1 lost a year among a billion. */
export const GOAL_NINES = -Math.log10(DURABILITY_CHALLENGE_BOUNDS.perBillion / DURABILITY_OBJECTS);

export interface WalkMeta {
  nineTicks: Edge[];
  billionTicks: Edge[];
  /** Each changed step's old arrow beside its new one. */
  ghostSteps: { kind: string; i?: number; len: number; newLen: number; dir: number; newDir: number }[];
  /** The rows that say "(was …)". */
  wasRows: string[];
  final: { x: number; y: number; box: Edge | null } | null;
  caret: number | null;
  caretWords: Edge | null;
  goal: { gx: number; y: number } | null;
  goalWords: Edge | null;
  rowsShown: string[];
  stepsBox: boolean;
  finalBox: boolean;
  /** Step arrows and dots drawn. */
  stepMarks: number;
  /** Where the walk's last drawn row ends: the rack event's when it is drawn, else the last step's. */
  walkEnd: number | null;
  ninesShown: string;
  finalWords: string;
  finalLanded: boolean;
}

/** The x of a nines value on the walk's scale. */
export const ninesX = (c: Pick<Ctx, 'X0' | 'IW'>, n: number) => c.X0 + ((Math.max(NMIN, Math.min(NMAX, n)) - NMIN) / (NMAX - NMIN)) * c.IW;
const levelN = (lv: number) => -Math.log10(lv);

/** D: the model. The headline, the steps as a walk along one nines scale, the billion-object conversion and the facts. */
export function drawModel(c: Ctx, yRule: number): number {
  const { D, m, ps, view, hid, X0, X1, IW, LH, wide, playing, meta } = c;
  const s = m.settings;
  const yT = yRule + 28;
  D.text('model-title', X0, yT, one(wide ? 'The yearly chance of losing it, from the model' : 'Yearly loss, from the model', 'capB'));
  const yH = yT + 24;
  const ninesNow = hid.loss ? '?' : playing && !ps.rows.final ? '…' : formatNinesCount(m.nines);
  meta.ninesShown = ninesNow;
  const cols: [string, string][] = [
    ['Stored', formatOverhead(m.overhead)],
    ['Survives', `any ${m.t}`],
    ['Nines', ninesNow],
  ];
  const cw = IW / 3;
  cols.forEach(([k, v], i) => {
    D.text(`head-key-${i}`, X0 + i * cw, yH, one(k, 'label'));
    D.text(`head-val-${i}`, X0 + i * cw, yH + 21, one(v, 'head', v === '?' || v === '…' ? 'muted' : ''), { owner: 'headline' });
  });
  D.region('headline', { x: X0 - 6, y: yH - 17, w: IW + 12, h: 47 });
  const yAxT = yH + 78;
  const nx = (n: number) => ninesX(c, n);
  const plotTop = yAxT + 10;
  const rows = hid.steps ? HIDDEN_ROWS : m.steps.length + (s.rack ? 1 : 0);
  const yrF = plotTop + rows * ROW;
  const ly = yrF + 11;
  const ay = yrF + 42;
  const yBot = ay + 14;
  D.text(
    'nines-title',
    X0,
    yAxT - 14,
    one(wide ? 'Nines, each step right is 10× less likely' : 'Nines · a step is 10× less likely', 'label'),
  );
  for (const n of [0, 3, 6, 9, 12, 15, 18, 21, 24])
    line(c, 'grid', `nines-grid-${n}`, `gridline${n === 9 ? ' nine' : ''}`, nx(n), plotTop - 4, nx(n), yBot, undefined, false);
  for (const n of wide ? [0, 3, 6, 9, 12, 15, 18, 21, 24] : [0, 6, 12, 18, 24])
    meta.nineTicks.push(D.text(`nines-tick-${n}`, nx(n), yAxT, one(String(n), 'small'), { anchor: 'middle', ground: true }));
  const ghostM = view.ghost && !hid.ghost ? durabilityScenario(view.ghost) : null;
  const ghostSame = !!ghostM && ghostM.settings.scheme === s.scheme;
  const shown = (row: DurabilityStep) =>
    !playing || (row.kind === 'first' ? ps.rows.first : row.kind === 'window' ? ps.rows.steps >= row.i : ps.rows.ways);
  const valRole = wide ? 'capB' : 'small';
  if (hid.steps) {
    // One box whatever the scheme, so its height does not tell how many steps a loss needs.
    rect(c, 'marks', 'steps-hidden', 'bar-hidden', X0, plotTop, IW, HIDDEN_ROWS * ROW - 6, 4);
    D.text('steps-hidden-words', X0 + IW / 2, plotTop + ROW + 1, one('The steps show after your answer', 'small'), {
      anchor: 'middle',
      owner: 'stepsq',
    });
    meta.stepsBox = true;
  } else {
    let prev: DurabilityStep | null = null;
    // In one rack the rack event sets the loss: the independent path it overrides is dimmed.
    const dim = s.rack && m.rack >= m.indep ? ' overridden' : '';
    m.steps.forEach((row, k) => {
      const yr = plotTop + k * ROW;
      const rly = yr + 11;
      const ray = yr + 21;
      const own = `row-${row.kind}${row.kind === 'window' ? row.i : ''}`;
      if (shown(row)) {
        const wordsBox = D.text(
          `${own}-words`,
          X0,
          rly,
          one(
            pickLast(stepWords(m, row), (f) => tw(f, 'small') <= IW),
            'small',
          ),
          { owner: own },
        );
        const x = nx(levelN(row.level));
        const px = prev ? nx(levelN(prev.level)) : nx(0);
        if (row.kind === 'first') {
          line(c, 'links', `${own}-arrow`, `step-arrow first${dim}`, nx(0), ray, x, ray, own);
          c.D.add('dots', `${own}-head`, { k: 'circle', cls: `head-first${dim}`, cx: r1(x), cy: r1(ray), r: 3.5 });
          D.mark({ x0: x - 4, x1: x + 4, y0: ray - 4, y1: ray + 4 }, own);
        } else {
          const right = x >= px;
          line(c, 'links', `${own}-from`, `from-tick${dim}`, px, ray - 5, px, ray + 5, own);
          const hx = right ? x - 5 : x + 5;
          if (Math.abs(x - px) >= 7) {
            line(c, 'links', `${own}-arrow`, `step-arrow${right ? '' : ' up'}${dim}`, px, ray, hx, ray, own);
            path(
              c,
              'dots',
              `${own}-head`,
              `${right ? 'head-cur' : 'head-up'}${dim}`,
              `M${r1(x)} ${r1(ray)}L${r1(hx)} ${r1(ray - 4)}L${r1(hx)} ${r1(ray + 4)}z`,
            );
          }
          D.mark({ x0: Math.min(px, x) - 1, x1: Math.max(px, x) + 1, y0: ray - 5, y1: ray + 5 }, own);
        }
        meta.stepMarks++;
        meta.walkEnd = x;
        const g = !ghostM ? null : row.kind === 'first' ? ghostM.steps[0] : ghostSame ? ghostM.steps[k] : null;
        let was: string | null = null;
        let oldDrawn = false;
        if (g) {
          const gx = nx(levelN(g.level));
          const gpx = row.kind === 'first' ? nx(0) : nx(levelN(ghostM!.steps[k - 1].level));
          if ((Math.abs(gx - x) > 1 || Math.abs(gpx - px) > 1) && Math.abs(gx - gpx) >= 2) {
            // The old arrow keeps to its own row's lane, under the new one and clear of the next row's words.
            const gy = ray + 12;
            const dir = gx >= gpx ? 1 : -1;
            line(c, 'links', `ghost-${own}`, 'ghost-step', gpx, gy, gx - dir * 3, gy, `ghost-${own}`, false);
            path(
              c,
              'dots',
              `ghost-${own}-tip`,
              'ghost-tip',
              `M${r1(gx - dir * 3.5)} ${r1(gy - 2.5)}L${r1(gx)} ${r1(gy)}L${r1(gx - dir * 3.5)} ${r1(gy + 2.5)}`,
            );
            D.mark({ x0: Math.min(gx, gpx) - 1, x1: Math.max(gx, gpx) + 1, y0: gy - 1.5, y1: gy + 1.5 }, `ghost-${own}`);
            D.mark({ x0: gx - 4, x1: gx + 4, y0: gy - 2.5, y1: gy + 2.5 }, `ghost-${own}`);
            oldDrawn = true;
            meta.ghostSteps.push({
              kind: row.kind,
              i: row.kind === 'window' ? row.i : undefined,
              len: Math.abs(gx - gpx),
              newLen: Math.abs(x - px),
              dir: Math.sign(gx - gpx),
              newDir: Math.sign(x - px),
            });
          }
          // "(was …)" only beside the old arrow it names; a change too small to draw is said in the facts alone.
          if (oldDrawn && row.kind === 'first' && Math.abs(g.factor / row.factor - 1) > 1e-9)
            was = `${formatPerYear(row.factor)} (was ${formatPerYear(g.factor)})`;
          if (oldDrawn && row.kind === 'window' && Math.abs(g.factor / row.factor - 1) > 1e-9)
            was = `× ${oneIn(row.factor)} (was ${oneIn(g.factor)})`;
        }
        const lo = Math.min(x, px);
        const hi = Math.max(x, px);
        const cands = [
          [hi + 9, ray + 4.5],
          [lo - 9, ray + 4.5, 'end'],
          [X1, rly, 'end'],
        ] as const;
        const wasBox = was
          ? D.place(`${own}-value`, cands, one(was, valRole, 'ink'), {
              owner: `val-${own} was`,
              optional: true,
              // On the row's own line a value keeps a word space from its words, so the two never read as one phrase.
              ok: (b) => b.y0 >= wordsBox.y1 || b.x0 >= wordsBox.x1 + 6,
            })
          : null;
        if (wasBox) meta.wasRows.push(own);
        else D.place(`${own}-value`, cands, one(stepValue(row), valRole, 'ink'), { owner: `val-${own}` });
        meta.rowsShown.push(own);
      }
      prev = row;
    });
    if (s.rack && (!playing || ps.rows.rack)) rackRow(c, plotTop + m.steps.length * ROW, nx, valRole);
  }
  lastRow(c, { ly, ay, nx, ghostM });
  line(c, 'grid', 'nines-axis', 'axis', X0, yBot, X1, yBot, undefined, false);
  const conv: [number, string][] = wide
    ? [
        [3, '1 million'],
        [6, '1,000'],
        [9, '1'],
        [12, '0.001'],
        [15, '0.000001'],
      ]
    : [
        [6, '1,000'],
        [9, '1'],
        [12, '0.001'],
      ];
  for (const [n, t] of conv)
    meta.billionTicks.push(
      D.text(`billion-tick-${n}`, nx(n), yBot + 14, one(t, n === 9 ? 'smallB' : 'small'), { anchor: 'middle', ground: true }),
    );
  const billionTitle = [
    'Objects lost a year on average, among a billion',
    'Lost a year on average, of a billion',
    'Lost a year, average, of a billion',
    'Average lost a year',
  ];
  D.text(
    'billion-title',
    X0,
    yBot + 32,
    one(
      pickLast(billionTitle, (f) => tw(f, 'label') <= IW),
      'label',
    ),
  );
  D.region('steps', { x: X0 - 6, y: yAxT - 38, w: IW + 12, h: yBot + 40 - (yAxT - 38) });
  const yF = plotTop + STEP_ROWS * ROW + 116;
  wrapStage(factsSentence(m, hid, ghostM), 'cap', IW).forEach((l, i) =>
    D.text(`facts-${i}`, X0, yF + i * LH, one(l, 'cap'), { owner: 'facts' }),
  );
  return yF;
}

/** In one rack, the rack event as a row of its own: from no nines straight to its own, the term that sets the loss. */
function rackRow(c: Ctx, yr: number, nx: (n: number) => number, valRole: 'capB' | 'small') {
  const { D, m, X0, X1, IW, meta } = c;
  const own = 'row-rack';
  const ray = yr + 21;
  const x = nx(levelN(DURABILITY_RACK_EVENT));
  D.text(
    `${own}-words`,
    X0,
    yr + 11,
    one(
      pickLast(stepWords(m, { kind: 'rack' }), (f) => tw(f, 'small') <= IW),
      'small',
      'lost-ink',
    ),
    { owner: own },
  );
  line(c, 'links', `${own}-arrow`, 'step-arrow rack', nx(0), ray, x - 5, ray, own);
  path(c, 'dots', `${own}-head`, 'head-rack', `M${r1(x)} ${r1(ray)}L${r1(x - 5)} ${r1(ray - 4)}L${r1(x - 5)} ${r1(ray + 4)}z`);
  D.mark({ x0: nx(0) - 1, x1: x + 1, y0: ray - 5, y1: ray + 5 }, own);
  D.place(
    `${own}-value`,
    [
      [x + 9, ray + 4.5],
      [X1, yr + 11, 'end'],
    ],
    one(`${oneIn(DURABILITY_RACK_EVENT)} a year`, valRole, 'ink'),
    { owner: `val-${own}` },
  );
  meta.stepMarks++;
  if (m.rack >= m.indep) meta.walkEnd = x;
  meta.rowsShown.push(own);
}

/**
 * The last row: the yearly loss as a bar to a dot at the model's nines. Its value is placed first, beside the dot; then
 * the ghost's caret and its words as one unit in the lane above the bar, a bracket to the dot carrying the ratio; then
 * the goal's words beside its mark. Whatever finds no place goes into the row's words.
 */
function lastRow(c: Ctx, o: { ly: number; ay: number; nx: (n: number) => number; ghostM: ReturnType<typeof durabilityScenario> | null }) {
  const { D, m, ps, view, hid, X0, X1, IW, wide, playing, meta } = c;
  const { ly, ay, nx, ghostM } = o;
  const yb = ay - 12;
  const extras: { k: string; t: string }[] = [];
  const finalShown = !playing || ps.rows.final;
  if (view.challenge) {
    const gx = nx(GOAL_NINES);
    line(c, 'links', 'goal', `goal-line${view.met ? ' met' : ''}`, gx, ay - 9, gx, ay + 9, 'goal');
    meta.goal = { gx, y: ay };
  }
  if (hid.loss) {
    rect(c, 'marks', 'final-hidden', 'bar-hidden', X0, ay - 11, IW, 22, 3);
    D.text('final-hidden-words', X0 + IW - 8, ay + 4, one('after your answer', 'small'), { anchor: 'end', owner: 'finalq' });
    meta.finalBox = true;
  } else if (finalShown) {
    meta.finalLanded = true;
    const x = nx(m.nines);
    rect(c, 'marks', 'final-bar', `bar-final${m.settings.rack ? ' rack' : ''}`, nx(0), ay - 5, x - nx(0), 10, 2, 'row-final');
    D.mark({ x0: nx(0), x1: x, y0: ay - 5, y1: ay + 5 }, 'row-final');
    c.D.add('dots', 'final-dot', { k: 'circle', cls: 'dot-final', cx: r1(x), cy: r1(ay), r: 5 });
    D.mark({ x0: x - 5, x1: x + 5, y0: ay - 5, y1: ay + 5 }, 'row-final');
    const ghostX = ghostM && Math.abs(ghostM.nines - m.nines) > 0.04 ? nx(ghostM.nines) : null;
    let caret = ghostX !== null && Math.abs(ghostX - x) >= 16;
    const column = () => caret && D.mark({ x0: ghostX! - 15, x1: ghostX! + 15, y0: yb - 10, y1: ay + 6 }, 'ghostcol');
    const unmark = () => {
      for (let i = D.marks.length - 1; i >= 0; i--) if (D.marks[i].owner === 'ghostcol') D.marks.splice(i, 1);
    };
    column();
    const val = `${formatNinesCount(m.nines)} nines`;
    const vRole = wide ? 'capB' : 'smallB';
    const tryValue = () =>
      D.place('final-value', [[x + 9, ay + 4.5]], one(val, vRole), { owner: 'val-final', optional: true }) ??
      (x - 9 - tw(val, 'smallB') >= nx(0) + 3
        ? D.place('final-value', [[x - 9, ay + 4, 'end']], one(val, 'smallB', 'on-bar'), {
            owner: 'val-final row-final',
            ignore: 'row-final',
            cls: 'on-chip',
            optional: true,
          })
        : null) ??
      D.place('final-value', [[x, yb, 'middle']], one(val, vRole), { owner: 'val-final', optional: true });
    let vb = tryValue();
    if (!vb && caret) {
      unmark();
      caret = false;
      vb = tryValue();
    }
    if (!vb) D.missing.push(val);
    meta.final = { x, y: ay, box: vb };
    unmark();
    if (caret && ghostX !== null && ghostM) {
      const before = `before ${formatNinesCount(ghostM.nines)}`;
      const outer = ghostX > x ? ([[ghostX + 7, yb]] as const) : ([[ghostX - 7, yb, 'end']] as const);
      D.mark({ x0: ghostX - 5, x1: ghostX + 5, y0: ay - 14, y1: ay - 7 }, 'ghost');
      const cw0 = D.place('ghost-words', outer, one(before, 'small'), { owner: 'ghost', optional: true, minX: X0, maxX: X1 });
      if (!cw0) {
        for (let i = D.marks.length - 1; i >= 0; i--) if (D.marks[i].owner === 'ghost') D.marks.splice(i, 1);
        caret = false;
      } else {
        meta.caretWords = cw0;
        path(
          c,
          'top',
          'ghost-caret',
          'ghost-caret',
          `M${r1(ghostX - 4)} ${r1(ay - 13)}L${r1(ghostX)} ${r1(ay - 8)}L${r1(ghostX + 4)} ${r1(ay - 13)}`,
        );
        const ratio = ratioWords(m, ghostM);
        const bracketable = !(vb && vb.y1 < ay - 6);
        if (bracketable) {
          const a = Math.min(ghostX, x);
          const b = Math.max(ghostX, x);
          const by = ay - 10.5;
          path(c, 'links', 'ghost-bracket', 'ghost-bracket', `M${r1(a)} ${r1(by + 2.5)}V${r1(by)}H${r1(b)}V${r1(by + 2.5)}`);
          D.link(sampleLine(a + 5, by, b - 5, by), 'ghost');
        }
        const side = ghostX > x ? ([[x - 8, yb, 'end']] as const) : ([[x + 8, yb]] as const);
        const rb = bracketable
          ? D.place('ghost-ratio', side, one(ratio, 'small'), { owner: 'ghost ratio', optional: true, minX: X0, maxX: X1 })
          : null;
        if (!rb) extras.push({ k: 'ratio', t: `, ${ratio}` });
      }
    }
    if (ghostX !== null && !caret && ghostM) extras.push({ k: 'before', t: ` (before ${oneIn(ghostM.loss)})` });
    meta.caret = caret ? ghostX : null;
  }
  if (view.challenge && meta.goal) {
    const { gx } = meta.goal;
    const goalText = `goal: ${formatNinesCount(GOAL_NINES).replace(/\.0$/, '')} nines`;
    meta.goalWords = D.place(
      'goal-words',
      [
        [gx + 6, yb],
        [gx - 6, yb, 'end'],
      ],
      one(goalText, 'small', view.met ? 'ok-ink' : ''),
      { owner: 'goal', optional: true, minX: X0, maxX: X1 },
    );
    if (!meta.goalWords) extras.push({ k: 'goal', t: ` · ${goalText}` });
  }
  if (finalShown || hid.loss) {
    const base = stepWords(m, { kind: 'final' }, hid.loss);
    const sets = [extras, extras.filter((e) => e.k !== 'ratio'), extras.filter((e) => e.k === 'goal')];
    // The loss's own words go before an extra does, but the goal is said somewhere: on its mark or here.
    const bases = [base, ['Lost in a year']];
    let chosen: string | undefined;
    for (const b of bases)
      for (const set of sets) {
        chosen ??= b.map((f) => f + set.map((e) => e.t).join('')).find((f) => tw(f, 'smallB') <= IW);
      }
    chosen ??= base[base.length - 1];
    meta.finalWords = chosen;
    D.text('final-words', X0, ly, one(chosen, 'smallB') as Part[], { owner: 'row-final' });
    meta.rowsShown.push('final');
  }
}
