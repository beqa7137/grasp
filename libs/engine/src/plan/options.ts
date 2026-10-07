import type { Seniority } from '../behavioral/types.js';

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

/** The levels a Target can name, in `SENIORITY_LEVELS` order (the schema needs them as a literal tuple). */
export const TARGET_LEVELS = ['early', 'mid', 'senior'] as const satisfies readonly Seniority[];

export const TARGET_COMPANIES = ['amazon'] as const;
export type TargetCompany = (typeof TARGET_COMPANIES)[number];

/** How many rounds of each kind the loop has; 0 leaves the round out. Counts weigh the rounds in readiness. */
export type RoundCounts = Record<PlanRound, number>;

export const MAX_ROUND_COUNT = 3;

/** What `target.set` carries. Every field the redesign needs is declared here, so the schema is staged only once. */
export interface TargetInput {
  level: Seniority;
  rounds: RoundCounts;
  company?: TargetCompany;
}

export const DEFAULT_ROUND_COUNTS: Record<Seniority, RoundCounts> = {
  early: { coding: 2, design: 0, behavioral: 1 },
  mid: { coding: 2, design: 1, behavioral: 1 },
  senior: { coding: 2, design: 2, behavioral: 1 },
};

const isCount = (value: unknown): value is number =>
  Number.isInteger(value) && (value as number) >= 0 && (value as number) <= MAX_ROUND_COUNT;

/** The Target as this client understands it, or null when anything is outside the offered options (a newer client's). */
export function normalizeTarget(input: TargetInput | null | undefined): TargetInput | null {
  if (!input || !(TARGET_LEVELS as readonly string[]).includes(input.level)) return null;
  if (!input.rounds || !PLAN_ROUNDS.every((r) => isCount(input.rounds[r]))) return null;
  if (!PLAN_ROUNDS.some((r) => input.rounds[r] > 0)) return null;
  if (input.company !== undefined && !(TARGET_COMPANIES as readonly string[]).includes(input.company)) return null;
  const rounds = Object.fromEntries(PLAN_ROUNDS.map((r) => [r, input.rounds[r]])) as RoundCounts;
  return input.company ? { level: input.level, rounds, company: input.company } : { level: input.level, rounds };
}

/** The rounds a plan holds: those counted once or more. */
export const roundsInLoop = (rounds: RoundCounts): PlanRound[] => PLAN_ROUNDS.filter((r) => rounds[r] > 0);

/**
 * An older app edits the plan without knowing the Target: a round it added gets the level's default count (at least 1,
 * so it weighs something), and a round it removed gets 0.
 */
export function followPlanRounds(target: TargetInput, plan: StudyPlanInput): TargetInput {
  const inPlan = new Set<PlanRound>(plan.rounds);
  const current = roundsInLoop(target.rounds);
  if (current.length === inPlan.size && current.every((r) => inPlan.has(r))) return target;
  const defaults = DEFAULT_ROUND_COUNTS[target.level];
  const rounds = Object.fromEntries(
    PLAN_ROUNDS.map((r) => [r, !inPlan.has(r) ? 0 : target.rounds[r] > 0 ? target.rounds[r] : Math.max(1, defaults[r])]),
  ) as RoundCounts;
  return { ...target, rounds };
}
