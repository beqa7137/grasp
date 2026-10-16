// Competency states, apart from status.ts and pattern-status.ts, so the Behavioral hub loads them without the problem catalog.
import { isRehearsable } from '../behavioral/rehearsal.js';
import { storyCovers } from '../behavioral/stories.js';
import { VERDICTS } from '../interview/rubrics.js';
import { READY_RULES, capFlagged, type SkillStatus, type StatusContext } from './skill-status.js';

const verdictRank = (verdict: string | null | undefined) => (verdict ? (VERDICTS as readonly string[]).indexOf(verdict) : -1);

export function competencyStatus(id: string, { state, stories }: StatusContext): SkillStatus {
  const tagged = stories.filter((s) => storyCovers(s, id));
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
