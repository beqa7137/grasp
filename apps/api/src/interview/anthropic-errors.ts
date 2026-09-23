import Anthropic from '@anthropic-ai/sdk';
import { BadGatewayException, HttpException, ServiceUnavailableException, type Logger } from '@nestjs/common';

const BUSY = 'The interviewer is busy right now. Try again in a moment.';
const UNAVAILABLE = 'The interviewer is unavailable right now. Please try again.';

/** Errors streamed mid-response carry no HTTP status, only the API error type. */
function errorType(err: InstanceType<typeof Anthropic.APIError>): string | undefined {
  const body = err.error as { error?: { type?: string }; type?: string } | undefined;
  return body?.error?.type ?? body?.type;
}

/**
 * Maps Claude API failures to client-safe HTTP errors. The SDK has already retried transient ones.
 * Aborts pass through untouched so the caller can tell a closed connection from a failure.
 */
export function toHttpError(err: unknown, log: Logger): unknown {
  if (err instanceof HttpException || err instanceof Anthropic.APIUserAbortError) return err;
  if (!(err instanceof Anthropic.APIError)) {
    log.error(err);
    return new BadGatewayException(UNAVAILABLE);
  }

  const type = errorType(err);
  if (err.status === 429 || err.status === 529 || type === 'rate_limit_error' || type === 'overloaded_error') {
    log.warn(`Claude API ${type ?? err.status} (request ${err.requestID ?? 'n/a'})`);
    return new ServiceUnavailableException(BUSY);
  }
  if (err instanceof Anthropic.APIConnectionError || (err.status ?? 0) >= 500 || type === 'api_error') {
    log.warn(`Claude API unreachable: ${err.message}`);
    return new ServiceUnavailableException(UNAVAILABLE);
  }
  // 400/401/403/404 mean our request or configuration is wrong: loud in logs, generic to the learner.
  log.error(`Claude API rejected the request (${err.status ?? type}, request ${err.requestID ?? 'n/a'}): ${err.message}`);
  return new BadGatewayException(UNAVAILABLE);
}
