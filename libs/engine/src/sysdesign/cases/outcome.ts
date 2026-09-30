import { estimateVerdict, parseAmount } from './estimate.js';
import type { CaseStage, CaseStudy } from './types.js';

/** What the learner did at one stage: the option chosen, the estimate typed and how many model answer points are open. */
export interface CaseStageAnswer {
  chosen?: number;
  guess?: string;
  revealed?: number;
}

/** How a finished case went, small enough to sync as a progress event. */
export interface CaseOutcome {
  /** Decisions answered with the recommended option, out of `decisions`. */
  bestChoices: number;
  decisions: number;
  /** Estimates within 2x of the model answer, out of `estimates`. */
  closeEstimates: number;
  estimates: number;
}

/** The option a saved answer chose, or null when it chose none or one the stage no longer has. */
export function chosenOption(stage: CaseStage, answer: CaseStageAnswer | undefined): number | null {
  const chosen = answer?.chosen;
  return chosen !== undefined && stage.decision?.options[chosen] ? chosen : null;
}

/** Whether the stage's decision and estimate, where it has them, are answered. */
export function stageAnswered(stage: CaseStage, answer: CaseStageAnswer | undefined): boolean {
  return (!stage.decision || chosenOption(stage, answer) !== null) && (!stage.estimate || parseAmount(answer?.guess ?? '') !== null);
}

/** The outcome once every decision and estimate is answered, or null while one is still open. */
export function caseOutcome(study: CaseStudy, answers: readonly (CaseStageAnswer | undefined)[]): CaseOutcome | null {
  const outcome: CaseOutcome = { bestChoices: 0, decisions: 0, closeEstimates: 0, estimates: 0 };
  for (const [i, stage] of study.stages.entries()) {
    const answer = answers[i];
    if (stage.decision) {
      const chosen = chosenOption(stage, answer);
      if (chosen === null) return null;
      outcome.decisions++;
      if (stage.decision.options[chosen].best) outcome.bestChoices++;
    }
    if (stage.estimate) {
      const guess = parseAmount(answer?.guess ?? '');
      if (guess === null) return null;
      outcome.estimates++;
      if (estimateVerdict(guess, stage.estimate.answer).tone !== 'off') outcome.closeEstimates++;
    }
  }
  return outcome;
}
