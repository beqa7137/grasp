import type { InterviewTrack } from './rubrics.js';

/**
 * A scripted mock round's problem as lists, search and the loop see it, so they work offline; the API keeps each one's
 * prompts and rubric. `catalogId` names the matching coding problem or case study; `title` is that one's title, which
 * the title spec holds it to.
 */
export interface MockProblem {
  id: string;
  track: Exclude<InterviewTrack, 'behavioral'>;
  title: string;
  patternIds: readonly string[];
  catalogId: string | null;
  /** Why a problem has no catalog twin; required when `catalogId` is null. */
  noCatalogReason?: string;
}

export const MOCK_PROBLEMS: readonly MockProblem[] = [
  { id: 'warmer-days', track: 'coding', title: 'Days Until Warmer', patternIds: ['monotonic-stack'], catalogId: 'daily-temperatures' },
  {
    id: 'shipping-capacity',
    track: 'coding',
    title: 'Capacity To Ship Packages Within D Days',
    patternIds: ['binary-search', 'greedy'],
    catalogId: 'ship-within-days',
  },
  {
    id: 'course-order',
    track: 'coding',
    title: 'Course Schedule Order',
    patternIds: ['topo-sort', 'bfs'],
    catalogId: null,
    noCatalogReason: 'It returns an order of courses; the catalog Course Schedule only answers whether one exists.',
  },
  {
    id: 'longest-k-replace',
    track: 'coding',
    title: 'Longest Repeating Character Replacement',
    patternIds: ['sliding-window', 'hashing'],
    catalogId: 'character-replacement',
  },
  { id: 'url-shortener', track: 'system-design', title: 'URL Shortener', patternIds: [], catalogId: 'url-shortener' },
  { id: 'news-feed', track: 'system-design', title: 'News Feed', patternIds: [], catalogId: 'news-feed' },
  { id: 'rate-limiter', track: 'system-design', title: 'Rate Limiter', patternIds: [], catalogId: 'rate-limiter' },
  { id: 'chat-service', track: 'system-design', title: 'Chat App', patternIds: [], catalogId: 'chat' },
];

export function getMockProblem(id: string): MockProblem | undefined {
  return MOCK_PROBLEMS.find((p) => p.id === id);
}
