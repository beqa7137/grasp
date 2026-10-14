import type { Difficulty } from '../algorithms/types.js';
import { PATTERN_CATALOG, PATTERN_TRACKS, type PatternSummary, type Track } from '../curriculum/catalog.js';
import { startHerePattern, type Placement } from '../srs/diagnostic.js';
import type { CodingRecord } from '../srs/progress.js';
import { CODING_CATALOG, problemsForPattern, type CodingProblemSummary } from './catalog.js';

/** A problem's place in the library (REDESIGN.md 2.3): one of three, so the Status facet's counts add up to the catalog. */
export const PROBLEM_STATES = ['unsolved', 'attempted', 'solved'] as const;
export type ProblemState = (typeof PROBLEM_STATES)[number];

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const satisfies readonly Difficulty[];

export function problemState(record: CodingRecord | undefined): ProblemState {
  return record?.solvedAt ? 'solved' : record ? 'attempted' : 'unsolved';
}

/** The library's filters, which live only in the URL (REDESIGN.md 2.5). An empty list means "any". */
export interface LibraryQuery {
  q: string;
  status: readonly ProblemState[];
  difficulty: readonly Difficulty[];
  track: readonly Track[];
  pattern: readonly string[];
}

export const EMPTY_LIBRARY_QUERY: LibraryQuery = { q: '', status: [], difficulty: [], track: [], pattern: [] };

/** The facets that hold lists of values: every filter but the search. */
export type ListFacet = Exclude<keyof LibraryQuery, 'q'>;
const FACET_VALUES: Record<ListFacet, readonly string[]> = {
  status: PROBLEM_STATES,
  difficulty: DIFFICULTIES,
  track: PATTERN_TRACKS.map((t) => t.id),
  pattern: PATTERN_CATALOG.map((p) => p.id),
};
const FACETS = Object.keys(FACET_VALUES) as ListFacet[];

/** Reads the query from URL parameters: comma lists, unknown values dropped, in the catalog's order. */
export function parseLibraryQuery(params: Readonly<Record<string, string | null | undefined>>): LibraryQuery {
  const list = (facet: ListFacet) => {
    const given = new Set((params[facet] ?? '').split(','));
    return FACET_VALUES[facet].filter((v) => given.has(v));
  };
  return {
    q: (params['q'] ?? '').trim(),
    status: list('status') as ProblemState[],
    difficulty: list('difficulty') as Difficulty[],
    track: list('track') as Track[],
    pattern: list('pattern'),
  };
}

/** The URL parameters for a query; an empty filter is null, so the router drops it and an unfiltered list has a bare URL. */
export function libraryQueryParams(query: LibraryQuery): Record<keyof LibraryQuery, string | null> {
  const join = (values: readonly string[]) => (values.length ? values.join(',') : null);
  return {
    q: query.q.trim() || null,
    status: join(query.status),
    difficulty: join(query.difficulty),
    track: join(query.track),
    pattern: join(query.pattern),
  };
}

export const isFiltered = (query: LibraryQuery) => Boolean(query.q) || FACETS.some((f) => query[f].length > 0);

export interface LibraryGroup {
  pattern: PatternSummary;
  /** All of the pattern's member problems and how many are solved, whatever the filters. */
  members: number;
  solved: number;
  rows: CodingProblemSummary[];
}

export interface FacetCounts {
  status: Record<ProblemState, number>;
  difficulty: Record<Difficulty, number>;
  track: Record<Track, number>;
  pattern: Record<string, number>;
}

export interface LibraryResult {
  /** Distinct matching problems, in catalog order. */
  problems: CodingProblemSummary[];
  /** The visible patterns with a match, in roadmap order; a problem shows under each of its patterns. */
  groups: LibraryGroup[];
  /** What each option would show, counted with every other facet's selection but not its own (REDESIGN.md 2.9). */
  counts: FacetCounts;
}

const words = (text: string) => text.toLowerCase().split(/\s+/).filter(Boolean);

function patternsShown(tracks: readonly Track[], patterns: readonly string[]): Set<string> {
  return new Set(
    PATTERN_CATALOG.filter((p) => (!tracks.length || tracks.includes(p.track)) && (!patterns.length || patterns.includes(p.id))).map(
      (p) => p.id,
    ),
  );
}

/**
 * Filters the catalog by membership (REDESIGN.md 4.2): a problem is in every pattern it lists and in each of their tracks,
 * so Graphs & trees holds 51 distinct problems in 57 rows. Track counts are distinct problems; pattern counts are members.
 */
export function queryLibrary(query: LibraryQuery, coding: Readonly<Record<string, CodingRecord>>): LibraryResult {
  const terms = words(query.q);
  const state = (p: CodingProblemSummary) => problemState(coding[p.id]);
  const text = (p: CodingProblemSummary) => {
    const title = p.title.toLowerCase();
    return terms.every((t) => title.includes(t));
  };
  const status = (p: CodingProblemSummary) => !query.status.length || query.status.includes(state(p));
  const difficulty = (p: CodingProblemSummary) => !query.difficulty.length || query.difficulty.includes(p.difficulty);
  const shown = patternsShown(query.track, query.pattern);
  const inShown = (p: CodingProblemSummary, patterns: Set<string>) => p.patternIds.some((id) => patterns.has(id));

  const base = CODING_CATALOG.filter(text);
  const problems = base.filter((p) => status(p) && difficulty(p) && inShown(p, shown));

  const byPattern = base.filter((p) => status(p) && difficulty(p));
  const counts: FacetCounts = {
    status: Object.fromEntries(
      PROBLEM_STATES.map((s) => [s, base.filter((p) => difficulty(p) && inShown(p, shown) && state(p) === s).length]),
    ) as Record<ProblemState, number>,
    difficulty: Object.fromEntries(
      DIFFICULTIES.map((d) => [d, base.filter((p) => status(p) && inShown(p, shown) && p.difficulty === d).length]),
    ) as Record<Difficulty, number>,
    track: Object.fromEntries(
      PATTERN_TRACKS.map((t) => [t.id, byPattern.filter((p) => inShown(p, patternsShown([t.id], query.pattern))).length]),
    ) as Record<Track, number>,
    pattern: Object.fromEntries(
      PATTERN_CATALOG.map((pattern) => {
        const visible = !query.track.length || query.track.includes(pattern.track);
        return [pattern.id, visible ? byPattern.filter((p) => p.patternIds.includes(pattern.id)).length : 0];
      }),
    ),
  };

  const groups = PATTERN_CATALOG.filter((p) => shown.has(p.id))
    .map((pattern) => {
      const members = problemsForPattern(pattern.id);
      return {
        pattern,
        members: members.length,
        solved: members.filter((p) => coding[p.id]?.solvedAt).length,
        rows: problems.filter((p) => p.patternIds.includes(pattern.id)),
      };
    })
    .filter((g) => g.rows.length > 0);

  return { problems, groups, counts };
}

const RANK: Record<Difficulty, number> = { easy: 0, medium: 1, hard: 2 };

/** The Mixed view's order: easiest first, then catalog order. */
export const byDifficulty = (problems: readonly CodingProblemSummary[]) =>
  [...problems].sort((a, b) => RANK[a.difficulty] - RANK[b.difficulty]);

export interface SolvedTally {
  solved: number;
  total: number;
}

/** "23 of 164 solved", and the same per difficulty. */
export function librarySummary(
  coding: Readonly<Record<string, CodingRecord>>,
): SolvedTally & { byDifficulty: Record<Difficulty, SolvedTally> } {
  const tally = (problems: readonly CodingProblemSummary[]) => ({
    solved: problems.filter((p) => coding[p.id]?.solvedAt).length,
    total: problems.length,
  });
  return {
    ...tally(CODING_CATALOG),
    byDifficulty: Object.fromEntries(DIFFICULTIES.map((d) => [d, tally(CODING_CATALOG.filter((p) => p.difficulty === d))])) as Record<
      Difficulty,
      SolvedTally
    >,
  };
}

/**
 * The pattern the library opens on: the primary pattern of the latest problem the learner worked on, else where the
 * placement says to start, else the first pattern of the roadmap.
 */
export function currentPattern(coding: Readonly<Record<string, CodingRecord>>, placement: Readonly<Record<string, Placement>>): string {
  let latest: { id: string; at: string } | null = null;
  for (const [id, record] of Object.entries(coding)) if (!latest || record.lastAt > latest.at) latest = { id, at: record.lastAt };
  const worked = latest && CODING_CATALOG.find((p) => p.id === latest.id)?.patternIds[0];
  return worked ?? startHerePattern(placement) ?? PATTERN_CATALOG[0].id;
}
