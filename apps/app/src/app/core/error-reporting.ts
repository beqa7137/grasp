import { ErrorHandler, Injectable, inject } from '@angular/core';
import type { Breadcrumb, Event } from '@sentry/capacitor';
import { RuntimeConfigService } from './runtime-config.service';

type Sentry = typeof import('@sentry/capacitor');
let sentry: Sentry | null = null;

/**
 * Loads Sentry in its own chunk, and only when the deployment configures a DSN. The Capacitor SDK adds
 * native crash reporting inside the iOS and Android apps and behaves like the browser SDK on the web.
 */
export async function initErrorReporting(config: RuntimeConfigService): Promise<void> {
  const { sentryDsn, environment, release } = config.config();
  if (!sentryDsn) return;
  try {
    const [capacitor, angular] = await Promise.all([import('@sentry/capacitor'), import('@sentry/angular')]);
    capacitor.init(
      {
        dsn: sentryDsn,
        environment,
        release: release ?? undefined,
        sendDefaultPii: false,
        beforeSend: withoutQueryStrings,
        beforeBreadcrumb: scrubBreadcrumb,
      },
      angular.init,
    );
    sentry = capacitor;
  } catch {
    sentry = null;
  }
}

@Injectable()
export class ReportingErrorHandler implements ErrorHandler {
  private readonly config = inject(RuntimeConfigService);

  handleError(error: unknown): void {
    console.error(error);
    if (this.config.config().sentryDsn) sentry?.captureException(error);
  }
}

const stripQuery = (url: string) => url.split(/[?#]/)[0];

export function withoutQueryStrings<T extends Event>(event: T): T {
  if (event.request?.url) event.request.url = stripQuery(event.request.url);
  if (event.request) delete event.request.query_string;
  event.breadcrumbs = event.breadcrumbs?.map(scrubBreadcrumb);
  return event;
}

function scrubBreadcrumb(breadcrumb: Breadcrumb): Breadcrumb {
  const data = breadcrumb.data;
  if (!data) return breadcrumb;
  for (const key of ['url', 'from', 'to']) {
    if (typeof data[key] === 'string') data[key] = stripQuery(data[key]);
  }
  return breadcrumb;
}
