import assert from 'node:assert/strict';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, utimesSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';
import { SLACK, closure, defaultPage, freshStats, measure, problems } from './first-paint-bytes.mjs';

const APP = fileURLToPath(new URL('../', import.meta.url));
const ROUTES = `export const routes = [{ path: '', loadComponent: () => import('./tabs/tabs.page'), children: [
  { path: 'learn', title: 'Learn', loadComponent: () => import('./pages/learn/learn.page').then((m) => m.LearnPage) },
  { path: '', pathMatch: 'full', redirectTo: 'learn' },
] }];`;

const statically = (...paths) => paths.map((path) => ({ path, kind: 'import-statement' }));
const lazily = (...paths) => paths.map((path) => ({ path, kind: 'dynamic-import' }));

/** The shape of an esbuild metafile from `ng build --stats-json`: main, a chunk two entries share, the tabs, Learn and a lazy page. */
function stats() {
  return {
    outputs: {
      'main-A.js': {
        bytes: 500_000,
        entryPoint: 'src/main.ts',
        imports: [...statically('chunk-shared.js'), ...lazily('chunk-tabs.js', 'chunk-learn.js', 'chunk-player.js')],
        inputs: { 'src/main.ts': { bytesInOutput: 500_000 } },
      },
      'chunk-shared.js': { bytes: 100_000, imports: [], inputs: { '../../node_modules/@ionic/core/x.js': { bytesInOutput: 100_000 } } },
      'chunk-tabs.js': {
        bytes: 12_000,
        entryPoint: 'src/app/tabs/tabs.page.ts',
        imports: statically('chunk-shared.js'),
        inputs: {
          'src/app/tabs/tabs.page.ts': { bytesInOutput: 10_000 },
          'src/app/ui/mastery-ring.component.ts': { bytesInOutput: 2_000 },
        },
      },
      'chunk-learn.js': {
        bytes: 20_000,
        entryPoint: 'src/app/pages/learn/learn.page.ts',
        imports: [...statically('chunk-shared.js'), ...lazily('chunk-player.js')],
        inputs: {
          'src/app/pages/learn/learn.page.ts': { bytesInOutput: 18_600 },
          'src/app/viz/graph-view.component.ts': { bytesInOutput: 0 },
        },
      },
      'chunk-player.js': {
        bytes: 300_000,
        entryPoint: 'src/app/pages/visualize/player.page.ts',
        imports: statically('chunk-shared.js'),
        inputs: { 'src/app/viz/array-view.component.ts': { bytesInOutput: 300_000 } },
      },
      'styles-A.css': {
        bytes: 50_000,
        entryPoint: 'angular:styles/global:styles',
        imports: [{ path: 'media/inter.woff2', kind: 'url-token' }],
        inputs: {},
      },
    },
  };
}

const BASELINE = 682_000;

test('counts main, the tabs and the default page with their static imports, each chunk once, plus the global styles', () => {
  const measured = measure(stats(), ROUTES);
  assert.deepEqual(measured.files.sort(), ['chunk-learn.js', 'chunk-shared.js', 'chunk-tabs.js', 'main-A.js']);
  assert.equal(measured.jsBytes, 632_000);
  assert.equal(measured.bytes, BASELINE);
  assert.deepEqual(closure(stats(), ['chunk-tabs.js']).sort(), ['chunk-shared.js', 'chunk-tabs.js']);
});

test('passes within 2 kB of the baseline either way', () => {
  const measured = measure(stats(), ROUTES);
  assert.deepEqual(problems(measured, BASELINE - SLACK), []);
  assert.deepEqual(problems(measured, BASELINE + SLACK), []);
});

test('fails when the tabs chunk grows by 3 kB, and passes again without it', () => {
  const grown = stats();
  grown.outputs['chunk-tabs.js'].bytes += 3_000;
  const [problem, ...rest] = problems(measure(grown, ROUTES), BASELINE);
  assert.match(problem, /First paint is 685\.00 kB, \+3\.00 kB against its baseline of 682\.00 kB/);
  assert.match(problem, /raise the baseline: node scripts\/first-paint-bytes\.mjs --update/);
  assert.deepEqual(rest, []);
  assert.deepEqual(problems(measure(stats(), ROUTES), BASELINE), []);
});

test('fails when first paint shrinks more than 2 kB, so the freed room is not silent headroom', () => {
  const shrunk = stats();
  shrunk.outputs['chunk-learn.js'].bytes -= 2_001;
  assert.match(problems(measure(shrunk, ROUTES), BASELINE).join(), /-2\.00 kB against.*Lower the baseline/);
});

test('fails when tabs.page.ts imports a visualization module, directly or through a shared chunk', () => {
  for (const [output, input] of [
    ['chunk-tabs.js', 'src/app/viz/array-view.component.ts'],
    ['chunk-tabs.js', 'src/app/viz/kit/stage.ts'],
    ['chunk-shared.js', '../../libs/engine/dist/viz/layered.js'],
    ['chunk-learn.js', '../../libs/engine/src/viz/layout.ts'],
  ]) {
    const leaked = stats();
    leaked.outputs[output].inputs[input] = { bytesInOutput: 900 };
    assert.deepEqual(problems(measure(leaked, ROUTES), BASELINE), [
      `${input} is a visualization module in first paint: import it only from lazy routes.`,
    ]);
  }
});

test('a visualization module in a lazy chunk or tree-shaken away is no leak', () => {
  const measured = measure(stats(), ROUTES);
  assert.deepEqual(measured.viz, []);
  assert.deepEqual(problems(measured, BASELINE), []);
});

test('names an entry with no build output instead of measuring less', () => {
  const renamed = stats();
  delete renamed.outputs['chunk-tabs.js'].entryPoint;
  assert.throws(() => measure(renamed, ROUTES), /No build output has the entry point src\/app\/tabs\/tabs\.page\.ts/);
  assert.throws(() => measure(stats(), ROUTES.replace("redirectTo: 'learn'", "redirectTo: 'today'")), /no component for the default path/);
});

test('reads the default page from the real route table', () => {
  const page = defaultPage(readFileSync(`${APP}src/app/app.routes.ts`, 'utf8'));
  assert.ok(existsSync(APP + page), page);
});

test("Angular's initial budget, the backstop, never errors above 855 kB (REDESIGN.md 5.0)", () => {
  const { budgets } = JSON.parse(readFileSync(`${APP}angular.json`, 'utf8')).projects.app.architect.build.configurations.production;
  const initial = budgets.find((budget) => budget.type === 'initial');
  const kB = (size) => Number(/^([\d.]+)kB$/.exec(size)?.[1] ?? Infinity);
  assert.ok(kB(initial.maximumError) <= 855, `maximumError ${initial.maximumError}`);
  assert.ok(kB(initial.maximumWarning) <= kB(initial.maximumError), `maximumWarning ${initial.maximumWarning}`);
});

/** A built `dist`: index.html, two scripts, the global stylesheet and the stats that describe them, all at `at`. */
function builtDist(at = new Date('2026-10-16T10:00:00Z')) {
  const dist = `${mkdtempSync(join(tmpdir(), 'fresh-stats-'))}/`;
  mkdirSync(`${dist}browser`);
  const files = { 'index.html': '<html></html>', 'main-A.js': 'main', 'chunk-B.js': 'chunk', 'styles-C.css': 'body{}' };
  for (const [name, text] of Object.entries(files)) writeFileSync(`${dist}browser/${name}`, text);
  const described = {
    outputs: {
      'main-A.js': { bytes: 4, entryPoint: 'src/main.ts', imports: [], inputs: {} },
      'chunk-B.js': { bytes: 5, imports: [], inputs: {} },
      'styles-C.css': { bytes: 6, entryPoint: 'angular:styles/global:styles', imports: [], inputs: {} },
      'button.component-D.css': { bytes: 9, imports: [], inputs: {} },
    },
  };
  writeFileSync(`${dist}stats.json`, JSON.stringify(described));
  const touch = (path, time) => utimesSync(path, time, time);
  for (const name of Object.keys(files)) touch(`${dist}browser/${name}`, at);
  touch(`${dist}stats.json`, at);
  return { dist, touch };
}

test('reads stats whose files are all there at their size, whatever their times: equal to index.html, or older than the scripts', () => {
  const { dist, touch } = builtDist();
  assert.ok(freshStats(dist).outputs['main-A.js']);
  touch(`${dist}stats.json`, new Date('2026-10-16T09:59:59Z'));
  assert.ok(freshStats(dist).outputs['chunk-B.js'], 'Angular writes stats.json in the same batch as the scripts, in no fixed order');
});

test('refuses stats from an earlier build, even when they are newer, and a build without stats', () => {
  const { dist, touch } = builtDist();
  writeFileSync(`${dist}browser/chunk-B.js`, 'a rebuilt chunk');
  touch(`${dist}stats.json`, new Date('2026-10-16T11:00:00Z'));
  assert.throws(() => freshStats(dist), /stats.json is stale/);

  const gone = builtDist();
  const earlier = JSON.parse(readFileSync(`${gone.dist}stats.json`, 'utf8'));
  earlier.outputs['chunk-OLD.js'] = { bytes: 5, imports: [], inputs: {} };
  writeFileSync(`${gone.dist}stats.json`, JSON.stringify(earlier));
  assert.throws(() => freshStats(gone.dist), /stats.json is stale/);

  const none = builtDist();
  rmSync(`${none.dist}stats.json`);
  assert.throws(() => freshStats(none.dist), /stats.json is stale/);
});
