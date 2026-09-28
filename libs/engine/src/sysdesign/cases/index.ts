import { VIDEO_STREAMING } from './video-streaming.js';
import { PAYMENTS } from './payments.js';
import { RIDE_SHARING } from './ride-sharing.js';
import { DISTRIBUTED_CACHE } from './distributed-cache.js';
import { TICKETING } from './ticketing.js';
import { WEB_CRAWLER } from './web-crawler.js';
import { NOTIFICATIONS } from './notifications.js';
import { CHAT } from './chat.js';
import { TYPEAHEAD } from './typeahead.js';
import { RATE_LIMITER } from './rate-limiter.js';
import { NEWS_FEED } from './news-feed.js';
import type { CaseStudy } from './types.js';
import { URL_SHORTENER } from './url-shortener.js';

export type { CaseDecision, CaseEstimate, CaseOption, CaseStage, CaseStageKind, CaseStudy } from './types.js';
export * from './estimate.js';
export * from './labs.js';

export const CASE_STUDIES: readonly CaseStudy[] = [
  URL_SHORTENER,
  RATE_LIMITER,
  TYPEAHEAD,
  NEWS_FEED,
  CHAT,
  NOTIFICATIONS,
  WEB_CRAWLER,
  VIDEO_STREAMING,
  PAYMENTS,
  RIDE_SHARING,
  DISTRIBUTED_CACHE,
  TICKETING,
];

export function getCaseStudy(id: string): CaseStudy | undefined {
  return CASE_STUDIES.find((c) => c.id === id);
}
