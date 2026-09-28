import { CACHING_LESSON } from './caching.js';
import { LATENCY_LESSON } from './latency.js';
import { QUEUES_LESSON } from './queues.js';
import { SHARDING_LESSON } from './sharding.js';
import type { SdLesson } from './types.js';

export type { SdLesson, SdWidget } from './types.js';
export * from './widgets.js';

export const SD_LESSONS: Readonly<Record<string, SdLesson>> = {
  'sd-latency': LATENCY_LESSON,
  'sd-caching': CACHING_LESSON,
  'sd-sharding': SHARDING_LESSON,
  'sd-queues': QUEUES_LESSON,
};

export function getSdLesson(topicId: string): SdLesson | undefined {
  return Object.hasOwn(SD_LESSONS, topicId) ? SD_LESSONS[topicId] : undefined;
}
