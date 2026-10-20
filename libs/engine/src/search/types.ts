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
  'page',
] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

/** A result's group: its interview round, or "Around the app" for the app's own pages that belong to none. */
export type SearchRound = PlanRound | 'app';

/** The generated part of the index: what search needs from modules that do not load with first paint. */
export interface SearchData {
  problem: readonly (readonly [id: string, title: string, difficulty: Difficulty])[];
  caseSummary: readonly (readonly [id: string, summary: string])[];
}

/**
 * One searchable item: its id, title and short blurb, then the ids it is tagged with and the other names it is searched by.
 * Tags name patterns (problems, visualizers), topics (missions, cases), a competency (questions) or a track (patterns); a
 * mock round's one tag is its track, and a page's its round. A page's id is its path.
 */
export type SearchRow = readonly [id: string, title: string, blurb: string, tags?: readonly string[], aliases?: readonly string[]];

export type SearchIndex = Readonly<Record<SearchKind, readonly SearchRow[]>>;

export interface SearchResult {
  kind: SearchKind;
  id: string;
  title: string;
  /** What the result shows under its title. Never a problem's patterns, which would spoil the recognition step (2.9). */
  meta: string;
  round: SearchRound;
  score: number;
}

export interface SearchKindGroup {
  kind: SearchKind;
  /** The best hits, at most the group limit. */
  hits: readonly SearchResult[];
  total: number;
}

export interface SearchGroup {
  round: SearchRound;
  kinds: readonly SearchKindGroup[];
}
