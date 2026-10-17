import type { UpNextAction } from '@grasp/engine';
import { unitLink } from '../plan/plan-links';

/** Device work ids name what they continue: `case-draft:<case>`, `code-draft:<problem>`, `star-draft:<question>`. */
export const caseWorkId = (caseId: string) => `case-draft:${caseId}`;
export const codeWorkId = (problemId: string) => `code-draft:${problemId}`;
export const starWorkId = (questionId: string) => `star-draft:${questionId}`;
export const MOCK_LOOP_WORK_ID = 'mock-loop';

/** The page that continues a piece of device work. */
export function workLink(workId: string): string[] {
  const colon = workId.indexOf(':');
  const id = workId.slice(colon + 1);
  switch (workId.slice(0, colon)) {
    case 'code-draft':
      return ['/coding/problems', id];
    case 'star-draft':
      return ['/behavioral/question', id];
    case 'case-draft':
      return ['/design/cases', id];
    default:
      return ['/mock/loop'];
  }
}

/** A case study continued from here opens at the stage it stopped at, not at its top. */
export const workQuery = (workId: string): Record<string, string> | null => (workId.startsWith('case-draft:') ? { resume: '1' } : null);

/** The query an Up next card's link carries. */
export const actionQuery = (action: UpNextAction) => (action.kind === 'device-work' ? workQuery(action.workId) : null);

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
      return workLink(action.workId);
  }
}
