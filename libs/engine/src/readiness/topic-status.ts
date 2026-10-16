// Topic states, apart from status.ts and pattern-status.ts, so the Design hub's Topics load them without the behavioral,
// interview and problem catalogs.
import { getSdTopic } from '../curriculum/sd-topics.js';
import type { ProgressState } from '../srs/progress.js';
import { READY_RULES, recallShort, recallSummary, type SkillStatus, type StatusContext } from './skill-status.js';

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
