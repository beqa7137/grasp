import Anthropic from '@anthropic-ai/sdk';
import { BadGatewayException, HttpException, ServiceUnavailableException, type Logger } from '@nestjs/common';
import { recordFailure } from '../observability/failure-signals.js';
import { safeErrorDetails } from '../observability/safe-error.js';

const BUSY = 'The interviewer is busy right now. Try again in a moment.';
const UNAVAILABLE = 'The interviewer is unavailable right now. Please try again.';

/** Errors streamed mid-response carry no HTTP status, only the API error type. */
function errorType(err: InstanceType<typeof Anthropic.APIError>): string | undefined {
  const body = err.error as { error?: { type?: string }; type?: string } | undefined;
  return body?.error?.type ?? body?.type;
}

export function deadlineExceeded(
  log: Logger,
  operation: 'interview.reply-deadline' | 'interview.score-deadline',
): ServiceUnavailableException {
  log.warn({ operation });
  recordFailure('ai.deadline');
  return new ServiceUnavailableException(UNAVAILABLE);
}

/** Preserve abort errors so callers can distinguish a closed connection from a failure. */
export function toHttpError(err: unknown, log: Logger): unknown {
  if (err instanceof HttpException || err instanceof Anthropic.APIUserAbortError) return err;
  if (!(err instanceof Anthropic.APIError)) {
    log.error({ operation: 'ai.request', ...safeErrorDetails(err) });
    recordFailure('ai.failed', err);
    return new BadGatewayException(UNAVAILABLE);
  }

  const type = errorType(err);
  if (err.status === 429 || err.status === 529 || type === 'rate_limit_error' || type === 'overloaded_error') {
    log.warn({ operation: 'ai.busy', ...safeErrorDetails(err) });
    recordFailure('ai.busy', err);
    return new ServiceUnavailableException(BUSY);
  }
  if (err instanceof Anthropic.APIConnectionError || (err.status ?? 0) >= 500 || type === 'api_error') {
    log.warn({ operation: 'ai.unavailable', ...safeErrorDetails(err) });
    recordFailure(err instanceof Anthropic.APIConnectionTimeoutError ? 'ai.timeout' : 'ai.unavailable', err);
    return new ServiceUnavailableException(UNAVAILABLE);
  }
  // 400/401/403/404 mean our request or configuration is wrong: loud in logs, generic to the learner.
  log.error({ operation: 'ai.rejected', ...safeErrorDetails(err) });
  recordFailure('ai.rejected', err);
  return new BadGatewayException(UNAVAILABLE);
}
