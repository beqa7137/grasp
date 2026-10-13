import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { test } from 'node:test';
import { fileURLToPath } from 'node:url';

const SRC = fileURLToPath(new URL('../src/', import.meta.url));
const LIST = fileURLToPath(new URL('./ionicons-glyphs.json', import.meta.url));

const files = (dir) =>
  readdirSync(dir, { withFileTypes: true }).flatMap((e) =>
    e.isDirectory() ? files(join(dir, e.name)) : e.name.endsWith('.ts') && !e.name.endsWith('.spec.ts') ? [join(dir, e.name)] : [],
  );

/** Every glyph imported from `ionicons/icons` anywhere in the app. */
export function glyphs() {
  const names = new Set();
  for (const file of files(SRC))
    for (const [, list] of readFileSync(file, 'utf8').matchAll(/import\s*\{([^}]*)\}\s*from\s*'ionicons\/icons'/g))
      for (const name of list
        .split(',')
        .map((n) => n.trim())
        .filter(Boolean))
        names.add(name);
  return [...names].sort();
}

// ionicons/icons is one module, so the glyph data of every icon imported anywhere, even by a lazy page, ships in a
// first-paint chunk (about 0.4 kB each). A new glyph is a first-paint change: reuse one on this list, or add it here on
// purpose and state the growth in docs/LOOP.md.
test('the app imports only the glyphs on the list, so no icon grows first paint unnoticed', () => {
  assert.deepEqual(glyphs(), JSON.parse(readFileSync(LIST, 'utf8')));
});
