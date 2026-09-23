// Copies the Python runtime (Pyodide) into public/pyodide so the app can serve it from its own origin.
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const FILES = ['pyodide.mjs', 'pyodide.asm.mjs', 'pyodide.asm.wasm', 'python_stdlib.zip', 'pyodide-lock.json'];
const source = dirname(createRequire(import.meta.url).resolve('pyodide/package.json'));
const target = fileURLToPath(new URL('../public/pyodide/', import.meta.url));
const { version } = JSON.parse(readFileSync(join(source, 'package.json'), 'utf8'));
const stamp = join(target, 'VERSION');

if (existsSync(stamp) && readFileSync(stamp, 'utf8') === version) process.exit(0);
mkdirSync(target, { recursive: true });
for (const file of FILES) copyFileSync(join(source, file), join(target, file));
writeFileSync(stamp, version);
console.log(`Copied Pyodide ${version} into public/pyodide`);
