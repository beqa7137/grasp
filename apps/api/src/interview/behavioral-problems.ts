import { COMPETENCIES, getCompetency, getCompetencySummary, type BehavioralQuestion, type Competency } from '@grasp/engine';
import type { InterviewProblem } from './interview.types.js';

const list = (items: readonly string[]) => items.map((item) => `- ${item}`).join('\n');

function problemFor(competency: Competency, question: BehavioralQuestion): InterviewProblem {
  return {
    id: question.id,
    track: 'behavioral',
    competencyId: competency.id,
    title: getCompetencySummary(competency.id)?.name ?? competency.id,
    opening: `${question.prompt} Take a moment, then answer in STAR form.`,
    referenceNotes: `What this question checks: ${question.probes}
Strong answers show:
${list(competency.strongSignals)}
Red flags:
${list(competency.redFlags)}
Follow-ups interviewers often ask here:
${list(question.followUps)}`,
    patternIds: [],
    hints: [],
  };
}

export const BEHAVIORAL_PROBLEMS: InterviewProblem[] = COMPETENCIES.flatMap((c) => c.questions.map((q) => problemFor(c, q)));

/** A question id picks that question; a competency id picks one of its questions at random. */
export function pickBehavioralProblem(id?: string): InterviewProblem | undefined {
  const exact = BEHAVIORAL_PROBLEMS.find((p) => p.id === id);
  if (exact) return exact;
  const pool = id ? BEHAVIORAL_PROBLEMS.filter((p) => p.competencyId === id) : BEHAVIORAL_PROBLEMS;
  return pool[Math.floor(Math.random() * pool.length)];
}

/** The follow-ups the question itself lists, for the scripted interviewer. */
export function questionFollowUps(problem: InterviewProblem): readonly string[] {
  return getCompetency(problem.competencyId ?? '')?.questions.find((q) => q.id === problem.id)?.followUps ?? [];
}
