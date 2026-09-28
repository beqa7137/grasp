import { expect, recordedEvents, test } from './fixtures';

test('a pattern lesson reveals a worked example step by step, then replays it in the visualizer', async ({ page }) => {
  await page.goto('/learn/pattern/two-pointers');
  await expect(page.getByRole('heading', { name: 'Why it works' })).toBeVisible();

  const examples = page.locator('app-worked-example');
  const first = examples.first();
  await first.getByRole('button', { name: 'Think first, then show the key move' }).click();
  await first.getByRole('button', { name: 'Walk through it' }).click();
  await expect(first.getByRole('listitem')).toHaveCount(1);
  await expect(first).toContainText(/1 of \d steps/);
  await first.getByRole('button', { name: 'Next step' }).click();
  await expect(first.getByRole('listitem')).toHaveCount(2);

  for (const example of await examples.all()) {
    const think = example.getByRole('button', { name: /key move/ });
    if (await think.isVisible()) await think.click();
    await example.getByRole('button', { name: 'Show all' }).click();
  }
  await page.getByRole('link', { name: 'Step through it in the visualizer' }).first().click();
  await expect(page).toHaveURL(/\/visualize\/[\w-]+\?input=/);
  await expect(page.getByRole('button', { name: 'Step forward' })).toBeVisible();
  await expect(page.getByText('Invalid input')).toHaveCount(0);

  await page.goBack();
  const followUp = page.locator('details.follow-up').first();
  await followUp.locator('summary').click();
  await expect(followUp.locator('p')).toBeVisible();
});

test('a lesson ends with a quick check of three questions that count as practice', async ({ page }) => {
  await page.goto('/learn/pattern/binary-search');
  const check = page.locator('app-quick-check');
  for (let n = 1; n <= 3; n++) {
    await expect(check).toContainText(`Question ${n} of 3`);
    await check.locator('g-question-card .choice').first().click();
    await check.getByRole('button', { name: n < 3 ? 'Next question' : 'See how you did' }).click();
  }
  await expect(check.getByRole('status')).toContainText(/You got \d of 3 right\./);
  const practiced = await recordedEvents(page);
  expect(practiced.filter((e) => e.type === 'practice.answered')).toHaveLength(3);
  await check.getByRole('button', { name: 'Check again' }).click();
  await expect(check).toContainText('Question 1 of 3');
});
