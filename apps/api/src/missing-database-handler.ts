import type { IncomingMessage, ServerResponse } from 'node:http';

export function handleMissingDatabase(req: IncomingMessage, res: ServerResponse): void {
  const path = req.url?.split('?', 1)[0];
  const live = req.method === 'GET' && path === '/api/health';
  const ready = req.method === 'GET' && path === '/api/health/ready';

  res.statusCode = live ? 200 : 503;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  if (!live) res.setHeader('Retry-After', '5');

  const body = live
    ? { status: 'ok', storage: 'unavailable' }
    : ready
      ? { status: 'unavailable', database: 'unconfigured' }
      : { statusCode: 503, message: 'Service unavailable' };
  res.end(JSON.stringify(body));
}
