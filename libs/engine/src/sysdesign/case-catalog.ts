/** A system design case study as lists and route titles see it; its stages live in cases/. */
export interface CaseSummary {
  id: string;
  title: string;
  level: 'core' | 'advanced';
  /** Design review topics the case exercises. */
  topics: readonly string[];
  /** How many stages the case walks through, so lists can show progress without loading the stages. */
  stages: number;
}

export const CASE_CATALOG: readonly CaseSummary[] = [
  { id: 'url-shortener', title: 'URL Shortener', level: 'core', stages: 9, topics: ['sd-estimation', 'sd-caching', 'sd-sharding'] },
  { id: 'rate-limiter', title: 'Rate Limiter', level: 'core', stages: 10, topics: ['sd-rate-limiting', 'sd-estimation', 'sd-reliability'] },
  { id: 'typeahead', title: 'Search Autocomplete', level: 'core', stages: 9, topics: ['sd-caching', 'sd-sharding', 'sd-estimation'] },
  { id: 'news-feed', title: 'News Feed', level: 'core', stages: 8, topics: ['sd-caching', 'sd-queues', 'sd-replication'] },
  { id: 'chat', title: 'Chat App', level: 'core', stages: 10, topics: ['sd-sharding', 'sd-queues', 'sd-reliability'] },
  {
    id: 'notifications',
    title: 'Notification System',
    level: 'advanced',
    stages: 10,
    topics: ['sd-queues', 'sd-estimation', 'sd-reliability', 'sd-rate-limiting'],
  },
  { id: 'web-crawler', title: 'Web Crawler', level: 'advanced', stages: 9, topics: ['sd-estimation', 'sd-queues', 'sd-sharding'] },
  {
    id: 'video-streaming',
    title: 'Video Streaming',
    level: 'advanced',
    stages: 10,
    topics: ['sd-caching', 'sd-queues', 'sd-estimation', 'sd-sharding'],
  },
  {
    id: 'payments',
    title: 'Payment System',
    level: 'advanced',
    stages: 10,
    topics: ['sd-consistency', 'sd-reliability', 'sd-queues', 'sd-sharding'],
  },
  {
    id: 'payment-ledger',
    title: 'Payment Ledger',
    level: 'advanced',
    stages: 13,
    topics: ['sd-transactions', 'sd-locks', 'sd-sharding', 'sd-api-design'],
  },
  {
    id: 'ride-sharing',
    title: 'Ride Sharing',
    level: 'advanced',
    stages: 10,
    topics: ['sd-estimation', 'sd-sharding', 'sd-consistency', 'sd-queues'],
  },
  {
    id: 'distributed-cache',
    title: 'Distributed Cache',
    level: 'core',
    stages: 10,
    topics: ['sd-caching', 'sd-sharding', 'sd-reliability', 'sd-estimation'],
  },
  {
    id: 'ticketing',
    title: 'Ticket Booking',
    level: 'advanced',
    stages: 10,
    topics: ['sd-consistency', 'sd-rate-limiting', 'sd-sharding', 'sd-caching'],
  },
  {
    id: 'search-engine',
    title: 'Web Search Engine',
    level: 'advanced',
    stages: 9,
    topics: ['sd-search', 'sd-sharding', 'sd-caching', 'sd-estimation'],
  },
  {
    id: 'file-sync',
    title: 'File Storage & Sync',
    level: 'advanced',
    stages: 8,
    topics: ['sd-consistency', 'sd-cdn', 'sd-estimation', 'sd-queues'],
  },
  {
    id: 'leaderboard',
    title: 'Game Leaderboard',
    level: 'core',
    stages: 8,
    topics: ['sd-caching', 'sd-sharding', 'sd-estimation', 'sd-consistency'],
  },
  {
    id: 'ad-click-aggregator',
    title: 'Ad Click Aggregator',
    level: 'advanced',
    stages: 8,
    topics: ['sd-streams', 'sd-queues', 'sd-estimation', 'sd-storage'],
  },
  {
    id: 'job-scheduler',
    title: 'Distributed Job Scheduler',
    level: 'advanced',
    stages: 8,
    topics: ['sd-queues', 'sd-consensus', 'sd-reliability', 'sd-sharding'],
  },
  {
    id: 'collaborative-editor',
    title: 'Collaborative Editor',
    level: 'advanced',
    stages: 8,
    topics: ['sd-consistency', 'sd-queues', 'sd-sharding', 'sd-multi-region'],
  },
  {
    id: 'metrics-monitoring',
    title: 'Metrics & Alerting',
    level: 'advanced',
    stages: 8,
    topics: ['sd-observability', 'sd-storage', 'sd-streams', 'sd-estimation'],
  },
  {
    id: 'hotel-booking',
    title: 'Hotel Booking',
    level: 'core',
    stages: 8,
    topics: ['sd-consistency', 'sd-caching', 'sd-sharding', 'sd-estimation'],
  },
  {
    id: 'stock-exchange',
    title: 'Stock Exchange',
    level: 'advanced',
    stages: 8,
    topics: ['sd-latency', 'sd-reliability', 'sd-consensus', 'sd-queues'],
  },
  {
    id: 'message-queue',
    title: 'Distributed Message Queue',
    level: 'advanced',
    stages: 8,
    topics: ['sd-queues', 'sd-replication', 'sd-storage', 'sd-consensus'],
  },
  {
    id: 'feature-flags',
    title: 'Feature Flag Service',
    level: 'advanced',
    stages: 14,
    topics: ['sd-realtime', 'sd-consistency', 'sd-reliability', 'sd-cdn'],
  },
];

export function getCaseSummary(id: string): CaseSummary | undefined {
  return CASE_CATALOG.find((c) => c.id === id);
}
