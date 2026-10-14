import { PATTERN_CATALOG } from '../curriculum/catalog.js';
import { getReviewItemSummary, itemsForTopic } from '../review/catalog.js';
import { pick, type Rand } from '../review/random.js';
import type { DiagnosticAnswer } from './events.js';

export type Placement = 'weak' | 'strong';

/** Only recognition items are asked: they are unlocked from day one and don't name the pattern in the question. */
export function isDiagnosticItem(itemId: string): boolean {
  return getReviewItemSummary(itemId)?.kind === 'recognition';
}

/** Curriculum order, so the check runs from foundations to advanced. */
export function diagnosticItems(rand: Rand): string[] {
  return PATTERN_CATALOG.map((pattern) => {
    const candidates = itemsForTopic(pattern.id).filter((item) => isDiagnosticItem(item.id));
    return pick(rand, candidates).id;
  });
}

/**
 * A pattern is strong only when every answer on it was right. Trusting a single right answer is safe because a
 * wrong placement is cheap: a lucky guess (one in four) only moves that pattern's first cards later in the queue.
 */
export function placementFromAnswers(answers: readonly DiagnosticAnswer[]): Record<string, Placement> {
  const placement: Record<string, Placement> = {};
  for (const answer of answers) {
    const topic = getReviewItemSummary(answer.itemId)?.topic;
    if (!topic) continue;
    placement[topic] = answer.outcome === 'correct' && placement[topic] !== 'weak' ? 'strong' : 'weak';
  }
  return placement;
}

/**
 * The pattern the placement check says to learn first: the earliest it placed as weak that the learner has not yet moved
 * past (`started`, as practised or ready), or none before a placement.
 */
export function startHerePattern(
  placement: Readonly<Record<string, Placement>>,
  started: (id: string) => boolean = () => false,
): string | null {
  return PATTERN_CATALOG.find((p) => placement[p.id] === 'weak' && !started(p.id))?.id ?? null;
}
