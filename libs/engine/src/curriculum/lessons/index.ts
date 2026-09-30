import type { PatternId } from '../catalog.js';
import { BITMASK_DP_LESSON } from './bitmask-dp.js';
import { FOUNDATIONS_CORE_LESSONS } from './foundations-core.js';
import { GRAPHS_ADVANCED_LESSONS } from './graphs-advanced.js';
import { LINKED_LIST_REVERSAL_LESSON } from './linked-list-reversal.js';
import { MINIMUM_SPANNING_TREE_LESSON } from './minimum-spanning-tree.js';
import type { Lesson } from './types.js';

export type { Lesson, WorkedExample } from './types.js';

export const LESSONS: Record<PatternId, Lesson> = {
  ...FOUNDATIONS_CORE_LESSONS,
  'linked-list-reversal': LINKED_LIST_REVERSAL_LESSON,
  ...GRAPHS_ADVANCED_LESSONS,
  'minimum-spanning-tree': MINIMUM_SPANNING_TREE_LESSON,
  'bitmask-dp': BITMASK_DP_LESSON,
};

export function getLesson(id: string): Lesson | undefined {
  return LESSONS[id as PatternId];
}
