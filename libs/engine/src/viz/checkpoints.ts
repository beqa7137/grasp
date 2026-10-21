import type { CellPick, Frame, Locator, Prediction } from '../algorithms/types.js';

/** The most checkpoints one run asks (REDESIGN.md 3.8). */
export const CHECKPOINT_CAP = 5;

/** Asks at least this share of the run apart. */
const SPACING = 0.1;

/**
 * The frames of a run that ask, in order, at most `CHECKPOINT_CAP` of them and at least a tenth of the run apart: first
 * the first ask of each skill, then the rest by tier, highest first, each time the one farthest from those already
 * chosen. A tier-1 ask, one the drawing all but answers, is asked only when the run has nothing else. It reads only each
 * ask's skill and tier, never its choices or answer, so which frames ask can never give an answer away. Every other
 * frame keeps its `predict` for review, which draws from all of them.
 */
export function pickCheckpoints(frames: readonly Pick<Frame, 'predict'>[]): number[] {
  const asks = frames.flatMap((f, at) => (f.predict ? [{ at, skill: f.predict.skill, tier: f.predict.tier ?? 2 }] : []));
  const gap = Math.max(1, Math.ceil(frames.length * SPACING));
  const worth = asks.filter((a) => a.tier > 1);
  const pool = worth.length ? worth : asks.slice(0, 1);
  const chosen: number[] = [];
  const fits = (at: number) => chosen.every((c) => Math.abs(c - at) >= gap);

  for (const skill of new Set(pool.map((a) => a.skill))) {
    const first = pool.find((a) => a.skill === skill && fits(a.at));
    if (first && chosen.length < CHECKPOINT_CAP) chosen.push(first.at);
  }
  for (const tier of [3, 2]) {
    for (;;) {
      if (chosen.length >= CHECKPOINT_CAP) break;
      const open = pool.filter((a) => a.tier === tier && !chosen.includes(a.at) && fits(a.at));
      if (!open.length) break;
      const distance = (at: number) => Math.min(...chosen.map((c) => Math.abs(c - at)));
      chosen.push(open.reduce((best, a) => (distance(a.at) > distance(best.at) ? a : best)).at);
    }
  }
  return chosen.sort((a, b) => a - b);
}

/** Whether two locators name the same element. */
export function sameLocator(a: Locator, b: Locator): boolean {
  if ('id' in a || 'id' in b) return 'id' in a && 'id' in b && a.view === b.view && a.id === b.id;
  return a.view === b.view && String(a.at) === String(b.at);
}

/** How the learner's own pick reads where no choice names it: "index 7", "[1, 3]" or "(2,3)", as the tracers write them. */
export function pickLabel(cells: readonly Locator[]): string {
  const at = cells.map((c) => ('at' in c ? c.at : c.id));
  if (cells.every((c) => c.view === 'array')) {
    const indices = (at as number[]).slice().sort((a, b) => a - b);
    return indices.length === 1 ? `index ${indices[0]}` : `[${indices.join(', ')}]`;
  }
  return at.map((a) => (Array.isArray(a) ? `(${a.join(',')})` : String(a))).join(', ');
}

/** The choice a pick of these cells makes: the one whose cells hold it, or, picking two, are exactly the two; null for none. */
export function choiceForCells(pick: CellPick, cells: readonly Locator[]): number | null {
  const choice = pick.cells.findIndex((own) =>
    (pick.count ?? 1) === 1
      ? cells.length === 1 && own.some((c) => sameLocator(c, cells[0]))
      : own.length === cells.length && cells.every((c) => own.some((o) => sameLocator(o, c))),
  );
  return choice < 0 ? null : choice;
}

/** The choice a typed number makes, when it names one of the value ask's choices; null for any other number. */
export function choiceForValue(predict: Pick<Prediction, 'choices'>, typed: string): number | null {
  const text = typed.trim().replace(/^\+/, '').replace(/^-0+$/, '0');
  if (!isValueEntry(text)) return null;
  const value = text === '∞' ? Infinity : Number(text);
  const choice = predict.choices.findIndex((c) => (c === '∞' ? Infinity : Number(c)) === value);
  return choice < 0 ? null : choice;
}

/** Whether a typed answer to a value ask is a number at all, which Lock it in needs. */
export function isValueEntry(typed: string): boolean {
  const text = typed.trim();
  // A long run of digits parses to Infinity, which would read as ∞.
  return (/^[+-]?\d+$/.test(text) && Number.isSafeInteger(Number(text))) || text === '∞';
}
