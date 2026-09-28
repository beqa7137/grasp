import { createRequire } from 'node:module';
import { randomInt, randomUUID } from 'node:crypto';
import { mkdirSync } from 'node:fs';

const require = createRequire(new URL('../../e2e/package.json', import.meta.url));
export const { chromium, devices } = require('@playwright/test');
export const AxeBuilder = require('@axe-core/playwright').default;
export const { PNG } = require('playwright-core/lib/utilsBundle');

export const BASE = process.env.BASE ?? 'http://localhost:4310';
export const OUT = process.env.OUT ?? 'verify-out';
mkdirSync(OUT, { recursive: true });

export const PROFILES = {
  desktop: { ...devices['Desktop Chrome'], viewport: { width: 1280, height: 1000 } },
  pixel7: { ...devices['Pixel 7'] },
  w320: { ...devices['Pixel 7'], viewport: { width: 320, height: 700 } },
};

/** THEME: 'dark' or 'light' stores that preference; 'system-dark' or 'system-light' stores none and emulates the device mode. */
export const THEME = process.env.THEME ?? 'dark';
const SYSTEM_SCHEME = THEME.startsWith('system-') ? THEME.slice('system-'.length) : null;
/** STABLE=1: seeded Math.random, counter UUIDs and a fixed clock, so two captures of one build match pixel for pixel. */
const STABLE = process.env.STABLE === '1';
/** Selectors hidden with their layout kept, for values no init script reaches, such as worker timings. */
const MASK_CSS = process.env.MASK_CSS;

export async function newContext(browser, profile, { noticeSeen = true, extra = {} } = {}) {
  const context = await browser.newContext({ ...PROFILES[profile], ...(SYSTEM_SCHEME ? { colorScheme: SYSTEM_SCHEME } : {}), ...extra });
  // A fresh address per context keeps the API's per-IP rate limit out of long runs against a local server.
  await context.setExtraHTTPHeaders({ 'x-forwarded-for': `198.18.${randomInt(256)}.${randomInt(1, 255)}` });
  await context.addInitScript((learnerId) => {
    if (!localStorage.getItem('CapacitorStorage.grasp.learnerId')) {
      localStorage.setItem('CapacitorStorage.grasp.learnerId', learnerId);
    }
  }, randomUUID());
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

const answerFirst = async (p, selector) => {
  await p.locator(selector).first().click();
  await settle(p, 500);
};

/** Every page state the audits and screenshots cover: a path plus the steps that bring the page into that state. */
export function states() {
  const players = ['binary-search', 'lcs', 'dijkstra', 'two-sum-hash', 'subsets-backtracking'].flatMap((id) => [
    { id: `player-${id}`, path: `/visualize/${id}` },
    { id: `player-${id}-predict`, path: `/visualize/${id}`, setup: async (p) => ((await toPredict(p)) ? settle(p, 500) : 'no predict') },
    {
      id: `player-${id}-answered`,
      path: `/visualize/${id}`,
      setup: async (p) => ((await toPredict(p)) ? answerFirst(p, '.predict .choice') : 'no predict'),
    },
  ]);
  return [
    { id: 'learn', path: '/learn' },
    { id: 'visualize-list', path: '/visualize' },
    ...players,
    { id: 'player-subsets-backtracking-end', path: '/visualize/subsets-backtracking', setup: toEnd },
    { id: 'review-question', path: '/drill' },
    { id: 'review-answered', path: '/drill', setup: (p) => answerFirst(p, 'g-question-card .choice') },
    { id: 'practice-question', path: '/drill?pattern=binary-search' },
    { id: 'practice-answered', path: '/drill?pattern=binary-search', setup: (p) => answerFirst(p, 'g-question-card .choice') },
    { id: 'pattern-binary-search', path: '/learn/pattern/binary-search' },
    { id: 'design-list', path: '/design' },
    { id: 'sandbox', path: '/design/first-scale-up' },
    { id: 'sandbox-inspector', path: '/design/first-scale-up', setup: (p) => answerFirst(p, '.palette .tool') },
    { id: 'sandbox-free', path: '/design/free-build' },
    { id: 'case-study', path: '/design/case/url-shortener' },
    {
      id: 'case-study-decided',
      path: '/design/case/url-shortener',
      setup: async (p) => {
        await p.getByRole('button', { name: /Can users pick a custom alias/ }).click();
        await p.getByRole('button', { name: 'Show the model answer' }).click();
        await p.getByRole('button', { name: 'Show all' }).click();
      },
    },
    {
      id: 'case-study-estimated',
      path: '/design/case/url-shortener',
      setup: async (p) => {
        await p.getByRole('button', { name: /How many links are created per day/ }).click();
        await p.getByRole('button', { name: 'Show the model answer' }).click();
        await p.getByRole('button', { name: 'Show all' }).click();
        await p.getByRole('button', { name: 'Next: Estimate the traffic' }).click();
        await p.getByRole('textbox', { name: 'Average redirects per second' }).fill('30k');
        await p.getByRole('button', { name: 'Check', exact: true }).click();
      },
    },
    { id: 'case-build', path: '/design/free-build?case=news-feed' },
    { id: 'interview-home', path: '/interview' },
    { id: 'lesson-binary-search', path: '/learn/pattern/binary-search' },
    {
      id: 'lesson-dp-2d-revealed',
      path: '/learn/pattern/dp-2d',
      setup: async (p) => {
        const example = p.locator('app-worked-example').first();
        await example.getByRole('button', { name: /key move/ }).click();
        await example.getByRole('button', { name: 'Walk through it' }).click();
        await example.getByRole('button', { name: 'Show all' }).click();
        await p.locator('details.follow-up summary').first().click();
      },
    },
    { id: 'behavioral-list', path: '/behavioral' },
    { id: 'behavioral-competency', path: '/behavioral/conflict' },
    {
      id: 'behavioral-examples-checked',
      path: '/behavioral/conflict',
      setup: async (p) => {
        await p.getByRole('button', { name: 'Show why it works' }).click();
        const exercise = p.locator('app-spot-flaws');
        await exercise.getByRole('checkbox', { name: 'Blames others' }).check();
        await exercise.getByRole('checkbox', { name: 'No measurable result' }).check();
        await exercise.getByRole('button', { name: 'Check' }).click();
      },
    },
    { id: 'behavioral-question', path: '/behavioral/question/conflict-1' },
    {
      id: 'behavioral-question-drafted',
      path: '/behavioral/question/ownership-1',
      setup: async (p) => {
        const fields = p.locator('app-star-practice textarea');
        await fields.nth(0).fill('Our nightly billing export failed silently for a week before finance noticed the gap.');
        await fields.nth(1).fill('Nobody owned the export, and I had the most context on the pipeline that fed it.');
        await fields
          .nth(2)
          .fill(
            'I traced the failure to an expired credential, I rotated it, I added an alert on missing files and I wrote the runbook. I then asked the data team to own the export and walked them through it.',
          );
        await fields.nth(3).fill('Exports have run for 14 months without a gap, and finance closes the month 2 days sooner.');
      },
    },
    { id: 'settings', path: '/settings' },
    { id: 'code-list', path: '/code' },
    { id: 'code-two-sum', path: '/code/two-sum' },
    {
      id: 'code-two-sum-run',
      path: '/code/two-sum',
      setup: async (p) => {
        await p.getByRole('button', { name: /Run/ }).first().click();
        await p.waitForSelector('.outcome', { timeout: 30_000 });
        await settle(p, 400);
      },
    },
    { id: 'diagnostic-intro', path: '/diagnostic' },
    {
      id: 'feedback-dialog',
      path: '/learn',
      setup: async (p) => {
        await p.locator('.feedback-tab').click();
        await p.waitForSelector('ion-modal app-feedback-sheet');
        await settle(p, 600);
      },
    },
    {
      id: 'pilot-welcome',
      path: '/learn',
      fresh: true,
      setup: async (p) => {
        await p.waitForSelector('ion-modal app-pilot-notice');
        await settle(p, 600);
      },
    },
  ];
}
