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

export const predictSummary = (algorithm: AlgorithmSummary): ReviewItemSummary => ({
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
