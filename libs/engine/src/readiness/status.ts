import { isRehearsable } from '../behavioral/rehearsal.js';
import type { Story } from '../behavioral/stories.js';
import { problemsForPattern } from '../coding/catalog.js';
import { getPatternSummary } from '../curriculum/catalog.js';
import { getSdTopic } from '../curriculum/sd-topics.js';
import { VERDICTS } from '../interview/rubrics.js';
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

const capped = (state: SkillState, flagged: boolean): SkillState => (flagged && state === 'ready' ? 'practiced' : state);

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
    state: capped(ready ? 'ready' : solved.length ? 'practiced' : learning ? 'learning' : 'new', flagged),
  };
}

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
    state: capped(ready ? 'ready' : told.length ? 'practiced' : learning ? 'learning' : 'new', flagged),
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
