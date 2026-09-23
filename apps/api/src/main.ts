import { existsSync } from 'node:fs';
import { NestFactory } from '@nestjs/core';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { AppModule } from './app.module.js';
import { loadConfig } from './config.js';

if (existsSync('.env')) process.loadEnvFile('.env');

async function bootstrap() {
  const config = loadConfig();
  const app = await NestFactory.create<NestExpressApplication>(AppModule);
  app.setGlobalPrefix('api');
  app.enableCors({ origin: config.corsOrigins, allowedHeaders: ['content-type', 'x-learner-id'] });
  app.useBodyParser('json', { limit: '256kb' });
  app.enableShutdownHooks();
  await app.listen(config.port);
}
await bootstrap();
