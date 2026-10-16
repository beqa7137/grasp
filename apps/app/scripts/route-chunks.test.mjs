import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { ROUTE_FILES, routeChunks, unwrapped, withRouteChunks, wrappedModules } from './route-chunks.mjs';

const APP = fileURLToPath(new URL('../', import.meta.url));
const ROUTES = `const lazy = (module, load) => load();
const titles = () => lazy('route-titles', () => import('./route-titles'));
export const routes = [{ path: '', loadComponent: () => import('./tabs/tabs.page'), children: [
  { path: 'today', loadComponent: () => lazy('pages/today/today.page', () => import('./pages/today/today.page')) },
  { path: 'design', loadComponent: () =>
      lazy(
        'pages/design/hub.page',
        () => import('./pages/design/hub.page'),
      ) },
] }];`;

const statically = (...paths) => paths.map((path) => ({ path, kind: 'import-statement' }));
const output = (entryPoint, imports = []) => ({ bytes: 1000, entryPoint, imports: statically(...imports), inputs: {} });

/** main and the tabs share a chunk; Today has one of its own; the Design hub needs a kit chunk, which needs icons. */
const stats = () => ({
  outputs: {
    'main.js': output('src/main.ts', ['shared.js']),
    'shared.js': output(undefined),
    'tabs.js': output('src/app/tabs/tabs.page.ts', ['shared.js']),
    'today.js': output('src/app/pages/today/today.page.ts', ['shared.js', 'today-only.js']),
    'today-only.js': output(undefined),
    'hub.js': output('src/app/pages/design/hub.page.ts', ['shared.js', 'kit.js', 'today-only.js']),
    'kit.js': output(undefined, ['icons.js']),
    'icons.js': output(undefined),
    'titles.js': output('src/app/route-titles.ts', ['shared.js']),
  },
});

test("lists each module's static chunks outside the shell, deep ones and Today's too, and leaves out modules with none", () => {
  const modules = wrappedModules({ 'app.routes.ts': ROUTES });
  assert.deepEqual(modules, ['route-titles', 'pages/today/today.page', 'pages/design/hub.page']);
  assert.deepEqual(routeChunks(stats(), modules), {
    'pages/today/today.page': ['today-only.js'],
    'pages/design/hub.page': ['icons.js', 'kit.js', 'today-only.js'],
  });
});

test('fails on a lazy import that does not go through lazy, even when another route wraps it, or names another module', () => {
  assert.deepEqual(unwrapped({ 'app.routes.ts': ROUTES }), []);
  const bareToo = `${ROUTES}\nconst again = () => import('./pages/today/today.page');`;
  assert.equal(unwrapped({ 'app.routes.ts': bareToo }).length, 1);
  const misnamed = ROUTES.replace("lazy('pages/today/today.page'", "lazy('pages/other'");
  assert.equal(unwrapped({ 'app.routes.ts': misnamed }).length, 1);
  assert.equal(unwrapped({ 'legacy-prefixes.ts': "const x = () => import('./core/links');" }).length, 1);
});

test('writes the list into index.html once, replacing an earlier one', () => {
  const html = '<html><head><title>x</title></head><body></body></html>';
  const once = withRouteChunks(html, { a: ['1.js'] });
  assert.match(once, /<script id="route-chunks" type="application\/json">\{"a":\["1.js"\]\}<\/script><\/head>/);
  const twice = withRouteChunks(once, { b: ['2.js'] });
  assert.equal(twice.match(/route-chunks/g).length, 1);
  assert.match(twice, /\{"b":\["2.js"\]\}/);
});

test('every lazy import in the real route files goes through lazy', () => {
  const sources = Object.fromEntries(ROUTE_FILES.map((file) => [file, readFileSync(`${APP}src/app/${file}`, 'utf8')]));
  assert.deepEqual(unwrapped(sources), []);
  assert.ok(wrappedModules(sources).includes('route-titles'));
});
