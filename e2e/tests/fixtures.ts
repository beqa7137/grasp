import { type Page, test as base, expect } from '@playwright/test';
import { randomInt } from 'node:crypto';

export { expect };

/** Against a deployment, tests only read: every API call that could write data is blocked. */
export const readOnly = !!process.env.E2E_BASE_URL;

interface Options {
  /** Start as a returning visitor who has already dismissed the pilot welcome. */
  pilotNoticeSeen: boolean;
  /** Console errors the test causes on purpose, such as the browser reporting an expected 4xx response. */
  expectedConsoleErrors: RegExp[];
}

export const test = base.extend<Options & { guard: void }>({
  pilotNoticeSeen: [true, { option: true }],
  expectedConsoleErrors: [[], { option: true }],

  page: async ({ page, pilotNoticeSeen }, use) => {
    if (pilotNoticeSeen) {
      await page.addInitScript(() => localStorage.setItem('CapacitorStorage.grasp.pilotNotice.v1', new Date().toISOString()));
    }
    if (!readOnly) {
      // Each test is its own client, as separate testers are, so per-IP rate limits don't carry over.
      // Set on the context so sign-in popups belong to the same client.
      await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': `198.18.${randomInt(256)}.${randomInt(1, 255)}` });
    } else {
      await page.route('**/api/**', (route) => (route.request().method() === 'GET' ? route.continue() : route.abort('blockedbyclient')));
    }
    await use(page);
  },

  // Fails any test whose pages (popups included) throw or log an error, unless the test expects it.
  guard: [
    async ({ context, expectedConsoleErrors }, use) => {
      const problems: string[] = [];
      context.on('weberror', (error) => problems.push(`page error: ${error.error().message}`));
      context.on('console', (message) => {
        if (message.type() !== 'error') return;
        const text = message.text();
        if (readOnly && /ERR_BLOCKED_BY_CLIENT|Failed to load resource/.test(text)) return;
        if (expectedConsoleErrors.some((expected) => expected.test(text))) return;
        problems.push(`console error: ${text}`);
      });
      await use();
      expect(problems, 'the page logged errors').toEqual([]);
    },
    { auto: true },
  ],
});

/** Resolves once the app has synced an event of this type and the API accepted it (never, when read-only). */
export async function synced(page: Page, type: string): Promise<void> {
  if (readOnly) return;
  const response = await page.waitForResponse((r) => {
    const request = r.request();
    return (
      request.method() === 'POST' &&
      r.url().endsWith('/api/progress/events') &&
      (request.postDataJSON() as { events: { type: string }[] }).events.some((e) => e.type === type)
    );
  });
  expect(response.status(), `syncing ${type}`).toBe(200);
}
