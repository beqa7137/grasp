import { PATTERN_CATALOG } from '../curriculum/catalog.js';
import { SD_TOPICS } from '../curriculum/sd-topics.js';
import type { Rand } from '../review/random.js';
import { itemsForTopic } from '../review/catalog.js';
import type { ProgressState } from '../srs/progress.js';
import { practiceSet } from '../srs/session.js';
import { recallSummary } from './status.js';

export const WEAK_SPOT_LIMIT = 3;
/** Predictions count as a weak spot once at least this many were answered and most of them missed. */
export const WEAK_PREDICTIONS_MIN = 3;
/** Review cards below the recall target that make a topic a weak spot. */
export const WEAK_FADING_MIN = 2;

export type WeakSpotReason =
  | { kind: 'flagged'; at: string }
  | { kind: 'predictions'; missed: number; total: number }
  | { kind: 'fading'; below: number; graded: number };

export interface WeakSpot {
  /** A pattern or design topic id, as drills take it. */
  topic: string;
  reason: WeakSpotReason;
  /** How many items a drill of it holds. */
  cards: number;
}

/**
 * Up to three topics worth a drill, each with its reason: an interview flag not yet resolved (newest first), then
 * visualizer predictions mostly missed, then review cards fading below the recall target (the most first).
 */
export function weakSpots(state: ProgressState, now: Date): WeakSpot[] {
  const flagged = Object.entries(state.weakPatterns)
    .filter(([, f]) => !f.resolvedAt)
    .sort((a, b) => b[1].flaggedAt.localeCompare(a[1].flaggedAt))
    .map(([topic, f]): [string, WeakSpotReason] => [topic, { kind: 'flagged', at: f.flaggedAt }]);
  const predictions = Object.entries(state.predictions)
    .filter(([, p]) => p.total >= WEAK_PREDICTIONS_MIN && (p.total - p.correct) * 2 > p.total)
    .map(([topic, p]): [string, WeakSpotReason] => [topic, { kind: 'predictions', missed: p.total - p.correct, total: p.total }]);
  const fading = [...PATTERN_CATALOG, ...SD_TOPICS]
    .map(({ id }) => {
      const recall = recallSummary(id, state, now);
      return { id, below: recall.graded - recall.passing, graded: recall.graded };
    })
    .filter((f) => f.below >= WEAK_FADING_MIN)
    .sort((a, b) => b.below - a.below)
    .map(({ id, below, graded }): [string, WeakSpotReason] => [id, { kind: 'fading', below, graded }]);
  const spots: WeakSpot[] = [];
  for (const [topic, reason] of [...flagged, ...predictions, ...fading]) {
    if (spots.length === WEAK_SPOT_LIMIT) break;
    if (!spots.some((s) => s.topic === topic)) spots.push({ topic, reason, cards: itemsForTopic(topic).length });
  }
  return spots;
}

/** One ungraded drill across several topics: each topic's practice set, taken in turns so neighbours differ. */
export function practiceMix(topics: readonly string[], rand: Rand): string[] {
  const sets = topics.map((t) => practiceSet(t, rand));
  const mixed: string[] = [];
  for (let i = 0; sets.some((s) => s[i]); i++) for (const set of sets) if (set[i]) mixed.push(set[i]);
  return mixed;
}
