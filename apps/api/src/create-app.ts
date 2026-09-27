import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { configureApp } from './bootstrap.js';
import type { AppConfig, LogLevel } from './config.js';
import { initErrorReporting } from './observability/error-reporting.js';
import { SafeConsoleLogger } from './observability/safe-console-logger.js';

const LEVELS: LogLevel[] = ['fatal', 'error', 'warn', 'log', 'debug', 'verbose'];

/** The fully configured app, shared by the long-running server (main.ts) and the Vercel Function (serverless.ts). */
export async function createApp(config: AppConfig): Promise<NestExpressApplication> {
  const logger = new SafeConsoleLogger({
    json: config.logFormat === 'json',
    colors: config.logFormat === 'pretty',
    logLevels: LEVELS.slice(0, LEVELS.indexOf(config.logLevel) + 1),
  });
  await initErrorReporting(config);
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger, bodyParser: false, abortOnError: false });
  configureApp(app, config);
  return app;
}
