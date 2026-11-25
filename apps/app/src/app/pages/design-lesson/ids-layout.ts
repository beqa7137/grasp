import { ID_WINDOW_US, type IdMint, type MintedId } from '@grasp/engine';
import { bitsBand } from './ids-bits';
import { Draw, hit, type Ctx, type Hit, type SlotGroup, type StageView } from './ids-draw';
import { lanesBand, padOf } from './ids-lanes';
import { ledgerBand } from './ids-ledger';
import { randomBand } from './ids-random';
import { sortedBand } from './ids-sorted';
import { summary, visible } from './ids-words';
import { focusOutlines } from './latency-draw';
import type { Focus } from './focus-layout';

export interface Stage {
  D: Draw;
  H: number;
  hits: Hit[];
  focus: (Focus & { region: string })[];
  summary: string;
  /** Ids made by the play's clock that the stage shows, in made order, and the one band A shows. */
  made: MintedId[];
  shown: MintedId | null;
}

/** A control group's panel lays out in one row from this inner width, else stacked. */
export const SLOT_WIDE = 600;
/** Below this panel width two steppers of 44 px buttons do not fit side by side, so they stack. */
export const SLOT_STACK = 250;
/** Each control group's panel height: its rows of legends and 44 px controls, fixed so the stage's height is too. */
export function slotHeight(group: SlotGroup, full: number): number {
  const wide = full >= SLOT_WIDE;
  if (group === 'layout') return wide ? 88 : full < SLOT_STACK ? 230 : 160;
  if (group === 'mint') return wide ? 214 : 262;
  return wide ? 108 : 196;
}

/** The id band A shows: the chosen one while it is shown, else the newest while playing, else G2's at 2.9 ms. */
function inspected(made: readonly MintedId[], view: StageView): MintedId | null {
  const chosen = view.inspect ? made.find((x) => x.key === view.inspect) : undefined;
  if (chosen) return chosen;
  if (view.t !== null) return made.at(-1) ?? null;
  return made.find((x) => x.lane === 2 && x.issued === 2900) ?? made.at(-1) ?? null;
}

/** The ids the stage draws at the play's clock, in made order. */
export const madeIds = (m: IdMint, view: StageView) =>
  m.byMade.filter((x) => x.issued < ID_WINDOW_US && (view.t === null || x.issued <= view.t) && visible(m, x, view.hid));

/**
 * The Unique IDs stage at width `W`: one id's 64 bits, what each field buys, the three generators' lanes, the ids in
 * id order, and random ids beside them, with each control group's panel in a slot under the band it changes. Its
 * height depends on `W` alone: every block reserves its most lines at that width, and every slot is fixed.
 */
export function buildStage(W: number, m: IdMint, view: StageView): Stage {
  const D = new Draw(W);
  const made = madeIds(m, view);
  const PAD = padOf(W);
  const c: Ctx = { D, hits: [], m, s: m.settings, view, hid: view.hid, W, PAD, made, shown: inspected(made, view) };
  const full = W - 2 * PAD;
  const slot = (group: SlotGroup, y: number) => {
    const h = slotHeight(group, full);
    hit(c, { kind: 'slot', x: PAD, y, w: full, h, owner: `slot-${group}`, group });
    return y + h + 14;
  };
  let y = bitsBand(c, 0);
  y = ledgerBand(c, y);
  y = slot('layout', y);
  y = lanesBand(c, y);
  y = slot('mint', y);
  y = sortedBand(c, y);
  y = randomBand(c, y);
  y = slot('random', y);
  const H = Math.round(y + 2);
  return { D, H, hits: c.hits, focus: focusOutlines(D, view.focus, H), summary: summary(m, view.hid), made, shown: c.shown };
}
