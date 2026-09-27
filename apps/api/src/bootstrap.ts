import type { NestExpressApplication } from '@nestjs/platform-express';
import type { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';
import type { AppConfig } from './config.js';
import { requestContext } from './observability/request-context.js';
import { ReportExceptionsFilter } from './observability/report-exceptions.filter.js';
import { serveWebApp } from './web/serve-web-app.js';

const PRIVATE_API = /^\/api\/(?:admin|auth|feedback|interview|me|progress)(?:\/|$)/;

/** HTTP pipeline shared by the server entry point and the e2e tests. */
export function configureApp(app: NestExpressApplication, config: AppConfig) {
  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');
  app.use(requestContext());
  app.use((req: Request, res: Response, next: NextFunction) => {
    if (PRIVATE_API.test(req.path)) res.setHeader('Cache-Control', 'no-store');
    next();
  });
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'connect-src': ["'self'", ...sentryOrigin(config.web.sentryDsn)],
          'upgrade-insecure-requests': null,
        },
      },
      // The web sign-in popup reports back to the page that opened it; `same-origin` would cut that link.
      crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' },
    }),
  );
  app.enableCors({
    origin: config.corsOrigins,
    allowedHeaders: ['authorization', 'cache-control', 'content-type', 'pragma', 'x-learner-id', 'x-request-id'],
    exposedHeaders: ['x-request-id'],
    maxAge: 600,
  });
  app.useBodyParser('json', { limit: '256kb' });
  // The GitHub sign-in token endpoint is posted to like any OAuth token endpoint, as a URL-encoded form.
  app.useBodyParser('urlencoded', { extended: false, limit: '16kb' });
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new ReportExceptionsFilter(app.getHttpAdapter()));
  serveWebApp(app, config);
  app.enableShutdownHooks();
}

function sentryOrigin(dsn: string | null): string[] {
  return dsn ? [new URL(dsn).origin] : [];
}
