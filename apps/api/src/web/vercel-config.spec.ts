import { getTransformedRoutes } from '@vercel/routing-utils';
import { readFileSync } from 'node:fs';
import {
  HASHED_ASSET,
  IMMUTABLE_CACHE,
  PYODIDE_ASSET,
  PYODIDE_CORP,
  THEME_BOOT_CACHE,
  THEME_BOOT_SCRIPT,
  WORKER_CSP,
  WORKER_SCRIPT,
  cacheControlFor,
} from './asset-policy.js';

/**
 * vercel.json repeats the static-asset policy for Vercel's CDN. These tests compile it with Vercel's own
 * routing library and check every rule against asset-policy.ts, which the Docker server uses.
 */
const vercel = JSON.parse(readFileSync(new URL('../../../../vercel.json', import.meta.url), 'utf8'));
const { routes, error } = getTransformedRoutes(vercel);

interface CompiledRoute {
  src?: string;
  dest?: string;
  handle?: string;
  headers?: Record<string, string>;
}

const compiled = (routes ?? []) as CompiledRoute[];
const filesystemAt = compiled.findIndex((r) => r.handle === 'filesystem');

function headersFor(path: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const route of compiled.slice(0, filesystemAt)) {
    if (route.src && route.headers && new RegExp(route.src).test(path)) Object.assign(out, route.headers);
  }
  return out;
}

function rewriteFor(path: string): string | undefined {
  return compiled.slice(filesystemAt + 1).find((r) => r.src && r.dest && new RegExp(r.src).test(path))?.dest;
}

const hashed = [
  '/main-OEF7F2CC.js',
  '/styles-N4TSJ772.css',
  '/chunk-DGU2ZnzB.js',
  '/chunk-1-sdH-Ui2.js',
  '/chunk-B9s_q-cI.js',
  '/worker-3IBNIL7V.js',
  '/media/inter-latin-wght-normal-NRMW37G5.woff2',
];
const revalidated = [
  '/index.html',
  '/config.json',
  '/favicon.ico',
  '/pyodide/pyodide.mjs',
  '/pyodide/pyodide-lock.json',
  '/my-component.js',
];

describe('vercel.json', () => {
  it('compiles', () => {
    expect(error).toBeNull();
    expect(filesystemAt).toBeGreaterThan(0);
  });

  it('caches exactly the fingerprinted assets forever, like the Docker server', () => {
    for (const path of hashed) {
      expect(HASHED_ASSET.test(path), path).toBe(true);
      expect(headersFor(path)['Cache-Control'], path).toBe(IMMUTABLE_CACHE);
    }
    for (const path of revalidated) {
      expect(HASHED_ASSET.test(path), path).toBe(false);
      expect(headersFor(path)['Cache-Control'], path).not.toBe(IMMUTABLE_CACHE);
    }
  });

  it('keeps the theme script, which blocks the first paint, for a day, like the Docker server', () => {
    expect(THEME_BOOT_SCRIPT.test('/theme-boot.js')).toBe(true);
    expect(cacheControlFor('/theme-boot.js')).toBe(THEME_BOOT_CACHE);
    expect(headersFor('/theme-boot.js')['Cache-Control']).toBe(THEME_BOOT_CACHE);
    for (const path of [...hashed, ...revalidated]) {
      expect(THEME_BOOT_SCRIPT.test(path), path).toBe(false);
      expect(headersFor(path)['Cache-Control'], path).not.toBe(THEME_BOOT_CACHE);
    }
  });

  it('gives the code runner worker its own CSP and nothing else one', () => {
    expect(WORKER_SCRIPT.test('/worker-3IBNIL7V.js')).toBe(true);
    expect(headersFor('/worker-3IBNIL7V.js')['Content-Security-Policy']).toBe(WORKER_CSP);
    expect(headersFor('/main-OEF7F2CC.js')['Content-Security-Policy']).toBeUndefined();
  });

  it('lets native apps load the Python runtime cross-origin', () => {
    expect(PYODIDE_ASSET.test('/pyodide/pyodide.asm.wasm')).toBe(true);
    expect(headersFor('/pyodide/pyodide.asm.wasm')['Cross-Origin-Resource-Policy']).toBe(PYODIDE_CORP);
    expect(headersFor('/main-OEF7F2CC.js')['Cross-Origin-Resource-Policy']).toBeUndefined();
  });

  it('sends everything that is not a static file to the API function, which serves the page shell', () => {
    for (const path of [
      '/',
      '/learn',
      '/auth/callback',
      '/design/viral-feed',
      '/config.json',
      '/api/health',
      '/api/interview/sessions/x/messages',
    ]) {
      expect(rewriteFor(path), path).toBe('/api');
    }
    expect(vercel.functions['api/index.js'].includeFiles).toBe('apps/app/dist/app/server/**');
  });

  it('only deploys through the CI-gated workflow, in the database region, with room for a scoring call', () => {
    expect(vercel.git.deploymentEnabled).toBe(false);
    expect(vercel.regions).toEqual(['iad1']);
    expect(vercel.functions['api/index.js'].maxDuration).toBeGreaterThanOrEqual(240);
  });
});
