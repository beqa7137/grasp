import { Logger } from '@nestjs/common';
import type { NestExpressApplication } from '@nestjs/platform-express';
import { Test, type TestingModuleBuilder } from '@nestjs/testing';
import { AppModule } from '../../src/app.module.js';
import { configureApp } from '../../src/bootstrap.js';
import { APP_CONFIG, loadConfig } from '../../src/config.js';
import { nextTestPort } from './test-port.js';

/** Builds the app exactly as main.ts does, with environment overrides (undefined unsets a variable). */
export async function createTestApp(
  env: Record<string, string | undefined> = {},
  customize: (builder: TestingModuleBuilder) => TestingModuleBuilder = (b) => b,
): Promise<NestExpressApplication> {
  Logger.overrideLogger(false);
  const config = loadConfig({ ...process.env, ANTHROPIC_API_KEY: undefined, DATABASE_URL: undefined, ...env });
  const builder = customize(
    Test.createTestingModule({ imports: [AppModule] })
      .overrideProvider(APP_CONFIG)
      .useValue(config),
  );
  const app = (await builder.compile()).createNestApplication<NestExpressApplication>({ logger: false, bodyParser: false });
  configureApp(app, config);
  // Listen on loopback, where the OS keeps ports unique. Left to itself, supertest listens on every interface,
  // and on macOS that port can also belong to another program's 127.0.0.1 listener, which then answers instead.
  await app.listen(nextTestPort(), '127.0.0.1');
  return app;
}
