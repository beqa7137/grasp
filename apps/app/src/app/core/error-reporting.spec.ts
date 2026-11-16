import { vi } from 'vitest';
import { initErrorReporting, reportClientError, ReportingErrorHandler, watchPageLeave } from './error-reporting';
import { RuntimeConfigService } from './runtime-config.service';

const PRIVATE = 'private-learner-answer-token';

beforeEach(async () => {
  await initErrorReporting(new RuntimeConfigService());
});

afterEach(() => vi.restoreAllMocks());

it.each([
  [new TypeError(PRIVATE), 'type'],
  [new RangeError(PRIVATE), 'range'],
  [new SyntaxError(PRIVATE), 'syntax'],
  [new Error(PRIVATE, { cause: new Error(PRIVATE) }), 'unknown'],
  [{ message: PRIVATE, learnerId: PRIVATE, stack: PRIVATE }, 'unknown'],
  [PRIVATE, 'unknown'],
  [null, 'unknown'],
])('logs only the fixed application category for %s', (error, category) => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  new ReportingErrorHandler().handleError(error);
  expect(log).toHaveBeenCalledExactlyOnceWith({ operation: 'application', category });
  expect(JSON.stringify(log.mock.calls)).not.toContain(PRIVATE);
});

it('leaves unreported the imports WebKit cancels as the page leaves, until the page is shown again', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const page = new EventTarget();
  watchPageLeave(page);
  const cancelled = () => new TypeError('Importing a module script failed.');
  reportClientError(cancelled());
  expect(log).toHaveBeenCalledTimes(1);

  page.dispatchEvent(new Event('beforeunload'));
  new ReportingErrorHandler().handleError(cancelled());
  reportClientError(cancelled(), 'bootstrap');
  expect(log).toHaveBeenCalledTimes(1);
  reportClientError(new TypeError(PRIVATE));
  expect(log).toHaveBeenCalledTimes(2);

  page.dispatchEvent(new Event('pageshow'));
  reportClientError(cancelled());
  expect(log).toHaveBeenCalledTimes(3);
});

it('labels bootstrap failures without exposing the original exception', () => {
  const log = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  reportClientError(new TypeError(PRIVATE), 'bootstrap');
  expect(log).toHaveBeenCalledExactlyOnceWith({ operation: 'bootstrap', category: 'type' });
});

it('does not load the asset manifest or send reports without a configured DSN', async () => {
  const fetch = vi.spyOn(globalThis, 'fetch');
  vi.spyOn(console, 'error').mockImplementation(() => undefined);
  await initErrorReporting(new RuntimeConfigService());
  reportClientError(new Error(PRIVATE));
  expect(fetch).not.toHaveBeenCalled();
});
