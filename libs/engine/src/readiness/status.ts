import { competencyStatus } from './competency-status.js';
import { READY_RULES, patternStatus, type SkillKind, type SkillStatus, type StatusContext } from './pattern-status.js';
import { topicStatus } from './topic-status.js';

export * from './pattern-status.js';
export * from './topic-status.js';
export * from './competency-status.js';

/** Case stages are tracked on the device only, so an unfinished case reads as New. */
export function caseStatus(id: string, { state }: StatusContext): SkillStatus {
  const record = state.cases[id];
  const ready =
    record &&
    record.bestChoices >= Math.ceil(READY_RULES.caseBestChoices * record.decisions) &&
    record.closeEstimates >= closeEstimatesNeeded(record.estimates);
  return { kind: 'case', id, flagged: false, state: ready ? 'ready' : record ? 'practiced' : 'new' };
}

/** ceil(70%) of a case's estimates, but all but one when it has 3 or fewer, where 70% would demand every one. */
export const closeEstimatesNeeded = (estimates: number) =>
  estimates <= 3 ? Math.max(0, estimates - 1) : Math.ceil(READY_RULES.caseCloseEstimates * estimates);

export function skillStatus(kind: SkillKind, id: string, ctx: StatusContext): SkillStatus {
  switch (kind) {
    case 'pattern':
      return patternStatus(id, ctx);
    case 'topic':
      return topicStatus(id, ctx);
    case 'case':
      return caseStatus(id, ctx);
    case 'competency':
      return competencyStatus(id, ctx);
  }
}
