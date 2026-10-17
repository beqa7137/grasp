import type { InterviewTrack } from '../interview/rubrics.js';

/** What search finds, in the order a tie between equal scores is broken. Stories are searched on the device, never indexed. */
export const SEARCH_KINDS = ['pattern', 'visualizer', 'problem', 'topic', 'mission', 'case', 'mock', 'competency', 'question', 'story'] as const;
export type SearchKind = (typeof SEARCH_KINDS)[number];

/** The kinds the generated index holds: questions come from the prompts file, stories from the device. */
export type IndexedKind = Exclude<SearchKind, 'question' | 'story'>;

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
  round: InterviewTrack;
  score: number;
}

export interface SearchKindGroup {
  kind: SearchKind;
  /** The best hits, at most the group limit. */
  hits: readonly SearchResult[];
  total: number;
}

export interface SearchGroup {
  round: InterviewTrack;
  kinds: readonly SearchKindGroup[];
}
