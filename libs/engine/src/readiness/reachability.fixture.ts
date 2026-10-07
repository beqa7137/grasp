import { dueStories, rehearse } from '../behavioral/rehearsal.js';
import type { Story } from '../behavioral/stories.js';
import { INTERVIEW_TRACKS } from '../interview/rubrics.js';
import { PLAN_ROUND_TRACK } from '../interview/loop.js';
import { DEFAULT_ROUND_COUNTS, PLAN_ROUNDS, addCalendarDays, type PlanLevel, type PlanRound } from '../plan/options.js';
import { buildStudyPlan, type PlanCoverage, type PlanUnit } from '../plan/study-plan.js';
import { itemsForTopic } from '../review/catalog.js';
import type { LearningEvent } from '../srs/events.js';
import { applyEvent, emptyProgress, type ProgressState } from '../srs/progress.js';
import { buildSession } from '../srs/session.js';
import { CASE_CATALOG } from '../sysdesign/case-catalog.js';
import { loopReadiness, type LoopReadiness } from './readiness.js';
import type { Seniority } from '../behavioral/types.js';

const DAY_MS = 86_400_000;
const MINUTE_MS = 60_000;
/** Due cards are graded until none is left, but never more often than this a day (learning steps come back in 10 min). */
const MAX_REVIEW_PASSES = 6;

export interface SimulationOptions {
  level: Seniority;
  /** The plan's starting point. */
  startingPoint: PlanLevel;
  days: number;
  minutesPerDay: number;
  /** Grade every due review but never work a plan slice. */
  reviewsOnly?: boolean;
}

export interface SimulationResult {
  /** On the interview day, after that morning's reviews. */
  readiness: LoopReadiness;
  /** On the interview morning, before its reviews. */
  morning: LoopReadiness;
  /** What the first day's plan says the chosen time covers. */
  coverage: PlanCoverage;
  /** Plan slices worked in each round over the first 7 days. */
  firstWeek: Record<PlanRound, number>;
  state: ProgressState;
  stories: Story[];
  /** Plan units finished before the interview day. */
  finished: PlanUnit[];
}

/**
 * A learner on the default plan for their Target: every day they grade every due review Good, tell every due story
 * well, and work every plan slice, finishing a unit once its minutes are worked. Readiness is read on the interview
 * day, after that morning's reviews.
 */
export function simulateLearner(opts: SimulationOptions): SimulationResult {
  const start = Date.parse('2026-10-02T09:00:00.000Z');
  const rounds = PLAN_ROUNDS.filter((r) => DEFAULT_ROUND_COUNTS[opts.level][r] > 0);
  const input = {
    interviewDate: addCalendarDays('2026-10-02', opts.days),
    minutesPerDay: opts.minutesPerDay,
    rounds,
    level: opts.startingPoint,
  };
  let state = emptyProgress();
  let stories: Story[] = [];
  let clock = start;
  let seq = 0;
  const record = (body: DistributiveOmit<LearningEvent, 'id' | 'at'>) => {
    state = applyEvent(state, { id: `sim-${String(++seq).padStart(6, '0')}`, at: new Date(clock).toISOString(), ...body } as LearningEvent);
    clock += 1000;
  };
  record({ type: 'target.set', target: { level: opts.level, rounds: { ...DEFAULT_ROUND_COUNTS[opts.level] } } });
  record({ type: 'plan.set', plan: input });

  const worked = new Map<string, number>();
  const finished: PlanUnit[] = [];
  const mockRounds: { track: (typeof INTERVIEW_TRACKS)[number]; sessionId: string; verdict: string; at: string }[] = [];

  const finish = (unit: PlanUnit) => {
    finished.push(unit);
    switch (unit.kind) {
      case 'pattern':
      case 'solve':
      case 'retry':
        return record({ type: 'code.submitted', problemId: unit.problemId!, language: 'python', passed: 10, total: 10 });
      case 'case': {
        const topics = [...CASE_CATALOG.find((c) => c.id === unit.caseId)!.topics];
        return record({
          type: 'case.completed',
          caseId: unit.caseId!,
          topics,
          bestChoices: 4,
          decisions: 5,
          closeEstimates: 3,
          estimates: 4,
        });
      }
      case 'mission':
        return record({ type: 'scenario.completed', scenarioId: unit.scenarioId!, monthlyCost: 1000 });
      case 'lesson':
        return record({ type: 'practice.answered', itemId: itemsForTopic(unit.topicId!)[0].id, correct: true, durationMs: 30_000 });
      case 'story': {
        const at = new Date(clock).toISOString();
        const draft = { situation: 'S', task: 'T', action: 'A', result: 'R', reflection: 'L' };
        stories = [
          ...stories,
          { id: `story-${unit.competencyId}`, title: unit.title, competencyIds: [unit.competencyId!], draft, updatedAt: at, createdAt: at },
        ];
        return;
      }
      case 'mock': {
        const track = PLAN_ROUND_TRACK[unit.round];
        const sessionId = `mock-${track}`;
        record({ type: 'interview.scored', sessionId, track, verdict: 'lean-hire', weakPatterns: [] });
        mockRounds.push({ track, sessionId, verdict: 'lean-hire', at: new Date(clock).toISOString() });
        if (mockRounds.length === rounds.length)
          record({ type: 'mock.completed', loopId: 'mock-loop-sim', verdict: 'lean-hire', rounds: mockRounds });
      }
    }
  };

  const review = (budgetMinutes: number) => {
    const now = new Date(clock);
    stories = stories.map((s) => (dueStories([s], now, state.behavioral).length ? rehearse(s, true, now) : s));
    const grade = (itemId: string) => record({ type: 'review.graded', itemId, rating: 3, correct: true, durationMs: 20_000 });
    buildSession(state, { now, budgetMinutes }).items.forEach((i) => grade(i.itemId));
    for (let pass = 0; pass < MAX_REVIEW_PASSES; pass++) {
      const due = Object.entries(state.cards).filter(([, card]) => Date.parse(card.due) <= clock);
      if (!due.length) break;
      due.forEach(([itemId]) => grade(itemId));
      clock += 10 * MINUTE_MS;
    }
  };

  let coverage: PlanCoverage | undefined;
  const firstWeek: Record<PlanRound, number> = { coding: 0, design: 0, behavioral: 0 };
  for (let day = 0; day < opts.days; day++) {
    clock = start + day * DAY_MS;
    const plan = buildStudyPlan(input, state, { now: new Date(clock), stories, target: state.target! });
    coverage ??= plan.coverage;
    review(plan.days[0]?.review || state.settings.budgetMinutes);
    if (opts.reviewsOnly) continue;
    for (const slice of plan.days[0]?.slices ?? []) {
      if (slice.done) continue;
      if (day < 7 && slice.unit.kind !== 'mock') firstWeek[slice.unit.round]++;
      const total = (worked.get(slice.unit.id) ?? 0) + slice.minutes;
      worked.set(slice.unit.id, total);
      clock += slice.minutes * MINUTE_MS;
      if (total >= slice.unit.minutes) finish(slice.unit);
    }
  }
  clock = start + opts.days * DAY_MS;
  const morning = loopReadiness(state, stories, new Date(clock));
  review(state.settings.budgetMinutes);
  return { readiness: loopReadiness(state, stories, new Date(clock)), morning, coverage: coverage!, firstWeek, state, stories, finished };
}

type DistributiveOmit<T, K extends PropertyKey> = T extends unknown ? Omit<T, K> : never;
