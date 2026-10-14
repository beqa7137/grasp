// Pattern states, apart from status.ts: its other skills need the behavioral and interview content, and the Coding hub's
// Skill map loads pattern states without them.
import type { Story } from '../behavioral/stories.js';
import { problemsForPattern } from '../coding/catalog.js';
import { getPatternSummary } from '../curriculum/catalog.js';
import { itemsForTopic } from '../review/catalog.js';
import type { ProgressState } from '../srs/progress.js';
import { retrievability, type CardState } from '../srs/scheduler.js';
import { meetsBar, type LevelProfile } from './levels.js';

export const SKILL_STATES = ['new', 'learning', 'practiced', 'ready'] as const;
export type SkillState = (typeof SKILL_STATES)[number];
export type SkillKind = 'pattern' | 'topic' | 'case' | 'competency';

export interface SkillStatus {
  kind: SkillKind;
  id: string;
  state: SkillState;
  /** An interview flagged it and nothing has resolved the flag; it caps the state at Practiced. */
  flagged: boolean;
}

/** The thresholds for Ready, tuned by the reachability simulation in readiness.spec.ts (values in docs/LOOP.md). */
export const READY_RULES = {
  /** Distinct problems of the pattern's own, fully solved on different days, at least one of them at the level bar. */
  patternSolves: 2,
  /** A pattern's review items passing the recall check (3: Fast & Slow Pointers has 3 a lesson and a solve unlock). */
  patternPassing: 3,
  /** A topic's review items passing the recall check, or all of them when it has fewer. */
  topicPassing: 4,
  /** Review items graded that make a topic Practiced without a finished mission or case. */
  topicPracticedGraded: 2,
  /** A finished case's share of best choices, and of close estimates (all but one when it has 3 or fewer). */
  caseBestChoices: 0.7,
  caseCloseEstimates: 0.7,
  /** Only a story's first tags count: a story tagged with everything is not evidence for each. */
  storyTags: 3,
  /** The recall check passes a card whose last grade passed and which is at most this overdue... */
  recallGraceDays: 2,
  /** ...or whose recall probability is within this of the retention target. */
  recallSlack: 0.05,
  /** The interview verdict on a competency that makes it Ready. */
  competencyVerdict: 'lean-hire',
} as const;

/** The learner's live state plus what readiness is measured against. */
export interface StatusContext {
  state: ProgressState;
  /** The story bank, which lives outside the event log. */
  stories: readonly Story[];
  now: Date;
  profile: LevelProfile;
}

export interface RecallSummary {
  items: number;
  graded: number;
  /** Graded items that pass the recall check. */
  passing: number;
}

/** The copy that names the case rule, so a screen never restates the numbers on its own. */
export const CASE_READY_RULE =
  'Seven in ten best choices and seven in ten close estimates (all but one when a case has three estimates or fewer).';

const DAY_MS = 86_400_000;

/**
 * A card passes when its last grade passed and it is at most a short grace past due, or when its current recall
 * probability is near the retention target. Not `itemStrength`, which a 3-week plan could never reach; and not plain
 * retrievability, which fails every card due today until that day's reviews are done.
 */
export function passesRecall(itemId: string, card: CardState, state: ProgressState, now: Date): boolean {
  const overdue = now.getTime() - Date.parse(card.due);
  if (card.phase === 'review' && overdue <= READY_RULES.recallGraceDays * DAY_MS) return true;
  return retrievability(itemId, card, now) >= state.settings.retention - READY_RULES.recallSlack;
}

export function recallSummary(topic: string, state: ProgressState, now: Date): RecallSummary {
  const items = itemsForTopic(topic);
  const graded = items.filter((i) => state.cards[i.id]);
  const passing = graded.filter((i) => passesRecall(i.id, state.cards[i.id], state, now));
  return { items: items.length, graded: graded.length, passing: passing.length };
}

/** How many more of a topic's items must pass for Ready (at most all of them). */
export const recallShort = (recall: RecallSummary, needed: number) => Math.max(0, Math.min(needed, recall.items) - recall.passing);

const dayOf = (iso: string) => iso.slice(0, 10);

/** Whether the pattern's own solves meet the Ready rule: enough distinct problems on different days, one at the bar. */
export function solvesReady(id: string, state: ProgressState, profile: LevelProfile): boolean {
  const own = problemsForPattern(id).filter((p) => p.patternIds[0] === id && state.coding[p.id]?.solvedAt);
  const days = new Set(own.map((p) => dayOf(state.coding[p.id].solvedAt!)));
  return own.length >= READY_RULES.patternSolves && days.size >= READY_RULES.patternSolves && own.some((p) => meetsBar(p, profile.bar));
}

/** A flag caps a skill at Practiced until it is resolved. */
export const capFlagged = (state: SkillState, flagged: boolean): SkillState => (flagged && state === 'ready' ? 'practiced' : state);

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
