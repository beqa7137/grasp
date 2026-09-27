import type { IncomingMessage, ServerResponse } from 'node:http';
import { isMissingProductionDatabase, loadConfig } from './config.js';
import { createApp } from './create-app.js';
import { handleMissingDatabase } from './missing-database-handler.js';

export type RequestHandler = (req: IncomingMessage, res: ServerResponse) => void;

/**
 * The app as a plain Node request handler for Vercel Functions. Fluid compute reuses an instance for many
 * requests, so this runs once per instance, not per request. Missing production storage returns a 503
 * handler; other startup errors let the caller retry on the next request.
 */
export async function createRequestHandler(): Promise<RequestHandler> {
  if (isMissingProductionDatabase()) {
    console.error('DATABASE_URL is required in production');
    return handleMissingDatabase;
  }
  const app = await createApp(loadConfig());
  await app.init();
  return app.getHttpAdapter().getInstance() as RequestHandler;
}
