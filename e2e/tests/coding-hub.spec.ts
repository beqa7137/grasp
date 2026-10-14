import type { Locator, Page } from '@playwright/test';
import { ALGORITHM_CATALOG, CODING_CATALOG, PATTERN_CATALOG } from '@grasp/engine';
import { expect, test } from './fixtures';

const library = (page: Page) => page.locator('app-problem-library');
const results = (page: Page) => library(page).getByRole('status');
const trackChip = (page: Page, name: string) =>
  library(page)
    .getByRole('group', { name: 'Track' })
    .getByRole('button', { name: new RegExp(`^${name}`) });
const segment = (page: Page, name: string) => page.locator('app-hub:not(.ion-page-hidden)').getByRole('link', { name, exact: true });
const scroller = (page: Page) =>
  page.evaluate(async () => {
    const content = document.querySelector('app-hub:not(.ion-page-hidden) ion-content') as HTMLElement & {
      getScrollElement(): Promise<HTMLElement>;
    };
    const el = await content.getScrollElement();
    return { top: el.scrollTop, height: el.scrollHeight };
  });

/** The filter controls: inline beside the list from container medium up, else in the Filters sheet, which this opens. */
async function facets(page: Page): Promise<Locator> {
  await expect(results(page)).toBeVisible();
  const open = library(page).getByRole('button', { name: /^Filters/ });
  if (await open.isVisible()) {
    await open.click();
    return page.getByRole('dialog', { name: 'Filters' });
  }
  return library(page).getByRole('complementary', { name: 'Filters' });
}

async function closeFacets(page: Page, where: Locator) {
  if ((await where.getAttribute('role')) === 'dialog' || (await where.evaluate((el) => el.tagName === 'DIALOG')))
    await where.getByRole('button', { name: /^Show \d+ problems?$/ }).click();
}

test('journey 2 by keyboard: the Track chip keeps focus, replaces the URL and announces the count', { tag: '@nav' }, async ({ page }) => {
  await page.goto('/coding/problems');
  await expect(results(page)).toHaveText('164 problems');
  const entries = await page.evaluate(() => history.length);
  const graphs = trackChip(page, 'Graphs & trees');
  await graphs.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/coding\/problems\?track=graphs$/);
  await expect(graphs).toHaveAttribute('aria-pressed', 'true');
  await expect(graphs).toBeFocused();
  // The count is in a polite live region, so a screen reader hears each change.
  await expect(results(page)).toHaveText('51 problems of 164');
  await expect(results(page)).toHaveAttribute('role', 'status');
  expect(await page.evaluate(() => history.length)).toBe(entries);

  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/coding\/problems$/);
  await expect(results(page)).toHaveText('164 problems');
  await expect(graphs).toBeFocused();
});

test('facet counts leave out their own selection, and a removed filter chip hands focus on', async ({ page }) => {
  await page.goto('/coding/problems?track=graphs');
  const where = await facets(page);
  const hard = where.getByRole('button', { name: /^Hard/ });
  await expect(where.getByRole('button', { name: /^Medium/ })).toHaveText(/Medium\s+40/);
  await hard.click();
  await expect(page).toHaveURL(/difficulty=hard/);
  await expect(hard).toHaveAttribute('aria-pressed', 'true');
  // Hard still counts the graph problems at Hard; Medium counts what choosing it as well would add.
  await expect(hard).toHaveText(/Hard\s+10/);
  await expect(where.getByRole('button', { name: /^Medium/ })).toHaveText(/Medium\s+40/);
  await expect(results(page)).toHaveText('10 problems of 164');
  await closeFacets(page, where);

  const remove = library(page).getByRole('button', { name: 'Remove Hard' });
  await remove.focus();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/coding\/problems\?track=graphs$/);
  await expect(results(page)).toHaveText('51 problems of 164');
  await expect(library(page).getByRole('button', { name: 'Clear all' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page).toHaveURL(/\/coding\/problems$/);
  await expect(library(page).getByRole('searchbox', { name: 'Search problems' })).toBeFocused();
});

test('a bare /coding/problems is always the whole library, and a filtered link opens filtered', { tag: '@nav' }, async ({ page }) => {
  await page.goto('/coding/problems?track=graphs&difficulty=hard&q=path');
  await expect(results(page)).toHaveText(/^\d+ problems? of 164$/);
  await expect(library(page).getByRole('searchbox', { name: 'Search problems' })).toHaveValue('path');
  await segment(page, 'Skill map').click();
  await segment(page, 'Problems').click();
  await expect(page).toHaveURL(/\/coding\/problems$/);
  await expect(results(page)).toHaveText('164 problems');
  await expect(library(page).getByRole('searchbox', { name: 'Search problems' })).toHaveValue('');
  await expect(trackChip(page, 'Graphs & trees')).toHaveAttribute('aria-pressed', 'false');

  await page.goto('/coding/problems?track=nope');
  await expect(results(page)).toHaveText('164 problems');
});

test('search filters as you type, and an empty result offers to clear', async ({ page }) => {
  await page.goto('/coding/problems');
  const search = library(page).getByRole('searchbox', { name: 'Search problems' });
  await search.fill('linked list');
  await expect(page).toHaveURL(/q=linked/);
  const linked = CODING_CATALOG.filter((p) => /linked/i.test(p.title) && /list/i.test(p.title)).length;
  await expect(results(page)).toHaveText(`${linked} problems of 164`);
  await search.fill('zzzz');
  await expect(library(page).getByRole('heading', { name: 'No problems match' })).toBeVisible();
  await library(page).locator('g-empty-state').getByRole('button', { name: 'Clear all' }).click();
  await expect(results(page)).toHaveText('164 problems');
  await expect(search).toHaveValue('');
});

test('back from the workspace returns to the filtered list where it was', { tag: '@nav' }, async ({ page }) => {
  await page.goto('/coding/problems?track=graphs');
  await expect(results(page)).toHaveText('51 problems of 164');
  const row = library(page).locator('a[href="/coding/problems/cheapest-flights"]');
  await row.scrollIntoViewIfNeeded();
  const before = await scroller(page);
  expect(before.top).toBeGreaterThan(500);
  const top = (await row.boundingBox())!.y;
  await row.click();
  await expect(page.locator('app-code-workspace h1')).toHaveText('Cheapest Flights Within K Stops');
  await page.locator('app-code-workspace app-back ion-back-button').click();
  await expect(page).toHaveURL(/\/coding\/problems\?track=graphs$/);
  await expect(results(page)).toHaveText('51 problems of 164');
  await expect.poll(async () => (await scroller(page)).top).toBe(before.top);
  await expect.poll(async () => (await row.boundingBox())?.y).toBe(top);
});

test('the collapsed library fits in 1.6 Pixel 7 screens', async ({ page }, testInfo) => {
  test.skip(testInfo.project.name !== 'phone', 'Measured on the Pixel 7.');
  await page.goto('/coding/problems');
  const open = library(page).locator('.group-head[aria-expanded="true"]');
  await expect(open).toHaveCount(1);
  await open.click();
  await expect(library(page).locator('.group-head')).toHaveCount(PATTERN_CATALOG.length);
  await expect(library(page).locator('.group-head[aria-expanded="true"]')).toHaveCount(0);
  const { height } = await scroller(page);
  const screen = page.viewportSize()!.height;
  expect(height / screen).toBeLessThanOrEqual(1.6);
});

test('only the current pattern starts open, and a filter opens every group it matches', async ({ page }) => {
  await page.goto('/coding/problems');
  await expect(library(page).locator('.group-head[aria-expanded="true"]')).toHaveText([/^Arrays & Hashing/]);
  await page.goto('/coding/problems?difficulty=hard');
  await expect(library(page).locator('.group-head[aria-expanded="false"]')).toHaveCount(0);
});

test('the Mixed view names no pattern on a row until the tags are turned on, and keeps the choice', async ({ page }) => {
  await page.goto('/coding/problems');
  await library(page).getByRole('group', { name: 'View' }).getByRole('button', { name: 'Mixed' }).click();
  const rows = library(page).locator('.rows.mixed a[g-entry-row]');
  await expect(rows).toHaveCount(CODING_CATALOG.length);
  const names = PATTERN_CATALOG.map((p) => p.name);
  const metas = () => rows.locator('.note').allTextContents();
  expect(await metas()).toEqual([]);
  await expect(rows.first().locator('.title')).toHaveText(CODING_CATALOG.find((p) => p.difficulty === 'easy')!.title);

  await library(page).getByText('Show pattern tags').click();
  await expect(rows.first().locator('.note')).toHaveText(/\w/);
  expect((await metas()).every((m) => m.split(', ').every((name) => names.includes(name)))).toBe(true);
  await library(page).getByText('Show pattern tags').click();
  await expect(rows.locator('.note')).toHaveCount(0);

  await page.reload();
  await expect(library(page).getByRole('button', { name: 'Mixed' })).toHaveAttribute('aria-pressed', 'true');
  await library(page).getByRole('button', { name: 'Pick one at random' }).click();
  await expect(page).toHaveURL(/\/coding\/problems\/[a-z0-9-]+$/);
  await expect(page.locator('app-code-workspace h1')).toBeVisible();
});

test('the Skill map shows each pattern state, its solved members and the Stretch patterns', async ({ page }) => {
  await page.goto('/coding');
  const map = page.locator('app-skill-map app-pattern-map');
  await expect(map.locator('a[g-entry-row]')).toHaveCount(PATTERN_CATALOG.length);
  await expect(map.locator('a[g-entry-row] g-skill-state[aria-label="New"]')).toHaveCount(PATTERN_CATALOG.length);
  await expect(map.locator('a[href="/coding/patterns/binary-search"]')).toContainText('0 of 9 solved');
  await expect(map.getByText('Stretch', { exact: true })).toHaveCount(3);
  await expect(page.locator('app-skill-map').getByRole('link', { name: 'Take the placement check' })).toBeVisible();
});

test('Visualizers list the players in track order and filter by structure in the URL', async ({ page }) => {
  await page.goto('/coding/visualizers');
  const list = page.locator('app-visualizers');
  const order = [...ALGORITHM_CATALOG].sort(
    (a, b) => PATTERN_CATALOG.findIndex((p) => p.id === a.patternId) - PATTERN_CATALOG.findIndex((p) => p.id === b.patternId),
  );
  await expect(list.locator('a.item h3')).toHaveText(order.map((a) => a.title));
  await expect(list.locator('a.item').first()).toHaveAttribute('href', '/coding/visualizers/two-sum-hash');
  const trees = list.getByRole('group', { name: 'Structure' }).getByRole('button', { name: /^Trees/ });
  await trees.click();
  await expect(page).toHaveURL(/\/coding\/visualizers\?structure=trees$/);
  await expect(list.getByRole('status')).toHaveText('4 of 23 visualizers');
  await expect(list.locator('a.item')).toHaveCount(4);
  await segment(page, 'Visualizers').click();
  await expect(list.locator('a.item')).toHaveCount(ALGORITHM_CATALOG.length);
});

test('in the Mixed view without pattern tags, no count names a searched problem’s pattern', async ({ page }) => {
  await page.goto('/coding/problems?q=eating%20speed');
  await library(page).getByRole('group', { name: 'View' }).getByRole('button', { name: 'Mixed' }).click();
  await expect(results(page)).toHaveText('1 problem of 164');
  await expect(library(page).getByRole('group', { name: 'Track' }).locator('.count')).toHaveCount(0);
  const where = await facets(page);
  const patterns = where.getByRole('group', { name: 'Pattern' });
  await expect(patterns.locator('.count')).toHaveCount(0);
  // A dimmed chip would name the pattern as surely as its count.
  await expect(patterns.locator('[aria-disabled="true"]')).toHaveCount(0);
  await expect(where.getByRole('group', { name: 'Difficulty' }).locator('.count')).toHaveCount(3);
  await closeFacets(page, where);

  await library(page).getByText('Show pattern tags').click();
  await expect(library(page).getByRole('group', { name: 'Track' }).locator('.count')).toHaveCount(4);
});

test('a filter that would leave nothing is dimmed and does nothing, and a chosen one stays removable', async ({ page }) => {
  await page.goto('/coding/problems?track=graphs');
  const where = await facets(page);
  const solved = where.getByRole('button', { name: /^Solved/ });
  await expect(solved).toHaveAttribute('aria-disabled', 'true');
  // Playwright waits for an aria-disabled control to be enabled; the learner can still press it.
  await solved.click({ force: true });
  await expect(page).toHaveURL(/\/coding\/problems\?track=graphs$/);
  await closeFacets(page, where);

  await page.goto('/coding/problems?track=graphs&status=solved');
  const again = await facets(page);
  const chosen = again.getByRole('button', { name: /^Solved/ });
  await expect(chosen).not.toHaveAttribute('aria-disabled', 'true');
  await chosen.click();
  await expect(page).toHaveURL(/\/coding\/problems\?track=graphs$/);
});

test('an empty list names the filters as well as the search that left it empty', async ({ page }) => {
  await page.goto('/coding/problems?q=eating&track=graphs');
  await expect(library(page).locator('g-empty-state')).toContainText('Nothing in the library matches "eating" with these filters.');
});

test("the device's back button closes the Filters sheet before it leaves the page", { tag: '@nav' }, async ({ page }) => {
  await page.goto('/coding/problems?track=graphs');
  const open = library(page).getByRole('button', { name: /^Filters/ });
  test.skip(!(await open.isVisible()), 'The filters sit beside the list from container medium up.');
  await open.click();
  const sheet = page.getByRole('dialog', { name: 'Filters' });
  await expect(sheet).toBeVisible();
  await page.evaluate(() => document.dispatchEvent(new Event('backbutton')));
  await expect(sheet).toBeHidden();
  await expect(page).toHaveURL(/\/coding\/problems\?track=graphs$/);
});

test('the filters beside the list keep to the screen and scroll on their own', async ({ page }) => {
  await page.goto('/coding/problems');
  const side = library(page).getByRole('complementary', { name: 'Filters' });
  test.skip(!(await side.isVisible()), 'A phone opens the filters as a sheet.');
  const viewport = page.viewportSize()!.height;
  expect((await side.boundingBox())!.y + (await side.boundingBox())!.height).toBeLessThanOrEqual(viewport);
  // The last pattern is at the foot of the column; choosing it leaves the list's first group in view beside it.
  await side.getByRole('button', { name: /^Bitmask DP/ }).click();
  await expect(page).toHaveURL(/pattern=bitmask-dp/);
  await expect(library(page).locator('.group-head').first()).toBeInViewport();
});

test('a phone row keeps one shape: the note under the title, the pips and best score at its end', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  await page.goto('/coding/problems?track=graphs');
  const row = library(page).locator('a[href="/coding/problems/number-of-islands"]').first();
  await expect(row.locator('.text .note')).toHaveText(/^also in /);
  await expect(row.locator('.end .pips')).toHaveAttribute('aria-label', 'Medium');
  const [note, pips] = [await row.locator('.note').boundingBox(), await row.locator('.end .pips').boundingBox()];
  expect(pips!.x).toBeGreaterThan(note!.x);
  const rowBox = (await row.boundingBox())!;
  expect(pips!.x + pips!.width).toBeLessThanOrEqual(rowBox.x + rowBox.width);
});
