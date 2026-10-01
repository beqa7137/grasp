import { Logger } from '@nestjs/common';
import type { EventHint, ErrorEvent } from '@sentry/node';
import { waitUntil } from '@vercel/functions';
import type { AppConfig } from '../config.js';
import type { SignalReport } from './failure-signals.js';
import { createSentryPrivacy } from './sentry-privacy.js';

type Sentry = typeof import('@sentry/node');
let sentry: Sentry | null = null;
let privacy: ReturnType<typeof createSentryPrivacy> | null = null;

export async function initErrorReporting(config: AppConfig) {
  if (!config.sentryDsn) return;
  sentry = await import('@sentry/node');
  privacy = createSentryPrivacy(config, sentry.defaultStackParser);
  const boundary = privacy;
  sentry.init({
    dsn: config.sentryDsn,
    environment: config.sentryEnvironment,
    release: config.release ?? undefined,
    defaultIntegrations: false,
    debug: false,
    spotlight: false,
    sendClientReports: false,
    tracesSampleRate: 0,
    dataCollection: {
      userInfo: false,
      cookies: false,
      httpHeaders: false,
      httpBodies: [],
      urlQueryParams: false,
      genAI: { inputs: false, outputs: false },
      databaseQueryData: false,
      stackFrameVariables: false,
    },
    beforeSend: boundary.beforeSend,
    transport: (options) => boundary.transport(sentry!.makeNodeTransport(options)),
  });
  new Logger('ErrorReporting').log('Sentry error reporting enabled.');
}

export function reportError(error: unknown, requestId?: string) {
  if (privacy) send(privacy.capture(error, requestId));
}

export function reportSignal(report: SignalReport) {
  if (privacy) send(privacy.signal(report));
}

/** A Vercel instance can be frozen once its response is sent, so the delivery keeps the invocation alive. */
function send([event, hint]: [ErrorEvent, EventHint]) {
  sentry!.captureEvent(event, hint);
  waitUntil(sentry!.flush(2_000));
}

export async function flushErrorReporting() {
  await sentry?.flush(2_000);
}
