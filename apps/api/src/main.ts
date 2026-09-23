import { ConsoleLogger, Logger } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { existsSync } from 'node:fs';
import { AppModule } from './app.module.js';
import { configureApp } from './bootstrap.js';
import { ConfigError, loadConfig, type LogLevel } from './config.js';
import { flushErrorReporting, initErrorReporting } from './observability/error-reporting.js';

const LEVELS: LogLevel[] = ['fatal', 'error', 'warn', 'log', 'debug', 'verbose'];

if (existsSync('.env')) process.loadEnvFile('.env');

async function bootstrap() {
  let config;
  try {
    config = loadConfig();
  } catch (err) {
    if (!(err instanceof ConfigError)) throw err;
    console.error(err.message);
    process.exit(1);
  }
  const logger = new ConsoleLogger({
    json: config.logFormat === 'json',
    colors: config.logFormat === 'pretty',
    logLevels: LEVELS.slice(0, LEVELS.indexOf(config.logLevel) + 1),
  });
  await initErrorReporting(config);

  const app = await NestFactory.create<NestExpressApplication>(AppModule, { logger, bodyParser: false });
  configureApp(app, config);
  process.once('SIGTERM', () => void flushErrorReporting());
  await app.listen(config.port, '0.0.0.0');
  new Logger('Bootstrap').log(`Listening on :${config.port} (${config.env}${config.release ? `, release ${config.release}` : ''})`);
}
await bootstrap();
