import { upcast, type StoredEvent } from '@grasp/engine';
import type { FeedbackEntry } from '../feedback/feedback.types.js';
import type { InterviewSession, Verdict } from '../interview/interview.types.js';

export interface LearnerEvent {
  learnerId: string;
  event: StoredEvent;
}

export interface Ratio {
  count: number;
  of: number;
  rate: number | null;
}

export interface CohortMetrics {
  generatedAt: string;
  learners: { total: number; active1d: number; active7d: number; newLast7d: number };
  activation: {
    tookPlacementCheck: Ratio;
    reviewed: Ratio;
    predicted: Ratio;
    completedMission: Ratio;
    startedInterview: Ratio;
    scoredInterview: Ratio;
  };
  retention: { d1: Ratio; d7: Ratio };
  engagement: { activeDaysPerLearnerLast7d: number | null; medianSessionMinutes: number | null };
  reviews: {
    total: number;
    last7d: number;
    correct: Ratio;
    ratings: Record<'again' | 'hard' | 'good' | 'easy', number>;
    /** Recall on items last reviewed at least a day earlier: the number FSRS targets at 90%. */
    recallAfterADay: Ratio;
  };
  predictions: { total: number; correct: Ratio };
  missions: { completions: number; revisits: number };
  interviews: {
    started: number;
    scored: Ratio;
    byTrack: Record<string, number>;
    verdicts: Partial<Record<Verdict, number>>;
    averageCandidateTurns: number | null;
    aiScored: number;
    heuristicScored: number;
    hintsPerSession: number | null;
    costUsd: number;
    costPerScoredUsd: number | null;
    cacheReadShare: number | null;
  };
  feedback: {
    total: number;
    byKind: Record<string, number>;
    averageRating: number | null;
    recent: Pick<FeedbackEntry, 'kind' | 'message' | 'rating' | 'createdAt'>[];
  };
  daily: { date: string; activeLearners: number; reviews: number; interviewTurns: number }[];
}

const DAY_MS = 86_400_000;
const SESSION_GAP_MS = 30 * 60_000;
const RATING_NAMES = ['again', 'hard', 'good', 'easy'] as const;

const day = (iso: string) => iso.slice(0, 10);
const ratio = (count: number, of: number): Ratio => ({ count, of, rate: of ? count / of : null });
const round = (n: number | null, digits = 2) => (n === null ? null : Math.round(n * 10 ** digits) / 10 ** digits);
const inc = (map: Record<string, number>, key: string) => (map[key] = (map[key] ?? 0) + 1);

function median(values: number[]): number | null {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** Pilot metrics over every learner. Days are UTC; activity is any event, interview turn or feedback. */
export function cohortMetrics(
  events: LearnerEvent[],
  sessions: InterviewSession[],
  feedback: FeedbackEntry[],
  now = new Date(),
): CohortMetrics {
  const today = day(now.toISOString());
  const daysAgo = (n: number) => day(new Date(now.getTime() - n * DAY_MS).toISOString());

  const activity = new Map<string, string[]>();
  const touch = (learnerId: string, at: string) => {
    const list = activity.get(learnerId) ?? [];
    list.push(at);
    activity.set(learnerId, list);
  };
  for (const { learnerId, event } of events) touch(learnerId, event.at);
  for (const s of sessions) {
    touch(s.learnerId, s.createdAt);
    for (const m of s.messages) if (m.role === 'candidate' && m.at) touch(s.learnerId, m.at);
  }
  for (const f of feedback) touch(f.learnerId, f.createdAt);

  const learnerIds = [...activity.keys()];
  const daysOf = new Map(learnerIds.map((id) => [id, new Set(activity.get(id)!.map(day))]));
  const firstDay = new Map(learnerIds.map((id) => [id, [...daysOf.get(id)!].sort()[0]]));
  const activeSince = (since: string) => learnerIds.filter((id) => [...daysOf.get(id)!].some((d) => d >= since)).length;

  const retention = (offset: number) => {
    const eligible = learnerIds.filter((id) => firstDay.get(id)! <= daysAgo(offset));
    const retained = eligible.filter((id) => {
      const target = day(new Date(new Date(`${firstDay.get(id)}T00:00:00Z`).getTime() + offset * DAY_MS).toISOString());
      return [...daysOf.get(id)!].some((d) => d >= target);
    });
    return ratio(retained.length, eligible.length);
  };

  const did = (predicate: (e: StoredEvent) => boolean) =>
    ratio(new Set(events.filter((e) => predicate(e.event)).map((e) => e.learnerId)).size, learnerIds.length);

  const reviews = events.map((e) => ({ learnerId: e.learnerId, event: upcast(e.event) })).filter((e) => e.event.type === 'review.graded');
  const ratings = { again: 0, hard: 0, good: 0, easy: 0 };
  const lastReview = new Map<string, number>();
  let recallEligible = 0;
  let recalled = 0;
  for (const { learnerId, event } of [...reviews].sort((a, b) => a.event.at.localeCompare(b.event.at))) {
    if (event.type !== 'review.graded') continue;
    ratings[RATING_NAMES[event.rating - 1]]++;
    const key = `${learnerId}:${event.itemId}`;
    const at = Date.parse(event.at);
    const previous = lastReview.get(key);
    if (previous !== undefined && at - previous >= DAY_MS) {
      recallEligible++;
      if (event.correct) recalled++;
    }
    lastReview.set(key, at);
  }

  const predictions = events.filter((e) => e.event.type === 'predict.answered');
  const missions = events.flatMap((e) => (e.event.type === 'scenario.completed' ? [e.event] : []));

  const scored = sessions.filter((s) => s.scorecard);
  const verdicts: Partial<Record<Verdict, number>> = {};
  for (const s of scored) inc(verdicts, s.scorecard!.verdict);
  const byTrack: Record<string, number> = {};
  for (const s of sessions) inc(byTrack, s.track);
  const turns = sessions.map((s) => s.messages.filter((m) => m.role === 'candidate').length);
  const costs = sessions.map((s) => s.usage?.costUsd ?? 0);
  const costUsd = costs.reduce((a, b) => a + b, 0);
  const tokens = sessions.reduce(
    (acc, s) => ({
      cached: acc.cached + (s.usage?.cacheReadTokens ?? 0),
      prompt: acc.prompt + (s.usage ? s.usage.inputTokens + s.usage.cacheReadTokens + s.usage.cacheWriteTokens : 0),
    }),
    { cached: 0, prompt: 0 },
  );

  const sessionMinutes: number[] = [];
  for (const stamps of activity.values()) {
    const times = stamps.map((t) => Date.parse(t)).sort((a, b) => a - b);
    let start = times[0];
    for (let i = 1; i <= times.length; i++) {
      if (i === times.length || times[i] - times[i - 1] > SESSION_GAP_MS) {
        sessionMinutes.push((times[i - 1] - start) / 60_000);
        start = times[i];
      }
    }
  }

  const last7 = daysAgo(6);
  const activeDays7 = learnerIds.map((id) => [...daysOf.get(id)!].filter((d) => d >= last7).length).filter((n) => n > 0);
  const byKind: Record<string, number> = {};
  for (const f of feedback) inc(byKind, f.kind);
  const rated = feedback.filter((f) => f.rating !== null);

  const daily = Array.from({ length: 14 }, (_, i) => daysAgo(13 - i)).map((date) => ({
    date,
    activeLearners: learnerIds.filter((id) => daysOf.get(id)!.has(date)).length,
    reviews: reviews.filter((r) => day(r.event.at) === date).length,
    interviewTurns: sessions.reduce((n, s) => n + s.messages.filter((m) => m.role === 'candidate' && day(m.at) === date).length, 0),
  }));

  return {
    generatedAt: now.toISOString(),
    learners: {
      total: learnerIds.length,
      active1d: activeSince(today),
      active7d: activeSince(last7),
      newLast7d: learnerIds.filter((id) => firstDay.get(id)! >= last7).length,
    },
    activation: {
      tookPlacementCheck: did((e) => e.type === 'diagnostic.completed'),
      reviewed: did((e) => e.type === 'review.graded' || e.type === 'drill.reviewed'),
      predicted: did((e) => e.type === 'predict.answered'),
      completedMission: did((e) => e.type === 'scenario.completed'),
      startedInterview: ratio(new Set(sessions.map((s) => s.learnerId)).size, learnerIds.length),
      scoredInterview: ratio(new Set(scored.map((s) => s.learnerId)).size, learnerIds.length),
    },
    retention: { d1: retention(1), d7: retention(7) },
    engagement: {
      activeDaysPerLearnerLast7d: round(activeDays7.length ? activeDays7.reduce((a, b) => a + b, 0) / activeDays7.length : null),
      medianSessionMinutes: round(median(sessionMinutes), 1),
    },
    reviews: {
      total: reviews.length,
      last7d: reviews.filter((r) => day(r.event.at) >= last7).length,
      correct: ratio(reviews.filter((r) => r.event.type === 'review.graded' && r.event.correct).length, reviews.length),
      ratings,
      recallAfterADay: ratio(recalled, recallEligible),
    },
    predictions: {
      total: predictions.length,
      correct: ratio(predictions.filter((p) => p.event.type === 'predict.answered' && p.event.correct).length, predictions.length),
    },
    missions: { completions: missions.filter((m) => !m.variant).length, revisits: missions.filter((m) => m.variant).length },
    interviews: {
      started: sessions.length,
      scored: ratio(scored.length, sessions.length),
      byTrack,
      verdicts,
      averageCandidateTurns: round(turns.length ? turns.reduce((a, b) => a + b, 0) / turns.length : null, 1),
      aiScored: scored.filter((s) => s.scorecard!.mode === 'ai').length,
      heuristicScored: scored.filter((s) => s.scorecard!.mode === 'offline').length,
      hintsPerSession: round(sessions.length ? sessions.reduce((a, s) => a + s.hintsUsed, 0) / sessions.length : null),
      costUsd: round(costUsd, 4)!,
      costPerScoredUsd: round(scored.length ? costUsd / scored.length : null, 4),
      cacheReadShare: round(tokens.prompt ? tokens.cached / tokens.prompt : null),
    },
    feedback: {
      total: feedback.length,
      byKind,
      averageRating: round(rated.length ? rated.reduce((a, f) => a + f.rating!, 0) / rated.length : null),
      recent: [...feedback]
        .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
        .slice(0, 20)
        .map(({ kind, message, rating, createdAt }) => ({ kind, message, rating, createdAt })),
    },
    daily,
  };
}
