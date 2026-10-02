import { existsSync, readFileSync, statSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const APP = fileURLToPath(new URL('../', import.meta.url));
const BASELINE = fileURLToPath(new URL('first-paint-bytes.baseline.json', import.meta.url));

export const SLACK = 2000;
export const INITIAL_CAP = 855_000;
const VIZ = /^src\/app\/viz\/|\/libs\/engine\/(src|dist)\/viz\//;
/** Visualization modules first paint loads today. 3.3 moves mastery-ring to ui/; code-text leaves with Learn in R9. */
export const VIZ_ALLOWED = ['src/app/viz/mastery-ring.component.ts', 'src/app/viz/code-text.component.ts'];

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

function outputOf(stats, entryPoint) {
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
    initialBytes: size(closure(stats, [main])) + cssBytes,
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
  if (measured.initialBytes > INITIAL_CAP)
    found.push(`Angular's initial total is ${kB(measured.initialBytes)}, above the ${kB(INITIAL_CAP)} cap.`);
  for (const input of measured.viz.filter((path) => !VIZ_ALLOWED.includes(path))) {
    found.push(`${input} is a visualization module in first paint: import it only from lazy routes.`);
  }
  for (const input of VIZ_ALLOWED.filter((path) => !measured.viz.includes(path))) {
    found.push(`${input} is no longer in first paint: remove it from VIZ_ALLOWED.`);
  }
  return found;
}

/** Stats from an earlier build (a development build writes none) would measure the wrong files. */
function measureBuild(dist) {
  const file = `${dist}stats.json`;
  const browser = `${dist}browser/`;
  const stale = new Error('stats.json is stale: run a production build (npm run build -w @grasp/app).');
  if (!existsSync(file) || !existsSync(`${browser}index.html`)) throw stale;
  if (statSync(file).mtimeMs < statSync(`${browser}index.html`).mtimeMs) throw stale;
  const stats = JSON.parse(readFileSync(file, 'utf8'));
  const measured = measure(stats, readFileSync(`${APP}src/app/app.routes.ts`, 'utf8'));
  for (const path of [...measured.files, outputOf(stats, 'angular:styles/global:styles')]) {
    if (!existsSync(browser + path) || statSync(browser + path).size !== stats.outputs[path].bytes) throw stale;
  }
  return measured;
}

function report(measured, baseline) {
  const leaks = measured.viz.filter((path) => !VIZ_ALLOWED.includes(path)).length;
  return (
    `First paint ${kB(measured.bytes)}: JS ${kB(measured.jsBytes)} in ${measured.files.length} files + global CSS ${kB(measured.cssBytes)} ` +
    `(baseline ${kB(baseline)} ± ${kB(SLACK)}); Angular initial ${kB(measured.initialBytes)} (cap ${kB(INITIAL_CAP)}); ` +
    `${leaks ? `${leaks} viz leaks` : 'no viz leaks'} (${VIZ_ALLOWED.length} allowlisted)`
  );
}

if (import.meta.main) {
  const measured = measureBuild(`${APP}dist/app/`);
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
  }
}
