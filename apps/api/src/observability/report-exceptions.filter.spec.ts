import { type ArgumentsHost, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import { RateLimitExceeded } from '../common/rate-limit-exceeded.js';
import { reportError } from './error-reporting.js';
import { recordDatabaseFailure } from './failure-signals.js';
import { ReportExceptionsFilter } from './report-exceptions.filter.js';

vi.mock('./error-reporting.js', () => ({ reportError: vi.fn() }));
vi.mock('./failure-signals.js', () => ({ recordDatabaseFailure: vi.fn() }));

describe('ReportExceptionsFilter', () => {
  const host = { switchToHttp: () => ({ getRequest: () => ({ id: 'request-1' }) }) } as unknown as ArgumentsHost;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('returns the principal limit headers instead of the wider network limit', () => {
    const rendered = vi.spyOn(BaseExceptionFilter.prototype, 'catch').mockImplementation(() => undefined);
    const setHeader = vi.fn();
    const limitedHost = {
      switchToHttp: () => ({ getRequest: () => ({}), getResponse: () => ({ setHeader }) }),
    } as unknown as ArgumentsHost;
    const failure = new RateLimitExceeded(10, 1250);
    new ReportExceptionsFilter().catch(failure, limitedHost);
    expect(setHeader.mock.calls).toEqual([
      ['X-RateLimit-Limit', 10],
      ['X-RateLimit-Remaining', 0],
      ['X-RateLimit-Reset', 2],
      ['Retry-After', 2],
    ]);
    expect(rendered).toHaveBeenCalledWith(failure, limitedHost);
    expect(reportError).not.toHaveBeenCalled();
  });

  it('reports unrelated network errors as unexpected failures', () => {
    const rendered = vi.spyOn(BaseExceptionFilter.prototype, 'catch').mockImplementation(() => undefined);
    const failure = Object.assign(new Error('other network call failed'), { code: 'ECONNRESET' });

    new ReportExceptionsFilter().catch(failure, host);

    expect(reportError).toHaveBeenCalledWith(failure, 'request-1');
    expect(recordDatabaseFailure).not.toHaveBeenCalled();
    expect(rendered).toHaveBeenCalledWith(expect.objectContaining({ status: 500 }), host);
    expect(Logger.prototype.error).toHaveBeenCalledWith({
      operation: 'request_failed',
      requestId: 'request-1',
      category: 'connection',
      code: 'ECONNRESET',
    });
  });

  it('renders a database availability failure as a 503, signalled in its group rather than reported alone', () => {
    const rendered = vi.spyOn(BaseExceptionFilter.prototype, 'catch').mockImplementation(() => undefined);
    const failure = new DrizzleQueryError('select 1', [], new Error('Query read timeout'));

    new ReportExceptionsFilter().catch(failure, host);

    expect(reportError).not.toHaveBeenCalled();
    expect(recordDatabaseFailure).toHaveBeenCalledWith(failure);
    expect(rendered).toHaveBeenCalledWith(expect.objectContaining({ status: 503 }), host);
  });
});
