import type { PatternId } from '../catalog.js';
import { FOUNDATIONS_CORE_LESSONS } from './foundations-core.js';
import { GRAPHS_ADVANCED_LESSONS } from './graphs-advanced.js';
import type { Lesson } from './types.js';

export type { Lesson, WorkedExample } from './types.js';

export const LESSONS: Record<PatternId, Lesson> = { ...FOUNDATIONS_CORE_LESSONS, ...GRAPHS_ADVANCED_LESSONS };

export function getLesson(id: string): Lesson | undefined {
  return LESSONS[id as PatternId];
}
