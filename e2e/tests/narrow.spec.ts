import type { Locator } from '@playwright/test';
import { expect, test } from './fixtures';

/** The text of every matching element whose content is wider than its box. */
const tooWide = (boxes: Locator) =>
  boxes.evaluateAll((all) => all.filter((el) => el.scrollWidth > el.clientWidth).map((el) => el.textContent!.trim().slice(0, 40)));

test.describe('on a 320 px screen, content fits its box', () => {
  test.use({ viewport: { width: 320, height: 700 } });

  test('a pattern quick check stacks its choices within the card', async ({ page }) => {
    await page.goto('/learn/pattern/binary-search');
    const choices = page.locator('g-question-card .choices');
    await expect(choices.locator('.choice').first()).toBeVisible();
    expect(await tooWide(choices)).toEqual([]);
  });

  test('the coding problem list keeps one column within the page', async ({ page }) => {
    await page.goto('/code');
    const list = page.locator('.list');
    await expect(list.locator('a').first()).toBeVisible();
    expect(await tooWide(list)).toEqual([]);
  });

  test('a Design Lab metric moves its unit under the value rather than spilling', async ({ page }) => {
    await page.goto('/design/first-scale-up');
    const values = page.locator('.metrics .value');
    await expect(values.first()).toHaveText(/\d/);
    expect(await tooWide(values)).toEqual([]);
  });

  test('a table widens its row header column for the longest label', async ({ page }) => {
    const input = { nums1: [12, 7, 3, 9], nums2: [5, 14, 8, 1] };
    await page.goto(`/visualize/minimum-xor-sum?input=${encodeURIComponent(JSON.stringify(input))}`);
    const heads = page.locator('g-table-view .head.row');
    await expect(heads.filter({ hasText: '1 << j' }).first()).toBeAttached();
    expect(await tooWide(heads)).toEqual([]);
  });

  test('every part of the unique id bar shows its whole label', async ({ page }) => {
    await page.goto('/learn/design/sd-ids');
    const segments = page.locator('app-id-layout-widget .bar .seg');
    await expect(segments.first()).toHaveText('0');
    expect(await tooWide(segments)).toEqual([]);
  });
});
