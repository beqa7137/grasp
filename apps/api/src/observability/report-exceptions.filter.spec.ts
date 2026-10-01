import { type ArgumentsHost, BadGatewayException, Logger, ServiceUnavailableException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import { DrizzleQueryError } from 'drizzle-orm/errors';
import { RateLimitExceeded } from '../common/rate-limit-exceeded.js';
import { reportError, reportSignal } from './error-reporting.js';
import { SIGNAL_WINDOW_MS } from './failure-signals.js';
import { ReportExceptionsFilter } from './report-exceptions.filter.js';

vi.mock('./error-reporting.js', () => ({ reportError: vi.fn(), reportSignal: vi.fn() }));

let now = Date.parse('2026-10-01T10:00:00Z');
const signals = () => vi.mocked(reportSignal).mock.calls.map(([report]) => report.signal);

describe('ReportExceptionsFilter', () => {
  const host = { switchToHttp: () => ({ getRequest: () => ({ id: 'request-1' }) }) } as unknown as ArgumentsHost;

  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime((now += SIGNAL_WINDOW_MS));
    vi.spyOn(Logger.prototype, 'error').mockImplementation(() => undefined);
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

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

  it('reports an unexpected failure on its own', () => {
    const rendered = vi.spyOn(BaseExceptionFilter.prototype, 'catch').mockImplementation(() => undefined);
    const failure = new TypeError('private learner answer');

    new ReportExceptionsFilter().catch(failure, host);

    expect(reportError).toHaveBeenCalledWith(failure, 'request-1');
    expect(reportSignal).not.toHaveBeenCalled();
    expect(rendered).toHaveBeenCalledWith(expect.objectContaining({ status: 500 }), host);
    expect(Logger.prototype.error).toHaveBeenCalledWith({
      operation: 'request_failed',
      requestId: 'request-1',
      category: 'type',
      code: 'unknown',
    });
  });

  it.each([
    ['a timed-out query', new DrizzleQueryError('select 1', [], new Error('Query read timeout')), 'db.timeout'],
    ['a pool connect timeout from a transaction', new Error('timeout exceeded when trying to connect'), 'db.timeout'],
    ['a refused connection from a transaction', Object.assign(new Error('connect failed'), { code: 'ECONNREFUSED' }), 'db.unavailable'],
  ])('renders %s as a 503, signalled in its group rather than reported alone', (_name, failure, signal) => {
    const rendered = vi.spyOn(BaseExceptionFilter.prototype, 'catch').mockImplementation(() => undefined);

    new ReportExceptionsFilter().catch(failure, host);

    expect(reportError).not.toHaveBeenCalled();
    expect(signals()).toEqual([signal]);
    expect(rendered).toHaveBeenCalledWith(expect.objectContaining({ status: 503 }), host);
  });

  it('answers a client error that kept a connection code with its own status, not a database outage', () => {
    const rendered = vi.spyOn(BaseExceptionFilter.prototype, 'catch').mockImplementation(() => undefined);
    const aborted = Object.assign(new Error('request aborted'), { code: 'ECONNRESET', status: 400, statusCode: 400, expose: true });

    new ReportExceptionsFilter().catch(aborted, host);

    expect(reportSignal).not.toHaveBeenCalled();
    expect(reportError).not.toHaveBeenCalled();
    expect(rendered).toHaveBeenCalledWith(expect.objectContaining({ status: 400 }), host);
  });

  it('leaves mapped dependency failures to their signals', () => {
    vi.spyOn(BaseExceptionFilter.prototype, 'catch').mockImplementation(() => undefined);
    new ReportExceptionsFilter().catch(new BadGatewayException('The interviewer is unavailable right now.'), host);
    new ReportExceptionsFilter().catch(new ServiceUnavailableException(), host);
    expect(reportError).not.toHaveBeenCalled();
  });
});
