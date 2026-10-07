import { inject } from '@angular/core';
import { Router, type Routes, type UrlMatcher, type UrlSegment } from '@angular/router';
import { SCENARIO_CATALOG } from '@grasp/engine';

/**
 * The URLs from before REDESIGN.md R5 keep working forever: reminders already scheduled on devices open `/drill`, and learners
 * keep bookmarks. Routes sharing a prefix with a new route are declared inline in their tab (in main); the prefixes that
 * collide with nothing load their redirects on demand (`legacy-prefixes.ts`).
 */
export const LEGACY_PREFIXES = ['learn', 'visualize', 'drill', 'diagnostic', 'interview', 'code', 'plan', 'settings'] as const;
export type LegacyPrefix = (typeof LEGACY_PREFIXES)[number];

/** Redirects to `commands`, keeping the old URL's query. */
export const keepQuery =
  (commands: (params: Record<string, string>) => unknown[]) =>
  ({ params, queryParams }: { params: Record<string, string>; queryParams: Record<string, unknown> }) =>
    inject(Router).createUrlTree(commands(params), { queryParams });

const scenarioIds = new Set<string>(SCENARIO_CATALOG.map((s) => s.id));

/** `/design/:scenarioId`, the old mission URL, only for ids that are missions, so it never shadows a design route. */
const legacyMission: UrlMatcher = (segments: UrlSegment[]) =>
  segments.length === 2 && segments[0].path === 'design' && scenarioIds.has(segments[1].path)
    ? { consumed: segments, posParams: { id: segments[1] } }
    : null;

export const legacyDesignRoutes: Routes = [
  { path: 'design/case/:id', redirectTo: '/design/cases/:id' },
  {
    path: 'design/free-build',
    redirectTo: ({ queryParams }) => {
      const { case: study, ...query } = queryParams;
      return inject(Router).createUrlTree(study ? ['/design/cases', study, 'build'] : ['/design/lab'], { queryParams: query });
    },
  },
  { matcher: legacyMission, redirectTo: keepQuery(({ id }) => ['/design/missions', id]) },
];

export const legacyBehavioralRoutes: Routes = [{ path: 'behavioral/mock', redirectTo: keepQuery(() => ['/behavioral/drill']) }];
