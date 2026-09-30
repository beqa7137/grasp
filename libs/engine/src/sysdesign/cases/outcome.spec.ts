import { describe, expect, it } from 'vitest';
import { getCaseStudy, type CaseStageAnswer } from './index.js';
import { caseOutcome, chosenOption, stageAnswered } from './outcome.js';

const study = getCaseStudy('url-shortener')!;
const best = (i: number) => study.stages[i].decision!.options.findIndex((o) => o.best);
const answered = (pick: (i: number) => CaseStageAnswer) => study.stages.map((_, i) => pick(i));
const full = answered((i) => ({
  ...(study.stages[i].decision ? { chosen: best(i) } : {}),
  ...(study.stages[i].estimate ? { guess: String(study.stages[i].estimate!.answer) } : {}),
}));

describe('case study outcomes', () => {
  it('counts the recommended decisions and the estimates within 2x', () => {
    expect(caseOutcome(study, full)).toEqual({ bestChoices: 3, decisions: 3, closeEstimates: 2, estimates: 2 });

    const firstDecision = study.stages.findIndex((s) => s.decision);
    const firstEstimate = study.stages.findIndex((s) => s.estimate);
    const mixed = full.map((a, i) =>
      i === firstDecision
        ? { ...a, chosen: (best(i) + 1) % study.stages[i].decision!.options.length }
        : i === firstEstimate
          ? { ...a, guess: '1' }
          : a,
    );
    expect(caseOutcome(study, mixed)).toEqual({ bestChoices: 2, decisions: 3, closeEstimates: 1, estimates: 2 });
  });

  it('stays open while a decision or an estimate is unanswered, or an answer does not fit its stage', () => {
    const withAnswer = (i: number, answer: CaseStageAnswer) => full.map((a, j) => (j === i ? answer : a));
    const decision = study.stages.findIndex((s) => s.decision);
    const estimate = study.stages.findIndex((s) => s.estimate);
    expect(caseOutcome(study, withAnswer(decision, {}))).toBeNull();
    expect(caseOutcome(study, withAnswer(decision, { chosen: 9 }))).toBeNull();
    expect(caseOutcome(study, withAnswer(estimate, { guess: 'lots' }))).toBeNull();
    expect(caseOutcome(study, full.slice(0, -1))).not.toBeNull();
    expect(caseOutcome(study, [])).toBeNull();
  });

  it('reads a saved option only when the decision still has it', () => {
    const decision = study.stages.find((s) => s.decision)!;
    const estimate = study.stages.find((s) => s.estimate)!;
    const count = decision.decision!.options.length;
    expect(chosenOption(decision, { chosen: count - 1 })).toBe(count - 1);
    expect(chosenOption(decision, { chosen: count })).toBeNull();
    expect(chosenOption(decision, undefined)).toBeNull();
    expect(stageAnswered(decision, { chosen: count })).toBe(false);
    expect(stageAnswered(estimate, { guess: '12k' })).toBe(true);
    expect(stageAnswered(study.stages.at(-1)!, undefined)).toBe(true);
  });
});
