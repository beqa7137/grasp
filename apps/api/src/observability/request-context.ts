import { Logger } from '@nestjs/common';
import type { NextFunction, Request as HttpRequest, Response } from 'express';
import { randomUUID } from 'node:crypto';

const METHODS = new Set(['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS']);
const QUIET_PATHS = /^\/api\/health(\/|$)/;

declare module 'express-serve-static-core' {
  interface Request {
    id: string;
  }
}

export function requestContext() {
  const log = new Logger('HTTP');
  return (req: HttpRequest, res: Response, next: NextFunction) => {
    req.id = randomUUID();
    res.setHeader('x-request-id', req.id);
    const started = process.hrtime.bigint();
    res.on('finish', () => {
      if (QUIET_PATHS.test(req.path) && res.statusCode < 400) return;
      const entry = {
        requestId: req.id,
        method: METHODS.has(req.method) ? req.method : 'OTHER',
        path: typeof req.route?.path === 'string' ? req.route.path : 'unmatched',
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
