import type { Difficulty } from '../algorithms/types.js';
import { LOOP_ROUND_MINUTES } from '../interview/loop.js';
import type { PlanLevel } from './options.js';

/**
 * Rough sittings at the "new" starting point; every screen says "about". Up next, the plan and the library meta lines
 * read these through `minutesFor`, so one estimate never shows two numbers.
 */
export const MINUTES = {
  /** A pattern lesson plus one solve, as the plan without a Target level counts it. */
  pattern: 40,
  /** A flagged pattern's fresh solve, as the plan without a Target level counts it. */
  retry: 20,
  /** Writing one story and tagging it. */
  story: 20,
  /** One stage of a case study. */
  caseStage: 4,
  /** One telling of a story. */
  rehearsal: 3,
  /** A problem at a learner's pace, reading and testing included. */
  problem: { easy: 20, medium: 35, hard: 50 } satisfies Record<Difficulty, number>,
  /** A topic or pattern lesson with its quick check, or a competency guide. */
  lesson: 15,
  /** Building one Design Lab mission to a pass. */
  mission: 20,
  /** Stepping through one visualizer with its checkpoints. */
  visualizer: 6,
  /** Drafting one behavioral question's STAR answer. */
  questionDraft: 15,
  /** One drill of a pattern or topic. */
  drill: 5,
  mockRound: LOOP_ROUND_MINUTES,
} as const;

/** A learner who has done this before takes less time; mock rounds run at the interviewers' pace whatever it is. */
export const STARTING_POINT_FACTOR: Record<PlanLevel, number> = { new: 1, rusty: 0.75, confident: 0.5 };

export const roundTo5 = (minutes: number) => Math.max(5, Math.round(minutes / 5) * 5);

export type MinutesTask =
  /** `pattern` is its lesson plus one solve; `retry` is a solve. */
  | { kind: 'problem' | 'pattern' | 'retry'; difficulty: Difficulty }
  | { kind: 'case'; stages: number }
  | { kind: 'lesson' | 'mission' | 'story' | 'questionDraft' | 'visualizer' | 'drill' };

/** About how long a task takes a learner at this starting point, to the nearest 5 minutes. */
export function minutesFor(task: MinutesTask, startingPoint: PlanLevel = 'new'): number {
  const base =
    task.kind === 'problem' || task.kind === 'retry'
      ? MINUTES.problem[task.difficulty]
      : task.kind === 'pattern'
        ? MINUTES.lesson + MINUTES.problem[task.difficulty]
        : task.kind === 'case'
          ? task.stages * MINUTES.caseStage
          : MINUTES[task.kind];
  return roundTo5(base * STARTING_POINT_FACTOR[startingPoint]);
}
