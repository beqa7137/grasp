import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { closure, freshStats, outputOf } from './first-paint-bytes.mjs';

const APP = fileURLToPath(new URL('../', import.meta.url));
const ID = 'route-chunks';
/** The route files: every lazy import in them goes through `lazy`. */
export const ROUTE_FILES = ['app.routes.ts', 'legacy-routes.ts', 'legacy-prefixes.ts'];
/** The tabs load with the app shell, so they have nothing to fetch beside them. */
const SHELL = 'tabs/tabs.page';
const IMPORT = /import\(\s*'\.\/([^']+)'\s*\)/g;
const WRAPPED = /lazy\(\s*'([^']+)'\s*,\s*\(\)\s*=>\s*import\(\s*'\.\/([^']+)'\s*\)\s*,?\s*\)/g;
const BLOCK = new RegExp(String.raw`<script id="${ID}" type="application/json">[^<]*</script>`);

/** The modules the route sources load through `lazy`, by the name `lazy` is given (the path under src/app). */
export const wrappedModules = (sources) => [
  ...new Set(Object.values(sources).flatMap((text) => [...text.matchAll(WRAPPED)].map((m) => m[2]))),
];

/**
 * Every lazy import in the route files goes through `lazy`, naming the module it imports, so its chunks can be fetched
 * beside it. `sources` maps a file name to its text. Returns what is wrong, or nothing.
 */
export function unwrapped(sources) {
  return Object.entries(sources).flatMap(([file, text]) => {
    const misnamed = [...text.matchAll(WRAPPED)]
      .filter((m) => m[1] !== m[2])
      .map((m) => `${file}: lazy('${m[1]}', …) imports ./${m[2]}; name the module it imports.`);
    const bare = [...text.replace(WRAPPED, '').matchAll(IMPORT)]
      .map((m) => m[1])
      .filter((module) => module !== SHELL)
      .map((module) => `${file} imports ./${module} without lazy('${module}', …): its chunks would load a round trip later.`);
    return [...misnamed, ...bare];
  });
}

/**
 * Each lazily loaded module's static chunks outside the app shell (main and the tabs), by its path under src/app: what a
 * cold load would otherwise discover only after the module's own chunk arrives. Today is not left out, since a deep link
 * never loads it.
 */
export function routeChunks(stats, modules) {
  const shell = new Set(closure(stats, [outputOf(stats, 'src/main.ts'), outputOf(stats, `src/app/${SHELL}.ts`)]));
  const chunks = {};
  for (const module of modules) {
    const entry = outputOf(stats, `src/app/${module}.ts`);
    const files = closure(stats, [entry]).filter((path) => path !== entry && !shell.has(path));
    if (files.length) chunks[module] = files.sort();
  }
  return chunks;
}

export function withRouteChunks(html, chunks) {
  const block = `<script id="${ID}" type="application/json">${JSON.stringify(chunks)}</script>`;
  return BLOCK.test(html) ? html.replace(BLOCK, block) : html.replace('</head>', `${block}</head>`);
}

if (import.meta.main) {
  const sources = Object.fromEntries(ROUTE_FILES.map((file) => [file, readFileSync(`${APP}src/app/${file}`, 'utf8')]));
  const wrong = unwrapped(sources);
  if (wrong.length) {
    console.error(wrong.join('\n'));
    process.exit(1);
  }
  const dist = `${APP}dist/app/`;
  const stats = freshStats(dist);
  const chunks = routeChunks(stats, wrappedModules(sources));
  const index = `${dist}browser/index.html`;
  writeFileSync(index, withRouteChunks(readFileSync(index, 'utf8'), chunks));
  const files = new Set(Object.values(chunks).flat());
  console.log(`Route chunks: ${Object.keys(chunks).length} modules, ${files.size} chunks preloaded beside them`);
}
