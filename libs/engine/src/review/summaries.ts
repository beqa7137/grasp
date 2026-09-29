import type { AlgorithmSummary } from '../algorithms/catalog.js';
import { getPatternSummary, type ComplexityFactSummary, type DrillCardSummary } from '../curriculum/catalog.js';
import { SD_TOPICS } from '../curriculum/sd-topics.js';
import type { ReviewItemSummary } from './types.js';

/** A system design case as the review catalog sees it; its question builder lives in design-items.ts. */
export interface DesignItemSummary<Id extends string = string> {
  id: Id;
  topic: string;
}

const DESIGN = [
  { id: 'response-time', topic: 'sd-latency' },
  { id: 'headroom', topic: 'sd-latency' },
  { id: 'bottleneck', topic: 'sd-capacity' },
  { id: 'load-balancer', topic: 'sd-capacity' },
  { id: 'qps', topic: 'sd-estimation' },
  { id: 'storage', topic: 'sd-estimation' },
  { id: 'availability', topic: 'sd-reliability' },
  { id: 'spof', topic: 'sd-reliability' },
  { id: 'cache-tail', topic: 'sd-caching' },
  { id: 'cache-math', topic: 'sd-caching' },
  { id: 'cdn', topic: 'sd-caching' },
  { id: 'fix-db', topic: 'sd-replication' },
  { id: 'replicas-writes', topic: 'sd-replication' },
  { id: 'queue-drain', topic: 'sd-queues' },
  { id: 'worker-limit', topic: 'sd-queues' },
  { id: 'async-ack', topic: 'sd-queues' },
  { id: 'token-bucket', topic: 'sd-rate-limiting' },
  { id: 'limiter-state', topic: 'sd-rate-limiting' },
  { id: 'bots-cache', topic: 'sd-rate-limiting' },
  { id: 'over-quota', topic: 'sd-rate-limiting' },
  { id: 'shard-count', topic: 'sd-sharding' },
  { id: 'time-key', topic: 'sd-sharding' },
  { id: 'tenant-skew', topic: 'sd-sharding' },
  { id: 'reshard', topic: 'sd-sharding' },
  { id: 'quorum-overlap', topic: 'sd-consistency' },
  { id: 'quorum-failures', topic: 'sd-consistency' },
  { id: 'partition-choice', topic: 'sd-consistency' },
  { id: 'majority-size', topic: 'sd-consensus' },
  { id: 'even-cluster', topic: 'sd-consensus' },
  { id: 'fencing-token', topic: 'sd-consensus' },
  { id: 'id-range', topic: 'sd-ids' },
  { id: 'shard-counters', topic: 'sd-ids' },
  { id: 'random-keys', topic: 'sd-ids' },
  { id: 'idf-rank', topic: 'sd-search' },
  { id: 'index-refresh', topic: 'sd-search' },
  { id: 'index-sharding', topic: 'sd-search' },
  { id: 'window-assign', topic: 'sd-streams' },
  { id: 'watermark', topic: 'sd-streams' },
  { id: 'exactly-once', topic: 'sd-streams' },
  { id: 'page-write-amp', topic: 'sd-storage' },
  { id: 'lsm-vs-btree', topic: 'sd-storage' },
  { id: 'bloom-filter', topic: 'sd-storage' },
  { id: 'cdn-pulls', topic: 'sd-cdn' },
  { id: 'cdn-shield', topic: 'sd-cdn' },
  { id: 'edge-tls', topic: 'sd-cdn' },
  { id: 'quorum-latency', topic: 'sd-multi-region' },
  { id: 'async-failover', topic: 'sd-multi-region' },
  { id: 'active-active-conflict', topic: 'sd-multi-region' },
  { id: 'burn-rate-days', topic: 'sd-observability' },
  { id: 'average-percentiles', topic: 'sd-observability' },
  { id: 'label-cardinality', topic: 'sd-observability' },
  { id: 'offset-rows', topic: 'sd-api-design' },
  { id: 'idempotency-key', topic: 'sd-api-design' },
  { id: 'compatible-change', topic: 'sd-api-design' },
  { id: 'bcrypt-cost', topic: 'sd-security' },
  { id: 'salt-purpose', topic: 'sd-security' },
  { id: 'object-ownership', topic: 'sd-security' },
  { id: 'coordinator-crash', topic: 'sd-transactions' },
  { id: 'outbox-pattern', topic: 'sd-transactions' },
  { id: 'saga-compensations', topic: 'sd-transactions' },
  { id: 'hot-reducer', topic: 'sd-batch' },
  { id: 'combiner-use', topic: 'sd-batch' },
  { id: 'idempotent-rerun', topic: 'sd-batch' },
  { id: 'geohash-neighbors', topic: 'sd-geo' },
  { id: 'geohash-precision', topic: 'sd-geo' },
  { id: 'hot-cell', topic: 'sd-geo' },
  { id: 'polling-load', topic: 'sd-realtime' },
  { id: 'sse-or-websocket', topic: 'sd-realtime' },
  { id: 'reconnect-storm', topic: 'sd-realtime' },
  { id: 'n-plus-one', topic: 'sd-data-modeling' },
  { id: 'rename-fan-out', topic: 'sd-data-modeling' },
  { id: 'composite-index', topic: 'sd-data-modeling' },
  { id: 'queue-bound', topic: 'sd-overload' },
  { id: 'retry-storm', topic: 'sd-overload' },
  { id: 'goodput', topic: 'sd-overload' },
  { id: 'lease-failover', topic: 'sd-locks' },
  { id: 'efficiency-lock', topic: 'sd-locks' },
  { id: 'conditional-write', topic: 'sd-locks' },
  { id: 'slow-server-load', topic: 'sd-load-balancing' },
  { id: 'two-choices', topic: 'sd-load-balancing' },
  { id: 'fast-failures', topic: 'sd-load-balancing' },
] as const satisfies readonly DesignItemSummary[];

export type DesignItemId = (typeof DESIGN)[number]['id'];

/** Within each topic, the order its cases are introduced. */
export const DESIGN_ITEM_CATALOG: readonly DesignItemSummary<DesignItemId>[] = DESIGN;

const patternOrder = (id: string) => (getPatternSummary(id)?.order ?? 99) * 100;

export const recognitionSummary = (card: DrillCardSummary, i: number): ReviewItemSummary => ({
  id: `rec:${card.id}`,
  kind: 'recognition',
  topic: card.patternId,
  order: patternOrder(card.patternId) + (i % 10),
});

export const complexitySummary = (fact: ComplexityFactSummary, i: number): ReviewItemSummary => ({
  id: `cx:${fact.id}`,
  kind: 'complexity',
  topic: fact.patternId,
  order: patternOrder(fact.patternId) + 10 + (i % 10),
});

export const clozeSummary = (patternId: string, n: number): ReviewItemSummary => ({
  id: `cloze:${patternId}:${n + 1}`,
  kind: 'cloze',
  topic: patternId,
  order: patternOrder(patternId) + 20 + n,
});

export const predictSummary = (algorithm: Pick<AlgorithmSummary, 'id' | 'patternId'>): ReviewItemSummary => ({
  id: `pred:${algorithm.id}`,
  kind: 'predict',
  topic: algorithm.patternId,
  algorithmId: algorithm.id,
  order: patternOrder(algorithm.patternId) + 30,
});

export function designSummary(item: DesignItemSummary, i: number): ReviewItemSummary {
  const index = DESIGN_ITEM_CATALOG.slice(0, i).filter((d) => d.topic === item.topic).length;
  return {
    id: `sd:${item.id}`,
    kind: 'design',
    topic: item.topic,
    order: 5000 + SD_TOPICS.findIndex((t) => t.id === item.topic) * 100 + index,
  };
}
