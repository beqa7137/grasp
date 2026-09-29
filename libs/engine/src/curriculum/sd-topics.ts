export interface SdTopic {
  id: string;
  name: string;
  oneLiner: string;
  /** Completing any of these missions unlocks the topic's review items. */
  scenarioIds: string[];
}

export const SD_TOPICS: SdTopic[] = [
  { id: 'sd-latency', name: 'Latency & Queueing', oneLiner: 'Why p99 explodes near 100% utilization.', scenarioIds: ['first-scale-up'] },
  {
    id: 'sd-capacity',
    name: 'Capacity & Scaling',
    oneLiner: 'Finding the bottleneck and scaling past it.',
    scenarioIds: ['first-scale-up'],
  },
  { id: 'sd-estimation', name: 'Estimation', oneLiner: 'Back-of-envelope QPS, storage and bandwidth.', scenarioIds: ['first-scale-up'] },
  { id: 'sd-reliability', name: 'Reliability', oneLiner: 'Redundancy, failover and availability math.', scenarioIds: ['first-scale-up'] },
  { id: 'sd-caching', name: 'Caching & CDNs', oneLiner: 'Hit rates, tail latency and what to cache where.', scenarioIds: ['viral-feed'] },
  {
    id: 'sd-replication',
    name: 'Replication & Databases',
    oneLiner: "What replicas fix, and what they don't.",
    scenarioIds: ['viral-feed'],
  },
  { id: 'sd-queues', name: 'Queues & Async Work', oneLiner: 'Absorbing spikes and sizing consumers.', scenarioIds: ['flash-sale'] },
  {
    id: 'sd-rate-limiting',
    name: 'Rate Limiting & Abuse',
    oneLiner: 'Token buckets, shared counters and shedding load at the edge.',
    scenarioIds: ['bot-storm'],
  },
  {
    id: 'sd-sharding',
    name: 'Sharding & Partitioning',
    oneLiner: 'Scaling writes, choosing a shard key and avoiding hot shards.',
    scenarioIds: ['write-wall'],
  },
  {
    id: 'sd-consistency',
    name: 'Consistency & Quorums',
    oneLiner: 'Which reads can be stale, and what a quorum guarantees.',
    scenarioIds: ['viral-feed'],
  },
  {
    id: 'sd-consensus',
    name: 'Consensus & Leaders',
    oneLiner: 'Majorities, leader election and surviving a split brain.',
    scenarioIds: ['first-scale-up'],
  },
  { id: 'sd-ids', name: 'Unique IDs', oneLiner: 'Generating ids at scale without a central counter.', scenarioIds: ['write-wall'] },
  {
    id: 'sd-search',
    name: 'Search & Indexing',
    oneLiner: 'Inverted indexes, ranking and keeping an index fresh.',
    scenarioIds: ['viral-feed'],
  },
  {
    id: 'sd-streams',
    name: 'Stream Processing',
    oneLiner: 'Windows, watermarks and late events at scale.',
    scenarioIds: ['flash-sale'],
  },
  {
    id: 'sd-storage',
    name: 'Storage Engines',
    oneLiner: 'B-trees, LSM trees and what each costs on disk.',
    scenarioIds: ['write-wall'],
  },
  {
    id: 'sd-cdn',
    name: 'CDNs & Edge',
    oneLiner: 'Edge locations, origin shields, TTLs and purges.',
    scenarioIds: ['viral-feed'],
  },
  {
    id: 'sd-multi-region',
    name: 'Multi-Region',
    oneLiner: 'Serving users across regions and surviving the loss of one.',
    scenarioIds: ['viral-feed'],
  },
  {
    id: 'sd-observability',
    name: 'Observability & SLOs',
    oneLiner: 'Metrics, logs, traces, error budgets and alerts that matter.',
    scenarioIds: ['first-scale-up'],
  },
  {
    id: 'sd-api-design',
    name: 'API Design',
    oneLiner: 'Pagination, idempotent retries, errors and versioning.',
    scenarioIds: ['first-scale-up'],
  },
  {
    id: 'sd-security',
    name: 'Security & Auth',
    oneLiner: 'Password hashing, sessions and tokens, and least privilege.',
    scenarioIds: ['bot-storm'],
  },
  {
    id: 'sd-transactions',
    name: 'Distributed Transactions',
    oneLiner: 'Two-phase commit, sagas and the transactional outbox.',
    scenarioIds: ['flash-sale'],
  },
  {
    id: 'sd-batch',
    name: 'Batch Processing',
    oneLiner: 'Map, shuffle and reduce, skew, and pipelines that rerun safely.',
    scenarioIds: ['write-wall'],
  },
  {
    id: 'sd-geo',
    name: 'Geospatial Indexing',
    oneLiner: 'Geohashes, quadtrees and finding what is nearby.',
    scenarioIds: ['viral-feed'],
  },
  {
    id: 'sd-realtime',
    name: 'Real-Time Delivery',
    oneLiner: 'Polling, long polling, server-sent events and WebSockets.',
    scenarioIds: ['viral-feed'],
  },
  {
    id: 'sd-data-modeling',
    name: 'Data Modeling',
    oneLiner: 'Modeling from access patterns: normalize, denormalize, and what each costs.',
    scenarioIds: ['viral-feed'],
  },
  {
    id: 'sd-overload',
    name: 'Backpressure & Load Shedding',
    oneLiner: 'Bounded queues, deadlines and retries when traffic outruns capacity.',
    scenarioIds: ['flash-sale'],
  },
];

export function getSdTopic(id: string): SdTopic | undefined {
  return SD_TOPICS.find((t) => t.id === id);
}
