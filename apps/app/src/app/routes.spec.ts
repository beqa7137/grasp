/// <reference types="node" />
import { readFileSync, readdirSync } from 'node:fs';
import type { Route } from '@angular/router';
import { COMPETENCY_CATALOG, SCENARIO_CATALOG } from '@grasp/engine';
import { routes } from './app.routes';
import { LEGACY_PREFIXES } from './legacy-routes';

const TABS = ['today', 'coding', 'design', 'behavioral', 'mock'];
const tabRoutes = routes[0].children!;
/** The only route without a path is the old mission URL's matcher, in Design. */
const tabOf = (route: Route) => (route.matcher ? 'design' : route.path!.split('/')[0]);
const isRedirect = (route: Route) => route.redirectTo !== undefined;

/** 2.5's order inside a tab: literal details, parameterized details, the hub, inline legacy routes, the last resort. */
function rank(route: Route): number {
  const path = route.path ?? '';
  if (isRedirect(route)) return tabOf(route) === 'design' ? 1.5 : 3;
  if (path === tabOf(route)) return 2;
  if (/^(behavioral|mock)\/:id$/.test(path)) return 4;
  return path.includes(':') ? 1 : 0;
}

describe('routes', () => {
  it('lights exactly one tab on every page: its first segment', () => {
    const pages = tabRoutes.filter((r) => r.loadComponent);
    expect(pages.length).toBeGreaterThan(25);
    for (const route of pages) expect(TABS, route.path).toContain(tabOf(route));
  });

  it('declares each tab in the order of REDESIGN.md 2.5', () => {
    const tabbed = tabRoutes.filter((r) => !r.loadChildren && r.path !== '');
    for (const tab of TABS) {
      const ranks = tabbed.filter((r) => tabOf(r) === tab).map(rank);
      expect(ranks, tab).toEqual([...ranks].sort((a, b) => a - b));
      expect(
        ranks.filter((r) => r === 2),
        tab,
      ).toHaveLength(1);
    }
    expect(tabRoutes.findIndex((r) => r.path === 'behavioral/mock')).toBeLessThan(tabRoutes.findIndex((r) => r.path === 'behavioral/:id'));
  });

  it('puts details first, so /coding/problems falls through to the hub segment', () => {
    const at = (path: string) => tabRoutes.findIndex((r) => r.path === path);
    expect(at('coding/problems/:id')).toBeLessThan(at('coding'));
    expect(at('coding/visualizers/:id')).toBeLessThan(at('coding'));
    expect(tabRoutes.find((r) => r.path === 'coding')!.children!.map((c) => c.path)).toEqual(['', 'problems', 'visualizers']);
  });

  it('loads the legacy prefixes on demand, after every new route and before the default', () => {
    const lazy = tabRoutes.filter((r) => r.loadChildren).map((r) => r.path);
    expect(lazy).toEqual([...LEGACY_PREFIXES]);
    const first = tabRoutes.findIndex((r) => r.loadChildren);
    expect(tabRoutes.slice(first, -1).every((r) => r.loadChildren)).toBe(true);
    expect(tabRoutes.at(-1)).toEqual({ path: '', pathMatch: 'full', redirectTo: 'today' });
    expect(routes.at(-1)).toEqual({ path: '**', redirectTo: 'today' });
  });

  it('keeps reserved words out of the ids that share a URL position with them', () => {
    const competencies = COMPETENCY_CATALOG.map((c) => c.id);
    for (const word of ['questions', 'stories', 'guide', 'drill', 'question', 'rehearse', 'mock']) expect(competencies).not.toContain(word);
    const scenarios = SCENARIO_CATALOG.map((s) => s.id);
    for (const word of ['topics', 'missions', 'cases', 'lab', 'case', 'free-build']) expect(scenarios).not.toContain(word);
    // A mock session id is a UUID, so never `loop`.
    expect(readFileSync('../api/src/interview/interview.service.ts', 'utf8')).toMatch(/^\s+id: randomUUID\(\),$/m);
  });

  it('links to no old URL outside the legacy routes', () => {
    const OLD =
      /['"`](?:\/(?:learn|visualize|drill|diagnostic|interview|code|plan|settings)(?=[/'"`?#])(?!\/(?:sessions|problems|access)\b)|\/design\/case\/|\/design\/free-build|\/behavioral\/mock)|\['\/design', /;
    const ALLOWED = /(^|\/)(legacy-routes\.ts|legacy-prefixes\.ts|routes\.spec\.ts|legacy-links\.spec\.ts)$/;
    const files = ['src', '../../libs/engine/src', '../../tools/verify', '../../e2e/tests'].flatMap((dir) =>
      (readdirSync(dir, { recursive: true }) as string[]).filter((f) => /\.(ts|html|mjs)$/.test(f)).map((f) => `${dir}/${f}`),
    );
    expect(files.length).toBeGreaterThan(300);
    const found = files
      .filter((file) => !ALLOWED.test(file))
      .flatMap((file) =>
        readFileSync(file, 'utf8')
          .split('\n')
          .map((line, i) => ({ file, line: i + 1, text: line.trim() }))
          .filter(({ text }) => OLD.test(text)),
      );
    expect(found).toEqual([]);
  });
});
