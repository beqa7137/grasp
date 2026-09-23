import { ErrorHandler, Injectable, inject } from '@angular/core';
import { RuntimeConfigService } from './runtime-config.service';

type Sentry = typeof import('@sentry/browser');
let sentry: Sentry | null = null;

/** Loads Sentry in its own chunk, and only when the deployment configures a DSN. */
export async function initErrorReporting(config: RuntimeConfigService): Promise<void> {
  const { sentryDsn, environment, release } = config.config();
  if (!sentryDsn) return;
  try {
    sentry = await import('@sentry/browser');
    sentry.init({
      dsn: sentryDsn,
      environment,
      release: release ?? undefined,
      dataCollection: { userInfo: false, cookies: false, httpBodies: [], urlQueryParams: false, stackFrameVariables: false },
    });
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
