import assert from 'node:assert/strict';
import { test } from 'node:test';
import { BUDGET, searchProblems } from './search-chunk.mjs';

const output = (bytes, inputs, imports = []) => ({
  bytes,
  imports: imports.map((path) => ({ path, kind: 'import-statement' })),
  inputs: Object.fromEntries(inputs.map((input) => [input, { bytesInOutput: bytes }])),
});

/** Main, a search chunk importing the prompts and a catalog chunk the rest of the app shares, and a lazy page. */
const stats = (searchBytes = 30_000) => ({
  outputs: {
    'main.js': output(500_000, ['src/main.ts'], ['chunk-shared.js']),
    'chunk-shared.js': output(9_000, ['../../libs/engine/dist/url-params.js']),
    'chunk-catalog.js': output(6_000, ['../../libs/engine/dist/algorithms/catalog.js']),
    'chunk-search.js': output(
      searchBytes,
      ['../../libs/engine/dist/search/index.data.js', '../../libs/engine/dist/search/score.js'],
      ['chunk-prompts.js', 'chunk-shared.js', 'chunk-catalog.js'],
    ),
    'chunk-prompts.js': output(8_000, ['../../libs/engine/dist/behavioral/question-prompts.data.js']),
    'chunk-page.js': output(20_000, ['src/app/pages/search/search.page.ts'], ['chunk-search.js']),
  },
});

test('counts the chunks holding the index, its scorer and the prompts, not the catalogs they share', () => {
  const { chunks, found } = searchProblems(stats(), ['main.js', 'chunk-shared.js']);
  assert.deepEqual(chunks.files.sort(), ['chunk-prompts.js', 'chunk-search.js']);
  assert.equal(chunks.bytes, 38_000);
  assert.deepEqual(found, []);
});

test('fails over the budget', () => {
  const { found } = searchProblems(stats(BUDGET), ['main.js', 'chunk-shared.js']);
  assert.match(found.join('\n'), /over their 40.00 kB budget/);
});

test('fails when search loads with first paint', () => {
  const { found } = searchProblems(stats(), ['main.js', 'chunk-shared.js', 'chunk-search.js']);
  assert.match(found.join('\n'), /chunk-search.js holds search modules and loads with first paint/);
});
