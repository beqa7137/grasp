import type { UpNextAction } from '@grasp/engine';
import { unitLink } from '../plan/plan-links';

/** Device work ids name what they continue: a case study's draft on this device is `case-draft:<id>`. */
export const caseWorkId = (caseId: string) => `case-draft:${caseId}`;

/** The page that does an Up next card's action, or null for "Rest", which has nothing to open. */
export function actionLink(action: UpNextAction): string[] | null {
  switch (action.kind) {
    case 'rest':
      return null;
    case 'review':
      return ['/today/review'];
    case 'mock-loop':
      return ['/mock/loop'];
    case 'mock-round':
      return ['/mock'];
    case 'pattern':
      return ['/coding/patterns', action.patternId];
    case 'drill-pattern':
      return ['/coding/patterns', action.patternId, 'drill'];
    case 'problem':
      return ['/coding/problems', action.problemId];
    case 'topic':
      return ['/design/topics', action.topicId];
    case 'drill-topic':
      return ['/design/topics', action.topicId, 'drill'];
    case 'mission':
      return ['/design/missions', action.scenarioId];
    case 'case':
      return ['/design/cases', action.caseId];
    case 'competency':
    case 'write-story':
      return ['/behavioral', action.competencyId];
    case 'rehearse':
      return ['/behavioral/stories', action.storyId];
    case 'plan-unit':
      return unitLink(action.unit);
    case 'device-work':
      return ['/design/cases', action.workId.slice(caseWorkId('').length)];
  }
}
