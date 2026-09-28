/** A system design case study as lists and route titles see it; its stages live in cases/. */
export interface CaseSummary {
  id: string;
  title: string;
  /** The question as an interviewer would pose it. */
  question: string;
  summary: string;
  level: 'core' | 'advanced';
  /** Design review topics the case exercises. */
  topics: readonly string[];
}

export const CASE_CATALOG: readonly CaseSummary[] = [
  {
    id: 'url-shortener',
    title: 'URL Shortener',
    question: 'Design a service like bit.ly that turns long links into short ones and redirects visitors.',
    summary: 'A read-heavy key lookup: key generation, redirect semantics, caching and sharding by key.',
    level: 'core',
    topics: ['sd-estimation', 'sd-caching', 'sd-sharding'],
  },
  {
    id: 'news-feed',
    title: 'News Feed',
    question: 'Design the home timeline of a social network: people follow others and see their recent posts.',
    summary: 'Fan-out on write versus read, the celebrity problem, timeline caches and cursor pagination.',
    level: 'core',
    topics: ['sd-caching', 'sd-queues', 'sd-replication'],
  },
];

export function getCaseSummary(id: string): CaseSummary | undefined {
  return CASE_CATALOG.find((c) => c.id === id);
}
