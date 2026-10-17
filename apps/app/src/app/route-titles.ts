import type { ActivatedRouteSnapshot } from '@angular/router';
import {
  getAlgorithmSummary,
  getCaseSummary,
  getCompetencySummary,
  getPatternSummary,
  getProblemSummary,
  getScenarioSummary,
  getSdTopic,
} from '@grasp/engine';
import { FREE_BUILD } from './pages/design/free-build';

const idOf = (route: ActivatedRouteSnapshot) => route.paramMap.get('id') ?? '';

export function patternTitle(route: ActivatedRouteSnapshot) {
  const pattern = getPatternSummary(idOf(route));
  return pattern ? `${pattern.name} pattern` : 'Pattern';
}

export const topicTitle = (route: ActivatedRouteSnapshot) => getSdTopic(idOf(route))?.name ?? 'System design';

export const algorithmTitle = (route: ActivatedRouteSnapshot) => getAlgorithmSummary(idOf(route))?.title ?? 'Visualizer';

export const caseTitle = (route: ActivatedRouteSnapshot) => getCaseSummary(idOf(route))?.title ?? 'Case study';

export const missionTitle = (route: ActivatedRouteSnapshot) => getScenarioSummary(idOf(route))?.title ?? 'Lab';

export function caseBuildTitle(route: ActivatedRouteSnapshot) {
  const study = getCaseSummary(route.paramMap.get('case') ?? '');
  return study ? `${study.title} build` : FREE_BUILD.title;
}

export const competencyTitle = (route: ActivatedRouteSnapshot) => getCompetencySummary(idOf(route))?.name ?? 'Behavioral';

export const problemTitle = (route: ActivatedRouteSnapshot) => getProblemSummary(idOf(route))?.title ?? 'Code';
