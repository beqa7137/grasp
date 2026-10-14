import { COMPETENCIES } from './competencies.js';
import type { Story } from './stories.js';
import type { BehavioralQuestion } from './types.js';

/**
 * Each telling asks a different question from the story's competencies, so it is practised as a reusable answer. Kept
 * apart from the rehearsal ladder, which readiness and the plan read, since only this needs the questions.
 */
export function rehearsalQuestion(story: Story): BehavioralQuestion | undefined {
  const questions = COMPETENCIES.filter((c) => story.competencyIds.includes(c.id)).flatMap((c) => c.questions);
  return questions.length ? questions[(story.rehearsal?.told ?? 0) % questions.length] : undefined;
}
