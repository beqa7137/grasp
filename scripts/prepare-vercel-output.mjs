// After `npm run build`, shapes the web build for Vercel: the page shell moves out of the CDN output so
// the function serves it with the API's security headers (CSP), and the development config.json goes so
// /config.json comes from the function's environment. The Docker image does not use this step.
import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs';

const browser = new URL('../apps/app/dist/app/browser/', import.meta.url);
const server = new URL('../apps/app/dist/app/server/', import.meta.url);

if (!existsSync(new URL('index.html', browser))) {
  console.error('apps/app/dist/app/browser/index.html is missing: run `npm run build` first.');
  process.exit(1);
}
rmSync(server, { recursive: true, force: true });
mkdirSync(server, { recursive: true });
renameSync(new URL('index.html', browser), new URL('index.html', server));
rmSync(new URL('config.json', browser), { force: true });
console.log('Vercel output ready: page shell moved to apps/app/dist/app/server, static config.json removed.');
