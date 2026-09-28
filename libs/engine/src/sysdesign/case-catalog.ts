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
    id: 'rate-limiter',
    title: 'Rate Limiter',
    question: 'Design a distributed rate limiter for a public API that enforces per API key and per IP limits across many servers.',
    summary: 'Token buckets in shared Redis, atomic Lua checks, where limits run, multi-region and failure modes.',
    level: 'core',
    topics: ['sd-rate-limiting', 'sd-estimation', 'sd-reliability'],
  },
  {
    id: 'typeahead',
    title: 'Search Autocomplete',
    question: 'Design the suggestions that appear as someone types in a search box, for a large search engine.',
    summary: 'Top-k per prefix precomputed offline, served from memory and CDN caches, with trending and filtering.',
    level: 'core',
    topics: ['sd-caching', 'sd-sharding', 'sd-estimation'],
  },
  {
    id: 'news-feed',
    title: 'News Feed',
    question: 'Design the home timeline of a social network: people follow others and see their recent posts.',
    summary: 'Fan-out on write versus read, the celebrity problem, timeline caches and cursor pagination.',
    level: 'core',
    topics: ['sd-caching', 'sd-queues', 'sd-replication'],
  },
  {
    id: 'chat',
    title: 'Chat App',
    question: 'Design a messaging app like WhatsApp or Messenger with one-to-one and small group chats.',
    summary: 'Persistent connections, a session registry, per-conversation ordering, offline delivery and presence.',
    level: 'core',
    topics: ['sd-sharding', 'sd-queues', 'sd-reliability'],
  },
  {
    id: 'notifications',
    title: 'Notification System',
    question: 'Design a service that sends push, email and SMS notifications for many product teams, including large marketing campaigns.',
    summary: 'Priority queues per channel, provider rate limits, retries and idempotent at-least-once delivery.',
    level: 'advanced',
    topics: ['sd-queues', 'sd-estimation', 'sd-reliability', 'sd-rate-limiting'],
  },
  {
    id: 'web-crawler',
    title: 'Web Crawler',
    question: 'Design a crawler that fetches a billion pages a month for a search engine.',
    summary: 'A polite URL frontier, DNS, a seen-URL set, SimHash dedup, recrawl scheduling and crawler traps.',
    level: 'advanced',
    topics: ['sd-estimation', 'sd-queues', 'sd-sharding'],
  },
];

export function getCaseSummary(id: string): CaseSummary | undefined {
  return CASE_CATALOG.find((c) => c.id === id);
}
