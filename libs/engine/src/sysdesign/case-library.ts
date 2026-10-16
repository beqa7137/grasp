import { SD_SHELVES, sdTopicShelf, type SdShelf } from '../curriculum/sd-shelves.js';
import { SD_TOPICS } from '../curriculum/sd-topics.js';
import { CASE_CATALOG, type CaseSummary } from './case-catalog.js';
import { paramText, paramValues, type UrlParams } from '../url-params.js';

/** A case study's place in the library: stages in progress live on the device, a finish in the progress log. */
export const CASE_STATES = ['new', 'started', 'finished'] as const;
export type CaseState = (typeof CASE_STATES)[number];

export const CASE_LEVELS = ['core', 'advanced'] as const satisfies readonly CaseSummary['level'][];

/** The Cases library's filters, which live only in the URL (REDESIGN.md 2.5, 4.5). An empty list means "any". */
export interface CaseQuery {
  q: string;
  level: readonly CaseSummary['level'][];
  status: readonly CaseState[];
  shelf: readonly SdShelf[];
  topic: readonly string[];
}

export const EMPTY_CASE_QUERY: CaseQuery = { q: '', level: [], status: [], shelf: [], topic: [] };

export type CaseFacet = Exclude<keyof CaseQuery, 'q'>;
const FACET_VALUES: Record<CaseFacet, readonly string[]> = {
  level: CASE_LEVELS,
  status: CASE_STATES,
  shelf: SD_SHELVES.map((s) => s.id),
  topic: SD_TOPICS.map((t) => t.id),
};
export const CASE_FACETS = Object.keys(FACET_VALUES) as CaseFacet[];

/** Reads the query from URL parameters: comma lists, unknown values dropped, in catalog order. */
export function parseCaseQuery(params: UrlParams): CaseQuery {
  const list = (facet: CaseFacet) => {
    const given = paramValues(params, facet);
    return FACET_VALUES[facet].filter((v) => given.has(v));
  };
  return {
    q: paramText(params, 'q', ' ').trim(),
    level: list('level') as CaseSummary['level'][],
    status: list('status') as CaseState[],
    shelf: list('shelf') as SdShelf[],
    topic: list('topic'),
  };
}

/** The URL parameters for a query; an empty filter is null, so an unfiltered library has a bare URL. */
export function caseQueryParams(query: CaseQuery): Record<keyof CaseQuery, string | null> {
  const join = (values: readonly string[]) => (values.length ? values.join(',') : null);
  return {
    q: query.q.trim() || null,
    level: join(query.level),
    status: join(query.status),
    shelf: join(query.shelf),
    topic: join(query.topic),
  };
}

export const isCaseQueryFiltered = (query: CaseQuery) => Boolean(query.q) || CASE_FACETS.some((f) => query[f].length > 0);

export interface CaseLibraryResult {
  cases: CaseSummary[];
  /** What each option would show, counted with every other facet's selection but not its own (REDESIGN.md 2.9). */
  counts: Record<CaseFacet, Record<string, number>>;
}

const MATCHES: Record<CaseFacet, (c: CaseSummary, values: readonly string[], state: CaseState) => boolean> = {
  level: (c, values) => values.includes(c.level),
  status: (_, values, state) => values.includes(state),
  shelf: (c, values) => c.topics.some((t) => values.includes(sdTopicShelf(t) ?? '')),
  topic: (c, values) => c.topics.some((t) => values.includes(t)),
};

/** Filters the case catalog. A case is on a shelf when any of its topics is; several values of one facet widen it. */
export function queryCases(query: CaseQuery, stateOf: (id: string) => CaseState): CaseLibraryResult {
  const terms = query.q.toLowerCase().split(/\s+/).filter(Boolean);
  const base = CASE_CATALOG.filter((c) => terms.every((t) => c.title.toLowerCase().includes(t)));
  const keeps = (c: CaseSummary, except?: CaseFacet) =>
    CASE_FACETS.every((f) => f === except || !query[f].length || MATCHES[f](c, query[f], stateOf(c.id)));
  const counts = Object.fromEntries(
    CASE_FACETS.map((f) => {
      const pool = base.filter((c) => keeps(c, f));
      return [f, Object.fromEntries(FACET_VALUES[f].map((v) => [v, pool.filter((c) => MATCHES[f](c, [v], stateOf(c.id))).length]))];
    }),
  ) as CaseLibraryResult['counts'];
  return { cases: base.filter((c) => keeps(c)), counts };
}
