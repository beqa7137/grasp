import { inject } from '@angular/core';
import { Router, type Routes } from '@angular/router';
import { drillLink } from './core/links';
import { keepQuery, type LegacyPrefix } from './legacy-routes';

const ROUTES: Record<LegacyPrefix, Routes> = {
  learn: [
    { path: '', pathMatch: 'full', redirectTo: '/today' },
    { path: 'pattern/:id', redirectTo: '/coding/patterns/:id' },
    { path: 'design/:id', redirectTo: '/design/topics/:id' },
  ],
  visualize: [
    { path: '', pathMatch: 'full', redirectTo: '/coding/visualizers' },
    { path: ':id', redirectTo: keepQuery(({ id }) => ['/coding/visualizers', id]) },
  ],
  drill: [
    {
      path: '',
      pathMatch: 'full',
      redirectTo: ({ queryParams }) => {
        const { pattern, ...query } = queryParams;
        return inject(Router).createUrlTree([typeof pattern === 'string' && pattern ? drillLink(pattern) : '/today/review'], {
          queryParams: query,
        });
      },
    },
  ],
  diagnostic: [{ path: '', pathMatch: 'full', redirectTo: '/coding/placement' }],
  interview: [
    { path: '', pathMatch: 'full', redirectTo: '/mock' },
    { path: 'loop', redirectTo: '/mock/loop' },
    { path: ':id', redirectTo: '/mock/:id' },
  ],
  code: [
    { path: '', pathMatch: 'full', redirectTo: '/coding/problems' },
    { path: ':id', redirectTo: '/coding/problems/:id' },
  ],
  plan: [{ path: '', pathMatch: 'full', redirectTo: '/today/plan' }],
  settings: [{ path: '', pathMatch: 'full', redirectTo: '/today/settings' }],
};

export const legacyPrefixRoutes = (prefix: LegacyPrefix): Routes => ROUTES[prefix];
