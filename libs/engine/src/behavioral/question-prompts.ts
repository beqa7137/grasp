import { QUESTION_PROMPT_ROWS } from './question-prompts.data.js';

/** A question as lists and search see it; its probes and follow-ups stay with the competency guides. */
export interface QuestionPrompt {
  id: string;
  competencyId: string;
  prompt: string;
}

/** Question ids are `<competency>-<n>` (competencies/question.ts). */
export const QUESTION_PROMPTS: readonly QuestionPrompt[] = QUESTION_PROMPT_ROWS.map(([id, prompt]) => ({
  id,
  competencyId: id.replace(/-\d+$/, ''),
  prompt,
}));
