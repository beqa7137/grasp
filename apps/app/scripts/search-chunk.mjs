import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { freshStats, kB, measure } from './first-paint-bytes.mjs';

const APP = fileURLToPath(new URL('../', import.meta.url));
/**
 * The search index, its scorer and the question prompts it reads (REDESIGN.md 2.9), budgeted at 40 kB minified. The light
 * catalogs it shares with the rest of the app are not counted: other pages load them too.
 */
export const BUDGET = 40_000;
const SEARCH = /\/libs\/engine\/(src|dist)\/(search\/(index\.data|rows|score|search)|behavioral\/question-prompts\.data)\./;

/** The chunks holding the engine's search modules and their generated data. */
export function searchChunks(stats) {
  const files = Object.keys(stats.outputs).filter((path) =>
    Object.entries(stats.outputs[path].inputs).some(([input, { bytesInOutput }]) => SEARCH.test(input) && bytesInOutput > 0),
  );
  return { files, bytes: files.reduce((sum, path) => sum + stats.outputs[path].bytes, 0) };
}

/** What is wrong with the search chunks, given the first-paint closure: nothing, or one line per problem. */
export function searchProblems(stats, firstPaint) {
  const found = [];
  const chunks = searchChunks(stats);
  if (!chunks.files.length) found.push('No chunk holds the search index: is it still imported?');
  for (const path of chunks.files.filter((p) => firstPaint.includes(p)))
    found.push(`${path} holds search modules and loads with first paint: import search only from lazy code.`);
  if (chunks.bytes > BUDGET) found.push(`The search chunks are ${kB(chunks.bytes)}, over their ${kB(BUDGET)} budget.`);
  return { chunks, found };
}

if (import.meta.main) {
  const stats = freshStats(`${APP}dist/app/`);
  const firstPaint = measure(stats, readFileSync(`${APP}src/app/app.routes.ts`, 'utf8')).files;
  const { chunks, found } = searchProblems(stats, firstPaint);
  console.log(`Search chunks ${kB(chunks.bytes)} in ${chunks.files.length} files (budget ${kB(BUDGET)}), outside first paint`);
  if (found.length) {
    console.error(found.join('\n'));
    process.exitCode = 1;
  }
}
