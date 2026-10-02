import { createRequire } from 'node:module';
import { randomInt, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';

const require = createRequire(new URL('../../e2e/package.json', import.meta.url));
export const { chromium, devices, webkit } = require('@playwright/test');
export const AxeBuilder = require('@axe-core/playwright').default;
export const { PNG } = require('playwright-core/lib/utilsBundle');

export const BASE = process.env.BASE ?? 'http://localhost:4310';
export const OUT = process.env.OUT ?? 'verify-out';
mkdirSync(OUT, { recursive: true });

export const PROFILES = {
  desktop: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 1000 } },
  w1024: { ...devices['Desktop Chrome'], viewport: { width: 1024, height: 768 } },
  pixel7: { ...devices['Pixel 7'] },
  w320: { ...devices['Pixel 7'], viewport: { width: 320, height: 700 } },
  ipad: { ...devices['iPad Mini'] },
};

/** Chromium from CHROMIUM_PATH when set; WebKit from the Playwright install (PLAYWRIGHT_BROWSERS_PATH). */
export const launch = (type = 'chromium') =>
  ({ chromium, webkit })[type].launch(type === 'chromium' ? { executablePath: process.env.CHROMIUM_PATH || undefined } : {});

/** THEME: 'dark' or 'light' stores that preference; 'system-dark' or 'system-light' stores none and emulates the device mode. */
export const THEME = process.env.THEME ?? 'dark';
const SYSTEM_SCHEME = THEME.startsWith('system-') ? THEME.slice('system-'.length) : null;
/** STABLE=1: seeded Math.random, counter UUIDs and a fixed clock, so two captures of one build match pixel for pixel. */
export const STABLE = process.env.STABLE === '1';
/** Selectors hidden with their layout kept, for values no init script reaches, such as worker timings. */
export const MASK_CSS = process.env.MASK_CSS;

/**
 * Motion test mode (3.5): `data-motion="off"` on <html>, so every animation jumps to its end state. Init scripts run
 * before <html> exists; the observer's callback runs at the microtask checkpoint before the first parser-blocking script.
 */
export function motionOff() {
  const mark = () => document.documentElement?.setAttribute('data-motion', 'off');
  if (document.documentElement) return mark();
  new MutationObserver((_, observer) => {
    if (!document.documentElement) return;
    mark();
    observer.disconnect();
  }).observe(document, { childList: true });
}

export async function newContext(browser, profile, { noticeSeen = true, extra = {} } = {}) {
  const context = await browser.newContext({ ...PROFILES[profile], ...(SYSTEM_SCHEME ? { colorScheme: SYSTEM_SCHEME } : {}), ...extra });
  // A fresh address per context keeps the API's per-IP rate limit out of long runs against a local server.
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `198.18.${randomInt(256)}.${randomInt(1, 255)}` });
  await context.addInitScript((learnerId) => {
    if (!localStorage.getItem('CapacitorStorage.grasp.learnerId')) {
      localStorage.setItem('CapacitorStorage.grasp.learnerId', learnerId);
    }
  }, randomUUID());
  await context.addInitScript(motionOff);
  if (!SYSTEM_SCHEME) await context.addInitScript((theme) => localStorage.setItem('CapacitorStorage.grasp.theme', theme), THEME);
  if (MASK_CSS) {
    await context.addInitScript((css) => {
      const add = () =>
        document.head.append(Object.assign(document.createElement('style'), { textContent: `${css} { visibility: hidden !important; }` }));
      if (document.head) add();
      else document.addEventListener('DOMContentLoaded', add);
    }, MASK_CSS);
  }
  if (STABLE) {
    await context.clock.setFixedTime(new Date('2026-09-24T12:00:00'));
    await context.addInitScript(() => {
      let a = 20260924;
      Math.random = () => {
        a = (a + 0x6d2b79f5) | 0;
        let t = Math.imul(a ^ (a >>> 15), 1 | a);
        t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
        return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
      };
      let n = 0;
      crypto.randomUUID = () => `00000000-0000-4000-8000-${String(++n).padStart(12, '0')}`;
    });
  }
  if (noticeSeen)
    await context.addInitScript(() => localStorage.setItem('CapacitorStorage.grasp.pilotNotice.v1', new Date().toISOString()));
  return context;
}

/** Blocks every write to the API, so runs against production leave no data behind. */
export const readOnly = (context) =>
  context.route('**/api/**', (route) => (route.request().method() === 'GET' ? route.continue() : route.abort()));

export const settle = (page, ms = 700) => page.waitForTimeout(ms);

export async function goto(page, path) {
  await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
  await page.waitForSelector('ion-content');
  await settle(page);
}

export async function toPredict(page) {
  for (let i = 0; i < 400; i++) {
    if (await page.locator('.predict').count()) return true;
    const step = page.getByRole('button', { name: 'Step forward' });
    if (await step.isDisabled()) return false;
    await step.click();
    await page.waitForTimeout(80);
  }
  return false;
}

/** Turns predict mode off and steps to the last frame, where a tree visualizer shows every badge. */
export async function toEnd(page) {
  await page.getByText('Predict mode').click();
  const [shown, total] = (await page.locator('app-player .scrub .count').textContent()).match(/\d+/g).map(Number);
  const step = page.getByRole('button', { name: 'Step forward' });
  for (let i = shown; i < total; i++) await step.click();
  await page.locator('app-player .scene').scrollIntoViewIfNeeded();
  await settle(page, 500);
}

export const answerFirst = async (p, selector) => {
  await p.locator(selector).first().click();
  await settle(p, 500);
};
