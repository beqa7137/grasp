import { PLAN_MINUTES, addCalendarDays, type StudyPlan, type StudyPlanInput } from '@grasp/engine';
import { formatMinutes } from '../plan/duration';

/** About how much of the loop a share is, in words a learner reads at a glance; never more precise than the estimate. */
export function shareWords(share: number): string {
  if (share < 0.2) return 'less than a fifth';
  if (share < 0.3) return 'about a quarter';
  if (share < 0.42) return 'about a third';
  if (share < 0.58) return 'about half';
  if (share < 0.7) return 'about two thirds';
  if (share < 0.85) return 'about three quarters';
  return 'most';
}

export interface CoverageLine {
  text: string;
  /** One tap to the smallest offered daily time that fits, or to the most a plan allows when none does. */
  minutes: { value: number; label: string } | null;
  /** One tap to the earliest interview date the current time fits. */
  date: string | null;
}

/**
 * What the chosen time covers when it cannot reach the whole loop (R4's `coverage`, shown honestly), with the two ways
 * out the owner chose for R9: more minutes a day, or a later date. Null when it all fits, and from the day before the
 * interview, when the plan asks for review only.
 */
export function coverageLine(
  plan: Pick<StudyPlan, 'coverage' | 'status' | 'daysLeft'>,
  input: StudyPlanInput,
  today: string,
  formatDay: (date: string) => string,
): CoverageLine | null {
  const { coverage } = plan;
  if (!coverage || coverage.share >= 1 || plan.status === 'eve' || plan.status === 'interview-day' || plan.daysLeft <= 1) return null;
  const need = coverage.minutesPerDay;
  const most = PLAN_MINUTES.at(-1)!;
  const fits = need === null ? undefined : PLAN_MINUTES.find((m) => m >= need);
  const covers = `At ${formatMinutes(input.minutesPerDay)} a day, this plan covers ${shareWords(coverage.share)} of your loop by ${formatDay(input.interviewDate)}.`;
  const needs =
    need === null
      ? 'All of it needs a later date.'
      : fits
        ? `All of it needs about ${formatMinutes(need)} a day.`
        : `All of it needs about ${formatMinutes(need)} a day, more than the ${formatMinutes(most)} a plan allows.`;
  const minutes =
    need === null || input.minutesPerDay >= most
      ? null
      : fits
        ? { value: fits, label: `Use ${formatMinutes(fits)} a day` }
        : { value: most, label: `Use ${formatMinutes(most)} a day, the most` };
  return { text: `${covers} ${needs}`, minutes, date: coverage.daysToFit === null ? null : addCalendarDays(today, coverage.daysToFit) };
}
