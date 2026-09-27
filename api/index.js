// Vercel Function behind every request that is not a static file: the API, /config.json and the page shell.
// Static assets are served by Vercel's CDN; see vercel.json and docs/DEPLOYMENT.md.
import { fileURLToPath } from 'node:url';
import { createRequestHandler } from '../apps/api/dist/serverless.js';

process.env.NODE_ENV = 'production';

// The page shell is moved out of the CDN output at build time (scripts/prepare-vercel-output.mjs), so it
// is served here with the API's security headers. Vercel's edge is the one proxy hop in front of us.
process.env.WEB_DIST_DIR ??= fileURLToPath(new URL('../apps/app/dist/app/server', import.meta.url));
process.env.TRUST_PROXY ??= '1';

// Interview replies stream as server-sent events.
export const config = { supportsResponseStreaming: true };

let ready;

export default async function handler(req, res) {
  ready ??= createRequestHandler().catch((error) => {
    ready = undefined;
    throw error;
  });
  let handle;
  try {
    handle = await ready;
  } catch (error) {
    console.error('Failed to start the API:', error);
    res.statusCode = 503;
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Retry-After', '5');
    res.end(JSON.stringify({ statusCode: 503, message: 'The service is starting up or misconfigured. Please try again shortly.' }));
    return;
  }
  handle(req, res);
}
