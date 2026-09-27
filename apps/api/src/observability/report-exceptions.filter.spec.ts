import { type ArgumentsHost, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import { reportError } from './error-reporting.js';
import { ReportExceptionsFilter } from './report-exceptions.filter.js';

vi.mock('./error-reporting.js', () => ({ reportError: vi.fn() }));

describe('ReportExceptionsFilter', () => {
  const host = { switchToHttp: () => ({ getRequest: () => ({ id: 'request-1' }) }) } as unknown as ArgumentsHost;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => vi.restoreAllMocks());

  it('reports unrelated network errors as unexpected failures', () => {
    const rendered = vi.spyOn(BaseExceptionFilter.prototype, 'catch').mockImplementation(() => undefined);
    const failure = Object.assign(new Error('other network call failed'), { code: 'ECONNRESET' });

    new ReportExceptionsFilter().catch(failure, host);

    expect(reportError).toHaveBeenCalledWith(failure, 'request-1');
    expect(rendered).toHaveBeenCalledWith(expect.objectContaining({ status: 500 }), host);
    expect(Logger.prototype.error).toHaveBeenCalledWith({
      operation: 'request_failed',
      requestId: 'request-1',
      category: 'connection',
      code: 'ECONNRESET',
    });
  });

  it('renders a database availability failure as a 503 without reporting it', () => {
    const rendered = vi.spyOn(BaseExceptionFilter.prototype, 'catch').mockImplementation(() => undefined);
    const failure = new DrizzleQueryError('select 1', [], new Error('Query read timeout'));

    new ReportExceptionsFilter().catch(failure, host);

    expect(reportError).not.toHaveBeenCalled();
    expect(rendered).toHaveBeenCalledWith(expect.objectContaining({ status: 503 }), host);
  });
});
