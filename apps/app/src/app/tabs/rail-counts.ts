import { PROBLEM_PATTERNS, calendarDaysBetween, daysLeftLabel, type ProgressState } from '@grasp/engine';

/**
 * "14/164" beside the rail's Problems. The problem catalog left first paint in R9; its ids are `PROBLEM_PATTERNS`' keys (the
 * engine's spec pins them), which progress already loads.
 */
export function problemsSolved(coding: ProgressState['coding']): string {
  const ids = Object.keys(PROBLEM_PATTERNS);
  return `${ids.filter((id) => coding[id]?.solvedAt).length}/${ids.length}`;
}

/** The countdown beside the rail's Study plan, worded as Today's target line words it; none once the date has passed. */
export function daysLeft(interviewDate: string, today: string): string | null {
  const days = calendarDaysBetween(today, interviewDate);
  return days < 0 ? null : daysLeftLabel(days);
}
