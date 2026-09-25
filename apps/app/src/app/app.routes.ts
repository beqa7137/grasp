import type { ActivatedRouteSnapshot, Routes } from '@angular/router';
import { getAlgorithmSummary, getPatternSummary, getProblemSummary, getScenarioSummary } from '@grasp/engine';
import { FREE_BUILD } from './pages/design/free-build';

const idOf = (route: ActivatedRouteSnapshot) => route.paramMap.get('id') ?? '';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./tabs/tabs.page').then((m) => m.TabsPage),
    children: [
      { path: 'learn', title: 'Learn', loadComponent: () => import('./pages/learn/learn.page').then((m) => m.LearnPage) },
      {
        path: 'learn/pattern/:id',
        title: (route) => {
          const pattern = getPatternSummary(idOf(route));
          return pattern ? `${pattern.name} pattern` : 'Pattern';
        },
        loadComponent: () => import('./pages/pattern/pattern.page').then((m) => m.PatternPage),
      },
      {
        path: 'visualize',
        title: 'Visualize',
        loadComponent: () => import('./pages/visualize/visualize-list.page').then((m) => m.VisualizeListPage),
      },
      {
        path: 'visualize/:id',
        title: (route) => getAlgorithmSummary(idOf(route))?.title ?? 'Visualizer',
        loadComponent: () => import('./pages/visualize/player.page').then((m) => m.PlayerPage),
      },
      { path: 'design', title: 'Design Lab', loadComponent: () => import('./pages/design/design-list.page').then((m) => m.DesignListPage) },
      {
        path: 'design/:id',
        title: (route) => (idOf(route) === FREE_BUILD.id ? FREE_BUILD : getScenarioSummary(idOf(route)))?.title ?? 'Design Lab',
        loadComponent: () => import('./pages/design/sandbox.page').then((m) => m.SandboxPage),
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
        path: 'interview/:id',
        title: 'Mock interview',
        loadComponent: () => import('./pages/interview/interview-session.page').then((m) => m.InterviewSessionPage),
      },
      { path: 'code', title: 'Code', loadComponent: () => import('./pages/code/code-list.page').then((m) => m.CodeListPage) },
      {
        path: 'code/:id',
        title: (route) => getProblemSummary(idOf(route))?.title ?? 'Code',
        loadComponent: () => import('./pages/code/workspace.page').then((m) => m.WorkspacePage),
      },
      { path: 'settings', title: 'Settings', loadComponent: () => import('./pages/settings/settings.page').then((m) => m.SettingsPage) },
      { path: '', pathMatch: 'full', redirectTo: 'learn' },
    ],
  },
  { path: '**', redirectTo: 'learn' },
];
