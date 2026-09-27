import { Logger } from '@nestjs/common';
import { loadConfig } from '../config.js';
import { flushErrorReporting, initErrorReporting, reportError } from './error-reporting.js';

const sdk = vi.hoisted(() => ({ init: vi.fn(), captureEvent: vi.fn(), flush: vi.fn() }));
vi.mock('@sentry/node', async (original) => ({ ...(await original<typeof import('@sentry/node')>()), ...sdk }));

it('keeps reporting opt-in and applies the privacy boundary to explicitly reported errors', async () => {
  vi.spyOn(Logger.prototype, 'log').mockImplementation(() => {});
  await initErrorReporting(loadConfig({}));
  reportError(new Error('private learner answer'));
  expect(sdk.init).not.toHaveBeenCalled();
  expect(sdk.captureEvent).not.toHaveBeenCalled();

  await initErrorReporting(loadConfig({ SENTRY_DSN: 'https://public@errors.example/1', RELEASE: 'abc1234' }));
  expect(sdk.init).toHaveBeenCalledWith(
    expect.objectContaining({
      defaultIntegrations: false,
      debug: false,
      spotlight: false,
      sendClientReports: false,
      tracesSampleRate: 0,
      dataCollection: expect.objectContaining({ httpHeaders: false, databaseQueryData: false, userInfo: false }),
      beforeSend: expect.any(Function),
      transport: expect.any(Function),
    }),
  );
  const error = new TypeError('private learner answer', { cause: new Error('secret token') });
  const requestId = '6e206bb4-f190-4a7a-b4f6-bb2cfefc3478';
  reportError(error, requestId);
  const [event, hint] = sdk.captureEvent.mock.calls[0]!;
  expect(event.tags).toEqual({ category: 'type', code: 'unknown', requestId });
  expect(JSON.stringify([event, hint])).not.toMatch(/private learner answer|secret token/);
  expect(hint.originalException).not.toBe(error);
  const options = sdk.init.mock.calls[0]![0];
  expect(options.beforeSend({ ...event, extra: { answer: 'private learner answer' } }, hint)).toEqual(event);
  expect(options.beforeSend(event, { originalException: error })).toBeNull();

  await flushErrorReporting();
  expect(sdk.flush).toHaveBeenCalledWith(2_000);
  vi.restoreAllMocks();
});
