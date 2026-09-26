import type { Locator, Page } from '@playwright/test';
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

/** Expects what shows of the toolbar's title, its text clipped to its box, which an ellipsis ends, to end before `control`. */
async function expectTitleBefore(title: Locator, control: Locator, message: string) {
  const titleEnd = await title.evaluate((el) => {
    const range = document.createRange();
    range.selectNodeContents(el);
    return Math.min(range.getBoundingClientRect().right, el.shadowRoot!.querySelector('.toolbar-title')!.getBoundingClientRect().right);
  });
  expect(titleEnd, message).toBeLessThanOrEqual((await control.boundingBox())!.x);
}

// 640 px is 200% zoom on a 1280 px window; the doubled text size is the browser's own setting.
test('at 200% zoom, with the text at its size or doubled, End & score sits beside the interview title, never over it', async ({
  page,
  isMobile,
}) => {
  test.skip(isMobile, 'Zoom is a desktop browser setting; a phone is checked at 320 px.');
  await page.setViewportSize({ width: 640, height: 500 });
  await interviewUntilScorable(page, /Longest Repeating Run With K Changes/);
  for (const textSize of ['100%', '200%']) {
    await page.evaluate((size) => (document.documentElement.style.fontSize = size), textSize);
    await expectTitleBefore(
      page.locator('app-interview-session ion-title'),
      page.getByRole('button', { name: 'End & score' }),
      `with ${textSize} text, the title ends before End & score starts`,
    );
  }
});

test('on a 320 px phone, End & score and the Design Lab Reset sit beside their titles, never over them', async ({ page, isMobile }) => {
  test.skip(!isMobile, 'A 320 px screen is a phone.');
  await page.setViewportSize({ width: 320, height: 700 });
  await interviewUntilScorable(page, /Longest Repeating Run With K Changes/);
  await expectTitleBefore(
    page.locator('app-interview-session ion-title'),
    page.getByRole('button', { name: 'End & score' }),
    'the interview title ends before End & score starts',
  );

  await page.goto('/design/first-scale-up');
  const toolbar = page.locator('app-sandbox ion-toolbar');
  await expect(toolbar.locator('ion-title')).toHaveText('Your First Scale-Up');
  await expectTitleBefore(
    toolbar.locator('ion-title'),
    toolbar.getByRole('button', { name: 'Reset' }),
    'the mission title ends before Reset starts',
  );
});
