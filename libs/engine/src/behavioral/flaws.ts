import type { AnswerFlaw } from './types.js';
import type { StarCheck, StarReview } from './star-check.js';

export const ANSWER_FLAWS: readonly { id: AnswerFlaw; label: string }[] = [
  { id: 'we-not-i', label: 'Says "we", so what the candidate did is unclear' },
  { id: 'no-result', label: 'No measurable result' },
  { id: 'long-setup', label: 'The setup crowds out the Action' },
  { id: 'no-reflection', label: 'Nothing learned' },
  { id: 'vague', label: 'Too vague to believe: no specifics' },
  { id: 'blame', label: 'Blames others' },
];

/** The live STAR check that catches each flaw, where one can; judgment flaws have none. */
export const FLAW_CHECKS: Partial<Record<AnswerFlaw, StarCheck['id']>> = {
  'we-not-i': 'ownership',
  'no-result': 'measured',
  'long-setup': 'action-weight',
  'no-reflection': 'reflection',
};

/** The flaws a STAR review shows: those whose live check failed. */
export function starFlaws(review: StarReview): AnswerFlaw[] {
  const failed = new Set(review.checks.filter((c) => !c.ok).map((c) => c.id));
  return ANSWER_FLAWS.map((f) => f.id).filter((id) => {
    const check = FLAW_CHECKS[id];
    return check !== undefined && failed.has(check);
  });
}
