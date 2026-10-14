import { isRehearsable } from '../behavioral/rehearsal.js';
import { getSdTopic } from '../curriculum/sd-topics.js';
import { VERDICTS } from '../interview/rubrics.js';
import type { ProgressState } from '../srs/progress.js';
import {
  READY_RULES,
  capFlagged,
  patternStatus,
  recallShort,
  recallSummary,
  type SkillKind,
  type SkillStatus,
  type StatusContext,
} from './pattern-status.js';

export * from './pattern-status.js';

/** A finished mission or case study that exercises the topic. */
export function topicCovered(id: string, state: ProgressState): boolean {
  return (
    Boolean(getSdTopic(id)?.scenarioIds.some((s) => state.missions[s])) || Object.values(state.cases).some((c) => c.topics.includes(id))
  );
}

/**
 * The log cannot tell a lesson's quick check from a drill (both are `practice.answered`), and design items are graded
 * only once a mission or case unlocks them, so "quick check answered and 2 items graded" reads as "2 items graded".
 */
export function topicStatus(id: string, { state, now }: StatusContext): SkillStatus {
  const recall = recallSummary(id, state, now);
  const covered = topicCovered(id, state);
  const ready = covered && !recallShort(recall, READY_RULES.topicPassing);
  const practiced = covered || recall.graded >= READY_RULES.topicPracticedGraded;
  return {
    kind: 'topic',
    id,
    flagged: false,
    state: ready ? 'ready' : practiced ? 'practiced' : state.introduced[id] ? 'learning' : 'new',
  };
}

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

const verdictRank = (verdict: string | null | undefined) => (verdict ? (VERDICTS as readonly string[]).indexOf(verdict) : -1);

export function competencyStatus(id: string, { state, stories }: StatusContext): SkillStatus {
  const tagged = stories.filter((s) => !s.deleted && s.competencyIds.slice(0, READY_RULES.storyTags).includes(id));
  const told = tagged.filter((s) => isRehearsable(s) && (s.rehearsal?.told ?? 0) >= 1);
  const record = state.behavioral[id];
  // Step 1 means its latest telling went well and it has been told at least twice.
  const ready = told.some((s) => s.rehearsal!.step >= 1) || verdictRank(record?.verdict) >= verdictRank(READY_RULES.competencyVerdict);
  const learning = tagged.length > 0 || Boolean(record?.lastAt);
  const flagged = Boolean(record?.weakSince);
  return {
    kind: 'competency',
    id,
    flagged,
    state: capFlagged(ready ? 'ready' : told.length ? 'practiced' : learning ? 'learning' : 'new', flagged),
  };
}

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
