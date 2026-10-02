/// <reference types="node" />
import { readFileSync, readdirSync } from 'node:fs';
import { posix } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const SRC = fileURLToPath(new URL('.', import.meta.url));

/** What the app runs before its first paint: the progress reducer, plus what the first route's title and the learn page read. */
const FIRST_PAINT = [
  'srs/progress.ts',
  'srs/session.ts',
  'srs/reminders.ts',
  'algorithms/catalog.ts',
  'behavioral/catalog.ts',
  'code-spans.ts',
  'coding/catalog.ts',
  'curriculum/catalog.ts',
  'curriculum/sd-topics.ts',
  'review/catalog.ts',
  'sysdesign/scenario-catalog.ts',
  'sysdesign/case-catalog.ts',
];

function resolve(file: string, specifier: string): string {
  return posix.normalize(posix.join(posix.dirname(file), `${specifier}.ts`));
}

/** Modules a file loads at runtime; type-only imports vanish from the build, so they are skipped. */
function runtimeImports(file: string): string[] {
  const source = readFileSync(SRC + file, 'utf8');
  return [...source.matchAll(/^(?:import|export) (?!type\b)[^;]*? from '(\.[^']+)\.js';$/gms)].map((m) => resolve(file, m[1]));
}

type ReExport = [barrel: string, module: string];

function namedReExports(): ReExport[] {
  const files = (readdirSync(SRC, { recursive: true }) as string[]).filter((f) => f.endsWith('.ts') && !f.endsWith('.spec.ts'));
  return files.flatMap((file) => {
    const source = readFileSync(SRC + file, 'utf8');
    return [...source.matchAll(/^export (?!type\b)\{[^}]*\} from '(\.[^']+)\.js';$/gm)].map((m): ReExport => [file, resolve(file, m[1])]);
  });
}

function closure(entries: string[]): string[] {
  const seen = new Set<string>();
  const queue = [...entries];
  while (queue.length) {
    const file = queue.pop()!;
    if (!seen.has(file)) {
      seen.add(file);
      queue.push(...runtimeImports(file));
    }
  }
  return [...seen].sort();
}

describe('first paint', () => {
  // The app bundler places a module whole, so one import of content from any of these would ship it before first paint.
  it('loads only the reducer and the light catalogs, never tracers, question builders, content or the simulator', () => {
    expect(closure(FIRST_PAINT)).toEqual([
      'algorithms/catalog.ts',
      'algorithms/patterns.ts',
      'algorithms/random.ts',
      'behavioral/catalog.ts',
      'code-spans.ts',
      'coding/catalog.ts',
      'coding/problem-patterns.ts',
      'curriculum/catalog.ts',
      'curriculum/sd-topics.ts',
      'plan/options.ts',
      'review/catalog.ts',
      'review/random.ts',
      'review/summaries.ts',
      'srs/diagnostic.ts',
      'srs/events.ts',
      'srs/progress.ts',
      'srs/reminders.ts',
      'srs/scheduler.ts',
      'srs/session.ts',
      'srs/settings.ts',
      'sysdesign/case-catalog.ts',
      'sysdesign/mission-goals.ts',
      'sysdesign/scenario-catalog.ts',
      'sysdesign/scenario-revisits.ts',
    ]);
  });

  // A named re-export makes the barrel itself part of every page that imports one of those names, so the page also loads
  // everything else that barrel re-exports. `export *` resolves each name straight to its module.
  it('barrels re-export every module with export *, so a page importing one name loads only the module that defines it', () => {
    expect(namedReExports()).toEqual([]);
  });
});
