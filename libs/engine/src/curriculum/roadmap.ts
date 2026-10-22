import { ALGORITHM_CATALOG, type AlgorithmId, type AlgorithmSummary } from '../algorithms/catalog.js';
import { PATTERN_CATALOG, type PatternSummary } from './catalog.js';

const ORDER = new Map<string, number>(PATTERN_CATALOG.map((p) => [p.id, p.order]));

/** A pattern's place in the roadmap: its neighbors within its track, and the pattern after it across tracks. */
export interface PatternNeighbours {
  previous: PatternSummary | null;
  next: PatternSummary | null;
  following: PatternSummary | null;
}

export function patternNeighbours(id: string): PatternNeighbours {
  const at = PATTERN_CATALOG.findIndex((p) => p.id === id);
  const pattern = PATTERN_CATALOG[at];
  const near = (offset: number) => {
    const other = PATTERN_CATALOG[at + offset];
    return other && other.track === pattern.track ? other : null;
  };
  if (!pattern) return { previous: null, next: null, following: null };
  return { previous: near(-1), next: near(1), following: PATTERN_CATALOG[at + 1] ?? null };
}

/** The visualizers in roadmap order: by their pattern's place in the tracks (REDESIGN.md 2.8). */
export const VISUALIZERS_IN_ORDER: readonly AlgorithmSummary<AlgorithmId>[] = [...ALGORITHM_CATALOG].sort(
  (a, b) => ORDER.get(a.patternId)! - ORDER.get(b.patternId)!,
);

/** The visualizer after this one in roadmap order, or null after the last. */
export function nextVisualizer(id: string): AlgorithmSummary<AlgorithmId> | null {
  const at = VISUALIZERS_IN_ORDER.findIndex((a) => a.id === id);
  return at < 0 ? null : (VISUALIZERS_IN_ORDER[at + 1] ?? null);
}
