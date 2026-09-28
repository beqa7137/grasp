import { defineConfig, devices } from '@playwright/test';
import { fileURLToPath } from 'node:url';
import { fakeGitHubUrl, githubApp } from './support/github';

/**
 * Two ways to run:
 * - Locally and in CI: starts the built API, which also serves the built web app, like the Docker image,
 *   and a fake GitHub for sign-in. Run `npm run build` first. Uses Postgres when DATABASE_URL is set,
 *   in-memory storage otherwise.
 * - Against a deployment: set E2E_BASE_URL. Only tests tagged @smoke run, and they never write data.
 */
const deployed = process.env.E2E_BASE_URL;
const databaseUrl = process.env.DATABASE_URL;
const port = Number(process.env.E2E_PORT ?? 4310);
const root = fileURLToPath(new URL('..', import.meta.url));
const chromium = { executablePath: process.env.CHROMIUM_PATH || undefined };

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
  },
  projects: [
    { name: 'desktop', use: { ...devices['Desktop Chrome'], launchOptions: chromium } },
    { name: 'phone', use: { ...devices['Pixel 7'], launchOptions: chromium } },
    // The iOS app runs in WKWebView, so its engine is checked on an iPhone.
    { name: 'iphone', use: { ...devices['iPhone 17'] } },
  ],
  webServer: deployed
    ? undefined
    : [
        {
          command: 'node e2e/support/fake-github.ts',
          cwd: root,
          port: githubApp.port,
          reuseExistingServer: !process.env.CI,
          env: { PORT: String(githubApp.port), CLIENT_ID: githubApp.clientId, CLIENT_SECRET: githubApp.clientSecret },
        },
        {
          command: `${databaseUrl ? 'node apps/api/dist/migrate.js && ' : ''}node apps/api/dist/main.js`,
          cwd: root,
          url: `http://localhost:${port}/api/health/ready`,
          reuseExistingServer: !process.env.CI,
          timeout: 60_000,
          env: {
            PORT: String(port),
            NODE_ENV: databaseUrl ? 'production' : 'development',
            WEB_DIST_DIR: `${root}apps/app/dist/app/browser`,
            JWT_SECRET: process.env.JWT_SECRET ?? 'e2e-only-secret-e2e-only-secret-e2e-only',
            TRUST_PROXY: '1',
            LOG_LEVEL: 'warn',
            OAUTH_GITHUB_ID: githubApp.clientId,
            OAUTH_GITHUB_SECRET: githubApp.clientSecret,
            OAUTH_GITHUB_URL: fakeGitHubUrl,
            OAUTH_GITHUB_API_URL: `${fakeGitHubUrl}/api`,
            // Google's side is replaced in the browser (see sign-in.spec.ts); no real client exists.
            GOOGLE_WEB_CLIENT_ID: 'e2e-only.apps.googleusercontent.com',
            ...(databaseUrl ? { DATABASE_URL: databaseUrl } : {}),
          },
        },
      ],
});
