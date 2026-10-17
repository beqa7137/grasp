import type { Difficulty } from '../algorithms/types.js';
import type { PlanRound } from '../plan/options.js';

/** What search finds, in the order a tie between equal scores is broken. Stories are searched on the device, never indexed. */
export const SEARCH_KINDS = [
  'pattern',
  'visualizer',
  'problem',
  'topic',
  'mission',
  'case',
  'mock',
  'competency',
  'question',
  'story',
] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

/** The generated part of the index: what search needs from modules that do not load with first paint. */
export interface SearchData {
  problem: readonly (readonly [id: string, title: string, difficulty: Difficulty])[];
  caseSummary: readonly (readonly [id: string, summary: string])[];
}

/**
 * One searchable item: its id, title and short blurb, then the ids it is tagged with and the other names it is searched by.
 * Tags name patterns (problems, visualizers), topics (missions, cases) or a competency (questions); a mock round's one tag
 * is its track.
 */
export type SearchRow = readonly [id: string, title: string, blurb: string, tags?: readonly string[], aliases?: readonly string[]];

export type SearchIndex = Readonly<Record<SearchKind, readonly SearchRow[]>>;

export interface SearchResult {
  kind: SearchKind;
  id: string;
  title: string;
  /** What the result shows under its title. Never a problem's patterns, which would spoil the recognition step (2.9). */
  meta: string;
  round: PlanRound;
  score: number;
}

export interface SearchKindGroup {
  kind: SearchKind;
  /** The best hits, at most the group limit. */
  hits: readonly SearchResult[];
  total: number;
}

export interface SearchGroup {
  round: PlanRound;
  kinds: readonly SearchKindGroup[];
}
