import { calendarDaysBetween, daysLeftLabel, type ProgressState, type Seniority } from '@grasp/engine';

/**
 * `SENIORITY_LEVELS`' labels: first paint takes no new engine names (REDESIGN.md 4.1), so they are spelled here. Lazy
 * code reads the engine's, since importing this module from it would split it into a first-paint chunk of its own.
 */
export const LEVEL_NAMES: Record<Seniority, string> = { early: 'Early career', mid: 'Mid-level', senior: 'Senior' };
export const LEVELS = Object.keys(LEVEL_NAMES) as Seniority[];

// The plan's `formatMinutes`, spelled again here: sharing that module with the lazy plan code would split it into a
// first-paint chunk of its own.
const minutes = (m: number) => (m < 60 ? `${m} min` : `${Math.floor(m / 60)} h${m % 60 ? ` ${m % 60} min` : ''}`);

/** Whose Target Today shows: the learner's, one derived from a plan made before Targets existed, or none yet. */
export type LoopSource = 'set' | 'derived' | 'assumed';

export const loopSource = (state: Pick<ProgressState, 'target' | 'plan'>): LoopSource =>
  state.target ? 'set' : state.plan ? 'derived' : 'assumed';

/** A YYYY-MM-DD this many days later, as the engine's `addCalendarDays` gives it, spelled here for first paint. */
export const addDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/**
 * The target line (REDESIGN.md 2.7), as its parts: "Mid-level loop", "Oct 25", "23 days left", "45 min a day". Today joins
 * them with " · " and keeps each part on one line. `formatDay` turns a YYYY-MM-DD into "Oct 25"; `today` is the learner's
 * calendar day.
 */
export function loopLine(state: Pick<ProgressState, 'target' | 'plan'>, today: string, formatDay: (date: string) => string): string[] {
  const source = loopSource(state);
  if (source === 'assumed') return ['Assuming a Mid-level loop'];
  const loop = `${LEVEL_NAMES[state.target?.level ?? 'mid']} loop${source === 'derived' ? ' (assumed)' : ''}`;
  const plan = state.plan;
  if (!plan) return [loop, 'no date yet'];
  const days = calendarDaysBetween(today, plan.interviewDate);
  const parts = [loop, formatDay(plan.interviewDate), daysLeftLabel(days)];
  if (days > 0) parts.push(`${minutes(plan.minutesPerDay)} a day`);
  return parts;
}
