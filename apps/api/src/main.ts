import { Logger } from '@nestjs/common';
import { existsSync } from 'node:fs';
import { ConfigError, loadConfig } from './config.js';
import { createApp } from './create-app.js';
import { flushErrorReporting } from './observability/error-reporting.js';

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
  const app = await createApp(config);
  process.once('SIGTERM', () => void flushErrorReporting());
  await app.listen(config.port, '0.0.0.0');
  new Logger('Bootstrap').log(`Listening on :${config.port} (${config.env}${config.release ? `, release ${config.release}` : ''})`);
}
await bootstrap();
