import { ArgumentsHost, Catch, HttpException } from '@nestjs/common';
import { BaseExceptionFilter } from '@nestjs/core';
import type { Request } from 'express';
import { databaseUnavailable, isDatabaseUnavailable } from '../persistence/database-errors.js';
import { reportError } from './error-reporting.js';

/** Reports unexpected failures (non-HTTP errors and 5xx) before Nest renders the usual response. */
@Catch()
export class ReportExceptionsFilter extends BaseExceptionFilter {
  override catch(exception: unknown, host: ArgumentsHost) {
    if (isDatabaseUnavailable(exception)) {
      super.catch(databaseUnavailable(), host);
      return;
    }
    const status = exception instanceof HttpException ? exception.getStatus() : 500;
    if (status >= 500 && !(exception instanceof HttpException && status === 503)) {
      reportError(exception, host.switchToHttp().getRequest<Request>()?.id);
    }
    super.catch(exception, host);
  }
}
