import { NEWS_FEED } from './news-feed.js';
import type { CaseStudy } from './types.js';
import { URL_SHORTENER } from './url-shortener.js';

export type { CaseDecision, CaseEstimate, CaseOption, CaseStage, CaseStageKind, CaseStudy } from './types.js';
export * from './estimate.js';
export * from './labs.js';

export const CASE_STUDIES: readonly CaseStudy[] = [URL_SHORTENER, NEWS_FEED];

export function getCaseStudy(id: string): CaseStudy | undefined {
  return CASE_STUDIES.find((c) => c.id === id);
}
