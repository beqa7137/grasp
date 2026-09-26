import { type Locator, type Page, test as base, expect } from '@playwright/test';
import { randomInt } from 'node:crypto';

export { expect };

/** Against a deployment, tests only read: every API call that could write data is blocked. */
export const readOnly = !!process.env.E2E_BASE_URL;

/** A client address of its own, as separate testers have, so per-IP rate limits don't carry over between tests. */
export const newClientIp = () => `198.18.${randomInt(256)}.${randomInt(1, 255)}`;

interface Options {
  /** Start as a returning visitor who has already dismissed the pilot welcome. */
  pilotNoticeSeen: boolean;
  /** The theme chosen on this device. Dark by default, since Playwright emulates a light device; 'system' chooses none. */
  theme: 'dark' | 'light' | 'system';
  /** Console errors the test causes on purpose, such as the browser reporting an expected 4xx response. */
  expectedConsoleErrors: RegExp[];
}

export const test = base.extend<Options & { guard: void }>({
  pilotNoticeSeen: [true, { option: true }],
  theme: ['dark', { option: true }],
  expectedConsoleErrors: [[], { option: true }],

  page: async ({ page, pilotNoticeSeen, theme }, use) => {
    if (pilotNoticeSeen) {
      await page.addInitScript(() => localStorage.setItem('CapacitorStorage.grasp.pilotNotice.v1', new Date().toISOString()));
    }
    if (theme !== 'system') {
      await page.addInitScript((chosen) => localStorage.setItem('CapacitorStorage.grasp.theme', chosen), theme);
    }
    if (!readOnly) {
      // Set on the context so sign-in popups belong to the same client.
      await page.context().setExtraHTTPHeaders({ 'x-forwarded-for': newClientIp() });
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

/** The progress events the app has recorded on this device, synced or not. */
export async function recordedEvents(page: Page): Promise<{ type: string }[]> {
  return page.evaluate(() => JSON.parse(localStorage.getItem('CapacitorStorage.grasp.events') ?? '[]'));
}

/** Where an element's top edge sits in the viewport, to tell whether it moved under a finger resting on it. */
export const viewportTop = (locator: Locator) => locator.evaluate((el) => el.getBoundingClientRect().top);

/** Steps a visualizer with `press` until a checkpoint asks for a prediction, waiting for each step to show before the next. */
export async function stepToCheckpoint(page: Page, press = () => page.getByRole('button', { name: 'Step forward' }).click()) {
  const prompt = page.getByText('Your call');
  const total = Number((await page.locator('app-player .scrub .count').textContent())!.split('/')[1]);
  for (let step = 1; !(await prompt.isVisible()); step++) {
    expect(step, 'a checkpoint should come up').toBeLessThan(total);
    await press();
    await expect(page.getByText(`${step + 1} / ${total}`, { exact: true }).or(prompt)).toBeVisible();
  }
}

export const JS_DIAMETER = `function diameterOfBinaryTree(root) {
  let best = 0;
  const height = (node) => {
    if (!node) return 0;
    const left = height(node.left);
    const right = height(node.right);
    best = Math.max(best, left + right);
    return 1 + Math.max(left, right);
  };
  height(root);
  return best;
}`;

export const JS_ISLANDS = `function numIslands(grid) {
  let count = 0;
  const sink = (r, c) => {
    if (r < 0 || c < 0 || r >= grid.length || c >= grid[0].length || grid[r][c] !== '1') return;
    grid[r][c] = '0';
    sink(r + 1, c);
    sink(r - 1, c);
    sink(r, c + 1);
    sink(r, c - 1);
  };
  for (let r = 0; r < grid.length; r++)
    for (let c = 0; c < grid[0].length; c++)
      if (grid[r][c] === '1') {
        count++;
        sink(r, c);
      }
  return count;
}`;

/** Replaces the code in the editor of the problem with this title. */
export async function write(page: Page, code: string, title = 'Two Sum') {
  const editor = page.getByRole('textbox', { name: `${title} solution` });
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(code);
}

/** Traces JavaScript in the workspace of the problem with this title. */
export async function trace(page: Page, code: string, title = 'Two Sum') {
  await page.getByRole('radio', { name: 'JavaScript' }).click();
  await write(page, code, title);
  await page.getByRole('button', { name: 'Trace' }).click();
}

export async function seek(page: Page, step: number, note: string) {
  await page.getByRole('slider', { name: 'Timeline' }).fill(String(step));
  await expect(page.locator('app-trace-player .narration')).toContainText(note);
}
