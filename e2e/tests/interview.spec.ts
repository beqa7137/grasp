import type { Page } from '@playwright/test';
import { expect, synced, test } from './fixtures';

/** Opens a coding interview and answers twice, which brings up End & score. */
async function interviewUntilScorable(page: Page, problem: RegExp) {
  await page.goto('/interview');
  await page.getByRole('button', { name: problem }).click();
  await expect(page).toHaveURL(/\/interview\/[0-9a-f-]{36}$/);
  const input = page.getByRole('textbox', { name: /Think out loud/ });
  const replies = page.locator('app-interview-session .msg:not(.me)');
  for (const text of [
    'Can the input be empty, and how long can it get?',
    'I would slide a window and track the most frequent value in it.',
  ]) {
    const before = await replies.count();
    await input.fill(text);
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    // The reply shows while it streams in, and the box stays read-only until it has.
    await expect(replies).toHaveCount(before + 1, { timeout: 30_000 });
    await expect(input).toBeEditable({ timeout: 30_000 });
  }
  await expect(page.getByRole('button', { name: 'End & score' })).toBeVisible({ timeout: 30_000 });
}

test('a mock interview runs to a scorecard', async ({ page }) => {
  await page.goto('/interview');
  await page.getByRole('button', { name: /Days Until Warmer/ }).click();
  await expect(page).toHaveURL(/\/interview\/[0-9a-f-]{36}$/);
  await expect(page.getByText(/daily temperatures/)).toBeVisible();

  const input = page.getByRole('textbox', { name: /Think out loud/ });
  const [box, composer] = await Promise.all([input.boundingBox(), page.locator('.composer').boundingBox()]);
  expect(box!.width, 'the answer box keeps most of the composer, even on a phone').toBeGreaterThan(composer!.width * 0.6);
  const say = async (text: string) => {
    await input.fill(text);
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
    await expect(input).toBeEditable({ timeout: 30_000 });
  };
  await say('Can temperatures repeat, and how long can the array get?');
  await say(
    'I would keep a monotonic stack of indices still waiting for a warmer day. Each new temperature pops every colder index and records the distance. That is O(n) time and O(n) space.',
  );

  const sync = synced(page, 'interview.scored');
  await page.getByRole('button', { name: 'End & score' }).click();
  await expect(page.getByText(/Scorecard · offline heuristic|Scorecard · AI calibrated/)).toBeVisible({ timeout: 60_000 });
  await expect(page.locator('.scorecard .verdict')).not.toBeEmpty();
  await sync;
});

test('the interview list shows both tracks', { tag: '@smoke' }, async ({ page }) => {
  await page.goto('/interview');
  await expect(page.getByRole('button', { name: /^Coding/ })).toBeVisible();
  await expect(page.getByRole('button', { name: /^System design/ })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Surprise me' })).toBeVisible();
});

// 640 px is 200% zoom on a 1280 px window, and 320 px is 400%; the doubled text size is the browser's own setting.
for (const { name, width, height, textSize } of [
  { name: '200% zoom', width: 640, height: 500, textSize: '100%' },
  { name: '200% zoom with 200% text', width: 640, height: 500, textSize: '200%' },
  { name: 'a 320 px screen', width: 320, height: 700, textSize: '100%' },
]) {
  test(`at ${name}, End & score sits beside the interview title, never over it`, async ({ page }) => {
    await page.setViewportSize({ width, height });
    await interviewUntilScorable(page, /Longest Repeating Run With K Changes/);
    await page.addStyleTag({ content: `html { font-size: ${textSize}; }` });
    const end = await page.getByRole('button', { name: 'End & score' }).boundingBox();
    // What shows of the title is its text clipped to its box, which an ellipsis ends.
    const title = await page.locator('app-interview-session ion-title').evaluate((el) => {
      const range = document.createRange();
      range.selectNodeContents(el);
      const text = range.getBoundingClientRect();
      const box = el.shadowRoot!.querySelector('.toolbar-title')!.getBoundingClientRect();
      return { left: Math.max(text.left, box.left), right: Math.min(text.right, box.right) };
    });
    expect(title.right, 'the title ends before End & score starts').toBeLessThanOrEqual(end!.x);
  });
}
