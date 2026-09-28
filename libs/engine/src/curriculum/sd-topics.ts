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
];

export function getSdTopic(id: string): SdTopic | undefined {
  return SD_TOPICS.find((t) => t.id === id);
}
