// Pattern states, apart from status.ts: its other skills need the behavioral and interview content, and the Coding hub's
// Skill map loads pattern states without them.
import { problemsForPattern } from '../coding/catalog.js';
import { getPatternSummary } from '../curriculum/catalog.js';
import type { ProgressState } from '../srs/progress.js';
import { meetsBar, type LevelProfile } from './levels.js';
import { READY_RULES, capFlagged, recallShort, recallSummary, type SkillStatus, type StatusContext } from './skill-status.js';

export * from './skill-status.js';

const dayOf = (iso: string) => iso.slice(0, 10);

/** Whether the pattern's own solves meet the Ready rule: enough distinct problems on different days, one at the bar. */
export function solvesReady(id: string, state: ProgressState, profile: LevelProfile): boolean {
  const own = problemsForPattern(id).filter((p) => p.patternIds[0] === id && state.coding[p.id]?.solvedAt);
  const days = new Set(own.map((p) => dayOf(state.coding[p.id].solvedAt!)));
  return own.length >= READY_RULES.patternSolves && days.size >= READY_RULES.patternSolves && own.some((p) => meetsBar(p, profile.bar));
}

export function patternStatus(id: string, { state, now, profile }: StatusContext): SkillStatus {
  const members = problemsForPattern(id);
  const solved = members.filter((p) => p.patternIds[0] === id && state.coding[p.id]?.solvedAt);
  const learning =
    Boolean(state.introduced[id]) ||
    members.some((p) => state.coding[p.id]) ||
    Boolean(getPatternSummary(id)?.algorithmIds.some((a) => state.visualized[a]));
  const ready = solvesReady(id, state, profile) && !recallShort(recallSummary(id, state, now), READY_RULES.patternPassing);
  const flag = state.weakPatterns[id];
  const flagged = Boolean(flag && !flag.resolvedAt);
  return {
    kind: 'pattern',
    id,
    flagged,
    state: capFlagged(ready ? 'ready' : solved.length ? 'practiced' : learning ? 'learning' : 'new', flagged),
  };
}
