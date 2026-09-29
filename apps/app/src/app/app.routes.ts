import type { ActivatedRouteSnapshot, Routes } from '@angular/router';
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
        path: 'learn/design/:id',
        title: (route) => getSdTopic(idOf(route))?.name ?? 'System design',
        loadComponent: () => import('./pages/design-lesson/design-lesson.page').then((m) => m.DesignLessonPage),
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
        path: 'design/case/:id',
        title: (route) => getCaseSummary(idOf(route))?.title ?? 'Case study',
        loadComponent: () => import('./pages/design/case/case-study.page').then((m) => m.CaseStudyPage),
      },
      {
        path: 'design/:id',
        title: (route) => {
          if (idOf(route) !== FREE_BUILD.id) return getScenarioSummary(idOf(route))?.title ?? 'Design Lab';
          const study = getCaseSummary(route.queryParamMap.get('case') ?? '');
          return study ? `${study.title} build` : FREE_BUILD.title;
        },
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
        title: (route) => getCompetencySummary(idOf(route))?.name ?? 'Behavioral',
        loadComponent: () => import('./pages/behavioral/competency.page').then((m) => m.CompetencyPage),
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
