import type { CodingRecord } from '../srs/progress.js';
import { problemsForPattern, type CodingProblemSummary } from './catalog.js';

/** A pattern's members as its hub lists them (REDESIGN.md 4.3): problems it is the primary pattern of first, catalog order within. */
export function patternProblems(patternId: string): CodingProblemSummary[] {
  const members = problemsForPattern(patternId);
  return [...members.filter((p) => p.patternIds[0] === patternId), ...members.filter((p) => p.patternIds[0] !== patternId)];
}

/** The first unsolved member of a pattern in its hub's order, after `current` when it is one, else from the top. */
export function nextUnsolved(
  patternId: string,
  coding: Readonly<Record<string, CodingRecord>>,
  current?: string,
): CodingProblemSummary | null {
  const members = patternProblems(patternId);
  const at = members.findIndex((p) => p.id === current);
  const ordered = [...members.slice(at + 1), ...members.slice(0, Math.max(0, at))];
  return ordered.find((p) => !coding[p.id]?.solvedAt) ?? null;
}
