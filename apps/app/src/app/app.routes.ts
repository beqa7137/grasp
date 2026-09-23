import type { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: '',
    loadComponent: () => import('./tabs/tabs.page').then((m) => m.TabsPage),
    children: [
      { path: 'learn', loadComponent: () => import('./pages/learn/learn.page').then((m) => m.LearnPage) },
      { path: 'learn/pattern/:id', loadComponent: () => import('./pages/pattern/pattern.page').then((m) => m.PatternPage) },
      { path: 'visualize', loadComponent: () => import('./pages/visualize/visualize-list.page').then((m) => m.VisualizeListPage) },
      { path: 'visualize/:id', loadComponent: () => import('./pages/visualize/player.page').then((m) => m.PlayerPage) },
      { path: 'design', loadComponent: () => import('./pages/design/design-list.page').then((m) => m.DesignListPage) },
      { path: 'design/:id', loadComponent: () => import('./pages/design/sandbox.page').then((m) => m.SandboxPage) },
      { path: 'drill', loadComponent: () => import('./pages/drill/drill.page').then((m) => m.DrillPage) },
      { path: 'interview', loadComponent: () => import('./pages/interview/interview-home.page').then((m) => m.InterviewHomePage) },
      {
        path: 'interview/:id',
        loadComponent: () => import('./pages/interview/interview-session.page').then((m) => m.InterviewSessionPage),
      },
      { path: 'settings', loadComponent: () => import('./pages/settings/settings.page').then((m) => m.SettingsPage) },
      { path: '', pathMatch: 'full', redirectTo: 'learn' },
    ],
  },
  { path: '**', redirectTo: 'learn' },
];
