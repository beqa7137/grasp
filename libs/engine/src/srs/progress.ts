import { getCompetencySummary } from '../behavioral/catalog.js';
import { problemPatterns } from '../coding/problem-patterns.js';
import { PATTERN_CATALOG } from '../curriculum/catalog.js';
import { SD_TOPICS, getSdTopic } from '../curriculum/sd-topics.js';
import { normalizePlan, type StudyPlanInput } from '../plan/options.js';
import { getReviewItemSummary, itemsForTopic } from '../review/catalog.js';
import type { ItemKind, ReviewItemSummary } from '../review/types.js';
import type { CaseOutcome } from '../sysdesign/cases/outcome.js';
import { SCENARIO_CATALOG } from '../sysdesign/scenario-catalog.js';
import { placementFromAnswers, type Placement } from './diagnostic.js';
import { sortEvents, upcast, type CaseCompletedEvent, type InterviewScoredEvent, type StoredEvent, type StudySettings } from './events.js';
import { pullForward, retrievability, review, type CardPhase, type CardState, type ReviewRating } from './scheduler.js';
import { DEFAULT_STUDY_SETTINGS, mergeSettings } from './settings.js';

const DAY_MS = 86_400_000;

/** Spaced revisits of a completed Design Lab mission, in days after the previous completion. */
export const MISSION_LADDER_DAYS = [3, 10, 30];

/** A wrong prediction in a visualizer brings that pattern's checkpoint back within this window. */
export const PREDICTION_MISS_PULL_MS = DAY_MS;

/** Finishing a case study brings the review items of its topics back within this window. */
export const CASE_REVIEW_PULL_MS = DAY_MS;

/** Items reviewed this recently are left where they are when a case study finishes, so several cases do not flood a day. */
export const CASE_REVIEW_REST_MS = 3 * DAY_MS;

const RECENT_LOG_LIMIT = 500;
const DURATION_EMA_ALPHA = 0.2;
const MIN_DURATION_MS = 1_000;
const MAX_DURATION_MS = 120_000;

export interface MissionState {
  firstCompletedAt: string;
  bestCost: number;
  revisitsDone: number;
  nextRevisitAt: string | null;
}

export interface Boost {
  at: string;
  reason: 'prediction-miss' | 'interview' | 'code' | 'case';
}

export interface CodingRecord {
  attempts: number;
  solvedAt: string | null;
  bestPassed: number;
  total: number;
}

export interface CompetencyRecord {
  /** When an interview last asked about this competency, and its verdict; null while it has only been flagged. */
  lastAt: string | null;
  verdict: string | null;
  /** Since when an interview has flagged it as weak; a later interview on it that does not flag it clears this. */
  weakSince: string | null;
}

export interface CaseRecord extends CaseOutcome {
  firstCompletedAt: string;
  completions: number;
  /** Every design topic a completion covered; their design items stay unlocked. */
  topics: string[];
}

export interface ReviewRecord {
  at: string;
  itemId: string;
  phase: CardPhase;
  rating: ReviewRating;
}

export interface ProgressState {
  cards: Record<string, CardState>;
  boosts: Record<string, Boost>;
  /** Topic (pattern or system design topic) → first time the learner engaged with it. */
  introduced: Record<string, string>;
  visualized: Record<string, string>;
  predictions: Record<string, { correct: number; total: number }>;
  missions: Record<string, MissionState>;
  /** Finished case studies; the outcome is the latest completion's. */
  cases: Record<string, CaseRecord>;
  interviews: { total: number; lastVerdict: string | null };
  behavioral: Record<string, CompetencyRecord>;
  /** Pattern → when an interview last flagged it as weak. */
  weakPatterns: Record<string, string>;
  /** Pattern → placement from the latest placement check. */
  placement: Record<string, Placement>;
  diagnosedAt: string | null;
  coding: Record<string, CodingRecord>;
  practice: { correct: number; total: number };
  /** Moving average of answer time per item kind, in ms. */
  durations: Partial<Record<ItemKind, number>>;
  recent: ReviewRecord[];
  streak: { current: number; longest: number; lastDay: string | null };
  xp: number;
  eventCount: number;
  settings: StudySettings;
  plan: StudyPlanInput | null;
}

export const emptyProgress = (): ProgressState => ({
  cards: {},
  boosts: {},
  introduced: {},
  visualized: {},
  predictions: {},
  missions: {},
  cases: {},
  interviews: { total: 0, lastVerdict: null },
  behavioral: {},
  weakPatterns: {},
  placement: {},
  diagnosedAt: null,
  coding: {},
  practice: { correct: 0, total: 0 },
  durations: {},
  recent: [],
  streak: { current: 0, longest: 0, lastDay: null },
  xp: 0,
  eventCount: 0,
  settings: { ...DEFAULT_STUDY_SETTINGS },
  plan: null,
});

/** Pure reducer: the same event log yields the same state on every device and on the server. */
export function applyEvent(state: ProgressState, stored: StoredEvent): ProgressState {
  const event = upcast(stored);
  const at = new Date(event.at);
  const next: ProgressState = {
    ...state,
    cards: { ...state.cards },
    boosts: { ...state.boosts },
    introduced: { ...state.introduced },
    streak: event.type === 'settings.changed' || event.type === 'plan.set' ? state.streak : bumpStreak(state.streak, event.at.slice(0, 10)),
    eventCount: state.eventCount + 1,
  };
  const introduce = (topic: string) => {
    next.introduced[topic] ??= event.at;
  };

  switch (event.type) {
    case 'review.graded': {
      const def = getReviewItemSummary(event.itemId);
      if (!def) break;
      const prev = state.cards[event.itemId];
      next.cards[event.itemId] = review(event.itemId, prev, event.rating, at, state.settings.retention);
      delete next.boosts[event.itemId];
      introduce(def.topic);
      next.recent = [...state.recent, { at: event.at, itemId: event.itemId, phase: prev?.phase ?? 'new', rating: event.rating }].slice(
        -RECENT_LOG_LIMIT,
      );
      next.durations = updateDuration(state.durations, def.kind, event.durationMs);
      next.xp += [0, 2, 6, 10, 12][event.rating];
      break;
    }
    case 'practice.answered': {
      const def = getReviewItemSummary(event.itemId);
      if (def) introduce(def.topic);
      next.practice = { correct: state.practice.correct + (event.correct ? 1 : 0), total: state.practice.total + 1 };
      next.xp += event.correct ? 2 : 0;
      break;
    }
    case 'predict.answered': {
      const p = state.predictions[event.patternId] ?? { correct: 0, total: 0 };
      next.predictions = { ...state.predictions, [event.patternId]: { correct: p.correct + (event.correct ? 1 : 0), total: p.total + 1 } };
      next.visualized = { ...state.visualized, [event.algorithmId]: state.visualized[event.algorithmId] ?? event.at };
      introduce(event.patternId);
      if (!event.correct) {
        const itemId = `pred:${event.algorithmId}`;
        const card = next.cards[itemId];
        if (card) next.cards[itemId] = pullForward(card, new Date(at.getTime() + PREDICTION_MISS_PULL_MS));
        next.boosts[itemId] = { at: event.at, reason: 'prediction-miss' };
      }
      next.xp += event.correct ? 5 : 1;
      break;
    }
    case 'scenario.completed': {
      const prev = state.missions[event.scenarioId];
      let mission: MissionState;
      if (!prev) {
        mission = {
          firstCompletedAt: event.at,
          bestCost: event.monthlyCost,
          revisitsDone: 0,
          nextRevisitAt: addDays(at, MISSION_LADDER_DAYS[0]),
        };
        next.xp += 100;
      } else if (event.variant !== undefined && event.variant === prev.revisitsDone + 1) {
        const done = event.variant;
        mission = {
          ...prev,
          revisitsDone: done,
          nextRevisitAt: done < MISSION_LADDER_DAYS.length ? addDays(at, MISSION_LADDER_DAYS[done]) : null,
        };
        next.xp += 60;
      } else {
        mission = { ...prev, bestCost: event.variant === undefined ? Math.min(prev.bestCost, event.monthlyCost) : prev.bestCost };
        next.xp += 10;
      }
      next.missions = { ...state.missions, [event.scenarioId]: mission };
      for (const t of SD_TOPICS) if (t.scenarioIds.includes(event.scenarioId)) introduce(t.id);
      break;
    }
    case 'case.completed':
      completeCase(state, next, event, introduce);
      break;
    case 'interview.scored': {
      next.interviews = { total: state.interviews.total + 1, lastVerdict: event.verdict };
      if (event.track === 'behavioral') next.behavioral = scoreCompetencies(state.behavioral, event);
      if (event.weakPatterns.length)
        next.weakPatterns = { ...state.weakPatterns, ...Object.fromEntries(event.weakPatterns.map((p) => [p, event.at])) };
      for (const topic of event.weakPatterns) {
        introduce(topic);
        for (const def of itemsForTopic(topic)) {
          const card = next.cards[def.id];
          if (card) next.cards[def.id] = pullForward(card, at);
          next.boosts[def.id] = { at: event.at, reason: 'interview' };
        }
      }
      next.xp += 20;
      break;
    }
    case 'code.submitted': {
      const patterns = problemPatterns(event.problemId);
      if (!patterns) break;
      const prev = state.coding[event.problemId];
      const solved = event.total > 0 && event.passed === event.total;
      next.coding = {
        ...state.coding,
        [event.problemId]: {
          attempts: (prev?.attempts ?? 0) + 1,
          solvedAt: prev?.solvedAt ?? (solved ? event.at : null),
          bestPassed: Math.max(prev?.bestPassed ?? 0, event.passed),
          total: event.total,
        },
      };
      patterns.forEach(introduce);
      // Failing before the first solve suggests the template isn't fluent yet: bring its recall cards forward.
      if (!solved && !prev?.solvedAt) {
        for (const topic of patterns) {
          for (const def of itemsForTopic(topic)) if (def.kind === 'cloze') next.boosts[def.id] = { at: event.at, reason: 'code' };
        }
      }
      next.xp += solved ? (prev?.solvedAt ? 5 : 50) : 2;
      break;
    }
    case 'settings.changed':
      next.settings = mergeSettings(state.settings, event.settings);
      break;
    case 'plan.set':
      next.plan = normalizePlan(event.plan);
      break;
    case 'diagnostic.completed': {
      next.placement = placementFromAnswers(event.answers);
      next.diagnosedAt = event.at;
      for (const [topic, placement] of Object.entries(next.placement)) if (placement === 'strong') introduce(topic);
      for (const answer of event.answers) {
        const def = getReviewItemSummary(answer.itemId);
        if (def && answer.outcome !== 'skipped') next.durations = updateDuration(next.durations, def.kind, answer.durationMs);
      }
      next.xp += 2 * event.answers.filter((a) => a.outcome === 'correct').length;
      break;
    }
  }
  return next;
}

export function replay(events: StoredEvent[], from: ProgressState = emptyProgress()): ProgressState {
  return sortEvents(events).reduce(applyEvent, from);
}

function completeCase(state: ProgressState, next: ProgressState, event: CaseCompletedEvent, introduce: (topic: string) => void) {
  const prev = state.cases[event.caseId];
  const { bestChoices, decisions, closeEstimates, estimates } = event;
  const topics = event.topics.filter((topic) => getSdTopic(topic));
  next.cases = {
    ...state.cases,
    [event.caseId]: {
      firstCompletedAt: prev?.firstCompletedAt ?? event.at,
      completions: (prev?.completions ?? 0) + 1,
      topics: [...new Set([...(prev?.topics ?? []), ...topics])],
      bestChoices,
      decisions,
      closeEstimates,
      estimates,
    },
  };
  const at = Date.parse(event.at);
  const due = new Date(at + CASE_REVIEW_PULL_MS);
  for (const topic of topics) {
    introduce(topic);
    const items = itemsForTopic(topic).filter((def) => def.kind === 'design');
    for (const def of items) {
      const card = next.cards[def.id];
      if (card && !(card.lastReview && at - Date.parse(card.lastReview) < CASE_REVIEW_REST_MS)) next.cards[def.id] = pullForward(card, due);
    }
    const unseen = items.find((def) => !next.cards[def.id]);
    if (unseen) next.boosts[unseen.id] = { at: event.at, reason: 'case' };
  }
  next.xp += prev ? 10 : 50;
}

function scoreCompetencies(behavioral: ProgressState['behavioral'], event: InterviewScoredEvent): ProgressState['behavioral'] {
  const next = { ...behavioral };
  const weak = new Set((event.weakCompetencies ?? []).filter((id) => getCompetencySummary(id)));
  const asked = event.competencyId && getCompetencySummary(event.competencyId) ? event.competencyId : null;
  if (asked) {
    next[asked] = {
      lastAt: event.at,
      verdict: event.verdict,
      weakSince: weak.has(asked) ? (behavioral[asked]?.weakSince ?? event.at) : null,
    };
  }
  for (const id of weak) {
    if (id === asked) continue;
    const prev = behavioral[id] ?? { lastAt: null, verdict: null, weakSince: null };
    next[id] = { ...prev, weakSince: prev.weakSince ?? event.at };
  }
  return next;
}

function updateDuration(durations: ProgressState['durations'], kind: ItemKind, ms: number): ProgressState['durations'] {
  if (!(ms >= MIN_DURATION_MS)) return durations;
  const sample = Math.min(ms, MAX_DURATION_MS);
  const prev = durations[kind];
  return { ...durations, [kind]: prev === undefined ? sample : Math.round(prev + DURATION_EMA_ALPHA * (sample - prev)) };
}

function addDays(at: Date, days: number): string {
  return new Date(at.getTime() + days * DAY_MS).toISOString();
}

function bumpStreak(streak: ProgressState['streak'], day: string): ProgressState['streak'] {
  if (streak.lastDay === day) return streak;
  if (streak.lastDay && day < streak.lastDay) return streak;
  const consecutive = streak.lastDay !== null && Math.round((Date.parse(day) - Date.parse(streak.lastDay)) / DAY_MS) === 1;
  const current = consecutive ? streak.current + 1 : 1;
  return { current, longest: Math.max(streak.longest, current), lastDay: day };
}

/** An item enters the review rotation only after the learner has met its idea somewhere else first. */
export function isUnlocked(item: ReviewItemSummary, state: ProgressState): boolean {
  switch (item.kind) {
    case 'recognition':
      return true;
    case 'complexity':
    case 'cloze':
      return Boolean(state.introduced[item.topic]);
    case 'predict':
      return Boolean(item.algorithmId && state.visualized[item.algorithmId]);
    case 'design':
      return (
        Boolean(getSdTopic(item.topic)?.scenarioIds.some((id) => state.missions[id])) ||
        Object.values(state.cases).some((c) => c.topics.includes(item.topic))
      );
  }
}

/** How strongly an item is held right now: recall probability, discounted until memory is durable (~3 weeks). */
export function itemStrength(itemId: string, card: CardState | undefined, now: Date): number {
  if (!card) return 0;
  return retrievability(itemId, card, now) * Math.min(1, card.stability / 21);
}

export interface TopicMastery {
  topic: string;
  kind: 'pattern' | 'design';
  mastery: number;
  itemsSeen: number;
  itemsTotal: number;
  predictionAccuracy: number | null;
}

export function masteryByTopic(state: ProgressState, now: Date): TopicMastery[] {
  const topics = [
    ...PATTERN_CATALOG.map((p) => ({ id: p.id, kind: 'pattern' as const })),
    ...SD_TOPICS.map((t) => ({ id: t.id, kind: 'design' as const })),
  ];
  return topics.map(({ id, kind }) => {
    const items = itemsForTopic(id);
    const total = items.reduce((s, i) => s + itemStrength(i.id, state.cards[i.id], now), 0);
    const pred = state.predictions[id];
    return {
      topic: id,
      kind,
      mastery: items.length ? Math.round((total / items.length) * 100) / 100 : 0,
      itemsSeen: items.filter((i) => state.cards[i.id]).length,
      itemsTotal: items.length,
      predictionAccuracy: pred && pred.total > 0 ? Math.round((pred.correct / pred.total) * 100) / 100 : null,
    };
  });
}

/**
 * Share of reviews of already-learned items (phase 'review') answered correctly: the number FSRS
 * steers toward the target retention. Null until there is enough data to mean anything.
 */
export function trueRetention(state: ProgressState, now: Date, days = 30, minSamples = 10): number | null {
  const since = now.getTime() - days * DAY_MS;
  const sample = state.recent.filter((r) => r.phase === 'review' && Date.parse(r.at) >= since);
  if (sample.length < minSamples) return null;
  return sample.filter((r) => r.rating > 1).length / sample.length;
}

export function dayKey(date: Date, tzOffsetMinutes = 0): string {
  return new Date(date.getTime() - tzOffsetMinutes * 60_000).toISOString().slice(0, 10);
}

/** Reviews falling due on each of the next `days` local days (today includes overdue ones). */
export function forecast(state: ProgressState, now: Date, days = 7, tzOffsetMinutes = 0): { day: string; count: number }[] {
  const keys = Array.from({ length: days }, (_, i) => dayKey(new Date(now.getTime() + i * DAY_MS), tzOffsetMinutes));
  const counts = new Map(keys.map((k) => [k, 0]));
  for (const card of Object.values(state.cards)) {
    const due = new Date(card.due);
    const key = due <= now ? keys[0] : dayKey(due, tzOffsetMinutes);
    if (counts.has(key)) counts.set(key, counts.get(key)! + 1);
  }
  return keys.map((day) => ({ day, count: counts.get(day)! }));
}

export interface MissionRevisit {
  scenarioId: string;
  variant: number;
  dueAt: string;
  due: boolean;
}

export function missionRevisits(state: ProgressState, now: Date): MissionRevisit[] {
  return SCENARIO_CATALOG.flatMap((s) => {
    const m = state.missions[s.id];
    if (!m?.nextRevisitAt || m.revisitsDone >= s.variants.length) return [];
    return [{ scenarioId: s.id, variant: m.revisitsDone + 1, dueAt: m.nextRevisitAt, due: Date.parse(m.nextRevisitAt) <= now.getTime() }];
  }).sort((a, b) => a.dueAt.localeCompare(b.dueAt));
}
