import type { Difficulty } from '../algorithms/types.js';
import { problemsForPattern, type CodingProblemSummary } from '../coding/catalog.js';
import { DIFFICULTY_RANK, meetsBar } from './levels.js';

/**
 * The problems whose primary pattern this is, at or above the bar, easiest first. Only these count toward the pattern's
 * state: a problem cross-listed under it is practised as its own primary pattern. Kept apart from the profiles, so a page
 * that reads only those loads no problem catalog. Within one difficulty, `prefer`'s problems (the target company's
 * reported ones) come first; minutes depend only on difficulty, so the choice never changes how long the work is.
 */
export function problemsAtBar(patternId: string, bar: Difficulty, prefer?: ReadonlySet<string>): CodingProblemSummary[] {
  const preferred = (p: CodingProblemSummary) => (prefer?.has(p.id) ? 0 : 1);
  return problemsForPattern(patternId)
    .filter((p) => p.patternIds[0] === patternId && meetsBar(p, bar))
    .sort((a, b) => DIFFICULTY_RANK[a.difficulty] - DIFFICULTY_RANK[b.difficulty] || preferred(a) - preferred(b));
}
