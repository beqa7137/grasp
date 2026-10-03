import type { Routes } from '@angular/router';

/** Titles need the catalogs, which load with the route rather than with the app. */
const titles = () => import('./route-titles');
/** Loads a titled page with its title, so preloading the page also keeps its title for an offline visit. */
const withTitles = <T>(page: Promise<T>) => Promise.all([page, titles()]).then(([m]) => m);

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./tabs/tabs.page').then((m) => m.TabsPage),
    children: [
      { path: 'learn', title: 'Learn', loadComponent: () => import('./pages/learn/learn.page').then((m) => m.LearnPage) },
      {
        path: 'learn/pattern/:id',
        title: (route) => titles().then((t) => t.patternTitle(route)),
        loadComponent: () => withTitles(import('./pages/pattern/pattern.page')).then((m) => m.PatternPage),
      },
      {
        path: 'learn/design/:id',
        title: (route) => titles().then((t) => t.topicTitle(route)),
        loadComponent: () => withTitles(import('./pages/design-lesson/design-lesson.page')).then((m) => m.DesignLessonPage),
      },
      {
        path: 'visualize',
        title: 'Visualize',
        loadComponent: () => import('./pages/visualize/visualize-list.page').then((m) => m.VisualizeListPage),
      },
      {
        path: 'visualize/:id',
        data: { focus: true },
        title: (route) => titles().then((t) => t.algorithmTitle(route)),
        loadComponent: () => withTitles(import('./pages/visualize/player.page')).then((m) => m.PlayerPage),
      },
      { path: 'design', title: 'Design Lab', loadComponent: () => import('./pages/design/design-list.page').then((m) => m.DesignListPage) },
      {
        path: 'design/case/:id',
        title: (route) => titles().then((t) => t.caseTitle(route)),
        loadComponent: () => withTitles(import('./pages/design/case/case-study.page')).then((m) => m.CaseStudyPage),
      },
      {
        path: 'design/:id',
        title: (route) => titles().then((t) => t.buildTitle(route)),
        loadComponent: () => withTitles(import('./pages/design/sandbox.page')).then((m) => m.SandboxPage),
      },
      {
        path: 'drill',
        title: (route) => (route.queryParamMap.has('pattern') ? 'Practice' : 'Review'),
        runGuardsAndResolvers: 'paramsOrQueryParamsChange',
        loadComponent: () => import('./pages/drill/drill.page').then((m) => m.DrillPage),
      },
      {
        path: 'diagnostic',
        title: 'Placement check',
        loadComponent: () => import('./pages/diagnostic/diagnostic.page').then((m) => m.DiagnosticPage),
      },
      {
        path: 'interview',
        title: 'Interview',
        loadComponent: () => import('./pages/interview/interview-home.page').then((m) => m.InterviewHomePage),
      },
      {
        path: 'interview/loop',
        title: 'Mock loop',
        loadComponent: () => import('./pages/interview/mock-loop.page').then((m) => m.MockLoopPage),
      },
      {
        path: 'interview/:id',
        title: 'Mock interview',
        loadComponent: () => import('./pages/interview/interview-session.page').then((m) => m.InterviewSessionPage),
      },
      {
        path: 'behavioral',
        title: 'Behavioral',
        loadComponent: () => import('./pages/behavioral/behavioral-list.page').then((m) => m.BehavioralListPage),
      },
      {
        path: 'behavioral/question/:id',
        title: 'Behavioral practice',
        loadComponent: () => import('./pages/behavioral/star-practice.page').then((m) => m.StarPracticePage),
      },
      {
        path: 'behavioral/stories',
        title: 'Story bank',
        loadComponent: () => import('./pages/behavioral/story-bank.page').then((m) => m.StoryBankPage),
      },
      {
        path: 'behavioral/mock',
        title: 'Mock behavioral interview',
        loadComponent: () => import('./pages/behavioral/behavioral-mock.page').then((m) => m.BehavioralMockPage),
      },
      {
        path: 'behavioral/rehearse',
        title: 'Rehearse stories',
        loadComponent: () => import('./pages/behavioral/rehearse.page').then((m) => m.RehearsePage),
      },
      {
        path: 'behavioral/stories/:id',
        title: 'Story',
        loadComponent: () => import('./pages/behavioral/story.page').then((m) => m.StoryPage),
      },
      {
        path: 'behavioral/:id',
        title: (route) => titles().then((t) => t.competencyTitle(route)),
        loadComponent: () => withTitles(import('./pages/behavioral/competency.page')).then((m) => m.CompetencyPage),
      },
      { path: 'code', title: 'Code', loadComponent: () => import('./pages/code/code-list.page').then((m) => m.CodeListPage) },
      {
        path: 'code/:id',
        title: (route) => titles().then((t) => t.problemTitle(route)),
        loadComponent: () => withTitles(import('./pages/code/workspace.page')).then((m) => m.WorkspacePage),
      },
      { path: 'plan', title: 'Study plan', loadComponent: () => import('./pages/plan/plan.page').then((m) => m.PlanPage) },
      { path: 'settings', title: 'Settings', loadComponent: () => import('./pages/settings/settings.page').then((m) => m.SettingsPage) },
      { path: '', pathMatch: 'full', redirectTo: 'learn' },
    ],
  },
  { path: '**', redirectTo: 'learn' },
];
