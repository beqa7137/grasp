import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { format, resolveConfig } from 'prettier';
import { questionPromptsSource, searchDataSource } from '../libs/engine/dist/search/build-index.js';

/** Writes the search index and the question prompts from the built engine (REDESIGN.md 2.9); run `npm run gen:search`. */
const files = {
  'libs/engine/src/search/index.data.ts': searchDataSource(),
  'libs/engine/src/behavioral/question-prompts.data.ts': questionPromptsSource(),
};
for (const [file, source] of Object.entries(files)) {
  const path = fileURLToPath(new URL(`../${file}`, import.meta.url));
  writeFileSync(path, await format(source, { ...(await resolveConfig(path)), filepath: path }));
  console.log(`Wrote ${file}`);
}
