import { ErrorHandler, Injectable } from '@angular/core';
import type { RuntimeConfigService } from './runtime-config.service';
import { errorCategory } from './error-category';

let report: ((error: unknown) => void) | null = null;

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
