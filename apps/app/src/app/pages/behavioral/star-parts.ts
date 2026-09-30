import type { StarPart } from '@grasp/engine';

export const STAR_PARTS: readonly { part: StarPart; label: string }[] = [
  { part: 'situation', label: 'Situation' },
  { part: 'task', label: 'Task' },
  { part: 'action', label: 'Action' },
  { part: 'result', label: 'Result' },
  { part: 'reflection', label: 'Reflection' },
];
