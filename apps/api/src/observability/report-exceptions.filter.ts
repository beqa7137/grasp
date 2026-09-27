import { ArgumentsHost, Catch, HttpException, Logger } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { Request, Response } from 'express';
import { STATUS_CODES } from 'node:http';
import { RateLimitExceeded } from '../common/rate-limit-exceeded.js';
import { databaseUnavailable, isDatabaseUnavailable } from '../persistence/database-errors.js';
import { reportError } from './error-reporting.js';
import { safeErrorDetails } from './safe-error.js';

@Catch()
export class ReportExceptionsFilter extends BaseExceptionFilter {
  private readonly log = new Logger(ReportExceptionsFilter.name);

  override catch(exception: unknown, host: ArgumentsHost) {
    if (isDatabaseUnavailable(exception)) {
      super.catch(databaseUnavailable(), host);
      return;
    }
    const status = exception instanceof HttpException ? exception.getStatus() : this.isHttpError(exception) ? exception.statusCode : 500;
    const requestId = host.switchToHttp().getRequest<Request>()?.id;
    if (status >= 500 && !(exception instanceof HttpException && status === 503)) {
      reportError(exception, requestId);
    }
    if (exception instanceof RateLimitExceeded) {
      const response = host.switchToHttp().getResponse<Response>();
      response.setHeader('X-RateLimit-Limit', exception.limit);
      response.setHeader('X-RateLimit-Remaining', 0);
      response.setHeader('X-RateLimit-Reset', exception.retryAfterSeconds);
      response.setHeader('Retry-After', exception.retryAfterSeconds);
    }
    if (exception instanceof HttpException) {
      super.catch(exception, host);
      return;
    }
    if (status >= 500) this.log.error({ operation: 'request_failed', requestId, ...safeErrorDetails(exception) });
    super.catch(
      new HttpException(
        { statusCode: status, message: status >= 500 ? 'Internal server error' : (STATUS_CODES[status] ?? 'Request failed') },
        status,
      ),
      host,
    );
  }
}
