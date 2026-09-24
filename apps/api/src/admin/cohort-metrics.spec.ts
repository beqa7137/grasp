import type { StoredEvent } from '@grasp/engine';
import type { FeedbackEntry } from '../feedback/feedback.types.js';
import type { InterviewSession } from '../interview/interview.types.js';
import { PROBLEMS } from '../interview/problems.js';
import { cohortMetrics, type LearnerEvent } from './cohort-metrics.js';

const NOW = new Date('2026-09-20T12:00:00Z');
const at = (daysAgo: number, minutes = 0) => new Date(NOW.getTime() - daysAgo * 86_400_000 + minutes * 60_000).toISOString();
let seq = 0;

const review = (
  learnerId: string,
  when: string,
  itemId: string,
  correct: boolean,
  rating: 1 | 2 | 3 | 4 = correct ? 3 : 1,
): LearnerEvent => ({
  learnerId,
  event: { id: `e${seq++}`, at: when, type: 'review.graded', itemId, rating, correct, durationMs: 5000 },
});
type WithoutId<T> = T extends unknown ? Omit<T, 'id'> : never;
const other = (learnerId: string, event: WithoutId<StoredEvent>): LearnerEvent => ({
  learnerId,
  event: { id: `e${seq++}`, ...event } as StoredEvent,
});

function session(
  learnerId: string,
  created: string,
  opts: { scored?: 'ai' | 'offline'; turns?: number; costUsd?: number } = {},
): InterviewSession {
  const turns = opts.turns ?? 2;
  return {
    id: `s${seq++}`,
    learnerId,
    track: 'coding',
    problem: PROBLEMS[0],
    hintsUsed: 1,
    status: opts.scored ? 'scored' : 'active',
    createdAt: created,
    messages: Array.from({ length: turns }, (_, i) => ({
      role: 'candidate' as const,
      content: 'x',
      at: created.replace(/:00\./, `:0${i}.`),
    })),
    ...(opts.scored
      ? {
          scorecard: {
            verdict: 'hire' as const,
            summary: '',
            dimensions: [],
            strengths: [],
            improvements: [],
            weakPatterns: [],
            mode: opts.scored,
          },
        }
      : {}),
    usage: {
      calls: turns + 1,
      inputTokens: 100,
      outputTokens: 50,
      cacheReadTokens: 300,
      cacheWriteTokens: 100,
      costUsd: opts.costUsd ?? 0.01,
    },
  };
}

const feedback = (learnerId: string, kind: FeedbackEntry['kind'], rating: number | null, createdAt: string): FeedbackEntry => ({
  id: `f${seq++}`,
  learnerId,
  kind,
  message: `${kind} note`,
  rating,
  context: { route: '/learn', release: null, platform: 'web' },
  createdAt,
});

describe('cohortMetrics', () => {
  // ada: joined 10 days ago, came back next day and on day 8, reviews the same item across days.
  // bob: joined 3 days ago, one visit only, did an interview.
  // cy: joined today, took the placement check, predicted and completed a mission.
  const events: LearnerEvent[] = [
    review('ada', at(10), 'rec:a', true),
    review('ada', at(10, 5), 'rec:b', false),
    review('ada', at(9), 'rec:a', true, 4),
    review('ada', at(9, 6), 'rec:b', false),
    review('ada', at(2), 'rec:a', true),
    review('ada', at(2, 20), 'rec:c', true, 2),
    other('bob', { at: at(3), type: 'interview.scored', sessionId: 's', track: 'coding', verdict: 'hire', weakPatterns: [] }),
    other('cy', { at: at(0), type: 'predict.answered', algorithmId: 'binary-search', patternId: 'binary-search', correct: true }),
    other('cy', { at: at(0, 5), type: 'diagnostic.completed', answers: [{ itemId: 'rec:h1', outcome: 'correct', durationMs: 9_000 }] }),
    other('cy', { at: at(0, 10), type: 'predict.answered', algorithmId: 'binary-search', patternId: 'binary-search', correct: false }),
    other('cy', { at: at(0, 12), type: 'scenario.completed', scenarioId: 'first-scale-up', monthlyCost: 400 }),
    other('cy', { at: at(0, 14), type: 'scenario.completed', scenarioId: 'first-scale-up', monthlyCost: 380, variant: 1 }),
  ];
  const sessions = [
    session('bob', at(3), { scored: 'ai', turns: 4, costUsd: 0.05 }),
    session('bob', at(3, 30), { turns: 2, costUsd: 0.01 }),
  ];
  const notes = [feedback('ada', 'bug', 4, at(2)), feedback('cy', 'idea', 2, at(0)), feedback('cy', 'praise', null, at(0, 1))];

  const m = cohortMetrics(events, sessions, notes, NOW);

  it('counts learners and recent activity', () => {
    expect(m.learners).toEqual({ total: 3, active1d: 1, active7d: 3, newLast7d: 2 });
  });

  it('measures activation per learner', () => {
    expect(m.activation.tookPlacementCheck).toEqual({ count: 1, of: 3, rate: 1 / 3 });
    expect(m.activation.reviewed).toEqual({ count: 1, of: 3, rate: 1 / 3 });
    expect(m.activation.predicted.count).toBe(1);
    expect(m.activation.completedMission.count).toBe(1);
    expect(m.activation.startedInterview.count).toBe(1);
    expect(m.activation.scoredInterview.count).toBe(1);
  });

  it('computes D1 and D7 retention over eligible learners only', () => {
    expect(m.retention.d1).toEqual({ count: 1, of: 2, rate: 0.5 });
    expect(m.retention.d7).toEqual({ count: 1, of: 1, rate: 1 });
  });

  it('reports recall on items reviewed again after at least a day', () => {
    expect(m.reviews.total).toBe(6);
    expect(m.reviews.last7d).toBe(2);
    expect(m.reviews.ratings).toEqual({ again: 2, hard: 1, good: 2, easy: 1 });
    // rec:a day 10 → 9 (correct), 9 → 2 (correct); rec:b 10 → 9 (wrong)
    expect(m.reviews.recallAfterADay).toEqual({ count: 2, of: 3, rate: 2 / 3 });
  });

  it('summarizes predictions, missions and interviews including AI cost', () => {
    expect(m.predictions.correct).toEqual({ count: 1, of: 2, rate: 0.5 });
    expect(m.missions).toEqual({ completions: 1, revisits: 1 });
    expect(m.interviews).toMatchObject({
      started: 2,
      scored: { count: 1, of: 2, rate: 0.5 },
      aiScored: 1,
      heuristicScored: 0,
      averageCandidateTurns: 3,
      hintsPerSession: 1,
      costUsd: 0.06,
      costPerScoredUsd: 0.06,
      cacheReadShare: 0.6,
      verdicts: { hire: 1 },
    });
  });

  it('aggregates feedback without exposing who sent it', () => {
    expect(m.feedback.total).toBe(3);
    expect(m.feedback.byKind).toEqual({ bug: 1, idea: 1, praise: 1 });
    expect(m.feedback.averageRating).toBe(3);
    expect(m.feedback.recent[0]).toEqual({ kind: 'praise', message: 'praise note', rating: null, createdAt: at(0, 1) });
    expect(JSON.stringify(m.feedback)).not.toContain('ada');
  });

  it('builds a 14-day daily series ending today', () => {
    expect(m.daily).toHaveLength(14);
    expect(m.daily.at(-1)).toMatchObject({ date: '2026-09-20', activeLearners: 1 });
    expect(m.daily.find((d) => d.date === '2026-09-17')).toMatchObject({ activeLearners: 1, interviewTurns: 6 });
  });

  it('handles an empty pilot', () => {
    const empty = cohortMetrics([], [], [], NOW);
    expect(empty.learners.total).toBe(0);
    expect(empty.retention.d1.rate).toBeNull();
    expect(empty.interviews.costPerScoredUsd).toBeNull();
  });
});
