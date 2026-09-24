import { expect, synced, test } from './fixtures';

test('predicting the next step of a visualizer counts toward mastery', { tag: '@smoke' }, async ({ page }) => {
  await page.goto('/visualize');
  await page.getByRole('link', { name: /Binary Search easy/ }).click();
  await expect(page.getByRole('checkbox', { name: 'Predict mode' })).toBeChecked();
  await expect(page.getByText('1 / 13')).toBeVisible();

  const prompt = page.getByText('Your call');
  for (let step = 1; !(await prompt.isVisible()); step++) {
    expect(step, 'a checkpoint should come up').toBeLessThan(13);
    await page.getByRole('button', { name: 'Step forward' }).click();
    await expect(page.getByText(`${step + 1} / 13`).or(prompt)).toBeVisible();
  }

  const sync = synced(page, 'predict.answered');
  await page.locator('.predict .choice').first().click();
  await expect(page.getByText(/^(Exactly\.|Not quite\.)/)).toBeVisible();
  await page.getByRole('button', { name: 'Continue →' }).click();
  await expect(prompt).toBeHidden();
  await sync;
});

test('the timeline steps forward and back', async ({ page }) => {
  await page.goto('/visualize/binary-search');
  await page.getByText('Predict mode').click();
  await expect(page.getByRole('checkbox', { name: 'Predict mode' })).not.toBeChecked();
  await page.getByRole('button', { name: 'Step forward' }).click();
  await expect(page.getByText('2 / 13')).toBeVisible();
  await page.getByRole('button', { name: 'Step back' }).click();
  await expect(page.getByText('1 / 13')).toBeVisible();
});
