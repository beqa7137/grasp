// Writes config.json into the built web assets before `cap sync`, so native apps know which API to call.
import { writeFileSync } from 'node:fs';

const release = process.env.GRASP_RELEASE === '1';
const apiUrl = process.env.GRASP_API_URL || null;

if (release && !apiUrl?.startsWith('https://')) {
  console.error('Release builds need GRASP_API_URL set to an https URL, e.g. GRASP_API_URL=https://grasp.fly.dev/api');
  process.exit(1);
}

const config = {
  apiUrl,
  sentryDsn: process.env.GRASP_SENTRY_DSN || null,
  environment: release ? 'production' : 'development',
  release: process.env.GRASP_VERSION || null,
};
writeFileSync(new URL('../dist/app/browser/config.json', import.meta.url), `${JSON.stringify(config, null, 2)}\n`);
console.log(`Runtime config: API ${apiUrl ?? '(platform default)'}`);
