import type { PlanUnit } from '@grasp/engine';

/** Where a plan unit is done; the plan's own list and Up next open the same page. */
export function unitLink(unit: PlanUnit): string[] {
  switch (unit.kind) {
    case 'pattern':
      return ['/coding/patterns', unit.patternId!];
    case 'retry':
    case 'solve':
      return ['/coding/problems', unit.problemId!];
    case 'lesson':
      return ['/design/topics', unit.topicId!];
    case 'case':
      return ['/design/cases', unit.caseId!];
    case 'mission':
      return ['/design/missions', unit.scenarioId!];
    case 'story':
      return ['/behavioral', unit.competencyId!];
    case 'mock':
      return ['/mock/loop'];
  }
}
