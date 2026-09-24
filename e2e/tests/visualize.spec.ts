import type { Page } from '@playwright/test';
import { expect, synced, test } from './fixtures';

const VISUALIZER_TITLES = [
  'Merge Intervals',
  'Subsets by Backtracking',
  'Tree DFS: Preorder, Inorder, Postorder',
  'Jump Game',
  'Single Number (XOR)',
];

/** Steps forward with predict mode on until the player pauses at a checkpoint. */
async function stepToCheckpoint(page: Page) {
  const prompt = page.getByText('Your call');
  const total = Number((await page.locator('app-player .scrub .count').textContent())!.split('/')[1]);
  for (let step = 1; !(await prompt.isVisible()); step++) {
    expect(step, 'a checkpoint should come up').toBeLessThan(total);
    await page.getByRole('button', { name: 'Step forward' }).click();
    await expect(page.getByText(`${step + 1} / ${total}`, { exact: true }).or(prompt)).toBeVisible();
  }
}

async function answerCheckpoint(page: Page) {
  const sync = synced(page, 'predict.answered');
  await page.locator('.predict .choice').first().click();
  await expect(page.getByText(/^(Exactly\.|Not quite\.)/)).toBeVisible();
  await page.getByRole('button', { name: 'Continue →' }).click();
  await expect(page.getByText('Your call')).toBeHidden();
  await sync;
}

test('predicting the next step of a visualizer counts toward mastery', { tag: '@smoke' }, async ({ page }) => {
  await page.goto('/visualize');
  await page.getByRole('link', { name: /Binary Search easy/ }).click();
  await expect(page.getByRole('checkbox', { name: 'Predict mode' })).toBeChecked();
  await expect(page.getByText('1 / 13')).toBeVisible();
  await stepToCheckpoint(page);
  await answerCheckpoint(page);
});

for (const title of VISUALIZER_TITLES) {
  test(`${title} opens from the list and asks for the next step`, async ({ page }) => {
    await page.goto('/visualize');
    await page
      .getByRole('link')
      .filter({ has: page.getByRole('heading', { name: title, exact: true }) })
      .click();
    await expect(page.getByRole('heading', { name: title, level: 1 })).toBeVisible();
    await stepToCheckpoint(page);
    await answerCheckpoint(page);
  });
}

test('the timeline steps forward and back', async ({ page }) => {
  await page.goto('/visualize/binary-search');
  await page.getByText('Predict mode').click();
  await expect(page.getByRole('checkbox', { name: 'Predict mode' })).not.toBeChecked();
  await page.getByRole('button', { name: 'Step forward' }).click();
  await expect(page.getByText('2 / 13')).toBeVisible();
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(page.getByText('1 / 13')).toBeVisible();
});

test('number keys answer only the page in view, not a checkpoint left open on the Visualize tab', async ({ page }) => {
  await page.goto('/visualize/binary-search');
  const player = page.locator('app-player');
  await stepToCheckpoint(page);

  await page.getByRole('tab', { name: 'Review' }).click();
  const review = page.locator('app-drill');
  await expect(review.locator('g-question-card .choice:enabled').first()).toBeVisible();
  // Ionic hides the page it leaves only once the tab transition ends.
  await expect(player).toBeHidden();
  await page.keyboard.press('1');
  await expect(review.locator('g-question-card .reveal')).toHaveCount(1);
  const recorded = await page.evaluate(() => JSON.parse(localStorage.getItem('CapacitorStorage.grasp.events') ?? '[]'));
  expect(recorded.map((e: { type: string }) => e.type)).not.toContain('predict.answered');

  // A hidden page does not re-render, so the checkpoint is checked once the player is back in view.
  await page.getByRole('tab', { name: 'Visualize' }).click();
  await expect(player.getByText('Your call')).toBeVisible();
  await expect(player.locator('.predict .verdict')).toHaveCount(0);
  const sync = synced(page, 'predict.answered');
  await page.keyboard.press('1');
  await expect(player.locator('.predict .verdict')).toHaveCount(1);
  await sync;
});
