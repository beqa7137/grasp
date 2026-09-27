import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { test } from 'node:test';
import { writeErrorAssets } from './write-error-assets.mjs';

function fixture(t) {
  const directory = mkdtempSync(join(tmpdir(), 'grasp-error-assets-'));
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  return directory;
}

test('writes sorted real root JavaScript basenames and refreshes stale output', (t) => {
  const directory = fixture(t);
  for (const file of ['worker-C.js', 'main-B.js', 'chunk-A.js', 'theme-boot.js', 'main-B.js.map', 'index.html']) {
    writeFileSync(join(directory, file), '');
  }
  mkdirSync(join(directory, 'nested'));
  writeFileSync(join(directory, 'nested', 'private.js'), '');
  mkdirSync(join(directory, 'folder.js'));
  symlinkSync(join(directory, 'main-B.js'), join(directory, 'linked.js'));
  writeFileSync(join(directory, 'error-assets.json'), '{"version":0,"files":["stale.js"]}');

  writeErrorAssets(directory);

  assert.deepEqual(JSON.parse(readFileSync(join(directory, 'error-assets.json'), 'utf8')), {
    version: 1,
    files: ['chunk-A.js', 'main-B.js', 'theme-boot.js', 'worker-C.js'],
  });
});

test('rejects filenames that the client cannot safely recognize', (t) => {
  const directory = fixture(t);
  writeFileSync(join(directory, 'private..js'), '');

  assert.throws(() => writeErrorAssets(directory), /manifest limits/);
});

test('bounds the number of emitted assets', (t) => {
  const directory = fixture(t);
  for (let index = 0; index < 513; index++) writeFileSync(join(directory, `chunk-${index}.js`), '');

  assert.throws(() => writeErrorAssets(directory), /manifest limits/);
});

test('bounds the manifest bytes even when individual filenames are valid', (t) => {
  const directory = fixture(t);
  for (let index = 0; index < 512; index++) {
    const filename = `chunk-${String(index).padStart(3, '0')}-${'a'.repeat(115)}.js`;
    assert.equal(filename.length, 128);
    writeFileSync(join(directory, filename), '');
  }

  assert.throws(() => writeErrorAssets(directory), /size limit/);
});
