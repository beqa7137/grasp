import {
  countWords,
  EMPTY_STAR_DRAFT,
  FLAW_CHECKS,
  FOLLOW_UP_MIN_WORDS,
  MOCK_FOLLOW_UPS,
  reviewStar,
  starFlaws,
  type StarCheck,
} from '@grasp/engine';
import { BEHAVIORAL_CLOSING } from './behavioral.prompts.js';
import { questionFollowUps } from './behavioral-problems.js';
import type { InterviewMessage, InterviewSession, Scorecard } from './interview.types.js';
import { RUBRICS } from './prompts.js';
import { verdictForAverage } from './scorecard.schema.js';

export const SAY_MORE =
  'Could you say more? Walk me through exactly what you did and what happened, the way you would tell it in the room.';

const answerWords = (m: InterviewMessage) => countWords(m.star ? Object.values(m.star).join(' ') : m.content);

/** Scripted follow-ups: a fragment is asked for more, otherwise the question's own follow-ups in order, then the closing. */
export function behavioralReply(session: InterviewSession): string {
  const last = session.messages.at(-1);
  if (last && last.role === 'candidate' && answerWords(last) < FOLLOW_UP_MIN_WORDS) return SAY_MORE;
  const asked = new Set(session.messages.filter((m) => m.role === 'interviewer').map((m) => m.content));
  return (
    questionFollowUps(session.problem)
      .slice(0, MOCK_FOLLOW_UPS)
      .find((f) => !asked.has(f)) ?? BEHAVIORAL_CLOSING
  );
}

/**
 * Coverage, not quality: the STAR checks and follow-up lengths stand in for the rubric, so no dimension scores above 3,
 * and a flaw has no quote because no one has read the answer.
 */
export function behavioralScorecard(session: InterviewSession, summary: string): Scorecard {
  const candidate = session.messages.filter((m) => m.role === 'candidate');
  const star = candidate[0]?.star ?? EMPTY_STAR_DRAFT;
  const review = reviewStar(star);
  const check = (id: StarCheck['id']) => review.checks.find((c) => c.id === id)!;
  const followUps = candidate.slice(1).filter((m) => countWords(m.content) >= FOLLOW_UP_MIN_WORDS).length;
  const fallback = review.words > 40 ? 2 : 1;
  const scores = [
    check('complete').ok ? 3 : fallback,
    check('ownership').ok ? 3 : fallback,
    check('measured').ok ? 3 : fallback,
    check('reflection').ok ? 3 : fallback,
    followUps >= MOCK_FOLLOW_UPS ? 3 : followUps > 0 ? 2 : 1,
  ];
  const rubric = RUBRICS.behavioral;
  const dimensions = rubric.map((r, i) => ({
    name: r.name,
    score: scores[i],
    evidence: scores[i] >= 3 ? 'Addressed in your answers.' : 'Little or no evidence in the transcript.',
  }));
  const average = scores.reduce((sum, s) => sum + s, 0) / scores.length;
  return {
    verdict: verdictForAverage(average),
    summary,
    dimensions,
    strengths: dimensions.filter((d) => d.score >= 3).map((d) => d.name),
    improvements: rubric.filter((_, i) => scores[i] < 3).map((r) => `${r.name}: ${r.lookFor}`),
    weakPatterns: [],
    flaws: starFlaws(review).map((id) => ({ id, quote: null, fix: check(FLAW_CHECKS[id]!).message })),
    weakCompetencies: average < 3 && session.problem.competencyId ? [session.problem.competencyId] : [],
    mode: 'offline',
  };
}
