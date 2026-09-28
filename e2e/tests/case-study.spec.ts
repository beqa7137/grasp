import { expect, test } from './fixtures';

test('a case study is worked stage by stage, resumes where the learner left it, and opens its build in the Design Lab', async ({
  page,
}) => {
  await page.goto('/design');
  await page.getByRole('link', { name: /URL Shortener/ }).click();
  await expect(page.getByRole('heading', { name: 'URL Shortener', level: 1 })).toBeVisible();

  const decision = page.getByRole('group', { name: /Which answer changes the design the most/ });
  await decision.getByRole('button', { name: /Can users pick a custom alias/ }).click();
  await expect(decision).toBeFocused();
  await expect(decision.getByRole('img', { name: 'your answer, wrong' })).toBeVisible();
  await expect(decision.getByRole('img', { name: 'correct answer' })).toBeVisible();
  await expect(decision.getByText(/Scale and the read to write ratio decide nearly everything/)).toBeVisible();

  await page.getByRole('button', { name: 'Show the model answer' }).click();
  await expect(page.getByText(/^Functional: create a short link/)).toBeVisible();
  await page.getByRole('button', { name: 'Show all' }).click();
  await page.getByRole('button', { name: 'Next: Estimate the traffic' }).click();
  await expect(page.getByRole('heading', { name: /Estimate the traffic/ })).toBeFocused();

  const estimate = page.getByRole('textbox', { name: 'Average redirects per second' });
  await estimate.fill('lots');
  await page.getByRole('button', { name: 'Check', exact: true }).click();
  await expect(page.getByRole('alert')).toHaveText(/Type a number/);
  await estimate.fill('120k');
  await page.getByRole('button', { name: 'Check', exact: true }).click();
  const result = page.getByRole('status').filter({ hasText: '115,741 redirects/s' });
  await expect(result).toContainText('Spot on.');
  await expect(result).toBeFocused();
  await expect(estimate).toBeDisabled();

  await page.reload();
  await expect(page.getByRole('heading', { name: /Estimate the traffic/ })).toBeVisible();

  await page.goto('/design/free-build?case=url-shortener');
  await expect(page).toHaveTitle(/URL Shortener build/);
  await expect(page.getByText(/design at 40k requests per second/)).toBeVisible();
  await expect(page.locator('g.node[data-kind="cache"]')).toBeVisible();
});
