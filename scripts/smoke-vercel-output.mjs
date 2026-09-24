// Checks a `vercel build` output before it is deployed: the build settings Vercel will run with, the
// static output, and the function itself, served locally as plain Node against a real database.
// Needs DATABASE_URL (migrated) and JWT_SECRET; run from the repo root after `vercel build --prod`.
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';

const output = new URL('../.vercel/output/', import.meta.url);
const fn = new URL('functions/api/index.func/', output);
const checks = [];
const check = async (name, run) => {
  try {
    await run();
    checks.push(`ok    ${name}`);
  } catch (error) {
    checks.push(`FAIL  ${name}\n      ${error.message.split('\n').join('\n      ')}`);
  }
};

await check('function runs on Node 24 with streaming and without Vercel request helpers', () => {
  const config = JSON.parse(readFileSync(new URL('.vc-config.json', fn), 'utf8'));
  assert.equal(config.runtime, 'nodejs24.x');
  assert.equal(config.supportsResponseStreaming, true);
  assert.equal(config.shouldAddHelpers, false, 'build with NODEJS_HELPERS=0 so Express keeps its own req/res');
  assert.ok(config.maxDuration >= 240);
  assert.ok(config.filePathMap?.['apps/app/dist/app/server/index.html'], 'page shell must ship with the function');
});

await check('CDN output has the app but not the page shell or the development config.json', () => {
  const statics = new URL('static/', output);
  assert.ok(existsSync(new URL('pyodide/pyodide.mjs', statics)), 'Python runtime is served by the CDN');
  assert.ok(!existsSync(new URL('index.html', statics)), 'index.html must come from the function (CSP)');
  assert.ok(!existsSync(new URL('config.json', statics)), 'config.json must come from the function');
});

// Vercel ships includeFiles by path (filePathMap), not inside the function folder, so point at the project copy.
process.env.WEB_DIST_DIR = new URL('../apps/app/dist/app/server', import.meta.url).pathname;
process.env.NODE_ENV = 'production';
process.env.LOG_LEVEL ??= 'error';
const { default: handler } = await import(new URL('api/index.js', fn).href);
const server = createServer((req, res) => void handler(req, res));
await new Promise((resolve) => server.listen(0, resolve));
const base = `http://localhost:${server.address().port}`;
const learner = randomUUID();
const json = { 'content-type': 'application/json', 'x-learner-id': learner };

await check('serves the page shell with the strict CSP, for deep links too', async () => {
  for (const path of ['/', '/design/viral-feed']) {
    const res = await fetch(base + path, { headers: { accept: 'text/html' } });
    assert.equal(res.status, 200, path);
    assert.match(res.headers.get('content-security-policy') ?? '', /script-src 'self'/);
    assert.equal(res.headers.get('cache-control'), 'no-cache');
    assert.match(await res.text(), /<app-root/);
  }
});

await check('serves runtime config and health from the environment', async () => {
  const config = await (await fetch(`${base}/config.json`)).json();
  assert.equal(config.apiUrl, null);
  const ready = await fetch(`${base}/api/health/ready`);
  assert.equal(ready.status, 200);
  assert.deepEqual(await ready.json(), { status: 'ready', database: 'ok' });
});

await check('parses JSON bodies and answers unknown API routes with JSON 404s', async () => {
  const event = { id: `smoke-${randomUUID()}`, at: new Date().toISOString(), type: 'settings.changed', settings: { newPerDay: 5 } };
  const res = await fetch(`${base}/api/progress/events`, { method: 'POST', headers: json, body: JSON.stringify({ events: [event] }) });
  assert.equal(res.status, 200);
  assert.equal((await res.json()).accepted, 1);
  const missing = await fetch(`${base}/api/does-not-exist`);
  assert.equal(missing.status, 404);
  assert.equal((await missing.json()).statusCode, 404);
});

await check('streams interview replies as server-sent events', async () => {
  const session = await (
    await fetch(`${base}/api/interview/sessions`, { method: 'POST', headers: json, body: '{"track":"coding"}' })
  ).json();
  const res = await fetch(`${base}/api/interview/sessions/${session.id}/messages`, {
    method: 'POST',
    headers: json,
    body: JSON.stringify({ content: 'Let me clarify the constraints first.' }),
  });
  assert.equal(res.headers.get('content-type')?.split(';')[0], 'text/event-stream');
  let chunks = 0;
  let text = '';
  for await (const chunk of res.body) {
    chunks++;
    text += Buffer.from(chunk).toString();
  }
  assert.ok(chunks > 1, `expected an incremental stream, got ${chunks} chunk(s)`);
  assert.match(text, /event: done/);
});

server.close();
console.log(checks.join('\n'));
process.exit(checks.some((c) => c.startsWith('FAIL')) ? 1 : 0);
