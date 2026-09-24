import type { IncomingMessage, ServerResponse } from 'node:http';
import { loadConfig } from './config.js';
import { createApp } from './create-app.js';

export type RequestHandler = (req: IncomingMessage, res: ServerResponse) => void;

/**
 * The app as a plain Node request handler for Vercel Functions. Fluid compute reuses an instance for many
 * requests, so this runs once per instance, not per request. A config error throws, and the caller retries
 * on the next request instead of caching the failure.
 */
export async function createRequestHandler(): Promise<RequestHandler> {
  const app = await createApp(loadConfig());
  await app.init();
  return app.getHttpAdapter().getInstance() as RequestHandler;
}
