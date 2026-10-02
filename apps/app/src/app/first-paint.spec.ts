/// <reference types="node" />
import { readFileSync, readdirSync } from 'node:fs';
import { posix } from 'node:path';

const SRC = 'src/';

/** The page the empty path redirects to renders inside the tabs, so both chunks load with the first paint too. */
function defaultPage(): string {
  const routes = readFileSync(SRC + 'app/app.routes.ts', 'utf8');
  const [, path] = routes.match(/\{\s*path: '',\s*pathMatch: 'full',\s*redirectTo: '([^']+)'\s*\}/)!;
  const [, page] = routes.match(new RegExp(String.raw`\{\s*path: '${path}',[^}]*?import\('\./([^']+)'\)`))!;
  return `app/${page}.ts`;
}

const FIRST_PAINT = ['main.ts', 'app/tabs/tabs.page.ts', defaultPage()];

function imports(file: string, from: RegExp): RegExpMatchArray[] {
  return [
    ...readFileSync(SRC + file, 'utf8').matchAll(new RegExp(String.raw`^import (?!type\b)([^;]*?) from '(${from.source})';$`, 'gms')),
  ];
}

/** App files that load with `entries`: static imports only, since lazy routes are dynamic imports. */
function appClosure(entries: string[]): string[] {
  const seen = new Set<string>();
  const queue = [...entries];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const [, , path] of imports(file, /\.[^']+/)) queue.push(posix.normalize(posix.join(posix.dirname(file), `${path}.ts`)));
  }
  return [...seen];
}

const firstPaintFiles = () => appClosure(FIRST_PAINT);

const ENGINE = '../../libs/engine/src/';
const engineFiles = () =>
  (readdirSync(ENGINE, { recursive: true }) as string[]).filter((f) => f.endsWith('.ts') && !/\.(spec|fixture)\.ts$/.test(f));

/** The engine module that defines `name`. */
function engineModuleOf(name: string): string {
  const definition = new RegExp(String.raw`^export (?:const|function|class|let) ${name}\b`, 'm');
  return engineFiles().find((f) => definition.test(readFileSync(ENGINE + f, 'utf8')))!;
}

/** Engine modules `entries` load at runtime; type-only imports vanish from the build. */
function engineClosure(entries: string[]): string[] {
  const seen = new Set<string>();
  const queue = [...entries];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    const source = readFileSync(ENGINE + file, 'utf8');
    for (const [, path] of source.matchAll(/^(?:import|export) (?!type\b)[^;]*? from '(\.[^']+)\.js';$/gms))
      queue.push(posix.normalize(posix.join(posix.dirname(file), `${path}.ts`)));
  }
  return [...seen];
}

function engineNames(file: string): string[] {
  return imports(file, /@grasp\/engine/).flatMap(([, names]) =>
    names
      .replace(/[{}]/g, '')
      .split(',')
      .map((n) => n.trim())
      .filter((n) => n && !n.startsWith('type ')),
  );
}

describe('first paint', () => {
  // Every name must come from a module in the engine first-paint spec's closure.
  it('takes only the progress reducer and light catalogs from the engine, never tracers, question builders or content', () => {
    const names = new Set(firstPaintFiles().flatMap(engineNames));
    expect([...names].sort()).toEqual([
      'ALGORITHM_CATALOG',
      'CODING_CATALOG',
      'PATTERN_CATALOG',
      'SCENARIO_CATALOG',
      'SD_TOPICS',
      'buildSession',
      'calendarDaysBetween',
      'codeSpans',
      'dayKey',
      'forecast',
      'getScenarioSummary',
      'masteryByTopic',
      'missionRevisits',
      'planReminders',
      'replay',
      'trueRetention',
    ]);
  });

  // Every titled route loads the titles chunk, so the Design Lab's component catalog must stay out of it.
  it('keeps the Design Lab component catalog out of route titles', () => {
    const modules = appClosure(['app/route-titles.ts']).flatMap(engineNames).map(engineModuleOf);
    expect(modules.every(Boolean)).toBe(true);
    expect(engineClosure(modules)).not.toContain('sysdesign/catalog.ts');
  });
});
