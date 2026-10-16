import type { Page } from '@playwright/test';
import { itemsForTopic } from '@grasp/engine';
import { expect, section, synced, test } from './fixtures';

const EVENTS = 'CapacitorStorage.grasp.events';
const today = (page: Page) => page.locator('app-today');
const loopHeading = (page: Page) => today(page).getByRole('heading', { level: 1 });
const start = (page: Page) => today(page).locator('app-up-next-card .start');

/** A calendar day this many days from the page's today, as YYYY-MM-DD. */
const localDay = (page: Page, days: number) =>
  page.evaluate((n) => {
    const d = new Date();
    d.setDate(d.getDate() + n);
    return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  }, days);

/** Journey 1 (REDESIGN.md 2.14): a level chip, "3 weeks", "Build my plan". */
async function buildPlan(page: Page, level = 'Mid-level') {
  const card = today(page).locator('app-loop-card');
  await card.getByRole('button', { name: level }).click();
  await card.getByRole('button', { name: '3 weeks' }).click();
  const saving = Promise.all([synced(page, 'target.set'), synced(page, 'plan.set')]);
  await card.getByRole('button', { name: 'Build my plan' }).click();
  await saving;
}

test.describe('a fresh install', () => {
  test.use({ pilotNoticeSeen: false });

  test('shows at most one modal, the pilot welcome, with the first-run card inline beneath it', { tag: '@nav' }, async ({ page }) => {
    await page.goto('/');
    const welcome = page.getByRole('dialog', { name: 'Welcome to the Grasp pilot' });
    await expect(welcome).toBeVisible();
    const openModals = () => page.locator('ion-modal.show-modal, ion-popover.popover-viewport, ion-alert, dialog[open]').count();
    for (let i = 0; i < 10; i++) {
      expect(await openModals()).toBeLessThanOrEqual(1);
      await page.waitForTimeout(200);
    }
    await page.getByRole('button', { name: "Got it, let's start" }).click();
    await expect(welcome).toBeHidden();
    await expect(loopHeading(page)).toHaveText('What is your loop?');
    await expect(today(page).locator('app-loop-card')).toBeVisible();
    await expect(page.getByRole('complementary', { name: 'Where things moved' })).toHaveCount(0);
    expect(await openModals()).toBe(0);
  });
});

test('journey 1: a dated checklist on Today in three taps, kept across a reload', { tag: '@nav' }, async ({ page }) => {
  await page.goto('/today');
  await expect(loopHeading(page)).toHaveText('What is your loop?');
  const build = today(page).getByRole('button', { name: 'Build my plan' });
  await expect(build).toBeDisabled();
  await buildPlan(page);

  const line = new RegExp(`^Mid-level loop · \\w{3} \\d{1,2} · 21 days left · 45 min a day$`);
  await expect(loopHeading(page)).toHaveText(line);
  await expect(today(page).getByRole('status')).toHaveText('Plan built: 21 days to your interview.');
  // Coding is in the loop and no placement exists, so the placement is offered (REDESIGN.md 2.13), under Up next.
  await expect(loopHeading(page)).toBeFocused();
  await expect(today(page).getByRole('complementary', { name: 'Skip what you know' })).toBeVisible();
  const checklist = today(page).locator('app-plan-today');
  await expect(checklist).toBeVisible();
  await expect(today(page).getByRole('heading', { name: /^Today \d+ of \d+ done/ })).toBeVisible();
  await expect(checklist.locator('app-up-next-card')).toBeVisible();

  const events = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).events, EVENTS);
  expect(events.find((e: { type: string }) => e.type === 'target.set').target).toEqual({
    level: 'mid',
    rounds: { coding: 2, design: 1, behavioral: 1 },
  });
  expect(events.find((e: { type: string }) => e.type === 'plan.set').plan).toEqual({
    interviewDate: await localDay(page, 21),
    minutesPerDay: 45,
    rounds: ['coding', 'design', 'behavioral'],
    level: 'new',
  });

  await page.reload();
  await expect(loopHeading(page)).toHaveText(line);
  await expect(today(page).locator('app-plan-today app-up-next-card')).toBeVisible();
  await expect(today(page).locator('app-loop-card')).toHaveCount(0);
});

test('the Up next button never changes what it opens once it has rendered', { tag: '@nav' }, async ({ page }) => {
  await page.goto('/today');
  await buildPlan(page);
  await page.reload();
  await expect(start(page)).toBeVisible();
  const first = { href: await start(page).getAttribute('href'), text: await start(page).textContent() };
  await start(page).evaluate((button) => {
    const seen: string[] = [];
    new MutationObserver(() => seen.push(`${button.getAttribute('href')} ${button.textContent} ${button.isConnected}`)).observe(button, {
      attributes: true,
      childList: true,
      characterData: true,
      subtree: true,
    });
    Object.assign(window, { startChanges: seen, startButton: button });
  });
  for (let elapsed = 0; elapsed < 3000; elapsed += 100) {
    expect(await start(page).getAttribute('href')).toBe(first.href);
    await page.waitForTimeout(100);
  }
  expect(await page.evaluate(() => (window as unknown as { startChanges: string[] }).startChanges)).toEqual([]);
  expect(
    await page.evaluate(
      () => document.querySelector('app-up-next-card .start') === (window as unknown as { startButton: Element }).startButton,
    ),
  ).toBe(true);
  expect(await start(page).textContent()).toBe(first.text);
});

test('the Today badge equals the Review row', { tag: '@nav' }, async ({ page }) => {
  await page.addInitScript(
    ({ key, itemIds }) => {
      if (localStorage.getItem(key)) return;
      const at = new Date(Date.now() - 6 * 86_400_000).toISOString();
      const events = itemIds.map((itemId, i) => ({
        id: `badge-review-${i}`,
        at,
        type: 'review.graded',
        itemId,
        rating: 3,
        correct: true,
        durationMs: 8000,
      }));
      localStorage.setItem(key, JSON.stringify({ events, cursor: null }));
    },
    { key: EVENTS, itemIds: itemsForTopic('hashing').map((item) => item.id) },
  );
  await page.goto('/today');
  const row = today(page).locator('.review-row').first();
  await expect(row).toContainText(/\d+ due/);
  const due = Number((await row.textContent())!.match(/(\d+) due/)![1]);
  expect(due).toBeGreaterThan(0);
  const badge = page.locator('ion-tab-button[tab="today"] ion-badge');
  await expect(badge.locator('[aria-hidden="true"]')).toHaveText(String(due));
  await expect(section(page, 'Today')).toHaveAccessibleName(new RegExp(`, ${due} due$`));
});

test('new cards alone show on the Review row but are not due, so the badge stays empty', { tag: '@nav' }, async ({ page }) => {
  await page.goto('/today');
  const row = today(page).locator('.review-row').first();
  await expect(row).toContainText(/\d+ new · about \d+ min/);
  await expect(row).not.toContainText('due');
  await expect(page.locator('ion-tab-button[tab="today"] ion-badge')).toHaveCount(0);
  await expect(section(page, 'Today')).toHaveAccessibleName('Today');
});

test('"Not now" hides the first-run card on this device, and "Set your loop" brings the form back', async ({ page }) => {
  await page.goto('/today');
  await today(page).getByRole('button', { name: 'Not now' }).click();
  await expect(loopHeading(page)).toHaveText('Assuming a Mid-level loop');
  await expect(loopHeading(page)).toBeFocused();
  await expect(start(page)).toBeVisible();
  await page.reload();
  await expect(loopHeading(page)).toHaveText('Assuming a Mid-level loop');
  await expect(today(page).locator('app-loop-card')).toHaveCount(0);
  await today(page).getByRole('button', { name: 'Set your loop' }).click();
  await expect(today(page).locator('app-loop-card')).toBeVisible();
  await today(page).getByRole('button', { name: 'Cancel' }).click();
  await expect(today(page).locator('app-loop-card')).toHaveCount(0);
});

test('"Not today" swaps in the next card and keeps the item hidden for the rest of the day', async ({ page }) => {
  await page.goto('/today');
  await today(page).getByRole('button', { name: 'Not now' }).click();
  const title = today(page).locator('app-up-next-card h3');
  const first = (await title.textContent())!;
  await today(page).getByRole('button', { name: 'Not today' }).click();
  await expect(title).not.toHaveText(first);
  await expect(title).toBeFocused();
  await expect(today(page).getByRole('status')).toHaveText(/^Hidden until tomorrow\. Up next: /);
  const second = (await title.textContent())!;
  await page.reload();
  await expect(title).toHaveText(second);
});

test('"Not today" on a plan slice keeps it in the checklist, marked, and out of the time left', async ({ page }) => {
  await page.goto('/today');
  await buildPlan(page);
  await page.getByRole('button', { name: 'No thanks' }).click();
  const header = today(page).getByRole('heading', { name: /^Today \d+ of \d+ done/ });
  /** "about 1 h 10 min left" as 70; nothing left as 0. */
  const minutesLeft = async () => {
    const left = (await header.textContent())!.match(/about (.+) left/)?.[1] ?? '';
    const hours = Number(left.match(/(\d+) h/)?.[1] ?? 0);
    return hours * 60 + Number(left.match(/(\d+) min/)?.[1] ?? 0);
  };
  const before = await minutesLeft();
  const title = (await today(page).locator('app-up-next-card h3').textContent())!.trim();
  await today(page).getByRole('button', { name: 'Not today' }).click();
  const row = today(page).locator('app-plan-today li.row', { hasText: title });
  await expect(row).toContainText('Not today ·');
  expect(await minutesLeft()).toBeLessThan(before);
});

test('a plan from before Targets shows an assumed loop, and one tap on the level row sets it', async ({ page }) => {
  await page.goto('/today/plan');
  const plan = page.locator('app-plan');
  await plan.getByLabel('Interview date').fill(await localDay(page, 20));
  await plan.getByRole('button', { name: 'Save plan' }).click();
  await expect(plan.getByRole('heading', { name: 'Interview in 20 days', level: 1 })).toBeVisible();
  await section(page, 'Today').click();
  await expect(loopHeading(page)).toHaveText(/^Mid-level loop \(assumed\) · .* · 20 days left · 30 min a day$/);
  const row = today(page).getByRole('group', { name: 'Your level?' });
  const saving = synced(page, 'target.set');
  await row.getByRole('button', { name: 'Senior' }).click();
  await saving;
  await expect(loopHeading(page)).toHaveText(/^Senior loop · .* · 20 days left · 30 min a day$/);
  await expect(loopHeading(page)).toBeFocused();
  // A saved loop with Coding and no placement yet offers it (REDESIGN.md 2.13, step 3).
  await expect(today(page).getByRole('complementary', { name: 'Skip what you know' })).toBeVisible();
  await expect(row).toHaveCount(0);
  const events = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).events, EVENTS);
  expect(events.find((e: { type: string }) => e.type === 'target.set').target).toEqual({
    level: 'senior',
    rounds: { coding: 2, design: 2, behavioral: 1 },
  });
});

test('a plan the time cannot cover says how much it covers, and one tap gives it more time or a later date', async ({ page }) => {
  await page.goto('/today');
  await buildPlan(page);
  const coverage = today(page).locator('.coverage');
  await expect(coverage).toContainText(
    /^At 45 min a day, this plan covers .* of your loop by \w{3} \d{1,2}\. All of it needs about .* a day, more than the 2 h a plan allows\./,
  );
  // Up next comes first, so the coverage line never pushes it below the fold.
  expect((await coverage.boundingBox())!.y).toBeGreaterThan((await today(page).locator('app-up-next-card').boundingBox())!.y);
  const saving = synced(page, 'plan.set');
  await coverage.getByRole('button', { name: 'Use 2 h a day, the most' }).click();
  await saving;
  await expect(loopHeading(page)).toHaveText(/· 2 h a day$/);
  await expect(today(page).getByRole('status')).toHaveText('Plan changed to 2 h a day.');
  const later = coverage.getByRole('button', { name: /^Move the date to / });
  const date = (await later.textContent())!.replace('Move the date to ', '').trim();
  await later.click();
  await expect(loopHeading(page)).toContainText(`· ${date} ·`);
  await expect(today(page).getByRole('status')).toHaveText(`Interview date moved to ${date}.`);
  await expect(coverage).toHaveCount(0);
});

test('a device whose cursor was read before target.set existed pulls once in full, so the Target arrives', async ({ page }) => {
  await page.goto('/today');
  await buildPlan(page, 'Senior');
  const stored = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), EVENTS);
  await page.reload();
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).cursor?.cursor ?? null, EVENTS)).not.toBeNull();
  // As a v1 app left it: the events it had then (none of the Target) and a cursor past the Target, with no version.
  const { cursor } = await page.evaluate((key) => JSON.parse(localStorage.getItem(key)!), EVENTS);
  const v1Events = stored.events.filter((e: { type: string }) => e.type !== 'target.set');
  await page.evaluate(
    ({ key, events, old }) =>
      localStorage.setItem(key, JSON.stringify({ events, cursor: { learnerId: old.learnerId, cursor: old.cursor } })),
    { key: EVENTS, events: v1Events, old: cursor },
  );
  const pulls: string[] = [];
  page.on('request', (r) => r.method() === 'GET' && r.url().includes('/api/progress/events') && pulls.push(new URL(r.url()).search));
  await page.reload();
  await expect(loopHeading(page)).toHaveText(/^Senior loop · /);
  expect(pulls[0]).toBe('?v=2');
  await expect.poll(() => page.evaluate((key) => JSON.parse(localStorage.getItem(key)!).cursor?.v, EVENTS)).toBe(2);

  pulls.length = 0;
  await page.reload();
  await expect(loopHeading(page)).toHaveText(/^Senior loop · /);
  await expect.poll(() => pulls[0]).toMatch(/^\?v=2&since=/);
});
