import type { Language } from '../coding/types.js';
import type { ReviewRating } from './scheduler.js';

interface BaseEvent {
  id: string;
  at: string;
}

/** A graded review of a scheduled item. The only event that changes FSRS memory state. */
export interface ReviewGradedEvent extends BaseEvent {
  type: 'review.graded';
  itemId: string;
  rating: ReviewRating;
  correct: boolean;
  durationMs: number;
  seed?: number;
}

/** Ungraded practice (e.g. cramming one pattern). Recorded for stats; never touches the schedule. */
export interface PracticeAnsweredEvent extends BaseEvent {
  type: 'practice.answered';
  itemId: string;
  correct: boolean;
  durationMs: number;
}

export interface PredictAnsweredEvent extends BaseEvent {
  type: 'predict.answered';
  algorithmId: string;
  patternId: string;
  correct: boolean;
}

export interface ScenarioCompletedEvent extends BaseEvent {
  type: 'scenario.completed';
  scenarioId: string;
  monthlyCost: number;
  /** 1-based revisit variant; absent for the original mission. */
  variant?: number;
}

export interface InterviewScoredEvent extends BaseEvent {
  type: 'interview.scored';
  sessionId: string;
  track: 'coding' | 'system-design' | 'behavioral';
  verdict: string;
  weakPatterns: string[];
  /** Behavioral only: the competency the question asked about. */
  competencyId?: string;
  /** Behavioral only: competencies the answer showed a gap in. */
  weakCompetencies?: string[];
}

/** A full-suite submission in the coding workspace. */
export interface CodeSubmittedEvent extends BaseEvent {
  type: 'code.submitted';
  problemId: string;
  language: Language;
  passed: number;
  total: number;
}

/** Study preferences, synced like everything else so every device schedules the same way. */
export interface StudySettings {
  /** FSRS target recall probability; applies to reviews graded after the change. */
  retention: number;
  budgetMinutes: number;
  newPerDay: number;
}

export interface SettingsChangedEvent extends BaseEvent {
  type: 'settings.changed';
  settings: Partial<StudySettings>;
}

export const DIAGNOSTIC_OUTCOMES = ['correct', 'wrong', 'skipped'] as const;
export type DiagnosticOutcome = (typeof DIAGNOSTIC_OUTCOMES)[number];

export interface DiagnosticAnswer {
  itemId: string;
  outcome: DiagnosticOutcome;
  durationMs: number;
}

/** Raw answers, not a placement: the reducer derives it, so a rule change reinterprets every stored check on replay. */
export interface DiagnosticCompletedEvent extends BaseEvent {
  type: 'diagnostic.completed';
  answers: DiagnosticAnswer[];
}

export type LearningEvent =
  | ReviewGradedEvent
  | PracticeAnsweredEvent
  | PredictAnsweredEvent
  | ScenarioCompletedEvent
  | InterviewScoredEvent
  | CodeSubmittedEvent
  | SettingsChangedEvent
  | DiagnosticCompletedEvent;

/** v1 (SM-2) drill review, still accepted from older clients and stored logs. */
export interface LegacyDrillReviewedEvent extends BaseEvent {
  type: 'drill.reviewed';
  cardId: string;
  grade: 0 | 1 | 2 | 3 | 4 | 5;
}

export type StoredEvent = LearningEvent | LegacyDrillReviewedEvent;

const LEGACY_RATING: Record<LegacyDrillReviewedEvent['grade'], ReviewRating> = { 0: 1, 1: 1, 2: 1, 3: 2, 4: 3, 5: 4 };

/** Upcasts stored events to the current schema so the reducer only handles one shape per type. */
export function upcast(event: StoredEvent): LearningEvent {
  if (event.type !== 'drill.reviewed') return event;
  return {
    id: event.id,
    at: event.at,
    type: 'review.graded',
    itemId: `rec:${event.cardId}`,
    rating: LEGACY_RATING[event.grade],
    correct: event.grade >= 3,
    durationMs: 0,
  };
}

export function sortEvents<T extends BaseEvent>(events: T[]): T[] {
  return [...events].sort((a, b) => (a.at === b.at ? a.id.localeCompare(b.id) : a.at.localeCompare(b.at)));
}
