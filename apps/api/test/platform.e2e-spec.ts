import type { NestExpressApplication } from '@nestjs/platform-express';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import request from 'supertest';
import { createTestApp } from './support/app.js';

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;

describe('HTTP platform', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp({ RELEASE: 'abc1234' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('reports liveness with the release and readiness without a database', async () => {
    const live = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(live.body).toMatchObject({ status: 'ok', storage: 'memory', release: 'abc1234' });
    const ready = await request(app.getHttpServer()).get('/api/health/ready').expect(200);
    expect(ready.body).toEqual({ status: 'ready', database: 'memory' });
  });

  it('sets security headers and hides the framework', async () => {
    const res = await request(app.getHttpServer()).get('/api/health').expect(200);
    expect(res.headers['x-powered-by']).toBeUndefined();
    expect(res.headers['x-content-type-options']).toBe('nosniff');
    expect(res.headers['content-security-policy']).toContain("default-src 'self'");
    expect(res.headers['content-security-policy']).not.toContain('upgrade-insecure-requests');
    expect(res.headers['strict-transport-security']).toBeDefined();
  });

  it('assigns request ids, reusing only well-formed upstream ids', async () => {
    const fresh = await request(app.getHttpServer()).get('/api/health');
    expect(fresh.headers['x-request-id']).toMatch(UUID);
    const reused = await request(app.getHttpServer()).get('/api/health').set('x-request-id', 'fly-req-42');
    expect(reused.headers['x-request-id']).toBe('fly-req-42');
    const replaced = await request(app.getHttpServer()).get('/api/health').set('x-request-id', '<script>alert(1)</script>');
    expect(replaced.headers['x-request-id']).toMatch(UUID);
  });

  it('answers CORS preflights for the app origins only', async () => {
    const ok = await request(app.getHttpServer())
      .options('/api/progress')
      .set('Origin', 'capacitor://localhost')
      .set('Access-Control-Request-Method', 'GET')
      .set('Access-Control-Request-Headers', 'x-learner-id');
    expect(ok.headers['access-control-allow-origin']).toBe('capacitor://localhost');
    const denied = await request(app.getHttpServer())
      .options('/api/progress')
      .set('Origin', 'https://evil.example')
      .set('Access-Control-Request-Method', 'GET');
    expect(denied.headers['access-control-allow-origin']).toBeUndefined();
  });

  it('rejects oversized request bodies', async () => {
    await request(app.getHttpServer())
      .post('/api/progress/events')
      .set('x-learner-id', '6f1c1c1e-8a4b-4c1d-9e3f-2a7b8c9d0e1f')
      .set('content-type', 'application/json')
      .send(JSON.stringify({ events: [], pad: 'x'.repeat(300_000) }))
      .expect(413);
  });
});

describe('Rate limiting', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp({ RATE_LIMIT_PER_MINUTE: '3', TRUST_PROXY: '1' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('limits each client IP separately and never throttles health checks', async () => {
    const hit = (ip: string) => request(app.getHttpServer()).get('/api/curriculum/patterns').set('X-Forwarded-For', ip);
    for (let i = 0; i < 3; i++) await hit('203.0.113.1').expect(200);
    const limited = await hit('203.0.113.1').expect(429);
    expect(limited.headers['retry-after']).toBeDefined();
    await hit('203.0.113.2').expect(200);
    for (let i = 0; i < 5; i++) await request(app.getHttpServer()).get('/api/health').set('X-Forwarded-For', '203.0.113.1').expect(200);
  });
});

describe('Serving the web app', () => {
  let app: NestExpressApplication;
  let dir: string;

  beforeAll(async () => {
    dir = mkdtempSync(join(tmpdir(), 'grasp-web-'));
    writeFileSync(join(dir, 'index.html'), '<!doctype html><title>Grasp</title>');
    writeFileSync(join(dir, 'main-ABCD1234.js'), 'console.log(1)');
    writeFileSync(join(dir, 'manifest.webmanifest'), '{}');
    writeFileSync(join(dir, 'worker-ABCD1234.js'), 'self.onmessage = () => {}');
    mkdirSync(join(dir, 'pyodide'));
    writeFileSync(join(dir, 'pyodide', 'pyodide.mjs'), 'export {}');
    app = await createTestApp({ WEB_DIST_DIR: dir, SENTRY_WEB_DSN: 'https://key@o1.ingest.sentry.io/2', RELEASE: 'abc1234' });
  });

  afterAll(async () => {
    await app.close();
    rmSync(dir, { recursive: true, force: true });
  });

  it('serves index.html for app routes so deep links work', async () => {
    for (const path of ['/', '/tabs/learn', '/pattern/sliding-window']) {
      const res = await request(app.getHttpServer()).get(path).set('Accept', 'text/html').expect(200);
      expect(res.text).toContain('<title>Grasp</title>');
      expect(res.headers['cache-control']).toBe('no-cache');
    }
  });

  it('caches fingerprinted assets for a year and revalidates the rest', async () => {
    const hashed = await request(app.getHttpServer()).get('/main-ABCD1234.js').expect(200);
    expect(hashed.headers['cache-control']).toBe('public, max-age=31536000, immutable');
    const plain = await request(app.getHttpServer()).get('/manifest.webmanifest').expect(200);
    expect(plain.headers['cache-control']).toBe('no-cache');
    await request(app.getHttpServer()).get('/missing-ABCD1234.js').expect(404);
  });

  it('generates runtime config for the web app from the server environment', async () => {
    const res = await request(app.getHttpServer()).get('/config.json').expect(200);
    expect(res.body).toEqual({
      apiUrl: null,
      sentryDsn: 'https://key@o1.ingest.sentry.io/2',
      environment: 'test',
      release: 'abc1234',
      pyodideUrl: null,
    });
    const page = await request(app.getHttpServer()).get('/').set('Accept', 'text/html');
    expect(page.headers['content-security-policy']).toContain("connect-src 'self' https://o1.ingest.sentry.io");
  });

  it('lets only the code-runner worker evaluate code, and shares the Python runtime cross-origin', async () => {
    const worker = await request(app.getHttpServer()).get('/worker-ABCD1234.js').expect(200);
    expect(worker.headers['content-security-policy']).toContain("'unsafe-eval' 'wasm-unsafe-eval'");
    const page = await request(app.getHttpServer()).get('/').set('Accept', 'text/html');
    expect(page.headers['content-security-policy']).not.toContain('unsafe-eval');
    const py = await request(app.getHttpServer()).get('/pyodide/pyodide.mjs').set('Origin', 'capacitor://localhost').expect(200);
    expect(py.headers['cross-origin-resource-policy']).toBe('cross-origin');
    expect(py.headers['access-control-allow-origin']).toBe('capacitor://localhost');
  });

  it('keeps API routes out of the fallback', async () => {
    const res = await request(app.getHttpServer()).get('/api/nope').set('Accept', 'text/html').expect(404);
    expect(res.headers['content-type']).toContain('application/json');
    await request(app.getHttpServer()).get('/api/health').expect(200);
  });
});

describe('Readiness with an unreachable database', () => {
  let app: NestExpressApplication;

  beforeAll(async () => {
    app = await createTestApp({ DATABASE_URL: 'postgresql://grasp:grasp@127.0.0.1:1/grasp' });
  });

  afterAll(async () => {
    await app.close();
  });

  it('stays live but reports not ready', async () => {
    await request(app.getHttpServer()).get('/api/health').expect(200);
    const res = await request(app.getHttpServer()).get('/api/health/ready').expect(503);
    expect(res.body).toMatchObject({ status: 'unavailable', database: 'unreachable' });
  });
});
