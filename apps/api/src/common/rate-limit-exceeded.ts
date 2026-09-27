import { HttpException, HttpStatus } from '@nestjs/common';

export class RateLimitExceeded extends HttpException {
  readonly retryAfterSeconds: number;

  constructor(
    readonly limit: number,
    resetsInMs: number,
  ) {
    const retryAfterSeconds = Math.max(1, Math.ceil(resetsInMs / 1000));
    const amount = retryAfterSeconds < 60 ? retryAfterSeconds : Math.ceil(retryAfterSeconds / 60);
    const unit = retryAfterSeconds < 60 ? 'second' : 'minute';
    const wait = `${amount} ${unit}${amount === 1 ? '' : 's'}`;
    super(
      {
        statusCode: HttpStatus.TOO_MANY_REQUESTS,
        code: 'rate_limited',
        message: `Too many requests. Please try again in ${wait}.`,
        retryAfterSeconds,
      },
      HttpStatus.TOO_MANY_REQUESTS,
    );
    this.retryAfterSeconds = retryAfterSeconds;
  }
}
