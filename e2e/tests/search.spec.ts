import type { Page } from '@playwright/test';
import { expect, modifierKey, railShown, showPane, shownPage, test } from './fixtures';

const palette = (page: Page) => page.getByRole('dialog', { name: 'Search' });
const searchPage = (page: Page) => page.locator('app-search');
const field = (page: Page) => searchPage(page).getByRole('searchbox', { name: 'Search everything' });
/** The four places journey 3 finds (REDESIGN.md 2.14), each a result in the System design round. */
const RATE = [/^Rate Limiting & Abuse/, /^Bot Storm/, /^Rate Limiter Token buckets/, /^Rate Limiter Scripted or AI/];

/** Clicks the shown page's back button once a transition has left one page shown. */
async function back(page: Page) {
  await expect(shownPage(page)).toHaveCount(1);
  await shownPage(page).locator('app-back ion-back-button').click();
}

/** Ctrl or Cmd K, as the page's platform reads it. */
const searchChord = async (page: Page) => page.keyboard.press(`${await modifierKey(page)}+k`);

test.describe('journey 3: find the rate limiter by search in four keystrokes', { tag: '@nav' }, () => {
  test('one list holds the topic, Bot Storm, the case and the mock round, and the round opens its start sheet', async ({ page }) => {
    await page.goto('/today');
    await page.waitForLoadState('networkidle');
    if (railShown(page)) {
      await page.locator('app-rail').getByRole('button', { name: 'Search' }).click();
      await expect(palette(page)).toBeVisible();
      await page.keyboard.type('rate');
      const results = palette(page).getByRole('listbox', { name: 'Results' });
      for (const name of RATE)
        await expect(results.getByRole('group', { name: /^System design: / }).getByRole('option', { name })).toHaveCount(1);
      await expect(results.getByRole('group', { name: /^(Coding|Behavioral): / })).toHaveCount(0);
      await results.getByRole('option', { name: RATE[3] }).click();
    } else {
      await shownPage(page).getByRole('link', { name: 'Search', exact: true }).click();
      await expect(page).toHaveURL(/\/today\/search$/);
      await expect(field(page)).toBeFocused();
      await page.keyboard.type('rate');
      await expect(page).toHaveURL(/\/today\/search\?q=rate$/);
      const round = searchPage(page).getByRole('region', { name: 'System design' });
      for (const name of RATE) await expect(round.getByRole('link', { name })).toHaveCount(1);
      await expect(searchPage(page).getByRole('heading', { level: 2 })).toHaveText(['System design']);
      await round.getByRole('link', { name: RATE[3] }).click();
    }
    await expect(page).toHaveURL(/\/mock$/);
    const sheet = page.getByRole('dialog', { name: 'System design round' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('radio', { name: 'Rate Limiter' })).toBeChecked();
  });

  test('a library field searches everything from what it holds', async ({ page }) => {
    await page.goto('/design/cases?q=rate');
    await page.waitForLoadState('networkidle');
    await shownPage(page).getByRole('link', { name: 'Search everything for “rate” →' }).click();
    await expect(page).toHaveURL(/\/today\/search\?q=rate$/);
    await expect(field(page)).toHaveValue('rate');
    await expect(searchPage(page).getByRole('link', { name: /^Bot Storm/ })).toBeVisible();
    await back(page);
    await expect(page).toHaveURL(/\/design\/cases\?q=rate$/);
  });
});

test('typing on the search page keeps where it was opened from, so back returns there', { tag: '@nav' }, async ({ page }) => {
  await page.goto('/coding/problems');
  await page.waitForLoadState('networkidle');
  if (railShown(page)) {
    await shownPage(page).getByRole('searchbox', { name: 'Search problems' }).fill('sum');
    await shownPage(page).getByRole('link', { name: 'Search everything for “sum” →' }).click();
  } else await shownPage(page).getByRole('link', { name: 'Search', exact: true }).click();
  await expect(field(page)).toBeVisible();
  await field(page).fill('two sum');
  await expect(page).toHaveURL(/\/today\/search\?q=two(\+|%20)sum$/);
  await back(page);
  await expect(page).toHaveURL(/\/coding\/problems(\?q=sum)?$/);
});

test('a kind chosen with See all that the new words do not find stays a chip, and every result is one tap away', async ({ page }) => {
  await page.goto('/today/search?q=rate&kind=problem');
  await page.waitForLoadState('networkidle');
  await expect(searchPage(page).getByRole('button', { name: 'Problems 0' })).toHaveAttribute('aria-pressed', 'true');
  await searchPage(page).getByRole('button', { name: 'Show all 8 results' }).click();
  await expect(page).toHaveURL(/\/today\/search\?q=rate$/);
  await expect(searchPage(page).getByRole('link', { name: /^Bot Storm/ })).toBeVisible();
});

test.describe('the search shortcuts', { tag: '@nav' }, () => {
  test('Ctrl or Cmd K opens search anywhere but the code editor, and Esc returns focus', async ({ page }) => {
    await page.goto('/coding/problems/two-sum');
    await page.waitForLoadState('networkidle');
    const editor = page.getByRole('textbox', { name: 'Two Sum solution' });
    await page.getByRole('heading', { name: 'Two Sum', level: 1 }).click();
    const opener = shownPage(page).getByRole('button').first();
    await opener.focus();
    await searchChord(page);
    if (railShown(page)) {
      await expect(palette(page)).toBeVisible();
      await expect(palette(page).getByRole('combobox', { name: 'Search everything' })).toBeFocused();
      await page.keyboard.press('Escape');
      await expect(palette(page)).toBeHidden();
      await expect(opener).toBeFocused();

      await editor.click();
      await searchChord(page);
      // The palette's code is loaded, so a chord it took would have opened it by the next frame.
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await expect(palette(page)).toBeHidden();
      await expect(editor).toBeFocused();
    } else {
      await expect(page).toHaveURL(/\/today\/search$/);
      await expect(field(page)).toBeFocused();
      await back(page);
      await expect(page).toHaveURL(/\/coding\/problems\/two-sum$/);
      await showPane(page, 'Code');
      await editor.click();
      await searchChord(page);
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      await expect(page).toHaveURL(/\/coding\/problems\/two-sum$/);
    }
  });

  test('"/" opens search only while single-key shortcuts are on, and never from a field', async ({ page }) => {
    await page.goto('/coding/problems');
    await page.waitForLoadState('networkidle');
    const library = shownPage(page).getByRole('searchbox', { name: 'Search problems' });
    await library.click();
    await page.keyboard.type('a/b');
    await expect(library).toHaveValue('a/b');
    await shownPage(page).getByRole('heading', { name: 'Problems', level: 1 }).click();
    await page.keyboard.press('/');
    if (railShown(page)) {
      await expect(palette(page)).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(palette(page)).toBeHidden();
    } else {
      await expect(page).toHaveURL(/\/today\/search$/);
    }

    await page.evaluate(() => localStorage.setItem('CapacitorStorage.grasp.shortcuts.off', 'off'));
    await page.goto('/coding/problems');
    await page.waitForLoadState('networkidle');
    await shownPage(page).getByRole('heading', { name: 'Problems', level: 1 }).click();
    await page.keyboard.press('/');
    await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await expect(palette(page)).toBeHidden();
    await expect(page).toHaveURL(/\/coding\/problems$/);
    await searchChord(page);
    if (railShown(page)) await expect(palette(page)).toBeVisible();
    else await expect(page).toHaveURL(/\/today\/search$/);
  });

  test('results open from the keyboard, and See all narrows the list to one kind', async ({ page }) => {
    await page.goto('/coding');
    await page.waitForLoadState('networkidle');
    // From the rail's launcher on a desktop, whose focus the opened page's heading must still take.
    if (railShown(page)) await page.locator('app-rail').getByRole('button', { name: 'Search' }).click();
    else {
      await searchChord(page);
      await expect(field(page)).toBeFocused();
    }
    await page.keyboard.type('binary search');
    if (railShown(page)) {
      const combobox = palette(page).getByRole('combobox', { name: 'Search everything' });
      const options = palette(page).getByRole('option');
      await expect(options.first()).toHaveAttribute('aria-selected', 'true');
      await expect(combobox).toHaveAttribute('aria-activedescendant', (await options.first().getAttribute('id'))!);
      await page.keyboard.press('ArrowDown');
      await expect(options.nth(1)).toHaveAttribute('aria-selected', 'true');
      await expect(palette(page).getByRole('option', { name: /^See all \d+ problems →$/ })).toBeVisible();
      await page.keyboard.press('ArrowUp');
      await page.keyboard.press('Enter');
      await expect(page).toHaveURL(/\/coding\/patterns\/binary-search$/);
      await expect(palette(page)).toBeHidden();
      await expect(shownPage(page).getByRole('heading', { name: 'Binary Search', level: 1 })).toBeFocused();
    } else {
      await expect(page).toHaveURL(/\/today\/search\?q=binary(\+|%20)search(&|$)/);
      const problems = searchPage(page).locator('h3:text-is("Problems") + ul.rows a');
      await expect(problems).toHaveCount(8);
      await searchPage(page)
        .getByRole('button', { name: /^See all \d+ problems →$/ })
        .click();
      await expect(page).toHaveURL(/kind=problem/);
      await expect(searchPage(page).getByRole('button', { name: /^See all/ })).toHaveCount(0);
      expect(await problems.count()).toBeGreaterThan(8);
    }
  });
});
