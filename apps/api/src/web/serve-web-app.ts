import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import express, { type NextFunction, type Request, type Response } from 'express';
import { existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { SIGN_IN_CALLBACK_PATH } from '../auth/sign-in-callback.js';
import type { AppConfig } from '../config.js';
import { PYODIDE_ASSET, PYODIDE_CORP, WORKER_CSP, WORKER_SCRIPT, cacheControlFor } from './asset-policy.js';

/**
 * Serves the built Angular app next to the API: fingerprinted assets are cached for a year, the theme script for a
 * day, everything else revalidates, and unknown non-API GETs fall back to index.html for client routing.
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
        res.setHeader('Cache-Control', cacheControlFor(path));
        if (WORKER_SCRIPT.test(path)) res.setHeader('Content-Security-Policy', WORKER_CSP);
        if (PYODIDE_ASSET.test(path)) res.setHeader('Cross-Origin-Resource-Policy', PYODIDE_CORP);
      },
    }),
  );

  app.use((req: Request, res: Response, next: NextFunction) => {
    const wantsPage = (req.method === 'GET' || req.method === 'HEAD') && req.accepts('html') === 'html';
    if (!wantsPage || req.path.startsWith('/api/') || req.path === '/api' || /\.[a-z0-9]+$/i.test(req.path)) return next();
    res.setHeader('Cache-Control', 'no-cache');
    // The sign-in popup lands here from Google or GitHub, whose pages send no COOP. Arriving on a page with a COOP
    // would move the popup into a new browsing context group and cut it off from the app window awaiting its result.
    if (req.path === SIGN_IN_CALLBACK_PATH) res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
    res.sendFile(index, (err) => err && next());
  });

  new Logger('WebApp').log(`Serving the web app from ${root}`);
}
