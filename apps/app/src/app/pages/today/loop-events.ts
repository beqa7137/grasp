import {
  DEFAULT_ROUND_COUNTS,
  PLAN_ROUNDS,
  roundsInLoop,
  type PlanRound,
  type ProgressState,
  type RoundCounts,
  type Seniority,
  type StudyPlanInput,
  type TargetInput,
} from '@grasp/engine';
import type { NewEvent } from '../../core/progress.service';

/** A plan's rounds at the level's default counts, at least one each: the pilot's level row (REDESIGN.md 2.1). */
export function levelCounts(level: Seniority, rounds: readonly PlanRound[]): RoundCounts {
  const defaults = DEFAULT_ROUND_COUNTS[level];
  return Object.fromEntries(PLAN_ROUNDS.map((r) => [r, rounds.includes(r) ? Math.max(1, defaults[r]) : 0])) as RoundCounts;
}

export interface LoopForm {
  level: Seniority;
  rounds: RoundCounts;
  /** The interview's calendar day, or null for "No date yet". */
  date: string | null;
  minutesPerDay: number;
  startingPoint: StudyPlanInput['level'];
}

const sameTarget = (a: TargetInput | null, b: TargetInput) => a?.level === b.level && PLAN_ROUNDS.every((r) => a.rounds[r] === b.rounds[r]);

const samePlan = (a: StudyPlanInput | null, b: StudyPlanInput) =>
  a?.interviewDate === b.interviewDate &&
  a.minutesPerDay === b.minutesPerDay &&
  a.level === b.level &&
  a.rounds.length === b.rounds.length &&
  a.rounds.every((r) => b.rounds.includes(r));

/**
 * What saving "Your loop" writes (REDESIGN.md 2.1): `target.set`, and `plan.set` when the date, time, starting point or
 * rounds changed; "No date yet" clears a plan and keeps the Target. Unchanged parts write nothing.
 */
export function loopEvents(form: LoopForm, state: Pick<ProgressState, 'target' | 'plan'>): NewEvent[] {
  const target: TargetInput = { level: form.level, rounds: form.rounds, ...(state.target?.company && { company: state.target.company }) };
  const events: NewEvent[] = sameTarget(state.target, target) ? [] : [{ type: 'target.set', target }];
  if (form.date === null) {
    if (state.plan) events.push({ type: 'plan.set', plan: null });
    return events;
  }
  const plan: StudyPlanInput = {
    interviewDate: form.date,
    minutesPerDay: form.minutesPerDay,
    rounds: roundsInLoop(form.rounds),
    level: form.startingPoint,
  };
  if (!samePlan(state.plan, plan)) events.push({ type: 'plan.set', plan });
  return events;
}
