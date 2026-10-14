import { API_DESIGN_LESSON } from './api-design.js';
import { BATCH_LESSON } from './batch.js';
import { CACHING_LESSON } from './caching.js';
import { CAPACITY_LESSON } from './capacity.js';
import { CDN_LESSON } from './cdn.js';
import { CLOCKS_LESSON } from './clocks.js';
import { CONSENSUS_LESSON } from './consensus.js';
import { CONSISTENCY_LESSON } from './consistency.js';
import { DATA_MODELING_LESSON } from './data-modeling.js';
import { DISCOVERY_LESSON } from './discovery.js';
import { DURABILITY_LESSON } from './durability.js';
import { ESTIMATION_LESSON } from './estimation.js';
import { GEO_LESSON } from './geo.js';
import { IDS_LESSON } from './ids.js';
import { LATENCY_LESSON } from './latency.js';
import { LOAD_BALANCING_LESSON } from './load-balancing.js';
import { LOCKS_LESSON } from './locks.js';
import { MULTI_REGION_LESSON } from './multi-region.js';
import { OBSERVABILITY_LESSON } from './observability.js';
import { OVERLOAD_LESSON } from './overload.js';
import { QUEUES_LESSON } from './queues.js';
import { RATE_LIMITING_LESSON } from './rate-limiting.js';
import { REALTIME_LESSON } from './realtime.js';
import { RECOVERY_LESSON } from './recovery.js';
import { TENANCY_LESSON } from './tenancy.js';
import { GATEWAY_LESSON } from './gateway.js';
import { RELIABILITY_LESSON } from './reliability.js';
import { REPLICATION_LESSON } from './replication.js';
import { SEARCH_LESSON } from './search.js';
import { SECURITY_LESSON } from './security.js';
import { SHARDING_LESSON } from './sharding.js';
import { STORAGE_LESSON } from './storage.js';
import { STREAMS_LESSON } from './streams.js';
import { TRANSACTIONS_LESSON } from './transactions.js';
import type { SdLesson } from './types.js';

export type { SdLesson, SdWidget } from './types.js';
export * from './widgets.js';
export * from './experiments.js';
export * from './caching-experiments.js';
export * from './load-balancing-experiments.js';
export * from './replication-experiments.js';

export const SD_LESSONS: Readonly<Record<string, SdLesson>> = {
  'sd-latency': LATENCY_LESSON,
  'sd-capacity': CAPACITY_LESSON,
  'sd-estimation': ESTIMATION_LESSON,
  'sd-reliability': RELIABILITY_LESSON,
  'sd-caching': CACHING_LESSON,
  'sd-replication': REPLICATION_LESSON,
  'sd-queues': QUEUES_LESSON,
  'sd-rate-limiting': RATE_LIMITING_LESSON,
  'sd-sharding': SHARDING_LESSON,
  'sd-consistency': CONSISTENCY_LESSON,
  'sd-consensus': CONSENSUS_LESSON,
  'sd-ids': IDS_LESSON,
  'sd-search': SEARCH_LESSON,
  'sd-streams': STREAMS_LESSON,
  'sd-storage': STORAGE_LESSON,
  'sd-cdn': CDN_LESSON,
  'sd-multi-region': MULTI_REGION_LESSON,
  'sd-observability': OBSERVABILITY_LESSON,
  'sd-api-design': API_DESIGN_LESSON,
  'sd-security': SECURITY_LESSON,
  'sd-transactions': TRANSACTIONS_LESSON,
  'sd-batch': BATCH_LESSON,
  'sd-geo': GEO_LESSON,
  'sd-realtime': REALTIME_LESSON,
  'sd-data-modeling': DATA_MODELING_LESSON,
  'sd-overload': OVERLOAD_LESSON,
  'sd-locks': LOCKS_LESSON,
  'sd-load-balancing': LOAD_BALANCING_LESSON,
  'sd-discovery': DISCOVERY_LESSON,
  'sd-clocks': CLOCKS_LESSON,
  'sd-recovery': RECOVERY_LESSON,
  'sd-tenancy': TENANCY_LESSON,
  'sd-gateway': GATEWAY_LESSON,
  'sd-durability': DURABILITY_LESSON,
};

export function getSdLesson(topicId: string): SdLesson | undefined {
  return Object.hasOwn(SD_LESSONS, topicId) ? SD_LESSONS[topicId] : undefined;
}
