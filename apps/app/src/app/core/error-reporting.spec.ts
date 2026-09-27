import { vi } from 'vitest';
import { initErrorReporting, reportClientError, ReportingErrorHandler } from './error-reporting';
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
