import type { Routes } from '@angular/router';
import { drillLink } from './core/links';
import { keepQuery, type LegacyPrefix } from './legacy-routes';

const ROUTES: Record<LegacyPrefix, Routes> = {
  learn: [
    { path: '', pathMatch: 'full', redirectTo: keepQuery(() => ['/today']) },
    { path: 'pattern/:id', redirectTo: keepQuery(({ id }) => ['/coding/patterns', id]) },
    { path: 'design/:id', redirectTo: keepQuery(({ id }) => ['/design/topics', id]) },
  ],
  visualize: [
    { path: '', pathMatch: 'full', redirectTo: keepQuery(() => ['/coding/visualizers']) },
    { path: ':id', redirectTo: keepQuery(({ id }) => ['/coding/visualizers', id]) },
  ],
  drill: [
    {
      path: '',
      pathMatch: 'full',
      redirectTo: (old) => {
        const pattern = old.queryParams['pattern'];
        return keepQuery(
          () => [typeof pattern === 'string' && pattern ? drillLink(pattern) : '/today/review'],
          ({ pattern: _, ...query }) => query,
        )(old);
      },
    },
  ],
  diagnostic: [{ path: '', pathMatch: 'full', redirectTo: keepQuery(() => ['/coding/placement']) }],
  interview: [
    { path: '', pathMatch: 'full', redirectTo: keepQuery(() => ['/mock']) },
    { path: 'loop', redirectTo: keepQuery(() => ['/mock/loop']) },
    { path: ':id', redirectTo: keepQuery(({ id }) => ['/mock', id]) },
  ],
  code: [
    { path: '', pathMatch: 'full', redirectTo: keepQuery(() => ['/coding/problems']) },
    { path: ':id', redirectTo: keepQuery(({ id }) => ['/coding/problems', id]) },
  ],
  plan: [{ path: '', pathMatch: 'full', redirectTo: keepQuery(() => ['/today/plan']) }],
  settings: [{ path: '', pathMatch: 'full', redirectTo: keepQuery(() => ['/today/settings']) }],
};

export const legacyPrefixRoutes = (prefix: LegacyPrefix): Routes => ROUTES[prefix];
