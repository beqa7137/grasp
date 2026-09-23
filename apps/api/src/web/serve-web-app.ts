import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import type { AppConfig } from '../config.js';

const HASHED_ASSET = /-[A-Z0-9]{8,}\.(js|css|woff2?|png|svg|jpg|webp)$/i;
const WORKER_SCRIPT = /[/\\]worker-[A-Z0-9]+\.js$/i;
const PYODIDE_ASSET = /[/\\]pyodide[/\\]/;

/**
 * The code runner worker evaluates learner code and compiles the Python runtime to WebAssembly, so its
 * own policy allows eval; the page keeps the strict one. A worker's CSP comes from its own response.
 */
const WORKER_CSP = "default-src 'self'; script-src 'self' 'unsafe-eval' 'wasm-unsafe-eval'; connect-src 'self'; object-src 'none'";

/**
 * Serves the built Angular app next to the API: fingerprinted assets are cached for a year,
 * everything else revalidates, and unknown non-API GETs fall back to index.html for client routing.
 * `/config.json` is generated from the server environment so one build runs in every environment.
 */
export function serveWebApp(app: NestExpressApplication, config: AppConfig) {
  if (!config.webDistDir) return;
  const root = resolve(config.webDistDir);
  const index = join(root, 'index.html');
  if (!existsSync(index)) {
    new Logger('WebApp').warn(`WEB_DIST_DIR is set but ${index} does not exist; not serving the web app.`);
    return;
  }

  app.use('/config.json', (_req: Request, res: Response) => {
    res.setHeader('Cache-Control', 'no-cache');
    res.json({
      apiUrl: null,
      sentryDsn: config.web.sentryDsn,
      environment: config.sentryEnvironment,
      release: config.release,
      pyodideUrl: null,
    });
  });

  app.use(
    express.static(root, {
      index: false,
      setHeaders: (res, path) => {
        res.setHeader('Cache-Control', HASHED_ASSET.test(path) ? 'public, max-age=31536000, immutable' : 'no-cache');
        if (WORKER_SCRIPT.test(path)) res.setHeader('Content-Security-Policy', WORKER_CSP);
        // Native apps load the Python runtime from here cross-origin.
        if (PYODIDE_ASSET.test(path)) res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
      },
    }),
  );

  app.use((req: Request, res: Response, next: NextFunction) => {
    const wantsPage = (req.method === 'GET' || req.method === 'HEAD') && req.accepts('html') === 'html';
    if (!wantsPage || req.path.startsWith('/api/') || req.path === '/api' || /\.[a-z0-9]+$/i.test(req.path)) return next();
    res.setHeader('Cache-Control', 'no-cache');
    res.sendFile(index, (err) => err && next());
  });

  new Logger('WebApp').log(`Serving the web app from ${root}`);
}
