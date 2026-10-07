/**
 * The Design hub's six shelves, and which of each shelf's topics are core (required at Mid-level) or advanced (Stretch
 * there, required at Senior). Kept apart from SD_TOPICS, which first paint loads, since only the hub and readiness read it.
 */
export const SD_SHELVES = [
  {
    id: 'foundations',
    name: 'Foundations',
    core: ['sd-estimation', 'sd-latency', 'sd-capacity', 'sd-load-balancing', 'sd-reliability'],
    advanced: [],
  },
  {
    id: 'data',
    name: 'Data',
    core: ['sd-data-modeling', 'sd-replication', 'sd-sharding', 'sd-consistency', 'sd-ids'],
    advanced: ['sd-storage', 'sd-durability', 'sd-recovery', 'sd-multi-region'],
  },
  {
    id: 'reads',
    name: 'Reads at scale',
    core: ['sd-caching', 'sd-cdn'],
    advanced: ['sd-search', 'sd-geo'],
  },
  {
    id: 'async',
    name: 'Async & delivery',
    core: ['sd-queues', 'sd-overload', 'sd-realtime'],
    advanced: ['sd-streams', 'sd-batch'],
  },
  {
    id: 'coordination',
    name: 'Coordination',
    core: [],
    advanced: ['sd-consensus', 'sd-locks', 'sd-transactions', 'sd-clocks', 'sd-discovery'],
  },
  {
    id: 'edge',
    name: 'Edge & operations',
    core: ['sd-api-design', 'sd-rate-limiting'],
    advanced: ['sd-gateway', 'sd-security', 'sd-tenancy', 'sd-observability'],
  },
] as const satisfies readonly { id: string; name: string; core: readonly string[]; advanced: readonly string[] }[];

export type SdShelf = (typeof SD_SHELVES)[number]['id'];
export type SdTopicLevel = 'core' | 'advanced';

const holds = (list: readonly string[], id: string) => list.includes(id);

export function sdTopicShelf(topicId: string): SdShelf | undefined {
  return SD_SHELVES.find((s) => holds(s.core, topicId) || holds(s.advanced, topicId))?.id;
}

export function sdTopicLevel(topicId: string): SdTopicLevel | undefined {
  const shelf = SD_SHELVES.find((s) => holds(s.core, topicId) || holds(s.advanced, topicId));
  return shelf && (holds(shelf.core, topicId) ? 'core' : 'advanced');
}
