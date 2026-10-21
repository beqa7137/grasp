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
  /** Motion test mode: `data-motion="off"` on <html>, so animations jump to their end. Tests of the Motion setting turn it off. */
  motionOff: boolean;
}

/**
 * Motion test mode for a context's pages. Init scripts run before <html> exists; the observer marks it at the microtask
 * checkpoint before the first page script.
 */
export function markMotionOff() {
  const mark = () => document.documentElement?.setAttribute('data-motion', 'off');
  if (document.documentElement) return mark();
  new MutationObserver((_, observer) => {
    if (!document.documentElement) return;
    mark();
    observer.disconnect();
  }).observe(document, { childList: true });
}

export const test = base.extend<Options & { guard: void }>({
  pilotNoticeSeen: [true, { option: true }],
  theme: ['dark', { option: true }],
  expectedConsoleErrors: [[], { option: true }],
  motionOff: [true, { option: true }],

  // On the context, so pages the test opens itself and popups are in test mode too.
  context: async ({ context, motionOff }, use) => {
    if (motionOff) await context.addInitScript(markMotionOff);
    await use(context);
  },

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
export async function recordedEvents(page: Page): Promise<{ id: string; type: string }[]> {
  return page.evaluate(() => {
    const log = JSON.parse(localStorage.getItem('CapacitorStorage.grasp.events') ?? '[]');
    return Array.isArray(log) ? log : log.events;
  });
}

/** Where an element's top edge sits in the viewport, to tell whether it moved under a finger resting on it. */
export const viewportTop = async (locator: Locator) => (await locator.boundingBox())!.y;

export async function expectUnmoved(locator: Locator, top: number, message: string) {
  expect(Math.abs((await viewportTop(locator)) - top), message).toBeLessThan(1);
}

/** The number of steps a player's "3 / 26" count counts to. */
export const stepTotal = async (count: Locator) => Number((await count.textContent())!.split('/')[1]);

/** The page itself never scrolls: only the stage, the checkpoint dock and the code scroll inside it. */
export async function expectNoPageScroll(page: Page) {
  const scroll = await page.locator('app-player ion-content').evaluate((content) => {
    const scroller = content.shadowRoot!.querySelector('.inner-scroll')!;
    const layout = content.querySelector('.layout')!;
    // A fractional viewport can round a box up by a pixel, which is not room to scroll.
    return {
      page: scroller.scrollHeight - scroller.clientHeight <= 1 && scroller.scrollTop === 0,
      layout: layout.scrollHeight - layout.clientHeight <= 1 && layout.scrollTop === 0,
    };
  });
  expect(scroll, 'the page and the layout unscrolled, with nothing below them').toEqual({ page: true, layout: true });
}

/** Steps a visualizer with `press` from where it is until a checkpoint asks for a prediction, waiting for each step to show. */
export async function stepToCheckpoint(page: Page, press = () => page.getByRole('button', { name: 'Step forward' }).click()) {
  const prompt = page.getByText('Your call');
  const count = page.locator('app-player g-transport .count');
  const total = await stepTotal(count);
  for (let step = Number((await count.textContent())!.split('/')[0]); !(await prompt.isVisible()); step++) {
    expect(step, 'a checkpoint should come up').toBeLessThan(total);
    await press();
    await expect(page.getByText(`${step + 1} / ${total}`, { exact: true }).or(prompt)).toBeVisible();
  }
}

/**
 * Opens the player's ⋯ panel where its dock has one (below the desktop layout), so the Timeline and Speed show, and says
 * whether it opened it.
 */
export async function openPlayback(page: Page): Promise<boolean> {
  await expect(page.locator('app-player g-transport .count')).toBeVisible();
  const more = morePlayback(page);
  const opened = (await more.isVisible()) && (await more.getAttribute('aria-expanded')) !== 'true';
  if (opened) await more.click();
  await expect(page.locator('app-player').getByRole('slider', { name: 'Timeline' })).toBeVisible();
  return opened;
}

/** Moves the player's Timeline to `step`, from ⋯ where the dock has one, closing ⋯ again so it covers nothing. */
export async function seekTimeline(page: Page, step: number) {
  const opened = await openPlayback(page);
  await page.locator('app-player').getByRole('slider', { name: 'Timeline' }).fill(String(step));
  const more = morePlayback(page);
  if (opened && (await more.getAttribute('aria-expanded')) === 'true') await more.click();
}

const morePlayback = (page: Page) => page.locator('app-player').getByRole('button', { name: 'More playback controls' });

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

/** The modifier the page's own platform uses for shortcuts: Meta on Apple devices, as the editor reads it, else Control. */
export const modifierKey = async (page: Page) =>
  (await page.evaluate(() => /Mac|iPhone|iPad/.test(`${navigator.platform} ${navigator.userAgent}`))) ? 'Meta' : 'Control';

/** Under 1024px the workspace shows one pane at a time (REDESIGN.md 4.2); this picks one there, and does nothing wider. */
export async function showPane(page: Page, pane: 'Problem' | 'Code' | 'Results') {
  await page.locator('app-code-workspace .workspace').last().waitFor();
  const control = page.getByRole('radiogroup', { name: 'Show' }).getByRole('radio', { name: pane, exact: true });
  if (await control.isVisible()) await control.click();
}

/** Picks the workspace's language in its toolbar, on the Code pane where one pane shows at a time. */
export async function pickLanguage(page: Page, language: 'Python' | 'JavaScript' | 'TypeScript') {
  await showPane(page, 'Code');
  await page.getByRole('radio', { name: language }).click();
}

/** Replaces the code in the editor of the problem with this title. */
export async function write(page: Page, code: string, title = 'Two Sum') {
  await showPane(page, 'Code');
  const editor = page.getByRole('textbox', { name: `${title} solution` });
  await editor.click();
  await page.keyboard.press(`${await modifierKey(page)}+a`);
  await page.keyboard.insertText(code);
}

/** Traces JavaScript in the workspace of the problem with this title. */
export async function trace(page: Page, code: string, title = 'Two Sum') {
  await pickLanguage(page, 'JavaScript');
  await write(page, code, title);
  await page.getByRole('button', { name: 'Trace' }).click();
}

export async function seek(page: Page, step: number, note: string) {
  await page.getByRole('slider', { name: 'Timeline' }).fill(String(step));
  await expect(page.locator('app-trace-player .narration')).toContainText(note);
}

/**
 * Presses Android's back button. Ionic listens for it from ion-app's first idle callback (a 32 ms timer where, as in
 * WebKit, there is no requestIdleCallback), so a press right after a cold load waits for that first; otherwise it can
 * arrive before anything listens and be dropped.
 */
export async function pressAndroidBack(page: Page) {
  await page.evaluate(
    () =>
      new Promise<void>((resolve) =>
        'requestIdleCallback' in window ? requestIdleCallback(() => setTimeout(resolve, 0)) : setTimeout(resolve, 64),
      ),
  );
  await page.evaluate(() => document.dispatchEvent(new Event('backbutton')));
}

/** Today's heading: its line break renders no space. */
/** Today's h1: the first-run card's question, or the target line ("Mid-level loop · …", "Assuming a Mid-level loop"). */
export const TODAY_HEADING = /^What is your loop\?$| loop\b|^Assuming a Mid-level loop$/;

/** The page shown in the tabs' outlet: Ionic keeps the other tabs' pages mounted, and hidden. */
export const shownPage = (page: Page) => page.locator('ion-tabs ion-router-outlet > .ion-page:not(.ion-page-hidden)');

/** From 1024px the rail replaces the tab bar (REDESIGN.md 2.6). */
export const railShown = (page: Page) => page.viewportSize()!.width >= 1024;

/** A section's tab, or from 1024px its rail item. */
export const section = (page: Page, name: string) =>
  railShown(page)
    ? page.locator('app-rail').getByRole('link', { name: new RegExp(`^${name}`) })
    : page.getByRole('tab', { name: new RegExp(`^${name}`) });

/** The section is lit: its tab is selected, or its rail item is current (the section's own page, or a page inside it). */
export async function expectSectionLit(page: Page, name: string) {
  if (railShown(page)) await expect(section(page, name)).toHaveAttribute('aria-current', /^(page|true)$/);
  else await expect(section(page, name)).toHaveAttribute('aria-selected', 'true');
}

export type MockRound = 'Coding' | 'System design' | 'Behavioral';

/** The Mock hub's start sheet for a Single round, opened from the round's card. */
export async function openStartSheet(page: Page, round: MockRound) {
  const card = page.locator('app-interview-home .round').filter({ has: page.getByRole('heading', { name: `${round} round` }) });
  await card.getByRole('button', { name: 'Start a round' }).click();
  const sheet = page.getByRole('dialog', { name: `${round} round` });
  await expect(sheet).toBeVisible();
  return sheet;
}

/** Starts a Single round from the Mock hub: Scripted unless `ai`, on the named choice or Surprise me. */
export async function startMockRound(page: Page, round: MockRound, choice?: string | RegExp, { ai = false } = {}) {
  if (new URL(page.url()).pathname !== '/mock') await page.goto('/mock');
  const sheet = await openStartSheet(page, round);
  if (ai) await sheet.getByRole('radio', { name: 'AI interviewer' }).click();
  if (choice) await sheet.getByRole('radio', { name: choice }).check();
  await sheet.getByRole('button', { name: 'Start round' }).click();
  await expect(page).toHaveURL(/\/mock\/[0-9a-f-]{36}$/);
}
