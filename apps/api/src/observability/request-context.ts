import { Logger } from '@nestjs/common';
import type { NextFunction, Request as HttpRequest, Response } from 'express';
import { randomUUID } from 'node:crypto';

const INCOMING_ID = /^[\w.:-]{1,128}$/;
const QUIET_PATHS = /^\/api\/health(\/|$)/;

declare module 'express-serve-static-core' {
  interface Request {
    id: string;
  }
}

/** Tags each request with an id (reusing a well-formed upstream X-Request-Id) and writes one access-log line per request. */
export function requestContext() {
  const log = new Logger('HTTP');
  return (req: HttpRequest, res: Response, next: NextFunction) => {
    const incoming = req.get('x-request-id');
    req.id = incoming && INCOMING_ID.test(incoming) ? incoming : randomUUID();
    res.setHeader('x-request-id', req.id);
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      if (QUIET_PATHS.test(req.path) && res.statusCode < 400) return;
      const entry = {
        requestId: req.id,
        method: req.method,
        path: req.path,
        status: res.statusCode,
        ms: Math.round(Number(process.hrtime.bigint() - started) / 1e6),
      };
      if (res.statusCode >= 500) log.error(entry);
      else if (res.statusCode >= 400) log.warn(entry);
      else log.log(entry);
    });
    next();
  };
}
