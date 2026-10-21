import type { Page } from '@playwright/test';
import { expect, pickLanguage, showPane, synced, test, write } from './fixtures';

const JS_TWO_SUM = `function twoSum(nums, target) {
  const seen = new Map();
  for (let i = 0; i < nums.length; i++) {
    if (seen.has(target - nums[i])) return [seen.get(target - nums[i]), i];
    seen.set(nums[i], i);
  }
}`;

const JS_LONGEST = `function longestConsecutive(nums) {
  const set = new Set(nums);
  let best = 0;
  for (const n of set) {
    if (set.has(n - 1)) continue;
    let length = 1;
    while (set.has(n + length)) length++;
    best = Math.max(best, length);
  }
  return best;
}`;

const workspace = (page: Page) => page.locator('app-code-workspace');
const chips = (page: Page) => workspace(page).locator('.chips');

test('the pattern stays hidden until Show pattern, which the device remembers', async ({ page }) => {
  await page.goto('/coding/problems/search-rotated-array');
  await expect(workspace(page).getByRole('heading', { name: 'Search in Rotated Sorted Array', level: 1 })).toBeVisible();
  await expect(chips(page).getByRole('link', { name: 'Binary Search' })).toHaveCount(0);
  await chips(page).getByRole('button', { name: 'Show pattern' }).click();
  await expect(chips(page).getByRole('link', { name: 'Binary Search' })).toBeFocused();
  await expect(workspace(page).locator('app-hint-ladder')).toContainText('The pattern: Binary Search.');

  await page.reload();
  await expect(chips(page).getByRole('link', { name: 'Binary Search' })).toBeVisible();
  await expect(chips(page).getByRole('button', { name: 'Show pattern' })).toHaveCount(0);
});

test('the hint ladder opens one rung a tap, with the context offline', async ({ page, context }) => {
  await page.goto('/coding/problems/search-rotated-array');
  const ladder = workspace(page).locator('app-hint-ladder');
  await expect(ladder.getByRole('button', { name: 'Which pattern?' })).toBeVisible();
  await page.waitForLoadState('networkidle');
  await context.setOffline(true);

  await ladder.getByRole('button', { name: 'Which pattern?' }).click();
  await expect(ladder.getByText('The pattern: Binary Search.')).toBeVisible();
  await expect(ladder.getByRole('button', { name: 'Show the template' })).toHaveCount(0);
  await ladder.getByRole('button', { name: 'Which words give it away?' }).click();
  await expect(ladder.getByText('“sorted” and “rotated” in the statement are cues for Binary Search:')).toBeVisible();
  await expect(ladder.getByRole('listitem').filter({ hasText: /^Rotated sorted array$/ })).toBeVisible();
  await ladder.getByRole('button', { name: 'Show the template' }).click();
  await expect(ladder.locator('g-code-panel')).toContainText('const mid = lo + ((hi - lo) >> 1);');
  const watch = ladder.getByRole('link', { name: 'Watch it: Binary Search →' });
  await expect(watch).toHaveAttribute('href', '/coding/visualizers/binary-search');
  await context.setOffline(false);

  // Kept on the device: a later visit opens where the learner stopped.
  await page.reload();
  await expect(ladder.locator('g-code-panel')).toContainText('let lo = min, hi = max;');
  await expect(ladder.getByRole('button')).toHaveCount(0);
});

test('a long signature wraps under itself at 320px and never scrolls sideways', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 700 });
  for (const [path, language] of [
    ['/coding/problems/cheapest-flights', 'TypeScript'],
    ['/coding/problems/interval-list-intersections', 'Python'],
  ] as const) {
    await page.goto(path);
    await pickLanguage(page, language);
    const scroller = workspace(page).locator('.cm-scroller');
    await expect(workspace(page).locator('.cm-line').first()).toContainText(language === 'Python' ? 'def ' : 'function ');
    const fit = await scroller.evaluate((el) => {
      const line = el.querySelector('.cm-line')!;
      const range = document.createRange();
      range.selectNodeContents(line);
      const rows = [...new Set([...range.getClientRects()].map((r) => Math.round(r.top)))];
      const starts = [...range.getClientRects()].filter((r) => r.width > 0).map((r) => ({ top: Math.round(r.top), left: r.left }));
      const firstLeft = Math.min(...starts.filter((r) => r.top === rows[0]).map((r) => r.left));
      const nextLeft = Math.min(...starts.filter((r) => r.top === rows[1]).map((r) => r.left));
      return { sideways: el.scrollWidth - el.clientWidth, rows: rows.length, hang: nextLeft - firstLeft };
    });
    expect(fit.sideways, `${path}: the editor scrolls sideways`).toBeLessThanOrEqual(0);
    expect(fit.rows, `${path}: the signature wraps`).toBeGreaterThan(1);
    expect(fit.hang, `${path}: a wrapped row hangs under the first`).toBeGreaterThan(10);
  }
});

test('the first visit asks for the interview language once', async ({ page }) => {
  await page.goto('/coding/problems/two-sum');
  await showPane(page, 'Code');
  const ask = workspace(page).getByRole('group', { name: 'Which language will you interview in?' });
  await expect(ask).toBeVisible();
  await ask.getByRole('button', { name: 'JavaScript' }).click();
  await expect(ask).toHaveCount(0);
  await expect(page.getByRole('radio', { name: 'JavaScript' })).toBeChecked();
  await expect(page.getByRole('radio', { name: 'JavaScript' }), 'focus moves from the row that went').toBeFocused();

  await page.reload();
  await showPane(page, 'Code');
  await expect(page.getByRole('radio', { name: 'JavaScript' })).toBeChecked();
  await expect(workspace(page).getByText('Which language will you interview in?')).toHaveCount(0);
});

test('under 1024px Problem, Code and Results show one at a time, and Run jumps to Results', async ({ page }) => {
  await page.setViewportSize({ width: 412, height: 860 });
  await page.goto('/coding/problems/two-sum');
  const panes = page.getByRole('radiogroup', { name: 'Show' });
  const heading = workspace(page).getByRole('heading', { name: 'Two Sum', level: 1 });
  const editor = page.getByRole('textbox', { name: 'Two Sum solution' });
  const results = workspace(page).getByRole('tablist', { name: 'Results' });
  await expect(panes.getByRole('radio', { name: 'Problem' })).toBeChecked();
  await expect(heading).toBeVisible();
  await expect(editor).toBeHidden();

  await pickLanguage(page, 'JavaScript');
  await expect(panes.getByRole('radio', { name: 'Code' })).toBeChecked();
  await expect(heading).toBeHidden();
  await expect(results).toBeHidden();
  await write(page, JS_TWO_SUM);
  await page.getByRole('button', { name: 'Run', exact: true }).click();
  await expect(panes.getByRole('radio', { name: 'Results' })).toBeChecked();
  await expect(page.getByText('3 / 3 examples passed')).toBeVisible();
  await expect(editor).toBeHidden();
  await expect(page.getByRole('button', { name: 'Submit' })).toBeVisible();

  // Run from the editor's chord: the editor goes, and focus moves to Results rather than the page.
  await showPane(page, 'Code');
  await editor.click();
  await page.keyboard.press('ControlOrMeta+Enter');
  await expect(panes.getByRole('radio', { name: 'Results' })).toBeChecked();
  await expect(workspace(page).getByRole('region', { name: 'Results' })).toBeFocused();

  await page.setViewportSize({ width: 1280, height: 860 });
  await expect(panes).toBeHidden();
  await expect(heading).toBeVisible();
  await expect(editor).toBeVisible();
  await expect(results).toBeVisible();
});

test('after Next unsolved from the library, Back to the pattern opens its hub, not the page below', { tag: '@nav' }, async ({ page }) => {
  await page.goto('/coding/problems');
  await page.locator('app-problem-library a[href="/coding/problems/two-sum"]').first().click();
  await expect(page).toHaveURL(/\/coding\/problems\/two-sum$/);
  await pickLanguage(page, 'JavaScript');
  await write(page, JS_TWO_SUM);
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText('Accepted.')).toBeVisible({ timeout: 30_000 });
  await workspace(page)
    .locator('.success')
    .getByRole('link', { name: /^Next unsolved in Arrays & Hashing: / })
    .click();
  await expect(page).toHaveURL(/\/coding\/problems\/longest-consecutive-sequence$/);
  await expect(workspace(page), 'the replaced problem leaves').toHaveCount(1);
  await pickLanguage(page, 'JavaScript');
  await write(page, JS_LONGEST, 'Longest Consecutive Sequence');
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText('Accepted.')).toBeVisible({ timeout: 30_000 });
  await workspace(page).locator('.success').getByRole('link', { name: 'Back to Arrays & Hashing' }).click();
  await expect(page).toHaveURL(/\/coding\/patterns\/hashing$/);
  await expect(page.locator('app-pattern-hub').getByRole('heading', { name: 'Arrays & Hashing', level: 1 })).toBeVisible();
});

test('Accepted shows the XP, the next unsolved problem of the pattern, and the way back to it', { tag: '@nav' }, async ({ page }) => {
  await page.goto('/coding/patterns/hashing/problems');
  await page.locator('app-pattern-hub a[href="/coding/problems/two-sum"]').click();
  await expect(page).toHaveURL(/\/coding\/problems\/two-sum$/);
  await pickLanguage(page, 'JavaScript');
  await write(page, JS_TWO_SUM);
  const sync = synced(page, 'code.submitted');
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText('Accepted.')).toBeVisible({ timeout: 30_000 });
  await sync;
  const success = workspace(page).locator('.success');
  await expect(success.getByText('+50 XP')).toBeVisible();

  await success.getByRole('link', { name: 'Next unsolved in Arrays & Hashing: Longest Consecutive Sequence →' }).click();
  await expect(page).toHaveURL(/\/coding\/problems\/longest-consecutive-sequence$/);
  await expect(workspace(page), 'the replaced problem leaves').toHaveCount(1);
  const next = workspace(page);
  await expect(next.locator('.chips').getByRole('link', { name: 'Arrays & Hashing' })).toBeVisible();
  // Next unsolved replaced Two Sum, so back returns to the hub's Problems, where the learner chose.
  await next.locator('ion-back-button').click();
  await expect(page).toHaveURL(/\/coding\/patterns\/hashing\/problems$/);
  await expect(page.locator('app-pattern-hub a[href="/coding/problems/two-sum"]').getByRole('img', { name: 'Solved' })).toBeVisible();

  await page.locator('app-pattern-hub a[href="/coding/problems/two-sum"]').click();
  await pickLanguage(page, 'JavaScript');
  await write(page, JS_TWO_SUM);
  await page.getByRole('button', { name: 'Submit' }).click();
  await expect(page.getByText('Accepted.')).toBeVisible({ timeout: 30_000 });
  await expect(workspace(page).locator('.success').getByText('+5 XP')).toBeVisible();
  await workspace(page).locator('.success').getByRole('link', { name: 'Back to Arrays & Hashing' }).click();
  await expect(page).toHaveURL(/\/coding\/patterns\/hashing\/problems$/);
});
