export interface SdTopic {
  id: string;
  name: string;
  oneLiner: string;
  /** Completing any of these missions, or finishing a case study tagged with the topic, unlocks its review items. */
  scenarioIds: string[];
  /** Core topics are required from Mid-level; advanced ones are Stretch there and required at Senior. */
  level: 'core' | 'advanced';
}

export const SD_TOPICS: SdTopic[] = [
  {
    id: 'sd-latency',
    name: 'Latency & Queueing',
    oneLiner: 'Why p99 explodes near 100% utilization.',
    scenarioIds: ['first-scale-up'],
    level: 'core',
  },
  {
    id: 'sd-capacity',
    name: 'Capacity & Scaling',
    oneLiner: 'Finding the bottleneck and scaling past it.',
    scenarioIds: ['first-scale-up', 'leaderboard-budget'],
    level: 'core',
  },
  {
    id: 'sd-estimation',
    name: 'Estimation',
    oneLiner: 'Back-of-envelope QPS, storage and bandwidth.',
    scenarioIds: ['first-scale-up', 'leaderboard-budget'],
    level: 'core',
  },
  {
    id: 'sd-reliability',
    name: 'Reliability',
    oneLiner: 'Redundancy, failover and availability math.',
    scenarioIds: ['first-scale-up'],
    level: 'core',
  },
  {
    id: 'sd-caching',
    name: 'Caching',
    oneLiner: 'Hit rates, tail latency and what to cache where.',
    scenarioIds: ['viral-feed'],
    level: 'core',
  },
  {
    id: 'sd-replication',
    name: 'Replication',
    oneLiner: "What replicas fix, and what they don't.",
    scenarioIds: ['viral-feed'],
    level: 'core',
  },
  {
    id: 'sd-queues',
    name: 'Queues & Async Work',
    oneLiner: 'Absorbing spikes and sizing consumers.',
    scenarioIds: ['flash-sale', 'reconnect-storm'],
    level: 'core',
  },
  {
    id: 'sd-rate-limiting',
    name: 'Rate Limiting & Abuse',
    oneLiner: 'Token buckets, shared counters and shedding load at the edge.',
    scenarioIds: ['bot-storm'],
    level: 'core',
  },
  {
    id: 'sd-sharding',
    name: 'Sharding & Partitioning',
    oneLiner: 'Scaling writes, choosing a shard key and avoiding hot shards.',
    scenarioIds: ['write-wall', 'ledger-month-end'],
    level: 'core',
  },
  {
    id: 'sd-consistency',
    name: 'Consistency & Quorums',
    oneLiner: 'Which reads can be stale, and what a quorum guarantees.',
    scenarioIds: ['viral-feed'],
    level: 'core',
  },
  {
    id: 'sd-consensus',
    name: 'Consensus & Leaders',
    oneLiner: 'Majorities, leader election and surviving a split brain.',
    scenarioIds: ['ledger-month-end'],
    level: 'advanced',
  },
  {
    id: 'sd-ids',
    name: 'Unique IDs',
    oneLiner: 'Generating ids at scale without a central counter.',
    scenarioIds: ['write-wall'],
    level: 'core',
  },
  {
    id: 'sd-search',
    name: 'Search & Indexing',
    oneLiner: 'Inverted indexes, ranking and keeping an index fresh.',
    scenarioIds: ['viral-feed'],
    level: 'advanced',
  },
  {
    id: 'sd-streams',
    name: 'Stream Processing',
    oneLiner: 'Windows, watermarks and late events at scale.',
    scenarioIds: ['flash-sale'],
    level: 'advanced',
  },
  {
    id: 'sd-storage',
    name: 'Storage Engines',
    oneLiner: 'B-trees, LSM trees and what each costs on disk.',
    scenarioIds: ['write-wall'],
    level: 'advanced',
  },
  {
    id: 'sd-cdn',
    name: 'CDNs & Edge',
    oneLiner: 'Edge locations, origin shields, TTLs and purges.',
    scenarioIds: ['viral-feed'],
    level: 'core',
  },
  {
    id: 'sd-multi-region',
    name: 'Multi-Region',
    oneLiner: 'Serving users across regions and surviving the loss of one.',
    scenarioIds: ['viral-feed'],
    level: 'advanced',
  },
  {
    id: 'sd-observability',
    name: 'Observability & SLOs',
    oneLiner: 'Metrics, logs, traces, error budgets and alerts that matter.',
    scenarioIds: ['first-scale-up'],
    level: 'advanced',
  },
  {
    id: 'sd-api-design',
    name: 'API Design',
    oneLiner: 'Pagination, idempotent retries, errors and versioning.',
    scenarioIds: ['first-scale-up'],
    level: 'core',
  },
  {
    id: 'sd-security',
    name: 'Security & Auth',
    oneLiner: 'Password hashing, sessions and tokens, and least privilege.',
    scenarioIds: ['bot-storm'],
    level: 'advanced',
  },
  {
    id: 'sd-transactions',
    name: 'Distributed Transactions',
    oneLiner: 'Two-phase commit, sagas and the transactional outbox.',
    scenarioIds: ['flash-sale', 'ledger-month-end'],
    level: 'advanced',
  },
  {
    id: 'sd-batch',
    name: 'Batch Processing',
    oneLiner: 'Map, shuffle and reduce, skew, and pipelines that rerun safely.',
    scenarioIds: ['write-wall'],
    level: 'advanced',
  },
  {
    id: 'sd-geo',
    name: 'Geospatial Indexing',
    oneLiner: 'Geohashes, quadtrees and finding what is nearby.',
    scenarioIds: ['viral-feed'],
    level: 'advanced',
  },
  {
    id: 'sd-realtime',
    name: 'Real-Time Delivery',
    oneLiner: 'Polling, long polling, server-sent events and WebSockets.',
    scenarioIds: ['viral-feed'],
    level: 'core',
  },
  {
    id: 'sd-data-modeling',
    name: 'Data Modeling',
    oneLiner: 'Modeling from access patterns: normalize, denormalize, and what each costs.',
    scenarioIds: ['viral-feed', 'mail-attachments'],
    level: 'core',
  },
  {
    id: 'sd-overload',
    name: 'Backpressure & Load Shedding',
    oneLiner: 'Bounded queues, deadlines and retries when traffic outruns capacity.',
    scenarioIds: ['flash-sale', 'reconnect-storm'],
    level: 'core',
  },
  {
    id: 'sd-locks',
    name: 'Distributed Locks & Leases',
    oneLiner: 'Leases, fencing tokens, and why a paused client can hold a lock it lost.',
    scenarioIds: ['flash-sale', 'ledger-month-end'],
    level: 'advanced',
  },
  {
    id: 'sd-load-balancing',
    name: 'Load Balancing',
    oneLiner: 'Round-robin, least connections, two random choices, and what a slow server does to each.',
    scenarioIds: ['first-scale-up'],
    level: 'core',
  },
  {
    id: 'sd-clocks',
    name: 'Time & Clocks',
    oneLiner: 'Clock skew, last write wins, and logical clocks that keep cause before effect.',
    scenarioIds: ['write-wall'],
    level: 'advanced',
  },
  {
    id: 'sd-discovery',
    name: 'Service Discovery',
    oneLiner: 'DNS, registries and health checks: how fast traffic leaves a dead instance.',
    scenarioIds: ['first-scale-up', 'reconnect-storm'],
    level: 'advanced',
  },
  {
    id: 'sd-durability',
    name: 'Durability & Erasure Coding',
    oneLiner: 'Replicas or erasure codes: nines of durability, storage overhead and repair traffic.',
    scenarioIds: ['write-wall', 'mail-attachments'],
    level: 'advanced',
  },
  {
    id: 'sd-recovery',
    name: 'Backups & Disaster Recovery',
    oneLiner: 'RPO and RTO: backups, point-in-time recovery and standbys, and what each survives.',
    scenarioIds: ['write-wall'],
    level: 'advanced',
  },
  {
    id: 'sd-tenancy',
    name: 'Multi-Tenancy',
    oneLiner: 'Noisy neighbors, quotas and fair sharing: keeping one tenant from sinking the rest.',
    scenarioIds: ['bot-storm'],
    level: 'advanced',
  },
  {
    id: 'sd-gateway',
    name: 'API Gateways & Service Meshes',
    oneLiner: 'What the edge and the mesh do for every request, and what each costs.',
    scenarioIds: ['bot-storm'],
    level: 'advanced',
  },
];

export function getSdTopic(id: string): SdTopic | undefined {
  return SD_TOPICS.find((t) => t.id === id);
}
