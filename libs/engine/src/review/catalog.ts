import { ALGORITHM_PATTERNS } from '../algorithms/patterns.js';
import { CLOZE_COUNTS, COMPLEXITY_CATALOG, DRILL_CATALOG, PATTERN_CATALOG } from '../curriculum/catalog.js';
import { DESIGN_ITEM_CATALOG, clozeSummary, complexitySummary, designSummary, predictSummary, recognitionSummary } from './summaries.js';
import type { ReviewItemSummary } from './types.js';

export const REVIEW_CATALOG: readonly ReviewItemSummary[] = [
  ...DRILL_CATALOG.map(recognitionSummary),
  ...COMPLEXITY_CATALOG.map(complexitySummary),
  ...PATTERN_CATALOG.flatMap((p) => Array.from({ length: CLOZE_COUNTS[p.id] }, (_, n) => clozeSummary(p.id, n))),
  ...Object.entries(ALGORITHM_PATTERNS).map(([id, patternId]) => predictSummary({ id, patternId })),
  ...DESIGN_ITEM_CATALOG.map(designSummary),
].sort((a, b) => a.order - b.order);

const byId = new Map(REVIEW_CATALOG.map((i) => [i.id, i]));

export function getReviewItemSummary(id: string): ReviewItemSummary | undefined {
  return byId.get(id);
}

export function itemsForTopic(topic: string): ReviewItemSummary[] {
  return REVIEW_CATALOG.filter((i) => i.topic === topic);
}
