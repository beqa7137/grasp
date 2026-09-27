import { readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const MAX_BYTES = 64 * 1024;
const MAX_FILES = 512;
const FILENAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,124}\.js$/;

export function writeErrorAssets(directory = fileURLToPath(new URL('../dist/app/browser/', import.meta.url))) {
  const files = readdirSync(directory, { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith('.js'))
    .map((entry) => entry.name)
    .sort();
  if (files.length > MAX_FILES || files.some((file) => !FILENAME.test(file) || file.includes('..'))) {
    throw new Error('Emitted JavaScript assets exceed the manifest limits.');
  }
  const manifest = `${JSON.stringify({ version: 1, files })}\n`;
  if (Buffer.byteLength(manifest) > MAX_BYTES) throw new Error('JavaScript asset manifest exceeds its size limit.');
  writeFileSync(join(directory, 'error-assets.json'), manifest);
}

if (import.meta.main) writeErrorAssets();
