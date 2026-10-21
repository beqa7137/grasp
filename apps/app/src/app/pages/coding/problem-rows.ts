import {
  DIFFICULTIES,
  PATTERN_CATALOG,
  problemState,
  type CodingProblemSummary,
  type CodingRecord,
  type Difficulty,
  type ProblemState,
} from '@grasp/engine';
import { type EntryStatus } from '../../ui/entry-row.component';
import { doneStateIcon, notStartedStateIcon, timeIcon } from '../../ui/icons';

/** A problem's library state as a row shows it, with the name its facet uses. */
export const PROBLEM_STATUS: Record<ProblemState, EntryStatus & { name: string }> = {
  unsolved: { name: 'Unsolved', label: 'Unsolved', icon: notStartedStateIcon },
  attempted: { name: 'Attempted', label: 'Attempted', icon: timeIcon },
  solved: { name: 'Solved', label: 'Solved', icon: doneStateIcon, tone: 'success' },
};
export const DIFFICULTY_NAMES: Record<Difficulty, string> = { easy: 'Easy', medium: 'Medium', hard: 'Hard' };
export const PATTERN_NAMES = new Map<string, string>(PATTERN_CATALOG.map((p) => [p.id, p.name]));

/** The parts of a problem's `g-entry-row` that the problem library and a pattern hub's Problems share. */
export const problemRow = {
  status: (record: CodingRecord | undefined): EntryStatus => PROBLEM_STATUS[problemState(record)],
  level: (p: CodingProblemSummary): number => DIFFICULTIES.indexOf(p.difficulty) + 1,
  levelLabel: (p: CodingProblemSummary): string => DIFFICULTY_NAMES[p.difficulty],
  best: (record: CodingRecord | undefined): string[] => (record && !record.solvedAt ? [`best ${record.bestPassed}/${record.total}`] : []),
  /** In a pattern's list, the problem's other patterns: the list already names this one. */
  alsoIn(p: CodingProblemSummary, pattern: string): string[] {
    const others = p.patternIds.filter((id) => id !== pattern).map((id) => PATTERN_NAMES.get(id) ?? id);
    return others.length ? [`also in ${others.join(', ')}`] : [];
  },
};
