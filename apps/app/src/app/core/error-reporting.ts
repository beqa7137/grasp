import { ErrorHandler, Injectable } from '@angular/core';
import type { RuntimeConfigService } from './runtime-config.service';
import { errorCategory } from './error-category';

const IMPORT_FAILED = 'Importing a module script failed.';

let report: ((error: unknown) => void) | null = null;
let leaving = false;

/**
 * Once the page starts to leave (`beforeunload`), WebKit cancels the module imports still loading and rejects them with
 * `IMPORT_FAILED`, and the router and Ionic hand those rejections to the error handler. They are the browser's, not the
 * app's, so they go unreported until the page is shown again (restored from the back-forward cache).
 */
export function watchPageLeave(page: EventTarget = window): void {
  page.addEventListener('beforeunload', () => (leaving = true));
  page.addEventListener('pageshow', () => (leaving = false));
}

export async function initErrorReporting(config: RuntimeConfigService): Promise<void> {
  report = null;
  const { sentryDsn, environment, release } = config.config();
  if (!sentryDsn) return;
  try {
    const [sdk, { createClientErrorPrivacy }, files] = await Promise.all([
      import('@sentry/angular'),
      import('./client-error-privacy'),
      import('./error-assets').then(({ loadErrorAssets }) => loadErrorAssets()),
    ]);
    const privacy = createClientErrorPrivacy({ environment, release }, files, sdk.defaultStackParser);
    const client = sdk.init({
      dsn: sentryDsn,
      environment,
      release: release ?? undefined,
      sendDefaultPii: false,
      defaultIntegrations: false,
      integrations: [sdk.dedupeIntegration()],
      sendClientReports: false,
      tracesSampleRate: 0,
      beforeSend: privacy.beforeSend,
      transport: (options) =>
        privacy.transport(sdk.makeFetchTransport({ ...options, fetchOptions: { credentials: 'omit', referrerPolicy: 'no-referrer' } })),
    });
    if (client) report = (error) => client.captureEvent(...privacy.capture(error));
  } catch {
    report = null;
  }
}

export function reportClientError(error: unknown, operation: 'application' | 'bootstrap' = 'application'): void {
  if (leaving && error instanceof TypeError && error.message === IMPORT_FAILED) return;
  console.error({ operation, category: errorCategory(error) });
  try {
    report?.(error);
  } catch {
    // Reporting failures must not re-enter Angular's error handler.
  }
}

@Injectable()
export class ReportingErrorHandler implements ErrorHandler {
  handleError(error: unknown): void {
    reportClientError(error);
  }
}
