import type { Routes } from '@angular/router';
import { LEGACY_PREFIXES, legacyBehavioralRoutes, legacyDesignRoutes } from './legacy-routes';

/** Titles need the catalogs, which load with the route rather than with the app. */
const titles = () => import('./route-titles');
/** Loads a titled page with its title, so preloading the page also keeps its title for an offline visit. */
const withTitles = <T>(page: Promise<T>) => Promise.all([page, titles()]).then(([m]) => m);
const hub = () => import('./pages/hub/hub.page').then((m) => m.HubPage);
const map = () => import('./pages/hub/map.component').then((m) => m.MapComponent);
const designList = () => import('./pages/design/design-list.page').then((m) => m.DesignListPage);
const drill = () => import('./pages/drill/drill.page').then((m) => m.DrillPage);
const sandbox = () => withTitles(import('./pages/design/sandbox.page')).then((m) => m.SandboxPage);

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
      { path: 'today/plan', title: 'Study plan', loadComponent: () => import('./pages/plan/plan.page').then((m) => m.PlanPage) },
      {
        path: 'today/settings',
        title: 'Settings',
        loadComponent: () => import('./pages/settings/settings.page').then((m) => m.SettingsPage),
      },
      {
        path: 'today',
        title: 'Today',
        loadComponent: () => import('./pages/learn/learn.page').then((m) => m.LearnPage),
        data: { preload: 0 },
      },

      {
        path: 'coding/placement',
        title: 'Placement check',
        loadComponent: () => import('./pages/diagnostic/diagnostic.page').then((m) => m.DiagnosticPage),
      },
      {
        path: 'coding/problems/:id',
        data: { focus: true, preload: 1 },
        title: (route) => titles().then((t) => t.problemTitle(route)),
        loadComponent: () => withTitles(import('./pages/code/workspace.page')).then((m) => m.WorkspacePage),
      },
      {
        path: 'coding/visualizers/:id',
        data: { focus: true, preload: 1 },
        title: (route) => titles().then((t) => t.algorithmTitle(route)),
        loadComponent: () => withTitles(import('./pages/visualize/player.page')).then((m) => m.PlayerPage),
      },
      { path: 'coding/patterns/:pattern/drill', title: 'Practice', loadComponent: drill },
      {
        path: 'coding/patterns/:id',
        data: { preload: 1 },
        title: (route) => titles().then((t) => t.patternTitle(route)),
        loadComponent: () => withTitles(import('./pages/pattern/pattern.page')).then((m) => m.PatternPage),
      },
      {
        path: 'coding',
        title: 'Coding',
        loadComponent: hub,
        data: { preload: 0 },
        children: [
          { path: '', title: 'Skill map', loadComponent: map, data: { show: 'patterns', preload: 0 } },
          { path: 'problems', title: 'Problems', loadComponent: () => import('./pages/code/code-list.page').then((m) => m.CodeListPage) },
          {
            path: 'visualizers',
            title: 'Visualizers',
            loadComponent: () => import('./pages/visualize/visualize-list.page').then((m) => m.VisualizeListPage),
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
        loadComponent: () => withTitles(import('./pages/design/case/case-study.page')).then((m) => m.CaseStudyPage),
      },
      { path: 'design/topics/:pattern/drill', title: 'Practice', loadComponent: drill },
      {
        path: 'design/topics/:id',
        data: { preload: 1 },
        title: (route) => titles().then((t) => t.topicTitle(route)),
        loadComponent: () => withTitles(import('./pages/design-lesson/design-lesson.page')).then((m) => m.DesignLessonPage),
      },
      ...legacyDesignRoutes,
      {
        path: 'design',
        title: 'Design',
        loadComponent: hub,
        data: { preload: 0 },
        children: [
          { path: '', title: 'Topics', loadComponent: map, data: { show: 'topics', preload: 0 } },
          { path: 'missions', title: 'Missions', loadComponent: designList, data: { show: 'missions' } },
          { path: 'cases', title: 'Cases', loadComponent: designList, data: { show: 'cases' } },
        ],
      },

      {
        path: 'behavioral/rehearse',
        title: 'Rehearse stories',
        loadComponent: () => import('./pages/behavioral/rehearse.page').then((m) => m.RehearsePage),
      },
      {
        path: 'behavioral/drill',
        title: 'Mock behavioral interview',
        loadComponent: () => import('./pages/behavioral/behavioral-mock.page').then((m) => m.BehavioralMockPage),
      },
      {
        path: 'behavioral/question/:id',
        title: 'Behavioral practice',
        loadComponent: () => import('./pages/behavioral/star-practice.page').then((m) => m.StarPracticePage),
      },
      {
        path: 'behavioral/stories/:id',
        title: 'Story',
        loadComponent: () => import('./pages/behavioral/story.page').then((m) => m.StoryPage),
      },
      {
        path: 'behavioral',
        title: 'Behavioral',
        loadComponent: hub,
        data: { preload: 0, narrow: true },
        children: [
          {
            path: '',
            title: 'Competencies',
            loadComponent: () => import('./pages/behavioral/behavioral-list.page').then((m) => m.BehavioralListPage),
            data: { preload: 0 },
          },
          {
            path: 'stories',
            title: 'Stories',
            loadComponent: () => import('./pages/behavioral/story-bank.page').then((m) => m.StoryBankPage),
          },
        ],
      },
      ...legacyBehavioralRoutes,
      {
        path: 'behavioral/:id',
        title: (route) => titles().then((t) => t.competencyTitle(route)),
        loadComponent: () => withTitles(import('./pages/behavioral/competency.page')).then((m) => m.CompetencyPage),
      },

      {
        path: 'mock/loop',
        title: 'Mock loop',
        loadComponent: () => import('./pages/interview/mock-loop.page').then((m) => m.MockLoopPage),
      },
      {
        path: 'mock',
        title: 'Mock',
        loadComponent: () => import('./pages/interview/interview-home.page').then((m) => m.InterviewHomePage),
        data: { preload: 0 },
      },
      {
        path: 'mock/:id',
        title: 'Mock interview',
        loadComponent: () => import('./pages/interview/interview-session.page').then((m) => m.InterviewSessionPage),
      },

      ...LEGACY_PREFIXES.map((path) => ({ path, loadChildren: () => import('./legacy-prefixes').then((m) => m.legacyPrefixRoutes(path)) })),
      { path: '', pathMatch: 'full', redirectTo: 'today' },
    ],
  },
  { path: '**', redirectTo: 'today' },
];
