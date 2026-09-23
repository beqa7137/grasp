import type { NestExpressApplication } from '@nestjs/platform-express';
import helmet from 'helmet';
import type { AppConfig } from './config.js';
import { requestContext } from './observability/request-context.js';
import { ReportExceptionsFilter } from './observability/report-exceptions.filter.js';
import { serveWebApp } from './web/serve-web-app.js';

/** HTTP pipeline shared by the server entry point and the e2e tests. */
export function configureApp(app: NestExpressApplication, config: AppConfig) {
  app.set('trust proxy', config.trustProxy);
  app.disable('x-powered-by');
  app.use(requestContext());
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          'connect-src': ["'self'", ...sentryOrigin(config.web.sentryDsn)],
          'upgrade-insecure-requests': null,
        },
      },
    }),
  );
  app.enableCors({
    origin: config.corsOrigins,
    allowedHeaders: ['content-type', 'x-learner-id', 'x-request-id'],
    exposedHeaders: ['x-request-id'],
    maxAge: 600,
  });
  app.useBodyParser('json', { limit: '256kb' });
  app.setGlobalPrefix('api');
  app.useGlobalFilters(new ReportExceptionsFilter(app.getHttpAdapter()));
  serveWebApp(app, config);
  app.enableShutdownHooks();
}

function sentryOrigin(dsn: string | null): string[] {
  return dsn ? [new URL(dsn).origin] : [];
}
