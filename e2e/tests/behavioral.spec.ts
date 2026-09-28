import { expect, test } from './fixtures';

const STORY = {
  Situation: 'Our nightly billing export failed silently for a week before finance noticed the gap.',
  Task: 'Nobody owned the export, and I had the most context on the pipeline that fed it.',
  Action:
    'I traced the failure to an expired credential, I rotated it, I added an alert on missing files and I wrote the runbook. I then asked the data team to own the export and walked them through it.',
  Result: 'Exports have run for 14 months without a gap, and finance closes the month 2 days sooner.',
};

test('a behavioral answer is checked as it is written, kept on this device, and erased with the learner data', async ({ page }) => {
  await page.goto('/interview');
  await page.getByRole('link', { name: /Behavioral/ }).click();
  await expect(page.getByRole('heading', { name: 'Behavioral interviews' })).toBeVisible();
  await page.getByRole('link', { name: /^Ownership/ }).click();
  await expect(page.getByRole('heading', { name: 'Ownership', level: 1 })).toBeVisible();
  await page.locator('app-competency').getByRole('link').first().click();

  const checks = page.getByRole('complementary', { name: 'Answer check' });
  await expect(checks).toContainText('0 of 6 checks pass');
  for (const [part, text] of Object.entries(STORY)) await page.getByLabel(part).fill(text);
  await expect(checks).toContainText('The Result has a number.');
  await expect(checks).toContainText('The Action says what you did');
  await expect(checks).toContainText('4 of 6 checks pass');

  await page.reload();
  await expect(page.getByLabel('Result')).toHaveValue(STORY.Result);

  await page.goto('/behavioral');
  await expect(page.getByRole('link', { name: /^Ownership/ })).toContainText('1 answer drafted');

  await page.goto('/settings');
  await page.getByRole('button', { name: 'Delete…' }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Delete' }).click();
  await expect(page.getByText('Your data was deleted. You are starting fresh.')).toBeVisible();
  await page.goto('/behavioral');
  await expect(page.getByRole('link', { name: /^Ownership/ })).not.toContainText('drafted');
});
