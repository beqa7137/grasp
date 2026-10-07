import type { InterviewTrack } from './rubrics.js';

/**
 * A scripted mock round's problem as lists, search and the loop see it, so they work offline; the API keeps each one's
 * prompts and rubric. `catalogId` names the matching coding problem or case study, whose title is the one to show.
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
    title: 'Ship Within D Days',
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
    title: 'Longest Repeating Run With K Changes',
    patternIds: ['sliding-window', 'hashing'],
    catalogId: 'character-replacement',
  },
  { id: 'url-shortener', track: 'system-design', title: 'Design a URL Shortener', patternIds: [], catalogId: 'url-shortener' },
  { id: 'news-feed', track: 'system-design', title: 'Design a News Feed', patternIds: [], catalogId: 'news-feed' },
  { id: 'rate-limiter', track: 'system-design', title: 'Design a Distributed Rate Limiter', patternIds: [], catalogId: 'rate-limiter' },
  { id: 'chat-service', track: 'system-design', title: 'Design a Chat Service', patternIds: [], catalogId: 'chat' },
];

export function getMockProblem(id: string): MockProblem | undefined {
  return MOCK_PROBLEMS.find((p) => p.id === id);
}
