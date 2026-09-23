import { StrategyMode, createEmptyCard, fsrs, generatorParameters, type Card, type Grade } from 'ts-fsrs';

export type ReviewRating = 1 | 2 | 3 | 4;

export const RATING = { again: 1, hard: 2, good: 3, easy: 4 } as const satisfies Record<string, ReviewRating>;

export type CardPhase = 'new' | 'learning' | 'review' | 'relearning';

/** JSON-safe FSRS memory state for one review item. */
export interface CardState {
  due: string;
  stability: number;
  difficulty: number;
  scheduledDays: number;
  learningSteps: number;
  reps: number;
  lapses: number;
  phase: CardPhase;
  lastReview: string | null;
  firstReview: string;
}

export const SCHEDULER_CONFIG = {
  requestRetention: 0.9,
  maximumIntervalDays: 365,
  /** One short step: a correct first answer graduates straight to FSRS scheduling; a miss comes back in 10 minutes. */
  learningSteps: ['10m'] as const,
  relearningSteps: ['10m'] as const,
};

const PHASES: CardPhase[] = ['new', 'learning', 'review', 'relearning'];

type SeededCard = Card & { cid: string };

/**
 * Fuzz is seeded from the item id and repetition count (not from float math or wall-clock),
 * so replaying the same event log yields identical schedules on every device and on the server.
 */
const scheduler = fsrs(
  generatorParameters({
    request_retention: SCHEDULER_CONFIG.requestRetention,
    maximum_interval: SCHEDULER_CONFIG.maximumIntervalDays,
    enable_fuzz: true,
    enable_short_term: true,
    learning_steps: SCHEDULER_CONFIG.learningSteps,
    relearning_steps: SCHEDULER_CONFIG.relearningSteps,
  }),
).useStrategy(StrategyMode.SEED, function () {
  return `${String(Reflect.get(this.current, 'cid'))}:${this.current.reps}`;
});

function toFsrs(itemId: string, card: CardState | undefined, now: Date): SeededCard {
  if (!card) return { ...createEmptyCard(now), cid: itemId };
  return {
    cid: itemId,
    due: new Date(card.due),
    stability: card.stability,
    difficulty: card.difficulty,
    elapsed_days: 0,
    scheduled_days: card.scheduledDays,
    learning_steps: card.learningSteps,
    reps: card.reps,
    lapses: card.lapses,
    state: PHASES.indexOf(card.phase),
    last_review: card.lastReview ? new Date(card.lastReview) : undefined,
  };
}

function fromFsrs(card: Card, firstReview: string): CardState {
  return {
    due: card.due.toISOString(),
    stability: card.stability,
    difficulty: card.difficulty,
    scheduledDays: card.scheduled_days,
    learningSteps: card.learning_steps,
    reps: card.reps,
    lapses: card.lapses,
    phase: PHASES[card.state],
    lastReview: card.last_review ? card.last_review.toISOString() : null,
    firstReview,
  };
}

export function review(itemId: string, prev: CardState | undefined, rating: ReviewRating, at: Date): CardState {
  const next = scheduler.next(toFsrs(itemId, prev, at), at, rating as Grade);
  return fromFsrs(next.card, prev?.firstReview ?? at.toISOString());
}

/** Due date each rating would produce — shown to the learner before they commit to a rating. */
export function previewDue(itemId: string, prev: CardState | undefined, at: Date): Record<ReviewRating, string> {
  const card = toFsrs(itemId, prev, at);
  const out = {} as Record<ReviewRating, string>;
  for (const r of [1, 2, 3, 4] as ReviewRating[]) out[r] = scheduler.next(card, at, r as Grade).card.due.toISOString();
  return out;
}

/** Probability (0–1) the learner can still recall the item right now. */
export function retrievability(itemId: string, card: CardState | undefined, now: Date): number {
  if (!card || card.phase === 'new') return 0;
  return scheduler.get_retrievability(toFsrs(itemId, card, now), now, false);
}

/**
 * Moves the next review earlier without touching memory state. FSRS accounts for the shorter
 * elapsed time at the next real review, so this is safe — unlike editing stability or difficulty.
 */
export function pullForward(card: CardState, to: Date): CardState {
  return Date.parse(card.due) <= to.getTime() ? card : { ...card, due: to.toISOString() };
}

export function formatInterval(fromIso: string | Date, toIso: string | Date): string {
  const ms = new Date(toIso).getTime() - new Date(fromIso).getTime();
  const minutes = Math.max(1, Math.round(ms / 60_000));
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h`;
  const days = Math.round(hours / 24);
  if (days < 31) return `${days}d`;
  const months = Math.round(days / 30);
  return months < 12 ? `${months}mo` : `${Math.round((days / 365) * 10) / 10}y`;
}
