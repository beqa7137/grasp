import { cdnEvents, cdnSample, type CdnScenario } from '@grasp/engine';
import { TAG, type Focus } from './focus-layout';
import { r1, type Prim } from './stage-draw';
import { CdnDraw, LH, wrap } from './cdn-text';
import { geometry, line, para, reserve, type Ctx, type Hit, type StageMeta, type StageView } from './cdn-draw';
import { square } from './cdn-square';
import { tiers } from './cdn-tiers';
import { TICK_GAP, timeline } from './cdn-timeline';
import { subOf, summary, titleOf } from './cdn-words';

export interface Stage {
  D: CdnDraw;
  H: number;
  hits: Hit[];
  focus: (Focus & { region: string })[];
  summary: string;
  meta: StageMeta;
}

/**
 * The CDNs & Edge stage at width `W`: the title over three blocks, where the requests go (the model), the outlined
 * location over five TTLs (one sample) and every request by popularity (the model). Its height depends on `W` alone:
 * every text block reserves the lines its longest form needs over all 192 settings and every hidden form.
 */
export function buildStage(W: number, sc: CdnScenario, view: StageView): Stage {
  const D = new CdnDraw(W);
  const g = geometry(W);
  const r = reserve(W);
  const sample = cdnSample(sc);
  const meta: StageMeta = {
    cells: 0,
    cols: 0,
    cell: { w: 0, h: 0 },
    userGap: 0,
    band: 0,
    route: null,
    lit: null,
    dense: sample.lanes.map((l) => ({
      lane: l.dense || l.reqs.length > g.iw / TICK_GAP,
      shield: !!l.shield && (l.shield.dense || l.shield.arrivals.filter((a) => !a.own).length > g.iw / TICK_GAP),
    })),
    timeline: { x0: g.x0, iw: g.iw, window: sample.window, heads: [], axisY: 0, step: { x: 0, y: 0, w: 0 } },
    sample,
    events: [],
    rings: [],
    ringLabels: [],
    narrow: g.narrow,
  };
  meta.events = cdnEvents(sample).map((e) => ({ ...e, dense: meta.dense[e.lane].lane }));
  const c: Ctx = { D, hits: [], sc, view, hid: view.hid, meta, g, r };
  let y = 14;
  para(c, 'title', g.x0, y + 15, titleOf(sc.settings), g.iw, { role: 'title', cls: 'ink', owner: 'title' });
  y += r.title * 20 + 2;
  para(c, 'sub', g.x0, y + 13, subOf(sc.settings), g.iw, { owner: 'sub' });
  y += r.sub * 17 + 14;
  line(c, 'grid', 'rule-0', 'rule', g.x0, y - 7, g.x1, y - 7);
  y = tiers(c, y);
  line(c, 'grid', 'rule-1', 'rule', g.x0, y - 9, g.x1, y - 9);
  y = timeline(c, y);
  line(c, 'grid', 'rule-2', 'rule', g.x0, y - 9, g.x1, y - 9);
  y = square(c, y);
  const H = Math.round(y - 2);
  return { D, H, hits: c.hits, focus: focusOutlines(D, view.focus), summary: summary(sc, view.hid), meta };
}

/**
 * The step line under the timeline's label, drawn apart from the stage since it changes as a play's clock runs: its
 * lines in the reserved rows, ink while a play runs, muted at rest.
 */
export function stepPrims(meta: StageMeta, W: number, step: string, ink: boolean): Prim[] {
  const D = new CdnDraw(W);
  const { x, y, w } = meta.timeline.step;
  wrap(step, 'cap', w).forEach((l, i) => D.text(`step-${i}`, x, y + i * LH.cap, [[l, 'cap', ink ? 'ink' : 'muted']], { owner: 'step' }));
  return D.prims();
}

/**
 * A reveal's regions: a solid outline around the whole block (stroke only) and the house "Look here" tag on its foot at
 * the right, in the space every block keeps there.
 */
export function focusOutlines(D: CdnDraw, ids: readonly string[]): (Focus & { region: string })[] {
  const out: (Focus & { region: string })[] = [];
  for (const id of ids)
    for (const b of D.regions[id] ?? []) {
      const h = b.h + 12;
      const tag = { x: r1(b.x + b.w - TAG.width - 14), y: r1(b.y + h - TAG.height / 2) };
      D.mark({ x0: tag.x, x1: tag.x + TAG.width, y0: tag.y, y1: tag.y + TAG.height }, 'look');
      out.push({ id, region: id, x: r1(b.x), y: r1(b.y), width: r1(b.w), height: r1(h), tag });
    }
  return out;
}
