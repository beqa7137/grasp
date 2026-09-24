import { expect, synced, test } from './fixtures';

test('a mock interview runs to a scorecard', async ({ page }) => {
  await page.goto('/interview');
  await page.getByRole('button', { name: /Days Until Warmer/ }).click();
  await expect(page).toHaveURL(/\/interview\/[0-9a-f-]{36}$/);
  await expect(page.getByText(/daily temperatures/)).toBeVisible();

  const input = page.getByRole('textbox', { name: /Think out loud/ });
  const say = async (text: string) => {
    await input.fill(text);
    await page.getByRole('button', { name: 'Send', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeDisabled();
    await expect(input).toBeEnabled({ timeout: 30_000 });
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
