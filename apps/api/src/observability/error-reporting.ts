import { Logger } from '@nestjs/common';
import type { AppConfig } from '../config.js';

type Sentry = typeof import('@sentry/node');
let sentry: Sentry | null = null;

/** Loads Sentry only when a DSN is configured. Learner content (bodies, learner ids) is never sent. */
export async function initErrorReporting(config: AppConfig) {
  if (!config.sentryDsn) return;
  sentry = await import('@sentry/node');
  sentry.init({
    dsn: config.sentryDsn,
    environment: config.sentryEnvironment,
    release: config.release ?? undefined,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: { request: { deny: ['x-learner-id', 'authorization', 'cookie'] }, response: false },
      httpBodies: [],
      urlQueryParams: false,
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      stackFrameVariables: false,
    },
    beforeSend(event) {
      if (event.request) {
        delete event.request.data;
        delete event.request.cookies;
        if (event.request.headers) delete event.request.headers['x-learner-id'];
      }
      return event;
    },
  });
  new Logger('ErrorReporting').log('Sentry error reporting enabled.');
}

export function reportError(error: unknown, requestId?: string) {
  sentry?.captureException(error, requestId ? { tags: { requestId } } : undefined);
}

export async function flushErrorReporting() {
  await sentry?.flush(2_000);
}
