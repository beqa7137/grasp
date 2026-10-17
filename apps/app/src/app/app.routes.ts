import { inject } from '@angular/core';
import { Router, type ActivatedRouteSnapshot, type Routes } from '@angular/router';
import { preloadChunks } from './core/route-chunks';
import { LEGACY_PREFIXES, legacyBehavioralRoutes, legacyDesignRoutes } from './legacy-routes';

/**
 * Loads a lazy module while the chunks it imports statically are fetched beside it, so a cold load waits one round trip
 * rather than discovering them after the module's own chunk arrives. `scripts/route-chunks.mjs` writes each module's
 * chunks into index.html and fails the build when a lazy import in the route files is not wrapped.
 */
const lazy = <T>(module: string, load: () => Promise<T>): Promise<T> => {
  preloadChunks(module);
  return load();
};
/** Titles need the catalogs, which load with the route rather than with the app. */
const titles = () => lazy('route-titles', () => import('./route-titles'));
/** Loads a titled page with its title, so preloading the page also keeps its title for an offline visit. */
const withTitles = <T>(page: Promise<T>) => Promise.all([page, titles()]).then(([m]) => m);
const hub = () => lazy('pages/hub/hub.page', () => import('./pages/hub/hub.page')).then((m) => m.HubPage);
const skillMap = () =>
  lazy('pages/coding/skill-map.component', () => import('./pages/coding/skill-map.component')).then((m) => m.SkillMapComponent);
const shelves = () =>
  lazy('pages/design/shelves.component', () => import('./pages/design/shelves.component')).then((m) => m.ShelvesComponent);
const competencies = () =>
  lazy('pages/behavioral/behavioral-list.page', () => import('./pages/behavioral/behavioral-list.page')).then((m) => m.BehavioralListPage);
const drill = () => lazy('pages/drill/drill.page', () => import('./pages/drill/drill.page')).then((m) => m.DrillPage);
const sandbox = () => withTitles(lazy('pages/design/sandbox.page', () => import('./pages/design/sandbox.page'))).then((m) => m.SandboxPage);

/**
 * Every route's first segment is its tab (REDESIGN.md 2.4). Within a tab (2.5): literal details, parameterized details, the
 * hub with its segments, inline legacy routes, then the last-resort parameter route; `routes.spec.ts` checks the order.
 * `preload` ranks what the preloading strategy fetches first, since this order cannot also put the hubs first.
 */
export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./tabs/tabs.page').then((m) => m.TabsPage),
    children: [
      { path: 'today/review', title: 'Review', loadComponent: drill },
      {
        path: 'today/drill',
        title: 'Drill',
        // Only Weak spots' "Drill these" links here, always with its topics; without them there is nothing to drill.
        canActivate: [
          (route: ActivatedRouteSnapshot) => route.queryParamMap.has('topics') || inject(Router).createUrlTree(['/today/review']),
        ],
        data: { weakSpots: true },
        loadComponent: drill,
      },
      {
        path: 'today/progress',
        title: 'Progress',
        loadComponent: () =>
          lazy('pages/progress/progress.page', () => import('./pages/progress/progress.page')).then((m) => m.ProgressPage),
      },
      {
        path: 'today/plan',
        title: 'Study plan',
        loadComponent: () => lazy('pages/plan/plan.page', () => import('./pages/plan/plan.page')).then((m) => m.PlanPage),
      },
      {
        path: 'today/settings',
        title: 'Settings',
        loadComponent: () =>
          lazy('pages/settings/settings.page', () => import('./pages/settings/settings.page')).then((m) => m.SettingsPage),
      },
      {
        path: 'today',
        title: 'Today',
        loadComponent: () => lazy('pages/today/today.page', () => import('./pages/today/today.page')).then((m) => m.TodayPage),
        data: { preload: 0 },
      },

      {
        path: 'coding/placement',
        title: 'Placement check',
        loadComponent: () =>
          lazy('pages/diagnostic/diagnostic.page', () => import('./pages/diagnostic/diagnostic.page')).then((m) => m.DiagnosticPage),
      },
      {
        path: 'coding/problems/:id',
        data: { focus: true, preload: 1 },
        title: (route) => titles().then((t) => t.problemTitle(route)),
        loadComponent: () =>
          withTitles(lazy('pages/code/workspace.page', () => import('./pages/code/workspace.page'))).then((m) => m.WorkspacePage),
      },
      {
        path: 'coding/visualizers/:id',
        data: { focus: true, preload: 1 },
        title: (route) => titles().then((t) => t.algorithmTitle(route)),
        loadComponent: () =>
          withTitles(lazy('pages/visualize/player.page', () => import('./pages/visualize/player.page'))).then((m) => m.PlayerPage),
      },
      { path: 'coding/patterns/:pattern/drill', title: 'Practice', loadComponent: drill },
      {
        path: 'coding/patterns/:id',
        data: { preload: 1 },
        title: (route) => titles().then((t) => t.patternTitle(route)),
        loadComponent: () =>
          withTitles(lazy('pages/pattern/pattern.page', () => import('./pages/pattern/pattern.page'))).then((m) => m.PatternPage),
      },
      {
        path: 'coding',
        title: 'Coding',
        // The hub and its default segment load together: one after the other was one more round trip on a slow network.
        loadComponent: () => Promise.all([hub(), skillMap()]).then(([page]) => page),
        data: { preload: 0 },
        children: [
          {
            path: '',
            title: 'Skill map',
            loadComponent: skillMap,
            data: { preload: 0 },
          },
          {
            path: 'problems',
            title: 'Problems',
            loadComponent: () =>
              lazy('pages/coding/problem-library.page', () => import('./pages/coding/problem-library.page')).then(
                (m) => m.ProblemLibraryPage,
              ),
          },
          {
            path: 'visualizers',
            title: 'Visualizers',
            loadComponent: () =>
              lazy('pages/coding/visualizers.component', () => import('./pages/coding/visualizers.component')).then(
                (m) => m.VisualizersComponent,
              ),
          },
        ],
      },

      { path: 'design/lab', data: { focus: true, id: 'free-build', preload: 1 }, title: 'Free Build', loadComponent: sandbox },
      {
        path: 'design/missions/:id',
        data: { focus: true },
        title: (route) => titles().then((t) => t.missionTitle(route)),
        loadComponent: sandbox,
      },
      {
        path: 'design/cases/:case/build',
        data: { focus: true, id: 'free-build' },
        title: (route) => titles().then((t) => t.caseBuildTitle(route)),
        loadComponent: sandbox,
      },
      {
        path: 'design/cases/:id',
        data: { preload: 1 },
        title: (route) => titles().then((t) => t.caseTitle(route)),
        loadComponent: () =>
          withTitles(lazy('pages/design/case/case-study.page', () => import('./pages/design/case/case-study.page'))).then(
            (m) => m.CaseStudyPage,
          ),
      },
      { path: 'design/topics/:pattern/drill', title: 'Practice', loadComponent: drill },
      {
        path: 'design/topics/:id',
        data: { preload: 1 },
        title: (route) => titles().then((t) => t.topicTitle(route)),
        loadComponent: () =>
          withTitles(lazy('pages/design-lesson/design-lesson.page', () => import('./pages/design-lesson/design-lesson.page'))).then(
            (m) => m.DesignLessonPage,
          ),
      },
      ...legacyDesignRoutes,
      {
        path: 'design',
        title: 'Design',
        // As Coding's: the hub and its Topics segment load together, not one round trip after another.
        loadComponent: () => Promise.all([hub(), shelves()]).then(([page]) => page),
        data: { preload: 0 },
        children: [
          { path: '', title: 'Topics', loadComponent: shelves, data: { preload: 0 } },
          {
            path: 'missions',
            title: 'Missions',
            loadComponent: () =>
              lazy('pages/design/missions.component', () => import('./pages/design/missions.component')).then((m) => m.MissionsComponent),
          },
          {
            path: 'cases',
            title: 'Cases',
            loadComponent: () =>
              lazy('pages/design/case-library.page', () => import('./pages/design/case-library.page')).then((m) => m.CaseLibraryPage),
          },
        ],
      },

      {
        path: 'behavioral/rehearse',
        title: 'Rehearse stories',
        loadComponent: () =>
          lazy('pages/behavioral/rehearse.page', () => import('./pages/behavioral/rehearse.page')).then((m) => m.RehearsePage),
      },
      {
        path: 'behavioral/guide',
        title: 'How to answer (STAR)',
        loadComponent: () => lazy('pages/behavioral/guide.page', () => import('./pages/behavioral/guide.page')).then((m) => m.GuidePage),
      },
      {
        path: 'behavioral/drill',
        title: 'STAR drill',
        loadComponent: () =>
          lazy('pages/behavioral/behavioral-mock.page', () => import('./pages/behavioral/behavioral-mock.page')).then(
            (m) => m.BehavioralMockPage,
          ),
      },
      {
        path: 'behavioral/question/:id',
        title: 'Behavioral practice',
        loadComponent: () =>
          lazy('pages/behavioral/star-practice.page', () => import('./pages/behavioral/star-practice.page')).then(
            (m) => m.StarPracticePage,
          ),
      },
      {
        path: 'behavioral/stories/:id',
        title: 'Story',
        loadComponent: () => lazy('pages/behavioral/story.page', () => import('./pages/behavioral/story.page')).then((m) => m.StoryPage),
      },
      {
        path: 'behavioral',
        title: 'Behavioral',
        loadComponent: () => Promise.all([hub(), competencies()]).then(([page]) => page),
        data: { preload: 0, narrow: true },
        children: [
          { path: '', title: 'Competencies', loadComponent: competencies, data: { preload: 0 } },
          {
            path: 'questions',
            title: 'Questions',
            loadComponent: () =>
              lazy('pages/behavioral/question-library.page', () => import('./pages/behavioral/question-library.page')).then(
                (m) => m.QuestionLibraryPage,
              ),
          },
          {
            path: 'stories',
            title: 'Stories',
            loadComponent: () =>
              lazy('pages/behavioral/story-bank.page', () => import('./pages/behavioral/story-bank.page')).then((m) => m.StoryBankPage),
          },
        ],
      },
      ...legacyBehavioralRoutes,
      {
        path: 'behavioral/:id',
        title: (route) => titles().then((t) => t.competencyTitle(route)),
        loadComponent: () =>
          withTitles(lazy('pages/behavioral/competency.page', () => import('./pages/behavioral/competency.page'))).then(
            (m) => m.CompetencyPage,
          ),
      },

      {
        path: 'mock/loop',
        title: 'Mock loop',
        loadComponent: () =>
          lazy('pages/interview/mock-loop.page', () => import('./pages/interview/mock-loop.page')).then((m) => m.MockLoopPage),
      },
      {
        path: 'mock',
        title: 'Mock',
        loadComponent: () =>
          lazy('pages/interview/interview-home.page', () => import('./pages/interview/interview-home.page')).then(
            (m) => m.InterviewHomePage,
          ),
        data: { preload: 0 },
      },
      {
        path: 'mock/:id',
        title: 'Mock interview',
        loadComponent: () =>
          lazy('pages/interview/interview-session.page', () => import('./pages/interview/interview-session.page')).then(
            (m) => m.InterviewSessionPage,
          ),
      },

      ...LEGACY_PREFIXES.map((path) => ({
        path,
        loadChildren: () => lazy('legacy-prefixes', () => import('./legacy-prefixes')).then((m) => m.legacyPrefixRoutes(path)),
      })),
      { path: '', pathMatch: 'full', redirectTo: 'today' },
    ],
  },
  { path: '**', redirectTo: 'today' },
];
