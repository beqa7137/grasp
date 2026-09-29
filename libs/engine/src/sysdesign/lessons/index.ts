import { API_DESIGN_LESSON } from './api-design.js';
import { CACHING_LESSON } from './caching.js';
import { CAPACITY_LESSON } from './capacity.js';
import { CDN_LESSON } from './cdn.js';
import { CONSENSUS_LESSON } from './consensus.js';
import { CONSISTENCY_LESSON } from './consistency.js';
import { ESTIMATION_LESSON } from './estimation.js';
import { IDS_LESSON } from './ids.js';
import { LATENCY_LESSON } from './latency.js';
import { MULTI_REGION_LESSON } from './multi-region.js';
import { OBSERVABILITY_LESSON } from './observability.js';
import { QUEUES_LESSON } from './queues.js';
import { RATE_LIMITING_LESSON } from './rate-limiting.js';
import { RELIABILITY_LESSON } from './reliability.js';
import { REPLICATION_LESSON } from './replication.js';
import { SEARCH_LESSON } from './search.js';
import { SECURITY_LESSON } from './security.js';
import { SHARDING_LESSON } from './sharding.js';
import { STORAGE_LESSON } from './storage.js';
import { STREAMS_LESSON } from './streams.js';
import type { SdLesson } from './types.js';

export type { SdLesson, SdWidget } from './types.js';
export * from './widgets.js';

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
};

export function getSdLesson(topicId: string): SdLesson | undefined {
  return Object.hasOwn(SD_LESSONS, topicId) ? SD_LESSONS[topicId] : undefined;
}
