import { SEARCH_KIND_NAMES, type SearchKind } from '@grasp/engine';

/** "See all 23 problems →". */
export const seeAll = (kind: SearchKind, total: number) => `See all ${total} ${SEARCH_KIND_NAMES[kind][1].toLowerCase()} →`;

/** The search page (REDESIGN.md 4.10) with this query, filtered to one kind when given. */
export const searchPageUrl = (q: string, kind?: SearchKind) =>
  `/today/search?q=${encodeURIComponent(q.trim())}${kind ? `&kind=${kind}` : ''}`;
