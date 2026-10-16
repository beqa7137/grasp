/**
 * The Design hub's six shelves, each listing its topics core first (a topic's level is `SdTopic.level`). Kept apart from
 * SD_TOPICS, which first paint loads, since only the hub and the case library read the shelves.
 */
export const SD_SHELVES = [
  {
    id: 'foundations',
    name: 'Foundations',
    topics: ['sd-estimation', 'sd-latency', 'sd-capacity', 'sd-load-balancing', 'sd-reliability'],
  },
  {
    id: 'data',
    name: 'Data',
    topics: [
      'sd-data-modeling',
      'sd-replication',
      'sd-sharding',
      'sd-consistency',
      'sd-ids',
      'sd-storage',
      'sd-durability',
      'sd-recovery',
      'sd-multi-region',
    ],
  },
  { id: 'reads', name: 'Reads at scale', topics: ['sd-caching', 'sd-cdn', 'sd-search', 'sd-geo'] },
  { id: 'async', name: 'Async & delivery', topics: ['sd-queues', 'sd-overload', 'sd-realtime', 'sd-streams', 'sd-batch'] },
  { id: 'coordination', name: 'Coordination', topics: ['sd-consensus', 'sd-locks', 'sd-transactions', 'sd-clocks', 'sd-discovery'] },
  {
    id: 'edge',
    name: 'Edge & operations',
    topics: ['sd-api-design', 'sd-rate-limiting', 'sd-gateway', 'sd-security', 'sd-tenancy', 'sd-observability'],
  },
] as const satisfies readonly { id: string; name: string; topics: readonly string[] }[];

export type SdShelf = (typeof SD_SHELVES)[number]['id'];

export function sdTopicShelf(topicId: string): SdShelf | undefined {
  return SD_SHELVES.find((s) => (s.topics as readonly string[]).includes(topicId))?.id;
}
