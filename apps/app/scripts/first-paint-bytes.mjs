import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { checkSearchChunks } from './search-chunk.mjs';

const APP = fileURLToPath(new URL('../', import.meta.url));
const BASELINE = fileURLToPath(new URL('first-paint-bytes.baseline.json', import.meta.url));

export const SLACK = 2000;
const VIZ = /^src\/app\/viz\/|\/libs\/engine\/(src|dist)\/viz\//;

export const kB = (bytes) => `${(bytes / 1000).toFixed(2)} kB`;
const signed = (bytes) => `${bytes < 0 ? '-' : '+'}${kB(Math.abs(bytes))}`;

/** The page the empty path redirects to, as `first-paint.spec.ts` reads it: it renders inside the tabs at first paint. */
export function defaultPage(routes) {
  const redirect = routes.match(/\{\s*path: '',\s*pathMatch: 'full',\s*redirectTo: '([^']+)'\s*\}/);
  if (!redirect) throw new Error('app.routes.ts: no redirect for the empty path');
  const page = routes.match(new RegExp(String.raw`\{\s*path: '${redirect[1]}',[^}]*?import\('\./([^']+)'\)`));
  if (!page) throw new Error(`app.routes.ts: no component for the default path '${redirect[1]}'`);
  return `src/app/${page[1]}.ts`;
}

export function outputOf(stats, entryPoint) {
  const output = Object.keys(stats.outputs).find((path) => stats.outputs[path].entryPoint === entryPoint);
  if (!output) throw new Error(`No build output has the entry point ${entryPoint}`);
  return output;
}

/** Outputs that load with `entries`: lazy routes and fonts are dynamic imports and url tokens, so only static imports count. */
export function closure(stats, entries) {
  const seen = new Set();
  const queue = [...entries];
  while (queue.length) {
    const path = queue.pop();
    if (seen.has(path)) continue;
    seen.add(path);
    for (const { path: next, kind } of stats.outputs[path].imports) if (kind === 'import-statement') queue.push(next);
  }
  return [...seen];
}

export function measure(stats, routes) {
  const main = outputOf(stats, 'src/main.ts');
  const styles = outputOf(stats, 'angular:styles/global:styles');
  const files = closure(stats, [main, outputOf(stats, 'src/app/tabs/tabs.page.ts'), outputOf(stats, defaultPage(routes))]);
  const size = (paths) => paths.reduce((sum, path) => sum + stats.outputs[path].bytes, 0);
  const inputs = files.flatMap((output) =>
    Object.entries(stats.outputs[output].inputs)
      .filter(([, { bytesInOutput }]) => bytesInOutput > 0)
      .map(([input, { bytesInOutput }]) => ({ input, bytes: bytesInOutput, output })),
  );
  const viz = [...new Set(inputs.filter(({ input }) => VIZ.test(input)).map(({ input }) => input))].sort();
  const cssBytes = stats.outputs[styles].bytes;
  return {
    files,
    jsBytes: size(files),
    cssBytes,
    bytes: size(files) + cssBytes,
    viz,
    largest: inputs.sort((a, b) => b.bytes - a.bytes).slice(0, 10),
  };
}

export function problems(measured, baseline) {
  const found = [];
  const delta = measured.bytes - baseline;
  if (Math.abs(delta) > SLACK) {
    found.push(
      `First paint is ${kB(measured.bytes)}, ${signed(delta)} against its baseline of ${kB(baseline)} (allowed ±${kB(SLACK)}). ` +
        `${delta > 0 ? 'If the growth is intended, raise' : 'Lower'} the baseline: node scripts/first-paint-bytes.mjs --update, and state it in docs/LOOP.md.`,
    );
  }
  for (const input of measured.viz) {
    found.push(`${input} is a visualization module in first paint: import it only from lazy routes.`);
  }
  return found;
}

/**
 * The stats of the build in `dist`, refusing stats from an earlier build, which would describe other files: every script
 * they name and the global stylesheet must be there at their size. A build empties `dist` first and names its files by
 * content hash, so stats left from another build name files that are gone or differ (a development build writes no stats
 * at all). No mtime is compared: Angular writes its outputs and stats.json in one batch in no fixed order, and the
 * postbuild rewrites index.html, so file times can tie or run either way within one build.
 */
export function freshStats(dist) {
  const file = `${dist}stats.json`;
  const browser = `${dist}browser/`;
  const stale = new Error('stats.json is stale: run a production build (npm run build -w @grasp/app).');
  if (!existsSync(file) || !existsSync(`${browser}index.html`)) throw stale;
  const stats = JSON.parse(readFileSync(file, 'utf8'));
  const scripts = Object.keys(stats.outputs).filter((path) => path.endsWith('.js'));
  for (const path of [...scripts, outputOf(stats, 'angular:styles/global:styles')]) {
    if (!existsSync(browser + path) || statSync(browser + path).size !== stats.outputs[path].bytes) throw stale;
  }
  return stats;
}

function report(measured, baseline) {
  const leaks = measured.viz.length;
  return (
    `First paint ${kB(measured.bytes)}: JS ${kB(measured.jsBytes)} in ${measured.files.length} files + global CSS ${kB(measured.cssBytes)} ` +
    `(baseline ${kB(baseline)} ± ${kB(SLACK)}); ` +
    `${leaks ? `${leaks} viz leaks` : 'no viz leaks'}`
  );
}

if (import.meta.main) {
  const stats = freshStats(`${APP}dist/app/`);
  const measured = measure(stats, readFileSync(`${APP}src/app/app.routes.ts`, 'utf8'));
  const baseline = existsSync(BASELINE) ? JSON.parse(readFileSync(BASELINE, 'utf8')).bytes : null;
  if (process.argv.includes('--update')) {
    const blocking = problems(measured, measured.bytes);
    if (blocking.length) {
      console.error(blocking.join('\n'));
      process.exit(1);
    }
    writeFileSync(BASELINE, `${JSON.stringify({ bytes: measured.bytes }, null, 2)}\n`);
    const change = baseline === null ? 'new' : `${baseline.toLocaleString('en-US')} B, ${signed(measured.bytes - baseline)}`;
    console.log(`First-paint baseline ${measured.bytes.toLocaleString('en-US')} B (${change})`);
  } else {
    if (baseline === null) throw new Error('No first-paint baseline: node scripts/first-paint-bytes.mjs --update');
    const found = problems(measured, baseline);
    console.log(report(measured, baseline));
    if (found.length) {
      console.error(found.join('\n'));
      console.error('Largest first-paint inputs:');
      for (const { input, bytes, output } of measured.largest) console.error(`  ${kB(bytes).padStart(10)}  ${input}  (${output})`);
      process.exitCode = 1;
    }
    // The search chunk's budget is a first-paint rule too (outside its closure), so it runs with this gate.
    if (!checkSearchChunks(stats, measured.files)) process.exitCode = 1;
  }
}
