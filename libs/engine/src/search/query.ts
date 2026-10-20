import { paramText, paramValues, type UrlParams } from '../url-params.js';
import { SEARCH_KINDS, type SearchKind } from './types.js';

/** The search page's state, which lives only in its URL (REDESIGN.md 2.5, 4.10): `?q=rate&kind=case`. */
export interface SearchQuery {
  q: string;
  /** The kinds to show in full; none shows every kind, a few of each. */
  kind: readonly SearchKind[];
}

export const EMPTY_SEARCH_QUERY: SearchQuery = { q: '', kind: [] };

export function parseSearchQuery(params: UrlParams): SearchQuery {
  const given = paramValues(params, 'kind');
  return { q: paramText(params, 'q', ' ').trim(), kind: SEARCH_KINDS.filter((k) => given.has(k)) };
}

export function searchQueryParams(query: SearchQuery): Record<keyof SearchQuery, string | null> {
  return { q: query.q.trim() || null, kind: query.kind.length ? query.kind.join(',') : null };
}
