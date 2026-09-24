// Writes config.json into the built web assets before `cap sync`, so native apps know which API to call.
import { rmSync, writeFileSync } from 'node:fs';

const release = process.env.GRASP_RELEASE === '1';
const apiUrl = process.env.GRASP_API_URL || null;

if (release && !apiUrl?.startsWith('https://')) {
  console.error('Release builds need GRASP_API_URL set to an https URL, e.g. GRASP_API_URL=https://grasp.example.com/api');
  process.exit(1);
}

const config = {
  apiUrl,
  sentryDsn: process.env.GRASP_SENTRY_DSN || null,
  environment: release ? 'production' : 'development',
  release: process.env.GRASP_VERSION || null,
  // The Python runtime (~14 MB) is fetched from the server on first use instead of bloating the app bundle.
  pyodideUrl: apiUrl ? new URL('/pyodide/', apiUrl).href : null,
};
const web = new URL('../dist/app/browser/', import.meta.url);
writeFileSync(new URL('config.json', web), `${JSON.stringify(config, null, 2)}\n`);
if (apiUrl) rmSync(new URL('pyodide', web), { recursive: true, force: true });
console.log(`Runtime config: API ${apiUrl ?? '(platform default)'}`);
