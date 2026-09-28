/// <reference types="node" />
import { readFileSync } from 'node:fs';
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

/** App files the first paint loads: static imports only, since lazy routes are dynamic imports. */
function firstPaintFiles(): string[] {
  const seen = new Set<string>();
  const queue = [...FIRST_PAINT];
  while (queue.length) {
    const file = queue.pop()!;
    if (seen.has(file)) continue;
    seen.add(file);
    for (const [, , path] of imports(file, /\.[^']+/)) queue.push(posix.normalize(posix.join(posix.dirname(file), `${path}.ts`)));
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
      'codeSpans',
      'forecast',
      'getAlgorithmSummary',
      'getCaseSummary',
      'getCompetencySummary',
      'getPatternSummary',
      'getProblemSummary',
      'getScenarioSummary',
      'masteryByTopic',
      'missionRevisits',
      'planReminders',
      'replay',
      'trueRetention',
    ]);
  });
});
