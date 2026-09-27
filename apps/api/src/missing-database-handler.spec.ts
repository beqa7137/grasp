import type { IncomingMessage, ServerResponse } from 'node:http';
import { handleMissingDatabase } from './missing-database-handler.js';

function responseFor(method: string, url: string) {
  const headers = new Map<string, string>();
  let body = '';
  const response = {
    statusCode: 200,
    setHeader: (name: string, value: string) => headers.set(name.toLowerCase(), value),
    end: (value: string) => {
      body = value;
    },
  } as unknown as ServerResponse;
  handleMissingDatabase({ method, url } as IncomingMessage, response);
  return { status: response.statusCode, headers, body: JSON.parse(body) };
}

describe('missing production database handler', () => {
  it('keeps liveness independent of storage', () => {
    expect(responseFor('GET', '/api/health?probe=1')).toMatchObject({
      status: 200,
      body: { status: 'ok', storage: 'unavailable' },
    });
  });

  it('marks readiness unavailable and refuses application reads and writes', () => {
    expect(responseFor('GET', '/api/health/ready')).toMatchObject({
      status: 503,
      body: { status: 'unavailable', database: 'unconfigured' },
    });
    for (const [method, path] of [
      ['GET', '/api/progress/events'],
      ['POST', '/api/progress/events'],
      ['GET', '/'],
    ]) {
      const response = responseFor(method, path);
      expect(response.status).toBe(503);
      expect(response.headers.get('retry-after')).toBe('5');
      expect(response.headers.get('cache-control')).toBe('no-store');
      expect(response.body).toEqual({ statusCode: 503, message: 'Service unavailable' });
    }
  });
});
