import type { Difficulty } from '../algorithms/types.js';
import { problemsForPattern, type CodingProblemSummary } from '../coding/catalog.js';
import { DIFFICULTY_RANK, meetsBar } from './levels.js';

/**
 * The problems whose primary pattern this is, at or above the bar, easiest first. Only these count toward the pattern's
 * state: a problem cross-listed under it is practised as its own primary pattern. Kept apart from the profiles, so a page
 * that reads only those loads no problem catalog.
 */
export function problemsAtBar(patternId: string, bar: Difficulty): CodingProblemSummary[] {
  return problemsForPattern(patternId)
    .filter((p) => p.patternIds[0] === patternId && meetsBar(p, bar))
    .sort((a, b) => DIFFICULTY_RANK[a.difficulty] - DIFFICULTY_RANK[b.difficulty]);
}
