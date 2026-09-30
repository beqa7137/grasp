import { shuffle, type Rand } from '../review/random.js';
import { COMPETENCIES, getCompetency } from './competencies.js';
import { countWords, reviewStar, type StarDraft, type StarReview } from './star-check.js';
import type { BehavioralQuestion } from './types.js';

export const MOCK_QUESTIONS = 3;
export const MOCK_FOLLOW_UPS = 2;
/** A follow-up answered in fewer words than this is a sentence fragment, not an answer. */
export const FOLLOW_UP_MIN_WORDS = 12;

export interface MockQuestion {
  question: BehavioralQuestion;
  followUps: string[];
}

export interface MockAnswer {
  answer: StarDraft;
  followUps: string[];
}

export interface MockDebrief {
  answers: {
    question: BehavioralQuestion;
    review: StarReview;
    passing: number;
    followUps: { prompt: string; answer: string; ok: boolean }[];
  }[];
  passing: number;
  total: number;
  /** The check missed most often across answers, the one habit worth fixing first. */
  focus: string | null;
}

/** Three questions from different competencies, each with two of its follow-ups, as one interviewer would ask them. */
export function planMock(rand: Rand): MockQuestion[] {
  return shuffle(rand, COMPETENCIES)
    .slice(0, MOCK_QUESTIONS)
    .map((c) => {
      const question = c.questions[Math.floor(rand() * c.questions.length)];
      return { question, followUps: shuffle(rand, question.followUps).slice(0, MOCK_FOLLOW_UPS) };
    });
}

/**
 * One question, by its id or, for a competency id, one of that competency's at random, with two of its follow-ups;
 * the three-question mock for an id that names neither.
 */
export function planQuestion(rand: Rand, id: string): MockQuestion[] {
  const pool = getCompetency(id)?.questions ?? COMPETENCIES.flatMap((c) => c.questions).filter((q) => q.id === id);
  if (!pool.length) return planMock(rand);
  const question = pool[Math.floor(rand() * pool.length)];
  return [{ question, followUps: shuffle(rand, question.followUps).slice(0, MOCK_FOLLOW_UPS) }];
}

/** Another question of the same competency as `questionId`, for a fresh attempt; the competency id when it has no other. */
export function anotherQuestion(rand: Rand, questionId: string): string {
  const competency = COMPETENCIES.find((c) => c.questions.some((q) => q.id === questionId));
  const others = competency?.questions.filter((q) => q.id !== questionId) ?? [];
  return others.length ? others[Math.floor(rand() * others.length)].id : (competency?.id ?? questionId);
}

export function debriefMock(plan: readonly MockQuestion[], answers: readonly MockAnswer[]): MockDebrief {
  const rows = plan.map(({ question, followUps }, i) => {
    const review = reviewStar(answers[i].answer);
    return {
      question,
      review,
      passing: review.checks.filter((c) => c.ok).length,
      followUps: followUps.map((prompt, j) => {
        const answer = answers[i].followUps[j] ?? '';
        return { prompt, answer, ok: countWords(answer) >= FOLLOW_UP_MIN_WORDS };
      }),
    };
  });
  const misses = new Map<string, { count: number; message: string }>();
  for (const check of rows.flatMap((r) => r.review.checks).filter((c) => !c.ok)) {
    const seen = misses.get(check.id);
    misses.set(check.id, { count: (seen?.count ?? 0) + 1, message: seen?.message ?? check.message });
  }
  const focus = [...misses.values()].sort((a, b) => b.count - a.count)[0]?.message ?? null;
  return {
    answers: rows,
    passing: rows.reduce((sum, r) => sum + r.passing + r.followUps.filter((f) => f.ok).length, 0),
    total: rows.reduce((sum, r) => sum + r.review.checks.length + r.followUps.length, 0),
    focus,
  };
}
