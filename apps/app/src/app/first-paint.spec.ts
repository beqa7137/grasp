/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { posix } from 'node:path';

const SRC = 'src/';

/** The default route renders the tabs and the learn page, so their chunks load with the first paint too. */
const FIRST_PAINT = ['main.ts', 'app/tabs/tabs.page.ts', 'app/pages/learn/learn.page.ts'];

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
  // Each name must come from a module the engine's first-paint spec keeps light; anything else ships content before first paint.
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
