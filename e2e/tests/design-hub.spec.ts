import type { Page } from '@playwright/test';
import { expect, section, shownPage, test } from './fixtures';

const SHELVES = ['Foundations', 'Data', 'Reads at scale', 'Async & delivery', 'Coordination', 'Edge & operations'];
const hubSegment = (page: Page, name: string) =>
  shownPage(page).getByRole('navigation', { name: 'Design sections' }).getByRole('link', { name, exact: true });
const topicRow = (page: Page, name: string) =>
  page.locator('li.topic').filter({ has: page.getByRole('link', { name: new RegExp(`${name} (Core|Advanced)$`) }) });

test('journey 6: the Design tab shows the six shelves with their counts on its first screen', { tag: '@nav' }, async ({ page }) => {
  await page.goto('/today');
  await page.waitForLoadState('networkidle');
  await section(page, 'Design').click();
  await expect(page.getByRole('heading', { name: 'System design', level: 1 })).toBeVisible();
  await expect(page.getByText('0 of 17 core topics Practiced · 0 of 9 missions passed · 0 of 27 cases finished')).toBeVisible();
  const tiles = page.getByRole('navigation', { name: 'Shelves' }).getByRole('button');
  await expect(tiles).toHaveText(SHELVES.map((s) => new RegExp(`^${s}Ready 0 of \\d+$`)));
  for (const tile of await tiles.all()) await expect(tile).toBeInViewport({ ratio: 1 });

  await tiles.filter({ hasText: 'Coordination' }).click();
  const coordination = page.getByRole('heading', { name: 'Coordination', level: 2 });
  await expect(coordination).toBeFocused();
  await expect(coordination).toBeInViewport();
  const shelf = page.locator('#shelf-coordination');
  await expect(shelf).toContainText('Stretch at Early career and Mid-level');
  await expect(shelf.getByRole('link', { name: 'Month-End Ledger' })).toBeVisible();
  await expect(shelf).toContainText('uses 3 of 5 topics');
  await expect(shelf).toContainText('Also in: Your First Scale-Up (Service Discovery)');
});

test('journey 3, browsing: Design, Cases, Rate Limiter in three taps', { tag: '@nav' }, async ({ page }) => {
  await page.goto('/today');
  await page.waitForLoadState('networkidle');
  await section(page, 'Design').click();
  await hubSegment(page, 'Cases').click();
  await expect(page).toHaveURL(/\/design\/cases$/);
  await expect(page.getByText('27 cases', { exact: true })).toBeVisible();
  await page.getByRole('link', { name: /^Rate Limiter/ }).click();
  await expect(page.getByRole('heading', { name: 'Rate Limiter', level: 1 })).toBeVisible();
});

test('every topic row links its missions and its cases, and the shelf links its cases', async ({ page }) => {
  await page.goto('/design');
  await expect(page.locator('li.topic')).toHaveCount(34);
  for (const row of await page.locator('li.topic').all()) {
    await expect(row.getByRole('link', { name: /^\d+ missions?$/ })).toHaveAttribute('href', /^\/design\/missions\?topic=sd-/);
  }
  await expect(page.locator('li.topic').getByRole('link', { name: /^\d+ cases?$/ })).toHaveCount(25);

  const rate = topicRow(page, 'Rate Limiting & Abuse');
  await expect(rate).toContainText('Used in 1 mission · 3 cases');
  await rate.getByRole('link', { name: '3 cases' }).click();
  await expect(page).toHaveURL(/\/design\/cases\?topic=sd-rate-limiting$/);
  await expect(page.getByRole('heading', { name: 'Cases', level: 1 })).toBeFocused();
  await expect(page.getByText('3 cases of 27')).toBeVisible();
  await expect(page.locator('app-case-library li a.row')).toHaveText([/^Rate Limiter/, /^Notification System/, /^Ticket Booking/]);
  await expect(hubSegment(page, 'Cases')).toHaveAttribute('aria-current', 'page');
  await page.getByRole('link', { name: 'Read the Rate Limiting & Abuse lesson →' }).click();
  await expect(page.getByRole('heading', { name: 'Rate Limiting & Abuse', level: 1 })).toBeVisible();

  await page.goto('/design');
  await topicRow(page, 'Capacity & Scaling').getByRole('link', { name: '2 missions' }).click();
  await expect(page).toHaveURL(/\/design\/missions\?topic=sd-capacity$/);
  await expect(page.getByText('Missions that use Capacity & Scaling')).toBeVisible();
  await expect(page.locator('app-design-missions a.mission')).toHaveText([
    /^1Your First Scale-Up/,
    /^6Leaderboard on a Budget/,
    /^The Lab/,
  ]);
  await page.getByRole('link', { name: 'Show all missions' }).click();
  await expect(page.locator('app-design-missions a.mission')).toHaveCount(10);

  await page.goto('/design');
  await page.locator('#shelf-coordination').getByRole('link', { name: 'Cases that use this shelf (8) →' }).click();
  await expect(page).toHaveURL(/\/design\/cases\?shelf=coordination$/);
  await expect(page.getByText('8 cases of 27')).toBeVisible();
});

test('the Cases library filters by level, status, shelf and topic in the URL, and clears', async ({ page }) => {
  await page.goto('/design/cases');
  const rows = page.locator('app-case-library li a.row');
  await expect(rows).toHaveCount(27);
  await page.getByRole('button', { name: 'Core 9' }).click();
  await expect(page).toHaveURL(/\?level=core$/);
  await expect(rows).toHaveCount(9);
  await expect(page.getByRole('button', { name: 'Advanced 18' })).toHaveAttribute('aria-pressed', 'false');

  await page.getByRole('button', { name: 'Filters' }).click();
  const sheet = page.getByRole('dialog', { name: 'Filters' });
  await sheet.getByRole('button', { name: /^Reads at scale \d+$/ }).click();
  await sheet.getByRole('button', { name: /^Show \d+ cases?$/ }).click();
  await expect(page).toHaveURL(/level=core&.*shelf=reads/);
  await expect(page.getByRole('button', { name: 'Filters, 1 on' })).toBeVisible();
  await expect(rows.first()).toHaveText(/^URL Shortener/);

  await page.getByRole('searchbox', { name: 'Search cases' }).fill('hotel');
  await expect(rows).toHaveText([/^Hotel Booking/]);
  await expect(page).toHaveURL(/q=hotel/);
  await page.getByRole('button', { name: 'Clear all' }).click();
  await expect(page).toHaveURL(/\/design\/cases$/);
  await expect(rows).toHaveCount(27);
  await expect(page.getByRole('searchbox', { name: 'Search cases' })).toBeFocused();
});

test('near-twin cases say how they differ and link each other', async ({ page }) => {
  await page.goto('/design/cases/payments');
  await expect(page.getByText(/^Moving money in and out through external processors:/)).toBeVisible();
  await page.getByRole('link', { name: 'Payment Ledger' }).click();
  await expect(page.getByRole('heading', { name: 'Payment Ledger', level: 1 })).toBeVisible();
  await expect(page.getByText(/^The internal book of record every payment posts to:/)).toBeVisible();
  await expect(page.getByRole('link', { name: 'Payment System' })).toHaveAttribute('href', '/design/cases/payments');

  await page.goto('/design/cases/ticketing');
  await expect(page.getByRole('link', { name: 'Hotel Booking' })).toHaveAttribute('href', '/design/cases/hotel-booking');
});
