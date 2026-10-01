export const PLAN_ROUNDS = ['coding', 'design', 'behavioral'] as const;
export type PlanRound = (typeof PLAN_ROUNDS)[number];

export const PLAN_LEVELS = ['new', 'rusty', 'confident'] as const;
export type PlanLevel = (typeof PLAN_LEVELS)[number];

export const PLAN_MINUTES = [15, 30, 45, 60, 90, 120] as const;

/** How far ahead a plan reaches; a later date is planned as if it were this far away. */
export const PLAN_MAX_DAYS = 365;

/** What the learner tells the plan. Synced as a progress event, so every device plans the same days. */
export interface StudyPlanInput {
  /** The interview's calendar day where the learner lives, as YYYY-MM-DD. */
  interviewDate: string;
  minutesPerDay: number;
  rounds: PlanRound[];
  level: PlanLevel;
}

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export function isCalendarDate(value: unknown): value is string {
  if (typeof value !== 'string' || !DATE.test(value)) return false;
  const ms = Date.parse(`${value}T00:00:00Z`);
  return !Number.isNaN(ms) && new Date(ms).toISOString().startsWith(value);
}

/** The plan with its rounds in a fixed order, or null when anything is outside the offered options. */
export function normalizePlan(plan: StudyPlanInput | null | undefined): StudyPlanInput | null {
  if (!plan || !isCalendarDate(plan.interviewDate)) return null;
  if (!(PLAN_MINUTES as readonly number[]).includes(plan.minutesPerDay)) return null;
  if (!(PLAN_LEVELS as readonly string[]).includes(plan.level)) return null;
  if (!Array.isArray(plan.rounds) || plan.rounds.some((r) => !(PLAN_ROUNDS as readonly string[]).includes(r))) return null;
  const rounds = PLAN_ROUNDS.filter((r) => plan.rounds.includes(r));
  if (!rounds.length) return null;
  return { interviewDate: plan.interviewDate, minutesPerDay: plan.minutesPerDay, rounds, level: plan.level };
}

const DAY_MS = 86_400_000;

/** Calendar days from one YYYY-MM-DD to another, free of time zones and daylight saving. */
export const calendarDaysBetween = (from: string, to: string) =>
  Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / DAY_MS);

export const addCalendarDays = (date: string, days: number) =>
  new Date(Date.parse(`${date}T00:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10);
