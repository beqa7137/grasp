import type { Page } from '@playwright/test';
import { expect, synced, test } from './fixtures';

const JS_TWO_SUM = `function twoSum(nums, target) {
  const seen = new Map();
  for (let i = 0; i < nums.length; i++) {
    if (seen.has(target - nums[i])) return [seen.get(target - nums[i]), i];
    seen.set(nums[i], i);
  }
}`;

const JS_TWO_SUM_QUADRATIC = `function twoSum(nums, target) {
  for (let i = 0; i < nums.length; i++)
    for (let j = i + 1; j < nums.length; j++) if (nums[i] + nums[j] === target) return [i, j];
}`;

const PY_TWO_SUM = `def two_sum(nums, target):
    seen = {}
    for i, x in enumerate(nums):
        if target - x in seen:
            return [seen[target - x], i]
        seen[x] = i`;

async function write(page: Page, code: string) {
  const editor = page.getByRole('textbox', { name: 'Two Sum solution' });
  await editor.click();
  await page.keyboard.press('ControlOrMeta+a');
  await page.keyboard.insertText(code);
}

test('an efficient JavaScript solution passes the examples, then every test', { tag: '@smoke' }, async ({ page }) => {
  await page.goto('/code/two-sum');
  await page.getByRole('radio', { name: 'JavaScript' }).click();
  await write(page, JS_TWO_SUM);

  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByText('3 / 3 examples passed')).toBeVisible();

  const sync = synced(page, 'code.submitted');
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText(/^(\d+) \/ \1 tests passed$/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Accepted.')).toBeVisible();
  await sync;
});

test('a correct but quadratic solution fails the performance test', async ({ page }) => {
  await page.goto('/code/two-sum');
  await page.getByRole('radio', { name: 'JavaScript' }).click();
  await write(page, JS_TWO_SUM_QUADRATIC);
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByText('3 / 3 examples passed')).toBeVisible();
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText(/^\d+ \/ \d+ tests passed$/)).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Accepted.')).toBeHidden();
});

test('Python runs in the browser on Pyodide', { tag: '@smoke' }, async ({ page }) => {
  test.slow();
  await page.goto('/code/two-sum');
  await expect(page.getByRole('radio', { name: 'Python' })).toBeChecked();
  await write(page, PY_TWO_SUM);
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(page.getByText('3 / 3 examples passed')).toBeVisible({ timeout: 60_000 });
});

test('Trace steps through your own JavaScript', async ({ page }) => {
  await page.goto('/code/two-sum');
  await page.getByRole('radio', { name: 'JavaScript' }).click();
  await write(page, JS_TWO_SUM);
  await page.getByRole('button', { name: 'Trace' }).click();
  await expect(page.getByRole('tab', { name: 'Trace' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('slider', { name: 'Timeline' })).toBeVisible();
});
