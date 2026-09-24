import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';

/**
 * Two ways to run:
 * - Locally and in CI: starts the built API, which also serves the built web app, like the Docker image.
 *   Run `npm run build` first. Uses Postgres when DATABASE_URL is set, in-memory storage otherwise.
 * - Against a deployment: set E2E_BASE_URL. Only tests tagged @smoke run, and they never write data.
 */
const deployed = process.env.E2E_BASE_URL;
const port = Number(process.env.E2E_PORT ?? 4310);
const root = fileURLToPath(new URL('..', import.meta.url));

export default defineConfig({
  testDir: './tests',
  outputDir: './test-results',
  fullyParallel: true,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  reporter: process.env.CI ? [['github'], ['html', { open: 'never', outputFolder: 'playwright-report' }]] : 'list',
  grep: deployed ? /@smoke/ : undefined,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL: deployed ?? `http://localhost:${port}`,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    launchOptions: { executablePath: process.env.CHROMIUM_PATH || undefined },
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'] } },
    { name: 'phone', use: { ...devices['Pixel 7'] } },
  ],
  webServer: deployed
    ? undefined
    : {
        command: `${process.env.DATABASE_URL ? 'node apps/api/dist/migrate.js && ' : ''}node apps/api/dist/main.js`,
        cwd: root,
        url: `http://localhost:${port}/api/health/ready`,
        reuseExistingServer: !process.env.CI,
        timeout: 60_000,
        env: {
          PORT: String(port),
          NODE_ENV: 'production',
          WEB_DIST_DIR: `${root}apps/app/dist/app/browser`,
          JWT_SECRET: process.env.JWT_SECRET ?? 'e2e-only-secret-e2e-only-secret-e2e-only',
          TRUST_PROXY: '1',
          LOG_LEVEL: 'warn',
          ...(process.env.DATABASE_URL ? { DATABASE_URL: process.env.DATABASE_URL } : {}),
        },
      },
});
