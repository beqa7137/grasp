/** A system design case study as lists and route titles see it; its stages live in cases/. */
export interface CaseSummary {
  id: string;
  title: string;
  level: 'core' | 'advanced';
  /** Design review topics the case exercises. */
  topics: readonly string[];
}

export const CASE_CATALOG: readonly CaseSummary[] = [
  { id: 'url-shortener', title: 'URL Shortener', level: 'core', topics: ['sd-estimation', 'sd-caching', 'sd-sharding'] },
  { id: 'rate-limiter', title: 'Rate Limiter', level: 'core', topics: ['sd-rate-limiting', 'sd-estimation', 'sd-reliability'] },
  { id: 'typeahead', title: 'Search Autocomplete', level: 'core', topics: ['sd-caching', 'sd-sharding', 'sd-estimation'] },
  { id: 'news-feed', title: 'News Feed', level: 'core', topics: ['sd-caching', 'sd-queues', 'sd-replication'] },
  { id: 'chat', title: 'Chat App', level: 'core', topics: ['sd-sharding', 'sd-queues', 'sd-reliability'] },
  {
    id: 'notifications',
    title: 'Notification System',
    level: 'advanced',
    topics: ['sd-queues', 'sd-estimation', 'sd-reliability', 'sd-rate-limiting'],
  },
  { id: 'web-crawler', title: 'Web Crawler', level: 'advanced', topics: ['sd-estimation', 'sd-queues', 'sd-sharding'] },
  {
    id: 'video-streaming',
    title: 'Video Streaming',
    level: 'advanced',
    topics: ['sd-caching', 'sd-queues', 'sd-estimation', 'sd-sharding'],
  },
  { id: 'payments', title: 'Payment System', level: 'advanced', topics: ['sd-consistency', 'sd-reliability', 'sd-queues', 'sd-sharding'] },
  { id: 'ride-sharing', title: 'Ride Sharing', level: 'advanced', topics: ['sd-estimation', 'sd-sharding', 'sd-consistency', 'sd-queues'] },
  {
    id: 'distributed-cache',
    title: 'Distributed Cache',
    level: 'core',
    topics: ['sd-caching', 'sd-sharding', 'sd-reliability', 'sd-estimation'],
  },
  {
    id: 'ticketing',
    title: 'Ticket Booking',
    level: 'advanced',
    topics: ['sd-consistency', 'sd-rate-limiting', 'sd-sharding', 'sd-caching'],
  },
  {
    id: 'search-engine',
    title: 'Web Search Engine',
    level: 'advanced',
    topics: ['sd-search', 'sd-sharding', 'sd-caching', 'sd-estimation'],
  },
  {
    id: 'file-sync',
    title: 'File Storage & Sync',
    level: 'advanced',
    topics: ['sd-consistency', 'sd-cdn', 'sd-estimation', 'sd-queues'],
  },
  {
    id: 'leaderboard',
    title: 'Game Leaderboard',
    level: 'core',
    topics: ['sd-caching', 'sd-sharding', 'sd-estimation', 'sd-consistency'],
  },
  {
    id: 'ad-click-aggregator',
    title: 'Ad Click Aggregator',
    level: 'advanced',
    topics: ['sd-streams', 'sd-queues', 'sd-estimation', 'sd-storage'],
  },
  {
    id: 'job-scheduler',
    title: 'Distributed Job Scheduler',
    level: 'advanced',
    topics: ['sd-queues', 'sd-consensus', 'sd-reliability', 'sd-sharding'],
  },
];

export function getCaseSummary(id: string): CaseSummary | undefined {
  return CASE_CATALOG.find((c) => c.id === id);
}
